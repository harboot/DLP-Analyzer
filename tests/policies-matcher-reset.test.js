const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const matcherSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RuleIdentifier.html'), 'utf8');

test('Policies Matcher provides a Reset button after Process', () => {
  assert.match(matcherSource, /id="btn-process"[^>]*>Process<\/button>\s*<button[^>]*id="btn-reset"[^>]*>Reset<\/button>/);
  assert.match(matcherSource, /\$\('#btn-reset'\)\.addEventListener\('click', hardReset\)/);
});

test('reset prevents processing until both datasets are loaded again', () => {
  const resetFunction = matcherSource.match(/function hardReset\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(resetFunction, /\$\('#btn-process'\)\.disabled=true/);
  assert.match(resetFunction, /alertsRows=\[\]/);
  assert.match(resetFunction, /policiesRows=\[\]/);
});
