window.KPA_MAIL_TEMPLATES = {
  A: {
    label: 'A · 신뢰형',
    subject: company => company
      ? `Official EA SPORTS apparel vendor — merch for ${company} at KBW`
      : 'Official EA SPORTS apparel vendor — merch for KBW',
    body: company => `${company ? `Hi ${company} team,` : 'Hi there,'}\n\nNYF is the official apparel vendor for EA SPORTS, and we've produced branded merch for Web3 teams, Ferrero Rocher, and universities here in Korea.\n\nIf your team is coming to KBW, we can produce and deliver custom T-shirts, hoodies, and staff wear locally in Seoul — no overseas shipping, no customs delays — and we can flex on tight timelines or last-minute quantity changes.\n\nWe deliver straight to your hotel, office, or event venue.\n\nWant a quick list of options with pricing and lead times? Just reply "send it" and I'll have it to you within a day.\n\nBest,\nLeo\nNYF`,
    translation: company => `${company ? `안녕하세요, ${company} 팀.` : '안녕하세요.'}\n\nNYF는 EA SPORTS의 공식 의류 벤더이며, 한국에서 Web3 팀, Ferrero Rocher, 여러 대학교의 브랜드 굿즈를 제작해왔습니다.\n\n팀이 KBW 참석을 위해 서울에 온다면 커스텀 티셔츠, 후디, 스태프웨어를 현지에서 제작해 납품할 수 있습니다. 해외 배송이나 통관 지연이 없으며, 촉박한 일정과 막판 수량 변경에도 유연하게 대응합니다.\n\n호텔, 사무실 또는 행사장으로 바로 배송합니다.\n\n원하시면 제품 옵션과 가격, 제작 기간을 간단히 정리해드리겠습니다. "send it"이라고 회신해주시면 하루 안에 보내드리겠습니다.\n\n감사합니다.\nLeo\nNYF`
  },
  B: {
    label: 'B · 문제해결형',
    subject: () => 'Skip the customs delays — KBW merch produced in Seoul',
    body: company => `${company ? `Hi ${company} team,` : 'Hi there,'}\n\nShipping branded merch into Korea for KBW usually means customs delays and timelines you can't control. NYF solves that by producing everything locally in Seoul — T-shirts, hoodies, staff wear — and delivering straight to your hotel, office, or venue, even on short notice.\n\nWe're the official apparel vendor for EA SPORTS and have run similar projects for Web3 teams, Ferrero Rocher, and Korean universities.\n\nHappy to send 2-3 options with pricing and turnaround times — just say the word.\n\nBest,\nLeo\nNYF`,
    translation: company => `${company ? `안녕하세요, ${company} 팀.` : '안녕하세요.'}\n\nKBW용 브랜드 굿즈를 한국으로 해외 배송하면 통관 지연과 통제하기 어려운 일정 문제가 생길 수 있습니다. NYF는 티셔츠, 후디, 스태프웨어를 서울에서 직접 제작하고, 촉박한 일정에도 호텔, 사무실 또는 행사장으로 바로 납품해 이 문제를 해결합니다.\n\nNYF는 EA SPORTS 공식 의류 벤더이며 Web3 팀, Ferrero Rocher, 한국의 여러 대학교와 유사한 프로젝트를 진행했습니다.\n\n원하시면 가격과 제작 기간을 포함한 2~3가지 옵션을 바로 보내드리겠습니다.\n\n감사합니다.\nLeo\nNYF`
  }
};
