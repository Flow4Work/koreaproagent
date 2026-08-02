(() => {
  const ENDPOINT = '/api/sent-companies';

  function companyKey(lead = {}) {
    return lead.domain || lead.url || lead.contact?.email || lead.company || '';
  }

  function leadId(lead = {}, index = 0) {
    return lead.id || `${lead.campaign || 'lead'}:${lead.domain || lead.company || index}`;
  }

  async function sentIdsFor(leads = []) {
    const items = leads.map((lead, index) => ({ id: leadId(lead, index), key: companyKey(lead) }));
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return new Set(Array.isArray(data.sentIds) ? data.sentIds : []);
  }

  async function removeExistingSentLeads() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads) || !state.leads.length) return;
    const sentIds = await sentIdsFor(state.leads);
    if (!sentIds.size) return;

    state.leads = state.leads.filter((lead, index) => !sentIds.has(leadId(lead, index)));
    for (const id of sentIds) state.selected?.delete?.(id);
    if (typeof saveState === 'function') saveState();
    if (typeof render === 'function') render();
  }

  if (typeof post === 'function') {
    const originalPost = post;
    post = async function filteredPost(url, payload, timeout) {
      const result = await originalPost(url, payload, timeout);
      if (url !== '/api/hunt' || !Array.isArray(result?.leads) || !result.leads.length) return result;

      const sentIds = await sentIdsFor(result.leads);
      if (sentIds.size) {
        result.leads = result.leads.filter((lead, index) => !sentIds.has(leadId(lead, index)));
        result.meta = { ...(result.meta || {}), sent_suppressed: sentIds.size };
      }
      return result;
    };
  }

  removeExistingSentLeads().catch(error => {
    console.error('sent-company startup filter failed', error);
    try {
      state.statusText = '발송 이력 확인 실패';
      if (typeof renderSummary === 'function') renderSummary();
    } catch {}
  });
})();
