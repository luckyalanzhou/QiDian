import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

export type SaveDraftOptions = {
  transient: boolean;
  unchangedNew: boolean;
  isDraft: (note: VaultNote) => boolean;
  hasContent: (note: VaultNote) => boolean;
};

export type SaveDraftResult = {
  shouldPersist: boolean;
  retained: boolean;
};

export function saveNoteDraft(
  vault: VaultData,
  note: VaultNote,
  options: SaveDraftOptions
): SaveDraftResult {
  const index = vault.notes.findIndex(item => item.id === note.id);

  if (options.isDraft(note) && (!options.hasContent(note) || options.unchangedNew)) {
    if (index >= 0) vault.notes.splice(index, 1);
    return { shouldPersist: index >= 0 && !options.transient, retained: false };
  }

  const saved = structuredClone(note);
  saved.title = saved.title.trim() || '无标题笔记';
  if (index >= 0) vault.notes[index] = saved;
  else vault.notes.unshift(saved);
  if (!vault.categories.includes(saved.category) && saved.category !== '未分类') {
    vault.categories.push(saved.category);
  }

  return { shouldPersist: true, retained: true };
}
