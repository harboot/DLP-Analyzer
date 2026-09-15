(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-no-extension', key: 'noExtension', name: 'Attachment No Ext',
    description: 'Matches alerts containing at least one attachment without a file extension.', weight: 4, settings: {},
    match(row) { return String(row.FileName || '').split(/[;\n,|]+/).map(value => value.trim()).filter(Boolean).some(name => !/(^|\/)\.?[^/]+\.[A-Za-z0-9]{1,16}(?:\s*\([^)]*\))?$/.test(name)); }
  });
})(RiskDetectors);
