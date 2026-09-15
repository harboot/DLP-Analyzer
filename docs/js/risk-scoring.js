(function (root) {
  'use strict';

  const DEFAULT_WEIGHT = 1;
  const DEFAULT_SENSITIVE_KEYWORDS = 'extraction, export, dump, backup, customer list, client list, employee list, payroll, salary, credential, password, confidential, restricted, secret, database, db dump, account list, user list, master list, migration, bulk, batch, archive, api key, credit card';
  const DEFAULT_UNUSUAL_TLDS = 'cc, tk, ml, ga, cf, gq, pw, xyz, loan, review, click, win, men, trade, bid, date, party';
  const DEFAULT_COMPETITOR_DOMAINS = 'unionbankph.com, gcash.com, bir.gov.ph, rcbcbankard.com, psbank.com, metrobank.com, chinabank.ph, securitybank.com.ph';
  const DEFAULT_ENCRYPTED_EXTENSION_REGEX = String.raw`\.(locked|encrypted|enc|crypt|crypted|crypt0|crypt1|cryp|crpt|lock|crypto|cipher|crypted-files|encrypted-files|vault|enc[0-9a-z]{2,8})$`;
  const destinationDomainFrequencyCache = new WeakMap();
  const BUILT_IN_RULES = [
    { id: 'builtin-self', key: 'self', name: 'Email Sent to Self', description: 'Matches email alerts when a recipient address resembles the sender address.', weight: 6, settings: {} },
    { id: 'builtin-self-by-character', key: 'selfByCharacter', name: 'Email Sent to Self (by character)', description: 'Matches email alerts when the sender and destination share a sequence of the configured number of letters.', weight: 6, settings: { minimumCharacters: 5 } },
    { id: 'builtin-email-broadcast-domains', key: 'emailBroadcastDomains', name: 'Email Broadcast Multiple Destination Domain', description: 'Matches email alerts sent to at least the configured number of unique destination domains or consumer-mail local parts.', weight: 6, settings: { minimumDomains: 5 } },
    { id: 'builtin-short-subject', key: 'shortSubject', name: 'Short Subject', description: 'Matches email alerts with an empty subject or a subject shorter than the configured length.', weight: 3, settings: { subjectLength: 15 } },
    { id: 'builtin-out-of-hours', key: 'outOfHours', name: 'Out-of-Hours', description: 'Matches alerts whose incident time falls within the configured monitoring window.', weight: 5, settings: { startTime: '23:00', endTime: '05:00' } },
    { id: 'builtin-no-extension', key: 'noExtension', name: 'Attachment No Ext', description: 'Matches alerts containing at least one attachment without a file extension.', weight: 4, settings: {} },
    { id: 'builtin-sensitive-keywords', key: 'sensitiveKeywords', name: 'Sensitive Keywords', description: 'Matches selected email fields when they contain one or more configured sensitive-data keywords.', weight: 7, settings: { keywords: DEFAULT_SENSITIVE_KEYWORDS, detectFileName: true, detectSubject: true } },
    { id: 'builtin-weird-tld', key: 'weirdTld', name: 'Weird TLD Dest', description: 'Matches destinations using one of the configured unusual top-level domains.', weight: 5, settings: { tlds: DEFAULT_UNUSUAL_TLDS } },
    { id: 'builtin-destination-competitor', key: 'destinationCompetitor', name: 'Destination is Competitor', description: 'Matches destination addresses and URLs whose domain is a configured competitor domain or one of its subdomains.', weight: 7, settings: { domains: DEFAULT_COMPETITOR_DOMAINS } },
    { id: 'builtin-destination-domain-once', key: 'destinationDomainOnce', name: 'Destination Domain appears Once in Dataset', description: 'Matches destinations whose email domain occurs exactly once across the loaded dataset.', weight: 5, settings: {} },
    { id: 'builtin-destination-email-subdomain', key: 'destinationEmailSubdomain', name: 'Destination Email using Subdomain', description: 'Matches destination email domains that contain at least two substantial labels before the top-level domain.', weight: 5, settings: {} },
    { id: 'builtin-ransomware-attachment', key: 'ransomwareAttachment', name: 'Attachment Looks Like Ransomware Notes or Encryption', description: 'Matches attachment names that resemble ransomware notes or encrypted files.', weight: 8, settings: { encExtRegex: DEFAULT_ENCRYPTED_EXTENSION_REGEX } }
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

  function destinationDomains(value) {
    const emailPattern = /^[^@\s]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
    return String(value || '').split(/;+/).map(part => emailPattern.exec(part.trim()))
      .filter(Boolean).map(match => match[1].toLowerCase());
  }

  function normalizedDestinationDomains(value) {
    return String(value || '').split(/[;,|\s]+/).map(token => {
      let domain = token.trim().replace(/^[<"\[]+|[>"\]]+$/g, '');
      domain = domain.replace(/^[a-z][\w+.-]*:\/*/i, '');
      const at = domain.lastIndexOf('@');
      if (at !== -1) domain = domain.slice(at + 1);
      domain = domain.split(/[/?#]/, 1)[0];
      return domain.replace(/:\d+$/, '').replace(/^[<"\[.]+|[>"\].]+$/g, '').toLowerCase();
    }).filter(Boolean);
  }

  function destinationDomainFrequencies(rows) {
    if (!Array.isArray(rows)) return new Map();
    const cached = destinationDomainFrequencyCache.get(rows);
    if (cached) return cached;
    const frequencies = new Map();
    for (const item of rows) {
      for (const domain of destinationDomains(item && item.Destination)) {
        frequencies.set(domain, (frequencies.get(domain) || 0) + 1);
      }
    }
    destinationDomainFrequencyCache.set(rows, frequencies);
    return frequencies;
  }

  function matchesBuiltIn(rule, row, rows) {
    const settings = rule.settings || {};
    const channel = String(row.Channel || '').toLowerCase();
    if (rule.key === 'self') {
      const source = localPart(row.Source);
      return !!source && String(row.Destination || '').split(/[;,|]+/).some(value => localPart(value) === source);
    }
    if (rule.key === 'selfByCharacter') {
      const isEmail = channel.includes('email') || /@/.test(String(row.Destination || '')) || /@/.test(String(row.Source || ''));
      if (!isEmail) return false;
      const clean = value => String(value || '').replace(/[^A-Za-z]+/g, '').toLowerCase();
      const source = clean(row.Source);
      const destination = clean(row.Destination);
      const minimum = Math.max(1, Math.floor(Number(settings.minimumCharacters) || 5));
      if (source.length < minimum || destination.length < minimum) return false;
      const sourceSequences = new Set();
      for (let index = 0; index <= source.length - minimum; index++) sourceSequences.add(source.slice(index, index + minimum));
      for (let index = 0; index <= destination.length - minimum; index++) {
        if (sourceSequences.has(destination.slice(index, index + minimum))) return true;
      }
      return false;
    }
    if (rule.key === 'emailBroadcastDomains') {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      const domains = new Set();
      const consumerLocals = new Set();
      const emailPattern = /([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
      for (const part of String(row.Destination || '').split(/;+/)) {
        const match = emailPattern.exec(part.trim());
        if (!match) continue;
        const local = match[1].toLowerCase();
        const domain = match[2].toLowerCase();
        if (['gmail', 'google', 'yahoo', 'microsoft', 'outlook'].some(provider => domain.includes(provider))) consumerLocals.add(local);
        else domains.add(domain);
      }
      const minimum = Math.max(1, Math.floor(Number(settings.minimumDomains) || 5));
      return domains.size + consumerLocals.size >= minimum;
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
    if (rule.key === 'destinationCompetitor') {
      const targets = String(settings.domains || '').split(/[\s,;]+/)
        .map(value => value.trim().replace(/^\.+|\.+$/g, '').toLowerCase()).filter(Boolean);
      return normalizedDestinationDomains(row.Destination).some(domain =>
        targets.some(target => domain === target || domain.endsWith(`.${target}`)));
    }
    if (rule.key === 'destinationDomainOnce') {
      const frequencies = destinationDomainFrequencies(rows);
      return destinationDomains(row.Destination).some(domain => frequencies.get(domain) === 1);
    }
    if (rule.key === 'destinationEmailSubdomain') {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      return destinationDomains(row.Destination).some(domain => {
        if (['onmicrosoft', 'salesforce', 'imcap', 'landbank.com'].some(exception => domain.includes(exception))) return false;
        return domain.split('.').slice(0, -1).filter(label => label.length >= 4).length >= 2;
      });
    }
    if (rule.key === 'ransomwareAttachment') {
      const names = String(row.FileName || '').split(/[\n\r;,|]+/).map(value => value.trim()).filter(Boolean);
      const notePattern = /\b(read[_\- ]?me|how[_\-\s]?to(?:[_\-\s]?(decrypt|restore|recover|recover_files|restore_files))|howto[_\-\s]?(decrypt|restore|recover)|decrypt(?:ion)?|decryption|restore(?:_files)?|recover(?:_files)?|ransom|ransomware|!!!|_readme)\b/i;
      const suspiciousPhrasePattern = /\b(files[_\-\s]?(are[_\-\s])?encrypted|your[_\-\s]?files|restore[_\-\s]?your[_\-\s]?files|recover[_\-\s]?your[_\-\s]?files|decrypt_your_files)\b/i;
      let encryptedExtensionPattern;
      try {
        encryptedExtensionPattern = new RegExp(String(settings.encExtRegex || DEFAULT_ENCRYPTED_EXTENSION_REGEX), 'i');
      } catch (_) {
        encryptedExtensionPattern = new RegExp(DEFAULT_ENCRYPTED_EXTENSION_REGEX, 'i');
      }
      return names.some(name => {
        if (notePattern.test(name) || suspiciousPhrasePattern.test(name) || encryptedExtensionPattern.test(name)) return true;
        if (/\.(txt|htm|html|hta|url)$/i.test(name) && /(read[_\-\s]?me|how[_\-\s]?to|decrypt|restore|recover|ransom)/i.test(name)) return true;
        if (/[!]{2,}/.test(name) || /_+readme/i.test(name) || /\b(encrypted|locked|lockedfiles|locked_files)\b/i.test(name)) return true;
        const idExtension = name.match(/\.([0-9a-fA-F]{6,12}|[0-9a-zA-Z]{6,12})$/);
        return !!idExtension && (name.match(/\./g) || []).length >= 2;
      });
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
