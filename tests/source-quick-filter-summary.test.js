const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');

test('quick filter tabs display their current alert count', () => {
  assert.match(uiSource, /t\.closable \? `\$\{t\.label\} \(\$\{t\.rows\.length\}\)` : t\.label/);
});

test('source quick filters render three top-five summaries from filtered rows', () => {
  assert.match(uiSource, /tab\.filter\?\.col === 'Source'/);
  assert.match(uiSource, /applyFiltersAndSort\(tab\.rows, getTabState\(tab\.key\)\.filters, null\)/);
  assert.match(uiSource, /'Top 5 Destinations'/);
  assert.match(uiSource, /'Top 5 File Names'/);
  assert.match(uiSource, /'Top 5 Details'/);
  assert.match(uiSource, /freqMapTokens\(filteredRows, fileTokensForRow\)/);
  assert.match(uiSource, /slice\(0, 5\)/);
  assert.match(uiSource, /mostHit: \{label: 'Domain'/);
  assert.match(uiSource, /mostHit: \{label: 'Filename'/);
  assert.match(uiSource, /mostHit: \{label: 'Detail'/);
  assert.match(uiSource, /heading\.textContent = `Most Hits \$\{label\}:`/);
  assert.doesNotMatch(uiSource, /heading\.textContent = 'Most Hits'/);
  assert.doesNotMatch(uiSource, /mostHits\.className = 'most-hits'/);
});
