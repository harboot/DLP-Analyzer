const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', 'docs');
const workerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

test('the offline cache lists every application file', () => {
  const listed = new Set([...workerSource.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]));
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

test('CSV parser supports quoted commas, escaped quotes, and newlines', async () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/csv-utils.js'), 'utf8'), context);
  const rows = await context.window.CSVUtils.parseText('Name,Details\r\nAlice,"one, two"\r\nBob,"line 1\nline ""2"""', { header: true });
  assert.equal(rows[0].Details, 'one, two');
  assert.equal(rows[1].Details, 'line 1\nline "2"');
  assert.deepEqual(Array.from(rows.headers), ['Name', 'Details']);
});
