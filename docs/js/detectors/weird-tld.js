(function (registry) {
  'use strict';
  const DEFAULT_TLDS = 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party';
  registry.register({
    id: 'builtin-weird-tld', key: 'weirdTld', name: 'Weird TLD Dest',
    description: 'Matches destinations using one of the configured unusual top-level domains.', weight: 5,
    settings: { tlds: DEFAULT_TLDS }, settingFields: [{ key: 'tlds', label: 'Unusual TLD list', type: 'text' }],
    match(row, settings) {
      const tlds = String(settings.tlds || '').split(/[\s,;]+/).map(value => value.replace(/^\./, '').toLowerCase()).filter(Boolean);
      return String(row.Destination || '').split(/[;,|]+/).some(value => tlds.some(tld => new RegExp(`\\.${tld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[>\\s])`, 'i').test(value.trim())));
    }
  });
})(RiskDetectors);
