/* Alert Analyzer: ui */

function renderTabs(){
  const tabsEl = $('#tabs'); tabsEl.innerHTML = '';
  for(const t of state.tabs){
    const b = document.createElement('button');
    b.className = 'tab-btn';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(state.activeTab===t.key));
    const labelSpan = document.createElement('span');
    labelSpan.textContent = t.label;
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
      sources:   `Rows with Source (${rowsWithSource.length})`,
      emaildest: `Email Destinations (${rowsEmailDest.length})`,
      webdest:   `Web Destinations (${rowsWebDest.length})`,
      channels:  `Rows with Channel (${rowsWithChan.length})`,
      blocks:    `Action: Block/Quarantine (${rowsBlocks.length})`
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
    const idIndex = indexRowsById(rows);

    function setAnchorMatches(a, ids){
      a.__matches = ids.map(id => {
        const ix = idIndex.get(id);
        return typeof ix === 'number' ? rows[ix] : null;
      }).filter(Boolean);
      a.textContent = a.__matches.length;
      a.classList.remove('muted-num');
    }

    if (cached && cached.version === 2) {
      for (const def of ruleDefs) {
        const a = cards.querySelector(`a.metric[data-rule="${def.key}"]`);
        if (!a) continue;
        const ids = cached.idsByRule?.[def.key] || [];
        setAnchorMatches(a, ids);
      }
      return;
    }

    const idsByRule = {};
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

      const matches = indicesByRule
        ? (indicesByRule[def.key] || []).map(index => rows[index])
        : fallbackMatches[def.key];
      const ids = matches.map(getRowId);

      idsByRule[def.key] = ids;
      a.__matches = matches;
      const span = a.querySelector('.temp-count');
      if (span) span.textContent = matches.length;
      a.classList.remove('muted-num');
      const sp = a.querySelector('.spin');
      if (sp) sp.remove();
    }

    const payload = {
      version: 2,
      counts: Object.fromEntries(Object.keys(idsByRule).map(k => [k, idsByRule[k].length])),
      idsByRule
    };
    saveRuleCache(datasetHash, payload);
  })();

  bindCardsClickOnce(cards, metricData, ruleDefs, rows);
  wrap.appendChild(cards);

  const by = (key)=>{
    const m=freqMap(rows,key);
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  };
  const domains = aggregateDomains(rows);

  const grids = document.createElement('div');
  grids.className = 'grid cols-3';
  grids.appendChild(makeClickableTable('Alerts by Policy', ['Policy','Count'], by('Policies'), 'Policies'));
  grids.appendChild(makeClickableTable('Alerts by Status', ['Status','Count'], by('Status'), 'Status'));
  grids.appendChild(makeClickableTable('Top Sources', ['Source','Count'], by('Source'), 'Source'));
  grids.appendChild(makeClickableTable('Top Destinations', ['Destination','Count'], by('Destination'), 'Destination'));
  grids.appendChild(makeClickableTable('Destination Domains', ['Domain','Count'], domains, 'Domain'));
  grids.appendChild(makeClickableTable('Top File Names', ['File Name','Count'], by('File Name').slice(0,50), 'File Name'));
  wrap.appendChild(grids);

  const byDay = aggregateByDay(rows);
  const vol = document.createElement('div');
  vol.className = 'section';
  vol.innerHTML = `<header><strong>Volume by Day</strong>
                     <span class="tiny muted">${byDay.length} days</span></header>`;
  const cw = document.createElement('div');
  cw.className='chart-wrap';
  cw.appendChild(makeLineChart(byDay));
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
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  tbl.appendChild(thead); tbl.appendChild(tbody);
  return tbl;
}

// Builds a table section whose contents open drill-down filters when clicked.
function makeClickableTable(title, headers, rows, col){
  const sec = document.createElement('div'); sec.className = 'section';
  sec.innerHTML = `<header><strong>${escapeHtml(title)}</strong><span class="tiny muted">  </span></header>`;
  const body = document.createElement('div'); body.className = 'tablewrap';
  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${headers.map(h=>
    h==='Count' ? `<th class="count-col">${escapeHtml(h)}</th>`
                : `<th>${escapeHtml(h)}</th>`
  ).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  for(const pair of rows){
    const name = pair[0]; const count = pair[1];
    const tr = document.createElement('tr');
    const td0 = document.createElement('td');
    const a = document.createElement('a'); a.href='#'; a.className='link'; a.textContent = name;
    a.addEventListener('click',(e)=>{e.preventDefault(); openFilterTab(col, name);});
    td0.appendChild(a); tr.appendChild(td0);
    const td1 = document.createElement('td');
    td1.textContent = count;
    td1.className='count-col';
    tr.appendChild(td1);
    tbody.appendChild(tr);
  }
  tbl.appendChild(thead); tbl.appendChild(tbody); body.appendChild(tbl); sec.appendChild(body);
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

// Aggregates alert counts by day (based on Incident Time, ISO yyyy-mm-dd).
function aggregateByDay(rows){
  const m = new Map();
  for(const r of rows){
    const d = parseIncidentTime(r['Incident Time']); if(!d) continue;
    const key = d.toISOString().slice(0,10);
    m.set(key, (m.get(key)||0)+1);
  }
  return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
}

// Draws a responsive SVG line chart with axes, grid, and interactive tooltips.
function makeLineChart(pairs){
  const dates=pairs.map(p=>p[0]), values=pairs.map(p=>p[1]);
  const w=Math.max(600, document.querySelector('.wrap').clientWidth - 40);
  const h=220, pl=48, pr=12, pt=12, pb=28;
  const max=Math.max(1,...values), min=0;
  const x = (i)=> pl + (w-pl-pr) * (i/Math.max(1,values.length-1));
  const y = (v)=> h - pb - (h-pt-pb)*((v-min)/(max-min||1));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox',`0 0 ${w} ${h}`); svg.style.width='100%';

  const ax=document.createElementNS(svg.namespaceURI,'line'); ax.setAttribute('x1',pl); ax.setAttribute('y1',h-pb); ax.setAttribute('x2',w-pr); ax.setAttribute('y2',h-pb); ax.setAttribute('stroke','#2b3d55'); svg.appendChild(ax);
  const ay=document.createElementNS(svg.namespaceURI,'line'); ay.setAttribute('x1',pl); ay.setAttribute('y1',pt); ay.setAttribute('x2',pl); ay.setAttribute('y2',h-pb); ay.setAttribute('stroke','#2b3d55'); svg.appendChild(ay);

  const ticks=5;
  for(let i=0;i<=ticks;i++){
    const v=min+(max-min)*i/ticks, ty=y(v);
    const gl=document.createElementNS(svg.namespaceURI,'line'); gl.setAttribute('x1',pl); gl.setAttribute('x2',w-pr); gl.setAttribute('y1',ty); gl.setAttribute('y2',ty); gl.setAttribute('stroke','#1d2633'); gl.setAttribute('stroke-dasharray','2,4'); svg.appendChild(gl);
    const label=document.createElementNS(svg.namespaceURI,'text'); label.setAttribute('x',pl-6); label.setAttribute('y',ty+4); label.setAttribute('text-anchor','end'); label.setAttribute('fill','#8aa0b5'); label.setAttribute('font-size','12'); label.textContent=Math.round(v); svg.appendChild(label);
  }

  const step=Math.ceil(dates.length/12)||1;
  for(let i=0;i<dates.length;i+=step){
    const tx=x(i);
    const label=document.createElementNS(svg.namespaceURI,'text'); label.setAttribute('x',tx); label.setAttribute('y',h-8); label.setAttribute('text-anchor','middle'); label.setAttribute('fill','#8aa0b5'); label.setAttribute('font-size','12'); label.textContent=dates[i]; svg.appendChild(label);
  }

  const poly=document.createElementNS(svg.namespaceURI,'polyline'); poly.setAttribute('points', values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')); poly.setAttribute('fill','none'); poly.setAttribute('stroke','currentColor'); poly.setAttribute('stroke-width','2'); svg.appendChild(poly);

  const dot=document.createElementNS(svg.namespaceURI,'circle'); dot.setAttribute('r','4'); dot.setAttribute('fill','currentColor'); dot.style.display='none'; svg.appendChild(dot);
  const tooltip=document.createElement('div'); tooltip.className='tooltip'; document.body.appendChild(tooltip);
  const hit=document.createElementNS(svg.namespaceURI,'rect'); hit.setAttribute('x',pl); hit.setAttribute('y',pt); hit.setAttribute('width',w-pl-pr); hit.setAttribute('height',h-pt-pb); hit.setAttribute('fill','transparent'); svg.appendChild(hit);

  hit.addEventListener('mousemove', (e)=>{
    const rect=svg.getBoundingClientRect(); const px=e.clientX-rect.left;
    const t=Math.max(0, Math.min(1,(px-pl)/(w-pl-pr))); const i=Math.round(t*(values.length-1));
    const cx=x(i), cy=y(values[i]); dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); dot.style.display='';
    tooltip.style.display='block'; tooltip.textContent=`${dates[i]} • ${values[i]} alerts`;
    tooltip.style.left=(rect.left+window.scrollX+cx+12)+'px'; tooltip.style.top=(rect.top+window.scrollY+cy-10)+'px';
  });
  hit.addEventListener('mouseleave', ()=>{ dot.style.display='none'; tooltip.style.display='none'; });
  return svg;
}

// Renders a tab table section with pagination, export, copy, and page-size controls.
function renderTableSection(tab){
  const sec = document.createElement('div'); sec.className = 'sectionx';
  sec.innerHTML = `<header><strong>${escapeHtml(tab.label)}</strong><span class="tiny muted"></span></header>`;

  const body = document.createElement('div'); body.className = 'tablewrap';
  const tableEl = renderDataTable(tab); body.appendChild(tableEl); sec.appendChild(body);

  const actions = document.createElement('div'); actions.className = 'table-actions';
  const pager = document.createElement('div'); pager.className = 'pager'; pager.id = `pager-${safeKey(tab.key)}`;
  const right = document.createElement('div'); right.className = 'right';
  right.innerHTML = `
    <button class="btn" data-act="export">Export CSV</button>
    <button class="btn" data-act="copy">Copy table</button>
    <label style="margin-left:8px">Rows/page
      <select data-role="pagesize"><option>25</option><option selected>50</option><option>100</option></select>
    </label>`;
  actions.appendChild(pager); actions.appendChild(right); sec.appendChild(actions);

  right.querySelector('[data-act="export"]').addEventListener('click', ()=> exportCurrentView(tab, tableEl));
  right.querySelector('[data-act="copy"]').addEventListener('click', ()=> copyCurrentView(tableEl));
  right.querySelector('[data-role="pagesize"]').addEventListener('change', (e)=>{ const st=getTabState(tab.key); st.pageSize=parseInt(e.target.value,10)||50; st.page=1; rerenderTabTable(tab, sec); });

  updatePager(tab, sec, tableEl);
  return sec;
}

// Renders a tab data table with filtering, sorting, pagination, and metadata.
function renderDataTable(tab){
  const st = getTabState(tab.key);
  const rows = applyFiltersAndSort(tab.rows, st.filters, st.sort);
  const page = st.page, pageSize = st.pageSize;
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const tbl = document.createElement('table');

  const visibleCols = tab.type === 'clusters'
    ? [ICON_COL, 'Time', 'Alert Count', 'Source', 'Channel', 'Destination', 'Policies', 'File Name', 'Details']
    : VISIBLE_COLS;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const col of visibleCols){
    const th = document.createElement('th');
    th.textContent = HEADER_LABELS[col];

    if (col === ICON_COL) th.classList.add('iconcell');

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
      'Alert Count': txt(r['Alert Count']),
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
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
		  <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
		</svg>`;
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
      } else if (col === 'Details' && Array.isArray(r.clusterRows)) {
        const details = document.createElement('details');
        details.className = 'cluster-alerts';
        const summary = document.createElement('summary');
        summary.textContent = `View ${r.clusterRows.length} original alert${r.clusterRows.length === 1 ? '' : 's'}`;
        details.appendChild(summary);
        const list = document.createElement('div');
        list.className = 'cluster-alert-list';
        for (const alert of r.clusterRows) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'cluster-alert-item';
          item.textContent = `${txt(alert.ID) || 'No ID'} — ${stripGMT(txt(alert['Incident Time']))} — ${txt(alert['Policies']) || 'No policy'} — ${txt(alert['File Name']) || 'No file'}`;
          item.title = 'Copy original alert details';
          item.addEventListener('click', () => copyRowToClipboard(alert));
          list.appendChild(item);
        }
        details.appendChild(list);
        td.appendChild(details);
      } else if (col === 'Source' || col === 'Destination' || col === 'Policies' || col === 'Status' || col === 'File Name' || col === 'Details' || col === 'Channel'){
        const full  = cells[col];
        const shown = cells[col];
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'link copy-cell';
        a.textContent = shown;
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
    <div style="display:grid; grid-template-columns:repeat(4,auto); gap:6px; margin-bottom:8px;">
      <button class="btn btn-sort" title="Ascending" data-type="asc"  ${currentSort==='asc'?'style="outline:1px solid var(--accent)"':''}>A</button>
      <button class="btn btn-sort" title="Descending" data-type="desc" ${currentSort==='desc'?'style="outline:1px solid var(--accent)"':''}>D</button>
      <button class="btn btn-sort" title="Most" data-type="most" ${currentSort==='most'?'style="outline:1px solid var(--accent)"':''}>M</button>
      <button class="btn btn-sort" title="Less" data-type="less" ${currentSort==='less'?'style="outline:1px solid var(--accent)"':''}>L</button>
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
  const byFreq = (col)=>{
    const m = new Map();
    for(const r of out){
      const key = (col==='Time')
        ? `ID ${txt(r['ID'])} Incident ${txt(r['Incident Time'])} Event ${txt(r['Event Time'])}`
        : txt(r[col]).trim();
      if(!key) continue;
      m.set(key, (m.get(key)||0)+1);
    }
    return m;
  };
  if (sort && sort.col){
    const col = sort.col;
    if (sort.type === 'asc' || sort.type === 'desc'){
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
    } else if (sort.type === 'most' || sort.type === 'less'){
      const freq = byFreq(col);
      out.sort((a,b)=>{
        const ak = (col==='Time')
          ? `ID ${txt(a['ID'])} Incident ${txt(a['Incident Time'])} Event ${txt(a['Event Time'])}`
          : txt(a[col]).trim();
        const bk = (col==='Time')
          ? `ID ${txt(b['ID'])} Incident ${txt(b['Incident Time'])} Event ${txt(b['Event Time'])}`
          : txt(b[col]).trim();
        const af = freq.get(ak)||0, bf = freq.get(bk)||0;
        if (af !== bf) return (sort.type === 'most') ? (bf - af) : (af - bf);
        const av = txt(a[col]).toLowerCase(), bv = txt(b[col]).toLowerCase();
        const cmp = av.localeCompare(bv, undefined, {numeric:true,sensitivity:'base'});
        if (cmp !== 0) return cmp;
        const at=parseIncidentTime(a['Incident Time']); const bt=parseIncidentTime(b['Incident Time']);
        return (bt?bt.getTime():-Infinity) - (at?at.getTime():-Infinity);
      });
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
  const rows = tableEl.__meta.pageRows; const cols = tableEl.__meta.visibleCols; const dq = '"', nl = '\n';
  const csv = [cols.join(',')].concat(
    rows.map(r=> cols.map(c=>{
      const v = (c==='Time') ? `ID ${txt(r['ID'])} | Incident ${txt(r['Incident Time'])} | Event ${txt(r['Event Time'])}` : txt(r[c]);
      return (v.includes(dq)||v.includes(',')||v.includes(nl)) ? dq+v.split(dq).join(dq+dq)+dq : v;
    }).join(','))
  ).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sanitizeFileName(tab.label||'table')}_page${tableEl.__meta.page}.csv`;
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
