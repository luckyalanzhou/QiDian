import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { createViteTestServer } from '../../support/vite-test-server.mjs';

test('backup import progress renders as a blocking accessible dialog with attachment progress', async t => {
  const server = await createViteTestServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    plugins: [vue()],
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const [{ default: BackupImportProgress }, { useBackupImportStore }] = await Promise.all([
    server.ssrLoadModule('/src/features/settings/BackupImportProgress.vue'),
    server.ssrLoadModule('/src/features/settings/backup-import-store.ts')
  ]);
  const pinia = createPinia();
  const store = useBackupImportStore(pinia);
  store.begin();
  store.setProgress({ stage: '正在验证备份文件' });
  const validationApp = createSSRApp(BackupImportProgress);
  validationApp.use(pinia);
  const validationHtml = await renderToString(validationApp);
  assert.match(validationHtml, /<h2 id="backupImportTitle">正在验证备份<\/h2>/);

  store.setProgress({ stage: '正在上传附件 2/3', current: 2, total: 3 });

  const app = createSSRApp(BackupImportProgress);
  app.use(pinia);
  const html = await renderToString(app);

  assert.match(html, /role="alertdialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /<h2 id="backupImportTitle">正在导入备份<\/h2>/);
  assert.match(html, /正在上传附件 2\/3/);
  assert.match(html, /<progress[^>]+value="2"[^>]+max="3"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /backup-import-overlay/);
});
