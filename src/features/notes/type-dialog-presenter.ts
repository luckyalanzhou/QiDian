import type { NoteType, VaultData } from '../../../shared/api-contracts.js';
import type { NoteTypeDialogConfiguration, NoteTypeDialogMode } from './type-dialog-store.ts';

type DialogTarget = {
  open: (configuration: NoteTypeDialogConfiguration & { itemName?: string }) => void;
};

type NoteTypeDialogPresenterDependencies = {
  getVault: () => Pick<VaultData, 'noteTypes' | 'notes'>;
  defaultNoteTypes: NoteType[];
  displayTypeName: (type: NoteType) => string;
  vueMounted: boolean;
  vueDialog: Pick<DialogTarget, 'open'>;
  legacyDialog: DialogTarget | null;
  notify: (message: string) => void;
};

export function createNoteTypeDialogPresenter(dependencies: NoteTypeDialogPresenterDependencies) {
  function open(mode: NoteTypeDialogMode, id: string | null = null): void {
    const vault = dependencies.getVault();
    const noteTypes = vault.noteTypes || [];
    if (mode === 'create' && noteTypes.length >= 50) {
      dependencies.notify('最多支持 50 种笔记类型');
      return;
    }

    const item = noteTypes.find(type => type.id === id);
    const automaticFallback = noteTypes.length === 1 && id !== 'note';
    const replacementTypes = [
      ...noteTypes.filter(type => type.id !== id),
      ...(automaticFallback ? dependencies.defaultNoteTypes.filter(type => type.id === 'note') : []),
    ];
    const configuration: NoteTypeDialogConfiguration & { itemName?: string } = {
      mode,
      id,
      title: mode === 'create' ? '新增笔记类型' : mode === 'edit' ? '编辑笔记类型' : '删除笔记类型',
      hint: mode === 'delete' ? '相关笔记会转移到所选类型，正文和附件不会删除。' : '',
      name: item ? dependencies.displayTypeName(item) : '',
      itemName: item?.name || '',
      noteCount: mode === 'delete' ? vault.notes.filter(note => note.type === id).length : 0,
      options: replacementTypes.map(type => ({ id: type.id, name: type.name, autoCreate: automaticFallback })),
    };

    if (dependencies.vueMounted) dependencies.vueDialog.open(configuration);
    else dependencies.legacyDialog?.open(configuration);
  }

  return { open };
}
