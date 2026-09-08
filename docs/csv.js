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


// Groups identical Source + Destination + File + Policy activity into 10-minute sessions.
function groupIncidentClusters(rows, windowMinutes = 10){
  const windowMs = windowMinutes * 60 * 1000;
  const groups = new Map();
  const normalize = value => txt(value).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const row of rows) {
    const key = ['Source', 'Destination', 'File Name', 'Policies'].map(field => normalize(row[field])).join('\u001f');
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
        'Details': `${current.length} alert${current.length === 1 ? '' : 's'} grouped within ${windowMinutes} minutes`,
        'Alert Count': current.length,
        clusterRows: current,
        clusterLastDate: last.incidentDate
      });
    };
    for (const row of groupedRows) {
      const firstInCluster = current[0];
      if (firstInCluster && (!firstInCluster.incidentDate || !row.incidentDate || row.incidentDate - firstInCluster.incidentDate > windowMs)) {
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

document.getElementById('demoBtn').addEventListener('click', ()=>{
  clearRuleCaches();
  state.raw = [];
  state.datasetFiles = [{ name: 'Sample data', size: 0, lastModified: 0 }];
  state.tabs = [];
  state.activeTab = null;
  if (state.tabState && typeof state.tabState.clear === 'function') state.tabState.clear();
  currentFilename = 'Sample data';
  const demo = [
    {"ID":"70100001","Incident Time":"26 Aug. 2025, 02:07:36 PM GMT+0800","Event Time":"26 Aug. 2025, 02:07:22 PM GMT+0800","Source":"SRC-USER-001","Policies":"Customer / Prospective Customer PII","Destination":"alice@example.org","File Name":"contract_2025.pdf; image.png","Details":"Quarterly contract package","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100002","Incident Time":"26 Aug. 2025, 01:53:17 PM GMT+0800","Event Time":"26 Aug. 2025, 01:53:12 PM GMT+0800","Source":"SRC-USER-002","Policies":"Employee PII","Destination":"bob@example.org","File Name":"forms.zip; screenshot.png","Details":"HR forms bundle","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100021","Incident Time":"26 Aug. 2025, 08:15:00 AM GMT+0800","Event Time":"26 Aug. 2025, 08:14:55 AM GMT+0800","Source":"john.doe@corp.com","Policies":"General","Destination":"john.doe@corp.com","File Name":"todo.txt","Details":"Sent note to self","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100022","Incident Time":"26 Aug. 2025, 09:20:00 AM GMT+0800","Event Time":"26 Aug. 2025, 09:19:55 AM GMT+0800","Source":"mary.smith@example.org","Policies":"Customer Data","Destination":"marysmith@example.org","File Name":"draft.docx","Details":"Self mail slight variation","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100023","Incident Time":"26 Aug. 2025, 11:00:00 AM GMT+0800","Event Time":"26 Aug. 2025, 10:59:50 AM GMT+0800","Source":"SRC-SELF-001@example.com","Policies":"Employee PII","Destination":"srcself001@example.com","File Name":"notes.pdf","Details":"Another self mail","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100024","Incident Time":"26 Aug. 2025, 01:05:00 PM GMT+0800","Event Time":"26 Aug. 2025, 01:04:53 PM GMT+0800","Source":"henrya@id.ibm.com","Policies":"General","Destination":"hendryadrian@gmail.com","File Name":"ideas.txt","Details":"Cross-domain self mail","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"High"},
    {"ID":"70100025","Incident Time":"26 Aug. 2025, 03:40:00 PM GMT+0800","Event Time":"26 Aug. 2025, 03:39:55 PM GMT+0800","Source":"anna_lee@company.com","Policies":"General","Destination":"anna.lee@company.com","File Name":"reminder.docx","Details":"Slightly different self mail","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100003","Incident Time":"26 Aug. 2025, 01:32:19 PM GMT+0800","Event Time":"26 Aug. 2025, 01:32:12 PM GMT+0800","Source":"self.user@example.com","Policies":"Customer / Prospective Customer PII","Destination":"self.user@example.com","File Name":"notes.txt; image.png","Details":"Self mail","Status":"Open","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100004","Incident Time":"26 Aug. 2025, 11:18:00 AM GMT+0800","Event Time":"26 Aug. 2025, 11:17:54 AM GMT+0800","Source":"SRC-USER-003","Policies":"Customer / Prospective Customer PII","Destination":"external.contact@gmail.com","File Name":"client_list.xlsx; logo.png","Details":"Sharing list","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100005","Incident Time":"26 Aug. 2025, 10:46:44 AM GMT+0800","Event Time":"26 Aug. 2025, 10:46:40 AM GMT+0800","Source":"SRC-USER-004","Policies":"Data Handling","Destination":"ops@example.com","File Name":"update.docx","Details":"","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100006","Incident Time":"26 Aug. 2025, 10:41:20 AM GMT+0800","Event Time":"26 Aug. 2025, 10:41:12 AM GMT+0800","Source":"SRC-USER-005","Policies":"Number Pattern","Destination":"team@example.com","File Name":"report; readme; image.png","Details":"Attachments w/o extension","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100007","Incident Time":"26 Aug. 2025, 09:54:03 AM GMT+0800","Event Time":"26 Aug. 2025, 09:53:59 AM GMT+0800","Source":"SRC-USER-006","Policies":"File Movement","Destination":"archive@example.org","File Name":"report 1.pdf; report 2.pdf; report 3.pdf; report 4.pdf; image.png","Details":"Batch reports","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100026","Incident Time":"26 Aug. 2025, 04:20:00 PM GMT+0800","Event Time":"26 Aug. 2025, 04:19:55 PM GMT+0800","Source":"SRC-USER-013","Policies":"File Movement","Destination":"storage@example.net","File Name":"scan_001.jpg; scan_002.jpg; scan_003.jpg; scan_004.jpg","Details":"Scanned images sequential","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100027","Incident Time":"26 Aug. 2025, 05:45:00 PM GMT+0800","Event Time":"26 Aug. 2025, 05:44:52 PM GMT+0800","Source":"SRC-USER-014","Policies":"File Movement","Destination":"archive@example.org","File Name":"invoice-jan.pdf; invoice-feb.pdf; invoice-mar.pdf","Details":"Sequential invoices","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100008","Incident Time":"26 Aug. 2025, 09:35:00 AM GMT+0800","Event Time":"26 Aug. 2025, 09:34:55 AM GMT+0800","Source":"SRC-USER-007","Policies":"General","Destination":"finance@example.com","File Name":"salary_projection.xlsx; image.png","Details":"confidential salary update","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"High"},
    {"ID":"70100009","Incident Time":"26 Aug. 2025, 09:20:11 AM GMT+0800","Event Time":"26 Aug. 2025, 09:20:05 AM GMT+0800","Source":"SRC-USER-008","Policies":"General","Destination":"contact@malicious.xyz","File Name":"invite.pdf; image.png","Details":"Weird TLD test","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100010","Incident Time":"26 Aug. 2025, 02:45:00 AM GMT+0800","Event Time":"26 Aug. 2025, 02:44:50 AM GMT+0800","Source":"SRC-USER-009","Policies":"General","Destination":"night.ops@example.com","File Name":"night_export.csv","Details":"late run","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100011","Incident Time":"25 Aug. 2025, 09:01:00 AM GMT+0800","Event Time":"25 Aug. 2025, 09:00:57 AM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"a@partner.com","File Name":"fileA.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100012","Incident Time":"25 Aug. 2025, 11:10:00 AM GMT+0800","Event Time":"25 Aug. 2025, 11:09:55 AM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"b@partner.com","File Name":"fileB.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100013","Incident Time":"25 Aug. 2025, 01:20:00 PM GMT+0800","Event Time":"25 Aug. 2025, 01:19:52 PM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"c@partner.com","File Name":"fileC.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100014","Incident Time":"25 Aug. 2025, 03:35:00 PM GMT+0800","Event Time":"25 Aug. 2025, 03:34:57 PM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"d@partner.com","File Name":"fileD.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100015","Incident Time":"25 Aug. 2025, 04:50:00 PM GMT+0800","Event Time":"25 Aug. 2025, 04:49:58 PM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"e@partner.com","File Name":"fileE.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100016","Incident Time":"25 Aug. 2025, 05:59:00 PM GMT+0800","Event Time":"25 Aug. 2025, 05:58:53 PM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"f@partner.com","File Name":"fileF.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100017","Incident Time":"26 Aug. 2025, 09:05:00 AM GMT+0800","Event Time":"26 Aug. 2025, 09:04:58 AM GMT+0800","Source":"SRC-REP-001","Policies":"General","Destination":"g@partner.com","File Name":"fileG.pdf","Details":"daily send","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100018","Incident Time":"26 Aug. 2025, 10:15:00 AM GMT+0800","Event Time":"26 Aug. 2025, 10:14:52 AM GMT+0800","Source":"SRC-USER-010","Policies":"General","Destination":"external.freelancer@gmail.com","File Name":"draft 1.docx; draft 2.docx; draft 3.docx; image.png","Details":"confidential draft series","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Medium"},
    {"ID":"70100019","Incident Time":"26 Aug. 2025, 12:10:00 AM GMT+0800","Event Time":"26 Aug. 2025, 12:09:50 AM GMT+0800","Source":"SRC-USER-011","Policies":"General","Destination":"ops@example.net","File Name":"readme; changelog","Details":"ok","Status":"New","Channel":"Network email","Action":"Permitted","Severity":"Low"},
    {"ID":"70100020","Incident Time":"26 Aug. 2025, 10:01:00 AM GMT+0800","Event Time":"26 Aug. 2025, 10:00:48 AM GMT+0800","Source":"SRC-USER-012","Policies":"Number Pattern","Destination":"eve@example.net","File Name":"blocked.csv","Details":"blocked test","Status":"New","Channel":"Network email","Action":"Block","Severity":"High"}
  ];
  ingest(demo);
});
