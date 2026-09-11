(() => {
  'use strict';

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  const isTopLevel = window === window.top;
  let panel;
  let progress;
  let detail;

  function showPreparation() {
    if (!isTopLevel || panel) return;
    panel = document.createElement('div');
    panel.className = 'offline-preparation';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="offline-preparation-card">
        <h1>Preparing DLP Analyzer for offline use</h1>
        <p>Application files are being saved on this device.</p>
        <progress value="0" max="1" aria-label="Offline preparation progress"></progress>
        <p class="offline-preparation-detail">Starting…</p>
      </div>`;
    document.body.append(panel);
    progress = panel.querySelector('progress');
    detail = panel.querySelector('.offline-preparation-detail');
  }

  function updatePreparation(completed, total, file) {
    showPreparation();
    if (!panel) return;
    progress.max = Math.max(total, 1);
    progress.value = completed;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    detail.textContent = file
      ? `${percent}% — Saved ${completed} of ${total} files: ${file}`
      : `${percent}% — Saved ${completed} of ${total} files.`;
  }

  function finishPreparation() {
    if (!panel) return;
    progress.value = progress.max;
    detail.textContent = 'Offline preparation complete.';
    panel.classList.add('is-complete');
    window.setTimeout(() => panel.remove(), 700);
  }

  navigator.serviceWorker.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'OFFLINE_CACHE_PROGRESS') {
      updatePreparation(message.completed, message.total, message.file);
    } else if (message.type === 'OFFLINE_CACHE_COMPLETE') {
      finishPreparation();
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  const workerUrl = new URL('service-worker.js', document.currentScript.src);
  navigator.serviceWorker.register(workerUrl).then(registration => {
    const worker = registration.installing;
    if (!worker) return;
    showPreparation();
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'redundant' || !panel) return;
      detail.textContent = 'Offline preparation failed. Reload while online to try again.';
      progress.removeAttribute('value');
    });
  }).catch(error => {
    console.warn('Offline support could not be enabled.', error);
    if (panel) panel.remove();
  });
})();
