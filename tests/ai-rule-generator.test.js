const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('docs/js/ai.js', 'utf8'), context);

const generated = context.parseGeneratedRule(JSON.stringify({
  ruleName: 'Large External Transfer',
  description: 'Detects transfers larger than 1 MB to an external destination.',
  recommendedWeight: 8,
  javascript: 'return Number(row.Size) > 1024;'
}));

assert.deepEqual(JSON.parse(JSON.stringify(generated)), {
  ruleName: 'Large External Transfer',
  description: 'Detects transfers larger than 1 MB to an external destination.',
  recommendedWeight: 8,
  javascript: 'return Number(row.Size) > 1024;'
});

const fenced = '```json\n' + JSON.stringify({ ruleName: 'New Alert', description: 'Detects new alerts.', recommendedWeight: 3, javascript: "return row.Status === 'New';" }) + '\n```';
assert.equal(context.parseGeneratedRule(fenced).ruleName, 'New Alert');
assert.throws(() => context.parseGeneratedRule('return true;'), /invalid rule format/);
assert.throws(() => context.parseGeneratedRule('{"ruleName":"Incomplete"}'), /missing a name/);

console.log('AI rule generator tests passed.');
