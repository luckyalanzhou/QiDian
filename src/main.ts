import { mountWorkspaceApp } from './app/workspace-app';

// Mount one Vue application before its application adapters are initialized.
if (!mountWorkspaceApp()) {
  const message = document.createElement('main');
  message.className = 'app-startup-error';
  message.setAttribute('role', 'alert');
  message.textContent = '栖点界面初始化失败，请刷新页面；如果问题仍然存在，请检查安装文件是否完整。';
  document.body.replaceChildren(message);
  throw new Error('Vue 工作区挂载失败：找不到 #qidianVueIslands 容器');
}
const { startApplication } = await import('./app/application.ts');
await startApplication();
