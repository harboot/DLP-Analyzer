(function (root) {
  'use strict';

  const DEFAULT_WEIGHT = 1;

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
      .filter(alert => alert.matchedRules.length > 0)
      .sort((a, b) => b.score - a.score || b.matchedRules.length - a.matchedRules.length || a.index - b.index);
  }

  root.RiskScoring = { DEFAULT_WEIGHT, exportRuleConfigs, normalizeWeight, scoreAlerts };
})(typeof globalThis === 'undefined' ? window : globalThis);
