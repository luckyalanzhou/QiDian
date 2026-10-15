import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createQidianEditor } from '../src/editor.js';
import { TextSelection } from '@tiptap/pm/state';
import { DEFAULT_NOTE_TYPES, validateVault } from '../server/validation.js';
import { createBookmarkView } from '../src/bookmarks.js';
import { createRecycleBinView } from '../src/recycle-bin.js';
import { createTrashEntry, pruneExpiredTrash, restoreTrashEntry, TRASH_RETENTION_MS } from '../src/trash-data.js';
import { renderReleaseNotes } from '../src/release-notes.js';
import { classifyClipboard, plainTextToDocument, sanitizeMarkdownDocument } from '../src/paste.js';
import { qidianSchema } from '../src/markdown.js';
const loadMarkdownTools = async () => import('../src/markdown.js');
const empty = { categories: ['开发'], noteTypes:[{id:'note',name:'普通笔记'},{id:'clip',name:'网页收藏'},{id:'command',name:'命令速查'},{id:'issue',name:'故障排查'}], notes: [], theme:'light', pasteMode:'rich' };
test('vault validation defaults legacy data to an empty trash and validates stored items', () => {
  const note={id:'old-note',title:'旧笔记',type:'note',category:'开发',tags:[],body:'<p>内容</p>',source:'',created:1,updated:2,pinned:false};
  assert.deepEqual(validateVault(structuredClone(empty)).trash,[]);
  const deleted={...createTrashEntry('note',note,{index:0}),deletedAt:100};
  const validated=validateVault({...structuredClone(empty),trash:[deleted]});
  assert.equal(validated.trash[0].item.title,'旧笔记');
  assert.throws(()=>validateVault({...structuredClone(empty),trash:[{...deleted,deletedAt:-1}]}),/删除时间无效/);
  assert.throws(()=>validateVault({...structuredClone(empty),notes:[note],trash:[deleted]}),/笔记编号无效或重复/);
});
test('trash expiration is exact at 30 days and restoring notes returns them to the vault', () => {
  const note={id:'restore-note',title:'还原测试',type:'note',category:'开发',tags:[],body:'<p>保留内容</p>',source:'',created:1,updated:2,pinned:false};
  const data={...structuredClone(empty),notes:[],trash:[createTrashEntry('note',note,{index:0}, {}, 100)]};
  assert.equal(pruneExpiredTrash(data,100+TRASH_RETENTION_MS-1),0);
  assert.equal(pruneExpiredTrash(data,100+TRASH_RETENTION_MS),1);
  data.trash=[createTrashEntry('note',note,{index:0}, {}, 200)];
  restoreTrashEntry(data,data.trash[0].id);
  assert.equal(data.notes[0].body,note.body);assert.deepEqual(data.trash,[]);
});
test('product branding shows the name without repeated promotional taglines', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  const { document } = dom.window;
  assert.equal(document.title, '栖点');
  assert.equal(document.querySelector('.auth-brand strong').textContent, '栖点');
  assert.equal(document.querySelector('#brandHome .brand-copy strong').textContent, '栖点');
  assert.equal(document.querySelector('.auth-brand span'), null);
  assert.equal(document.querySelector('#brandHome .brand-copy span'), null);
  assert.equal(document.querySelector('.side-footer'), null);
  const settingsIcon=document.querySelector('#i-settings');
  assert.equal(settingsIcon.querySelector('path').hasAttribute('transform'),false,'the settings gear is centered directly in its viewBox');
  assert.equal(document.querySelector('#openAppSettings use').getAttribute('href'),'#i-settings');
  dom.window.close();
});
async function mount(vault=empty, initialOptions={}) {
  const dom = new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'), { url:'http://localhost', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window; const saves = [];
  let systemDark=!!initialOptions.systemDark;const systemThemeListeners=new Set();
  w.matchMedia=query=>({media:query,get matches(){return query==='(prefers-color-scheme: dark)'&&systemDark},addEventListener:(type,listener)=>{if(type==='change')systemThemeListeners.add(listener)},removeEventListener:(type,listener)=>{if(type==='change')systemThemeListeners.delete(listener)} });
  initialOptions.setSystemDark=dark=>{systemDark=dark;for(const listener of systemThemeListeners)listener({matches:dark,media:'(prefers-color-scheme: dark)'})};
  w.structuredClone = structuredClone;
  for (const [key,value] of Object.entries(initialOptions.localStorage || {})) w.localStorage.setItem(key,value);
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'DOMParser', 'getComputedStyle', 'Event', 'CustomEvent']) Object.defineProperty(globalThis, key, { configurable:true, value:w[key] });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable:true, value:w.requestAnimationFrame.bind(w) });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable:true, value:w.cancelAnimationFrame.bind(w) });
  w.DEFAULT_NOTE_TYPES = DEFAULT_NOTE_TYPES;
  w.validateVault = validateVault;
  w.createBookmarkView = createBookmarkView;
  w.createRecycleBinView = createRecycleBinView;
  w.createTrashEntry = createTrashEntry;
  w.DOMPurify = createDOMPurify(w); w.initial = { data: structuredClone(vault), local:true, ...initialOptions };
  w.queueSave = data => saves.push(structuredClone(data)); w.flush = async () => { initialOptions.flushCalls=(initialOptions.flushCalls||0)+1; return initialOptions.flushResult??true; }; w.retrySync = () => { initialOptions.retryRequests = (initialOptions.retryRequests || 0) + 1; return true; }; w.onStatus = callback => { if (initialOptions.restoreConflict) callback('草稿与 Docker 服务端版本冲突；请导出后再载入服务端版本'); }; w.onAuthenticationRequired = callback => { initialOptions.authenticationRequired = callback; }; w.onRemoteUpdate = callback => { initialOptions.remoteUpdate = callback; }; w.getSyncConflict = () => initialOptions.syncConflict ? structuredClone(initialOptions.syncConflict) : null; w.exportSyncConflict = async () => { initialOptions.conflictExports = (initialOptions.conflictExports || 0) + 1; return true; }; w.refreshCloud = async () => false; w.reauthenticateAccount = async () => ({ data:structuredClone(vault), conflict:false, synced:true }); w.showAuthentication = (_config,recovery) => { initialOptions.reauthentication = recovery; return Promise.resolve(); }; w.setOwner = () => {};
  const editorFactory = options => { w.currentEditor = createQidianEditor(options); return w.currentEditor; };
  w.createQidianEditor = editorFactory; w.__qidianTestEditorFactory = editorFactory;
  w.listBackups = async () => initialOptions.backups || [];
  w.getSystemVersion = async () => typeof initialOptions.versionInfo==='function' ? initialOptions.versionInfo() : initialOptions.versionInfo || ({ currentVersion:'0.1.5', latestVersion:'0.1.6', updateAvailable:true, canUpdateDevice:true, installerAvailable:true, updaterAvailable:true, releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6', notes:'修复问题\n<img src=x onerror=alert(1)>' });
  w.getSystemUpdateStatus = async () => typeof initialOptions.updateStatus==='function' ? initialOptions.updateStatus() : initialOptions.updateStatus || ({ state:'idle', version:'', updatedAt:null, log:'' });
  w.requestSystemUpdate = async () => { assert.ok(initialOptions.flushCalls>0,'pending edits are flushed before the container restarts'); initialOptions.updateRequests=(initialOptions.updateRequests||0)+1; return initialOptions.onRequestSystemUpdate ? initialOptions.onRequestSystemUpdate() : { accepted:true, version:'0.1.6' }; };
  w.getBackup = async revision => { initialOptions.requestedBackup = revision; return structuredClone(initialOptions.snapshot || ({ categories:[], noteTypes:structuredClone(empty.noteTypes), notes:[], theme:'light', pasteMode:'rich', revision })); };
  w.exportBackup = async data => { if(initialOptions.backupError)throw Error(initialOptions.backupError); if(initialOptions.onBackup)await initialOptions.onBackup(); initialOptions.exportedBeforeRestore = structuredClone(data); };
  w.download = () => {};
  w.restoreIgnoredDraft = async () => ({ data: structuredClone(vault), conflict:false });
  w.hasUnsaved = () => false; w.scrollTo = () => {}; w.confirm = () => true;
  const appSource = (await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const start = appSource.indexOf("const authGate = document.querySelector('#loginGate');");
  const end = appSource.lastIndexOf('\n})();\n}');
  assert.ok(start >= 0 && end > start, 'workspace entrypoint should remain available to DOM tests');
  const runWorkspace = w.Function('initial', 'createQidianEditor', 'flush', 'classifyClipboard', 'plainTextToDocument', 'sanitizeMarkdownDocument', 'loadMarkdownTools', 'createRecycleBinView', 'createTrashEntry', 'APP_VERSION', 'renderReleaseNotes', appSource.slice(start, end + '\n})();'.length));
  runWorkspace(w.initial, editorFactory, w.flush, classifyClipboard, plainTextToDocument, sanitizeMarkdownDocument, loadMarkdownTools, createRecycleBinView, createTrashEntry, initialOptions.appVersion || '0.1.5', renderReleaseNotes);
  await new Promise(resolve=>setTimeout(resolve,0));
  return { dom, w, saves, initialOptions };
}
async function mountAuth(registrationEnabled=true, sessionConfig=null, loginAccount=async()=>({ data:{ notes:[] }, local:false })) {
  const dom = new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'), { url:'http://localhost', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window, appSource = (await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const start = appSource.indexOf('async function showAuthentication(sessionConfig = null, recovery = null) {');
  const end = appSource.indexOf('\nfunction launchWorkspace(initial) {', start);
  assert.ok(start >= 0 && end > start, 'authentication view should remain independently testable');
  const counters={configRequests:0,bootstrapCalls:0};
  const showAuthentication = w.Function('getAuthConfig','showStartupError','registerAccount','loginAccount','bootstrap','launchWorkspace', `${appSource.slice(start,end)}\nreturn showAuthentication;`)(async()=>{counters.configRequests++;return {registrationEnabled}},()=>{},async()=>{},loginAccount,async()=>{counters.bootstrapCalls++;return { data:{ notes:[] }, local:false }},()=>{});
  await showAuthentication(sessionConfig);
  return { dom, w, counters, showAuthentication };
}
test('login page opens registration and returns to login', async () => {
  const { dom, w } = await mountAuth(true);
  assert.equal(w.document.querySelector('input[type="email"]'), null);
  assert.equal(w.document.querySelector('#authUsername').name, 'username');
  assert.equal(w.document.querySelector('#authUsername').minLength, 3);
  assert.equal(w.document.querySelector('#authUsername').maxLength, 32);
  assert.doesNotMatch(w.document.querySelector('#loginGate').textContent, /忘记密码|找回密码/);
  assert.equal(w.document.querySelector('.auth-tabs'), null);
  assert.equal(w.document.querySelector('#authRegister').hidden, false);
  w.document.querySelector('#authRegister').click();
  assert.equal(w.document.querySelector('#authTitle').textContent, '创建个人账号');
  assert.equal(w.document.querySelector('.auth-card').classList.contains('registering'), true);
  assert.equal(w.document.querySelector('#authReturnLogin').hidden, false);
  w.document.querySelector('#authReturnLogin').click();
  assert.equal(w.document.querySelector('#authTitle').textContent, '进入你的知识库');
  assert.equal(w.document.querySelector('.auth-card').classList.contains('registering'), false);
  dom.window.close();
});
test('registration entry stays hidden when the backend disables registration', async () => {
  const { dom, w } = await mountAuth(false);
  assert.equal(w.document.querySelector('#authRegister').hidden, true);
  dom.window.close();
});
test('a fresh self-hosted install opens administrator setup with admin prefilled and no default password', async () => {
  const { dom, w } = await mountAuth(true, { registrationEnabled:true, setupRequired:true });
  assert.equal(w.document.querySelector('#authTitle').textContent, '创建管理员账号');
  assert.equal(w.document.querySelector('.auth-card').classList.contains('registering'), true);
  assert.equal(w.document.querySelector('#authUsername').value, 'admin');
  assert.equal(w.document.querySelector('#authPassword').value, '');
  assert.equal(w.document.querySelector('#authReturnLogin').hidden, true);
  assert.equal(w.document.querySelector('#authSubmit').textContent, '创建管理员');
  dom.window.close();
});
test('an unauthenticated session response supplies registration settings without a second config request', async () => {
  const { dom, w, counters } = await mountAuth(true, { registrationEnabled:false });
  assert.equal(counters.configRequests, 0);
  assert.equal(w.document.querySelector('#authRegister').hidden, true);
  dom.window.close();
});

test('topbar version badge shows release details and the unified action refreshes versions before automatically updating', async () => {
  let versionChecks=0;
  const versions=[
    {currentVersion:'0.1.5',latestVersion:'0.1.5',updateAvailable:false,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.5',notes:'当前版本说明\n<img src=x onerror=alert(1)>'},
    {currentVersion:'0.1.5',latestVersion:'0.1.6',updateAvailable:true,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',notes:'修复问题\n<img src=x onerror=alert(1)>'}
  ];
  const { dom, w, initialOptions } = await mount(empty,{versionInfo:()=>{versionChecks++;return versions.shift()||versions.at(-1)}});
  const badge=w.document.querySelector('#versionButton');
  assert.equal(badge.previousElementSibling.id,'searchTop','the version badge sits beside the top-bar search');
  assert.equal(badge.nextElementSibling.id,'themeMenuRoot','the version badge remains beside the theme control in the utility action cluster');
  assert.ok(badge.nextElementSibling.querySelector('#themeBtn'));
  assert.equal(w.document.querySelector('#currentVersionLabel').textContent,'v0.1.5');
  assert.equal(badge.dataset.updateAvailable,'false');
  assert.equal(w.document.querySelector('#appSettingsOverlay').textContent.includes('版本信息'),false,'version details should live in the top bar, not settings');
  badge.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.document.querySelector('#versionInfoOverlay').classList.contains('open'),true);
  assert.equal(w.document.querySelector('#versionInfoTitle').textContent,'版本信息');
  assert.equal(w.document.querySelector('#installedVersion').textContent,'0.1.5');
  assert.equal(w.document.querySelector('#latestVersion').textContent,'0.1.5');
  assert.equal(badge.dataset.updateAvailable,'false');
  assert.doesNotMatch(badge.getAttribute('aria-label'),/发现新版本/);
  assert.match(w.document.querySelector('#releaseNotes').textContent,/<img src=x/);
  assert.equal(w.document.querySelector('#releaseNotes img'),null,'release notes render as safe text, not HTML');
  assert.equal(w.document.querySelector('#latestVersionLabel').textContent,'最新版本');
  assert.equal(versionChecks,1);
  const button=w.document.querySelector('#checkAndUpdateVersion'),progress=w.document.querySelector('#updateProgress'),actions=button.parentElement;
  assert.equal(button.textContent,'检查并更新');assert.equal(button.disabled,false);
  assert.equal(w.document.querySelector('#releaseLink').textContent,'Release');
  assert.equal(w.document.querySelector('#refreshVersion'),null);
  assert.equal(w.document.querySelector('#installVersion'),null);
  assert.equal(progress.parentElement.classList.contains('version-dialog-foot'),true);
  assert.ok(progress.compareDocumentPosition(actions)&w.Node.DOCUMENT_POSITION_FOLLOWING,'progress and live log sit above the Release and update actions');
  assert.equal(w.document.querySelector('#updateProgressTrack').nextElementSibling.id,'updateProgressLog','the live log sits directly below the progress bar');
  button.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(versionChecks,2,'the combined action fetches fresh release metadata when clicked');
  assert.equal(w.document.querySelector('#latestVersion').textContent,'0.1.6');
  assert.equal(badge.dataset.updateAvailable,'true');
  assert.equal(initialOptions.updateRequests,1);
  assert.match(w.document.querySelector('#versionState').textContent,/已提交/);
  assert.match(w.document.querySelector('#updateProgressLog').textContent,/发现新版本 v0\.1\.6/);
  dom.window.close();
});
test('version details reuse the startup release check and refresh cached information without blocking the dialog', async () => {
  let resolveVersion,versionChecks=0;
  const info={currentVersion:'0.1.5',latestVersion:'0.1.6',updateAvailable:true,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',notes:'## 新版本说明\n\n修复问题。'};
  const {dom,w}=await mount(empty,{local:false,versionInfo:()=>{versionChecks++;return new Promise(resolve=>{resolveVersion=resolve})}});
  assert.equal(versionChecks,1,'authenticated startup starts one release check');
  const badge=w.document.querySelector('#versionButton');
  badge.click();
  assert.equal(w.document.querySelector('#versionInfoOverlay').classList.contains('open'),true,'the dialog opens before the release request finishes');
  assert.equal(versionChecks,1,'opening the dialog reuses the in-flight startup request');
  assert.equal(w.document.querySelector('#installedVersion').textContent,'0.1.5','the bundled version is shown while the first check is pending');
  resolveVersion(info);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.document.querySelector('#latestVersion').textContent,'0.1.6');
  assert.match(w.document.querySelector('#releaseNotes').textContent,/修复问题/);
  badge.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(versionChecks,1,'reopening within the cache window does not request the same release again');
  dom.window.close();
});
test('the unified update action remains available when current and reports a completed check without deploying', async () => {
  const { dom, w } = await mount(empty, { versionInfo:{currentVersion:'0.1.6',latestVersion:'0.1.6',updateAvailable:false,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',notes:'## 本版优化与新增\n\n1. 修复问题。'} });
  w.document.querySelector('#versionButton').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(w.document.querySelector('#versionState').textContent,/当前已是最新版本/);
  const button=w.document.querySelector('#checkAndUpdateVersion');
  assert.equal(button.textContent,'检查并更新');assert.equal(button.disabled,false);
  button.click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.document.querySelector('#updateProgressTrack').dataset.mode,'complete');
  assert.match(w.document.querySelector('#updateProgressLog').textContent,/当前已是最新版本 v0\.1\.6/);
  assert.equal(w.document.querySelector('#updateProgressTrack').getAttribute('aria-valuenow'),'100');
  dom.window.close();
});
test('mobile version details stay in a compact centered panel', async () => {
  const styles=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(styles, /@media\(max-width:560px\)\{#versionInfoOverlay\{align-items:center;/);
  assert.match(styles, /\.release-notes\{min-height:42px;max-height:160px;font-size:13\.5px/);
  assert.match(styles, /\.update-progress-log\{min-height:36px;max-height:min\(15svh,105px\)/);
});
test('release notes use readable Markdown blocks, suppress generated release commit noise, and treat embedded HTML as text', () => {
  const dom=new JSDOM('<div id="notes"></div>',{url:'https://qidian.example/'}),container=dom.window.document.querySelector('#notes');
  renderReleaseNotes(container,'## 本版优化与新增\n\n1. 1. 适配账号偏好。\n2. 2. 支持 `v0.1.26`。\n3. release v0.0.1\n\n- 保留安装包说明。\n\n[版本详情](https://github.com/luckyalanzhou/qidian/releases)\n\n<img src=x onerror=alert(1)>\n\n[危险链接](javascript:alert(1))');
  assert.equal(container.querySelector('h2')?.textContent,'本版优化与新增');
  assert.deepEqual([...container.querySelectorAll('ol li')].map(node=>node.textContent),['适配账号偏好。','支持 v0.1.26。']);
  assert.deepEqual([...container.querySelectorAll('ul li')].map(node=>node.textContent),['保留安装包说明。']);
  assert.equal(container.querySelectorAll('a').length,1);
  assert.equal(container.querySelector('img,script'),null);
  assert.match(container.textContent,/<img src=x onerror=alert\(1\)>/);
  assert.match(container.textContent,/\[危险链接\]\(javascript:alert\(1\)\)/);
  dom.window.close();
});
test('historical updater logs from an older release stay out of the current update view', async () => {
  const {dom,w}=await mount(empty,{
    versionInfo:{currentVersion:'0.1.25',latestVersion:'0.1.26',updateAvailable:true,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.26',notes:'## 本版优化与新增\n\n1. 1. 更新说明。'},
    updateStatus:{state:'success',version:'0.1.23',updatedAt:1791800000000,log:'旧版本部署完成'}
  });
  w.document.querySelector('#versionButton').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.document.querySelector('#updateProgress').hidden,true);
  assert.equal(w.document.querySelector('#updateProgressLog').textContent,'');
  assert.equal(w.document.querySelector('#releaseNotes h2')?.textContent,'本版优化与新增');
  assert.equal(w.document.querySelector('#checkAndUpdateVersion').textContent,'检查并更新');
  dom.window.close();
});
test('web update waits when current edits have not reached the Docker service', async () => {
  const { dom, w, initialOptions } = await mount(empty,{ flushResult:false });
  w.document.querySelector('#versionButton').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  w.document.querySelector('#checkAndUpdateVersion').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(initialOptions.updateRequests,undefined);
  assert.match(w.document.querySelector('#versionState').textContent,/尚未写入/);
  assert.equal(w.document.querySelector('#checkAndUpdateVersion').disabled,false);
  dom.window.close();
});
test('web update keeps tracking an updater restart and refreshes after the target version is online', async () => {
  let currentVersion='0.1.5',staleVersionReads=0,status={state:'idle',version:'',updatedAt:null,log:''};
  const { dom, w } = await mount(empty,{
    versionInfo:()=>{const reportedVersion=staleVersionReads>0?(staleVersionReads--,'0.1.5'):currentVersion;return {currentVersion:reportedVersion,latestVersion:'0.1.6',updateAvailable:reportedVersion!=='0.1.6',canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',notes:''}},
    updateStatus:()=>{if(!status)throw Error('服务重启中');return status},
    onRequestSystemUpdate:()=>{status={state:'queued',version:'',updatedAt:null,log:''};staleVersionReads=1;return {accepted:true,version:'0.1.6'}}
  });
  w.document.querySelector('#versionButton').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const nativeSetTimeout=w.setTimeout.bind(w),nativeClearTimeout=w.clearTimeout.bind(w),timers=new Map();let nextTimer=0;
  w.setTimeout=(callback,delay=0,...args)=>{if([1000,1200,2000].includes(delay)){const id=++nextTimer;timers.set(id,{callback,delay,args});return id}return nativeSetTimeout(callback,delay,...args)};
  w.clearTimeout=id=>{if(timers.delete(id))return;nativeClearTimeout(id)};
  const fireNext=async delay=>{const entry=[...timers.entries()].find(([,timer])=>timer.delay===delay);assert.ok(entry,`expected a ${delay}ms timer`);timers.delete(entry[0]);entry[1].callback(...entry[1].args);await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))};
  w.document.querySelector('#checkAndUpdateVersion').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(status.state,'queued');
  status=null;
  await fireNext(1000);
  assert.equal(w.document.querySelector('#checkAndUpdateVersion').textContent,'等待服务启动…');
  assert.equal(w.document.querySelector('#checkAndUpdateVersion').disabled,true);
  status={state:'unavailable',version:'0.1.6',updatedAt:null,log:'管理服务正在重启'};
  await fireNext(2000);
  assert.match(w.document.querySelector('#updateProgressState').textContent,/服务正在重启/);
  assert.ok(w.document.querySelector('#checkAndUpdateVersion').disabled,'the update stays locked during the agent restart');
  status={state:'success',version:'0.1.6',updatedAt:null,log:'更新完成'};currentVersion='0.1.6';
  await fireNext(1000);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(w.document.querySelector('#versionState').textContent,/等待新版本服务就绪/);
  await fireNext(2000);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.document.querySelector('#installedVersion').textContent,'0.1.6');
  assert.match(w.document.querySelector('#versionState').textContent,/5 秒后自动刷新/);
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),'0.1.6','the pending job remains until the actual refresh');
  const realNow=w.Date.now;let elapsed=realNow();w.Date.now=()=>elapsed;
  elapsed+=4000;await fireNext(1000);
  assert.match(w.document.querySelector('#versionState').textContent,/1 秒后自动刷新/);
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),'0.1.6');
  status=null;elapsed+=1000;await fireNext(1000);
  assert.match(w.document.querySelector('#versionState').textContent,/等待新版本服务恢复/);
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),'0.1.6','do not refresh into an unavailable service');
  status={state:'success',version:'0.1.6',log:'更新完成'};
  dom.virtualConsole.removeAllListeners('jsdomError');await fireNext(2000);
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),null,'refresh is attempted only after five seconds and a final readiness check');
  dom.window.close();
});
test('checking versions never reloads for a historical success and new updates ignore old results', async () => {
  let currentVersion='0.1.5',status={state:'success',version:'0.1.4',updatedAt:100,log:'旧部署完成'};
  const {dom,w}=await mount(empty,{
    versionInfo:()=>({currentVersion,latestVersion:'0.1.6',updateAvailable:true,canUpdateDevice:true,installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases',notes:''}),
    updateStatus:()=>status
  });
  w.document.querySelector('#versionButton').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),null);
  const nativeSetTimeout=w.setTimeout.bind(w),nativeClearTimeout=w.clearTimeout.bind(w),timers=new Map();let nextTimer=0;
  w.setTimeout=(callback,delay=0,...args)=>{if(delay===1000){const id=++nextTimer;timers.set(id,{callback,delay,args});return id}return nativeSetTimeout(callback,delay,...args)};
  w.clearTimeout=id=>{if(timers.delete(id))return;nativeClearTimeout(id)};
  const firePoll=async()=>{const entry=[...timers.entries()].find(([,timer])=>timer.delay===1000);assert.ok(entry,'a one-second live status refresh is scheduled');timers.delete(entry[0]);entry[1].callback(...entry[1].args);await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))};
  assert.equal(w.document.querySelector('#checkAndUpdateVersion').disabled,false);
  w.document.querySelector('#checkAndUpdateVersion').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),'0.1.6');
  assert.match(w.document.querySelector('#updateProgressState').textContent,/等待设备执行/);
  assert.match(w.document.querySelector('#updateProgressLog').textContent,/正在连接版本源/);
  status={state:'failed',version:'0.1.4',updatedAt:100,log:'旧失败'};
  await firePoll();
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),'0.1.6');
  currentVersion='0.1.6';status={state:'running',version:'0.1.6',log:'正在部署，未完成'};
  await firePoll();
  assert.ok(w.document.querySelector('#updateProgressLog').textContent.includes(status.log));
  assert.doesNotMatch(w.document.querySelector('#updateProgressLog').textContent,/旧失败/);
  assert.doesNotMatch(w.document.querySelector('#versionState').textContent,/部署完成，服务已启动/);
  status={state:'failed',version:'0.1.6',log:'本次部署失败'};
  await firePoll();
  assert.match(w.document.querySelector('#versionState').textContent,/更新失败/);
  assert.equal(w.sessionStorage.getItem('qidian.pendingDeviceUpdate'),null);
  dom.window.close();
});

test('web update refreshes the live log every second and follows new output until the user scrolls away', async () => {
  let status={state:'idle',version:'',updatedAt:null,log:''};
  const {dom,w}=await mount(empty,{updateStatus:()=>status});
  w.document.querySelector('#versionButton').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const nativeSetTimeout=w.setTimeout.bind(w),nativeClearTimeout=w.clearTimeout.bind(w),timers=new Map();let nextTimer=0;
  w.setTimeout=(callback,delay=0,...args)=>{if([1000].includes(delay)){const id=++nextTimer;timers.set(id,{callback,delay,args});return id}return nativeSetTimeout(callback,delay,...args)};
  w.clearTimeout=id=>{if(timers.delete(id))return;nativeClearTimeout(id)};
  const log=w.document.querySelector('#updateProgressLog');let scrollHeight=80,scrollTop=40;
  Object.defineProperties(log,{clientHeight:{configurable:true,get:()=>40},scrollHeight:{configurable:true,get:()=>scrollHeight},scrollTop:{configurable:true,get:()=>scrollTop,set:value=>{scrollTop=value}}});
  status={state:'running',version:'0.1.6',updatedAt:null,log:'开始下载安装包'};
  w.document.querySelector('#checkAndUpdateVersion').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(log.textContent.endsWith('开始下载安装包'));
  assert.equal(log.scrollTop,80,'the log follows its tail when the user has not scrolled away');
  const firePoll=async()=>{const entry=[...timers.entries()].find(([,timer])=>timer.delay===1000);assert.ok(entry,'a one-second live log refresh is scheduled');timers.delete(entry[0]);entry[1].callback(...entry[1].args);await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))};
  scrollHeight=120;
  status={state:'running',version:'0.1.6',updatedAt:null,log:'开始下载安装包\n正在下载：已接收 64 KB'};
  await firePoll();
  assert.match(log.textContent,/64 KB/);
  assert.equal(log.scrollTop,120,'new output stays visible while following the tail');
  log.scrollTop=0;log.dispatchEvent(new w.Event('scroll'));
  scrollHeight=160;
  status={state:'running',version:'0.1.6',updatedAt:null,log:'开始下载安装包\n正在下载：已接收 128 KB'};
  await firePoll();
  assert.match(log.textContent,/128 KB/);
  assert.equal(log.scrollTop,0,'manual inspection of earlier log lines is preserved');
  dom.window.close();
});
test('authenticated startup checks for updates and shows the red dot in the top bar', async () => {
  const { dom, w } = await mount(empty,{local:false,versionInfo:{
    currentVersion:'0.1.5',latestVersion:'0.1.6',updateAvailable:true,canUpdateDevice:true,
    installerAvailable:true,updaterAvailable:true,releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6',notes:''
  }});
  await new Promise(resolve=>setTimeout(resolve,0));
  const badge=w.document.querySelector('#versionButton');
  assert.equal(w.document.querySelector('#currentVersionLabel').textContent,'v0.1.5');
  assert.equal(badge.dataset.updateAvailable,'true');
  assert.ok(badge.querySelector('.version-alert-dot'));
  dom.window.close();
});
test('the unified action checks updates but only the first account can start deployment', async () => {
  const { dom, w, initialOptions } = await mount(empty,{ versionInfo:{
    currentVersion:'0.1.5', latestVersion:'0.1.6', updateAvailable:true, canUpdateDevice:false,
    installerAvailable:true, updaterAvailable:true,
    releaseUrl:'https://github.com/luckyalanzhou/qidian/releases/tag/v0.1.6', notes:''
  } });
  w.document.querySelector('#versionButton').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const button=w.document.querySelector('#checkAndUpdateVersion');
  assert.equal(button.disabled,false);
  button.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(initialOptions.updateRequests,undefined);
  assert.match(w.document.querySelector('#versionState').textContent,/只有首个账号可以更新设备/);
  dom.window.close();
});
test('login reports its security and loading stages without repeating bootstrap requests', async () => {
  const stages=[];
  let browserWindow;
  const login=async(_identifier,_password,onStage)=>{
    for(const stage of ['challenge','derive','verify','load']){
      onStage(stage);
      stages.push({ stage, message:browserWindow.document.querySelector('#authMessage').textContent, busy:browserWindow.document.querySelector('#authSubmit').getAttribute('aria-busy') });
    }
    return { data:{ notes:[] }, local:false, owner:'account-test' };
  };
  const { dom, w, counters } = await mountAuth(true,null,login);
  browserWindow=w;
  w.document.querySelector('#authUsername').value='alan';
  w.document.querySelector('#authPassword').value='A secure password 1!';
  w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(stages.map(stage=>stage.message),['正在连接验证服务…','正在安全计算登录凭据…','正在验证账号…','正在载入私人空间…']);
  assert.ok(stages.every(stage=>stage.busy==='true'));
  assert.equal(counters.bootstrapCalls,0,'the successful login response already carries the authenticated vault');
  dom.window.close();
});
test('an in-place session recovery can log in again after a previous login succeeded', async()=>{
  const {dom,w,showAuthentication}=await mountAuth(true);
  w.initial={username:'alan'};
  let completed=0;
  await showAuthentication(null,{username:'alan',authenticate:async(_identifier,_password,onStage)=>{onStage('verify');return{data:{notes:[]},conflict:false,synced:true}},onAuthenticated:async result=>{assert.equal(result.synced,true);completed++}});
  assert.equal(w.document.querySelector('#loginGate').classList.contains('reauth'),true);
  assert.equal(w.document.querySelector('#authUsername').value,'alan');
  w.document.querySelector('#authPassword').value='Valid-password-2!';
  w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(completed,1);
  assert.equal(w.document.querySelector('#loginGate').hidden,true);
  await showAuthentication(null,{username:'alan',authenticate:async()=>({data:{notes:[]},conflict:false,synced:true}),onAuthenticated:async()=>{}});
  assert.equal(w.document.querySelector('#authSubmit').disabled,false,'the next session recovery must have an enabled login button');
  dom.window.close();
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
  assert.equal(main.querySelector('.dashboard-intro p').textContent,'笔记保存内容；书签保存网址。');
  assert.equal(main.querySelectorAll('.dashboard-workspaces > .dashboard-section').length,2);
  assert.deepEqual([...main.querySelectorAll('.dashboard-workspaces > .dashboard-section h2')].map(node=>node.textContent),['笔记','书签']);
  assert.equal(main.querySelectorAll('.dashboard-section-actions .secondary-btn').length,2,'creation actions live in their respective peer workspaces');
  assert.equal(main.querySelector('.dashboard-note-workspace [data-new="note"]').textContent.trim(),'新建笔记');
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
test('mobile drawer exposes its state and every home entry closes it on the dashboard', async () => {
  const { dom, w } = await mount();
  const menu=w.document.querySelector('#menuBtn'),shade=w.document.querySelector('#mobileShade');
  assert.equal(menu.getAttribute('aria-controls'),'sidebar');
  assert.equal(menu.getAttribute('aria-expanded'),'false');
  menu.click();
  assert.equal(w.document.body.classList.contains('menu-open'),true);
  assert.equal(menu.getAttribute('aria-expanded'),'true');
  assert.equal(shade.getAttribute('aria-hidden'),'false');
  w.document.querySelector('#sideCore [data-dashboard]').click();
  assert.equal(w.document.body.classList.contains('menu-open'),false);
  assert.equal(menu.getAttribute('aria-expanded'),'false');
  assert.equal(w.document.querySelector('#mobileHome').classList.contains('selected'),true);
  menu.click();
  shade.click();
  assert.equal(w.document.body.classList.contains('menu-open'),false);
  assert.equal(shade.getAttribute('aria-hidden'),'true');
  menu.click();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(w.document.body.classList.contains('menu-open'),false);
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
test('dashboard collapse survives an immediate refresh and reload with independent nested states', async () => {
  const vault={...empty,bookmarks:[{id:'root',kind:'folder',title:'根分组',children:[{id:'nested',kind:'folder',title:'子分组',children:[]}]}]};
  const options={owner:'account-a'};
  const {dom,w,saves}=await mount(vault,options);
  w.document.querySelector('[data-dashboard-bookmark-folder="nested"]').click();
  w.document.querySelector('[data-dashboard-bookmark-folder="root"]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  const saved=structuredClone(saves.at(-1));
  options.remoteUpdate(saved);
  assert.equal(w.document.querySelector('[data-dashboard-folder="root"]').open,false);
  assert.equal(w.document.querySelector('[data-dashboard-folder="nested"]').open,true);
  assert.equal(w.document.querySelector('[data-dashboard-bookmark-folder="root"]').getAttribute('aria-expanded'),'false');
  assert.equal(saved.dashboardBookmarkFolders.root,false);
  assert.equal(saved.dashboardBookmarkFolders.nested,true);
  dom.window.close();
  const reloaded=await mount(saved,{owner:'account-a'});
  assert.equal(reloaded.w.document.querySelector('[data-dashboard-folder="root"]').open,false);
  reloaded.w.document.querySelector('[data-dashboard-bookmark-folder="root"]').click();
  assert.equal(reloaded.w.document.querySelector('[data-dashboard-folder="nested"]').open,true);
  reloaded.dom.window.close();
  const other=await mount(vault,{owner:'account-b'});
  assert.equal(other.w.document.querySelector('[data-dashboard-folder="root"]').open,true);
  assert.equal(other.w.document.querySelector('[data-dashboard-folder="nested"]').open,false);
  other.dom.window.close();
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

test('new notes stay in the private draft box until published', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  assert.equal(w.document.querySelector('#saveEditor').textContent.trim().endsWith('发布笔记'),true);
  assert.equal(w.document.querySelector('.doc-meta .pill').textContent,'编辑笔记');
  const title = w.document.querySelector('#editTitle'); title.value = '只在后台的草稿'; title.dispatchEvent(new w.Event('input',{ bubbles:true }));
  w.document.querySelector('#backDoc').click();
  w.document.querySelector('#backDoc').click();
  assert.doesNotMatch(w.document.querySelector('#main').textContent, /只在后台的草稿/);
  w.document.querySelector('#sideCore [data-nav="all"]').click();w.document.querySelector('[data-nav="drafts"]').click();
  assert.match(w.document.querySelector('#main').textContent, /草稿箱/);
  assert.match(w.document.querySelector('#main').textContent, /只在后台的草稿/);
  w.document.querySelector('[data-open]').click();
  w.document.querySelector('#publishDoc').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saves.at(-1).notes[0].status, 'published');
  assert.equal(saves.at(-1).notes[0].publishedSnapshot, undefined);
  assert.equal(w.document.querySelector('#main .about-note'),null,'routine publication status is not displayed');
  dom.window.close();
});
test('deleted notes remain recoverable for 30 days and can be restored from the recycle bin', async () => {
  const note={id:'trash-note',title:'待还原笔记',type:'note',category:'开发',tags:[],body:'<p>保留正文</p>',source:'',created:1,updated:2,pinned:false,status:'published'};
  const {dom,w,saves}=await mount({...structuredClone(empty),notes:[note]});
  w.document.querySelector('#sideCore [data-nav="all"]').click();
  w.document.querySelector('[data-note-delete="trash-note"]').click();
  assert.deepEqual(saves.at(-1).notes,[]);
  assert.equal(saves.at(-1).trash[0].item.id,'trash-note');
  w.document.querySelector('[data-trash-nav]').click();
  assert.match(w.document.querySelector('#main').textContent,/保留 30 天/);
  assert.match(w.document.querySelector('#main').textContent,/待还原笔记/);
  w.document.querySelector('[data-trash-restore]').click();
  assert.equal(saves.at(-1).notes[0].id,'trash-note');
  assert.deepEqual(saves.at(-1).trash,[]);
  dom.window.close();
});
test('emptying the recycle bin requires confirmation but never requires or starts a backup', async () => {
  const note={id:'clear-trash-note',title:'永久删除测试',type:'note',category:'开发',tags:[],body:'<p>内容</p>',source:'',created:1,updated:2,pinned:false,status:'published'};
  const trash=[createTrashEntry('note',note,{index:0})];
  const options={};const {dom,w,saves}=await mount({...structuredClone(empty),trash},options);
  w.document.querySelector('[data-trash-nav]').click();
  w.document.querySelector('[data-trash-clear]').click();
  assert.match(w.document.querySelector('#trashClearOverlay').textContent,/此操作无法撤销/);
  assert.equal(options.exportedBeforeRestore,undefined);
  w.document.querySelector('[data-trash-cancel]').click();
  assert.equal(saves.length,0,'cancel keeps the trashed content');
  w.document.querySelector('[data-trash-clear]').click();
  w.document.querySelector('#trashClearOverlay form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(saves.at(-1).trash,[]);
  assert.equal(options.exportedBeforeRestore,undefined,'permanent clear does not call the export flow');
  assert.match(w.document.querySelector('#main').textContent,/回收站为空/);
  dom.window.close();
});
test('the reader presents article metadata and keeps a section outline available on mobile', async () => {
  const note = { id:'article-note', title:'一篇长文笔记', type:'note', category:'开发', tags:['教程'], body:'<h2>部署前准备</h2><p>先检查环境。</p><h3>确认版本</h3><pre><code>node --version</code></pre>', source:'', created:1, updated:2, pinned:false };
  const { dom, w } = await mount({ ...structuredClone(empty), notes:[note] });
  w.document.querySelector('[data-open="article-note"]').click();
  assert.ok(w.document.querySelector('.reader-shell'));
  assert.match(w.document.querySelector('.doc-meta').textContent, /阅读约 1 分钟/);
  assert.match(w.document.querySelector('.reader-shell .doc-title').textContent, /一篇长文笔记/);
  assert.equal(w.document.querySelector('.mobile-toc summary').textContent.includes('本文目录'), true);
  assert.equal(w.document.querySelector('.mobile-toc a[href="#sec-0"]').textContent, '部署前准备');
  assert.equal(w.document.querySelector('#main .about-note'),null,'the reader has no service footer');
  assert.equal(w.document.querySelector('.right-rail .outline a[href="#sec-1"]').textContent, '确认版本');
  dom.window.close();
});
test('a remote update refreshes the active editor and account preferences without losing editing state', async()=>{
  const note={id:'remote-note',title:'旧标题',type:'note',category:'开发',tags:['旧'],body:'<p>旧正文</p>',source:'',created:1,updated:2,pinned:false,status:'published'};
  const {dom,w,initialOptions}=await mount({...structuredClone(empty),notes:[note]});
  w.document.querySelector('[data-open="remote-note"]').click();
  assert.equal(w.document.querySelector('#editDoc').textContent.includes('编辑笔记'),true);
  w.document.querySelector('#editDoc').click();
  assert.equal(w.document.querySelector('.doc-meta .pill').textContent,'编辑笔记');
  assert.equal(w.document.querySelector('#saveEditor').textContent.trim().endsWith('保存笔记'),true);
  const remote=structuredClone(empty);remote.noteTypesExpanded=false;remote.notes=[{...note,title:'另一设备改好的标题',tags:['新版'],body:'<p>另一设备改好的正文</p>',updated:3}];
  initialOptions.remoteUpdate(remote);
  assert.equal(w.document.querySelector('#editTitle').value,'另一设备改好的标题');
  assert.equal(w.document.querySelector('#sideTypes').hidden,true,'sidebar preference follows the same account on another device');
  assert.deepEqual(w.currentEditor.getJSON().content[0].content[0].text,'另一设备改好的正文');
  assert.equal(w.document.querySelector('#saveEditor').disabled,false,'远端刷新后编辑状态仍可继续使用');
  dom.window.close();
});
test('the reader outline follows the visible heading and disconnects when leaving the note', async () => {
  const note = { id:'outline-note', title:'章节目录', type:'note', category:'开发', tags:[], body:'<h2>准备</h2><p>内容</p><h3>确认环境</h3><p>更多内容</p>', source:'', created:1, updated:2, pinned:false };
  const { dom, w } = await mount({ ...structuredClone(empty), notes:[note] });
  let observerCallback;
  const observer={observed:[],disconnected:false,observe(element){this.observed.push(element)},disconnect(){this.disconnected=true}};
  w.IntersectionObserver=class { constructor(callback){observerCallback=callback;return observer} };
  w.document.querySelector('[data-open="outline-note"]').click();
  assert.equal(observer.observed.length,2);
  const secondHeading=w.document.querySelector('#sec-1');
  observerCallback([{isIntersecting:true,boundingClientRect:{top:20},target:secondHeading}]);
  assert.equal(w.document.querySelector('.right-rail a[href="#sec-1"]').getAttribute('aria-current'),'location');
  assert.equal(w.document.querySelector('.mobile-toc a[href="#sec-0"]').classList.contains('current'),false);
  w.document.querySelector('#backDoc').click();
  assert.equal(observer.disconnected,true);
  dom.window.close();
});
test('editing a published note updates its private draft and only changes the reader after republishing', async () => {
  const note = { id:'published-1', title:'原有标题', type:'note', category:'开发', tags:[], body:'<p>已发布正文</p>', source:'', created:1, updated:2, pinned:false };
  const { dom, w } = await mount({ ...structuredClone(empty), notes:[note] });
  w.document.querySelector('[data-open="published-1"]').click();
  w.document.querySelector('#editDoc').click();
  const title = w.document.querySelector('#editTitle'); title.value='后台新标题'; title.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.document.querySelector('#viewEditor'),null,'editing has one return-to-reading action');
  w.document.querySelector('#backDoc').click();
  assert.match(w.document.querySelector('#main').textContent,/后台新标题/);
  w.document.querySelector('#backDoc').click();
  assert.match(w.document.querySelector('#main').textContent,/原有标题/);
  w.document.querySelector('[data-nav="drafts"]').click();
  assert.match(w.document.querySelector('#main').textContent,/后台新标题/);
  w.document.querySelector('[data-open="published-1"]').click();
  w.document.querySelector('#publishDoc').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(w.document.querySelector('#main').textContent,/后台新标题/);
  assert.equal(w.document.querySelector('#main .about-note'),null);
  dom.window.close();
});
test('a safe pending draft is queued for cloud sync immediately after recovery', async () => {
  const { dom, saves } = await mount(empty, { local:false, owner:'account-1', restoreDraft:true });
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0].notes, []);
  dom.window.close();
});
test('a dismissed local draft can be restored from settings without another prompt', async () => {
  const { dom, w, saves } = await mount(empty, { local:false, owner:'account-1', ignoredDraft:true });
  assert.ok(w.document.querySelector('#restoreLocalDraft'));
  assert.equal(w.document.querySelector('#restoreLocalDraft').hidden, false);
  w.document.querySelector('#accountButton').click();
  w.document.querySelector('#openAppSettings').click();
  w.document.querySelector('#restoreLocalDraft').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saves.length, 1);
  assert.equal(w.document.querySelector('#restoreLocalDraft').hidden, true);
  assert.equal(w.document.querySelector('#appSettingsOverlay').classList.contains('open'), false);
  dom.window.close();
});
test('autosave has no persistent typing or save status; recovery is kept in settings', async () => {
  const { dom, w } = await mount(empty, { local:false, owner:'account-1' });
  assert.equal(w.document.querySelector('#syncStatus'), null);
  assert.equal(w.document.querySelector('#saveStatus'), null);
  assert.equal(w.document.querySelector('#reviewSyncConflict').hidden, true);
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  assert.equal(w.document.querySelector('.doc-date'), null);
  assert.equal(w.document.querySelector('#saveStatus'), null);
  dom.window.close();
});
test('a cloud conflict shows both note versions and requires a comparison backup before loading cloud',async()=>{
  const base=structuredClone(empty),make=(title,body)=>({id:'conflict-note',title,type:'note',category:'开发',tags:[],body,source:'',created:1,updated:1,pinned:false,status:'published'});
  base.notes=[make('原始标题','<p>共同原文</p>')];const local=structuredClone(base);local.notes[0].title='本机标题';local.notes[0].body='<p>本机正文</p>';const remote=structuredClone(base);remote.notes[0].title='云端标题';remote.notes[0].body='<p>云端正文</p>';
  const {dom,w,initialOptions}=await mount(base,{local:false,owner:'account-1',restoreConflict:true,syncConflict:{base,local,remote,revision:7}});
  assert.equal(w.document.querySelector('#reviewSyncConflict').hidden,false);
  w.document.querySelector('#accountButton').click();
  w.document.querySelector('#openAppSettings').click();
  w.document.querySelector('#reviewSyncConflict').click();
  const dialog=w.document.querySelector('#syncConflictOverlay');assert.equal(dialog.classList.contains('open'),true);
  assert.match(dialog.textContent,/本机标题/);assert.match(dialog.textContent,/云端标题/);
  const load=w.document.querySelector('#loadConflictCloud');assert.equal(load.disabled,true);
  w.document.querySelector('#downloadSyncConflict').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(load.disabled,false);assert.equal(initialOptions.conflictExports,1);
  dom.window.close();
});
test('manual retry continues the retained sync queue instead of queueing a stale page snapshot', async () => {
  const options={ local:false, owner:'account-1' };
  const { dom, w, saves } = await mount(empty, options);
  w.document.querySelector('#accountButton').click();
  w.document.querySelector('#openAppSettings').click();
  w.document.querySelector('#retrySync').click();
  assert.equal(options.retryRequests, 1);
  assert.equal(saves.length, 0);
  dom.window.close();
});
test('editor preserves draft when navigating home before debounce finishes', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const title = w.document.querySelector('#editTitle'); title.value = '不丢失的笔记'; title.dispatchEvent(new w.Event('input',{ bubbles:true }));
  w.currentEditor.commands.setContent('<p>中文内容 ✅</p>');
  w.document.querySelector('[data-nav="all"]').click();
  assert.equal(saves.at(-1).notes[0].title,'不丢失的笔记'); assert.match(saves.at(-1).notes[0].body,/中文内容/);
  w.document.querySelector('[data-nav="drafts"]').click();
  assert.match(w.document.querySelector('#main').textContent,/不丢失的笔记/); dom.window.close();
});
test('leaving a changed editor asks to save and cancel keeps the editor open', async () => {
  const { dom, w, saves } = await mount();
  const prompts=[];let confirmResult=false;
  w.confirm=message=>{prompts.push(message);return confirmResult};
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const title=w.document.querySelector('#editTitle');title.value='离开前询问保存';title.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('[data-nav="all"]').click();
  assert.equal(prompts.length,1);
  assert.match(prompts[0],/是否保存后离开/);
  assert.ok(w.document.querySelector('#editTitle'),'cancel keeps the user in the editor');
  confirmResult=true;
  w.document.querySelector('[data-nav="all"]').click();
  assert.equal(prompts.length,2);
  assert.equal(w.document.querySelector('#editTitle'),null);
  assert.equal(saves.at(-1).notes[0].title,'离开前询问保存');
  dom.window.close();
});
test('opening the recycle bin from a changed editor asks first and saves only when confirmed', async () => {
  const {dom,w,saves}=await mount();let confirmResult=false;const prompts=[];
  w.confirm=message=>{prompts.push(message);return confirmResult};
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const title=w.document.querySelector('#editTitle');title.value='回收站导航前保存';title.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('[data-trash-nav]').click();
  assert.equal(prompts.length,1);assert.match(prompts[0],/是否保存后离开/);assert.ok(w.document.querySelector('#editTitle'));
  confirmResult=true;w.document.querySelector('[data-trash-nav]').click();
  assert.equal(w.document.querySelector('#editTitle'),null);assert.match(w.document.querySelector('#main').textContent,/回收站/);
  assert.equal(saves.at(-1).notes[0].title,'回收站导航前保存');assert.deepEqual(saves.at(-1).trash,[]);
  dom.window.close();
});
test('leaving an unchanged editor does not show a save prompt', async () => {
  const { dom, w } = await mount();
  w.confirm=()=>{throw new Error('clean editor should not prompt')};
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.document.querySelector('[data-nav="all"]').click();
  assert.equal(w.document.querySelector('#editTitle'),null);
  dom.window.close();
});
test('sidebar brand returns to the dashboard and saves the active draft first', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const title = w.document.querySelector('#editTitle');
  title.value = '通过品牌返回时保留';
  title.dispatchEvent(new w.Event('input', { bubbles:true }));
  w.currentEditor.commands.setContent('<p>品牌按钮导航内容</p>');
  const brand = w.document.querySelector('#brandHome');
  assert.equal(brand.tagName, 'BUTTON');
  brand.querySelector('.brand-copy strong').click();
  assert.equal(saves.at(-1).notes[0].title, '通过品牌返回时保留');
  assert.match(saves.at(-1).notes[0].body, /品牌按钮导航内容/);
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent, '首页');
  w.document.querySelector('#sideCore [data-nav="all"]').click();
  w.document.querySelector('[data-nav="drafts"]').click();
  assert.match(w.document.querySelector('#main').textContent, /通过品牌返回时保留/);
  dom.window.close();
});
test('editor sends changes on blur and shortly after typing stops', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const title = w.document.querySelector('#editTitle');
  title.value = '离开输入框时立即排队';
  title.dispatchEvent(new w.Event('input', { bubbles:true }));
  title.dispatchEvent(new w.Event('blur'));
  assert.equal(saves.at(-1).notes[0].title, '离开输入框时立即排队');

  const body = w.document.querySelector('#editorSurface');
  w.currentEditor.commands.setContent('<p>暂停输入后自动同步</p>');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.match(saves.at(-1).notes[0].body, /暂停输入后自动同步/);
  dom.window.close();
});
test('an expired cloud session asks the same account to log in without discarding the editor', async () => {
  const note={id:'reauth-note',title:'原题',type:'note',category:'开发',tags:[],body:'<p>原文</p>',source:'',created:1,updated:1,pinned:false,status:'published',publishedAt:1};
  const vault={...structuredClone(empty),notes:[note]};
  const {dom,w,initialOptions}=await mount(vault,{username:'alan'});
  w.document.querySelector('[data-open="reauth-note"]').click();
  w.document.querySelector('#editDoc').click();
  const title=w.document.querySelector('#editTitle');title.value='本机未同步标题';title.dispatchEvent(new w.Event('input',{bubbles:true}));
  initialOptions.authenticationRequired();
  assert.equal(initialOptions.reauthentication.username,'alan');
  await initialOptions.reauthentication.onAuthenticated({data:{...vault,notes:[{...note,title:'本机未同步标题',updated:2}]},conflict:false,synced:true});
  assert.equal(w.document.querySelector('#editTitle').value,'本机未同步标题');
  assert.equal(w.currentEditor.getHTML(),'<p>原文</p>');
  assert.equal(w.document.querySelector('#toast').textContent,'');
  dom.window.close();
});
test('web paste keeps safe rich formatting, table spans, and background colors', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const paste = new w.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{
    files:[],
    getData(type){ return type==='text/html' ? '<p style="text-align:center"><strong>网页标题</strong> <span style="background-color: rgb(255, 245, 150)">高亮</span></p><table><tbody><tr><td colspan="2">合并表格</td></tr></tbody></table>' : '网页标题 高亮 合并表格'; },
  } });
  const handled = w.currentEditor.view.someProp('handlePaste', handler => handler(w.currentEditor.view,paste,null));
  assert.equal(handled,true);
  assert.match(w.currentEditor.getHTML(), /网页标题/);
  assert.match(w.currentEditor.getHTML(), /colspan="2"/);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.match(saves.at(-1).notes[0].body, /background-color: rgb\(255, 245, 150\)/);
  dom.window.close();
});
test('HTML paste removes executable markup and keeps text when an image URL is unsafe', async () => {
  const {dom,w}=await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/html'?'<p onclick="alert(1)">安全文字 <a href="javascript:alert(1)">危险链接</a><img src="javascript:alert(1)" alt="图片说明"></p><script>alert(2)</script>':'安全文字 危险链接 图片说明';}}});
  w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,paste,null));
  const html=w.currentEditor.getHTML();
  assert.match(html,/安全文字/);
  assert.match(html,/危险链接/);
  assert.match(html,/图片说明/);
  assert.doesNotMatch(html,/javascript:|onclick|<script|alert\(/i);
  dom.window.close();
});
test('clipboard classifier separates safe rich HTML, Markdown and ordinary prose', () => {
  assert.equal(classifyClipboard({ text:'## VPS 管理\n\n说明内容' }), 'markdown');
  assert.equal(classifyClipboard({ text:':::warning\n请先备份\n:::' }), 'markdown');
  assert.equal(classifyClipboard({ text:'[!WARNING] 危险操作' }), 'markdown');
  assert.equal(classifyClipboard({ text:'这是一段普通文字\n下一行仍是普通文字。' }), 'plain');
  assert.equal(classifyClipboard({ html:'<p><strong>网页格式</strong></p>', text:'## 标题' }), 'html');
  assert.equal(classifyClipboard({ html:'<div><p>## 标题</p><p>内容</p></div>', text:'## 标题\n\n内容' }), 'markdown');
  assert.equal(classifyClipboard({ text:'## 标题', mode:'plain' }), 'plain');
  assert.equal(classifyClipboard({ text:'普通内容', mode:'markdown' }), 'markdown');
});
test('rich paste parses Markdown when the clipboard HTML only wraps the raw Markdown text', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const source = '# sub-store 使用笔记\n\n## 安装\n\n1. 从 GitHub Releases 下载最新 `.run`。';
  const html = '<div><p># sub-store 使用笔记</p><p>## 安装</p><p>1. 从 GitHub Releases 下载最新 `.run`。</p></div>';
  const paste = new w.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{ files:[], getData(type){ return type === 'text/html' ? html : type === 'text/plain' ? source : ''; } } });
  w.currentEditor.view.someProp('handlePaste', handler => handler(w.currentEditor.view, paste, null));
  const result = w.currentEditor.getHTML();
  assert.match(result, /<h1>sub-store 使用笔记<\/h1>/);
  assert.match(result, /<h2>安装<\/h2>/);
  assert.match(result, /<ol><li><p>从 GitHub Releases 下载最新 <code>\.run<\/code>。<\/p><\/li><\/ol>/);
  assert.doesNotMatch(result, /# sub-store|## 安装/);
  dom.window.close();
});
test('legacy matching mode keeps its prior plain-text structure conversion available', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.document.querySelector('#editPasteMode').value='match';
  const text = [
    'VPS 运维备忘录', '',
    '标签： #VPS #Linux #Docker #PVE', '',
    '1. Docker 管理', '',
    '清理 Docker 无用资源', '',
    '删除未使用的镜像和构建缓存。', '',
    'docker system prune -a', '',
    '找到：', '',
    '#PermitRootLogin prohibit-password', '',
    'PermitRootLogin yes', '',
    '① 检查配置',
    '② 重启 SSH', '',
    '[!WARNING] 清理前确认数据',
    'Docker 卷可能存有数据库和配置。', '',
    '参数说明：', '',
    '参数\t说明',
    '--all\t清理全部未使用镜像', '',
    '⸻', '',
    '保留这是一段普通说明文字。'
  ].join('\n');
  const paste = new w.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{ files:[], getData(type){ return type==='text/plain'?text:''; } } });
  const handled = w.currentEditor.view.someProp('handlePaste', handler => handler(w.currentEditor.view,paste,null));
  assert.equal(handled,true);
  assert.equal(paste.defaultPrevented,true);
  const html=w.currentEditor.getHTML();
  assert.match(html,/<h2>Docker 管理<\/h2>/);
  assert.match(html,/<p>标签： #VPS #Linux #Docker #PVE<\/p>/);
  assert.match(html,/<h3>清理 Docker 无用资源<\/h3>/);
  assert.match(html,/<pre><code>docker system prune -a<\/code><\/pre>/);
  assert.match(html,/<pre><code>#PermitRootLogin prohibit-password<\/code><\/pre>/);
  assert.match(html,/<ol><li><p>检查配置<\/p><\/li><li><p>重启 SSH<\/p><\/li><\/ol>/);
  assert.match(html,/<div class="callout warn">/);
  assert.match(html,/<table\b/);
  assert.match(html,/<th[^>]*><p>参数<\/p><\/th>/);
  assert.match(html,/<td[^>]*><p>清理全部未使用镜像<\/p><\/td>/);
  assert.match(html,/<hr>/);
  assert.match(html,/<p>保留这是一段普通说明文字。<\/p>/);
  assert.doesNotMatch(html,/\[!WARNING\]/);
  await new Promise(resolve=>setTimeout(resolve,250));
  dom.window.close();
});
test('desktop rich paste and standard mobile Markdown paste produce the same note structure', async () => {
  const plain = [
    '## Docker 管理', '',
    '### 清理 Docker 无用资源', '',
    '删除未使用的镜像。', '',
    '```bash', 'docker system prune -a', '```', '',
    ':::warning', '清理前确认数据。', '', 'Docker 卷可能存有数据库。', ':::', '',
    '| 参数 | 说明 |', '| --- | --- |', '| --all | 清理未使用镜像 |'
  ].join('\n');
  const richHTML = '<h2>Docker 管理</h2><h3>清理 Docker 无用资源</h3><p>删除未使用的镜像。</p><pre><code class="language-bash">docker system prune -a</code></pre><div class="callout warn"><p>清理前确认数据。</p><p>Docker 卷可能存有数据库。</p></div><table><thead><tr><th><p>参数</p></th><th><p>说明</p></th></tr></thead><tbody><tr><td><p>--all</p></td><td><p>清理未使用镜像</p></td></tr></tbody></table>';
  const capture = async clipboard => {
    const {dom,w}=await mount();
    w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
    const event=new w.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{files:[],getData(type){return clipboard[type]||'';}}});
    w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,event,null));
    const editor=w.currentEditor.view.dom;
    const structure={
      headings:[...editor.querySelectorAll('h2,h3')].map(node=>node.textContent),
      commands:[...editor.querySelectorAll('pre')].map(node=>node.textContent),
      languages:[...editor.querySelectorAll('pre code')].map(node=>node.className),
      warning:editor.querySelector('.callout.warn')?.textContent,
      table:[...editor.querySelectorAll('tr')].map(row=>[...row.cells].map(cell=>cell.textContent)),
    };
    await new Promise(resolve=>setTimeout(resolve,250));
    dom.window.close();
    return structure;
  };
  const mobile=await capture({'text/plain':plain});
  assert.deepEqual(mobile,await capture({'text/html':richHTML,'text/plain':plain}));
  assert.deepEqual(mobile.languages,['language-bash']);
});
test('Markdown paste preserves nested lists, GFM tables, languages, callouts and open details through HTML reload', async () => {
  const {dom,w}=await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const source=[
    '## 保真验收', '', '- 主项', '  - 子项', '',
    '| 名称 | 说明 |', '| --- | --- |', '| 栖点 | 私人笔记 |', '',
    '```yaml', 'service: qidian', '```', '',
    ':::tip', '提示内容需要保留。', ':::', '',
    '[!WARNING] 不要直接删除数据', '> 先确认备份可用。', '',
    '<details open>', '<summary>点击查看</summary>', '<div data-type="detailsContent"><p>折叠内容。</p></div>', '</details>', '',
    '[危险链接](javascript:alert(1))'
  ].join('\n');
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?source:'';}}});
  w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,paste,null));
  let html=w.currentEditor.getHTML();
  assert.match(html,/<h2>保真验收<\/h2>/);
  assert.match(html,/<li><p>主项<\/p><ul><li><p>子项<\/p><\/li><\/ul><\/li>/);
  assert.match(html,/<table\b/);
  assert.match(html,/<pre><code class="language-yaml">service: qidian<\/code><\/pre>/);
  assert.match(html,/<div class="callout good">/);
  assert.match(html,/<div class="callout warn">/);
  assert.match(html,/<details open="">/);
  assert.match(html,/data-type="detailsContent"/);
  assert.doesNotMatch(html,/javascript:|alert\(1\)/);
  w.currentEditor.commands.setContent(html);
  html=w.currentEditor.getHTML();
  assert.match(html,/<details open="">/,'the saved HTML restore keeps the details state');
  assert.match(html,/<code class="language-yaml">service: qidian<\/code>/,'the saved HTML restore keeps the code language');
  await new Promise(resolve=>setTimeout(resolve,250));
  dom.window.close();
});
test('plain-text paste mode remains literal and does not infer Markdown or command blocks', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.document.querySelector('#editPasteMode').value='plain';
  const paste = new w.Event('paste', { bubbles:true, cancelable:true });
  Object.defineProperty(paste, 'clipboardData', { value:{ files:[], getData(type){ return type==='text/plain'?'docker system prune -a\n[!WARNING] 注意':''; } } });
  const handled = w.currentEditor.view.someProp('handlePaste', handler => handler(w.currentEditor.view,paste,null));
  assert.equal(handled,true);
  assert.doesNotMatch(w.currentEditor.getHTML(),/<pre>/);
  assert.match(w.currentEditor.getHTML(),/\[!WARNING\] 注意/);
  await new Promise(resolve=>setTimeout(resolve,250));
  dom.window.close();
});
test('default paste keeps ordinary prose literal instead of guessing headings or commands', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const text='VPS 服务器测试与维护\n\ndocker system prune -a 这条命令只作说明，不是代码块。';
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?text:'';}}});
  w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,paste,null));
  const html=w.currentEditor.getHTML();
  assert.doesNotMatch(html,/<h[1-6]|<pre|<ol|<ul/);
  assert.equal((html.match(/<br>/g)||[]).length,2,'blank lines remain visible line breaks');
  assert.match(html,/VPS 服务器测试与维护/);
  assert.match(html,/docker system prune -a 这条命令只作说明/);
  assert.equal(w.currentEditor.state.doc.textContent,'VPS 服务器测试与维护docker system prune -a 这条命令只作说明，不是代码块。');
  dom.window.close();
});
test('the selected paste mode stays consistent in the note editor and quick capture', async()=>{
  const vault={...structuredClone(empty),pasteMode:'plain'};
  const {dom,w}=await mount(vault);
  w.document.querySelector('#quickCapture').click();
  assert.equal(w.document.querySelector('#capturePasteMode').value,'plain');
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  assert.equal(w.document.querySelector('#editPasteMode').value,'plain');
  dom.window.close();
});
test('pasting into a code block inserts exact text without Markdown parsing', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.currentEditor.commands.setContent('<pre><code>原有代码</code></pre>');
  w.currentEditor.commands.setTextSelection(3);
  assert.equal(w.currentEditor.isActive('codeBlock'),true);
  const source='# 不能变成标题\n```bash\n命令原样保留\n```';
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?source:'';}}});
  w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,paste,null));
  const html=w.currentEditor.getHTML();
  assert.doesNotMatch(html,/<h1>|<h2>/);
  assert.equal((html.match(/<pre/g)||[]).length,1);
  assert.match(w.currentEditor.state.doc.textContent,/# 不能变成标题/);
  assert.match(w.currentEditor.state.doc.textContent,/```bash/);
  assert.match(w.currentEditor.state.doc.textContent,/命令原样保留/);
  dom.window.close();
});
test('a pasted Markdown document can be undone and redone as one editor action', async () => {
  const {dom,w}=await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?'## 新标题\n\n正文内容':'';}}});
  w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,paste,null));
  assert.match(w.currentEditor.getHTML(),/<h2>新标题<\/h2>/);
  assert.equal(w.currentEditor.commands.undo(),true);
  assert.doesNotMatch(w.currentEditor.getHTML(),/新标题|正文内容/);
  assert.equal(w.currentEditor.commands.redo(),true);
  assert.match(w.currentEditor.getHTML(),/<h2>新标题<\/h2>/);
  await new Promise(resolve=>setTimeout(resolve,250));
  dom.window.close();
});
test('Markdown sanitizer strips unsafe links and image URLs and rejects hostile attributes', () => {
  const safeUrl=(url,image=false)=>image?/^https?:\/\//i.test(String(url||'')):/^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(String(url||''));
  const hostile={type:'doc',content:[
    {type:'paragraph',content:[{type:'text',text:'危险链接',marks:[{type:'link',attrs:{href:'javascript:alert(1)',target:'_blank'}}]}]},
    {type:'image',attrs:{src:'javascript:alert(1)',alt:'图片替代文字',onerror:'alert(1)'}},
    {type:'codeBlock',attrs:{language:'bash"><img src=x onerror=alert(1)>'},content:[{type:'text',text:'echo safe'}]},
  ]};
  const safe=sanitizeMarkdownDocument(hostile,qidianSchema,safeUrl);
  const checked=qidianSchema.nodeFromJSON(safe);checked.check();
  assert.doesNotMatch(JSON.stringify(safe),/javascript:|onerror|<img/);
  assert.match(JSON.stringify(safe),/图片替代文字/);
  assert.equal(safe.content.at(-1).attrs.language,null);
});
test('quick capture uses the same Markdown parser and retains fenced code language', async () => {
  const { dom, w } = await mount();
  w.document.execCommand=(command,_showUI,value)=>{
    if(command==='insertHTML')w.document.querySelector('#capturePad').insertAdjacentHTML('beforeend',value);
    return true;
  };
  w.document.querySelector('#quickCapture').click();
  const pad=w.document.querySelector('#capturePad');
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?'# Docker 快速记录\n\n```bash\ndocker run hello-world\n```':'';}}});
  pad.dispatchEvent(paste);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(paste.defaultPrevented,true);
  assert.equal(w.document.querySelector('#captureName').value,'Docker 快速记录');
  assert.match(pad.innerHTML,/<pre[^>]*><code class="language-bash">docker run hello-world<\/code><\/pre>/);
  dom.window.close();
});
test('quick capture can paste exact plain text with blank lines and no forced Markdown', async()=>{
  const {dom,w}=await mount();
  w.document.querySelector('#quickCapture').click();
  w.document.querySelector('#capturePasteMode').value='plain';
  const pad=w.document.querySelector('#capturePad');
  const source='# 按原文保留\n第一行\n\n末尾';
  const paste=new w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?source:'';}}});
  pad.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented,true);
  assert.match(pad.innerHTML,/<p># 按原文保留<br>第一行<br><br>末尾<\/p>/);
  assert.doesNotMatch(pad.innerHTML,/<h1>|<pre>/);
  dom.window.close();
});
test('pasting fills an empty note title and preserves a manually entered title', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const pastePlain=text=>{
    const event=new w.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{files:[],getData(type){return type==='text/plain'?text:'';}}});
    w.currentEditor.view.someProp('handlePaste',handler=>handler(w.currentEditor.view,event,null));
  };
  const title=w.document.querySelector('#editTitle');
  pastePlain('# VPS 常用命令\n\n整理服务器常用命令。');
  assert.equal(title.value,'VPS 常用命令');
  title.value='我手动填写的标题';
  title.dispatchEvent(new w.Event('input',{bubbles:true}));
  pastePlain('# 后续粘贴内容\n\n继续补充说明。');
  assert.equal(title.value,'我手动填写的标题');
  await new Promise(resolve=>setTimeout(resolve,250));
  dom.window.close();
});
test('table toolbar can add and remove rows and columns inside a selected table', async () => {
  const { dom, w } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.currentEditor.chain().focus().insertTable({ rows:2, cols:2, withHeaderRow:true }).run();
  const addRow = w.document.querySelector('[data-table-action="addRowAfter"]');
  assert.equal(addRow.disabled, false, 'table actions enable when the selection is in a table');
  addRow.click();
  assert.equal(w.currentEditor.view.dom.querySelectorAll('tr').length, 3);
  w.document.querySelector('[data-table-action="addColumnAfter"]').click();
  assert.equal(w.currentEditor.view.dom.querySelector('tr').children.length, 3);
  w.document.querySelector('[data-table-action="deleteColumn"]').click();
  assert.equal(w.currentEditor.view.dom.querySelector('tr').children.length, 2);
  w.document.querySelector('[data-table-action="deleteRow"]').click();
  assert.equal(w.currentEditor.view.dom.querySelectorAll('tr').length, 2);
  dom.window.close();
});
test('editor offers undo, redo, inline code, clear formatting and link removal while writing', async () => {
  const { dom, w } = await mount();
  w.Range.prototype.getClientRects=()=>[];
  w.Range.prototype.getBoundingClientRect=()=>({top:0,bottom:0,left:0,right:0});
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const editor=w.currentEditor;
  editor.commands.setContent('<p><strong>加粗文本</strong> <a href="https://example.com">打开网页</a></p>');
  const unlink=w.document.querySelector('[data-editor-action="unlink"]');
  let linkPosition=-1;
  editor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='打开网页')linkPosition=pos});
  assert.notEqual(linkPosition,-1);
  editor.commands.setTextSelection({from:linkPosition,to:linkPosition+4});
  assert.equal(unlink.disabled,false);
  unlink.click();
  assert.match(editor.getHTML(),/打开网页/);
  assert.doesNotMatch(editor.getHTML(),/href="https:\/\/example.com"/);
  let boldPosition=-1;
  editor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='加粗文本')boldPosition=pos});
  editor.commands.setTextSelection({from:boldPosition,to:boldPosition+2});
  w.document.querySelector('[data-fmt="code"]').click();
  assert.equal(editor.isActive('code'),true);
  w.document.querySelector('[data-editor-action="clear-format"]').click();
  assert.doesNotMatch(editor.getHTML(),/<code>/);
  editor.commands.setTextSelection({from:boldPosition+2,to:boldPosition+4});
  w.document.querySelector('[data-editor-action="clear-format"]').click();
  assert.doesNotMatch(editor.getHTML(),/<strong>/);
  editor.chain().focus().insertContent('<p>可撤销内容</p>').run();
  const undo=w.document.querySelector('[data-editor-action="undo"]');
  assert.equal(undo.disabled,false);
  undo.click();
  assert.doesNotMatch(editor.getHTML(),/可撤销内容/);
  const redo=w.document.querySelector('[data-editor-action="redo"]');
  assert.equal(redo.disabled,false);
  redo.click();
  assert.match(editor.getHTML(),/可撤销内容/);
  dom.window.close();
});
test('callout toolbar removes the whole hint block only when the cursor is inside it', async () => {
  const { dom, w, saves } = await mount();
  w.Range.prototype.getClientRects=()=>[];
  w.Range.prototype.getBoundingClientRect=()=>({top:0,bottom:0,left:0,right:0});
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.currentEditor.chain().focus().insertContent('<div class="callout"><p>要删除的提示</p></div><p>保留正文</p>').run();
  const remove = w.document.querySelector('[data-delete-block="callout"]');
  assert.ok(remove, 'the toolbar should expose a delete-hint action');
  assert.equal(remove.disabled, true, 'the action should be disabled outside a hint block');
  let calloutPosition=-1;
  w.currentEditor.state.doc.descendants((node,pos)=>{if(node.type.name==='callout')calloutPosition=pos});
  const state=w.currentEditor.state;
  w.currentEditor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc,calloutPosition+2)));
  assert.equal(remove.disabled, false, 'the action should enable while the cursor is in a hint block');
  remove.click();
  assert.doesNotMatch(w.currentEditor.getHTML(),/class="callout/);
  assert.match(w.currentEditor.getHTML(),/保留正文/);
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.doesNotMatch(saves.at(-1).notes[0].body,/class="callout/);
  assert.match(saves.at(-1).notes[0].body,/保留正文/);
  dom.window.close();
});
test('sidebar note types collapse preference is saved in the account vault', async () => {
  const { dom, w, saves } = await mount();
  let toggle = w.document.querySelector('#toggleNoteTypes');
  const categoryHeading = w.document.querySelector('#addCategory').parentElement;
  assert.ok(toggle.closest('.side-heading'));
  assert.ok(categoryHeading.classList.contains('side-heading'));
  assert.ok(categoryHeading.querySelector('.side-heading-title'));
  assert.equal(categoryHeading.querySelector('#addCategory').type,'button');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.querySelector('svg')?.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(toggle.querySelector('span')?.textContent, '笔记类型', 'the section label should be part of the toggle button');
  assert.equal(toggle.tagName, 'BUTTON', 'the full heading area should be a keyboard-accessible button');
  assert.equal(w.document.querySelector('#sideTypes').hidden, false);
  w.document.querySelector('[data-type-nav="command"]').click();
  const title = w.document.querySelector('#breadcrumbTitle').textContent;
  toggle = w.document.querySelector('#toggleNoteTypes');
  toggle.querySelector('span').click();
  assert.equal(w.document.querySelector('#sideTypes').hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-label'), '展开笔记类型');
  assert.equal(w.document.querySelector('#breadcrumbTitle').textContent, title);
  assert.equal(saves.at(-1).noteTypesExpanded, false);
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  assert.equal(w.document.querySelector('#sideTypes').hidden, true, 'collapsed state should survive sidebar rerenders');
  toggle = w.document.querySelector('#toggleNoteTypes');
  const savesBeforeExpand = saves.length;
  toggle.querySelector('svg').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(w.document.querySelector('#sideTypes').hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(saves.length, savesBeforeExpand + 1);
  assert.equal(saves.at(-1).noteTypesExpanded, true);
  w.document.querySelector('#toggleNoteTypes span').click();
  w.document.querySelector('#addNoteType').click();
  assert.equal(w.document.querySelector('#sideTypes').hidden, true, 'the add button should remain independent of the collapse control');
  assert.equal(w.document.querySelector('#typeOverlay').classList.contains('open'), true);
  w.document.querySelector('[data-close="typeOverlay"]').click();
  dom.window.close();
});
test('theme menu supports system, light and dark preferences and follows system changes', async () => {
  const options={systemDark:true};
  const { dom, w, saves } = await mount(empty,options);
  const button=w.document.querySelector('#themeBtn'),menu=w.document.querySelector('#themeMenu'),icon=button.querySelector('use');
  assert.equal(w.document.documentElement.dataset.theme,'light','an explicit light preference overrides a dark system');
  assert.equal(w.document.documentElement.dataset.themePreference,'light');
  assert.equal(icon.getAttribute('href'),'#i-moon');
  button.click();
  assert.equal(menu.hidden,false);
  assert.equal(button.getAttribute('aria-expanded'),'true');
  w.document.querySelector('[data-theme-choice="system"]').click();
  assert.equal(menu.hidden,true);
  assert.equal(w.document.documentElement.dataset.themePreference,'system');
  assert.equal(w.document.documentElement.dataset.theme,'dark');
  assert.match(button.getAttribute('aria-label'),/跟随系统/);
  assert.equal(saves.at(-1).theme,'system');
  options.setSystemDark(false);
  assert.equal(w.document.documentElement.dataset.theme,'light','system preference reacts without another save');
  assert.equal(w.document.querySelector('meta[name="theme-color"]').content,'#f6f7fb');
  button.click();
  w.document.querySelector('[data-theme-choice="dark"]').click();
  assert.equal(w.document.documentElement.dataset.theme,'dark');
  assert.equal(w.document.documentElement.dataset.themePreference,'dark');
  assert.equal(saves.at(-1).theme,'dark');
  dom.window.close();
});

test('system theme is accepted by vault validation and mobile dashboard keeps both workspaces near the first screen', async () => {
  const validated=validateVault({...structuredClone(empty),bookmarks:[],theme:'system'});
  assert.equal(validated.theme,'system');
  const styles=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(styles,/\.dashboard-notes \.note-card:nth-child\(n\+3\)\{display:none\}/);
  assert.match(styles,/env\(safe-area-inset-bottom\)/);
  assert.match(styles,/min-height:100dvh/);
});
test('account menu separates profile from app settings and removes settings from the sidebar', async () => {
  const { dom, w } = await mount();
  assert.equal(w.document.querySelector('#sideManage'),null,'the empty management section should be removed from the sidebar');
  assert.equal(w.document.querySelector('#manageSettings'),null);
  assert.ok(w.document.querySelector('#openProfileSettings'));
  assert.ok(w.document.querySelector('#openAppSettings'));
  for(const id of ['backupHistory','retrySync','reloadCloud','restoreLocalDraft','exportBtn','importBtn']){
    assert.ok(w.document.querySelector(`#appSettingsOverlay #${id}`),`${id} should be organized inside app settings`);
    assert.equal(w.document.querySelector(`#${id}`)?.closest('.sidebar-scroll'),null,`${id} should no longer be a sidebar item`);
  }
  const trigger=w.document.querySelector('#accountButton'), menu=w.document.querySelector('#accountMenu');
  assert.ok(trigger.querySelector('use[href="#i-user"]'),'empty avatar should show a user icon');
  assert.equal(menu.hidden,true);
  trigger.click();
  assert.equal(menu.hidden,false);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  w.document.querySelector('#openProfileSettings').click();
  assert.equal(menu.hidden,true);
  assert.equal(w.document.querySelector('#profileSettingsOverlay').classList.contains('open'),true);
  assert.equal(w.document.querySelector('#appSettingsOverlay').classList.contains('open'),false);
  const profile=w.document.querySelector('#profileSettingsOverlay');
  assert.ok(profile.textContent.includes('更换头像'));
  assert.ok(profile.textContent.includes('修改密码'));
  assert.equal(profile.querySelector('.account-dialog-subtitle'),null,'profile dialog should not repeat its purpose under the title');
  assert.equal(profile.querySelector('.profile-upload-actions>span'),null,'account type label is redundant');
  assert.equal(profile.querySelector('#profileCreated'),null,'account creation date is not needed in the profile dialog');
  assert.equal(profile.querySelector('.account-dialog-foot'),null,'header close button is the only profile dialog close action');
  assert.equal(profile.querySelector('#backupHistory'),null);
  assert.ok(menu.querySelector('#accountLogout'),'logout remains available in the account menu');
  w.document.querySelector('[data-close="profileSettingsOverlay"]').click();
  assert.equal(w.document.querySelector('#profileSettingsOverlay').classList.contains('open'),false);
  trigger.click();
  w.document.querySelector('#openAppSettings').click();
  assert.equal(w.document.querySelector('#appSettingsOverlay').classList.contains('open'),true);
  assert.equal(w.document.querySelector('#profileSettingsOverlay').classList.contains('open'),false);
  assert.ok(w.document.querySelector('#appSettingsOverlay').textContent.includes('数据与恢复'));
  assert.ok(w.document.querySelector('#appSettingsOverlay').textContent.includes('备份与迁移'));
  assert.ok(w.document.querySelector('#appSettingsOverlay').textContent.includes('设置只影响当前账号'));
  assert.equal(w.document.querySelectorAll('#appSettingsOverlay [data-close="appSettingsOverlay"]').length,1,'the fixed header is the only settings close action');
  dom.window.close();
});
test('account settings keep the footer visible while long dialog content scrolls independently', async () => {
  const styles=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(styles,/\.account-dialog\{display:flex;flex-direction:column;min-height:0;max-height:min\(90vh,920px\);overflow:hidden\}/);
  assert.match(styles,/\.account-dialog>\.dialog-body\{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain\}/);
  assert.match(styles,/\.account-dialog>\.dialog-foot\{background:var\(--panel\)\}/);
  assert.match(styles,/\.account-password-section #changePasswordButton\{margin-bottom:5px\}/);
  assert.match(styles,/\.account-settings-message:empty\{display:none\}/,'empty account status messages should not reserve vertical space');
  assert.match(styles,/\.account-password-section\{border-top:1px solid var\(--line\);padding-top:12px;margin-top:12px\}/,'profile sections use compact spacing');
  assert.match(styles,/\.bookmark-page \.bookmark-card:focus-within>\.item-menu/);
  assert.match(styles,/@media\(hover:none\), \(max-width:720px\)\{\.bookmark-page \.bookmark-card>\.item-menu,.bookmark-page \.bookmark-section-heading>\.item-menu\{opacity:1\}\}/);
});
test('automatic backup history lists revisions with separate download and restore actions', async () => {
  const { dom, w } = await mount(empty, { backups:[{ revision:12, created:Date.UTC(2026,9,10) }, { revision:11, created:Date.UTC(2026,9,9) }] });
  w.document.querySelector('#accountButton').click();
  w.document.querySelector('#openAppSettings').click();
  w.document.querySelector('#backupHistory').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.document.querySelectorAll('#backupHistoryList .backup-row').length, 2);
  assert.ok(w.document.querySelector('[data-backup-download="12"]'));
  assert.ok(w.document.querySelector('[data-backup-restore="12"]'));
  assert.match(w.document.querySelector('#backupHistoryOverlay').textContent, /不含附件文件/);
  dom.window.close();
});
test('restoring a history revision downloads the current full backup before queueing the older vault', async () => {
  const current = structuredClone(empty);
  current.notes.push({ id:'current', title:'当前版本', type:'note', category:'开发', tags:[], body:'<p>当前</p>', source:'', created:1, updated:2, pinned:false });
  const restoreOptions = {
    backups:[{ revision:12, created:Date.UTC(2026,9,10) }],
    snapshot:{ categories:['开发'], noteTypes:structuredClone(empty.noteTypes), notes:[{ id:'restored', title:'历史版本', type:'note', category:'开发', tags:[], body:'<p>历史</p>', source:'', created:1, updated:1, pinned:false }], theme:'light', pasteMode:'rich' },
  };
  const { dom, w, saves } = await mount(current, restoreOptions);
  w.document.querySelector('#accountButton').click();
  w.document.querySelector('#openAppSettings').click();
  w.document.querySelector('#backupHistory').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  w.document.querySelector('[data-backup-restore="12"]').click();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(restoreOptions.requestedBackup, '12');
  assert.equal(w.document.querySelector('#toast').textContent, '');
  assert.equal(restoreOptions.exportedBeforeRestore.notes[0].title, '当前版本');
  assert.equal(saves.at(-1).notes[0].title, '历史版本');
  assert.equal(w.document.querySelector('#backupHistoryOverlay').classList.contains('open'), false);
  dom.window.close();
});
test('note types can be created and renamed from the sidebar and persist in the vault', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#addNoteType').click();
  w.document.querySelector('#typeNameInput').value = '读书笔记';
  w.document.querySelector('#typeDialogConfirm').click();
  let created = saves.at(-1).noteTypes.find(t => t.name === '读书笔记');
  assert.ok(created); assert.match(created.id, /^custom_/);
  assert.ok(w.document.querySelector(`[data-type-edit="${created.id}"]`));
  w.document.querySelector('[data-type-edit="command"]').click();
  const name = w.document.querySelector('#typeNameInput'); name.value = '终端命令';
  w.document.querySelector('#typeDialogConfirm').click();
  assert.deepEqual(saves.at(-1).noteTypes.find(t => t.id === 'command'), { id:'command', name:'终端命令' });
  dom.window.close();
});
test('new categories use the in-app dialog and are saved to the vault', async () => {
  const { dom, w, saves } = await mount();
  let nativePromptCalls = 0;
  w.prompt = () => { nativePromptCalls += 1; throw new Error('native prompt should not be used'); };
  w.document.querySelector('#addCategory').click();
  const overlay = w.document.querySelector('#categoryOverlay');
  const input = w.document.querySelector('#categoryNameInput');
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(overlay.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  w.document.querySelector('#categoryDialogConfirm').click();
  assert.equal(overlay.classList.contains('open'), true);
  assert.equal(w.document.querySelector('#categoryDialogMessage').textContent, '请输入分类名称');
  input.value = '系统维护';
  w.document.querySelector('#categoryDialogConfirm').click();
  assert.equal(overlay.classList.contains('open'), false);
  assert.ok(saves.at(-1).categories.includes('系统维护'));
  assert.ok(w.document.querySelector('#sideCats [data-nav="系统维护"]'));
  assert.equal(nativePromptCalls, 0);
  dom.window.close();
});
test('deleting a note type requires a target and preserves its notes by reassignment', async () => {
  const vault = structuredClone(empty);
  vault.notes.push({ id:'nclip', title:'网页资料', type:'clip', category:'开发', tags:[], body:'<p>保留正文 📌</p>', source:'', created:1, updated:2, pinned:false });
  const { dom, w, saves } = await mount(vault);
  w.document.querySelector('[data-type-delete="clip"]').click();
  assert.match(w.document.querySelector('#typeDialogBody').textContent, /1 篇笔记/);
  w.document.querySelector('#typeReplacement').value = 'note';
  w.document.querySelector('#typeDialogConfirm').click();
  const saved = saves.at(-1);
  assert.equal(saved.noteTypes.some(t => t.id === 'clip'), false);
  assert.equal(saved.notes[0].type, 'note'); assert.match(saved.notes[0].body,/保留正文/);
  dom.window.close();
});
test('deleting the last non-default type creates a default target and preserves its notes', async () => {
  const vault = { ...structuredClone(empty), noteTypes:[{id:'issue',name:'故障排查'}], notes:[{ id:'nissue', title:'排查记录', type:'issue', category:'开发', tags:[], body:'<p>仍然保留</p>', source:'', created:1, updated:2, pinned:false }] };
  const { dom, w, saves } = await mount(vault);
  const deleteButton = w.document.querySelector('[data-type-delete="issue"]');
  assert.equal(deleteButton.disabled, false, 'the last non-default type can be removed');
  deleteButton.click();
  const replacement = w.document.querySelector('#typeReplacement');
  assert.equal(replacement.value, 'note');
  assert.match(replacement.options[0].textContent, /自动创建/);
  w.document.querySelector('#typeDialogConfirm').click();
  const saved = saves.at(-1);
  assert.deepEqual(saved.noteTypes, [{ id:'note', name:'普通笔记' }]);
  assert.equal(saved.notes[0].type, 'note');
  assert.match(saved.notes[0].body, /仍然保留/);
  dom.window.close();
});
test('the final ordinary note type remains available as a fallback', async () => {
  const vault = { ...structuredClone(empty), noteTypes:[{id:'note',name:'普通笔记'}] };
  const { dom, w } = await mount(vault);
  assert.equal(w.document.querySelector('[data-type-delete="note"]').disabled, true);
  dom.window.close();
});
test('HTML rendering retains rich tables, details, callouts and removes executable markup', async () => {
  const { dom, w, saves } = await mount();
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const body = w.document.querySelector('#editorSurface');
  w.currentEditor.commands.setContent('<details><summary>折叠</summary><div data-type="detailsContent"><p>✅</p></div></details><div class="callout warn">提示</div><p><span style="background-color: rgb(255, 245, 150)">高亮</span></p><table><tbody><tr><th>列一</th><td colspan="2" style="color: red">表格</td></tr></tbody></table><img src="https://example.com/a.png" style="width: 50%" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">恶意</a>');
  w.document.querySelector('#saveEditor').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const stored = saves.at(-1).notes[0].body;
  assert.match(stored,/<details>/); assert.match(stored,/callout warn/); assert.match(stored,/colspan="2"/); assert.match(stored,/color: red/); assert.match(stored,/background-color: rgb\(255, 245, 150\)/); assert.match(stored,/width: 50%/);
  assert.doesNotMatch(stored,/onerror|<script|javascript:/); dom.window.close();
});
test('code copy control stays outside horizontally scrolling code and uses an accessible icon', async () => {
  const { dom, w } = await mount();
  const code = 'docker run --name qinglong --publish 5700:5700 --volume /root/ql:/ql/data --restart=always whyour/qinglong:2.11.3';
  let copied = '';
  Object.defineProperty(w, 'isSecureContext', { configurable:true, value:true });
  Object.defineProperty(w.navigator, 'clipboard', { configurable:true, value:{ writeText:async text => { copied = text; } } });
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  const body = w.document.querySelector('#editorSurface');
  w.currentEditor.commands.setContent(`<pre><code>${code}</code></pre>`);
  w.document.querySelector('#saveEditor').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const button = w.document.querySelector('.copy-code');
  assert.ok(button);
  assert.equal(button.closest('pre'), null, 'copy button must not scroll with pre contents');
  assert.equal(button.parentElement.className, 'code-block');
  assert.equal(button.getAttribute('aria-label'), '复制代码');
  assert.ok(button.querySelector('svg'), 'copy control should show an icon instead of text');
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied, code);
  assert.equal(button.getAttribute('aria-label'), '已复制代码');
  dom.window.close();
});

test('code copy falls back to selection and execCommand on plain HTTP', async () => {
  const { dom, w } = await mount();
  const code = 'docker compose up -d --remove-orphans';
  Object.defineProperty(w, 'isSecureContext', { configurable:true, value:false });
  let copied = '', selectionWasReady = false;
  w.document.execCommand = command => {
    const field = w.document.activeElement;
    assert.equal(command, 'copy');
    copied = field.value;
    selectionWasReady = field.tagName === 'TEXTAREA' && field.selectionStart === 0 && field.selectionEnd === code.length;
    return true;
  };
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.currentEditor.commands.setContent(`<pre><code>${code}</code></pre>`);
  w.document.querySelector('#saveEditor').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const button = w.document.querySelector('.copy-code');
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied, code);
  assert.equal(selectionWasReady, true);
  assert.equal(button.getAttribute('aria-label'), '已复制代码');
  assert.equal(w.document.querySelector('#toast').classList.contains('show'), false);
  dom.window.close();
});

test('code copy reports failure only when both clipboard methods fail', async () => {
  const { dom, w } = await mount();
  Object.defineProperty(w, 'isSecureContext', { configurable:true, value:false });
  w.document.execCommand = () => false;
  w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
  w.currentEditor.commands.setContent('<pre><code>echo unavailable</code></pre>');
  w.document.querySelector('#saveEditor').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  w.document.querySelector('.copy-code').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(w.document.querySelector('#toast').textContent, /复制失败/);
  dom.window.close();
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
  assert.deepEqual(saves.at(-1).bookmarks,[
    {id:'group',kind:'folder',title:'开发',children:[{id:'child',kind:'folder',title:'文档',children:[]}]},
    {id:'site',kind:'link',title:'Web 文档',url:'https://developer.mozilla.org/'}
  ]);
  assert.deepEqual(saves.at(-1).trash,[]);
  dom.window.close();
});

test('bookmark HTML import previews folders, imports directly, and escapes imported names', async () => {
  const options = {};
  const { dom, w, saves } = await mount(empty, options);
  w.document.querySelector('#openBookmarks').click();
  const input = w.document.querySelector('input[accept=".html,.htm"]');
  Object.defineProperty(input, 'files', { value:[{ size:500, text:async()=>'<DL><DT><H3>开发</H3><DL><DT><A HREF="https://example.com/?q=1">&lt;img src=x onerror=alert(1)&gt;</A></DL></DL>' }] });
  await input.onchange();
  assert.match(w.document.querySelector('#bookmarkOverlay').textContent, /新增 1 个书签/);
  assert.equal(saves.length, 0);
  assert.equal(options.exportedBeforeRestore, undefined);
  w.document.querySelector('#bookmarkForm').dispatchEvent(new w.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(options.exportedBeforeRestore, undefined, 'bookmark HTML import does not force a full backup download');
  assert.equal(saves.at(-1).bookmarks[0].children[0].url, 'https://example.com/?q=1');
  assert.equal(w.document.querySelector('#bookmarkTree img:not(.bookmark-site-favicon)'), null);
  assert.equal(w.document.querySelector('.bookmark-link strong').textContent, '<img src=x onerror=alert(1)>');
  dom.window.close();
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
  assert.deepEqual(saves.at(-1).bookmarks[0].children.map(x=>x.id), ['sortb','sortchild','sorta']);
  assert.equal(saves.at(-1).bookmarks[0].children[1].children[0].id, 'nestedsite');
  assert.deepEqual([...w.document.querySelectorAll('.bookmark-link strong')].map(x=>x.textContent), ['网站 B','网站 A','子网站']);
  assert.equal(w.document.querySelector('[data-bm-up="sortb"]').disabled, true);
  dom.window.close();
});

const designVault=()=>({...structuredClone(empty),notes:[{id:'design-note',title:'共享关键词笔记',type:'note',category:'开发',tags:[],body:'<h2>开始</h2><p>测试笔记正文</p>',created:1,updated:2,status:'published'}],bookmarks:[{id:'d-root',kind:'folder',title:'工作',children:[{id:'d-a',kind:'link',title:'共享关键词网站',url:'https://example.com/a',pinned:true},{id:'d-child',kind:'folder',title:'文档',children:[{id:'d-b',kind:'link',title:'文档站点',url:'https://example.com/b'}]}]},{id:'d-other',kind:'folder',title:'生活',children:[{id:'d-c',kind:'link',title:'生活站点',url:'https://example.org/c'}]}]});

test('unified navigation exposes peer workspaces and creation choices without mutating content',async()=>{
 const {dom,w,saves}=await mount(designVault());
 assert.deepEqual([...w.document.querySelectorAll('#sideCore>.side-link')].map(n=>n.textContent.replace(/\d+/g,'').trim()),['首页','笔记','书签','回收站']);
 assert.equal(w.document.querySelector('#sideTypes').closest('.side-section').hidden,true);
 w.document.querySelector('#newSide').click();assert.equal(saves.length,0);
 assert.deepEqual([...w.document.querySelectorAll('[data-create-kind]')].map(n=>n.dataset.createKind),['note','bookmark','capture']);
 w.document.querySelector('[data-create-kind="bookmark"]').click();
 assert.equal(w.document.querySelector('#breadcrumbTitle').textContent,'书签导航');
 assert.ok(w.document.querySelector('#bmURL'));assert.equal(saves.length,0);
 w.document.querySelector('[data-bm-close]').click();w.document.querySelector('#mobileCats').click();
 assert.equal(w.document.querySelector('#sideTypes').closest('.side-section').hidden,false);
 assert.equal(w.document.querySelector('#mobileCats').classList.contains('selected'),true);
 w.document.querySelector('#mobileNew').click();w.document.querySelector('[data-create-kind="capture"]').click();
 assert.equal(w.document.querySelector('#captureOverlay').classList.contains('open'),true);dom.window.close();
});

test('global search labels both content types while local note search and return preserve scope',async()=>{
 const {dom,w}=await mount(designVault());w.document.querySelector('#searchTop').click();
 const search=w.document.querySelector('#globalSearch');search.value='共享关键词';search.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.querySelectorAll('#switcherList [data-search-id]').length,1);
 const link=w.document.querySelector('#switcherList [data-search-bookmark]');assert.equal(link.href,'https://example.com/a');assert.equal(link.target,'_blank');
 assert.deepEqual([...w.document.querySelectorAll('#switcherList .search-kind')].map(n=>n.textContent),['笔记','书签']);
 w.document.querySelector('#mobileCats').click();w.document.querySelector('#switcher').classList.remove('open');
 const local=w.document.querySelector('#notePageSearch');assert.match(local.placeholder,/筛选本页笔记/);assert.match(local.getAttribute('aria-label'),/当前笔记/);assert.equal(w.document.querySelector('.section-right .muted'),null,'the visible note total is not duplicated beside the create action');local.value='测试笔记正文';local.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.querySelectorAll('.note-list .note-card').length,1);
 w.document.querySelector('.note-card-open').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.ok(w.document.querySelector('#docRead'));w.document.querySelector('#backDoc').click();
 assert.equal(w.document.querySelector('#notePageSearch').value,'测试笔记正文');
 const menu=w.document.querySelector('.note-item-menu');assert.equal(menu.open,false);menu.querySelector('summary').click();assert.equal(menu.open,true);dom.window.close();
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

test('editor groups secondary tools and metadata without losing code, table or formatting commands',async()=>{
 const {dom,w}=await mount();w.document.querySelector('#newSide').click();w.document.querySelector('[data-create-kind="note"]').click();
 assert.ok(w.document.querySelector('.editor-properties #editCategory'));assert.ok(w.document.querySelector('.editor-extra-tools [data-insert="callout"]'));
 assert.ok(w.document.querySelector('.editor-extra-tools [data-fmt="strikeThrough"]'));assert.ok(w.document.querySelector('#editorToolbar>[data-insert="code"]'));
 assert.ok(w.document.querySelector('#editorToolbar>[data-insert="table"]'));assert.ok(w.document.querySelector('.document-more #exportHtml'));dom.window.close();
 const styles=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(styles,/\.editor-extra-panel\{width:min\(280px,calc\(100vw - 32px\)\);min-width:min\(280px,calc\(100vw - 32px\)\);max-width:calc\(100vw - 32px\)/,'the mobile More menu has a stable width and remains within the viewport');
});
