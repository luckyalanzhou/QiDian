import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/workspace-app.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../src/application.ts', import.meta.url), 'utf8');
  const composition = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const features = await readFile(new URL('../src/VueFeatures.vue', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(index, /src="\/src\/main\.ts"/);
  assert.doesNotMatch(index, /appSettingsMount/);
  assert.match(main, /if \(!mountWorkspaceApp\(\)\) \{[\s\S]*role', 'alert'[\s\S]*replaceChildren\(message\)[\s\S]*throw new Error\('Vue 工作区挂载失败/);
  assert.match(main, /if \(!mountWorkspaceApp\(\)\)[\s\S]*await import\('\.\/application\.ts'\)[\s\S]*await startApplication\(\)/);
  assert.doesNotMatch(main, /import\s+['"]\.\/app\.js['"]/);
  assert.doesNotMatch(main, /createApp\s*\(/);
  assert.equal((app.match(/createApp\(VueFeatures\)/g) || []).length, 1);
  assert.match(features, /import AppSettings from '\.\/features\/settings\/AppSettings\.vue'/);
  assert.match(features, /<AppSettings\s*\/>/);
  assert.match(features, /import ProfileSettings from '\.\/features\/account\/ProfileSettings\.vue'/);
  assert.match(features, /<ProfileSettings v-if="profileSettingsStore\.controller"/);
  assert.match(features, /import BackupHistoryDialog from '\.\/features\/settings\/BackupHistoryDialog\.vue'/);
  assert.match(features, /<BackupHistoryDialog v-if="backupHistoryStore\.options"\s*\/>/);
  assert.match(composition, /backupHistoryStore\.configure\(/);
  assert.doesNotMatch(composition, /mountBackupHistoryList|backupHistoryList/);
  assert.match(composition, /profileSettingsStore\.configure\(/);
  assert.doesNotMatch(composition, /mountProfileSettings|profileSettingsMount/);
  assert.match(composition, /appSettingsStore\.bindActionHandler\(appSettingsActions\.dispatch\)/);
  assert.doesNotMatch(composition, /mountAppSettings|appSettingsMount/);
  assert.match(app, /if \(!root\) return false;\s*if \(workspaceApp\) return true;/);
  assert.ok(app.indexOf('app.mount(root)') < app.indexOf('workspaceAppMounted = true'));
  assert.match(application, /bootstrapApplication[\s\S]*mountAuthenticationGate/);
  assert.match(application, /launchWorkspace/);
  assert.match(composition, /export function launchWorkspace\(initial, showAuthentication\)/);
  assert.doesNotMatch(composition, /await bootstrap\(\)|mountAuthenticationGate/);

  const sources = (await sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))).join('\n');
  assert.doesNotMatch(sources, /vue-islands/);
  assert.doesNotMatch(sources, /mountAppSettings|mount-app-settings|mountProfileSettings|mount-profile-settings|mountBackupHistoryList|mount-backup-history-list/);
});
