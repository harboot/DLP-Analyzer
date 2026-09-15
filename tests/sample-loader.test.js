const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const docsRoot = path.join(__dirname, '..', 'docs');
const loaderSource = fs.readFileSync(path.join(docsRoot, 'js/sample-loader.js'), 'utf8');
const sampleFiles = fs.readdirSync(path.join(docsRoot, 'sample'))
  .filter(file => ['.csv', '.json', '.txt'].includes(path.extname(file)));

function loadInContext(protocol, fetch) {
  const context = { window: {}, location: { protocol }, fetch };
  vm.runInNewContext(loaderSource, context);
  return context.window.loadSample;
}

test('file protocol loads every CSV, JSON, and TXT sample without fetch', async () => {
  const loadSample = loadInContext('file:', () => {
    throw new Error('fetch must not be used for local samples');
  });

  for (const file of sampleFiles) {
    const expected = fs.readFileSync(path.join(docsRoot, 'sample', file), 'utf8');
    assert.equal(await loadSample(`./sample/${file}?ignored=1`), expected);
  }
});

test('HTTP and HTTPS preserve relative fetch behavior', async () => {
  for (const protocol of ['http:', 'https:']) {
    const requested = [];
    const loadSample = loadInContext(protocol, async request => {
      requested.push(request);
      return { ok: true, text: async () => 'fetched sample' };
    });

    assert.equal(await loadSample('sample/alerts.csv'), 'fetched sample');
    assert.deepEqual(requested, ['sample/alerts.csv']);
  }
});

test('HTTP errors and unavailable local samples are reported', async () => {
  const httpLoader = loadInContext('https:', async () => ({ ok: false, status: 404 }));
  await assert.rejects(httpLoader('sample/missing.csv'), /HTTP 404 for sample\/missing\.csv/);

  const fileLoader = loadInContext('file:');
  await assert.rejects(fileLoader('sample/missing.csv'), /Local sample is unavailable/);
});

test('every Load sample implementation uses the shared loader', () => {
  const featureFiles = [
    'AlertAnalyzer.html',
    'CardManager.html',
    'KeywordGenerator.html',
    'PolicyTuningAdvisor.html',
    'PolicyViewer.html',
    'RuleIdentifier.html',
    'js/csv.js',
    'js/policy-tuning-ui.js'
  ];
  const combinedSource = featureFiles
    .map(file => fs.readFileSync(path.join(docsRoot, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(combinedSource, /fetch\s*\(\s*['"](?:\.\/)?sample\//);
  assert.match(combinedSource, /loadSample\(['"]sample\/alerts\.csv['"]\)/);

  for (const page of featureFiles.filter(file => file.endsWith('.html'))) {
    assert.match(
      fs.readFileSync(path.join(docsRoot, page), 'utf8'),
      /<script src="js\/sample-loader\.js"><\/script>/
    );
  }
});
