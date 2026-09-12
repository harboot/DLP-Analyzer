(function (global) {
  'use strict';

  const value = (row, names) => {
    for (const name of names) {
      const key = Object.keys(row || {}).find(candidate => candidate.trim().toLowerCase() === name.toLowerCase());
      if (key && String(row[key] ?? '').trim()) return String(row[key]).trim();
    }
    return '';
  };
  const split = input => String(input || '').split(/[;|\n]+/).map(item => item.trim()).filter(Boolean);
  const normalized = input => String(input || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const policies = row => split(value(row, ['Policies', 'Policy', 'Policy Name']));
  const domain = input => {
    const text = String(input || '').toLowerCase();
    const email = text.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
    const host = text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return (email?.[1] || host?.[1] || normalized(text)) .replace(/[),>]+$/, '');
  };
  const templateName = input => normalized(input).replace(/\b\d{2,}\b/g, '#').replace(/\b[0-9a-f]{8,}\b/g, '#');
  const genericName = input => /^(?:image|file|document|attachment|scan|screenshot|untitled)(?:[ _-]?\d+)?\.(?:png|jpe?g|gif|pdf|docx?|xlsx?)$/i.test(input.trim());
  const pct = ratio => `${Math.round(ratio * 100)}%`;
  const countBy = (items, mapper) => {
    const map = new Map();
    items.forEach(item => { const key = mapper(item); if (key) map.set(key, (map.get(key) || []).concat(item)); });
    return map;
  };
  const top = map => [...map.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const ids = rows => rows.map(row => row.__advisorId);

  function finding(type, level, points, rows, reason, evidence, review) {
    return { type, level, points, alertIds: ids(rows), reason, evidence, review };
  }

  const overlapRatio = (left, right) => {
    const rightIds = new Set(right.alertIds);
    const shared = left.alertIds.filter(id => rightIds.has(id)).length;
    return shared / Math.max(1, Math.min(left.alertIds.length, right.alertIds.length));
  };

  function mergeFindings(findings) {
    const clusters = [];
    findings.forEach(signal => {
      const matches = clusters.filter(cluster => cluster.some(existing => overlapRatio(signal, existing) >= .6));
      if (!matches.length) return clusters.push([signal]);
      const combined = [signal, ...matches.flat()];
      matches.forEach(cluster => clusters.splice(clusters.indexOf(cluster), 1));
      clusters.push(combined);
    });
    return clusters.map(signals => {
      signals.sort((a, b) => b.points - a.points || b.alertIds.length - a.alertIds.length);
      const primary = signals[0];
      const supportingBonus = signals.slice(1).reduce((sum, signal) => sum + Math.min(2, Math.max(1, Math.round(signal.points * .15))), 0);
      const alertIds = [...new Set(signals.flatMap(signal => signal.alertIds))].sort((a, b) => a - b);
      const levels = { Low: 1, Medium: 2, High: 3 };
      return {
        type: primary.type,
        level: signals.reduce((level, signal) => levels[signal.level] > levels[level] ? signal.level : level, primary.level),
        points: primary.points + supportingBonus,
        primaryPoints: primary.points,
        supportingBonus,
        alertIds,
        signals,
        review: [...new Set(signals.map(signal => signal.review))].join('; ')
      };
    }).sort((a, b) => b.points - a.points || b.alertIds.length - a.alertIds.length);
  }

  function analyzePolicy(name, rows) {
    const total = rows.length;
    const findings = [];
    const addDominance = (label, field, review, points = 10) => {
      const winner = top(countBy(rows, field));
      if (!winner || winner[1].length < 3 || winner[1].length / total < .4) return;
      findings.push(finding(`${label} concentration`, winner[1].length / total >= .7 ? 'High' : 'Medium', points, winner[1],
        `${winner[1].length} of ${total} alerts share ${label.toLowerCase()} “${winner[0]}”.`,
        `${pct(winner[1].length / total)} of policy alerts`, review));
    };

    const signatures = countBy(rows, row => [normalized(value(row, ['Source'])), domain(value(row, ['Destination'])), templateName(value(row, ['File Name']))].join('|'));
    const repeated = [...signatures.values()].filter(group => group.length >= 3).flat();
    if (repeated.length >= 3) findings.push(finding('Repeated alert signature', repeated.length / total >= .6 ? 'High' : 'Medium', 16, repeated,
      `${repeated.length} alerts repeat a source, destination, and filename template.`, `${pct(repeated.length / total)} of alerts match repeated signatures`, 'Repeated workflow controls'));

    const sorted = [...rows].filter(row => row.__time).sort((a, b) => a.__time - b.__time);
    const burstIds = new Set();
    for (let start = 0; start < sorted.length; start++) {
      const group = sorted.filter((row, index) => index >= start && row.__time - sorted[start].__time <= 10 * 60 * 1000 && row.__signature === sorted[start].__signature);
      if (group.length >= 3) group.forEach(row => burstIds.add(row.__advisorId));
    }
    const burstRows = rows.filter(row => burstIds.has(row.__advisorId));
    if (burstRows.length) findings.push(finding('Duplicate/repeated alert bursts', burstRows.length / total >= .5 ? 'High' : 'Medium', 18, burstRows,
      `${burstRows.length} alerts occur in repeated-signature groups within ten-minute windows.`, `${pct(burstRows.length / total)} of policy alerts are in bursts`, 'Incident aggregation or burst suppression'));

    addDominance('Destination', row => domain(value(row, ['Destination'])), 'Destination exception scope and business approval', 12);
    addDominance('Trigger', row => normalized(value(row, ['Violation Triggers', 'Violation Trigger', 'Trigger'])), 'Detector and trigger thresholds', 10);
    addDominance('Source + destination', row => `${normalized(value(row, ['Source']))} → ${domain(value(row, ['Destination']))}`, 'User workflow and destination exception scope', 14);
    addDominance('Source', row => normalized(value(row, ['Source'])), 'User or service-account workflow', 10);

    const destinations = countBy(rows, row => domain(value(row, ['Destination'])));
    const destination = top(destinations);

    const filenames = rows.flatMap(row => split(value(row, ['File Name', 'Filename'])).map(file => ({ row, file })));
    const template = top(countBy(filenames, item => templateName(item.file)));
    if (template && template[1].length >= 3) findings.push(finding('Repeated filename/document template', template[1].length / Math.max(1, filenames.length) >= .5 ? 'High' : 'Medium', 12,
      [...new Map(template[1].map(item => [item.row.__advisorId, item.row])).values()],
      `${template[1].length} attachments share the filename template “${template[0]}”.`, `${pct(template[1].length / Math.max(1, filenames.length))} of attachment names`, 'Document template and detector combination'));
    const internal = rows.filter(row => {
      const sourceDomain = domain(value(row, ['Source'])); const destinationDomain = domain(value(row, ['Destination']));
      return sourceDomain.includes('.') && sourceDomain === destinationDomain;
    });
    if (internal.length >= 3 && internal.length / total >= .3) findings.push(finding('Internal destination pattern', 'Low', 7, internal,
      `${internal.length} alerts have matching source and destination domains. This is a pattern only, not proof of approval.`, `${pct(internal.length / total)} appear internal`, 'Approved internal destinations and business justification'));

    const opportunities = mergeFindings(findings);
    const rawScore = opportunities.reduce((sum, item) => sum + item.points, 0);
    const confidence = Math.min(1, total / 10);
    const score = Math.min(100, Math.round(rawScore * (.65 + .35 * confidence)));
    const opportunity = score >= 25 ? 'High' : score >= 12 ? 'Medium' : 'Low';
    return { name, alertCount: total, score, opportunity, opportunities, findings: opportunities };
  }

  function analyze(inputRows) {
    const rows = (inputRows || []).map((source, index) => {
      const row = Object.assign({}, source);
      row.__advisorId = index;
      row.__time = Date.parse(value(row, ['Incident Time', 'Event Time', 'Date', 'Time'])) || 0;
      row.__signature = [normalized(value(row, ['Source'])), domain(value(row, ['Destination'])), templateName(value(row, ['File Name', 'Filename']))].join('|');
      return row;
    });
    const grouped = new Map();
    rows.forEach(row => (policies(row).length ? policies(row) : ['(No policy specified)']).forEach(policy => {
      if (!grouped.has(policy)) grouped.set(policy, []); grouped.get(policy).push(row);
    }));
    return { alerts: rows, policies: [...grouped.entries()].map(([name, policyRows]) => analyzePolicy(name, policyRows)).sort((a, b) => b.score - a.score || b.alertCount - a.alertCount) };
  }

  global.PolicyTuning = Object.freeze({ analyze, normalized, templateName, genericName });
})(typeof window === 'undefined' ? globalThis : window);
