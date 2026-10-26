/**
 * SettingsCoordinator — Manages Settings Modal and Readwise Synchronization Flows
 */
class SettingsCoordinator {
  constructor(storageManager, viewModel, onSyncCompleted) {
    this.storage = storageManager;
    this.viewModel = viewModel;
    this.onSyncCompleted = onSyncCompleted;

    this.initializeDOMElements();
    this.bindEventListeners();
  }

  initializeDOMElements() {
    this.settingsToggleBtn    = document.getElementById('settingsToggleBtn');
    this.settingsModal        = document.getElementById('settingsModal');
    this.closeSettingsBtn     = document.getElementById('closeSettingsBtn');
    this.apiKeyInput          = document.getElementById('apiKeyInput');
    this.saveApiKeyBtn        = document.getElementById('saveApiKeyBtn');
    this.fullSyncBtn          = document.getElementById('fullSyncBtn');
    this.syncStatus           = document.getElementById('syncStatus');
    this.syncReportBox        = document.getElementById('syncReportBox');
    this.repDate              = document.getElementById('repDate');
    this.repTotalRaw          = document.getElementById('repTotalRaw');
    this.repDiscarded         = document.getElementById('repDiscarded');
    this.repDeleted           = document.getElementById('repDeleted');
    this.repActive            = document.getElementById('repActive');
    this.syncReportCategories = document.getElementById('syncReportCategories');
    this.syncCatPills         = document.getElementById('syncCatPills');
  }

  bindEventListeners() {
    this.settingsToggleBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click',  () => this.closeSettings());
    this.saveApiKeyBtn.addEventListener('click',     () => this.handleSaveApiKey());
    if (this.fullSyncBtn) {
      this.fullSyncBtn.addEventListener('click', () => this.handleFullSync());
    }
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });
  }

  async openSettings() {
    await this.populateSyncStatus();
    await this.populateSyncReport();
    const existingKey = await this.storage.getApiKey();
    if (existingKey && !this.apiKeyInput.value) {
      this.apiKeyInput.value = existingKey;
    }
    this.settingsModal.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
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

  async populateSyncReport() {
    if (!this.syncReportBox) return;
    const report = await this.storage.getSyncReport();
    if (!report) {
      this.syncReportBox.classList.add('hidden');
      return;
    }

    this.repTotalRaw.textContent  = (report.totalRaw || 0).toLocaleString();
    this.repDiscarded.textContent = (report.discarded || 0).toLocaleString();
    this.repDeleted.textContent   = (report.deleted || 0).toLocaleString();
    this.repActive.textContent    = (report.active || 0).toLocaleString();

    if (report.timestamp) {
      const d = new Date(report.timestamp);
      this.repDate.textContent = `Aggiornato: ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (report.byCategory && Object.keys(report.byCategory).length > 0) {
      this.syncCatPills.innerHTML = '';
      const labels = {
        books:         '📚 Libri',
        articles:      '📄 Articoli',
        tweets:        '🐦 Tweet',
        podcasts:      '🎙️ Podcast',
        supplementals: '📑 Supplemental Books'
      };
      for (const [cat, count] of Object.entries(report.byCategory)) {
        const pill = document.createElement('span');
        pill.className = 'sync-cat-pill';
        pill.textContent = `${labels[cat] || cat}: ${count}`;
        this.syncCatPills.appendChild(pill);
      }
      this.syncReportCategories.classList.remove('hidden');
    } else {
      this.syncReportCategories.classList.add('hidden');
    }

    this.syncReportBox.classList.remove('hidden');
  }

  async handleSaveApiKey() {
    await this.executeSyncFlow(false);
  }

  async handleFullSync() {
    await this.executeSyncFlow(true);
  }

  async executeSyncFlow(forceFullSync = false) {
    const key = this.apiKeyInput.value.trim() || await this.storage.getApiKey();
    if (!key) return alert('Inserisci un token valido.');

    this.saveApiKeyBtn.disabled = true;
    if (this.fullSyncBtn) this.fullSyncBtn.disabled = true;
    this.syncStatus.textContent = 'Verifica connessione...';

    try {
      const mgr = new ReadwiseManager(key);
      const isConnected = await mgr.testConnection();
      if (!isConnected) throw new Error('Token non valido o connessione fallita.');

      await this.storage.setApiKey(key);

      const lastSync = await this.storage.getLastSync();
      const isFullSync = forceFullSync || lastSync === 0;
      const updatedAfter = isFullSync ? null : new Date(lastSync).toISOString();

      this.syncStatus.textContent = isFullSync
        ? 'Sincronizzazione completa (può richiedere qualche minuto)...'
        : 'Aggiornamento incrementale...';

      const books = await mgr.syncAllQuotes(updatedAfter, (count, pages) => {
        this.syncStatus.textContent = `Scaricamento... ${count} citazioni (${pages} pag)`;
      });

      const { quotes: incoming, discardedIds, report } = mgr.extractQuotes(books);

      let finalQuotes;
      if (isFullSync) {
        await this.storage.setQuotes(incoming);
        finalQuotes = incoming;
      } else {
        finalQuotes = await this.storage.mergeIncrementalQuotes(incoming, discardedIds);
      }

      await this.storage.setLastSync(Date.now());
      await this.updateAndSaveSyncReport(report, finalQuotes, isFullSync);

      if (this.onSyncCompleted) {
        this.onSyncCompleted(finalQuotes, mgr);
      }

      const label = isFullSync
        ? `✅ Completato: ${finalQuotes.length} citazioni caricate`
        : `✅ Aggiornato: +${incoming.length} nuove, ${discardedIds.length} rimosse (${finalQuotes.length} totali)`;
      this.syncStatus.textContent = label;
    } catch (err) {
      console.error(err);
      this.syncStatus.textContent = 'Errore!';
      alert(err.message || 'Errore di connessione a Readwise.');
    } finally {
      this.saveApiKeyBtn.disabled = false;
      if (this.fullSyncBtn) this.fullSyncBtn.disabled = false;
    }
  }

  async updateAndSaveSyncReport(report, finalQuotes, isFullSync) {
    if (!report) return;
    let savedReport = report;

    if (!isFullSync) {
      const existing = await this.storage.getSyncReport();
      if (existing) {
        existing.totalRaw = (existing.totalRaw || 0) + (report.totalRaw || 0);
        existing.discarded = (existing.discarded || 0) + (report.discarded || 0);
        existing.deleted = (existing.deleted || 0) + (report.deleted || 0);
        existing.taggedDiscard = (existing.taggedDiscard || 0) + (report.taggedDiscard || 0);
        savedReport = existing;
      }
    }

    savedReport.active = finalQuotes.length;
    savedReport.timestamp = Date.now();

    const categories = {};
    for (const q of finalQuotes) {
      const cat = q.category || 'books';
      categories[cat] = (categories[cat] || 0) + 1;
    }
    savedReport.byCategory = categories;

    await this.storage.setSyncReport(savedReport);
    await this.populateSyncReport();
  }
}
