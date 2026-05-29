# Readwise New Tab Quotes

Un'estensione per Google Chrome (Manifest V3) che sostituisce la pagina **Nuovo Tab** mostrando una citazione casuale dalla tua libreria **Readwise**. Design premium scuro con glassmorphism, architettura modulare OOP e sincronizzazione automatica giornaliera.

---

## 🌟 Caratteristiche

- **Caricamento Istantaneo** — Le citazioni sono salvate in cache locale (`chrome.storage.local`). Nessuna attesa di rete all'apertura del tab.
- **Sync Automatica Giornaliera** — Un service worker in background aggiorna la cache ogni 24 ore via `chrome.alarms`.
- **Sync Incrementale** — Dopo la prima sync completa, le successive scaricano solo le citazioni modificate/nuove (parametro `updatedAfter`), risparmiando traffico e tempo.
- **Sincronizzazione Cross-Device** — Il token API è salvato in `chrome.storage.sync`: si propaga automaticamente su tutti i dispositivi con lo stesso account Google.
- **Pulsante Favorite ⭐** — Aggiunge/rimuove il preferito direttamente su Readwise (`PATCH is_favorite`). I preferiti appaiono **3× più spesso** nella rotazione casuale.
- **Pulsante Discard 🗑️** — Applica il tag `"discard"` su Readwise (`POST /tags/`) ed esclude la citazione dalla cache locale. Non cancella il highlight dalla fonte.
- **Filtro Discard alla Sync** — Le citazioni già taggate come `discard` su Readwise vengono automaticamente escluse durante il download.
- **Font Adattivo** — La dimensione del testo si riduce automaticamente finché la citazione entra nello spazio disponibile, senza scroll.
- **Copertine dei Libri** — Mostra la copertina originale del libro. Se non disponibile, genera un elegante segnaposto con il titolo.
- **Design Premium** — Tema scuro profondo, sfere sfocate animate, glassmorphism, transizioni fluide e tipografia serif per le citazioni.

---

## 🗂️ Architettura

L'estensione è strutturata in file a singola responsabilità (SRP) seguendo il pattern **MVVM / Coordinator**:

| File | Responsabilità |
|---|---|
| `storage-manager.js` | Accesso a `chrome.storage` (lettura, scrittura, merge incrementale) |
| `readwise-manager.js` | Chiamate API Readwise (export paginato, tag, PATCH, test token) |
| `quote-view-model.js` | Stato citazione attiva, selezione pesata, FontScaler |
| `coordinator.js` | Binding DOM ↔ logica, eventi UI, transizioni, sync manuale |
| `background.js` | Service worker: alarm giornaliero + sync incrementale automatica |
| `newtab.js` | Entry point (avvia il Coordinator) |

---

## 🚀 Installazione (Modalità Sviluppatore)

### 1 — Scarica il codice
```bash
git clone https://github.com/Adavidebaba/readwisetab.git
```
*(oppure scarica lo ZIP da GitHub ed estrailo)*

### 2 — Abilita la Modalità Sviluppatore in Chrome
1. Apri `chrome://extensions/`
2. Attiva **"Modalità sviluppatore"** in alto a destra

### 3 — Carica l'estensione
1. Clicca **"Carica estensione non pacchettizzata"**
2. Seleziona la cartella `readwisetab` (quella con `manifest.json`)

### 4 — Collega Readwise
1. Apri un Nuovo Tab — apparirà il pannello impostazioni
2. Inserisci il tuo **Token di Accesso Personale** da [readwise.io/access_token](https://readwise.io/access_token)
3. Clicca **Salva e Sincronizza**

> La prima sincronizzazione scarica tutte le citazioni (può richiedere qualche minuto con librerie grandi).
> Le sincronizzazioni successive (manuali o automatiche) sono incrementali e molto più veloci.

### 5 — Aggiornare l'estensione
Quando viene rilasciata una nuova versione:
```bash
cd readwisetab && git pull
```
Poi vai su `chrome://extensions/` e clicca l'icona 🔄 sull'estensione.

---

## 🔑 Permessi richiesti

| Permesso | Motivo |
|---|---|
| `storage` | Salva citazioni, token API e data ultima sync |
| `alarms` | Esegue la sync automatica ogni 24 ore |
| `https://readwise.io/*` | Chiama le API Readwise |

---

## 📝 Changelog & Storico
Vedi **[CHANGELOG.md](CHANGELOG.md)** per il dettaglio di tutte le versioni.
