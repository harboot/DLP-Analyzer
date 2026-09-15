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
    description: 'Matches destinations whose email domain occurs exactly once across the loaded dataset.', weight: 5, settings: {},
    match(row, settings, rows) { return domains(row.Destination).some(domain => frequencies(rows).get(domain) === 1); }
  });
})(RiskDetectors);
