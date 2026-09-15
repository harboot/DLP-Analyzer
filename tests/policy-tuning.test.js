const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'policy-tuning.js'), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const { analyze, findBurstIds, normalized, templateName, genericName } = context.PolicyTuning;

const row = (id, overrides = {}) => ({
  ID: String(id), Policies: 'Customer PII', Source: 'alex@corp.example', Destination: 'crm.example.com',
  'File Name': `customer_${id}.pdf`, 'Violation Triggers': 'PII Name; Account Number', Channel: 'HTTP',
  Application: 'CRM', 'Incident Time': `2026-09-11T10:0${id}:00Z`, ...overrides
});

test('normalization makes case and separators deterministic', () => {
  assert.equal(normalized('  Account_NUMBER  '), 'account number');
  assert.equal(templateName('Report_20260911_Final.pdf'), 'report # final.pdf');
  assert.equal(genericName('image_12.png'), true);
  assert.equal(genericName('customer-agreement.pdf'), false);
});

test('analyze groups multi-policy alerts and merges overlapping signals into opportunities', () => {
  const rows = Array.from({ length: 6 }, (_, index) => row(index + 1, index === 1 ? { 'Violation Triggers': 'pii name; ACCOUNT NUMBER' } : {}));
  rows[0].Policies = 'Customer PII; Regulated Data';
  const report = analyze(rows);
  assert.equal(report.alerts.length, 6);
  assert.equal(report.policies.length, 2);
  const policy = report.policies.find(item => item.name === 'Customer PII');
  assert.equal(policy.alertCount, 6);
  assert.ok(policy.score > 0 && policy.score <= 100);
  assert.equal(policy.opportunities.length, 1);
  assert.ok(policy.opportunities[0].signals.some(item => item.type === 'Destination concentration'));
  assert.ok(policy.opportunities[0].signals.some(item => item.type === 'Trigger concentration'));
  assert.ok(policy.opportunities.every(item => item.review && item.alertIds.length && item.signals.length));
});

test('correlated supporting signals receive only a small score bonus', () => {
  const baseline = Array.from({ length: 4 }, (_, index) => row(index + 1));
  const opportunity = analyze(baseline).policies[0].opportunities[0];
  const fullSignalTotal = opportunity.signals.reduce((sum, signal) => sum + signal.points, 0);
  assert.ok(opportunity.signals.length > 2);
  assert.ok(opportunity.points < fullSignalTotal);
  assert.equal(opportunity.points, opportunity.primaryPoints + opportunity.supportingBonus);
});

test('burst rule requires three matching signatures in ten minutes', () => {
  const rows = [1, 2, 3].map(id => row(id, { 'File Name': 'image.png' }));
  const opportunity = analyze(rows).policies[0].opportunities[0];
  assert.ok(opportunity.signals.some(item => item.type === 'Duplicate/repeated alert bursts'));
  assert.equal(opportunity.alertIds.length, 3);
});

function legacyBurstIds(rows) {
  const sorted = [...rows].filter(item => item.__time).sort((a, b) => a.__time - b.__time);
  const result = new Set();
  for (let start = 0; start < sorted.length; start++) {
    const group = sorted.filter((item, index) => index >= start && item.__time - sorted[start].__time <= 10 * 60 * 1000 && item.__signature === sorted[start].__signature);
    if (group.length >= 3) group.forEach(item => result.add(item.__advisorId));
  }
  return [...result].sort((a, b) => a - b);
}

test('sliding burst windows match the legacy algorithm at timestamp edge cases', () => {
  const rows = [
    row(1, { Source: 'same', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': '2026-01-01T10:00:00Z' }),
    row(2, { Source: 'same', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': '2026-01-01T10:00:00Z' }),
    row(3, { Source: 'same', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': '2026-01-01T10:10:00Z' }),
    row(4, { Source: 'same', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': '2026-01-01T10:10:00.001Z' }),
    row(5, { Source: 'other', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': '2026-01-01T10:05:00Z' }),
    row(6, { Source: 'same', Destination: 'same.example', 'File Name': 'same.pdf', 'Incident Time': 'not-a-timestamp' })
  ];
  const prepared = analyze(rows).alerts;
  assert.deepEqual([...findBurstIds(prepared)].sort((a, b) => a - b), legacyBurstIds(prepared));
  assert.deepEqual([...findBurstIds(prepared)].sort((a, b) => a - b), [0, 1, 2]);
});

test('column aliases are indexed once and remain case insensitive', () => {
  const report = analyze([row(1, { Policies: undefined, ' policy name ': 'Alias Policy' })]);
  assert.equal(report.policies[0].name, 'Alias Policy');
});

test('removed tuning patterns are excluded and strong findings produce a high opportunity', () => {
  const rows = [1, 2, 3, 4, 5, 6].map(id => row(id, { 'File Name': 'quarterly_report_20260911.pdf' }));
  const policy = analyze(rows).policies[0];
  assert.equal(policy.opportunity, 'High');
  assert.equal(policy.opportunities.flatMap(item => item.signals).some(item => item.type === 'Channel concentration'), false);
  assert.equal(policy.opportunities.flatMap(item => item.signals).some(item => item.type === 'Generic attachment pattern'), false);
});

test('sparse unrelated alerts are not automatically high opportunities', () => {
  const report = analyze([
    row(1, { Policies: 'One', Source: 'a', Destination: 'x', 'Violation Triggers': 'Alpha' }),
    row(2, { Policies: 'One', Source: 'b', Destination: 'y', 'Violation Triggers': 'Beta' })
  ]);
  assert.equal(report.policies[0].opportunity, 'Low');
  assert.equal(report.policies[0].score, 0);
});
