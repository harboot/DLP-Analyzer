const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'worker', 'DataIngest.worker.js'), 'utf8');

function csvFile(name, chunks, delay = 0) {
  const encoded = chunks.map(chunk => new TextEncoder().encode(chunk));
  return {
    name, type: 'text/csv', size: encoded.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    stream() {
      return new ReadableStream({
        async pull(controller) {
          if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          const chunk = encoded.shift();
          if (chunk) controller.enqueue(chunk); else controller.close();
        }
      });
    }
  };
}

async function run(files, options = {}) {
  const messages = [];
  let finish;
  const complete = new Promise(resolve => { finish = resolve; });
  const self = { postMessage(message) { messages.push(message); if (['complete', 'error', 'cancelled'].includes(message.type)) finish(); } };
  const context = vm.createContext({ self, Blob, TextDecoder, TextDecoderStream, Date, Set, Map, console, importScripts() {} });
  vm.runInContext(source, context);
  const processing = self.onmessage({ data: { type: 'ingest', files, normalizeAlerts: options.normalizeAlerts, batchSize: options.batchSize } });
  if (options.cancel) setTimeout(() => self.onmessage({ data: { type: 'cancel' } }), options.cancel);
  await Promise.all([processing, complete]);
  return messages;
}

function rows(messages) { return messages.filter(message => message.type === 'batch').flatMap(message => message.rows); }

test('streaming parser preserves quoted newlines, escaped quotes, BOM, and split CRLF', async () => {
  const messages = await run([csvFile('alerts.csv', ['\uFEFFName,Details\r', '\nAlice,"line 1\nline "', '"2"""\r', '\nBob,done'])]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows(messages))), [
    { Name: 'Alice', Details: 'line 1\nline "2"' },
    { Name: 'Bob', Details: 'done' }
  ]);
  const complete = messages.at(-1);
  assert.equal(complete.processedBytes, complete.totalBytes);
  assert.equal(complete.rowCount, 2);
});

test('parser automatically detects semicolon-delimited files', async () => {
  const messages = await run([csvFile('alerts.csv', ['Name;Details\r', '\nAlice;"first; second"\r\nBob;done'])]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows(messages))), [
    { Name: 'Alice', Details: 'first; second' },
    { Name: 'Bob', Details: 'done' }
  ]);
});

test('parser keeps comma as the default when delimiter detection is tied', async () => {
  const messages = await run([csvFile('alerts.csv', ['Name,Details;Notes\nAlice,done;today'])]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows(messages))), [
    { Name: 'Alice', 'Details;Notes': 'done;today' }
  ]);
});

test('empty and duplicate headers receive stable names', async () => {
  const messages = await run([csvFile('headers.csv', [',Name,Name\n1,A,B'])]);
  assert.deepEqual(Array.from(messages.find(message => message.type === 'headers').headers), ['Column 1', 'Name', 'Name (2)']);
  assert.deepEqual(JSON.parse(JSON.stringify(rows(messages)[0])), { 'Column 1': '1', Name: 'A', 'Name (2)': 'B' });
});

test('multiple files stream batches without combining intermediate arrays', async () => {
  const messages = await run([csvFile('one.csv', ['ID\n1\n2']), csvFile('two.csv', ['ID\n3'])]);
  assert.deepEqual(rows(messages).map(row => row.ID), ['1', '2', '3']);
  assert.equal(messages.filter(message => message.type === 'file-complete').length, 2);
  assert.equal(messages.at(-1).rowCount, 3);
});

test('unsupported alert file formats are rejected', async () => {
  const messages = await run([{ name: 'alerts.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 0 }]);
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(messages.at(-1).message, 'Only CSV files are supported.');
});

test('alert records are normalized once in the ingestion worker', async () => {
  const messages = await run([csvFile('alerts.csv', [' Incident Time ,Source,Destination,File Name,Action,Channel\n26 Aug. 2025, User@Example.com ,a@sub.example.com; b@example.com,"report.pdf; logo.png",Block,Email'])], { normalizeAlerts: true });
  const row = rows(messages)[0];
  assert.equal(row.sourceLower, 'user@example.com');
  assert.deepEqual(Array.from(row.destinationDomains), ['example.com']);
  assert.deepEqual(Array.from(row.fileTokens), ['report.pdf']);
  assert.equal(row.actionLower, 'block');
  assert.equal(row.channelLower, 'email');
  assert.equal(row.IncidentTime, '26 Aug. 2025');
});

test('cancel message stops a streaming parse between chunks', async () => {
  const file = csvFile('large.csv', ['ID\n1\n', '2\n', '3\n'], 15);
  const messages = await run([file], { cancel: 5 });
  assert.equal(messages.at(-1).type, 'cancelled');
  assert.equal(messages.some(message => message.type === 'complete'), false);
});
