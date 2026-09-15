const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('docs/js/risk-scoring.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('docs/js/detectors/index.js', 'utf8'), context);
for (const detectorFile of [
  'email-sent-to-self.js', 'email-sent-to-self-by-character.js', 'email-broadcast-domains.js',
  'short-subject.js', 'out-of-hours.js', 'attachment-no-extension.js', 'sensitive-keywords.js',
  'weird-tld.js', 'destination-competitor.js', 'destination-domain-once.js',
  'destination-email-subdomain.js', 'ransomware-attachment.js'
]) vm.runInContext(fs.readFileSync(`docs/js/detectors/${detectorFile}`, 'utf8'), context);

const { exportRuleConfigs, normalizeWeight, scoreAlerts } = context.RiskScoring;

const riskScoringPage = fs.readFileSync('docs/CardManager.html', 'utf8');
assert.match(riskScoringPage, /Built-in detectors/);
assert.match(riskScoringPage, /aria-expanded="\$\{!builtInCollapsed\}"/);
assert.match(fs.readFileSync('docs/js/detectors/ransomware-attachment.js', 'utf8'), /Encrypted extension regular expression/);
assert.doesNotMatch(fs.readFileSync('docs/js/risk-scoring.js', 'utf8'), /builtin-|matchesBuiltIn|RiskDetectors/);

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

const builtIns = context.RiskDetectors.builtInRules();
assert.equal(builtIns.length, 12);
assert.equal(builtIns.find(item => item.key === 'shortSubject').settingFields[0].key, 'subjectLength');
assert.equal(builtIns.every(rule => rule.type === 'file' && rule.builtIn), true);
assert.deepEqual(Array.from(builtIns, rule => rule.name), [
  'Email Sent to Self', 'Email Sent to Self (by character)', 'Email Broadcast Multiple Destination Domain',
  'Short Subject', 'Out-of-Hours', 'Attachment No Ext', 'Sensitive Keywords', 'Weird TLD Dest',
  'Destination is Competitor',
  'Destination Domain appears Once in Dataset', 'Destination Email using Subdomain',
  'Attachment Looks Like Ransomware Notes or Encryption'
]);
const rule = key => builtIns.find(item => item.key === key);
assert.deepEqual(Array.from(builtIns, item => item.weight), [6, 6, 6, 3, 5, 4, 7, 5, 7, 5, 5, 8]);
const exported = exportRuleConfigs([...builtIns, { id: 'disabled-custom', name: 'Disabled custom', type: 'file', code: 'return true;', enabled: false, weight: 2 }]);
assert.equal(exported.length, 13);
assert.equal(exported.every(item => item.type === 'file'), true);
assert.equal(exported.filter(item => item.builtIn).length, 12);
assert.equal(exported.find(item => item.id === 'builtin-short-subject').settings.subjectLength, 15);
assert.equal(exported.find(item => item.id === 'disabled-custom').enabled, false);
assert.equal(rule('weirdTld').settings.tlds, 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party');
const migratedBuiltIns = context.RiskDetectors.migrateRules(builtIns.map(item => ({ ...item, weight: 1 })), true);
assert.deepEqual(Array.from(migratedBuiltIns, item => item.weight), [6, 6, 6, 3, 5, 4, 7, 5, 7, 5, 5, 8]);
assert.equal(context.RiskDetectors.migrateRules([{ id: 'custom', type: 'file', weight: 9 }], true)[0].weight, 9);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('self'), { Source: 'alice@example.com', Destination: 'alice@example.net' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('selfByCharacter'), { Channel: 'Email', Source: 'alexander@example.com', Destination: 'alexandra@outside.test' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('selfByCharacter'), { Channel: 'Email', Source: 'alice@example.com', Destination: 'bob@outside.test' }), false);
rule('selfByCharacter').settings.minimumCharacters = 8;
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('selfByCharacter'), { Source: 'alexander@example.com', Destination: 'alexandra@outside.test' }), false);
const broadcast = rule('emailBroadcastDomains');
assert.equal(context.RiskDetectors.matchesBuiltIn(broadcast, { Size: '1E+3', Destination: 'a@one.test;b@two.test;c@three.test;d@four.test;e@five.test' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(broadcast, { Size: '12', Destination: 'a@gmail.com;b@gmail.com;c@yahoo.com;d@outlook.com;e@googlemail.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(broadcast, { Size: '12', Destination: 'a@gmail.com;b@gmail.com;c@gmail.com;d@gmail.com;e@gmail.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(broadcast, { Size: '', Destination: 'a@one.test;b@two.test;c@three.test;d@four.test;e@five.test' }), false);
broadcast.settings.minimumDomains = 3;
assert.equal(context.RiskDetectors.matchesBuiltIn(broadcast, { Size: '12', Destination: 'a@one.test;b@two.test;c@three.test' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('shortSubject'), { Channel: 'Network email', Details: 'Hello' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('noExtension'), { FileName: 'report; archive.zip' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('sensitiveKeywords'), { Details: 'Confidential payroll export' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('weirdTld'), { Destination: 'person@example.xyz' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('weirdTld'), { Destination: 'person@example.party' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'Alice <alice@mail.metrobank.com>; https://gcash.com/pay' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: '<alice@mail.metrobank.com>' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'HTTPS://portal.securitybank.com.ph:443/login' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'person@notmetrobank.com' }), false);
const domainRows = [
  { Destination: 'one@unique.example; two@common.example' },
  { Destination: 'three@common.example' },
  { Destination: 'not-an-email' }
];
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationDomainOnce'), domainRows[0], domainRows), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationDomainOnce'), domainRows[1], domainRows), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationEmailSubdomain'), { Size: '1E+3', Destination: 'person@regional.company.example' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationEmailSubdomain'), { Size: '12', Destination: 'person@a.example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationEmailSubdomain'), { Size: '12', Destination: 'person@tenant.onmicrosoft.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationEmailSubdomain'), { Size: '', Destination: 'person@regional.company.example' }), false);
const ransomwareAttachment = rule('ransomwareAttachment');
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'invoice.pdf; HOW_TO_DECRYPT.txt' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf.locked' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf' }), false);
ransomwareAttachment.settings.encExtRegex = String.raw`\.companylocked$`;
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf.companylocked' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.foo' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 03:20:11 AM GMT+0800' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 05:00:00 AM GMT+0800' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 11:30:00 PM GMT+0800' }), true);
const sensitive = rule('sensitiveKeywords');
sensitive.settings.detectSubject = false;
assert.equal(context.RiskDetectors.matchesBuiltIn(sensitive, { Details: 'Confidential payroll', FileName: 'agenda.pdf' }), false);
sensitive.settings.keywords = 'board report, api key';
assert.equal(context.RiskDetectors.matchesBuiltIn(sensitive, { Details: '', FileName: 'board_report.pdf' }), true);

console.log('Risk scoring tests passed.');
