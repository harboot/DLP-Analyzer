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
  const search = document.getElementById('search');
  const level = document.getElementById('level');
  const recommended = ['Policies', 'Source', 'Destination', 'File Name', 'Channel'];
  const displayed = ['ID', 'Incident Time', 'Source', 'Destination', 'File Name', 'Channel'];
  let report = null;

  const esc = DLPUtils.escapeHtml;
  const get = (row, name) => {
    const key = Object.keys(row).find(candidate => candidate.trim().toLowerCase() === name.toLowerCase());
    return key ? String(row[key] ?? '') : '';
  };
  function render() {
    if (!report) return;
    const needle = search.value.trim().toLowerCase();
    const policies = report.policies.filter(policy => (!level.value || policy.opportunity === level.value) && (!needle || policy.name.toLowerCase().includes(needle) || policy.findings.some(item => item.type.toLowerCase().includes(needle))));
    results.innerHTML = policies.length ? policies.map((policy, policyIndex) => `
      <article class="advisor-policy">
        <header class="advisor-policy-header">
          <div><span class="opportunity ${policy.opportunity.toLowerCase()}">${policy.opportunity}</span><h2>${esc(policy.name)}</h2><p>${policy.alertCount} alerts · ${policy.findings.length} findings</p></div>
          <div class="score" aria-label="Tuning Candidate Score ${policy.score} out of 100"><strong>${policy.score}</strong><span>Tuning Candidate Score</span></div>
        </header>
        ${policy.findings.length ? `<div class="advisor-findings">${policy.findings.map((item, findingIndex) => `
          <details class="advisor-finding" data-policy="${policyIndex}" data-finding="${findingIndex}">
            <summary><span class="finding-level ${item.level.toLowerCase()}">${item.level}</span><strong>${esc(item.type)}</strong><span>${item.alertIds.length} contributing alerts</span></summary>
            <div class="finding-body"><div class="finding-explanation"><div><b>Why detected</b><p>${esc(item.reason)}</p></div><div><b>Evidence</b><p>${esc(item.evidence)}</p></div><div><b>Suggested area to review</b><p>${esc(item.review)}</p></div></div>
              <div class="alert-table-wrap"><table><thead><tr>${displayed.map(column => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${item.alertIds.map(id => report.alerts[id]).filter(Boolean).map(row => `<tr>${displayed.map(column => `<td title="${esc(get(row, column))}">${esc(get(row, column) || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
            </div>
          </details>`).join('')}</div>` : '<p class="no-findings">No tuning pattern crossed the deterministic thresholds for this policy.</p>'}
      </article>`).join('') : '<div class="advisor-empty"><strong>No policies match these filters.</strong><span>Change the policy text or opportunity level.</span></div>';
  }
  function showReport(rows, label, warnings) {
    report = PolicyTuning.analyze(rows);
    const high = report.policies.filter(policy => policy.opportunity === 'High').length;
    const findings = report.policies.reduce((sum, policy) => sum + policy.findings.length, 0);
    status.hidden = true;
    summary.hidden = false; toolbar.hidden = false;
    summary.innerHTML = `<div><strong>${rows.length}</strong><span>Alerts analyzed</span></div><div><strong>${report.policies.length}</strong><span>Policies</span></div><div><strong>${findings}</strong><span>Tuning findings</span></div><div><strong>${high}</strong><span>High opportunities</span></div>`;
    DLPUtils.showUploadWarning(warning, warnings);
    render();
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
      showReport(batches.flat(), `${files.length} ${files.length === 1 ? 'file' : 'files'}`, warnings);
    } catch (error) {
      status.textContent = `Unable to analyze the selected data: ${error.message}`;
    } finally {
      status.classList.remove('is-loading');
    }
  }
  fileInput.addEventListener('change', event => loadFiles([...event.target.files]));
  ['dragenter', 'dragover'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', event => loadFiles([...event.dataTransfer.files]));
  search.addEventListener('input', render); level.addEventListener('change', render);
  document.getElementById('exportCsv').addEventListener('click', () => {
    if (!report) return;
    const needle = search.value.trim().toLowerCase();
    const policies = report.policies.filter(policy => (!level.value || policy.opportunity === level.value) && (!needle || policy.name.toLowerCase().includes(needle) || policy.findings.some(item => item.type.toLowerCase().includes(needle))));
    const headers = ['Policy', 'Opportunity', 'Score', 'Finding', ...displayed];
    const records = policies.flatMap(policy => policy.findings.flatMap(item => item.alertIds.map(id => report.alerts[id]).filter(Boolean).map(row => [policy.name, policy.opportunity, policy.score, item.type, ...displayed.map(column => get(row, column))])));
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
      const response = await fetch('sample/alerts.csv');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await CSVUtils.parseText(await response.text(), { header: true });
      showReport(rows, 'the sample', [{ fileName: 'alerts.csv', missing: DLPUtils.findMissingColumns(rows, recommended) }]);
    } catch (error) { status.textContent = `Unable to load the sample data: ${error.message}`; }
  });
})();
