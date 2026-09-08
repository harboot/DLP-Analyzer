(function (global) {
  'use strict';

  function query(selector, root = document) {
    return root.querySelector(selector);
  }

  function queryAll(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function toText(value) {
    return value == null ? '' : String(value);
  }

  function escapeHtml(value) {
    return toText(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function sanitizeForTSV(value) {
    return toText(value).replace(/\t/g, ' ').replace(/[\r\n]/g, ' ');
  }

  global.DLPUtils = Object.freeze({
    query,
    queryAll,
    toText,
    escapeHtml,
    sanitizeForTSV
  });
})(window);
