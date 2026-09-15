(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-short-subject', key: 'shortSubject', name: 'Short Subject',
    description: 'Matches email alerts with an empty subject or a subject shorter than the configured length.', weight: 3,
    settings: { subjectLength: 15 }, settingFields: [{ key: 'subjectLength', label: 'Maximum subject length', type: 'number', min: 1, max: 200 }],
    match(row, settings) { return String(row.Channel || '').toLowerCase().includes('email') && String(row.Details || '').trim().length < Number(settings.subjectLength ?? 15); }
  });
})(RiskDetectors);
