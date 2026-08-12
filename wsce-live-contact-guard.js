(() => {
  if (window.__KPA_WSCE_OFFICIAL_CONTACT_GUARD__) return;
  let attempts = 0;
  const install = () => {
    if (window.__KPA_WSCE_OFFICIAL_CONTACT_GUARD__) return;
    if (typeof enrichContact !== 'function' || typeof patchLead !== 'function' || typeof state === 'undefined') {
      attempts += 1;
      if (attempts < 160) setTimeout(install, 50);
      return;
    }
    const base = enrichContact;
    enrichContact = async function wsceOfficialPublicContactAware(lead) {
      if (lead?.campaign === 'wsce') {
        const current = state.leads.find(item => item.id === lead.id) || lead;
        const contact = current?.contact;
        const email = String(contact?.email || '').trim().toLowerCase();
        const emailDomain = email.split('@')[1] || '';
        const companyDomain = typeof rootHost === 'function' ? rootHost(current.domain || current.url || '') : '';
        const sameDomain = Boolean(emailDomain && companyDomain && (emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`)));
        if (contact?.official_public === true && contact?.qualified === true && contact?.emailStatus === 'valid' && sameDomain) {
          patchLead(lead.id, { contact, contacts:[contact], contact_status:'found', contact_failure_reason:'' });
          return;
        }
      }
      return base(lead);
    };
    window.__KPA_WSCE_OFFICIAL_CONTACT_GUARD__ = true;
  };
  install();
})();
