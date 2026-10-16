import { bookmarkURL } from '../server/bookmarks.js';
import { validateVault } from '../server/validation.js';
import { bookmarkId, parseBookmarks, mergeBookmarks, bookmarksHTML } from './bookmark-data.js';
import { createTrashEntry } from './trash-data.js';

export function createBookmarkView({ main, getData, save, download, notify }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span class="ico"><svg aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
  const closed = new Set(), selected = new Set(); let query = '', busy = false, organizing = false, selectedFolder = '', pinnedOnly = false, scrollPosition = 0, directoryOpen = true;
  function syncPreferences() {
    closed.clear(); for (const [id, open] of Object.entries(getData().bookmarkFolderStates || {})) if(!open)closed.add(id);
    directoryOpen = typeof getData().bookmarkDirectoryOpen === 'boolean' ? getData().bookmarkDirectoryOpen : !window.matchMedia?.('(max-width: 720px)').matches;
  }
  function savePreferences(folderId = '') {
    getData().bookmarkDirectoryOpen = directoryOpen;
    if(folderId)getData().bookmarkFolderStates={...(getData().bookmarkFolderStates||{}),[folderId]:!closed.has(folderId)};
    save();
  }
  syncPreferences();
  const overlay = document.createElement('div'); overlay.className = 'overlay'; overlay.id = 'bookmarkOverlay'; document.body.append(overlay);
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.html,.htm'; file.hidden = true; document.body.append(file);
  const tree = () => getData().bookmarks || [];
  function locate(id, entries = tree(), parent = null) {
    for (const item of entries) {
      if (item.id === id) return { item, entries, parent };
      if (item.kind === 'folder') { const found = locate(id, item.children, item); if (found) return found; }
    }
  }
  function paths(entries = tree(), prefix = '', excluded = '', result = []) {
    for (const item of entries) if (item.kind === 'folder' && item.id !== excluded) {
      const path = prefix ? prefix + ' / ' + item.title : item.title;
      result.push({ id: item.id, path }); paths(item.children, path, excluded, result);
    }
    return result;
  }
  function parentOptions(selected = '', excluded = '') { return `<option value="">书签根目录</option>` + paths(tree(), '', excluded).map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.path)}</option>`).join(''); }
  function dialog(title, body, action, label = '保存') {
    overlay.innerHTML = `<section class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkDialogTitle"><div class="dialog-head"><h2 id="bookmarkDialogTitle">${esc(title)}</h2><button class="round-btn" data-bm-close aria-label="关闭">${icon('close')}</button></div><form id="bookmarkForm"><div class="dialog-body">${body}<p id="bookmarkMessage" class="hint" role="status"></p></div><div class="dialog-foot"><button type="button" class="secondary-btn" data-bm-close>取消</button><button class="primary-btn" type="submit">${esc(label)}</button></div></form></section>`;
    overlay.classList.add('open');
    overlay.querySelector('input, select, [type=submit]')?.focus();
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const button = overlay.querySelector('[type=submit]'); button.disabled = true; busy = true;
      try { await action(); overlay.classList.remove('open'); render(); }
      catch (error) { overlay.querySelector('#bookmarkMessage').textContent = error.message; }
      finally { busy = false; button.disabled = false; }
    };
  }
  async function apply(items, trash = getData().trash || []) {
    const candidate = validateVault({ ...getData(), bookmarks: items, trash });
    const previousBookmarks=getData().bookmarks,previousTrash=getData().trash;
    getData().bookmarks = candidate.bookmarks; getData().trash = candidate.trash;
    try{return await save()}catch(error){getData().bookmarks=previousBookmarks;getData().trash=previousTrash;throw error}
  }
  function editItem(kind, id = '', parent = '') {
    const found = id ? locate(id) : null, item = found?.item;
    dialog(item ? (kind === 'folder' ? '编辑分组' : '编辑书签') : (kind === 'folder' ? '新建分组' : '添加书签'),
      `<label class="form-label" for="bmName">名称</label><input id="bmName" class="form-text" maxlength="500" required value="${esc(item?.title)}">${kind === 'link' ? `<label class="form-label" for="bmURL">网址</label><input id="bmURL" class="form-text" type="url" maxlength="2048" required placeholder="https://…" value="${esc(item?.url)}">` : ''}<label class="form-label" for="bmParent">分组</label><select id="bmParent" class="form-text">${parentOptions(found?.parent?.id || parent, id)}</select>`, () => {
        const title = overlay.querySelector('#bmName').value.trim(); if (!title) throw Error('请输入名称');
        const targetId = overlay.querySelector('#bmParent').value, items = structuredClone(tree());
        const existing = id ? locate(id, items) : null;
        if (id && !existing) throw Error('内容已变更，请重新打开');
        const next = { ...(existing?.item || { id: bookmarkId(), kind, ...(kind === 'folder' ? { children: [] } : {}) }), title };
        if (kind === 'link') next.url = bookmarkURL(overlay.querySelector('#bmURL').value);
        const destination = targetId ? locate(targetId, items)?.item.children : items;
        if (!destination) throw Error('目标分组已变更');
        if (existing && destination === existing.entries) existing.entries[existing.entries.indexOf(existing.item)] = next;
        else { if (existing) existing.entries.splice(existing.entries.indexOf(existing.item), 1); destination.push(next); }
        return apply(items);
      });
  }
  function removeItem(id) {
    const found = locate(id); if (!found) return;
    const nonempty = found.item.kind === 'folder' && found.item.children.length;
    dialog('移入回收站', `<p>将「${esc(found.item.title)}」移入回收站，可在 30 天内还原。</p>${nonempty ? '<label class="form-label" for="bmDeleteMode">分组内容</label><select id="bmDeleteMode" class="form-text"><option value="keep">保留内容，移到上一级</option><option value="delete">连同所有子分组和书签一起移入</option></select>' : ''}`, () => {
      const items = structuredClone(tree()), current = locate(id, items); if (!current) throw Error('内容已变更');
      const keep = overlay.querySelector('#bmDeleteMode')?.value === 'keep';
      const index = current.entries.indexOf(current.item), location = { parentId: current.parent?.id || '', index,
        previousId: current.entries[index - 1]?.id || '', nextId: current.entries[index + 1]?.id || '' };
      const releasedChildren = keep && current.item.kind === 'folder' ? current.item.children.map(child => child.id) : null;
      const trashedItem = releasedChildren ? { ...current.item, children: [] } : current.item;
      const trash = [...(getData().trash || []), createTrashEntry('bookmark', trashedItem, location,
        releasedChildren ? { releasedChildren } : {})];
      current.entries.splice(index, 1, ...(keep ? current.item.children : [])); return apply(items, trash);
    }, '移入回收站');
  }
  function clearAll() {
    if (!tree().length) return;
    const snapshot = JSON.stringify(getData());
    const removed = structuredClone(tree()), deletedAt = Date.now();
    dialog('将全部书签移入回收站', `<p>将 ${linkCount(removed)} 个网址和 ${paths(removed).length} 个分组移入回收站。笔记不会删除。</p><p class="hint">这些内容可在 30 天内分别还原。</p>`, () => {
      if (JSON.stringify(getData()) !== snapshot) throw Error('内容已变更，请关闭窗口后重新确认');
      const trash = [...(getData().trash || [])];
      removed.forEach((item, index) => trash.push(createTrashEntry('bookmark', item, {
        parentId: '', index, previousId: removed[index - 1]?.id || '', nextId: removed[index + 1]?.id || ''
      }, {}, deletedAt)));
      const previousFolderStates=getData().bookmarkFolderStates;
      closed.clear(); getData().bookmarkFolderStates = {}; selectedFolder = ''; query = '';
      return apply([], trash).catch(error=>{getData().bookmarkFolderStates=previousFolderStates;throw error});
    }, '移入回收站');
    overlay.querySelector('[type=submit]').classList.add('danger-btn');
  }
  function visibleLinks() {
    const all = collections();
    const groups = selectedFolder ? collections(locate(selectedFolder)?.item.children || [], paths().find(x => x.id === selectedFolder)?.path || '') : all;
    return groups.flatMap(group => group.links.filter(item => (!pinnedOnly || item.pinned) && (!query || [item.title,item.url,group.path].join(' ').toLocaleLowerCase().includes(query))));
  }
  function selectionBar() {
    if (!organizing) return '';
    const ids = new Set(visibleLinks().map(item => item.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    const all = ids.size > 0 && selected.size === ids.size;
    return `<div class="bookmark-selection-bar"><label><input type="checkbox" data-bm-select-all ${all ? 'checked' : ''} ${ids.size ? '' : 'disabled'}> 全选${query ? '搜索结果' : selectedFolder ? '当前分组（含子分组）' : pinnedOnly ? '常用书签' : '全部网址'}</label><span role="status">已选 ${selected.size} / ${ids.size} 项</span><div><button class="secondary-btn" data-bm-move-selected ${selected.size ? '' : 'disabled'}>移动</button><button class="secondary-btn danger-btn" data-bm-delete-selected ${selected.size ? '' : 'disabled'}>删除所选</button></div></div>`;
  }
  function updateResults() {
    main.querySelector('#bookmarkSelection').innerHTML = selectionBar();
    const all = main.querySelector('[data-bm-select-all]');
    if (all) all.indeterminate = selected.size > 0 && selected.size < new Set(visibleLinks().map(item=>item.id)).size;
    main.querySelector('#bookmarkTree').innerHTML = content();
  }
  function bulkAction(deleting) {
    const ids = visibleLinks().filter(item=>selected.has(item.id)).map(item=>item.id); if (!ids.length) return;
    const snapshot = JSON.stringify(getData());
    const original = structuredClone(tree());
    const positions = new Map(ids.map(id => {
      const found = locate(id, original), index = found?.entries.indexOf(found.item) ?? -1;
      return [id, found ? { parentId: found.parent?.id || '', index,
        previousId: found.entries[index - 1]?.id || '', nextId: found.entries[index + 1]?.id || '' } : null];
    }));
    dialog(deleting ? '将所选书签移入回收站' : '移动所选书签', deleting ? `<p>将选中的 ${ids.length} 个网址移入回收站，保留所有分组及未选书签。</p><p class="hint">可在 30 天内还原。</p>` : `<p>移动选中的 ${ids.length} 个网址。</p><label class="form-label" for="bmBulkParent">目标分组</label><select class="form-text" id="bmBulkParent">${parentOptions()}</select>`, async () => {
      if (JSON.stringify(getData()) !== snapshot) throw Error('内容已变更，请重新确认');
      const items = structuredClone(tree()), moving = [], trash = [...(getData().trash || [])], deletedAt = Date.now();
      for (const id of ids) {
        const found = locate(id, items);
        if (!found || found.item.kind !== 'link') throw Error('所选书签已变更');
        const location = positions.get(id); if (!location) throw Error('所选书签位置已变更');
        moving.push(found.item);
        if (deleting) trash.push(createTrashEntry('bookmark', found.item, location, {}, deletedAt));
        found.entries.splice(found.entries.indexOf(found.item), 1);
      }
      if (!deleting) {
        const target = overlay.querySelector('#bmBulkParent').value;
        const destination = target ? locate(target, items)?.item : null;
        if (target && destination?.kind !== 'folder') throw Error('目标分组已变更');
        (destination ? destination.children : items).push(...moving);
      }
      selected.clear(); return apply(items, trash);
    }, deleting ? '移入回收站' : '移动');
    if (deleting) overlay.querySelector('[type=submit]').classList.add('danger-btn');
  }
  function actions(item, entries) {
    const siblings=entries.filter(sibling=>sibling.kind===item.kind);
    return `<details class="item-menu"><summary aria-label="更多：${esc(item.title)}">···</summary><div class="item-menu-panel">${item.kind==='folder'?`<button data-bm-child="${esc(item.id)}">添加子分组</button><button data-bm-add="${esc(item.id)}">添加书签</button>`:`<button data-bm-pin="${esc(item.id)}" aria-pressed="${!!item.pinned}">${item.pinned?'取消常用':'设为常用'}</button>`}<button data-bm-edit="${esc(item.id)}">编辑 / 移动</button>${organizing?`<button data-bm-up="${esc(item.id)}" ${siblings[0]===item?'disabled':''}>上移</button><button data-bm-down="${esc(item.id)}" ${siblings.at(-1)===item?'disabled':''}>下移</button>`:''}<button class="danger-btn" data-bm-delete="${esc(item.id)}">删除</button></div></details>`;
  }
  function linkCount(entries) { return entries.reduce((count, item) => count + (item.kind === 'link' ? 1 : linkCount(item.children)), 0); }
  function folderTree(entries, depth = 0) {
    return entries.filter(item => item.kind === 'folder').map(item => {
      const hasChildren = item.children.some(child => child.kind === 'folder'), expanded = getData().bookmarkFolderStates?.[item.id] ?? !closed.has(item.id);
      return `<li><div class="bookmark-folder-row" style="--bookmark-depth:${Math.min(depth, 6)}">${hasChildren ? `<button class="bookmark-disclosure" data-bm-toggle="${esc(item.id)}" aria-expanded="${expanded}" aria-controls="bm-children-${esc(item.id)}" aria-label="${expanded ? '折叠' : '展开'}${esc(item.title)}">${icon('chevron')}</button>` : '<span class="bookmark-disclosure-spacer"></span>'}<button class="bookmark-folder-select ${selectedFolder === item.id ? 'active' : ''}" data-bm-folder="${esc(item.id)}" ${selectedFolder === item.id ? 'aria-current="page"' : ''}>${icon('folder')}<span>${esc(item.title)}</span><small>${linkCount(item.children)}</small></button></div>${hasChildren ? `<ul id="bm-children-${esc(item.id)}" ${expanded ? '' : 'hidden'}>${folderTree(item.children, depth + 1)}</ul>` : ''}</li>`;
    }).join('');
  }
  function collections(entries = tree(), path = '', folderId = '', output = []) {
    const links = entries.filter(item => item.kind === 'link');
    output.push({ entries, links, path: path || '未分组', folderId });
    for (const folder of entries.filter(item => item.kind === 'folder')) collections(folder.children, path ? path + ' / ' + folder.title : folder.title, folder.id, output);
    return output;
  }
  function card(item, entries) {
    const siteUrl = new URL(item.url), domain = siteUrl.hostname;
    const brand = domain.replace(/^(www|developers|developer|docs)\./, '');
    const hue = colorHue(brand), initials = (item.title.match(/^[A-Za-z]{2}/)?.[0] || brand.split('.')[0].slice(0, 2)).toUpperCase();
    const favicon = new URL('/favicon.ico', siteUrl).href;
    return `<article class="bookmark-card ${selected.has(item.id) ? 'is-selected' : ''}">${organizing ? `<label class="bookmark-checkbox"><input type="checkbox" data-bm-select="${esc(item.id)}" aria-label="选择${esc(item.title)}" ${selected.has(item.id) ? 'checked' : ''}></label>` : ''}<a data-bm-link="${esc(item.id)}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" class="bookmark-link" title="${esc(item.url)}"><span class="bookmark-site-icon" style="--site-hue:${hue}" aria-hidden="true"><span class="bookmark-site-initials">${esc(initials)}</span><img class="bookmark-site-favicon" src="${esc(favicon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><span class="bookmark-card-copy"><strong>${esc(item.title)}</strong><small>${esc(domain)}</small></span><span class="bookmark-link-arrow" aria-hidden="true">${icon('chevron')}</span>${item.pinned ? `<span class="bookmark-pin-mark" aria-label="常用书签">${icon('heart')}</span>` : ''}</a>${actions(item, entries)}</article>`;
  }
  function colorHue(value) { let hash = 0; for (const char of value) hash = (hash * 31 + char.codePointAt(0)) >>> 0; return [225, 165, 28, 275, 350][hash % 5]; }
  function section(title, cards, extra = '', count = '') { return `<section class="bookmark-section ${title === '常用书签' ? 'bookmark-favorites' : ''}"><div class="bookmark-section-heading"><h2>${icon(title === '常用书签' ? 'heart' : 'folder')}<span>${esc(title)}</span>${count !== '' ? `<small>${count}</small>` : ''}</h2>${extra}</div><div class="bookmark-grid">${cards}</div></section>`; }
  function content() {
    const all = collections();
    if (query || pinnedOnly) {
      const searchGroups = selectedFolder ? collections(locate(selectedFolder)?.item.children || [], paths().find(x=>x.id===selectedFolder)?.path || '') : all;
      const results = searchGroups.flatMap(group => group.links.filter(item => (!pinnedOnly || item.pinned) && [item.title, item.url, group.path].join(' ').toLocaleLowerCase().includes(query)).map(item => card(item, group.entries)));
      return section(query ? '搜索结果' : '常用书签', results.join('') || '<p class="bookmark-empty hint">没有找到书签</p>', '', results.length);
    }
    const selected = selectedFolder ? locate(selectedFolder)?.item : null;
    const groups = selected ? collections(selected.children, paths().find(x => x.id === selected.id)?.path || selected.title, selected.id) : all;
    let html = '';
    for (const group of groups) {
      const folder = group.folderId ? locate(group.folderId) : null;
      if (!folder && !group.links.length) continue;
      // Empty folders remain visible and manageable without duplicating parent placeholders.
      if (!group.links.length && group.entries.some(item => item.kind === 'folder') && !organizing) continue;
      if (!group.links.length && !organizing && !selectedFolder) continue;
      html += section(group.path, group.links.map(item => card(item, group.entries)).join('') || '<p class="bookmark-empty hint">暂无书签</p>', folder ? actions(folder.item, folder.entries) : '', group.links.length);
    }
    return html || '<div class="empty">添加网址，或在整理模式中导入浏览器书签。</div>';
  }
  function render() {
    if (selectedFolder && locate(selectedFolder)?.item.kind !== 'folder') selectedFolder = '';
    const roots = tree().filter(item => item.kind === 'folder');
    const currentFolder = selectedFolder ? locate(selectedFolder)?.item : null;
    const selectedPath = paths().find(item => item.id === selectedFolder)?.path || '';
    main.innerHTML = `<section class="bookmark-page ${organizing ? 'is-organizing' : ''}"><header class="section-head workspace-page-head"><div><h1>书签</h1><p class="muted">${linkCount(tree())} 个网址 · ${paths().length} 个分组</p></div><div class="workspace-page-actions"><button class="secondary-btn" data-bm-organize aria-pressed="${organizing}">${icon(organizing ? 'check' : 'edit')} ${organizing ? '完成整理' : '整理'}</button><button class="primary-btn" data-bm-new>${icon('plus')} 添加书签</button><details class="item-menu bookmark-tools"><summary aria-label="书签更多操作">···</summary><div class="item-menu-panel"><button data-bm-new-folder>新建分组</button><button data-bm-import>导入书签</button><button data-bm-export>导出书签</button><button class="danger-btn" data-bm-clear ${tree().length ? '' : 'disabled'}>移入回收站</button></div></details></div></header><div class="workspace-filter-bar"><label class="workspace-search">${icon('search')}<input id="bookmarkSearch" type="search" placeholder="搜索名称、网址或分组" aria-label="搜索书签" value="${esc(query)}"></label><button class="secondary-btn" data-bm-pinned aria-pressed="${pinnedOnly}">${icon('heart')} 常用</button></div><div class="bookmark-browser"><details class="bookmark-directory" ${directoryOpen ? 'open' : ''}><summary>${icon('folder')}<span>分组</span><span class="bookmark-directory-path">${esc(selectedPath || '全部书签')}</span>${icon('chevron')}</summary><nav class="bookmark-folders" aria-label="书签分组"><button class="bookmark-folder-select ${!selectedFolder ? 'active' : ''}" data-bm-folder="" ${!selectedFolder ? 'aria-current="page"' : ''}>${icon('link')} 全部书签<small>${linkCount(tree())}</small></button><ul>${folderTree(tree())}</ul>${!roots.length ? '<p class="hint bookmark-empty">暂无分组</p>' : ''}</nav></details><div class="bookmark-results">${currentFolder ? `<div class="bookmark-subgroups"><span>${esc(selectedPath)}</span>${currentFolder.children.filter(item => item.kind === 'folder').map(item => `<button data-bm-folder="${esc(item.id)}">${icon('folder')}${esc(item.title)}<small>${linkCount(item.children)}</small></button>`).join('')}</div>` : ''}<div id="bookmarkSelection">${selectionBar()}</div><div id="bookmarkTree" class="bookmark-content">${content()}</div></div></div></section>`;
    const directory = main.querySelector('.bookmark-directory');
    directory.ontoggle = event => { const next=event.target.open;if(directoryOpen===next)return;directoryOpen=next;savePreferences(); };
    main.querySelector('#bookmarkSearch').oninput = event => { query = event.target.value.trim().toLocaleLowerCase(); selected.clear(); updateResults(); };

  }
  main.addEventListener('load', event => {
    if (event.target.matches?.('.bookmark-site-favicon')) event.target.closest('.bookmark-site-icon')?.classList.add('has-favicon');
  }, true);
  main.addEventListener('error', event => {
    if (event.target.matches?.('.bookmark-site-favicon')) event.target.remove();
  }, true);
  main.addEventListener('click', event => {
    const link = event.target.closest('[data-bm-link]');
    if (organizing && link) { event.preventDefault(); const id = link.dataset.bmLink; selected.has(id) ? selected.delete(id) : selected.add(id); updateResults(); return; }
    const button = event.target.closest('button'); if (!button || !button.closest('.bookmark-page')) return;
    const d = button.dataset;
    if ('bmFolder' in d) { selectedFolder = d.bmFolder; query = ''; pinnedOnly = false; selected.clear(); if(window.matchMedia?.('(max-width: 720px)').matches)directoryOpen = false; render(); main.querySelector(`[data-bm-folder="${selectedFolder}"]`)?.focus(); }
    else if (d.bmToggle) { if (closed.has(d.bmToggle)) closed.delete(d.bmToggle); else closed.add(d.bmToggle); savePreferences(d.bmToggle); render(); main.querySelector(`[data-bm-toggle="${d.bmToggle}"]`)?.focus(); }
    else if ('bmOrganize' in d) { organizing = !organizing; selected.clear(); render(); main.querySelector('[data-bm-organize]')?.focus(); }
    else if ('bmPinned' in d) { pinnedOnly = !pinnedOnly; selectedFolder = ''; selected.clear(); render(); }
    else if ('bmMoveSelected' in d) bulkAction(false);
    else if ('bmDeleteSelected' in d) bulkAction(true);
    else if ('bmNew' in d) editItem('link', '', selectedFolder);
    else if ('bmNewFolder' in d) editItem('folder', '', selectedFolder);
    else if (d.bmPin) {
      const items = structuredClone(tree()), found = locate(d.bmPin, items);
      if (found?.item.kind === 'link') { found.item.pinned = !found.item.pinned; try { apply(items); render(); } catch (error) { notify(error.message); } }
    }
    else if (d.bmChild) editItem('folder', '', d.bmChild);
    else if (d.bmAdd) editItem('link', '', d.bmAdd);
    else if (d.bmEdit) { const found = locate(d.bmEdit); if (found) editItem(found.item.kind, found.item.id); }
    else if (d.bmDelete) removeItem(d.bmDelete);
    else if (d.bmUp || d.bmDown) {
      const items = structuredClone(tree()), found = locate(d.bmUp || d.bmDown, items);
      if (!found) return;
      const index = found.entries.indexOf(found.item), step = d.bmUp ? -1 : 1;
      let next = index + step;
      while (next >= 0 && next < found.entries.length && found.entries[next].kind !== found.item.kind) next += step;
      if (next >= 0 && next < found.entries.length) { [found.entries[index], found.entries[next]] = [found.entries[next], found.entries[index]]; try { apply(items); render(); } catch(error) { notify(error.message); } }
    } else if ('bmImport' in d) file.click();
    else if ('bmClear' in d) clearAll();
    else if ('bmExport' in d) download(new Blob([bookmarksHTML(tree())], { type: 'text/html;charset=utf-8' }), '栖点-书签.html');
  });
  main.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-bm-select]')) { const id=input.dataset.bmSelect;input.checked ? selected.add(id) : selected.delete(id); updateResults();[...main.querySelectorAll('[data-bm-select]')].find(node=>node.dataset.bmSelect===id)?.focus(); }
    else if (input.matches('[data-bm-select-all]')) { selected.clear(); if(input.checked)visibleLinks().forEach(item => selected.add(item.id)); updateResults();main.querySelector('[data-bm-select-all]')?.focus(); }
  });
  file.onchange = async () => {
    const selected = file.files[0]; file.value = ''; if (!selected) return;
    try {
      if (selected.size > 5 * 1024 * 1024) throw Error('书签文件不能超过 5 MB');
      const parsed = parseBookmarks(await selected.text()), preview = mergeBookmarks(tree(), parsed.items);
      const snapshot = JSON.stringify(getData());
      validateVault({ ...getData(), bookmarks: preview.items });
      dialog('导入书签', `<p>新增 ${preview.added} 个书签 · 跳过 ${preview.duplicates} 个重复项${parsed.skipped ? ` · 忽略 ${parsed.skipped} 个不支持的网址` : ''}</p><p class="hint">保留分组层级和顺序，同路径分组合并。</p><div class="bookmark-import-preview">${paths(parsed.items).map(x => `<div>${esc(x.path)}</div>`).join('') || '根目录书签'}</div>`, () => {
        if (JSON.stringify(getData()) !== snapshot) throw Error('知识库已变更，请重新选择文件预览');
        return apply(preview.items);
      }, '导入书签');
    } catch (error) { notify(error.message); }
  };
  function close() { if (!busy) overlay.classList.remove('open'); }
  overlay.onclick = event => { if (event.target === overlay || event.target.closest('[data-bm-close]')) close(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  return {
    render,
    addBookmark(folderId = '') { selectedFolder = folderId; editItem('link', '', folderId); },
    openFolder(folderId = '') { selectedFolder = folderId; query = ''; pinnedOnly = false; selected.clear(); organizing = false; render(); },
    leave() { scrollPosition = window.scrollY; selected.clear(); organizing = false; },
    resume() { syncPreferences(); render(); window.scrollTo({top:scrollPosition}); },
    syncPreferences,
    search(queryText) { query = queryText.trim().toLocaleLowerCase(); selected.clear(); render(); }
  };
}
