/**
 * Background Service Worker
 * Manages:
 * - Daily automatic incremental sync via chrome.alarms
 * - Context menu for "Salva su Readwise"
 * - Message handling from content script (saveHighlight)
 *
 * Uses importScripts to share StorageManager and ReadwiseManager
 * with the newtab context — no code duplication.
 */
importScripts('storage-manager.js', 'readwise-manager.js');

const ALARM_NAME    = 'readwise-daily-sync';
const SYNC_INTERVAL = 24 * 60; // minutes (1 day)
const CONTEXT_MENU_ID = 'readwise-save-highlight';

// ── Alarm & Context Menu Setup ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  createContextMenu();
});

function scheduleAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: SYNC_INTERVAL,
        periodInMinutes: SYNC_INTERVAL
      });
      console.log('[Background] Alarm scheduled: every', SYNC_INTERVAL, 'minutes');
    }
  });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: '📌 Salva su Readwise',
      contexts: ['selection']
    });
  });
}

// ── Alarm Handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[Background] Daily sync triggered');
  await runIncrementalSync();
});

// ── Context Menu Handler ──────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  const result = await saveHighlightToReadwise({
    text: selectedText,
    pageUrl: tab.url || '',
    pageTitle: tab.title || ''
  });

  // Invia risultato al content script per mostrare il toast
  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'showHighlightResult',
      success: result.success,
      error: result.error
    });
  } catch {
    // Tab potrebbe non avere il content script (es. chrome:// pages)
  }
});

// ── Message Handler (from content script) ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'saveHighlight') return false;

  saveHighlightToReadwise(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true; // mantiene il canale aperto per risposta asincrona
});

// ── Shared Save Logic ─────────────────────────────────────────────────────────

async function saveHighlightToReadwise({ text, pageUrl, pageTitle }) {
  const storage = new StorageManager();
  const apiKey = await storage.getApiKey();

  if (!apiKey) {
    return { success: false, error: 'Token API non configurato. Apri un nuovo tab per impostarlo.' };
  }

  try {
    const mgr = new ReadwiseManager(apiKey);
    await mgr.createHighlight({
      text,
      title: pageTitle,
      sourceUrl: pageUrl
    });
    console.log('[Background] Highlight saved:', text.substring(0, 60) + '...');
    return { success: true };
  } catch (err) {
    console.error('[Background] Save highlight failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Sync Logic ────────────────────────────────────────────────────────────────

async function runIncrementalSync() {
  const storage = new StorageManager();

  const apiKey = await storage.getApiKey();
  if (!apiKey) {
    console.log('[Background] No API key — skipping sync');
    return;
  }

  const lastSync   = await storage.getLastSync();
  const updatedAfter = lastSync > 0 ? new Date(lastSync).toISOString() : null;

  console.log('[Background] Syncing with updatedAfter:', updatedAfter ?? 'full sync');

  try {
    const mgr  = new ReadwiseManager(apiKey);
    const books = await mgr.syncAllQuotes(updatedAfter);
    const { quotes: incoming, discardedIds } = mgr.extractQuotes(books);

    if (lastSync === 0) {
      await storage.setQuotes(incoming);
    } else {
      await storage.mergeIncrementalQuotes(incoming, discardedIds);
    }

    await storage.setLastSync(Date.now());
    console.log(`[Background] Sync complete — ${incoming.length} updated, ${discardedIds.length} discarded`);
  } catch (err) {
    console.error('[Background] Sync failed:', err.message);
  }
}

