import {
  clearContactCache,
  contactDiscoveryConfigured,
  contactProviderStatus,
  findContacts as findContactsFromProviders,
  normalizeContacts,
  scoreContact
} from './contact-discovery.js';

// Temporary compatibility exports for older server routes.
// No Hunter API is called anywhere through this module.
export function hunterConfigured() {
  return contactDiscoveryConfigured();
}

export function hunterKeyConfigured() {
  return false;
}

export { contactProviderStatus, normalizeContacts, scoreContact };

export function clearDomainCache() {
  clearContactCache();
}

export async function findContacts(domain, options = {}) {
  return findContactsFromProviders(domain, options);
}
