/* Alert Analyzer: utils */

const ICON_COL = '__Copy';
  const VISIBLE_COLS = [ICON_COL, 'Time', 'Source', 'Policies', 'Channel', 'Destination', 'File Name', 'Size', 'Details', 'Status'];
  const ALL_COLS = ['ID', 'Incident Time', 'Event Time', 'Source', 'Policies', 'Destination', 'File Name', 'Transaction Size (KB)', 'Details', 'Status', 'Channel', 'Action', 'Severity'];
  const FILTERABLE_COLS = ['Time', 'Source', 'Policies', 'Channel', 'Destination', 'File Name', 'Details', 'Status'];

  const HEADER_LABELS = {
    [ICON_COL]: '',
    Time: 'First / Last Seen',
    Source: 'Source',
    Policies: 'Policies',
    Channel: 'Channel',
    Destination: 'Destination',
    'File Name': 'File Name',
    Size: 'Size (KB)',
    Details: 'Details',
    Status: 'Status'
  };

  const cardTooltips = {
    total: 'Total number of alerts detected',
    sources: 'Unique source accounts/devices observed',
    emaildest: 'Unique email destination domains',
    webdest: 'Unique web destination domains',
    channels: 'Communication channels where alerts were triggered',
    blocks: 'Alerts where action was Block/Quarantine',
    self: 'Suspicious: email sent to self (sender and recipient look similar)',
    freemail: 'Suspicious: recipient uses free mail provider (gmail, yahoo, protonmail, icloud)',
    shortsubj: 'Suspicious: email subject is too short or empty',
    noext: 'Suspicious: attachment has no file extension',
    seqfiles: 'Suspicious: multiple attachments with similar sequential names (e.g. file1, file2, file3)',
    sensitive: 'Suspicious: attachment or subject contains sensitive keywords (confidential, salary, password, etc.)',
    repeatdom: 'Suspicious: same user repeatedly sends to the same destination domain',
    weirdtld: 'Suspicious: destination domain with unusual TLD (.xyz, .top, .icu)',
    outofhours: 'Suspicious: email sent outside normal working hours (12AM–5AM)'
  };

  const state = { raw: [], tabs: [], activeTab: null, tabState: new Map(), datasetFiles: [] };
  const IGNORED_VALUES_KEY = 'dlpAnalyzerIgnoredValues';
  let ignoredValues = loadIgnoredValues();
  let currentFilename = '';
  let openAiApiKey = '';

  const $ = DLPUtils.query;
  const $$ = DLPUtils.queryAll;

  function parseIgnoredValues(value) {
    return String(value || '').split(/[,\n]+/).map(item => item.trim().toLowerCase()).filter(Boolean);
  }

  function loadIgnoredValues() {
    try {
      const saved = JSON.parse(localStorage.getItem(IGNORED_VALUES_KEY) || '{}');
      return { sources: parseIgnoredValues(saved.sources), destinations: parseIgnoredValues(saved.destinations) };
    } catch (_) { return { sources: [], destinations: [] }; }
  }

  function isIgnoredAlert(row) {
    const source = txt(row.Source).trim().toLowerCase();
    const destinations = splitDestParts(row.Destination).map(value => value.toLowerCase());
    return ignoredValues.sources.includes(source) || destinations.some(value => ignoredValues.destinations.includes(value));
  }

  // Sets a cookie with max-age and expires (Safari compatible)
  // Generates a safe key for a DOM ID
  function safeKey(s) {
    try {
      return btoa(unescape(encodeURIComponent(String(s)))).replace(/=+$/, '');
    } catch {
      return String(s).replace(/[^\w-]+/g, '_');
    }
  }

  // Parses a Forcepoint incident time into a Date object
  function parseIncidentTime(s) {
    if (!s) return null;
    try {
      let t = String(s);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.forEach(m => { t = t.replaceAll(m + '.', m); });
      if (t.includes(' GMT')) t = t.split(' GMT')[0];
      const d = new Date(t);
      return isNaN(d) ? null : d;
    } catch { return null; }
  }

  // Formats a Date object as yyyy-mm-dd
  function formatDateShort(d) {
    try { return d.toISOString().slice(0, 10); } catch { return ''; }
  }

  // Normalizes text into a safe single line (without newlines or tabs)
  function sanitizeForPlain(v) {
    return String(v ?? '')
      .replace(/`/g, '\u200B`')
      .replace(/\r?\n|\t/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Shared HTML escaping keeps output handling consistent across tools.
  const escapeHtml = DLPUtils.escapeHtml;

  // Normalizes a value for TSV (removes tabs and newlines)
  function sanitizeForTSV(v) {
    return String(v ?? '')
      .replace(/\r?\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Generates [key, value] pairs for one data row
  function getRowCells(row) {
    return [
      ['ID', txt(row['ID'])],
      ['Event Time', stripGMT(txt(row['Event Time']))],
      ['Channel', txt(row['Channel'])],
      ['Source/Sender', txt(row['Source'])],
      ['Destination/Recipient', txt(row['Destination'])],
      ['Document information', txt(row['File Name'])],
      ['Details', txt(row['Details'])]
    ];
  }

  // Builds an HTML table for the clipboard (Excel/Office)
  function buildRowClipboardHTML(row) {
    const cells = getRowCells(row);
    const head = `
    <style>
      table.dlp-copy { border-collapse: collapse; font-family: system-ui, Arial, sans-serif; font-size: 13px; }
      .dlp-copy th, .dlp-copy td { border:1px solid #ccc; padding:6px 8px; text-align:left; vertical-align:top; }
      .dlp-copy th { background:#f6f6f6; width:220px; }
    </style>`;
    const rows = cells.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
    return `<!doctype html><html><head>${head}</head><body><table class="dlp-copy">${rows}</table></body></html>`;
  }

  // Builds vertical TSV (key<TAB>value) for the clipboard
  function buildRowClipboardTSV(row) {
    const cells = getRowCells(row);
    const lines = cells.map(([k, v]) => `${sanitizeForTSV(k)}\t${sanitizeForTSV(v)}`);
    return lines.join('\n') + '\n';
  }

  // Copies one row to the clipboard as HTML and TSV (with fallback)
  async function copyRowToClipboard(row) {
    const html = buildRowClipboardHTML(row);
    const tsvText = buildRowClipboardTSV(row);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsvText], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        console.log('Copied: HTML table + TSV (vertical).');
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsvText);
        console.log('Copied (fallback): TSV (vertical) as plaintext.');
      } else {
        const ta = document.createElement('textarea');
        ta.value = tsvText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          console.log('Copied via execCommand (legacy).');
        } finally {
          ta.remove();
        }
      }
      DLPUtils.showCopyPreview(getRowCells(row));
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  // Converts a value to a plain string
  const txt = DLPUtils.toText;

  // Removes the " GMT..." portion from a time value
  function stripGMT(s) {
    if (!s) return '';
    const t = String(s);
    return t.includes(' GMT') ? t.split(' GMT')[0] : t;
  }

  // Extracts only the date portion from "date, time"
  function justDate(s) {
    if (!s) return '';
    return s.split(',')[0];
  }

  // Generates time-cell HTML with a tooltip and data ID
  function timeCellHTML(row) {
    const id = txt(row['ID']);
    const incD = escapeHtml(justDate(stripGMT(txt(row['Incident Time']))));
    const tooltip = timeCellPlainText(row);
    return `<a href="#" class="link copy-id" data-id="${id}" title="${escapeHtml(tooltip)}">${incD}</a>`;
  }

  // Truncates a string to a maximum length with an ellipsis
  function clip(str, lim = 120) {
    const s = String(str ?? '');
    return s.length > lim ? s.slice(0, lim - 3) + '...' : s;
  }

  // Builds a plain-text tooltip for time information
  function timeCellPlainText(row) {
    const id = txt(row['ID']);
    const incF = stripGMT(txt(row['Incident Time']));
    const evtF = stripGMT(txt(row['Event Time']));
    return `ID: ${id}\nIncident: ${incF}\nEvent: ${evtF}`;
  }

  // Generates a value-frequency map from an object array for a given key
  function freqMap(arr, key) {
    const m = new Map();
    for (const r of arr) {
      const k = txt(r[key]).trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  // Ensures all required columns exist in a data row
  function ensureCols(row) {
    const o = {};
    for (const c of ALL_COLS) o[c] = row[c] ?? '';
    return o;
  }

  // Normalizes object headers (trims key names)
  function sanitizeHeaders(row) {
    const clean = {};
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (!k) continue;
      clean[k.trim()] = row[k];
    }
    return clean;
  }

  const IGNORE_FILE_PREFIXES = ['image', 'img_', 'img-', 'image0', 'outlook-', 'signature', 'sign_', 'logo', 'scan', 'screenshot'];
  const IGNORE_PATTERNS = [
    /^att\d{2,}\.(?:png|jpe?g|gif|bmp|tiff?)$/i,
    /^cid:.+/i,
    /^noname(?:\.\w{1,6})?$/i,
    /^image\d*\.(?:png|jpe?g|gif|bmp|tiff?)$/i,
    /^screenshot ?\d*\.(?:png|jpe?g)$/i
  ];

  // Normalizes common whitespace in a string
  function normalizeSpaces(s) {
    return String(s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Splits a semicolon-delimited list intelligently (ignores delimiters inside () or [])
  function smartSplit(listStr) {
    const s = String(listStr || '');
    const out = [];
    let buf = '';
    let paren = 0, bracket = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      if (ch === ';' && paren === 0 && bracket === 0) {
        out.push(buf);
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
    return out.flatMap(t => String(t).split(/\r?\n/));
  }

  // Removes a file-size suffix from a token
  function stripSizeSuffix(s) {
    return normalizeSpaces(s)
      .replace(/\s*[-,]?\s*\(?\s*\[?\s*\d+(?:[\.,]\d+)?\s*(?:[KMGT]?B)\s*\]?\s*\)?\s*$/i, '')
      .trim();
  }

  // Checks whether a token has a file extension
  function hasExtension(token) {
    return /\.[A-Za-z0-9]{1,8}$/.test(token);
  }

  // Gets the core name (without an extension)
  function coreName(token) {
    const dot = token.lastIndexOf('.');
    return dot > 0 ? token.slice(0, dot) : token;
  }

  // Determines whether a core name should be ignored (common noisy prefixes)
  function shouldIgnoreCore(core) {
    const lc = core.toLowerCase();
    return IGNORE_FILE_PREFIXES.some(p => lc.startsWith(p));
  }

  // Determines whether a filename token should be ignored (noise)
  function shouldIgnoreToken(token) {
    const t = normalizeSpaces(token);
    if (!t) return true;
    if (!hasExtension(t) && t.length <= 2) return true;
    if (IGNORE_PATTERNS.some(rx => rx.test(t))) return true;
    if (/^(?:attachment|attached)$/i.test(t)) return true;
    const core = coreName(t);
    if (shouldIgnoreCore(core)) return true;
    return false;
  }

  // Normalizes a filename list: split, clean, filter noise, deduplicate, and join
  function normalizeFileList(fileNameCell) {
    const seen = new Set();
    const cleaned = smartSplit(fileNameCell)
      .map(t => normalizeSpaces(t.replace(/^["']|["']$/g, '')))
      .filter(Boolean)
      .map(stripSizeSuffix)
      .map(t => t.replace(/\s+\.\s+/g, '.'))
      .filter(Boolean)
      .filter(t => !shouldIgnoreToken(t))
      .filter(t => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return cleaned.join('; ');
  }

  const COMMON_PSL = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
    'co.jp', 'ne.jp', 'or.jp',
    'com.au', 'net.au', 'org.au',
    'com.sg', 'com.my',
    'co.id', 'or.id',
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
    'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk'
  ]);

// Gets the base domain from an email or host, accounting for common public suffixes.
function getBaseDomain(emailOrHost){
  if(!emailOrHost) return '';
  let host = String(emailOrHost);
  const atIx = host.lastIndexOf('@');
  if(atIx>=0) host = host.slice(atIx+1);
  if(host.includes(':')) host = host.split(':')[0];
  if(host.includes('?')) host = host.split('?')[0];
  const parts = host.split('.').filter(Boolean);
  if(parts.length <= 2) return host.toLowerCase();
  const last2 = parts.slice(-2).join('.').toLowerCase();
  if (COMMON_PSL.has(last2)) return parts.slice(-3).join('.').toLowerCase();
  return last2;
}

// Splits a destination string into clean tokens (separated by ; and ,).
function splitDestParts(dest){
  return String(dest || '')
    .split(';').map(x => x.split(','))
    .flat()
    .map(s => s.trim())
    .filter(Boolean);
}

// Checks whether a string resembles a basic email address.
function isEmailLike(s){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
}

// Freezes an object (to a limited depth) to prevent modification.
function deepFreeze(obj, maxDepth = 3, _seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object' || _seen.has(obj)) return obj;
  _seen.add(obj);
  Object.freeze(obj);
  if (maxDepth <= 0) return obj;
  for (const k of Object.keys(obj)) {
    try { deepFreeze(obj[k], maxDepth - 1, _seen); } catch {}
  }
  return obj;
}

// Compiles user code into a safe predicate with a sandbox and API allowlist.
function secureCompilePredicate(userCode, asExpressionFirst = true) {
  const SAFE_GLOBALS = {
    Math, Number, String, Boolean, RegExp, JSON, Date, Array, Object,
    isFinite, isNaN, parseInt, parseFloat, encodeURI, decodeURI,
    encodeURIComponent, decodeURIComponent
  };

  const FORBIDDEN_TOKENS =
    /(^|[^\w$])(window|document|eval|arguments|Function|fetch|XMLHttpRequest|WebSocket|EventSource|postMessage|localStorage|sessionStorage|indexedDB|location|navigator|history|top|parent|opener)([^\w$]|$)/;

  const bad = userCode.match(FORBIDDEN_TOKENS);
  if (bad) {
    console.error("❌ Forbidden token detected:", bad[2], "in user code:", userCode);
    throw new Error("Forbidden token found: " + bad[2]);
  }

  try {
    for (const k of Object.keys(SAFE_GLOBALS)) Object.freeze(SAFE_GLOBALS[k]);
  } catch {}

  const KILL_GLOBALS = `
    const globalThis = undefined, window = undefined, self = undefined, frames = undefined, parent = undefined, top = undefined, opener = undefined;
    const document = undefined, alert = undefined, confirm = undefined, prompt = undefined;
    const Function = undefined, fetch = undefined, XMLHttpRequest = undefined, WebSocket = undefined, EventSource = undefined, postMessage = undefined;
    const requestAnimationFrame = undefined, setTimeout = undefined, setInterval = undefined, setImmediate = undefined, queueMicrotask = undefined;
    const localStorage = undefined, sessionStorage = undefined, indexedDB = undefined, location = undefined, navigator = undefined, history = undefined;
  `;

  const build = (body) => {
    const src = `"use strict";
      ${KILL_GLOBALS}
      const { Math, Number, String, Boolean, RegExp, JSON, Date, Array, Object,
              isFinite, isNaN, parseInt, parseFloat, encodeURI, decodeURI,
              encodeURIComponent, decodeURIComponent } = SAFE;
      ${body}`;
    return new Function('row', 'rows', 'i', 'SAFE', src);
  };

  if (asExpressionFirst) {
    try {
      return build('return !!(' + userCode + ');');
    } catch (e) {
      console.warn("⚠️ Expression compile failed, fallback to statement mode:", e);
    }
  }

  return build(String(userCode || 'return false;'));
}

// Converts and appends data rows to state, then updates tabs and the incident range.
