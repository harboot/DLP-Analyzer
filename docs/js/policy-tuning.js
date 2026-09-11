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
  const triggerList = row => split(value(row, ['Violation Triggers', 'Violation Trigger', 'Triggers', 'Trigger']));
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

    const triggerSets = countBy(rows, row => [...new Set(triggerList(row).map(normalized))].sort().join(' + '));
    triggerSets.delete('');
    const dominantSet = top(triggerSets);
    if (dominantSet && dominantSet[1].length >= 3 && dominantSet[1].length / total >= .4) {
      findings.push(finding('Trigger-set dominance', dominantSet[1].length / total >= .7 ? 'High' : 'Medium', 18, dominantSet[1],
        `${dominantSet[1].length} alerts share the normalized trigger set “${dominantSet[0]}”.`,
        `${pct(dominantSet[1].length / total)} share the same trigger pattern`, 'Detector thresholds and the trigger combination'));
    }

    const triggerRows = new Map();
    rows.forEach(row => triggerList(row).forEach(trigger => {
      const key = normalized(trigger); if (key) triggerRows.set(key, (triggerRows.get(key) || []).concat(row));
    }));
    const dominantTrigger = top(triggerRows);
    if (dominantTrigger && dominantTrigger[1].length >= 3 && dominantTrigger[1].length / total >= .5) {
      findings.push(finding('Dominant violation trigger', dominantTrigger[1].length / total >= .75 ? 'High' : 'Medium', 14,
        [...new Map(dominantTrigger[1].map(row => [row.__advisorId, row])).values()],
        `The normalized trigger “${dominantTrigger[0]}” appears in ${dominantTrigger[1].length} alerts.`,
        `${pct(dominantTrigger[1].length / total)} trigger frequency; ${triggerRows.size} distinct normalized triggers`, 'Classifier precision and trigger threshold'));
    }

    const rawTriggers = new Map();
    rows.forEach(row => triggerList(row).forEach(trigger => {
      const key = normalized(trigger); if (!rawTriggers.has(key)) rawTriggers.set(key, new Set()); rawTriggers.get(key).add(trigger);
    }));
    const variants = [...rawTriggers.entries()].filter(([, labels]) => labels.size > 1);
    if (variants.length) {
      const affected = rows.filter(row => triggerList(row).some(trigger => variants.some(([key]) => key === normalized(trigger))));
      findings.push(finding('Case/variant trigger redundancy', 'Low', 6, affected,
        `${variants.length} normalized trigger ${variants.length === 1 ? 'name has' : 'names have'} multiple displayed variants.`,
        variants.slice(0, 3).map(([key, labels]) => `${key}: ${[...labels].join(' / ')}`).join('; '), 'Duplicate or inconsistently named classifiers'));
    }

    const signatures = countBy(rows, row => [normalized(value(row, ['Source'])), domain(value(row, ['Destination'])), templateName(value(row, ['File Name'])), [...new Set(triggerList(row).map(normalized))].sort().join('+')].join('|'));
    const repeated = [...signatures.values()].filter(group => group.length >= 3).flat();
    if (repeated.length >= 3) findings.push(finding('Repeated alert signature', repeated.length / total >= .6 ? 'High' : 'Medium', 16, repeated,
      `${repeated.length} alerts repeat a source, destination, filename template, and trigger signature.`, `${pct(repeated.length / total)} of alerts match repeated signatures`, 'Repeated workflow and detector combination'));

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
    addDominance('Source + destination', row => `${normalized(value(row, ['Source']))} → ${domain(value(row, ['Destination']))}`, 'User workflow and destination exception scope', 14);
    addDominance('Application/destination', row => `${normalized(value(row, ['Application', 'Application Name'])) || '(unspecified application)'} → ${domain(value(row, ['Destination']))}`, 'Application workflow and destination controls', 13);
    addDominance('Channel', row => normalized(value(row, ['Channel'])), 'Channel-specific policy thresholds', 10);
    addDominance('Source', row => normalized(value(row, ['Source'])), 'User or service-account workflow', 10);

    const destinations = countBy(rows, row => domain(value(row, ['Destination'])));
    const destination = top(destinations);
    if (destination && dominantSet && destination[1].length >= 3 && destination[1].length / total >= .6) {
      const candidates = destination[1].filter(row => [...new Set(triggerList(row).map(normalized))].sort().join(' + ') === dominantSet[0]);
      if (candidates.length >= 3 && candidates.length / total >= .4) findings.push(finding('Potential exception candidate', 'Medium', 10, candidates,
        `${candidates.length} alerts share both destination “${destination[0]}” and the dominant trigger set.`,
        `${pct(candidates.length / total)} of policy alerts match this narrow workflow`, 'A narrowly scoped destination and detector exception, after business approval'));
    }

    const filenames = rows.flatMap(row => split(value(row, ['File Name', 'Filename'])).map(file => ({ row, file })));
    const template = top(countBy(filenames, item => templateName(item.file)));
    if (template && template[1].length >= 3) findings.push(finding('Repeated filename/document template', template[1].length / Math.max(1, filenames.length) >= .5 ? 'High' : 'Medium', 12,
      [...new Map(template[1].map(item => [item.row.__advisorId, item.row])).values()],
      `${template[1].length} attachments share the filename template “${template[0]}”.`, `${pct(template[1].length / Math.max(1, filenames.length))} of attachment names`, 'Document template and detector combination'));
    const generic = filenames.filter(item => genericName(item.file));
    if (generic.length >= 3) findings.push(finding('Generic attachment pattern', generic.length / Math.max(1, filenames.length) >= .4 ? 'Medium' : 'Low', 7,
      [...new Map(generic.map(item => [item.row.__advisorId, item.row])).values()], `${generic.length} attachments use generic names such as image.png or File.pdf.`,
      `${pct(generic.length / Math.max(1, filenames.length))} of attachment names are generic`, 'Attachment handling and inline-image exclusions'));

    const multiUser = [...triggerSets.entries()].map(([set, group]) => ({ set, group, users: new Set(group.map(row => normalized(value(row, ['Source']))).filter(Boolean)) }))
      .filter(item => item.group.length >= 5 && item.users.size >= 3).sort((a, b) => b.group.length - a.group.length)[0];
    if (multiUser) findings.push(finding('Multi-user systemic pattern', 'Medium', 12, multiUser.group,
      `${multiUser.group.length} alerts with one trigger set span ${multiUser.users.size} sources.`, `Trigger set: ${multiUser.set}`, 'Systemic business workflow or policy-wide threshold'));

    const internal = rows.filter(row => {
      const sourceDomain = domain(value(row, ['Source'])); const destinationDomain = domain(value(row, ['Destination']));
      return sourceDomain.includes('.') && sourceDomain === destinationDomain;
    });
    if (internal.length >= 3 && internal.length / total >= .3) findings.push(finding('Internal destination pattern', 'Low', 7, internal,
      `${internal.length} alerts have matching source and destination domains. This is a pattern only, not proof of approval.`, `${pct(internal.length / total)} appear internal`, 'Approved internal destinations and business justification'));

    // Similar, non-identical trigger sets use Jaccard overlap and remain a review hint.
    const sets = [...triggerSets.keys()].map(key => ({ key, values: new Set(key.split(' + ')), rows: triggerSets.get(key) }));
    const similarIds = new Set(); let pairs = 0;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      const intersection = [...sets[i].values].filter(item => sets[j].values.has(item)).length;
      const union = new Set([...sets[i].values, ...sets[j].values]).size;
      if (intersection && intersection / union >= .67) { pairs++; [...sets[i].rows, ...sets[j].rows].forEach(row => similarIds.add(row.__advisorId)); }
    }
    if (pairs) findings.push(finding('Similar trigger groups', 'Low', 7, rows.filter(row => similarIds.has(row.__advisorId)),
      `${pairs} trigger-set ${pairs === 1 ? 'pair has' : 'pairs have'} at least 67% normalized overlap.`, `${similarIds.size} alerts are represented`, 'Overlapping classifiers and rule consolidation'));

    findings.sort((a, b) => b.points - a.points || b.alertIds.length - a.alertIds.length);
    const rawScore = findings.reduce((sum, item) => sum + item.points, 0);
    const confidence = Math.min(1, total / 10);
    const score = Math.min(100, Math.round(rawScore * (.65 + .35 * confidence)));
    const opportunity = score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
    return { name, alertCount: total, score, opportunity, triggerDiversity: triggerRows.size, findings };
  }

  function analyze(inputRows) {
    const rows = (inputRows || []).map((source, index) => {
      const row = Object.assign({}, source);
      row.__advisorId = index;
      row.__time = Date.parse(value(row, ['Incident Time', 'Event Time', 'Date', 'Time'])) || 0;
      row.__signature = [normalized(value(row, ['Source'])), domain(value(row, ['Destination'])), templateName(value(row, ['File Name', 'Filename'])), [...new Set(triggerList(row).map(normalized))].sort().join('+')].join('|');
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
