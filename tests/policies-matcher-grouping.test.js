const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'worker', 'RuleIdentifier.worker.js'), 'utf8');

test('matcher groups rule counts by policy and retains unmatched policy totals', () => {
  const messages = [];
  const context = { self: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(workerSource, context);

  context.self.onmessage({ data: {
    header: ['Policies', 'Violation Triggers'],
    policies: [
      { policyName: 'Customer PII', ruleName: 'ABT Data Dictionary', relation: 'AND', classifiers: ['dictionary'] },
      { policyName: 'Customer PII', ruleName: 'Application to Purchase', relation: 'AND', classifiers: ['purchase'] }
    ],
    alerts: [
      { Policies: 'Customer PII', 'Violation Triggers': 'dictionary' },
      { Policies: 'Customer PII', 'Violation Triggers': 'dictionary' },
      { Policies: 'Customer PII', 'Violation Triggers': 'purchase' },
      { Policies: 'Unconfigured Policy', 'Violation Triggers': 'no classifier match' }
    ]
  } });

  const result = messages.at(-1);
  assert.equal(result.type, 'complete');
  assert.deepEqual(JSON.parse(JSON.stringify(result.counts)), {
    'Customer PII': { rules: { 'ABT Data Dictionary': 2, 'Application to Purchase': 1 }, unmatched: 0 },
    'Unconfigured Policy': { rules: {}, unmatched: 1 }
  });
});
