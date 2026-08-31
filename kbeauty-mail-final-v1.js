(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DRAFT_KEY = 'kpa.mail.review.drafts.v5';
  const TEMPLATE_VERSION_KEY = 'kpa.kbeauty.mail.template.version.v1';
  const TEMPLATE_VERSION = '20260901-kbeauty-campaign-v1';

  const SIGNATURE = `Best,
Leo Park
NYF · Custom apparel produced in Seoul
Instagram · @notyourflavor / @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;

  const SIGNATURE_KO = `감사합니다.
Leo Park
NYF · 서울 커스텀 의류 제작
Instagram · @notyourflavor / @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  function selectedLeads() {
    const ids = load(IDS_KEY, []).filter(Boolean);
    const byId = new Map(load(LEADS_KEY, []).map(lead => [lead.id, lead]));
    return ids.map(id => byId.get(id)).filter(Boolean);
  }

  function installKBeautyTemplates() {
    if (!window.KPA_MAIL_TEMPLATES) return;

    window.KPA_MAIL_TEMPLATES.A = {
      label: 'A · 신뢰형',
      subject: () => 'Official EA SPORTS merch vendor — produced in Seoul for K-Beauty Expo Korea 2026',
      body: company => `Hi ${company} team,

NYF is the official apparel vendor for EA SPORTS, and we've produced branded merch for Web3 teams, Ferrero Rocher, and universities here in Korea.

If your team is coming to K-Beauty Expo Korea 2026, we can produce and deliver custom T-shirts, hoodies, and staff wear locally in Seoul — no overseas shipping, no customs delays — and we can flex on tight timelines or last-minute quantity changes.

We deliver straight to your hotel, office, or event venue.

Want a quick list of options with pricing and lead times?

Just reply "send it" and I'll have it to you within a day.

${SIGNATURE}`,
      translation: company => `안녕하세요, ${company} 팀.

NYF는 EA SPORTS의 공식 의류 벤더이며, Web3 팀과 페레로로쉐, 국내 대학교의 브랜드 굿즈를 제작해왔습니다.

팀이 K-Beauty Expo Korea 2026에 참가한다면 해외 배송이나 통관 지연 없이 서울에서 티셔츠, 후디, 스태프웨어를 제작하고 납품할 수 있습니다. 촉박한 일정이나 막판 수량 변경에도 유연하게 대응합니다.

호텔, 사무실 또는 행사장으로 바로 배송합니다.

가격과 제작 기간을 포함한 간단한 옵션 목록이 필요하신가요?

"send it"이라고 답장해주시면 하루 안에 보내드리겠습니다.

${SIGNATURE_KO}`
    };

    window.KPA_MAIL_TEMPLATES.B = {
      label: 'B · 문제해결형',
      subject: () => 'Skip the customs delays — K-Beauty Expo Korea 2026 merch produced in Seoul',
      body: company => `Hi ${company} team,

Shipping branded merch into Korea for K-Beauty Expo Korea 2026 can mean customs delays and timelines that are difficult to control.

NYF produces everything locally in Seoul—from T-shirts and hoodies to staff wear—and delivers directly to your hotel, office, or venue, even on short notice.

We're the official apparel vendor for EA SPORTS and have run similar projects for Web3 teams, Ferrero Rocher, and Korean universities.

Happy to send 2–3 options with pricing and turnaround times.

${SIGNATURE}`,
      translation: company => `안녕하세요, ${company} 팀.

K-Beauty Expo Korea 2026용 브랜드 굿즈를 한국으로 배송하면 통관 지연이나 통제하기 어려운 일정 문제가 생길 수 있습니다.

NYF는 티셔츠와 후디부터 스태프웨어까지 모든 제품을 서울에서 제작하고, 호텔·사무실·행사장으로 직접 납품합니다. 촉박한 일정에도 대응할 수 있습니다.

저희는 EA SPORTS 공식 의류 벤더이며 Web3 팀, 페레로로쉐, 국내 대학교의 유사 프로젝트를 진행했습니다.

가격과 제작 기간을 포함한 옵션 2~3개를 보내드릴 수 있습니다.

${SIGNATURE_KO}`
    };
  }

  function repairWrongCampaignDrafts(leads = []) {
    const versions = load(TEMPLATE_VERSION_KEY, {});
    const drafts = load(DRAFT_KEY, {});
    let changed = false;

    for (const lead of leads) {
      if (!lead?.id) continue;
      const draft = drafts[lead.id];
      if (!draft || typeof draft !== 'object') {
        if (versions[lead.id] !== TEMPLATE_VERSION) {
          versions[lead.id] = TEMPLATE_VERSION;
          changed = true;
        }
        continue;
      }

      const text = `${draft.subject || ''}\n${draft.body || ''}\n${draft.translation || ''}`;
      if (/\bKBW\b/i.test(text)) {
        draft.subject = '';
        draft.body = '';
        draft.translation = '';
        changed = true;
      }
      if (versions[lead.id] !== TEMPLATE_VERSION) {
        versions[lead.id] = TEMPLATE_VERSION;
        changed = true;
      }
    }

    if (changed) {
      save(DRAFT_KEY, drafts);
      save(TEMPLATE_VERSION_KEY, versions);
    }
  }

  const leads = selectedLeads();
  if (!leads.length || leads.some(lead => lead?.campaign !== 'kbeauty')) return;

  installKBeautyTemplates();
  repairWrongCampaignDrafts(leads);
})();
