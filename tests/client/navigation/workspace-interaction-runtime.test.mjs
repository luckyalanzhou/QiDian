import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountWorkspaceInteractionRuntime } from '../../../src/features/lifecycle/workspace-interaction-runtime.ts';

test('workspace interaction runtime installs one session of handlers and removes them idempotently', () => {
  const dom = new JSDOM(`
    <div id="slashMenu"></div>
    <div id="capturePad" contenteditable="true"></div>
    <div id="typeDialogBody"><input id="typeNameInput"></div>
    <div id="captureOverlay"></div>
    <div id="typeOverlay"></div>
    <div id="categoryOverlay"></div>
    <div id="overlay" class="overlay open"><button id="first"></button><button id="last"></button></div>
    <button id="generic"></button>
    <input id="attachmentFile" type="file">
  `, { pretendToBeVisual: true });
  const { document, Event, KeyboardEvent } = dom.window;
  const calls = { paste: 0, saveType: 0, route: 0, change: 0, editorSave: 0 };
  const dispose = mountWorkspaceInteractionRuntime({
    document,
    window: dom.window,
    staticDom: {
      closeCapture: () => undefined,
      handleCapturePaste: () => { calls.paste++; },
      saveCategory: () => undefined,
      saveNoteType: () => { calls.saveType++; }
    },
    editorLifecycle: {
      isEditing: () => false,
      hasEditorChanges: () => false,
      saveDraft: () => { calls.editorSave++; },
      hasUnsavedChanges: () => false
    },
    routeHandlers: [() => { calls.route++; return true; }],
    handleChange: () => { calls.change++; },
    editorFiles: { uploadAttachments: () => undefined, storeImages: () => undefined },
    importBackupFile: () => undefined,
    keyboard: {
      isEditing: () => false,
      toggleCommandPalette: () => undefined,
      saveDraft: () => undefined,
      updateEditorBaseline: () => undefined,
      closeSearch: () => undefined,
      closeCapture: () => undefined,
      closeBackupHistory: () => undefined,
      closeAccountSettings: () => undefined,
      closeThemeMenu: () => undefined,
      closeAccountMenu: () => undefined,
      closeWorkspaceMenu: () => undefined,
      closeSlashMenu: () => undefined,
      openNote: () => undefined
    }
  });

  document.querySelector('#capturePad').dispatchEvent(new Event('paste', { bubbles: true }));
  document.querySelector('#typeNameInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  document.querySelector('#generic').dispatchEvent(new Event('click', { bubbles: true }));
  document.querySelector('#attachmentFile').dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual(calls, { paste: 1, saveType: 1, route: 1, change: 1, editorSave: 0 });

  dispose();
  dispose();
  document.querySelector('#capturePad').dispatchEvent(new Event('paste', { bubbles: true }));
  document.querySelector('#typeNameInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  document.querySelector('#generic').dispatchEvent(new Event('click', { bubbles: true }));
  document.querySelector('#attachmentFile').dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual(calls, { paste: 1, saveType: 1, route: 1, change: 1, editorSave: 0 });

  dom.window.close();
});

test('Vue workspace runtime can omit legacy static DOM and empty click/change adapters', () => {
  const dom = new JSDOM('<div id="capturePad" contenteditable="true"></div><div id="typeDialogBody"><input id="typeNameInput"></div><button id="generic"></button>');
  const { document } = dom.window;
  const dispose = mountWorkspaceInteractionRuntime({
    document,
    window: dom.window,
    staticDom: null,
    editorLifecycle: {
      isEditing: () => false,
      hasEditorChanges: () => false,
      saveDraft: () => undefined,
      hasUnsavedChanges: () => false
    },
    routeHandlers: [],
    handleChange: null,
    editorFiles: { uploadAttachments: () => undefined, storeImages: () => undefined },
    importBackupFile: () => undefined,
    keyboard: {
      isEditing: () => false,
      toggleCommandPalette: () => undefined,
      saveDraft: () => undefined,
      updateEditorBaseline: () => undefined,
      closeSearch: () => undefined,
      closeCapture: () => undefined,
      closeBackupHistory: () => undefined,
      closeAccountSettings: () => undefined,
      closeThemeMenu: () => undefined,
      closeAccountMenu: () => undefined,
      closeWorkspaceMenu: () => undefined,
      closeSlashMenu: () => undefined,
      openNote: () => undefined
    }
  });

  document.querySelector('#capturePad').dispatchEvent(new dom.window.Event('paste', { bubbles: true }));
  document.querySelector('#typeNameInput').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  document.querySelector('#generic').click();
  dispose();
  dom.window.close();
});
