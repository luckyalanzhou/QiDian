type SameNoteFragmentLinkOptions = {
  document: Document;
  baseUrl: string;
  noteId: string;
};

/** Restores browser-resolved links to headings in the note currently open. */
export function restoreSameNoteFragmentLinks(html: unknown, options: SameNoteFragmentLinkOptions): string {
  const source = String(html ?? '');
  let current: URL;
  try {
    current = new URL(options.baseUrl);
  } catch {
    return source;
  }
  const noteId = String(options.noteId || '');
  if (!noteId || current.searchParams.get('qidian') !== 'note' || current.searchParams.get('note') !== noteId) return source;

  const template = options.document.createElement('template');
  template.innerHTML = source;
  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(anchor => {
    let destination: URL;
    try {
      destination = new URL(anchor.getAttribute('href') || '', current.href);
    } catch {
      return;
    }
    if (
      destination.origin !== current.origin
      || destination.pathname !== current.pathname
      || destination.searchParams.get('qidian') !== 'note'
      || destination.searchParams.get('note') !== noteId
      || !destination.hash
    ) return;

    anchor.setAttribute('href', destination.hash);
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  });
  return template.innerHTML;
}
