const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('docs/js/risk-scoring.js', 'utf8'), context);

const { normalizeWeight, scoreAlerts } = context.RiskScoring;

assert.equal(normalizeWeight(undefined), 1);
assert.equal(normalizeWeight('4'), 4);
assert.equal(normalizeWeight(0), 0);
assert.equal(normalizeWeight(-2), 1);

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const rules = [
  { id: 'external', name: 'External destination', weight: 5 },
  { id: 'large', name: 'Large transfer', weight: 8 },
  { id: 'legacy', name: 'Legacy rule' }
];
const matches = new Map([
  ['external', new Set([0, 1])],
  ['large', new Set([1, 2])],
  ['legacy', new Set([0])]
]);
const result = scoreAlerts(rows, rules, matches);

assert.deepEqual(Array.from(result, (alert) => alert.row.id), ['b', 'c', 'a']);
assert.deepEqual(Array.from(result, (alert) => alert.score), [13, 8, 6]);
assert.deepEqual(Array.from(result[0].matchedRules, (rule) => rule.name), ['External destination', 'Large transfer']);

const builtIns = context.RiskScoring.builtInRules();
assert.equal(builtIns.length, 6);
assert.equal(builtIns.every(rule => rule.type === 'file' && rule.builtIn), true);
assert.deepEqual(Array.from(builtIns, rule => rule.name), [
  'Email Sent to Self', 'Short Subject', 'Out-of-Hours', 'Attachment No Ext', 'Sensitive Keywords', 'Weird TLD Dest'
]);
const rule = key => builtIns.find(item => item.key === key);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('self'), { Source: 'alice@example.com', Destination: 'alice@example.net' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('shortSubject'), { Channel: 'Network email', Details: 'Hello' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('noExtension'), { FileName: 'report; archive.zip' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('sensitiveKeywords'), { Details: 'Confidential payroll export' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('weirdTld'), { Destination: 'person@example.xyz' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 03:20:11 AM GMT+0800' }), true);
assert.equal(context.RiskScoring.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 05:00:00 AM GMT+0800' }), false);

console.log('Risk scoring tests passed.');
