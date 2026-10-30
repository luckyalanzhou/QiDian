import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageHelpContext } from '../../../src/features/help/usage-help-context.ts';

test('usage help gives concise instructions for the active workspace page', () => {
  assert.deepEqual(createUsageHelpContext('dashboard', false), {
    title:'首页', description:'查看最近笔记与常用书签，点击内容即可打开。'
  });
  assert.match(createUsageHelpContext('home', false).description, /类型、最近编辑、重要收藏或草稿/);
  assert.match(createUsageHelpContext('bookmarks', false).description, /搜索名称、网址或分组[\s\S]*“批量整理”一次移动或删除多条书签/);
  assert.match(createUsageHelpContext('trash', false).description, /清空回收站会永久删除/);
});

test('usage help distinguishes reading and editing a note', () => {
  assert.deepEqual(createUsageHelpContext('note', false), {
    title:'阅读笔记', description:'点击正文目录跳到章节；使用“继续编辑”修改当前笔记。'
  });
  const editing = createUsageHelpContext('note', true).description;
  assert.match(editing, /新笔记点击“发布笔记”/);
  assert.match(editing, /已有笔记点击“保存笔记”/);
  assert.match(editing, /仅在栖点内切换页面时/);
  assert.match(editing, /“保存并离开”或“取消”继续编辑/);
});
