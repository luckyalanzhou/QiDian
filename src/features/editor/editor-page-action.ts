export type EditorPageActionCommand =
  | { type: 'save-current' }
  | { type: 'choose-attachment' }
  | { type: 'export-html' }
  | { type: 'choose-image' }
  | { type: 'delete-current' };

export type EditorPageActionResult = void | Promise<void>;
