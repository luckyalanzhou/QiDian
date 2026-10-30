export type EditorFileInputActions = {
  uploadAttachments: (files: File[]) => void | Promise<void>;
  storeImages: (files: File[]) => void | Promise<void>;
};

export function mountEditorFileInputEvents(document: Document, actions: EditorFileInputActions) {
  function onChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;

    if (input.id === 'attachmentFile') {
      const files = Array.from(input.files || []);
      input.value = '';
      void actions.uploadAttachments(files);
    } else if (input.id === 'imageFile') {
      const files = Array.from(input.files || []);
      input.value = '';
      void actions.storeImages(files);
    }
  }

  document.addEventListener('change', onChange);
  return () => document.removeEventListener('change', onChange);
}
