(function (registry) {
  'use strict';
  const DEFAULT_REGEX = String.raw`\.(locked|encrypted|enc|crypt|crypted|crypt0|crypt1|cryp|crpt|lock|crypto|cipher|crypted-files|encrypted-files|vault|enc[0-9a-z]{2,8})$`;
  registry.register({
    id: 'builtin-ransomware-attachment', key: 'ransomwareAttachment', name: 'Attachment Looks Like Ransomware Notes or Encryption',
    description: 'Matches attachment names that resemble ransomware notes or encrypted files.', weight: 8,
    settings: { encExtRegex: DEFAULT_REGEX }, settingFields: [{ key: 'encExtRegex', label: 'Encrypted extension regular expression', type: 'textarea' }],
    match(row, settings) {
      const names = String(row.FileName || '').split(/[\n\r;,|]+/).map(value => value.trim()).filter(Boolean);
      const note = /\b(read[_\- ]?me|how[_\-\s]?to(?:[_\-\s]?(decrypt|restore|recover|recover_files|restore_files))|howto[_\-\s]?(decrypt|restore|recover)|decrypt(?:ion)?|decryption|restore(?:_files)?|recover(?:_files)?|ransom|ransomware|!!!|_readme)\b/i;
      const phrase = /\b(files[_\-\s]?(are[_\-\s])?encrypted|your[_\-\s]?files|restore[_\-\s]?your[_\-\s]?files|recover[_\-\s]?your[_\-\s]?files|decrypt_your_files)\b/i;
      let extension; try { extension = new RegExp(String(settings.encExtRegex || DEFAULT_REGEX), 'i'); } catch (_) { extension = new RegExp(DEFAULT_REGEX, 'i'); }
      return names.some(name => {
        if (note.test(name) || phrase.test(name) || extension.test(name)) return true;
        if (/\.(txt|htm|html|hta|url)$/i.test(name) && /(read[_\-\s]?me|how[_\-\s]?to|decrypt|restore|recover|ransom)/i.test(name)) return true;
        if (/[!]{2,}/.test(name) || /_+readme/i.test(name) || /\b(encrypted|locked|lockedfiles|locked_files)\b/i.test(name)) return true;
        const idExtension = name.match(/\.([0-9a-fA-F]{6,12}|[0-9a-zA-Z]{6,12})$/);
        return !!idExtension && (name.match(/\./g) || []).length >= 2;
      });
    }
  });
})(RiskDetectors);
