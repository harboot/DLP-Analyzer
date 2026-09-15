'use strict';

const txt = value => String(value ?? '');
const splitDestParts = value => txt(value).split(/[;,]/).map(part => part.trim()).filter(Boolean);
const isEmailLike = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(value));
const extractFirstEmail = value => (txt(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
const extractLocal = value => txt(value).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const stripSize = value => txt(value).trim().replace(/\s*[-,]?\s*\(?\s*\[?\s*\d+(?:[.,]\d+)?\s*(?:[KMGT]?B)\s*\]?\s*\)?\s*$/i, '').trim();
const hasExtension = value => /\.[A-Za-z0-9]{1,8}$/.test(stripSize(value));
const ignored = value => ['image','img_','img-','image0','outlook-','signature','sign_','logo','scan','screenshot'].some(prefix => value.startsWith(prefix));
const sensitive = /\b(confidential|salary|client[_\s-]?list|password|secret|api[_\s-]?key|credit[_\s-]?card)\b/i;
const freeMailDomains = new Set(['gmail.com','yahoo.com','protonmail.com','proton.me','icloud.com']);

function levenshtein(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length > b.length) [a, b] = [b, a];
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  let current = [];
  for (let i = 0; i < a.length; i++) {
    current[0] = i + 1;
    let minimum = current[0];
    for (let j = 0; j < b.length; j++) {
      current[j + 1] = Math.min(previous[j + 1] + 1, current[j] + 1, previous[j] + (a[i] === b[j] ? 0 : 1));
      minimum = Math.min(minimum, current[j + 1]);
    }
    if (minimum > max) return max + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

function jaro(a, b) {
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = Array(a.length).fill(false), bFlags = Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(i + range + 1, b.length); j++) {
      if (!bFlags[j] && a[i] === b[j]) { aFlags[i] = bFlags[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let k = 0, transpositions = 0;
  for (let i = 0; i < a.length; i++) if (aFlags[i]) {
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const score = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return score + prefix * 0.1 * (1 - score);
}

function selfLike(from, to) {
  const a = extractLocal(from), b = extractLocal(to);
  if (!a || !b) return false;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  const min = Math.min(a.length, b.length), max = Math.max(a.length, b.length);
  return prefix >= 5 || prefix >= Math.ceil(min * 0.6) ||
    (max >= 6 && levenshtein(a, b) <= 2) || (min <= 5 && levenshtein(a, b) <= 1) || jaro(a, b) >= 0.88;
}

function stemTail(value) {
  const raw = stripSize(value), dot = raw.lastIndexOf('.'), base = dot > 0 ? raw.slice(0, dot) : raw;
  const match = base.match(/^(.*?)[\s._-]*\(?\s*(\d{1,4})\s*\)?\s*$/);
  if (!match) return null;
  const stem = match[1].trim().toLowerCase();
  return !stem || ignored(stem) ? null : {stem, tail: Number(match[2])};
}

// Evaluates declarative rule definitions supplied by the UI.
async function analyze(rows, rules, context) {
  const domainCounts = new Map(), sequences = new Map();
  for (const row of rows) {
    for (const domain of row.destinationDomains) {
      const key = `${row.sourceLower}|${domain}`;
      domainCounts.set(key, (domainCounts.get(key) || 0) + 1);
    }
    for (const file of row.fileTokens) {
      const part = stemTail(file);
      if (!part) continue;
      const key = `${row.sourceLower}|${part.stem}`;
      if (!sequences.has(key)) sequences.set(key, new Set());
      sequences.get(key).add(part.tail);
    }
  }
  const result = Object.fromEntries(rules.map(rule => [rule.key, []]));
  for (let index = 0; index < rows.length; index++) {
    if (context.cancelled()) throw new DOMException('Analysis cancelled.', 'AbortError');
    const row = rows[index];
    for (const rule of rules) {
      let matched = false;
      switch (rule.operator) {
        case 'self-like': {
          const email = extractFirstEmail(row.source);
          matched = Boolean(email && row.destinations.some(destination => isEmailLike(destination) && selfLike(email, destination)));
          break;
        }
        case 'destination-domain-in': matched = row.destinationDomains.some(domain => rule.values.includes(domain)); break;
        case 'short-email-subject': matched = row.channelLower.includes('email') && txt(row.text.Details).trim().length < rule.minLength; break;
        case 'hour-range': matched = row.incidentHour != null && row.incidentHour >= rule.start && row.incidentHour < rule.end; break;
        case 'file-without-extension': matched = row.fileTokens.some(file => !hasExtension(file)); break;
        case 'sequential-files': matched = row.fileTokens.some(file => { const part = stemTail(file); return part && (sequences.get(`${row.sourceLower}|${part.stem}`)?.size || 0) >= rule.minimumDistinct; }); break;
        case 'text-regex': {
          const regex = new RegExp(rule.pattern, rule.flags || '');
          matched = rule.fields.some(field => regex.test(txt(row.text[field])));
          break;
        }
        case 'destination-regex': {
          const regex = new RegExp(rule.pattern, rule.flags || '');
          matched = row.destinationDomains.some(domain => regex.test(domain));
          break;
        }
        case 'source-domain-volume': matched = row.destinationDomains.some(domain => (domainCounts.get(`${row.sourceLower}|${domain}`) || 0) > rule.threshold); break;
      }
      if (matched) result[rule.key].push(index);
    }
    if ((index + 1) % 1000 === 0) {
      context.progress(index + 1, rows.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  context.progress(rows.length, rows.length);
  return Object.fromEntries(Object.entries(result).map(([key, indices]) => [key, Uint32Array.from(indices)]));
}

async function custom(rows, code, context) {
  if (/(^|[^\w$])(window|document|eval|arguments|Function|fetch|XMLHttpRequest|WebSocket|EventSource|postMessage|localStorage|sessionStorage|indexedDB|location|navigator|history|top|parent|opener)([^\w$]|$)/.test(code)) throw new Error('Forbidden token found');
  const SAFE = {Math,Number,String,Boolean,RegExp,JSON,Date,Array,Object,isFinite,isNaN,parseInt,parseFloat,encodeURI,decodeURI,encodeURIComponent,decodeURIComponent};
  let fn;
  try {
    fn = new Function('row','rows','i','SAFE','"use strict"; return !!(' + code + ');');
    fn(rows[0], rows, 0, SAFE);
  } catch (_) {
    fn = new Function('row','rows','i','SAFE','"use strict"; ' + code);
  }
  const matched = [];
  for (let index = 0; index < rows.length; index++) {
    if (context.cancelled()) throw new DOMException('Analysis cancelled.', 'AbortError');
    const row = rows[index];
    try { if (fn(row, rows, index, SAFE)) matched.push(index); } catch (_) {}
    if ((index + 1) % 1000 === 0) {
      context.progress(index + 1, rows.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  context.progress(rows.length, rows.length);
  return Uint32Array.from(matched);
}

let dataset = [];
let datasetVersion = null;
const cancelledRequests = new Set();

self.onmessage = async ({data}) => {
  const {requestId} = data;
  if (data.type === 'cancel') {
    if (data.datasetVersion === datasetVersion) cancelledRequests.add(requestId);
    return;
  }
  try {
    if (data.type === 'initialize') {
      dataset = data.rows || [];
      datasetVersion = data.datasetVersion;
      cancelledRequests.clear();
      self.postMessage({type: 'ready', requestId, datasetVersion});
      return;
    }
    if (data.type !== 'analyze') return;
    if (data.datasetVersion !== datasetVersion) throw new Error('Dataset version is no longer active.');
    const context = {
      cancelled: () => cancelledRequests.has(requestId) || data.datasetVersion !== datasetVersion,
      progress: (processed, total) => self.postMessage({type: 'progress', requestId, datasetVersion: data.datasetVersion, processed, total})
    };
    const result = data.analysisType === 'custom'
      ? await custom(dataset, data.code, context)
      : await analyze(dataset, data.rules || [], context);
    if (context.cancelled()) throw new DOMException('Analysis cancelled.', 'AbortError');
    const transfer = data.analysisType === 'custom'
      ? [result.buffer]
      : Object.values(result).map(indices => indices.buffer);
    self.postMessage({type:'complete', requestId, datasetVersion: data.datasetVersion, result}, transfer);
  } catch (error) {
    const type = error?.name === 'AbortError' ? 'cancelled' : 'error';
    self.postMessage({type, requestId, datasetVersion: data.datasetVersion, message:error.message || String(error)});
  } finally {
    cancelledRequests.delete(requestId);
  }
};
