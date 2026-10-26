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
   * Returns { quotes: [...], discardedIds: [...], report: {...} }
   */
  extractQuotes(books) {
    const quotes = [];
    const discardedIds = [];
    const report = { totalRaw: 0, discarded: 0, deleted: 0, taggedDiscard: 0, active: 0, byCategory: {} };

    for (const book of books) {
      if (book.is_deleted === true) {
        if (Array.isArray(book.highlights)) {
          report.totalRaw += book.highlights.length;
          report.deleted += book.highlights.length;
          discardedIds.push(...book.highlights.map(h => h.id));
        }
        continue;
      }
      if (!book.highlights || book.highlights.length === 0) continue;

      for (const h of book.highlights) {
        report.totalRaw++;
        const hasDiscardTag = Array.isArray(h.tags) && h.tags.some(t => t.name === 'discard');
        const isDiscarded = h.is_discard === true || h.is_deleted === true || hasDiscardTag;

        if (isDiscarded) {
          if (h.is_discard === true) report.discarded++;
          if (h.is_deleted === true) report.deleted++;
          if (hasDiscardTag) report.taggedDiscard++;
          discardedIds.push(h.id);
          continue;
        }

        report.active++;
        const isSupplemental = book.category === 'supplementals' || book.source === 'supplemental';
        const category = isSupplemental ? 'supplementals' : (book.category || 'books');
        report.byCategory[category] = (report.byCategory[category] || 0) + 1;

        quotes.push({
          id:         h.id,
          text:       h.text,
          bookTitle:  book.title,
          bookAuthor: book.author,
          coverUrl:   book.cover_image_url,
          category:   category,
          isFavorite: h.is_favorite === true
        });
      }
    }

    return { quotes, discardedIds, report };
  }

  async tagQuoteAsDiscard(highlightId) {
    const url = `${this.baseUrl}/highlights/${highlightId}/tags/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: 'discard' })
    });
    if (response.ok) {
      try {
        const data = await response.json();
        return { ok: true, tagId: data?.id || null };
      } catch {
        return { ok: true, tagId: null };
      }
    }
    // 400=tag duplicato, 404=non trovata, 409=conflitto → tutti soft-ok
    if ([400, 404, 409].includes(response.status)) {
      return { ok: true, tagId: null };
    }
    throw new Error(`Errore API Readwise (HTTP ${response.status}): tagging fallito.`);
  }

  async removeDiscardTag(highlightId, tagId = null) {
    let targetTagId = tagId;
    if (!targetTagId) {
      const tagsUrl = `${this.baseUrl}/highlights/${highlightId}/tags/`;
      const getRes = await fetch(tagsUrl, { headers: this.getHeaders() });
      if (getRes.ok) {
        const tags = await getRes.json();
        const list = Array.isArray(tags) ? tags : (tags.results || []);
        const discardTag = list.find(t => t.name === 'discard');
        if (discardTag) targetTagId = discardTag.id;
      }
    }

    if (targetTagId) {
      const deleteUrl = `${this.baseUrl}/highlights/${highlightId}/tags/${targetTagId}/`;
      const delRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (delRes.ok || delRes.status === 204 || delRes.status === 404) {
        return { ok: true };
      }
      throw new Error(`Errore rimozione tag (HTTP ${delRes.status})`);
    }
    return { ok: true };
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

  /**
   * Creates a new highlight on Readwise from selected web text.
   * @param {Object} params
   * @param {string} params.text - The highlighted text
   * @param {string} params.title - Page title (source name)
   * @param {string} params.sourceUrl - Full URL of the page
   */
  async createHighlight({ text, title, sourceUrl }) {
    const url = `${this.baseUrl}/highlights/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        highlights: [{
          text,
          title,
          source_url: sourceUrl,
          source_type: 'article'
        }]
      })
    });
    if (!response.ok) {
      throw new Error(`Errore API Readwise (HTTP ${response.status}): salvataggio highlight fallito.`);
    }
    return response.json();
  }
}

