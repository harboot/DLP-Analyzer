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
  'this.testApi = { normalizeFileList, fileTokensForRow, freqMapTokens, ruleAttachmentNoExtension };',
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

const summaryRows = [
  {'File Name': 'report.pdf; salary.xlsx'},
  {'File Name': 'report.pdf'}
];
const filenameCounts = analyzerContext.testApi.freqMapTokens(summaryRows, analyzerContext.testApi.fileTokensForRow);
assert.deepEqual(
  JSON.parse(JSON.stringify(Array.from(filenameCounts.entries()))),
  [['report.pdf', 2], ['salary.xlsx', 1]],
  'Top File Names should count every normalized filename independently'
);
const uiSource = read('docs/js/ui.js');
assert.match(uiSource, /freqMapTokens\(rows, fileTokensForRow\)/, 'the filename summary should use token-level counts');
assert.match(uiSource, /filter\.col === 'File Name'[\s\S]*fileTokensForRow\(row\)\.includes\(filter\.value\)/, 'filename drill-down should match individual tokens');
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
  setTimeout,
  DOMException,
  Uint32Array,
  self: {postMessage: message => workerMessages.push(message)}
});
vm.runInContext(read('docs/worker/AlertAnalyzer.worker.js'), workerContext);
workerContext.self.onmessage({data: {
  type: 'initialize', requestId: 1, datasetVersion: 'attachments',
  rows: [{
    source: 'user@example.com', destinations: [], fileTokens,
    sourceLower: 'user@example.com', destinationDomains: [],
    channelLower: 'email', incidentHour: 12, text: {Details: ''}
  }]
}}).then(() => workerContext.self.onmessage({
  data: {
    type: 'analyze', analysisType: 'rules', requestId: 2, datasetVersion: 'attachments',
    rules: [{key: 'noext', operator: 'file-without-extension'}]
  }
})).then(() => {
  const complete = workerMessages.at(-1);
  assert.equal(complete.type, 'complete');
  assert.equal(complete.requestId, 2);
  assert.deepEqual(Array.from(complete.result.noext), [], 'the worker evaluator should agree with the main-thread fallback');
  console.log('Attachment filename parsing tests passed.');
});
