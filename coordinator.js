/**
 * NewTabCoordinator — Application Flow & DOM Binder
 * Wires UI events to ViewModel and Managers.
 */
class NewTabCoordinator {
  constructor() {
    this.storage   = new StorageManager();
    this.viewModel = new QuoteViewModel();
    this.readwise  = null;

    this.settings = new SettingsCoordinator(this.storage, this.viewModel, (finalQuotes, mgr) => {
      this.readwise = mgr;
      this.viewModel.quotes = finalQuotes;
      this.viewModel.selectWeightedQuote();
      this.updateView();
    });

    this.initializeDOMElements();
    this.bindEventListeners();
  }

  initializeDOMElements() {
    this.quoteCard          = document.getElementById('quoteCard');
    this.quoteText          = document.getElementById('quoteText');
    this.quoteTextWrapper   = this.quoteText.closest('.quote-text-wrapper');
    this.bookTitle          = document.getElementById('bookTitle');
    this.bookAuthor         = document.getElementById('bookAuthor');
    this.bookCover          = document.getElementById('bookCover');
    this.coverFallback      = document.getElementById('coverFallback');
    this.fallbackTitle      = document.getElementById('fallbackTitle');
    this.quoteCategoryBadge = document.getElementById('quoteCategoryBadge');
    this.nextBtn            = document.getElementById('nextBtn');
    this.discardBtn         = document.getElementById('discardBtn');
    this.reviewBtn          = document.getElementById('reviewBtn');
    this.reviewBtnLabel     = document.getElementById('reviewBtnLabel');
    this.favoriteBtn        = document.getElementById('favoriteBtn');
    this.starEmpty          = document.getElementById('starEmpty');
    this.starFilled         = document.getElementById('starFilled');
    this.favoriteBtnLabel   = document.getElementById('favoriteBtnLabel');
    this.undoToast          = document.getElementById('undoToast');
    this.undoBtn            = document.getElementById('undoBtn');
    this.closeUndoToastBtn  = document.getElementById('closeUndoToastBtn');
    this.undoProgressBar    = document.getElementById('undoProgressBar');
    this.undoTimer          = null;
    this.footerStats        = document.getElementById('footerStats');
    this.statTotalQuotes    = document.getElementById('statTotalQuotes');
    this.statFavoriteQuotes = document.getElementById('statFavoriteQuotes');
    this.statUnreadQuotes   = document.getElementById('statUnreadQuotes');
    this.statAvgReads       = document.getElementById('statAvgReads');
  }

  bindEventListeners() {
    this.nextBtn.addEventListener('click', () => this.handleNextClick());
    this.discardBtn.addEventListener('click', () => this.handleDiscardClick());
    if (this.reviewBtn) {
      this.reviewBtn.addEventListener('click', () => this.handleReviewClick());
    }
    this.favoriteBtn.addEventListener('click', () => this.handleFavoriteClick());
    this.undoBtn.addEventListener('click', () => this.handleUndoClick());
    this.closeUndoToastBtn.addEventListener('click', () => this.hideUndoToast());

    // Listen for storage updates pushed by background sync or other tabs
    chrome.storage.onChanged.addListener(async (changes) => {
      if (changes[StorageManager.KEYS.QUOTES]) {
        this.viewModel.quotes = changes[StorageManager.KEYS.QUOTES].newValue || [];
        await this.settings.populateSyncStatus();
        this.updateStatsView();
      }
      if (changes[StorageManager.KEYS.VIEW_COUNTS]) {
        this.viewModel.viewCounts = changes[StorageManager.KEYS.VIEW_COUNTS].newValue || {};
        this.updateStatsView();
      }
    });
  }

  async start() {
    const key = await this.storage.getApiKey();
    if (key) {
      this.readwise = new ReadwiseManager(key);
      await this.viewModel.loadData(this.storage);
      this.updateView();
      await this.settings.populateSyncStatus();
    } else {
      this.settings.openSettings();
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

  updateStatsView() {
    if (!this.footerStats) return;
    if (!this.viewModel.hasQuotes()) {
      this.footerStats.classList.add('hidden');
      return;
    }
    const stats = this.viewModel.getStats();
    this.statTotalQuotes.textContent    = stats.total;
    this.statFavoriteQuotes.textContent = stats.favorites;
    this.statUnreadQuotes.textContent   = stats.unread;
    this.statAvgReads.textContent       = `${stats.averageReads}x`;
    this.footerStats.classList.remove('hidden');
  }

  updateView() {
    if (!this.viewModel.hasQuotes()) {
      this.showSetupRequiredView();
      this.updateStatsView();
      return;
    }

    this.updateStatsView();

    this.applyTransition(() => {
      const q = this.viewModel.currentQuote;
      this.quoteText.textContent  = q.text;
      this.bookTitle.textContent  = q.bookTitle;
      this.bookAuthor.textContent = q.bookAuthor;
      this.updateCoverImage(q);
      this.updateCategoryBadge(q);
      this.updateFavoriteButton(q.isFavorite);
      this.updateReviewButton(this.viewModel.isCurrentQuoteBoosted());
      this.nextBtn.disabled    = false;
      this.discardBtn.disabled = false;
      if (this.reviewBtn) this.reviewBtn.disabled = false;
      this.favoriteBtn.disabled = false;
      requestAnimationFrame(() => FontScaler.fit(this.quoteText, this.quoteTextWrapper));
    });
  }

  async handleReviewClick() {
    if (!this.viewModel.currentQuote) return;
    this.reviewBtn.disabled = true;
    try {
      await this.viewModel.boostCurrentQuote(this.storage);
      this.updateReviewButton(true);
    } catch (err) {
      console.error('Review boost error:', err);
    } finally {
      this.reviewBtn.disabled = false;
    }
  }

  updateReviewButton(isBoosted) {
    if (!this.reviewBtn) return;
    if (isBoosted) {
      this.reviewBtn.classList.add('is-boosted');
      if (this.reviewBtnLabel) this.reviewBtnLabel.textContent = 'In ripasso 🔥';
      this.reviewBtn.title = 'Ripasso attivo: questa citazione comparirà molto spesso nei prossimi tab';
    } else {
      this.reviewBtn.classList.remove('is-boosted');
      if (this.reviewBtnLabel) this.reviewBtnLabel.textContent = 'Rivedi presto';
      this.reviewBtn.title = 'Aumenta la frequenza di comparsa per memorizzarla a breve';
    }
  }

  updateCategoryBadge(quote) {
    if (!this.quoteCategoryBadge) return;
    if (!quote || !quote.category) {
      this.quoteCategoryBadge.classList.add('hidden');
      return;
    }

    const categoryMap = {
      books:         { label: 'Libro',             icon: '📚', className: 'badge-books' },
      articles:      { label: 'Articolo',          icon: '📄', className: 'badge-articles' },
      tweets:        { label: 'Tweet',             icon: '🐦', className: 'badge-tweets' },
      podcasts:      { label: 'Podcast',           icon: '🎙️', className: 'badge-podcasts' },
      supplementals: { label: 'Supplemental Book', icon: '📑', className: 'badge-supplementals' }
    };

    const config = categoryMap[quote.category] || {
      label: quote.category,
      icon: '🔖',
      className: 'badge-default'
    };

    this.quoteCategoryBadge.textContent = `${config.icon} ${config.label}`;
    this.quoteCategoryBadge.className = `quote-category-badge ${config.className}`;
    this.quoteCategoryBadge.classList.remove('hidden');
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
    if (this.quoteCategoryBadge) this.quoteCategoryBadge.classList.add('hidden');
    this.nextBtn.disabled    = true;
    this.discardBtn.disabled = true;
    if (this.reviewBtn) this.reviewBtn.disabled = true;
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
    if (this.nextBtn) this.nextBtn.disabled = true;
    try {
      await this.viewModel.recordCurrentView(this.storage);
    } catch (err) {
      console.error('Error recording view count:', err);
    } finally {
      this.viewModel.selectWeightedQuote();
      this.updateView();
    }
  }

  async handleDiscardClick() {
    this.discardBtn.disabled = true;
    this.discardBtn.classList.add('btn-danger-active');
    try {
      await this.viewModel.discardCurrent(this.storage, this.readwise);
      this.showUndoToast();
    } catch (err) {
      console.error('Discard API error:', err.message);
      alert(`Attenzione: ${err.message}\n\nLa citazione è stata rimossa dalla lista locale.`);
    } finally {
      this.discardBtn.classList.remove('btn-danger-active');
      this.discardBtn.disabled = false;
      this.updateView();
    }
  }

  showUndoToast() {
    if (!this.undoToast) return;
    this.clearUndoTimer();

    this.undoToast.classList.remove('hidden');
    void this.undoToast.offsetWidth; // Force reflow
    this.undoToast.classList.add('visible');

    if (this.undoProgressBar) {
      this.undoProgressBar.classList.remove('animating');
      void this.undoProgressBar.offsetWidth;
      this.undoProgressBar.classList.add('animating');
    }

    this.undoTimer = setTimeout(() => {
      this.hideUndoToast();
    }, 10000);
  }

  hideUndoToast() {
    this.clearUndoTimer();
    if (!this.undoToast) return;
    this.undoToast.classList.remove('visible');
    setTimeout(() => {
      if (!this.undoToast.classList.contains('visible')) {
        this.undoToast.classList.add('hidden');
      }
    }, 300);
  }

  clearUndoTimer() {
    if (this.undoTimer) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
  }

  async handleUndoClick() {
    this.hideUndoToast();
    if (!this.viewModel.lastDiscarded) return;

    this.undoBtn.disabled = true;
    try {
      await this.viewModel.undoDiscard(this.storage, this.readwise);
      this.updateView();
    } catch (err) {
      console.error('Undo API error:', err.message);
      alert(`Attenzione: errore nel ripristino su Readwise (${err.message}). La citazione è comunque stata ripristinata localmente.`);
      this.updateView();
    } finally {
      this.undoBtn.disabled = false;
    }
  }

  async handleFavoriteClick() {
    if (!this.viewModel.currentQuote) return;
    this.favoriteBtn.disabled = true;
    const previousValue = this.viewModel.currentQuote.isFavorite;
    this.updateFavoriteButton(!previousValue); // ottimistico
    try {
      await this.viewModel.toggleFavoriteCurrent(this.storage, this.readwise);
      this.updateStatsView();
    } catch (err) {
      console.error('Favorite API error:', err.message);
      this.updateFavoriteButton(previousValue); // ripristina
      this.updateStatsView();
      alert(`Errore: ${err.message}`);
    } finally {
      this.favoriteBtn.disabled = false;
    }
  }
}
