/**
 * Readwise New Tab Extension - Logic Controller
 * Designed in compliance with strict OOP, SRP, and Manager/Coordinator patterns.
 */

// ==========================================================================
// STORAGE MANAGER (Data Access Layer)
// ==========================================================================
class StorageManager {
  static KEYS = {
    API_KEY: 'rw_api_key',
    QUOTES: 'rw_quotes',
    LAST_SYNC: 'rw_last_sync'
  };

  async getApiKey() {
    const data = await chrome.storage.sync.get(StorageManager.KEYS.API_KEY);
    return data[StorageManager.KEYS.API_KEY] || '';
  }

  async setApiKey(key) {
    await chrome.storage.sync.set({ [StorageManager.KEYS.API_KEY]: key });
  }

  async getQuotes() {
    const data = await chrome.storage.local.get(StorageManager.KEYS.QUOTES);
    return data[StorageManager.KEYS.QUOTES] || [];
  }

  async setQuotes(quotes) {
    await chrome.storage.local.set({ [StorageManager.KEYS.QUOTES]: quotes });
  }

  async removeQuote(quoteId) {
    const quotes = await this.getQuotes();
    const updated = quotes.filter(q => q.id !== quoteId);
    await this.setQuotes(updated);
    return updated;
  }

  async getLastSync() {
    const data = await chrome.storage.local.get(StorageManager.KEYS.LAST_SYNC);
    return data[StorageManager.KEYS.LAST_SYNC] || 0;
  }

  async setLastSync(timestamp) {
    await chrome.storage.local.set({ [StorageManager.KEYS.LAST_SYNC]: timestamp });
  }
}

// ==========================================================================
// READWISE MANAGER (Network/Service Layer)
// ==========================================================================
class ReadwiseManager {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://readwise.io/api/v2';
  }

  getHeaders() {
    return {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/books/?page_size=1`, {
        headers: this.getHeaders()
      });
      return response.status === 200;
    } catch (err) {
      console.error('Failed to verify token:', err);
      return false;
    }
  }

  async syncAllQuotes(progressCallback) {
    let quotesList = [];
    // data.next è un URL completo restituito da Readwise, usarlo direttamente
    let nextUrl = `${this.baseUrl}/export/`;
    let pagesFetched = 0;

    while (nextUrl) {
      const response = await fetch(nextUrl, { headers: this.getHeaders() });
      if (!response.ok) {
        throw new Error(`Sincronizzazione fallita: HTTP ${response.status}`);
      }

      const data = await response.json();
      const extracted = this.extractQuotesFromExport(data.results || []);
      quotesList = quotesList.concat(extracted);

      // data.next è null a fine lista, oppure è l'URL della pagina successiva
      nextUrl = data.next || null;
      pagesFetched++;

      if (progressCallback) {
        progressCallback(quotesList.length, pagesFetched);
      }
    }

    return quotesList;
  }

  extractQuotesFromExport(books) {
    const list = [];
    for (const book of books) {
      if (!book.highlights || book.highlights.length === 0) continue;

      for (const h of book.highlights) {
        // Salta le citazioni già taggate come "discard" su Readwise
        const isDiscarded = Array.isArray(h.tags) &&
          h.tags.some(t => t.name === 'discard');
        if (isDiscarded) continue;

        list.push({
          id: h.id,
          text: h.text,
          bookTitle: book.title,
          bookAuthor: book.author,
          coverUrl: book.cover_image_url
        });
      }
    }
    return list;
  }

  async tagQuoteAsDiscard(highlightId) {
    const url = `${this.baseUrl}/highlights/${highlightId}/tags/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: 'discard' })
    });

    // 200/201 = ok
    // 400 = tag già esistente (Readwise non accetta duplicati)
    // 404 = citazione non trovata sulla sorgente
    // 409 = conflitto, già taggata
    // In tutti questi casi rimuoviamo dalla cache locale senza errore
    if (response.ok || [400, 404, 409].includes(response.status)) {
      return { ok: true, status: response.status };
    }

    // Solo per errori reali (5xx, 401, 403) lanciamo l'eccezione
    throw new Error(`Errore API Readwise (HTTP ${response.status}): impossibile taggare la citazione.`);
  }
}

// ==========================================================================
// QUOTE VIEW MODEL (UI State/Presentation Layer)
// ==========================================================================
class QuoteViewModel {
  constructor() {
    this.quotes = [];
    this.currentQuote = null;
    this.isLoading = false;
  }

  async loadData(storageManager) {
    this.quotes = await storageManager.getQuotes();
    this.selectRandomQuote();
  }

  selectRandomQuote() {
    if (this.quotes.length === 0) {
      this.currentQuote = null;
      return null;
    }
    const index = Math.floor(Math.random() * this.quotes.length);
    this.currentQuote = this.quotes[index];
    return this.currentQuote;
  }

  async discardCurrent(storageManager, readwiseManager) {
    if (!this.currentQuote) return;

    this.isLoading = true;
    try {
      // Invia il tag a Readwise (errori soft come 404/409 non bloccano)
      await readwiseManager.tagQuoteAsDiscard(this.currentQuote.id);
    } catch (err) {
      // Rilancia solo per errori gravi; la rimozione locale avviene sempre
      console.warn('Readwise tag API error:', err.message);
      throw err;
    } finally {
      // Rimuovi sempre dalla cache locale, anche se l'API ha avuto un errore soft
      this.quotes = await storageManager.removeQuote(this.currentQuote.id);
      this.selectRandomQuote();
      this.isLoading = false;
    }
  }

  hasQuotes() {
    return this.quotes.length > 0;
  }
}

// ==========================================================================
// FONT SCALER (Adaptive Typography)
// ==========================================================================
class FontScaler {
  static MAX_SIZE = 1.55;  // rem
  static MIN_SIZE = 0.82;  // rem
  static STEP = 0.04;      // rem per iteration

  /**
   * Adjusts font-size of `textEl` so it fits inside `wrapperEl` without overflow.
   */
  static fit(textEl, wrapperEl) {
    const availableHeight = wrapperEl.clientHeight;
    if (availableHeight === 0) return;

    let size = FontScaler.MAX_SIZE;
    textEl.style.fontSize = `${size}rem`;

    while (textEl.scrollHeight > availableHeight && size > FontScaler.MIN_SIZE) {
      size = Math.max(FontScaler.MIN_SIZE, size - FontScaler.STEP);
      textEl.style.fontSize = `${size}rem`;
    }
  }
}

// ==========================================================================
// NEW TAB COORDINATOR (Application Flow & DOM Binder)
// ==========================================================================
class NewTabCoordinator {
  constructor() {
    this.storage = new StorageManager();
    this.viewModel = new QuoteViewModel();
    this.readwise = null;

    this.initializeDOMElements();
    this.bindEventListeners();
  }

  initializeDOMElements() {
    this.quoteCard = document.getElementById('quoteCard');
    this.quoteText = document.getElementById('quoteText');
    this.quoteTextWrapper = this.quoteText.closest('.quote-text-wrapper');
    this.bookTitle = document.getElementById('bookTitle');
    this.bookAuthor = document.getElementById('bookAuthor');
    this.bookCover = document.getElementById('bookCover');
    this.coverFallback = document.getElementById('coverFallback');
    this.fallbackTitle = document.getElementById('fallbackTitle');
    this.nextBtn = document.getElementById('nextBtn');
    this.discardBtn = document.getElementById('discardBtn');
    this.settingsToggleBtn = document.getElementById('settingsToggleBtn');
    this.settingsModal = document.getElementById('settingsModal');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    this.syncStatus = document.getElementById('syncStatus');
  }

  bindEventListeners() {
    this.nextBtn.addEventListener('click', () => this.handleNextClick());
    this.discardBtn.addEventListener('click', () => this.handleDiscardClick());
    this.settingsToggleBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.saveApiKeyBtn.addEventListener('click', () => this.handleSaveApiKey());
    
    // Close modal on overlay click
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });
  }

  async start() {
    const key = await this.storage.getApiKey();
    if (key) {
      this.readwise = new ReadwiseManager(key);
      await this.viewModel.loadData(this.storage);
      this.updateView();
    } else {
      this.openSettings();
    }
  }

  updateView() {
    if (!this.viewModel.hasQuotes()) {
      this.showSetupRequiredView();
      return;
    }

    this.applyTransition(() => {
      const quote = this.viewModel.currentQuote;
      this.quoteText.textContent = quote.text;
      this.bookTitle.textContent = quote.bookTitle;
      this.bookAuthor.textContent = quote.bookAuthor;

      this.updateCoverImage(quote);

      this.nextBtn.disabled = false;
      this.discardBtn.disabled = false;

      // Rescale font after DOM update
      requestAnimationFrame(() => {
        FontScaler.fit(this.quoteText, this.quoteTextWrapper);
      });
    });
  }

  updateCoverImage(quote) {
    if (quote.coverUrl && !quote.coverUrl.includes('default-book-cover')) {
      this.bookCover.src = quote.coverUrl;
      this.bookCover.classList.remove('hidden');
      this.coverFallback.classList.add('hidden');
    } else {
      this.bookCover.classList.add('hidden');
      this.coverFallback.classList.remove('hidden');
      this.fallbackTitle.textContent = quote.bookTitle.substring(0, 20) + '...';
    }
  }

  showSetupRequiredView() {
    this.quoteText.textContent = 'Sincronizza le tue citazioni per iniziare!';
    this.bookTitle.textContent = 'Nessuna citazione caricata';
    this.bookAuthor.textContent = 'Apri le impostazioni e clicca su Sincronizza.';
    this.bookCover.classList.add('hidden');
    this.coverFallback.classList.remove('hidden');
    this.fallbackTitle.textContent = 'SETUP';
    this.nextBtn.disabled = true;
    this.discardBtn.disabled = true;
    this.quoteText.style.fontSize = '1.3rem';
  }

  applyTransition(updateCallback) {
    const section = document.querySelector('.content-section');
    const cover = document.querySelector('.cover-section');

    section.classList.add('fade-out-content');
    cover.classList.add('fade-out-content');

    setTimeout(() => {
      updateCallback();
      section.classList.remove('fade-out-content');
      cover.classList.remove('fade-out-content');
      section.classList.add('fade-in-content');
      cover.classList.add('fade-in-content');

      setTimeout(() => {
        section.classList.remove('fade-in-content');
        cover.classList.remove('fade-in-content');
      }, 500);
    }, 220);
  }

  async handleNextClick() {
    this.viewModel.selectRandomQuote();
    this.updateView();
  }

  async handleDiscardClick() {
    this.discardBtn.disabled = true;
    this.discardBtn.classList.add('btn-danger-active');

    try {
      await this.viewModel.discardCurrent(this.storage, this.readwise);
    } catch (err) {
      // Anche in caso di errore grave, la citazione è già rimossa dalla cache locale
      console.error('Discard API error:', err.message);
      alert(`Attenzione: ${err.message}\n\nLa citazione è stata rimossa dalla lista locale.`);
    } finally {
      this.discardBtn.classList.remove('btn-danger-active');
      this.discardBtn.disabled = false;
      // Aggiorna sempre la vista indipendentemente dall'esito
      this.updateView();
    }
  }

  openSettings() {
    this.storage.getApiKey().then(key => {
      this.apiKeyInput.value = key;
      this.updateSyncStatusText();
      this.settingsModal.classList.remove('hidden');
    });
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
  }

  async updateSyncStatusText() {
    const quotes = await this.storage.getQuotes();
    const lastSync = await this.storage.getLastSync();
    
    if (quotes.length > 0) {
      const dateStr = new Date(lastSync).toLocaleString('it-IT');
      this.syncStatus.textContent = `${quotes.length} citazioni (${dateStr})`;
    } else {
      this.syncStatus.textContent = 'Non collegato';
    }
  }

  async handleSaveApiKey() {
    const key = this.apiKeyInput.value.trim();
    if (!key) return alert('Inserisci un token valido.');

    this.saveApiKeyBtn.disabled = true;
    this.syncStatus.textContent = 'Sincronizzazione...';

    try {
      const mgr = new ReadwiseManager(key);
      const isConnected = await mgr.testConnection();
      if (!isConnected) throw new Error('Token non valido.');

      await this.storage.setApiKey(key);
      this.readwise = mgr;

      const quotes = await mgr.syncAllQuotes((count, pages) => {
        this.syncStatus.textContent = `Scaricamento... ${count} citazioni (${pages} pag)`;
      });

      await this.storage.setQuotes(quotes);
      await this.storage.setLastSync(Date.now());

      await this.viewModel.loadData(this.storage);
      this.updateView();
      
      setTimeout(() => this.closeSettings(), 500);
    } catch (err) {
      console.error(err);
      this.syncStatus.textContent = 'Errore!';
      alert(err.message || 'Errore di connessione a Readwise.');
    } finally {
      this.saveApiKeyBtn.disabled = false;
    }
  }
}

// Start coordination on load
document.addEventListener('DOMContentLoaded', () => {
  const coordinator = new NewTabCoordinator();
  coordinator.start();
});
