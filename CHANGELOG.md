# CHANGELOG

## [1.1.0] - 2026-05-29

### Architettura
- Refactoring completo: `newtab.js` monolitico (516 righe) spezzato in moduli a singola responsabilità:
  - `storage-manager.js` — accesso a `chrome.storage`
  - `readwise-manager.js` — tutte le chiamate API Readwise
  - `quote-view-model.js` — stato citazione attiva + `FontScaler`
  - `coordinator.js` — binding DOM, eventi, transizioni, sync manuale
  - `newtab.js` — solo entry point (avvia Coordinator)

### Aggiunto
- **Sync automatica giornaliera** via `chrome.alarms` (ogni 24h, service worker `background.js`)
- **Sync incrementale** con parametro `updatedAfter`: dopo la prima sync completa, le successive scaricano solo citazioni nuove/modificate
- `StorageManager.mergeIncrementalQuotes()`: merge intelligente della cache (aggiunge nuove, aggiorna esistenti, rimuove i nuovi discard)
- **Pulsante Favorite** ⭐: toggling `is_favorite` via `PATCH /highlights/<id>/` con aggiornamento ottimistico dell'UI
- **Selezione pesata**: i preferiti appaiono 3× più spesso (`QuoteViewModel.FAVORITE_WEIGHT = 3`)
- Filtro discard alla sync: le citazioni con tag `discard` vengono escluse durante l'import
- `StorageManager.updateQuote()`: aggiornamento puntuale di una singola citazione in cache
- Stato sync visibile nel pannello impostazioni (data/ora ultima sync, conteggio nuove/rimosse)
- Listener `chrome.storage.onChanged` nel Coordinator: la UI si aggiorna in tempo reale se la sync di background modifica la cache
- Permesso `alarms` aggiunto al manifest

### Corretto
- **Bug critico paginazione**: il campo di paginazione dell'Export API è `nextPageCursor` (non `next`). Prima di questa fix veniva scaricata solo la prima pagina (~500 citazioni invece di ~1700)
- HTTP `400` da Readwise tags API ora trattato come soft-ok (tag già esistente → rimuove comunque dalla cache locale)
- HTTP `404` e `409` già gestiti come soft-ok per il tagging discard

### Logica Architetturale (Note per sviluppi futuri)
- La prima sync usa `updatedAfter=null` (export completo). Il timestamp viene salvato in `chrome.storage.local` (`rw_last_sync`)
- Le sync successive usano `updatedAfter=<ISO8601 di lastSync>`: Readwise restituisce solo i highlights modificati dopo quella data
- Il service worker `background.js` usa `importScripts('storage-manager.js', 'readwise-manager.js')` per condividere le classi senza duplicare codice
- La selezione pesata costruisce una pool in cui ogni preferito compare `FAVORITE_WEIGHT` volte; la selezione rimane genuinamente casuale all'interno della pool

---

## [1.0.0] - 2026-05-29

### Aggiunto
- Versione iniziale dell'estensione Chrome (Manifest V3)
- Design premium dark: glassmorphism, blob animati, tipografia serif, font adattivo (`FontScaler`)
- Paginazione Export API Readwise con cursore
- Cache locale citazioni in `chrome.storage.local`
- Token API sincronizzato via `chrome.storage.sync` (cross-device)
- Pulsante Discard: tag `"discard"` via `POST /highlights/<id>/tags/` + rimozione dalla cache
- Layout a griglia con copertina libro a sinistra, citazione + meta + controlli a destra
- Modal impostazioni glassmorphic
- README con guida installazione
