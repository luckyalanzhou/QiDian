
import DOMPurify from 'dompurify';
import appPackage from '../package.json';
import { createBookmarkView } from './bookmarks.js';
import { createRecycleBinView } from './recycle-bin.js';
import { createTrashEntry } from './trash-data.js';
import { renderReleaseNotes } from './release-notes.js';
import { bootstrap, getAuthConfig, loginAccount, reauthenticateAccount, registerAccount, logoutAccount, getAccountProfile, getAccountAvatar, saveAccountAvatar, removeAccountAvatar, changeAccountPassword, getSystemVersion, requestSystemUpdate, getSystemUpdateStatus, queueSave, commitSave, flush, onStatus, onAuthenticationRequired, onRemoteUpdate, refreshCloud, getSyncConflict, exportSyncConflict, setOwner, upload, pruneAssets, exportBackup, exportHTML, readBackup, listBackups, createBackupSnapshot, getBackup, download, hasUnsaved, reloadCloud, restoreIgnoredDraft, retrySync } from './cloud.js';
import { DEFAULT_NOTE_TYPES, validateVault } from '../server/validation.js';
import { classifyClipboard, looksLikeMarkdown, plainTextToDocument, sanitizeMarkdownDocument } from './paste.js';
const loadMarkdownTools = () => import('./markdown.js');
const APP_VERSION = appPackage.version;
let initial;
try { initial = await bootstrap(); } catch(error) {
 if (error.status === 401) await showAuthentication(error.details);
 else showStartupError(error);
}
if (initial) launchWorkspace(initial);
function showStartupError(error) {
 const gate = document.querySelector('#loginGate'); gate.innerHTML = `<div class="auth-card"><h1>暂时无法连接</h1><p class="auth-intro">${String(error.message || '服务暂不可用').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p><button class="primary-btn auth-submit" id="authRetry">重试</button></div>`;
 document.querySelector('#authRetry').addEventListener('click', () => location.reload());
}
async function showAuthentication(sessionConfig = null, recovery = null) {
 const previousGate = document.querySelector('#loginGate');
 const gate = previousGate.cloneNode(true); previousGate.replaceWith(gate); gate.hidden = false; gate.classList.toggle('reauth', !!recovery);
 const form = gate.querySelector('#authForm');
 let config = recovery ? { registrationEnabled:false } : sessionConfig;
 if (typeof config?.registrationEnabled !== 'boolean') {
  try { config = await getAuthConfig(); } catch (error) { showStartupError(error); return; }
 }
 const links = gate.querySelector('#authLinks'), registerLink = gate.querySelector('#authRegister');
 const setupRequired = !recovery && config.setupRequired === true;
 registerLink.hidden = !!recovery || !config.registrationEnabled;
 links.hidden = !!recovery;
 let mode = 'login';
 const setMode = value => {
  mode = value;
  const registering = mode === 'register';
  document.querySelector('.auth-card').classList.toggle('registering', registering);
  form.hidden = false;
  links.hidden = !!recovery;
  registerLink.hidden = registering || !config.registrationEnabled;
  document.querySelector('#authReturnLogin').hidden = !registering || setupRequired;
  document.querySelector('#authConfirmWrap').hidden = !registering;
  const passwordInput = document.querySelector('#authPassword');
  const identityInput = document.querySelector('#authUsername');
  identityInput.minLength = 3;
  identityInput.maxLength = 32;
  document.querySelector('label[for="authUsername"]').textContent = '账号';
  identityInput.placeholder = registering ? '3–32 位英文、数字、点、下划线或短横线' : '输入账号';
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  passwordInput.minLength = registering ? 8 : 1;
  passwordInput.placeholder = registering ? '至少 8 个字符' : '请输入密码';
  document.querySelector('#authPasswordHint').hidden = !registering;
  document.querySelector('label[for="authPassword"]').textContent = '密码';
  gate.querySelector('#authTitle').textContent = recovery ? '登录状态已失效' : registering ? (setupRequired ? '创建管理员账号' : '创建个人账号') : '进入你的知识库';
  gate.querySelector('.auth-intro').textContent = recovery ? '请重新登录；当前修改保留在此页面，登录后会继续同步。' : registering ? (setupRequired ? '首次使用请设置管理员账号和密码。账号名称可以修改。' : '填写账号和密码。') : '使用账号和密码登录。';
  gate.querySelector('#authSubmit').textContent = registering ? (setupRequired ? '创建管理员' : '创建账号') : '登录';
  gate.querySelector('#authMessage').textContent = '';
  gate.querySelector('#authMessage').classList.remove('success');
 };
 gate.querySelector('#authRegister').addEventListener('click', () => setMode('register'));
 gate.querySelector('#authReturnLogin').addEventListener('click', () => setMode('login'));
 if (recovery) gate.querySelector('#authUsername').value = recovery.username || '';
 if (setupRequired) gate.querySelector('#authUsername').value = 'admin';
 setMode(setupRequired ? 'register' : 'login');
 form.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.querySelector('#authUsername').value.trim();
  const password = document.querySelector('#authPassword').value;
  const message = document.querySelector('#authMessage'), button = document.querySelector('#authSubmit');
  if (mode === 'register' && password !== document.querySelector('#authPasswordConfirm').value) { message.textContent = '两次输入的密码不一致'; return; }
  button.disabled = true; button.setAttribute('aria-busy','true'); message.classList.remove('success'); message.textContent = mode === 'register' ? '正在安全创建账号…' : '正在连接验证服务…';
  let authenticated;
  try {
   if (mode === 'register') {
    await registerAccount(username, password);
    message.textContent = '账号已创建，正在载入私人空间…';
    authenticated = await bootstrap();
   } else authenticated = await (recovery?.authenticate || loginAccount)(username, password, stage => {
    message.textContent = ({ challenge:'正在连接验证服务…', derive:'正在安全计算登录凭据…', verify:'正在验证账号…', load:'正在载入私人空间…' })[stage] || '正在处理登录…';
   });
   message.classList.add('success'); message.textContent = '验证成功，正在载入你的知识库…';
   button.disabled = false; button.removeAttribute('aria-busy');
   if (recovery) {
    await recovery.onAuthenticated(authenticated);
    gate.hidden = true; gate.classList.remove('reauth');
    return;
   }
   initial = authenticated;
   gate.hidden = true; document.body.classList.remove('booting'); document.querySelector('.app').hidden = false;
   launchWorkspace(initial);
  } catch (error) { message.classList.remove('success'); message.textContent = error.message || '操作未完成，请重试'; button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = mode === 'register' ? (setupRequired ? '创建管理员' : '创建账号') : '登录'; }
 });
}
function launchWorkspace(initial) {
 const authGate = document.querySelector('#loginGate'); if (authGate) { authGate.hidden = true; authGate.classList.remove('reauth'); } document.body.classList.remove('booting'); document.querySelector('.app').hidden = false;
 (()=>{'use strict';
const icons=name=>`<span class="ico"><svg aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
const $=sel=>document.querySelector(sel);const main=$('#main');const displayTypeName=type=>type.id==='clip'&&type.name==='网页收藏'?'网页摘录':type.name;const typeLabel=id=>{const type=data.noteTypes.find(x=>x.id===id);return type?displayTypeName(type):'其他类型'};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tinyText=s=>{let box=document.createElement('div');box.innerHTML=s;box.querySelectorAll('br').forEach(node=>node.replaceWith(' '));box.querySelectorAll('p,div,li,blockquote,pre,h1,h2,h3,h4,h5,h6,tr').forEach(node=>node.append(' '));return (box.textContent||'').replace(/\s+/g,' ').trim()};
let data = { ...initial.data, noteTypes: initial.data.noteTypes || structuredClone(DEFAULT_NOTE_TYPES), trash: initial.data.trash || [] }; setOwner(initial.owner);
let lastRenderedPage='',noteReturn=null,noteQuery='',page='dashboard',active='all',typeFilter='all',noteId=null,edit=false,previewing=false,publishing=false,pendingPublishCandidate=null,editingDraft=null,editorBaseline=null,editorFactory=window.__qidianTestEditorFactory||null,editorLoading=null,richEditor=null,richEditorDraftId=null,autoTimer=null,toastTimer=null,typeDialogMode='create',typeDialogId=null,accountProfile=null,avatarObjectUrl='',conflictBackupReady=false,versionPollTimer=null,versionInfo=null,versionInfoCheckedAt=0,versionCheckPromise=null,updateLogFollowing=true,updateActionRunning=false,updateProgressMessages=[];
let updateTargetVersion='',updateVerificationTimer=null,updateReloadTimer=null,updateVersionCheckRunning=false,updateReloadScheduled=false,updateLogRelevant=false;
let lastUpdateStatus=null,updateTerminalBaseline='',updateRefreshDeadline=0;
const updateRefreshDelay=5000;
try{updateTargetVersion=sessionStorage.getItem('qidian.pendingDeviceUpdate')||'';updateLogRelevant=!!updateTargetVersion}catch{}
const noteTypesExpanded=()=>data.noteTypesExpanded!==false;
function persist(){queueSave(data);return true}
async function commitPersist(candidate=data){await commitSave(candidate);return true}
const isDraft=n=>n?.status==='draft';const needsPublish=n=>isDraft(n)||!!n?.publishedSnapshot;
function versionOf(n){return {title:n.title,type:n.type,category:n.category,tags:[...(n.tags||[])],body:n.body,source:n.source||'',updated:n.updated}}
function publishedView(n){return n?.publishedSnapshot?{...n,...n.publishedSnapshot,_hasUnpublished:true}:n}
const bookmarksView=createBookmarkView({main,getData:()=>data,save:async()=>{await commitPersist();side()},download,notify:toast});
const recycleBinView=createRecycleBinView({main,getData:()=>data,save:async()=>{await commitPersist();side()},notify:toast});
function openBookmarks(folderId=null){if(edit)saveDraft(true);clearTimeout(autoTimer);edit=false;previewing=false;editingDraft=null;noteId=null;closeMenu();setPage('bookmarks');if(folderId!==null)bookmarksView.openFolder(folderId);else bookmarksView.resume()}
function addBookmark(folderId=''){openBookmarks();bookmarksView.addBookmark(folderId)}
function openTrash(){if(edit)saveDraft(true);clearTimeout(autoTimer);edit=false;previewing=false;editingDraft=null;noteId=null;closeMenu();page='trash';render();window.scrollTo({top:0})}
const syncConflictButton=document.getElementById('reviewSyncConflict');onStatus(()=>{if(syncConflictButton)syncConflictButton.hidden=!getSyncConflict()});if(syncConflictButton)syncConflictButton.hidden=!getSyncConflict();
onRemoteUpdate(remoteData=>{
 const previousScroll=window.scrollY;
 const localEditorChanged=editorHasChanges();
 data=structuredClone(remoteData);data.trash ||= [];applyTheme(data.theme);bookmarksView.syncPreferences();
 if(edit&&noteId){
  side();
  const current=data.notes.find(note=>note.id===noteId);
  if(!current){clearTimeout(autoTimer);autoTimer=null;edit=false;destroyRichEditor();editingDraft=null;noteId=null;render();window.scrollTo({top:previousScroll});return}
  editingDraft=structuredClone(current);
  if(!localEditorChanged)editorBaseline=editorContentSnapshot(current);
  for(const [id,value] of [['editTitle',current.title||''],['editType',current.type||'note'],['editTags',(current.tags||[]).join(', ')],['editSource',current.source||'']]){const field=$('#'+id);if(field)field.value=value}
  const category=$('#editCategory');if(category){if(!Array.from(category.options).some(option=>option.value===current.category)){const option=document.createElement('option');option.value=current.category;option.textContent=current.category;category.append(option)}category.value=current.category}
  const html=cleanHTML(current.body,true);
  if(richEditor&&richEditor.getHTML()!==html){const selection=richEditor.state.selection.from;richEditor.commands.setContent(html,{emitUpdate:false});richEditor.commands.setTextSelection(Math.max(1,Math.min(selection,richEditor.state.doc.content.size-1)));syncToolbarState(richEditor)}
  return
 }
 render();window.scrollTo({top:previousScroll});
});
if(!initial.local){
 const snapshotCurrentVault=()=>{
  if(edit&&editingDraft&&$('#editTitle')){
   const before=structuredClone(editingDraft);updateDraftFromDOM();
   const changed=['title','type','category','source','body'].some(key=>before[key]!==editingDraft[key])||JSON.stringify(before.tags||[])!==JSON.stringify(editingDraft.tags||[]);
   if(!changed)editingDraft.updated=before.updated;
   const index=data.notes.findIndex(note=>note.id===editingDraft.id);
   if(index>=0)data.notes[index]=structuredClone(editingDraft);
  }
  return structuredClone(data);
 };
 const checkRemoteUpdates=()=>{if(document.visibilityState==='visible')void refreshCloud(snapshotCurrentVault)};
 window.setInterval(checkRemoteUpdates,2500);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRemoteUpdates()});
}
let reauthPromptOpen=false;
onAuthenticationRequired(()=>{
 if(reauthPromptOpen)return;
 reauthPromptOpen=true;
 void showAuthentication(null,{
  authenticate:reauthenticateAccount,
  username:initial.username,
  onAuthenticated:result=>{
   reauthPromptOpen=false;
   if(result.conflict){return}
   data=structuredClone(result.data);data.trash ||= [];bookmarksView.syncPreferences();
   if(edit&&noteId){const current=data.notes.find(note=>note.id===noteId);if(current)editingDraft=structuredClone(current)}
    destroyRichEditor();render();
  }
 }).catch(error=>{reauthPromptOpen=false;toast(error.message||'重新登录窗口无法打开')});
});
function safeUrl(u,img=false){let s=String(u||'').trim();if(img)return /^\/api\/assets\/[a-f0-9-]{36}$/i.test(s)||/^https?:\/\//i.test(s)||/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s);return /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(s)}
const allowed=new Set('p div span b strong i em u s strike del mark small sub sup h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code br hr a img figure figcaption table colgroup col thead tbody tfoot tr th td caption details summary section article main header footer aside nav dl dt dd kbd samp var abbr cite q'.split(' '));
function cleanHTML(html,keepStyles=true){
 const input=new DOMParser().parseFromString(DOMPurify.sanitize(String(html)), 'text/html'),output=document.createElement('div');
 const discarded=new Set('script style iframe object embed form input button textarea select option svg math meta link base video audio canvas noscript template'.split(' '));let nodeCount=0;
 const dimension=value=>/^(?:\d{1,4}px|\d{1,3}%)$/.test(String(value||'').trim());
 function copy(node,parent){
  if(++nodeCount>20000)throw new RangeError('粘贴内容节点过多，已停止格式转换');
  if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent||''));return}
  if(node.nodeType!==1)return;
  const tag=node.tagName.toLowerCase();if(discarded.has(tag))return;
  const el=document.createElement(allowed.has(tag)?tag:node.parentElement?.closest('p,div,section,article,main,header,footer,aside,nav,li,blockquote')?'span':'div');
  if(tag==='a'){const href=node.getAttribute('href');if(safeUrl(href))el.setAttribute('href',href);el.setAttribute('rel','noopener noreferrer');el.setAttribute('target','_blank')}
  if(tag==='img'){
   const src=node.getAttribute('src');if(!safeUrl(src,true)){const alt=(node.getAttribute('alt')||'').trim();if(alt)parent.appendChild(document.createTextNode(alt));return}
   el.setAttribute('src',src);el.setAttribute('alt',(node.getAttribute('alt')||'').slice(0,200));el.setAttribute('loading','lazy');el.setAttribute('referrerpolicy','no-referrer');
   const rawWidth=node.style.width||node.getAttribute('width')||'',width=/^\d{1,4}$/.test(rawWidth)?`${rawWidth}px`:rawWidth;if(dimension(width)){el.style.width=width;el.style.maxWidth='100%'}
  }
  if(tag==='details'&&node.hasAttribute('open'))el.setAttribute('open','');
  if(tag==='ol'){const start=Number(node.getAttribute('start'));if(Number.isInteger(start)&&start>=1&&start<=10000)el.setAttribute('start',String(start))}
  if(tag==='div'&&node.getAttribute('data-type')==='detailsContent')el.setAttribute('data-type','detailsContent');
  if(keepStyles){
   const names=tag==='col'?['width','min-width']:tag==='table'?['width','min-width']:['color','background-color','font-weight','font-style','text-decoration','text-align','font-size','margin-left','vertical-align','width','min-width'];
   for(const key of names){const value=node.style.getPropertyValue(key).trim();if(!value||value.length>=70||/url\s*\(|expression|@import|[<>]/i.test(value))continue;
    if(['width','min-width'].includes(key)&&!dimension(value))continue;
    if(key==='font-size'&&!/^(\d{1,2}(px|pt)|[0-9.]{1,4}(em|rem)|\d{2,3}%)$/.test(value))continue;
    el.style.setProperty(key,value);
   }
  }
  if(tag==='td'||tag==='th'){
   for(const key of ['colspan','rowspan']){const value=Number(node.getAttribute(key));if(Number.isInteger(value)&&value>=1&&value<=20)el.setAttribute(key,String(value))}
   const colwidth=node.getAttribute('data-colwidth');if(colwidth&&/^\d{1,4}(?:,\d{1,4})*$/.test(colwidth)&&colwidth.split(',').every(value=>Number(value)>0&&Number(value)<=2000))el.setAttribute('data-colwidth',colwidth);
  }
  if(tag==='pre')el.className='pasted-code';
  if(tag==='code'){const language=(node.className.match(/(?:^|\s)language-([\w.+-]{1,32})(?:\s|$)/)||[])[1];if(language)el.className=`language-${language}`}
  if(tag==='div'&&node.classList.contains('callout')){el.className='callout';if(node.classList.contains('warn'))el.classList.add('warn');if(node.classList.contains('good'))el.classList.add('good')}
  for(const child of node.childNodes)copy(child,el);
  parent.appendChild(el);
 }
 for(const child of input.body.childNodes)copy(child,output);
 return DOMPurify.sanitize(output.innerHTML);
}
function plainTextToStructuredHTML(value,{inferHeadings=true,headingOffset=1}={}){
 const lines=String(value||'').replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
 const isBlank=line=>!String(line||'').trim();
  const inline=value=>{let text=esc(value).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>').replace(/~~([^~\n]+)~~/g,'<del>$1</del>');text=text.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g,'$1<em>$2</em>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g,'$1<em>$2</em>');return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>safeUrl(url)?`<a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${label}</a>`:label)};
 const heading=line=>{
   const markdown=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);if(markdown)return { level:Math.min(markdown[1].length+headingOffset,6),text:markdown[2] };
  const section=line.match(/^\s*(\d{1,2})\.\s+(.{1,36})\s*$/);if(section&&!/[。！？；：]$/.test(section[2]))return {level:2,text:section[2]};
  if(line.length<=42&&!/[：:。！？；]/.test(line)&&!/^\s*(?:[-+*•]|\d+[.)]|>)/.test(line)&&!isShellCommand(line)&&!/^https?:\/\//i.test(line))return {level:3,text:line.trim()};
  return null;
 };
 const isShellCommand=line=>{
  const text=String(line||'').trim();if(!text||text.length>2000||/^https?:\/\//i.test(text))return false;
  if(/^(?:\.\/|\.\.\/|\/(?:etc|usr|opt|root|bin|sbin|var)\/)/.test(text))return true;
  if(/^(?:sudo|su|bash|sh|zsh|fish|curl|wget|chmod|chown|install|systemctl|service|sshd|ssh|nano|vi|vim|cat|less|tar|gzip|gunzip|docker|podman|kubectl|git|apt(?:-get)?|dnf|yum|apk|opkg|uci|make|npm|pnpm|node|python(?:3)?|pip(?:3)?|ip|ping|df|du|ls|cd|pwd|mkdir|rm|cp|mv|grep|find|sed|awk|mount|umount|reboot|poweroff|passwd|crontab|jq|openssl|dd|echo|printf)\b/i.test(text))return true;
  return /^(?:#?[A-Za-z][A-Za-z0-9_.-]*\s+)(?:yes|no|prohibit-password|without-password|\/[A-Za-z0-9_./-]+|[0-9]+)$/i.test(text);
 };
 const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim());
 while(i<lines.length){
  const line=lines[i],trim=line.trim();if(isBlank(line)){i++;continue}
  const fence=trim.match(/^```([\w+-]*)\s*$/);
   if(fence){const code=[];i++;while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;out.push(`<pre><code>${esc(code.join('\n').replace(/^\n+|\n+$/g,''))}</code></pre>`);continue}
  const alert=trim.match(/^>?\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
  if(alert){const kind=alert[1].toUpperCase(),title=alert[2].trim(),body=[];i++;while(i<lines.length&&!isBlank(lines[i]))body.push(lines[i++].replace(/^>\s?/,''));const cls=/^(WARNING|CAUTION)$/.test(kind)?' warn':kind==='TIP'?' good':'';out.push(`<div class="callout${cls}">${title?`<p><strong>${inline(title)}</strong></p>`:''}${body.map(text=>`<p>${inline(text)}</p>`).join('')}</div>`);continue}
  if(/^(?:⸻+|[-*_](?:\s*[-*_]){2,})$/.test(trim)){out.push('<hr>');i++;continue}
  const markdownCells=trim.startsWith('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]);
  const tabCells=trim.includes('\t')&&lines[i+1]?.includes('\t');
  if(markdownCells||tabCells){
   const rows=[];
   if(markdownCells){rows.push(cells(trim));i+=2;while(i<lines.length&&lines[i].trim().startsWith('|'))rows.push(cells(lines[i++]));}
   else {while(i<lines.length&&lines[i].includes('\t'))rows.push(lines[i++].split('\t').map(cell=>cell.trim()));}
   const width=Math.max(...rows.map(row=>row.length));if(width>=2){const [header,...body]=rows;out.push(`<table><tbody><tr>${Array.from({length:width},(_,j)=>`<th>${inline(header[j]||'')}</th>`).join('')}</tr>${body.map(row=>`<tr>${Array.from({length:width},(_,j)=>`<td>${inline(row[j]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);continue}
  }
   const numberedHeading=heading(trim);if(inferHeadings&&numberedHeading&&/^\s*\d{1,2}\.\s+/.test(trim)&&(!i||isBlank(lines[i-1]))&&(i+1>=lines.length||isBlank(lines[i+1]))){out.push(`<h${numberedHeading.level}>${inline(numberedHeading.text)}</h${numberedHeading.level}>`);i++;continue}
  const markdownHeading=trim.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
   if(markdownHeading){const level=Math.min(trim.match(/^\s*(#+)/)[1].length+headingOffset,6);out.push(`<h${level}>${inline(markdownHeading[1])}</h${level}>`);i++;continue}
  if(isShellCommand(trim)){const command=[trim];i++;while(i<lines.length&&command.at(-1).endsWith('\\'))command.push(lines[i++]);out.push(`<pre><code>${esc(command.join('\n'))}</code></pre>`);continue}
  if(/^>\s?/.test(trim)){const quote=[];while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,'').trim());out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);continue}
  const bullet=trim.match(/^([-+*•])\s+(.+)$/),ordered=trim.match(/^(?:\d+[.)]|[①-⑳])\s+(.+)$/);
   if(bullet||ordered){const list=[];const orderedList=Boolean(ordered);while(i<lines.length){const match=lines[i].trim().match(orderedList?/^(?:\d+[.)]|[①-⑳])\s+(.+)$/:/^[-+*•]\s+(.+)$/);if(match){list.push(`<li>${inline(match[1])}</li>`);i++;continue}if(!inferHeadings&&isBlank(lines[i])){let next=i;while(next<lines.length&&isBlank(lines[next]))next++;const nextMatch=lines[next]?.trim().match(orderedList?/^(?:\d+[.)]|[①-⑳])\s+(.+)$/:/^[-+*•]\s+(.+)$/);if(nextMatch){i=next;continue}}break}out.push(`<${orderedList?'ol':'ul'}>${list.join('')}</${orderedList?'ol':'ul'}>`);continue}
   const possibleHeading=heading(trim);if(inferHeadings&&possibleHeading&&lines.length>1&&trim.length<=42&&(i+1<lines.length&&isBlank(lines[i+1]))&&(!i||isBlank(lines[i-1]))){out.push(`<h${possibleHeading.level}>${inline(possibleHeading.text)}</h${possibleHeading.level}>`);i++;continue}
  const paragraph=[trim];i++;while(i<lines.length&&!isBlank(lines[i])&&!/^\s*(?:#{1,6}\s|>\s?|[-+*•]\s|\d+[.)]\s)/.test(lines[i])&&!isShellCommand(lines[i])&&!lines[i].includes('\t')&&!/^(?:⸻{2,}|[-*_](?:\s*[-*_]){2,})$/.test(lines[i].trim()))paragraph.push(lines[i++].trim());out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
 }
 return out.join('');
}
function textWithBlockBreaks(root){
 const blocks=new Set('P DIV LI BLOCKQUOTE PRE H1 H2 H3 H4 H5 H6 TR'.split(' '));
 const visit=node=>{
  if(node.nodeType===3)return node.nodeValue||'';
  if(node.nodeType!==1)return [...(node.childNodes||[])].map(visit).join('');
  const tag=node.tagName.toUpperCase();if(tag==='BR')return '\n';
  const content=[...node.childNodes].map(visit).join('');if(tag==='P')return `${content}\n`;return blocks.has(tag)?`\n${content}\n`:content;
 };
 return visit(root).replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function readableNoteBody(body,title=''){
 const safe=cleanHTML(body,true),holder=document.createElement('div');holder.innerHTML=safe;
 const richContent=holder.querySelector('h1,h2,h3,h4,h5,h6,a[href],b,strong,i,em,u,s,del,mark,blockquote,pre,code,ul,ol,li,table,img,figure,details,hr,.callout');
 const markdown=textWithBlockBreaks(holder);
 if(richContent||!looksLikeMarkdown(markdown))return {html:safe,markdown:false};
 const firstLine=markdown.split('\n').find(line=>line.trim())||'',firstHeading=firstLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
 const normalize=value=>String(value||'').replace(/[*_~`]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
 const duplicateTitle=!!firstHeading&&normalize(firstHeading[1])===normalize(title),parsed=document.createElement('div');parsed.innerHTML=cleanHTML(plainTextToStructuredHTML(markdown,{inferHeadings:false,headingOffset:duplicateTitle?0:1}),true);
 const firstContent=[...parsed.childNodes].find(node=>node.nodeType===1||node.textContent?.trim());
 const duplicateHeading=firstContent?.nodeType===1&&/^H[1-6]$/.test(firstContent.tagName)?firstContent:null;
 if(duplicateTitle&&duplicateHeading&&normalize(duplicateHeading.textContent)===normalize(title))duplicateHeading.remove();
 return {html:parsed.innerHTML,markdown:true};
}
function noteBodyText(body,title=''){return tinyText(readableNoteBody(body,title).html)}
function extractPastedTitle(html,plain){
 const normalize=value=>String(value||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().replace(/^\s{0,3}#{1,6}\s+/,'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/^(?:[-+*•]|\d{1,2}[.)])\s+/,'').trim();
 if(html){const parsed=new DOMParser().parseFromString(String(html),'text/html'),heading=parsed.querySelector('h1,h2,h3,h4,h5,h6');if(heading){const title=normalize(heading.textContent);if(title)return title.slice(0,100)}}
 const lines=String(plain||'').replace(/\r\n?/g,'\n').split('\n');
 const markdownHeading=lines.map(line=>line.trim()).find(line=>/^#{1,6}\s+\S/.test(line));
 if(markdownHeading){const title=normalize(markdownHeading);if(title)return title.slice(0,100)}
 const firstLine=lines.map(normalize).find(line=>line&&!/^标签\s*[:：]/.test(line)&&!/^https?:\/\//i.test(line)&&!/^[-*_]{3,}$/.test(line));
 if(firstLine)return firstLine.slice(0,100);
 if(html){const parsed=new DOMParser().parseFromString(String(html),'text/html'),firstLine=(parsed.body.innerText||parsed.body.textContent||'').split(/\r?\n/).map(normalize).find(Boolean);if(firstLine)return firstLine.slice(0,100)}
 return '';
}
function autofillPastedTitle(fieldId,html,plain){const field=$('#'+fieldId);if(!field||field.value.trim())return false;const title=extractPastedTitle(html,plain);if(!title)return false;field.value=title;field.dispatchEvent(new Event('input',{bubbles:true}));return true}
function conflictChanges(base,version){const before=new Map((base?.notes||[]).map(note=>[note.id,note])),after=new Map((version?.notes||[]).map(note=>[note.id,note]));return [...new Set([...before.keys(),...after.keys()])].filter(id=>JSON.stringify(before.get(id))!==JSON.stringify(after.get(id))).map(id=>({note:after.get(id)||before.get(id),deleted:!after.has(id)}))}
function conflictVersionMarkup(title,base,version){const changes=conflictChanges(base,version).slice(0,8);return `<section class="sync-conflict-version"><h3>${title} · ${changes.length} 篇笔记有变化</h3>${changes.length?changes.map(({note,deleted})=>`<article class="sync-conflict-note"><strong>${esc(note?.title||'无标题笔记')}${deleted?'（已删除）':''}</strong><p>${esc(tinyText(cleanHTML(note?.body||'',false)).slice(0,180)||'无正文内容')}</p></article>`).join(''):'<p class="sync-conflict-empty">冲突涉及分类、书签或其他结构化信息；完整内容已放入对照备份。</p>'}</section>`}
function openSyncConflict(){if(edit&&editingDraft){clearTimeout(autoTimer);autoTimer=null;updateDraftFromDOM();saveDraft(true)}const conflict=getSyncConflict();if(!conflict)return toast('当前没有待处理的未合并修改');conflictBackupReady=false;$('#syncConflictSummary').textContent=`部分修改无法自动合并。系统已保留两个版本，请下载对照备份后再选择如何恢复。`;$('#syncConflictVersions').innerHTML=conflictVersionMarkup('待整理修改',conflict.base,conflict.local)+conflictVersionMarkup('已保存版本',conflict.base,conflict.remote);$('#syncConflictBackupStatus').textContent='下载对照备份后，才能载入已保存版本。';$('#loadConflictCloud').disabled=true;$('#syncConflictOverlay').classList.add('open');$('#downloadSyncConflict').focus()}
$('#reviewSyncConflict')?.addEventListener('click',()=>{closeAccountSettings();openSyncConflict()});
$('#downloadSyncConflict').addEventListener('click',async()=>{const button=$('#downloadSyncConflict'),status=$('#syncConflictBackupStatus');button.disabled=true;status.textContent='正在整理两个版本及附件…';status.className='account-settings-message';try{await exportSyncConflict();conflictBackupReady=true;$('#loadConflictCloud').disabled=false;status.textContent='对照备份已下载，确认后可载入Docker 服务端版本。';status.classList.add('success')}catch(error){status.textContent=error.message||'对照备份下载失败';status.classList.add('error')}finally{button.disabled=false}});
$('#loadConflictCloud').addEventListener('click',async()=>{if(!conflictBackupReady)return toast('请先下载两版对照备份');if(!confirm('已下载修改对照备份。继续载入已保存版本？'))return;const button=$('#loadConflictCloud');button.disabled=true;try{const restored=await reloadCloud();clearTimeout(autoTimer);autoTimer=null;edit=false;destroyRichEditor();editingDraft=null;noteId=null;data={...restored,trash:restored.trash||[]};applyTheme(data.theme);bookmarksView.syncPreferences();active='all';typeFilter='all';page='home';$('#syncConflictOverlay').classList.remove('open');render();window.scrollTo({top:0});toast('已载入保存版本；当前修改保存在刚下载的对照备份中')}catch(error){$('#syncConflictBackupStatus').textContent=error.message||'载入Docker 服务端版本失败';$('#syncConflictBackupStatus').className='account-settings-message error'}finally{button.disabled=false}});
function nowString(t){return new Date(t).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})};const fullDate=t=>new Date(t).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
function setMobileMenu(open){document.body.classList.toggle('menu-open',open);$('#menuBtn')?.setAttribute('aria-expanded',String(open));$('#menuBtn')?.setAttribute('aria-label',open?'关闭菜单':'打开菜单');$('#mobileShade')?.setAttribute('aria-hidden',String(!open))}
function closeMenu(returnToButton=false){const wasOpen=document.body.classList.contains('menu-open'),focusInSidebar=$('#sidebar')?.contains(document.activeElement);setMobileMenu(false);if(wasOpen&&(returnToButton||focusInSidebar))requestAnimationFrame(()=>{(returnToButton?$('#menuBtn'):main)?.focus({preventScroll:true})})}
function toggleMobileMenu(){const open=!document.body.classList.contains('menu-open');setMobileMenu(open);if(open)requestAnimationFrame(()=>$('#sidebar .side-link.active,#sidebar .side-link,#newSide')?.focus({preventScroll:true}))}
function categoryOptions(curr){return [...new Set(['未分类',...data.categories,curr].filter(Boolean))].map(x=>`<option value="${esc(x)}" ${curr===x?'selected':''}>${esc(x)}</option>`).join('')}
function setBreadcrumb(s){$('#breadcrumbTitle').textContent=s;$('.breadcrumb').classList.toggle('is-home',s==='首页')}
function side(){let count=id=>id==='drafts'?data.notes.filter(needsPublish).length:data.notes.filter(n=>!isDraft(n)&&(id==='all'||(id==='pinned'&&n.pinned)||(id==='recent')||(n.category===id))).length;
const notesContext=page==='home'||page==='note';
$('#sideCore').innerHTML=`<button class="side-link ${page==='dashboard'?'active':''}" data-dashboard>${icons('home')} 首页</button><button class="side-link ${notesContext?'active':''}" data-nav="all">${icons('book')} 笔记<span class="count">${count('all')}</span></button><button class="side-link ${page==='bookmarks'?'active':''}" id="openBookmarks">${icons('link')} 书签<span class="count">${bookmarkLinkCount(data.bookmarks||[])}</span></button>`+(notesContext?`<div class="side-label side-nav-caption">笔记视图</div>`+[ ['recent','note','最近编辑'],['pinned','heart','重要收藏'],['drafts','edit','草稿箱'] ].map(([id,ico,label])=>`<button class="side-link ${active===id&&page==='home'?'active':''}" data-nav="${esc(id)}">${icons(ico)} ${label}<span class="count">${count(id)}</span></button>`).join(''):'');
$('#sideCore').insertAdjacentHTML('beforeend',`<button class="side-link ${page==='trash'?'active':''}" data-trash-nav>${icons('trash')} 回收站<span class="count">${(data.trash||[]).length}</span></button>`);
$('#sideTypes').closest('.side-section').hidden=!notesContext;
$('#sideCats').closest('.side-section').hidden=!notesContext;
const typeCount=id=>data.notes.filter(n=>!isDraft(n)&&n.type===id).length;
$('#sideTypes').innerHTML=`<button class="side-link type-all ${typeFilter==='all'&&page==='home'?'active':''}" data-type-nav="all">${icons('book')} 全部类型<span class="count">${data.notes.filter(n=>!isDraft(n)).length}</span></button>`+data.noteTypes.map(t=>{const label=displayTypeName(t);return `<div class="type-nav-row ${typeFilter===t.id&&page==='home'?'active':''}"><button class="type-nav-link" data-type-nav="${esc(t.id)}"><span class="type-dot ${esc(t.id)}"></span><span class="type-nav-name">${esc(label)}</span><span class="count">${typeCount(t.id)}</span></button><div class="type-nav-actions"><button type="button" data-type-edit="${esc(t.id)}" title="编辑${esc(label)}" aria-label="编辑${esc(label)}">${icons('edit')}</button><button type="button" data-type-delete="${esc(t.id)}" title="删除${esc(label)}" aria-label="删除${esc(label)}" ${data.noteTypes.length===1&&t.id==='note'?'disabled':''}>${icons('trash')}</button></div></div>`}).join('');
const typesExpanded=noteTypesExpanded();$('#sideTypes').hidden=!typesExpanded;const typeToggle=$('#toggleNoteTypes');typeToggle?.setAttribute('aria-expanded',String(typesExpanded));typeToggle?.setAttribute('aria-label',typesExpanded?'折叠笔记类型':'展开笔记类型');typeToggle?.setAttribute('title',typesExpanded?'折叠笔记类型':'展开笔记类型');
$('#sideCats').innerHTML=data.categories.map(x=>`<button class="side-link ${active===x&&page==='home'?'active':''}" data-nav="${esc(x)}">${icons('folder')} ${esc(x)}<span class="count">${count(x)}</span></button>`).join('');
const restoreDraftButton=$('#restoreLocalDraft');if(restoreDraftButton)restoreDraftButton.hidden=!initial.ignoredDraft;
}
function setPage(p){if(edit)saveDraft(true);page=p;render();window.scrollTo({top:0})}
function openHome(cat='all'){if(edit)saveDraft(true);clearTimeout(autoTimer);edit=false;previewing=false;editingDraft=null;active=cat;noteQuery='';typeFilter='all';noteId=null;closeMenu();setPage('home')}
function openDashboard(){if(edit)saveDraft(true);clearTimeout(autoTimer);edit=false;previewing=false;editingDraft=null;noteId=null;active='all';typeFilter='all';closeMenu();setPage('dashboard')}
function openNote(id,forceEdit=false){if(page==='home')noteReturn={active,typeFilter,query:noteQuery,scroll:window.scrollY};else if(page!=='note')noteReturn=null;if(edit)saveDraft(true);let found=data.notes.find(n=>n.id===id);if(!found)return;noteId=id;edit=forceEdit;previewing=active==='drafts'||isDraft(found);editingDraft=null;page='note';closeMenu();render();window.scrollTo({top:0})}
function iconCard(kind){return {note:'note',clip:'clip',command:'code',issue:'search'}[kind]||'note'}
function noteCard(n){let desc=noteBodyText(n.body,n.title);return `<article class="note-card"><div class="note-card-open" data-open="${esc(n.id)}" role="button" tabindex="0" aria-label="打开笔记：${esc(n.title||'无标题笔记')}"><div class="note-kicker"><span class="type-dot ${esc(n.type)}"></span>${esc(typeLabel(n.type))} <span>·</span> ${esc(n.category)}</div>${n.pinned?'<span class="pin-top" title="已收藏">★</span>':''}<h3>${esc(n.title||'无标题笔记')}</h3><p>${esc(desc||'空白笔记，点击开始编辑。')}</p><div class="note-foot">${(n.tags||[]).slice(0,2).map(x=>`<span class="tag">#${esc(x)}</span>`).join('')}<span class="date">${nowString(n.updated)}</span></div></div><details class="item-menu note-item-menu"><summary aria-label="更多：${esc(n.title||'无标题笔记')}">···</summary><div class="item-menu-panel"><button data-note-edit="${esc(n.id)}">编辑</button><button class="danger-btn" data-note-delete="${esc(n.id)}">删除</button></div></details></article>`}

function listNotes(q=''){const drafts=active==='drafts';let arr=data.notes.filter(n=>drafts?needsPublish(n):!isDraft(n)).map(n=>drafts?n:publishedView(n));if(!drafts){if(active==='pinned')arr=arr.filter(n=>n.pinned);else if(!['all','recent'].includes(active))arr=arr.filter(n=>n.category===active)}if(typeFilter!=='all')arr=arr.filter(n=>n.type===typeFilter);if(q){let search=q.trim().toLowerCase();arr=arr.filter(n=>[n.title,n.category,n.source,...(n.tags||[]),noteBodyText(n.body,n.title)].join(' ').toLowerCase().includes(search))}return arr.sort((a,b)=>active==='recent'?b.updated-a.updated:Number(b.pinned)-Number(a.pinned)||b.updated-a.updated)}
async function moveNoteToTrash(id){const index=data.notes.findIndex(note=>note.id===id);if(index<0)return false;const previous=data;try{const candidate=structuredClone(data),note=candidate.notes[index];candidate.trash.push(createTrashEntry('note',note,{index,previousId:candidate.notes[index-1]?.id||'',nextId:candidate.notes[index+1]?.id||''}));candidate.notes.splice(index,1);data=validateVault(candidate);await commitPersist();return true}catch(error){data=previous;toast(error.message||'移入回收站失败');return false}}
function destroyRichEditor(){if(!richEditor)return;if(edit&&editingDraft&&richEditorDraftId===editingDraft.id)updateDraftFromDOM();richEditor.destroy();richEditor=null;richEditorDraftId=null}
function bookmarkLinkCount(entries=[]){return entries.reduce((total,item)=>total+(item.kind==='link'?1:bookmarkLinkCount(item.children||[])),0)}
const dashboardBookmarkLayout=()=>data.dashboardBookmarkLayout==='double'?'double':'single';
function setDashboardBookmarkLayout(layout){
  const next=layout==='double'?'double':'single';
  if(data.dashboardBookmarkLayout===next)return;
  data.dashboardBookmarkLayout=next;
  main.querySelector('.dashboard-bookmark-groups')?.classList.toggle('is-double',next==='double');
  main.querySelectorAll('[data-dashboard-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dashboardLayout===next)));
  persist();
}
function rememberDashboardFolder(folder,save=true){
  const id=folder.dataset.dashboardFolder,states=data.dashboardBookmarkFolders||{};
  folder.querySelector(':scope > summary')?.setAttribute('aria-expanded',String(folder.open));
  if(states[id]===folder.open)return false;
  data.dashboardBookmarkFolders={...states,[id]:folder.open};
  if(save)persist();
  return true;
}
main.addEventListener('click',event=>{
  const layout=event.target.closest('[data-dashboard-layout]');
  if(layout){setDashboardBookmarkLayout(layout.dataset.dashboardLayout);return}
  const bulk=event.target.closest('[data-dashboard-folders]');
  if(bulk){let changed=false;main.querySelectorAll('details[data-dashboard-folder]').forEach(folder=>{folder.open=bulk.dataset.dashboardFolders==='expand';changed=rememberDashboardFolder(folder,false)||changed});if(changed)persist();return}
  const summary=event.target.closest('summary[data-dashboard-bookmark-folder]');
  if(!summary)return;
  event.preventDefault();const folder=summary.parentElement;folder.open=!folder.open;rememberDashboardFolder(folder);
});
function dashboardBookmarkGroups(){const entries=data.bookmarks||[],folders=entries.filter(item=>item.kind==='folder'),rootLinks=entries.filter(item=>item.kind==='link');return [...(rootLinks.length?[{id:'',kind:'folder',title:'未分组',children:rootLinks}]:[]),...folders]}
function dashboardBookmarkTree(entries,folderPath=[],depth=0,expandRoots=true){return entries.map(item=>{if(item.kind==='folder'){const path=[...folderPath,item.title],open=data.dashboardBookmarkFolders?.[item.id]??(depth===0&&expandRoots);return `<details class="${depth?'dashboard-bookmark-branch':'dashboard-bookmark-card'}" data-dashboard-folder="${esc(item.id)}" ${open?'open':''}><summary class="dashboard-bookmark-group" data-dashboard-bookmark-folder="${esc(item.id)}" aria-expanded="${open}"><span class="dashboard-group-icon">${icons('folder')}</span><span class="dashboard-group-copy"><strong>${esc(item.title)}</strong><small>${bookmarkLinkCount(item.children||[])} 个网址</small></span>${icons('chevron')}</summary><div class="dashboard-bookmark-children">${item.children?.length?dashboardBookmarkTree(item.children,path,depth+1,expandRoots):'<p class="dashboard-folder-empty">暂无书签</p>'}</div></details>`}if(!safeUrl(item.url))return '';return `<a class="dashboard-bookmark-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" title="${esc(item.url)}"><span class="dashboard-preview-icon">${icons('link')}</span><span class="dashboard-preview-copy"><strong>${esc(item.title)}</strong><small>${esc(folderPath.join(' / '))}</small></span></a>`}).join('')}
function renderDashboard(){
  destroyRichEditor();setBreadcrumb('首页');
  const published=data.notes.filter(note=>!isDraft(note)).sort((a,b)=>b.updated-a.updated).map(publishedView),recent=published.slice(0,4),groups=dashboardBookmarkGroups(),bookmarkTotal=bookmarkLinkCount(data.bookmarks||[]),folderTotal=(data.bookmarks||[]).filter(item=>item.kind==='folder').length;
  const featured=[...published.filter(note=>note.pinned).slice(0,2),...recent].filter((note,index,arr)=>arr.findIndex(item=>item.id===note.id)===index).slice(0,6);const noteCards=featured.map(noteCard).join(''),groupCards=dashboardBookmarkTree(groups,[],0,groups.length<=4);
  const pinnedLinks=[];const collectPinned=(items,path=[])=>items.forEach(item=>{if(item.kind==='folder')collectPinned(item.children,[...path,item.title]);else if(item.pinned)pinnedLinks.push({item,path})});collectPinned(data.bookmarks||[]);const pinnedHTML=pinnedLinks.slice(0,8).map(({item,path})=>dashboardBookmarkTree([item],path)).join('');
  main.innerHTML=`<div class="dashboard-page"><header class="dashboard-intro"><div class="dashboard-intro-copy"><h1>我的空间</h1><p>笔记保存内容；书签保存网址。</p></div><button class="secondary-btn" id="quickCapture" type="button">${icons('clip')} 网页摘录</button></header>
  <div class="dashboard-workspaces"><section class="dashboard-section dashboard-note-workspace" aria-labelledby="dashboardNotesTitle"><div class="dashboard-section-head"><div><h2 id="dashboardNotesTitle">笔记</h2><p>最近笔记 · ${published.length} 篇</p></div><div class="dashboard-section-actions"><button class="secondary-btn" type="button" data-new="note">${icons('plus')} 新建笔记</button><button type="button" class="dashboard-view-all" data-nav="all">全部笔记 ${icons('chevron')}</button></div></div>${featured.length?`<div class="notes dashboard-notes">${noteCards}</div>`:`<div class="dashboard-empty"><span>还没有笔记</span><button type="button" data-new="note">写下第一篇 ${icons('chevron')}</button></div>`}</section>
  <section class="dashboard-section dashboard-bookmarks" aria-labelledby="dashboardBookmarksTitle"><div class="dashboard-section-head"><div><h2 id="dashboardBookmarksTitle">书签</h2><p>${bookmarkTotal} 个网址 · ${folderTotal} 个顶层分组</p></div><div class="dashboard-section-actions"><button class="secondary-btn" type="button" data-dashboard-add-bookmark>${icons('plus')} 添加书签</button><button type="button" class="dashboard-view-all" data-open-bookmarks>全部书签 ${icons('chevron')}</button></div></div>${pinnedHTML?`<div class="dashboard-pinned-bookmarks"><h3>常用书签</h3>${pinnedHTML}</div>`:''}${groupCards?`<div class="dashboard-bookmark-controls"><span class="dashboard-layout-switch" role="group" aria-label="书签分组排列"><button type="button" data-dashboard-layout="single" aria-pressed="${dashboardBookmarkLayout()==='single'}">单列</button><button type="button" data-dashboard-layout="double" aria-pressed="${dashboardBookmarkLayout()==='double'}">双列</button></span><span class="dashboard-folder-actions"><button type="button" data-dashboard-folders="expand">展开全部</button><button type="button" data-dashboard-folders="collapse">收起全部</button></span></div><div class="dashboard-bookmark-groups ${dashboardBookmarkLayout()==='double'?'is-double':''}">${groupCards}</div>`:`<div class="dashboard-empty"><span>还没有书签</span><button type="button" data-dashboard-add-bookmark>添加第一个网址 ${icons('chevron')}</button></div>`}</section></div>
  </div>`;
}
function renderHome() {
  destroyRichEditor();
  setBreadcrumb(active === 'all' ? (typeFilter === 'all' ? '全部笔记' : typeLabel(typeFilter)) : active === 'recent' ? '最近编辑' : active === 'pinned' ? '重要收藏' : active === 'drafts' ? '草稿箱' : active);
  const filtered = listNotes(noteQuery),heading=typeFilter!=='all'?typeLabel(typeFilter):active==='all'?'全部笔记':active==='recent'?'最近编辑':active==='pinned'?'重要收藏':active==='drafts'?'草稿箱':active;
   main.innerHTML=`<div class="note-page-layout"><div class="section-head workspace-page-head"><div><h1>${esc(heading)}</h1><p class="muted">${filtered.length} 篇笔记</p></div><div class="section-right"><button class="secondary-btn" data-new="note">${icons('plus')} 新建笔记</button></div></div>
     <label class="workspace-search note-page-search">${icons('search')}<input id="notePageSearch" type="search" aria-label="筛选当前笔记标题、正文、分类和标签" placeholder="筛选本页笔记标题、正文、分类和标签" value="${esc(noteQuery)}"></label><div class="filter-tabs home-type-tabs"><button data-type="all" class="${typeFilter==='all'?'selected':''}">全部类型</button>${data.noteTypes.map(type=>`<button data-type="${esc(type.id)}" class="${typeFilter===type.id?'selected':''}">${esc(displayTypeName(type))}</button>`).join('')}</div>
     <div class="notes note-list">${filtered.map(noteCard).join('')}</div>${!filtered.length?`<div class="empty">${active==='drafts'?'暂无草稿。可以创建一条笔记。':'还没有笔记，先写下第一条。'}</div>`:''}</div>
     `;
  $('#notePageSearch').oninput=event=>{noteQuery=event.target.value;const arr=listNotes(noteQuery);main.querySelector('.note-list').innerHTML=arr.map(noteCard).join('')||'<div class="empty">没有找到匹配的笔记</div>';main.querySelector('.workspace-page-head .muted').textContent=arr.length+' 篇笔记';};
}
async function copyTextToClipboard(text){
  if(window.isSecureContext&&typeof navigator.clipboard?.writeText==='function'){
    try{await navigator.clipboard.writeText(text);return true}catch{}
  }
  let field=null;const previous=document.activeElement;
  try{
    field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.setAttribute('aria-hidden','true');
    Object.assign(field.style,{position:'fixed',left:'-9999px',top:'0',width:'1px',height:'1px',padding:'0',opacity:'0'});
    document.body.appendChild(field);field.focus({preventScroll:true});field.select();field.setSelectionRange(0,field.value.length);
    return document.execCommand('copy');
  }catch{return false}
  finally{field?.remove();try{previous?.focus({preventScroll:true})}catch{previous?.focus?.()}}
}
function addCodeCopies(root){root.querySelectorAll('pre').forEach(pre=>{if(pre.parentElement?.classList.contains('code-block'))return;const wrap=document.createElement('div');wrap.className='code-block';pre.parentNode.insertBefore(wrap,pre);wrap.appendChild(pre);const b=document.createElement('button');b.className='copy-code';b.type='button';b.title='复制代码';b.setAttribute('aria-label','复制代码');const copyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',checkIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';b.innerHTML=copyIcon;b.addEventListener('click',async()=>{const text=pre.querySelector('code')?.textContent||pre.textContent||'';if(await copyTextToClipboard(text)){b.innerHTML=checkIcon;b.title='已复制';b.setAttribute('aria-label','已复制代码');setTimeout(()=>{b.innerHTML=copyIcon;b.title='复制代码';b.setAttribute('aria-label','复制代码')},1500)}else toast('复制失败，请手动选择代码')});wrap.appendChild(b)})}
function renderReader(){
  main.__readerHeadingObserver?.disconnect();
  destroyRichEditor();
  const stored=data.notes.find(x=>x.id===noteId);
  if(!stored){openHome();return}
  const working=previewing||isDraft(stored),n=working?stored:publishedView(stored);
  setBreadcrumb(n.title);
   const bodyView=readableNoteBody(n.body,n.title),temp=document.createElement('div');temp.innerHTML=bodyView.html;
  const outline=[];
   temp.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h,i)=>{const name=(h.textContent||'').replace(/\s+/g,' ').trim();if(!name)return;h.id=`sec-${i}`;outline.push({name,id:h.id,level:Number(h.tagName.slice(1))})});
  const plainText=(temp.textContent||'').replace(/\s+/g,' ').trim();
  const cjkCount=(plainText.match(/[\u3400-\u9fff]/g)||[]).length;
  const latinWordCount=(plainText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)||[]).length;
  const readingMinutes=Math.max(1,Math.ceil((cjkCount+latinWordCount*5)/350));
   const toc=outline.map(x=>`<a href="#${esc(x.id)}" class="${x.level>2?'sub ':''}toc-level-${x.level}">${esc(x.name)}</a>`).join('');
  const hasDraft=needsPublish(stored);
  const primary=hasDraft&&working?`<button class="primary-btn" id="publishDoc">${icons('check')} ${isDraft(stored)?'发布笔记':'保存笔记'}</button><button class="secondary-btn" id="editDoc">${icons('edit')} 编辑笔记</button>`:`<button class="primary-btn" id="editDoc">${icons('edit')} ${previewing?'继续编辑':'编辑笔记'}</button>`;
  const workingBadge='';
  main.innerHTML=`<div class="note-shell reader-shell"><section><div class="doc-head"><button class="doc-back" id="backDoc">${icons('back')} 返回笔记列表</button><div class="doc-meta">${workingBadge}<span class="pill">${esc(typeLabel(n.type))}</span><span class="pill">${esc(n.category)}</span><span class="doc-date">更新于 ${fullDate(n.updated)} · 阅读约 ${readingMinutes} 分钟</span></div><h1 class="doc-title">${esc(n.title)}</h1><div class="doc-desc">${(n.tags||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join(' ')} ${n.source?`<span class="reader-source">来源：<a href="${safeUrl(n.source)?esc(n.source):'#'}" target="_blank" rel="noopener noreferrer">原始网页 ↗</a></span>`:''}</div><div class="doc-action-row">${primary}${!working&&stored.publishedSnapshot?'<button class="secondary-btn" id="showDraftView">查看待发布修改</button>':''}<button class="secondary-btn" id="pinDoc">${icons('heart')} ${n.pinned?'取消收藏':'收藏'}</button><button class="secondary-btn" id="duplicateDoc">${icons('clip')} 创建副本</button><button class="secondary-btn danger-btn" id="deleteDoc">${icons('trash')} 删除</button></div></div>${outline.length?`<details class="mobile-toc"><summary>本文目录 <span>${outline.length} 个章节</span></summary><nav class="outline">${toc}</nav></details>`:''}<article class="read-paper"><div class="doc-content" id="docRead">${temp.innerHTML||'<p class="hint">这里还没有内容。点击“编辑笔记”开始。</p>'}</div></article></section><aside class="right-rail"><h3>本文目录</h3><nav class="outline">${toc||'<span class="hint">暂无标题</span>'}</nav><div class="rail-rule"></div><h3>笔记信息</h3><div class="rail-source">创建：${fullDate(n.created)}<br>类型：${esc(typeLabel(n.type))}<br>来源：${n.source?`<a href="${safeUrl(n.source)?esc(n.source):'#'}" target="_blank" rel="noopener noreferrer">${esc(n.source)}</a>`:'自己记录'}</div></aside></div>`;
  organizeDocumentActions();
  addCodeCopies($('#docRead'));
   const readerHeadings=[...main.querySelectorAll('#docRead h1, #docRead h2, #docRead h3, #docRead h4, #docRead h5, #docRead h6')];
  const outlineLinks=[...main.querySelectorAll('.reader-shell .outline a')];
  const setCurrentSection=id=>outlineLinks.forEach(link=>{const current=link.hash===`#${id}`;link.classList.toggle('current',current);if(current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')});
  if(readerHeadings.length&&outlineLinks.length){
    setCurrentSection(readerHeadings[0].id);
    if('IntersectionObserver' in window){
      main.__readerHeadingObserver=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(visible)setCurrentSection(visible.target.id)},{rootMargin:'-14% 0px -74% 0px',threshold:0});
      readerHeadings.forEach(heading=>main.__readerHeadingObserver.observe(heading));
    }
  }
}
function ensureDraft(){if(!editingDraft){let n=data.notes.find(x=>x.id===noteId);editingDraft=JSON.parse(JSON.stringify(n));if(!isDraft(editingDraft)&&!editingDraft.publishedSnapshot)editingDraft.publishedSnapshot=versionOf(editingDraft);editorBaseline=editorContentSnapshot(editingDraft)}return editingDraft}
function renderEditor(){if(!editorFactory){if(!editorLoading){main.innerHTML='<div class="empty editor-loading">正在加载富文本编辑器…</div>';editorLoading=import('./editor.js').then(module=>{editorFactory=module.createQidianEditor;editorLoading=null;if(edit&&page==='note'){renderEditor();setTimeout(()=>$('#editTitle')?.focus(),0)}}).catch(error=>{editorLoading=null;main.innerHTML='<div class="empty editor-loading">编辑器加载失败，请刷新后重试。</div>';toast(error.message||'编辑器加载失败')})}return}destroyRichEditor();const n=ensureDraft();setBreadcrumb(n.title||'新建笔记');const publishLabel=isDraft(n)?'发布笔记':'保存笔记';main.innerHTML=`<div class="note-shell"><section><div class="doc-head"><button class="doc-back" id="backDoc">${icons('back')} 返回阅读</button><div class="doc-meta"><span class="pill">编辑笔记</span></div><div class="doc-action-row"><button class="primary-btn" id="saveEditor">${icons('check')} ${publishLabel}</button><button class="secondary-btn" id="addAttachment">＋ 附件</button><button class="secondary-btn" id="exportHtml">导出 HTML</button><button class="secondary-btn" id="addImgButton">${icons('image')} 插入图片</button></div></div><div class="editor-card"><div class="editor-head"><label class="editor-label">标题</label><input id="editTitle" class="title-input" value="${esc(n.title||'')}" placeholder="输入笔记标题..."><div class="editor-fields"><label>类型 <select id="editType" class="field">${data.noteTypes.map(t=>`<option value="${esc(t.id)}" ${t.id===n.type?'selected':''}>${esc(displayTypeName(t))}</option>`).join('')}</select></label><label>分类 <select id="editCategory" class="field">${categoryOptions(n.category)}</select></label><label class="tags">标签 <input id="editTags" class="field tags" value="${esc((n.tags||[]).join(', '))}" placeholder="例如：Linux, 教程"></label></div><div class="editor-fields"><label style="width:100%">来源网址 <input id="editSource" class="field" value="${esc(n.source||'')}" placeholder="https://...（可选）" style="max-width:100%;flex:1"></label></div></div><div class="editor-bar" id="editorToolbar"><select id="blockSelect" class="tool-select" aria-label="段落类型"><option value="p">正文</option><option value="h2">标题 H2</option><option value="h3">标题 H3</option><option value="blockquote">引用</option></select><span class="tool-divider"></span><button class="tool-btn k" data-fmt="bold" title="加粗">B</button><button class="tool-btn" data-fmt="italic" title="斜体"><i>I</i></button><button class="tool-btn" data-fmt="underline" title="下划线"><u>U</u></button><button class="tool-btn" data-fmt="strikeThrough" title="删除线"><s>S</s></button><span class="tool-divider"></span><button class="tool-btn" data-fmt="insertUnorderedList" title="项目列表">☷</button><button class="tool-btn" data-fmt="insertOrderedList" title="编号列表">☰</button><button class="tool-btn" data-fmt="justifyLeft" title="左对齐">≡</button><button class="tool-btn" data-fmt="justifyCenter" title="居中">☷</button><span class="tool-divider"></span><button class="tool-btn" data-insert="code" title="代码块">&lt;/&gt;</button><button class="tool-btn" data-insert="table" title="表格">▦</button><span class="table-tools" role="group" aria-label="表格行列"><button class="tool-btn" data-table-action="addRowAfter" title="下方添加行" aria-label="下方添加行" disabled>＋行</button><button class="tool-btn" data-table-action="addColumnAfter" title="右侧添加列" aria-label="右侧添加列" disabled>＋列</button><button class="tool-btn" data-table-action="deleteRow" title="删除当前行" aria-label="删除当前行" disabled>−行</button><button class="tool-btn" data-table-action="deleteColumn" title="删除当前列" aria-label="删除当前列" disabled>−列</button></span><button class="tool-btn" data-insert="link" title="链接">↗</button><button class="tool-btn" data-insert="image" title="图片">▧</button><button class="tool-btn" data-insert="emoji" title="插入表情">☺</button><input type="color" class="tool-color" id="fontColor" title="文字颜色" value="#5261cf"><button class="tool-btn" data-insert="rule" title="分隔线">—</button></div><div id="editorSurface" contenteditable="true" spellcheck="true" class="editor-surface doc-content" data-placeholder="开始输入内容，或直接粘贴网页文字、表格和图片...">${cleanHTML(n.body,true)}</div><div class="editor-bottom"><span class="paste-modes">粘贴方式 <select id="editPasteMode"><option value="rich">保留网页格式 / 自动识别 Markdown</option><option value="match">整理纯文本（兼容）</option><option value="markdown">按 Markdown 解析</option><option value="plain">仅纯文本</option></select></span></div></div><div class="bottom-action"><button class="secondary-btn" data-insert="callout">＋ 提示块</button><button class="secondary-btn" data-insert="details">＋ 折叠内容</button><button class="secondary-btn" data-insert="emoji">＋ 表情与符号</button></div><div class="hint">默认保留网页格式；纯文本自动识别 Markdown，普通文字保持原样。输入 / 打开快捷菜单。</div></section><aside class="right-rail edit-inspector"><div class="inspector-card"><h3>编辑帮助</h3><p>粘贴网页文字、表格或图片。</p><p>用工具栏插入格式、代码和表格。</p><p>整理内容可使用工具栏；保存笔记后更新阅读版。</p><p>定期导出完整备份。</p></div></aside></div>`;
$('#editPasteMode').value=preferredPasteMode();const surf=$('#editorSurface');richEditor=editorFactory({element:surf,content:cleanHTML(ensureDraft().body,true),handlePaste:handleEditorPaste,onUpdate:()=>{updateDraftFromDOM();scheduleSave();if(surf.textContent.endsWith('/'))openSlashHint()},onSelectionUpdate:({editor})=>syncToolbarState(editor)});richEditorDraftId=ensureDraft().id;surf.addEventListener('blur',flushEditorSave);surf.addEventListener('keydown',e=>{if(e.key!=='/'||e.isComposing||e.ctrlKey||e.metaKey)return;const sel=window.getSelection();let anchor=sel?.anchorNode;let parent=anchor?.nodeType===1?anchor:anchor?.parentElement;if(parent?.closest('pre,code'))return;let before=anchor?.nodeType===3?(anchor.textContent||'').slice(0,sel.anchorOffset):'';if(before.trim())return;e.preventDefault();openSlashMenu()});['editTitle','editType','editCategory','editTags','editSource'].forEach(id=>{const field=$('#'+id);field.addEventListener('input',()=>{updateDraftFromDOM();scheduleSave()});field.addEventListener('change',()=>{updateDraftFromDOM();scheduleSave()});field.addEventListener('blur',flushEditorSave)});$('#editPasteMode').addEventListener('change',e=>{data.pasteMode=e.target.value;saveDraft(true)});$('#editorToolbar').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});syncToolbarState(richEditor);organizeEditorTools();
}
function openTypeDialog(mode,id=null){if(mode==='create'&&data.noteTypes.length>=50)return toast('最多支持 50 种笔记类型');closeMenu();if(edit){saveDraft(true);clearTimeout(autoTimer);edit=false;editingDraft=null;render()}typeDialogMode=mode;typeDialogId=id;const item=data.noteTypes.find(t=>t.id===id);$('#typeDialogTitle').textContent=mode==='create'?'新增笔记类型':mode==='edit'?'编辑笔记类型':'删除笔记类型';$('#typeDialogHint').textContent=mode==='delete'?'相关笔记会转移到所选类型，正文和附件不会删除。':'';const body=$('#typeDialogBody');if(mode==='delete'){const count=data.notes.filter(n=>n.type===id).length;body.innerHTML=`<p class="type-delete-copy">“${esc(item.name)}”下有 <strong>${count}</strong> 篇笔记。删除类型时，笔记会保留并转移到：</p><label class="form-label" for="typeReplacement">转移到类型</label><select class="form-text" id="typeReplacement">${[...data.noteTypes.filter(t=>t.id!==id),...(data.noteTypes.length===1&&id!=='note'?[DEFAULT_NOTE_TYPES.find(t=>t.id==='note')]:[])].map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${data.noteTypes.length===1&&id!=='note'?'（自动创建）':''}</option>`).join('')}</select>`;$('#typeDialogConfirm').textContent='删除类型';$('#typeDialogConfirm').classList.add('danger-btn')}else{body.innerHTML=`<label class="form-label" for="typeNameInput">类型名称</label><input id="typeNameInput" class="form-text" maxlength="30" value="${esc(item?displayTypeName(item):'')}" placeholder="例如：读书笔记"><p class="hint">类型名称会显示在左侧导航和笔记筛选中。</p>`;$('#typeDialogConfirm').textContent=mode==='create'?'创建类型':'保存修改';$('#typeDialogConfirm').classList.remove('danger-btn')}$('#typeOverlay').classList.add('open');setTimeout(()=>$('#typeDialogBody input, #typeDialogBody select')?.focus(),50)}
async function saveTypeDialog(){
 const previous=structuredClone(data),previousFilter=typeFilter;
 try{
  if(typeDialogMode==='delete'){
   const id=typeDialogId,target=$('#typeReplacement')?.value;
   const targetExists=data.noteTypes.some(t=>t.id===target&&t.id!==id),fallback=target==='note'&&id!=='note'&&!targetExists?DEFAULT_NOTE_TYPES.find(t=>t.id==='note'):null;
   if(!target||target===id||(!targetExists&&!fallback))return toast('请选择要转移到的类型');
   if(fallback)data.noteTypes.push({...fallback});
   const activeCount=data.notes.filter(n=>n.type===id).length,trashCount=data.trash.filter(entry=>entry.kind==='note'&&entry.item.type===id).length;
   const migrate=n=>{if(n.type===id)n.type=target;if(n.publishedSnapshot?.type===id)n.publishedSnapshot.type=target};
   data.notes.forEach(migrate);data.trash.filter(entry=>entry.kind==='note').forEach(entry=>migrate(entry.item));data.noteTypes=data.noteTypes.filter(t=>t.id!==id);if(typeFilter===id)typeFilter='all';
   await commitPersist();$('#typeOverlay').classList.remove('open');render();const count=activeCount+trashCount;toast(count?`类型已删除，${count} 篇笔记已转移；`:'类型已删除；');return;
  }
  const name=$('#typeNameInput')?.value.trim();if(!name)return toast('请输入类型名称');if(data.noteTypes.some(t=>t.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&t.id!==typeDialogId))return toast('已有同名笔记类型');
  if(typeDialogMode==='create'){let id;do{id='custom_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}while(data.noteTypes.some(t=>t.id===id));data.noteTypes.push({id,name})}else{const item=data.noteTypes.find(t=>t.id===typeDialogId);if(!item)return toast('笔记类型不存在');item.name=name}
  await commitPersist();$('#typeOverlay').classList.remove('open');render();toast(typeDialogMode==='create'?'类型已创建；':'类型已修改；');
 }catch(error){data=previous;typeFilter=previousFilter;toast(error.message||'笔记类型修改未完成')}
}
const systemThemeMedia=window.matchMedia?.('(prefers-color-scheme: dark)');
function resolvedTheme(){return data.theme==='system'?(systemThemeMedia?.matches?'dark':'light'):(data.theme==='dark'?'dark':'light')}
function closeThemeMenu(){const menu=$('#themeMenu'),button=$('#themeBtn');if(menu)menu.hidden=true;if(button)button.setAttribute('aria-expanded','false')}
function syncThemeToggle(){const button=$('#themeBtn'),icon=button?.querySelector('use'),mode=['system','light','dark'].includes(data.theme)?data.theme:'light',dark=resolvedTheme()==='dark';document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.dataset.themePreference=mode;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#10141f':'#f6f7fb');if(button&&icon){icon.setAttribute('href',dark?'#i-sun':'#i-moon');const label=mode==='system'?`主题：跟随系统（当前${dark?'深色':'浅色'}）`:`主题：${mode==='dark'?'深色':'浅色'}`;button.title=label;button.setAttribute('aria-label',`${label}，打开主题设置`)}document.querySelectorAll('[data-theme-choice]').forEach(choice=>{const selected=choice.dataset.themeChoice===mode;choice.classList.toggle('selected',selected);choice.setAttribute('aria-checked',String(selected))})}
function applyTheme(mode,{save=false}={}){data.theme=['system','light','dark'].includes(mode)?mode:'light';syncThemeToggle();if(save)persist()}
function toggleThemeMenu(){const menu=$('#themeMenu'),button=$('#themeBtn');if(!menu||!button)return;const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){closeAccountMenu();menu.querySelector('[aria-checked="true"]')?.focus()}}
const handleSystemThemeChange=()=>{if(data.theme==='system')syncThemeToggle()};if(systemThemeMedia?.addEventListener)systemThemeMedia.addEventListener('change',handleSystemThemeChange);else systemThemeMedia?.addListener?.(handleSystemThemeChange);
function render(){recycleBinView.pruneExpired();if(lastRenderedPage==='bookmarks'&&page!=='bookmarks')bookmarksView.leave();lastRenderedPage=page;main.__readerHeadingObserver?.disconnect();main.__readerHeadingObserver=null;side();$('#mobileHome')?.classList.toggle('selected',page==='dashboard');$('#mobileCats')?.classList.toggle('selected',page==='home'||page==='note');$('#mobileBookmarks')?.classList.toggle('selected',page==='bookmarks');if(page==='bookmarks'){destroyRichEditor();setBreadcrumb('书签导航');bookmarksView.render()}else if(page==='trash'){destroyRichEditor();setBreadcrumb('回收站');recycleBinView.render()}else if(page==='dashboard')renderDashboard();else if(page==='home')renderHome();else if(edit)renderEditor();else renderReader();}
function cleanExpiredTrash(){if(recycleBinView.pruneExpired()&&page==='trash')recycleBinView.render()}
window.setInterval(cleanExpiredTrash,60*60*1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')cleanExpiredTrash()});
function createNew(type='note'){if(edit)saveDraft(true);if(type==='note'&&typeFilter!=='all')type=typeFilter;if(!data.noteTypes.some(t=>t.id===type))type=data.noteTypes[0].id;let id='n'+Date.now()+Math.random().toString(36).slice(2,6);let n={id,title:'',type,category:active&&!['all','recent','pinned','drafts'].includes(active)?active:'未分类',tags:[],body:type==='command'?'<h2>用途</h2><p></p><h2>命令</h2><pre><code>在这里输入命令</code></pre>':type==='issue'?'<h2>问题现象</h2><p></p><h2>解决办法</h2><p></p><h2>排查过程</h2><p></p>':'',source:'',created:Date.now(),updated:Date.now(),pinned:false,status:'draft',publishedAt:null};data.notes.unshift(n);persist();noteId=id;edit=true;previewing=false;editingDraft=JSON.parse(JSON.stringify(n));editorBaseline=editorContentSnapshot(editingDraft);page='note';closeMenu();render();window.scrollTo(0,0);setTimeout(()=>$('#editTitle')?.focus(),100)}
function updateDraftFromDOM(){if(!edit||!editingDraft||!$('#editTitle'))return;pendingPublishCandidate=null;let n=editingDraft;n.title=$('#editTitle').value;n.type=$('#editType').value;n.category=$('#editCategory').value;n.tags=$('#editTags').value.split(/[,，]/).map(s=>s.trim().replace(/^#/,'')).filter(Boolean).slice(0,30);n.source=$('#editSource').value;n.body=cleanHTML(richEditor?.getHTML()||$('#editorSurface').innerHTML,true);n.updated=Date.now();}
function editorContentSnapshot(note){const body=cleanHTML(note?.body||'',true).replace(/<p>(?:\s|<br\s*\/?>|&nbsp;|&#160;)*<\/p>/gi,'').trim();return JSON.stringify({title:note?.title||'',type:note?.type||'note',category:note?.category||'未分类',tags:note?.tags||[],source:note?.source||'',body})}
function editorHasChanges(){if(!edit||!editingDraft||!$('#editTitle')||!editorBaseline)return false;updateDraftFromDOM();return editorContentSnapshot(editingDraft)!==editorBaseline}
function saveDraft(quiet=false){if(!edit||!editingDraft)return true;if($('#editTitle'))updateDraftFromDOM();let n=editingDraft;n.title=n.title.trim()||'无标题笔记';let idx=data.notes.findIndex(x=>x.id===n.id);if(idx>=0)data.notes[idx]=JSON.parse(JSON.stringify(n));if(!data.categories.includes(n.category)&&n.category!=='未分类')data.categories.push(n.category);let ok=persist();return ok}
function scheduleSave(){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{autoTimer=null;saveDraft(true)},250)}
function flushEditorSave(){if(!edit||!editingDraft||autoTimer===null)return;clearTimeout(autoTimer);autoTimer=null;saveDraft(true)}

function completePublished(candidate){pendingPublishCandidate=null;data=candidate;edit=false;previewing=false;editingDraft=null;destroyRichEditor();render();window.scrollTo({top:0})}
async function publishCurrentNote(){if(publishing)return;publishing=true;const button=$('#saveEditor')||$('#publishDoc');if(button)button.disabled=true;try{
 if(pendingPublishCandidate){if(await flush())completePublished(pendingPublishCandidate);else toast('发布暂未完成；内容仍保留，请到设置中重试保存');return}
 if(edit){clearTimeout(autoTimer);autoTimer=null;updateDraftFromDOM();saveDraft(true);if(!await flush()){toast('内容仍保留；请到设置中重试保存，再发布');return}}
 const candidate=structuredClone(data),index=candidate.notes.findIndex(n=>n.id===noteId);if(index<0)throw Error('笔记不存在');const note=candidate.notes[index];if(!needsPublish(note)){toast('这篇笔记已经发布');return}note.title=note.title.trim()||'无标题笔记';note.status='published';note.publishedAt=Date.now();note.updated=Date.now();delete note.publishedSnapshot;pendingPublishCandidate=candidate;queueSave(candidate);if(await flush())completePublished(candidate);else toast('发布暂未完成；内容仍保留，请到设置中重试保存')
 }catch(error){toast(`发布失败：${error.message}`)}finally{publishing=false;const current=$('#saveEditor')||$('#publishDoc');if(current)current.disabled=false}}
function syncToolbarState(editor){
 if(!editor||!$('#editorToolbar'))return;
 const toolbar=$('#editorToolbar');
 for(const [command,type] of [['bold','bold'],['italic','italic'],['underline','underline'],['strikeThrough','strike'],['insertUnorderedList','bulletList'],['insertOrderedList','orderedList'],['code','code']])toolbar.querySelector('[data-fmt="'+command+'"]')?.setAttribute('aria-pressed',String(editor.isActive(type)));
 const block=editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':editor.isActive('blockquote')?'blockquote':'p';
 $('#blockSelect').value=block;
 const inTable=editor.isActive('table');
 const tableTools=toolbar.querySelector('.table-tools');if(tableTools)tableTools.hidden=!inTable;
 toolbar.querySelectorAll('[data-table-action]').forEach(button=>button.disabled=!inTable);
 let actions=toolbar.querySelector('.editor-core-actions');
 if(!actions){
  actions=document.createElement('span');
  actions.className='editor-core-actions';
  actions.setAttribute('role','group');
  actions.setAttribute('aria-label','编辑操作');
  actions.innerHTML='<span class="tool-divider"></span><button type="button" class="tool-btn" data-editor-action="undo" title="撤销（Ctrl / ⌘ Z）" aria-label="撤销">↶</button><button type="button" class="tool-btn" data-editor-action="redo" title="重做（Ctrl / ⌘ Shift Z）" aria-label="重做">↷</button><span class="tool-divider"></span><button type="button" class="tool-btn" data-editor-action="clear-format" title="清除格式" aria-label="清除格式">Tx</button><button type="button" class="tool-btn" data-editor-action="unlink" title="取消链接" aria-label="取消链接" disabled>×链</button><button type="button" class="tool-btn" data-fmt="code" title="行内代码" aria-label="行内代码">&lt;/&gt;</button>';
  actions.addEventListener('click',event=>{const button=event.target.closest('[data-editor-action]');if(button)runEditorAction(button.dataset.editorAction)});
  toolbar.append(actions);
 }
 actions.querySelector('[data-editor-action="undo"]').disabled=!editor.can().undo();
 actions.querySelector('[data-editor-action="redo"]').disabled=!editor.can().redo();
 actions.querySelector('[data-editor-action="unlink"]').disabled=!editor.isActive('link');
 let deleteCallout=toolbar.querySelector('[data-delete-block="callout"]');
 if(!deleteCallout){
  deleteCallout=document.createElement('button');deleteCallout.type='button';deleteCallout.className='tool-btn callout-delete';deleteCallout.dataset.deleteBlock='callout';deleteCallout.title='删除提示块（先将光标放入提示块）';deleteCallout.setAttribute('aria-label','删除当前提示块');deleteCallout.innerHTML=icons('trash');deleteCallout.disabled=true;
  deleteCallout.addEventListener('click',()=>{if(!richEditor?.isActive('callout'))return;richEditor.chain().focus().deleteNode('callout').run();updateDraftFromDOM();scheduleSave()});
  toolbar.append(deleteCallout);
 }
 deleteCallout.disabled=!editor.isActive('callout');
}
function organizeDocumentActions(){const row=main.querySelector('.doc-action-row');if(!row)return;const ids=edit?['exportHtml']:['duplicateDoc','deleteDoc'];const controls=ids.map(id=>$('#'+id)).filter(Boolean);if(!controls.length)return;const menu=document.createElement('details');menu.className='item-menu document-more';menu.innerHTML='<summary aria-label="更多笔记操作">···</summary><div class="item-menu-panel"></div>';controls.forEach(node=>menu.lastElementChild.append(node));row.append(menu)}
function organizeEditorTools(){
 organizeDocumentActions();const toolbar=$('#editorToolbar');if(!toolbar)return;
 const properties=document.createElement('details');properties.className='editor-properties';properties.open=!window.matchMedia?.('(max-width: 720px)').matches;properties.innerHTML='<summary>笔记属性 <span>类型、分类、标签与来源</span></summary>';toolbar.previousElementSibling.querySelectorAll('.editor-fields').forEach(node=>properties.append(node));toolbar.previousElementSibling.append(properties);
 const extra=document.createElement('details');extra.className='editor-extra-tools item-menu';extra.innerHTML='<summary aria-label="更多格式">更多</summary><div class="item-menu-panel editor-extra-panel"></div>';
 const selectors='[data-fmt="strikeThrough"],[data-fmt="justifyLeft"],[data-fmt="justifyCenter"],input[type="color"],[data-insert="emoji"],[data-insert="rule"],[data-insert="callout"],[data-insert="details"],[data-delete-block="callout"]';
 toolbar.querySelectorAll(selectors).forEach(node=>extra.lastElementChild.append(node));
 main.querySelectorAll('.bottom-action [data-insert]').forEach(node=>{if([...extra.querySelectorAll('[data-insert]')].some(existing=>existing.dataset.insert===node.dataset.insert)){node.remove();return}node.className='tool-btn';extra.lastElementChild.append(node)});main.querySelector('.bottom-action')?.remove();toolbar.append(extra);
 toolbar.querySelectorAll('.tool-btn').forEach(button=>{if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',button.title||button.textContent)});
}
function runEditorAction(action){if(!richEditor)return;const chain=richEditor.chain().focus();if(action==='undo')chain.undo().run();else if(action==='redo')chain.redo().run();else if(action==='clear-format')chain.unsetAllMarks().clearNodes().run();else if(action==='unlink'&&richEditor.isActive('link'))chain.extendMarkRange('link').unsetMark('link').run();updateDraftFromDOM();scheduleSave();syncToolbarState(richEditor)}
function doFormat(cmd,arg=null){if(!richEditor)return;let chain=richEditor.chain().focus();if(cmd==='bold')chain.toggleBold().run();else if(cmd==='italic')chain.toggleItalic().run();else if(cmd==='underline')chain.toggleUnderline().run();else if(cmd==='strikeThrough')chain.toggleStrike().run();else if(cmd==='code')chain.toggleCode().run();else if(cmd==='insertUnorderedList')chain.toggleBulletList().run();else if(cmd==='insertOrderedList')chain.toggleOrderedList().run();else if(cmd==='justifyLeft')chain.setTextAlign('left').run();else if(cmd==='justifyCenter')chain.setTextAlign('center').run();else if(cmd==='foreColor')chain.setColor(arg).run();else if(cmd==='createLink')chain.setMark('link',{href:arg}).run();else if(cmd==='formatBlock'){if(arg==='p')chain.setParagraph().run();else if(arg==='h2'||arg==='h3')chain.setHeading({level:Number(arg.slice(1))}).run();else if(arg==='blockquote')chain.toggleBlockquote().run()}updateDraftFromDOM();scheduleSave();syncToolbarState(richEditor)}
function insertHTML(html){if(!richEditor)return;richEditor.chain().focus().insertContent(cleanHTML(html,true),{parseOptions:{preserveWhitespace:'full'}}).run();updateDraftFromDOM();scheduleSave()}
function captureSelection(pad){const selection=window.getSelection();if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0);const parent=range.commonAncestorContainer;return parent===pad||pad.contains(parent)?range.cloneRange():null}
function placeCaptureFragment(fragment,targetRange=null){const pad=$('#capturePad'),range=targetRange||captureSelection(pad),selection=window.getSelection();if(!range){pad.appendChild(fragment);pad.focus();return}range.deleteContents();const last=fragment.lastChild;range.insertNode(fragment);if(last){range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}}
function insertCaptureHTML(html,targetRange=null){const template=document.createElement('template');template.innerHTML=String(html||'');placeCaptureFragment(template.content,targetRange)}
function insertCaptureText(text,targetRange=null){const pad=$('#capturePad'),range=targetRange||captureSelection(pad),insideCode=range?.startContainer?.parentElement?.closest('pre,code');if(insideCode){const fragment=document.createDocumentFragment();fragment.appendChild(document.createTextNode(String(text||'')));placeCaptureFragment(fragment,range);return}const fragment=document.createDocumentFragment(),lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');lines.forEach((line,index)=>{if(index)fragment.appendChild(document.createElement('br'));if(line)fragment.appendChild(document.createTextNode(line))});placeCaptureFragment(fragment,range)}
function doInsert(kind){if(kind==='image'){$('#imageFile').click();return}if(kind==='code'){insertHTML('<pre><code>在这里粘贴代码或配置</code></pre><p></p>');return}if(kind==='table'){richEditor?.chain().focus().insertTable({rows:3,cols:2,withHeaderRow:true}).run();updateDraftFromDOM();scheduleSave();return}if(kind==='rule'){insertHTML('<hr><p></p>');return}if(kind==='callout'){insertHTML('<div class="callout">📌 在这里填写提示内容</div><p></p>');return}if(kind==='details'){insertHTML('<details><summary>点击展开</summary><div data-type="detailsContent"><p>在这里填写折叠内容</p></div></details><p></p>');return}if(kind==='link'){const editing=richEditor?.isActive('link'),current=editing?richEditor.getAttributes('link').href:'';let url=prompt(editing?'编辑链接地址':'输入链接地址（https://...）',current);if(url===null)return;if(!safeUrl(url)){toast('只支持安全的 http、https 等链接');return}const selection=richEditor?.state.selection;if(editing)richEditor.chain().focus().extendMarkRange('link').setMark('link',{href:url.trim()}).run();else if(selection&&selection.from!==selection.to)doFormat('createLink',url.trim());else insertHTML(`<a href="${esc(url.trim())}" rel="noopener noreferrer" target="_blank">${esc(url.trim())}</a>`);updateDraftFromDOM();scheduleSave();syncToolbarState(richEditor);return}if(kind==='emoji'){let s=prompt('输入表情或符号（例如：✅ ⚠️ 📌 → ✓）','✅');if(s)insertHTML(esc(s.slice(0,40)));return}}
function clipboardText(html,plain){if(plain)return String(plain);if(!html)return '';const parsed=new DOMParser().parseFromString(DOMPurify.sanitize(String(html)), 'text/html');parsed.querySelectorAll('img').forEach(node=>node.replaceWith(parsed.createTextNode(node.getAttribute('alt')||'')));parsed.querySelectorAll('br').forEach(node=>node.replaceWith(parsed.createTextNode('\n')));parsed.querySelectorAll('p,div,li,pre,h1,h2,h3,h4,h5,h6,tr,blockquote').forEach(node=>node.append(parsed.createTextNode('\n')));return parsed.body.textContent||''}
function isCodeSelection(editor){return editor.isActive('codeBlock')||editor.isActive('code')}
function insertPlainDocument(editor,text){const value=String(text||'');if(isCodeSelection(editor)){if(value)editor.commands.insertContent({type:'text',text:value});return}editor.commands.insertContent(plainTextToDocument(value))}
async function insertMarkdownDocument(editor,text,bookmark){
 const {parseQidianMarkdown}=await loadMarkdownTools();
 if(editor.isDestroyed)return null;
 const parsed=parseQidianMarkdown(text),safe=sanitizeMarkdownDocument(parsed,editor.schema,safeUrl);
 try{editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)))}catch(error){}
 if(!editor.commands.insertContent(safe))throw new Error('编辑器拒绝了转换后的内容');
 return safe;
}
function plainDocumentHTML(documentJSON){if(documentJSON?.type!=='doc'||!Array.isArray(documentJSON.content))throw new TypeError('纯文本转换结构无效');return documentJSON.content.map(block=>{if(block.type!=='paragraph')throw new TypeError('纯文本段落类型不受支持');return `<p>${(block.content||[]).map(node=>node.type==='hardBreak'?'<br>':node.type==='text'?esc(node.text):'').join('')}</p>`}).join('')||'<p></p>'}
function hasRemoteImage(node){if(node?.type==='image'&&/^https?:\/\//i.test(String(node.attrs?.src||'')))return true;return(node?.content||[]).some(hasRemoteImage)}
function preferredPasteMode(){return ['rich','match','markdown','plain'].includes(data.pasteMode)?data.pasteMode:'rich'}
function handleEditorPaste({event,editor}){
 const mode=$('#editPasteMode')?.value||'rich',clip=event.clipboardData;if(!clip)return false;
 const html=clip.getData('text/html'),hasHTML=Boolean(String(html).trim()),plain=clip.getData('text/plain'),text=clipboardText(html,plain),file=Array.from(clip.files||[]).find(f=>f.type.startsWith('image/'));
 if(file&&!hasHTML&&!plain){event.preventDefault();void storeImage(file,'edit',editor.state.selection.getBookmark());return true}
 if(!hasHTML&&!plain)return false;
 autofillPastedTitle('editTitle',html,text);
 if(isCodeSelection(editor)){event.preventDefault();insertPlainDocument(editor,text);return true}
 const selected=mode==='match'?'legacy':mode;
 const kind=classifyClipboard({html:hasHTML?html:'',text,mode:selected});
 event.preventDefault();
 if(kind==='html'){
  let safe;try{safe=cleanHTML(html,mode==='rich')}catch(error){insertPlainDocument(editor,text);toast('网页内容过于复杂，已按纯文本插入，原文字未丢失');return true}
  if(!editor.commands.insertContent(safe,{parseOptions:{preserveWhitespace:'full'}})){insertPlainDocument(editor,text);toast('网页格式无法插入，已按纯文本保留内容');return true}
  if(mode==='rich'&&/<img/i.test(html)&&!/(?:src=["'](?:\/api\/assets\/|data:image\/))/i.test(html))toast('已粘贴图文；原网页的远程图片可能会失效，建议另行上传');
  return true;
 }
 if(kind==='markdown'){
  const bookmark=editor.state.selection.getBookmark();
  void insertMarkdownDocument(editor,text,bookmark).then(safe=>{if(safe&&hasRemoteImage(safe))toast('已粘贴远程图片链接；原站可能限制访问，建议上传到私人空间保存')})
   .catch(error=>{if(editor.isDestroyed)return;try{editor.view.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)))}catch(restoreError){}insertPlainDocument(editor,text);toast('Markdown 解析失败，已按纯文本插入，原内容未丢失')});
  return true;
 }
 if(kind==='legacy'){
  try{const safe=cleanHTML(plainTextToStructuredHTML(text),false);if(!editor.commands.insertContent(safe,{parseOptions:{preserveWhitespace:'full'}}))throw new Error('编辑器拒绝了兼容转换结果')}
  catch(error){insertPlainDocument(editor,text);toast('兼容整理失败，已按原文插入')}
  return true;
 }
 insertPlainDocument(editor,text);return true;
}
function openSlashMenu(){const menu=$('#slashMenu');let selection=window.getSelection(),rect=selection.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;let x=rect?.left||window.innerWidth/2,y=(rect?.bottom||120)+8;menu.style.left=Math.max(12,Math.min(x,window.innerWidth-260))+'px';menu.style.top=Math.max(12,Math.min(y,window.innerHeight-355))+'px';menu.classList.add('open')}function closeSlashMenu(){$('#slashMenu').classList.remove('open')}function openSlashHint(){openSlashMenu()}
async function storeImage(file,dest,editorBookmark=null,captureRange=null){
 if(!file.type.startsWith('image/'))return;
 try{const asset=await upload(file);if(!asset.mime.startsWith('image/'))throw Error('仅支持 PNG、JPEG、GIF、WebP 图像');
 const html=`<figure><img src="${asset.url}" alt="${esc(file.name)}"><figcaption>${esc(file.name)}</figcaption></figure><p></p>`;
 if(dest==='capture')insertCaptureHTML(cleanHTML(html,true),captureRange);else{if(editorBookmark&&richEditor){try{richEditor.view.dispatch(richEditor.state.tr.setSelection(editorBookmark.resolve(richEditor.state.doc)))}catch(error){}}insertHTML(html)}
 toast('图片已存入私人空间');}catch(error){toast(error.message)}
}
async function pasteRich(e){const mode=(e.currentTarget.id==='capturePad'?$('#capturePasteMode')?.value:$('#editPasteMode')?.value)||'rich',clip=e.clipboardData;if(!clip)return;const html=clip.getData('text/html'),hasHTML=Boolean(String(html).trim()),plain=clip.getData('text/plain'),text=clipboardText(html,plain),file=Array.from(clip.files||[]).find(f=>f.type.startsWith('image/')),isCapture=e.currentTarget.id==='capturePad',targetRange=isCapture?captureSelection($('#capturePad')):null;
 if(file&&!hasHTML&&!plain){e.preventDefault();await storeImage(file,isCapture?'capture':'edit',!isCapture&&richEditor?richEditor.state.selection.getBookmark():null,targetRange);return}
 if(!hasHTML&&!plain)return;
 autofillPastedTitle(isCapture?'captureName':'editTitle',html,text);
 const parent=window.getSelection()?.anchorNode,element=parent?.nodeType===1?parent:parent?.parentElement;
 if(element?.closest('pre,code')){e.preventDefault();insertCaptureText(text);return}
 const selected=mode==='match'?'legacy':mode,kind=classifyClipboard({html:hasHTML?html:'',text,mode:selected});
 e.preventDefault();
 if(kind==='html'){
  try{insertCaptureHTML(cleanHTML(html,mode==='rich'))}catch(error){insertCaptureText(text);toast('网页内容过于复杂，已按纯文本插入，原文字未丢失');return}
  if(mode==='rich'&&/<img/i.test(html))toast('已粘贴图文；原网页的远程图片可能会失效，建议上传保存');return;
 }
 if(kind==='markdown'){
  try{const {parseQidianMarkdown,qidianSchema,serializeQidianDocument}=await loadMarkdownTools(),parsed=parseQidianMarkdown(text),safe=sanitizeMarkdownDocument(parsed,qidianSchema,safeUrl),html=cleanHTML(serializeQidianDocument(safe),true);insertCaptureHTML(html,targetRange);if(hasRemoteImage(safe))toast('已粘贴远程图片链接；需要长期保留时请上传到私人空间')}
  catch(error){insertCaptureText(text,targetRange);toast('Markdown 解析失败，已按纯文本插入，原内容未丢失')}
  return;
 }
 if(kind==='legacy'){try{insertCaptureHTML(cleanHTML(plainTextToStructuredHTML(text),false))}catch(error){insertCaptureText(text);toast('兼容整理失败，已按原文插入')}return}
 try{insertCaptureHTML(cleanHTML(plainDocumentHTML(plainTextToDocument(text)),true))}
 catch(error){insertCaptureText(text);toast('文本排版失败，已按原文插入')}
}
function openCapture(){closeMenu();$('#captureType').innerHTML=data.noteTypes.map(t=>`<option value="${esc(t.id)}">${esc(displayTypeName(t))}</option>`).join('');$('#captureType').value=data.noteTypes.find(t=>t.id==='clip')?.id||data.noteTypes[0].id;let sel=$('#captureCat');sel.innerHTML=categoryOptions('网页摘录');$('#captureName').value='';$('#captureSource').value='';$('#capturePad').innerHTML='';$('#capturePasteMode').value=preferredPasteMode();$('#captureOverlay').classList.add('open');setTimeout(()=>$('#capturePad').focus(),100)}
function closeCapture(){$('#captureOverlay').classList.remove('open')}
async function saveCapture(){let name=$('#captureName').value.trim(),body=cleanHTML($('#capturePad').innerHTML,true);if(!name&&!tinyText(body)){toast('请至少填写标题或内容');return}const n={id:'n'+Date.now(),title:name||tinyText(body).slice(0,35)||'新收藏',category:$('#captureCat').value,type:$('#captureType').value,tags:[],body,source:$('#captureSource').value,updated:Date.now(),created:Date.now(),pinned:false,status:'draft',publishedAt:null},previous=data;try{const candidate=structuredClone(data);candidate.notes.unshift(n);data=validateVault(candidate);await commitPersist();closeCapture();openNote(n.id)}catch(error){data=previous;toast(error.message||'网页摘录尚未保存')} }
function openCategoryDialog(){closeMenu();const input=$('#categoryNameInput');input.value='';$('#categoryDialogMessage').textContent='';$('#categoryOverlay').classList.add('open');setTimeout(()=>input.focus(),50)}
async function saveCategory(){const input=$('#categoryNameInput'),name=input.value.trim(),message=$('#categoryDialogMessage');if(!name){message.textContent='请输入分类名称';input.focus();return}if(name.length>30){message.textContent='分类名称最多 30 个字符';input.focus();return}if(data.categories.includes(name)){message.textContent='这个分类已存在';input.focus();return}const previous=data;try{const candidate=structuredClone(data);candidate.categories.push(name);data=validateVault(candidate);await commitPersist();$('#categoryOverlay').classList.remove('open');openHome(name)}catch(error){data=previous;message.textContent=error.message||'分类尚未保存';input.focus()}}
async function openBackupHistory(){if(edit)saveDraft(true);closeAccountSettings();closeMenu();const overlay=$('#backupHistoryOverlay'),list=$('#backupHistoryList');overlay.classList.add('open');list.innerHTML='<div class="empty backup-empty">正在读取 Docker 服务端快照…</div>';try{const backups=await listBackups();if(!backups.length){list.innerHTML=`<div class="empty backup-empty">${initial.local?'本地开发预览不创建服务端快照。':'当前账号还没有可查看的快照。'}</div>`;return}list.innerHTML=backups.slice(0,20).map(item=>`<article class="backup-row"><div class="backup-row-info"><strong>版本 ${esc(item.revision)}</strong><time>${esc(new Date(item.created).toLocaleString('zh-CN'))}</time></div><div class="backup-row-actions"><button class="secondary-btn" data-backup-download="${esc(item.revision)}">下载正文</button><button class="secondary-btn" data-backup-restore="${esc(item.revision)}">恢复此版本</button></div></article>`).join('')}catch(error){list.innerHTML=`<div class="empty backup-empty">读取失败：${esc(error.message||'请稍后重试')}</div>`}}
async function downloadBackupSnapshot(revision){try{const snapshot=await getBackup(revision);download(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),`栖点-正文快照-${revision}.json`);toast('正文快照已下载；附件请通过完整备份导出')}catch(error){toast(`快照下载失败：${error.message}`)}}
async function restoreBackupSnapshot(revision){if(!confirm(`将用历史版本 ${revision} 替换当前知识库。恢复前会先下载当前完整备份（含附件），之后再提交Docker 服务端恢复。是否继续？`))return;try{const snapshot=await getBackup(revision);if(!snapshot||!Array.isArray(snapshot.notes))throw Error('历史快照结构无效');if(edit)saveDraft(true);await exportBackup(structuredClone(data));await createBackupSnapshot();const restored=validateVault({...snapshot,notes:snapshot.notes.map(note=>({...note,body:cleanHTML(note.body,true)})),trash:snapshot.trash||[]});await commitSave(restored);data=restored;applyTheme(data.theme);bookmarksView.syncPreferences();edit=false;editingDraft=null;noteId=null;page='home';render();$('#backupHistoryOverlay').classList.remove('open');await pruneAssets()}catch(error){toast(`恢复未完成：${error.message}`)}}
async function exportJSON(){if(edit)saveDraft(true);try{await exportBackup(structuredClone(data));toast('完整备份已导出，包含图片和附件')}catch(error){toast('完整备份失败：'+error.message);download(new Blob([JSON.stringify(data)],{type:'application/json'}),'栖点-紧急正文草稿.json')}}
async function importJSON(file){if(!file)return;try{
 if(!confirm('导入会替换当前知识库。继续后将先确认当前内容已保存，下载完整备份并创建服务端快照，是否继续？'))return;
 await exportBackup(structuredClone(data));
 await createBackupSnapshot();
 const restored=await readBackup(file);
 restored.notes=restored.notes.map(n=>({...n,body:cleanHTML(n.body,true)}));
 const candidate=validateVault({...restored,trash:restored.trash||[]});
 await commitSave(candidate);data=candidate;applyTheme(data.theme);bookmarksView.syncPreferences();openHome();await pruneAssets();toast('导入完成，当前知识库已写入 Docker 服务端');
 }catch(error){await pruneAssets().catch(()=>{});toast('导入失败：'+error.message)}finally{$('#importFile').value=''}}
function openCreateMenu(){closeMenu();if(!$('#createOverlay'))document.body.insertAdjacentHTML('beforeend',`<div class="overlay" id="createOverlay"><section class="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="createTitle"><div class="dialog-head"><h2 id="createTitle">新建</h2><button class="round-btn" data-close="createOverlay" aria-label="关闭">${icons('close')}</button></div><div class="dialog-body create-options"><button data-create-kind="note">${icons('note')}<span><strong>笔记</strong><small>记录内容、命令与图片</small></span></button><button data-create-kind="bookmark">${icons('link')}<span><strong>书签</strong><small>保存网址并选择分组</small></span></button><button data-create-kind="capture">${icons('clip')}<span><strong>网页摘录</strong><small>将复制的内容整理为笔记</small></span></button></div></section></div>`);$('#createOverlay').classList.add('open');$('#createOverlay [data-create-kind]').focus()}
function openSearch(){$('#switcher').classList.add('open');$('#globalSearch').value='';renderSearch('');$('#globalSearch').focus()};function closeSearch(){$('#switcher').classList.remove('open')};function renderSearch(q){
 const needle=q.trim().toLocaleLowerCase(),notes=data.notes.filter(n=>[n.title,n.category,n.source,...(n.tags||[]),tinyText(n.body)].join(' ').toLocaleLowerCase().includes(needle)).sort((a,b)=>b.updated-a.updated).slice(0,12);
 const links=[];const visit=(entries,path=[])=>entries.forEach(item=>{if(item.kind==='folder')visit(item.children,[...path,item.title]);else if(safeUrl(item.url)&&[item.title,item.url,...path].join(' ').toLocaleLowerCase().includes(needle))links.push({item,path})});visit(data.bookmarks||[]);
 $('#switcherList').innerHTML=notes.map(n=>`<button class="switcher-item" data-search-id="${esc(n.id)}"><span class="search-kind">笔记</span>${esc(n.title||'无标题笔记')}<small>${esc(n.category)} · ${esc(typeLabel(n.type))} · ${nowString(n.updated)}</small></button>`).join('')+links.slice(0,12).map(({item,path})=>`<a class="switcher-item" data-search-bookmark href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="search-kind">书签</span>${esc(item.title)}<small>${esc(path.join(' / ')||'未分组')} · ${esc(new URL(item.url).hostname)}</small></a>`).join('')||'<div class="empty" style="padding:25px">没有找到匹配的内容</div>';
}
function toast(s){let el=$('#toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}
function setAvatarImages(url){const thumb=$('#accountAvatarThumb'),preview=$('#profileAvatarImage'),fallback=$('#accountButton .account-user-icon'),previewFallback=$('#profileAvatarPreview .account-user-icon');for(const img of [thumb,preview]){img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src')}if(fallback)fallback.hidden=!!url;if(previewFallback)previewFallback.hidden=!!url;$('#removeAvatar').hidden=!url}
function closeAccountMenu(){const menu=$('#accountMenu'),button=$('#accountButton');if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false')}
function closeAccountSettings(){$('#profileSettingsOverlay')?.classList.remove('open');$('#appSettingsOverlay')?.classList.remove('open');$('#versionInfoOverlay')?.classList.remove('open');if(!updateTargetVersion)clearTimeout(versionPollTimer)}
async function refreshAccountProfile(){if(initial.local){accountProfile={username:initial.username||'本地开发预览'};return accountProfile}try{accountProfile=await getAccountProfile();$('#profileUsername').textContent=accountProfile.username;$('#accountMenuUsername').textContent=accountProfile.username;$('#accountButton').title=`账号：${accountProfile.username}`;if(accountProfile.avatarMime){try{const url=URL.createObjectURL(await getAccountAvatar());if(avatarObjectUrl)URL.revokeObjectURL(avatarObjectUrl);avatarObjectUrl=url;setAvatarImages(url)}catch(error){setAvatarImages('');throw error}}else{if(avatarObjectUrl)URL.revokeObjectURL(avatarObjectUrl);avatarObjectUrl='';setAvatarImages('')}return accountProfile}catch(error){$('#profileSettingsMessage').textContent=error.message||'暂时无法读取账号资料';$('#profileSettingsMessage').classList.add('error');throw error}}
async function openProfileSettings(){closeAccountMenu();$('#profileSettingsOverlay').classList.add('open');const message=$('#profileSettingsMessage'),passwordMessage=$('#passwordChangeMessage');message.textContent='';message.className='account-settings-message';passwordMessage.textContent='';passwordMessage.className='account-settings-message';$('#profileUsername').textContent=initial.local?'本地开发预览':initial.username||'正在读取账号…';for(const control of [$('#chooseAvatar'),$('#removeAvatar'),$('#changePasswordButton')])control.disabled=initial.local;$('#accountAvatarFile').disabled=initial.local;if(initial.local){message.textContent='当前是本地界面预览；请登录部署后的栖点管理头像和密码。';message.classList.add('error');return}try{await refreshAccountProfile()}catch{}}
function ensureVersionInfoUI(){
 if(!$('#versionInfoOverlay')){
  document.body.insertAdjacentHTML('beforeend',`<div class="overlay" id="versionInfoOverlay"><section class="dialog version-dialog" role="dialog" aria-modal="true" aria-labelledby="versionInfoTitle"><div class="dialog-head"><div><h2 id="versionInfoTitle">版本信息</h2></div><button class="round-btn" data-close="versionInfoOverlay" aria-label="关闭"><span class="ico"><svg><use href="#i-close"/></svg></span></button></div><div class="dialog-body version-dialog-body"><div class="version-pair"><div class="version-current"><span>当前版本</span><strong id="installedVersion">—</strong></div><div class="version-latest" id="latestVersionCard"><span id="latestVersionLabel">最新版本</span><strong id="latestVersion">尚未检查</strong></div></div><p class="version-state" id="versionState" role="status" aria-live="polite">正在检查版本…</p><section class="version-notes-section"><div class="version-section-heading"><h3>版本说明</h3><span id="releasePublishedAt" hidden></span></div><div id="releaseNotes" class="release-notes">读取中…</div></section><section id="updateProgress" class="update-progress" data-mode="idle" hidden aria-label="更新进度与实时日志"><div class="update-progress-head"><div class="update-progress-title-row"><strong id="updateProgressTitle">本次更新</strong><span id="updateProgressTime" class="update-progress-time"></span></div><div class="update-progress-stage" role="status" aria-live="polite"><span class="update-progress-stage-mark" aria-hidden="true"></span><span id="updateProgressState">等待设备响应</span></div></div><div id="updateProgressTrack" class="update-progress-track" data-mode="idle" role="progressbar" aria-label="更新进度" aria-valuemin="0" aria-valuemax="100" aria-valuetext="尚未开始"><span id="updateProgressBar"></span></div><div class="update-progress-log-panel"><div class="update-progress-log-heading">实时日志</div><pre id="updateProgressLog" class="update-progress-log" aria-label="更新实时日志" aria-live="polite" tabindex="0"></pre></div></section></div><div class="dialog-foot version-dialog-foot"><div class="version-dialog-actions"><a id="releaseLink" class="secondary-btn" href="https://github.com/luckyalanzhou/qidian/releases" target="_blank" rel="noopener noreferrer">Release</a><button class="primary-btn" id="checkAndUpdateVersion" type="button" disabled>检查中…</button></div></div></section></div>`);
  $('#versionInfoOverlay').addEventListener('click',event=>{if(event.target.id==='versionInfoOverlay')closeAccountSettings()});
  $('#updateProgressLog').addEventListener('scroll',()=>{const log=$('#updateProgressLog');updateLogFollowing=log.scrollHeight-log.scrollTop-log.clientHeight<24})
 }
}
function renderVersionBadge(info){const button=$('#versionButton'),label=$('#currentVersionLabel');if(!button||!label)return;const current=info?.currentVersion||APP_VERSION,available=!!info?.updateAvailable;label.textContent=current?`v${current}`:'版本';button.dataset.updateAvailable=String(available);const description=current?`栖点当前版本 v${current}`:'查看版本信息';const accessible=available?`${description}，发现新版本 v${info.latestVersion}`:description;button.title=accessible;button.setAttribute('aria-label',accessible)}
function setVersionState(message,kind='info'){const node=$('#versionState');node.textContent=message;node.dataset.kind=kind}
function renderPublishedAt(value){const node=$('#releasePublishedAt'),date=value?new Date(value):null;node.textContent=date&&Number.isFinite(date.getTime())?`发布于 ${date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})}`:'';node.hidden=!node.textContent}
function renderVersionInfo(info){
 $('#installedVersion').textContent=info.currentVersion||'未知';$('#latestVersion').textContent=info.latestVersion||'未知';
 $('#latestVersionLabel').textContent=info.updateAvailable?'可更新版本':'最新版本';$('#latestVersionCard').dataset.updateAvailable=String(!!info.updateAvailable);
 renderReleaseNotes($('#releaseNotes'),info.notes||'此版本没有附加更新说明。');renderPublishedAt(info.publishedAt);
 const release=new URL(info.releaseUrl||'https://github.com/luckyalanzhou/qidian/releases');$('#releaseLink').href=release.origin==='https://github.com'?release.href:'https://github.com/luckyalanzhou/qidian/releases';
 renderVersionBadge(info);setVersionAction(info);
}
function setVersionAction(info){
 const button=$('#checkAndUpdateVersion');
 button.hidden=false;
 if(updateTargetVersion){button.disabled=true;button.textContent='更新进行中…';return}
 if(updateActionRunning){button.disabled=true;button.textContent='正在检查并更新…';return}
 button.disabled=false;button.textContent='检查并更新';
}
function setUpdateProgressMode(mode,message){
 const progress=$('#updateProgress'),track=$('#updateProgressTrack');progress.dataset.mode=mode;track.dataset.mode=mode;
 if(mode==='complete'){track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext',message||'已完成')}
 else{track.removeAttribute('aria-valuenow');track.setAttribute('aria-valuetext',message||'正在处理，暂不提供百分比')}
}
function updateProgressStage(status,waitingForRestart=false){
 if(status.state==='failed')return '更新失败 · 查看日志了解原因';
 if(status.state==='queued')return '更新任务已提交 · 等待设备执行';
 if(waitingForRestart)return '设备服务正在重启 · 等待恢复';
 if(status.state==='success')return updateTargetVersion?'服务已启动 · 正在确认目标版本':'更新完成 · 服务已重启';
 const lines=String(status.log||'').split(/\r?\n/).reverse();
 const stages=[
  [/正在确认容器已启动|容器.{0,20}(?:运行状态|已启动)|health.{0,20}(?:check|healthy)/i,'正在确认服务启动状态'],
  [/正在拉取适合|Pulling from|Pulling fs layer|Pull complete|Already exists|Download complete|Verifying Checksum|Extracting/i,'正在拉取新版本镜像'],
  [/等待.{0,50}(?:拉取|镜像)/i,'准备拉取新版本镜像'],
  [/管理文件已更新/i,'设备管理文件已更新 · 准备重启服务'],
  [/正在更新设备管理文件|校验通过，正在更新设备管理文件/i,'正在更新设备管理文件'],
  [/正在校验 SHA-256|sha256sum -c/i,'正在校验安装包'],
  [/开始下载|正在下载：已接收/i,'正在下载安装包与校验文件'],
  [/正在连接公开版本源|正在读取最新 Release/i,'正在检查最新版本'],
  [/正在检查 Docker 与数据目录/i,'正在检查设备与数据目录']
 ];
 for(const line of lines){for(const [pattern,label] of stages)if(pattern.test(line))return label}
 return status.state==='running'?'设备正在执行更新…':'等待设备响应';
}
function renderUpdateLog(serverLog=''){
 const log=$('#updateProgressLog'),parts=[...updateProgressMessages,serverLog].filter(Boolean);log.textContent=parts.join('\n');if(updateLogFollowing)log.scrollTop=log.scrollHeight;
}
function appendUpdateProgressMessage(message){
 if(!message)return;updateProgressMessages.push(message);if(updateProgressMessages.length>8)updateProgressMessages=updateProgressMessages.slice(-8);renderUpdateLog(lastUpdateStatus?.log||'');
}
function startUpdateCheck(){
 updateTerminalBaseline=['success','failed'].includes(lastUpdateStatus?.state)?updateStatusFingerprint(lastUpdateStatus):'';lastUpdateStatus=null;
 updateActionRunning=true;updateProgressMessages=[];updateLogFollowing=true;updateLogRelevant=false;
 $('#versionState').hidden=true;
 const progress=$('#updateProgress');progress.hidden=false;$('#updateProgressTitle').textContent='检查并更新';$('#updateProgressTime').textContent='';$('#updateProgressState').textContent='正在检查最新版本…';
 setUpdateProgressMode('checking','正在检查最新版本');appendUpdateProgressMessage('正在连接版本源，检查最新版本…');setVersionState('正在检查最新版本…');setVersionAction(versionInfo);
}
function finishUpdateCheck(message,{mode='complete',kind='current',log=message}={}){
 updateActionRunning=false;$('#versionState').hidden=false;$('#updateProgressTitle').textContent='版本检查';$('#updateProgressState').textContent=message;setUpdateProgressMode(mode,message);if(log)appendUpdateProgressMessage(log);setVersionState(message,kind);setVersionAction(versionInfo);
}
function clearPendingDeviceUpdate(){updateTargetVersion='';try{sessionStorage.removeItem('qidian.pendingDeviceUpdate')}catch{}}
function updateStatusFingerprint(status){return JSON.stringify([status?.state,status?.version,status?.updatedAt])}
function countDownUpdateRefresh(targetVersion){
 if(updateTargetVersion!==targetVersion||!updateReloadScheduled)return;
 const remaining=Math.max(0,Math.ceil((updateRefreshDeadline-Date.now())/1000));
 setVersionState(`栖点 ${targetVersion} 已部署，服务已启动；${remaining} 秒后自动刷新页面。`,'success');
 $('#versionState').hidden=true;
 $('#updateProgressState').textContent=`部署完成 · ${remaining} 秒后刷新`;
 setUpdateProgressMode('complete',`部署完成，${remaining} 秒后刷新`);$('#checkAndUpdateVersion').disabled=true;$('#checkAndUpdateVersion').textContent=`${remaining} 秒后刷新`;
 if(remaining>0){updateReloadTimer=setTimeout(()=>countDownUpdateRefresh(targetVersion),1000);return}
 void refreshAfterDeployment(targetVersion);
}
async function refreshAfterDeployment(targetVersion){
 try{
  const status=await getSystemUpdateStatus(),installed=await getSystemVersion({installedOnly:true});
  if(status.state!=='success'||status.version!==targetVersion||installed.currentVersion!==targetVersion)throw Error('服务还未就绪');
  clearPendingDeviceUpdate();window.location.reload();
 }catch{
  setVersionState('倒计时已结束，正在等待新版本服务恢复后自动刷新…');
  $('#versionState').hidden=true;$('#updateProgressState').textContent='倒计时结束 · 等待新版本服务恢复';setUpdateProgressMode('verifying','倒计时结束，等待新版本服务恢复');
  $('#checkAndUpdateVersion').textContent='等待服务启动…';
  updateReloadTimer=setTimeout(()=>void refreshAfterDeployment(targetVersion),2000);
 }
}
async function verifyUpdatedVersion(targetVersion){
 if(updateVersionCheckRunning||updateReloadScheduled||!targetVersion||updateTargetVersion!==targetVersion)return;
 updateVersionCheckRunning=true;
 try{
  const installed=await getSystemVersion({installedOnly:true}),info={...versionInfo,currentVersion:installed.currentVersion,latestVersion:versionInfo?.latestVersion||targetVersion,updateAvailable:false};
  if(updateTargetVersion!==targetVersion)return;
  if(info.currentVersion!==targetVersion||lastUpdateStatus?.state!=='success'||lastUpdateStatus.version!==targetVersion)throw Error('新版本服务还未就绪');
  versionInfo=info;versionInfoCheckedAt=Date.now();renderVersionInfo(info);
  clearTimeout(updateVerificationTimer);clearTimeout(versionPollTimer);updateReloadScheduled=true;clearTimeout(updateReloadTimer);
  updateRefreshDeadline=Date.now()+updateRefreshDelay;countDownUpdateRefresh(targetVersion);
 }catch{
  setVersionState('更新已完成，正在等待新版本服务就绪…');
  $('#versionState').hidden=true;$('#updateProgressState').textContent='更新任务完成 · 等待新版本服务就绪';
   $('#checkAndUpdateVersion').disabled=true;$('#checkAndUpdateVersion').textContent='等待服务启动…';
  clearTimeout(updateVerificationTimer);updateVerificationTimer=setTimeout(()=>void verifyUpdatedVersion(targetVersion),2000);
 }finally{updateVersionCheckRunning=false}
}
function renderUpdateStatus(status){
 if(updateReloadScheduled)return;
 lastUpdateStatus=status;
 // A previous job must never replace the version requested by this page.
 if(updateTargetVersion&&((status.version&&status.version!==updateTargetVersion)||(['success','failed'].includes(status.state)&&updateStatusFingerprint(status)===updateTerminalBaseline)))status={state:'queued',version:'',updatedAt:null,log:''};
 else if(['queued','running'].includes(status.state))updateTerminalBaseline='';
  const progress=$('#updateProgress'),button=$('#checkAndUpdateVersion'),title=$('#updateProgressTitle'),label=$('#updateProgressState');
 if(!updateTargetVersion&&status.version&&['queued','running'].includes(status.state)){updateTargetVersion=status.version;updateLogRelevant=true;try{sessionStorage.setItem('qidian.pendingDeviceUpdate',updateTargetVersion)}catch{}}
 const active=['queued','running'].includes(status.state),waitingForRestart=!!updateTargetVersion&&['idle','unavailable'].includes(status.state);
 if(active||waitingForRestart)updateLogRelevant=true;
 if(!updateLogRelevant&&!active&&!waitingForRestart&&['success','failed','unavailable'].includes(status.state))status={state:'idle',version:'',updatedAt:null,log:''};
 $('#versionState').hidden=!!updateTargetVersion&&status.state!=='failed';
 progress.hidden=!updateLogRelevant||status.state==='idle'&&!updateTargetVersion;
 title.textContent=updateTargetVersion?`本次更新 · v${updateTargetVersion}`:status.version?`上次更新 · v${status.version}`:'本次更新';
 const logUpdatedAt=status.logUpdatedAt==null?null:new Date(status.logUpdatedAt);$('#updateProgressTime').textContent=logUpdatedAt&&Number.isFinite(logUpdatedAt.getTime())?`最近日志 · ${logUpdatedAt.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'';
 label.textContent=updateProgressStage(status,waitingForRestart);
  renderUpdateLog(status.log||'');
  if(status.state==='failed')setUpdateProgressMode('error','更新失败');else if(updateReloadScheduled)setUpdateProgressMode('complete','新版本已启动，等待刷新');else if(active||waitingForRestart||updateTargetVersion)setUpdateProgressMode('updating',label.textContent);else if(status.state==='success')setUpdateProgressMode('complete','更新完成');
  if(active||waitingForRestart||updateTargetVersion){button.disabled=true;button.textContent=updateReloadScheduled?'即将刷新':'更新进行中…'}else setVersionAction(versionInfo);
 if(status.state==='success'&&updateTargetVersion&&status.version===updateTargetVersion)void verifyUpdatedVersion(status.version);
  if(status.state==='failed'&&updateTargetVersion){updateLogRelevant=true;clearPendingDeviceUpdate();setVersionState('更新失败；查看本次日志后可以重试。','error');setVersionAction(versionInfo)}
 clearTimeout(versionPollTimer);if((active||updateTargetVersion)&&($('#versionInfoOverlay').classList.contains('open')||updateTargetVersion))versionPollTimer=setTimeout(()=>void refreshUpdateStatus(),1000);
}
 async function refreshUpdateStatus(){if(updateReloadScheduled)return;try{renderUpdateStatus(await getSystemUpdateStatus())}catch(error){if(updateReloadScheduled)return;setVersionState(updateTargetVersion?'服务正在重启，等待新版本恢复…':error.message||'服务暂不可用，稍后重新检查。',updateTargetVersion?'info':'error');if(updateTargetVersion){$('#checkAndUpdateVersion').disabled=true;$('#checkAndUpdateVersion').textContent='等待服务启动…';setUpdateProgressMode('verifying','服务重启中，等待恢复')}clearTimeout(versionPollTimer);if(updateTargetVersion||($('#versionInfoOverlay')?.classList.contains('open')&&$('#checkAndUpdateVersion').textContent==='正在检查并更新…'))versionPollTimer=setTimeout(()=>void refreshUpdateStatus(),2000)}}
const VERSION_INFO_CACHE_MS=5*60*1000;
async function checkSystemVersion(){
 ensureVersionInfoUI();
 if(updateReloadScheduled)return;
  if(updateTargetVersion){setVersionState(`正在等待 v${updateTargetVersion} 服务恢复…`);$('#checkAndUpdateVersion').disabled=true;$('#checkAndUpdateVersion').textContent='更新进行中…';await refreshUpdateStatus();return}
 if(versionCheckPromise)return versionCheckPromise;
 if(versionInfo&&Date.now()-versionInfoCheckedAt<VERSION_INFO_CACHE_MS){await refreshUpdateStatus();return}
 const hasCachedInfo=!!versionInfo;
 if(!hasCachedInfo){$('#installedVersion').textContent=APP_VERSION||'读取中…';$('#latestVersion').textContent='检查中…';$('#versionState').dataset.kind='info';setVersionState('正在检查最新版本…');renderReleaseNotes($('#releaseNotes'),'读取中…');$('#releasePublishedAt').hidden=true;$('#checkAndUpdateVersion').disabled=true;$('#checkAndUpdateVersion').textContent='正在检查…'}
 else{setVersionState('正在刷新版本信息…');setVersionAction(versionInfo)}
 const request=(async()=>{
  try{versionInfo=await getSystemVersion();versionInfoCheckedAt=Date.now();renderVersionInfo(versionInfo);setVersionState(versionInfo.updateAvailable?(!versionInfo.canUpdateDevice?'发现新版本；只有首个账号可以更新设备。':versionInfo.updaterAvailable?'发现新版本，可以在线更新。':'发现新版本；请先通过 iStoreOS 安装新版管理组件。'):'当前已是最新版本。',versionInfo.updateAvailable?'available':'current');
   if(versionInfo.updateAvailable&&!versionInfo.installerAvailable)setVersionState('发现新版本，但安装包尚未就绪，请稍后再试。','error');
  }catch(error){if(versionInfo){renderVersionInfo(versionInfo);setVersionState('暂时无法刷新；仍显示上次读取的版本信息。','error');setVersionAction(versionInfo)}else{$('#latestVersion').textContent='暂不可用';$('#latestVersionLabel').textContent='最新版本';$('#latestVersionCard').dataset.updateAvailable='false';renderReleaseNotes($('#releaseNotes'),'暂时无法读取更新说明。');$('#releasePublishedAt').hidden=true;setVersionState(error.message||'版本检查失败，请稍后重试。','error');setVersionAction(null)}}
  await refreshUpdateStatus();
 })();
 versionCheckPromise=request;
 try{await request}finally{if(versionCheckPromise===request)versionCheckPromise=null}
}
async function openVersionInfo(){closeAccountMenu();$('#appSettingsOverlay').classList.remove('open');ensureVersionInfoUI();$('#versionInfoOverlay').classList.add('open');if(versionInfo)renderVersionInfo(versionInfo);void checkSystemVersion()}
function openAppSettings(){closeAccountMenu();ensureVersionInfoUI();$('#appSettingsOverlay').classList.add('open')}
 async function checkAndUpdateVersion(){
  if(updateActionRunning||updateTargetVersion||updateReloadScheduled)return;
  startUpdateCheck();
  try{
   const info=await getSystemVersion();versionInfo=info;versionInfoCheckedAt=Date.now();renderVersionInfo(info);
   if(!info.updateAvailable){updateLogRelevant=false;finishUpdateCheck(`当前已是最新版本 v${info.currentVersion||info.latestVersion}。`);return}
   appendUpdateProgressMessage(`发现新版本 v${info.latestVersion}。`);
   if(!info.installerAvailable){updateLogRelevant=false;finishUpdateCheck('发现新版本，但安装包尚未就绪，请稍后重试。',{mode:'blocked',kind:'error',log:'安装包尚未就绪，本次未启动更新。'});return}
   if(!info.updaterAvailable){updateLogRelevant=false;finishUpdateCheck('发现新版本；请先通过 iStoreOS 更新管理组件。',{mode:'blocked',kind:'error',log:'设备端更新管理组件尚未就绪，本次未启动更新。'});return}
   if(!info.canUpdateDevice){updateLogRelevant=false;finishUpdateCheck('发现新版本；只有首个账号可以更新设备。',{mode:'blocked',kind:'error',log:'当前账号没有设备更新权限，本次未启动更新。'});return}
   $('#updateProgressTitle').textContent=`正在更新 · v${info.latestVersion}`;$('#updateProgressState').textContent='正在保存当前修改…';setUpdateProgressMode('updating','正在准备更新');appendUpdateProgressMessage('安装包和设备更新服务均已就绪，正在确认当前数据已保存…');
   if(!await flush())throw Error('当前修改尚未写入，请检查连接后重试更新。');
   $('#updateProgressState').textContent='正在提交设备更新任务…';appendUpdateProgressMessage('当前数据已保存，正在提交设备更新任务…');
   const accepted=await requestSystemUpdate();updateTargetVersion=accepted?.version||info.latestVersion;updateLogRelevant=true;updateActionRunning=false;updateReloadScheduled=false;
   try{sessionStorage.setItem('qidian.pendingDeviceUpdate',updateTargetVersion)}catch{}
   $('#versionState').hidden=true;
   setVersionState(`已提交 v${updateTargetVersion} 更新；安装与服务重启完成后，将倒计时 5 秒自动刷新。`);await refreshUpdateStatus();
  }catch(error){updateLogRelevant=false;finishUpdateCheck(error.message||'无法检查或提交更新，请稍后重试。',{mode:'error',kind:'error',log:`操作失败：${error.message||'未知错误'}`})}
  finally{updateActionRunning=false;if(!updateTargetVersion&&!updateReloadScheduled)setVersionAction(versionInfo)}
 }
document.addEventListener('click',async event=>{
 if(event.target.closest('#versionButton')){await openVersionInfo();return}
  if(event.target.closest('#checkAndUpdateVersion')){await checkAndUpdateVersion();return}
});
async function optimizeAvatar(file){if(!file?.type.startsWith('image/'))throw Error('请选择 PNG、JPEG 或 WebP 图片');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('头像只支持 PNG、JPEG 或 WebP 图片');const bitmap=await createImageBitmap(file);try{const ratio=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d',{alpha:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);let result=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!result)throw Error('图片处理失败，请换一张图片');if(result.size>512*1024)result=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.68));if(!result||result.size>512*1024)throw Error('头像压缩后仍超过 512 KB');return new File([result],'qidian-avatar.webp',{type:'image/webp'})}finally{bitmap.close?.()}}
async function uploadAvatar(file){if(!file)return;const button=$('#chooseAvatar'),message=$('#profileSettingsMessage');button.disabled=true;message.textContent='正在处理并上传头像…';message.className='account-settings-message';try{const optimized=await optimizeAvatar(file);await saveAccountAvatar(optimized);await refreshAccountProfile();message.textContent='头像已保存到 Docker 服务端';message.classList.add('success')}catch(error){message.textContent=error.message||'头像上传失败';message.classList.add('error')}finally{button.disabled=initial.local}}
async function clearAvatar(){const message=$('#profileSettingsMessage');$('#removeAvatar').disabled=true;try{await removeAccountAvatar();await refreshAccountProfile();message.textContent='头像已移除';message.className='account-settings-message success'}catch(error){message.textContent=error.message;message.className='account-settings-message error'}finally{$('#removeAvatar').disabled=!accountProfile?.avatarMime}}
async function signOut(){if(edit){clearTimeout(autoTimer);autoTimer=null;saveDraft(true)}if(!await flush()){toast('修改暂未写入；请到设置中重试保存后再退出');return}try{await logoutAccount();location.reload()}catch(error){toast(error.message)}}
$('#accountMenuUsername').textContent=initial.username||'本地预览';$('#accountLogout').hidden=initial.local;
$('#passwordChangeForm').addEventListener('submit',async event=>{event.preventDefault();const current=$('#currentPassword').value,next=$('#newPassword').value,confirmNext=$('#confirmNewPassword').value,message=$('#passwordChangeMessage'),button=$('#changePasswordButton');message.textContent='';message.className='account-settings-message';if(next!==confirmNext){message.textContent='两次输入的新密码不一致';message.classList.add('error');return}button.disabled=true;message.textContent='正在安全更新密码…';try{await changeAccountPassword(current,next);$('#passwordChangeForm').reset();message.textContent='密码已更新，其他设备的登录已退出';message.classList.add('success')}catch(error){message.textContent=error.message||'密码更新失败';message.classList.add('error')}finally{button.disabled=initial.local}});
if(!initial.local)void refreshAccountProfile().catch(()=>{});
// Delegated interaction
$('#slashMenu').addEventListener('mousedown',e=>e.preventDefault());
let itemMenuPositionFrame=0;
function positionOpenItemMenus(){
 itemMenuPositionFrame=0;const viewportHeight=window.innerHeight||document.documentElement.clientHeight,compact=window.matchMedia?.('(max-width: 720px)').matches??window.innerWidth<=720;
 document.querySelectorAll('.item-menu[open]').forEach(menu=>{const panel=menu.querySelector(':scope > .item-menu-panel');if(!panel)return;menu.classList.remove('opens-left');const rect=menu.getBoundingClientRect(),spaceBelow=Math.max(0,viewportHeight-rect.bottom-(compact?84:8)),spaceAbove=Math.max(0,rect.top-8),heightLimit=viewportHeight*(compact?.55:.65),naturalHeight=Math.min(panel.scrollHeight,heightLimit),opensUp=spaceBelow<naturalHeight+8&&spaceAbove>spaceBelow;menu.classList.toggle('opens-up',opensUp);panel.style.maxHeight=`${Math.max(0,Math.min(heightLimit,(opensUp?spaceAbove:spaceBelow)-8))}px`;menu.classList.toggle('opens-left',panel.getBoundingClientRect().left<8)})
}
function scheduleItemMenuPosition(){if(itemMenuPositionFrame||!window.requestAnimationFrame)return;itemMenuPositionFrame=window.requestAnimationFrame(positionOpenItemMenus)}
document.addEventListener('click',event=>{if(event.target.closest('.item-menu > summary'))scheduleItemMenuPosition()},true);
document.addEventListener('toggle',event=>{if(!event.target.matches?.('.item-menu'))return;if(!event.target.open){event.target.classList.remove('opens-up');const panel=event.target.querySelector(':scope > .item-menu-panel');if(panel)panel.style.maxHeight=''}else scheduleItemMenuPosition()},true);
document.addEventListener('scroll',scheduleItemMenuPosition,true);window.addEventListener('resize',scheduleItemMenuPosition);
document.addEventListener('click',event=>{document.querySelectorAll('.item-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false});if(event.target.id==='createOverlay')event.target.classList.remove('open')});
document.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const overlay=[...document.querySelectorAll('.overlay.open')].at(-1);if(!overlay)return;const fields=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(node=>!node.hidden);if(!fields.length)return;const first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
document.addEventListener('beforeunload',e=>{const editorChanged=edit&&editorHasChanges();if(edit)saveDraft(true);if(editorChanged||hasUnsaved()){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&edit)saveDraft(true)});
document.addEventListener('click',async e=>{const editExit=e.target.closest('#backDoc,#brandHome,[data-dashboard],#openBookmarks,#mobileBookmarks,[data-open-bookmarks],[data-dashboard-add-bookmark],[data-nav],[data-type-nav],[data-open],[data-search-id],[data-new],[data-create-kind],#quickImage,#mobileCats,#mobileHome');if(edit&&editExit&&editorHasChanges()&&!confirm('当前笔记有修改，是否保存后离开？点击取消将继续编辑。')){e.preventDefault();return}if(!e.target.closest('#themeMenuRoot'))closeThemeMenu();const themeChoice=e.target.closest('[data-theme-choice]');if(themeChoice){applyTheme(themeChoice.dataset.themeChoice,{save:true});closeThemeMenu();return}if(e.target.closest('#themeBtn')){toggleThemeMenu();return}if(e.target.closest('#openBookmarks')||e.target.closest('#mobileBookmarks')){openBookmarks();return}if(e.target.closest('[data-open-bookmarks]')){openBookmarks();return}if(e.target.closest('[data-dashboard-add-bookmark]')){addBookmark();return}if(e.target.closest('[data-dashboard]')||e.target.closest('#brandHome')){openDashboard();return}if(!e.target.closest('#accountMenuRoot'))closeAccountMenu();if(e.target.closest('#accountButton')){closeThemeMenu();const menu=$('#accountMenu'),open=menu.hidden;menu.hidden=!open;$('#accountButton').setAttribute('aria-expanded',String(open));return}if(e.target.closest('#openProfileSettings')){openProfileSettings();return}if(e.target.closest('#openAppSettings')){openAppSettings();return}if(e.target.closest('#accountLogout')){closeAccountMenu();signOut();return}if(e.target.closest('#chooseAvatar')){$('#accountAvatarFile').click();return}if(e.target.closest('#removeAvatar')){clearAvatar();return}const slash=e.target.closest('[data-slash]');if(slash){const k=slash.dataset.slash;closeSlashMenu();if(k==='h2'||k==='h3')doFormat('formatBlock',k);else if(k==='ul')doFormat('insertUnorderedList');else doInsert(k);return}if(!e.target.closest('#slashMenu'))closeSlashMenu();if(e.target.closest('#toggleNoteTypes')){const next=!noteTypesExpanded();data.noteTypesExpanded=next;const list=$('#sideTypes'),toggle=$('#toggleNoteTypes');if(list)list.hidden=!next;toggle?.setAttribute('aria-expanded',String(next));toggle?.setAttribute('aria-label',next?'折叠笔记类型':'展开笔记类型');toggle?.setAttribute('title',next?'折叠笔记类型':'展开笔记类型');persist();return}const typeEdit=e.target.closest('[data-type-edit]');if(typeEdit){openTypeDialog('edit',typeEdit.dataset.typeEdit);return}const typeDelete=e.target.closest('[data-type-delete]');if(typeDelete){if(data.noteTypes.length<2&&typeDelete.dataset.typeDelete==='note')return toast('至少保留“普通笔记”作为默认类型');openTypeDialog('delete',typeDelete.dataset.typeDelete);return}const typeNav=e.target.closest('[data-type-nav]');if(typeNav){if(edit){saveDraft(true);clearTimeout(autoTimer);edit=false;editingDraft=null}active='all';typeFilter=typeNav.dataset.typeNav;page='home';noteId=null;closeMenu();render();window.scrollTo({top:0});return}const nav=e.target.closest('[data-nav]');if(nav){openHome(nav.dataset.nav);return}const create=e.target.closest('[data-create-kind]');if(create){$('#createOverlay').classList.remove('open');if(create.dataset.createKind==='bookmark')addBookmark();else if(create.dataset.createKind==='capture')openCapture();else createNew();return}const noteEdit=e.target.closest('[data-note-edit]');if(noteEdit){openNote(noteEdit.dataset.noteEdit,true);return}const noteDelete=e.target.closest('[data-note-delete]');if(noteDelete){if(confirm('将这篇笔记移入回收站，可在 30 天内还原。是否继续？')){if(await moveNoteToTrash(noteDelete.dataset.noteDelete))render()}return}if(e.target.closest('[data-search-bookmark]')){closeSearch();return}const op=e.target.closest('[data-open]');if(op){openNote(op.dataset.open);return}const nw=e.target.closest('[data-new]');if(nw){createNew(nw.dataset.new);return}const tp=e.target.closest('[data-type]');if(tp){typeFilter=tp.dataset.type;render();return}const cl=e.target.closest('[data-close]');if(cl){$('#'+cl.dataset.close)?.classList.remove('open');return}const tableAction=e.target.closest('[data-table-action]');if(tableAction){const action=tableAction.dataset.tableAction;richEditor?.chain().focus()[action]().run();updateDraftFromDOM();scheduleSave();return}const fmt=e.target.closest('[data-fmt]');if(fmt){doFormat(fmt.dataset.fmt);return}const ins=e.target.closest('[data-insert]');if(ins){doInsert(ins.dataset.insert);return}const sr=e.target.closest('[data-search-id]');if(sr){closeSearch();openNote(sr.dataset.searchId);return}
if(e.target.closest('#newSide'))openCreateMenu();else if(e.target.closest('#quickCapture'))openCapture();else if(e.target.closest('#quickImage')){createNew('note');setTimeout(()=>$('#imageFile').click(),250)}else if(e.target.closest('#backDoc')){if(edit){saveDraft(true);edit=false;editingDraft=null;previewing=true;render()}else if(noteReturn){active=noteReturn.active;typeFilter=noteReturn.typeFilter;noteQuery=noteReturn.query;page='home';render();window.scrollTo({top:noteReturn.scroll})}else openHome(active)}else if(e.target.closest('#editDoc')){edit=true;previewing=false;editingDraft=null;render()}else if(e.target.closest('#showDraftView')){previewing=true;render()}else if(e.target.closest('#publishDoc')){void publishCurrentNote()}else if(e.target.closest('#pinDoc')){let n=data.notes.find(n=>n.id===noteId),previous=n.pinned;n.pinned=!n.pinned;try{await commitPersist();render();toast(n.pinned?'已收藏':'已取消收藏')}catch(error){n.pinned=previous;toast(error.message||'收藏状态尚未保存')}}else if(e.target.closest('#duplicateDoc')){let source=data.notes.find(n=>n.id===noteId),copy=JSON.parse(JSON.stringify(previewing||isDraft(source)?source:publishedView(source)));copy.id='n'+Date.now();copy.title+='（副本）';copy.updated=Date.now();copy.created=Date.now();copy.pinned=false;copy.status='draft';copy.publishedAt=null;delete copy.publishedSnapshot;delete copy._hasUnpublished;data.notes.unshift(copy);persist();openNote(copy.id,true)}else if(e.target.closest('#deleteDoc')){if(confirm('将这篇笔记移入回收站，可在 30 天内还原。是否继续？')){if(await moveNoteToTrash(noteId))openHome()}}else if(e.target.closest('#saveEditor'))void publishCurrentNote();else if(e.target.closest('#addAttachment'))$('#attachmentFile').click();else if(e.target.closest('#exportHtml')){if(edit)saveDraft(true);const stored=data.notes.find(n=>n.id===noteId),n=edit||previewing||isDraft(stored)?stored:publishedView(stored);exportHTML(n,cleanHTML(n.body,true)).catch(error=>toast('导出失败：'+error.message))}else if(e.target.closest('#addImgButton'))$('#imageFile').click();else if(e.target.closest('#captureSave'))await saveCapture();else if(e.target.closest('#addCategory'))openCategoryDialog();else if(e.target.closest('#categoryDialogConfirm'))await saveCategory();else if(e.target.closest('#addNoteType'))openTypeDialog('create');else if(e.target.closest('#typeDialogConfirm'))await saveTypeDialog();else if(e.target.closest('#exportBtn')){closeAccountSettings();closeMenu();exportJSON()}else if(e.target.closest('#importBtn')){closeAccountSettings();closeMenu();$('#importFile').click()}
else if(e.target.closest('#reloadCloud')){if(confirm('先导出未完成的修改，再载入当前 Docker 服务端版本。此操作会替换当前草稿。是否继续？')){closeAccountSettings();reloadCloud().then(restored=>{data={...restored,trash:restored.trash||[]};applyTheme(data.theme);bookmarksView.syncPreferences();edit=false;editingDraft=null;noteId=null;render();toast('已载入Docker 服务端版本')}).catch(error=>toast(error.message))}}else if(e.target.closest('#retrySync')){closeAccountSettings();retrySync()}else if(e.target.closest('[data-backup-download]')){void downloadBackupSnapshot(e.target.closest('[data-backup-download]').dataset.backupDownload)}else if(e.target.closest('[data-backup-restore]')){void restoreBackupSnapshot(e.target.closest('[data-backup-restore]').dataset.backupRestore)}else if(e.target.closest('#backupHistory')){void openBackupHistory()}else if(e.target.closest('#searchTop')||e.target.closest('#mobileSearch'))openSearch();
else if(e.target.closest('#mobileCats'))openHome();else if(e.target.closest('#menuBtn'))toggleMobileMenu();else if(e.target.closest('#mobileShade'))closeMenu(true);else if(e.target.closest('#mobileHome'))openDashboard();else if(e.target.closest('#mobileNew'))openCreateMenu();else if(!e.target.closest('#switcher')&&$('#switcher').classList.contains('open'))closeSearch();
});
document.addEventListener('click',event=>{if(!event.target.closest('[data-trash-nav]'))return;if(edit&&editorHasChanges()&&!confirm('当前笔记有修改，是否保存后离开？点击取消将继续编辑。')){event.preventDefault();return}openTrash()});
$('#blockSelect')?.addEventListener('change',()=>{});$('#typeDialogBody').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='typeNameInput'){e.preventDefault();saveTypeDialog()}});$('#categoryNameInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveCategory()}else if(e.key==='Escape')$('#categoryOverlay').classList.remove('open')});
document.addEventListener('change',e=>{if(e.target.id==='accountAvatarFile'){const file=e.target.files?.[0];e.target.value='';uploadAvatar(file);return}if(e.target.id==='attachmentFile'){const files=Array.from(e.target.files||[]);(async()=>{for(const file of files){try{const a=await upload(file);insertHTML(`<p>📎 <a href="${a.url}?download=1">${esc(a.name)}</a> (${(a.size/1024).toFixed(1)} KB)</p>`)}catch(error){toast(error.message)}}})();e.target.value=''}if(e.target.id==='blockSelect')doFormat('formatBlock',e.target.value);if(e.target.id==='fontColor')doFormat('foreColor',e.target.value);if(e.target.id==='importFile')importJSON(e.target.files[0]);if(e.target.id==='imageFile'){let files=Array.from(e.target.files||[]);(async()=>{for(let f of files)await storeImage(f,'edit')})();e.target.value=''}});
$('#capturePad').addEventListener('paste',pasteRich);$('#globalSearch').addEventListener('input',e=>renderSearch(e.target.value));
$('#captureOverlay').addEventListener('click',e=>{if(e.target.id==='captureOverlay')closeCapture()});$('#typeOverlay').addEventListener('click',e=>{if(e.target.id==='typeOverlay')e.target.classList.remove('open')});$('#categoryOverlay').addEventListener('click',e=>{if(e.target.id==='categoryOverlay')e.target.classList.remove('open')});
$('#profileSettingsOverlay').addEventListener('click',e=>{if(e.target.id==='profileSettingsOverlay')e.target.classList.remove('open')});$('#appSettingsOverlay').addEventListener('click',e=>{if(e.target.id==='appSettingsOverlay')e.target.classList.remove('open')});
$('#backupHistoryOverlay').addEventListener('click',e=>{if(e.target.id==='backupHistoryOverlay')e.target.classList.remove('open')});
$('#syncConflictOverlay').addEventListener('click',e=>{if(e.target.id==='syncConflictOverlay')e.target.classList.remove('open')});
document.addEventListener('keydown',e=>{let cmd=e.metaKey||e.ctrlKey;if(cmd&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}if(cmd&&e.key.toLowerCase()==='s'&&edit){e.preventDefault();saveDraft();editorBaseline=editorContentSnapshot(editingDraft);}if(e.key==='Escape'){document.querySelectorAll('.item-menu[open]').forEach(menu=>{menu.open=false});closeSearch();closeCapture();$('#createOverlay')?.classList.remove('open');$('#typeOverlay').classList.remove('open');closeAccountSettings();$('#backupHistoryOverlay').classList.remove('open');$('#syncConflictOverlay').classList.remove('open');closeThemeMenu();closeAccountMenu();closeMenu(true);closeSlashMenu()}if((e.key==='Enter'||e.key===' ')&&e.target.closest('.note-card-open')){e.preventDefault();openNote(e.target.closest('.note-card-open').dataset.open)}});
document.addEventListener('click',async e=>{if(!e.target.closest('#restoreLocalDraft'))return;closeAccountSettings();try{const restored=await restoreIgnoredDraft();data={...restored.data,trash:restored.data.trash||[]};applyTheme(data.theme);bookmarksView.syncPreferences();initial.ignoredDraft=false;$('#restoreLocalDraft').hidden=true;edit=false;editingDraft=null;noteId=null;render();if(restored.conflict)toast('草稿与 Docker 服务端版本冲突；请导出后再载入服务端版本');else{queueSave(data);toast('本地草稿已恢复，正在同步')}}catch(error){toast(error.message)}});
applyTheme(data.theme);render();renderVersionBadge({currentVersion:APP_VERSION,updateAvailable:false});if(!initial.local)void checkSystemVersion();if(initial.restoreDraft&&!initial.restoreConflict)queueSave(data);
})();
}
