import type { EditorDraftFields } from './draft-controller.ts';
import type { EditorForm } from './types';

export type EditorFormAdapterDependencies = {
  getVueForm: () => EditorForm | null;
  getLegacyForm: () => EditorForm | null;
  getBodyHTML: () => string;
  cleanHTML: (html: string, strict: boolean) => string;
};

export function createEditorFormAdapter(dependencies: EditorFormAdapterDependencies) {
  function readEditorFields(): EditorDraftFields | null {
    const fields = dependencies.getVueForm() ?? dependencies.getLegacyForm();
    if (!fields) return null;

    return {
      title: fields.title,
      type: fields.type,
      category: fields.category,
      tags: fields.tags.split(/[,，]/).map(value => value.trim().replace(/^#/, '')).filter(Boolean).slice(0, 30),
      source: fields.source,
      body: dependencies.cleanHTML(dependencies.getBodyHTML(), true)
    };
  }

  return { readEditorFields };
}
