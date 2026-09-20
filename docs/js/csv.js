/* Alert Analyzer: csv */

function ingest(rows){
  if (!Array.isArray(state.raw)) state.raw = [];
  state.raw.push(...rows);

  buildTabs();
  updateIncidentRange();
}


// Builds tab definitions from the dataset (overview, blocked, per-channel, and saved tabs).
function buildTabs(){
  const all = state.raw.filter(row => !isIgnoredAlert(row));

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
const loadLog = document.getElementById('loadLog');

function logFileLoad(message) {
  loadLog.textContent += `${message}\n`;
}

function initializeIgnoredValuesSettings() {
  const dialog = document.getElementById('settingsDialog');
  const sourceInput = document.getElementById('ignoredSources');
  const destinationInput = document.getElementById('ignoredDestinations');
  const filenameInput = document.getElementById('ignoredFilenames');
  const sourceEnabled = document.getElementById('ignoredSourcesEnabled');
  const destinationEnabled = document.getElementById('ignoredDestinationsEnabled');
  const filenameEnabled = document.getElementById('ignoredFilenamesEnabled');
  const enabledControls = [
    [sourceEnabled, sourceInput, 'sourcesEnabled'],
    [destinationEnabled, destinationInput, 'destinationsEnabled'],
    [filenameEnabled, filenameInput, 'filenamesEnabled']
  ];
  const syncEnabledControls = () => enabledControls.forEach(([checkbox, input]) => { input.disabled = !checkbox.checked; });
  enabledControls.forEach(([checkbox]) => checkbox.addEventListener('change', syncEnabledControls));
  const close = () => { dialog.hidden = true; };
  document.getElementById('settingsBtn').addEventListener('click', () => {
    sourceInput.value = ignoredValues.sources.join('\n');
    destinationInput.value = ignoredValues.destinations.join('\n');
    filenameInput.value = (ignoredValues.filenames || []).join('\n');
    enabledControls.forEach(([checkbox, , key]) => { checkbox.checked = ignoredValues[key] !== false; });
    syncEnabledControls();
    dialog.hidden = false;
    sourceInput.focus();
  });
  document.getElementById('settingsClose').addEventListener('click', close);
  document.getElementById('settingsCancel').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.hidden) close(); });
  document.getElementById('settingsSave').addEventListener('click', () => {
    ignoredValues = {
      sources: parseIgnoredValues(sourceInput.value),
      destinations: parseIgnoredValues(destinationInput.value),
      filenames: parseIgnoredValues(filenameInput.value),
      sourcesEnabled: sourceEnabled.checked,
      destinationsEnabled: destinationEnabled.checked,
      filenamesEnabled: filenameEnabled.checked
    };
    try { localStorage.setItem(IGNORED_VALUES_KEY, JSON.stringify(ignoredValues)); } catch (_) {}
    state.tabs = state.tabs.filter(tab => !tab.closable);
    state.activeTab = 'overview';
    state.tabState.clear();
    buildTabs();
    close();
  });
}

initializeIgnoredValuesSettings();

let activeIngest = null;
async function ingestFiles(files) {
  const warnings = [];
  const task = CSVUtils.ingest(files, { normalizeAlerts: true, onMessage(message) {
    if (message.type === 'batch') {
      state.raw.push(...message.rows);
      const percent = message.totalBytes ? Math.round(message.processedBytes / message.totalBytes * 100) : 100;
      setProcessingMessage(`Processing alerts… ${percent}% (${message.rowCount.toLocaleString()} rows)`);
    }
    if (message.type === 'warning') warnings.push({ message: message.message });
    if (message.type === 'file-complete') {
      const fileName = files[message.fileIndex].name;
      warnings.push({ fileName, missing: DLPUtils.findMissingColumns(Object.assign([], { headers: message.headers }), EXPECTED_ALERT_COLUMNS) });
      logFileLoad(`OK: ${fileName} (${message.rowCount} rows)`);
    }
  } });
  activeIngest = task;
  await task.promise;
  if (activeIngest === task) activeIngest = null;
  setProcessingMessage('Building alert views…');
  await new Promise(resolve => setTimeout(resolve, 0));
  buildTabs();
  updateIncidentRange();
  DLPUtils.showUploadWarning(uploadWarning, warnings);
}

const processingOverlay = document.getElementById('alertProcessing');
const processingText = document.getElementById('alertProcessingText');
function setProcessingMessage(message) { processingText.textContent = message; }
let processingSequence = 0;
async function processUploadedFiles(files) {
  const sequence = ++processingSequence;
  activeIngest?.cancel();
  processingOverlay.hidden = false;
  document.body.setAttribute('aria-busy', 'true');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (sequence !== processingSequence) return;
  try {
    await ingestFiles(files);
  } catch (error) {
    if (error.message === 'Ingestion cancelled.') return;
    logFileLoad(`ERROR: ${error.message}`);
    uploadWarning.hidden = false;
    uploadWarning.textContent = `Unable to process the selected files: ${error.message}`;
  } finally {
    if (sequence === processingSequence) {
      processingOverlay.hidden = true;
      document.body.removeAttribute('aria-busy');
    }
  }
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
  currentFilename = `${files.length} alert file${files.length === 1 ? '' : 's'}`;
  await processUploadedFiles(Array.from(files));
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
  currentFilename = `${files.length} alert file${files.length === 1 ? '' : 's'}`;
  await processUploadedFiles(Array.from(files));
});

document.getElementById('demoBtn').addEventListener('click', async () => {
  const button = document.getElementById('demoBtn');
  button.disabled = true;
  button.textContent = 'Loading sample…';
  try {
    const contents = await loadSample('sample/alerts.csv');
    const demo = await CSVUtils.parseText(contents, { normalizeAlerts: true });
    clearRuleCaches();
    state.raw = [];
    state.datasetFiles = [{ name: 'alerts.csv', size: 0, lastModified: 0 }];
    state.tabs = [];
    state.activeTab = null;
    if (state.tabState && typeof state.tabState.clear === 'function') state.tabState.clear();
    DLPUtils.showUploadWarning(uploadWarning, [{ fileName: 'alerts.csv', missing: DLPUtils.findMissingColumns(demo, EXPECTED_ALERT_COLUMNS) }]);
    currentFilename = '1 alert file';
    logFileLoad(`OK: alerts.csv (${demo.length} rows)`);
    ingest(demo);
  } catch (error) {
    logFileLoad(`ERROR: ${error.message}`);
    alert(`Unable to load the sample data: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Load sample';
  }
});
