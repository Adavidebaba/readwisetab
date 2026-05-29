# Readwise New Tab Quotes

Una splendida estensione per Google Chrome (Manifest V3) che sostituisce la pagina del "Nuovo Tab" mostrando una citazione casuale estratta dalla tua libreria di **Readwise**. Progettata con un design premium scuro, un'architettura modulare ad oggetti (OOP) e un sistema di caching ad alte prestazioni.

---

## 🌟 Caratteristiche Principali

- **Caricamento Istantaneo:** Le citazioni vengono scaricate periodicamente in blocco e salvate in cache locale (`chrome.storage.local`). L'apertura di una nuova scheda è immediata e non richiede attese di rete.
- **Sincronizzazione della Chiave API:** Grazie all'uso di `chrome.storage.sync`, il tuo token personale di Readwise si sincronizza automaticamente tra tutti i dispositivi connessi allo stesso account Google.
- **Estetica Premium:** Tema scuro profondo, sfondo animato con sfere sfocate fluttuanti e un layout di scheda con effetto *glassmorphism* (vetro satinato).
- **Copertine dei Libri:** Mostra la copertina originale del libro associato. Se non è disponibile, genera automaticamente un elegante segnaposto testuale.
- **Gestione dei Discard:** Un pulsante dedicato ti permette di contrassegnare una citazione con il tag `"discard"` su Readwise (`POST` all'API) per escluderla dalle rotazioni future, senza eliminarla in modo distruttivo.
- **Scrolling Intelligente:** Supporto nativo per citazioni molto lunghe grazie a un contenitore scorrevole con una barra di navigazione ultrasottile ed elegante.

---

## 🛠️ Architettura del Codice

L'estensione è strutturata seguendo i principi **Single Responsibility (SRP)** e i pattern **MVVM / Coordinator**:

* **`StorageManager`:** Regola la persistenza dei dati. Usa `storage.sync` per le impostazioni comuni (API Key) e `storage.local` per la cache pesante delle citazioni.
* **`ReadwiseManager`:** Gestisce il networking e la comunicazione asincrona con l'API V2 di Readwise (gestione del caricamento paginato e del tagging dei discard).
* **`QuoteViewModel`:** Gestisce lo stato e la logica della citazione attiva, compresa la selezione casuale senza ripetizioni repentine.
* **`NewTabCoordinator`:** Collega gli elementi grafici del DOM alla logica di business, gestendo gli eventi d'interazione e le transizioni animate di dissolvenza.

---

## 🚀 Istruzioni per l'Installazione (Modalità Sviluppatore)

Se desideri installare manualmente l'estensione su tutti i tuoi dispositivi, segui questi semplici passaggi:

### Passaggio 1: Scarica il codice
Su ciascun computer in cui vuoi installare l'estensione, clona questo repository GitHub nella tua cartella locale:
```bash
git clone https://github.com/Adavidebaba/readwisetab.git
```
*(In alternativa, puoi scaricare il file ZIP del progetto da GitHub ed estrarlo in una cartella).*

### Passaggio 2: Abilita la Modalità Sviluppatore in Chrome
1. Apri Google Chrome e digita nella barra degli indirizzi: `chrome://extensions/`
2. In alto a destra, attiva l'interruttore **"Modalità sviluppatore"**.

### Passaggio 3: Carica l'estensione
1. In alto a sinistra, fai clic sul pulsante **"Carica estensione non pacchettizzata"** (Load unpacked).
2. Seleziona la cartella `readwisetab` che hai scaricato o clonato al Passaggio 1 (la cartella contenente il file `manifest.json`).

### Passaggio 4: Collega Readwise
1. Apri una nuova scheda (Nuovo Tab) in Chrome.
2. L'estensione si aprirà mostrando il pannello delle impostazioni.
3. Inserisci il tuo **Token di Accesso Personale** (puoi trovarlo facilmente cliccando sul link integrato o andando direttamente su [readwise.io/access_token](https://readwise.io/access_token)).
4. Clicca su **Salva e Sincronizza**. Le tue citazioni verranno caricate in pochi istanti.

---

## 📝 Changelog & Storico
Puoi consultare tutte le modifiche strutturali, architetturali e i bug risolti nel file dedicato **[CHANGELOG.md](CHANGELOG.md)**.
