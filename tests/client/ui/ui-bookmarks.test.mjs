import { test } from 'node:test';
import * as fixture from '../../support/ui-fixtures.mjs';
const { assert, createBookmarkView, createTrashEntry, designVault, empty, mount, readFile } = fixture;

test('empty dashboard keeps one clear creation action in each workspace', async t => {
  const { dom, w } = await mount(structuredClone(empty));
  t.after(() => dom.window.close());
  const main = w.document.querySelector('#main');
  assert.equal(main.querySelector('.dashboard-note-workspace .dashboard-section-actions [data-new="note"]'), null);
  assert.equal(main.querySelector('.dashboard-note-workspace .dashboard-empty [data-new="note"]').textContent.trim(), '写下第一篇');
  assert.equal(main.querySelector('.dashboard-bookmarks .dashboard-section-head [data-dashboard-add-bookmark]'), null);
  assert.equal(main.querySelector('.dashboard-bookmarks .dashboard-empty [data-dashboard-add-bookmark]').textContent.trim(), '添加第一个网址');

  const withEmptyFolder = structuredClone(empty);
  withEmptyFolder.bookmarks = [{ id: 'empty-folder', kind: 'folder', title: '稍后整理', children: [] }];
  const { dom: folderDom, w: folderWindow } = await mount(withEmptyFolder);
  t.after(() => folderDom.window.close());
  assert.ok(folderWindow.document.querySelector('.dashboard-bookmarks .dashboard-section-head [data-dashboard-add-bookmark]'), 'existing empty folders retain the header add action');
});

test('dashboard presents notes and bookmarks as peer workspaces and keeps bookmark paths', async () => {
  const vault=structuredClone(empty);
  vault.bookmarks=[{id:'folder-reading',kind:'folder',title:'阅读',children:[{id:'folder-reference',kind:'folder',title:'参考',children:[{id:'bookmark-mdn',kind:'link',title:'MDN',url:'https://developer.mozilla.org'}]}]}];
  const { dom, w } = await mount(vault);
  const main=w.document.querySelector('#main');
  assert.equal(main.querySelector('.about-note'),null,'the dashboard has no Docker service footer');
  assert.match(main.textContent,/最近笔记/);
  assert.match(main.textContent,/书签/);
  assert.equal(main.querySelector('.dashboard-intro h1').textContent,'我的空间');
  assert.equal(main.querySelector('.dashboard-intro .workspace-eyebrow'),null,'the dashboard title stands without a redundant eyebrow');
  assert.equal(main.querySelector('.dashboard-intro p').textContent,'笔记保存内容，书签保存网址；网页摘录可粘贴网页正文或文本，保存为笔记。');
  assert.equal(main.querySelectorAll('.dashboard-workspaces > .dashboard-section').length,2);
  assert.deepEqual([...main.querySelectorAll('.dashboard-workspaces > .dashboard-section h2')].map(node=>node.textContent),['笔记','书签']);
  assert.equal(main.querySelectorAll('.dashboard-section-actions .secondary-btn').length,1,'only workspaces with content show a header creation action');
  assert.equal(main.querySelector('.dashboard-note-workspace .dashboard-empty [data-new="note"]').textContent.trim(),'写下第一篇');
  assert.equal(main.querySelector('.dashboard-bookmarks [data-dashboard-add-bookmark]').textContent.trim(),'添加书签');
  assert.ok(main.querySelector('#quickCapture'));
  assert.ok(main.querySelector('[data-new="note"]'));
  assert.ok(main.querySelector('[data-dashboard-add-bookmark]'));
  assert.match(main.querySelector('[data-dashboard-bookmark-folder="folder-reading"]').textContent,/阅读/);
  assert.match(main.querySelector('[data-dashboard-bookmark-folder="folder-reading"]').textContent,/1 个网址/);
  const bookmarkPreview=main.querySelector('.dashboard-bookmark-preview-link');
  assert.equal(bookmarkPreview.getAttribute('href'),'https://developer.mozilla.org');
  assert.match(bookmarkPreview.textContent,/参考/,'bookmark previews retain their original nested folder path');
  assert.ok(w.document.querySelector('#sideCore [data-dashboard]'));
  assert.ok(w.document.querySelector('#sideCore [data-nav="all"]'));
  assert.match(w.document.querySelector('#sideCore #openBookmarks').textContent,/书签/);
  assert.match(w.document.querySelector('#sideCore #openBookmarks').textContent,/1/);
  assert.equal(w.document.querySelector('#mobileHome').classList.contains('selected'),true);
  assert.equal(w.document.querySelector('#sideCore [data-nav="all"]').classList.contains('active'),false);
  w.document.querySelector('[data-dashboard-bookmark-folder="folder-reading"]').click();
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent,'首页');
  assert.equal(main.querySelector('[data-dashboard-folder="folder-reading"]').open,false);
  await new Promise(resolve=>setTimeout(resolve,0));
  w.document.querySelector('[data-dashboard-bookmark-folder="folder-reading"]').click();
  main.querySelector('[data-dashboard-bookmark-folder="folder-reference"]').click();
  assert.equal(main.querySelector('[data-dashboard-folder="folder-reference"]').open,true);
  assert.equal(main.querySelectorAll('.dashboard-bookmark-preview-link').length,1);
  w.document.querySelector('[data-open-bookmarks]').click();
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent,'书签导航');
  w.document.querySelector('#main [data-bm-folder="folder-reading"]').click();
  assert.equal(w.document.querySelector('#main [data-bm-folder="folder-reading"]').getAttribute('aria-current'),'page');
  assert.match(w.document.querySelector('#main').textContent,/MDN/);
  w.document.querySelector('#brandHome').click();
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent,'首页');
  w.document.querySelector('[data-dashboard-add-bookmark]').click();
  assert.equal(w.document.querySelector('#bookmarkOverlay').classList.contains('open'),true);
  assert.ok(w.document.querySelector('#bookmarkOverlay #bmName'));
  assert.ok(w.document.querySelector('#bookmarkOverlay #bmURL'));
  w.document.querySelector('[data-bm-close]').click();
  w.document.querySelector('#sideCore [data-nav="all"]').click();
  assert.match(w.document.querySelector('#breadcrumbTitle').textContent,/全部笔记/);
  assert.equal(w.document.querySelector('#main .dashboard-intro'),null);
  assert.equal(main.querySelector('.about-note'),null,'note lists have no Docker service footer');
  dom.window.close();
});

test('dashboard bookmark folders expose all links and save collapse state to the account vault', async () => {
  const vault=structuredClone(empty);
  vault.bookmarks=[{id:'many',kind:'folder',title:'书签栏',children:Array.from({length:31},(_,i)=>({id:`link-${i}`,kind:'link',title:`网址 ${i}`,url:`https://example.com/${i}`}))},...Array.from({length:6},(_,i)=>({id:`folder-${i}`,kind:'folder',title:`分组 ${i}`,children:[]}))];
  const {dom,w,saves}=await mount(vault);
  assert.equal(w.document.querySelectorAll('.dashboard-bookmark-preview-link').length,31);
  assert.equal(w.document.querySelectorAll('.dashboard-bookmark-card').length,7);
  assert.equal(w.document.querySelectorAll('.dashboard-bookmark-card[open]').length,0,'many groups start collapsed so their names are easy to scan');
  w.document.querySelector('[data-dashboard-folders="expand"]').click();
  assert.equal(w.document.querySelectorAll('.dashboard-bookmark-card[open]').length,7);
  w.document.querySelector('[data-dashboard-folders="collapse"]').click();
  assert.equal(w.document.querySelectorAll('.dashboard-bookmark-card[open]').length,0);
  w.document.querySelector('[data-dashboard-folders="expand"]').click();
  w.document.querySelector('[data-dashboard-bookmark-folder="many"]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  w.document.querySelector('[data-nav="all"]').click();w.document.querySelector('#brandHome').click();
  assert.equal(w.document.querySelector('[data-dashboard-folder="many"]').open,false);
  assert.ok(saves.length>=3,'folder expansion is saved as an account preference');
  assert.equal(saves.at(-1).dashboardBookmarkFolders.many,false);
  dom.window.close();
});

test('dashboard stays usable with ten notes and 144 bookmarks across twelve groups', async () => {
  const vault = structuredClone(empty);
  vault.notes = Array.from({ length: 10 }, (_, index) => ({
    id: `scenario-note-${index + 1}`,
    title: `验收笔记 ${String(index + 1).padStart(2, '0')}`,
    type: 'note', category: '开发', tags: [`场景${index + 1}`],
    body: `<p>用于真实规模场景验收的正文 ${index + 1}</p>`, source: '',
    created: index + 1, updated: index + 1, pinned: false, status: 'published'
  }));
  vault.bookmarks = Array.from({ length: 12 }, (_, groupIndex) => ({
    id: `scenario-group-${groupIndex + 1}`,
    kind: 'folder',
    title: `验收分组 ${String(groupIndex + 1).padStart(2, '0')}`,
    children: Array.from({ length: 12 }, (_, linkIndex) => ({
      id: `scenario-link-${groupIndex + 1}-${linkIndex + 1}`,
      kind: 'link',
      title: `网址 ${groupIndex + 1}-${linkIndex + 1}`,
      url: `https://example.com/pwa/${groupIndex + 1}/${linkIndex + 1}`
    }))
  }));

  const { dom, w, saves } = await mount(vault);
  try {
    const main = w.document.querySelector('#main');
    assert.match(main.querySelector('.dashboard-note-workspace').textContent, /10 篇/);
    assert.match(main.querySelector('.dashboard-bookmarks').textContent, /144 个网址 · 12 个顶层分组/);
    assert.equal(main.querySelectorAll('.dashboard-bookmark-card').length, 12);
    assert.equal(main.querySelectorAll('.dashboard-bookmark-card[open]').length, 0, 'a large folder set starts collapsed for scanability');

    main.querySelector('[data-dashboard-folders="expand"]').click();
    assert.equal(main.querySelectorAll('.dashboard-bookmark-card[open]').length, 12);
    assert.equal(main.querySelectorAll('.dashboard-bookmark-preview-link').length, 144);
    main.querySelector('[data-dashboard-folders="collapse"]').click();
    assert.equal(main.querySelectorAll('.dashboard-bookmark-card[open]').length, 0);
    assert.equal(saves.at(-1).dashboardBookmarkFolders['scenario-group-12'], false);

    w.document.querySelector('[data-nav="all"]').click();
    assert.match(main.textContent, /全部笔记/);
    for (let index = 1; index <= 10; index += 1) {
      assert.match(main.textContent, new RegExp(`验收笔记 ${String(index).padStart(2, '0')}`));
    }
    w.document.querySelector('#openBookmarks').click();
    assert.match(w.document.querySelector('#main').textContent, /验收分组 12/);
    assert.match(w.document.querySelector('#main').textContent, /网址 12-12/);
  } finally {
    dom.window.close();
  }
});

test('dashboard bookmark groups switch between one and two columns and remember the account choice', async () => {
  const vault={...empty,dashboardBookmarkLayout:'single',bookmarks:[{id:'one',kind:'folder',title:'分组一',children:[]},{id:'two',kind:'folder',title:'分组二',children:[]}]};
  const {dom,w,saves}=await mount(vault,{owner:'layout-account'});
  const groups=w.document.querySelector('.dashboard-bookmark-groups');
  assert.equal(groups.classList.contains('is-double'),false);
  assert.equal(w.document.querySelector('[data-dashboard-layout="single"]').getAttribute('aria-pressed'),'true');
  w.document.querySelector('[data-dashboard-layout="double"]').click();
  assert.equal(groups.classList.contains('is-double'),true);
  assert.equal(w.document.querySelector('[data-dashboard-layout="double"]').getAttribute('aria-pressed'),'true');
  assert.equal(saves.length,1);
  assert.equal(saves[0].dashboardBookmarkLayout,'double','layout preference is saved in this account vault');
  dom.window.close();
  const reloaded=await mount(saves[0],{owner:'layout-account'});
  assert.equal(reloaded.w.document.querySelector('.dashboard-bookmark-groups').classList.contains('is-double'),true);
  reloaded.dom.window.close();
});

test('narrow mobile dashboard uses one readable bookmark column', async () => {
  const styles = await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8');
  assert.match(styles, /\.dashboard-bookmark-groups \{[^}]*overscroll-behavior: auto;/, 'desktop bookmark scrolling hands off to the page at the panel boundary');
  assert.match(styles, /@media \(max-width: 720px\) \{[\s\S]*?\.dashboard-layout-switch \{ display: none; \}[\s\S]*?\.dashboard-bookmark-groups\.is-double \{ display: block; \}/, 'mobile bookmark groups use normal document flow even when the saved desktop preference is double-column');
  assert.match(styles, /\.dashboard-bookmark-groups \{ margin: 0 12px 12px; max-height: none; overflow-y: visible; overscroll-behavior: auto; scrollbar-gutter: auto; \}/, 'mobile folder grids grow with expanded content so the footer cannot overlap bookmarks');
});

test('mobile bookmark toolbar moves primary actions into the menu and aligns touch controls', async () => {
  const vuePage = await readFile(new URL('../../../src/features/bookmarks/BookmarkPage.vue', import.meta.url), 'utf8');
  const compatibilityPage = await readFile(new URL('../../../src/compat/bookmarks-view.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8');

  assert.match(vuePage, /class="secondary-btn bookmark-desktop-action"[^>]*:aria-pressed="bookmarks\.snapshot\.organizing"/);
  assert.match(vuePage, /bookmarks\.snapshot\.organizing \? '完成整理' : '批量整理'/, 'the primary organizing action names its bulk operation');
  assert.match(vuePage, /class="primary-btn bookmark-desktop-action"[^>]*type="button"/);
  assert.match(vuePage, /class="bookmark-mobile-action"[^>]*:aria-pressed="bookmarks\.snapshot\.organizing"/);
  assert.match(vuePage, /class="bookmark-mobile-action"[^>]*type="button"/);
  assert.match(compatibilityPage, /class="bookmark-mobile-action" data-bm-organize/);
  assert.match(compatibilityPage, /class="bookmark-mobile-action" data-bm-new/);
  assert.match(styles, /\.bookmark-page \.bookmark-desktop-action\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /\.bookmark-page \.bookmark-mobile-action\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(styles, /\.bookmark-page \.bookmark-card > \.item-menu > summary\s*\{\s*opacity: \.8;\s*\}/, 'secondary row actions have reduced emphasis on touch and pointer layouts');
  assert.match(styles, /\.bookmark-page \.bookmark-card:focus-within > \.item-menu > summary,\s*\.bookmark-page \.bookmark-card > \.item-menu\[open\] > summary\s*\{\s*opacity: 1;\s*\}/, 'keyboard focus and an open menu restore full emphasis');
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.bookmark-page \.bookmark-card:hover > \.item-menu > summary\s*\{\s*opacity: 1;\s*\}\s*\}/, 'desktop hover restores full emphasis');
  assert.match(styles, /\.bookmark-page \.workspace-filter-bar > \.workspace-search, \.bookmark-page \.workspace-filter-bar > \.secondary-btn\s*\{[^}]*height:\s*44px;[^}]*\}/);
  assert.match(styles, /\.bookmark-page \.workspace-filter-bar > \.secondary-btn\s*\{[^}]*justify-content:\s*center;[^}]*\}/);
  assert.match(styles, /\.bookmark-link\s*\{[^}]*min-height:\s*72px;/, 'bookmark links retain a touch target above 56px');
  const mobile = styles.slice(styles.lastIndexOf('@media (max-width: 720px)'));
  assert.match(mobile, /\.bookmark-page \.bookmark-folder-select, \.bookmark-page \.bookmark-subgroups > button\s*\{[^}]*min-height:\s*44px;/, 'mobile folder and subgroup rows have 44px touch targets');
  assert.match(mobile, /\.bookmark-page \.bookmark-disclosure\s*\{[^}]*width:\s*44px;[^}]*flex-basis:\s*44px;[^}]*height:\s*44px;[^}]*min-height:\s*44px;/, 'mobile folder disclosure has a 44 by 44px touch target');
  assert.doesNotMatch(mobile, /\.bookmark-page \.bookmark-card > \.item-menu[^}]*opacity:\s*1;/, 'mobile rules do not undo reduced default emphasis');
  assert.match(mobile, /\.bookmark-page \.bookmark-card \.bookmark-link\s*\{[^}]*padding-right:\s*82px;/, 'mobile bookmark links reserve space for both the favorite marker and the row menu');
  assert.match(mobile, /\.bookmark-page \.bookmark-card \.bookmark-pin-mark\s*\{[^}]*right:\s*60px;/, 'mobile favorite markers sit left of the row menu');
  assert.match(styles, /\.item-menu:not\(\.editor-extra-tools\)\s*>\s*summary\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/, 'bookmark row menus keep a 44 by 44px touch target without enlarging their icons');
});

test('deep bookmark folders show their level after indentation reaches its layout limit', async () => {
  const component = (await readFile(new URL('../../../src/features/bookmarks/BookmarkFolderTree.vue', import.meta.url), 'utf8')).replace(/\s+/g, '');
  const styles = (await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8')).replace(/\s+/g, '');

  assert.ok(component.includes('(depth||0)>=6'),'the visible level marker appears only after indentation reaches its cap');
  assert.ok(component.includes('class="bookmark-folder-depth"aria-hidden="true">{{(depth||0)+1}}层'),'the marker identifies the actual one-based level');
  assert.ok(component.includes(':aria-label="(depth||0)>=6?`第${(depth||0)+1}层：${folder.title}`:undefined"'),'assistive technology receives the level for deep folders');
  assert.ok(styles.includes('.bookmark-folder-select.bookmark-folder-depth{'),'the deep-level marker uses a scoped workspace style');
});

test('bookmark item menu actions expose explicit names and pressed state', async () => {
  const menu = await readFile(new URL('../../../src/features/bookmarks/BookmarkActionsMenu.vue', import.meta.url), 'utf8');

  assert.match(menu, /aria-label="在此分组中添加子分组"/);
  assert.match(menu, /aria-label="在此分组中添加书签"/);
  assert.match(menu, /:aria-label="item\.pinned \? '取消常用书签' : '设为常用书签'"[^>]*:aria-pressed="item\.pinned"/);
  assert.match(menu, /:aria-label="item\.kind === 'folder' \? '编辑分组' : '编辑或移动书签'"/);
  assert.match(menu, /:aria-label="item\.kind === 'folder' \? '上移分组' : '上移书签'"/);
  assert.match(menu, /:aria-label="item\.kind === 'folder' \? '下移分组' : '下移书签'"/);
  assert.match(menu, /:aria-label="item\.kind === 'folder' \? '删除分组' : '将书签移入回收站'"/);
});

test('hidden bookmark import input stays out of keyboard order and keeps its visible trigger', async () => {
  const vuePage = await readFile(new URL('../../../src/features/bookmarks/BookmarkPage.vue', import.meta.url), 'utf8');

  assert.match(vuePage, /class="visually-hidden" type="file"[^>]*aria-label="选择浏览器书签 HTML 文件" tabindex="-1"/, 'the 1px picker is programmatic and does not create an invisible Tab stop');
  assert.match(vuePage, /function dispatch\(action: BookmarkAction\)[\s\S]*?if \(action\.type === 'import'\) importInput\.value\?\.click\(\)/, 'the visible import action still opens the native picker');
  assert.match(vuePage, /<button type="button" @click="dispatch\(\{ type: 'import' \}\)">导入书签<\/button>/, 'keyboard users can reach the visible import command');
});


test('mobile navigation and bookmark hierarchy metadata remain at least 11px', async () => {
  const workspaceStyles = (await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8')).replace(/\s+/g, '');
  const appStyles = (await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8')).replace(/\s+/g, '');
  const mobile = workspaceStyles.slice(workspaceStyles.lastIndexOf('@media(max-width:720px)'));

  assert.match(workspaceStyles, /\.bookmark-directory-path\{font-size:11px/);
  assert.match(workspaceStyles, /\.bookmark-section-headingh2small\{[^}]*font-size:11px/);
  assert.match(appStyles, /\.bookmark-folder-selectsmall\{[^}]*font-size:11px/);
  assert.match(mobile, /\.bottom-navbutton\{[^}]*font-size:11px/);
});

test('moving all bookmarks to trash is reversible and does not force a backup', async () => {
  const vault={...empty,bookmarks:[{id:'root',kind:'folder',title:'根分组',children:[{id:'site',kind:'link',title:'网站',url:'https://example.com'}]}]};
  const options={};const {dom,w,saves}=await mount(vault,options);
  w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-organize]').click();
  w.document.querySelector('[data-bm-clear]').click();
  assert.equal(saves.length,0);assert.equal(options.exportedBeforeRestore,undefined);
  w.document.querySelector('[data-bm-close]').click();assert.equal(saves.length,0);
  w.document.querySelector('[data-bm-clear]').click();
  w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(saves.length,1);assert.deepEqual(saves[0].bookmarks,[]);
  assert.equal(saves[0].trash[0].item.id,'root');
  assert.deepEqual(saves[0].notes,vault.notes);assert.deepEqual(saves[0].categories,vault.categories);
  assert.equal(options.exportedBeforeRestore,undefined,'reversible deletion does not trigger backup');
  assert.equal(w.document.querySelector('[data-bm-clear]').disabled,true);
  assert.equal(w.document.querySelector('#openBookmarks .count').textContent,'0','sidebar totals follow bookmark mutations');
  w.document.querySelector('[data-trash-nav]').click();
  w.document.querySelector('[data-trash-restore]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(saves.at(-1).bookmarks[0].children[0].url,'https://example.com/');
  assert.deepEqual(saves.at(-1).trash,[]);
  dom.window.close();
});

test('moving all bookmarks to trash works without backup and rejects stale confirmation', async () => {
  const vault={...empty,bookmarks:[{id:'site',kind:'link',title:'网站',url:'https://example.com'}]};
  for(const changed of [false,true]){
    const options=changed?{}:{backupError:'备份失败'};
    const {dom,w,saves}=await mount(vault,options);
    w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-organize]').click();w.document.querySelector('[data-bm-clear]').click();
    if(changed)options.remoteUpdate({...structuredClone(vault),bookmarks:[...vault.bookmarks,{id:'new',kind:'link',title:'新网址',url:'https://example.org'}]});
    w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,0));
    if(changed){
      assert.equal(saves.length,0);
      assert.equal(w.document.querySelector('#bookmarkOverlay').classList.contains('open'),true);
      assert.match(w.document.querySelector('#bookmarkMessage').textContent,/内容已变更/);
      assert.equal(w.document.querySelectorAll('.bookmark-link').length,2);
    }else{
      assert.equal(saves.length,1,'an unavailable backup does not block a recoverable delete');
      assert.equal(saves[0].bookmarks.length,0);assert.equal(saves[0].trash.length,1);
    }
    dom.window.close();
  }
});

test('bookmark and recycle-bin mutations roll back when the Docker transaction is not confirmed', async () => {
  const bookmarkVault={...structuredClone(empty),bookmarks:[{id:'saved-folder',kind:'folder',title:'保留分组',children:[{id:'saved-link',kind:'link',title:'保留网址',url:'https://example.com'}]}],bookmarkFolderStates:{'saved-folder':true}};
  const bookmarkMount=await mount(bookmarkVault,{commitError:'Docker 服务端保存失败'});
  const bookmarkGeneration=bookmarkMount.w.vaultDataStore.generation;
  bookmarkMount.w.document.querySelector('#openBookmarks').click();
  bookmarkMount.w.document.querySelector('[data-bm-organize]').click();
  bookmarkMount.w.document.querySelector('[data-bm-clear]').click();
  bookmarkMount.w.document.querySelector('#bookmarkForm').dispatchEvent(new bookmarkMount.w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(bookmarkMount.w.document.querySelector('#bookmarkTree').textContent,/保留分组/);
  assert.deepEqual(bookmarkMount.saves.at(-1).bookmarks,[],'the failed candidate reached the mocked transaction boundary');
  assert.ok(bookmarkMount.w.vaultDataStore.generation>bookmarkGeneration,'bookmark mutation and rollback both pass through the Vault store');
  bookmarkMount.dom.window.close();

  const note={id:'retained-trash',title:'保留在回收站',type:'note',category:'开发',tags:[],body:'<p>内容</p>',source:'',created:1,updated:2,pinned:false,status:'published'};
  const trashMount=await mount({...structuredClone(empty),trash:[createTrashEntry('note',note,{index:0})]},{commitError:'Docker 服务端保存失败'});
  const trashGeneration=trashMount.w.vaultDataStore.generation;
  trashMount.w.document.querySelector('[data-trash-nav]').click();
  const clearTrashButton=trashMount.w.document.querySelector('[data-trash-clear]');
  assert.ok(clearTrashButton.classList.contains('secondary-btn') && clearTrashButton.classList.contains('trash-clear-btn'));
  assert.equal(clearTrashButton.classList.contains('danger-btn'),false,'the page-level action follows the theme and uses a subdued destructive treatment');
  trashMount.w.document.querySelector('[data-trash-clear]').click();
  trashMount.w.document.querySelector('#trashClearOverlay form').dispatchEvent(new trashMount.w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(trashMount.w.document.querySelector('#main').textContent,/保留在回收站/);
  assert.ok(trashMount.w.vaultDataStore.generation>trashGeneration,'recycle-bin mutation and rollback both pass through the Vault store');
  trashMount.dom.window.close();
});

test('typed dashboard add-bookmark command opens the Pinia editor without creating a legacy bookmark dialog',async t=>{
  const {dom,w}=await mount(structuredClone(empty),{readerBridge:true});
  t.after(()=>dom.window.close());
  w.navigationActionsStore.execute({type:'add-bookmark'});
  assert.equal(w.workspaceNavigationStore.page,'bookmarks');
  assert.equal(JSON.stringify(w.bookmarkDataStore.dispatched),JSON.stringify([{type:'add-link',parentId:''}]));
  assert.equal(w.bookmarkDataStore.editor.kind,'link');
  assert.equal(w.document.querySelector('#bookmarkOverlay'),null);
});

test('dashboard bookmark SVGs use bounded shared icon wrappers', async () => {
  const component = await readFile(new URL('../../../src/features/dashboard/DashboardBookmarkTree.vue', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  assert.match(component, /class="dashboard-group-icon"><span class="ico"><svg/, 'folder icons need the shared SVG sizing wrapper');
  assert.match(component, /class="dashboard-preview-icon"><span class="ico"><svg/, 'bookmark preview icons need the shared SVG sizing wrapper');
  assert.match(styles, /\.dashboard-group-icon \.ico\{width:17px;height:17px\}/);
  assert.match(styles, /\.dashboard-preview-icon \.ico\{width:12px;height:12px\}/);
});

test('bookmark cards use each website favicon and retain initials when it fails', async () => {
  const vault = { ...empty, bookmarks:[
    { id:'apple', kind:'link', title:'Apple', url:'https://www.apple.com/iphone/?source=bookmark' },
    { id:'google', kind:'link', title:'Google', url:'https://www.google.com/search?q=notes' }
  ] };
  const { dom, w } = await mount(vault);
  w.document.querySelector('#openBookmarks').click();
  const icons = [...w.document.querySelectorAll('.bookmark-site-icon')];
  const images = [...w.document.querySelectorAll('.bookmark-site-favicon')];
  assert.deepEqual(images.map(image => image.getAttribute('src')), [
    'https://www.apple.com/favicon.ico',
    'https://www.google.com/favicon.ico'
  ]);
  assert.ok(images.every(image => image.getAttribute('loading') === 'lazy' && image.getAttribute('referrerpolicy') === 'no-referrer'));
  images[0].dispatchEvent(new w.Event('load'));
  assert.equal(icons[0].classList.contains('has-favicon'), true);
  images[1].dispatchEvent(new w.Event('error'));
  assert.equal(icons[1].querySelector('.bookmark-site-favicon'), null);
  assert.equal(icons[1].querySelector('.bookmark-site-initials').textContent, 'GO');
  dom.window.close();
});

test('bookmark Vue snapshot and actions stay connected to the saved bookmark model', async () => {
  const vault = { ...empty, bookmarks:[{ id:'vue-folder', kind:'folder', title:'文档', children:[
    { id:'vue-link', kind:'link', title:'MDN', url:'https://developer.mozilla.org/' }
  ] }] };
  const { dom, w } = await mount(vault);
  const main = w.document.createElement('main');
  const saves = [];
  const viewState = { closed:new Set(), selected:new Set(), query:'', organizing:false, selectedFolder:'', pinnedOnly:false, directoryOpen:true };
  const view = createBookmarkView({
    main,
    getData:() => vault,
    save:async () => { saves.push(structuredClone(vault)); },
    download:() => {},
    notify:() => {},
    viewState,
    onChange:() => {}
  });
  const snapshot = () => view.snapshot();

  view.render();
  assert.equal(snapshot().folderCount, 1);
  assert.equal(snapshot().sections[0].links[0].id, 'vue-link');
  view.dispatch({ type:'select-folder', id:'vue-folder' });
  assert.equal(viewState.selectedFolder, 'vue-folder', 'the controller writes the shared view state directly');
  assert.equal(snapshot().selectedPath, '文档');
  assert.deepEqual(snapshot().sections.map(section => section.title), ['文档']);
  view.dispatch({ type:'toggle-organizing' });
  assert.equal(viewState.organizing, true);
  assert.equal(snapshot().organizing, true);
  view.dispatch({ type:'search', query:'not-found' });
  assert.equal(viewState.query, 'not-found');
  assert.equal(snapshot().sections[0].emptyMessage, '当前分组“文档”中没有找到匹配的书签。');
  view.dispatch({ type:'search', query:'developer.mozilla.org' });
  assert.equal(snapshot().sections[0].links[0].id, 'vue-link');
  await view.dispatch({ type:'toggle-pin', id:'vue-link' });
  assert.equal(vault.bookmarks[0].children[0].pinned, true);
  assert.equal(saves.length, 1, 'bookmark actions continue to use the configured persistence boundary');
  assert.equal(snapshot().sections[0].links[0].pinned, true);
  dom.window.close();
});

test('bookmark navigation edits nested groups and links, moves safely and preserves contents on group deletion', async () => {
  const vault = { ...empty, bookmarks:[{ id:'group', kind:'folder', title:'开发', children:[{ id:'child', kind:'folder', title:'文档', children:[{ id:'site', kind:'link', title:'MDN', url:'https://developer.mozilla.org/' }] }] }] };
  const { dom, w, saves } = await mount(vault);
  const click = selector => w.document.querySelector(selector).click();
  click('#openBookmarks');
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent, '书签导航');
  assert.equal(w.document.querySelector('.bookmark-link').target, '_blank');
  assert.equal(w.document.querySelector('[data-bm-edit]').closest('details').open,false);
  click('[data-bm-organize]');
  click('[data-bm-edit="site"]');
  w.document.querySelector('#bmName').value = 'Web 文档';
  w.document.querySelector('#bmParent').value = '';
  w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saves.at(-1).bookmarks[1].title, 'Web 文档');
  assert.equal(saves.at(-1).bookmarks[0].children[0].children.length, 0);
  click('[data-bm-edit="group"]');
  assert.ok(![...w.document.querySelector('#bmParent').options].some(x => ['group','child'].includes(x.value)), 'cannot move a group inside itself or descendants');
  click('[data-bm-close]');
  click('[data-bm-delete="group"]');
  assert.equal(w.document.querySelector('#bmDeleteMode').value, 'keep');
  w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(saves.at(-1).bookmarks.map(x=>x.id), ['child','site']);
  assert.equal(saves.at(-1).trash[0].item.id,'group');
  assert.deepEqual(saves.at(-1).trash[0].releasedChildren,['child']);
  w.document.querySelector('[data-trash-nav]').click();
  w.document.querySelector('[data-trash-restore]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(saves.at(-1).bookmarks,[
    {id:'group',kind:'folder',title:'开发',children:[{id:'child',kind:'folder',title:'文档',children:[]}]},
    {id:'site',kind:'link',title:'Web 文档',url:'https://developer.mozilla.org/'}
  ]);
  assert.deepEqual(saves.at(-1).trash,[]);
  dom.window.close();
});

test('bookmark HTML import previews cross-group deduplication and escapes imported names', async () => {
  const options = {};
  const initialVault = { ...empty, bookmarks: [{ id:'existing', kind:'folder', title:'已有分组', children:[
    { id:'existing-link', kind:'link', title:'已保存', url:'https://example.com/shared?item=1' }
  ] }] };
  const { dom, w, saves } = await mount(initialVault, options);
  w.document.querySelector('#openBookmarks').click();
  const input = w.document.querySelector('input[accept=".html,.htm"]');
  const html = '<DL><DT><H3>开发</H3><DL><DT><A HREF="https://EXAMPLE.com:443/shared?item=1">已有链接</A><DT><A HREF="https://example.com/new?item=1">&lt;img src=x onerror=alert(1)&gt;</A></DL><DT><H3>生活</H3><DL><DT><A HREF="https://EXAMPLE.com:443/new?item=1">跨组重复</A><DT><A HREF="https://example.com/new?item=2">不同参数</A></DL></DL>';
  Object.defineProperty(input, 'files', { value:[{ size:html.length, text:async()=>html }] });
  await input.onchange();
  const previewText = w.document.querySelector('#bookmarkOverlay').textContent;
  const savesBeforeConfirmation = saves.length;
  w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const savedGroups = saves.at(-1)?.bookmarks.slice(1).map(folder => folder.children.map(link => link.url));
  const savedTitles = [...w.document.querySelectorAll('.bookmark-link strong')].map(element => element.textContent);
  const unsafeImageCount = w.document.querySelectorAll('#bookmarkTree img:not(.bookmark-site-favicon)').length;
  dom.window.close();

  assert.match(previewText, /新增 2 个书签 · 跳过 2 个重复项/);
  assert.equal(savesBeforeConfirmation, 0, 'preview does not persist bookmarks');
  assert.equal(options.exportedBeforeRestore, undefined, 'bookmark HTML import does not force a full backup download');
  assert.deepEqual(savedGroups, [
    ['https://example.com/new?item=1'],
    ['https://example.com/new?item=2']
  ]);
  assert.equal(unsafeImageCount, 0);
  assert.ok(savedTitles.includes('<img src=x onerror=alert(1)>'));
});

test('bookmark browse and organize modes preserve hierarchy, folder scope and cloud-persisted favorites', async () => {
  const vault = { ...empty, bookmarks:[
    { id:'rootlink', kind:'link', title:'根目录网站', url:'https://root.example/' },
    { id:'parent', kind:'folder', title:'开发', children:[
      { id:'first', kind:'link', title:'GitHub', url:'https://github.com/' },
      { id:'nested', kind:'folder', title:'文档', children:[{ id:'second', kind:'link', title:'MDN', url:'https://developer.mozilla.org/' }] }
    ]},
    { id:'other', kind:'folder', title:'生活', children:[{ id:'third', kind:'link', title:'生活网站', url:'https://life.example/' }] }
  ] };
  const { dom, w, saves, initialOptions } = await mount(vault);
  const click = selector => w.document.querySelector(selector).click();
  click('#openBookmarks');
  assert.equal(w.document.querySelector('[data-open-pinned-bookmarks]'), null, 'the bookmarks toolbar is the only favorites navigation entry');
  assert.equal(w.document.querySelectorAll('.bookmark-card').length, 4);
  assert.equal(w.document.querySelector('[data-bm-import]').closest('details').open,false);
  const directory = w.document.querySelector('.bookmark-directory');
  assert.equal(directory.open, true);
  directory.open = false;
  directory.dispatchEvent(new w.Event('toggle'));
  assert.equal(saves.at(-1).bookmarkDirectoryOpen,false,'directory visibility is saved for the account');
  directory.open = true;
  directory.dispatchEvent(new w.Event('toggle'));
  click('[data-bm-toggle="parent"]');
  assert.equal(w.document.querySelector('#bm-children-parent').hidden, true);
  assert.deepEqual(saves.at(-1).bookmarkFolderStates,{parent:false},'folder tree expansion is saved for the account');
  assert.equal(w.document.querySelector('.bookmark-directory').open, true);
  initialOptions.remoteUpdate(structuredClone(saves.at(-1)));
  assert.equal(w.document.querySelector('.bookmark-directory').open,true,'a server update keeps the account directory preference');
  assert.equal(w.document.querySelector('#bm-children-parent').hidden,true,'a server update restores the account folder preference');
  click('[data-bm-folder="parent"]');
  assert.deepEqual([...w.document.querySelectorAll('.bookmark-link strong')].map(x=>x.textContent), ['GitHub','MDN']);
  assert.equal(w.document.querySelector('[data-bm-folder="parent"]').getAttribute('aria-current'), 'page');
  assert.ok(saves.length>=3,'account preferences are persisted before content edits');
  click('[data-bm-organize]');
  assert.equal(w.document.querySelector('[data-bm-organize]').getAttribute('aria-pressed'), 'true');
  assert.equal(w.document.querySelector('.bookmark-directory').open, true);
  click('[data-bm-pin="second"]');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(saves.at(-1).bookmarks[1].children[1].children[0].pinned, true);
  click('[data-bm-organize]');
  click('[data-bm-folder=""]');
  const allTitles = [...w.document.querySelectorAll('.bookmark-link strong')].map(node => node.textContent);
  assert.equal(allTitles.length, 4);
  assert.equal(new Set(allTitles).size, 4, 'all-bookmarks view lists each link only under its folder');
  assert.equal(w.document.querySelector('.bookmark-favorites'), null, 'the all-bookmarks view does not repeat the favorites filter');
  click('[data-bm-pinned]');
  assert.equal(w.document.querySelectorAll('.bookmark-card').length, 1, 'favorites remain available as a dedicated filter');
  assert.equal(w.document.querySelector('.bookmark-link strong').textContent, 'MDN');
  click('[data-bm-pinned]');
  click('[data-bm-folder=""]');

  assert.equal(w.document.querySelectorAll('.bookmark-actions').length, 0);
  const search = w.document.querySelector('#bookmarkSearch'); search.value = '文档'; search.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelectorAll('.bookmark-card').length, 1, 'global search matches folder path and does not duplicate favorite');
  assert.equal(w.document.querySelector('.bookmark-link strong').textContent, 'MDN');
  assert.equal(saves.at(-1).bookmarks.length, 3, 'pinning does not move or duplicate source bookmarks');
  dom.window.close();
});

test('bookmark card sorting moves among visible siblings without moving subfolders or their contents', async () => {
  const vault = { ...empty, bookmarks:[{ id:'sortgroup', kind:'folder', title:'分组', children:[
    { id:'sorta', kind:'link', title:'网站 A', url:'https://a.example/' },
    { id:'sortchild', kind:'folder', title:'子分组', children:[{ id:'nestedsite', kind:'link', title:'子网站', url:'https://nested.example/' }] },
    { id:'sortb', kind:'link', title:'网站 B', url:'https://b.example/' }
  ] }] };
  const { dom, w, saves } = await mount(vault);
  w.document.querySelector('#openBookmarks').click();
  w.document.querySelector('[data-bm-organize]').click();
  w.document.querySelector('[data-bm-up="sortb"]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(saves.at(-1).bookmarks[0].children.map(x=>x.id), ['sortb','sortchild','sorta']);
  assert.equal(saves.at(-1).bookmarks[0].children[1].children[0].id, 'nestedsite');
  assert.deepEqual([...w.document.querySelectorAll('.bookmark-link strong')].map(x=>x.textContent), ['网站 B','网站 A','子网站']);
  assert.equal(w.document.querySelector('[data-bm-up="sortb"]').disabled, true);
  dom.window.close();
});

test('bookmark bulk move selects only the current group and preserves nested folders and ordering',async()=>{
 const {dom,w,saves}=await mount(designVault());w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-folder="d-root"]').click();w.document.querySelector('[data-bm-organize]').click();
 w.document.querySelector('[data-bm-select-all]').click();assert.match(w.document.querySelector('#bookmarkSelection').textContent,/已选 2 \/ 2/);
 assert.equal(w.document.querySelectorAll('[data-bm-select]:checked').length,2);
 assert.equal(saves.length,0);w.document.querySelector('[data-bm-move-selected]').click();w.document.querySelector('#bmBulkParent').value='d-other';
 w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(saves.length,1);assert.deepEqual(saves[0].bookmarks[0].children.map(n=>n.id),['d-child']);assert.deepEqual(saves[0].bookmarks[0].children[0].children,[]);
 assert.deepEqual(saves[0].bookmarks[1].children.map(n=>n.id),['d-c','d-a','d-b']);assert.equal(saves[0].bookmarks[1].children[1].pinned,true);
 assert.match(w.document.querySelector('#bookmarkSelection').textContent,/已选 0/);dom.window.close();
});

test('bookmark bulk delete moves only selected search results to trash without deleting groups',async()=>{
 const options={};const {dom,w,saves}=await mount(designVault(),options);w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-organize]').click();
 const search=w.document.querySelector('#bookmarkSearch');search.value='文档';search.dispatchEvent(new w.Event('input'));
 w.document.querySelector('[data-bm-select-all]').click();assert.equal(w.document.querySelectorAll('[data-bm-select]:checked').length,1);
 assert.match(w.document.querySelector('#bookmarkSelection').textContent,/全选搜索结果/);w.document.querySelector('[data-bm-delete-selected]').click();
 assert.equal(saves.length,0);w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(options.exportedBeforeRestore,undefined);
 assert.equal(saves.length,1);assert.deepEqual(saves[0].bookmarks[0].children[1].children,[]);assert.equal(saves[0].bookmarks[0].children[0].id,'d-a');assert.equal(saves[0].bookmarks[1].children[0].id,'d-c');assert.equal(saves[0].trash[0].item.id,'d-b');assert.deepEqual(saves[0].notes,designVault().notes);dom.window.close();
});

test('bookmark bulk delete is reversible without backup and leaving clears selections',async()=>{
 for(const changed of [false,true]){
 const options=changed?{}:{backupError:'备份失败'};const {dom,w,saves}=await mount(designVault(),options);
 w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-organize]').click();w.document.querySelector('[data-bm-select-all]').click();w.document.querySelector('[data-bm-delete-selected]').click();
 if(changed){const next=designVault();next.bookmarks[1].title='远端新分组';options.remoteUpdate(next)}
 w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 if(changed){assert.equal(saves.length,0);assert.match(w.document.querySelector('#bookmarkMessage').textContent,/内容已变更/);w.document.querySelector('[data-bm-close]').click()}
 else{assert.equal(saves.length,1);assert.equal(saves[0].trash.length,3,'all selected links moved into the bin');w.document.querySelector('[data-bm-close]').click()}
 w.document.querySelector('#brandHome').click();w.document.querySelector('#openBookmarks').click();
 assert.equal(w.document.querySelector('[data-bm-organize]').getAttribute('aria-pressed'),'false');assert.equal(w.document.querySelector('#bookmarkSelection').textContent,'');dom.window.close();
 }
});

test('bookmark search is confined to the selected group and browser mode keeps direct opening available',async()=>{
 const {dom,w,saves}=await mount(designVault());w.document.querySelector('#openBookmarks').click();w.document.querySelector('[data-bm-folder="d-root"]').click();
 const search=w.document.querySelector('#bookmarkSearch');search.value='生活';search.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.querySelectorAll('.bookmark-link').length,0);
 search.value='文档';search.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelectorAll('.bookmark-link').length,1);
 w.document.querySelector('[data-bm-organize]').click();const link=w.document.querySelector('.bookmark-link');const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});assert.equal(link.dispatchEvent(click),false);assert.equal(w.document.querySelector('[data-bm-select]').checked,true);
 w.document.querySelector('[data-bm-organize]').click();assert.equal(w.document.querySelector('.bookmark-link').target,'_blank');assert.equal(w.document.querySelector('.bookmark-card .item-menu').open,false);assert.equal(saves.length,0);dom.window.close();
});
