'use strict';

const txt = value => String(value ?? '');
const splitDestParts = value => txt(value).split(/[;,]/).map(part => part.trim()).filter(Boolean);
const isEmailLike = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(value));
const extractFirstEmail = value => (txt(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
const extractLocal = value => txt(value).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
const stripSize = value => txt(value).trim().replace(/\s*[-,]?\s*\(?\s*\[?\s*\d+(?:[.,]\d+)?\s*(?:[KMGT]B)\s*\]?\s*\)?\s*$/i, '').trim();
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

// Builds both dataset-level indexes together, then evaluates all rules in one alert pass.
function analyze(rows) {
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
  const hotStems = new Set([...sequences].filter(([, tails]) => tails.size >= 5).map(([key]) => key));
  const result = Object.fromEntries(['self','freemail','shortsubj','noext','seqfiles','sensitive','repeatdom','weirdtld','outofhours'].map(key => [key, []]));

  rows.forEach((row, index) => {
    const destinations = splitDestParts(row.Destination);
    const email = extractFirstEmail(row.Source);
    if (email && destinations.some(destination => isEmailLike(destination) && selfLike(email, destination))) result.self.push(index);
    if (row.destinationDomains.some(domain => freeMailDomains.has(domain))) result.freemail.push(index);
    if (row.channelLower.includes('email') && txt(row.Details).trim().length < 15) result.shortsubj.push(index);
    if (row.fileTokens.some(file => !file.includes('.'))) result.noext.push(index);
    if (row.fileTokens.some(file => { const part = stemTail(file); return part && hotStems.has(`${row.sourceLower}|${part.stem}`); })) result.seqfiles.push(index);
    if (sensitive.test(`${txt(row.Details)} ${txt(row['File Name'])} ${txt(row.Policies)}`)) result.sensitive.push(index);
    if (row.destinationDomains.some(domain => (domainCounts.get(`${row.sourceLower}|${domain}`) || 0) > 5)) result.repeatdom.push(index);
    if (row.destinationDomains.some(domain => /\.(xyz|top|icu)$/i.test(domain))) result.weirdtld.push(index);
    if (row.incidentHour != null && row.incidentHour >= 0 && row.incidentHour < 5) result.outofhours.push(index);
    if ((index + 1) % 5000 === 0) self.postMessage({type: 'progress', processed: index + 1, total: rows.length});
  });
  return result;
}

function custom(rows, code) {
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
  rows.forEach((row, index) => {
    try { if (fn(row, rows, index, SAFE)) matched.push(index); } catch (_) {}
    if ((index + 1) % 5000 === 0) self.postMessage({type:'progress', processed:index + 1, total:rows.length});
  });
  return matched;
}

self.onmessage = ({data}) => {
  try {
    const result = data.type === 'custom' ? custom(data.rows, data.code) : analyze(data.rows);
    self.postMessage({type:'complete', result});
  } catch (error) {
    self.postMessage({type:'error', message:error.message || String(error)});
  }
};
