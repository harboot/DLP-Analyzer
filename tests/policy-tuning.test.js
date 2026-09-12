const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'policy-tuning.js'), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const { analyze, normalized, templateName, genericName } = context.PolicyTuning;

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

test('analyze groups multi-policy alerts and creates explainable findings without violation triggers', () => {
  const rows = Array.from({ length: 6 }, (_, index) => row(index + 1, index === 1 ? { 'Violation Triggers': 'pii name; ACCOUNT NUMBER' } : {}));
  rows[0].Policies = 'Customer PII; Regulated Data';
  const report = analyze(rows);
  assert.equal(report.alerts.length, 6);
  assert.equal(report.policies.length, 2);
  const policy = report.policies.find(item => item.name === 'Customer PII');
  assert.equal(policy.alertCount, 6);
  assert.ok(policy.score > 0 && policy.score <= 100);
  assert.ok(policy.findings.some(item => item.type === 'Destination concentration'));
  assert.ok(policy.findings.every(item => !/trigger/i.test(`${item.type} ${item.reason} ${item.evidence} ${item.review}`)));
  assert.ok(policy.findings.every(item => item.reason && item.evidence && item.review && item.alertIds.length));
});

test('violation triggers and application do not affect tuning scores', () => {
  const baseline = Array.from({ length: 4 }, (_, index) => row(index + 1));
  const changed = baseline.map((item, index) => ({ ...item, Application: `App ${index}`, 'Violation Triggers': `Trigger ${index}` }));
  assert.deepEqual(
    JSON.parse(JSON.stringify(analyze(changed).policies)),
    JSON.parse(JSON.stringify(analyze(baseline).policies))
  );
});

test('burst rule requires three matching signatures in ten minutes', () => {
  const rows = [1, 2, 3].map(id => row(id, { 'File Name': 'image.png' }));
  const finding = analyze(rows).policies[0].findings.find(item => item.type === 'Duplicate/repeated alert bursts');
  assert.ok(finding);
  assert.equal(finding.alertIds.length, 3);
});

test('removed tuning patterns are excluded and strong findings produce a high opportunity', () => {
  const rows = [1, 2, 3, 4, 5, 6].map(id => row(id, { 'File Name': 'quarterly_report_20260911.pdf' }));
  const policy = analyze(rows).policies[0];
  assert.equal(policy.opportunity, 'High');
  assert.equal(policy.findings.some(item => item.type === 'Channel concentration'), false);
  assert.equal(policy.findings.some(item => item.type === 'Generic attachment pattern'), false);
});

test('sparse unrelated alerts are not automatically high opportunities', () => {
  const report = analyze([
    row(1, { Policies: 'One', Source: 'a', Destination: 'x', 'Violation Triggers': 'Alpha' }),
    row(2, { Policies: 'One', Source: 'b', Destination: 'y', 'Violation Triggers': 'Beta' })
  ]);
  assert.equal(report.policies[0].opportunity, 'Low');
  assert.equal(report.policies[0].score, 0);
});
