const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  URL,
  DLPUtils: {query: () => null, queryAll: () => [], toText: value => String(value ?? '')}
});
vm.runInContext(fs.readFileSync(path.join(root, 'docs/js/utils.js'), 'utf8'), context);
vm.runInContext('this.computeMostHitsForTest = computeMostHits;', context);

const rows = [
  {Destination: 'one@gmail.com', 'File Name': 'PO_2026.pdf; ALPO-notes.docx', Details: 'Salary salary export'},
  {Destination: 'https://mail.gmail.com/inbox', 'File Name': 'PO-final.pdf', Details: 'Monthly salary report'},
  {Destination: 'two@example.com', 'File Name': 'ALPO.pdf', Details: 'The salary details'},
  {Destination: 'two@gmail.com', 'File Name': 'PO (signed).pdf', Details: 'Unrelated notice'}
];

const hits = context.computeMostHitsForTest(rows);
assert.deepEqual(JSON.parse(JSON.stringify(hits.domain)), {value: 'gmail.com', count: 3});
assert.deepEqual(JSON.parse(JSON.stringify(hits.filename)), {value: 'PO', extension: 'PDF', count: 3});
assert.deepEqual(JSON.parse(JSON.stringify(hits.detail)), {value: 'salary', count: 3});

const filtered = context.computeMostHitsForTest(rows.slice(2));
assert.equal(filtered.domain.value, 'example.com', 'the result must be computed from only the supplied filtered rows');
assert.equal(filtered.filename.count, 1, 'ALPO must not count as the whole token PO');
console.log('Most Hits tests passed.');
