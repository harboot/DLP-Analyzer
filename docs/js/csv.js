/* Alert Analyzer: csv */

function ingest(rows){
  // Append rows so files from one upload action are combined
  const mapped = rows.map(r => {
    const row = ensureCols(sanitizeHeaders(r));
    row['File Name'] = normalizeFileList(row['File Name']);
    row.IncidentTime = row['Incident Time'];
    row.EventTime    = row['Event Time'];
    row.FileName     = row['File Name'];
    row.Size         = row['Transaction Size (KB)'];

    // Values shared by summaries and rules are derived once during ingestion.
    // Keeping them on the row also means the worker receives them through the
    // structured clone instead of repeatedly parsing the original CSV cells.
    const incidentDate = parseIncidentTime(row['Incident Time']);
    row.sourceLower = txt(row['Source']).trim().toLowerCase();
    row.destinationDomains = Array.from(new Set(
      splitDestParts(row['Destination']).map(getBaseDomain).filter(Boolean)
    ));
    row.fileTokens = txt(row['File Name'])
      .split(/[;,\n]/)
      .map(token => token.trim())
      .filter(Boolean);
    row.incidentDate = incidentDate;
    row.incidentHour = incidentDate ? incidentDate.getHours() : null;
    row.actionLower = txt(row['Action']).toLowerCase();
    row.channelLower = txt(row['Channel']).toLowerCase();
    return row;
  });

  if (!Array.isArray(state.raw)) state.raw = [];
  state.raw.push(...mapped);

  buildTabs();
  updateIncidentRange();
}


// Normalizes a destination for session identity without discarding meaningful subdomains.
function normalizeClusterDestination(value, channel){
  const channelLower = txt(channel).trim().toLowerCase();
  const emailAddresses = txt(value).toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  if (channelLower.includes('email') && emailAddresses.length) {
    return Array.from(new Set(emailAddresses)).sort().join('; ');
  }
  const normalized = splitDestParts(value).map(part => {
    const raw = part.trim().toLowerCase();
    const emailMatch = raw.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (emailMatch && (channelLower.includes('email') || isEmailLike(emailMatch[0]))) {
      return emailMatch[0].toLowerCase();
    }

    try {
      const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
      const hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, '');
      return hostname.replace(/^www\./, '');
    } catch {
      return raw.replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
    }
  }).filter(Boolean);
  return Array.from(new Set(normalized)).sort().join('; ');
}

function aggregateClusterValues(rows, field){
  const seen = new Set();
  const values = [];
  for (const row of rows) {
    for (const value of txt(row[field]).split(/[;\n]/).map(item => item.trim()).filter(Boolean)) {
      const key = value.toLowerCase();
      if (!seen.has(key)) { seen.add(key); values.push(value); }
    }
  }
  return values.join('; ');
}

// Groups Source + Channel + normalized Destination activity into 10-minute sessions.
function groupIncidentClusters(rows, windowMinutes = 10){
  const windowMs = windowMinutes * 60 * 1000;
  const groups = new Map();
  const normalize = value => txt(value).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const row of rows) {
    const normalizedDestination = normalizeClusterDestination(row['Destination'], row['Channel']);
    const key = [normalize(row['Source']), normalize(row['Channel']), normalizedDestination].join('\u001f');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const clusters = [];
  for (const groupedRows of groups.values()) {
    groupedRows.sort((a, b) => (a.incidentDate?.getTime() || 0) - (b.incidentDate?.getTime() || 0));
    let current = [];
    const flush = () => {
      if (!current.length) return;
      const first = current[0], last = current[current.length - 1];
      clusters.push({
        ...first,
        'ID': current.map(row => txt(row.ID)).filter(Boolean).join(', '),
        'Incident Time': txt(first['Incident Time']),
        'Event Time': txt(last['Incident Time']),
        'Destination': normalizeClusterDestination(first['Destination'], first['Channel']),
        'Policies': aggregateClusterValues(current, 'Policies'),
        'File Name': aggregateClusterValues(current, 'File Name'),
        'Details': 'View original alerts',
        'Alert Count': current.length,
        clusterRows: current,
        clusterLastDate: last.incidentDate
      });
    };
    for (const row of groupedRows) {
      const previous = current[current.length - 1];
      if (previous && (!previous.incidentDate || !row.incidentDate || row.incidentDate - previous.incidentDate > windowMs)) {
        flush(); current = [];
      }
      current.push(row);
    }
    flush();
  }
  return clusters.sort((a, b) => (b.incidentDate?.getTime() || 0) - (a.incidentDate?.getTime() || 0));
}

// Builds tab definitions from the dataset (overview, blocked, per-channel, and saved tabs).
function buildTabs(){
  const all = state.raw;

  const isBlocked = r => {
    const a = r.actionLower;
    return a.includes('block') || a.includes('quarantine');
  };

  const blocks  = all.filter(isBlocked);
  const normals = all.filter(r => !isBlocked(r));

  const byCh = new Map();
  for(const r of normals){
    const ch = txt(r['Channel']).trim() || '(Empty Channel)';
    if(!byCh.has(ch)) byCh.set(ch, []);
    byCh.get(ch).push(r);
  }

  const closables = state.tabs.filter(t=> t.closable);
  state.tabs = [];
  state.tabs.push({key:'overview', label:'Overview', type:'overview', rows: all});
  const clusters = groupIncidentClusters(all, 10);
  state.tabs.push({key:'clusters', label:`Activity Clusters (${clusters.length})`, type:'clusters', rows: clusters});
  if(blocks.length) state.tabs.push({key:'block', label:`Action: Block (${blocks.length})`, type:'block', rows: blocks});

  Array.from(byCh.entries()).sort((a,b)=> b[1].length - a[1].length).forEach(([ch,rows])=>{
    state.tabs.push({key:`ch::${ch}`, label:`${ch} (${rows.length})`, type:'channel', rows});
  });

  for (const t of closables){
    const refiltered = t.filter ? applyDrillFilter(all, t.filter) : t.rows;
    state.tabs.push({ ...t, rows: refiltered });
  }

  if(!state.activeTab) state.activeTab = 'overview';
  renderTabs();
}

// Renders tab buttons and click handlers, then renders the active tab and filter icons.
const fileInput = $('#file');
fileInput.addEventListener('change', async (e)=>{
  const files = e.target.files;
  if (!files || files.length === 0) return;
  clearRuleCaches();
  state.raw = [];
  state.datasetFiles = Array.from(files, file => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified
  }));
  state.tabs = [];
  state.activeTab = null;
  if (state.tabState && typeof state.tabState.clear === 'function') state.tabState.clear();
  currentFilename = Array.from(files).map(f => f.name).join(', ');
  for (const f of files) {
    const rows = await CSVUtils.parseFile(f);
    ingest(rows);
  }
});

const drop = $('#drop');
['dragenter','dragover'].forEach(ev=> drop.addEventListener(ev, e=>{e.preventDefault(); drop.classList.add('hover');}));
['dragleave','drop'].forEach(ev=> drop.addEventListener(ev, e=>{e.preventDefault(); drop.classList.remove('hover');}));
drop.addEventListener('drop', async (e)=>{
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  clearRuleCaches();
  state.raw = [];
  state.datasetFiles = Array.from(files, file => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified
  }));
  state.tabs = [];
  state.activeTab = null;
  if (state.tabState && typeof state.tabState.clear === 'function') state.tabState.clear();
  currentFilename = Array.from(files).map(f => f.name).join(', ');
  for (const f of files) {
    const rows = await CSVUtils.parseFile(f);
    ingest(rows);
  }
});

document.getElementById('demoBtn').addEventListener('click', async () => {
  const button = document.getElementById('demoBtn');
  button.disabled = true;
  button.textContent = 'Loading sample…';
  try {
    const response = await fetch('sample/alerts.csv');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const demo = await CSVUtils.parseText(await response.text(), { header: true });
    clearRuleCaches();
    state.raw = [];
    state.datasetFiles = [{ name: 'alerts.csv', size: 0, lastModified: 0 }];
    state.tabs = [];
    state.activeTab = null;
    if (state.tabState && typeof state.tabState.clear === 'function') state.tabState.clear();
    currentFilename = 'alerts.csv';
    ingest(demo);
  } catch (error) {
    alert(`Unable to load the sample data: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Load sample';
  }
});
