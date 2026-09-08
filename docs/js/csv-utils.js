(function (global) {
  'use strict';

  if (!global.Papa) {
    throw new Error('CSVUtils requires Papa Parse to be loaded first.');
  }

  const DEFAULTS = Object.freeze({
    dynamicTyping: false,
    skipEmptyLines: true,
    worker: true
  });

  function parse(input, options) {
    const config = Object.assign({}, DEFAULTS, options);

    return new Promise((resolve, reject) => {
      global.Papa.parse(input, Object.assign({}, config, {
        complete(results) {
          resolve(results.data);
        },
        error(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }));
    });
  }

  function isExcelFile(file) {
    return /\.xlsx$/i.test(String(file?.name || '')) ||
      file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  async function parseExcelFile(file) {
    if (!global.XLSX) {
      throw new Error('Excel support requires lib/xlsx.full.min.js.');
    }

    const workbook = global.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    return global.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      defval: '',
      raw: false
    });
  }

  global.CSVUtils = Object.freeze({
    parseFile(file, options) {
      if (isExcelFile(file)) return parseExcelFile(file);
      return parse(file, Object.assign({ header: true }, options));
    },
    parseText(text, options) {
      return parse(String(text ?? ''), Object.assign({ header: false }, options));
    }
  });
})(window);
