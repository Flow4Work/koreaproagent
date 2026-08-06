(() => {
  const LEADS_KEY = 'kpa.hunt.leads';
  const IDS_KEY = 'kpa.mail.review.ids';
  const DEFAULT_TEST_RECIPIENT = 'treecox19@gmail.com';
  const $ = id => document.getElementById(id);
  const state = { leads: [], selectedId: '' };

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const clean = (value = '', max = 12000) => String(value || '').replace(/\r/g, '').trim().slice(0, max);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(value, 240));

  function companyName(lead = {}) {
    return clean(lead.company || lead.domain || 'Company', 100).replace(/\s+team$/i, '').trim() || 'Company';
  }

  function recipient(lead = {}) {
    const contacts = [lead.contact, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].filter(Boolean);
    return clean(contacts.find(contact => validEmail(contact.email))?.email || '', 240).toLowerCase();
  }

  function selectedLead() {
    return state.leads.find(lead => lead.id === state.selectedId) || state.leads[0] || null;
  }

  function packageRows() {
    return [
      {
        name: 'Basic',
        description: 'Premium cotton T-shirt · Front logo + back graphic',
        prices: [['20 units', '$220'], ['50 units', '$485'], ['100+ units', '$810']]
      },
      {
        name: 'Standard',
        description: 'Premium cotton T-shirt · Embroidered logo cap',
        prices: [['20 sets', '$435'], ['50 sets', '$1,000'], ['100+ sets', '$1,600']]
      },
      {
        name: 'Plus',
        description: '2 premium cotton T-shirts · Canvas bag',
        prices: [['20 sets', '$580'], ['50 sets', '$1,200'], ['100+ sets', '$2,170']]
      },
      {
        name: 'Premium',
        description: 'Premium cotton T-shirt · Heavyweight hoodie · Embroidered logo cap',
        prices: [['20 sets', '$1,120'], ['50 sets', '$2,400'], ['100+ sets', '$4,000']]
      }
    ];
  }

  function priceCard(pkg) {
    const prices = pkg.prices.map(([quantity, price], index) => `
      <td width="33.33%" align="center" style="padding:12px 6px;${index ? 'border-left:1px solid #e7e7e7;' : ''}">
        <div style="font-size:11px;line-height:1.3;color:#777777;">${esc(quantity)}</div>
        <div style="margin-top:4px;font-size:16px;line-height:1.2;font-weight:700;color:#111111;">${esc(price)}</div>
      </td>`).join('');

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;border:1px solid #dddddd;border-radius:10px;border-collapse:separate;overflow:hidden;background:#ffffff;">
        <tr>
          <td style="padding:14px 14px 11px;border-bottom:1px solid #e7e7e7;">
            <div style="font-size:16px;line-height:1.3;font-weight:700;color:#111111;">${esc(pkg.name)}</div>
            <div style="margin-top:4px;font-size:12px;line-height:1.45;color:#666666;">${esc(pkg.description)}</div>
          </td>
        </tr>
        <tr>${prices}</tr>
      </table>`;
  }

  function packageHtml(lead = {}) {
    const company = companyName(lead);
    const packages = packageRows().map(priceCard).join('');
    return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#151515;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:0;background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5e5e5;border-radius:14px;border-collapse:separate;overflow:hidden;">
          <tr>
            <td style="padding:25px 26px 20px;border-bottom:1px solid #ececec;">
              <div style="display:inline-block;padding:6px 10px;border:1px solid #151515;border-radius:6px;background:#ffffff;font-size:14px;line-height:1;font-weight:700;letter-spacing:1.4px;">NYF</div>
              <h1 style="margin:17px 0 5px;font-size:26px;line-height:1.25;font-weight:700;color:#111111;">KBW 2026 Teamwear Packages</h1>
              <p style="margin:0;font-size:13px;line-height:1.55;color:#666666;">VAT included · Produced and delivered in Seoul</p>
            </td>
          </tr>
          <tr>
            <td style="padding:21px 22px 8px;">
              <p style="margin:0 0 17px;font-size:14px;line-height:1.65;color:#333333;">Hi ${esc(company)} team,<br><br>Here are our KBW 2026 teamwear package options.</p>
              ${packages}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 22px 10px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #dddddd;border-radius:10px;border-collapse:separate;overflow:hidden;">
                <tr><td colspan="2" style="padding:12px 13px;background:#f3f3f3;font-size:14px;font-weight:700;color:#111111;">Additional Costs</td></tr>
                <tr><td style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;color:#444444;">Individual name or nickname</td><td align="right" style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;font-weight:700;color:#111111;">From $2 / item</td></tr>
                <tr><td style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;color:#444444;">Production within 7 days</td><td align="right" style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;font-weight:700;color:#111111;">+20%</td></tr>
                <tr><td style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;color:#444444;">Production within 3–5 days</td><td align="right" style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;font-weight:700;color:#111111;">+30–40%</td></tr>
                <tr><td style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;color:#444444;">Additional delivery location in Seoul</td><td align="right" style="padding:10px 12px;border-top:1px solid #e7e7e7;font-size:12px;font-weight:700;color:#111111;">$25–40 / location</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 25px;">
              <p style="margin:0;font-size:13px;line-height:1.65;color:#333333;">Reply with your preferred package, quantity, sizes, and deadline.</p>
              <p style="margin:17px 0 0;font-size:13px;line-height:1.6;color:#333333;">Best,<br>Leo Park<br>NYF · Custom apparel produced in Seoul<br>Instagram · @notyourflavor / @timesewingmachine</p>
              <p style="margin:12px 0 0;font-size:10px;line-height:1.5;color:#8a8a8a;">Final pricing may vary depending on design, sizes, materials, and production schedule.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  function plainText(lead = {}) {
    const company = companyName(lead);
    return `Hi ${company} team,

Here are our KBW 2026 teamwear package options. All prices include VAT, with production and delivery in Seoul.

Basic: $220 / 20 units · $485 / 50 units · $810 / 100+ units
Standard: $435 / 20 sets · $1,000 / 50 sets · $1,600 / 100+ sets
Plus: $580 / 20 sets · $1,200 / 50 sets · $2,170 / 100+ sets
Premium: $1,120 / 20 sets · $2,400 / 50 sets · $4,000 / 100+ sets

Reply with your preferred package, quantity, sizes, and deadline.

Best,
Leo Park
NYF · Custom apparel produced in Seoul
Instagram · @notyourflavor / @timesewingmachine`;
  }

  function injectStyle() {
    if ($('kpaKbwPackageStyle')) return;
    const style = document.createElement('style');
    style.id = 'kpaKbwPackageStyle';
    style.textContent = `
      #kbwPackageBtn{background:#fff;color:#111827;border:1px solid #111827;font-size:12px;padding:0 12px}
      #kbwPackageDialog{width:min(940px,calc(100% - 24px));max-width:none;padding:0}
      .kbw-package-form{padding:18px;display:grid;gap:12px}
      .kbw-package-fields{display:grid;grid-template-columns:1fr 1.25fr 1.7fr;gap:10px}
      .kbw-package-preview{max-height:58vh;overflow:auto;border:1px solid #dce3ec;border-radius:12px;background:#f4f4f4}
      .kbw-package-preview>table{margin:0 auto}
      .kbw-package-note{margin:0;color:#64748b;font-size:12px}
      @media(max-width:760px){.kbw-package-fields{grid-template-columns:1fr}.kbw-package-preview{max-height:50vh}}
    `;
    document.head.appendChild(style);
  }

  function injectDialog() {
    if ($('kbwPackageDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'kbwPackageDialog';
    dialog.innerHTML = `
      <form class="kbw-package-form" method="dialog">
        <div class="dialog-head">
          <strong>KBW 가격표 HTML 메일</strong>
          <button class="dialog-close" value="cancel" aria-label="닫기">×</button>
        </div>
        <div class="kbw-package-fields">
          <div class="field"><label for="kbwPackageCompany">회사</label><select id="kbwPackageCompany"></select></div>
          <div class="field"><label for="kbwPackageRecipient">받는 주소</label><input id="kbwPackageRecipient" type="email" autocomplete="email"></div>
          <div class="field"><label for="kbwPackageSubject">제목</label><input id="kbwPackageSubject" value="KBW 2026 Teamwear Packages — Produced in Seoul"></div>
        </div>
        <p class="kbw-package-note">테스트 발송은 ${esc(DEFAULT_TEST_RECIPIENT)}으로 전송되며 발송 이력에 저장되지 않습니다.</p>
        <div class="kbw-package-preview" id="kbwPackagePreview"></div>
        <div class="dialog-actions">
          <button class="ghost" value="cancel">취소</button>
          <button class="test-all" id="kbwPackageTestBtn" type="button">테스트 발송</button>
          <button class="send-all" id="kbwPackageSendBtn" type="button">실제 발송</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
  }

  function candidates() {
    const leads = load(LEADS_KEY, []);
    const ids = new Set(load(IDS_KEY, []));
    const selected = leads.filter(lead => ids.has(lead.id));
    return (selected.length ? selected : leads).filter(lead => recipient(lead));
  }

  function renderPreview() {
    const lead = selectedLead();
    if (!lead) return;
    $('kbwPackageRecipient').value = recipient(lead);
    $('kbwPackagePreview').innerHTML = packageHtml(lead);
  }

  function openDialog() {
    state.leads = candidates();
    if (!state.leads.length) {
      alert('가격표 메일을 보낼 수신 주소가 없습니다.');
      return;
    }
    state.selectedId = state.leads[0].id;
    $('kbwPackageCompany').innerHTML = state.leads.map(lead => `<option value="${esc(lead.id)}">${esc(companyName(lead))} · ${esc(recipient(lead))}</option>`).join('');
    renderPreview();
    $('kbwPackageDialog').showModal();
  }

  async function readJson(response) {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function sendPackage(testMode) {
    const lead = selectedLead();
    const to = clean($('kbwPackageRecipient').value, 240).toLowerCase();
    const subject = clean($('kbwPackageSubject').value, 180).replace(/[\r\n]+/g, ' ');
    if (!lead || !validEmail(to)) { alert('받는 이메일 주소를 확인해주세요.'); return; }
    if (!subject) { alert('메일 제목을 입력해주세요.'); return; }
    if (!testMode && !confirm(`${companyName(lead)} · ${to}로 KBW 가격표 메일을 발송할까요?`)) return;

    const button = testMode ? $('kbwPackageTestBtn') : $('kbwPackageSendBtn');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '발송 중…';
    try {
      const data = await readJson(await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          to,
          subject: testMode ? `[TEST] ${subject}` : subject,
          body: plainText(lead),
          html: packageHtml(lead),
          companyKey: clean(lead.domain || lead.url || to, 500),
          companyName: companyName(lead),
          testMode
        })
      }));
      alert(testMode
        ? `테스트 메일을 ${data.to || DEFAULT_TEST_RECIPIENT}으로 보냈습니다.`
        : `${companyName(lead)}에 가격표 메일을 보냈습니다.`);
      if (!testMode) $('kbwPackageDialog').close();
    } catch (error) {
      alert(`발송 실패: ${error.message || '알 수 없는 오류'}`);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function init() {
    const actions = document.querySelector('.review-actions');
    if (!actions || $('kbwPackageBtn')) return;
    injectStyle();
    injectDialog();
    const button = document.createElement('button');
    button.id = 'kbwPackageBtn';
    button.type = 'button';
    button.textContent = 'KBW 가격표 메일';
    actions.insertBefore(button, $('testSendBtn'));
    button.addEventListener('click', openDialog);
    $('kbwPackageCompany').addEventListener('change', event => {
      state.selectedId = event.target.value;
      renderPreview();
    });
    $('kbwPackageTestBtn').addEventListener('click', () => sendPackage(true));
    $('kbwPackageSendBtn').addEventListener('click', () => sendPackage(false));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
