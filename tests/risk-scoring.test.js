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

console.log('Risk scoring tests passed.');
