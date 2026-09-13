const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const docs = path.join(__dirname, '..', 'docs');
const indexSource = fs.readFileSync(path.join(docs, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(docs, 'service-worker.js'), 'utf8');

test('the shell displays its version instead of repeating the active page name', () => {
  const cacheVersion = workerSource.match(/CACHE_VERSION = 'dlp-analyzer-v(\d+)'/)?.[1];
  const displayedVersion = indexSource.match(/class="app-version"[^>]*>v(\d+)</)?.[1];

  assert.ok(cacheVersion, 'the service worker should declare a numeric cache version');
  assert.equal(displayedVersion, cacheVersion);
  assert.doesNotMatch(indexSource, /id="currentTool"/);
});

test('every navigation item has a decorative icon before its label', () => {
  const tabs = [...indexSource.matchAll(/<button class="tab"[\s\S]*?<\/button>/g)].map(match => match[0]);

  assert.equal(tabs.length, 7);
  tabs.forEach(tab => assert.match(tab, /<span class="menu-icon" aria-hidden="true">.+<\/span><span>.+<\/span>/));
});
