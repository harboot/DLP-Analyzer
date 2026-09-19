(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-short-subject', key: 'shortSubject', name: 'Short Subject',
    description: 'Matches email alerts with an empty subject or a subject shorter than the configured length.', weight: 3,
    settings: { subjectLength: 15, includeEmptySubject: true, ignoredPrefixes: '' }, settingFields: [{ key: 'subjectLength', label: 'Maximum subject length', type: 'number', min: 1, max: 200 }, { key: 'includeEmptySubject', label: 'Include empty subjects', type: 'checkbox' }, { key: 'ignoredPrefixes', label: 'Ignored subject prefixes', type: 'textarea' }],
    match(row, settings) {
      if (!String(row.Channel || '').toLowerCase().includes('email')) return false;
      const subject = String(row.Details || '').trim();
      if (!subject && settings.includeEmptySubject === false) return false;
      const prefixes = String(settings.ignoredPrefixes ?? '').split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      return !prefixes.some(prefix => subject.toLowerCase().startsWith(prefix)) && subject.length < Number(settings.subjectLength ?? 15);
    }
  });
})(RiskDetectors);
