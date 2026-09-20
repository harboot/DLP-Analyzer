const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', 'docs');
const workerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

test('the offline cache lists every application file', () => {
  const listed = new Set([...workerSource.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]));
  const manifestContext = {};
  vm.createContext(manifestContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/detectors/index.js'), 'utf8'), manifestContext);
  manifestContext.RiskDetectors.files.forEach(file => listed.add(`js/detectors/${file}`));
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

test('alert ingestion accepts only CSV through the cached worker', () => {
  const page = fs.readFileSync(path.join(root, 'AlertAnalyzer.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'js/csv-utils.js'), 'utf8');
  assert.match(page, /accept="\.csv,text\/csv"/);
  assert.doesNotMatch(page, /xlsx/i);
  assert.match(client, /new Worker\('worker\/DataIngest\.worker\.js'\)/);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'xlsx.full.min.js')), false);
  assert.match(workerSource, /'\.\/worker\/DataIngest\.worker\.js'/);
  assert.doesNotMatch(workerSource, /xlsx\.full/);
});

test('alert uploads show a file count and retain per-file row details in the load log', () => {
  const page = fs.readFileSync(path.join(root, 'AlertAnalyzer.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'js/csv.js'), 'utf8');
  assert.match(page, /<summary>Load log<\/summary>/);
  assert.match(client, /OK: \$\{fileName\} \(\$\{message\.rowCount\} rows\)/);
  assert.match(client, /currentFilename = `\$\{files\.length\} alert file/);
  assert.doesNotMatch(client, /currentFilename = Array\.from\(files\)\.map/);
});

test('alert overview omits retired risk cards', () => {
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  assert.match(ui, /new Set\(\['noext', 'outofhours', 'weirdtld', 'sensitive'\]\)/);
  assert.match(ui, /loadedRules\.filter\(rule => !hiddenOverviewRules\.has\(rule\.key\)\)/);
});

test('Document Viewer retains XLSX detection and text extraction without the XLSX library', () => {
  const source = fs.readFileSync(path.join(root, 'js/doc-viewer.js'), 'utf8');
  assert.equal(source.includes("name.startsWith('xl/'))) return 'XLSX'"), true);
  assert.equal(source.includes("type === 'XLSX'"), true);
  assert.equal(source.includes("name === 'xl/sharedStrings.xml'"), true);
  assert.equal(source.includes('xl\\/worksheets\\/sheet'), true);
});

test('Document Viewer separates text stored in adjacent Office XML elements', () => {
  const source = fs.readFileSync(path.join(root, 'js/doc-viewer.js'), 'utf8');
  assert.match(source, /querySelectorAll\('w\\\\:t, a\\\\:t, t'\)/);
  assert.match(source, /node\.after\(doc\.createTextNode\(' '\)\)/);
  assert.match(source, /!\/\\s\$\/\.test\(node\.textContent\)/);
  assert.match(source, /!\/\^\\s\/\.test\(next\.textContent\)/);
});

test('CSV ingestion is incremental and rejects unsupported formats', () => {
  const source = fs.readFileSync(path.join(root, 'worker/DataIngest.worker.js'), 'utf8');
  assert.match(source, /TextDecoderStream/);
  assert.match(source, /file\.slice\(o,o\+CHUNK_SIZE\)/);
  assert.match(source, /Only CSV files are supported\./);
  assert.doesNotMatch(source, /XLSX\.read/);
});
