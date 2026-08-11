(() => {
  if (typeof usableEmail !== 'function') return;

  const originalUsableEmail = usableEmail;
  usableEmail = function usableEmailWithTrustedCrossDomain(lead = {}) {
    if (originalUsableEmail(lead)) return true;

    const contact = lead?.contact || {};
    const email = String(contact.email || '').trim().toLowerCase();
    const validFormat = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
    const explicitlyTrusted = contact.trustedCrossDomain === true;
    const explicitlyVerified = contact.verifiedOverride === true || contact.verified_override === true;
    const hasEvidence = Array.isArray(contact.sources) && contact.sources.some(Boolean);
    const exactPublicFreshBatch = lead.fresh20_20260811 === true && explicitlyVerified && hasEvidence;

    return Boolean(validFormat && explicitlyVerified && hasEvidence && (explicitlyTrusted || exactPublicFreshBatch));
  };

  // Load the fresh batch only after the older static KBW catalogs have finished their
  // first merge. This makes "already added" filtering deterministic instead of racing
  // the legacy hardcoded catalogs. The fresh batch then rechecks sent/deleted/rejected/current domains.
  const loadFresh20 = () => {
    if (document.querySelector('script[data-kbw-fresh20-20260811]')) return;
    const script = document.createElement('script');
    script.src = '/kbw-fresh-20-20260811.js?v=20260811-kbw-fresh20-v2';
    script.dataset.kbwFresh20260811 = '1';
    document.head.appendChild(script);
  };

  setTimeout(loadFresh20, 1800);
})();
