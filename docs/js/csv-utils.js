(function (global) {
  'use strict';

  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const input = String(text ?? '').replace(/^\uFEFF/, '');

    for (let index = 0; index < input.length; index++) {
      const character = input[index];
      if (quoted) {
        if (character === '"' && input[index + 1] === '"') {
          field += '"';
          index++;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field === '') {
        quoted = true;
      } else if (character === ',') {
        row.push(field);
        field = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && input[index + 1] === '\n') index++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(values => values.some(value => value !== ''));
  }

  function parseText(text, options = {}) {
    const rows = parseRows(text);
    if (!options.header) return rows;
    const headers = rows.shift() || [];
    const records = rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
    Object.defineProperty(records, 'headers', { value: headers });
    return records;
  }

  global.CSVUtils = Object.freeze({
    async parseFile(file, options) {
      const name = String(file?.name || '');
      const type = String(file?.type || '').toLowerCase();
      if (!/\.csv$/i.test(name) && !type.includes('csv')) {
        throw new Error('Only CSV files are supported.');
      }
      return parseText(await file.text(), Object.assign({ header: true }, options));
    },
    parseText(text, options) {
      return Promise.resolve(parseText(text, Object.assign({ header: false }, options)));
    }
  });
})(window);
