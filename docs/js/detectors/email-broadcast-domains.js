(function (registry) {
  'use strict';
  registry.register({
    id: 'builtin-email-broadcast-domains', key: 'emailBroadcastDomains', name: 'Email Broadcast Multiple Destination Domain',
    description: 'Matches email alerts sent to at least the configured number of unique destination domains or consumer-mail local parts.', weight: 6,
    settings: { minimumDomains: 5, consumerDomains: 'gmail, google, yahoo, microsoft, outlook', domainExceptions: '', countMode: 'domainsAndConsumerMailboxes' },
    settingFields: [
      { key: 'minimumDomains', label: 'Minimum destination count', type: 'number', min: 1, max: 1000 },
      { key: 'consumerDomains', label: 'Consumer domain list', type: 'textarea' },
      { key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' },
      { key: 'countMode', label: 'Destination counting mode', type: 'select', options: [{ value: 'domainsAndConsumerMailboxes', label: 'Unique domains and consumer mailboxes' }, { value: 'uniqueDomains', label: 'Unique domains only' }, { value: 'consumerMailboxes', label: 'Consumer mailboxes only' }] }
    ],
    match(row, settings) {
      if (!/^\s*\d+(?:\.\d+)?(?:E\+?\d+)?\s*$/.test(String(row.Size || ''))) return false;
      const domains = new Set(); const consumerDomains = new Set(); const consumerLocals = new Set();
      const consumers = String(settings.consumerDomains ?? 'gmail, google, yahoo, microsoft, outlook').split(/[\n,;\s]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const exceptions = String(settings.domainExceptions ?? '').split(/[\n,;\s]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
      const emailPattern = /([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
      for (const part of String(row.Destination || '').split(/;+/)) {
        const match = emailPattern.exec(part.trim()); if (!match) continue;
        const local = match[1].toLowerCase(); const domain = match[2].toLowerCase();
        if (exceptions.some(exception => domain === exception || domain.endsWith(`.${exception}`))) continue;
        if (consumers.some(provider => domain === provider || domain.endsWith(`.${provider}`) || domain.includes(provider))) { consumerLocals.add(local); consumerDomains.add(domain); } else domains.add(domain);
      }
      const mode = settings.countMode ?? 'domainsAndConsumerMailboxes';
      const count = mode === 'uniqueDomains' ? domains.size + consumerDomains.size : mode === 'consumerMailboxes' ? consumerLocals.size : domains.size + consumerLocals.size;
      return count >= Math.max(1, Math.floor(Number(settings.minimumDomains) || 5));
    }
  });
})(RiskDetectors);
