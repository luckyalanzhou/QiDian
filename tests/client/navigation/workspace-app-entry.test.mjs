import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspaceNoteTypeLabels } from '../../support/ui-fixtures.mjs';

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|vue)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('the web entry mounts one Vue root before loading application adapters', async () => {
  const main = await readFile(new URL('../../../src/main.ts', import.meta.url), 'utf8');
  const app = await readFile(new URL('../../../src/app/workspace-app.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../../../src/app/application.ts', import.meta.url), 'utf8');
  const composition = await readFile(new URL('../../../src/app/workspace-composition.js', import.meta.url), 'utf8');
  const workspaceSettingsActions = await readFile(new URL('../../../src/app/workspace-settings-actions.ts', import.meta.url), 'utf8');
  const workspaceProfileSettings = await readFile(new URL('../../../src/app/workspace-profile-settings.ts', import.meta.url), 'utf8');
  const workspaceDialogControls = await readFile(new URL('../../../src/app/workspace-dialog-controls.ts', import.meta.url), 'utf8');
  const workspaceNoteTypes = await readFile(new URL('../../../src/app/workspace-note-types.ts', import.meta.url), 'utf8');
  const workspaceNotePageActions = await readFile(new URL('../../../src/app/workspace-note-page-actions.ts', import.meta.url), 'utf8');
  const workspaceBackups = await readFile(new URL('../../../src/app/workspace-backups.ts', import.meta.url), 'utf8');
  const workspaceEditorFeature = await readFile(new URL('../../../src/app/workspace-editor-feature.ts', import.meta.url), 'utf8');
  const workspaceEditorRuntime = await readFile(new URL('../../../src/app/workspace-editor-runtime.ts', import.meta.url), 'utf8');
  const features = await readFile(new URL('../../../src/app/VueFeatures.vue', import.meta.url), 'utf8');
  const index = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');

  assert.match(index, /src="\/src\/main\.ts"/);
  assert.doesNotMatch(index, /appSettingsMount/);
  assert.match(main, /if \(!mountWorkspaceApp\(\)\) \{[\s\S]*role', 'alert'[\s\S]*replaceChildren\(message\)[\s\S]*throw new Error\('Vue 工作区挂载失败/);
  assert.match(main, /if \(!mountWorkspaceApp\(\)\)[\s\S]*await import\('\.\/app\/application\.ts'\)[\s\S]*await startApplication\(\)/);
  assert.doesNotMatch(main, /import\s+['"]\.\/app\.js['"]/);
  assert.doesNotMatch(main, /createApp\s*\(/);
  assert.equal((app.match(/createApp\(VueFeatures\)/g) || []).length, 1);
  assert.match(features, /import AppSettings from '\.\.\/features\/settings\/AppSettings\.vue'/);
  assert.match(features, /<AppSettings\s*\/>/);
  assert.match(features, /import ProfileSettings from '\.\.\/features\/account\/ProfileSettings\.vue'/);
  assert.match(features, /<ProfileSettings v-if="profileSettingsStore\.controller"/);
  assert.match(features, /import BackupHistoryDialog from '\.\.\/features\/settings\/BackupHistoryDialog\.vue'/);
  assert.match(features, /<BackupHistoryDialog v-if="backupHistoryStore\.options"\s*\/>/);
  assert.match(workspaceBackups, /backupHistoryStore\.configure\(/);
  assert.doesNotMatch(composition, /mountBackupHistoryList|backupHistoryList/);
  assert.match(workspaceProfileSettings, /dependencies\.store\.configure\(profile\)/);
  assert.match(workspaceProfileSettings, /\.\.\.dependencies\.api,[\s\S]*onProfileChange:/);
  assert.match(composition, /createWorkspaceProfileSettings\(\{[\s\S]*api:\{[\s\S]*getAccountProfile,[\s\S]*revokeExtensionToken/);
  assert.match(workspaceDialogControls, /function closeSettingsOverlays\(\)[\s\S]*profileSettings\.close\(\)[\s\S]*appSettings\.close\(\)[\s\S]*systemUpdates\.close\(\)/);
  assert.match(workspaceDialogControls, /function closeTarget\(id: string\)[\s\S]*backupHistory\.close\(\)[\s\S]*getElement\(`#\$\{id\}`\)/);
  assert.match(workspaceNoteTypes, /createWorkspaceNoteTypeLabels[\s\S]*type\.id === 'clip'[\s\S]*网页收藏[\s\S]*其他类型/);
  assert.doesNotMatch(composition, /type=>type\.id==='clip'/);
  assert.match(workspaceNotePageActions, /startEditing: \(\) => \{[\s\S]*navigationStore\.editing = true[\s\S]*render\(\)/);
  assert.doesNotMatch(composition, /startEditing:\(\)=>\{navigationStore\.editing=true/);
  assert.match(workspaceBackups, /saveActiveEditor: \(\) => \{[\s\S]*if \(!dependencies\.isEditing\(\)\) return;[\s\S]*dependencies\.clearAutosave\(\)[\s\S]*dependencies\.saveActiveDraft\(\)/);
  assert.doesNotMatch(composition, /saveActiveEditor:\(\)=>\{if\(navigationStore\.editing\)/);
  assert.doesNotMatch(composition, /id=>\{if\(id==='profileSettingsOverlay'\)/);
  assert.match(workspaceEditorFeature, /const afterEditorChange = \(editor[\s\S]*dependencies\.runtime\.updateDraftFromDOM\(\)[\s\S]*dependencies\.runtime\.scheduleSave\(\)[\s\S]*toolbar\.sync\(editor as[\s\S]*runtime\?\.refreshOutline\(editor as/);
  assert.match(workspaceEditorRuntime, /afterChange: editor => \{[\s\S]*dependencies\.afterEditorChange\(editor\)/);
  assert.doesNotMatch(composition, /onEditorChanged:/);
  assert.doesNotMatch(composition, /mountProfileSettings|profileSettingsMount/);
  assert.match(workspaceSettingsActions, /store\.bindActionHandler\(actions\.dispatch\)/);
  assert.doesNotMatch(composition, /mountAppSettings|appSettingsMount/);
  assert.match(app, /if \(!root\) return false;\s*if \(workspaceApp\) return true;/);
  assert.ok(app.indexOf('app.mount(root)') < app.indexOf('workspaceAppMounted = true'));
  assert.match(application, /bootstrapApplication[\s\S]*mountAuthenticationGate/);
  assert.match(application, /launchWorkspace/);
  assert.match(composition, /export function launchWorkspace\(initial, showAuthentication\)/);
  assert.doesNotMatch(composition, /await bootstrap\(\)|mountAuthenticationGate/);

  const sources = (await sourceFiles(fileURLToPath(new URL('../../../src/', import.meta.url)))).join('\n');
  assert.doesNotMatch(sources, /vue-islands/);
  assert.doesNotMatch(sources, /mountAppSettings|mount-app-settings|mountProfileSettings|mount-profile-settings|mountBackupHistoryList|mount-backup-history-list/);
});

test('workspace note type labels preserve the legacy clip name and fallback label', () => {
  const labels = createWorkspaceNoteTypeLabels(() => ({
    noteTypes: [
      { id: 'clip', name: '网页收藏' },
      { id: 'note', name: '网页收藏' }
    ]
  }));

  assert.equal(labels.displayTypeName({ id: 'clip', name: '网页收藏' }), '网页摘录');
  assert.equal(labels.displayTypeName({ id: 'note', name: '网页收藏' }), '网页收藏');
  assert.equal(labels.typeLabel('clip'), '网页摘录');
  assert.equal(labels.typeLabel('unknown'), '其他类型');
});
