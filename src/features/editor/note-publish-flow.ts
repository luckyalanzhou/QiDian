export type PublishNote = {
  id: string;
  title: string;
  status?: string;
  publishedAt?: number | null;
  updated?: number;
  publishedSnapshot?: unknown;
  [key: string]: unknown;
};

export type PublishVault = { [key: string]: unknown; notes: PublishNote[] };

export type NotePublishDependencies = {
  getData: () => PublishVault;
  getNoteId: () => string | null;
  getEditingDraft: () => PublishNote | null;
  isEditing: () => boolean;
  prepareEditor: () => void;
  saveDraft: () => void;
  isDraft: (note: PublishNote) => boolean;
  hasDraftContent: (note: PublishNote) => boolean;
  needsPublish: (note: PublishNote) => boolean;
  queueSave: (data: PublishVault) => void;
  flush: () => Promise<boolean>;
  hasSyncConflict: () => boolean;
  complete: (data: PublishVault) => void;
  setBusy: (busy: boolean) => void;
  notify: (message: string) => void;
};

export function createNotePublishFlow(dependencies: NotePublishDependencies) {
  let publishing = false;
  let pendingCandidate: PublishVault | null = null;

  function saveFailureMessage(publishingNote = false) {
    if (dependencies.hasSyncConflict()) {
      return publishingNote
        ? '检测到修改冲突；内容仍保留，请到设置中整理未合并修改后再发布'
        : '检测到修改冲突；内容仍保留，请到设置中整理未合并修改后再保存';
    }
    return publishingNote
      ? '发布暂未完成；内容仍保留，请到设置中重试保存'
      : '内容仍保留；请到设置中重试保存，再发布';
  }

  function complete(candidate: PublishVault) {
    pendingCandidate = null;
    dependencies.complete(candidate);
  }

  async function publish() {
    if (publishing) return;
    publishing = true;
    dependencies.setBusy(true);
    try {
      if (pendingCandidate) {
        if (await dependencies.flush()) complete(pendingCandidate);
        else dependencies.notify(saveFailureMessage(true));
        return;
      }

      if (dependencies.isEditing()) {
        dependencies.prepareEditor();
        const draft = dependencies.getEditingDraft();
        if (draft && dependencies.isDraft(draft) && !dependencies.hasDraftContent(draft)) {
          dependencies.saveDraft();
          dependencies.notify('请先填写标题或正文，再发布笔记');
          return;
        }
        dependencies.saveDraft();
        if (!await dependencies.flush()) {
          dependencies.notify(saveFailureMessage());
          return;
        }
      }

      const candidate = structuredClone(dependencies.getData());
      const index = candidate.notes.findIndex(note => note.id === dependencies.getNoteId());
      if (index < 0) throw Error('笔记不存在');
      const note = candidate.notes[index];
      if (!dependencies.needsPublish(note)) {
        dependencies.notify('这篇笔记已经发布');
        return;
      }

      note.title = note.title.trim() || '无标题笔记';
      note.status = 'published';
      note.publishedAt = Date.now();
      note.updated = Date.now();
      delete note.publishedSnapshot;
      pendingCandidate = candidate;
      dependencies.queueSave(candidate);
      if (await dependencies.flush()) complete(candidate);
      else dependencies.notify(saveFailureMessage(true));
    } catch (error) {
      dependencies.notify(`发布失败：${(error as Error)?.message || '请稍后重试'}`);
    } finally {
      publishing = false;
      dependencies.setBusy(false);
    }
  }

  function resetPending() {
    pendingCandidate = null;
  }

  return { publish, resetPending };
}
