# CHANGELOG

## [1.0.0] - 2026-05-29

### Aggiunto
- Versione iniziale dell'estensione Chrome **Readwise New Tab Quotes** (Manifest V3).

### Logica Architetturale (Importante per sviluppi futuri)
- **New Tab Override:** La pagina di avvio è registrata tramite `chrome_url_overrides` nel file `manifest.json`.
- **Prestazioni e Caching (OOP):**
  - Le citazioni sono scaricate in blocco da Readwise Export API (con supporto a cursore/paginazione) e salvate localmente in `chrome.storage.local`. Questo garantisce aperture repentine del Nuovo Tab senza latenze di rete.
  - **`chrome.storage.sync`:** Utilizzato esclusivamente per salvare l'**API Key di Readwise**, permettendo a tutti i dispositivi connessi allo stesso account Google di essere subito pronti all'uso senza reinserire la chiave.
- **Logica OOP (MVVM/Coordinator) in `newtab.js`:**
  - `StorageManager`: Accesso alle API `storage.local` (citazioni) e `storage.sync` (API Key).
  - `ReadwiseManager`: Chiamate di rete (export, test del token, tagging).
  - `QuoteViewModel`: Stato della citazione attiva e logica di estrazione casuale.
  - `NewTabCoordinator`: Gestione eventi UI, rendering e transizioni fluide.
- **Meccanismo di Discard:** Il pulsante "Scarta" applica il tag `"discard"` alla citazione su Readwise (`POST /highlights/<id>/tags/`) come soft-delete ufficiale, quindi rimuove la citazione dalla memoria cache locale dell'estensione per escluderla dalle rotazioni.
