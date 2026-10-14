function safeHref(value, document) {
  try {
    const url = new URL(value, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function appendInline(parent, value, document) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_|\[[^\]]+\]\([^)\s]+\))/g;
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0], index = match.index;
    if (index > offset) parent.append(document.createTextNode(value.slice(offset, index)));
    let element = null, content = '';
    if (token.startsWith('`')) { element = document.createElement('code'); content = token.slice(1, -1); }
    else if (token.startsWith('**') || token.startsWith('__')) { element = document.createElement('strong'); content = token.slice(2, -2); }
    else if (token.startsWith('*') || token.startsWith('_')) { element = document.createElement('em'); content = token.slice(1, -1); }
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link && safeHref(link[2], document);
      if (link && href) {
        element = document.createElement('a'); element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; content = link[1];
      } else content = token;
    }
    if (element) { element.textContent = content; parent.append(element); }
    else parent.append(document.createTextNode(content));
    offset = index + token.length;
  }
  if (offset < value.length) parent.append(document.createTextNode(value.slice(offset)));
}

function normalizeOrderedItem(value, number) {
  let text = value;
  while (true) {
    const duplicate = /^(\d+)[.)]\s+(.+)$/.exec(text);
    if (!duplicate || Number(duplicate[1]) !== Number(number)) return text;
    text = duplicate[2];
  }
}

export function renderReleaseNotes(container, markdown) {
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let paragraph = [], list = null, listKind = '', codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const node = document.createElement('p');
    appendInline(node, paragraph.join(' '), document);
    fragment.append(node); paragraph = [];
  };
  const closeList = () => { list = null; listKind = ''; };
  for (const line of lines) {
    if (codeLines) {
      if (/^\s*```/.test(line)) {
        const pre = document.createElement('pre'), code = document.createElement('code');
        code.textContent = codeLines.join('\n'); pre.append(code); fragment.append(pre); codeLines = null;
      } else codeLines.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) { flushParagraph(); closeList(); codeLines = []; continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph(); closeList();
      const node = document.createElement(`h${heading[1].length}`);
      appendInline(node, heading[2], document); fragment.append(node); continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); closeList(); fragment.append(document.createElement('hr')); continue; }
    const item = /^\s*(?:([-+*])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const kind = item[2] ? 'ordered' : 'unordered';
      if (!list || listKind !== kind) {
        closeList(); list = document.createElement(kind === 'ordered' ? 'ol' : 'ul');
        listKind = kind; fragment.append(list);
      }
      const node = document.createElement('li');
      const text = kind === 'ordered' ? normalizeOrderedItem(item[3], item[2]) : item[3];
      appendInline(node, text, document); list.append(node); continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph(); closeList();
      const blockquote = document.createElement('blockquote'), node = document.createElement('p');
      appendInline(node, quote[1], document); blockquote.append(node); fragment.append(blockquote); continue;
    }
    closeList(); paragraph.push(line.trim());
  }
  if (codeLines) {
    const pre = document.createElement('pre'), code = document.createElement('code');
    code.textContent = codeLines.join('\n'); pre.append(code); fragment.append(pre);
  }
  flushParagraph();
  container.replaceChildren(fragment);
}
