(function (registry) {
  'use strict';
  const DEFAULT_DOMAINS = 'unionbankph.com, gcash.com, bir.gov.ph, rcbcbankard.com, psbank.com, metrobank.com, chinabank.ph, securitybank.com.ph';
  function domains(value) {
    return String(value || '').split(/[;,|\s]+/).map(token => {
      let domain = token.trim().replace(/^[<"\[]+|[>"\]]+$/g, '').replace(/^[a-z][\w+.-]*:\/*/i, '');
      const at = domain.lastIndexOf('@'); if (at !== -1) domain = domain.slice(at + 1);
      domain = domain.split(/[/?#]/, 1)[0];
      return domain.replace(/:\d+$/, '').replace(/^[<"\[.]+|[>"\].]+$/g, '').toLowerCase();
    }).filter(Boolean);
  }
  registry.register({
    id: 'builtin-destination-competitor', key: 'destinationCompetitor', name: 'Destination is Competitor',
    description: 'Matches destination addresses and URLs whose domain is a configured competitor domain or one of its subdomains.', weight: 7,
    settings: { domains: DEFAULT_DOMAINS, domainExceptions: '', matchSubdomains: true }, settingFields: [
      { key: 'domains', label: 'Competitor domain list', type: 'textarea' },
      { key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' },
      { key: 'matchSubdomains', label: 'Match subdomains', type: 'checkbox' }
    ],
    match(row, settings) {
      const targets = String(settings.domains || '').split(/[\s,;]+/).map(value => value.trim().replace(/^\.+|\.+$/g, '').toLowerCase()).filter(Boolean);
      const exceptions = String(settings.domainExceptions ?? '').split(/[\s,;]+/).map(value => value.trim().replace(/^\.+|\.+$/g, '').toLowerCase()).filter(Boolean);
      return domains(row.Destination).some(domain => !exceptions.some(exception => domain === exception || domain.endsWith(`.${exception}`)) && targets.some(target => domain === target || (settings.matchSubdomains !== false && domain.endsWith(`.${target}`))));
    }
  });
})(RiskDetectors);
