const MARKDOWN_PATTERNS = [
  /^ {0,3}(```|~~~)/m,
  /^ {0,3}#{1,6}\s+\S/m,
  /^ {0,3}>\s?/m,
  /^ {0,3}[-+*]\s+\S/m,
  /^ {0,3}\d+[.)]\s+\S/m,
  /^ {0,3}(?:[-*_]\s*){3,}$/m,
  /^ {0,3}:::(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\b/im,
  /^ {0,3}>?\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im,
  /^\s*\|?.+\|.+\|?\s*\n\s*\|?\s*:?-{3,}.*\|/m,
  /\*\*[^\n*]+\*\*/,
  /(?<!\*)\*[^\n*]+\*(?!\*)/,
  /~~[^\n~]+~~/,
  /`[^`\n]+`/,
  /!?\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)/i,
];

export function looksLikeMarkdown(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return false;
  return MARKDOWN_PATTERNS.some(pattern => pattern.test(text));
}

const RICH_HTML_SELECTOR = [
  'a[href]', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'img',
  'figure', 'figcaption', 'table', 'details', 'summary', 'kbd', 'samp', 'var', 'abbr', 'cite', 'q',
  '.callout',
].join(',');
const RICH_STYLE_PROPERTIES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'font-size', 'vertical-align'];
const RICH_HTML_FALLBACK = /<(?:a\b[^>]*href|b|strong|i|em|u|s|strike|del|mark|small|sub|sup|h[1-6]|ul|ol|li|blockquote|pre|code|hr|img|figure|figcaption|table|details|summary|kbd|samp|var|abbr|cite|q)\b|class\s*=\s*["'][^"']*\bcallout\b|style\s*=\s*["'][^"']*(?:color|background-color|font-weight|font-style|text-decoration|text-align|font-size|vertical-align)\s*:/i;

function hasRichClipboardFormatting(html) {
  const source = String(html || '');
  const Parser = globalThis.DOMParser;
  if (typeof Parser !== 'function') return RICH_HTML_FALLBACK.test(source);
  try {
    const parsed = new Parser().parseFromString(source, 'text/html');
    if (parsed.body.querySelector(RICH_HTML_SELECTOR)) return true;
    return [...parsed.body.querySelectorAll('[style]')].some(element =>
      RICH_STYLE_PROPERTIES.some(property => element.style.getPropertyValue(property).trim()),
    );
  } catch {
    return RICH_HTML_FALLBACK.test(source);
  }
}

export function classifyClipboard({ html = '', text = '', mode = 'rich' } = {}) {
  const hasHtml = Boolean(String(html).trim());
  const hasText = Boolean(String(text).length);
  if (mode === 'plain') return hasText || hasHtml ? 'plain' : 'empty';
  if (mode === 'markdown') return hasText || hasHtml ? 'markdown' : 'empty';
  if (mode === 'legacy') return hasHtml ? 'html' : hasText ? 'legacy' : 'empty';
  if (hasHtml) return hasText && looksLikeMarkdown(text) && !hasRichClipboardFormatting(html) ? 'markdown' : 'html';
  if (!hasText) return 'empty';
  return looksLikeMarkdown(text) ? 'markdown' : 'plain';
}

export function plainTextToDocument(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n');
  if (!text) return { type: 'doc', content: [{ type: 'paragraph' }] };
  const content = [];
  text.split('\n').forEach((line, index) => {
    if (index) content.push({ type: 'hardBreak' });
    if (line) content.push({ type: 'text', text: line });
  });
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function validDimension(value) {
  return /^(?:25|50|75|100)%$|^\d{1,4}px$/.test(String(value || ''));
}

function safeColor(value) {
  const color = String(value || '').trim();
  if (/^#[\da-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([\d.% ,+-]+\)$/i.test(color)) return color;
  if (/^[a-z]{3,20}$/i.test(color) && !['transparent', 'currentcolor', 'inherit'].includes(color.toLowerCase())) return color;
  return null;
}

function safeStyle(value, allowed = ['background-color', 'color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'font-size', 'margin-left', 'vertical-align']) {
  return String(value || '').split(';').flatMap(declaration => {
    const colon = declaration.indexOf(':');
    if (colon < 1) return [];
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const candidate = declaration.slice(colon + 1).trim();
    if (!allowed.includes(property) || !candidate || candidate.length > 40 || /url\s*\(|expression|@import|[<>]/i.test(candidate)) return [];
    let normalized = null;
    if (property === 'color' || property === 'background-color') normalized = safeColor(candidate);
    else if (property === 'font-weight' && /^(?:normal|bold|[1-9]00)$/i.test(candidate)) normalized = candidate;
    else if (property === 'font-style' && /^(?:normal|italic|oblique)$/i.test(candidate)) normalized = candidate;
    else if (property === 'text-decoration' && /^(?:none|underline|line-through|overline)$/i.test(candidate)) normalized = candidate;
    else if (property === 'text-align' && /^(?:left|center|right|justify)$/i.test(candidate)) normalized = candidate;
    else if (property === 'font-size' && /^(?:\d{1,2}(?:px|pt)|(?:\d|\.){1,4}(?:em|rem)|\d{2,3}%)$/i.test(candidate)) normalized = candidate;
    else if (property === 'margin-left' && /^(?:\d{1,3}(?:px|em|rem|%))$/i.test(candidate)) normalized = candidate;
    else if (property === 'vertical-align' && /^(?:baseline|sub|super|top|middle|bottom|text-top|text-bottom|\d{1,3}(?:px|em|rem|%))$/i.test(candidate)) normalized = candidate;
    return normalized ? [`${property}: ${normalized}`] : [];
  }).join('; ');
}

export function sanitizeMarkdownDocument(document, schema, safeUrl) {
  if (!document || document.type !== 'doc' || !Array.isArray(document.content)) {
    throw new TypeError('Markdown parser returned an invalid document');
  }

  let nodeCount = 0;
  const sanitizeNode = (node, depth = 0) => {
    if (++nodeCount > 50000 || depth > 100) throw new RangeError('Markdown 节点过多或嵌套过深');
    if (!node || typeof node !== 'object' || typeof node.type !== 'string' || !schema.nodes[node.type]) {
      throw new TypeError('Markdown contains a node unsupported by this editor');
    }
    if (node.type === 'text') {
      if (typeof node.text !== 'string') throw new TypeError('Markdown parser returned invalid text');
      const marks = (node.marks || []).flatMap(mark => {
        if (!mark || typeof mark.type !== 'string' || !schema.marks[mark.type]) {
          throw new TypeError('Markdown contains a mark unsupported by this editor');
        }
        const attrs = {};
        if (mark.type === 'link') {
          if (!safeUrl(mark.attrs?.href)) return [];
          attrs.href = String(mark.attrs.href).trim().slice(0, 2048);
        } else if (mark.type === 'textStyle') {
          const color = safeColor(mark.attrs?.color);
          const backgroundColor = safeColor(mark.attrs?.backgroundColor);
          const fontSize = String(mark.attrs?.fontSize || '');
          if (color) attrs.color = color;
          if (backgroundColor) attrs.backgroundColor = backgroundColor;
          if (/^(?:\d{1,2}(?:px|pt)|(?:\d|\.){1,4}(?:em|rem)|\d{2,3}%)$/.test(fontSize)) attrs.fontSize = fontSize;
        } else if (mark.type === 'highlight' && mark.attrs?.color) {
          const color = safeColor(mark.attrs.color);
          if (color) attrs.color = color;
        }
        return [{ type: mark.type, ...(Object.keys(attrs).length ? { attrs } : {}) }];
      });
      return [{ type: 'text', text: node.text, ...(marks.length ? { marks } : {}) }];
    }

    const sourceAttrs = node.attrs || {};
    const attrs = {};
    if (node.type === 'image') {
      if (!safeUrl(sourceAttrs.src, true)) {
        const fallback = String(sourceAttrs.alt || '').trim() || '[已移除不安全图片地址]';
        return [{ type: 'text', text: fallback }];
      }
      attrs.src = String(sourceAttrs.src).trim();
      attrs.alt = String(sourceAttrs.alt || '').slice(0, 200);
      attrs.title = sourceAttrs.title == null ? null : String(sourceAttrs.title).slice(0, 200);
      if (sourceAttrs.width && validDimension(sourceAttrs.width)) attrs.width = sourceAttrs.width;
    }
    if (node.type === 'codeBlock') {
      attrs.language = /^[\w.+-]{1,32}$/.test(String(sourceAttrs.language || '')) ? sourceAttrs.language : null;
    }
    if (node.type === 'callout') {
      attrs.class = ['callout', 'callout warn', 'callout good'].includes(sourceAttrs.class) ? sourceAttrs.class : 'callout';
    }
    if (node.type === 'details') attrs.open = sourceAttrs.open === true;
    if (node.type === 'legacyContainer') {
      attrs.tag = ['div', 'section', 'article'].includes(sourceAttrs.tag) ? sourceAttrs.tag : 'div';
      attrs.style = safeStyle(sourceAttrs.style) || null;
    }
    if (node.type === 'heading') {
      attrs.level = Number.isInteger(sourceAttrs.level) && sourceAttrs.level >= 1 && sourceAttrs.level <= 6 ? sourceAttrs.level : 2;
      if (['left', 'center', 'right', 'justify'].includes(sourceAttrs.textAlign)) attrs.textAlign = sourceAttrs.textAlign;
      if (/^\d{1,3}(?:px|em|rem|%)$/.test(String(sourceAttrs.indent || ''))) attrs.indent = sourceAttrs.indent;
    }
    if (node.type === 'paragraph' || node.type === 'blockquote') {
      if (node.type === 'paragraph' && ['left', 'center', 'right', 'justify'].includes(sourceAttrs.textAlign)) attrs.textAlign = sourceAttrs.textAlign;
      if (/^\d{1,3}(?:px|em|rem|%)$/.test(String(sourceAttrs.indent || ''))) attrs.indent = sourceAttrs.indent;
    }
    if (node.type === 'orderedList') {
      attrs.start = Number.isInteger(sourceAttrs.start) && sourceAttrs.start >= 1 && sourceAttrs.start <= 10000 ? sourceAttrs.start : null;
    }
    if (node.type === 'taskItem') attrs.checked = sourceAttrs.checked === true;
    if (node.type === 'tableCell' || node.type === 'tableHeader') {
      attrs.colspan = Number.isInteger(sourceAttrs.colspan) && sourceAttrs.colspan >= 1 && sourceAttrs.colspan <= 20 ? sourceAttrs.colspan : 1;
      attrs.rowspan = Number.isInteger(sourceAttrs.rowspan) && sourceAttrs.rowspan >= 1 && sourceAttrs.rowspan <= 20 ? sourceAttrs.rowspan : 1;
      attrs.colwidth = Array.isArray(sourceAttrs.colwidth) ? sourceAttrs.colwidth.map(width => Number.isInteger(width) && width > 0 && width <= 2000 ? width : null) : null;
      attrs.align = ['left', 'center', 'right'].includes(sourceAttrs.align) ? sourceAttrs.align : null;
      attrs.style = safeStyle(sourceAttrs.style, ['background-color', 'color', 'text-align']) || null;
    }

    const content = (node.content || []).flatMap(child => sanitizeNode(child, depth + 1));
    return [{ type: node.type, ...(Object.keys(attrs).length ? { attrs } : {}), ...(content.length ? { content } : {}) }];
  };

  const normalized = [];
  let inline = [];
  const flushInline = () => {
    if (!inline.length) return;
    normalized.push({ type: 'paragraph', content: inline });
    inline = [];
  };
  for (const source of document.content) {
    const nodes = sanitizeNode(source);
    for (const node of nodes) {
      if (schema.nodes[node.type]?.isInline) inline.push(node);
      else { flushInline(); normalized.push(node); }
    }
  }
  flushInline();

  const result = { type: 'doc', content: normalized.length ? normalized : [{ type: 'paragraph' }] };
  const checked = schema.nodeFromJSON(result);
  checked.check();
  return checked.toJSON();
}
