/**
 * Background Service Worker
 * Manages the daily automatic incremental sync via chrome.alarms.
 *
 * Uses importScripts to share StorageManager and ReadwiseManager
 * with the newtab context — no code duplication.
 */
importScripts('storage-manager.js', 'readwise-manager.js');

const ALARM_NAME    = 'readwise-daily-sync';
const SYNC_INTERVAL = 24 * 60; // minutes (1 day)

// ── Alarm Setup ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
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

// ── Alarm Handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[Background] Daily sync triggered');
  await runIncrementalSync();
});

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
