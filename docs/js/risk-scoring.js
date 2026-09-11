(function (root) {
  'use strict';

  const DEFAULT_WEIGHT = 1;
  const BUILT_IN_RULES = [
    { id: 'builtin-self', key: 'self', name: 'Email Sent to Self', description: 'Matches email alerts when a recipient address resembles the sender address.', settings: {} },
    { id: 'builtin-short-subject', key: 'shortSubject', name: 'Short Subject', description: 'Matches email alerts with an empty subject or a subject shorter than the configured length.', settings: { subjectLength: 15 } },
    { id: 'builtin-out-of-hours', key: 'outOfHours', name: 'Out-of-Hours', description: 'Matches alerts whose incident hour falls within the configured monitoring window.', settings: { startHour: 0, endHour: 5 } },
    { id: 'builtin-no-extension', key: 'noExtension', name: 'Attachment No Ext', description: 'Matches alerts containing at least one attachment without a file extension.', settings: {} },
    { id: 'builtin-sensitive-keywords', key: 'sensitiveKeywords', name: 'Sensitive Keywords', description: 'Matches alert details or filenames containing common sensitive-data keywords.', settings: {} },
    { id: 'builtin-weird-tld', key: 'weirdTld', name: 'Weird TLD Dest', description: 'Matches destinations using one of the configured unusual top-level domains.', settings: { tlds: 'xyz, top, icu' } }
  ];

  function builtInRules() {
    return BUILT_IN_RULES.map(rule => ({ ...rule, builtIn: true, enabled: false, weight: DEFAULT_WEIGHT, settings: { ...rule.settings } }));
  }

  function localPart(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].split('@')[0].split('+')[0].toLowerCase().replace(/[\s._-]+/g, '') : '';
  }

  function parseIncidentHour(value) {
    const cleaned = String(value || '').replace(/([A-Z][a-z]{2})\./g, '$1').split(' GMT')[0];
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : date.getHours();
  }

  function matchesBuiltIn(rule, row) {
    const settings = rule.settings || {};
    const channel = String(row.Channel || '').toLowerCase();
    if (rule.key === 'self') {
      const source = localPart(row.Source);
      return !!source && String(row.Destination || '').split(/[;,|]+/).some(value => localPart(value) === source);
    }
    if (rule.key === 'shortSubject') {
      return channel.includes('email') && String(row.Details || '').trim().length < Number(settings.subjectLength ?? 15);
    }
    if (rule.key === 'outOfHours') {
      const hour = parseIncidentHour(row.IncidentTime);
      const start = Number(settings.startHour ?? 0);
      const end = Number(settings.endHour ?? 5);
      return hour !== null && (start <= end ? hour >= start && hour <= end : hour >= start || hour <= end);
    }
    if (rule.key === 'noExtension') {
      return String(row.FileName || '').split(/[;\n,|]+/).map(value => value.trim()).filter(Boolean)
        .some(name => !/(^|\/)\.?[^/]+\.[A-Za-z0-9]{1,16}(?:\s*\([^)]*\))?$/.test(name));
    }
    if (rule.key === 'sensitiveKeywords') {
      return /\b(extract(?:ion)?|export|dump|backup|customer[_\s-]?list|client[_\s-]?list|employee[_\s-]?list|payroll|salary|credential|password|confidential|restricted|secret|database|db[_\s-]?dump|account[_\s-]?list|user[_\s-]?list|master[_\s-]?list|migration|bulk|batch|archive|api[_\s-]?key|credit[_\s-]?card)\b/i.test(`${row.Details || ''} ${row.FileName || ''}`);
    }
    if (rule.key === 'weirdTld') {
      const tlds = String(settings.tlds || '').split(/[\s,;]+/).map(value => value.replace(/^\./, '').toLowerCase()).filter(Boolean);
      return String(row.Destination || '').split(/[;,|]+/).some(value => tlds.some(tld => new RegExp(`\\.${tld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[>\\s])`, 'i').test(value.trim())));
    }
    return false;
  }

  function normalizeWeight(value) {
    const weight = Number(value);
    return Number.isFinite(weight) && weight >= 0 ? weight : DEFAULT_WEIGHT;
  }

  function scoreAlerts(rows, rules, matchesByRule) {
    const scored = rows.map((row, index) => ({ row, index, score: 0, matchedRules: [] }));
    for (const rule of rules) {
      const weight = normalizeWeight(rule.weight);
      const matches = matchesByRule.get(rule.id);
      if (!matches) continue;
      for (const index of matches) {
        const alert = scored[index];
        if (!alert) continue;
        alert.score += weight;
        alert.matchedRules.push({ id: rule.id, name: rule.name, weight });
      }
    }
    return scored
      .filter((alert) => alert.matchedRules.length > 0)
      .sort((a, b) => b.score - a.score || b.matchedRules.length - a.matchedRules.length || a.index - b.index);
  }

  root.RiskScoring = { DEFAULT_WEIGHT, builtInRules, matchesBuiltIn, normalizeWeight, scoreAlerts };
})(typeof globalThis === 'undefined' ? window : globalThis);
