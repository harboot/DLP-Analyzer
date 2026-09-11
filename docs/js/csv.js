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
    // normalizeFileList uses semicolons as separators. Commas can legitimately
    // be part of a filename (for example, "SURNAME, GIVEN NAME.pdf").
    row.fileTokens = txt(row['File Name'])
      .split(/[;\n]/)
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
  state.tabs.push({key:'all-alerts', label:`All Alerts (${all.length})`, type:'alerts', rows: all});
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
const EXPECTED_ALERT_COLUMNS = ['ID', 'Incident Time', 'Event Time', 'Source', 'Policies', 'Destination', 'File Name', 'Transaction Size (KB)', 'Details', 'Status', 'Channel', 'Action', 'Severity'];
const uploadWarning = document.getElementById('uploadWarning');

async function ingestFiles(files) {
  const warnings = [];
  for (const f of files) {
    const rows = await CSVUtils.parseFile(f);
    warnings.push({ fileName: f.name, missing: DLPUtils.findMissingColumns(rows, EXPECTED_ALERT_COLUMNS) });
    ingest(rows);
  }
  DLPUtils.showUploadWarning(uploadWarning, warnings);
}

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
  await ingestFiles(Array.from(files));
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
  await ingestFiles(Array.from(files));
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
    DLPUtils.showUploadWarning(uploadWarning, [{ fileName: 'alerts.csv', missing: DLPUtils.findMissingColumns(demo, EXPECTED_ALERT_COLUMNS) }]);
    ingest(demo);
  } catch (error) {
    alert(`Unable to load the sample data: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Load sample';
  }
});
