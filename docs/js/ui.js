/* Alert Analyzer: ui */

function renderTabs(){
  const tabsEl = $('#tabs'); tabsEl.innerHTML = '';
  for(const t of state.tabs){
    const b = document.createElement('button');
    b.className = 'tab-btn';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(state.activeTab===t.key));
    const labelSpan = document.createElement('span');
    labelSpan.textContent = t.closable ? `${t.label} (${t.rows.length})` : t.label;
    b.appendChild(labelSpan);

    if(t.closable){
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '✕';
      close.title = 'Close tab';
      close.addEventListener('click', (e)=>{
        e.stopPropagation();
        const idx = state.tabs.findIndex(x=>x.key===t.key);
        if(idx>=0){
          const wasActive = state.activeTab===t.key;
          state.tabs.splice(idx,1);
          state.tabState.delete(t.key);
          if(wasActive){
            const prev = state.tabs[Math.max(0, idx-1)];
            state.activeTab = prev ? prev.key : 'overview';
          }
          renderTabs();
        }
      });
      b.appendChild(close);
    }

    b.addEventListener('click', ()=>{
      state.activeTab = t.key;
      renderTabs();
    });

    tabsEl.appendChild(b);
  }
  renderActiveTab();
  const active = state.tabs.find(t => t.key === state.activeTab);
  if (active && typeof updateFilterIcons === 'function') {
    updateFilterIcons(active, $('#panels'));
  }
}

// Returns or initializes per-tab state (filters, pagination, and sorting).
function getTabState(key){
  if(!state.tabState.has(key)) state.tabState.set(key, {filters:{}, page:1, pageSize:50, sort:null});
  return state.tabState.get(key);
}

// Renders content for the active tab and synchronizes filter icons.
function renderActiveTab(){
  const panels = $('#panels'); panels.innerHTML = '';
  const tab = state.tabs.find(t=> t.key===state.activeTab);
  if(!tab){
    panels.innerHTML = '<div class="muted">No data. Upload a CSV to get started.</div>';
    return;
  }

  let el;
  if(tab.type==='overview') el = renderOverview(tab.rows);
  else el = renderTableSection(tab);

  if (el && el.setAttribute) el.setAttribute('data-tab', tab.key);
  panels.appendChild(el);

  if (typeof updateFilterIcons === 'function') {
    updateFilterIcons(tab, el || panels);
  }
}

function renderOverview(rows){
  const wrap = document.createElement('div');
  wrap.className = 'grid';

  const unique = (key)=>
    new Set(rows.map(r => txt(r[key]).trim()).filter(Boolean)).size;

  const emailDomains = new Set();
  const webDomains = new Set();

  for (const r of rows){
    const parts = splitDestParts(r['Destination']);
    for (const p of parts){
      const lower = String(p).toLowerCase();
      const base = getBaseDomain(lower);
      if (!base) continue;
      if (isEmailLike(lower)){
        emailDomains.add(base);
      } else {
        webDomains.add(base);
      }
    }
  }

  const blocks = rows.filter(r=>{
    const a = r.actionLower;
    return a.includes('block') || a.includes('quarantine');
  }).length;

  const channels = new Set(
    rows
      .filter(r=>{
        const a = r.actionLower;
        return !(a.includes('block') || a.includes('quarantine'));
      })
      .map(r => txt(r['Channel']).trim())
      .filter(Boolean)
  );

  const cards = document.createElement('div');
  cards.className = 'grid cards';

  cards.innerHTML = `
    <div class="card" title="${cardTooltips.total}"><h3>Total Alerts</h3><b><a href="#" class="link metric" data-metric="total">${rows.length}</a></b></div>
    <div class="card" title="${cardTooltips.sources}"><h3>Unique Sources</h3><b><a href="#" class="link metric" data-metric="sources">${unique('Source')}</a></b></div>
    <div class="card" title="${cardTooltips.emaildest}"><h3>Email Destinations</h3><b><a href="#" class="link metric" data-metric="emaildest">${emailDomains.size}</a></b></div>
    <div class="card" title="${cardTooltips.webdest}"><h3>Web Destinations</h3><b><a href="#" class="link metric" data-metric="webdest">${webDomains.size}</a></b></div>
    <div class="card" title="${cardTooltips.channels}"><h3>Channels</h3><b><a href="#" class="link metric" data-metric="channels">${channels.size}</a></b></div>
  `;

  const rowsWithSource = rows.filter(r => txt(r['Source']).trim());
  const rowsEmailDest  = rows.filter(r => splitDestParts(r['Destination']).some(p => isEmailLike(p)));
  const rowsWebDest    = rows.filter(r => splitDestParts(r['Destination']).some(p => !isEmailLike(p) && getBaseDomain(p)));
  const rowsWithChan   = rows.filter(r => txt(r['Channel']).trim());
  const rowsBlocks     = rows.filter(r => r.actionLower.includes('block') || r.actionLower.includes('quarantine'));

  const metricData = {
    labels: {
      total:     'All Alerts',
      sources:   'Rows with Source',
      emaildest: 'Email Destinations',
      webdest:   'Web Destinations',
      channels:  'Rows with Channel',
      blocks:    'Action: Block/Quarantine'
    },
    data: {
      total: rows,
      sources: rowsWithSource,
      emaildest: rowsEmailDest,
      webdest: rowsWebDest,
      channels: rowsWithChan,
      blocks: rowsBlocks
    }
  };

  const ruleDefs = [];

  let ruleHtml = '';

  (async () => {
    const loadedRules = await getRuleDefinitions();
    ruleDefs.push(...loadedRules);
    for (const def of ruleDefs) {
    ruleHtml += `
      <div class="card" title="${escapeHtml(cardTooltips[def.key] || def.label)}">
        <h3>${escapeHtml(def.label)}</h3>
        <b><a href="#" class="link metric muted-num" data-rule="${def.key}">
          <span class="temp-count">0</span>
          <span class="spin" aria-label="Loading"></span>
        </a></b>
      </div>`;
    }
    cards.insertAdjacentHTML('beforeend', ruleHtml);

    const datasetHash = computeDatasetHash(rows);
    const cached = loadRuleCache(datasetHash);
    const rawIndexByRow = new Map(state.raw.map((row, index) => [row, index]));
    function setAnchorMatches(a, indices){
      a.__matchIndices = Uint32Array.from(indices);
      a.textContent = a.__matchIndices.length;
      a.classList.remove('muted-num');
    }

    if (cached && cached.version === 3) {
      for (const def of ruleDefs) {
        const a = cards.querySelector(`a.metric[data-rule="${def.key}"]`);
        if (!a) continue;
        setAnchorMatches(a, cached.indicesByRule?.[def.key] || []);
      }
      return;
    }

    const storedIndicesByRule = {};
    let indicesByRule;
    try {
      indicesByRule = await runAnalyzerWorker('rules', rows, {rules: ruleDefs}, processed => {
        for (const def of ruleDefs) {
          const span = cards.querySelector(`a.metric[data-rule="${def.key}"] .temp-count`);
          if (span) span.textContent = `${processed}/${rows.length}`;
        }
      });
    } catch (error) {
      console.error('Rule worker failed:', error);
      indicesByRule = null;
    }
    const fallbackMatches = indicesByRule
      ? null
      : await computeBuiltInRuleMatchesChunked(rows, null, 600, ruleDefs);
    for (const def of ruleDefs) {
      const a = cards.querySelector(`a.metric[data-rule="${def.key}"]`);
      if (!a) continue;

      const localIndices = indicesByRule
        ? (indicesByRule[def.key] || [])
        : fallbackMatches[def.key];
      const indices = Uint32Array.from(localIndices, index => rawIndexByRow.get(rows[index]));
      storedIndicesByRule[def.key] = Array.from(indices);
      a.__matchIndices = indices;
      const span = a.querySelector('.temp-count');
      if (span) span.textContent = indices.length;
      a.classList.remove('muted-num');
      const sp = a.querySelector('.spin');
      if (sp) sp.remove();
    }

    const payload = {
      version: 3,
      counts: Object.fromEntries(Object.keys(storedIndicesByRule).map(k => [k, storedIndicesByRule[k].length])),
      indicesByRule: storedIndicesByRule
    };
    saveRuleCache(datasetHash, payload);
  })();

  bindCardsClickOnce(cards, metricData, ruleDefs, rows);
  wrap.appendChild(cards);

  const by = (key)=>{
    const m=freqMap(rows,key);
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  };
  const fileNames = Array.from(freqMapTokens(rows, fileTokensForRow).entries()).sort((a,b)=>b[1]-a[1]);
  const domains = aggregateDomains(rows);

  const grids = document.createElement('div');
  grids.className = 'grid cols-3';
  grids.appendChild(makeClickableTable('Alerts by Policy', ['Policy','Count'], by('Policies'), 'Policies', { showAll: true }));
  grids.appendChild(makeClickableTable('Alerts by Status', ['Status','Count'], by('Status'), 'Status'));
  grids.appendChild(makeClickableTable('Top Sources', ['Source','Count'], by('Source'), 'Source'));
  grids.appendChild(makeClickableTable('Top Destinations', ['Destination','Count'], by('Destination'), 'Destination'));
  grids.appendChild(makeClickableTable('Destination Domains', ['Domain','Count'], domains, 'Domain'));
  grids.appendChild(makeClickableTable('Top File Names', ['File Name','Count'], fileNames, 'File Name'));
  wrap.appendChild(grids);

  const volume = getVolumeSeries(rows);
  const volumeLabel = volume.granularity === 'hour' ? 'Hour' : 'Day';
  const vol = document.createElement('div');
  vol.className = 'section';
  vol.innerHTML = `<header><strong>Volume by ${volumeLabel}</strong>
                     <span class="tiny muted">${volume.pairs.length} ${volume.granularity}s</span></header>`;
  const cw = document.createElement('div');
  cw.className='chart-wrap';
  cw.appendChild(makeLineChart(volume.pairs, volume.granularity));
  vol.appendChild(cw);
  wrap.appendChild(vol);

  return wrap;
}

// Extracts the first valid email address from a string.
function makeSimpleTableEl(headers, rows){
  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${headers.map(h=>
    h==='Count' ? `<th class="count-col">${escapeHtml(h)}</th>`
                : `<th>${escapeHtml(h)}</th>`
  ).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  for(const r of rows){
    const tr = document.createElement('tr');
    r.forEach((v,idx)=>{
      const td=document.createElement('td');
      if(headers[idx]==='Count') td.className='count-col';
      td.textContent=String(v);
      td.title=String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  tbl.appendChild(thead); tbl.appendChild(tbody);
  return tbl;
}

// Builds a table section whose contents open drill-down filters when clicked.
function makeClickableTable(title, headers, rows, col, options = {}){
  const sec = document.createElement('div'); sec.className = 'section';
  sec.innerHTML = `<header><strong>${escapeHtml(title)}</strong><span class="tiny muted"></span></header>`;
  const body = document.createElement('div'); body.className = 'tablewrap';
  const pager = document.createElement('div'); pager.className = 'pager overview-pager'; pager.setAttribute('aria-label', `${title} pagination`);
  let page = 1;
  const renderPage = () => {
    const pageSize = options.showAll ? Math.max(1, rows.length) : 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, pages);
    const start = (page - 1) * pageSize;
    body.replaceChildren(makeSimpleTableEl(headers, rows.slice(start, start + pageSize)));
    body.querySelectorAll('tbody tr').forEach((tr, index) => {
      const name = rows[start + index][0];
      const cell = tr.cells[0];
      const link = document.createElement('a'); link.href = '#'; link.className = 'link'; link.textContent = name;
      link.title = name;
      link.addEventListener('click', event => { event.preventDefault(); openFilterTab(col, name, options.fromTab); });
      cell.replaceChildren(link);
    });
    if (options.showAll) return;
    pager.innerHTML = `<span>${rows.length ? `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length}` : 'No rows'}</span>`;
    const addButton = (label, nextPage, disabled) => {
      const button = document.createElement('button'); button.className = 'btn'; button.type = 'button'; button.textContent = label; button.disabled = disabled;
      button.addEventListener('click', () => { page = nextPage; renderPage(); }); pager.appendChild(button);
    };
    addButton('◀', Math.max(1, page - 1), page === 1);
    addButton('▶', Math.min(pages, page + 1), page === pages);
  };
  sec.appendChild(body); if (!options.showAll) sec.appendChild(pager); renderPage();
  return sec;
}

// Aggregates row counts by unique destination domain (based on base domain).
function aggregateDomains(rows){
  const m = new Map();
  for(const r of rows){
    const dest = txt(r['Destination']);
    const semi = dest.split(';');
    const parts = semi.map(x=> x.split(',')).flat().map(s=> s.trim()).filter(Boolean);
    const bases = parts.map(getBaseDomain).filter(Boolean);
    const uniq = Array.from(new Set(bases));
    for(const b of uniq){ m.set(b, (m.get(b)||0)+1); }
  }
  return Array.from(m.entries()).sort((a,b)=> b[1]-a[1]);
}

// Draws a responsive SVG line chart with axes, grid, and interactive tooltips.
function formatVolumeLabel(value, granularity, compact = false) {
  const date = new Date(granularity === 'hour' ? `${value}:00Z` : `${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', granularity === 'hour'
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: compact ? undefined : 'numeric', timeZone: 'UTC' }).format(date);
}

function makeLineChart(pairs, granularity = 'day'){
  const dates=pairs.map(p=>p[0]), values=pairs.map(p=>p[1]);
  const w=Math.max(600, document.querySelector('.wrap').clientWidth - 40);
  const h=220, pl=48, pr=12, pt=12, pb=28;
  const max=Math.max(1,...values), min=0;
  const x = (i)=> pl + (w-pl-pr) * (i/Math.max(1,values.length-1));
  const y = (v)=> h - pb - (h-pt-pb)*((v-min)/(max-min||1));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox',`0 0 ${w} ${h}`); svg.style.width='100%';
  const theme=getComputedStyle(document.documentElement);
  const axisColor=theme.getPropertyValue('--color-border-strong').trim();
  const gridColor=theme.getPropertyValue('--color-border').trim();
  const labelColor=theme.getPropertyValue('--color-text-muted').trim();

  const ax=document.createElementNS(svg.namespaceURI,'line'); ax.setAttribute('x1',pl); ax.setAttribute('y1',h-pb); ax.setAttribute('x2',w-pr); ax.setAttribute('y2',h-pb); ax.setAttribute('stroke',axisColor); svg.appendChild(ax);
  const ay=document.createElementNS(svg.namespaceURI,'line'); ay.setAttribute('x1',pl); ay.setAttribute('y1',pt); ay.setAttribute('x2',pl); ay.setAttribute('y2',h-pb); ay.setAttribute('stroke',axisColor); svg.appendChild(ay);

  const ticks=5;
  for(let i=0;i<=ticks;i++){
    const v=min+(max-min)*i/ticks, ty=y(v);
    const gl=document.createElementNS(svg.namespaceURI,'line'); gl.setAttribute('x1',pl); gl.setAttribute('x2',w-pr); gl.setAttribute('y1',ty); gl.setAttribute('y2',ty); gl.setAttribute('stroke',gridColor); gl.setAttribute('stroke-dasharray','2,4'); svg.appendChild(gl);
    const label=document.createElementNS(svg.namespaceURI,'text'); label.setAttribute('x',pl-6); label.setAttribute('y',ty+4); label.setAttribute('text-anchor','end'); label.setAttribute('fill',labelColor); label.setAttribute('font-size','12'); label.textContent=Math.round(v); svg.appendChild(label);
  }

  const step=Math.ceil(dates.length/12)||1;
  for(let i=0;i<dates.length;i+=step){
    const tx=x(i);
    const label=document.createElementNS(svg.namespaceURI,'text'); label.setAttribute('x',tx); label.setAttribute('y',h-8); label.setAttribute('text-anchor','middle'); label.setAttribute('fill',labelColor); label.setAttribute('font-size','12'); label.textContent=formatVolumeLabel(dates[i], granularity, true); svg.appendChild(label);
  }

  const poly=document.createElementNS(svg.namespaceURI,'polyline'); poly.setAttribute('points', values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')); poly.setAttribute('fill','none'); poly.setAttribute('stroke','currentColor'); poly.setAttribute('stroke-width','2'); svg.appendChild(poly);

  const dot=document.createElementNS(svg.namespaceURI,'circle'); dot.setAttribute('r','4'); dot.setAttribute('fill','currentColor'); dot.style.display='none'; svg.appendChild(dot);
  const tooltip=document.createElement('div'); tooltip.className='tooltip'; document.body.appendChild(tooltip);
  const hit=document.createElementNS(svg.namespaceURI,'rect'); hit.setAttribute('x',pl); hit.setAttribute('y',pt); hit.setAttribute('width',w-pl-pr); hit.setAttribute('height',h-pt-pb); hit.setAttribute('fill','transparent'); svg.appendChild(hit);

  hit.addEventListener('mousemove', (e)=>{
    const rect=svg.getBoundingClientRect(); const px=e.clientX-rect.left;
    const t=Math.max(0, Math.min(1,(px-pl)/(w-pl-pr))); const i=Math.round(t*(values.length-1));
    const cx=x(i), cy=y(values[i]); dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); dot.style.display='';
    tooltip.style.display='block'; tooltip.textContent=`${formatVolumeLabel(dates[i], granularity)} • ${values[i]} alerts`;
    tooltip.style.left=(rect.left+window.scrollX+cx+12)+'px'; tooltip.style.top=(rect.top+window.scrollY+cy-10)+'px';
  });
  hit.addEventListener('mouseleave', ()=>{ dot.style.display='none'; tooltip.style.display='none'; });
  return svg;
}

// Renders a tab table section with fixed 50-row pagination and export.
function renderTableSection(tab){
  const sec = document.createElement('div'); sec.className = 'sectionx';

  const topSources = Array.from(freqMap(tab.rows, 'Source').entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topSources.length) {
    const summary = document.createElement('div');
    summary.className = 'top-sources';
    const heading = document.createElement('strong');
    heading.textContent = 'Top Sources (10)';
    summary.appendChild(heading);
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'icon-copy top-sources-copy';
    copyButton.title = 'Copy top sources as a table';
    copyButton.setAttribute('aria-label', 'Copy top sources as a table');
    copyButton.innerHTML = DLPUtils.copyIconSvg();
    copyButton.addEventListener('click', () => copyTopSources(topSources, copyButton));
    summary.appendChild(copyButton);
    for (const [source, count] of topSources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'source-chip';
      button.textContent = `${source} (${count})`;
      button.addEventListener('click', () => openFilterTab('Source', source, tab));
      summary.appendChild(button);
    }
    sec.appendChild(summary);
  }

  if (tab.filter?.col === 'Source') {
    const filteredRows = applyFiltersAndSort(tab.rows, getTabState(tab.key).filters, null);
    const topFive = entries => Array.from(entries).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const contextualTab = {rows: filteredRows};
    const summaries = document.createElement('div');
    summaries.className = 'grid cols-3 source-filter-summaries';
    summaries.appendChild(makeClickableTable('Top 5 Destinations', ['Destination', 'Count'], topFive(freqMap(filteredRows, 'Destination').entries()), 'Destination', {showAll: true, fromTab: contextualTab}));
    summaries.appendChild(makeClickableTable('Top 5 File Names', ['File Name', 'Count'], topFive(freqMapTokens(filteredRows, fileTokensForRow).entries()), 'File Name', {showAll: true, fromTab: contextualTab}));
    summaries.appendChild(makeClickableTable('Top 5 Details', ['Details', 'Count'], topFive(freqMap(filteredRows, 'Details').entries()), 'Details', {showAll: true, fromTab: contextualTab}));
    sec.appendChild(summaries);
  }

  const body = document.createElement('div'); body.className = 'tablewrap';
  const tableEl = renderDataTable(tab); body.appendChild(tableEl); sec.appendChild(body);

  const mostHits = document.createElement('div');
  mostHits.className = 'most-hits';
  sec.appendChild(mostHits);
  renderMostHits(mostHits, tableEl.__meta.rows);

  const actions = document.createElement('div'); actions.className = 'table-actions';
  const pager = document.createElement('div'); pager.className = 'pager'; pager.id = `pager-${safeKey(tab.key)}`;
  const right = document.createElement('div'); right.className = 'right';
  right.innerHTML = '<button class="btn" data-act="export">Export CSV</button>';
  actions.appendChild(pager); actions.appendChild(right); sec.appendChild(actions);

  right.querySelector('[data-act="export"]').addEventListener('click', ()=> exportCurrentView(tab, tableEl));
  updatePager(tab, sec, tableEl);
  return sec;
}

function renderMostHits(container, rows) {
  const hits = computeMostHits(rows);
  container.innerHTML = '';
  const heading = document.createElement('strong');
  heading.textContent = 'Most Hits';
  container.appendChild(heading);
  const values = [
    ['Domain', hits.domain && `${hits.domain.value} (${hits.domain.count})`],
    ['Filename', hits.filename && `${hits.filename.value}${hits.filename.extension ? ` (${hits.filename.extension})` : ''} (${hits.filename.count})`],
    ['Detail', hits.detail && `${hits.detail.value} (${hits.detail.count})`]
  ];
  for (const [label, value] of values) {
    const row = document.createElement('div');
    row.className = 'most-hits-row';
    const name = document.createElement('b');
    name.textContent = `${label}:`;
    row.append(name, document.createTextNode(` ${value || '—'}`));
    container.appendChild(row);
  }
}

// Copies the source summary like an alert row: HTML for spreadsheet-aware
// clients and tab-separated plain text as a fallback. The data has no header.
async function copyTopSources(topSources, button){
  const cells = topSources.map(([source, count]) => [String(source), String(count)]);
  const text = cells.map(([source, count]) => `${source.replace(/[\t\r\n]+/g, ' ')}\t${count}`).join('\n') + '\n';
  const html = `<!doctype html><html><body><table>${cells.map(([source, count]) => `<tr><td>${DLPUtils.escapeHtml(source)}</td><td>${DLPUtils.escapeHtml(count)}</td></tr>`).join('')}</table></body></html>`;
  const originalIcon = button.innerHTML;

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Clipboard copy was rejected');
    }
    DLPUtils.showCopyPreview(cells);
    button.innerHTML = '<span aria-hidden="true">✓</span>';
    button.classList.add('is-copied');
    button.title = 'Top sources copied';
    button.setAttribute('aria-label', 'Top sources copied');
  } catch (error) {
    button.innerHTML = '<span aria-hidden="true">!</span>';
    button.classList.add('copy-failed');
    button.title = 'Failed to copy top sources';
    button.setAttribute('aria-label', 'Failed to copy top sources');
    console.error('Failed to copy top sources:', error);
  }

  window.setTimeout(() => {
    button.innerHTML = originalIcon;
    button.classList.remove('is-copied', 'copy-failed');
    button.title = 'Copy top sources as a table';
    button.setAttribute('aria-label', 'Copy top sources as a table');
  }, 1800);
}

// Renders a tab data table with filtering, sorting, pagination, and metadata.
function renderDataTable(tab){
  const st = getTabState(tab.key);
  const rows = applyFiltersAndSort(tab.rows, st.filters, st.sort);
  const page = st.page, pageSize = st.pageSize;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const tbl = document.createElement('table');

  const visibleCols = VISIBLE_COLS;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const col of visibleCols){
    const th = document.createElement('th');
    th.textContent = HEADER_LABELS[col];

    if (col === ICON_COL) {
      th.classList.add('iconcell');
      th.setAttribute('aria-label', 'Copy row');
    }

    if (FILTERABLE_COLS.includes(col)){
      const ico = document.createElement('span');
      ico.className = 'filter-icon';
      ico.innerHTML = svgFilter();
      ico.title = 'Filter contains text';
      ico.addEventListener('click', (e)=> openFilterPopover(e.currentTarget, tab, col));
      th.appendChild(ico);
    }
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const r of pageRows){
    const tr = document.createElement('tr');

    const cells = {
      'Time'       : '',
      'Source'     : txt(r['Source']).trim(),
      'Policies'   : txt(r['Policies']),
      'Channel'    : txt(r['Channel']),
      'Destination': txt(r['Destination']).trim(),
      'File Name'  : txt(r['File Name']),
      'Size'       : txt(r['Size']),
      'Details'    : txt(r['Details']),
      'Status'     : txt(r['Status'])
    };

    for (const col of visibleCols){
      const td  = document.createElement('td');

      if (col === ICON_COL){
        td.classList.add('iconcell');
        const btn = document.createElement('button');
        btn.className = 'icon-copy';
        btn.title = 'Copy this row';
        btn.setAttribute('aria-label', 'Copy this row');
        btn.innerHTML = DLPUtils.copyIconSvg();
        btn.addEventListener('click', async (e)=>{
          e.preventDefault();
          btn.disabled = true;
          try { await copyRowToClipboard(r); } finally { btn.disabled = false; }
        });
        td.appendChild(btn);
        tr.appendChild(td);
        continue;
      }

      if (col === 'Time'){
        td.classList.add('timecell');
        td.innerHTML = timeCellHTML(r);
        td.title     = timeCellPlainText(r);
      } else if (col === 'Source' || col === 'Destination' || col === 'Policies' || col === 'Status' || col === 'File Name' || col === 'Details' || col === 'Channel'){
        const full  = cells[col];
        const shown = cells[col];
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'link copy-cell';
        if (col === 'Channel' && DLPUtils.channelIconEntity(full)) {
          a.innerHTML = `<span class="channel-icon" aria-hidden="true">${DLPUtils.channelIconEntity(full)}</span>${escapeHtml(shown)}`;
        } else {
          a.textContent = shown;
        }
        a.title = full;
        a.dataset.value = full;
        a.addEventListener('click',(e)=>{
          e.preventDefault();
          if (full) {
            navigator.clipboard.writeText(full).then(()=>{
              console.log(`${col} "${full}" copied`);
            });
          }
        });
        td.appendChild(a);
      } else {
        const full  = cells[col];
        const shown = cells[col];
        td.textContent = shown;
        td.title = full;
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  tbl.appendChild(tbody);

  tbl.__meta = { total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / pageSize)), rows, pageRows, visibleCols };
  tbl.classList.add(`cols-${visibleCols.length}`);
  return tbl;
}

const INACTIVE_ICON = '🔍';
const ACTIVE_ICON = '🔍✨';

// Updates table-header filter icons to match the tab filter state.
function updateFilterIcons(tab, root){
  const st = getTabState(tab.key);
  let scope =
    (root && root) ||
    document.querySelector(`[data-tab="${tab.key}"]`) ||
    document.querySelector('table');
  if (!scope) return;
  scope.querySelectorAll('.filter-icon').forEach(ico=>{
    const col = ico.getAttribute('data-col');
    const val = (st.filters?.[col] ?? '').trim();
    ico.textContent = val ? ACTIVE_ICON : INACTIVE_ICON;
    ico.classList.toggle('is-active', !!val);
    ico.setAttribute('aria-pressed', val ? 'true' : 'false');
    ico.title = val ? `Active filter: ${val}` : 'Filter';
  });
}

// Opens a filter/sort popover for a column and applies user actions.
function openFilterPopover(anchor, tab, col){
  closePopovers();
  const th = anchor.closest('th');
  const pop = document.createElement('div');
  pop.className = 'filter-pop';
  const st = getTabState(tab.key);
  const currentFilter = st.filters[col] || '';
  const currentSort = (st.sort && st.sort.col === col) ? st.sort.type : null;
  pop.innerHTML = `
    <div class="filter-sort-actions">
      <button class="btn btn-sort" title="Ascending" aria-label="Sort ascending" data-type="asc" ${currentSort==='asc'?'style="outline:1px solid var(--accent)"':''}>↑</button>
      <button class="btn btn-sort" title="Descending" aria-label="Sort descending" data-type="desc" ${currentSort==='desc'?'style="outline:1px solid var(--accent)"':''}>↓</button>
      <button class="btn btn-sort" title="Most frequent first" aria-label="Sort most frequent first" data-type="most" ${currentSort==='most'?'style="outline:1px solid var(--accent)"':''}>Most</button>
      <button class="btn btn-sort" title="Least frequent first" aria-label="Sort least frequent first" data-type="least" ${currentSort==='least'?'style="outline:1px solid var(--accent)"':''}>Least</button>
    </div>
    <div><input type="text" placeholder="contains... (leave blank to clear)"
      value="${escapeHtml(currentFilter)}" style="width:100%" /></div>
    <div class="tiny muted" style="margin-top:4px">Enter to apply filter • Esc to close</div>
  `;
  th.style.position = "relative";
  th.appendChild(pop);
  updateFilterIcons(tab, th.closest('[data-tab]') || th.closest('table'));
  pop.querySelectorAll('.btn-sort').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const type = btn.getAttribute('data-type');
      st.sort = { col, type };
      st.page = 1;
      rerenderActive();
      updateFilterIcons(tab, th.closest('[data-tab]') || th.closest('table'));
      closePopovers();
    });
  });
  const input = pop.querySelector('input');
  input.focus(); input.select();
  input.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){
      const v=input.value.trim();
      if(v) st.filters[col]=v; else delete st.filters[col];
      st.page=1;
      rerenderActive();
      updateFilterIcons(tab, th.closest('[data-tab]') || th.closest('table'));
      closePopovers();
    } else if(e.key==='Escape'){ closePopovers(); }
  });
}

// Positions a popover absolutely relative to its anchor.
function positionPopover(pop, anchor){
  const r = anchor.getBoundingClientRect();
  pop.style.left = (r.left + window.scrollX) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
}

// Closes all open filter popovers.
function closePopovers(){
  $$('.filter-pop').forEach(p=> p.remove());
}

window.addEventListener('click', (e)=>{ if(!e.target.closest('.filter-pop') && !e.target.closest('.filter-icon')) closePopovers(); });

// Applies filtering and sorting to a row array and returns the result.
function applyFiltersAndSort(rows, filters, sort){
  let out = rows.slice();
  for(const k of Object.keys(filters||{})){
    const needle = (filters[k]||'').toLowerCase();
    if(k==='Time'){
      out = out.filter(r=>{
        const comp = `ID ${txt(r['ID'])} Incident ${txt(r['Incident Time'])} Event ${txt(r['Event Time'])}`.toLowerCase();
        return comp.includes(needle);
      });
    } else {
      out = out.filter(r=> txt(r[k]).toLowerCase().includes(needle));
    }
  }
  if (sort && sort.col){
    const col = sort.col;
    if (sort.type === 'most' || sort.type === 'least'){
      const valueFor = row => txt(row[col === 'Time' ? 'Incident Time' : col]).trim().toLowerCase();
      const frequencies = new Map();
      for (const row of out) {
        const value = valueFor(row);
        frequencies.set(value, (frequencies.get(value) || 0) + 1);
      }
      out.sort((a, b) => {
        const av = valueFor(a);
        const bv = valueFor(b);
        const countDifference = (frequencies.get(bv) || 0) - (frequencies.get(av) || 0);
        if (countDifference !== 0) return sort.type === 'most' ? countDifference : -countDifference;
        const valueDifference = av.localeCompare(bv, undefined, {numeric:true,sensitivity:'base'});
        if (valueDifference !== 0) return valueDifference;
        const at=parseIncidentTime(a['Incident Time']); const bt=parseIncidentTime(b['Incident Time']);
        return (bt?bt.getTime():-Infinity) - (at?at.getTime():-Infinity);
      });
    } else if (sort.type === 'asc' || sort.type === 'desc'){
      if (col === 'Time'){
        out.sort((a,b)=>{
          const at=parseIncidentTime(a['Incident Time']);
          const bt=parseIncidentTime(b['Incident Time']);
          const cmp = (at?at.getTime():-Infinity) - (bt?bt.getTime():-Infinity);
          return sort.type === 'asc' ? cmp : -cmp;
        });
      } else {
        out.sort((a,b)=>{
          const av = txt(a[col]).toLowerCase();
          const bv = txt(b[col]).toLowerCase();
          const cmp = av.localeCompare(bv, undefined, {numeric:true,sensitivity:'base'});
          if (cmp !== 0) return sort.type === 'asc' ? cmp : -cmp;
          const at=parseIncidentTime(a['Incident Time']); const bt=parseIncidentTime(b['Incident Time']);
          return (bt?bt.getTime():-Infinity) - (at?at.getTime():-Infinity);
        });
      }
    }
  } else {
    const sF = freqMap(out,'Source'); const dF = freqMap(out,'Destination');
    out.sort((a,b)=>{
      const as=sF.get(txt(a['Source']).trim())||0, bs=sF.get(txt(b['Source']).trim())||0; if(bs!==as) return bs-as;
      const ad=dF.get(txt(a['Destination']).trim())||0, bd=dF.get(txt(b['Destination']).trim())||0; if(bd!==ad) return bd-ad;
      const at=parseIncidentTime(a['Incident Time']); const bt=parseIncidentTime(b['Incident Time']);
      return (bt?bt.getTime():-Infinity) - (at?at.getTime():-Infinity);
    });
  }
  return out;
}

// Updates pager elements (page information and navigation buttons) for the active table.
function updatePager(tab, sectionEl, tableEl){
  const pager = sectionEl.querySelector(`#pager-${safeKey(tab.key)}`);
  const st = getTabState(tab.key);
  const total = tableEl.__meta.total, page = tableEl.__meta.page, pages = tableEl.__meta.pages;
  pager.innerHTML = '';
  const info = document.createElement('span');
  const start = (page-1)*st.pageSize + 1, end = Math.min(total, page*st.pageSize);
  info.textContent = total ? `Showing ${start}–${end} of ${total}` : 'No rows';
  pager.appendChild(info);
  const mk=(label,fn,dis)=>{const b=document.createElement('button'); b.className='btn'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click',fn); return b;};
  pager.appendChild(mk('⏮', ()=>{ st.page=1; rerenderTabTable(tab,sectionEl); }, page<=1));
  pager.appendChild(mk('◀',  ()=>{ st.page=Math.max(1,st.page-1); rerenderTabTable(tab,sectionEl); }, page<=1));
  pager.appendChild(mk('▶',  ()=>{ st.page=Math.min(pages,st.page+1); rerenderTabTable(tab,sectionEl); }, page>=pages));
  pager.appendChild(mk('⏭', ()=>{ st.page=pages; rerenderTabTable(tab,sectionEl); }, page>=pages));
}

// Rerenders a table in a given tab section and synchronizes the pager.
function rerenderTabTable(tab, sectionEl){
  const body = sectionEl.querySelector('.tablewrap'); body.innerHTML = '';
  const tbl = renderDataTable(tab); body.appendChild(tbl);
  renderMostHits(sectionEl.querySelector('.most-hits'), tbl.__meta.rows);
  updatePager(tab, sectionEl, tbl);
}

// Rerenders the active tab (used after filters or sorting change).
function rerenderActive(){
  renderActiveTab();
}

// Normalizes a filename for use as a safe download name.
function sanitizeFileName(s){
  let out = '';
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c==='_'||c==='-') out+=c; else out+='_';
  }
  return out;
}

// Exports the current table view (active page) to CSV.
function exportCurrentView(tab, tableEl){
  const rows = tableEl.__meta.rows; const cols = ALL_COLS; const dq = '"', nl = '\n';
  const csv = [cols.join(',')].concat(
    rows.map(r=> cols.map(c=>{
      const v = txt(r[c]);
      return (v.includes(dq)||v.includes(',')||v.includes(nl)) ? dq+v.split(dq).join(dq+dq)+dq : v;
    }).join(','))
  ).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeFileName(tab.label||'table')}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

// Copies the current table view (active page) to the clipboard as TSV.
function copyCurrentView(tableEl){
  const cols = tableEl.__meta.visibleCols;
  const header = cols.join('\t');
  const rows = tableEl.__meta.pageRows.map(r=>
    cols.map(c=> c==='Time'
      ? `ID ${txt(r['ID'])} | Incident ${txt(r['Incident Time'])} | Event ${txt(r['Event Time'])}`
      : txt(r[c])
    ).join('\t')
  ).join('\n');
  navigator.clipboard.writeText(header+'\n'+rows);
}

// Applies a drill-down filter to rows for a given column or domain.
function applyDrillFilter(universe, filter){
  let rows = universe.slice();
  if(filter.col === 'Domain'){
    rows = rows.filter(r=>{
      const semi  = txt(r['Destination']).split(';');
      const parts = semi.map(x=> x.split(',')).flat().map(s=> s.trim()).filter(Boolean);
      return parts.some(x=> getBaseDomain(x) === filter.value);
    });
  } else if (filter.col === 'File Name') {
    rows = rows.filter(row => fileTokensForRow(row).includes(filter.value));
  } else {
    rows = rows.filter(r=> txt(r[filter.col]).trim() === filter.value);
  }
  return rows;
}

// Opens a new drill-down tab based on the selected column and value.
function openFilterTab(col, value, fromTab){
  const universe = (fromTab ? fromTab.rows : state.raw);
  const rows = applyDrillFilter(universe, {col, value});
  const key = `flt::${col}::${safeKey(value)}::${Date.now()}`;
  const label = `${col}: ${value}`;
  const tab = { key, label, type:'drill', rows, closable:true, filter:{col, value} };
  state.tabs.push(tab);
  state.activeTab = key;
  renderTabs();
}

// Opens a new ad hoc tab containing the provided rows.
function openAdHocTab(label, rows){
  const key = `adhoc::${safeKey(label)}::${Date.now()}`;
  const tab = { key, label, type:'drill', rows, closable:true, filter:null };
  state.tabs.push(tab);
  state.activeTab = key;
  renderTabs();
}

// Updates the incident time-range label from the loaded dataset.
function updateIncidentRange(){
  const el = document.getElementById('rangeVal');
  if (!el) return;

  if (!state.raw.length){
    el.textContent = '–';
    return;
  }

  const dates = state.raw
    .map(r => parseIncidentTime(r['Incident Time']))
    .filter(Boolean)
    .sort((a,b)=>a-b);

  if (!dates.length){
    el.textContent = '–';
    return;
  }

  const min = formatDateShort(dates[0]);
  const max = formatDateShort(dates[dates.length-1]);

  // Display the combined filenames (populated by the multi-file upload handler)
  el.textContent = (currentFilename ? currentFilename + ': ' : '') + `${min} – ${max}`;
}
function svgFilter(){
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18v2l-7 8v5l-4 1v-6L3 6z"/></svg>';
}

// Delegation: all clicks on .copy-id
document.addEventListener('click', e=>{
  const a = e.target.closest('.copy-id');
  if(a){
    e.preventDefault();
    const id = a.dataset.id;
    if(id){
      navigator.clipboard.writeText(id).then(()=>{
        console.log(`Incident ID ${id} copied`);
      });
    }
  }
});

// Delegation: all clicks on .copy-cell
document.addEventListener('click', e=>{
  const a = e.target.closest('.copy-cell');
  if(a){
    e.preventDefault();
    const val = a.dataset.value || a.textContent;
    if(val){
      navigator.clipboard.writeText(val).then(()=>{
        console.log(`Cell "${val}" copied`);
      });
    }
  }
});
