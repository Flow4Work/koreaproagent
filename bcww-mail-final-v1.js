(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v5';
  const TEMPLATE_VERSION_KEY = 'kpa.bcww.mail.template.version.v1';
  const TEMPLATE_VERSION = '20260817-user-ab-v2';
  const COMPANY_VERSION = '20260815-bcww-final-company-v1';
  const SIGNATURE = `Best,
Leo Park
NYF · Custom apparel produced in Seoul
Instagram · @notyourflavor
Production · @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;
  const SIGNATURE_KO = `감사합니다.
Leo Park
NYF · 서울 커스텀 의류 제작
Instagram · @notyourflavor
Production · @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const clean = (value = '', max = 12000) => String(value || '').replace(/\r/g, '').trim().slice(0, max);
  const compact = (value = '') => clean(value, 500).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

  function selectedLeads() {
    const ids = load(IDS_KEY, []).filter(Boolean);
    const byId = new Map(load(LEADS_KEY, []).map(lead => [lead.id, lead]));
    return ids.map(id => byId.get(id)).filter(Boolean);
  }

  function primaryEmail(lead = {}) {
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return clean(rows.find(row => /@/.test(clean(row?.email, 240)))?.email, 240).toLowerCase();
  }

  function recipientFirstName(company = '') {
    const companyKey = compact(company);
    const lead = selectedLeads().find(item => compact(item?.company) === companyKey);
    if (!lead) return '';
    const rows = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    const email = primaryEmail(lead);
    const contact = rows.find(row => clean(row?.email, 240).toLowerCase() === email) || rows[0];
    let firstName = clean(contact?.first_name, 60);
    if (!firstName) {
      const fullName = clean(contact?.name, 120);
      const looksLikeRole = /\b(?:team|sales|contact|business|distribution|enquir|inquir|office|international|marketing|communication|licensing|rights|studio|television|corporate|manager|director)\b/i.test(fullName);
      if (fullName && !looksLikeRole) firstName = fullName.split(/\s+/)[0] || '';
    }
    return clean(firstName, 40).replace(/[^\p{L}\p{M}.'-]/gu, '');
  }

  function englishGreeting(company = '') {
    const firstName = recipientFirstName(company);
    return firstName ? `Hi ${firstName},` : `Hi ${company} team,`;
  }

  function koreanGreeting(company = '') {
    const firstName = recipientFirstName(company);
    return firstName ? `안녕하세요, ${firstName}님.` : `안녕하세요, ${company} 팀.`;
  }

  function installBcwwTemplates() {
    if (!window.KPA_MAIL_TEMPLATES) return;
    window.KPA_MAIL_TEMPLATES.A = {
      label: 'A',
      subject: () => 'Team apparel in Seoul for BCWW — no overseas shipping needed',
      body: company => `${englishGreeting(company)}

With BCWW coming up, wanted to flag that NYF produces custom T-shirts, hoodies, and staff wear locally in Seoul — so ${company} doesn't need to ship apparel from overseas or deal with customs delays.

We handle small quantities and short timelines, and deliver directly to your hotel, office, or COEX. We've produced apparel for EA SPORTS and other international teams working in Korea.

Happy to send 2–3 options with pricing and turnaround if useful — just let me know roughly what you need and the quantity.

${SIGNATURE}`,
      translation: company => `${koreanGreeting(company)}

BCWW를 앞두고 안내드립니다. NYF는 커스텀 티셔츠, 후디, 스태프웨어를 서울 현지에서 제작하기 때문에 ${company}에서 해외로 의류를 배송하거나 통관 지연을 걱정할 필요가 없습니다.

소량과 짧은 일정도 대응하며 호텔, 사무실 또는 COEX로 직접 배송합니다. EA SPORTS를 비롯해 한국에서 활동하는 여러 해외 팀의 의류를 제작해왔습니다.

필요하시다면 가격과 제작 기간이 포함된 2–3가지 옵션을 보내드리겠습니다. 필요한 품목과 대략적인 수량만 알려주세요.

${SIGNATURE_KO}`
    };
    window.KPA_MAIL_TEMPLATES.B = {
      label: 'B',
      subject: company => `Will ${company} have a team in Seoul for BCWW?`,
      body: company => `${englishGreeting(company)}

Quick question — will anyone from ${company} be in Seoul for BCWW this year?

I run NYF, a Seoul-based apparel production service for international teams visiting Korea — staff wear, branded T-shirts, hoodies, and small merch runs, all made locally so there's no shipping or customs to deal with.

If this isn't your area, I'd appreciate a pointer to whoever handles events or ops for ${company}.

${SIGNATURE}`,
      translation: company => `${koreanGreeting(company)}

간단히 여쭤봅니다. 올해 ${company}에서 BCWW 참석을 위해 서울에 오는 분이 있을까요?

저는 한국을 방문하는 해외 팀을 위해 서울에서 의류를 제작하는 NYF를 운영하고 있습니다. 스태프웨어, 브랜드 티셔츠, 후디, 소량 머천다이즈까지 모두 현지에서 제작하기 때문에 해외 배송이나 통관 문제를 신경 쓸 필요가 없습니다.

담당 업무가 아니시라면 ${company}에서 이벤트나 운영을 담당하는 분을 알려주시면 감사하겠습니다.

${SIGNATURE_KO}`
    };
  }

  function resetOldBcwwDrafts(leads = []) {
    const versions = load(TEMPLATE_VERSION_KEY, {});
    const drafts = load(DRAFT_KEY, {});
    let changed = false;
    for (const lead of leads) {
      if (!lead?.id || versions[lead.id] === TEMPLATE_VERSION) continue;
      const current = drafts[lead.id] || {};
      drafts[lead.id] = {
        ...current,
        templateId: current.templateId === 'A' ? 'A' : 'B',
        subject: '',
        body: '',
        translation: ''
      };
      versions[lead.id] = TEMPLATE_VERSION;
      changed = true;
    }
    if (changed) {
      save(DRAFT_KEY, drafts);
      save(TEMPLATE_VERSION_KEY, versions);
    }
  }

  function safeCompanyName(value = '') {
    const name = clean(value, 100).replace(/\s+team$/i, '').trim();
    if (!name || name.length > 70) return '';
    if (/@|https?:\/\/|\b(?:BCWW|event|events|list|directory|conference|exhibition)\b/i.test(name)) return '';
    return name;
  }

  function supportedCompanyName(nextName = '', lead = {}, email = '') {
    const next = safeCompanyName(nextName);
    if (!next) return false;
    const nextKey = compact(next);
    const currentKey = compact(lead.company);
    if (!nextKey) return false;
    if (nextKey === currentKey) return true;

    const sourceKey = compact(`${lead.source_title || ''} ${lead.source_url || ''}`);
    if (nextKey.length >= 3 && sourceKey.includes(nextKey)) return true;

    const domain = clean(lead.domain || email.split('@')[1] || '', 240).toLowerCase().replace(/^www\./, '');
    const stem = compact(domain.split('.')[0] || '');
    if (stem.length >= 4 && (nextKey.includes(stem) || stem.includes(nextKey))) return true;
    return false;
  }

  function updateDraftGreeting(draft = {}, company = '') {
    if (!draft || !company) return;
    if (typeof draft.body === 'string') draft.body = draft.body.replace(/^Hi [^\n]+ team,/i, `Hi ${company} team,`);
    if (typeof draft.translation === 'string') draft.translation = draft.translation.replace(/^안녕하세요,\s*[^\n]+\s*팀\./, `안녕하세요, ${company} 팀.`);
  }

  async function verifyCompanyNamesOnce(leads = []) {
    const targets = leads.filter(lead => lead?.id && lead?.company && lead.bcww_company_name_final_version !== COMPANY_VERSION).slice(0, 30);
    if (!targets.length) return;

    const payload = targets.map(lead => {
      const email = primaryEmail(lead);
      return {
        id: lead.id,
        company: lead.company,
        domain: lead.domain,
        source_title: [clean(lead.source_title, 220), email ? `Recipient email: ${email}` : ''].filter(Boolean).join(' | '),
        source_url: lead.source_url
      };
    });

    let response;
    try {
      response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ action:'company_names', items:payload })
      });
    } catch { return; }
    if (!response.ok) return;

    const data = await response.json().catch(() => ({}));
    const names = new Map((Array.isArray(data.names) ? data.names : []).map(row => [clean(row?.id, 160), safeCompanyName(row?.name)]));
    const allLeads = load(LEADS_KEY, []);
    const drafts = load(DRAFT_KEY, {});
    const byId = new Map(allLeads.map(lead => [lead.id, lead]));
    let touched = false;

    for (const original of targets) {
      const lead = byId.get(original.id);
      if (!lead) continue;
      const next = names.get(original.id) || safeCompanyName(lead.company);
      const email = primaryEmail(lead);
      lead.bcww_company_name_final_version = COMPANY_VERSION;
      touched = true;
      if (!next || next === safeCompanyName(lead.company) || !supportedCompanyName(next, lead, email)) continue;
      lead.company = next;
      updateDraftGreeting(drafts[lead.id], next);
    }

    if (touched) {
      save(LEADS_KEY, allLeads);
      save(DRAFT_KEY, drafts);
    }
  }

  function signedHtml(body = '') {
    const lines = String(body || '').replace(/\r/g, '').split('\n');
    const marker = 'NYF · Custom apparel produced in Seoul';
    const signatureIndex = lines.findIndex(line => line.trim() === marker);
    if (signatureIndex < 0) return '';

    const main = lines.slice(0, signatureIndex).join('\n').trim();
    const signature = lines.slice(signatureIndex).join('\n').trim();
    const paragraphs = main.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
    const mainHtml = paragraphs.map(part => `<p style="margin:0 0 16px 0;">${esc(part).replace(/\n/g, '<br>')}</p>`).join('');
    const signatureHtml = `<p style="margin:2px 0 0 0;font-size:12px;line-height:1.45;color:#777777;">${esc(signature).replace(/\n/g, '<br>')}</p>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#ffffff;"><tr><td align="left"><table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;margin:0;"><tr><td style="box-sizing:border-box;padding:0 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111827;">${mainHtml}${signatureHtml}</td></tr></table></td></tr></table>`;
  }

  function installSignatureFetchWrapper() {
    if (window.__KPA_NYF_SIGNATURE_FETCH__) return;
    window.__KPA_NYF_SIGNATURE_FETCH__ = true;
    const baseFetch = window.fetch.bind(window);
    window.fetch = function wrappedFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : clean(input?.url, 500);
      if (/\/api\/gmail(?:\?|$)/.test(url) && String(init?.method || 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string') {
        try {
          const payload = JSON.parse(init.body);
          const html = signedHtml(payload?.body || '');
          if (html) init = { ...init, body:JSON.stringify({ ...payload, html }) };
        } catch {}
      }
      return baseFetch(input, init);
    };
  }

  installSignatureFetchWrapper();

  const leads = selectedLeads();
  if (!leads.length || leads.some(lead => lead?.campaign !== 'bcww')) return;

  installBcwwTemplates();
  resetOldBcwwDrafts(leads);
  verifyCompanyNamesOnce(leads);
})();