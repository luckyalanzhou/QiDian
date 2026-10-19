import type {
  NoteTypeDialogConfiguration,
  NoteTypeDialogSubmission,
} from './type-dialog-store.ts';
import type { NoteType } from '../../../shared/api-contracts.js';

type LegacyNoteTypeDialogDependencies = {
  document: Document;
  escapeHtml: (value: string) => string;
};

export function createLegacyNoteTypeDialog({ document, escapeHtml }: LegacyNoteTypeDialogDependencies) {
  let submission: Pick<NoteTypeDialogSubmission, 'mode' | 'id'> = { mode: 'create', id: null };

  function getOverlay(): HTMLElement | null {
    return document.querySelector<HTMLElement>('#typeOverlay');
  }

  function ensureOverlay(): HTMLElement {
    let overlay = getOverlay();
    if (overlay) return overlay;

    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="overlay" id="typeOverlay"><div class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="typeDialogTitle"><div class="dialog-head"><h2 id="typeDialogTitle"></h2><button class="round-btn" data-close="typeOverlay" aria-label="关闭">关闭</button></div><div class="dialog-body" id="typeDialogBody"></div><div class="dialog-foot"><span class="hint" id="typeDialogHint"></span><button class="secondary-btn" data-close="typeOverlay">取消</button><button class="primary-btn" id="typeDialogConfirm">确认</button></div></div></div>',
    );
    overlay = getOverlay();
    if (!overlay) throw new Error('笔记类型弹窗无法创建');
    return overlay;
  }

  function open(configuration: NoteTypeDialogConfiguration & { itemName?: string; autoCreate?: boolean }): void {
    submission = { mode: configuration.mode, id: configuration.id };
    const overlay = ensureOverlay();
    const title = overlay.querySelector<HTMLElement>('#typeDialogTitle');
    const hint = overlay.querySelector<HTMLElement>('#typeDialogHint');
    const body = overlay.querySelector<HTMLElement>('#typeDialogBody');
    const confirm = overlay.querySelector<HTMLButtonElement>('#typeDialogConfirm');
    if (!title || !hint || !body || !confirm) throw new Error('笔记类型弹窗结构不完整');

    title.textContent = configuration.title;
    hint.textContent = configuration.hint;
    if (configuration.mode === 'delete') {
      const noteCount = configuration.noteCount || 0;
      const options = configuration.options || [];
      const automaticFallback = configuration.autoCreate ?? options.some(option => option.autoCreate);
      body.innerHTML = `<p class="type-delete-copy">“${escapeHtml(configuration.itemName || '')}”下有 <strong>${noteCount}</strong> 篇笔记。删除类型时，笔记会保留并转移到：</p><label class="form-label" for="typeReplacement">转移到类型</label><select class="form-text" id="typeReplacement">${options.map(option => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.name)}${option.autoCreate || automaticFallback ? '（自动创建）' : ''}</option>`).join('')}</select>`;
      confirm.textContent = '删除类型';
      confirm.classList.add('danger-btn');
    } else {
      body.innerHTML = `<label class="form-label" for="typeNameInput">类型名称</label><input id="typeNameInput" class="form-text" maxlength="30" value="${escapeHtml(configuration.name || '')}" placeholder="例如：读书笔记"><p class="hint">类型名称会显示在左侧导航和笔记筛选中。</p>`;
      confirm.textContent = configuration.mode === 'create' ? '创建类型' : '保存修改';
      confirm.classList.remove('danger-btn');
    }

    overlay.classList.add('open');
    const focusTarget = body.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    setTimeout(() => focusTarget?.focus(), 50);
  }

  function readSubmission(fallbackType?: NoteType): NoteTypeDialogSubmission & { fallbackType?: NoteType } {
    const overlay = getOverlay();
    return {
      ...submission,
      name: overlay?.querySelector<HTMLInputElement>('#typeNameInput')?.value || '',
      targetId: overlay?.querySelector<HTMLSelectElement>('#typeReplacement')?.value || '',
      fallbackType,
    };
  }

  function close(): void {
    getOverlay()?.classList.remove('open');
  }

  return { open, readSubmission, close };
}
