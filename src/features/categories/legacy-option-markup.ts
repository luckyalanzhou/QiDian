export function renderLegacyCategoryOptions(
  categories: readonly string[],
  current: string | undefined,
  escapeHtml: (value: string) => string
): string {
  return [...new Set(['未分类', ...categories, current].filter((value): value is string => !!value))]
    .map(value => `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(value)}</option>`)
    .join('');
}
