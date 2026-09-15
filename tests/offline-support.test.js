const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', 'docs');
const workerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

test('the offline cache lists every application file', () => {
  const listed = new Set([...workerSource.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]));
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(path.relative(root, full).replaceAll(path.sep, '/'));
    }
  }
  visit(root);
  assert.deepEqual(files.filter(file => !listed.has(file)), []);
});

test('the fetch handler only handles same-origin GET requests', () => {
  assert.match(workerSource, /request\.method !== 'GET'/);
  assert.match(workerSource, /url\.origin !== self\.location\.origin/);
});

test('initial caching uses a limited worker pool and retains required-file failures', () => {
  assert.match(workerSource, /const CACHE_CONCURRENCY = 6/);
  assert.match(workerSource, /Math\.min\(CACHE_CONCURRENCY, APPLICATION_FILES\.length\)/);
  assert.match(workerSource, /Promise\.all\(Array\.from\(\{ length: workerCount \}/);
  assert.match(workerSource, /if \(!response\.ok\) throw new Error/);
});

test('offline progress shows only the percentage and current filename', () => {
  const offlineSource = fs.readFileSync(path.join(root, 'offline.js'), 'utf8');
  assert.match(offlineSource, /`\$\{percent\}% — Saved: \$\{file\}`/);
  assert.doesNotMatch(offlineSource, /Saved \$\{completed\} of \$\{total\} files/);
});

test('installed clients only check for updates when requested', () => {
  const offlineSource = fs.readFileSync(path.join(root, 'offline.js'), 'utf8');
  assert.match(offlineSource, /navigator\.serviceWorker\.controller\s*\? navigator\.serviceWorker\.getRegistration/);
  assert.match(offlineSource, /async checkForUpdate\(\)/);
  assert.match(offlineSource, /await registration\.update\(\)/);
});

test('CSV parser rejects non-CSV uploads', async () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/csv-utils.js'), 'utf8'), context);
  await assert.rejects(
    context.window.CSVUtils.parseFile({ name: 'alerts.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: async () => '' }),
    /Only CSV files are supported\./
  );
});

test('alert upload tools expose CSV-only file controls without the XLSX library', () => {
  for (const page of ['AlertAnalyzer.html', 'CardManager.html', 'PolicyTuningAdvisor.html', 'RuleIdentifier.html']) {
    const source = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(source, /xlsx\.full|\.xlsx|spreadsheetml/i);
    assert.match(source, /accept="\.csv,text\/csv"/);
  }
  assert.equal(fs.existsSync(path.join(root, 'lib', 'xlsx.full.min.js')), false);
});

test('Document Viewer retains XLSX detection and text extraction without the XLSX library', () => {
  const source = fs.readFileSync(path.join(root, 'js/doc-viewer.js'), 'utf8');
  assert.equal(source.includes("name.startsWith('xl/'))) return 'XLSX'"), true);
  assert.equal(source.includes("type === 'XLSX'"), true);
  assert.equal(source.includes("name === 'xl/sharedStrings.xml'"), true);
  assert.equal(source.includes('xl\\/worksheets\\/sheet'), true);
});

test('CSV parser supports quoted commas, escaped quotes, and newlines', async () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/csv-utils.js'), 'utf8'), context);
  const rows = await context.window.CSVUtils.parseText('Name,Details\r\nAlice,"one, two"\r\nBob,"line 1\nline ""2"""', { header: true });
  assert.equal(rows[0].Details, 'one, two');
  assert.equal(rows[1].Details, 'line 1\nline "2"');
  assert.deepEqual(Array.from(rows.headers), ['Name', 'Details']);
});
