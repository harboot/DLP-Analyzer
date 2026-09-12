(function (root) {
  'use strict';

  const DEFAULT_WEIGHT = 1;
  const DEFAULT_SENSITIVE_KEYWORDS = 'extraction, export, dump, backup, customer list, client list, employee list, payroll, salary, credential, password, confidential, restricted, secret, database, db dump, account list, user list, master list, migration, bulk, batch, archive, api key, credit card';
  const DEFAULT_UNUSUAL_TLDS = 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party';
  const BUILT_IN_RULES = [
    { id: 'builtin-self', key: 'self', name: 'Email Sent to Self', description: 'Matches email alerts when a recipient address resembles the sender address.', weight: 6, settings: {} },
    { id: 'builtin-short-subject', key: 'shortSubject', name: 'Short Subject', description: 'Matches email alerts with an empty subject or a subject shorter than the configured length.', weight: 3, settings: { subjectLength: 15 } },
    { id: 'builtin-out-of-hours', key: 'outOfHours', name: 'Out-of-Hours', description: 'Matches alerts whose incident time falls within the configured monitoring window.', weight: 5, settings: { startTime: '23:00', endTime: '05:00' } },
    { id: 'builtin-no-extension', key: 'noExtension', name: 'Attachment No Ext', description: 'Matches alerts containing at least one attachment without a file extension.', weight: 4, settings: {} },
    { id: 'builtin-sensitive-keywords', key: 'sensitiveKeywords', name: 'Sensitive Keywords', description: 'Matches selected email fields when they contain one or more configured sensitive-data keywords.', weight: 7, settings: { keywords: DEFAULT_SENSITIVE_KEYWORDS, detectFileName: true, detectSubject: true } },
    { id: 'builtin-weird-tld', key: 'weirdTld', name: 'Weird TLD Dest', description: 'Matches destinations using one of the configured unusual top-level domains.', weight: 5, settings: { tlds: DEFAULT_UNUSUAL_TLDS } }
  ];

  function builtInRules() {
    return BUILT_IN_RULES.map(rule => ({ ...rule, type: 'file', builtIn: true, enabled: false, weight: normalizeWeight(rule.weight), settings: { ...rule.settings } }));
  }

  function migrateRules(rules, resetBuiltInWeights) {
    const defaultWeights = new Map(BUILT_IN_RULES.map(rule => [rule.id, rule.weight]));
    return (Array.isArray(rules) ? rules : [])
      .filter(rule => rule && rule.type === 'file')
      .map(rule => ({
        ...rule,
        weight: resetBuiltInWeights && rule.builtIn && defaultWeights.has(rule.id)
          ? defaultWeights.get(rule.id)
          : normalizeWeight(rule.weight)
      }));
  }

  function localPart(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].split('@')[0].split('+')[0].toLowerCase().replace(/[\s._-]+/g, '') : '';
  }

  function parseIncidentMinutes(value) {
    const cleaned = String(value || '').replace(/([A-Z][a-z]{2})\./g, '$1').split(' GMT')[0];
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : (date.getHours() * 60) + date.getMinutes();
  }

  function timeToMinutes(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? (hours * 60) + minutes : fallback;
  }

  function keywordPattern(value) {
    const keywords = String(value || '').split(/[\n,;]+/).map(keyword => keyword.trim()).filter(Boolean);
    if (!keywords.length) return null;
    const source = keywords.map(keyword => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s_-]+/g, '[\\s_-]+')).join('|');
    return new RegExp(`(?:^|\\b)(?:${source})(?:\\b|$)`, 'i');
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
      const minutes = parseIncidentMinutes(row.IncidentTime);
      const start = timeToMinutes(settings.startTime, 23 * 60);
      const end = timeToMinutes(settings.endTime, 5 * 60);
      return minutes !== null && (start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end);
    }
    if (rule.key === 'noExtension') {
      return String(row.FileName || '').split(/[;\n,|]+/).map(value => value.trim()).filter(Boolean)
        .some(name => !/(^|\/)\.?[^/]+\.[A-Za-z0-9]{1,16}(?:\s*\([^)]*\))?$/.test(name));
    }
    if (rule.key === 'sensitiveKeywords') {
      const pattern = keywordPattern(settings.keywords ?? DEFAULT_SENSITIVE_KEYWORDS);
      if (!pattern) return false;
      const values = [];
      if (settings.detectSubject !== false) values.push(row.Details || '');
      if (settings.detectFileName !== false) values.push(row.FileName || '');
      return pattern.test(values.join(' '));
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

  function exportRuleConfigs(rules) {
    return (Array.isArray(rules) ? rules : []).map(rule => ({
      id: rule.id,
      name: rule.name,
      code: rule.code || '',
      builtIn: !!rule.builtIn,
      key: rule.key,
      settings: { ...(rule.settings || {}) },
      type: 'file',
      enabled: !!rule.enabled,
      weight: normalizeWeight(rule.weight)
    }));
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

  root.RiskScoring = { DEFAULT_WEIGHT, builtInRules, exportRuleConfigs, matchesBuiltIn, migrateRules, normalizeWeight, scoreAlerts };
})(typeof globalThis === 'undefined' ? window : globalThis);
