import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createReaderSnapshot } from '../../../src/features/reader/snapshot.ts';

const baseNote = overrides => ({
  id: 'note-1',
  title: '知识库',
  type: 'note',
  category: '开发',
  tags: ['部署'],
  body: `<h2>Plan</h2><p>${'知'.repeat(400)}</p><h3>Details</h3>`,
  source: 'https://example.com/article',
  created: 100,
  updated: 200,
  pinned: true,
  ...overrides
});

function snapshot(stored, note, { working = false, previewing = false } = {}) {
  const dom = new JSDOM('<!doctype html>', { url: `http://localhost/?qidian=note&note=${note.id}` });
  try {
    return createReaderSnapshot({
      document: dom.window.document,
      stored,
      note,
      working,
      previewing,
      readableNoteBody: body => ({ html: String(body) }),
      typeLabel: type => type === 'note' ? '普通笔记' : '其他类型',
      formatDate: timestamp => `date-${timestamp}`,
      safeUrl: value => /^https?:\/\//i.test(value),
      isDraft: note => note.status === 'draft',
      needsPublish: note => note.status === 'draft' || !!note.publishedSnapshot
    });
  } finally {
    dom.window.close();
  }
}

test('reader snapshot derives a shared outline, reading estimate, metadata and safe source URL', () => {
  const note = baseNote({ source: 'javascript:alert(1)' });
  const result = snapshot(note, note);

  assert.equal(result.noteId, 'note-1');
  assert.equal(result.typeLabel, '普通笔记');
  assert.equal(result.updatedLabel, 'date-200');
  assert.equal(result.createdLabel, 'date-100');
  assert.equal(result.readingMinutes, 2);
  assert.deepEqual(result.outline, [
    { name: 'Plan', id: 'sec-0', level: 2 },
    { name: 'Details', id: 'sec-1', level: 3 }
  ]);
  assert.match(result.bodyHtml, /id="sec-0"/);
  assert.equal(result.sourceUrl, '');
  assert.deepEqual(result.tags, ['部署']);
  assert.equal(result.pinned, true);
});

test('reader snapshot preserves safe heading anchors and keeps valid fragments on the same page', () => {
  const note = baseNote({
    body: '<p><a href="#intro">有效目录</a> <a href="#missing">失效目录</a></p><h2 id="intro">Intro</h2><h2 id="sec-2">Reserved</h2><h3 id="intro">Duplicate</h3><h4 id="unsafe id">Generated</h4>'
  });
  const result = snapshot(note, note);
  const dom = new JSDOM(`<div>${result.bodyHtml}</div>`);
  try {
    assert.deepEqual(result.outline.map(section => section.id), ['intro', 'sec-2', 'sec-2-2', 'sec-3']);
    const [valid, invalid] = dom.window.document.querySelectorAll('a');
    assert.equal(valid.getAttribute('href'), '#intro');
    assert.equal(valid.hasAttribute('target'), false);
    assert.equal(invalid.hasAttribute('href'), false);
    assert.equal(invalid.hasAttribute('target'), false);
  } finally {
    dom.window.close();
  }
});

test('reader snapshot restores browser-resolved same-note fragment links in existing notes', () => {
  const note = baseNote({
    body: '<p><a href="http://localhost/?qidian=note&amp;note=note-1&amp;edit=1#intro">同笔记目录</a> <a href="http://localhost/?qidian=note&amp;note=note-2#intro">其他笔记</a> <a href="http://localhost/other?qidian=note&amp;note=note-1#intro">其他路径</a> <a href="https://example.com/article#intro">外站章节</a></p><h2 id="intro">Intro</h2>'
  });
  const result = snapshot(note, note);
  const dom = new JSDOM(`<div>${result.bodyHtml}</div>`);
  try {
    const [sameNote, otherNote, otherPath, external] = dom.window.document.querySelectorAll('a');
    assert.equal(sameNote.getAttribute('href'), '#intro');
    assert.equal(sameNote.hasAttribute('target'), false);
    assert.equal(sameNote.hasAttribute('rel'), false);
    assert.equal(otherNote.getAttribute('href'), 'http://localhost/?qidian=note&note=note-2#intro');
    assert.equal(otherPath.getAttribute('href'), 'http://localhost/other?qidian=note&note=note-1#intro');
    assert.equal(external.getAttribute('href'), 'https://example.com/article#intro');
  } finally {
    dom.window.close();
  }
});

test('reader snapshot starts body headings at h2 and preserves nested levels and anchor ids', () => {
  const note = baseNote({
    body: '<p><a href="#overview">跳到概览</a></p><h3 id="overview">概览</h3><h4 id="details">细节</h4><h3>下一节</h3>'
  });
  const result = snapshot(note, note);
  const dom = new JSDOM(`<div>${result.bodyHtml}</div>`);
  try {
    assert.deepEqual(result.outline.map(section => [section.name, section.level, section.id]), [
      ['概览', 2, 'overview'],
      ['细节', 3, 'details'],
      ['下一节', 2, 'sec-2']
    ]);
    const link = dom.window.document.querySelector('a');
    assert.equal(link?.getAttribute('href'), '#overview');
    assert.equal(dom.window.document.querySelector('#overview')?.tagName, 'H2');
    assert.equal(dom.window.document.querySelector('#details')?.tagName, 'H3');
  } finally {
    dom.window.close();
  }
});

test('reader snapshot exposes publish and continue-editing actions for an unpublished draft', () => {
  const note = baseNote({ status: 'draft' });
  const result = snapshot(note, note, { working: true, previewing: true });

  assert.equal(result.working, true);
  assert.equal(result.publishLabel, '发布笔记');
  assert.equal(result.editLabel, '继续编辑');
  assert.equal(result.showPendingChanges, false);
});

test('published reader snapshot shows pending changes without exposing publish action', () => {
  const stored = baseNote({ publishedSnapshot: { title: '旧标题' } });
  const published = baseNote({ title: '旧标题', body: '<p>已发布</p>' });
  const result = snapshot(stored, published);

  assert.equal(result.publishLabel, null);
  assert.equal(result.showPendingChanges, true);
  assert.equal(result.working, false);
});
