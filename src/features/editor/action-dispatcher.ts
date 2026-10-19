import type { EditorAction } from './types';

type EditorActionDispatcherDependencies = {
  isReady: () => boolean;
  goToOutline: (position: number) => void;
  format: (action: Extract<EditorAction, { group: 'format' }>['action'], value?: string) => void;
  insert: (action: Extract<EditorAction, { group: 'insert' }>['action']) => void | Promise<void>;
  table: (action: Extract<EditorAction, { group: 'table' }>['action']) => void;
  editor: (action: Extract<EditorAction, { group: 'editor' }>['action']) => void;
  paragraph: (action: Extract<EditorAction, { group: 'paragraph' }>['action']) => void;
};

export function createEditorActionDispatcher(dependencies: EditorActionDispatcherDependencies) {
  function dispatch(command: EditorAction): void | Promise<void> {
    if (!dependencies.isReady()) return;

    switch (command.group) {
      case 'outline': return dependencies.goToOutline(command.position);
      case 'format': return dependencies.format(command.action, command.value);
      case 'insert': return dependencies.insert(command.action);
      case 'table': return dependencies.table(command.action);
      case 'editor': return dependencies.editor(command.action);
      case 'paragraph': return dependencies.paragraph(command.action);
    }
  }

  return { dispatch };
}
