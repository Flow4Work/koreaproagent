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

    return Boolean(validFormat && explicitlyTrusted && explicitlyVerified && hasEvidence);
  };

  // Load the 2026-08-11 fresh KBW batch without touching the main app bundle.
  // The batch itself rechecks sent/deleted/rejected/current domains before merging.
  if (!document.querySelector('script[data-kbw-fresh20-20260811]')) {
    const script = document.createElement('script');
    script.src = '/kbw-fresh-20-20260811.js?v=20260811-kbw-fresh20-v1';
    script.dataset.kbwFresh20260811 = '1';
    document.head.appendChild(script);
  }
})();
