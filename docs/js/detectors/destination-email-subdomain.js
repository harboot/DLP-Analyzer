(function (registry) {
  'use strict';
  const DEFAULT_EXCEPTIONS = 'onmicrosoft, salesforce, imcap, landbank.com';
  function domains(value) {
    const pattern = /^[^@\s]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
    return String(value || '').split(/;+/).map(part => pattern.exec(part.trim())).filter(Boolean).map(match => match[1].toLowerCase());
  }
  registry.register({
    id: 'builtin-destination-email-subdomain', key: 'destinationEmailSubdomain', name: 'Destination Email using Subdomain',
    description: 'Matches destination email domains that contain at least two substantial labels before the top-level domain, excluding configured domains.', weight: 5,
    settings: { domainExceptions: DEFAULT_EXCEPTIONS },
    settingFields: [{ key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' }],
    match(row, settings) {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      const exceptions = String(settings.domainExceptions ?? DEFAULT_EXCEPTIONS).split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      return domains(row.Destination).some(domain => !exceptions.some(exception => domain === exception || domain.endsWith(`.${exception}`) || domain.includes(exception)) && domain.split('.').slice(0, -1).filter(label => label.length >= 4).length >= 2);
    }
  });
})(RiskDetectors);
