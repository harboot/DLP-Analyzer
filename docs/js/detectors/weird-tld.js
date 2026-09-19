(function (registry) {
  'use strict';
  const DEFAULT_TLDS = 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party';
  registry.register({
    id: 'builtin-weird-tld', key: 'weirdTld', name: 'Weird TLD Dest',
    description: 'Matches destinations using one of the configured unusual top-level domains.', weight: 5,
    settings: { tlds: DEFAULT_TLDS, domainExceptions: '' }, settingFields: [{ key: 'tlds', label: 'Unusual TLD list', type: 'text' }, { key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' }],
    match(row, settings) {
      const tlds = String(settings.tlds || '').split(/[\s,;]+/).map(value => value.replace(/^\./, '').toLowerCase()).filter(Boolean);
      const exceptions = String(settings.domainExceptions ?? '').split(/[\s,;]+/).map(value => value.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
      return String(row.Destination || '').split(/[;,|]+/).some(value => {
        const normalized = value.trim().toLowerCase();
        if (exceptions.some(exception => normalized.includes(`@${exception}`) || normalized.includes(`.${exception}`) || normalized === exception)) return false;
        return tlds.some(tld => new RegExp(`\\.${tld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[>\\s])`, 'i').test(normalized));
      });
    }
  });
})(RiskDetectors);
