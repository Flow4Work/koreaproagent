(() => {
  const VERSION = '20260830-email-domain-identity-v5';
  const MULTI_SUFFIXES = new Set([
    'ac.kr','co.kr','go.kr','ne.kr','or.kr','re.kr','pe.kr','ac.uk','co.uk','gov.uk','ltd.uk','me.uk','net.uk','nhs.uk','org.uk','plc.uk','sch.uk',
    'asn.au','com.au','edu.au','gov.au','id.au','net.au','org.au','ac.jp','co.jp','go.jp','ne.jp','or.jp','com.br','com.cn','com.hk','com.mx','com.sg',
    'com.tr','com.tw','com.vn','co.id','co.in','co.nz','co.th','co.za','net.cn','net.in','org.cn','org.in'
  ]);
  const clean = (value = '', max = 500) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  function rootDomain(value = '') {
    let raw = clean(value, 500).toLowerCase();
    if (!raw) return '';
    if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop() || '';
    try { raw = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname; }
    catch { raw = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; }
    raw = raw.replace(/^www\./, '').replace(/\.+$/, '');
    const parts = raw.split('.').filter(Boolean);
    if (parts.length <= 2) return raw;
    const suffix2 = parts.slice(-2).join('.');
    return parts.slice(-(MULTI_SUFFIXES.has(suffix2) ? 3 : 2)).join('.');
  }

  function officialEmailSet(identity = {}) {
    return new Set((Array.isArray(identity?.official_emails) ? identity.official_emails : [])
      .map(item => clean(typeof item === 'string' ? item : item?.email, 240).toLowerCase())
      .filter(Boolean));
  }

  function strictlySendable(contact = {}, identity = {}) {
    const email = clean(contact?.email, 240).toLowerCase();
    if (!email || identity?.identity_version !== VERSION || identity?.status !== 'verified') return false;
    if (officialEmailSet(identity).has(email)) return true;
    const recipientDomain = rootDomain(identity?.recipient_domain || '');
    return Boolean(recipientDomain && rootDomain(email) === recipientDomain);
  }

  // Compatibility only. This file intentionally performs no storage mutation,
  // company-name inference, provider exceptions, click interception, or background refresh.
  globalThis.KPA_STRICT_SENDABLE_CONTACT = strictlySendable;
})();
