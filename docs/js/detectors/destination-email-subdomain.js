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
    settings: { domainExceptions: DEFAULT_EXCEPTIONS, minimumSubdomainLabels: 2, minimumLabelLength: 4 },
    settingFields: [{ key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' }, { key: 'minimumSubdomainLabels', label: 'Minimum substantial domain labels', type: 'number', min: 1, max: 20 }, { key: 'minimumLabelLength', label: 'Minimum domain label length', type: 'number', min: 1, max: 63 }],
    match(row, settings) {
      const exceptions = String(settings.domainExceptions ?? DEFAULT_EXCEPTIONS).split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const minimumLabels = Math.max(1, Math.floor(Number(settings.minimumSubdomainLabels ?? 2) || 2));
      const minimumLength = Math.max(1, Math.floor(Number(settings.minimumLabelLength ?? 4) || 4));
      return domains(row.Destination).some(domain => !exceptions.some(exception => domain === exception || domain.endsWith(`.${exception}`) || domain.includes(exception)) && domain.split('.').slice(0, -1).filter(label => label.length >= minimumLength).length >= minimumLabels);
    }
  });
})(RiskDetectors);
