const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('docs/js/risk-scoring.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('docs/js/detectors/index.js', 'utf8'), context);
const detectorFiles = fs.readdirSync('docs/js/detectors')
  .filter(file => file.endsWith('.js') && file !== 'index.js')
  .sort();
assert.deepEqual(Array.from(context.RiskDetectors.files).sort(), detectorFiles);
for (const detectorFile of context.RiskDetectors.files) {
  vm.runInContext(fs.readFileSync(`docs/js/detectors/${detectorFile}`, 'utf8'), context);
}

const writtenScripts = [];
const loaderContext = {
  document: {
    currentScript: { src: 'file:///tmp/DLP Analyzer/docs/js/detectors/index.js' },
    write(markup) { writtenScripts.push(markup); }
  },
  console: { error() {} }
};
vm.createContext(loaderContext);
vm.runInContext(fs.readFileSync('docs/js/detectors/index.js', 'utf8'), loaderContext);
assert.equal(writtenScripts.length, detectorFiles.length);
assert.match(writtenScripts[0], /^<script src="file:\/\/\/tmp\/DLP Analyzer\/docs\/js\/detectors\/email-sent-to-self\.js"/);
assert.match(writtenScripts[0], /onerror="RiskDetectors\.reportLoadError\('email-sent-to-self\.js'\)"/);
loaderContext.RiskDetectors.reportLoadError('broken.js');
assert.deepEqual(Array.from(loaderContext.RiskDetectors.loadErrors), ['broken.js']);

const { exportRuleConfigs, normalizeWeight, scoreAlerts } = context.RiskScoring;

const riskScoringPage = fs.readFileSync('docs/CardManager.html', 'utf8');
const riskScoringStyles = fs.readFileSync('docs/styles.css', 'utf8');
assert.match(riskScoringPage, /Built-in detectors/);
assert.equal((riskScoringPage.match(/js\/detectors\//g) || []).length, 1);
assert.match(riskScoringPage, /Custom detectors/);
assert.match(riskScoringPage, /aria-expanded="\$\{!builtInCollapsed\}"/);
assert.doesNotMatch(riskScoringPage, /data-column="(?:name|weight|matches)"/);
assert.match(riskScoringPage, /data-result-column="\$\{column\}"/);
assert.match(riskScoringPage, /<textarea id="chatbot-input"[^>]+rows="6"/);
assert.match(riskScoringPage, /Clear filters/);
assert.match(riskScoringPage, /<summary>Load log<\/summary>/);
assert.match(riskScoringPage, /OK: \$\{f\.name\} \(\$\{rows\.length\} rows\)/);
assert.match(riskScoringPage, /\$\{files\.length\} alert file/);
assert.doesNotMatch(riskScoringPage, /const names = files\.map/);
assert.match(riskScoringStyles, /\.list\{flex:1;min-height:0;max-height:min\(52vh,480px\);overflow:auto\}/);
assert.match(riskScoringPage, /id="inpDescription"[^>]+rows="2"/);
assert.match(riskScoringPage, /id="inpCode"[^>]+rows="5"/);
assert.match(riskScoringStyles, /\.cjs-textarea\{[\s\S]*?height:124px;[\s\S]*?min-height:124px;/);
assert.match(fs.readFileSync('docs/js/detectors/ransomware-attachment.js', 'utf8'), /Detected filename pattern list/);
assert.doesNotMatch(fs.readFileSync('docs/js/detectors/ransomware-attachment.js', 'utf8'), /regular expression/i);
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
assert.equal(builtIns.length, 17);
assert.equal(builtIns.find(item => item.key === 'shortSubject').settingFields[0].key, 'subjectLength');
assert.equal(builtIns.every(rule => rule.type === 'file' && rule.builtIn), true);
assert.deepEqual(Array.from(builtIns, rule => rule.name), [
  'Email Sent to Self', 'Email Sent to Self (by character)', 'Email Broadcast Multiple Destination Domain',
  'Short Subject', 'Out-of-Hours', 'Attachment No Ext', 'No Attachment', 'Sensitive Keywords', 'Weird TLD Dest',
  'Destination is Competitor', 'Destination Lookalike Domain',
  'Destination Domain appears Once in Dataset', 'Destination Email using Subdomain',
  'Attachment Looks Like Ransomware Notes or Encryption',
  'Email Subject or Filename Obfuscation',
  'Filename is Executable',
  'Multiple Attachment specific Destination'
]);
const rule = key => builtIns.find(item => item.key === key);
assert.deepEqual(Array.from(builtIns, item => item.weight), [6, 6, 6, 3, 5, 4, 4, 7, 5, 7, 7, 5, 5, 8, 7, 6, 7]);
const exported = exportRuleConfigs([...builtIns, { id: 'disabled-custom', name: 'Disabled custom', type: 'file', code: 'return true;', enabled: false, weight: 2 }]);
assert.equal(exported.length, 18);
assert.equal(exported.every(item => item.type === 'file'), true);
assert.equal(exported.filter(item => item.builtIn).length, 17);
assert.equal(exported.find(item => item.id === 'builtin-short-subject').settings.subjectLength, 15);
assert.equal(exported.find(item => item.id === 'builtin-short-subject').description, rule('shortSubject').description);
assert.equal(exported.find(item => item.id === 'builtin-short-subject').settingFields[0].key, 'subjectLength');
assert.equal(exported.find(item => item.id === 'disabled-custom').enabled, false);
assert.equal(rule('weirdTld').settings.tlds, 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party');
const migratedBuiltIns = context.RiskDetectors.migrateRules(builtIns.map(item => ({ ...item, weight: 1 })), true);
assert.deepEqual(Array.from(migratedBuiltIns, item => item.weight), [6, 6, 6, 3, 5, 4, 4, 7, 5, 7, 7, 5, 5, 8, 7, 6, 7]);
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
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('noAttachment'), { FileName: '   ' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('noAttachment'), { FileName: 'N/A; none' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('noAttachment'), { FileName: 'report.pdf; N/A' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('sensitiveKeywords'), { Details: 'Confidential payroll export' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('weirdTld'), { Destination: 'person@example.xyz' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('weirdTld'), { Destination: 'person@example.party' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'Alice <alice@mail.metrobank.com>; https://gcash.com/pay' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: '<alice@mail.metrobank.com>' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'HTTPS://portal.securitybank.com.ph:443/login' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationCompetitor'), { Destination: 'person@notmetrobank.com' }), false);
const lookalike = configured => ({
  ...context.RiskDetectors.builtInRules().find(item => item.key === 'destinationLookalikeDomain'),
  settings: {
    protectedDomains: 'bpi.com.ph\nbpi.com.hk', targetBrand: 'bpi', maximumDistance: 1,
    detectDigitLookalikes: true, detectBrandAffix: true, domainExceptions: 'ipi.ph', ...configured
  }
});
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@bpi.com.ph' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@mail.bpi.com.ph' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@bpi.com.hk' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@bpl.com.ph' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@bp1.com.ph' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@bpii.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@secure-bpi.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'https://bpi-login.net/path' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'bpi-security.net' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'ipi.ph' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(lookalike(), { Destination: 'user@example.com' }), false);
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
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('destinationEmailSubdomain'), { Size: '', Destination: 'person@regional.company.example' }), true);
const subdomain = rule('destinationEmailSubdomain');
subdomain.settings.domainExceptions = 'company.example';
assert.equal(context.RiskDetectors.matchesBuiltIn(subdomain, { Size: '12', Destination: 'person@regional.company.example' }), false);
const ransomwareAttachment = rule('ransomwareAttachment');
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'invoice.pdf; HOW_TO_DECRYPT.txt' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf.locked' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf' }), false);
ransomwareAttachment.settings.patterns = '.companylocked';
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.pdf.companylocked' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(ransomwareAttachment, { FileName: 'quarterly-report.foo' }), false);
const obfuscation = rule('emailSubjectFilenameObfuscation');
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '12 KB', Details: 'Updated p@ssw0rd list' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '1E+3', FileName: 'c.r.3.d.entials.csv; agenda.pdf' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '8', Details: 'Quarterly report', FileName: 'agenda.pdf' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '8', Details: 'Private conference credentials' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '', Details: 'p@ssword', FileName: 'credentials.txt' }), false);
obfuscation.settings.patterns = 's3ns1t1ve';
assert.equal(context.RiskDetectors.matchesBuiltIn(obfuscation, { Size: '8', Details: 's3ns1t1ve project' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 03:20:11 AM GMT+0800' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 05:00:00 AM GMT+0800' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(rule('outOfHours'), { IncidentTime: '26 Aug. 2025, 11:30:00 PM GMT+0800' }), true);
const executable = rule('filenameIsExecutable');
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'invoice.pdf; setup.EXE' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'deploy.ps1 (blocked); notes.txt' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'notes.txt' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'report.pdf; archive.tar.gz' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'proposal.exe.pdf' }), false);
executable.settings.extensions = 'foo, bar';
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'payload.foo' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(executable, { FileName: 'setup.exe' }), false);
const multipleAttachments = rule('multipleAttachmentsSpecificDestination');
const tenFiles = Array.from({ length: 10 }, (_, index) => `document-${index}.pdf`).join(';');
assert.equal(context.RiskDetectors.matchesBuiltIn(multipleAttachments, { FileName: tenFiles, Destination: 'person@gmail.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(multipleAttachments, { FileName: tenFiles, Destination: 'person@company.test' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(multipleAttachments, { FileName: `${tenFiles};image.png`, Destination: 'person@yahoo.co.id' }), true);
multipleAttachments.settings.minimumAttachments = 11;
multipleAttachments.settings.domains = 'company.test';
assert.equal(context.RiskDetectors.matchesBuiltIn(multipleAttachments, { FileName: tenFiles, Destination: 'person@company.test' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(multipleAttachments, { FileName: `${tenFiles};extra.pdf`, Destination: 'person@company.test' }), true);
const sensitive = rule('sensitiveKeywords');
sensitive.settings.detectSubject = false;
assert.equal(context.RiskDetectors.matchesBuiltIn(sensitive, { Details: 'Confidential payroll', FileName: 'agenda.pdf' }), false);
sensitive.settings.keywords = 'board report, api key';
assert.equal(context.RiskDetectors.matchesBuiltIn(sensitive, { Details: '', FileName: 'board_report.pdf' }), true);

// Every optional detector setting is effective while omitted fields retain defaults for older saved rules.
const configuredRule = (key, settings) => ({ ...context.RiskDetectors.builtInRules().find(item => item.key === key), settings });
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('noExtension', { ignoredNames: 'README', ignoredPatterns: 'signature-*' }), { FileName: 'README; signature-corporate' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationCompetitor', { domains: 'example.com', domainExceptions: 'safe.example.com', matchSubdomains: true }), { Destination: 'a@safe.example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationCompetitor', { domains: 'example.com', matchSubdomains: false }), { Destination: 'a@mail.example.com' }), false);
const occurrenceRows = [{ Destination: 'a@two.test' }, { Destination: 'b@two.test' }, { Destination: 'c@once.test' }];
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationDomainOnce', { maximumOccurrences: 2 }), occurrenceRows[0], occurrenceRows), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationDomainOnce', { maximumOccurrences: 2, domainExceptions: 'two.test' }), occurrenceRows[0], occurrenceRows), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationDomainOnce', { minimumDatasetSize: 4 }), occurrenceRows[2], occurrenceRows), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationEmailSubdomain', { minimumSubdomainLabels: 3, minimumLabelLength: 2, domainExceptions: '' }), { Destination: 'a@one.two.example.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('destinationEmailSubdomain', { minimumSubdomainLabels: 2, minimumLabelLength: 5, domainExceptions: '' }), { Destination: 'a@one.two.example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('emailBroadcastDomains', { minimumDomains: 2, consumerDomains: 'personal.test', countMode: 'consumerMailboxes' }), { Size: '1', Destination: 'a@personal.test;b@personal.test' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('emailBroadcastDomains', { minimumDomains: 1, domainExceptions: 'ignored.test' }), { Size: '1', Destination: 'a@ignored.test' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('self', { minimumLocalPartLength: 6 }), { Source: 'alice@one.test', Destination: 'alice@two.test' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('self', { requireDifferentDomain: true }), { Source: 'alice+tag@one.test', Destination: 'alice@one.test' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('self', { requireDifferentDomain: true }), { Source: 'alice+tag@one.test', Destination: 'alice@two.test' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('selfByCharacter', { minimumCharacters: 5, compareLocalPartOnly: true }), { Source: 'alice@example.com', Destination: 'other@example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('selfByCharacter', { minimumCharacters: 5, compareLocalPartOnly: false }), { Source: 'alice@example.com', Destination: 'other@example.com' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('selfByCharacter', { minimumCharacters: 5, requireDifferentDomain: true }), { Source: 'alice@example.com', Destination: 'alice@example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('emailSubjectFilenameObfuscation', { patterns: 'c0de', detectSubject: false, detectFileName: true, useBuiltInPatterns: false }), { Size: '1', Details: 'c0de', FileName: 'normal.pdf' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('emailSubjectFilenameObfuscation', { patterns: '', detectSubject: true, detectFileName: false, useBuiltInPatterns: true }), { Size: '1', FileName: 'p@ssword.txt', Details: 'normal' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('filenameIsExecutable', { extensions: 'exe', filenameExceptions: 'safe.exe' }), { FileName: 'safe.exe' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('filenameIsExecutable', { extensions: 'exe', matchLastExtensionOnly: false }), { FileName: 'payload.exe.pdf' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('filenameIsExecutable', { extensions: 'exe', matchLastExtensionOnly: true, detectDoubleExtension: false }), { FileName: 'invoice.pdf.exe' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('filenameIsExecutable', { extensions: 'exe' }), { FileName: 'invoice.pdf.exe' }), true);
const duplicateFiles = Array.from({ length: 10 }, () => 'same.pdf').join(';');
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('multipleAttachmentsSpecificDestination', { minimumAttachments: 10, domains: 'example.com', countUniqueFiles: true }), { FileName: duplicateFiles, Destination: 'a@example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('multipleAttachmentsSpecificDestination', { minimumAttachments: 1, domains: 'example.com', ignoredAttachments: 'skip' }), { FileName: 'skip.pdf', Destination: 'a@example.com' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('outOfHours', { startTime: '23:00', endTime: '05:00', includeWeekend: false }), { IncidentTime: '20 Sep. 2025, 03:20:11 AM GMT+0800' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('outOfHours', { startTime: '23:00', endTime: '05:00', includeWeekend: true }), { IncidentTime: '20 Sep. 2025, 03:20:11 AM GMT+0800' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('ransomwareAttachment', { patterns: '', filenameExceptions: '!!readme!!.txt', useBuiltInHeuristics: true }), { FileName: '!!readme!!.txt' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('ransomwareAttachment', { patterns: '', useBuiltInHeuristics: false }), { FileName: '!!readme!!.txt' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('sensitiveKeywords', { keywords: 'secret', minimumHits: 2 }), { Details: 'secret and secret' }), true);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('sensitiveKeywords', { keywords: 'secret', minimumHits: 1, exceptions: 'approved secret' }), { Details: 'approved secret' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('shortSubject', { subjectLength: 15, includeEmptySubject: false }), { Channel: 'Email', Details: '' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('shortSubject', { subjectLength: 15, ignoredPrefixes: 'RE:' }), { Channel: 'Email', Details: 'RE: Hi' }), false);
assert.equal(context.RiskDetectors.matchesBuiltIn(configuredRule('weirdTld', { tlds: 'xyz', domainExceptions: 'example.xyz' }), { Destination: 'a@example.xyz' }), false);
assert.match(riskScoringPage, /field\.type === 'select'/);

console.log('Risk scoring tests passed.');
