(() => {
  if (!document.querySelector('script[data-company-identity-runtime]')) {
    const script = document.createElement('script');
    script.src = '/company-name-llm.js?v=20260829-company-identity-v1';
    script.dataset.companyIdentityRuntime = '1';
    document.head.appendChild(script);
  }

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
    const exactPublicFreshBatch = (
      lead.fresh20_20260811 === true ||
      lead.fresh20_20260812 === true
    ) && explicitlyVerified && hasEvidence;

    return Boolean(validFormat && explicitlyVerified && hasEvidence && (explicitlyTrusted || exactPublicFreshBatch));
  };
})();
