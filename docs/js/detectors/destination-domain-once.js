(function (registry) {
  'use strict';
  const cache = new WeakMap();
  function domains(value) {
    const pattern = /^[^@\s]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
    return String(value || '').split(/;+/).map(part => pattern.exec(part.trim())).filter(Boolean).map(match => match[1].toLowerCase());
  }
  function frequencies(rows) {
    if (!Array.isArray(rows)) return new Map(); const cached = cache.get(rows); if (cached) return cached;
    const result = new Map();
    for (const row of rows) for (const domain of domains(row && row.Destination)) result.set(domain, (result.get(domain) || 0) + 1);
    cache.set(rows, result); return result;
  }
  registry.register({
    id: 'builtin-destination-domain-once', key: 'destinationDomainOnce', name: 'Destination Domain appears Once in Dataset',
    description: 'Matches destinations whose email domain occurs no more than the configured number of times across the loaded dataset.', weight: 5,
    settings: { maximumOccurrences: 1, domainExceptions: '', minimumDatasetSize: 0 },
    settingFields: [
      { key: 'maximumOccurrences', label: 'Maximum domain occurrences', type: 'number', min: 1, max: 1000000 },
      { key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' },
      { key: 'minimumDatasetSize', label: 'Minimum dataset size', type: 'number', min: 0, max: 1000000 }
    ],
    match(row, settings, rows) {
      const minimumSize = Math.max(0, Math.floor(Number(settings.minimumDatasetSize ?? 0) || 0));
      if (!Array.isArray(rows) || rows.length < minimumSize) return false;
      const maximum = Math.max(1, Math.floor(Number(settings.maximumOccurrences ?? 1) || 1));
      const exceptions = String(settings.domainExceptions ?? '').split(/[\s,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      return domains(row.Destination).some(domain => !exceptions.some(exception => domain === exception || domain.endsWith(`.${exception}`)) && (frequencies(rows).get(domain) || 0) <= maximum);
    }
  });
})(RiskDetectors);
