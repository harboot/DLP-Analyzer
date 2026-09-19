(function (registry) {
  'use strict';

  const EXECUTABLE_EXTENSIONS = [
    'exe', 'bat', 'ps1', 'psm1', 'cmd', 'com', 'msi', 'msp', 'mst', 'scr', 'pif',
    'cpl', 'hta', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'jar', 'py', 'pyw',
    'rb', 'sh', 'bash', 'run', 'bin', 'command', 'app', 'apk', 'dmg', 'pkg', 'deb',
    'rpm', 'reg', 'inf', 'scf', 'lnk', 'iso', 'img', 'gadget'
  ];

  registry.register({
    id: 'builtin-filename-is-executable',
    key: 'filenameIsExecutable',
    name: 'Filename is Executable',
    description: 'Matches attachment names with executable, script, installer, disk-image, or shortcut extensions.',
    weight: 6,
    settings: { extensions: EXECUTABLE_EXTENSIONS.join(', '), filenameExceptions: '', matchLastExtensionOnly: true, detectDoubleExtension: true },
    settingFields: [{ key: 'extensions', label: 'File extension list', type: 'textarea' }, { key: 'filenameExceptions', label: 'Filename exception list', type: 'textarea' }, { key: 'matchLastExtensionOnly', label: 'Match the last extension only', type: 'checkbox' }, { key: 'detectDoubleExtension', label: 'Detect double extensions', type: 'checkbox' }],
    match(row, settings) {
      const extensions = new Set(String(settings.extensions ?? EXECUTABLE_EXTENSIONS.join(', ')).split(/[\n,;\s]+/).map(value => value.trim().replace(/^\./, '').toLowerCase()).filter(Boolean));
      const exceptions = String(settings.filenameExceptions ?? '').split(/[\n;,|]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      return String(row.FileName || '').split(/[\n;,|]+/).map(value => value.trim().replace(/\s*\([^)]*\)\s*$/, '')).filter(Boolean).some(filename => {
        if (exceptions.some(exception => filename.toLowerCase() === exception)) return false;
        const matches = Array.from(filename.matchAll(/\.([a-z0-9]{1,12})/ig), match => match[1].toLowerCase());
        if (!matches.length || (settings.detectDoubleExtension === false && matches.length > 1)) return false;
        return settings.matchLastExtensionOnly !== false ? extensions.has(matches[matches.length - 1]) : matches.some(extension => extensions.has(extension));
      });
    }
  });
})(RiskDetectors);
