(function (registry) {
  'use strict';

  function domains(value) {
    return String(value ?? '').split(/[;,|\s]+/).map(token => {
      let domain = token.trim().replace(/^[<"'\[]+|[>"'\]]+$/g, '').replace(/^[a-z][\w+.-]*:\/*/i, '');
      const at = domain.lastIndexOf('@');
      if (at !== -1) domain = domain.slice(at + 1);
      domain = domain.split(/[/?#]/, 1)[0].replace(/:\d+$/, '').replace(/^[.<"'\[]+|[.>"'\]]+$/g, '').toLowerCase();
      return /^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?\.)+[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/i.test(domain) ? domain : '';
    }).filter(Boolean);
  }

  function domainList(value) {
    return domains(String(value ?? '').replace(/\n/g, ';'));
  }

  function isDomainOrSubdomain(domain, parent) {
    return domain === parent || domain.endsWith(`.${parent}`);
  }

  function normalizedBrands(value, digitLookalikes) {
    let variants = [String(value ?? '').toLowerCase().replace(/[-_]/g, '')];
    if (!digitLookalikes) return variants;
    const replacements = { 0: ['o'], 1: ['i', 'l'], 3: ['e'], 5: ['s'], 7: ['t'] };
    Object.entries(replacements).forEach(([digit, letters]) => {
      variants = variants.flatMap(variant => variant.includes(digit)
        ? letters.map(letter => variant.replaceAll(digit, letter))
        : [variant]);
    });
    return [...new Set(variants)];
  }

  function distance(left, right) {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  registry.register({
    id: 'builtin-destination-lookalike-domain', key: 'destinationLookalikeDomain', name: 'Destination Lookalike Domain',
    description: 'Matches destination domains that resemble a configured protected brand while excluding trusted domains.', weight: 7,
    settings: {
      protectedDomains: '', targetBrand: '', maximumDistance: 1,
      detectDigitLookalikes: true, detectBrandAffix: true, domainExceptions: ''
    },
    settingFields: [
      { key: 'protectedDomains', label: 'Protected domain list', type: 'textarea' },
      { key: 'targetBrand', label: 'Target brand', type: 'text' },
      { key: 'maximumDistance', label: 'Maximum edit distance', type: 'number', min: 0, max: 3 },
      { key: 'detectDigitLookalikes', label: 'Detect digit lookalikes', type: 'checkbox' },
      { key: 'detectBrandAffix', label: 'Detect brand prefixes and suffixes', type: 'checkbox' },
      { key: 'domainExceptions', label: 'Domain exception list', type: 'textarea' }
    ],
    match(row, settings) {
      const protectedDomains = domainList(settings.protectedDomains);
      const exceptions = domainList(settings.domainExceptions);
      const target = String(settings.targetBrand ?? '').trim() || protectedDomains[0]?.split('.')[0] || '';
      const targetVariants = normalizedBrands(target, settings.detectDigitLookalikes !== false).filter(Boolean);
      if (!targetVariants.length) return false;
      const maximumDistance = Math.min(3, Math.max(0, Number(settings.maximumDistance ?? 1) || 0));

      return domains(row.Destination).some(domain => {
        if ([...protectedDomains, ...exceptions].some(parent => isDomainOrSubdomain(domain, parent))) return false;
        return domain.split('.').some(label => normalizedBrands(label, settings.detectDigitLookalikes !== false).some(candidate =>
          targetVariants.some(targetBrand => distance(candidate, targetBrand) <= maximumDistance ||
            (settings.detectBrandAffix !== false && candidate.length > targetBrand.length && candidate.includes(targetBrand)))
        ));
      });
    }
  });
})(RiskDetectors);
