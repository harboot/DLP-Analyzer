(function (registry) {
  'use strict';
  const DEFAULT_KEYWORDS = 'extraction, export, dump, backup, customer list, client list, employee list, payroll, salary, credential, password, confidential, restricted, secret, database, db dump, account list, user list, master list, migration, bulk, batch, archive, api key, credit card';
  registry.register({
    id: 'builtin-sensitive-keywords', key: 'sensitiveKeywords', name: 'Sensitive Keywords',
    description: 'Matches selected email fields when they contain one or more configured sensitive-data keywords.', weight: 7,
    settings: { keywords: DEFAULT_KEYWORDS, detectFileName: true, detectSubject: true, minimumHits: 1, exceptions: '' },
    settingFields: [{ key: 'keywords', label: 'Sensitive keyword list', type: 'textarea' }, { key: 'detectFileName', label: 'Detect in attachment filename', type: 'checkbox' }, { key: 'detectSubject', label: 'Detect in email subject', type: 'checkbox' }, { key: 'minimumHits', label: 'Minimum keyword hits', type: 'number', min: 1, max: 1000 }, { key: 'exceptions', label: 'Text exception list', type: 'textarea' }],
    match(row, settings) {
      const keywords = String(settings.keywords ?? DEFAULT_KEYWORDS).split(/[\n,;]+/).map(keyword => keyword.trim()).filter(Boolean);
      if (!keywords.length) return false;
      const source = keywords.map(keyword => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s_-]+/g, '[\\s_-]+')).join('|');
      const pattern = new RegExp(`(?:^|\\b)(?:${source})(?:\\b|$)`, 'gi'); const values = [];
      if (settings.detectSubject !== false) values.push(row.Details || '');
      if (settings.detectFileName !== false) values.push(row.FileName || '');
      const exceptions = String(settings.exceptions ?? '').split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const text = values.filter(value => !exceptions.some(exception => String(value).toLowerCase().includes(exception))).join(' ');
      return Array.from(text.matchAll(pattern)).length >= Math.max(1, Math.floor(Number(settings.minimumHits ?? 1) || 1));
    }
  });
})(RiskDetectors);
