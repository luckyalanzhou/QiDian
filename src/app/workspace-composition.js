
import DOMPurify from 'dompurify';
import { watch } from 'vue';
import appPackage from '../../package.json';
import { appSettingsStore, backupHistoryStore, backupImportStore, bookmarkDataStore, captureDialogStore, commandPaletteStore, createMenuStore, dashboardDataStore, editorDataStore, editorPageActionsStore, globalSearchDataStore, navigationActionsStore, noteListDataStore, noteTypeDialogStore, notificationDataStore, profileSettingsStore, readerActionsStore, readerDataStore, sidebarDataStore, syncConflictStore, trashDataStore, vaultDataStore, workspaceAppMounted, workspaceNavigationStore, workspaceShellActionsStore, workspaceShellStore } from './workspace-app.ts';
import { openActionDialog } from '../features/dialogs/action-dialog-service.ts';
import { createTrashEntry } from '../domain/trash-data.js';
import { createWorkspaceTrashFeature } from './workspace-trash.ts';
import { createWorkspaceReplacement } from './workspace-replacement.ts';
import { createWorkspaceVaultRuntime } from './workspace-vault-runtime.ts';
import { createWorkspaceSystemUpdates } from './workspace-system-updates.ts';
import { createWorkspaceAccountSession } from './workspace-account-session.ts';
import { createWorkspaceContentProjections } from './workspace-content-projections.ts';
import { createWorkspaceSyncConflicts } from './workspace-sync-conflicts.ts';
import { renderReleaseNotes } from '../features/system-updates/release-notes.js';
import { createWorkspaceNotePageActions } from './workspace-note-page-actions.ts';
import { createWorkspaceSearch } from './workspace-search.ts';
import { createBookmarkWorkspaceFeature } from './workspace-bookmarks.ts';
import { createWorkspaceEditorRuntime } from './workspace-editor-runtime.ts';
import { fetchBookmarkMetadata } from '../api/bookmark-metadata.ts';
import { createWorkspaceEditorFeature, createWorkspaceEditorLifecycle } from './workspace-editor-feature.ts';
import { createWorkspaceSettingsFeature } from './workspace-settings-feature.ts';
import { mountWorkspaceSettingsStatus } from './workspace-settings-actions.ts';
import { createWorkspaceProfileSettings } from './workspace-profile-settings.ts';
import { createWorkspaceBackupFeature } from './workspace-backups.ts';
import { createWorkspaceNavigationRuntime } from './workspace-navigation-runtime.ts';
import { getWorkspaceScrollTop, scrollWorkspaceTo } from '../features/navigation/workspace-scroll.ts';
import { createWorkspaceShell } from './workspace-shell.ts';
import { createWorkspaceViewFeature } from './workspace-views.ts';
import { createWorkspaceContentEvents } from '../features/navigation/workspace-content-events.ts';
import { createWorkspaceNoteDeletion } from './workspace-note-deletion.ts';
import { isDraftNote as isDraft, needsPublish, publishedNoteView as publishedView } from '../features/notes/selectors.ts';
import { createWorkspaceNoteTypeDialogs, createWorkspaceNoteTypeLabels } from './workspace-note-types.ts';
import { mountCodeCopyButtons } from '../features/reader/code-copy.ts';
import { mountHeadingObserver } from '../features/reader/heading-observer.ts';
import { createWorkspaceCaptureFeature } from './workspace-capture.ts';
import { createCaptureDOMAdapter } from '../features/capture/capture-dom-adapter.ts';
import { createWorkspaceTheme } from './workspace-theme.ts';
import { mountSkipToMainContent } from '../features/navigation/skip-to-main-content.ts';
import { normalizeEditorPasteMode } from '../features/editor/session-snapshot.ts';
import { createWorkspaceApplicationLifecycle } from './workspace-application-lifecycle.ts';
import { mountWorkspaceUIRuntime } from './workspace-ui-runtime.ts';
import { createWorkspaceRemoteSyncFeature } from './workspace-remote-sync.ts';
import { createWorkspaceContentRuntime } from './workspace-content-runtime.ts';
import { createWorkspaceDialogControls } from './workspace-dialog-controls.ts';
import { reauthenticateAccount, completeMfaReauthentication, beginAccountTotpEnrollment, confirmAccountTotpEnrollment, disableAccountTotp, logoutAccount, getAccountProfile, getAccountAvatar, saveAccountAvatar, removeAccountAvatar, changeAccountPassword, createExtensionPairingCode, listExtensionTokens, revokeExtensionToken, getSystemVersion, requestSystemUpdate, getSystemUpdateStatus, queueSave, commitSave, flush, getLastSyncError, onStatus, onAuthenticationRequired, onRemoteUpdate, refreshCloud, holdEditorConflict, getSyncConflict, exportSyncConflict, setOwner, upload, pruneAssets, exportBackup, exportHTML, readBackup, prepareBackup, uploadPreparedBackup, listBackups, createBackupSnapshot, getBackup, download, hasUnsaved, reloadCloud, restoreIgnoredDraft, retrySync, beginBackupImport, prepareBackupImport, createBackupImportScope, abortBackupImportScope, commitBackupImport, finishBackupImport } from '../cloud.js';
import { validateVault } from '../../shared/vault-validation.js';
import { classifyClipboard, looksLikeMarkdown, plainTextToDocument, sanitizeMarkdownDocument } from '../features/content/paste.js';
const loadMarkdownTools = () => import('../features/content/markdown.js');
const APP_VERSION = appPackage.version;
const IS_PRODUCTION_BUILD = import.meta.env.PROD;
export function launchWorkspace(initial, showAuthentication) {
 const authGate = document.querySelector('#loginGate'); if (authGate) { authGate.hidden = true; authGate.classList.remove('reauth'); } document.body.classList.remove('booting'); document.querySelector('.app').hidden = false;
 return (()=>{'use strict';
const usesVueWorkspace=IS_PRODUCTION_BUILD||workspaceAppMounted;
const disposeSkipToMainContent=mountSkipToMainContent(document,{closeMobileDrawer:()=>mobileMenuFocusController.close(),scheduleFocus:callback=>requestAnimationFrame(callback)});
const navigationStore=workspaceNavigationStore;
const icons=name=>`<span class="ico"><svg aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
const $=sel=>document.querySelector(sel);const main=$('#main');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const workspaceContentRuntime=createWorkspaceContentRuntime({document,sanitizeHTML:html=>DOMPurify.sanitize(html),parseHTML:html=>new DOMParser().parseFromString(html,'text/html'),escapeHTML:esc,looksLikeMarkdown});
const {safeUrl,cleanHTML,plainTextToStructuredHTML,textWithBlockBreaks,htmlToCompactText,noteBodyCompactText,readableNoteBody,editorContentSnapshot,hasDraftContent,autofillPastedTitle}=workspaceContentRuntime;
const workspaceSearch=createWorkspaceSearch({store:globalSearchDataStore,commandPaletteStore,document});
const openSearch=(query='')=>workspaceSearch.open(query);const closeSearch=()=>workspaceSearch.close();
const vaultRuntime=createWorkspaceVaultRuntime({store:vaultDataStore,initialData:initial.data,owner:initial.owner,setOwner});
const {getVault,replaceVault,mutateVault}=vaultRuntime;
const {displayTypeName,typeLabel}=createWorkspaceNoteTypeLabels(getVault);
let editorFactory=window.__qidianTestEditorFactory||null,richEditor=null,editorInputFeature=null,workspaceEditorToolbar=null;
let editorDraftController=null,editorAutosave=null,notePublishing=null;
let workspaceReplacement=null;
let legacyWorkspaceRenderer=null;
let browserHistory=null;
const confirmAction=(message,options={})=>openActionDialog({message,...options}).then(Boolean);
const promptAction=(message,defaultValue='',options={})=>openActionDialog({mode:'prompt',message,inputValue:defaultValue,...options});
const profileSettings=createWorkspaceProfileSettings({
 store:profileSettingsStore,
 local:!!initial.local,
 username:initial.username||'本地开发预览',
 api:{
  getAccountProfile,
  getAccountAvatar,
  saveAccountAvatar,
  removeAccountAvatar,
  changeAccountPassword,
  beginTotpEnrollment:beginAccountTotpEnrollment,
  confirmTotpEnrollment:confirmAccountTotpEnrollment,
  disableTotp:disableAccountTotp,
  createExtensionPairingCode,
  listExtensionTokens,
  revokeExtensionToken
 },
 identity:{
  setUsername:(username,local)=>workspaceShellStore.setIdentity(username,local),
  setAvatar:avatarUrl=>workspaceShellStore.setAvatar(avatarUrl)
 }
});
const {store:appSettings}=createWorkspaceSettingsFeature({
 store:appSettingsStore,
 localPreview:!!initial.local,
 confirmAction,
 isEditing:()=>navigationStore.editing,
 clearAutosave:()=>editorAutosave.clear(),
 saveDraft:immediate=>saveDraft(immediate),
 getCurrentData:()=>getVault(),
 replaceWorkspace:restored=>workspaceReplacement.fromSettings(restored),
 markIgnoredDraftHandled:()=>{initial.ignoredDraft=false;refreshSettingsIndicators()},
 openImportPicker:()=>$('#importFile').click(),
 actions:{
 closeSettings:closeAccountSettings,
 closeMenu,
 retrySync,
 flush,
 getLastError:getLastSyncError,
 createBackupSnapshot,
 reloadCloud,
 restoreIgnoredDraft,
 queueSave,
 openSyncConflict,
 openBackupHistory,
 exportJSON,
 notify:toast
 }
});
const backupFeature=createWorkspaceBackupFeature({
 localPreview:!!initial.local,
 backupHistoryStore,
 listBackups,
 isEditing:()=>navigationStore.editing,
 clearAutosave:()=>editorAutosave.clear(),
 saveActiveDraft:()=>saveDraft(true),
 closeSettings:closeAccountSettings,
 closeMenu,
 isSettingsOpen:()=>appSettingsStore.open,
 ignoreNextSettingsDialogClose:()=>browserHistory?.ignoreNextDialogClose('app-settings'),
 getData:()=>structuredClone(getVault()),
 confirmAction,
 getBackup,
 exportBackup,
 createBackupSnapshot,
 flush,
 getLastError:getLastSyncError,
 prepareBackup,
 uploadPreparedBackup,
 validateVault,
 cleanHTML,
 commitSave,
 importLifecycle:{store:backupImportStore,beginCloudImport:beginBackupImport,finishCloudImport:finishBackupImport},
  prepareImport:prepareBackupImport,
  createImportScope:createBackupImportScope,
  abortImportScope:abortBackupImportScope,
  commitImport:commitBackupImport,
 replaceWorkspace:(restored,mode)=>workspaceReplacement.fromBackup(restored,mode),
 downloadJSON:(value,filename)=>download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),filename),
 pruneAssets,
 clearImportFile:()=>{const input=$('#importFile');if(input)input.value=''},
 notify:toast
});
backupFeature.configureHistory();
const {persist,commitPersist}=vaultRuntime.createPersistence({getUnsavedNewNoteId:()=>editorDataStore.transientNewNoteId,isDraft,hasDraftContent,queueSave,commitSave});
const editorLifecycle=createWorkspaceEditorLifecycle({
 drafts:{editorStore:editorDataStore,navigationStore,getVault,getEditor:()=>richEditor,getElement:$,usesVueWorkspace,isDraft,hasDraftContent,snapshot:editorContentSnapshot,mutateVault,persist,cleanHTML,setTimer:(callback,delay)=>window.setTimeout(callback,delay),clearTimer:handle=>window.clearTimeout(handle)},
 publishing:{getData:getVault,getNoteId:()=>navigationStore.noteId,getEditingDraft:()=>navigationStore.editingDraft,isEditing:()=>navigationStore.editing,isDraft:note=>isDraft(note),hasDraftContent:note=>hasDraftContent(note),needsPublish:note=>needsPublish(note),queueSave,flush,hasSyncConflict:()=>!!getSyncConflict(),completion:{replaceVault,navigationStore,destroyEditor:destroyRichEditor,render,scrollToTop:()=>window.scrollTo({top:0})},setBusy:busy=>{const button=$('#saveEditor')||$('#publishDoc');if(button)button.disabled=busy},notify:toast}
});
({draftController:editorDraftController,autosave:editorAutosave,publishing:notePublishing}=editorLifecycle);
const noteTypeDialogs=createWorkspaceNoteTypeDialogs({
 document,escapeHTML:esc,usesVueWorkspace,dialogStore:noteTypeDialogStore,navigationStore,getElement:$,
 getVault,mutateVault,persist,replaceVault,displayTypeName,closeMenu,
 saveDraft:()=>saveDraft(true),clearAutosave:()=>editorAutosave.clear(),render,
 commit:()=>commitPersist(),notify:toast
});
const isMobileViewport=()=>!!window.matchMedia?.('(max-width: 720px)').matches;
const vaultMutation=vaultRuntime.createMutation(()=>commitPersist());
const trashFeature=createWorkspaceTrashFeature({
 usesVueWorkspace,
 store:trashDataStore,
 main,
 getVault,
 mutateVault:vaultMutation,
 mutateLegacyData:operation=>mutateVault(()=>operation(getVault())),
 saveLegacyData:async()=>{await commitPersist();side()},
 confirmClear:count=>confirmAction(`将永久删除回收站中的 ${count} 项内容，无法再还原。是否继续？`,{title:'永久清空回收站',confirmText:'永久清空回收站',danger:true}),
 notify:toast,
 shouldRefreshLegacyView:()=>navigationStore.page==='trash'&&!trashDataStore.active,
 isLegacyTrashPage:()=>navigationStore.page==='trash'&&!usesVueWorkspace
});
const recycleBinView=trashFeature.legacyView;
const bookmarkFeature=createBookmarkWorkspaceFeature({
 store:bookmarkDataStore,
 getVault,
 download,
 fetchMetadata:fetchBookmarkMetadata,
 uploadAsset:upload,
 mutation:vaultMutation,
 notify:toast,
 domParser:window.DOMParser,
 navigation:{usesVueWorkspace,isMobileViewport,getScrollY:()=>window.scrollY,scrollTo:top=>window.scrollTo({top})},
 legacyView:{main,getVault,mutateVault:operation=>mutateVault(()=>operation(getVault())),save:async()=>{await commitPersist();side()},download,notify:toast,isBookmarksPage:()=>navigationStore.page==='bookmarks'}
});
const bookmarksView=bookmarkFeature.legacyView;
const syncBookmarkPreferences=()=>bookmarkFeature.syncPreferences();
const openBookmarkFolder=folderId=>bookmarkFeature.openFolder(folderId);
const resumeBookmarks=()=>bookmarkFeature.resume();
const leaveBookmarks=()=>bookmarkFeature.leave();
const captureFeature=createWorkspaceCaptureFeature({
 document,escapeHTML:esc,getVault,mutateVault:vaultMutation,
 cleanBody:html=>cleanHTML(html,true),bodyText:html=>htmlToCompactText(html),
 vueMounted:usesVueWorkspace,closeMenu,
 getTypes:()=>getVault().noteTypes.map(type=>({id:type.id,name:displayTypeName(type)})),
 getPasteMode:preferredPasteMode,vueDialog:captureDialogStore,
 openNote:id=>openNote(id),notify:toast
});
const {noteDeleteWorkflow,editorDeleteWorkflow,confirmNoteDelete}=createWorkspaceNoteDeletion({
 note:{getVault,mutateVault:vaultMutation,notify:toast},
 confirmNoteDelete:()=>confirmAction('将这篇笔记移入回收站，可在 30 天内还原。是否继续？',{title:'移入回收站',confirmText:'移入回收站',danger:true}),
 editor:{getVault,
 getNoteId:()=>navigationStore.noteId,
 getEditingDraft:()=>navigationStore.editingDraft,
 prepareEditingDraft:()=>updateDraftFromDOM(),
 isTransientNewNote:id=>editorDataStore.transientNewNoteId===id,
 isDraft:note=>isDraft(note),
 hasDraftContent:note=>hasDraftContent(note),
 confirm:(message,options)=>confirmAction(message,options),
 clearAutosave:()=>editorAutosave.clear(),
 mutateVault,
 clearTransientState:()=>editorDataStore.clearTransientNewNote(),
 closeEditor:()=>{navigationStore.editing=false;destroyRichEditor();navigationStore.editingDraft=null;navigationStore.noteId=null},
 openHome:()=>openHome(navigationStore.active)
 }
});
const workspaceNavigationRuntime=createWorkspaceNavigationRuntime({
 usesVueWorkspace,document,window,main,getElement:$,icons,
 navigationStore,editorStore:editorDataStore,shellStore:workspaceShellStore,navigationActionsStore,createMenuStore,
 navigation:{findNote:id=>getVault().notes.find(note=>note.id===id),isDraft:note=>isDraft(note),saveDraft:()=>saveDraft(true),clearAutoSave:()=>editorAutosave.clear(),render},
 actions:{isEditing:()=>navigationStore.editing,editorHasChanges,confirmLeaveEditor:()=>confirmAction('当前笔记有修改，是否保存后离开？点击取消将继续编辑。',{title:'离开编辑',confirmText:'保存并离开'}),closeSearch},
 noteCreation:{getVault,mutateVault,saveDraft,render,scrollToTop:()=>window.scrollTo(0,0),focusTitle:()=>setTimeout(()=>$('#editTitle')?.focus(),100),getEditorBaseline:editorContentSnapshot},
 createMenu:{openImagePicker:()=>$('#imageFile').click(),setTimer:(callback,delay)=>window.setTimeout(callback,delay)},
 bookmarks:{openFolder:folderId=>bookmarkFeature.openFolder(folderId),resume:resumeBookmarks,addToFolder:folderId=>bookmarkFeature.addToFolder(folderId)},
 openCapture:options=>openCapture(options),
 onNavigate:(state,mode,previousState,previousScrollY)=>browserHistory?.navigate(state,mode,previousState,previousScrollY)
});
const {mobileMenuFocusController,navigation:workspaceNavigation,events:workspaceNavigationEvents,legacyCreateMenu,openCreateMenu}=workspaceNavigationRuntime;
workspaceReplacement=createWorkspaceReplacement({
 isEditing:()=>navigationStore.editing,
 clearAutosave:()=>editorAutosave.clear(),
 destroyEditor:destroyRichEditor,
 clearEditorBaseline:()=>editorDataStore.setBaseline(null),
 clearUnsavedNewNote:()=>editorDataStore.clearTransientNewNote(),
 replaceVault,
 applyTheme:theme=>applyTheme(theme),
 syncBookmarkPreferences,
 resetHome:()=>workspaceNavigation.resetHome(),
 returnHomePreservingList:()=>workspaceNavigation.returnHomePreservingList(),
 closeBackupHistory:()=>backupHistoryStore.close()
});
const workspaceShellFeature=createWorkspaceShell({
 store:workspaceShellActionsStore,
 chrome:{
 closeThemeMenu,
 applyTheme:theme=>applyTheme(theme,{save:true}),
 toggleThemeMenu,
 closeAccountMenu,
 toggleAccountMenu:()=>workspaceShellStore.toggleAccountMenu(),
 openProfileSettings:()=>{void profileSettings.show()},
  openAppSettings:()=>{void appSettings.show()},
 signOut:()=>{void signOut()},
 closeSlashMenu,
 },
 noteTypes:{
  toggleNoteTypes:noteTypeDialogs.toggleExpanded,
 addNoteType:()=>openTypeDialog('create'),
 openTypeDialog,
 noteTypeCount:()=>getVault().noteTypes.length,
 toast,
 },
 noteDeletion:{
 confirmDeleteNote:confirmNoteDelete,
 moveNoteToTrash,
 render
 },
 events:{
  closeSearch,
   closeTarget:id=>workspaceDialogControls.closeTarget(id)
 }
});
const {events:legacyWorkspaceShellEvents}=workspaceShellFeature;
const workspaceShellEvents=usesVueWorkspace?null:legacyWorkspaceShellEvents;
const {readerActions,editorPageActions}=createWorkspaceNotePageActions({
 readerStore:readerActionsStore,
 editorPageStore:editorPageActionsStore,
 navigationStore,
 render,
 reader:{
 getVault,
 getCurrentNoteId:()=>navigationStore.noteId,
 isPreviewing:()=>navigationStore.previewing,
 isDraft,
 publishedView,
 mutation:vaultMutation,
 publishCurrent:publishCurrentNote,
 moveToTrash:noteDeleteWorkflow.moveToTrash,
 openHome:()=>openHome(),
 openNote,
 notify:toast
 },
 confirmNoteDelete,
 editorPage:{
 chooseAttachment:()=>$('#attachmentFile').click(),
 chooseImage:()=>$('#imageFile').click(),
 isEditing:()=>navigationStore.editing,
 isPreviewing:()=>navigationStore.previewing,
 saveDraft,
 getCurrentNote:()=>getVault().notes.find(item=>item.id===navigationStore.noteId),
 isDraft,
 publishedView,
 cleanHTML,
 exportHTML,
 notify:toast
 },
 deleteEditorNote:()=>deleteEditorNote()
});
const workspaceContentEvents=usesVueWorkspace?null:createWorkspaceContentEvents({
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
 addNoteType:()=>openTypeDialog('create'),
 saveNoteType:saveTypeDialog,
 downloadBackup:revision=>{void downloadBackupSnapshot(revision)},
 restoreBackup:revision=>{void restoreBackupSnapshot(revision)},
 openSearch,
 closeSearch,
 searchOpen:workspaceSearch.isOpen
});
const settingsStatus=mountWorkspaceSettingsStatus({store:appSettings,subscribe:onStatus,hasConflict:()=>!!getSyncConflict(),hasIgnoredDraft:()=>!!initial.ignoredDraft,notify:toast});
const refreshSettingsIndicators=settingsStatus.refresh;
const remoteSyncFeature=createWorkspaceRemoteSyncFeature({
 remoteEditor:{document,getEditingDraft:()=>navigationStore.editingDraft,getBaseline:()=>editorDataStore.baseline,setEditingDraft:note=>{navigationStore.editingDraft=note},setBaseline:value=>editorDataStore.setBaseline(value),snapshot:editorContentSnapshot,cleanBody:html=>cleanHTML(html,true),getEditor:()=>richEditor,syncToolbarState,onConflict:({base,local,remote})=>holdEditorConflict({noteId:remote.id,baseNote:base,localNote:local})},
 editorLifecycle:{navigationStore,destroyEditor:destroyRichEditor,clearAutosave:()=>editorAutosave.clear(),persistRestoredDraft:persist,mutateVault},
 remoteVaultUpdate:{
 getEditingState:()=>({editing:navigationStore.editing,noteId:navigationStore.noteId,draft:navigationStore.editingDraft}),
 getTransientNewNoteId:()=>editorDataStore.transientNewNoteId,
 hasLocalEditorChanges:editorHasChanges,
 isDraft,
 hasDraftContent,
 replaceVault,
 applyTheme:()=>applyTheme(getVault().theme),
 syncBookmarkPreferences,
 findNote:id=>getVault().notes.find(note=>note.id===id),
 refreshSidebar:side,
 render,
  getScrollY:()=>getWorkspaceScrollTop(window),
  scrollTo:position=>scrollWorkspaceTo(window,position)
 },
 currentVaultSnapshot:{
 getVault,
 isEditing:()=>navigationStore.editing,
 getEditingDraft:()=>navigationStore.editingDraft,
 editorIsMounted:()=>!!$('#editTitle'),
 updateDraftFromEditor:updateDraftFromDOM,
 isDraft,
 hasDraftContent,
 mutateVault
 },
 onRemoteUpdate
});
const snapshotCurrentVault=remoteSyncFeature.snapshotCurrentVault;
const accountSession=createWorkspaceAccountSession({
 recovery:{
  subscribe:onAuthenticationRequired,
  showAuthentication,
  authenticate:reauthenticateAccount,
  completeMfaLogin:completeMfaReauthentication,
  username:initial.username,
  notify:toast
 },
 authenticatedWorkspace:{
  replaceVault,syncBookmarkPreferences,
  isEditing:()=>navigationStore.editing,
  getEditingNoteId:()=>navigationStore.noteId,
  findNote:id=>getVault().notes.find(note=>note.id===id),
  setEditingDraft:note=>{navigationStore.editingDraft=note},
  destroyEditor:destroyRichEditor,render
 },
 signOut:{isEditing:()=>navigationStore.editing,clearAutosave:()=>editorAutosave.clear(),saveDraft:()=>saveDraft(true),flush,logout:()=>logoutAccount(),reload:()=>location.reload(),notify:toast}
});
const contentProjections=createWorkspaceContentProjections({
 document,
 navigationStore,
 stores:{reader:readerDataStore,dashboard:dashboardDataStore,sidebar:sidebarDataStore,noteList:noteListDataStore,globalSearch:globalSearchDataStore},
 getVault,
 mutateVault,
 persist,
 readableNoteBody,
 htmlToCompactText,
 noteBodyCompactText,
 displayTypeName,
 typeLabel,
 safeUrl,
 formatFullDate:timestamp=>new Date(timestamp).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}),
 isDraft,
 needsPublish,
 publishedView,
 hasDraftContent
});
const {noteBodyText,nowString,fullDate,noteCardSnapshot,editorSessionSnapshot,readerSnapshot,listNotes}=contentProjections;
const syncConflictFeature=createWorkspaceSyncConflicts({
 store:syncConflictStore,
 editor:{isEditing:()=>navigationStore.editing,hasDraft:()=>!!navigationStore.editingDraft,clearAutosave:()=>editorAutosave.clear(),updateDraftFromEditor:updateDraftFromDOM,saveDraft:()=>saveDraft(true)},
 getConflict:getSyncConflict,
 getPreviewText:html=>htmlToCompactText(cleanHTML(html,false)),
 exportConflict:exportSyncConflict,
 confirmRestore:()=>confirmAction('将用已保存版本替换当前内容。刚下载的对照备份包含两边修改，可用于找回本地版本。继续吗？',{title:'载入已保存版本',confirmText:'载入已保存版本'}),
 reloadCloud,
 replaceWorkspace:restored=>workspaceReplacement.fromSyncConflict(restored),
 notify:toast
});
function openSyncConflict(){syncConflictFeature.open()}
function closeMenu(returnToButton=false){mobileMenuFocusController.close(returnToButton)}
function setBreadcrumb(s){workspaceShellStore.setBreadcrumbTitle(s)}
function side(){legacyWorkspaceRenderer?.renderSidebar()}
function openHome(cat='all'){workspaceNavigation.openHome(cat)}
function openNote(id,forceEdit=false){workspaceNavigation.openNote(id,forceEdit)}
function moveNoteToTrash(id){return noteDeleteWorkflow.moveToTrash(id)}
let editorWorkspace=null;
function destroyRichEditor(){editorWorkspace?.destroy()}
function refreshEditorOutline(editor=richEditor){editorWorkspace?.refreshOutline(editor)}
const workspaceViewFeature=createWorkspaceViewFeature({
 usesVueWorkspace,
 legacyRenderer:{document,window,main,getData:getVault,navigation:navigationStore,icons,escapeHtml:esc,displayTypeName,typeLabel,noteBodyText,nowString,fullDate,isDraft,needsPublish,hasDraftContent,publishedView,listNotes,readerSnapshot,safeUrl,dashboardStore:dashboardDataStore,destroyRichEditor,setBreadcrumb,openHome,organizeDocumentActions,mountCodeCopyButtons,mountHeadingObserver,noteTypesExpanded:noteTypeDialogs.isExpanded,notify:toast},
 vuePresentation:{main,getHost:()=>$('#dashboardHost'),destroyRichEditor,prepareEditorPage:prepareVueEditorPage},
 legacyPresentation:{main,getVueHost:()=>$('#dashboardHost'),destroyRichEditor,setBreadcrumb,renderBookmarks:()=>bookmarksView?.renderLegacy(),renderTrash:()=>recycleBinView?.render(),renderEditor:renderEditorLegacy},
 dispatcher:{getState:()=>({page:navigationStore.page,editing:navigationStore.editing}),pruneExpiredTrash:()=>trashFeature.pruneExpired(),leaveBookmarks,disconnectReaderHeadingObserver:()=>{main.__readerHeadingCleanup?.();main.__readerHeadingCleanup=null}}
});
legacyWorkspaceRenderer=workspaceViewFeature.legacyRenderer;
function ensureDraft(){return editorDraftController.ensureDraft()}
function prepareVueEditorPage(){editorWorkspace.prepareVueEditorPage()}
function ensureEditorCommands(){return editorWorkspace.ensureCommands()}
function renderEditorLegacy(){return editorWorkspace.renderLegacyEditor()}

function openTypeDialog(mode,id=null){
 noteTypeDialogs.open(mode,id);
}
async function saveTypeDialog(){
 await noteTypeDialogs.saveLegacy();
}
const systemThemeMedia=window.matchMedia?.('(prefers-color-scheme: dark)');
function closeThemeMenu(){workspaceShellStore.closeThemeMenu()}
const themeController=createWorkspaceTheme({document,media:systemThemeMedia,getThemePreference:()=>getVault().theme,updateThemePreference:preference=>mutateVault(vault=>{vault.theme=preference}),persist,setResolvedState:(preference,dark)=>workspaceShellStore.setThemeState(preference,dark)});
function applyTheme(mode,options={}){themeController.apply(mode,options)}
function toggleThemeMenu(){workspaceShellStore.toggleThemeMenu()}
const disposeTheme=themeController.mount();
function render(){workspaceViewFeature.render()}
const workspaceApplicationLifecycle=createWorkspaceApplicationLifecycle({lifecycle:{document,window,isLocal:!!initial.local,refreshCloud:()=>{void refreshCloud(snapshotCurrentVault)},pruneExpiredTrash:()=>trashFeature.cleanExpired()}});
function updateDraftFromDOM(){editorDraftController.updateFromEditor()}
function editorHasChanges(){return editorDraftController.hasChanges()}
function saveDraft(quiet=false){return editorDraftController.saveDraft(quiet)}
function scheduleSave(){editorAutosave.schedule()}
function flushEditorSave(){return editorAutosave.flush()}
function deleteEditorNote(){return editorDeleteWorkflow.removeCurrentNote()}

async function publishCurrentNote(){await notePublishing.publish()}
function syncToolbarState(editor){
 workspaceEditorToolbar.sync(editor);
}
function organizeDocumentActions(){workspaceEditorToolbar.organizeDocumentActions()}
function preferredPasteMode(){return normalizeEditorPasteMode(getVault().pasteMode)}
const captureDOM=createCaptureDOMAdapter({window,document,getPad:()=>$('#capturePad')});
const {captureSelection,insertHTML:insertCaptureHTML,insertText:insertCaptureText}=captureDOM;
const workspaceEditorFeature=createWorkspaceEditorFeature({
 toolbar:{
  usesVueWorkspace,document,window,
  getToolbar:()=>$('#editorToolbar'),getMain:()=>main,getElement:$,
  getEditing:()=>navigationStore.editing,getEditor:()=>richEditor,
  getCommands:()=>ensureEditorCommands(),
  setVueToolbarState:state=>editorDataStore.setToolbarState(state),
  icons,updateDraftFromDOM,scheduleSave
 },
 input:{
 htmlInserter:{getEditor:()=>richEditor,sanitize:html=>cleanHTML(html,true),afterInsert:()=>{updateDraftFromDOM();scheduleSave()}},
 editorInsert:{getEditor:()=>richEditor,openImagePicker:()=>$('#imageFile').click(),prompt:promptAction,safeUrl,escapeHTML:esc,toast},
 contentInsertion:{window,document,purifier:DOMPurify,getMode:id=>$('#'+id)?.value||'rich',classifyClipboard,plainTextToDocument,sanitizeMarkdownDocument,loadMarkdownTools,cleanHTML,plainTextToStructuredHTML,safeUrl,escapeHTML:esc,autofillPastedTitle,upload,getEditor:()=>richEditor,insertCaptureHTML,captureSelection,insertCaptureText,toast},
 attachmentUpload:{upload,escapeHTML:esc,notify:toast},
 slashMenu:{window,show:position=>editorDataStore.showSlashMenu(position),close:()=>editorDataStore.closeSlashMenu()},
 },
 runtime:{
  document,window,main,getElement:$,usesVueWorkspace,
  state:{getEditor:()=>richEditor,setEditor:editor=>{richEditor=editor},getEditorFactory:()=>editorFactory,setEditorFactory:factory=>{editorFactory=factory}},
  editorStore:editorDataStore,navigationStore,
  ensureDraft,getVault,
  getEditorOptions:()=>({noteTypes:getVault().noteTypes||[],categories:getVault().categories}),
  getPasteMode:preferredPasteMode,createSession:input=>editorSessionSnapshot(input),
  updateDraftFromDOM,scheduleSave,flushEditorSave,saveDraft,
  mutateVault,cleanHTML,escapeHTML:esc,isDraft,setBreadcrumb,displayTypeName,icons,toast
 },
 createRuntime:createWorkspaceEditorRuntime
});
({toolbar:workspaceEditorToolbar,input:editorInputFeature,runtime:editorWorkspace}=workspaceEditorFeature);
const editorToolbarEvents=workspaceEditorToolbar.events;
function insertHTML(html){return editorInputFeature.insertHTML(html)}
async function doInsert(kind){return editorInputFeature.insert(kind)}
function handleEditorPaste(payload){return editorInputFeature.handleEditorPaste(payload)}
function openSlashMenu(){editorInputFeature.openSlashMenu()}function closeSlashMenu(){editorInputFeature.closeSlashMenu()}function openSlashHint(){openSlashMenu()}
function storeImage(file,destination,bookmark=null,range=null){return editorInputFeature.storeImage(file,destination,bookmark,range)}
function pasteRich(event){return editorInputFeature.handleCapturePaste(event)}
captureFeature.bindPasteHandler(pasteRich);
function openCapture(options={}){captureFeature.open(options)}
function closeCapture(){captureFeature.close()}
async function saveCapture(){await captureFeature.saveLegacy()}
function openBackupHistory(){return backupFeature.openBackupHistory()}
function downloadBackupSnapshot(revision){return backupFeature.downloadSnapshot(revision)}
function restoreBackupSnapshot(revision){return backupFeature.restoreSnapshot(revision)}
function exportJSON(){return backupFeature.exportFullBackup()}
function importJSON(file){return backupFeature.importBackup(file)}
function toast(s){notificationDataStore.show(s)}
function closeAccountMenu(){workspaceShellStore.closeAccountMenu()}
function closeAccountSettings(){workspaceDialogControls.closeSettingsOverlays()}
const systemUpdates=createWorkspaceSystemUpdates({document,window,appVersion:APP_VERSION,getSystemVersion,getSystemUpdateStatus,requestSystemUpdate,flush,renderReleaseNotes,closeAccountMenu,closeAppSettings:()=>appSettings.close(),onDialogOpen:()=>browserHistory?.dialogChanged('version-info',true),onDialogClose:()=>browserHistory?.dialogChanged('version-info',false)});
const workspaceDialogControls=createWorkspaceDialogControls({profileSettings,appSettings,backupHistory:backupHistoryStore,systemUpdates,getElement:$});
bookmarkFeature.bindActions();
trashFeature.bindActions();
function signOut(){void accountSession.signOut()}
workspaceShellStore.setIdentity(initial.username||'本地预览',!!initial.local);
if(!initial.local)void profileSettings.refresh().catch(()=>{});
const workspaceUIRuntime=mountWorkspaceUIRuntime({
 history:{
 window,
 watch,
 navigationStore,
 dialogs:{appSettings,profileSettings,backupHistory:backupHistoryStore,systemUpdates},
 getNavigation:()=>navigationStore.getWorkspaceState(),
 restoreNavigation:(state,scrollY)=>workspaceNavigation.restoreFromHistory(state,scrollY),
 hasUnsavedEditorChanges:()=>navigationStore.editing&&editorHasChanges(),
 saveEditorBeforeLeaving:()=>{editorAutosave.clear();saveDraft(true);return flush()},
 confirmLeaveEditor:()=>confirmAction('当前笔记有修改，是否保存后离开？点击取消将继续编辑。',{title:'离开编辑',confirmText:'保存并离开'}),
 onInvalidRoute:()=>toast('笔记不存在、已删除或当前账号无权访问，已返回首页。'),
 watchAppSettings:callback=>watch(()=>appSettingsStore.open,callback),
 watchProfileSettings:callback=>watch(()=>profileSettingsStore.controller?.state.visible,open=>callback(!!open)),
 watchBackupHistory:callback=>watch(()=>backupHistoryStore.open,callback)
 },
 readerFragmentRoot:document.querySelector('#dashboardHost'),
 interactions:{
 usesVueWorkspace,
 document,window,
 staticDom:usesVueWorkspace?null:{closeCapture,closeCreateMenu:()=>legacyCreateMenu?.close(),handleCapturePaste:pasteRich,saveNoteType:saveTypeDialog},
 editorLifecycle:{isEditing:()=>navigationStore.editing,hasEditorChanges:editorHasChanges,saveDraft,hasUnsavedChanges:hasUnsaved},
 navigationEvents:workspaceNavigationEvents,
 editorToolbarEvents,
 shellEvents:workspaceShellEvents,
 contentEvents:workspaceContentEvents,
 editorFiles:{
  uploadAttachments:files=>editorInputFeature.insertAttachments(files),
  storeImages:async files=>{for(const file of files)await storeImage(file,'edit')}
 },
 importBackupFile:importJSON,
 keyboard:{
  isEditing:()=>navigationStore.editing,
  openGlobalSearch:workspaceSearch.openFromShortcut,
  saveDraft,
  updateEditorBaseline:()=>editorDataStore.setBaseline(editorContentSnapshot(navigationStore.editingDraft)),
  closeSearch,
  closeCapture,
  closeCreateMenu:()=>legacyCreateMenu?.close(),
  closeBackupHistory:()=>backupHistoryStore.close(),
  closeAccountSettings,
  closeThemeMenu,
  closeAccountMenu,
  closeWorkspaceMenu:()=>closeMenu(true),
  closeSlashMenu,
  openNote
 }
 }
});
const workspaceHistory=workspaceUIRuntime.history;
browserHistory=workspaceHistory.controller;
return workspaceApplicationLifecycle.startSession({
 session:{
  initial,
  theme:getVault().theme,
  currentVersion:APP_VERSION,
  vault:getVault(),
  applyTheme,
  render,
  renderVersionBadge:state=>systemUpdates.renderBadge(state),
  checkUpdates:()=>systemUpdates.check(),
  queueSave
 },
 dispose:{
  interactions:workspaceUIRuntime.disposeInteractions,
  theme:disposeTheme,
  clearAutosave:()=>editorAutosave.clear(),
  destroyEditor:destroyRichEditor,
  history:workspaceUIRuntime.disposeHistory,
  readerFragmentRestoration:workspaceUIRuntime.disposeReaderFragmentRestoration,
  skipToMainContent:disposeSkipToMainContent
 }
});
})();
}
