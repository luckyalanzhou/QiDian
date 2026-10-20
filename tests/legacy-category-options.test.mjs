import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLegacyCategoryOptions } from '../src/features/categories/legacy-option-markup.ts';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

test('legacy category options add the default once and select the current category', () => {
  assert.equal(
    renderLegacyCategoryOptions(['Docker', 'Linux', 'Docker'], 'Linux', escapeHtml),
    '<option value="未分类" >未分类</option><option value="Docker" >Docker</option><option value="Linux" selected>Linux</option>'
  );
});

test('legacy category options retain an existing category missing from the list', () => {
  assert.equal(
    renderLegacyCategoryOptions([], '已删除分类', escapeHtml),
    '<option value="未分类" >未分类</option><option value="已删除分类" selected>已删除分类</option>'
  );
});

test('legacy category options escape category text for both attributes and labels', () => {
  assert.equal(
    renderLegacyCategoryOptions(['<img src=x onerror=alert(1)>'], undefined, escapeHtml),
    '<option value="未分类" >未分类</option><option value="&lt;img src=x onerror=alert(1)&gt;" >&lt;img src=x onerror=alert(1)&gt;</option>'
  );
});
