(function (global) {
  'use strict';

  const createHeaderIndex = rows => {
    const index = new Map();
    Object.keys(rows?.[0] || {}).forEach(key => index.set(key.trim().toLowerCase(), key));
    return index;
  };
  const value = (row, headerIndex, names) => {
    for (const name of names) {
      const key = headerIndex.get(name.toLowerCase());
      if (key && String(row[key] ?? '').trim()) return String(row[key]).trim();
    }
    return '';
  };
  const split = input => String(input || '').split(/[;|\n]+/).map(item => item.trim()).filter(Boolean);
  const normalized = input => String(input || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
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
    items.forEach(item => {
      const key = mapper(item);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
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

  function findBurstIds(rows) {
    const signatureGroups = countBy(rows.filter(row => row.__time), row => row.__signature);
    const burstIds = new Set();
    signatureGroups.forEach(group => {
      group.sort((a, b) => a.__time - b.__time);
      let left = 0;
      let markedThrough = -1;
      for (let right = 0; right < group.length; right++) {
        while (group[right].__time - group[left].__time > 10 * 60 * 1000) left++;
        if (right - left < 2) continue;
        for (let index = Math.max(left, markedThrough + 1); index <= right; index++) burstIds.add(group[index].__advisorId);
        markedThrough = right;
      }
    });
    return burstIds;
  }

  const findingGroupFields = type => {
    const normalizedType = normalized(type);
    if (normalizedType === 'duplicate/repeated alert bursts' || normalizedType === 'repeated alert signature') return ['source', 'destination', 'filename'];
    if (normalizedType === 'destination concentration') return ['destination'];
    if (normalizedType === 'source concentration') return ['source'];
    if (normalizedType === 'source + destination concentration' || normalizedType === 'internal destination pattern') return ['source', 'destination'];
    if (normalizedType === 'repeated filename/document template') return ['filename'];
    if (normalizedType === 'trigger concentration') return ['trigger'];
    return ['source', 'destination', 'filename'];
  };

  const groupField = (row, field) => {
    if (field === 'source') return { label: 'Source', key: row.__source, value: row.__sourceRaw || row.__source };
    if (field === 'destination') return { label: 'Destination', key: row.__destination, value: row.__destination };
    if (field === 'filename') {
      const value = templateName(row.__fileName);
      return { label: 'Filename template', key: value, value };
    }
    return { label: 'Trigger', key: row.__trigger, value: row.__trigger };
  };

  function countBursts(rows) {
    const burstIds = findBurstIds(rows);
    const times = rows.filter(row => burstIds.has(row.__advisorId)).map(row => row.__time).filter(Boolean).sort((a, b) => a - b);
    if (!times.length) return 0;
    let bursts = 0;
    let start = 0;
    for (let index = 1; index <= times.length; index++) {
      if (index < times.length && times[index] - times[index - 1] <= 10 * 60 * 1000) continue;
      if (index - start >= 3) bursts++;
      start = index;
    }
    return bursts;
  }

  function groupContributingAlerts(type, rows) {
    const fields = findingGroupFields(type);
    const groups = new Map();
    rows.forEach(row => {
      const pattern = fields.map(field => groupField(row, field));
      const key = JSON.stringify(pattern.map(item => item.key));
      if (!groups.has(key)) groups.set(key, { pattern, alerts: [] });
      groups.get(key).alerts.push(row);
    });
    const includeBursts = normalized(type) === 'duplicate/repeated alert bursts';
    return [...groups.values()].map(group => ({
      ...group,
      counts: {
        sources: new Set(group.alerts.map(row => row.__source).filter(Boolean)).size,
        destinations: new Set(group.alerts.map(row => row.__destination).filter(Boolean)).size,
        filenamePatterns: new Set(group.alerts.map(row => templateName(row.__fileName)).filter(Boolean)).size,
        bursts: includeBursts ? countBursts(group.alerts) : 0
      }
    })).sort((left, right) => right.alerts.length - left.alerts.length || JSON.stringify(left.pattern).localeCompare(JSON.stringify(right.pattern)));
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

    const signatures = countBy(rows, row => row.__signature);
    const repeated = [...signatures.values()].filter(group => group.length >= 3).flat();
    if (repeated.length >= 3) findings.push(finding('Repeated alert signature', repeated.length / total >= .6 ? 'High' : 'Medium', 16, repeated,
      `${repeated.length} alerts repeat a source, destination, and filename template.`, `${pct(repeated.length / total)} of alerts match repeated signatures`, 'Repeated workflow controls'));

    const burstIds = findBurstIds(rows);
    const burstRows = rows.filter(row => burstIds.has(row.__advisorId));
    if (burstRows.length) findings.push(finding('Duplicate/repeated alert bursts', burstRows.length / total >= .5 ? 'High' : 'Medium', 18, burstRows,
      `${burstRows.length} alerts occur in repeated-signature groups within ten-minute windows.`, `${pct(burstRows.length / total)} of policy alerts are in bursts`, 'Incident aggregation or burst suppression'));

    addDominance('Destination', row => row.__destination, 'Destination exception scope and business approval', 12);
    addDominance('Trigger', row => row.__trigger, 'Detector and trigger thresholds', 10);
    addDominance('Source + destination', row => `${row.__source} → ${row.__destination}`, 'User workflow and destination exception scope', 14);
    addDominance('Source', row => row.__source, 'User or service-account workflow', 10);

    const filenames = rows.flatMap(row => split(row.__fileName).map(file => ({ row, file })));
    const template = top(countBy(filenames, item => templateName(item.file)));
    if (template && template[1].length >= 3) findings.push(finding('Repeated filename/document template', template[1].length / Math.max(1, filenames.length) >= .5 ? 'High' : 'Medium', 12,
      [...new Map(template[1].map(item => [item.row.__advisorId, item.row])).values()],
      `${template[1].length} attachments share the filename template “${template[0]}”.`, `${pct(template[1].length / Math.max(1, filenames.length))} of attachment names`, 'Document template and detector combination'));
    const internal = rows.filter(row => {
      const sourceDomain = domain(row.__sourceRaw); const destinationDomain = row.__destination;
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

  function prepareRow(source, index, headerIndex) {
    const row = Object.assign({}, source);
    row.__advisorId = index;
    row.__sourceRaw = value(row, headerIndex, ['Source']);
    row.__source = normalized(row.__sourceRaw);
    row.__destination = domain(value(row, headerIndex, ['Destination']));
    row.__fileName = value(row, headerIndex, ['File Name', 'Filename']);
    row.__trigger = normalized(value(row, headerIndex, ['Violation Triggers', 'Violation Trigger', 'Trigger']));
    row.__policies = split(value(row, headerIndex, ['Policies', 'Policy', 'Policy Name']));
    row.__time = Date.parse(value(row, headerIndex, ['Incident Time', 'Event Time', 'Date', 'Time'])) || 0;
    row.__signature = [row.__source, row.__destination, templateName(row.__fileName)].join('|');
    return row;
  }

  function groupRow(grouped, row) {
    const rowPolicies = row.__policies.length ? row.__policies : ['(No policy specified)'];
    rowPolicies.forEach(policy => {
      if (!grouped.has(policy)) grouped.set(policy, []);
      grouped.get(policy).push(row);
    });
  }

  function createReport(rows, grouped, onProgress) {
    const entries = [...grouped.entries()];
    const results = entries.map(([name, policyRows], index) => {
      const result = analyzePolicy(name, policyRows);
      onProgress?.({ phase: 'policies', completed: index + 1, total: entries.length, policy: name });
      return result;
    });
    return { alerts: rows, policies: results.sort((a, b) => b.score - a.score || b.alertCount - a.alertCount) };
  }

  function analyze(inputRows, options = {}) {
    const sources = inputRows || [];
    const headerIndex = createHeaderIndex(sources);
    const rows = sources.map((source, index) => prepareRow(source, index, headerIndex));
    const grouped = new Map();
    rows.forEach(row => groupRow(grouped, row));
    return createReport(rows, grouped, options.onProgress);
  }

  async function analyzeAsync(inputRows, options = {}) {
    const sources = inputRows || [];
    const headerIndex = createHeaderIndex(sources);
    const rows = [];
    const grouped = new Map();
    const batchSize = options.batchSize || 2000;
    const yieldControl = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    for (let start = 0; start < sources.length; start += batchSize) {
      if (options.isCancelled?.()) throw new Error('Analysis cancelled.');
      const end = Math.min(start + batchSize, sources.length);
      for (let index = start; index < end; index++) {
        const row = prepareRow(sources[index], index, headerIndex);
        rows.push(row);
        groupRow(grouped, row);
      }
      options.onProgress?.({ phase: 'rows', completed: end, total: sources.length });
      await yieldControl();
    }
    const entries = [...grouped.entries()];
    const policyResults = [];
    for (let index = 0; index < entries.length; index++) {
      if (options.isCancelled?.()) throw new Error('Analysis cancelled.');
      const [name, policyRows] = entries[index];
      policyResults.push(analyzePolicy(name, policyRows));
      options.onProgress?.({ phase: 'policies', completed: index + 1, total: entries.length, policy: name });
      await yieldControl();
    }
    return { alerts: rows, policies: policyResults.sort((a, b) => b.score - a.score || b.alertCount - a.alertCount) };
  }

  global.PolicyTuning = Object.freeze({ analyze, analyzeAsync, findBurstIds, groupContributingAlerts, normalized, templateName, genericName });
})(typeof window === 'undefined' ? globalThis : window);
