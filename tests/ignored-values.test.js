const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'utils.js'), 'utf8');
const context = vm.createContext({
  DLPUtils: {
    query: () => null,
    queryAll: () => [],
    toText: value => String(value ?? ''),
    escapeHtml: value => String(value ?? '')
  }
});
vm.runInContext(source, context);
vm.runInContext(`
  this.testApi = {
    matchesIgnoredValue,
    isIgnoredAlert,
    setIgnoredValues(value) { ignoredValues = value; }
  };
`, context);

const { matchesIgnoredValue, isIgnoredAlert, setIgnoredValues } = context.testApi;

test('ignored values still support exact matching', () => {
  assert.equal(matchesIgnoredValue('source@example.com', 'source@example.com'), true);
  assert.equal(matchesIgnoredValue('another-source@example.com', 'source@example.com'), false);
});

test('asterisks match any characters anywhere in an ignored value', () => {
  assert.equal(matchesIgnoredValue('src-rep-01', 'src-rep*'), true);
  assert.equal(matchesIgnoredValue('src-rep', 'src-rep*'), true);
  assert.equal(matchesIgnoredValue('mail.example.com', '*.example.com'), true);
  assert.equal(matchesIgnoredValue('example.net', '*.example.com'), false);
});

test('regular expression characters in ignored values remain literal', () => {
  assert.equal(matchesIgnoredValue('user+tag@example.com', 'user+*@example.com'), true);
  assert.equal(matchesIgnoredValue('user-tag@example.com', 'user+*@example.com'), false);
});

test('source and destination ignore lists apply wildcard patterns without case sensitivity', () => {
  setIgnoredValues({ sources: ['src-rep*'], destinations: ['*.example.com'], filenames: [] });

  assert.equal(isIgnoredAlert({ Source: 'SRC-REP-01', Destination: 'external.test' }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'first.test; MAIL.EXAMPLE.COM' }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'external.test' }), false);
});

test('filename ignore list applies exact and wildcard patterns without case sensitivity', () => {
  setIgnoredValues({ sources: [], destinations: [], filenames: ['temporary-*', 'private.pdf'] });

  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'external.test', 'File Name': 'PRIVATE.PDF' }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'external.test', fileTokens: ['report.pdf', 'Temporary-01.csv'] }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'external.test', 'File Name': 'public.pdf' }), false);
});

test('volume series uses hours for datasets shorter than two days', () => {
  const { getVolumeSeries } = vm.runInContext('({ getVolumeSeries })', context);
  const result = getVolumeSeries([
    { 'Incident Time': '2026-09-10T10:15:00Z' },
    { 'Incident Time': '2026-09-10T10:45:00Z' },
    { 'Incident Time': '2026-09-11T09:00:00Z' }
  ]);

  assert.equal(result.granularity, 'hour');
  assert.deepEqual(Array.from(result.pairs, pair => Array.from(pair)), [
    ['2026-09-10T10:00', 2],
    ['2026-09-11T09:00', 1]
  ]);
});

test('volume series keeps daily buckets for datasets spanning two days or more', () => {
  const { getVolumeSeries } = vm.runInContext('({ getVolumeSeries })', context);
  const result = getVolumeSeries([
    { 'Incident Time': '2026-09-10T10:00:00Z' },
    { 'Incident Time': '2026-09-12T10:00:00Z' }
  ]);

  assert.equal(result.granularity, 'day');
  assert.deepEqual(Array.from(result.pairs, pair => Array.from(pair)), [
    ['2026-09-10', 1],
    ['2026-09-12', 1]
  ]);
});
