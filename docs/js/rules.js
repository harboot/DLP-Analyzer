/* Alert Analyzer: rules */

const RULE_PACK_URLS = [
  'rules/suspicious-email.json',
  'rules/filename-risk.json',
  'rules/destination-risk.json',
  'rules/volume-risk.json'
];

let ruleDefinitionsPromise;

// Loads declarative rule packs. Adding a rule only requires updating a JSON pack.
function getRuleDefinitions(){
  if (!ruleDefinitionsPromise) {
    ruleDefinitionsPromise = Promise.all(RULE_PACK_URLS.map(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load rule pack ${url}: ${response.status}`);
      const pack = await response.json();
      if (!Array.isArray(pack.rules)) throw new Error(`Invalid rule pack: ${url}`);
      return pack.rules;
    })).then(packs => packs.flat());
  }
  return ruleDefinitionsPromise;
}

// Worker-free fallback using the same declarative packs and evaluator.
async function computeBuiltInRuleMatchesChunked(rows, onProgress, CHUNK_SIZE = 600, suppliedRules){
  const rules = suppliedRules || await getRuleDefinitions();
  const indices = buildRuleIndexes(rows, rules);
  const matches = Object.fromEntries(rules.map(rule => [rule.key, []]));
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, rows.length);
    for (let i = start; i < end; i++) {
      for (const rule of rules) if (evaluateRule(rows[i], rule, indices)) matches[rule.key].push(rows[i]);
    }
    if (onProgress) onProgress(end, rows.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return matches;
}

function buildRuleIndexes(rows, rules){
  const domainCounts = new Map(), sequences = new Map();
  for (const row of rows) {
    for (const domain of row.destinationDomains) {
      const key = `${row.sourceLower}|${domain}`;
      domainCounts.set(key, (domainCounts.get(key) || 0) + 1);
    }
    for (const token of row.fileTokens) {
      const part = extractStemTail(token);
      if (!part || part.tail == null) continue;
      const key = `${row.sourceLower}|${part.stem}`;
      if (!sequences.has(key)) sequences.set(key, new Set());
      sequences.get(key).add(part.tail);
    }
  }
  return {domainCounts, sequences};
}

function evaluateRule(row, rule, indexes){
  switch (rule.operator) {
    case 'self-like': return ruleSelfToSelf(row);
    case 'destination-domain-in': return row.destinationDomains.some(domain => rule.values.includes(domain));
    case 'short-email-subject': return ruleShortOrEmptySubject(row, rule.minLength);
    case 'hour-range': return row.incidentHour != null && row.incidentHour >= rule.start && row.incidentHour < rule.end;
    case 'file-without-extension': return ruleAttachmentNoExtension(row);
    case 'sequential-files': return row.fileTokens.some(token => {
      const part = extractStemTail(token);
      return part && (indexes.sequences.get(`${row.sourceLower}|${part.stem}`)?.size || 0) >= rule.minimumDistinct;
    });
    case 'text-regex': {
      const regex = new RegExp(rule.pattern, rule.flags || '');
      return rule.fields.some(field => regex.test(txt(row[field])));
    }
    case 'destination-regex': {
      const regex = new RegExp(rule.pattern, rule.flags || '');
      return row.destinationDomains.some(domain => regex.test(domain));
    }
    case 'source-domain-volume': return row.destinationDomains.some(domain =>
      (indexes.domainCounts.get(`${row.sourceLower}|${domain}`) || 0) > rule.threshold);
    default: console.warn(`Unknown rule operator: ${rule.operator}`); return false;
  }
}

// Executes built-in rules or user predicates without blocking rendering/input.
function runAnalyzerWorker(type, rows, options = {}, onProgress){
  return new Promise((resolve, reject) => {
    const worker = new Worker('worker/AlertAnalyzer.worker.js');
    worker.onmessage = ({data}) => {
      if (data.type === 'progress' && onProgress) onProgress(data.processed, data.total);
      else if (data.type === 'complete') { worker.terminate(); resolve(data.result); }
      else if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
    };
    worker.onerror = error => { worker.terminate(); reject(error); };
    worker.postMessage({ type, rows, ...options });
  });
}

// Binds click handlers once to metric/rule cards to open ad hoc tabs.
function bindCardsClickOnce(cards, metricData, ruleDefs, rows){
  if (cards.__boundClick) return;
  cards.__boundClick = true;

  cards.addEventListener('click', async (e) => {
    const a = e.target.closest('a.metric');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();

    const mkey = a.getAttribute('data-metric');
    if (mkey) {
      const label = metricData.labels[mkey] || 'Items';
      const dataset = metricData.data[mkey] || [];
      openAdHocTab(label, dataset);
      return;
    }

    const rkey = a.getAttribute('data-rule');
    if (rkey) {
      const def = ruleDefs.find(x => x.key === rkey);
      if (!def) return;

      if (!a.__matches) {
        a.innerHTML = `<span class="spin" aria-label="Loading"></span>`;
        const matchesByRule = await computeBuiltInRuleMatchesChunked(rows);
        const matches = matchesByRule[rkey] || [];
        a.__matches = matches;
        a.textContent = matches.length;
      }
      openAdHocTab(`${def.label} (${a.__matches.length})`, a.__matches);
    }
  });
}

// Creates a dataset fingerprint from file metadata and rows sampled across the dataset.
function computeDatasetHash(rows, files = state.datasetFiles){
  const metadata = (files || [])
    .map(file => `${file.name || ''}|${file.size || 0}|${file.lastModified || 0}`)
    .sort()
    .join('||');
  const sampleCount = Math.min(100, rows.length);
  const sampledRows = [];
  for (let i = 0; i < sampleCount; i++) {
    const index = sampleCount === 1 ? 0 : Math.floor(i * (rows.length - 1) / (sampleCount - 1));
    const row = rows[index];
    sampledRows.push([
      index, txt(row['ID']), txt(row['Incident Time']), txt(row['Event Time']),
      txt(row['Source']), txt(row['Destination']), txt(row['File Name'])
    ].join('|'));
  }
  const keysrc = `${metadata}##${sampledRows.join('||')}`;
  let h = 5381;
  for (let i = 0; i < keysrc.length; i++) h = ((h << 5) + h) ^ keysrc.charCodeAt(i);
  h = (h >>> 0).toString(36);
  return `${rows.length}_${h}`;
}

function getRowId(r){
  // Composite ID to remain safe across multiple files
  const id   = txt(r['ID']).trim();
  const incT = stripGMT(txt(r['Incident Time'])).trim();
  const evT  = stripGMT(txt(r['Event Time'])).trim();
  const src  = txt(r['Source']).trim();

  if (id || incT) return `${id}|${incT}`;
  if (id || evT)  return `${id}|${evT}`;
  if (src && incT) return `${src}|${incT}`;

  // Fallback terakhir
  return JSON.stringify({
    id, incT, evT, src, fn: txt(r['File Name']).slice(0,80)
  });
}

// Builds a Map index from row IDs to array indices.
function indexRowsById(rows){
  const m = new Map();
  rows.forEach((r, i) => m.set(getRowId(r), i));
  return m;
}

// Renders the Overview: metric cards, aggregate tables, and daily volume chart.
function extractFirstEmail(s){
  const str = String(s || '');
  if (isEmailLike(str)) return str;
  const m = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

// Extracts and normalizes the email local part.
function extractLocal(email){
  if (!email) return '';
  const ix = email.indexOf('@');
  if (ix < 1) return '';
  let local = email.slice(0, ix).toLowerCase();
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  local = local.replace(/[\s._-]+/g, '');
  return local;
}

// Calculates the common-prefix length of two strings.
function commonPrefixLen(a, b){
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

// Calculates Levenshtein distance with an early-exit threshold.
function levenshtein(a, b, maxDist = 3){
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > maxDist) return maxDist + 1;
  if (n > m) { const tmp = a; a = b; b = tmp; }
  const v0 = new Uint16Array(b.length + 1);
  const v1 = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) v0[j] = j;
  let minInRow;
  for (let i = 0; i < a.length; i++){
    v1[0] = i + 1;
    minInRow = v1[0];
    for (let j = 0; j < b.length; j++){
      const cost = a[i] === b[j] ? 0 : 1;
      const del  = v0[j + 1] + 1;
      const ins  = v1[j] + 1;
      const sub  = v0[j] + cost;
      const val  = Math.min(del, ins, sub);
      v1[j + 1] = val;
      if (val < minInRow) minInRow = val;
    }
    if (minInRow > maxDist) return maxDist + 1;
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v0[b.length];
}

// Calculates the Jaro-Winkler similarity score.
function jaroWinkler(s1, s2){
  // Calculates matching pairs and transpositions for Jaro.
  function jaroMatch(a, b){
    const matchDist = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aFlags = new Array(a.length).fill(false);
    const bFlags = new Array(b.length).fill(false);
    let matches = 0;
    for (let i = 0; i < a.length; i++){
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, b.length);
      for (let j = start; j < end; j++){
        if (bFlags[j]) continue;
        if (a[i] !== b[j]) continue;
        aFlags[i] = true; bFlags[j] = true;
        matches++;
        break;
      }
    }
    if (!matches) return { matched: 0, transpositions: 0 };
    let k = 0, transpositions = 0;
    for (let i = 0; i < a.length; i++){
      if (!aFlags[i]) continue;
      while (!bFlags[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }
    return { matched: matches, transpositions };
  }

  const m = jaroMatch(s1, s2);
  if (m.matched === 0) return 0;
  const jaro = (m.matched / s1.length + m.matched / s2.length + (m.matched - m.transpositions / 2) / m.matched) / 3;
  let l = 0;
  while (l < 4 && l < s1.length && l < s2.length && s1[l] === s2[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

// Evaluates sender and recipient local-part similarity (self-like).
function isSelfLike(fromEmail, toEmail, {useJaroWinkler = true} = {}){
  const a = extractLocal(fromEmail);
  const b = extractLocal(toEmail);
  if (!a || !b) return false;
  const pref = commonPrefixLen(a, b);
  const minLen = Math.min(a.length, b.length);
  const prefixOK = pref >= 5 || pref >= Math.ceil(minLen * 0.6);
  const maxLen = Math.max(a.length, b.length);
  const lev = levenshtein(a, b, 3);
  const levOK = (maxLen >= 6 && lev <= 2) || (minLen <= 5 && lev <= 1);
  if (prefixOK || levOK) return true;
  if (useJaroWinkler){
    const jw = jaroWinkler(a, b);
    if (jw >= 0.88) return true;
  }
  return false;
}

// Rule: true when a recipient resembles the sender.
function ruleSelfToSelf(r){
  const srcEmail = extractFirstEmail(txt(r['Source']));
  if (!srcEmail) return false;
  const destParts = splitDestParts(txt(r['Destination']));
  for (const d of destParts){
    if (!isEmailLike(d)) continue;
    if (isSelfLike(srcEmail, d, {useJaroWinkler: true})) return true;
  }
  return false;
}

// Rule: true when a recipient domain is a free email provider.
function ruleRecipientFreeMail(r){
  return r.destinationDomains.some(domain =>
    ['gmail.com','yahoo.com','protonmail.com','proton.me','icloud.com'].includes(domain)
  );
}

// Rule: true when the email subject is empty or below the minimum length.
function ruleShortOrEmptySubject(r, minLen = 10){
  if (!r.channelLower.includes('email')) return false;
  const s = txt(r['Details']).trim();
  return s.length === 0 || s.length < minLen;
}

// Rule: true when an attachment has no extension.
function ruleAttachmentNoExtension(r){
  return r.fileTokens.some(fileName => !fileName.includes('.'));
}

// Extracts the stem and trailing number from a filename.
function extractStemTail(name){
  const raw = stripSizeSuffix(name || '').trim();
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const m = base.match(/^(.*?)[\s._-]*\(?\s*(\d{1,4})\s*\)?\s*$/);
  if (!m) {
    const stemOnly = base.trim().toLowerCase();
    if (!stemOnly || shouldIgnoreCore(stemOnly)) return null;
    return { stem: stemOnly, tail: null };
  }
  let stem = (m[1] || '').trim().toLowerCase();
  const tail = m[2] ? parseInt(m[2], 10) : null;
  if (!stem || shouldIgnoreCore(stem)) return null;
  return { stem, tail };
}

// Rule: true when a row has an attachment with a hot stem for its source.
function ruleSequentialAttachments(r, hotStems){
  const src = r.sourceLower;
  if (!src) return false;
  for (const t of r.fileTokens){
    const part = extractStemTail(t);
    if (!part) continue;
    const stem = (part.stem || '').toLowerCase();
    if (stem && hotStems.has(`${src}|${stem}`)) return true;
  }
  return false;
}

const SENSITIVE_KEYWORDS = [
  'confidential',
  'salary',
  'client[_\\s-]?list',
  'password',
  'secret',
  'api[_\\s-]?key',
  'credit[_\\s-]?card'
];

const sensitiveRegex = new RegExp("\\b(" + SENSITIVE_KEYWORDS.join("|") + ")\\b", "i");

// Rule: true when sensitive keywords appear in the subject, filename, or policies.
function ruleSensitiveKeywords(r){
  return sensitiveRegex.test(txt(r['Details'])) ||
         sensitiveRegex.test(txt(r['File Name'])) ||
         sensitiveRegex.test(txt(r['Policies']));
}

// Rule: true when a sender repeatedly sends to the same domain above the threshold.
function ruleRepeatedDomainBySender(r, countsMap, threshold = 5){
  const src = r.sourceLower;
  if(!src) return false;
  for(const domain of r.destinationDomains){
    const key = `${src}|${domain}`;
    if((countsMap.get(key) || 0) > threshold) return true;
  }
  return false;
}

// Rule: true when the destination domain uses an unusual TLD (xyz/top/icu).
function ruleWeirdTLD(r){
  return r.destinationDomains.some(domain => /\.(xyz|top|icu)$/i.test(domain));
}

// Rule: true when an incident occurs between 00:00 and 04:59.
function ruleOutOfHours(r){
  return r.incidentHour != null && r.incidentHour >= 0 && r.incidentHour < 5;
}
