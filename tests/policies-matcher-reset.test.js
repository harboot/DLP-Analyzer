const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const matcherSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RuleIdentifier.html'), 'utf8');

test('Policies Matcher replaces uploaded datasets without a Reset button', () => {
  assert.doesNotMatch(matcherSource, /id="btn-reset"/);
  assert.match(matcherSource, /fileAll\.addEventListener\('change',[\s\S]*?alertsHeader = \[\]; alertsRows = \[\]/);
  assert.match(matcherSource, /filePolicies\.addEventListener\('change',[\s\S]*?policiesRows = \[\]/);
});

test('reset prevents processing until both datasets are loaded again', () => {
  const resetFunction = matcherSource.match(/function hardReset\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(resetFunction, /\$\('#btn-process'\)\.disabled=true/);
  assert.match(resetFunction, /alertsRows=\[\]/);
  assert.match(resetFunction, /policiesRows=\[\]/);
});
