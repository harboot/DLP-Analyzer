const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const uiSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'ui.js'), 'utf8');

function extractFunction(name) {
  const start = uiSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = uiSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < uiSource.length; index += 1) {
    if (uiSource[index] === '{') depth += 1;
    if (uiSource[index] === '}') depth -= 1;
    if (depth === 0) return uiSource.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {
  txt: value => String(value ?? ''),
  parseIncidentTime: value => value ? new Date(value) : null,
  freqMap(rows, key) {
    const counts = new Map();
    for (const row of rows) {
      const value = String(row[key] ?? '').trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  }
};
vm.runInNewContext(`${extractFunction('applyFiltersAndSort')}; this.applyFiltersAndSort = applyFiltersAndSort;`, context);

const rows = [
  { Source: 'Alpha', Scope: 'Keep', 'Incident Time': '2026-01-01T01:00:00Z' },
  { Source: 'Beta', Scope: 'Keep', 'Incident Time': '2026-01-01T02:00:00Z' },
  { Source: 'Alpha', Scope: 'Keep', 'Incident Time': '2026-01-01T03:00:00Z' },
  { Source: 'Gamma', Scope: 'Keep', 'Incident Time': '2026-01-01T04:00:00Z' },
  { Source: 'Alpha', Scope: 'Drop', 'Incident Time': '2026-01-01T05:00:00Z' },
  { Source: 'Beta', Scope: 'Drop', 'Incident Time': '2026-01-01T06:00:00Z' }
];

test('alert table offers frequency sort controls', () => {
  assert.match(uiSource, /data-type="most"/);
  assert.match(uiSource, /data-type="least"/);
  assert.match(uiSource, /aria-label="Sort most frequent first"/);
  assert.match(uiSource, /aria-label="Sort least frequent first"/);
});

test('most and least sorts order rows by the selected value frequency', () => {
  const most = context.applyFiltersAndSort(rows, {}, { col: 'Source', type: 'most' });
  const least = context.applyFiltersAndSort(rows, {}, { col: 'Source', type: 'least' });

  assert.deepEqual(Array.from(most, row => row.Source), ['Alpha', 'Alpha', 'Alpha', 'Beta', 'Beta', 'Gamma']);
  assert.deepEqual(Array.from(least, row => row.Source), ['Gamma', 'Beta', 'Beta', 'Alpha', 'Alpha', 'Alpha']);
});

test('frequency sorting counts only rows that remain after filtering', () => {
  const sorted = context.applyFiltersAndSort(rows, { Scope: 'keep' }, { col: 'Source', type: 'least' });
  assert.deepEqual(Array.from(sorted, row => row.Source), ['Beta', 'Gamma', 'Alpha', 'Alpha']);
});
