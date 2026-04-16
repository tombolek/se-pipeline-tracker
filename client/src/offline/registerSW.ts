/**
 * Service-worker registration + "Update available" toast (Issue #117).
 *
 * With `registerType: 'prompt'` in vite.config.ts the SW does NOT auto-activate
 * on a new deploy. Instead we show a small in-app chip asking the user to
 * reload — this prevents the app from yanking state out from under someone
 * who's actively adding a note or editing a task.
 */
import { registerSW } from 'virtual:pwa-register';

export function initServiceWorker() {
  // Dev mode has devOptions.enabled=false, so this is effectively a no-op
  // there; in production it wires the SW.
  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateChip(() => { void updateSW(true); });
    },
    onOfflineReady() {
      // We don't show a toast for this — the offline capability is
      // always-on by design. Logging only.
      console.info('[pwa] offline cache ready');
    },
  });
}

function showUpdateChip(onAccept: () => void) {
  if (document.getElementById('pwa-update-chip')) return;
  const chip = document.createElement('div');
  chip.id = 'pwa-update-chip';
  chip.style.cssText = `
    position: fixed; right: 20px; bottom: 20px; z-index: 9999;
    background: #6A2CF5; color: white;
    padding: 10px 14px; border-radius: 10px;
    font: 500 13px Poppins, system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(26,12,66,0.25);
    display: flex; align-items: center; gap: 10px;
  `;
  chip.innerHTML = `
    <span>A new version is available</span>
    <button id="pwa-update-chip-btn" style="
      background: white; color: #6A2CF5; border: none;
      padding: 5px 10px; border-radius: 6px; cursor: pointer;
      font: 600 12px Poppins, system-ui, sans-serif;
    ">Reload</button>
    <button id="pwa-update-chip-dismiss" style="
      background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3);
      padding: 5px 8px; border-radius: 6px; cursor: pointer;
      font: 400 12px Poppins, system-ui, sans-serif;
    ">Later</button>
  `;
  document.body.appendChild(chip);
  chip.querySelector('#pwa-update-chip-btn')?.addEventListener('click', onAccept);
  chip.querySelector('#pwa-update-chip-dismiss')?.addEventListener('click', () => chip.remove());
}
