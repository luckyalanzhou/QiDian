import { createHtmlContentTools } from '../features/content/html-content.ts';
import { createPastedTitleAutofill } from '../features/content/pasted-title-autofill.ts';
import { createDraftContentTools } from '../features/notes/draft-content.ts';

export type WorkspaceContentRuntimeDependencies = {
  document: Document;
  sanitizeHTML: (html: string) => unknown;
  parseHTML: (html: string) => Document;
  escapeHTML: (value: unknown) => string;
  looksLikeMarkdown: (value: string) => boolean;
};

/** Composes the shared content sanitation, draft snapshot and paste-title services. */
export function createWorkspaceContentRuntime(dependencies: WorkspaceContentRuntimeDependencies) {
  const html = createHtmlContentTools({
    document: dependencies.document,
    sanitize: dependencies.sanitizeHTML,
    parseHTML: dependencies.parseHTML,
    escapeHtml: dependencies.escapeHTML,
    looksLikeMarkdown: dependencies.looksLikeMarkdown
  });
  const drafts = createDraftContentTools({ cleanHTML: html.cleanHTML, parseHTML: dependencies.parseHTML });
  const autofillPastedTitle = createPastedTitleAutofill({
    document: dependencies.document,
    extractPastedTitle: html.extractPastedTitle
  });

  return { ...html, ...drafts, autofillPastedTitle };
}
