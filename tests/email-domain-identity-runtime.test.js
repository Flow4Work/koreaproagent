import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
globalThis.document = {
  readyState: 'loading',
  addEventListener() {},
  dispatchEvent() {}
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const leads = [
  {
    id: 'canvas',
    company: 'Canvas Logo',
    domain: 'beautysourcing.com',
    contact: { email: 'info@canvas.com', emailStatus: 'unknown' },
    contacts: [
      { email: 'info@canvas.com', emailStatus: 'unknown' },
      { email: 'ella.wang@beautysourcing.com', emailStatus: 'unknown' },
      { email: 'info@beautysourcing.com', emailStatus: 'unknown' },
      { email: 'eurooffice@beautysourcing.com', emailStatus: 'unknown' }
    ]
  },
  {
    id: 'exa',
    company: 'Exa',
    domain: 'exa.ai',
    contacts: [
      { email: 'support@exa.ai', emailStatus: 'unknown' },
      { email: 'abases@primer.ai', emailStatus: 'unknown' },
      { email: 'press@exa.ai', emailStatus: 'unknown' }
    ]
  }
];
store.set('kpa.hunt.leads', JSON.stringify(leads));

const requestedDomains = new Map();
globalThis.fetch = async (_url, init = {}) => {
  const body = JSON.parse(init.body || '{}');
  const identities = (body.items || []).map(item => {
    requestedDomains.set(item.id, item.domain);
    const greeting = item.domain === 'beautysourcing.com' ? 'BeautySourcing' : item.domain === 'exa.ai' ? 'Exa' : 'Unknown';
    return {
      id: item.id,
      raw_name: item.raw_name,
      legal_name: '',
      brand_name: greeting,
      greeting_name: greeting,
      recipient_domain: item.domain,
      domain: item.domain,
      confidence: 0.97,
      evidence_url: `https://${item.domain}/`,
      evidence_urls: [`https://${item.domain}/`],
      official_emails: [],
      official_email_domains: [],
      status: 'verified',
      verified_at: new Date().toISOString(),
      identity_version: '20260830-email-domain-identity-v5'
    };
  });
  return new Response(JSON.stringify({ identities }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => ms >= 250 ? 0 : realSetTimeout(fn, ms, ...args);
await import('../company-name-llm.js');
globalThis.setTimeout = realSetTimeout;

test('chooses the strongest email domain instead of the first polluted email', async () => {
  await globalThis.KPA_COMPANY_IDENTITY_REFRESH(['canvas', 'exa'], { force: true });
  assert.equal(requestedDomains.get('canvas'), 'beautysourcing.com');
  assert.equal(requestedDomains.get('exa'), 'exa.ai');

  const updated = JSON.parse(store.get('kpa.hunt.leads'));
  const canvas = updated.find(lead => lead.id === 'canvas');
  const exa = updated.find(lead => lead.id === 'exa');

  assert.equal(canvas.company, 'BeautySourcing');
  assert.equal(canvas.domain, 'beautysourcing.com');
  assert.equal(canvas.contacts.some(contact => contact.email === 'info@canvas.com'), false);
  assert.ok(canvas.contacts.every(contact => contact.email.endsWith('@beautysourcing.com')));

  assert.equal(exa.company, 'Exa');
  assert.equal(exa.contacts.some(contact => contact.email === 'abases@primer.ai'), false);
  assert.ok(exa.contacts.every(contact => contact.email.endsWith('@exa.ai')));
});
