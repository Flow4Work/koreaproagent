const KPA_MAIL_SIGNATURE = `Best,
Leo Park
NYF · Custom apparel produced in Seoul
Instagram · @notyourflavor / @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;

const KPA_MAIL_SIGNATURE_KO = `감사합니다.
Leo Park
NYF · 서울 커스텀 의류 제작
Instagram · @notyourflavor / @timesewingmachine
7-3 Daesagwan-ro 31-gil, Yongsan-gu, Seoul 04420, South Korea`;

window.KPA_MAIL_TEMPLATES = {
  A: {
    label: 'A · 신뢰형',
    subject: () => 'Official EA SPORTS merch vendor — now in Seoul for KBW',
    body: company => `Hi ${company} team,

NYF is the official apparel vendor for EA SPORTS, and we've produced branded merch for Web3 teams, Ferrero Rocher, and universities here in Korea.

If your team is coming to KBW, we can produce and deliver custom T-shirts, hoodies, and staff wear locally in Seoul — no overseas shipping, no customs delays — and we can flex on tight timelines or last-minute quantity changes.

We deliver straight to your hotel, office, or event venue.

Want a quick list of options with pricing and lead times?

Just reply "send it" and I'll have it to you within a day.

${KPA_MAIL_SIGNATURE}`,
    translation: company => `안녕하세요, ${company} 팀.

NYF는 EA SPORTS의 공식 의류 벤더이며, Web3 팀과 페레로로쉐, 국내 대학교의 브랜드 굿즈를 제작해왔습니다.

팀이 KBW에 참가한다면 해외 배송이나 통관 지연 없이 서울에서 티셔츠, 후디, 스태프웨어를 제작하고 납품할 수 있습니다. 촉박한 일정이나 막판 수량 변경에도 유연하게 대응합니다.

호텔, 사무실 또는 행사장으로 바로 배송합니다.

가격과 제작 기간을 포함한 간단한 옵션 목록이 필요하신가요?

"send it"이라고 답장해주시면 하루 안에 보내드리겠습니다.

${KPA_MAIL_SIGNATURE_KO}`
  },
  B: {
    label: 'B · 문제해결형',
    subject: () => 'Skip the customs delays — KBW merch produced in Seoul',
    body: company => `Hi ${company} team,

Shipping branded merch into Korea for KBW can mean customs delays and timelines that are difficult to control.

NYF produces everything locally in Seoul—from T-shirts and hoodies to staff wear—and delivers directly to your hotel, office, or venue, even on short notice.

We're the official apparel vendor for EA SPORTS and have run similar projects for Web3 teams, Ferrero Rocher, and Korean universities.

Happy to send 2–3 options with pricing and turnaround times.

${KPA_MAIL_SIGNATURE}`,
    translation: company => `안녕하세요, ${company} 팀.

KBW용 브랜드 굿즈를 한국으로 배송하면 통관 지연이나 통제하기 어려운 일정 문제가 생길 수 있습니다.

NYF는 티셔츠와 후디부터 스태프웨어까지 모든 제품을 서울에서 제작하고, 호텔·사무실·행사장으로 직접 납품합니다. 촉박한 일정에도 대응할 수 있습니다.

저희는 EA SPORTS 공식 의류 벤더이며 Web3 팀, 페레로로쉐, 국내 대학교의 유사 프로젝트를 진행했습니다.

가격과 제작 기간을 포함한 옵션 2~3개를 보내드릴 수 있습니다.

${KPA_MAIL_SIGNATURE_KO}`
  }
};

(() => {
  if (!document.querySelector('script[data-company-identity-runtime]')) {
    const identityScript = document.createElement('script');
    identityScript.src = '/company-name-llm.js?v=20260830-company-identity-v3';
    identityScript.dataset.companyIdentityRuntime = '1';
    document.head.appendChild(identityScript);
  }

  if (document.querySelector('script[data-bcww-mail-review]')) return;
  const script = document.createElement('script');
  script.src = '/bcww-mail-review.js?v=20260815-bcww-v2';
  script.dataset.bcwwMailReview = '1';
  document.head.appendChild(script);
})();
