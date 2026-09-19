(function (registry) {
  'use strict';

  const CUES = [
    'p@ss', 'pa$$', 'p4ss', 'p4$$', 'p455', 'pa55',
    'p@ssw0rd', 'p@ssword', 'p@55w0rd', 'pa55w0rd',
    'c0nfident1al', 'c0nf', 'c0nfid', 'c0nf1dent',
    's3cret', 's3cur', 's3curity',
    'cr3d', 'cr3dit', 'cr3d3ntial', 'cr3d3ntials', 'credz', 'cr3dz', 'creds',
    '4uth', '4uth0rize', '4uthenticate',
    'l0gin', 'l0g1n', '1ogin',
    't0p s3cret', 'priv8', 'pr1v', 'pr1vate'
  ];

  // These expressions also recognize punctuation inserted to evade simple keyword rules.
  const OBFUSCATED_TERMS = [
    /p[@a4]\W*[s$5]\W*[s$5](?:\W*w\W*[o0]\W*r\W*d)?/,
    /c\W*[o0]\W*n\W*f(?:\W*[i1]\W*d\W*[e3]\W*n\W*t\W*[i1]\W*a\W*l)?/,
    /s\W*[e3]\W*c\W*r\W*[e3]\W*t/,
    /c\W*r\W*[e3]\W*d(?:\W*[e3]\W*n\W*t\W*[i1]\W*a\W*l\W*s?)?/,
    /[a4]\W*u\W*t\W*h(?:\W*[e3]\W*n\W*t\W*[i1]\W*c\W*a\W*t\W*[e3])?/,
    /[l1]\W*[o0]\W*g\W*[i1]\W*n/,
    /pr\W*[i1]\W*v(?:\W*a\W*t\W*[e3])?/
  ];

  registry.register({
    id: 'builtin-email-subject-filename-obfuscation',
    key: 'emailSubjectFilenameObfuscation',
    name: 'Email Subject or Filename Obfuscation',
    description: 'Matches leetspeak and punctuation-obfuscated sensitive terms in email subjects or attachment filenames.',
    weight: 7,
    settings: { patterns: CUES.join(', '), detectSubject: true, detectFileName: true, useBuiltInPatterns: true },
    settingFields: [{ key: 'patterns', label: 'Obfuscation pattern list', type: 'textarea' }, { key: 'detectSubject', label: 'Detect in email subject', type: 'checkbox' }, { key: 'detectFileName', label: 'Detect in attachment filename', type: 'checkbox' }, { key: 'useBuiltInPatterns', label: 'Use built-in obfuscation patterns', type: 'checkbox' }],
    match(row, settings) {
      const sizeRaw = String(row.Size || '');
      const sizeMatch = sizeRaw.match(/\d+(?:\.\d+)?(?:E\+?\d+)?/);
      if (!sizeMatch || !Number.isFinite(Number(sizeMatch[0]))) return false;

      const subject = settings.detectSubject !== false ? String(row.Details || '').toLowerCase() : '';
      const fileName = settings.detectFileName !== false ? String(row.FileName || '').toLowerCase() : '';
      const text = `${subject} ${fileName}`.normalize('NFKC');
      const cues = String(settings.patterns ?? CUES.join(', ')).split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      if (cues.some(cue => text.includes(cue))) return true;
      return settings.useBuiltInPatterns !== false && OBFUSCATED_TERMS.some(pattern => {
        const match = pattern.exec(text);
        return !!match && /[@$013458]|[\W_]/.test(match[0]);
      });
    }
  });
})(RiskDetectors);
