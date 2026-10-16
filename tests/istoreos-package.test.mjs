import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('iStoreOS run payload stays lightweight and contains persistent manager UI and Compose files', async () => {
  const builder = await read('../packaging/istoreos/build-run.sh');
  assert.match(builder, /PAYLOAD\/root/);
  assert.match(builder, /"\$ROOT_DIR\/packaging\/istoreos\/compose\.yaml" "\$PAYLOAD\/compose\.yaml"/);
  assert.match(builder, /luci-app-qidian\/root/);
  assert.doesNotMatch(builder, /Dockerfile|pnpm-lock|PAYLOAD\/app|sqlite-adapter/);
  assert.match(builder, /OUTPUT_DIR=\$\{1:-"\$ROOT_DIR\/artifacts\/istoreos"\}/);
  assert.match(builder, /OUTPUT="\$OUTPUT_DIR\/qidian-\$\{VERSION\}\.run"/);
  assert.ok(builder.includes('=~ ^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'), 'package versions use unbounded canonical SemVer integers');
  assert.match(builder, /sha256sum "\$\(basename -- "\$OUTPUT"\)"/);
});

test('iStoreOS release is manual and uses package.json as its single version source', async () => {
  const workflow = await read('../.github/workflows/istoreos-release.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_notes:/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /## 本版优化与新增/);
  assert.match(workflow, /while \[\[ "\$detail" =~/);
  assert.match(workflow, /prefix=\$\{BASH_REMATCH\[0\]\}/);
  assert.match(workflow, /--notes-file "\$notes_file"/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /Verify publishing secrets/);
  assert.match(workflow, /test -n "\$DOCKERHUB_TOKEN"/);
  assert.match(workflow, /test -n "\$RELEASE_PUBLISH_TOKEN"/);
  assert.match(workflow, /Select or resume release version/);
  assert.doesNotMatch(workflow, /openwrt\/gh-action-sdk|artifacts\/openwrt|\.ipk|\.apk/);
  assert.match(workflow, /release_bump:[\s\S]*?options:[\s\S]*?- patch[\s\S]*?- minor[\s\S]*?- major[\s\S]*?default: patch/);
  assert.match(workflow, /node scripts\/release-version\.mjs/);
  assert.match(workflow, /RELEASE_PUBLISH_TOKEN/);
  assert.match(workflow, /Commit version bump to main/);
  assert.match(workflow, /sha256sum --check/);
  assert.match(workflow, /docker\/login-action@v3/);
  assert.match(workflow, /username: luckyalanzhou/);
  assert.match(workflow, /password: \$\{\{ secrets\.DOCKERHUB_TOKEN \}\}/);
  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /platforms: linux\/amd64,linux\/arm64/);
  assert.match(workflow, /cache: pnpm/);
  assert.match(workflow, /cache-dependency-path: pnpm-lock\.yaml/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /DOCKER_BUILD_RECORD_UPLOAD: false/);
  assert.match(workflow, /setup-qemu-action@v3[\s\S]*?platforms: arm64/);
  assert.match(workflow, /pnpm install --frozen-lockfile --prefer-offline/);
  assert.ok(workflow.indexOf('name: Verify source') < workflow.indexOf('docker/setup-qemu-action@v3'), 'source verification fails before Docker emulation setup');
  assert.ok(workflow.indexOf('name: Smoke-test self-hosted container') < workflow.indexOf('name: Sign in to Docker Hub'), 'Docker Hub login happens only after the local smoke test');
  assert.match(workflow, /Build amd64 image for smoke test[\s\S]*?platforms: linux\/amd64[\s\S]*?load: true/);
  assert.doesNotMatch(workflow, /docker build --pull/);
  assert.match(workflow, /cache-from: type=gha,scope=qidian-image/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=qidian-image/);
  assert.match(workflow, /docker\.io\/luckyalanzhou\/qidian:\$\{\{ steps\.version\.outputs\.version \}\}/);
  assert.match(workflow, /docker\.io\/luckyalanzhou\/qidian:latest/);
  assert.match(workflow, /gh release create "\$tag" --draft/);
  assert.match(workflow, /gh release upload "\$tag"/);
  assert.match(workflow, /--clobber/);
  assert.match(workflow, /\.assets\[\] \| \(\.label \/\/ \.name\)/);
  assert.match(workflow, /git\/refs\/tags\/\$\{tag\}/);
  assert.match(workflow, /--method PATCH/);
  assert.match(workflow, /gh release edit "\$tag".*--draft=false/);
  assert.match(workflow, /Prepare release checksum with the public asset name/);
  assert.match(workflow, /run\.release\.sha256#栖点-/);
  assert.match(workflow, /qidian-\$\{version\}\.run#栖点-\$\{version\}\.run/);
  assert.match(workflow, /run\.release\.sha256#栖点-/);
  assert.match(workflow, /qidian-\$\{version\}\.run#栖点-\$\{version\}\.run/);
  assert.match(workflow, /for expected in "栖点-\$\{version\}\.run" "栖点-\$\{version\}\.run\.sha256"/);
  assert.match(workflow, /git add package\.json/);
  assert.equal((workflow.match(/gh release upload/g) ?? []).length, 1);
  assert.match(workflow, /gh release upload "\$tag"[\s\S]*?qidian-\$\{version\}\.run[\s\S]*?qidian-\$\{version\}\.run\.release\.sha256/);
});

test('the iStoreOS self-extracting installer installs the LuCI manager and records its version', async () => {
  const installer = await read('../packaging/istoreos/install.sh');

  assert.match(installer, /cp -a "\$SCRIPT_DIR\/root\/usr\/\." \/usr\//);
  assert.match(installer, /cat "\$SCRIPT_DIR\/version"/);
  assert.match(installer, /qidian\.sh prepare-control/);
  assert.match(installer, /qidian-updater enable/);
  assert.match(installer, /command -v jsonfilter/);
  assert.doesNotMatch(installer, /qidian-package-manager|docker build|compose up|rm -rf/i);
});

test('reinstall preserves LuCI config and never starts or removes note data', async () => {
  const installer = await read('../packaging/istoreos/install.sh');
  assert.match(installer, /HAD_CONFIG=false/);
  assert.match(installer, /HAD_ENV=false/);
  assert.match(installer, /if \[ "\$HAD_ENV" = true \]; then/);
  assert.match(installer, /registration_enabled=0/);
  assert.match(installer, /OLD_REGISTRATION/);
  assert.match(installer, /if \[ "\$HAD_CONFIG" = false \]; then/);
  assert.match(installer, /cp -a "\$SCRIPT_DIR\/root\/usr\/\." \/usr\//);
  assert.match(installer, /cp -a "\$SCRIPT_DIR\/root\/etc\/init\.d\/\." \/etc\/init\.d\//);
  assert.doesNotMatch(installer, /docker build|compose up|rm -rf/i);
  assert.match(installer, /qidian\.sh prepare-control/);
  assert.match(installer, /qidian-updater enable/);
  assert.doesNotMatch(installer, /SCRIPT_DIR\/app|cp -a "\$SCRIPT_DIR\/app/);
});

test('web updates use a limited host agent, verify the public release checksum, and never mount Docker socket', async () => {
  const compose = await read('../packaging/istoreos/compose.yaml');
  const updater = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian-updater.sh');
  const init = await read('../packaging/istoreos/luci-app-qidian/root/etc/init.d/qidian-updater');
  const dockerfile = await read('../Dockerfile');

  assert.match(updater, /api\.github\.com\/repos\/\$REPOSITORY\/releases\/latest/);
  assert.match(updater, /@\.assets\[@\.label='\$asset_label'\]/);
  assert.match(updater, /@\.assets\[@\.name='\$asset_name'\]/);
  assert.match(updater, /sha256sum -c/);
  assert.match(updater, /栖点-\$version\.run/);
  assert.match(updater, /browser_download_url/);
  assert.match(updater, /archive="栖点-\$version\.run"/);
  assert.match(updater, /asset_name="qidian-\$version\.run"/);
  assert.match(updater, /checksum_asset_name="qidian-\$version\.run\.release\.sha256"/);
  assert.match(updater, /QIDIAN_UPDATE_WORKER=1 "\.\/\$archive"/);
  assert.doesNotMatch(updater, /update_format=(?:ipk|apk)|opkg install|apk add --allow-untrusted/);
  assert.ok(updater.includes("grep -Eq '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'"), 'updater validates canonical SemVer integers without fixed limits');
  assert.match(updater, /mkdir "\$OPERATION_LOCK"/);
  assert.match(updater, /rmdir "\$OPERATION_LOCK"/);
  assert.match(updater, /网页更新锁已失效/);
  assert.match(await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh'), /QIDIAN_UPDATE_WORKER:-0/);
  assert.match(updater, /qidian\.sh install/);
  assert.match(updater, /拉取成品镜像/);
  assert.match(init, /procd_set_param command \/usr\/libexec\/istorec\/qidian-updater\.sh serve/);
  assert.match(compose, /QIDIAN_UPDATE_REQUEST_PATH:\?[^\n]*:\/run\/qidian-update-inbox/);
  assert.match(compose, /QIDIAN_UPDATE_STATUS_PATH:\?[^\n]*:\/run\/qidian-update-status:ro/);
  assert.doesNotMatch(compose, /docker\.sock/);
  assert.match(dockerfile, /ARG QIDIAN_VERSION/);
  assert.match(dockerfile, /FROM --platform=\$BUILDPLATFORM node:24-bookworm-slim AS build/);
  assert.match(dockerfile, /--mount=type=cache,id=pnpm-store,target=\/pnpm\/store/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile --prefer-offline/);
});

test('generic Docker install uses a device-managed named volume and has no host updater privileges', async () => {
  const compose = await read('../packaging/docker/compose.yaml');
  const environment = await read('../packaging/docker/env.example');

  assert.match(compose, /docker\.io\/luckyalanzhou\/qidian:latest/);
  assert.match(compose, /- qidian-data:\/data/);
  assert.match(compose, /name: qidian-data/);
  assert.match(compose, /APP_PORT:-9908/);
  assert.doesNotMatch(compose, /docker\.sock|QIDIAN_UPDATE_REQUEST|QIDIAN_UPDATE_STATUS/);
  assert.doesNotMatch(compose, /build:/);
  assert.doesNotMatch(environment, /\/mnt\/|\/var\/lib\/docker/);
});

test('LuCI service manager defaults to 9908 and guards Docker-mounted knowledge data', async () => {
  const model = await read('../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/model/cbi/qidian.lua');
  const manager = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh');
  const controller = await read('../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/controller/qidian.lua');

  assert.match(controller, /admin", "services", "qidian/);
  assert.match(model, /port\.default = "9908"/);
  assert.match(model, /HTTP|端口/);
  assert.match(manager, /data_dir=\$docker_root\/volumes\/qidian\/data/);
  assert.match(manager, /data_dir" = \/var\/lib\/docker\/volumes\/qidian\/data/);
  assert.match(manager, /\.qidian-storage/);
  assert.match(manager, /compose down/);
  assert.doesNotMatch(manager, /rm -rf|docker volume rm/);
  assert.match(manager, /control_dir=\$data_dir\/\.qidian-update-control/);
  assert.match(manager, /mv -f "\$old_dir\/\$filename"/);
  assert.match(model, /Docker 与 Compose 已就绪/);
  assert.match(model, /translate\("运行依赖"\)/);
  assert.match(model, /Flag, "registration_enabled"/);
  assert.doesNotMatch(model, /remove\.description\s*=/, 'keep the uninstall data-retention warning in one place before confirmation');
  assert.ok(model.indexOf('local install = s:option(Button') < model.indexOf('local port = s:option(Value'), 'put the primary install/update action before less-frequent settings');
  assert.doesNotMatch(model, /data_path_display/, 'show the detected Docker data directory once in the service overview');
  assert.match(manager, /account-status\) account_status/);
  assert.match(manager, /set_env REGISTRATION_ENABLED/);
  assert.match(manager, /IMAGE_REPOSITORY=docker\.io\/luckyalanzhou\/qidian/);
  assert.match(manager, /set_env QIDIAN_IMAGE "\$IMAGE_REPOSITORY:latest"/);
  assert.match(manager, /image_name=\$IMAGE_REPOSITORY:latest/);
  assert.match(manager, /docker pull "\$image_name"/);
  assert.doesNotMatch(manager, /docker build/);
});

test('Docker service and LuCI use HTTP 9908 without requiring certificates', async () => {
  const dockerfile = await read('../Dockerfile');
  const compose = await read('../packaging/istoreos/compose.yaml');
  const manager = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh');
  const installer = await read('../packaging/istoreos/install.sh');
  const view = await read('../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/view/qidian/status.htm');

  assert.match(dockerfile, /node:http.*http:\/\/127\.0\.0\.1:9908\/healthz/);
  assert.match(compose, /APP_PORT:-9908/);
  assert.match(compose, /QIDIAN_DATA_PATH:\?请先在LuCI执行安装或更新/);
  assert.match(compose, /QIDIAN_IMAGE:\?请先在LuCI执行安装或更新/);
  assert.doesNotMatch(compose, /TLS_CERT_PATH|TLS_KEY_PATH|certs\//);
  assert.doesNotMatch(manager, /openssl req|QIDIAN_CERT_PATH|QIDIAN_KEY_PATH/);
  assert.match(installer, /默认访问端口：9908（HTTP）/);
  assert.ok(view.includes('href="http://localhost:'));
  assert.ok(view.includes('"http://" + window.location.hostname'));
});

test('LuCI separates service, deployment config, and operation logs in one page', async () => {
  const base = '../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/';
  const controller = await read(`${base}controller/qidian.lua`);
  const model = await read(`${base}model/cbi/qidian.lua`);
  const service = await read(`${base}view/qidian/status.htm`);

  assert.match(controller, /entry\(\{"admin", "services", "qidian"\}, cbi\("qidian"\)/);
  assert.doesNotMatch(controller, /"qidian", "logs"/);
  assert.doesNotMatch(service, /href="<%=logs_url%>"/);
  assert.match(controller, /"qidian", "log-data"}, call\("log_data"\)/);
  assert.match(service, /class="cbi-tabcontainer"/);
  assert.match(service, /data-tab="service" data-tab-title="<%:服务%>"/);
  assert.match(service, /data-tab="config" data-tab-title="<%:部署与配置%>"/);
  assert.match(service, /data-tab="logs" data-tab-title="<%:日志%>"/);
  assert.doesNotMatch(service, /qidian-tabs|qidian-tab-panel|qidian-tab-service|qidian-tab-config|qidian-tab-logs/);
  assert.match(service, /id="qidian-panel-config"/);
  assert.match(service, /addEventListener\("cbi-tab-active"/);
  assert.match(service, /function showNativeTab\(name\)/);
  assert.match(service, /installConfigSlot\.appendChild\(installSection\)/);
  assert.doesNotMatch(service, /optionsSection\.hidden = showLogs/);
  assert.match(model, /m:section\(NamedSection, "main", "qidian", translate\("部署设置"\)\)/);
  assert.doesNotMatch(model, /s\.description\s*=/, 'avoid repeating field guidance above the deployment form');
  assert.match(service, /class="cbi-section qidian-service-hero"/);
  assert.match(service, /class="cbi-value-title"/);
  assert.match(service, /id="qidian-service-operations" class="cbi-section/);
  assert.match(service, /serviceActionFields\.appendChild\(field\)/);
  assert.doesNotMatch(service, /<details|<summary|advanced-actions-content|仅在需要重置密码时展开/);
  assert.match(service, /id="qidian-modal-show-logs"/);
  assert.match(service, /qidian-data-path/);
  assert.match(service, /name\$="\.' \+ suffix/);
  assert.match(service, /name\$="\._remove"/);
  assert.match(service, /window\.confirm\("卸载栖点容器/);
  assert.match(service, /id="qidian-account-tools" class="cbi-section/);
  assert.match(service, /qidian-install-modal/);
  assert.match(service, /tail -c 65536/);
  assert.match(service, /if \(busy\) pollLog\(\)/);
  assert.match(service, /event\.key === "Escape"/);
  assert.match(service, /<%:打开栖点%>/);
  assert.match(service, /openLabel\.textContent = "打开栖点"/);
  assert.doesNotMatch(service, /打开栖点并创建管理员/);
  assert.match(service, /docker exec -it qidian node server\/reset-password\.mjs/);
  assert.match(service, /navigator\.clipboard/);
  assert.match(service, /栖点服务运行中/);
  assert.match(service, /操作日志/);
  assert.match(service, /上次操作成功/);
  assert.match(service, /暂无操作记录/);
  assert.match(service, /管理员密码重置/);
  assert.match(service, /知识库数据、附件、证书和配置会保留/);
  assert.match(service, /#qidian-service-description:empty/);
  assert.match(service, /前往“部署与配置”页安装服务，或在本页启动服务/);
  assert.doesNotMatch(service, /操作已完成|等待操作|正在部署栖点|部署已完成|安装 \/ 更新过程|请保持页面打开|最近一次操作的实时输出/);
  assert.match(service, /window\.setTimeout\(pollLog, 1800\)/);
  assert.match(service, /qidian-log-state-text/);
  assert.doesNotMatch(service, /qidian-console-dots/);
  assert.match(service, /qidian-log-card-foot/);
  assert.match(service, /id="qidian-log-updated"/);
  assert.match(service, /panelFollowLog/);
  assert.match(service, /if \(panelFollowLog\) panelLog\.scrollTop = panelLog\.scrollHeight/);
  assert.doesNotMatch(service, /atBottom \|\| data\.busy|panelAtBottom \|\| data\.busy/);
  assert.match(service, /\.qidian-operation-log[^}]+background:var\(--qidian-surface\); color:var\(--qidian-ink\)/);
  assert.match(service, /\.qidian-console-bar[^}]+background:var\(--qidian-surface-soft\); color:var\(--qidian-ink\)/);
  assert.doesNotMatch(service, /\.qidian-operation-log\s*\{[^}]*background:#111/);
  assert.doesNotMatch(service, /\.qidian-install-section \.cbi-value\s*\{/);
  assert.doesNotMatch(service, /\.qidian-service-details\s*\{[^}]*display:grid/);
  assert.match(service, /max-width: 1320px;/, 'the plugin content stays readable on ultrawide LuCI viewports');
  assert.match(service, /--qidian-ink: var\(--text-color-high/);
  assert.match(service, /--qidian-blue: var\(--primary-color-high/);
  assert.match(service, /--qidian-surface: var\(--background-color-high/);
  assert.match(service, /--qidian-success: var\(--success-color-high/);
  assert.ok(service.includes('argon\\/css\\/dark\\.css'), 'Argon dark mode follows the theme stylesheet instead of guessing from rendered brightness');
  assert.match(service, /\.qidian-service-page\.is-argon-dark \{[^}]*--qidian-surface:\s*#1e1e1e/);
  assert.doesNotMatch(service, /luminance|background\.match\(\/rgba\?/, 'theme detection does not infer mode from computed page brightness');
  assert.match(service, /class="cbi-button cbi-button-apply qidian-open-button"/);
  assert.match(service, /@media\(min-width:701px\)[\s\S]*?\.qidian-service-page #qidian-panel-service > \.cbi-section \.cbi-value \{ display:grid; grid-template-columns:minmax\(130px,175px\)/);
  assert.match(service, /@media\(min-width:1100px\)[\s\S]*?#qidian-panel-service\[data-tab-active="true"\] \{ display:grid; grid-template-columns:minmax\(0,1\.1fr\) minmax\(0,\.9fr\)/);
  assert.match(service, /id="qidian-copy-path"/);
  assert.match(service, /max-height:180px[^}]+white-space:pre-wrap/, 'the install log stays compact and wraps long lines on phones');
  assert.match(service, /max-height:min\(42vh,320px\)[^}]+-webkit-overflow-scrolling:touch/, 'the inline LuCI log panel stays bounded on phones');
  assert.match(service, /@media\(max-width:700px\)[\s\S]*?\.qidian-service-page #qidian-panel-service > \.qidian-service-details\.cbi-section > \.cbi-value \{ display:grid; grid-template-columns:minmax\(86px,\.38fr\)/, 'mobile service details align labels and values compactly');
  assert.match(service, /#qidian-service-action-fields \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'mobile service actions form a compact three-button group');
  assert.match(service, /qidian-account-tools \.qidian-command-row code \{[^}]*white-space:pre-wrap; overflow-wrap:anywhere; user-select:all/, 'the account reset command wraps and remains selectable on phones');
  assert.match(service, /max-height:min\(42vh,320px\)[^}]*overflow-wrap:normal; word-break:normal/, 'log lines wrap at spaces without splitting long hashes');
  const inlineScript = service.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(inlineScript, 'LuCI view includes its in-page interaction script');
  const renderedScript = inlineScript
    .replaceAll('<%=util.pcdata(port)%>', '9908')
    .replaceAll('<%=busy and "true" or "false"%>', 'false')
    .replaceAll('<%=initial_tab%>', 'service')
    .replaceAll('<%=util.pcdata(account_status)%>', 'ready')
    .replaceAll('<%=log_endpoint%>', '/admin/services/qidian/log-data');
  assert.doesNotThrow(() => new Function(renderedScript), 'LuCI inline JavaScript parses after template interpolation');

  const updater = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian-updater.sh');
  assert.match(updater, /while \[ ! -f "\$result_file" \]/);
  assert.match(updater, /正在下载：已接收/);
});
