/**
 * newtab.js — Entry Point
 * All logic lives in the dedicated modules loaded before this script.
 * Load order in newtab.html:
 *   1. storage-manager.js
 *   2. readwise-manager.js
 *   3. quote-view-model.js  (includes FontScaler)
 *   4. coordinator.js
 *   5. newtab.js            ← this file
 */
document.addEventListener('DOMContentLoaded', () => {
  const coordinator = new NewTabCoordinator();
  coordinator.start();
});
