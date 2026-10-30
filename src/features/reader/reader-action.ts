export type ReaderActionCommand =
  | { type: 'edit-current' }
  | { type: 'show-pending-changes' }
  | { type: 'publish-current' }
  | { type: 'toggle-current-pin' }
  | { type: 'duplicate-current' }
  | { type: 'delete-current' };

export type ReaderActionResult = void | Promise<void>;
