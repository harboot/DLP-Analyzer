(function (registry) {
  'use strict';
  function localPart(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].split('@')[0].split('+')[0].toLowerCase().replace(/[\s._-]+/g, '') : '';
  }
  function domain(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
    return match ? match[1].toLowerCase().replace(/^\.+|\.+$/g, '') : '';
  }
  registry.register({
    id: 'builtin-self', key: 'self', name: 'Email Sent to Self',
    description: 'Matches email alerts when a recipient address resembles the sender address.', weight: 6,
    settings: { minimumLocalPartLength: 1, requireDifferentDomain: false },
    settingFields: [{ key: 'minimumLocalPartLength', label: 'Minimum local-part length', type: 'number', min: 1, max: 320 }, { key: 'requireDifferentDomain', label: 'Require a different domain', type: 'checkbox' }],
    match(row, settings) {
      const source = localPart(row.Source);
      const sourceDomain = domain(row.Source);
      const minimum = Math.max(1, Math.floor(Number(settings.minimumLocalPartLength ?? 1) || 1));
      return source.length >= minimum && String(row.Destination || '').split(/[;,|]+/).some(value => localPart(value) === source && (settings.requireDifferentDomain !== true || (!!domain(value) && domain(value) !== sourceDomain)));
    }
  });
})(RiskDetectors);
