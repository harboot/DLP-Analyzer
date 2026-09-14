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
  assert.match(uiSource, /\['Source \| Number', \.\.\.topSources\.map\(\(\[source, count\]\) => `\$\{source\} \| \$\{count\}`\)\]\.join\('\\n'\)/);
});
