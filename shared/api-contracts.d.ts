export type NoteType = { id: string; name: string };

export type PublishedNoteVersion = {
  title: string;
  type: string;
  category: string;
  tags: string[];
  body: string;
  source: string;
  updated: number;
};

export type VaultNote = {
  id: string;
  title: string;
  type: string;
  category: string;
  tags: string[];
  body: string;
  source: string;
  created: number;
  updated: number;
  pinned: boolean;
  status?: 'draft' | 'published';
  publishedAt?: number | null;
  publishedSnapshot?: PublishedNoteVersion;
};

export type BookmarkLink = { id: string; kind: 'link'; title: string; url: string; pinned?: true; description?: string; favicon?: string };
export type BookmarkFolder = { id: string; kind: 'folder'; title: string; children: BookmarkItem[] };
export type BookmarkItem = BookmarkLink | BookmarkFolder;

type TrashEntryMetadata = {
  id: string;
  deletedAt: number;
  parentId?: string;
  index: number;
  previousId?: string;
  nextId?: string;
  releasedChildren?: string[];
};
export type TrashEntry = TrashEntryMetadata & (
  | { kind: 'note'; item: VaultNote }
  | { kind: 'bookmark'; item: BookmarkItem }
);

export type VaultData = {
  categories: string[];
  noteTypes?: NoteType[];
  notes: VaultNote[];
  bookmarks?: BookmarkItem[];
  trash?: TrashEntry[];
  theme?: 'system' | 'light' | 'dark';
  pasteMode?: 'rich' | 'match' | 'plain';
  noteTypesExpanded?: boolean;
  dashboardBookmarkLayout?: 'single' | 'double';
  dashboardBookmarkFolders?: Record<string, boolean>;
  bookmarkDirectoryOpen?: boolean | null;
  bookmarkFolderStates?: Record<string, boolean>;
};

export type RevisionResponse = { revision: number };
export type VaultResponse = RevisionResponse & { data: VaultData };
export type VaultRecordChange<T> = { upsert: T[]; delete: string[] };
export type BookmarkRecordChange = { id: string; parentId: string | null; position: number; kind: BookmarkItem['kind']; data: BookmarkItem };
export type VaultChanges = {
  notes: VaultRecordChange<{ id: string; position: number; data: VaultNote }>;
  bookmarks: VaultRecordChange<BookmarkRecordChange>;
  categories: string[] | null;
  noteTypes: NoteType[] | null;
  trash: VaultRecordChange<{ id: string; position: number; data: TrashEntry }>;
  preferences: { set: Partial<Pick<VaultData, 'theme' | 'pasteMode' | 'noteTypesExpanded' | 'dashboardBookmarkLayout' | 'dashboardBookmarkFolders' | 'bookmarkDirectoryOpen' | 'bookmarkFolderStates'>>; delete: string[] };
};
export type VaultChangesResponse = RevisionResponse & { resetRequired: boolean; hasMore?: boolean; changes?: Array<RevisionResponse & { changes: VaultChanges }> };
export type AuthConfig = { registrationEnabled: boolean; setupRequired: boolean };
export type AuthSession = { id: string; username: string; revision: number; data: VaultData };
export type SessionBootstrap = { owner: string; username: string; local: false };
export type AuthChallenge = { id: string; salt: string; iterations: number };
export type AuthVerification = { id: string } | { id: string; mfaRequired: true; mfaToken: string };
export type RegistrationResult = { id: string; username: string; legacyClaimed: boolean };
export type SystemVersion = {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  canUpdateDevice?: boolean;
  installerAvailable?: boolean;
  updaterAvailable?: boolean;
  releaseUrl?: string;
  notes?: string;
  publishedAt?: string | null;
};
export type UpdateAcceptance = { accepted: boolean; version: string };
export type UpdateStatus = {
  state: 'idle' | 'unavailable' | 'queued' | 'running' | 'success' | 'failed';
  version: string;
  updatedAt: number | null;
  logUpdatedAt: number | null;
  log: string;
};

export type StorageCapacity = {
  usedPercent: number;
  warning: boolean;
};
export type AccountProfile = { id: string; username: string; created: number; avatarMime: string | null; totpEnabled: boolean };
export type PasswordSalt = { salt: string; iterations: number };
export type AccountAvatarMutation = { ok: true; mime?: string };
export type AccountPasswordMutation = { ok: true; otherSessionsRevoked: true };
export type AssetInfo = { id: string; name: string; mime: string; size: number; created: number };
export type UploadedAsset = AssetInfo & { url: string };
export type AssetImportScope = { id: string; status: 'staging' | 'committed' | 'aborted'; created: number; updated: number; resultRevision: number | null };
export type AssetImportUpload = { id: string; name: string; size: number };
export type AssetImportChunkResult = { ok: true; id: string; chunks: number; bytes: number };
export type AssetPruneResult = { removed: number; bytes: number };
export type BookmarkMetadataIcon = { mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/x-icon' | 'image/vnd.microsoft.icon'; data: string };
export type BookmarkMetadata = { title: string; description: string; favicon: BookmarkMetadataIcon | null };
export type BackupSummary = { revision: number; created: number };
export type BackupSnapshot = { revision: number; data: VaultData };
export type BackupCreated = RevisionResponse & { created: number };

export type CredentialRequest = { salt: string; verifier: string; iterations: number };
export type ApiRequestMap = {
  registrationRequest: { username: string } & CredentialRequest;
  authChallengeRequest: { username: string };
  authVerificationRequest: { id: string; verifier: string };
  authMfaVerificationRequest: { token: string; code: string };
  accountPasswordRequest: { currentVerifier: string } & CredentialRequest;
  totpEnrollmentRequest: { currentVerifier: string };
  totpConfirmRequest: { pendingId: string; code: string };
  totpDisableRequest: { currentVerifier: string; code: string };
  vaultMutationRequest: { revision: number; data: VaultData };
  vaultImportMutationRequest: { scopeId: string; revision: number; data: VaultData };
  vaultChangesMutationRequest: { revision: number; changes: VaultChanges };
  systemUpdateRequest: { action: 'update' };
  assetImportUploadRequest: { name: string; size: number };
  bookmarkMetadataRequest: { url: string };
  extensionPairingCodeRequest: { name: string };
  extensionTokenRevokeRequest: { id: string };
  extensionPairRequest: { code: string };
  extensionBookmarkRequest: { url: string; title?: string };
};
export type ApiRequestName = keyof ApiRequestMap;

export type ApiResponseMap = {
  sessionBootstrap: SessionBootstrap;
  authConfig: AuthConfig;
  authSession: AuthSession;
  registration: RegistrationResult;
  authChallenge: AuthChallenge;
  authVerification: AuthVerification;
  authMfaVerification: AuthVerification;
  authLogout: { ok: true };
  accountProfile: AccountProfile;
  accountAvatarMutation: AccountAvatarMutation;
  extensionPairingCode: { code: string; name: string; expires: number };
  extensionPair: { token: string; name: string; expires: number };
  extensionTokens: { tokens: Array<{ id: string; name: string; created: number; lastUsed: number | null; expires: number }> };
  extensionTokenMutation: { ok: true };
  extensionBookmark: { status: 'created' | 'duplicate'; id: string; revision: number };
  passwordSalt: PasswordSalt;
  accountPasswordMutation: AccountPasswordMutation;
  totpEnrollment: { pendingId: string; secret: string; uri: string };
  totpEnabled: { enabled: true; recoveryCodes: string[] };
  totpMutation: { ok: true; enabled: false };
  revision: RevisionResponse;
  vaultImport: RevisionResponse;
  vault: VaultResponse;
  vaultChanges: VaultChangesResponse;
  backupSummaries: BackupSummary[];
  backupCreated: BackupCreated;
  backupSnapshot: BackupSnapshot;
  assets: AssetInfo[];
  uploadedAsset: UploadedAsset;
  assetImportUpload: AssetImportUpload;
  assetImportChunk: AssetImportChunkResult;
  assetImportScope: AssetImportScope;
  prunedAssets: AssetPruneResult;
  bookmarkMetadata: BookmarkMetadata;
  systemVersion: SystemVersion;
  updateAcceptance: UpdateAcceptance;
  updateStatus: UpdateStatus;
  storageCapacity: StorageCapacity;
};

export type ApiResponseName = keyof ApiResponseMap;
export const API_REQUEST_NAMES: readonly ApiRequestName[];
export const API_RESPONSE_NAMES: readonly ApiResponseName[];
export type ApiErrorResponse = {
  error: string;
  code?: string;
  registrationEnabled?: boolean;
  setupRequired?: boolean;
  [key: string]: unknown;
};

export function isApiResponse(name: ApiResponseName | string, value: unknown): value is ApiResponseMap[ApiResponseName];
export function assertApiResponse<Name extends ApiResponseName>(name: Name, value: unknown): ApiResponseMap[Name];
export function isApiRequest<Name extends ApiRequestName>(name: Name | string, value: unknown): value is ApiRequestMap[Name];
export function assertApiRequest<Name extends ApiRequestName>(name: Name, value: unknown): ApiRequestMap[Name];
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse;
export function assertApiErrorResponse(value: unknown): ApiErrorResponse;
