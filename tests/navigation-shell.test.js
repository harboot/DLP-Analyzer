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

test('update checks are explicitly available below the tool navigation', () => {
  assert.match(indexSource, /class="menu-separator" role="separator"/);
  assert.match(indexSource, /id="checkUpdate"[^>]*role="menuitem"/);
  assert.match(indexSource, />Check for updates</);
  assert.match(indexSource, /DLPOffline\?\.checkForUpdate\(\)/);
  assert.match(indexSource, /id="updateStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(indexSource, /DLP Analyzer is up to date\./);
});

test('risk scoring rules have labeled, explicitly sized columns', () => {
  const riskScoringSource = fs.readFileSync(path.join(docs, 'CardManager.html'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(docs, 'styles.css'), 'utf8');

  assert.match(riskScoringSource, /<thead>[\s\S]*Detector[\s\S]*Weight[\s\S]*Matches[\s\S]*Actions[\s\S]*<\/thead>/);
  assert.match(riskScoringSource, /<col class="name-column"/);
  assert.match(stylesSource, /#tbl col\.name-column\{width:68%\}/);
  assert.match(stylesSource, /\.layout[\s\S]*?align-items: stretch/);
  assert.match(stylesSource, /\.list\{flex:1;min-height:0;overflow:auto\}/);
  assert.equal((riskScoringSource.match(/class="risk-filter-icon"/g) || []).length, 3);
  assert.match(riskScoringSource, /function openRuleFilter\(button\)/);
  assert.match(riskScoringSource, /data-sort="asc"/);
  assert.match(riskScoringSource, /data-sort="desc"/);
  assert.match(riskScoringSource, /function sortRules\(list\)/);
});
