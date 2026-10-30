import { api, requestJson } from './client';

export function getAuthConfig() {
  return requestJson('/auth/config', 'authConfig');
}

export function registerWithCredential(username: string, credential: { salt: string; verifier: string; iterations: number }) {
  return requestJson('/auth/register', 'registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, ...credential })
  }, 'registrationRequest');
}

export function requestLoginChallenge(username: string) {
  return requestJson('/auth/challenge', 'authChallenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  }, 'authChallengeRequest');
}

export function verifyLoginChallenge(id: string, verifier: string) {
  return requestJson('/auth/verify', 'authVerification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, verifier })
  }, 'authVerificationRequest');
}

export function verifyMfaChallenge(token: string, code: string) {
  return requestJson('/auth/mfa-verify', 'authMfaVerification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, code })
  }, 'authMfaVerificationRequest');
}

export function getAuthSession() {
  return requestJson('/auth/session', 'authSession');
}

export async function logoutAccount() {
  await requestJson('/auth/logout', 'authLogout', { method: 'POST' });
}
