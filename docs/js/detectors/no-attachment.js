(function (registry) {
  'use strict';

  const DEFAULT_NEGATIVE_VALUES = '-, n/a, na, none, no, no attachment, no attachments, not provided, nil, unknown';

  function negativeValues(value) {
    return String(value ?? '').split(/[;,|\n]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
  }

  registry.register({
    id: 'builtin-no-attachment', key: 'noAttachment', name: 'No Attachment',
    description: 'Matches alerts whose attachment field is empty or contains only configured no-attachment markers.', weight: 4,
    settings: { negativeValues: DEFAULT_NEGATIVE_VALUES, treatEmptyAsNoAttachment: true },
    settingFields: [
      { key: 'negativeValues', label: 'No-attachment value list', type: 'textarea' },
      { key: 'treatEmptyAsNoAttachment', label: 'Treat an empty filename as no attachment', type: 'checkbox' }
    ],
    match(row, settings) {
      const markers = new Set(negativeValues(settings.negativeValues ?? DEFAULT_NEGATIVE_VALUES));
      const groups = String(row.FileName ?? '').split(/[;,|\n]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
      if (!groups.length) return settings.treatEmptyAsNoAttachment !== false;
      return groups.every(group => markers.has(group) || group.split('/').map(item => item.trim()).filter(Boolean).every(item => markers.has(item)));
    }
  });
})(RiskDetectors);
