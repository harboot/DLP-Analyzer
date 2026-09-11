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
  setIgnoredValues({ sources: ['src-rep*'], destinations: ['*.example.com'] });

  assert.equal(isIgnoredAlert({ Source: 'SRC-REP-01', Destination: 'external.test' }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'first.test; MAIL.EXAMPLE.COM' }), true);
  assert.equal(isIgnoredAlert({ Source: 'employee', Destination: 'external.test' }), false);
});
