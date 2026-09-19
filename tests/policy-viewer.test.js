const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'docs', 'PolicyViewer.html'), 'utf8');

function extractFunction(name) {
  const start = page.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} should be present`);
  const bodyStart = page.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < page.length; index += 1) {
    if (page[index] === '{') depth += 1;
    if (page[index] === '}') depth -= 1;
    if (depth === 0) return page.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

function buildSummarizer(name) {
  const context = { input: null, result: null };
  vm.runInNewContext(`
    const safeArr = value => Array.isArray(value) ? value : [];
    const uniq = values => Array.from(new Set(values));
    ${extractFunction(name)}
  `, context, { filename: 'PolicyViewer.html' });
  return input => {
    context.input = input;
    vm.runInNewContext(`result = ${name}(input);`, context);
    return context.result;
  };
}

test('source summary reports machine and resource statuses without resource names', () => {
  const summarize = buildSummarizer('summarizeResources');
  const result = summarize({
    endpoint_channel_machine_type: 'ALL_MACHINES',
    resources: [
      { include: 'true', resource_name: 'Included secret' },
      { include: false, resource_name: 'Excluded secret' }
    ]
  });

  assert.equal(result, 'All Machines, Has Resources, Has Exclude');
  assert.doesNotMatch(result, /secret/i);
});

test('channel summary groups only enabled channels by resource status', () => {
  const summarize = buildSummarizer('summarizeChannels');
  const result = summarize({ channels: [
    { enabled: true, channel_type: 'EMAIL' },
    { enabled: 'true', channel_type: 'HTTPS', resources: [
      { include: true, resource_name: 'Private domain' },
      { include: false, resource_name: 'Excluded domain' }
    ] },
    { enabled: 'false', channel_type: 'FTP' }
  ] });

  assert.equal(result, 'Any: EMAIL; Has Resources: HTTPS; Has Exclude: HTTPS');
  assert.doesNotMatch(result, /domain|FTP/);
});

test('main and exception rows use the same safe source and channel summaries', () => {
  assert.match(page, /const srcTxt = summarizeResources\(sdEntry\.rule_source\)/);
  assert.match(page, /const chan = summarizeChannels\(sdEntry\.rule_destination\)/);
  assert.match(page, /const srcTxt = summarizeResources\(ex\?\.rule_source\)/);
  assert.match(page, /const chTxt = summarizeChannels\(ex\?\.rule_destination \|\| \{\}\)/);
  assert.match(page, /tdSrc\.title = row\.source \|\| '\(no source summary\)'/);
  assert.match(page, /td5\.title = srcTxt \|\| '-'/);
});

test('destination is removed while channel remains filterable and exportable', () => {
  assert.doesNotMatch(page, /data-col="destination"/);
  assert.doesNotMatch(page, /<th[^>]*>Destination(?: Resources)?<\/th>/);
  assert.doesNotMatch(page, /\['Destination(?: Resources)?'/);
  assert.match(page, /data-col="channel"[^>]*title="Filter Channel"/);
  assert.match(page, /\['Channel', row\.channel \?\? ''\]/);
  assert.match(page, /\['Channel', values\.chTxt\]/);
});

test('copy previews contain the same untruncated source and channel summaries as cells', () => {
  assert.match(page, /\['Source', row\.source \?\? ''\]/);
  assert.match(page, /\['Source', values\.srcTxt\]/);
  assert.match(page, /tdCh\.title = chText \|\| '\(no active channels\)'/);
  assert.doesNotMatch(page, /resource_name/);
});

test('main and exception actions include collapsible JSON viewers', () => {
  assert.match(page, /createJsonButton\(row\.json, `JSON for \$\{row\.ruleName\}`\)/);
  assert.match(page, /createJsonButton\(ex, `JSON for \$\{exName\}`\)/);
  assert.match(page, /document\.createElement\('details'\)/);
  assert.match(page, /json: \{ policy_rule: r, severity_action: sevEntry \|\| null, source_destination: sdEntry, exception_rules: excArr \}/);
  assert.match(page, /button\.textContent = 'JSON'/);
});

test('relations remain in classifier tooltips and copied information', () => {
  assert.match(page, /tdCls\.title = formatClassifiers\(row\.classifiers, row\.relation\)/);
  assert.match(page, /td4\.title = formatClassifiers\(exCls \? exCls\.split\(', '\) : \[\], rel\)/);
  assert.match(page, /\['Classifiers', formatClassifiers\(row\.classifiers, row\.relation\)\]/);
  assert.match(page, /copyCellsAsRichText\(getExceptionRowCells/);
});

test('policy level remains hidden data used by the ascending default sort', () => {
  assert.match(page, /const policyLevel = Number\(policy\.policy_level\?\.level \?\? 0\)/);
  assert.match(page, /if\(a\.policyLevel !== b\.policyLevel\) return a\.policyLevel - b\.policyLevel/);
  assert.doesNotMatch(page, /<th[^>]*>Policy Level(?:\s|<)/);
});
