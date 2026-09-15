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

test('alert ingestion supports CSV and XLSX through the cached worker', () => {
  const page = fs.readFileSync(path.join(root, 'AlertAnalyzer.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'js/csv-utils.js'), 'utf8');
  assert.match(page, /accept="\.csv,\.xlsx,text\/csv,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
  assert.match(client, /new Worker\('worker\/DataIngest\.worker\.js'\)/);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'xlsx.full.min.js')), true);
  assert.match(workerSource, /'\.\/worker\/DataIngest\.worker\.js'/);
  assert.match(workerSource, /'\.\/lib\/xlsx\.full\.min\.js'/);
});

test('Document Viewer retains XLSX detection and text extraction without the XLSX library', () => {
  const source = fs.readFileSync(path.join(root, 'js/doc-viewer.js'), 'utf8');
  assert.equal(source.includes("name.startsWith('xl/'))) return 'XLSX'"), true);
  assert.equal(source.includes("type === 'XLSX'"), true);
  assert.equal(source.includes("name === 'xl/sharedStrings.xml'"), true);
  assert.equal(source.includes('xl\\/worksheets\\/sheet'), true);
});

test('CSV ingestion is incremental and XLSX warns before whole-workbook parsing', () => {
  const source = fs.readFileSync(path.join(root, 'worker/DataIngest.worker.js'), 'utf8');
  assert.match(source, /TextDecoderStream/);
  assert.match(source, /file\.slice\(o,o\+CHUNK_SIZE\)/);
  assert.match(source, /XLSX processing requires the entire workbook in memory\./);
  assert.match(source, /XLSX\.read\(await file\.arrayBuffer\(\)/);
});
