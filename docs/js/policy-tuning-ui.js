(function () {
  'use strict';
  const fileInput = document.getElementById('file');
  const drop = document.getElementById('drop');
  const results = document.getElementById('results');
  const summary = document.getElementById('summary');
  const toolbar = document.getElementById('toolbar');
  const status = document.getElementById('status');
  const fileName = document.getElementById('advisorFileName');
  const warning = document.getElementById('uploadWarning');
  const cancelButton = document.getElementById('cancelAnalysis');
  const recommended = ['Policies', 'Source', 'Destination', 'File Name', 'Channel'];
  const displayed = ['ID', 'Incident Time', 'Source', 'Destination', 'File Name', 'Channel'];
  let report = null;
  let activeAnalysis = null;

  const esc = DLPUtils.escapeHtml;
  const get = (row, name) => {
    const key = Object.keys(row).find(candidate => candidate.trim().toLowerCase() === name.toLowerCase());
    return key ? String(row[key] ?? '') : '';
  };
  const quantity = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
  const renderAlertTable = rows => `<div class="alert-table-wrap"><table><thead><tr>${displayed.map(column => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${displayed.map(column => `<td title="${esc(get(row, column))}">${esc(get(row, column) || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  function renderAlertGroups(item) {
    const rows = item.alertIds.map(id => report.alerts[id]).filter(Boolean);
    const groups = PolicyTuning.groupContributingAlerts(item.type, rows);
    return `<section class="finding-patterns" aria-label="Contributing alert patterns"><h3>Contributing alert patterns</h3>${groups.map(group => {
      const counts = group.counts;
      const summaryParts = [
        quantity(group.alerts.length, 'alert'),
        quantity(counts.sources, 'source'),
        quantity(counts.destinations, 'destination'),
        quantity(counts.filenamePatterns, 'filename pattern')
      ];
      if (counts.bursts) summaryParts.push(quantity(counts.bursts, 'burst'));
      return `<article class="alert-pattern-group"><div class="alert-pattern-heading"><div class="alert-pattern-values">${group.pattern.map(part => `<span><small>${esc(part.label)}</small><strong title="${esc(part.value || 'Not specified')}">${esc(part.value || 'Not specified')}</strong></span>`).join('')}</div><p>${summaryParts.join(' · ')}</p></div><details class="group-alerts"><summary>Show alerts</summary>${renderAlertTable(group.alerts)}</details></article>`;
    }).join('')}</section>`;
  }
  function render() {
    if (!report) return;
    const policies = report.policies;
    results.innerHTML = policies.length ? policies.map((policy, policyIndex) => `
      <article class="advisor-policy">
        <header class="advisor-policy-header">
          <div><span class="opportunity ${policy.opportunity.toLowerCase()}">${policy.opportunity}</span><h2>${esc(policy.name)}</h2><p>${policy.alertCount} alerts · ${policy.opportunities.length} tuning opportunities</p></div>
          <div class="score" aria-label="Tuning Candidate Score ${policy.score} out of 100"><strong>${policy.score}</strong><span>Tuning Candidate Score</span></div>
        </header>
        ${policy.opportunities.length ? `<div class="advisor-findings">${policy.opportunities.map((item, findingIndex) => `
          <details class="advisor-finding" data-policy="${policyIndex}" data-finding="${findingIndex}">
            <summary><span class="finding-level ${item.level.toLowerCase()}">${item.level}</span><strong>${esc(item.type)}</strong><span>${item.signals.length} signals · ${item.alertIds.length} contributing alerts</span></summary>
            <div class="finding-body"><div class="finding-explanation"><div class="finding-signals"><b>Supporting signals</b><ul>${item.signals.map((signal, index) => `<li><strong>${esc(signal.type)}</strong><span>${esc(signal.reason)}</span><small>${esc(signal.evidence)} · ${index ? `+${Math.min(2, Math.max(1, Math.round(signal.points * .15)))} supporting bonus` : `+${signal.points} primary score`}</small></li>`).join('')}</ul></div><div><b>Score contribution</b><p>${item.primaryPoints} primary points${item.supportingBonus ? ` + ${item.supportingBonus} supporting-signal bonus` : ''}. Correlated signals are not scored at full value.</p></div><div><b>Suggested areas to review</b><p>${esc(item.review)}</p></div></div>
              ${renderAlertGroups(item)}
            </div>
          </details>`).join('')}</div>` : '<p class="no-findings">No tuning pattern crossed the deterministic thresholds for this policy.</p>'}
      </article>`).join('') : '<div class="advisor-empty"><strong>No policies match these filters.</strong><span>Change the policy text or opportunity level.</span></div>';
  }
  function showReport(rows, analyzedReport, warnings) {
    report = analyzedReport;
    const high = report.policies.filter(policy => policy.opportunity === 'High').length;
    const findings = report.policies.reduce((sum, policy) => sum + policy.opportunities.length, 0);
    status.hidden = true;
    summary.hidden = false; toolbar.hidden = false;
    summary.innerHTML = `<div><strong>${rows.length}</strong><span>Alerts analyzed</span></div><div><strong>${report.policies.length}</strong><span>Policies</span></div><div><strong>${findings}</strong><span>Tuning opportunities</span></div><div><strong>${high}</strong><span>High opportunities</span></div>`;
    DLPUtils.showUploadWarning(warning, warnings);
    render();
  }
  function cancelAnalysis() {
    if (!activeAnalysis) return;
    activeAnalysis.worker.postMessage({ type: 'cancel', jobId: activeAnalysis.jobId });
    activeAnalysis.worker.terminate();
    activeAnalysis.reject(new Error('Analysis cancelled.'));
    activeAnalysis = null;
    cancelButton.hidden = true;
  }
  function analyzeInWorker(rows) {
    cancelAnalysis();
    return new Promise((resolve, reject) => {
      const worker = new Worker('worker/PolicyTuning.worker.js');
      const jobId = `${Date.now()}-${Math.random()}`;
      activeAnalysis = { worker, jobId, reject };
      cancelButton.hidden = false;
      worker.onmessage = ({ data }) => {
        if (data.jobId !== jobId) return;
        if (data.type === 'progress') {
          const subject = data.phase === 'rows' ? 'alerts' : 'policies';
          status.textContent = `Analyzing ${subject}: ${data.completed} of ${data.total}…`;
          return;
        }
        worker.terminate();
        activeAnalysis = null;
        cancelButton.hidden = true;
        if (data.type === 'complete') resolve(data.report);
        else reject(new Error(data.message || 'Analysis cancelled.'));
      };
      worker.onerror = event => {
        worker.terminate();
        activeAnalysis = null;
        cancelButton.hidden = true;
        reject(new Error(event.message || 'The analysis worker failed.'));
      };
      worker.postMessage({ type: 'analyze', jobId, rows });
    });
  }
  async function loadFiles(files) {
    if (!files.length) return;
    status.hidden = false;
    fileName.textContent = files.map(file => file.name).join(', ');
    status.textContent = 'Analyzing alert data…';
    status.classList.add('is-loading');
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const batches = await Promise.all(files.map(file => CSVUtils.parseFile(file)));
      const warnings = batches.map((rows, index) => ({ fileName: files[index].name, missing: DLPUtils.findMissingColumns(rows, recommended) }));
      const rows = batches.flat();
      showReport(rows, await analyzeInWorker(rows), warnings);
    } catch (error) {
      status.textContent = error.message === 'Analysis cancelled.' ? error.message : `Unable to analyze the selected data: ${error.message}`;
    } finally {
      status.classList.remove('is-loading');
    }
  }
  fileInput.addEventListener('change', event => loadFiles([...event.target.files]));
  cancelButton.addEventListener('click', () => {
    cancelAnalysis();
    status.hidden = false;
    status.textContent = 'Analysis cancelled.';
    status.classList.remove('is-loading');
  });
  ['dragenter', 'dragover'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', event => loadFiles([...event.dataTransfer.files]));
  document.getElementById('exportCsv').addEventListener('click', () => {
    if (!report) return;
    const policies = report.policies;
    const headers = ['Policy', 'Opportunity', 'Score', 'Primary Signal', 'Supporting Signals', ...displayed];
    const records = policies.flatMap(policy => policy.opportunities.flatMap(item => item.alertIds.map(id => report.alerts[id]).filter(Boolean).map(row => [policy.name, policy.opportunity, policy.score, item.type, item.signals.slice(1).map(signal => signal.type).join('; '), ...displayed.map(column => get(row, column))])));
    const csv = [headers, ...records].map(values => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = 'policy-tuning-advisor.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.getElementById('sampleBtn').addEventListener('click', async () => {
    status.hidden = false;
    fileName.textContent = 'alerts.csv';
    status.textContent = 'Loading sample…';
    try {
      const contents = await loadSample('sample/alerts.csv');
      const rows = await CSVUtils.parseText(contents, { header: true });
      showReport(rows, await analyzeInWorker(rows), [{ fileName: 'alerts.csv', missing: DLPUtils.findMissingColumns(rows, recommended) }]);
    } catch (error) { status.textContent = error.message === 'Analysis cancelled.' ? error.message : `Unable to load the sample data: ${error.message}`; }
  });
})();
