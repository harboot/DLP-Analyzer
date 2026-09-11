const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'dlp-utils.js'), 'utf8');
const context = { window: {}, document: {} };
vm.runInNewContext(source, context);

const { findMissingColumns, showUploadWarning } = context.window.DLPUtils;

function createElement(tagName) {
  return {
    tagName,
    children: [],
    textContent: '',
    attributes: {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners ||= {}; this.listeners[name] = listener; }
  };
}

test('findMissingColumns compares trimmed headers without case sensitivity', () => {
  const rows = [{ ' ID ': '1', source: 'alice' }];
  assert.deepEqual(Array.from(findMissingColumns(rows, ['ID', 'Source', 'Channel'])), ['Channel']);
});

test('findMissingColumns reads parser header metadata for an empty file', () => {
  const rows = [];
  Object.defineProperty(rows, 'headers', { value: ['ID', 'Channel'] });
  assert.deepEqual(Array.from(findMissingColumns(rows, ['ID', 'Source', 'Channel'])), ['Source']);
});

test('showUploadWarning lists missing columns without file names', () => {
  context.document.createElement = createElement;
  const warning = createElement('div');

  showUploadWarning(warning, [
    { fileName: 'Custom Policy Daily.csv', missing: ['Status'] },
    { fileName: 'Other.csv', missing: ['Status', 'Channel'] }
  ]);

  assert.equal(warning.hidden, false);
  assert.equal(warning.children[0].textContent, 'Missing expected columns: ');
  assert.equal(warning.children[1].tagName, 'code');
  assert.equal(warning.children[1].textContent, 'Status, Channel');
  assert.equal(warning.children[2].attributes['aria-label'], 'Close missing-column warning');
  warning.children[2].listeners.click();
  assert.equal(warning.hidden, true);
  assert.doesNotMatch(warning.children.map(child => child.textContent).join(''), /Custom Policy Daily|Other\.csv/);
});

test('every tool page links to its English guide', () => {
  const links = {
    'AlertAnalyzer.html': 'guides/AlertAnalyzerGuide.html',
    'PolicyTuningAdvisor.html': 'guides/PolicyTuningAdvisorGuide.html',
    'CardManager.html': 'guides/RiskScoringGuide.html',
    'RuleIdentifier.html': 'guides/RuleIdentifierGuide.html',
    'PolicyViewer.html': 'guides/PolicyViewerGuide.html',
    'DocViewer.html': 'guides/DocViewerGuide.html',
    'KeywordGenerator.html': 'guides/KeywordGeneratorGuide.html'
  };
  for (const [page, guide] of Object.entries(links)) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', page), 'utf8');
    assert.match(html, new RegExp(`href=["']${guide.replace('.', '\\.')}["']`));
    assert.match(html, /<header class="page-header split-header">/);
    assert.match(html, /<div class="page-intro">/);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'docs', guide)), true);
  }
});
