import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createReaderSnapshot } from '../src/features/reader/snapshot.ts';

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
  const dom = new JSDOM('<!doctype html>');
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
