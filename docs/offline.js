(() => {
  'use strict';

  /* Enhance every title in the application with one consistent, viewport-safe tooltip. */
  const titleCache = new WeakMap();
  let activeTarget = null;
  let tooltip = null;

  function tooltipText(target) {
    const title = target?.getAttribute?.('title');
    if (title) titleCache.set(target, title);
    return title || titleCache.get(target) || '';
  }

  function positionTooltip(clientX, clientY, target) {
    const gap = 10;
    const margin = 8;
    const rect = tooltip.getBoundingClientRect();
    const anchor = target.getBoundingClientRect();
    let left = Number.isFinite(clientX) ? clientX + gap : anchor.left;
    let top = Number.isFinite(clientY) ? clientY + gap : anchor.bottom + gap;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (top + rect.height > window.innerHeight - margin) {
      top = (Number.isFinite(clientY) ? clientY : anchor.top) - rect.height - gap;
    }
    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  function showTooltip(target, clientX, clientY) {
    const text = tooltipText(target);
    if (!text) return;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'dlp-global-tooltip';
      tooltip.className = 'dlp-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltip);
    }
    activeTarget = target;
    target.removeAttribute('title');
    target.setAttribute('aria-describedby', tooltip.id);
    tooltip.textContent = text.replace(/; (?=(?:Any|Has Resources|Has Exclude):)/g, '\n');
    tooltip.hidden = false;
    positionTooltip(clientX, clientY, target);
  }

  function hideTooltip(target) {
    if (!target || target !== activeTarget) return;
    const title = titleCache.get(target);
    if (title) target.setAttribute('title', title);
    target.removeAttribute('aria-describedby');
    activeTarget = null;
    if (tooltip) tooltip.hidden = true;
  }

  document.addEventListener('pointerover', event => {
    const target = event.target.closest?.('[title]');
    if (target) showTooltip(target, event.clientX, event.clientY);
  });
  document.addEventListener('pointermove', event => {
    if (activeTarget) positionTooltip(event.clientX, event.clientY, activeTarget);
  });
  document.addEventListener('pointerout', event => {
    if (activeTarget && !activeTarget.contains(event.relatedTarget)) hideTooltip(activeTarget);
  });
  document.addEventListener('focusin', event => {
    const target = event.target.closest?.('[title]');
    if (target) showTooltip(target, NaN, NaN);
  });
  document.addEventListener('focusout', () => hideTooltip(activeTarget));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTooltip(activeTarget);
  });

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  const isTopLevel = window === window.top;
  let panel;
  let progress;
  let detail;
  let versionLabel;
  let registrationPromise;

  function showPreparation() {
    if (!isTopLevel || panel) return;
    panel = document.createElement('div');
    panel.className = 'offline-preparation';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="offline-preparation-card">
        <h1>Preparing DLP Analyzer for offline use</h1>
        <p class="offline-preparation-version">Version: checking…</p>
        <p>Application files are being saved on this device.</p>
        <progress value="0" max="1" aria-label="Offline preparation progress"></progress>
        <p class="offline-preparation-detail">Starting…</p>
      </div>`;
    document.body.append(panel);
    progress = panel.querySelector('progress');
    detail = panel.querySelector('.offline-preparation-detail');
    versionLabel = panel.querySelector('.offline-preparation-version');
  }

  function updatePreparation(completed, total, file, version) {
    showPreparation();
    if (!panel) return;
    if (version) versionLabel.textContent = `Version: ${version}`;
    progress.max = Math.max(total, 1);
    progress.value = completed;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    detail.textContent = file
      ? `${percent}% — Saved: ${file}`
      : `${percent}%`;
  }

  function finishPreparation(version) {
    if (!panel) return;
    if (version) versionLabel.textContent = `Version: ${version}`;
    progress.value = progress.max;
    detail.textContent = 'Offline preparation complete.';
    panel.classList.add('is-complete');
    window.setTimeout(() => panel.remove(), 700);
  }

  navigator.serviceWorker.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'OFFLINE_CACHE_PROGRESS') {
      updatePreparation(message.completed, message.total, message.file, message.version);
    } else if (message.type === 'OFFLINE_CACHE_COMPLETE') {
      finishPreparation(message.version);
    } else if (message.type === 'OFFLINE_CACHE_VERSION') {
      if (panel) versionLabel.textContent = `Version: ${message.version}`;
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  const workerUrl = new URL('service-worker.js', document.currentScript.src);
  registrationPromise = navigator.serviceWorker.controller
    ? navigator.serviceWorker.getRegistration(workerUrl)
    : navigator.serviceWorker.register(workerUrl);

  window.DLPOffline = {
    async checkForUpdate() {
      const registration = await registrationPromise;
      if (!registration) throw new Error('Offline service worker is unavailable.');
      const previousWorker = registration.waiting || registration.installing;
      await registration.update();
      return !!(registration.waiting || registration.installing) && (registration.waiting || registration.installing) !== previousWorker;
    }
  };

  registrationPromise.then(registration => {
    if (!registration) return;
    const worker = registration.installing;
    if (!worker) return;
    showPreparation();
    worker.postMessage({ type: 'GET_OFFLINE_CACHE_VERSION' });
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
