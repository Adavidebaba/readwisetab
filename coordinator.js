/**
 * NewTabCoordinator — Application Flow & DOM Binder
 * Wires UI events to ViewModel and Managers.
 */
class NewTabCoordinator {
  constructor() {
    this.storage   = new StorageManager();
    this.viewModel = new QuoteViewModel();
    this.readwise  = null;

    this.initializeDOMElements();
    this.bindEventListeners();
  }

  initializeDOMElements() {
    this.quoteCard       = document.getElementById('quoteCard');
    this.quoteText       = document.getElementById('quoteText');
    this.quoteTextWrapper = this.quoteText.closest('.quote-text-wrapper');
    this.bookTitle       = document.getElementById('bookTitle');
    this.bookAuthor      = document.getElementById('bookAuthor');
    this.bookCover       = document.getElementById('bookCover');
    this.coverFallback   = document.getElementById('coverFallback');
    this.fallbackTitle   = document.getElementById('fallbackTitle');
    this.nextBtn         = document.getElementById('nextBtn');
    this.discardBtn      = document.getElementById('discardBtn');
    this.favoriteBtn     = document.getElementById('favoriteBtn');
    this.starEmpty       = document.getElementById('starEmpty');
    this.starFilled      = document.getElementById('starFilled');
    this.favoriteBtnLabel = document.getElementById('favoriteBtnLabel');
    this.settingsToggleBtn = document.getElementById('settingsToggleBtn');
    this.settingsModal   = document.getElementById('settingsModal');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.apiKeyInput     = document.getElementById('apiKeyInput');
    this.saveApiKeyBtn   = document.getElementById('saveApiKeyBtn');
    this.syncStatus      = document.getElementById('syncStatus');
  }

  bindEventListeners() {
    this.nextBtn.addEventListener('click',      () => this.handleNextClick());
    this.discardBtn.addEventListener('click',   () => this.handleDiscardClick());
    this.favoriteBtn.addEventListener('click',  () => this.handleFavoriteClick());
    this.settingsToggleBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click',  () => this.closeSettings());
    this.saveApiKeyBtn.addEventListener('click',     () => this.handleSaveApiKey());

    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });

    // Listen for storage updates pushed by the background sync
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes[StorageManager.KEYS.QUOTES]) {
        this.viewModel.quotes = changes[StorageManager.KEYS.QUOTES].newValue || [];
        await this.populateSyncStatus();
      }
    });
  }

  async start() {
    const key = await this.storage.getApiKey();
    if (key) {
      this.readwise = new ReadwiseManager(key);
      await this.viewModel.loadData(this.storage);
      this.updateView();
      this.populateSyncStatus();
    } else {
      this.openSettings();
    }
  }

  async populateSyncStatus() {
    const lastSync = await this.storage.getLastSync();
    const count = this.viewModel.quotes ? this.viewModel.quotes.length : 0;
    if (lastSync) {
      const d = new Date(lastSync);
      this.syncStatus.textContent = `Ultima sync: ${d.toLocaleString('it-IT')} (${count} citazioni)`;
    } else {
      this.syncStatus.textContent = `Non sincronizzato (${count} citazioni)`;
    }
  }

  updateView() {
    if (!this.viewModel.hasQuotes()) {
      this.showSetupRequiredView();
      return;
    }
    this.applyTransition(() => {
      const q = this.viewModel.currentQuote;
      this.quoteText.textContent  = q.text;
      this.bookTitle.textContent  = q.bookTitle;
      this.bookAuthor.textContent = q.bookAuthor;
      this.updateCoverImage(q);
      this.updateFavoriteButton(q.isFavorite);
      this.nextBtn.disabled    = false;
      this.discardBtn.disabled = false;
      this.favoriteBtn.disabled = false;
      requestAnimationFrame(() => FontScaler.fit(this.quoteText, this.quoteTextWrapper));
    });
  }

  updateFavoriteButton(isFavorite) {
    if (isFavorite) {
      this.favoriteBtn.classList.add('is-favorite');
      this.starEmpty.classList.add('hidden');
      this.starFilled.classList.remove('hidden');
      this.favoriteBtn.title = 'Rimuovi dai preferiti';
    } else {
      this.favoriteBtn.classList.remove('is-favorite');
      this.starEmpty.classList.remove('hidden');
      this.starFilled.classList.add('hidden');
      this.favoriteBtn.title = 'Aggiungi ai preferiti';
    }
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
    this.quoteText.textContent  = 'Sincronizza le tue citazioni per iniziare!';
    this.bookTitle.textContent  = 'Nessuna citazione caricata';
    this.bookAuthor.textContent = 'Apri le impostazioni e clicca su Sincronizza.';
    this.bookCover.classList.add('hidden');
    this.coverFallback.classList.remove('hidden');
    this.fallbackTitle.textContent = 'SETUP';
    this.nextBtn.disabled    = true;
    this.discardBtn.disabled = true;
    this.favoriteBtn.disabled = true;
    this.quoteText.style.fontSize = '1.3rem';
  }

  applyTransition(updateCallback) {
    const section = document.querySelector('.content-section');
    const cover   = document.querySelector('.cover-section');
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
    this.viewModel.selectWeightedQuote();
    this.updateView();
  }

  async handleDiscardClick() {
    this.discardBtn.disabled = true;
    this.discardBtn.classList.add('btn-danger-active');
    try {
      await this.viewModel.discardCurrent(this.storage, this.readwise);
    } catch (err) {
      console.error('Discard API error:', err.message);
      alert(`Attenzione: ${err.message}\n\nLa citazione è stata rimossa dalla lista locale.`);
    } finally {
      this.discardBtn.classList.remove('btn-danger-active');
      this.discardBtn.disabled = false;
      this.updateView();
    }
  }

  async handleFavoriteClick() {
    if (!this.viewModel.currentQuote) return;
    this.favoriteBtn.disabled = true;
    const previousValue = this.viewModel.currentQuote.isFavorite;
    this.updateFavoriteButton(!previousValue); // ottimistico
    try {
      await this.viewModel.toggleFavoriteCurrent(this.storage, this.readwise);
    } catch (err) {
      console.error('Favorite API error:', err.message);
      this.updateFavoriteButton(previousValue); // ripristina
      alert(`Errore: ${err.message}`);
    } finally {
      this.favoriteBtn.disabled = false;
    }
  }

  async openSettings()  {
    await this.populateSyncStatus();
    this.settingsModal.classList.remove('hidden');
  }
  closeSettings() { this.settingsModal.classList.add('hidden'); }

  async handleSaveApiKey() {
    const key = this.apiKeyInput.value.trim();
    if (!key) return alert('Inserisci un token valido.');

    this.saveApiKeyBtn.disabled = true;
    this.syncStatus.textContent = 'Verifica connessione...';

    try {
      const mgr = new ReadwiseManager(key);
      const isConnected = await mgr.testConnection();
      if (!isConnected) throw new Error('Token non valido o connessione fallita.');

      await this.storage.setApiKey(key);
      this.readwise = mgr;

      // Sync incrementale: usa updatedAfter se c'è già una sync precedente
      const lastSync  = await this.storage.getLastSync();
      const isFirstSync = lastSync === 0;
      const updatedAfter = isFirstSync ? null : new Date(lastSync).toISOString();

      this.syncStatus.textContent = isFirstSync
        ? 'Prima sincronizzazione (può richiedere qualche minuto)...'
        : 'Aggiornamento incrementale...';

      const books = await mgr.syncAllQuotes(updatedAfter, (count, pages) => {
        this.syncStatus.textContent = `Scaricamento... ${count} citazioni (${pages} pag)`;
      });

      const { quotes: incoming, discardedIds } = mgr.extractQuotes(books);

      let finalQuotes;
      if (isFirstSync) {
        await this.storage.setQuotes(incoming);
        finalQuotes = incoming;
      } else {
        finalQuotes = await this.storage.mergeIncrementalQuotes(incoming, discardedIds);
      }

      await this.storage.setLastSync(Date.now());
      this.viewModel.quotes = finalQuotes;
      this.viewModel.selectWeightedQuote();
      this.updateView();

      const label = isFirstSync
        ? `${finalQuotes.length} citazioni caricate`
        : `+${incoming.length} nuove, ${discardedIds.length} rimosse`;
      this.syncStatus.textContent = label;

      setTimeout(() => this.closeSettings(), 800);
    } catch (err) {
      console.error(err);
      this.syncStatus.textContent = 'Errore!';
      alert(err.message || 'Errore di connessione a Readwise.');
    } finally {
      this.saveApiKeyBtn.disabled = false;
    }
  }
}
