import type { useCommandPaletteStore } from '../features/command-palette/store.ts';
import type { useGlobalSearchStore } from '../features/search/store.ts';

type SearchStore = Pick<ReturnType<typeof useGlobalSearchStore>, 'open' | 'show' | 'close'>;
type CommandPaletteStore = Pick<ReturnType<typeof useCommandPaletteStore>, 'close'>;

type WorkspaceSearchDependencies = {
  store: SearchStore;
  commandPaletteStore: CommandPaletteStore;
  document: Document;
};

/** Owns workspace search entry points, including focus return for the keyboard shortcut. */
export function createWorkspaceSearch(dependencies: WorkspaceSearchDependencies) {
  function open(query = '') {
    dependencies.store.show(query);
  }

  function openFromShortcut() {
    dependencies.commandPaletteStore.close();
    const activeElement = dependencies.document.activeElement;
    const HtmlElement = dependencies.document.defaultView?.HTMLElement;
    dependencies.store.show('', HtmlElement && activeElement instanceof HtmlElement ? activeElement : null);
  }

  function close() {
    dependencies.store.close();
  }

  return {
    open,
    openFromShortcut,
    close,
    isOpen: () => dependencies.store.open
  };
}
