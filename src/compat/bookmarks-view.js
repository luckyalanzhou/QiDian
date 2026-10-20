import { bookmarkURL } from '../../shared/bookmarks.js';
import { validateVault } from '../../shared/vault-validation.js';
import { bookmarkId, parseBookmarks, mergeBookmarks, bookmarksHTML } from '../features/bookmarks/data.js';
import { createTrashEntry } from '../domain/trash-data.js';
import { bookmarkCollections, bookmarkColorHue as colorHue, bookmarkFolderPaths, bookmarkLinkCount, createBookmarkSnapshot, locateBookmark as locateBookmarkInEntries } from '../features/bookmarks/snapshot.ts';
import { moveBookmark, toggleBookmarkPin } from '../features/bookmarks/operations.ts';

export function createBookmarkView({ main, getData, mutateData = operation => operation(getData()), save, download, notify, onChange, viewState:providedViewState }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span class="ico"><svg aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
  const view = providedViewState || { closed:new Set(),selected:new Set(),query:'',organizing:false,selectedFolder:'',pinnedOnly:false,directoryOpen:true };
  const closed = view.closed, selected = view.selected; let busy = false, scrollPosition = 0;
  function syncPreferences() {
    closed.clear(); for (const [id, open] of Object.entries(getData().bookmarkFolderStates || {})) if(!open)closed.add(id);
    view.directoryOpen = typeof getData().bookmarkDirectoryOpen === 'boolean' ? getData().bookmarkDirectoryOpen : !window.matchMedia?.('(max-width: 720px)').matches;
  }
  function savePreferences(folderId = '') {
    mutateData(data=>{
      data.bookmarkDirectoryOpen = view.directoryOpen;
      if(folderId)data.bookmarkFolderStates={...(data.bookmarkFolderStates||{}),[folderId]:!closed.has(folderId)};
    });
    save();
  }
  syncPreferences();
  const overlay = document.createElement('div'); overlay.className = 'overlay'; overlay.id = 'bookmarkOverlay'; document.body.append(overlay);
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.html,.htm'; file.hidden = true; document.body.append(file);
  const tree = () => getData().bookmarks || [];
  const locate = (id, entries = tree(), parent = null) => locateBookmarkInEntries(id, entries, parent);
  const paths = (entries = tree(), prefix = '', excluded = '', result = []) => bookmarkFolderPaths(entries, prefix, excluded, result);
  const linkCount = (entries = tree()) => bookmarkLinkCount(entries);
  const collections = (entries = tree(), path = '', folderId = '', output = []) => bookmarkCollections(entries, path, folderId, output);
  function parentOptions(selected = '', excluded = '') { return `<option value="">书签根目录</option>` + paths(tree(), '', excluded).map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.path)}</option>`).join(''); }
  function dialog(title, body, action, label = '保存') {
    overlay.innerHTML = `<section class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkDialogTitle"><div class="dialog-head"><h2 id="bookmarkDialogTitle">${esc(title)}</h2><button class="round-btn" data-bm-close aria-label="关闭">${icon('close')}</button></div><form id="bookmarkForm"><div class="dialog-body">${body}<p id="bookmarkMessage" class="hint" role="status"></p></div><div class="dialog-foot"><button type="button" class="secondary-btn" data-bm-close>取消</button><button class="primary-btn" type="submit">${esc(label)}</button></div></form></section>`;
    overlay.classList.add('open');
    overlay.querySelector('input, select, [type=submit]')?.focus();
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const button = overlay.querySelector('[type=submit]'); button.disabled = true; busy = true;
      let completed = false;
      try { await action(); overlay.classList.remove('open'); completed = true; }
      catch (error) { overlay.querySelector('#bookmarkMessage').textContent = error.message; }
      finally { busy = false; button.disabled = false; }
      if (completed) render();
    };
  }
  async function apply(items, trash = getData().trash || []) {
    const candidate = validateVault({ ...getData(), bookmarks: items, trash });
    const previousBookmarks=getData().bookmarks,previousTrash=getData().trash;
    mutateData(data=>{data.bookmarks = candidate.bookmarks; data.trash = candidate.trash});
    try{return await save()}catch(error){mutateData(data=>{data.bookmarks=previousBookmarks;data.trash=previousTrash});throw error}
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
      closed.clear(); mutateData(data=>{data.bookmarkFolderStates = {}}); view.selectedFolder = ''; view.query = '';
      return apply([], trash).catch(error=>{mutateData(data=>{data.bookmarkFolderStates=previousFolderStates});throw error});
    }, '移入回收站');
    overlay.querySelector('[type=submit]').classList.add('danger-btn');
  }
  function visibleLinks() {
    const all = collections();
    const groups = view.selectedFolder ? collections(locate(view.selectedFolder)?.item.children || [], paths().find(x => x.id === view.selectedFolder)?.path || '') : all;
    return groups.flatMap(group => group.links.filter(item => (!view.pinnedOnly || item.pinned) && (!view.query || [item.title,item.url,group.path].join(' ').toLocaleLowerCase().includes(view.query))));
  }
  function selectionBar() {
    if (!view.organizing) return '';
    const ids = new Set(visibleLinks().map(item => item.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    const all = ids.size > 0 && selected.size === ids.size;
    return `<div class="bookmark-selection-bar"><label><input type="checkbox" data-bm-select-all ${all ? 'checked' : ''} ${ids.size ? '' : 'disabled'}> 全选${view.query ? '搜索结果' : view.selectedFolder ? '当前分组（含子分组）' : view.pinnedOnly ? '常用书签' : '全部网址'}</label><span role="status">已选 ${selected.size} / ${ids.size} 项</span><div><button class="secondary-btn" data-bm-move-selected ${selected.size ? '' : 'disabled'}>移动</button><button class="secondary-btn danger-btn" data-bm-delete-selected ${selected.size ? '' : 'disabled'}>删除所选</button></div></div>`;
  }
  function updateResults() {
    main.querySelector('#bookmarkSelection').innerHTML = selectionBar();
    const all = main.querySelector('[data-bm-select-all]');
    if (all) all.indeterminate = selected.size > 0 && selected.size < new Set(visibleLinks().map(item=>item.id)).size;
    main.querySelector('#bookmarkTree').innerHTML = content();
  }
  function setSearchQuery(query) {
    view.query = query.trim().toLocaleLowerCase();
    selected.clear();
  }
  function setLinkSelected(id, isSelected) {
    isSelected ? selected.add(id) : selected.delete(id);
  }
  function setAllVisibleSelected(isSelected) {
    selected.clear();
    if (isSelected) visibleLinks().forEach(item => selected.add(item.id));
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
    return `<details class="item-menu"><summary aria-label="更多：${esc(item.title)}">···</summary><div class="item-menu-panel">${item.kind==='folder'?`<button data-bm-child="${esc(item.id)}">添加子分组</button><button data-bm-add="${esc(item.id)}">添加书签</button>`:`<button data-bm-pin="${esc(item.id)}" aria-pressed="${!!item.pinned}">${item.pinned?'取消常用':'设为常用'}</button>`}<button data-bm-edit="${esc(item.id)}">编辑 / 移动</button>${view.organizing?`<button data-bm-up="${esc(item.id)}" ${siblings[0]===item?'disabled':''}>上移</button><button data-bm-down="${esc(item.id)}" ${siblings.at(-1)===item?'disabled':''}>下移</button>`:''}<button class="danger-btn" data-bm-delete="${esc(item.id)}">删除</button></div></details>`;
  }
  function folderTree(entries, depth = 0) {
    return entries.filter(item => item.kind === 'folder').map(item => {
      const hasChildren = item.children.some(child => child.kind === 'folder'), expanded = getData().bookmarkFolderStates?.[item.id] ?? !closed.has(item.id);
      return `<li><div class="bookmark-folder-row" style="--bookmark-depth:${Math.min(depth, 6)}">${hasChildren ? `<button class="bookmark-disclosure" data-bm-toggle="${esc(item.id)}" aria-expanded="${expanded}" aria-controls="bm-children-${esc(item.id)}" aria-label="${expanded ? '折叠' : '展开'}${esc(item.title)}">${icon('chevron')}</button>` : '<span class="bookmark-disclosure-spacer"></span>'}<button class="bookmark-folder-select ${view.selectedFolder === item.id ? 'active' : ''}" data-bm-folder="${esc(item.id)}" ${view.selectedFolder === item.id ? 'aria-current="page"' : ''}>${icon('folder')}<span>${esc(item.title)}</span><small>${linkCount(item.children)}</small></button></div>${hasChildren ? `<ul id="bm-children-${esc(item.id)}" ${expanded ? '' : 'hidden'}>${folderTree(item.children, depth + 1)}</ul>` : ''}</li>`;
    }).join('');
  }
  function card(item, entries) {
    const siteUrl = new URL(item.url), domain = siteUrl.hostname;
    const brand = domain.replace(/^(www|developers|developer|docs)\./, '');
    const hue = colorHue(brand), initials = (item.title.match(/^[A-Za-z]{2}/)?.[0] || brand.split('.')[0].slice(0, 2)).toUpperCase();
    const favicon = new URL('/favicon.ico', siteUrl).href;
    return `<article class="bookmark-card ${selected.has(item.id) ? 'is-selected' : ''}">${view.organizing ? `<label class="bookmark-checkbox"><input type="checkbox" data-bm-select="${esc(item.id)}" aria-label="选择${esc(item.title)}" ${selected.has(item.id) ? 'checked' : ''}></label>` : ''}<a data-bm-link="${esc(item.id)}" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" class="bookmark-link" title="${esc(item.url)}"><span class="bookmark-site-icon" style="--site-hue:${hue}" aria-hidden="true"><span class="bookmark-site-initials">${esc(initials)}</span><img class="bookmark-site-favicon" src="${esc(favicon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><span class="bookmark-card-copy"><strong>${esc(item.title)}</strong><small>${esc(domain)}</small></span><span class="bookmark-link-arrow" aria-hidden="true">${icon('chevron')}</span>${item.pinned ? `<span class="bookmark-pin-mark" aria-label="常用书签">${icon('heart')}</span>` : ''}</a>${actions(item, entries)}</article>`;
  }
  function colorHue(value) { let hash = 0; for (const char of value) hash = (hash * 31 + char.codePointAt(0)) >>> 0; return [225, 165, 28, 275, 350][hash % 5]; }
  function section(title, cards, extra = '', count = '') { return `<section class="bookmark-section ${title === '常用书签' ? 'bookmark-favorites' : ''}"><div class="bookmark-section-heading"><h2>${icon(title === '常用书签' ? 'heart' : 'folder')}<span>${esc(title)}</span>${count !== '' ? `<small>${count}</small>` : ''}</h2>${extra}</div><div class="bookmark-grid">${cards}</div></section>`; }
  function content() {
    const all = collections();
    if (view.query || view.pinnedOnly) {
      const searchGroups = view.selectedFolder ? collections(locate(view.selectedFolder)?.item.children || [], paths().find(x=>x.id===view.selectedFolder)?.path || '') : all;
      const results = searchGroups.flatMap(group => group.links.filter(item => (!view.pinnedOnly || item.pinned) && [item.title, item.url, group.path].join(' ').toLocaleLowerCase().includes(view.query)).map(item => card(item, group.entries)));
      return section(view.query ? '搜索结果' : '常用书签', results.join('') || '<p class="bookmark-empty hint">没有找到书签</p>', '', results.length);
    }
    const selected = view.selectedFolder ? locate(view.selectedFolder)?.item : null;
    const groups = selected ? collections(selected.children, paths().find(x => x.id === selected.id)?.path || selected.title, selected.id) : all;
    let html = '';
    for (const group of groups) {
      const folder = group.folderId ? locate(group.folderId) : null;
      if (!folder && !group.links.length) continue;
      // Empty folders remain visible and manageable without duplicating parent placeholders.
      if (!group.links.length && group.entries.some(item => item.kind === 'folder') && !view.organizing) continue;
      if (!group.links.length && !view.organizing && !view.selectedFolder) continue;
      html += section(group.path, group.links.map(item => card(item, group.entries)).join('') || '<p class="bookmark-empty hint">暂无书签</p>', folder ? actions(folder.item, folder.entries) : '', group.links.length);
    }
    return html || '<div class="empty">添加网址，或在整理模式中导入浏览器书签。</div>';
  }
  function renderLegacy() {
    if (view.selectedFolder && locate(view.selectedFolder)?.item.kind !== 'folder') view.selectedFolder = '';
    const roots = tree().filter(item => item.kind === 'folder');
    const currentFolder = view.selectedFolder ? locate(view.selectedFolder)?.item : null;
    const selectedPath = paths().find(item => item.id === view.selectedFolder)?.path || '';
    main.innerHTML = `<section class="bookmark-page ${view.organizing ? 'is-organizing' : ''}"><header class="section-head workspace-page-head"><div><h1>书签</h1><p class="muted">${linkCount(tree())} 个网址 · ${paths().length} 个分组</p></div><div class="workspace-page-actions"><button class="secondary-btn" data-bm-organize aria-pressed="${view.organizing}">${icon(view.organizing ? 'check' : 'edit')} ${view.organizing ? '完成整理' : '整理'}</button><button class="primary-btn" data-bm-new>${icon('plus')} 添加书签</button><details class="item-menu bookmark-tools"><summary aria-label="书签更多操作">···</summary><div class="item-menu-panel"><button data-bm-new-folder>新建分组</button><button data-bm-import>导入书签</button><button data-bm-export>导出书签</button><button class="danger-btn" data-bm-clear ${tree().length ? '' : 'disabled'}>移入回收站</button></div></details></div></header><div class="workspace-filter-bar"><label class="workspace-search">${icon('search')}<input id="bookmarkSearch" type="search" placeholder="搜索名称、网址或分组" aria-label="搜索书签" value="${esc(view.query)}"></label><button class="secondary-btn" data-bm-pinned aria-pressed="${view.pinnedOnly}">${icon('heart')} 常用</button></div><div class="bookmark-browser"><details class="bookmark-directory" ${view.directoryOpen ? 'open' : ''}><summary>${icon('folder')}<span>分组</span><span class="bookmark-directory-path">${esc(selectedPath || '全部书签')}</span>${icon('chevron')}</summary><nav class="bookmark-folders" aria-label="书签分组"><button class="bookmark-folder-select ${!view.selectedFolder ? 'active' : ''}" data-bm-folder="" ${!view.selectedFolder ? 'aria-current="page"' : ''}>${icon('link')} 全部书签<small>${linkCount(tree())}</small></button><ul>${folderTree(tree())}</ul>${!roots.length ? '<p class="hint bookmark-empty">暂无分组</p>' : ''}</nav></details><div class="bookmark-results">${currentFolder ? `<div class="bookmark-subgroups"><span>${esc(selectedPath)}</span>${currentFolder.children.filter(item => item.kind === 'folder').map(item => `<button data-bm-folder="${esc(item.id)}">${icon('folder')}${esc(item.title)}<small>${linkCount(item.children)}</small></button>`).join('')}</div>` : ''}<div id="bookmarkSelection">${selectionBar()}</div><div id="bookmarkTree" class="bookmark-content">${content()}</div></div></div></section>`;
    const directory = main.querySelector('.bookmark-directory');
    directory.ontoggle = event => dispatch({ type:'toggle-directory', open:event.target.open });
    main.querySelector('#bookmarkSearch').oninput = event => { setSearchQuery(event.target.value); updateResults(); };

  }
  function render() {
    if(typeof onChange==='function')onChange();
    else renderLegacy();
  }
  function setFolder(id) {
    view.selectedFolder=id;view.query='';view.pinnedOnly=false;selected.clear();
    if(window.matchMedia?.('(max-width: 720px)').matches)view.directoryOpen=false;
    render();
  }
  function toggleFolder(id) {
    if(closed.has(id))closed.delete(id);else closed.add(id);
    savePreferences(id);render();
  }
  async function togglePin(id) {
    const items=toggleBookmarkPin(tree(),id);
    if(!items)return;
    try{await apply(items);render()}catch(error){notify(error.message||'常用状态尚未保存')}
  }
  async function moveItem(id,direction) {
    const items=moveBookmark(tree(),id,direction);
    if(!items)return;
    try{await apply(items);render()}catch(error){notify(error.message||'书签顺序尚未保存')}
  }
  function dispatch(action) {
    switch(action.type){
      case 'select-folder': return setFolder(action.id);
      case 'toggle-folder': return toggleFolder(action.id);
      case 'toggle-directory': if(view.directoryOpen!==action.open){view.directoryOpen=action.open;savePreferences();render()} return;
      case 'toggle-organizing': view.organizing=!view.organizing;selected.clear();return render();
      case 'toggle-pinned': view.pinnedOnly=!view.pinnedOnly;view.selectedFolder='';selected.clear();return render();
      case 'search': setSearchQuery(action.query);return render();
      case 'toggle-pin': return togglePin(action.id);
      case 'edit': {const found=locate(action.id);if(found)editItem(found.item.kind,found.item.id);return}
      case 'delete': return removeItem(action.id);
      case 'add-link': return editItem('link','',action.parentId||'');
      case 'add-folder': return editItem('folder','',action.parentId||'');
      case 'move': return moveItem(action.id,action.direction);
      case 'select-link': setLinkSelected(action.id,action.selected);return render();
      case 'select-all': setAllVisibleSelected(action.selected);return render();
      case 'bulk-move': return bulkAction(false);
      case 'bulk-delete': return bulkAction(true);
      case 'import': return file.click();
      case 'export': return download(new Blob([bookmarksHTML(tree())],{type:'text/html;charset=utf-8'}),'栖点-书签.html');
      case 'clear': return clearAll();
    }
  }
  main.addEventListener('load', event => {
    if (event.target.matches?.('.bookmark-site-favicon')) event.target.closest('.bookmark-site-icon')?.classList.add('has-favicon');
  }, true);
  main.addEventListener('error', event => {
    if (event.target.matches?.('.bookmark-site-favicon')) event.target.remove();
  }, true);
  main.addEventListener('click', event => {
    const link = event.target.closest('[data-bm-link]');
    if (view.organizing && link) { event.preventDefault(); const id = link.dataset.bmLink; selected.has(id) ? selected.delete(id) : selected.add(id); updateResults(); return; }
    const button = event.target.closest('button'); if (!button || !button.closest('.bookmark-page')) return;
    const d = button.dataset;
    if ('bmFolder' in d) { dispatch({ type:'select-folder', id:d.bmFolder }); main.querySelector(`[data-bm-folder="${d.bmFolder}"]`)?.focus(); }
    else if (d.bmToggle) { dispatch({ type:'toggle-folder', id:d.bmToggle }); main.querySelector(`[data-bm-toggle="${d.bmToggle}"]`)?.focus(); }
    else if ('bmOrganize' in d) { dispatch({ type:'toggle-organizing' }); main.querySelector('[data-bm-organize]')?.focus(); }
    else if ('bmPinned' in d) dispatch({ type:'toggle-pinned' });
    else if ('bmMoveSelected' in d) dispatch({ type:'bulk-move' });
    else if ('bmDeleteSelected' in d) dispatch({ type:'bulk-delete' });
    else if ('bmNew' in d) dispatch({ type:'add-link', parentId:view.selectedFolder });
    else if ('bmNewFolder' in d) dispatch({ type:'add-folder', parentId:view.selectedFolder });
    else if (d.bmPin) dispatch({ type:'toggle-pin', id:d.bmPin });
    else if (d.bmChild) dispatch({ type:'add-folder', parentId:d.bmChild });
    else if (d.bmAdd) dispatch({ type:'add-link', parentId:d.bmAdd });
    else if (d.bmEdit) dispatch({ type:'edit', id:d.bmEdit });
    else if (d.bmDelete) dispatch({ type:'delete', id:d.bmDelete });
    else if (d.bmUp || d.bmDown) dispatch({ type:'move', id:d.bmUp || d.bmDown, direction:d.bmUp?'up':'down' });
    else if ('bmImport' in d) dispatch({ type:'import' });
    else if ('bmClear' in d) dispatch({ type:'clear' });
    else if ('bmExport' in d) dispatch({ type:'export' });
  });
  main.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-bm-select]')) { const id=input.dataset.bmSelect;setLinkSelected(id,input.checked);updateResults();[...main.querySelectorAll('[data-bm-select]')].find(node=>node.dataset.bmSelect===id)?.focus(); }
    else if (input.matches('[data-bm-select-all]')) { setAllVisibleSelected(input.checked);updateResults();main.querySelector('[data-bm-select-all]')?.focus(); }
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
    renderLegacy,
    snapshot() { return createBookmarkSnapshot(getData(), view); },
    dispatch,
    addBookmark(folderId = '') { view.selectedFolder = folderId; editItem('link', '', folderId); },
    openFolder(folderId = '') { view.selectedFolder = folderId; view.query = ''; view.pinnedOnly = false; selected.clear(); view.organizing = false; render(); },
    leave() { scrollPosition = window.scrollY; selected.clear(); view.organizing = false; },
    resume() { syncPreferences(); render(); window.scrollTo({top:scrollPosition}); },
    syncPreferences,
    search(queryText) { view.query = queryText.trim().toLocaleLowerCase(); selected.clear(); render(); }
  };
}
