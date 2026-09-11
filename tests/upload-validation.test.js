const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'dlp-utils.js'), 'utf8');
const context = { window: {}, document: {} };
vm.runInNewContext(source, context);

const { findMissingColumns } = context.window.DLPUtils;

test('findMissingColumns compares trimmed headers without case sensitivity', () => {
  const rows = [{ ' ID ': '1', source: 'alice' }];
  assert.deepEqual(Array.from(findMissingColumns(rows, ['ID', 'Source', 'Channel'])), ['Channel']);
});

test('findMissingColumns reads parser header metadata for an empty file', () => {
  const rows = [];
  Object.defineProperty(rows, 'headers', { value: ['ID', 'Channel'] });
  assert.deepEqual(Array.from(findMissingColumns(rows, ['ID', 'Source', 'Channel'])), ['Source']);
});

test('every tool page links to its English guide', () => {
  const links = {
    'AlertAnalyzer.html': 'guides/AlertAnalyzerGuide.html',
    'CardManager.html': 'guides/RiskScoringGuide.html',
    'RuleIdentifier.html': 'guides/RuleIdentifierGuide.html',
    'PolicyViewer.html': 'guides/PolicyViewerGuide.html',
    'DocViewer.html': 'guides/DocViewerGuide.html',
    'KeywordGenerator.html': 'guides/KeywordGeneratorGuide.html'
  };
  for (const [page, guide] of Object.entries(links)) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', page), 'utf8');
    assert.match(html, new RegExp(`href=["']${guide.replace('.', '\\.')}["']`));
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'docs', guide)), true);
  }
});
