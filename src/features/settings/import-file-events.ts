export function mountBackupImportFileEvents(document: Document, importFile: (file: File) => void | Promise<void>) {
  function onChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (input?.id !== 'importFile') return;
    const file = input.files?.[0];
    input.value = '';
    if (file) void importFile(file);
  }

  document.addEventListener('change', onChange);
  return () => document.removeEventListener('change', onChange);
}
