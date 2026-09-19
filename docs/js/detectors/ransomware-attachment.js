(function (registry) {
  'use strict';
  const DEFAULT_PATTERNS = '.locked, .encrypted, .enc, .enc*, .crypt, .crypted, .crypt0, .crypt1, .cryp, .crpt, .lock, .crypto, .cipher, .crypted-files, .encrypted-files, .vault, readme, how to decrypt, how to restore, how to recover, decrypt, decryption, restore files, recover files, ransom, ransomware, files encrypted, your files, locked files';
  registry.register({
    id: 'builtin-ransomware-attachment', key: 'ransomwareAttachment', name: 'Attachment Looks Like Ransomware Notes or Encryption',
    description: 'Matches attachment names that resemble ransomware notes or encrypted files.', weight: 8,
    settings: { patterns: DEFAULT_PATTERNS, filenameExceptions: '', useBuiltInHeuristics: true }, settingFields: [{ key: 'patterns', label: 'Detected filename pattern list', type: 'textarea' }, { key: 'filenameExceptions', label: 'Filename exception list', type: 'textarea' }, { key: 'useBuiltInHeuristics', label: 'Use built-in ransomware heuristics', type: 'checkbox' }],
    match(row, settings) {
      const names = String(row.FileName || '').split(/[\n\r;,|]+/).map(value => value.trim()).filter(Boolean);
      const patterns = String(settings.patterns ?? DEFAULT_PATTERNS).split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const exceptions = String(settings.filenameExceptions ?? '').split(/[\n,;|]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      return names.some(name => {
        if (exceptions.includes(name.toLowerCase())) return false;
        const normalized = name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
        if (patterns.some(pattern => {
          if (!pattern.startsWith('.')) return normalized.includes(pattern.replace(/[_-]+/g, ' '));
          return pattern.endsWith('*') ? normalized.slice(normalized.lastIndexOf('.')).startsWith(pattern.slice(0, -1)) : normalized.endsWith(pattern);
        })) return true;
        if (settings.useBuiltInHeuristics === false) return false;
        if (/[!]{2,}/.test(name) || /_+readme/i.test(name) || /\b(encrypted|locked|lockedfiles|locked_files)\b/i.test(name)) return true;
        const idExtension = name.match(/\.([0-9a-fA-F]{6,12}|[0-9a-zA-Z]{6,12})$/);
        return !!idExtension && (name.match(/\./g) || []).length >= 2;
      });
    }
  });
})(RiskDetectors);
