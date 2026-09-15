(function (root) {
  'use strict';

  const detectors = [];
  const byKey = new Map();

  function register(detector) {
    if (!detector || !detector.id || !detector.key || typeof detector.match !== 'function') {
      throw new TypeError('A detector requires id, key, and match properties.');
    }
    if (byKey.has(detector.key)) throw new Error(`Detector already registered: ${detector.key}`);
    const registered = { ...detector, settings: { ...(detector.settings || {}) }, settingFields: [...(detector.settingFields || [])] };
    detectors.push(registered);
    byKey.set(registered.key, registered);
  }

  function builtInRules() {
    return detectors.map(detector => ({
      id: detector.id,
      key: detector.key,
      name: detector.name,
      description: detector.description,
      weight: detector.weight,
      settings: { ...detector.settings },
      settingFields: detector.settingFields.map(field => ({ ...field })),
      type: 'file',
      builtIn: true,
      enabled: false
    }));
  }

  function migrateRules(rules, resetBuiltInWeights) {
    const defaultWeights = new Map(detectors.map(detector => [detector.id, detector.weight]));
    return (Array.isArray(rules) ? rules : []).filter(rule => rule && rule.type === 'file').map(rule => ({
      ...rule,
      weight: resetBuiltInWeights && rule.builtIn && defaultWeights.has(rule.id)
        ? defaultWeights.get(rule.id)
        : root.RiskScoring.normalizeWeight(rule.weight)
    }));
  }

  function matchesBuiltIn(rule, row, rows) {
    const detector = rule && byKey.get(rule.key);
    return detector ? !!detector.match(row || {}, rule.settings || {}, rows) : false;
  }

  root.RiskDetectors = { register, builtInRules, migrateRules, matchesBuiltIn };
})(typeof globalThis === 'undefined' ? window : globalThis);
