(function (root) {
  'use strict';

  // Keep this as the single manifest of built-in detector files. The browser,
  // service worker, and tests all consume this list.
  const files = Object.freeze([
    'email-sent-to-self.js',
    'email-sent-to-self-by-character.js',
    'email-broadcast-domains.js',
    'short-subject.js',
    'out-of-hours.js',
    'attachment-no-extension.js',
    'sensitive-keywords.js',
    'weird-tld.js',
    'destination-competitor.js',
    'destination-domain-once.js',
    'destination-email-subdomain.js',
    'ransomware-attachment.js',
    'email-subject-filename-obfuscation.js',
    'filename-is-executable.js',
    'multiple-attachments-specific-destination.js'
  ]);
  const detectors = [];
  const byKey = new Map();
  const loadErrors = [];

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

  function reportLoadError(file) {
    loadErrors.push(file);
    if (root.console && typeof root.console.error === 'function') {
      root.console.error(`Unable to load built-in detector: ${file}`);
    }
  }

  root.RiskDetectors = { files, loadErrors, register, builtInRules, migrateRules, matchesBuiltIn, reportLoadError };

  // Parser-inserted scripts remain blocking, so every detector is registered
  // before the page's Risk Scoring code runs. This also works for file:// URLs.
  const document = root.document;
  const loaderScript = document && document.currentScript;
  if (loaderScript) {
    const baseUrl = loaderScript.src.slice(0, loaderScript.src.lastIndexOf('/') + 1);
    files.forEach(file => {
      const source = `${baseUrl}${file}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      document.write(`<script src="${source}" onerror="RiskDetectors.reportLoadError('${file}')"><\/script>`);
    });
  }
})(typeof globalThis === 'undefined' ? window : globalThis);
