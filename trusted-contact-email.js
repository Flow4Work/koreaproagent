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
})();
