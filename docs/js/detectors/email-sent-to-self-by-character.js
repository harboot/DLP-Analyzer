(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-self-by-character', key: 'selfByCharacter', name: 'Email Sent to Self (by character)',
    description: 'Matches email alerts when the sender and destination share a sequence of the configured number of letters.', weight: 6,
    settings: { minimumCharacters: 5, compareLocalPartOnly: true, requireDifferentDomain: false }, settingFields: [
      { key: 'minimumCharacters', label: 'Minimum matching characters', type: 'number', min: 1, max: 200 },
      { key: 'compareLocalPartOnly', label: 'Compare email local parts only', type: 'checkbox' },
      { key: 'requireDifferentDomain', label: 'Require a different domain', type: 'checkbox' }
    ],
    match(row, settings) {
      const isEmail = String(row.Channel || '').toLowerCase().includes('email') || /@/.test(String(row.Destination || '')) || /@/.test(String(row.Source || ''));
      if (!isEmail) return false;
      const email = value => String(value || '').match(/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/i);
      const sourceEmail = email(row.Source); const destinationEmail = email(row.Destination);
      if (settings.requireDifferentDomain === true && (!sourceEmail || !destinationEmail || sourceEmail[2].toLowerCase() === destinationEmail[2].toLowerCase())) return false;
      const clean = value => String(value || '').replace(/[^A-Za-z]+/g, '').toLowerCase();
      const localOnly = settings.compareLocalPartOnly !== false;
      const source = clean(localOnly && sourceEmail ? sourceEmail[1] : row.Source);
      const destination = clean(localOnly && destinationEmail ? destinationEmail[1] : row.Destination);
      const minimum = Math.max(1, Math.floor(Number(settings.minimumCharacters) || 5));
      if (source.length < minimum || destination.length < minimum) return false;
      const sourceSequences = new Set();
      for (let index = 0; index <= source.length - minimum; index++) sourceSequences.add(source.slice(index, index + minimum));
      for (let index = 0; index <= destination.length - minimum; index++) if (sourceSequences.has(destination.slice(index, index + minimum))) return true;
      return false;
    }
  });
})(RiskDetectors);
