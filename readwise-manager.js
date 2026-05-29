/**
 * ReadwiseManager — Network / Service Layer
 * All API calls to readwise.io.
 * Compatible with both newtab context and service worker (background.js).
 */
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
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Downloads all (or incremental) highlights from Readwise Export API.
   * @param {string|null} updatedAfter - ISO 8601 date; if set, only fetch updated-after highlights
   * @param {Function|null} progressCallback - called with (count, pages) during pagination
   */
  async syncAllQuotes(updatedAfter = null, progressCallback = null) {
    let nextPageCursor = null;
    let pagesFetched = 0;
    const allBooks = [];

    while (true) {
      const queryParams = new URLSearchParams();
      if (nextPageCursor) queryParams.append('pageCursor', nextPageCursor);
      if (updatedAfter)   queryParams.append('updatedAfter', updatedAfter);

      const url = `${this.baseUrl}/export/?${queryParams.toString()}`;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        throw new Error(`Sincronizzazione fallita: HTTP ${response.status}`);
      }

      const data = await response.json();
      allBooks.push(...(data.results || []));

      nextPageCursor = data.nextPageCursor || null;
      pagesFetched++;

      if (progressCallback) {
        const count = allBooks.reduce((sum, b) => sum + (b.highlights?.length || 0), 0);
        progressCallback(count, pagesFetched);
      }

      if (!nextPageCursor) break;
    }

    return allBooks;
  }

  /**
   * Extracts clean quote objects from Export API book results.
   * Returns { quotes: [...], discardedIds: [...] }
   * discardedIds = highlights that are now tagged as discard (used for incremental removal)
   */
  extractQuotes(books) {
    const quotes = [];
    const discardedIds = [];

    for (const book of books) {
      if (!book.highlights || book.highlights.length === 0) continue;

      for (const h of book.highlights) {
        const isDiscarded = Array.isArray(h.tags) && h.tags.some(t => t.name === 'discard');
        if (isDiscarded) {
          discardedIds.push(h.id);
          continue;
        }
        quotes.push({
          id:         h.id,
          text:       h.text,
          bookTitle:  book.title,
          bookAuthor: book.author,
          coverUrl:   book.cover_image_url,
          isFavorite: h.is_favorite === true
        });
      }
    }

    return { quotes, discardedIds };
  }

  async tagQuoteAsDiscard(highlightId) {
    const url = `${this.baseUrl}/highlights/${highlightId}/tags/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: 'discard' })
    });
    // 200/201=ok, 400=tag duplicato, 404=non trovata, 409=conflitto → tutti soft-ok
    if (response.ok || [400, 404, 409].includes(response.status)) {
      return { ok: true, status: response.status };
    }
    throw new Error(`Errore API Readwise (HTTP ${response.status}): tagging fallito.`);
  }

  async toggleFavorite(highlightId, isFavorite) {
    const url = `${this.baseUrl}/highlights/${highlightId}/`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ is_favorite: isFavorite })
    });
    if (!response.ok) {
      throw new Error(`Errore API Readwise (HTTP ${response.status}): aggiornamento preferito fallito.`);
    }
    return true;
  }
}
