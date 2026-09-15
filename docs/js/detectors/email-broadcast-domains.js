(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-email-broadcast-domains', key: 'emailBroadcastDomains', name: 'Email Broadcast Multiple Destination Domain',
    description: 'Matches email alerts sent to at least the configured number of unique destination domains or consumer-mail local parts.', weight: 6,
    settings: { minimumDomains: 5 }, settingFields: [{ key: 'minimumDomains', label: 'Minimum destination domains', type: 'number', min: 1, max: 1000 }],
    match(row, settings) {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      const domains = new Set(); const consumerLocals = new Set();
      const emailPattern = /([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
      for (const part of String(row.Destination || '').split(/;+/)) {
        const match = emailPattern.exec(part.trim()); if (!match) continue;
        const local = match[1].toLowerCase(); const domain = match[2].toLowerCase();
        if (['gmail', 'google', 'yahoo', 'microsoft', 'outlook'].some(provider => domain.includes(provider))) consumerLocals.add(local); else domains.add(domain);
      }
      return domains.size + consumerLocals.size >= Math.max(1, Math.floor(Number(settings.minimumDomains) || 5));
    }
  });
})(RiskDetectors);
