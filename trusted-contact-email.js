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
    const exactPublicFreshBatch = (
      lead.fresh20_20260811 === true ||
      lead.fresh20_20260812 === true
    ) && explicitlyVerified && hasEvidence;

    return Boolean(validFormat && explicitlyVerified && hasEvidence && (explicitlyTrusted || exactPublicFreshBatch));
  };
})();

// KBW is hidden from the active UI. The old fresh-20 loaders used to mutate global state
// 1.8/2.8 seconds after every page load and overwrite K-Beauty status with
// "KBW 해외 신규 후보 ...". Do not start those legacy injectors globally anymore.
// Load the single-owner K-Beauty runtime instead; it waits until event/controller layers are ready.
(() => {
  if (document.querySelector('script[data-kbeauty-runtime-v5]')) return;
  const script = document.createElement('script');
  script.src = '/kbeauty-runtime-v5.js?v=20260821-single-owner-v5-1';
  script.dataset.kbeautyRuntimeV5 = '1';
  document.head.appendChild(script);
})();
