
import DOMPurify from 'dompurify';
import appPackage from '../package.json';
import { appSettingsStore, backupHistoryStore, bookmarkDataStore, captureDialogStore, categoryDialogStore, commandPaletteStore, createMenuStore, dashboardDataStore, editorDataStore, editorPageActionsStore, globalSearchDataStore, navigationActionsStore, noteListDataStore, noteTypeDialogStore, notificationDataStore, profileSettingsStore, readerActionsStore, readerDataStore, sidebarDataStore, syncConflictStore, trashDataStore, vaultDataStore, workspaceAppMounted, workspaceNavigationStore, workspaceShellActionsStore, workspaceShellStore } from './workspace-app.ts';
import { openActionDialog } from './features/dialogs/action-dialog-service.ts';
import { createBookmarkView } from './bookmarks.js';
import { bookmarksHTML, mergeBookmarks, parseBookmarks } from './bookmark-data.js';
import { createRecycleBinView } from './recycle-bin.js';
import { createTrashEntry } from './trash-data.js';
import { createTrashWorkflows } from './features/trash/workflows.ts';
import { createVaultMutation } from './features/vault/mutation.ts';
import { createVaultPersistence } from './features/vault/persistence.ts';
import { createSystemUpdateController } from './features/system-updates/controller.ts';
import { createSyncConflictController } from './features/sync/sync-conflict-controller.ts';
import { renderReleaseNotes } from './release-notes.js';
import { createEditorCommandController } from './features/editor/command-controller.ts';
import { createEditorPageActions } from './features/editor/page-actions.ts';
import { renderLegacyEditorMarkup } from './features/editor/legacy-editor-view.js';
import { createBookmarkMutationActions } from './features/bookmarks/mutation-actions.ts';
import { createEditorToolbarState } from './features/editor/toolbar-state.ts';
import { createLegacyEditorToolbarView } from './features/editor/legacy-toolbar-view.ts';
import { createEditorInsertController } from './features/editor/insert-controller.ts';
import { createEditorRuntimeController } from './features/editor/runtime-controller.ts';
import { createEditorOutlineController } from './features/editor/outline-controller.ts';
import { createLegacyEditorOutlineView } from './features/editor/legacy-editor-outline-view.ts';
import { createNotePublishFlow } from './features/editor/note-publish-flow.ts';
import { createContentInsertionController } from './features/editor/content-insertion.ts';
import { createAttachmentUploadFlow } from './features/editor/attachment-upload.ts';
import { createAppSettingsActions } from './features/settings/app-settings-actions.ts';
import { createBackupWorkflows } from './features/settings/backup-workflows.ts';
import { createWorkspaceNavigationController } from './features/navigation/workspace-navigation-controller.ts';
import { createMobileMenuFocusController } from './features/navigation/mobile-menu-focus-controller.ts';
import { createWorkspaceViewDispatcher } from './features/navigation/workspace-view-dispatcher.ts';
import { createLegacyWorkspaceRenderer } from './features/navigation/legacy-workspace-renderer.js';
import { createWorkspaceNavigationEvents } from './features/navigation/workspace-navigation-events.ts';
import { createWorkspaceShellEvents } from './features/navigation/workspace-shell-events.ts';
import { createWorkspaceContentEvents } from './features/navigation/workspace-content-events.ts';
import { createEditorToolbarEvents } from './features/editor/toolbar-events.ts';
import { createEditorDraftController } from './features/editor/draft-controller.ts';
import { createEditorAutosaveController } from './features/editor/autosave-controller.ts';
import { createEditorFormAdapter } from './features/editor/form-adapter.ts';
import { connectSessionRecoveryFlow } from './features/auth/session-recovery-flow.ts';
import { createNoteDeleteWorkflow } from './features/notes/delete-workflow.ts';
import { createEditorDeleteWorkflow } from './features/notes/editor-delete-workflow.ts';
import { createDashboardActions } from './features/dashboard/actions.ts';
import { createNoteController as createNewNoteController } from './features/notes/create-note-controller.ts';
import { isDraftNote as isDraft, needsPublish, publishedNoteView as publishedView, selectNotes } from './features/notes/selectors.ts';
import { createNoteTypeDialogFlow } from './features/notes/type-dialog-flow.ts';
import { createNoteTypeDialogOpenFlow } from './features/notes/type-dialog-open-flow.ts';
import { createLegacyNoteTypeDialog } from './features/notes/legacy-type-dialog.ts';
import { createNoteTypeDialogPresenter } from './features/notes/type-dialog-presenter.ts';
import { mountCodeCopyButtons } from './features/reader/code-copy.ts';
import { mountHeadingObserver } from './features/reader/heading-observer.ts';
import { createCategoryDialogFlow } from './features/categories/category-dialog-flow.ts';
import { createLegacyCategoryDialog } from './features/categories/legacy-category-dialog.ts';
import { createCaptureFlow } from './features/capture/capture-flow.ts';
import { createCaptureDOMAdapter } from './features/capture/capture-dom-adapter.ts';
import { createLegacyCaptureDialog } from './features/capture/legacy-capture-dialog.ts';
import { createHtmlContentTools } from './features/content/html-content.ts';
import { createPastedTitleAutofill } from './features/content/pasted-title-autofill.ts';
import { createThemeController } from './features/appearance/theme-controller.ts';
import { createRemoteEditorRefresh } from './features/editor/remote-refresh.ts';
import { createReaderSnapshot } from './features/reader/snapshot.ts';
import { createReaderActions } from './features/reader/actions.ts';
import { createDraftContentTools } from './features/notes/draft-content.ts';
import { mountWorkspaceLifecycle } from './features/lifecycle/workspace-lifecycle.ts';
import { mountWorkspaceInteractionRuntime } from './features/lifecycle/workspace-interaction-runtime.ts';
import { createCurrentVaultSnapshot } from './features/sync/current-vault-snapshot.ts';
import { createRemoteVaultUpdateController } from './features/sync/remote-vault-update-controller.ts';
import { reauthenticateAccount, logoutAccount, getAccountProfile, getAccountAvatar, saveAccountAvatar, removeAccountAvatar, changeAccountPassword, getSystemVersion, requestSystemUpdate, getSystemUpdateStatus, queueSave, commitSave, flush, onStatus, onAuthenticationRequired, onRemoteUpdate, refreshCloud, getSyncConflict, exportSyncConflict, setOwner, upload, pruneAssets, exportBackup, exportHTML, readBackup, listBackups, createBackupSnapshot, getBackup, download, hasUnsaved, reloadCloud, restoreIgnoredDraft, retrySync } from './cloud.js';
import { DEFAULT_NOTE_TYPES, validateVault } from '../shared/vault-validation.js';
import { classifyClipboard, looksLikeMarkdown, plainTextToDocument, sanitizeMarkdownDocument } from './paste.js';
const loadMarkdownTools = () => import('./markdown.js');
const APP_VERSION = appPackage.version;
export function launchWorkspace(initial, showAuthentication) {
 const authGate = document.querySelector('#loginGate'); if (authGate) { authGate.hidden = true; authGate.classList.remove('reauth'); } document.body.classList.remove('booting'); document.querySelector('.app').hidden = false;
 return (()=>{'use strict';
const navigationStore=workspaceNavigationStore;
const icons=name=>`<span class="ico"><svg aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
const $=sel=>document.querySelector(sel);const main=$('#main');const displayTypeName=type=>type.id==='clip'&&type.name==='网页收藏'?'网页摘录':type.name;const typeLabel=id=>{const type=getVault().noteTypes.find(x=>x.id===id);return type?displayTypeName(type):'其他类型'};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tinyText=s=>{let box=document.createElement('div');box.innerHTML=s;box.querySelectorAll('br').forEach(node=>node.replaceWith(' '));box.querySelectorAll('p,div,li,blockquote,pre,h1,h2,h3,h4,h5,h6,tr').forEach(node=>node.append(' '));return (box.textContent||'').replace(/\s+/g,' ').trim()};
const {safeUrl,cleanHTML,plainTextToStructuredHTML,textWithBlockBreaks,readableNoteBody,extractPastedTitle}=createHtmlContentTools({document,sanitize:html=>DOMPurify.sanitize(html),parseHTML:html=>new DOMParser().parseFromString(html,'text/html'),escapeHtml:esc,looksLikeMarkdown});
const {editorContentSnapshot,hasDraftContent}=createDraftContentTools({cleanHTML,parseHTML:html=>new DOMParser().parseFromString(html,'text/html')});
vaultDataStore.replace({ ...initial.data, noteTypes: initial.data.noteTypes || structuredClone(DEFAULT_NOTE_TYPES), trash: initial.data.trash || [] }); setOwner(initial.owner);
function getVault(){
 const current=vaultDataStore.value;
 if(!current)throw new Error('知识库尚未加载');
 return current;
}
function replaceVault(value){
 const normalized={...value,noteTypes:Array.isArray(value.noteTypes)?value.noteTypes:structuredClone(DEFAULT_NOTE_TYPES),trash:Array.isArray(value.trash)?value.trash:[]};
 return vaultDataStore.replace(normalized);
}
function mutateVault(operation){return vaultDataStore.mutate(operation)}
globalSearchDataStore.configure({bodyText:body=>tinyText(body),typeLabel,formatDate:nowString,isSafeUrl:safeUrl});
let lastRenderedPage='',editorBaseline=null,unsavedNewNoteId=null,editorFactory=window.__qidianTestEditorFactory||null,editorLoading=null,richEditor=null,editorCommands=null,richEditorDraftId=null;
let editorAutosave=null;
let legacyWorkspaceRenderer=null;
const confirmAction=(message,options={})=>openActionDialog({message,...options}).then(Boolean);
const promptAction=(message,defaultValue='',options={})=>openActionDialog({mode:'prompt',message,inputValue:defaultValue,...options});
profileSettingsStore.configure({
 local:!!initial.local,
 username:initial.username||'本地开发预览',
 getAccountProfile,
 getAccountAvatar,
 saveAccountAvatar,
 removeAccountAvatar,
 changeAccountPassword,
 onProfileChange:(profile,avatarUrl)=>{
  workspaceShellStore.setIdentity(profile.username,!!initial.local);
  workspaceShellStore.setAvatar(avatarUrl);
 }
});
const profileSettings=profileSettingsStore;
const appSettingsActions=createAppSettingsActions({
 closeSettings:closeAccountSettings,
 closeMenu,
 retrySync,
 confirmReload:()=>confirmAction('先导出未完成的修改，再载入当前 Docker 服务端版本。此操作会替换当前草稿。是否继续？',{title:'重新载入数据',confirmText:'重新载入',danger:true}),
 saveActiveEditor:()=>{if(navigationStore.editing){editorAutosave.clear();saveDraft(true)}},
 getCurrentData:()=>structuredClone(getVault()),
 exportBackup,
 reloadCloud,
 restoreIgnoredDraft,
 replaceWorkspace:restored=>{
  editorAutosave.clear();if(navigationStore.editing)destroyRichEditor();
  unsavedNewNoteId=null;
  replaceVault({...restored,trash:restored.trash||[]});applyTheme(getVault().theme);syncBookmarkPreferences();
  workspaceNavigation.resetHome();
 },
 markIgnoredDraftHandled:()=>{initial.ignoredDraft=false;refreshSettingsIndicators()},
 queueSave,
 openSyncConflict,
 openBackupHistory,
 exportJSON,
 openImportPicker:()=>$('#importFile').click(),
 notify:toast
});
appSettingsStore.bindActionHandler(appSettingsActions.dispatch);
const appSettings=appSettingsStore;
const notePublishFlow=createNotePublishFlow({
 getData:getVault,
 getNoteId:()=>navigationStore.noteId,
 getEditingDraft:()=>navigationStore.editingDraft,
 isEditing:()=>navigationStore.editing,
 prepareEditor:()=>{editorAutosave.clear();updateDraftFromDOM()},
 saveDraft:()=>saveDraft(true),
 isDraft:note=>isDraft(note),
 hasDraftContent:note=>hasDraftContent(note),
 needsPublish:note=>needsPublish(note),
 queueSave,
 flush,
 complete:candidate=>{replaceVault(candidate);navigationStore.editing=false;navigationStore.previewing=false;navigationStore.editingDraft=null;destroyRichEditor();render();window.scrollTo({top:0})},
 setBusy:busy=>{const button=$('#saveEditor')||$('#publishDoc');if(button)button.disabled=busy},
 notify:toast
});
const backupWorkflows=createBackupWorkflows({
 getData:()=>structuredClone(getVault()),
 saveActiveEditor:()=>{if(navigationStore.editing){editorAutosave.clear();return saveDraft(true)}},
 confirmAction,
 getBackup,
 exportBackup,
 createBackupSnapshot,
 readBackup,
 validateVault,
 cleanHTML,
 commitSave,
 replaceWorkspace:(restored,mode)=>{
  editorAutosave.clear();if(navigationStore.editing)destroyRichEditor();
  editorBaseline=null;unsavedNewNoteId=null;
  replaceVault(restored);applyTheme(getVault().theme);syncBookmarkPreferences();
  if(mode==='import')workspaceNavigation.resetHome();else workspaceNavigation.returnHomePreservingList();
  backupHistoryStore.close();
 },
 downloadJSON:(value,filename)=>download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename),
 pruneAssets,
 clearImportFile:()=>{const input=$('#importFile');if(input)input.value=''},
 notify:toast
});
backupHistoryStore.configure({
 listBackups,
 localPreview:initial.local,
 downloadSnapshot:revision=>backupWorkflows.downloadSnapshot(revision),
 restoreSnapshot:revision=>backupWorkflows.restoreSnapshot(revision)
});
const noteTypesExpanded=()=>getVault().noteTypesExpanded!==false;
const {persist,commitPersist}=createVaultPersistence({getVault,getUnsavedNewNoteId:()=>unsavedNewNoteId,isDraft,hasDraftContent,queueSave,commitSave});
const legacyNoteTypeDialog=workspaceAppMounted?null:createLegacyNoteTypeDialog({document,escapeHtml:esc});
const noteTypeDialogPresenter=createNoteTypeDialogPresenter({getVault,defaultNoteTypes:DEFAULT_NOTE_TYPES,displayTypeName,vueMounted:workspaceAppMounted,vueDialog:noteTypeDialogStore,legacyDialog:legacyNoteTypeDialog,notify:toast});
const noteTypeDialogOpenFlow=createNoteTypeDialogOpenFlow({closeMenu,isEditing:()=>navigationStore.editing,saveDraft:()=>saveDraft(true),clearAutosave:()=>editorAutosave.clear(),leaveEditor:()=>{navigationStore.editing=false;navigationStore.editingDraft=null},render,openDialog:(mode,id)=>noteTypeDialogPresenter.open(mode,id)});
const noteTypeDialogFlow=createNoteTypeDialogFlow({getVault,mutateVault,replaceVault,getTypeFilter:()=>navigationStore.typeFilter,setTypeFilter:filter=>{navigationStore.typeFilter=filter},commit:()=>commitPersist(),close:()=>{if(workspaceAppMounted)noteTypeDialogStore.close();legacyNoteTypeDialog?.close()},render,notify:toast});
if(workspaceAppMounted)noteTypeDialogStore.bindSave(input=>noteTypeDialogFlow.save(input));
function versionOf(n){return {title:n.title,type:n.type,category:n.category,tags:[...(n.tags||[])],body:n.body,source:n.source||'',updated:n.updated}}
 const editorFormAdapter=createEditorFormAdapter({
  getVueForm:()=>workspaceAppMounted?editorDataStore.form:null,
  getLegacyForm:()=>{
   const title=$('#editTitle');if(!title)return null;
   return {title:title.value,type:$('#editType').value,category:$('#editCategory').value,tags:$('#editTags').value,source:$('#editSource').value};
  },
  getBodyHTML:()=>richEditor?.getHTML()||$('#editorSurface').innerHTML,
  cleanHTML
 });
const editorDraftController=createEditorDraftController({
 getVault,
 getNoteId:()=>navigationStore.noteId,
 getEditingDraft:()=>navigationStore.editingDraft,
 setEditingDraft:note=>{navigationStore.editingDraft=note},
 isEditing:()=>navigationStore.editing,
 isDraft:note=>isDraft(note),
 hasDraftContent:note=>hasDraftContent(note),
 getBaseline:()=>editorBaseline,
 setBaseline:value=>{editorBaseline=value},
 getTransientNewNoteId:()=>unsavedNewNoteId,
 clearTransientNewNote:()=>{unsavedNewNoteId=null},
 createPublishedSnapshot:versionOf,
 snapshot:editorContentSnapshot,
  readEditorFields:editorFormAdapter.readEditorFields,
 resetPendingPublish:()=>notePublishFlow.resetPending(),
 mutateVault,
 persist
});
editorAutosave=createEditorAutosaveController({
 isEditing:()=>navigationStore.editing,
 hasEditingDraft:()=>!!navigationStore.editingDraft,
 saveDraft:()=>editorDraftController.saveDraft(true),
 setTimer:(callback,delay)=>window.setTimeout(callback,delay),
 clearTimer:handle=>window.clearTimeout(handle)
});
const bookmarksView=workspaceAppMounted?null:createBookmarkView({main,getData:getVault,mutateData:operation=>mutateVault(()=>operation(getVault())),save:async()=>{await commitPersist();side()},download,notify:toast,viewState:bookmarkDataStore.viewState,onChange:()=>{if(navigationStore.page==='bookmarks')bookmarksView?.renderLegacy()}});
const isMobileViewport=()=>!!window.matchMedia?.('(max-width: 720px)').matches;
function syncBookmarkPreferences(){if(workspaceAppMounted)bookmarkDataStore.syncPreferences(isMobileViewport());else bookmarksView?.syncPreferences()}
function openBookmarkFolder(folderId){if(workspaceAppMounted)bookmarkDataStore.openFolder(folderId,isMobileViewport());else bookmarksView?.openFolder(folderId)}
function resumeBookmarks(){if(workspaceAppMounted)window.scrollTo({top:bookmarkDataStore.resume(isMobileViewport())});else bookmarksView?.resume()}
function leaveBookmarks(){if(workspaceAppMounted)bookmarkDataStore.leave(window.scrollY);else bookmarksView?.leave()}
if(workspaceAppMounted)syncBookmarkPreferences();
const recycleBinView=workspaceAppMounted?null:createRecycleBinView({main,getData:getVault,mutateData:operation=>mutateVault(()=>operation(getVault())),save:async()=>{await commitPersist();side()},notify:toast,onChange:()=>{if(navigationStore.page==='trash'&&!trashDataStore.active)recycleBinView.render()}});
const vaultMutation=createVaultMutation({getVault,replaceVault,save:()=>commitPersist()});
const bookmarkMutationActions=createBookmarkMutationActions({
 getBookmarks:()=>getVault().bookmarks||[],
 getVault,
 getEditor:()=>bookmarkDataStore.editor,
 getDeleteDialog:()=>bookmarkDataStore.deleteDialog,
 getBulkDialog:()=>bookmarkDataStore.bulkDialog,
 getImportDialog:()=>bookmarkDataStore.importDialog,
 getSelectedVisibleIds:()=>bookmarkDataStore.snapshot.sections.flatMap(section=>section.links.filter(link=>link.selected).map(link=>link.id)),
 viewState:bookmarkDataStore.viewState,
 openEditor:draft=>bookmarkDataStore.openEditor(draft),
 closeEditor:()=>bookmarkDataStore.closeEditor(),
 openDeleteDialog:request=>bookmarkDataStore.openDeleteDialog(request),
 closeDeleteDialog:()=>bookmarkDataStore.closeDeleteDialog(),
 resetAfterClear:()=>bookmarkDataStore.resetAfterClear(),
 reconcileAfterDelete:(ids,parentId)=>bookmarkDataStore.reconcileAfterDelete(ids,parentId),
 clearSelection:ids=>bookmarkDataStore.clearSelection(ids),
 openBulkDialog:(mode,ids)=>bookmarkDataStore.openBulkDialog(mode,ids),
 closeBulkDialog:()=>bookmarkDataStore.closeBulkDialog(),
 openImportDialog:draft=>bookmarkDataStore.openImportDialog(draft),
 closeImportDialog:()=>bookmarkDataStore.closeImportDialog(),
 download,
 parseImport:html=>parseBookmarks(html,window.DOMParser),
 mergeImport:mergeBookmarks,
 serializeExport:bookmarksHTML,
 setEditorError:message=>{if(bookmarkDataStore.editor)bookmarkDataStore.editor.error=message},
 mutation:vaultMutation,
 notify:toast
});
const categoryDialogFlow=createCategoryDialogFlow({getVault,mutateVault:vaultMutation});
const legacyCategoryDialog=workspaceAppMounted?null:createLegacyCategoryDialog({document,scheduleFocus:callback=>setTimeout(callback,50)});
const captureFlow=createCaptureFlow({getVault,mutateVault:vaultMutation,cleanBody:html=>cleanHTML(html,true),bodyText:html=>tinyText(html)});
const legacyCaptureDialog=workspaceAppMounted?null:createLegacyCaptureDialog({document,escapeHtml:esc});
if(workspaceAppMounted)captureDialogStore.bindSave(async input=>{const note=await captureFlow.save(input);openNote(note.id)});
if(workspaceAppMounted)categoryDialogStore.bindSave(async name=>{const saved=await categoryDialogFlow.save(name);openHome(saved)});
const trashWorkflows=workspaceAppMounted?createTrashWorkflows({
 getVault,
 mutateVault:vaultMutation,
 confirmClear:count=>confirmAction(`将永久删除回收站中的 ${count} 项内容，无法再还原。是否继续？`,{title:'永久清空回收站',confirmText:'永久清空回收站',danger:true}),
 notify:toast
}):null;
const noteDeleteWorkflow=createNoteDeleteWorkflow({getVault,mutateVault:vaultMutation,notify:toast});
const editorDeleteWorkflow=createEditorDeleteWorkflow({
 getVault,
 getNoteId:()=>navigationStore.noteId,
 getEditingDraft:()=>navigationStore.editingDraft,
 prepareEditingDraft:()=>updateDraftFromDOM(),
 isTransientNewNote:id=>unsavedNewNoteId===id,
 isDraft:note=>isDraft(note),
 hasDraftContent:note=>hasDraftContent(note),
 confirm:(message,options)=>confirmAction(message,options),
 clearAutosave:()=>editorAutosave.clear(),
 discardDetachedNote:id=>mutateVault(vault=>{vault.notes=vault.notes.filter(note=>note.id!==id)}),
 storeEditingDraft:note=>{
  const index=getVault().notes.findIndex(item=>item.id===note.id);
  const saved=structuredClone(note);
  mutateVault(vault=>{if(index>=0)vault.notes[index]=saved;else vault.notes.unshift(saved)});
 },
 moveToTrash:id=>noteDeleteWorkflow.moveToTrash(id),
 clearTransientState:()=>{unsavedNewNoteId=null},
 closeEditor:()=>{navigationStore.editing=false;destroyRichEditor();navigationStore.editingDraft=null;navigationStore.noteId=null},
 openHome:()=>openHome(navigationStore.active)
});
function workspaceNavigationState(){return navigationStore.getWorkspaceState()}
function applyWorkspaceNavigationState(state){navigationStore.setWorkspaceState(state)}
const mobileMenuFocusController=createMobileMenuFocusController({document,isOpen:()=>workspaceShellStore.mobileMenuOpen,close:()=>workspaceShellStore.closeMobileMenu(),getSidebar:()=>$('#sidebar'),getMenuButton:()=>$('#menuBtn'),getMain:()=>main,scheduleFocus:callback=>requestAnimationFrame(callback)});
const workspaceNavigation=createWorkspaceNavigationController({getState:workspaceNavigationState,setState:applyWorkspaceNavigationState,findNote:id=>getVault().notes.find(n=>n.id===id),isDraft:note=>isDraft(note),saveDraft:()=>saveDraft(true),clearAutoSave:()=>editorAutosave.clear(),closeMenu,render,getScrollY:()=>window.scrollY,scrollTo:position=>window.scrollTo({top:position}),openBookmarkFolder,resumeBookmarks});
const newNoteController=createNewNoteController({getContext:()=>({editing:navigationStore.editing,typeFilter:navigationStore.typeFilter,active:navigationStore.active}),getVault,mutateVault,saveDraft,activate:note=>{unsavedNewNoteId=note.id;navigationStore.noteId=note.id;navigationStore.editing=true;navigationStore.previewing=false;navigationStore.editingDraft=JSON.parse(JSON.stringify(note));editorBaseline=editorContentSnapshot(navigationStore.editingDraft);navigationStore.page='note'},closeMenu,render,scrollToTop:()=>window.scrollTo(0,0),focusTitle:()=>setTimeout(()=>$('#editTitle')?.focus(),100)});
function openBookmarks(folderId=null){workspaceNavigation.openBookmarks(folderId)}
function addBookmark(folderId=''){openBookmarks();if(workspaceAppMounted)bookmarkDataStore.dispatch({type:'add-link',parentId:folderId});else bookmarksView?.addBookmark(folderId)}
function openTrash(){workspaceNavigation.openTrash()}
const workspaceNavigationEvents=createWorkspaceNavigationEvents({
 navigation:workspaceNavigation,
 isEditing:()=>navigationStore.editing,
 editorHasChanges,
 confirmLeaveEditor:()=>confirmAction('当前笔记有修改，是否保存后离开？点击取消将继续编辑。',{title:'离开编辑',confirmText:'保存并离开'}),
 addBookmark,
 openCreateMenu,
 createNew,
  createFromMenu:kind=>{if(workspaceAppMounted)createMenuStore.closeForNavigation();$('#createOverlay')?.classList.remove('open');if(kind==='bookmark')addBookmark();else if(kind==='capture')openCapture({restoreFocusOnClose:false});else createNew()},
 createQuickImage:()=>{createNew('note');setTimeout(()=>$('#imageFile').click(),250)},
 closeSearch
});
navigationActionsStore.bind(command=>workspaceNavigationEvents.execute(command));
const editorToolbarEvents=workspaceAppMounted?null:createEditorToolbarEvents({closeSlashMenu,format:doFormat,insert:doInsert,tableAction:runTableAction});
const workspaceShellEvents=createWorkspaceShellEvents({
 closeThemeMenu,
 applyTheme:theme=>applyTheme(theme,{save:true}),
 toggleThemeMenu,
 closeAccountMenu,
 toggleAccountMenu:()=>workspaceShellStore.toggleAccountMenu(),
 openProfileSettings:()=>{void profileSettings.show()},
 openAppSettings,
 signOut:()=>{void signOut()},
 closeSlashMenu,
 toggleNoteTypes:()=>{const next=!noteTypesExpanded();mutateVault(vault=>{vault.noteTypesExpanded=next});if(!workspaceAppMounted){const list=$('#sideTypes'),toggle=$('#toggleNoteTypes');if(list)list.hidden=!next;toggle?.setAttribute('aria-expanded',String(next));toggle?.setAttribute('aria-label',next?'折叠笔记类型':'展开笔记类型');toggle?.setAttribute('title',next?'折叠笔记类型':'展开笔记类型')}persist()},
 addNoteType:()=>openTypeDialog('create'),
 addCategory:openCategoryDialog,
 openTypeDialog,
 noteTypeCount:()=>getVault().noteTypes.length,
 toast,
 confirmDeleteNote:()=>confirmAction('将这篇笔记移入回收站，可在 30 天内还原。是否继续？',{title:'移入回收站',confirmText:'移入回收站',danger:true}),
 moveNoteToTrash,
 render,
 closeSearch,
 closeTarget:id=>{if(id==='profileSettingsOverlay')profileSettings.close();else if(id==='appSettingsOverlay')appSettings.close();else if(id==='backupHistoryOverlay')backupHistoryStore.close();else $('#'+id)?.classList.remove('open')}
});
workspaceShellActionsStore.bind(command=>workspaceShellEvents.execute(command));
const readerActions=createReaderActions({
 getVault,
 getCurrentNoteId:()=>navigationStore.noteId,
 isPreviewing:()=>navigationStore.previewing,
 isDraft,
 publishedView,
 mutation:vaultMutation,
 startEditing:()=>{navigationStore.editing=true;navigationStore.previewing=false;navigationStore.editingDraft=null;render()},
 previewPendingChanges:()=>{navigationStore.previewing=true;render()},
 publishCurrent:publishCurrentNote,
 confirmDelete:()=>confirmAction('将这篇笔记移入回收站，可在 30 天内还原。是否继续？',{title:'移入回收站',confirmText:'移入回收站',danger:true}),
 moveToTrash:noteDeleteWorkflow.moveToTrash,
 openHome:()=>openHome(),
 openNote,
 notify:toast
});
readerActionsStore.bind(readerActions.execute);
const editorPageActions=createEditorPageActions({
 saveCurrent:()=>{void publishCurrentNote()},
 chooseAttachment:()=>$('#attachmentFile').click(),
 chooseImage:()=>$('#imageFile').click(),
 deleteCurrent:()=>deleteEditorNote(),
 isEditing:()=>navigationStore.editing,
 isPreviewing:()=>navigationStore.previewing,
 saveDraft,
 getCurrentNote:()=>getVault().notes.find(item=>item.id===navigationStore.noteId),
 isDraft,
 publishedView,
 cleanHTML,
 exportHTML,
 notify:toast
});
editorPageActionsStore.bind(editorPageActions.execute);
const workspaceContentEvents=workspaceAppMounted?null:createWorkspaceContentEvents({
 openCreateMenu,
 openCapture,
 beginEdit:()=>readerActions.execute({type:'edit-current'}),
 showDraftPreview:()=>readerActions.execute({type:'show-pending-changes'}),
 publishNote:()=>readerActions.execute({type:'publish-current'}),
 togglePinned:()=>readerActions.execute({type:'toggle-current-pin'}),
 duplicateNote:()=>readerActions.execute({type:'duplicate-current'}),
 deleteEditorNote:editorPageActions.deleteCurrent,
 deleteCurrentNote:()=>readerActions.execute({type:'delete-current'}),
 saveEditor:editorPageActions.saveCurrent,
 chooseAttachment:editorPageActions.chooseAttachment,
 exportCurrentNote:editorPageActions.exportHtml,
 chooseImage:editorPageActions.chooseImage,
 saveCapture:()=>saveCapture(),
 addCategory:openCategoryDialog,
 saveCategory,
 addNoteType:()=>openTypeDialog('create'),
 saveNoteType:saveTypeDialog,
 downloadBackup:revision=>{void downloadBackupSnapshot(revision)},
 restoreBackup:revision=>{void restoreBackupSnapshot(revision)},
 openSearch,
 closeSearch,
 searchOpen:()=>globalSearchDataStore.open
});
function refreshSettingsIndicators(){appSettings.setIndicators({hasConflict:!!getSyncConflict(),hasIgnoredDraft:!!initial.ignoredDraft})}
onStatus(refreshSettingsIndicators);refreshSettingsIndicators();
const remoteEditorRefresh=createRemoteEditorRefresh({document,setEditingDraft:note=>{navigationStore.editingDraft=note},setBaseline:value=>{editorBaseline=value},snapshot:editorContentSnapshot,cleanBody:html=>cleanHTML(html,true),getEditor:()=>richEditor,syncToolbarState});
const remoteVaultUpdateController=createRemoteVaultUpdateController({
 getEditingState:()=>({editing:navigationStore.editing,noteId:navigationStore.noteId,draft:navigationStore.editingDraft}),
 getTransientNewNoteId:()=>unsavedNewNoteId,
 hasLocalEditorChanges:editorHasChanges,
 isDraft,
 hasDraftContent,
 replaceVault,
 applyTheme:()=>applyTheme(getVault().theme),
 syncBookmarkPreferences,
 findNote:id=>getVault().notes.find(note=>note.id===id),
 restoreTransientDraft:note=>mutateVault(vault=>{vault.notes.unshift(note)}),
 persistRestoredDraft:persist,
 clearAutoSave:()=>editorAutosave.clear(),
 closeEditor:()=>{navigationStore.editing=false;destroyRichEditor();navigationStore.editingDraft=null;navigationStore.noteId=null},
 refreshEditor:(note,preserveLocalChanges)=>remoteEditorRefresh.refresh(note,preserveLocalChanges),
 refreshSidebar:side,
 render,
 getScrollY:()=>window.scrollY,
 scrollTo:position=>window.scrollTo({top:position})
});
onRemoteUpdate(remoteVaultUpdateController.handle);
const snapshotCurrentVault=createCurrentVaultSnapshot({
 getVault,
 isEditing:()=>navigationStore.editing,
 getEditingDraft:()=>navigationStore.editingDraft,
 editorIsMounted:()=>!!$('#editTitle'),
 updateDraftFromEditor:updateDraftFromDOM,
 isDraft,
 hasDraftContent,
 mutateVault
});
 connectSessionRecoveryFlow({
  subscribe:onAuthenticationRequired,
  showAuthentication,
  authenticate:reauthenticateAccount,
  username:initial.username,
  applyAuthenticated:result=>{
   replaceVault(structuredClone(result.data));syncBookmarkPreferences();
   if(navigationStore.editing&&navigationStore.noteId){const current=getVault().notes.find(note=>note.id===navigationStore.noteId);if(current)navigationStore.editingDraft=structuredClone(current)}
   destroyRichEditor();render();
  },
  notify:toast
 });
function noteBodyText(body,title=''){return tinyText(readableNoteBody(body,title).html)}
const autofillPastedTitle=createPastedTitleAutofill({document,extractPastedTitle});
const syncConflictController=createSyncConflictController({
 store:syncConflictStore,
 getConflict:getSyncConflict,
 getPreviewText:html=>tinyText(cleanHTML(html,false)),
 prepareEditor:()=>{if(navigationStore.editing&&navigationStore.editingDraft){editorAutosave.clear();updateDraftFromDOM();saveDraft(true)}},
 exportConflict:exportSyncConflict,
 confirmRestore:()=>confirmAction('已下载修改对照备份。继续载入已保存版本？',{title:'载入已保存版本',confirmText:'载入'}),
 reloadCloud,
 replaceWorkspace:restored=>{editorAutosave.clear();destroyRichEditor();replaceVault({...restored,trash:restored.trash||[]});applyTheme(getVault().theme);syncBookmarkPreferences();workspaceNavigation.resetHome()},
 notify:toast
});
function openSyncConflict(){syncConflictController.open()}
syncConflictStore.bindActions(action=>action==='download-backup'?syncConflictController.downloadBackup():syncConflictController.restoreCloudVersion());
function nowString(t){return new Date(t).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})};const fullDate=t=>new Date(t).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
function closeMenu(returnToButton=false){mobileMenuFocusController.close(returnToButton)}
function categoryOptions(curr){return [...new Set(['未分类',...getVault().categories,curr].filter(Boolean))].map(x=>`<option value="${esc(x)}" ${curr===x?'selected':''}>${esc(x)}</option>`).join('')}
function setBreadcrumb(s){workspaceShellStore.setBreadcrumbTitle(s)}
function side(){legacyWorkspaceRenderer?.renderSidebar()}
function openHome(cat='all'){workspaceNavigation.openHome(cat)}
function openDashboard(){workspaceNavigation.openDashboard()}
function openNote(id,forceEdit=false){workspaceNavigation.openNote(id,forceEdit)}
function backFromNotePage(){workspaceNavigation.backFromNote()}
function noteCardSnapshot(note){return {id:note.id,title:note.title||'',type:note.type,typeName:typeLabel(note.type),category:note.category||'未分类',tags:[...(note.tags||[])],description:noteBodyText(note.body,note.title),updatedLabel:nowString(note.updated),pinned:!!note.pinned}}
function readerSnapshot(stored,working,n){return createReaderSnapshot({document,stored,note:n,working,previewing:navigationStore.previewing,readableNoteBody,typeLabel,formatDate:fullDate,safeUrl,isDraft,needsPublish})}
readerDataStore.configure({document,readableNoteBody,typeLabel,formatDate:fullDate,safeUrl,isDraft,needsPublish,publishedView});
function listNotes(q=''){return selectNotes(getVault().notes,{active:navigationStore.active,typeFilter:navigationStore.typeFilter,query:q,hasDraftContent,bodyText:noteBodyText})}
function moveNoteToTrash(id){return noteDeleteWorkflow.moveToTrash(id)}
let legacyEditorOutlineView=null;
function destroyRichEditor(){if(richEditor){editorRuntime.destroy();richEditorDraftId=null}legacyEditorOutlineView?.dispose()}
const editorOutlineController=createEditorOutlineController({getEditor:()=>richEditor,setOutline:items=>editorDataStore.setOutline(items)});
legacyEditorOutlineView=workspaceAppMounted?null:createLegacyEditorOutlineView({document,main});
function refreshEditorOutline(editor=richEditor){editorOutlineController.sync(editor);if(!workspaceAppMounted)legacyEditorOutlineView?.render(editor)}
dashboardDataStore.configure({isDraft,publishedView,noteCard:noteCardSnapshot,isSafeUrl:safeUrl});
dashboardDataStore.bindActions(createDashboardActions({getVault,mutateVault,persist}));
if(typeof sidebarDataStore!=='undefined')sidebarDataStore.configure({isDraft,needsPublish,hasDraftContent,displayTypeName});
if(typeof noteListDataStore!=='undefined')noteListDataStore.configure({hasDraftContent,bodyText:noteBodyText,noteCard:noteCardSnapshot,typeName:typeLabel,displayTypeName});
legacyWorkspaceRenderer=workspaceAppMounted?null:createLegacyWorkspaceRenderer({
 document,window,main,getData:getVault,navigation:navigationStore,icons,escapeHtml:esc,displayTypeName,
 typeLabel,noteBodyText,nowString,fullDate,isDraft,needsPublish,hasDraftContent,publishedView,listNotes,
 readerSnapshot,safeUrl,dashboardStore:dashboardDataStore,destroyRichEditor,setBreadcrumb,openHome,
 organizeDocumentActions,mountCodeCopyButtons,mountHeadingObserver,noteTypesExpanded,
 enabled:false,notify:toast
});
function ensureDraft(){return editorDraftController.ensureDraft()}
function editorSnapshot(note){return {noteId:note.id,title:note.title||'',type:note.type,category:note.category||'未分类',tags:(note.tags||[]).join(', '),source:note.source||'',noteTypes:getVault().noteTypes.map(type=>({id:type.id,label:displayTypeName(type)})),categories:[...getVault().categories],publishLabel:isDraft(note)?'发布笔记':'保存笔记',pasteMode:preferredPasteMode()}}
function prepareVueEditorPage(){destroyRichEditor();const note=ensureDraft();editorDataStore.sync(editorSnapshot(note))}
function renderEditor(){if(!workspaceAppMounted){renderEditorLegacy();return}prepareVueEditorPage()}
function hasVueEditorActions(){return workspaceAppMounted}
const editorRuntime=createEditorRuntimeController({
 getEditor:()=>richEditor,
 setEditor:editor=>{richEditor=editor},
 getEditorFactory:()=>editorFactory,
 setEditorFactory:factory=>{editorFactory=factory},
 getSurface:()=>$('#editorSurface'),
 getElement:selector=>$(selector),
 isActive:()=>navigationStore.editing&&navigationStore.page==='note',
 getInitialContent:()=>cleanHTML(ensureDraft().body,true),
 getPasteMode:preferredPasteMode,
 getDraftId:()=>ensureDraft().id,
 handlePaste:handleEditorPaste,
 onUpdate:({editor,surface})=>{updateDraftFromDOM();scheduleSave();refreshEditorOutline(editor);if(surface.textContent.endsWith('/'))openSlashHint()},
 onSelectionUpdate:({editor})=>syncToolbarState(editor),
 onBlur:flushEditorSave,
 onSlashMenu:openSlashMenu,
 onFieldChange:()=>{updateDraftFromDOM();scheduleSave()},
 shouldListenToFieldEvents:()=>!workspaceAppMounted,
 onPasteModeChange:mode=>{mutateVault(vault=>{vault.pasteMode=mode});saveDraft(true)},
 onToolbarMouseDown:event=>{if(event.target.closest('button'))event.preventDefault()},
 onMounted:editor=>{richEditorDraftId=ensureDraft().id;syncToolbarState(editor);if(!workspaceAppMounted)organizeEditorTools();syncToolbarState(editor);refreshEditorOutline(editor);ensureEditorCommands()},
 onBeforeDestroy:(_editor,draftId)=>{if(navigationStore.editing&&navigationStore.editingDraft&&draftId===navigationStore.editingDraft.id)updateDraftFromDOM();richEditorDraftId=null}
});
function ensureEditorCommands(){
 if(!editorCommands)editorCommands=createEditorCommandController({getEditor:()=>richEditor,afterChange:editor=>{if(!editor)return;updateDraftFromDOM();scheduleSave();syncToolbarState(editor);refreshEditorOutline(editor)},toast});
 return editorCommands;
}
function dispatchEditorAction({group,action,value,position}){
 if(!richEditor)return;
 const commands=ensureEditorCommands();
 if(group==='outline')return editorOutlineController.goTo(position);
 if(group==='format')return commands.doFormat(action,value);
 if(group==='insert')return doInsert(action);
 if(group==='table')return commands.runTableAction(action);
 if(group==='editor')return commands.runEditorAction(action);
 if(group==='paragraph')return commands.runParagraphAction(action);
}
editorDataStore.bindRuntime({initialize:initializeEditorView,dispatch:dispatchEditorAction,formChanged:()=>{updateDraftFromDOM();scheduleSave()},formBlurred:flushEditorSave});
function initializeEditorView(){
 if(editorFactory){mountEditorSurface();return}
 if(editorLoading)return;
 editorLoading=editorRuntime.loadFactory().then(()=>{
  editorLoading=null;
  if(navigationStore.editing&&navigationStore.page==='note'){mountEditorSurface();setTimeout(()=>$('#editTitle')?.focus(),0)}
 }).catch(error=>{
  editorLoading=null;
  const surface=$('#editorSurface');
  if(surface)surface.innerHTML='<p class="hint">编辑器加载失败，请刷新后重试。</p>';
  toast(error.message||'编辑器加载失败');
 });
}
function mountEditorSurface(){if(!editorFactory||!navigationStore.editing||navigationStore.page!=='note'||!$('#editorSurface'))return;const editor=editorRuntime.mount();if(editor)ensureEditorCommands();return editor}
function renderEditorLegacy(){if(!editorFactory){if(!editorLoading){main.innerHTML='<div class="empty editor-loading">正在加载富文本编辑器…</div>';editorLoading=import('./editor.js').then(module=>{editorFactory=module.createQidianEditor;editorLoading=null;if(navigationStore.editing&&navigationStore.page==='note'){renderEditor();setTimeout(()=>$('#editTitle')?.focus(),0)}}).catch(error=>{editorLoading=null;main.innerHTML='<div class="empty editor-loading">编辑器加载失败，请刷新后重试。</div>';toast(error.message||'编辑器加载失败')})}return}destroyRichEditor();const n=ensureDraft();setBreadcrumb(n.title||'新建笔记');const publishLabel=isDraft(n)?'发布笔记':'保存笔记';main.innerHTML=renderLegacyEditorMarkup({note:n,noteTypes:getVault().noteTypes,publishLabel,icons,escapeHtml:esc,displayTypeName,categoryOptions,preferredPasteMode});mountEditorSurface();
}

function openTypeDialog(mode,id=null){
 noteTypeDialogOpenFlow.open(mode,id);
}
async function saveTypeDialog(){
 if(!legacyNoteTypeDialog)return;
 await noteTypeDialogFlow.save(legacyNoteTypeDialog.readSubmission(DEFAULT_NOTE_TYPES.find(type=>type.id==='note')));
}
const systemThemeMedia=window.matchMedia?.('(prefers-color-scheme: dark)');
function closeThemeMenu(){workspaceShellStore.closeThemeMenu()}
const themeController=createThemeController({document,media:systemThemeMedia,getPreference:()=>getVault().theme,setPreference:preference=>mutateVault(vault=>{vault.theme=preference}),persist,setResolvedState:(preference,dark)=>workspaceShellStore.setThemeState(preference,dark)});
function applyTheme(mode,options={}){themeController.apply(mode,options)}
function toggleThemeMenu(){workspaceShellStore.toggleThemeMenu()}
const disposeTheme=themeController.mount();
const workspaceViewDispatcher=createWorkspaceViewDispatcher({
 getState:()=>({page:navigationStore.page,editing:navigationStore.editing}),
 vueMounted:workspaceAppMounted,
 main,
 getVueHost:()=>$('#dashboardHost'),
 getLastRenderedPage:()=>lastRenderedPage,
 setLastRenderedPage:page=>{lastRenderedPage=page},
 pruneExpiredTrash:()=>{if(trashWorkflows)trashWorkflows.pruneExpired();else recycleBinView?.pruneExpired()},
 leaveBookmarks,
 disconnectReaderHeadingObserver:()=>{main.__readerHeadingCleanup?.();main.__readerHeadingCleanup=null},
 renderSidebar:()=>legacyWorkspaceRenderer?.renderSidebar(),
 destroyRichEditor,
 setBreadcrumb,
 prepareVueEditorPage,
 renderLegacyBookmarks:()=>bookmarksView?.renderLegacy(),
 renderLegacyTrash:()=>recycleBinView?.render(),
 renderLegacyDashboard:()=>legacyWorkspaceRenderer?.renderDashboard(),
 renderLegacyHome:()=>legacyWorkspaceRenderer?.renderHome(),
 renderLegacyEditor:renderEditorLegacy,
 renderLegacyReader:()=>legacyWorkspaceRenderer?.renderReader()
});
function render(){workspaceViewDispatcher.render()}
function cleanExpiredTrash(){const count=trashWorkflows?trashWorkflows.pruneExpired():recycleBinView?.pruneExpired()||0;if(count&&navigationStore.page==='trash'&&!workspaceAppMounted)recycleBinView?.render()}
const disposeWorkspaceLifecycle=mountWorkspaceLifecycle({document,window,isLocal:!!initial.local,refreshCloud:()=>{void refreshCloud(snapshotCurrentVault)},pruneExpiredTrash:cleanExpiredTrash});
function createNew(type='note'){return newNoteController.create(type)}
function updateDraftFromDOM(){editorDraftController.updateFromEditor()}
function editorHasChanges(){return editorDraftController.hasChanges()}
function saveDraft(quiet=false){return editorDraftController.saveDraft(quiet)}
function scheduleSave(){editorAutosave.schedule()}
function flushEditorSave(){return editorAutosave.flush()}
function deleteEditorNote(){return editorDeleteWorkflow.removeCurrentNote()}

async function publishCurrentNote(){await notePublishFlow.publish()}
const legacyEditorToolbar=workspaceAppMounted?null:createLegacyEditorToolbarView({document,window,getToolbar:()=>$('#editorToolbar'),getMain:()=>main,getElement:$,getToolbarState:createEditorToolbarState,getEditing:()=>navigationStore.editing,icons,onEditorAction:runEditorAction,onParagraphAction:runParagraphAction,onDeleteCallout:()=>{if(!richEditor?.isActive('callout'))return;richEditor.chain().focus().deleteNode('callout').run();updateDraftFromDOM();scheduleSave()}});
function syncToolbarState(editor){
 if(!editor)return;
 if(hasVueEditorActions()){
  editorDataStore.setToolbarState(createEditorToolbarState(editor));
  return;
 }
 legacyEditorToolbar?.sync(editor);
}
function organizeDocumentActions(){legacyEditorToolbar?.organizeDocumentActions()}
function organizeEditorTools(){legacyEditorToolbar?.organize()}
function runEditorAction(action){return ensureEditorCommands().runEditorAction(action)}
function runParagraphAction(action){return ensureEditorCommands().runParagraphAction(action)}
function runTableAction(action){return ensureEditorCommands().runTableAction(action)}
function insertHTML(html){if(!richEditor)return;richEditor.chain().focus().insertContent(cleanHTML(html,true),{parseOptions:{preserveWhitespace:'full'}}).run();updateDraftFromDOM();scheduleSave()}
function doFormat(cmd,arg=null){if(!richEditor)return;return ensureEditorCommands().doFormat(cmd,arg)}
const editorInsertController=createEditorInsertController({getEditor:()=>richEditor,insertHTML,openImagePicker:()=>$('#imageFile').click(),prompt:promptAction,format:(command,value)=>doFormat(command,value),afterChange:editor=>{updateDraftFromDOM();scheduleSave();syncToolbarState(editor);refreshEditorOutline(editor)},safeUrl,escapeHTML:esc,toast});
async function doInsert(kind){return editorInsertController.insert(kind)}
function preferredPasteMode(){return ['rich','match','markdown','plain'].includes(getVault().pasteMode)?getVault().pasteMode:'rich'}
const captureDOM=createCaptureDOMAdapter({window,document,getPad:()=>$('#capturePad')});
const {captureSelection,insertHTML:insertCaptureHTML,insertText:insertCaptureText}=captureDOM;
const contentInsertion=createContentInsertionController({window,document,purifier:DOMPurify,getMode:id=>$('#'+id)?.value||'rich',classifyClipboard,plainTextToDocument,sanitizeMarkdownDocument,loadMarkdownTools,cleanHTML,plainTextToStructuredHTML,safeUrl,escapeHTML:esc,autofillPastedTitle,upload,insertEditorHTML:insertHTML,getEditor:()=>richEditor,insertCaptureHTML,captureSelection,insertCaptureText,toast});
const attachmentUpload=createAttachmentUploadFlow({upload,insertHTML,escapeHTML:esc,notify:toast});
function handleEditorPaste(payload){return contentInsertion.handleEditorPaste(payload)}
function openSlashMenu(){const selection=window.getSelection(),rect=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null,x=rect?.left||window.innerWidth/2,y=(rect?.bottom||120)+8;editorDataStore.showSlashMenu({left:Math.max(12,Math.min(x,window.innerWidth-260)),top:Math.max(12,Math.min(y,window.innerHeight-355))})}function closeSlashMenu(){editorDataStore.closeSlashMenu()}function openSlashHint(){openSlashMenu()}
function storeImage(file,destination,bookmark=null,range=null){return contentInsertion.storeImage(file,destination,bookmark,range)}
function pasteRich(event){return contentInsertion.handleCapturePaste(event)}
if(workspaceAppMounted)captureDialogStore.bindPasteHandler(pasteRich);
function openCapture(options={}){closeMenu();if(workspaceAppMounted){captureDialogStore.open({types:getVault().noteTypes.map(type=>({id:type.id,name:displayTypeName(type)})),categories:getVault().categories,pasteMode:preferredPasteMode(),restoreFocusOnClose:options.restoreFocusOnClose});return}legacyCaptureDialog.open({types:getVault().noteTypes.map(type=>({id:type.id,name:displayTypeName(type)})),defaultType:getVault().noteTypes.find(type=>type.id==='clip')?.id||getVault().noteTypes[0].id,categoryOptions:categoryOptions('网页摘录'),pasteMode:preferredPasteMode()})}
function closeCapture(){if(workspaceAppMounted){captureDialogStore.close();return}legacyCaptureDialog.close()}
async function saveCapture(){if(!legacyCaptureDialog)return;try{const note=await captureFlow.save(legacyCaptureDialog.readInput());closeCapture();openNote(note.id)}catch(error){toast(error.message||'网页摘录尚未保存')}}
function openCategoryDialog(){closeMenu();if(workspaceAppMounted){categoryDialogStore.open();return}legacyCategoryDialog?.open()}
async function saveCategory(){if(!legacyCategoryDialog)return;try{const saved=await categoryDialogFlow.save(legacyCategoryDialog.readInput());legacyCategoryDialog.close();openHome(saved)}catch(error){legacyCategoryDialog.showError(error)}}
async function openBackupHistory(){if(navigationStore.editing)saveDraft(true);closeAccountSettings();closeMenu();backupHistoryStore.show();await backupHistoryStore.refresh()}
function downloadBackupSnapshot(revision){return backupWorkflows.downloadSnapshot(revision)}
function restoreBackupSnapshot(revision){return backupWorkflows.restoreSnapshot(revision)}
function exportJSON(){return backupWorkflows.exportFullBackup()}
function importJSON(file){return backupWorkflows.importBackup(file)}
function openCreateMenu(){closeMenu();if(workspaceAppMounted){createMenuStore.open();return}if(!$('#createOverlay'))document.body.insertAdjacentHTML('beforeend',`<div class="overlay" id="createOverlay"><section class="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="createTitle"><div class="dialog-head"><h2 id="createTitle">新建</h2><button class="round-btn" data-close="createOverlay" aria-label="关闭">${icons('close')}</button></div><div class="dialog-body create-options"><button data-create-kind="note">${icons('note')}<span><strong>笔记</strong><small>记录内容、命令与图片</small></span></button><button data-create-kind="bookmark">${icons('link')}<span><strong>书签</strong><small>保存网址并选择分组</small></span></button><button data-create-kind="capture">${icons('clip')}<span><strong>网页摘录</strong><small>将复制的内容整理为笔记</small></span></button></div></section></div>`);$('#createOverlay').classList.add('open');$('#createOverlay [data-create-kind]').focus()}
function openSearch(query=''){globalSearchDataStore.show(query)};function closeSearch(){globalSearchDataStore.close()}
function toast(s){notificationDataStore.show(s)}
function closeAccountMenu(){workspaceShellStore.closeAccountMenu()}
function closeAccountSettings(){profileSettings.close();appSettings.close();systemUpdates.close()}
const systemUpdates=createSystemUpdateController({document,window,appVersion:APP_VERSION,getSystemVersion,getSystemUpdateStatus,requestSystemUpdate,flush,renderReleaseNotes,closeAccountMenu,closeAppSettings:()=>appSettings.close()});
bookmarkDataStore.bindActions(async action=>{await bookmarkMutationActions.execute(action)});
trashDataStore.bindActions(trashWorkflows||{
 restore:id=>recycleBinView?.restore(id)||Promise.resolve(false),
 clearAll:async()=>false,
 pruneExpired:()=>recycleBinView?.pruneExpired()||0
});
function openAppSettings(){closeAccountMenu();void appSettings.show()}
async function signOut(){if(navigationStore.editing){editorAutosave.clear();saveDraft(true)}if(!await flush()){toast('修改暂未写入；请到设置中重试保存后再退出');return}try{await logoutAccount();location.reload()}catch(error){toast(error.message)}}
workspaceShellStore.setIdentity(initial.username||'本地预览',!!initial.local);
if(!initial.local)void profileSettings.refresh().catch(()=>{});
const disposeWorkspaceInteractions=mountWorkspaceInteractionRuntime({
 document,window,
 staticDom:workspaceAppMounted?null:{closeCapture,handleCapturePaste:pasteRich,saveCategory,saveNoteType:saveTypeDialog},
 editorLifecycle:{isEditing:()=>navigationStore.editing,hasEditorChanges:editorHasChanges,saveDraft,hasUnsavedChanges:hasUnsaved},
 routeHandlers:[
  ...(workspaceAppMounted?[]:[event=>workspaceNavigationEvents.handle(event)]),
  ...(editorToolbarEvents?[event=>editorToolbarEvents.handleClick(event.target)]:[]),
  ...(workspaceAppMounted?[]:[event=>workspaceShellEvents.handle(event)]),
  ...(workspaceContentEvents?[event=>workspaceContentEvents.handleClick(event.target)]:[])
 ],
 handleChange:editorToolbarEvents?target=>editorToolbarEvents.handleChange(target):null,
 editorFiles:{
  uploadAttachments:files=>attachmentUpload.insertFiles(files),
  storeImages:async files=>{for(const file of files)await storeImage(file,'edit')}
 },
 importBackupFile:importJSON,
 keyboard:{
  isEditing:()=>navigationStore.editing,
  toggleCommandPalette:()=>commandPaletteStore.toggle(),
  saveDraft,
  updateEditorBaseline:()=>{editorBaseline=editorContentSnapshot(navigationStore.editingDraft)},
  closeSearch,
  closeCapture,
  closeBackupHistory:()=>backupHistoryStore.close(),
  closeAccountSettings,
  closeThemeMenu,
  closeAccountMenu,
  closeWorkspaceMenu:()=>closeMenu(true),
  closeSlashMenu,
  openNote
 }
});
applyTheme(getVault().theme);render();systemUpdates.renderBadge({currentVersion:APP_VERSION,updateAvailable:false});if(!initial.local)void systemUpdates.check();if(initial.restoreDraft&&!initial.restoreConflict)queueSave(getVault());
return ()=>{disposeWorkspaceInteractions();disposeWorkspaceLifecycle();disposeTheme();editorAutosave.clear();destroyRichEditor()};
})();
}
