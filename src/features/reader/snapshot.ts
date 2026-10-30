import type { VaultNote } from '../../../shared/api-contracts.js';
import type { ReaderSnapshot } from './types';
import { restoreSameNoteFragmentLinks } from '../content/same-note-fragment-links.ts';

export type ReaderSnapshotOptions = {
  document: Document;
  stored: VaultNote;
  note: VaultNote;
  working: boolean;
  previewing: boolean;
  readableNoteBody: (body: unknown, title?: string) => { html: string };
  typeLabel: (type: string) => string;
  formatDate: (timestamp: number) => string;
  safeUrl: (value: string) => boolean;
  isDraft: (note: VaultNote) => boolean;
  needsPublish: (note: VaultNote) => boolean;
};

export function createReaderSnapshot(options: ReaderSnapshotOptions): ReaderSnapshot {
  const { document, stored, note, working } = options;
  const bodyView = options.readableNoteBody(note.body, note.title);
  const body = document.createElement('div');
  body.innerHTML = restoreSameNoteFragmentLinks(bodyView.html, {
    document,
    baseUrl: document.location?.href || '',
    noteId: note.id
  });

  const sourceHeadings = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  if (sourceHeadings.length) {
    const headingOffset = 2 - Number(sourceHeadings[0].tagName.slice(1));
    for (const heading of sourceHeadings) {
      const level = Math.min(6, Math.max(2, Number(heading.tagName.slice(1)) + headingOffset));
      if (level === Number(heading.tagName.slice(1))) continue;
      const replacement = document.createElement(`h${level}`);
      for (const attribute of Array.from(heading.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      while (heading.firstChild) replacement.append(heading.firstChild);
      heading.replaceWith(replacement);
    }
  }

  const headings = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const safeHeadingId = (value: string) => /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]{0,127}$/u.test(value);
  const headingSlug = (value: unknown, index: number) => String(value || '')
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128) || `section-${index}`;
  const reservedIds = new Set(headings.map(heading => heading.id).filter(safeHeadingId));
  const usedIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  const fragmentAliases = new Map<string, string>();
  const fragmentSlugCounts = new Map<string, number>();
  const outline = headings.flatMap((heading, index) => {
    const name = (heading.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) {
      heading.removeAttribute('id');
      return [];
    }
    const sourceId = heading.id;
    let id = '';
    if (safeHeadingId(sourceId) && !seenSourceIds.has(sourceId)) {
      id = sourceId;
      seenSourceIds.add(sourceId);
    } else {
      const base = `sec-${index}`;
      id = base;
      let suffix = 2;
      while (reservedIds.has(id) || usedIds.has(id)) id = `${base}-${suffix++}`;
    }
    usedIds.add(id);
    heading.id = id;
    heading.setAttribute('tabindex', '-1');
    const slug = headingSlug(name, index);
    const count = fragmentSlugCounts.get(slug) || 0;
    fragmentSlugCounts.set(slug, count + 1);
    const alias = count ? `${Array.from(slug).slice(0, 126).join('')}-${count}` : slug;
    if (!fragmentAliases.has(alias)) fragmentAliases.set(alias, id);
    const legacyId = `sec-${index}`;
    if (!fragmentAliases.has(legacyId)) fragmentAliases.set(legacyId, id);
    return [{ name, id, level: Number(heading.tagName.slice(1)) }];
  });
  const headingIds = new Set(outline.map(section => section.id));
  body.querySelectorAll('a[href^="#"]').forEach(anchor => {
    const href = anchor.getAttribute('href') || '';
    let fragment = '';
    try {
      fragment = decodeURIComponent(href.slice(1));
    } catch {
      fragment = '';
    }
    const targetId = headingIds.has(fragment) ? fragment : fragmentAliases.get(fragment);
    if (!targetId) anchor.removeAttribute('href');
    else anchor.setAttribute('href', `#${targetId}`);
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  });
  const text = (body.textContent || '').replace(/\s+/g, ' ').trim();
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWordCount = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  const source = note.source || '';

  return {
    noteId: note.id,
    title: note.title || '',
    typeLabel: options.typeLabel(note.type),
    updatedLabel: options.formatDate(note.updated),
    createdLabel: options.formatDate(note.created),
    readingMinutes: Math.max(1, Math.ceil((cjkCount + latinWordCount * 5) / 350)),
    tags: [...(note.tags || [])],
    source,
    sourceUrl: options.safeUrl(source) ? source : '',
    bodyHtml: body.innerHTML,
    outline,
    working,
    publishLabel: options.needsPublish(stored) && working
      ? options.isDraft(stored) ? '发布笔记' : '保存笔记'
      : null,
    editLabel: options.previewing ? '继续编辑' : '编辑笔记',
    showPendingChanges: !working && !!stored.publishedSnapshot,
    pinned: !!note.pinned
  };
}
