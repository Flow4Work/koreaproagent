(() => {
  const BATCH = '20260811-kbw-fresh31';
  const SOURCE_SENT_KEY = 'kpa.hunt.sentDomains.v1';
  const TARGET_SENT_KEY = 'kpa.sent.domains.v1';
  const startedAt = Date.now();
  let timer = null;

  function bridgeSentCache() {
    try {
      const source = localStorage.getItem(SOURCE_SENT_KEY);
      if (source && !localStorage.getItem(TARGET_SENT_KEY)) localStorage.setItem(TARGET_SENT_KEY, source);
    } catch {}
  }

  function patch() {
    if (typeof state === 'undefined' || !Array.isArray(state.leads)) return false;
    const rows = state.leads.filter((lead) => lead?.batch === BATCH);
    if (!rows.length) return false;

    let changed = false;
    for (const lead of rows) {
      const next = {};
      if (!lead.campaign_label) next.campaign_label = 'KBW 단체복';
      if (!lead.message_en && lead.message) next.message_en = lead.message;
      if (!lead.offer) next.offer = 'KBW 기간 서울 방문 팀웨어·스태프웨어·커스텀 의류 현지 제작·납품';
      if (!lead.reply_question) next.reply_question = 'Would it be useful if I send 2–3 options with pricing and turnaround times?';
      if (!lead.recommended_role) next.recommended_role = lead?.contact?.title || 'Events / Partnerships / Marketing';
      if (!Array.isArray(lead.role_targets) || !lead.role_targets.length) next.role_targets = ['Events', 'Partnerships', 'Marketing', 'Community'];
      if (lead?.contact?.email && lead.contact_status !== 'found') next.contact_status = 'found';

      // MemeCore publishes its outreach address on the memecore.org domain.
      // Use that verified email domain for the app's strict same-domain sendability check.
      if (lead.company === 'MemeCore' && lead.domain !== 'memecore.org') next.domain = 'memecore.org';

      if (Object.keys(next).length) {
        Object.assign(lead, next);
        changed = true;
      }
    }

    if (changed) {
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
    }

    const ready = typeof leadReady === 'function' ? rows.filter(leadReady).length : 0;
    window.KBWFresh31Ready = { total: rows.length, ready, batch: BATCH };
    console.info(`[KBW fresh31 ready] ${ready} / ${rows.length} send-ready`);
    return true;
  }

  function tick() {
    if (patch() || Date.now() - startedAt > 15000) {
      if (timer) clearInterval(timer);
      timer = null;
    }
  }

  bridgeSentCache();
  timer = setInterval(tick, 200);
  tick();
})();
