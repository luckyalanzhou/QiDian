type EditorToolbarDependencies = {
  closeSlashMenu: () => void;
  format: (command: string, argument?: string | null) => void;
  insert: (kind: string) => Promise<void> | void;
  tableAction: (action: string) => void;
};

type EventTargetLike = EventTarget | null;

function closest(target: EventTargetLike, selector: string): Element | null {
  if (!target || typeof (target as Element).closest !== 'function') return null;
  return (target as Element).closest(selector);
}

function valueOf(target: Element): string {
  return (target as HTMLInputElement | HTMLSelectElement).value || '';
}

export function createEditorToolbarEvents(dependencies: EditorToolbarDependencies) {
  function handleClick(target: EventTargetLike): boolean | Promise<boolean> {
    const slash = closest(target, '[data-slash]');
    if (slash) {
      const kind = slash.getAttribute('data-slash') || '';
      dependencies.closeSlashMenu();
      if (kind === 'h2' || kind === 'h3') dependencies.format('formatBlock', kind);
      else if (kind === 'ul') dependencies.format('insertUnorderedList');
      else if (kind === 'task') dependencies.format('toggleTaskList');
      else return Promise.resolve(dependencies.insert(kind)).then(() => true);
      return true;
    }

    const table = closest(target, '[data-table-action]');
    if (table) {
      dependencies.tableAction(table.getAttribute('data-table-action') || '');
      return true;
    }

    const format = closest(target, '[data-fmt]');
    if (format) {
      dependencies.format(format.getAttribute('data-fmt') || '');
      return true;
    }

    const insert = closest(target, '[data-insert]');
    if (insert) return Promise.resolve(dependencies.insert(insert.getAttribute('data-insert') || '')).then(() => true);
    return false;
  }

  function handleChange(target: EventTargetLike): boolean {
    const block = closest(target, '#blockSelect');
    if (block) {
      dependencies.format('formatBlock', valueOf(block));
      return true;
    }

    const color = closest(target, '#fontColor');
    if (color) {
      dependencies.format('foreColor', valueOf(color));
      return true;
    }
    return false;
  }

  return { handleClick, handleChange };
}
