(function (registry) {
  'use strict';

  const DEFAULT_DOMAINS = 'gmail.com, yahoo.*, outlook.*';
  const IGNORED_ATTACHMENTS = ['outlook', 'image.png', '_payroll'];

  function monitored(domain, patterns) {
    return patterns.some(pattern => {
      const normalized = pattern.replace(/^@/, '').toLowerCase();
      if (normalized.endsWith('.*')) return domain === normalized.slice(0, -2) || domain.startsWith(`${normalized.slice(0, -1)}`);
      return domain === normalized || domain.endsWith(`.${normalized}`);
    });
  }

  registry.register({
    id: 'builtin-multiple-attachments-specific-destination',
    key: 'multipleAttachmentsSpecificDestination',
    name: 'Multiple Attachment specific Destination',
    description: 'Matches alerts with at least the configured number of attachments sent to a monitored destination domain. Outlook artifacts, image.png, and _payroll filenames are ignored.',
    weight: 7,
    settings: { minimumAttachments: 10, domains: DEFAULT_DOMAINS },
    settingFields: [
      { key: 'minimumAttachments', label: 'Minimum number of attachments', type: 'number', min: 1, max: 1000 },
      { key: 'domains', label: 'Monitored destination domain list', type: 'textarea' }
    ],
    match(row, settings) {
      const minimum = Math.max(1, Math.floor(Number(settings.minimumAttachments) || 10));
      const attachmentCount = String(row.FileName || '').split(';').map(value => value.trim()).filter(value => value && !IGNORED_ATTACHMENTS.some(ignored => value.toLowerCase().includes(ignored))).length;
      if (attachmentCount < minimum) return false;
      const patterns = String(settings.domains ?? DEFAULT_DOMAINS).split(/[\n,;\s]+/).map(value => value.trim()).filter(Boolean);
      if (!patterns.length) return false;
      return String(row.Destination || '').split(';').map(value => value.trim()).filter(Boolean).some(destination => {
        const match = /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/.exec(destination);
        return !!match && monitored(match[1].toLowerCase(), patterns);
      });
    }
  });
})(RiskDetectors);
