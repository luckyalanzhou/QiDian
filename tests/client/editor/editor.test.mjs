import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createQidianEditor } from '../../../src/features/editor/editor.js';

test('rich editor keeps the established note HTML structures editable and serializable', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost',
  });
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'DOMParser', 'getComputedStyle']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: dom.window.requestAnimationFrame.bind(dom.window) });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: dom.window.cancelAnimationFrame.bind(dom.window) });

  const legacyHTML = '<h2>命令</h2><p><strong>加粗</strong> <span style="color: rgb(82, 97, 207); font-size: 18px; background-color: rgb(255, 245, 150)">颜色</span> ✅ <sub>下标</sub><sup>上标</sup></p>' +
    '<pre><code>docker ps\n和换行</code></pre><div class="callout warn">注意</div>' +
    '<details><summary>折叠项</summary><p>折叠正文</p></details>' +
    '<figure><img src="/api/assets/123e4567-e89b-12d3-a456-426614174000" alt="截图" style="width: 50%; max-width: 100%"><figcaption>图片说明</figcaption></figure>' +
    '<table><tbody><tr><th>名称</th><td colspan="2" style="background-color: rgb(255, 240, 200)">跨列</td></tr></tbody></table>' +
    '<p><a href="https://example.com/path">安全链接</a> <a href="javascript:alert(1)">危险链接</a></p>';
  let pastePayload;
  const editor = createQidianEditor({ element: dom.window.document.querySelector('#editor'), content: legacyHTML, handlePaste: payload => { pastePayload=payload; return true; } });
  const html = editor.getHTML();
  for (const expected of ['<h2>命令</h2>', '<strong>加粗</strong>', 'font-size: 18px', 'background-color: rgb(255, 245, 150)', 'sub', 'sup', 'docker ps', 'callout warn', '<details', '<summary>折叠项</summary>', '<figure>', 'width: 50%', '图片说明', 'colspan="2"', 'background-color', 'href="https://example.com/path"', '安全链接', '危险链接']) {
    assert.ok(html.includes(expected), `serialized HTML should preserve ${expected}\n${html}`);
  }
  assert.doesNotMatch(html, /javascript:/, 'unsafe link targets should be dropped');
  editor.commands.insertContent('<p>新增内容 🧭</p>');
  assert.match(editor.getHTML(), /新增内容 🧭/);
  const pasteEvent = { clipboardData:{}, preventDefault(){} };
  assert.equal(editor.options.editorProps.handlePaste(editor.view,pasteEvent),true);
  assert.equal(pastePayload.event,pasteEvent);
  assert.equal(pastePayload.editor,editor);
  let calloutPosition=-1;
  editor.state.doc.descendants((node,pos)=>{if(node.type.name==='callout')calloutPosition=pos});
  assert.notEqual(calloutPosition,-1);
  editor.commands.setTextSelection(calloutPosition+2);
  assert.equal(editor.isActive('callout'),true);
  assert.equal(editor.commands.deleteNode('callout'),true);
  assert.doesNotMatch(editor.getHTML(),/class="callout/);
  let linkPosition=-1;
  editor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='安全链接')linkPosition=pos});
  assert.notEqual(linkPosition,-1);
  editor.commands.setTextSelection({from:linkPosition,to:linkPosition+4});
  assert.equal(editor.isActive('link'),true);
  editor.chain().unsetMark('link').run();
  assert.match(editor.getHTML(),/安全链接/);
  assert.doesNotMatch(editor.getHTML(),/href="https:\/\/example.com\/path"/);
  editor.destroy();
  dom.window.close();
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) delete globalThis[key];
});
