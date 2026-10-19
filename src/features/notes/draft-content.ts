import type { VaultNote } from '../../../shared/api-contracts.js';

type DraftNoteContent = Partial<Pick<VaultNote, 'title' | 'type' | 'category' | 'tags' | 'body' | 'source'>>;

export type DraftContentDependencies = {
  cleanHTML: (html: unknown, preserveWhitespace?: boolean) => string;
  parseHTML: (html: string) => Document;
};

export function createDraftContentTools(dependencies: DraftContentDependencies) {
  function editorContentSnapshot(note: DraftNoteContent | null | undefined): string {
    const body = dependencies.cleanHTML(note?.body || '', true)
      .replace(/<p>(?:\s|<br\s*\/?\s*>|&nbsp;|&#160;)*<\/p>/gi, '')
      .trim();
    return JSON.stringify({
      title: note?.title || '',
      type: note?.type || 'note',
      category: note?.category || '未分类',
      tags: note?.tags || [],
      source: note?.source || '',
      body
    });
  }

  function hasDraftContent(note: DraftNoteContent | null | undefined): boolean {
    if (!note) return false;
    if (note.title?.trim() || note.source?.trim() || note.tags?.some(tag => tag.trim())) return true;

    const body = dependencies.cleanHTML(note.body || '', true);
    const emptyTemplates: Record<string, string> = {
      command: '<h2>用途</h2><p></p><h2>命令</h2><pre><code>在这里输入命令</code></pre>',
      issue: '<h2>问题现象</h2><p></p><h2>解决办法</h2><p></p><h2>排查过程</h2><p></p>'
    };
    const emptyTemplate = note.type ? emptyTemplates[note.type] : undefined;
    if (emptyTemplate && body === dependencies.cleanHTML(emptyTemplate, true)) return false;

    const parsed = dependencies.parseHTML(body);
    return !!parsed.body.textContent?.replace(/\u00a0/g, ' ').trim()
      || !!parsed.body.querySelector('img[src]');
  }

  return { editorContentSnapshot, hasDraftContent };
}
