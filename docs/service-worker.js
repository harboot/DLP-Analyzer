'use strict';

// Increment this value whenever any cached application file changes.
const CACHE_VERSION = 'dlp-analyzer-v18';
const APPLICATION_FILES = [
  './AlertAnalyzer.html',
  './CardManager.html',
  './DocViewer.html',
  './KeywordGenerator.html',
  './PolicyTuningAdvisor.html',
  './PolicyViewer.html',
  './RuleIdentifier.html',
  './assets/dlp_analyzer_github_banner.png',
  './guides/AlertAnalyzerGuide.html',
  './guides/DocViewerGuide.html',
  './guides/KeywordGeneratorGuide.html',
  './guides/PolicyTuningAdvisorGuide.html',
  './guides/PolicyViewerGuide.html',
  './guides/RiskScoringGuide.html',
  './guides/RuleIdentifierGuide.html',
  './index.html',
  './js/KG_script.js',
  './js/ai.js',
  './js/csv-utils.js',
  './js/csv.js',
  './js/dlp-utils.js',
  './js/doc-viewer.js',
  './js/policy-tuning-ui.js',
  './js/policy-tuning.js',
  './js/risk-scoring.js',
  './js/rules.js',
  './js/storage.js',
  './js/ui.js',
  './js/utils.js',
  './lib/README.md',
  './lib/xlsx.full.min.js',
  './offline.js',
  './rules/destination-risk.json',
  './rules/filename-risk.json',
  './rules/suspicious-email.json',
  './rules/volume-risk.json',
  './sample/alerts.csv',
  './sample/document.txt',
  './sample/keyword-rules.txt',
  './sample/keywords.txt',
  './sample/policies.csv',
  './sample/policy.json',
  './sample/rule-alerts.csv',
  './service-worker.js',
  './styles.css',
  './worker/AlertAnalyzer.worker.js',
  './worker/RuleIdentifier.worker.js'
];

async function notifyClients(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach(client => client.postMessage(message));
}

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_OFFLINE_CACHE_VERSION') {
    event.source?.postMessage({ type: 'OFFLINE_CACHE_VERSION', version: CACHE_VERSION });
  }
});

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    let completed = 0;
    for (const file of APPLICATION_FILES) {
      const request = new Request(file, { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Unable to cache ${file}: HTTP ${response.status}`);
      await cache.put(request, response);
      completed++;
      await notifyClients({ type: 'OFFLINE_CACHE_PROGRESS', completed, total: APPLICATION_FILES.length, file, version: CACHE_VERSION });
    }
    await notifyClients({ type: 'OFFLINE_CACHE_COMPLETE', version: CACHE_VERSION });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('dlp-analyzer-') && name !== CACHE_VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate' && url.pathname.endsWith('/')) {
      const index = await cache.match('./index.html');
      if (index) return index;
    }
    return fetch(request);
  })());
});
