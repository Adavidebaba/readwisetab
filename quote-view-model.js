/**
 * FontScaler — Adaptive Typography Utility
 * Reduces font-size until the text fits its container without overflow.
 */
class FontScaler {
  static MAX_SIZE = 1.55; // rem
  static MIN_SIZE = 0.82; // rem
  static STEP     = 0.04; // rem per iteration

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
// QuoteViewModel — UI State / Presentation Layer
// ==========================================================================
class QuoteViewModel {
  // Favorites appear this many times more often than regular quotes
  static FAVORITE_WEIGHT = 3;

  constructor() {
    this.quotes      = [];
    this.currentQuote = null;
    this.isLoading    = false;
  }

  async loadData(storageManager) {
    this.quotes = await storageManager.getQuotes();
    this.selectWeightedQuote();
  }

  /**
   * Picks a random quote with weighted probability:
   * favorites are FAVORITE_WEIGHT × more likely to appear.
   */
  selectWeightedQuote() {
    if (this.quotes.length === 0) {
      this.currentQuote = null;
      return null;
    }

    // Build a weighted pool: each favorite is added FAVORITE_WEIGHT times
    const pool = [];
    for (const q of this.quotes) {
      const weight = q.isFavorite ? QuoteViewModel.FAVORITE_WEIGHT : 1;
      for (let i = 0; i < weight; i++) pool.push(q);
    }

    this.currentQuote = pool[Math.floor(Math.random() * pool.length)];
    return this.currentQuote;
  }

  async discardCurrent(storageManager, readwiseManager) {
    if (!this.currentQuote) return;
    this.isLoading = true;
    try {
      await readwiseManager.tagQuoteAsDiscard(this.currentQuote.id);
    } catch (err) {
      console.warn('Readwise tag API error:', err.message);
      throw err;
    } finally {
      this.quotes = await storageManager.removeQuote(this.currentQuote.id);
      this.selectWeightedQuote();
      this.isLoading = false;
    }
  }

  async toggleFavoriteCurrent(storageManager, readwiseManager) {
    if (!this.currentQuote) return;
    const newValue = !this.currentQuote.isFavorite;
    await readwiseManager.toggleFavorite(this.currentQuote.id, newValue);
    this.currentQuote = { ...this.currentQuote, isFavorite: newValue };
    this.quotes = await storageManager.updateQuote(this.currentQuote);
    return newValue;
  }

  hasQuotes() {
    return this.quotes.length > 0;
  }
}
