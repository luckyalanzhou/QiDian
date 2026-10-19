export type WorkspaceClickHandler = (event: Event) => boolean | Promise<boolean>;

export function mountWorkspaceClickRouter(document: Document, handlers: WorkspaceClickHandler[]) {
  if (!handlers.length) return () => undefined;

  const onClick = async (event: Event) => {
    for (const handle of handlers) {
      const result = handle(event);
      if (typeof result === 'boolean') {
        if (result) return;
      } else if (await result) {
        return;
      }
    }
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
