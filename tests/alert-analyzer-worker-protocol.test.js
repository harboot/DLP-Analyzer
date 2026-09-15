const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const messages = [];
  const waiters = [];
  const self = {
    postMessage(message) {
      messages.push(message);
      for (const wake of waiters.splice(0)) wake();
    }
  };
  const context = vm.createContext({self, console, setTimeout, clearTimeout, DOMException, Uint32Array, Map, Set, RegExp, Date, Array, Object, String, Number, Boolean, Math, JSON, isFinite, isNaN, parseInt, parseFloat, encodeURI, decodeURI, encodeURIComponent, decodeURIComponent});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/worker/AlertAnalyzer.worker.js'), 'utf8'), context);
  async function send(data) { await self.onmessage({data}); }
  async function until(predicate) {
    for (;;) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise(resolve => waiters.push(resolve));
    }
  }
  return {messages, send, until, self};
}

const rows = count => Array.from({length: count}, (_, index) => ({
  source: 'user@example.com', sourceLower: 'user@example.com',
  destinations: ['user+copy@example.com'], destinationDomains: [index % 2 ? 'example.com' : 'gmail.com'],
  fileTokens: [`report_${index}.pdf`], incidentHour: 2, actionLower: 'allow', channelLower: 'email',
  text: {Details: index === 0 ? 'secret export' : '', 'File Name': `report_${index}.pdf`}
}));

const rules = [
  {key: 'early', operator: 'hour-range', start: 0, end: 5},
  {key: 'secret', operator: 'text-regex', fields: ['Details'], pattern: 'secret', flags: 'i'}
];

test('persistent protocol reports progress and ordered typed indices, including multi-rule matches', async () => {
  const h = harness();
  await h.send({type: 'initialize', requestId: 1, datasetVersion: 'a', rows: rows(1001)});
  await h.send({type: 'analyze', analysisType: 'rules', requestId: 2, datasetVersion: 'a', rules});
  const progress = h.messages.filter(message => message.type === 'progress');
  assert.ok(progress.length >= 2);
  assert.ok(progress.every(message => message.requestId === 2 && message.datasetVersion === 'a'));
  const complete = h.messages.find(message => message.type === 'complete');
  assert.ok(complete.result.early instanceof Uint32Array);
  assert.deepEqual(Array.from(complete.result.secret), [0]);
  assert.equal(complete.result.early[0], 0);
  assert.equal(complete.result.early.at(-1), 1000);
});

test('protocol returns errors with correlation metadata', async () => {
  const h = harness();
  await h.send({type: 'initialize', requestId: 1, datasetVersion: 'a', rows: rows(1)});
  await h.send({type: 'analyze', analysisType: 'rules', requestId: 9, datasetVersion: 'old', rules});
  const error = h.messages.at(-1);
  assert.equal(error.type, 'error');
  assert.equal(error.requestId, 9);
  assert.equal(error.datasetVersion, 'old');
});

test('cancel interrupts chunked analysis', async () => {
  const h = harness();
  await h.send({type: 'initialize', requestId: 1, datasetVersion: 'a', rows: rows(3000)});
  const running = h.send({type: 'analyze', analysisType: 'rules', requestId: 2, datasetVersion: 'a', rules});
  await h.until(message => message.type === 'progress' && message.requestId === 2);
  await h.send({type: 'cancel', requestId: 2, datasetVersion: 'a'});
  await running;
  assert.ok(h.messages.some(message => message.type === 'cancelled' && message.requestId === 2));
  assert.ok(!h.messages.some(message => message.type === 'complete' && message.requestId === 2));
});

test('dataset replacement invalidates an analysis from the previous version', async () => {
  const h = harness();
  await h.send({type: 'initialize', requestId: 1, datasetVersion: 'a', rows: rows(3000)});
  const running = h.send({type: 'analyze', analysisType: 'rules', requestId: 2, datasetVersion: 'a', rules});
  await h.until(message => message.type === 'progress' && message.requestId === 2);
  await h.send({type: 'initialize', requestId: 3, datasetVersion: 'b', rows: rows(1)});
  await running;
  assert.ok(h.messages.some(message => message.type === 'cancelled' && message.requestId === 2 && message.datasetVersion === 'a'));
  assert.ok(h.messages.some(message => message.type === 'ready' && message.requestId === 3 && message.datasetVersion === 'b'));
});
