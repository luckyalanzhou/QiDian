export type SlashMenuPosition = { left: number; top: number };

export type SlashMenuControllerDependencies = {
  window: Pick<Window, 'innerWidth' | 'innerHeight' | 'getSelection'>;
  show: (position: SlashMenuPosition) => void;
  close: () => void;
};

export function createSlashMenuController({ window, show, close }: SlashMenuControllerDependencies) {
  function open() {
    const selection = window.getSelection();
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const x = rect?.left || window.innerWidth / 2;
    const y = (rect?.bottom || 120) + 8;

    show({
      left: Math.max(12, Math.min(x, window.innerWidth - 260)),
      top: Math.max(12, Math.min(y, window.innerHeight - 355))
    });
  }

  return { open, close };
}
