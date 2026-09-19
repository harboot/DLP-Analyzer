(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-no-extension', key: 'noExtension', name: 'Attachment No Ext',
    description: 'Matches alerts containing at least one attachment without a file extension.', weight: 4,
    settings: { ignoredNames: '', ignoredPatterns: '' },
    settingFields: [
      { key: 'ignoredNames', label: 'Ignored filename list', type: 'textarea' },
      { key: 'ignoredPatterns', label: 'Ignored filename patterns', type: 'textarea' }
    ],
    match(row, settings) {
      const names = String(settings.ignoredNames ?? '').split(/[;\n,|]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const patterns = String(settings.ignoredPatterns ?? '').split(/[;\n,|]+/).map(value => value.trim()).filter(Boolean).map(value => new RegExp(`^${value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i'));
      return String(row.FileName || '').split(/[;\n,|]+/).map(value => value.trim()).filter(Boolean).some(name => !names.includes(name.toLowerCase()) && !patterns.some(pattern => pattern.test(name)) && !/(^|\/)\.?[^/]+\.[A-Za-z0-9]{1,16}(?:\s*\([^)]*\))?$/.test(name));
    }
  });
})(RiskDetectors);
