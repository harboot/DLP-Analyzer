(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-self-by-character', key: 'selfByCharacter', name: 'Email Sent to Self (by character)',
    description: 'Matches email alerts when the sender and destination share a sequence of the configured number of letters.', weight: 6,
    settings: { minimumCharacters: 5 }, settingFields: [{ key: 'minimumCharacters', label: 'Minimum matching characters', type: 'number', min: 1, max: 200 }],
    match(row, settings) {
      const isEmail = String(row.Channel || '').toLowerCase().includes('email') || /@/.test(String(row.Destination || '')) || /@/.test(String(row.Source || ''));
      if (!isEmail) return false;
      const clean = value => String(value || '').replace(/[^A-Za-z]+/g, '').toLowerCase();
      const source = clean(row.Source);
      const destination = clean(row.Destination);
      const minimum = Math.max(1, Math.floor(Number(settings.minimumCharacters) || 5));
      if (source.length < minimum || destination.length < minimum) return false;
      const sourceSequences = new Set();
      for (let index = 0; index <= source.length - minimum; index++) sourceSequences.add(source.slice(index, index + minimum));
      for (let index = 0; index <= destination.length - minimum; index++) if (sourceSequences.has(destination.slice(index, index + minimum))) return true;
      return false;
    }
  });
})(RiskDetectors);
