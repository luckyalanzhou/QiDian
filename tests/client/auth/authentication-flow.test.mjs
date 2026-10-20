import test from 'node:test';
import assert from 'node:assert/strict';
import { createViteTestServer as createServer } from '../../support/vite-test-server.mjs';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { renderToString } from 'vue/server-renderer';
import { fileURLToPath } from 'node:url';
import { createAuthenticationFlow } from '../../../src/features/auth/authentication-flow.ts';
import { createProfileSettingsFlow } from '../../../src/features/account/profile-settings-flow.ts';

function makeFlow(options = {}) {
  const counters = { configRequests: 0, bootstrapCalls: 0, registrations: [], launches: [], logins: [] };
  const result = options.result || { data: { notes: [] }, owner: 'account-test' };
  let flow;
  flow = createAuthenticationFlow({
    getAuthConfig: async () => {
      counters.configRequests++;
      if (options.configError) throw options.configError;
      return options.config || { registrationEnabled: true, setupRequired: false };
    },
    registerAccount: async (username, password) => counters.registrations.push({ username, password }),
    loginAccount: async (username, password, onStage) => {
      counters.logins.push({ username, password });
      for (const stage of options.stages || []) {
        onStage(stage);
        options.onStage?.(stage, flow.state.message);
      }
      return result;
    },
    bootstrap: async () => {
      counters.bootstrapCalls++;
      return result;
    },
    onAuthenticated: async authenticated => counters.launches.push(authenticated)
  });
  return { flow, counters, result };
}

test('authentication flow switches between login and registration using server policy', async () => {
  const { flow, counters } = makeFlow();
  await flow.show();
  assert.equal(counters.configRequests, 1);
  assert.equal(flow.state.mode, 'login');
  assert.equal(flow.state.registrationEnabled, true);
  flow.setMode('register');
  assert.equal(flow.state.mode, 'register');
  flow.state.password = 'Private-pass-1!';
  flow.setMode('login');
  assert.equal(flow.state.mode, 'login');
  assert.equal(flow.state.password, '', 'switching modes clears password fields');
});

test('registration can be disabled by the server and cannot be entered from the client', async () => {
  const { flow } = makeFlow({ config: { registrationEnabled: false, setupRequired: false } });
  await flow.show();
  flow.setMode('register');
  assert.equal(flow.state.registrationEnabled, false);
  assert.equal(flow.state.mode, 'login');
});

test('first-owner setup opens administrator creation without supplying a default password', async () => {
  const { flow } = makeFlow({ config: { registrationEnabled: true, setupRequired: true } });
  await flow.show();
  assert.equal(flow.state.mode, 'register');
  assert.equal(flow.state.username, 'admin');
  assert.equal(flow.state.password, '');
  assert.equal(flow.state.passwordConfirmation, '');
});

test('unauthenticated session policy avoids a second auth-config request', async () => {
  const { flow, counters } = makeFlow();
  await flow.show({ registrationEnabled: false, setupRequired: false });
  assert.equal(counters.configRequests, 0);
  assert.equal(flow.state.registrationEnabled, false);
});

test('registration creates the account, loads its vault and hands the authenticated result to the app', async () => {
  const { flow, counters, result } = makeFlow();
  await flow.show({ registrationEnabled: true, setupRequired: false });
  flow.setMode('register');
  flow.state.username = ' private_user ';
  flow.state.password = 'Private-pass-1!';
  flow.state.passwordConfirmation = 'Private-pass-1!';
  await flow.submit();
  assert.deepEqual(counters.registrations, [{ username: 'private_user', password: 'Private-pass-1!' }]);
  assert.equal(counters.bootstrapCalls, 1);
  assert.deepEqual(counters.launches, [result]);
  assert.equal(flow.state.visible, false);
  assert.equal(flow.state.loading, false);
});

test('login reports challenge stages and reuses the session returned by login', async () => {
  const stageMessages = [];
  const { flow, counters, result } = makeFlow({
    stages: ['challenge', 'derive', 'verify', 'load'],
    onStage: (_stage, message) => stageMessages.push(message)
  });
  await flow.show({ registrationEnabled: false, setupRequired: false });
  flow.state.username = 'alan';
  flow.state.password = 'Existing-password-1!';
  await flow.submit();
  assert.equal(counters.bootstrapCalls, 0);
  assert.deepEqual(counters.launches, [result]);
  assert.deepEqual(counters.logins, [{ username: 'alan', password: 'Existing-password-1!' }]);
  assert.deepEqual(stageMessages, ['正在连接验证服务…', '正在安全计算登录凭据…', '正在验证账号…', '正在载入私人空间…']);
  assert.equal(flow.state.message, '验证成功，正在载入你的知识库…');
  assert.equal(flow.state.succeeded, true);
});

test('reauthentication preserves the current workspace callback and can be opened again cleanly', async () => {
  const { flow } = makeFlow();
  let recovered;
  const recovery = {
    username: 'alan',
    authenticate: async (username, password, onStage) => {
      assert.equal(username, 'alan');
      assert.equal(password, 'Valid-password-2!');
      onStage('verify');
      return { data: { notes: [] }, conflict: false, synced: true };
    },
    onAuthenticated: result => { recovered = result; }
  };
  await flow.show(null, recovery);
  assert.equal(flow.state.username, 'alan');
  flow.state.password = 'Valid-password-2!';
  await flow.submit();
  assert.equal(recovered.synced, true);
  assert.equal(flow.state.visible, false);
  await flow.show(null, recovery);
  assert.equal(flow.state.visible, true);
  assert.equal(flow.state.password, '');
  assert.equal(flow.state.loading, false);
});

test('password mismatch and startup errors are visible without sending credentials', async () => {
  const { flow, counters } = makeFlow({ config: { registrationEnabled: true, setupRequired: false }, configError: new Error('配置接口暂不可用') });
  await flow.show({ registrationEnabled: true, setupRequired: false });
  flow.setMode('register');
  flow.state.password = 'Private-pass-1!';
  flow.state.passwordConfirmation = 'different';
  await flow.submit();
  assert.equal(flow.state.message, '两次输入的密码不一致');
  assert.equal(counters.registrations.length, 0);
  await flow.show(null);
  assert.equal(flow.state.startupError, '配置接口暂不可用');
});

test('Vue authentication, account profile and app settings components render accessible controls', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    plugins: [vue()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });
  t.after(() => server.close());
  const { default: AuthGate } = await server.ssrLoadModule('/src/features/auth/AuthGate.vue');
  const html = await renderToString(createSSRApp(AuthGate, {
    getAuthConfig: async () => ({ registrationEnabled: true, setupRequired: false }),
    registerAccount: async () => {},
    loginAccount: async () => ({ data: { notes: [] } }),
    bootstrap: async () => ({ data: { notes: [] } }),
    onAuthenticated: async () => {}
  }));
  assert.match(html, /id="authForm"/);
  assert.match(html, /id="authUsername"/);
  assert.match(html, /id="authPassword"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /注册账号/);

  const { default: ProfileSettings } = await server.ssrLoadModule('/src/features/account/ProfileSettings.vue');
  const profileFlow = createProfileSettingsFlow({
    local: false,
    username: 'alan',
    getAccountProfile: async () => ({ id:'account-1', username:'alan', created:1, avatarMime:null }),
    getAccountAvatar: async () => new Blob(),
    saveAccountAvatar: async () => {},
    removeAccountAvatar: async () => {},
    changeAccountPassword: async () => {}
  });
  const profileHtml = await renderToString(createSSRApp(ProfileSettings, { flow: profileFlow, local: false }));
  assert.match(profileHtml, /id="profileSettingsOverlay"/);
  assert.match(profileHtml, /id="currentPassword"/);
  assert.match(profileHtml, /id="newPassword"/);
  assert.match(profileHtml, /id="confirmNewPassword"/);
  assert.match(profileHtml, /aria-modal="true"/);
  assert.match(profileHtml, /移除头像/);

  const { default: AppSettings } = await server.ssrLoadModule('/src/features/settings/AppSettings.vue');
  const settingsApp = createSSRApp(AppSettings);
  settingsApp.use(createPinia());
  const settingsHtml = await renderToString(settingsApp);
  assert.match(settingsHtml, /id="appSettingsOverlay"/);
  assert.match(settingsHtml, /id="retrySync"/);
  assert.match(settingsHtml, /id="reloadCloud"/);
  assert.match(settingsHtml, /id="backupHistory"/);
  assert.match(settingsHtml, /id="exportBtn"/);
  assert.match(settingsHtml, /id="importBtn"/);
  assert.match(settingsHtml, /aria-modal="true"/);

  const { default: MobileNavigation } = await server.ssrLoadModule('/src/features/navigation/MobileNavigation.vue');
  const mobileApp = createSSRApp(MobileNavigation);
  mobileApp.use(createPinia());
  const mobileHtml = await renderToString(mobileApp);
  assert.match(mobileHtml, /aria-label="手机导航"/);
  assert.match(mobileHtml, /id="mobileHome"[^>]+aria-current="page"/);
  assert.match(mobileHtml, /id="mobileCats"/);
  assert.match(mobileHtml, /id="mobileBookmarks"/);
  assert.match(mobileHtml, /id="mobileSearch"/);
});
