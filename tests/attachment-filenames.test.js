const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const analyzerContext = vm.createContext({
  console,
  DLPUtils: {
    query: () => null,
    queryAll: () => [],
    toText: value => String(value ?? '')
  }
});

vm.runInContext(read('docs/js/utils.js'), analyzerContext);
vm.runInContext(read('docs/js/rules.js'), analyzerContext);
vm.runInContext(
  'this.testApi = { normalizeFileList, ruleAttachmentNoExtension };',
  analyzerContext
);

const input = 'FSC SF Platform TSD v6.3 - Addendum AU Salesforce Agentforce.pptx; ~WRD0000.jpg - 823 B';
const normalized = analyzerContext.testApi.normalizeFileList(input);
const fileTokens = normalized.split(';').map(token => token.trim()).filter(Boolean);

assert.equal(
  normalized,
  'FSC SF Platform TSD v6.3 - Addendum AU Salesforce Agentforce.pptx; ~WRD0000.jpg',
  'byte-size metadata should be removed without merging attachments'
);
assert.equal(fileTokens.length, 2, 'both attachments should remain independently parsed');
assert.equal(
  analyzerContext.testApi.ruleAttachmentNoExtension({fileTokens}),
  false,
  'attachments with valid extensions should not match Attachment No Ext'
);
assert.equal(
  analyzerContext.testApi.ruleAttachmentNoExtension({fileTokens: ['report.pdf', 'README - 823 B']}),
  true,
  'a genuine extensionless attachment should still match'
);

const workerMessages = [];
const workerContext = vm.createContext({
  console,
  self: {postMessage: message => workerMessages.push(message)}
});
vm.runInContext(read('docs/worker/AlertAnalyzer.worker.js'), workerContext);
workerContext.self.onmessage({
  data: {
    type: 'analyze',
    rows: [{
      fileTokens,
      sourceLower: 'user@example.com',
      destinationDomains: [],
      channelLower: 'email',
      incidentHour: 12,
      Details: ''
    }],
    rules: [{key: 'noext', operator: 'file-without-extension'}]
  }
});

assert.deepEqual(
  JSON.parse(JSON.stringify(workerMessages.at(-1))),
  {type: 'complete', result: {noext: []}},
  'the worker evaluator should agree with the main-thread fallback'
);

console.log('Attachment filename parsing tests passed.');
