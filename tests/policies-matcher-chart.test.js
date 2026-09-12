const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const matcherSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'RuleIdentifier.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');

test('Policies Matcher renders policy and rule counts as accessible HTML', () => {
  assert.match(matcherSource, /<div id="ruleChart" class="rule-chart" aria-live="polite"><\/div>/);
  assert.doesNotMatch(matcherSource, /<canvas id="ruleChart"/);
  assert.match(matcherSource, /document\.createElement\('button'\)/);
  assert.match(matcherSource, /row\.setAttribute\('aria-pressed', String\(isVisible\)\)/);
});

test('clicking a chart row hides its count and recalculates the remaining scale', () => {
  assert.match(matcherSource, /const hidden = new Set\(\)/);
  assert.match(matcherSource, /entries\.filter\(entry => !hidden\.has\(entry\.key\)\)/);
  assert.match(matcherSource, /Math\.max\(1, \.\.\.visible\.map\(entry => entry\.count\)\)/);
  assert.match(matcherSource, /hidden\.has\(entry\.key\)\) hidden\.delete\(entry\.key\)/);
  assert.match(matcherSource, /value\.textContent = isVisible \? entry\.count\.toLocaleString\('en-US'\) : '—'/);
});

test('Policies Matcher chart styles are in the Rule Identifier scope', () => {
  const scopeStart = stylesSource.indexOf('@scope (body.page-rule-identifier)');
  const scopeEnd = stylesSource.indexOf('\n}', scopeStart);
  const chartStyles = stylesSource.indexOf('.rule-chart-row{', scopeStart);

  assert.notEqual(scopeStart, -1);
  assert.ok(chartStyles > scopeStart && chartStyles < scopeEnd);
});
