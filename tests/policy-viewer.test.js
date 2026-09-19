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

function destinationResourceSummarizer() {
  const resourceMatch = page.match(/  function summarizeResources\(resourceContainer\)\{[\s\S]*?\n  \}/);
  const containerMatch = page.match(/  function destinationResourceContainer\(ruleDestination\)\{[\s\S]*?\n  \}/);
  const destinationMatch = page.match(/  function summarizeDestinationResources\(ruleDestination\)\{[\s\S]*?\n  \}/);
  assert.ok(resourceMatch, 'resource summarizer should be present');
  assert.ok(containerMatch, 'destination resource collector should be present');
  assert.ok(destinationMatch, 'destination resource summarizer should be present');
  const context = { input: null };
  vm.runInNewContext(`
    const safeArr = value => Array.isArray(value) ? value : [];
    const uniq = values => Array.from(new Set(values));
    ${resourceMatch[0]}
    ${containerMatch[0]}
    ${destinationMatch[0]}
    result = summarizeDestinationResources(input);
  `, context, { filename: 'PolicyViewer.html' });
  return input => {
    context.input = input;
    vm.runInNewContext('result = summarizeDestinationResources(input);', context);
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

test('destination summaries combine and deduplicate resources from every channel', () => {
  const summarize = destinationResourceSummarizer();
  const result = summarize({ channels: [
    { enabled: 'true', resources: [
      { include: 'true', resource_name: 'Shared destination' },
      { include: 'false', resource_name: 'Hidden exclusion one' }
    ] },
    { enabled: 'false', resources: [
      { include: true, resource_name: 'Shared destination' },
      { include: true, resource_name: 'Second destination' },
      { include: false, resource_name: 'Hidden exclusion two' }
    ] }
  ] });

  assert.equal(result, '+Shared destination, +Second destination, Has Exclude');
  assert.doesNotMatch(result, /Hidden exclusion/);
});

test('main and exception rows use their correct source and destination resource locations', () => {
  assert.match(page, /const srcTxt = summarizeResources\(sdEntry\.rule_source\)/);
  assert.match(page, /const destTxt = summarizeDestinationResources\(sdEntry\.rule_destination\)/);
  assert.match(page, /const srcTxt = summarizeResources\(ex\?\.rule_source\)/);
  assert.match(page, /const destTxt = summarizeDestinationResources\(ex\?\.rule_destination\)/);
  assert.match(page, /<th title="Enabled channels for this exception">Channel<\/th>/);
  assert.doesNotMatch(page, /Channel \(enabled\)/);
});

test('excluded resource names appear only in cell tooltips', () => {
  assert.match(page, /return excluded\.length \? `\$\{summary\}\\nExcluded resources: \$\{excluded\.join\(', '\)\}` : summary/);
  assert.match(page, /tdSrc\.title = row\.sourceTooltip/);
  assert.match(page, /tdDest\.title = row\.destinationTooltip/);
  assert.match(page, /td5\.title = srcTooltip/);
  assert.match(page, /tdDest\.title = destTooltip/);
  assert.match(page, /\['Source', row\.source \?\? ''\]/);
  assert.match(page, /\['Destination', row\.destination \?\? ''\]/);
  assert.match(page, /\['Source Resources', values\.srcTxt\]/);
  assert.match(page, /\['Destination Resources', values\.destTxt\]/);
  assert.doesNotMatch(page, /\['(?:Source|Destination)(?: Resources)?', [^\]]*Tooltip/);
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
