(function (registry) {
  'use strict';

  const EXECUTABLE_EXTENSIONS = [
    'exe', 'bat', 'ps1', 'psm1', 'cmd', 'com', 'msi', 'msp', 'mst', 'scr', 'pif',
    'cpl', 'hta', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'jar', 'py', 'pyw',
    'rb', 'sh', 'bash', 'run', 'bin', 'command', 'app', 'apk', 'dmg', 'pkg', 'deb',
    'rpm', 'reg', 'inf', 'scf', 'lnk', 'iso', 'img', 'gadget', 'txt'
  ];

  registry.register({
    id: 'builtin-filename-is-executable',
    key: 'filenameIsExecutable',
    name: 'Filename is Executable',
    description: 'Matches attachment names with executable, script, installer, disk-image, shortcut, or text-file extensions.',
    weight: 6,
    settings: { extensions: EXECUTABLE_EXTENSIONS.join(', ') },
    settingFields: [{ key: 'extensions', label: 'File extension list', type: 'textarea' }],
    match(row, settings) {
      const filenames = String(row.FileName || '');
      const extensions = new Set(String(settings.extensions ?? EXECUTABLE_EXTENSIONS.join(', ')).split(/[\n,;\s]+/).map(value => value.trim().replace(/^\./, '').toLowerCase()).filter(Boolean));
      const extension = /\.([a-z0-9]{1,12})(?=[\s;,\)\]\("'\r\n]|$)/ig;
      let match;
      while ((match = extension.exec(filenames)) !== null) {
        if (extensions.has(match[1].toLowerCase())) return true;
      }
      return false;
    }
  });
})(RiskDetectors);
