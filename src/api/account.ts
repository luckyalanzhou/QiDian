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
