/**
 * FontScaler — Adaptive Typography Utility
 * Reduces font-size until the text fits its container without overflow.
 */
class FontScaler {
  static MAX_SIZE = 1.55; // rem
  static MIN_SIZE = 1.05; // rem — preserva la leggibilità per citazioni lunghe
  static STEP     = 0.04; // rem per iterazione

  static fit(textEl, wrapperEl) {
    if (!wrapperEl || !textEl) return;
    wrapperEl.scrollTop = 0;
    const availableHeight = wrapperEl.clientHeight;
    if (availableHeight === 0) return;

    wrapperEl.classList.remove('has-scroll');

    let size = FontScaler.MAX_SIZE;
    textEl.style.fontSize = `${size}rem`;

    while (textEl.scrollHeight > availableHeight && size > FontScaler.MIN_SIZE) {
      size = Math.max(FontScaler.MIN_SIZE, size - FontScaler.STEP);
      textEl.style.fontSize = `${size}rem`;
    }

    if (textEl.scrollHeight > availableHeight) {
      wrapperEl.classList.add('has-scroll');
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
    this.quotes        = [];
    this.currentQuote   = null;
    this.lastDiscarded = null;
    this.viewCounts    = {};
    this.reviewBoosts  = {};
    this.isLoading      = false;
  }

  async loadData(storageManager) {
    this.quotes = await storageManager.getQuotes();
    this.viewCounts = await storageManager.getViewCounts();
    this.reviewBoosts = await storageManager.getReviewBoosts();
    this.selectWeightedQuote();
  }

  async recordCurrentView(storageManager) {
    if (!this.currentQuote) return;
    const id = this.currentQuote.id;
    this.viewCounts[id] = (this.viewCounts[id] || 0) + 1;
    await storageManager.incrementViewCount(id);

    if (this.reviewBoosts[id] && this.reviewBoosts[id] > 0) {
      this.reviewBoosts[id]--;
      if (this.reviewBoosts[id] <= 0) {
        delete this.reviewBoosts[id];
      }
      await storageManager.decrementReviewBoost(id);
    }
  }

  calculateWeight(quote) {
    const views = this.viewCounts[quote.id] || 0;
    let weight = 10 / (1 + views);

    if (quote.isFavorite) {
      weight *= QuoteViewModel.FAVORITE_WEIGHT;
    }

    const boostCount = this.reviewBoosts[quote.id] || 0;
    if (boostCount > 0) {
      weight *= (5 * boostCount);
    }

    return Math.max(0.1, weight);
  }

  /**
   * Picks a quote with weighted probability:
   * favors unread/less-read quotes, gives favorite boost, and applies review boosts.
   */
  selectWeightedQuote() {
    if (this.quotes.length === 0) {
      this.currentQuote = null;
      return null;
    }

    let totalWeight = 0;
    const weights = new Array(this.quotes.length);
    for (let i = 0; i < this.quotes.length; i++) {
      const w = this.calculateWeight(this.quotes[i]);
      weights[i] = w;
      totalWeight += w;
    }

    let randomVal = Math.random() * totalWeight;
    for (let i = 0; i < this.quotes.length; i++) {
      randomVal -= weights[i];
      if (randomVal <= 0) {
        this.currentQuote = this.quotes[i];
        return this.currentQuote;
      }
    }

    this.currentQuote = this.quotes[this.quotes.length - 1];
    return this.currentQuote;
  }

  async boostCurrentQuote(storageManager) {
    if (!this.currentQuote) return false;
    const id = this.currentQuote.id;
    this.reviewBoosts[id] = 3;
    await storageManager.setReviewBoost(id, 3);
    return true;
  }

  isCurrentQuoteBoosted() {
    if (!this.currentQuote) return false;
    return (this.reviewBoosts[this.currentQuote.id] || 0) > 0;
  }

  async discardCurrent(storageManager, readwiseManager) {
    if (!this.currentQuote) return null;
    this.isLoading = true;
    const discardedQuote = this.currentQuote;
    let tagId = null;
    try {
      const result = await readwiseManager.tagQuoteAsDiscard(discardedQuote.id);
      tagId = result?.tagId || null;
    } catch (err) {
      console.warn('Readwise tag API error:', err.message);
      throw err;
    } finally {
      this.lastDiscarded = { quote: discardedQuote, tagId };
      this.quotes = await storageManager.removeQuote(discardedQuote.id);
      this.selectWeightedQuote();
      this.isLoading = false;
    }
    return discardedQuote;
  }

  async undoDiscard(storageManager, readwiseManager) {
    if (!this.lastDiscarded) return null;
    this.isLoading = true;
    const { quote, tagId } = this.lastDiscarded;
    try {
      await readwiseManager.removeDiscardTag(quote.id, tagId);
    } catch (err) {
      console.warn('Readwise remove tag error:', err.message);
      throw err;
    } finally {
      this.quotes = await storageManager.addQuote(quote);
      this.currentQuote = quote;
      this.lastDiscarded = null;
      this.isLoading = false;
    }
    return quote;
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

  getStats() {
    const total = this.quotes.length;
    if (total === 0) {
      return { total: 0, favorites: 0, unread: 0, averageReads: '0.0' };
    }
    const favorites = this.quotes.filter(q => q.isFavorite).length;
    const unread = this.quotes.filter(q => !this.viewCounts[q.id] || this.viewCounts[q.id] === 0).length;

    let totalViews = 0;
    for (const q of this.quotes) {
      totalViews += (this.viewCounts[q.id] || 0);
    }
    const averageReads = (totalViews / total).toFixed(1);

    return { total, favorites, unread, averageReads };
  }
}

