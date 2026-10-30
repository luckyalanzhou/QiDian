import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createHtmlContentTools } from '../../../src/features/content/html-content.ts';

function createTools() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const purifier = createDOMPurify(dom.window);
  const tools = createHtmlContentTools({
    document: dom.window.document,
    sanitize: html => purifier.sanitize(html),
    parseHTML: html => new dom.window.DOMParser().parseFromString(html, 'text/html'),
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]),
    looksLikeMarkdown: value => /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```|\|)/m.test(value)
  });
  return { dom, tools };
}

test('safe URL rules distinguish web links from executable URLs and safe image sources', () => {
  const { dom, tools } = createTools();
  try {
    assert.equal(tools.safeUrl('https://example.com/path'), true);
    assert.equal(tools.safeUrl('mailto:help@example.com'), true);
    assert.equal(tools.safeUrl('javascript:alert(1)'), false);
    assert.equal(tools.safeUrl('//example.com'), false);
    assert.equal(tools.safeUrl('/api/assets/00000000-0000-4000-8000-000000000001', true), true);
    assert.equal(tools.safeUrl('data:image/png;base64,AAAA', true), true);
    assert.equal(tools.safeUrl('data:text/html;base64,AAAA', true), false);
  } finally {
    dom.window.close();
  }
});

test('HTML cleaning removes executable content while preserving supported structure and safe dimensions', () => {
  const { dom, tools } = createTools();
  try {
    const cleaned = tools.cleanHTML('<script>bad()</script><p onclick="bad()">safe <a href="javascript:bad()">link</a></p><img src="javascript:bad()" alt="image label"><table><tr><td rowspan="2" colspan="3" style="width: 80px">cell</td></tr></table>');
    assert.doesNotMatch(cleaned, /script|onclick|javascript:/i);
    assert.match(cleaned, /safe/);
    assert.match(cleaned, /link/);
    assert.match(cleaned, /image label/);
    assert.match(cleaned, /rowspan="2"/);
    assert.match(cleaned, /colspan="3"/);
    assert.match(cleaned, /width: 80px/);
  } finally {
    dom.window.close();
  }
});

test('HTML cleaning preserves unique safe heading anchors and disables broken fragment links', () => {
  const { dom, tools } = createTools();
  try {
    const cleaned = tools.cleanHTML('<p><a href="#章节-安装">有效目录</a> <a href="#missing">失效目录</a></p><h2 id="章节-安装">安装</h2><h3 id="章节-安装">第二章</h3><h4 id="unsafe id">无效标识</h4>');
    const rendered = dom.window.document.createElement('div');
    rendered.innerHTML = cleaned;

    assert.deepEqual([...rendered.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(heading => heading.id), [
      '章节-安装', '章节-安装-2', ''
    ]);
    const [valid, invalid] = rendered.querySelectorAll('a');
    assert.equal(valid.getAttribute('href'), '#章节-安装');
    assert.equal(valid.hasAttribute('target'), false);
    assert.equal(invalid.hasAttribute('href'), false);
    assert.equal(invalid.hasAttribute('target'), false);
  } finally {
    dom.window.close();
  }
});

test('HTML cleaning derives a stable fragment for headings without an explicit id', () => {
  const { dom, tools } = createTools();
  try {
    const cleaned = tools.cleanHTML('<p><a href="#getting-started">开始</a> <a href="#sec-0">旧目录</a></p><h2>Getting Started</h2>');
    const rendered = dom.window.document.createElement('div');
    rendered.innerHTML = cleaned;

    assert.equal(rendered.querySelector('h2')?.id, 'sec-0');
    assert.deepEqual([...rendered.querySelectorAll('a')].map(link => link.getAttribute('href')), ['#sec-0', '#sec-0']);
    assert.ok([...rendered.querySelectorAll('a')].every(link => !link.hasAttribute('target')));
  } finally {
    dom.window.close();
  }
});

test('plain text conversion preserves headings, tables, lists and commands with escaped text', () => {
  const { dom, tools } = createTools();
  try {
    const html = tools.plainTextToStructuredHTML('## 标题\n\n- **重点**\n\n| 名称 | 值 |\n| --- | --- |\n| 路由 | <危险> |\n\nsudo reboot');
    assert.match(html, /<h3>标题<\/h3>/);
    assert.match(html, /<ul><li><strong>重点<\/strong><\/li><\/ul>/);
    assert.match(html, /<table>/);
    assert.match(html, /&lt;危险&gt;/);
    assert.match(html, /<pre><code>sudo reboot<\/code><\/pre>/);
  } finally {
    dom.window.close();
  }
});

test('readable note conversion avoids duplicate titles and pasted title extraction follows content headings', () => {
  const { dom, tools } = createTools();
  try {
    const body = tools.readableNoteBody('<p>## 栖点使用说明\n\n正文内容</p>', '栖点使用说明');
    assert.equal(body.markdown, true);
    assert.doesNotMatch(body.html, /栖点使用说明/);
    assert.match(body.html, /正文内容/);
    assert.equal(tools.readableNoteBody('<p>普通段落</p>', '标题').markdown, false);
    assert.equal(tools.extractPastedTitle('<h2>HTML 标题</h2><p>正文</p>', '其它内容'), 'HTML 标题');
    assert.equal(tools.extractPastedTitle('', 'https://example.com\n标签：Linux\n# Markdown 标题\n正文'), 'Markdown 标题');
  } finally {
    dom.window.close();
  }
});

test('readable Markdown links become safe clickable links in saved note content', () => {
  const { dom, tools } = createTools();
  try {
    const source = '<p>## 参考<br><br>- [Matt Pocock Skills 项目](https://github.com/mattpocock/skills)<br><br>- [OpenAI Codex 技能说明](https://developers.openai.com/codex/skills/)</p>';
    const rendered = tools.readableNoteBody(source, '参考');
    const preview = dom.window.document.createElement('div');
    preview.innerHTML = rendered.html;
    const links = [...preview.querySelectorAll('a')];
    assert.deepEqual(links.map(link => [link.textContent, link.href, link.target]), [
      ['Matt Pocock Skills 项目', 'https://github.com/mattpocock/skills', '_blank'],
      ['OpenAI Codex 技能说明', 'https://developers.openai.com/codex/skills/', '_blank']
    ]);
    assert.ok(links.every(link => /noopener noreferrer/.test(link.rel)));
    assert.doesNotMatch(rendered.html, /javascript:/i);
  } finally {
    dom.window.close();
  }
});

test('readable Markdown table-of-contents links point to generated heading slugs', () => {
  const { dom, tools } = createTools();
  try {
    const rendered = tools.readableNoteBody('<p>[安装](#安装)<br><br>## 安装</p>', '目录');
    const preview = dom.window.document.createElement('div');
    preview.innerHTML = rendered.html;
    const link = preview.querySelector('a');
    const heading = preview.querySelector('h1,h2,h3,h4,h5,h6');

    assert.equal(link?.getAttribute('href'), '#sec-0');
    assert.equal(link?.hasAttribute('target'), false);
    assert.equal(heading?.id, 'sec-0');

    const insertedHtml = tools.cleanHTML(tools.plainTextToStructuredHTML('[安装](#安装)\n\n## 安装'), false);
    const inserted = dom.window.document.createElement('div');
    inserted.innerHTML = insertedHtml;
    assert.equal(inserted.querySelector('a')?.getAttribute('href'), '#sec-0');
    assert.equal(inserted.querySelector('h1,h2,h3,h4,h5,h6')?.id, 'sec-0');
  } finally {
    dom.window.close();
  }
});

test('compact HTML text keeps word boundaries between blocks and line breaks', () => {
  const { dom, tools } = createTools();
  try {
    assert.equal(tools.htmlToCompactText('<p>第一段</p><p>第二段<br>续行</p><ul><li>条目</li></ul>'), '第一段 第二段 续行 条目');
    assert.equal(tools.htmlToCompactText('  普通&nbsp;文本  '), '普通 文本');
    assert.equal(tools.htmlToCompactText(''), '');
  } finally {
    dom.window.close();
  }
});
