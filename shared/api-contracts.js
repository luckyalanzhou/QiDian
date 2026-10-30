import { validateVault } from './vault-validation.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = value => typeof value === 'string';
const isBoolean = value => typeof value === 'boolean';
const isNumber = value => Number.isSafeInteger(value) && value >= 0;
const isNullableTimestamp = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isVaultData = value => {
  if (!isObject(value)) return false;
  try {
    validateVault(value);
    return true;
  } catch {
    return false;
  }
};
const isRevision = value => isObject(value) && isNumber(value.revision);
const isNullableRevision = value => value === null || isNumber(value);
const isAssetImportScope = value => isObject(value) && isString(value.id)
  && ['staging', 'committed', 'aborted'].includes(value.status)
  && isNumber(value.created) && isNumber(value.updated) && isNullableRevision(value.resultRevision);
const isAssetInfo = value => isObject(value) && isString(value.id) && isString(value.name)
  && isString(value.mime) && isNumber(value.size) && isNumber(value.created);
const isStorageCapacity = value => isObject(value) && typeof value.usedPercent === 'number'
  && Number.isFinite(value.usedPercent) && value.usedPercent >= 0 && value.usedPercent <= 100
  && isBoolean(value.warning);
const isBookmarkMetadataIcon = value => isObject(value)
  && ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(value.mime)
  && isString(value.data) && value.data.length > 0 && value.data.length <= 349528 && value.data.length % 4 === 0
  && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data);
const isBookmarkMetadataRequest = value => {
  if (!isObject(value) || !isString(value.url) || !value.url || value.url.length > 2048) return false;
  try {
    const url = new URL(value.url);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};
const isUpdateStatus = value => isObject(value)
  && ['idle', 'unavailable', 'queued', 'running', 'success', 'failed'].includes(value.state)
  && isString(value.version) && isNullableTimestamp(value.updatedAt)
  && isNullableTimestamp(value.logUpdatedAt) && isString(value.log);
const isOptionalBoolean = (value, key) => value[key] === undefined || isBoolean(value[key]);
const isOptionalString = (value, key) => value[key] === undefined || isString(value[key]);
const isCredential = value => isObject(value) && isString(value.salt) && isString(value.verifier)
  && Number.isSafeInteger(value.iterations) && value.iterations > 0;
const isRecordChange = value => isObject(value) && Array.isArray(value.upsert) && Array.isArray(value.delete)
  && value.delete.every(isString);
const isVaultChanges = value => isObject(value)
  && isRecordChange(value.notes) && value.notes.upsert.every(row => isObject(row) && isString(row.id) && isNumber(row.position) && isObject(row.data))
  && isRecordChange(value.bookmarks) && value.bookmarks.upsert.every(row => isObject(row) && isString(row.id)
    && isNumber(row.position) && (row.parentId === null || isString(row.parentId))
    && ['folder', 'link'].includes(row.kind) && isObject(row.data))
  && (value.categories === null || Array.isArray(value.categories))
  && (value.noteTypes === null || Array.isArray(value.noteTypes))
  && isRecordChange(value.trash) && value.trash.upsert.every(row => isObject(row) && isString(row.id) && isNumber(row.position) && isObject(row.data))
  && isObject(value.preferences) && isObject(value.preferences.set) && Array.isArray(value.preferences.delete)
  && value.preferences.delete.every(isString);

const requestContracts = {
  registrationRequest: value => isObject(value) && isString(value.username) && isCredential(value),
  authChallengeRequest: value => isObject(value) && isString(value.username),
  authVerificationRequest: value => isObject(value) && isString(value.id) && isString(value.verifier),
  authMfaVerificationRequest: value => isObject(value) && isString(value.token) && value.token.length >= 20 && value.token.length <= 128
    && isString(value.code) && value.code.length > 0 && value.code.length <= 64,
  accountPasswordRequest: value => isObject(value) && isString(value.currentVerifier) && isCredential(value),
  totpEnrollmentRequest: value => isObject(value) && isString(value.currentVerifier),
  totpConfirmRequest: value => isObject(value) && isString(value.pendingId) && isString(value.code),
  totpDisableRequest: value => isObject(value) && isString(value.currentVerifier) && isString(value.code),
  vaultMutationRequest: value => isObject(value) && isNumber(value.revision) && isVaultData(value.data),
  vaultImportMutationRequest: value => isObject(value) && isString(value.scopeId)
    && isNumber(value.revision) && isVaultData(value.data),
  vaultChangesMutationRequest: value => isObject(value) && isNumber(value.revision) && isVaultChanges(value.changes),
  systemUpdateRequest: value => isObject(value) && value.action === 'update',
  assetImportUploadRequest: value => isObject(value) && isString(value.name) && value.name.length > 0 && value.name.length <= 200
    && isNumber(value.size) && value.size > 0,
  bookmarkMetadataRequest: isBookmarkMetadataRequest,
  extensionPairingCodeRequest: value => isObject(value) && isString(value.name) && value.name.trim().length > 0 && value.name.length <= 80,
  extensionTokenRevokeRequest: value => isObject(value) && isString(value.id) && /^[a-f0-9-]{36}$/i.test(value.id),
  extensionPairRequest: value => isObject(value) && isString(value.code) && value.code.length <= 80,
  extensionBookmarkRequest: value => isObject(value) && isBookmarkMetadataRequest({ url: value.url })
    && (value.title === undefined || isString(value.title) && value.title.length <= 500)
};

export const API_REQUEST_NAMES = Object.freeze(Object.keys(requestContracts));

export function isApiErrorResponse(value) {
  return isObject(value) && isString(value.error)
    && isOptionalString(value, 'code')
    && isOptionalBoolean(value, 'registrationEnabled')
    && isOptionalBoolean(value, 'setupRequired');
}

export function assertApiErrorResponse(value) {
  if (!isApiErrorResponse(value)) throw new TypeError('API 错误响应不符合契约');
  return value;
}

export function isApiRequest(name, value) {
  return Object.prototype.hasOwnProperty.call(requestContracts, name) && requestContracts[name](value);
}

export function assertApiRequest(name, value) {
  if (!isApiRequest(name, value)) throw new TypeError(`API 请求不符合契约：${name}`);
  return value;
}

const responseContracts = {
  sessionBootstrap: value => isObject(value) && isString(value.owner) && isString(value.username) && value.local === false,
  authConfig: value => isObject(value) && isBoolean(value.registrationEnabled) && isBoolean(value.setupRequired),
  authSession: value => isObject(value) && isString(value.id) && isString(value.username)
    && isRevision(value) && isVaultData(value.data),
  registration: value => isObject(value) && isString(value.id) && isString(value.username) && isBoolean(value.legacyClaimed),
  authChallenge: value => isObject(value) && isString(value.id) && isString(value.salt) && isNumber(value.iterations),
  authVerification: value => isObject(value) && isString(value.id)
    && (value.mfaRequired === true ? isString(value.mfaToken) : value.mfaRequired === undefined && value.mfaToken === undefined),
  authMfaVerification: value => isObject(value) && isString(value.id),
  authLogout: value => isObject(value) && value.ok === true,
  accountProfile: value => isObject(value) && isString(value.id) && isString(value.username)
    && isNumber(value.created) && (value.avatarMime === null || isString(value.avatarMime)) && isBoolean(value.totpEnabled),
  accountAvatarMutation: value => isObject(value) && value.ok === true
    && (value.mime === undefined || isString(value.mime)),
  extensionPairingCode: value => isObject(value) && isString(value.code) && isString(value.name) && isNumber(value.expires),
  extensionPair: value => isObject(value) && isString(value.token) && isString(value.name) && isNumber(value.expires),
  extensionTokens: value => isObject(value) && Array.isArray(value.tokens) && value.tokens.every(token => isObject(token)
    && isString(token.id) && isString(token.name) && isNumber(token.created)
    && isNullableTimestamp(token.lastUsed) && isNumber(token.expires)),
  extensionTokenMutation: value => isObject(value) && value.ok === true,
  extensionBookmark: value => isObject(value) && ['created', 'duplicate'].includes(value.status)
    && isString(value.id) && isNumber(value.revision),
  passwordSalt: value => isObject(value) && isString(value.salt) && isNumber(value.iterations),
  accountPasswordMutation: value => isObject(value) && value.ok === true && value.otherSessionsRevoked === true,
  totpEnrollment: value => isObject(value) && isString(value.pendingId) && isString(value.secret) && isString(value.uri)
    && value.uri.startsWith('otpauth://totp/'),
  totpEnabled: value => isObject(value) && value.enabled === true && Array.isArray(value.recoveryCodes)
    && value.recoveryCodes.length === 10 && value.recoveryCodes.every(isString),
  totpMutation: value => isObject(value) && value.ok === true && value.enabled === false,
  revision: isRevision,
  vaultImport: isRevision,
  vault: value => isRevision(value) && isVaultData(value.data),
  vaultChanges: value => isRevision(value) && isBoolean(value.resetRequired)
    && (value.hasMore === undefined || isBoolean(value.hasMore))
    && (value.changes === undefined || Array.isArray(value.changes)
      && value.changes.every(item => isRevision(item) && isVaultChanges(item.changes))),
  backupSummaries: value => Array.isArray(value) && value.every(item => isRevision(item) && isNumber(item.created)),
  backupCreated: value => isRevision(value) && isNumber(value.created),
  backupSnapshot: value => isRevision(value) && isVaultData(value.data),
  assets: value => Array.isArray(value) && value.every(isAssetInfo),
  uploadedAsset: value => isAssetInfo(value) && isString(value.url),
  assetImportUpload: value => isObject(value) && isString(value.id) && isString(value.name) && isNumber(value.size) && value.size > 0,
  assetImportChunk: value => isObject(value) && value.ok === true && isString(value.id) && isNumber(value.chunks) && value.chunks > 0 && isNumber(value.bytes) && value.bytes > 0,
  assetImportScope: isAssetImportScope,
  prunedAssets: value => isObject(value) && isNumber(value.removed) && isNumber(value.bytes),
  bookmarkMetadata: value => isObject(value) && isString(value.title) && value.title.length <= 500
    && isString(value.description) && value.description.length <= 2000
    && (value.favicon === null || isBookmarkMetadataIcon(value.favicon)),
  systemVersion: value => isObject(value) && isString(value.currentVersion)
    && (value.latestVersion === undefined || isString(value.latestVersion))
    && (value.updateAvailable === undefined || isBoolean(value.updateAvailable))
    && (value.canUpdateDevice === undefined || isBoolean(value.canUpdateDevice))
    && (value.installerAvailable === undefined || isBoolean(value.installerAvailable))
    && (value.updaterAvailable === undefined || isBoolean(value.updaterAvailable))
    && (value.releaseUrl === undefined || isString(value.releaseUrl))
    && (value.notes === undefined || isString(value.notes))
    && (value.publishedAt === undefined || value.publishedAt === null || isString(value.publishedAt)),
  updateAcceptance: value => isObject(value) && value.accepted === true && isString(value.version),
  updateStatus: isUpdateStatus,
  storageCapacity: isStorageCapacity
};

export const API_RESPONSE_NAMES = Object.freeze(Object.keys(responseContracts));

export function isApiResponse(name, value) {
  return Object.prototype.hasOwnProperty.call(responseContracts, name) && responseContracts[name](value);
}

export function assertApiResponse(name, value) {
  if (!isApiResponse(name, value)) throw new TypeError(`API 响应不符合契约：${name}`);
  return value;
}
