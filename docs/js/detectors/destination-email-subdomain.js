(function (registry) {
  'use strict';
  function domains(value) {
    const pattern = /^[^@\s]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
    return String(value || '').split(/;+/).map(part => pattern.exec(part.trim())).filter(Boolean).map(match => match[1].toLowerCase());
  }
  registry.register({
    id: 'builtin-destination-email-subdomain', key: 'destinationEmailSubdomain', name: 'Destination Email using Subdomain',
    description: 'Matches destination email domains that contain at least two substantial labels before the top-level domain.', weight: 5, settings: {},
    match(row) {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      return domains(row.Destination).some(domain => !['onmicrosoft', 'salesforce', 'imcap', 'landbank.com'].some(exception => domain.includes(exception)) && domain.split('.').slice(0, -1).filter(label => label.length >= 4).length >= 2);
    }
  });
})(RiskDetectors);
