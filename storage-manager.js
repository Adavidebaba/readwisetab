/**
 * StorageManager — Data Access Layer
 * Handles all chrome.storage reads and writes.
 * Compatible with both newtab context and service worker (background.js).
 */
class StorageManager {
  static KEYS = {
    API_KEY:   'rw_api_key',
    QUOTES:    'rw_quotes',
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

  async updateQuote(updatedQuote) {
    const quotes = await this.getQuotes();
    const updated = quotes.map(q => q.id === updatedQuote.id ? updatedQuote : q);
    await this.setQuotes(updated);
    return updated;
  }

  /**
   * Merges an incremental batch of quotes (from updatedAfter sync) into the cache.
   * - Discarded quotes (isDiscarded flag) are removed from cache
   * - Existing quotes are updated in place
   * - New quotes are appended
   */
  async mergeIncrementalQuotes(incomingQuotes, discardedIds) {
    let existing = await this.getQuotes();

    // Remove newly discarded highlights from cache
    if (discardedIds.length > 0) {
      const discardSet = new Set(discardedIds);
      existing = existing.filter(q => !discardSet.has(q.id));
    }

    // Update or add incoming quotes
    for (const newQ of incomingQuotes) {
      const idx = existing.findIndex(q => q.id === newQ.id);
      if (idx !== -1) {
        existing[idx] = newQ;
      } else {
        existing.push(newQ);
      }
    }

    await this.setQuotes(existing);
    return existing;
  }

  async getLastSync() {
    const data = await chrome.storage.local.get(StorageManager.KEYS.LAST_SYNC);
    return data[StorageManager.KEYS.LAST_SYNC] || 0;
  }

  async setLastSync(timestamp) {
    await chrome.storage.local.set({ [StorageManager.KEYS.LAST_SYNC]: timestamp });
  }
}
