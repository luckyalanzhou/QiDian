export type HtmlContentDependencies = {
  document: Document;
  sanitize: (html: string) => unknown;
  parseHTML: (html: string) => Document;
  escapeHtml: (value: unknown) => string;
  looksLikeMarkdown: (value: string) => boolean;
};

export type StructuredTextOptions = {
  inferHeadings?: boolean;
  headingOffset?: number;
};

export type ReadableNoteBody = { html: string; markdown: boolean };

export function createHtmlContentTools({
  document,
  sanitize,
  parseHTML,
  escapeHtml,
  looksLikeMarkdown
}: HtmlContentDependencies) {
  function safeUrl(value: unknown, image = false): boolean {
    const source = String(value || '').trim();
    if (image) {
      return /^\/api\/assets\/[a-f0-9-]{36}$/i.test(source)
        || /^https?:\/\//i.test(source)
        || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(source);
    }
    return /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(source);
  }

  const allowed = new Set('p div span b strong i em u s strike del mark small sub sup h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code br hr a img figure figcaption table colgroup col thead tbody tfoot tr th td caption details summary section article main header footer aside nav dl dt dd kbd samp var abbr cite q'.split(' '));
  const headingSlug = (value: unknown, index: number) => String(value || '')
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128) || `section-${index}`;

  function cleanHTML(html: unknown, keepStyles = true): string {
    const input = parseHTML(String(sanitize(String(html))));
    const output = document.createElement('div');
    const discarded = new Set('script style iframe object embed form input button textarea select option svg math meta link base video audio canvas noscript template'.split(' '));
    const headingIds = new Set<string>();
    let nodeCount = 0;
    let headingIndex = 0;
    const dimension = (value: string) => /^(?:\d{1,4}px|\d{1,3}%)$/.test(String(value || '').trim());
    const safeHeadingId = (value: string) => /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]{0,127}$/u.test(value);

    function uniqueHeadingId(value: string): string {
      if (!safeHeadingId(value)) return '';
      let candidate = value;
      let suffix = 2;
      while (headingIds.has(candidate)) {
        const ending = `-${suffix++}`;
        candidate = `${value.slice(0, 128 - ending.length)}${ending}`;
      }
      headingIds.add(candidate);
      return candidate;
    }

    function copy(node: Node, parent: HTMLElement) {
      if (++nodeCount > 20000) throw new RangeError('粘贴内容节点过多，已停止格式转换');
      if (node.nodeType === 3) {
        parent.appendChild(document.createTextNode(node.textContent || ''));
        return;
      }
      if (node.nodeType !== 1) return;
      const source = node as HTMLElement;
      const tag = source.tagName.toLowerCase();
      if (discarded.has(tag)) return;
      const el = document.createElement(allowed.has(tag) ? tag : source.parentElement?.closest('p,div,section,article,main,header,footer,aside,nav,li,blockquote') ? 'span' : 'div');
      if (/^h[1-6]$/.test(tag)) {
        const sourceId = source.getAttribute('id') || '';
        const id = uniqueHeadingId(sourceId || `sec-${headingIndex}`);
        headingIndex++;
        if (id) el.id = id;
      }
      if (tag === 'a') {
        const href = source.getAttribute('href');
        if (safeUrl(href)) {
          el.setAttribute('href', href!);
          if (!href!.startsWith('#')) {
            el.setAttribute('rel', 'noopener noreferrer');
            el.setAttribute('target', '_blank');
          }
        }
      }
      if (tag === 'img') {
        const src = source.getAttribute('src');
        if (!safeUrl(src, true)) {
          const alt = (source.getAttribute('alt') || '').trim();
          if (alt) parent.appendChild(document.createTextNode(alt));
          return;
        }
        el.setAttribute('src', src!);
        el.setAttribute('alt', (source.getAttribute('alt') || '').slice(0, 200));
        el.setAttribute('loading', 'lazy');
        el.setAttribute('referrerpolicy', 'no-referrer');
        const rawWidth = source.style.width || source.getAttribute('width') || '';
        const width = /^\d{1,4}$/.test(rawWidth) ? `${rawWidth}px` : rawWidth;
        if (dimension(width)) {
          el.style.width = width;
          el.style.maxWidth = '100%';
        }
      }
      if (tag === 'details' && source.hasAttribute('open')) el.setAttribute('open', '');
      if (tag === 'ol') {
        const start = Number(source.getAttribute('start'));
        if (Number.isInteger(start) && start >= 1 && start <= 10000) el.setAttribute('start', String(start));
      }
      const dataType = source.getAttribute('data-type');
      if ((tag === 'div' && dataType === 'detailsContent') || (tag === 'ul' && dataType === 'taskList') || (tag === 'li' && dataType === 'taskItem')) el.setAttribute('data-type', dataType!);
      if (tag === 'li' && dataType === 'taskItem') el.setAttribute('data-checked', source.getAttribute('data-checked') === 'true' ? 'true' : 'false');
      if (keepStyles) {
        const names = tag === 'col' || tag === 'table'
          ? ['width', 'min-width']
          : ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'font-size', 'margin-left', 'vertical-align', 'width', 'min-width'];
        for (const key of names) {
          const value = source.style.getPropertyValue(key).trim();
          if (!value || value.length >= 70 || /url\s*\(|expression|@import|[<>]/i.test(value)) continue;
          if (['width', 'min-width'].includes(key) && !dimension(value)) continue;
          if (key === 'font-size' && !/^(\d{1,2}(px|pt)|[0-9.]{1,4}(em|rem)|\d{2,3}%)$/.test(value)) continue;
          el.style.setProperty(key, value);
        }
      }
      if (tag === 'td' || tag === 'th') {
        for (const key of ['colspan', 'rowspan']) {
          const value = Number(source.getAttribute(key));
          if (Number.isInteger(value) && value >= 1 && value <= 20) el.setAttribute(key, String(value));
        }
        const colwidth = source.getAttribute('data-colwidth');
        if (colwidth && /^\d{1,4}(?:,\d{1,4})*$/.test(colwidth) && colwidth.split(',').every(value => Number(value) > 0 && Number(value) <= 2000)) el.setAttribute('data-colwidth', colwidth);
      }
      if (tag === 'pre') el.className = 'pasted-code';
      if (tag === 'code') {
        const language = (source.className.match(/(?:^|\s)language-([\w.+-]{1,32})(?:\s|$)/) || [])[1];
        if (language) el.className = `language-${language}`;
      }
      if (tag === 'div' && source.classList.contains('callout')) {
        el.className = 'callout';
        if (source.classList.contains('warn')) el.classList.add('warn');
        if (source.classList.contains('good')) el.classList.add('good');
      }
      for (const child of source.childNodes) copy(child, el);
      parent.appendChild(el);
    }

    for (const child of input.body.childNodes) copy(child, output);
    const safeOutput = parseHTML(String(sanitize(output.innerHTML)));
    const fragmentAliases = new Map<string, string>();
    const fragmentSlugCounts = new Map<string, number>();
    safeOutput.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading, index) => {
      const slug = headingSlug(heading.textContent, index);
      const count = fragmentSlugCounts.get(slug) || 0;
      fragmentSlugCounts.set(slug, count + 1);
      const alias = count ? `${Array.from(slug).slice(0, 126).join('')}-${count}` : slug;
      if (!fragmentAliases.has(alias)) fragmentAliases.set(alias, heading.id);
      const legacyId = `sec-${index}`;
      if (!fragmentAliases.has(legacyId)) fragmentAliases.set(legacyId, heading.id);
    });
    safeOutput.querySelectorAll('a[href]').forEach(anchor => {
      const href = anchor.getAttribute('href');
      if (!safeUrl(href)) {
        anchor.removeAttribute('href');
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
        return;
      }
      if (href!.startsWith('#')) {
        let fragment = '';
        try {
          fragment = decodeURIComponent(href!.slice(1));
        } catch {
          fragment = '';
        }
        let target = fragment ? safeOutput.getElementById(fragment) : null;
        if (!/^h[1-6]$/.test(target?.tagName.toLowerCase() || '')) {
          const mappedId = fragmentAliases.get(fragment);
          target = mappedId ? safeOutput.getElementById(mappedId) : null;
          if (target) anchor.setAttribute('href', `#${mappedId}`);
        }
        if (!/^h[1-6]$/.test(target?.tagName.toLowerCase() || '')) anchor.removeAttribute('href');
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
        return;
      }
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    });
    return safeOutput.body.innerHTML;
  }

  function plainTextToStructuredHTML(value: unknown, { inferHeadings = true, headingOffset = 1 }: StructuredTextOptions = {}): string {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let i = 0;
    const isBlank = (line: string) => !String(line || '').trim();
    const inline = (raw: string) => {
      let text = escapeHtml(raw)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
      text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
        .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
      return text.replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^\s)]+)\)/g, (_match, label: string, url: string) => {
        if (!safeUrl(url)) return label;
        const external = !url.startsWith('#');
        return `<a href="${escapeHtml(url)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ''}>${label}</a>`;
      });
    };
    const heading = (line: string) => {
      const markdown = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (markdown) return { level: Math.min(markdown[1].length + headingOffset, 6), text: markdown[2] };
      const section = line.match(/^\s*(\d{1,2})\.\s+(.{1,36})\s*$/);
      if (section && !/[。！？；：]$/.test(section[2])) return { level: 2, text: section[2] };
      if (line.length <= 42 && !/[：:。！？；]/.test(line) && !/^\s*(?:[-+*•]|\d+[.)]|>)/.test(line) && !isShellCommand(line) && !/^https?:\/\//i.test(line)) return { level: 3, text: line.trim() };
      return null;
    };
    const isShellCommand = (line: string) => {
      const text = String(line || '').trim();
      if (!text || text.length > 2000 || /^https?:\/\//i.test(text)) return false;
      if (/^(?:\.\/|\.\.\/|\/(?:etc|usr|opt|root|bin|sbin|var)\/)/.test(text)) return true;
      if (/^(?:sudo|su|bash|sh|zsh|fish|curl|wget|chmod|chown|install|systemctl|service|sshd|ssh|nano|vi|vim|cat|less|tar|gzip|gunzip|docker|podman|kubectl|git|apt(?:-get)?|dnf|yum|apk|opkg|uci|make|npm|pnpm|node|python(?:3)?|pip(?:3)?|ip|ping|df|du|ls|cd|pwd|mkdir|rm|cp|mv|grep|find|sed|awk|mount|umount|reboot|poweroff|passwd|crontab|jq|openssl|dd|echo|printf)\b/i.test(text)) return true;
      return /^(?:#?[A-Za-z][A-Za-z0-9_.-]*\s+)(?:yes|no|prohibit-password|without-password|\/[A-Za-z0-9_./-]+|[0-9]+)$/i.test(text);
    };
    const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

    while (i < lines.length) {
      const line = lines[i];
      const trim = line.trim();
      if (isBlank(line)) { i++; continue; }
      const fence = trim.match(/^```([\w+-]*)\s*$/);
      if (fence) {
        const code: string[] = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        out.push(`<pre><code>${escapeHtml(code.join('\n').replace(/^\n+|\n+$/g, ''))}</code></pre>`);
        continue;
      }
      const alert = trim.match(/^>?\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alert) {
        const kind = alert[1].toUpperCase();
        const title = alert[2].trim();
        const body: string[] = [];
        i++;
        while (i < lines.length && !isBlank(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
        const cls = /^(WARNING|CAUTION)$/.test(kind) ? ' warn' : kind === 'TIP' ? ' good' : '';
        out.push(`<div class="callout${cls}">${title ? `<p><strong>${inline(title)}</strong></p>` : ''}${body.map(text => `<p>${inline(text)}</p>`).join('')}</div>`);
        continue;
      }
      if (/^(?:⸻+|[-*_](?:\s*[-*_]){2,})$/.test(trim)) { out.push('<hr>'); i++; continue; }
      const markdownCells = trim.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]);
      const tabCells = trim.includes('\t') && lines[i + 1]?.includes('\t');
      if (markdownCells || tabCells) {
        const rows: string[][] = [];
        if (markdownCells) {
          rows.push(cells(trim));
          i += 2;
          while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        } else {
          while (i < lines.length && lines[i].includes('\t')) rows.push(lines[i++].split('\t').map(cell => cell.trim()));
        }
        const width = Math.max(...rows.map(row => row.length));
        if (width >= 2) {
          const [header, ...body] = rows;
          out.push(`<table><tbody><tr>${Array.from({ length: width }, (_, j) => `<th>${inline(header[j] || '')}</th>`).join('')}</tr>${body.map(row => `<tr>${Array.from({ length: width }, (_, j) => `<td>${inline(row[j] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
          continue;
        }
      }
      const numberedHeading = heading(trim);
      if (inferHeadings && numberedHeading && /^\s*\d{1,2}\.\s+/.test(trim) && (!i || isBlank(lines[i - 1])) && (i + 1 >= lines.length || isBlank(lines[i + 1]))) {
        out.push(`<h${numberedHeading.level}>${inline(numberedHeading.text)}</h${numberedHeading.level}>`);
        i++;
        continue;
      }
      const markdownHeading = trim.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (markdownHeading) {
        const level = Math.min(trim.match(/^\s*(#+)/)![1].length + headingOffset, 6);
        out.push(`<h${level}>${inline(markdownHeading[1])}</h${level}>`);
        i++;
        continue;
      }
      if (isShellCommand(trim)) {
        const command = [trim];
        i++;
        while (i < lines.length && command.at(-1)!.endsWith('\\')) command.push(lines[i++]);
        out.push(`<pre><code>${escapeHtml(command.join('\n'))}</code></pre>`);
        continue;
      }
      if (/^>\s?/.test(trim)) {
        const quote: string[] = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, '').trim());
        out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
        continue;
      }
      const bullet = trim.match(/^([-+*•])\s+(.+)$/);
      const ordered = trim.match(/^(?:\d+[.)]|[①-⑳])\s+(.+)$/);
      if (bullet || ordered) {
        const list: string[] = [];
        const orderedList = Boolean(ordered);
        while (i < lines.length) {
          const match = lines[i].trim().match(orderedList ? /^(?:\d+[.)]|[①-⑳])\s+(.+)$/ : /^[-+*•]\s+(.+)$/);
          if (match) { list.push(`<li>${inline(match[1])}</li>`); i++; continue; }
          if (!inferHeadings && isBlank(lines[i])) {
            let next = i;
            while (next < lines.length && isBlank(lines[next])) next++;
            const nextMatch = lines[next]?.trim().match(orderedList ? /^(?:\d+[.)]|[①-⑳])\s+(.+)$/ : /^[-+*•]\s+(.+)$/);
            if (nextMatch) { i = next; continue; }
          }
          break;
        }
        out.push(`<${orderedList ? 'ol' : 'ul'}>${list.join('')}</${orderedList ? 'ol' : 'ul'}>`);
        continue;
      }
      const possibleHeading = heading(trim);
      if (inferHeadings && possibleHeading && lines.length > 1 && trim.length <= 42 && i + 1 < lines.length && isBlank(lines[i + 1]) && (!i || isBlank(lines[i - 1]))) {
        out.push(`<h${possibleHeading.level}>${inline(possibleHeading.text)}</h${possibleHeading.level}>`);
        i++;
        continue;
      }
      const paragraph = [trim];
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !/^\s*(?:#{1,6}\s|>\s?|[-+*•]\s|\d+[.)]\s)/.test(lines[i]) && !isShellCommand(lines[i]) && !lines[i].includes('\t') && !/^(?:⸻{2,}|[-*_](?:\s*[-*_]){2,})$/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  function textWithBlockBreaks(root: Node): string {
    const blocks = new Set('P DIV LI BLOCKQUOTE PRE H1 H2 H3 H4 H5 H6 TR'.split(' '));
    const visit = (node: Node): string => {
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return [...(node.childNodes || [])].map(visit).join('');
      const element = node as HTMLElement;
      const tag = element.tagName.toUpperCase();
      if (tag === 'BR') return '\n';
      const content = [...element.childNodes].map(visit).join('');
      if (tag === 'P') return `${content}\n`;
      return blocks.has(tag) ? `\n${content}\n` : content;
    };
    return visit(root).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function htmlToCompactText(html: unknown): string {
    const holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    holder.querySelectorAll('br').forEach(node => node.replaceWith(' '));
    holder.querySelectorAll('p,div,li,blockquote,pre,h1,h2,h3,h4,h5,h6,tr').forEach(node => node.append(' '));
    return (holder.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function readableNoteBody(body: unknown, title = ''): ReadableNoteBody {
    const safe = cleanHTML(body, true);
    const holder = document.createElement('div');
    holder.innerHTML = safe;
    const richContent = holder.querySelector('h1,h2,h3,h4,h5,h6,a[href],b,strong,i,em,u,s,del,mark,blockquote,pre,code,ul,ol,li,table,img,figure,details,hr,.callout');
    const markdown = textWithBlockBreaks(holder);
    if (richContent || !looksLikeMarkdown(markdown)) return { html: safe, markdown: false };
    const firstLine = markdown.split('\n').find(line => line.trim()) || '';
    const firstHeading = firstLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    const normalize = (value: unknown) => String(value || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const duplicateTitle = !!firstHeading && normalize(firstHeading[1]) === normalize(title);
    const parsed = document.createElement('div');
    parsed.innerHTML = plainTextToStructuredHTML(markdown, { inferHeadings: false, headingOffset: duplicateTitle ? 0 : 1 });
    parsed.innerHTML = cleanHTML(parsed.innerHTML, true);
    const firstContent = [...parsed.childNodes].find(node => node.nodeType === 1 || node.textContent?.trim());
    const duplicateHeading = firstContent?.nodeType === 1 && /^H[1-6]$/.test((firstContent as Element).tagName) ? firstContent as Element : null;
    if (duplicateTitle && duplicateHeading && normalize(duplicateHeading.textContent) === normalize(title)) duplicateHeading.remove();
    return { html: parsed.innerHTML, markdown: true };
  }

  function extractPastedTitle(html: unknown, plain: unknown): string {
    const normalize = (value: unknown) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^(?:[-+*•]|\d{1,2}[.)])\s+/, '').trim();
    if (html) {
      const heading = parseHTML(String(html)).querySelector('h1,h2,h3,h4,h5,h6');
      if (heading) { const title = normalize(heading.textContent); if (title) return title.slice(0, 100); }
    }
    const lines = String(plain || '').replace(/\r\n?/g, '\n').split('\n');
    const markdownHeading = lines.map(line => line.trim()).find(line => /^#{1,6}\s+\S/.test(line));
    if (markdownHeading) { const title = normalize(markdownHeading); if (title) return title.slice(0, 100); }
    const firstLine = lines.map(normalize).find(line => line && !/^标签\s*[:：]/.test(line) && !/^https?:\/\//i.test(line) && !/^[-*_]{3,}$/.test(line));
    if (firstLine) return firstLine.slice(0, 100);
    if (html) {
      const text = parseHTML(String(html)).body.textContent || '';
      const title = text.split(/\r?\n/).map(normalize).find(Boolean);
      if (title) return title.slice(0, 100);
    }
    return '';
  }

  return { safeUrl, cleanHTML, plainTextToStructuredHTML, textWithBlockBreaks, htmlToCompactText, readableNoteBody, extractPastedTitle };
}
