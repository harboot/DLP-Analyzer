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

  function isExcelFile(file) {
    return /\.xlsx$/i.test(String(file?.name || '')) ||
      file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  async function parseExcelFile(file) {
    if (!global.XLSX) throw new Error('Excel support requires lib/xlsx.full.min.js.');
    const workbook = global.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    const records = global.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const headerRows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false });
    Object.defineProperty(records, 'headers', { value: headerRows[0] || [] });
    return records;
  }

  global.CSVUtils = Object.freeze({
    async parseFile(file, options) {
      if (isExcelFile(file)) return parseExcelFile(file);
      return parseText(await file.text(), Object.assign({ header: true }, options));
    },
    parseText(text, options) {
      return Promise.resolve(parseText(text, Object.assign({ header: false }, options)));
    }
  });
})(window);
