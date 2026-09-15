const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');

test('top sources summary includes an accessible copy control', () => {
  assert.match(uiSource, /copyButton\.title = 'Copy top sources as a table'/);
  assert.match(uiSource, /copyButton\.setAttribute\('aria-label', 'Copy top sources as a table'\)/);
  assert.match(uiSource, /copyButton\.addEventListener\('click', \(\) => copyTopSources\(topSources, copyButton\)\)/);
});

test('top sources are copied using the requested table layout', () => {
  assert.match(uiSource, /source\.replace\(\/\[\\t\\r\\n\]\+\/g, ' '\)\}\\t\$\{count\}/);
  assert.match(uiSource, /<tr><td>\$\{DLPUtils\.escapeHtml\(source\)\}<\/td><td>\$\{DLPUtils\.escapeHtml\(count\)\}<\/td><\/tr>/);
  assert.doesNotMatch(uiSource, /Source \| Number/);
  assert.match(uiSource, /navigator\.clipboard\.write\(\[item\]\)/);
  assert.match(uiSource, /DLPUtils\.showCopyPreview\(cells\)/);
});
