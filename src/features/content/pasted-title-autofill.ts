type PastedTitleAutofillDependencies = {
  document: Document;
  extractPastedTitle: (html: unknown, plain: unknown) => string;
};

export function createPastedTitleAutofill(dependencies: PastedTitleAutofillDependencies) {
  return (fieldId: string, html: string, plain: string) => {
    const field = dependencies.document.getElementById(fieldId) as HTMLInputElement | null;
    const EventConstructor = field?.ownerDocument.defaultView?.Event;
    if (!field || field.value.trim() || !EventConstructor) return false;

    const title = dependencies.extractPastedTitle(html, plain);
    if (!title) return false;

    field.value = title;
    field.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    return true;
  };
}
