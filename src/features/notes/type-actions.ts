import type { NoteType, VaultData, VaultNote } from '../../../shared/api-contracts.js';

export type NoteTypeMigration = { activeCount: number; trashCount: number };

function normalizedName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('请输入类型名称');
  if (name.length > 30) throw new Error('类型名称最多 30 个字符');
  return name;
}

function assertNameAvailable(vault: VaultData, name: string, exceptId = ''): void {
  if (vault.noteTypes?.some(type => type.id !== exceptId && type.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('已有同名笔记类型');
  }
}

export function createNoteType(
  vault: VaultData,
  rawName: string,
  createId: () => string = () => `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
): NoteType {
  const noteTypes = vault.noteTypes || (vault.noteTypes = []);
  if (noteTypes.length >= 50) throw new Error('最多支持 50 种笔记类型');
  const name = normalizedName(rawName);
  assertNameAvailable(vault, name);
  let id = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    id = createId();
    if (id && !noteTypes.some(type => type.id === id)) break;
    id = '';
  }
  if (!id) throw new Error('笔记类型编号冲突，请重试');
  const created = { id, name };
  noteTypes.push(created);
  return created;
}

export function renameNoteType(vault: VaultData, id: string, rawName: string): NoteType {
  const noteTypes = vault.noteTypes || [];
  const existing = noteTypes.find(type => type.id === id);
  if (!existing) throw new Error('笔记类型不存在');
  const name = normalizedName(rawName);
  assertNameAvailable(vault, name, id);
  existing.name = name;
  return existing;
}

export function deleteNoteType(
  vault: VaultData,
  id: string,
  targetId: string,
  fallbackType?: NoteType
): NoteTypeMigration {
  const noteTypes = vault.noteTypes || [];
  if (!noteTypes.some(type => type.id === id)) throw new Error('笔记类型不存在');
  if (!targetId || targetId === id) throw new Error('请选择要转移到的类型');

  const targetExists = noteTypes.some(type => type.id === targetId);
  const createFallback = !!fallbackType && !targetExists && targetId === fallbackType.id && id !== fallbackType.id;
  if (!targetExists && !createFallback) throw new Error('请选择要转移到的类型');
  if (createFallback && fallbackType) noteTypes.push(structuredClone(fallbackType));

  const activeCount = vault.notes.filter(note => note.type === id).length;
  const trashedNotes = (vault.trash || []).filter(entry => entry.kind === 'note').map(entry => entry.item as VaultNote);
  const trashCount = trashedNotes.filter(note => note.type === id).length;
  const migrate = (note: VaultNote) => {
    if (note.type === id) note.type = targetId;
    if (note.publishedSnapshot?.type === id) note.publishedSnapshot.type = targetId;
  };

  vault.notes.forEach(migrate);
  trashedNotes.forEach(migrate);
  vault.noteTypes = noteTypes.filter(type => type.id !== id);
  return { activeCount, trashCount };
}
