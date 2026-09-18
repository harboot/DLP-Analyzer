const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'PolicyViewer.html'), 'utf8');

function resourceSummarizer() {
  const match = page.match(/  function summarizeResources\(resourceContainer\)\{[\s\S]*?\n  \}/);
  assert.ok(match, 'resource summarizer should be present');
  const context = { input: null };
  vm.runInNewContext(`
    const safeArr = value => Array.isArray(value) ? value : [];
    const uniq = values => Array.from(new Set(values));
    ${match[0]}
    result = summarizeResources(input);
  `, context, { filename: 'PolicyViewer.html' });
  return input => {
    context.input = input;
    vm.runInNewContext('result = summarizeResources(input);', context);
    return context.result;
  };
}

test('resource summaries prefix included resources and conceal excluded names', () => {
  const summarize = resourceSummarizer();
  const result = summarize({ resources: [
    { include: 'true', resource_name: 'Included A' },
    { include: true, resource_name: 'Included B' },
    { include: 'false', resource_name: 'Secret exclusion' }
  ] });

  assert.equal(result, '+Included A, +Included B, Has Exclude');
  assert.doesNotMatch(result, /Secret exclusion/);
});

test('policy and exception tables expose destination resources without relation columns', () => {
  assert.match(page, /data-col="destination"[^>]*title="Filter Destination"/);
  assert.match(page, /<th title="Destination resources">Destination Resources<\/th>/);
  assert.doesNotMatch(page, /<th[^>]*>Relation(?:\s|<)/);
  assert.doesNotMatch(page, /data-col="relation"/);
});

test('relations appear in classifier tooltips and exception rows have copy actions', () => {
  assert.match(page, /tdCls\.title = formatClassifiers\(row\.classifiers, row\.relation\)/);
  assert.match(page, /td4\.title = formatClassifiers\(exCls \? exCls\.split\(', '\) : \[\], rel\)/);
  assert.match(page, /aria-label="Copy exception"/);
  assert.match(page, /copyCellsAsRichText\(getExceptionRowCells/);
  assert.doesNotMatch(page, /title\.innerHTML = `<b>Exceptions/);
});

test('copied policy and exception classifiers include their condition relation', () => {
  assert.match(page, /\['Classifiers', formatClassifiers\(row\.classifiers, row\.relation\)\]/);
  assert.match(page, /\['Classifiers', formatClassifiers\(values\.exCls \? values\.exCls\.split\(', '\) : \[\], values\.rel\)\]/);
  assert.match(page, /return `\$\{names\}\$\{relation \? ` \[relation: \$\{relation\}\]` : ''\}`/);
});

test('policy level remains hidden data used by the ascending default sort', () => {
  assert.match(page, /const policyLevel = Number\(policy\.policy_level\?\.level \?\? 0\)/);
  assert.match(page, /if\(a\.policyLevel !== b\.policyLevel\) return a\.policyLevel - b\.policyLevel/);
  assert.doesNotMatch(page, /<th[^>]*>Policy Level(?:\s|<)/);
});
