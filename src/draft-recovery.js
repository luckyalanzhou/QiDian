export function draftRecoveryState(draft, cloudRevision) {
  if (!draft?.pending) return 'none';
  if (draft.revision === cloudRevision) return 'restore';
  if (draft.conflictAcceptedCloudRevision === cloudRevision) return 'restore-conflict';
  return 'ask';
}
