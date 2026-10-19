import test from 'node:test';
import assert from 'node:assert/strict';
import { createViteTestServer as createServer } from './vite-test-server.mjs';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { renderToString } from 'vue/server-renderer';
import { useWorkspaceShellStore } from '../src/features/navigation/workspace-shell-store.ts';

test('Vue breadcrumb renders the title owned by the workspace shell store', async t => {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [vue()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });
  t.after(() => server.close());

  const { default: WorkspaceBreadcrumb } = await server.ssrLoadModule('/src/features/navigation/WorkspaceBreadcrumb.vue');
  const pinia = createPinia();
  const shell = useWorkspaceShellStore(pinia);
  shell.setBreadcrumbTitle('书签导航');
  const context = {};

  await renderToString(createSSRApp(WorkspaceBreadcrumb).use(pinia), context);

  assert.match(context.teleports['#breadcrumbTitleIsland'], /<span class="breadcrumb-root">我的空间<\/span>/);
  assert.match(context.teleports['#breadcrumbTitleIsland'], /<span class="breadcrumb-separator" aria-hidden="true"> \/ <\/span>/);
  assert.match(context.teleports['#breadcrumbTitleIsland'], /<strong id="breadcrumbTitle">书签导航<\/strong>/);
  shell.setBreadcrumbTitle('首页');
  const homeContext = {};
  await renderToString(createSSRApp(WorkspaceBreadcrumb).use(pinia), homeContext);
  assert.match(homeContext.teleports['#breadcrumbTitleIsland'], /class="breadcrumb-root" hidden/);
  assert.match(homeContext.teleports['#breadcrumbTitleIsland'], /class="breadcrumb-separator" aria-hidden="true" hidden/);
  assert.match(homeContext.teleports['#breadcrumbTitleIsland'], /<strong id="breadcrumbTitle">首页<\/strong>/);
  shell.setBreadcrumbTitle('<script>unsafe</script>');
  const escapedContext = {};
  await renderToString(createSSRApp(WorkspaceBreadcrumb).use(pinia), escapedContext);
  assert.match(escapedContext.teleports['#breadcrumbTitleIsland'], /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(escapedContext.teleports['#breadcrumbTitleIsland'], /<script>/);
});
