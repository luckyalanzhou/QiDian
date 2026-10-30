import { api, requestJson } from './client';

export function getAccountProfile() {
  return requestJson('/account/profile', 'accountProfile');
}

export async function getAccountAvatar() {
  return (await api('/account/avatar')).blob();
}

export function saveAccountAvatar(file: Blob) {
  return requestJson('/account/avatar', 'accountAvatarMutation', {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
}

export function removeAccountAvatar() {
  return requestJson('/account/avatar', 'accountAvatarMutation', { method: 'DELETE' });
}

export function getPasswordSalt() {
  return requestJson('/account/password-salt', 'passwordSalt');
}

export function updateAccountPassword(input: {
  currentVerifier: string;
  salt: string;
  verifier: string;
  iterations: number;
}) {
  return requestJson('/account/password', 'accountPasswordMutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  }, 'accountPasswordRequest');
}

export function beginTotpEnrollment(currentVerifier: string) {
  return requestJson('/account/totp/enrollment', 'totpEnrollment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentVerifier })
  }, 'totpEnrollmentRequest');
}

export function confirmTotpEnrollment(pendingId: string, code: string) {
  return requestJson('/account/totp/confirm', 'totpEnabled', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingId, code })
  }, 'totpConfirmRequest');
}

export function disableTotp(currentVerifier: string, code: string) {
  return requestJson('/account/totp/disable', 'totpMutation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentVerifier, code })
  }, 'totpDisableRequest');
}

export function createExtensionPairingCode(name: string) {
  return requestJson('/account/extensions/pairing', 'extensionPairingCode', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }, 'extensionPairingCodeRequest');
}

export function listExtensionTokens() {
  return requestJson('/account/extensions/tokens', 'extensionTokens');
}

export function revokeExtensionToken(id: string) {
  return requestJson(`/account/extensions/tokens/${encodeURIComponent(id)}`, 'extensionTokenMutation', { method: 'DELETE' });
}
