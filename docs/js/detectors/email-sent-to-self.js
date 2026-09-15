(function (registry) {
  'use strict';
  function localPart(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].split('@')[0].split('+')[0].toLowerCase().replace(/[\s._-]+/g, '') : '';
  }
  registry.register({
    id: 'builtin-self', key: 'self', name: 'Email Sent to Self',
    description: 'Matches email alerts when a recipient address resembles the sender address.', weight: 6, settings: {},
    match(row) {
      const source = localPart(row.Source);
      return !!source && String(row.Destination || '').split(/[;,|]+/).some(value => localPart(value) === source);
    }
  });
})(RiskDetectors);
