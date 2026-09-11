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

  function findMissingColumns(rows, expectedColumns) {
    const available = new Set();
    (Array.isArray(rows?.headers) ? rows.headers : []).forEach(key => available.add(String(key).trim().toLowerCase()));
    (Array.isArray(rows) ? rows : []).forEach(row => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach(key => available.add(key.trim().toLowerCase()));
    });
    return (expectedColumns || []).filter(column => !available.has(String(column).trim().toLowerCase()));
  }

  function showUploadWarning(element, missingByFile) {
    if (!element) return;
    const entries = (missingByFile || []).filter(entry => entry.missing?.length);
    element.replaceChildren();
    element.hidden = entries.length === 0;
    if (!entries.length) return;

    const strong = document.createElement('strong');
    strong.textContent = 'Missing expected columns: ';
    element.appendChild(strong);
    const columns = document.createElement('code');
    columns.textContent = [...new Set(entries.flatMap(entry => entry.missing))].join(', ');
    element.appendChild(columns);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'upload-warning-close';
    close.setAttribute('aria-label', 'Close missing-column warning');
    close.textContent = '×';
    close.addEventListener('click', () => { element.hidden = true; });
    element.appendChild(close);
  }

  function copyIconSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
  }

  function showCopyPreview(cells) {
    document.querySelector('.copy-preview')?.remove();
    const preview = document.createElement('aside');
    preview.className = 'copy-preview';
    preview.setAttribute('role', 'status');
    preview.innerHTML = '<div class="copy-preview-header"><strong>Copied information</strong><button type="button" class="copy-preview-close" aria-label="Close copy preview">×</button></div>';
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    cells.forEach(([label, value]) => {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      const cell = document.createElement('td');
      heading.textContent = toText(label);
      cell.textContent = toText(value);
      row.append(heading, cell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    preview.appendChild(table);
    preview.querySelector('.copy-preview-close').addEventListener('click', () => preview.remove());
    document.body.appendChild(preview);
  }

  global.DLPUtils = Object.freeze({
    query,
    queryAll,
    toText,
    escapeHtml,
    sanitizeForTSV,
    findMissingColumns,
    showUploadWarning,
    copyIconSvg,
    showCopyPreview
  });
})(window);
