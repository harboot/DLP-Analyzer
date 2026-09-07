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

  global.CSVUtils = Object.freeze({
    parseFile(file, options) {
      return parse(file, Object.assign({ header: true }, options));
    },
    parseText(text, options) {
      return parse(String(text ?? ''), Object.assign({ header: false }, options));
    }
  });
})(window);
