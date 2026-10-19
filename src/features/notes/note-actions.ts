import type { VaultData, VaultNote } from '../../../shared/api-contracts.js';

export type NoteActionOptions = {
  now?: () => number;
  createId?: (timestamp: number, attempt: number) => string;
};

type NoteWithPreviewMarker = VaultNote & { _hasUnpublished?: boolean };

function uniqueNoteId(vault: VaultData, timestamp: number, createId: NoteActionOptions['createId']): string {
  const makeId = createId || ((time: number) => `n${time}${Math.random().toString(36).slice(2, 6)}`);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makeId(timestamp, attempt);
    if (id && !vault.notes.some(note => note.id === id)) return id;
  }
  throw new Error('笔记编号冲突，请重试');
}

export function createNote(
  vault: VaultData,
  requestedType: string,
  category: string,
  options: NoteActionOptions = {}
): VaultNote {
  const noteTypes = vault.noteTypes || [];
  const type = noteTypes.some(item => item.id === requestedType)
    ? requestedType
    : noteTypes[0]?.id;
  if (!type) throw new Error('请先创建笔记类型');

  const now = options.now || Date.now;
  const timestamp = now();
  const note: VaultNote = {
    id: uniqueNoteId(vault, timestamp, options.createId),
    title: '',
    type,
    category: category.trim() || '未分类',
    tags: [],
    body: type === 'command'
      ? '<h2>用途</h2><p></p><h2>命令</h2><pre><code>在这里输入命令</code></pre>'
      : type === 'issue'
        ? '<h2>问题现象</h2><p></p><h2>解决办法</h2><p></p><h2>排查过程</h2><p></p>'
        : '',
    source: '',
    created: timestamp,
    updated: timestamp,
    pinned: false,
    status: 'draft',
    publishedAt: null
  };
  vault.notes.unshift(note);
  return note;
}

export function duplicateNote(
  vault: VaultData,
  source: NoteWithPreviewMarker,
  options: NoteActionOptions = {}
): VaultNote {
  if (!source) throw new Error('笔记不存在');
  const now = options.now || Date.now;
  const timestamp = now();
  const copy = structuredClone(source) as NoteWithPreviewMarker;
  copy.id = uniqueNoteId(vault, timestamp, options.createId);
  copy.title = `${copy.title || ''}（副本）`;
  copy.updated = timestamp;
  copy.created = timestamp;
  copy.pinned = false;
  copy.status = 'draft';
  copy.publishedAt = null;
  delete copy.publishedSnapshot;
  delete copy._hasUnpublished;
  vault.notes.unshift(copy);
  return copy;
}
