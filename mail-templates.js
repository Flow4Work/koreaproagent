const KPA_MAIL_SIGNATURE = `Best,
Leo Park
NYF
Custom apparel produced in Seoul

Instagram: https://www.instagram.com/notyourflavor/
Production: https://www.instagram.com/timesewingmachine

7-3 Daesagwan-ro 31-gil
Yongsan-gu, Seoul 04420, South Korea`;

const KPA_MAIL_SIGNATURE_KO = `감사합니다.
Leo Park
NYF
서울 커스텀 의류 제작

Instagram: https://www.instagram.com/notyourflavor/
Production: https://www.instagram.com/timesewingmachine

7-3 Daesagwan-ro 31-gil
Yongsan-gu, Seoul 04420, South Korea`;

window.KPA_MAIL_TEMPLATES = {
  A: {
    label: 'A · 신뢰형',
    subject: company => `Custom apparel for ${company} during KBW`,
    body: company => `Hi ${company} team,

NYF is the official apparel vendor for EA SPORTS, and we've produced branded merch for Web3 teams, Ferrero Rocher, and universities here in Korea.

If your team is coming to KBW, we can produce and deliver custom T-shirts, hoodies, and staff wear locally in Seoul — no overseas shipping, no customs delays — and we can flex on tight timelines or last-minute quantity changes.

We deliver straight to your hotel, office, or event venue.

Want a quick list of options with pricing and lead times? Just reply "send it" and I'll have it to you within a day.

${KPA_MAIL_SIGNATURE}`,
    translation: company => `안녕하세요, ${company} 팀.

NYF는 EA SPORTS의 공식 의류 벤더이며, Web3 팀과 페레로로쉐, 국내 대학교의 브랜드 굿즈를 제작해왔습니다.

팀이 KBW에 참가한다면 해외 배송이나 통관 지연 없이 서울에서 티셔츠, 후디, 스태프웨어를 제작하고 납품할 수 있습니다. 촉박한 일정이나 막판 수량 변경에도 유연하게 대응합니다.

호텔, 사무실 또는 행사장으로 바로 배송합니다.

가격과 제작 기간을 포함한 간단한 옵션 목록이 필요하다면 "send it"이라고 답장해주세요. 하루 안에 보내드리겠습니다.

${KPA_MAIL_SIGNATURE_KO}`
  },
  B: {
    label: 'B · 문제해결형',
    subject: () => 'KBW apparel produced locally in Seoul',
    body: company => `Hi ${company} team,

Shipping branded merch into Korea for KBW usually means customs delays and timelines you can't control. NYF solves that by producing everything locally in Seoul — T-shirts, hoodies, staff wear — and delivering straight to your hotel, office, or venue, even on short notice.

We're the official apparel vendor for EA SPORTS and have run similar projects for Web3 teams, Ferrero Rocher, and Korean universities.

Happy to send 2–3 options with pricing and turnaround times — just say the word.

${KPA_MAIL_SIGNATURE}`,
    translation: company => `안녕하세요, ${company} 팀.

KBW용 브랜드 굿즈를 한국으로 배송하면 통관 지연과 통제하기 어려운 일정 문제가 생기기 쉽습니다. NYF는 티셔츠, 후디, 스태프웨어를 서울에서 직접 제작하고 호텔, 사무실 또는 행사장으로 납품해 이 문제를 해결합니다. 촉박한 일정에도 대응할 수 있습니다.

저희는 EA SPORTS 공식 의류 벤더이며 Web3 팀, 페레로로쉐, 국내 대학교의 유사 프로젝트를 진행했습니다.

가격과 제작 기간을 포함한 옵션 2~3개를 보내드릴 수 있습니다. 필요하시면 편하게 답장해주세요.

${KPA_MAIL_SIGNATURE_KO}`
  }
};
