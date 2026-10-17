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
  assert.match(workflow, /curl --fail --silent http:\/\/127\.0\.0\.1:9908\/readyz/);
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
  assert.match(workflow, /gh release edit "v\$\{VERSION\}" --draft=false --latest/);
  assert.match(workflow, /docker buildx imagetools create/);
  assert.ok(workflow.indexOf('name: Prepare verified GitHub Release') < workflow.indexOf('name: Publish verified GitHub Release'));
  assert.ok(workflow.indexOf('name: Publish verified GitHub Release') < workflow.indexOf('name: Promote released image to latest'));
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
  assert.match(compose, /TRUST_PROXY: \$\{TRUST_PROXY:-false\}/);
  assert.match(compose, /TRUSTED_PROXY_IPS: \$\{TRUSTED_PROXY_IPS:-\}/);
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
  assert.doesNotMatch(manager, /docker volume rm|rm -rf "\$data_dir/);
  assert.match(manager, /control_dir=\$data_dir\/\.qidian-update-control/);
  assert.match(manager, /mv -f "\$old_dir\/\$filename"/);
  assert.match(model, /Docker 与 Compose 已就绪/);
  assert.match(model, /translate\("运行依赖"\)/);
  assert.match(model, /Flag, "registration_enabled"/);
  assert.match(model, /Flag, "trust_proxy_enabled"/);
  assert.match(model, /Value, "trusted_proxy_ip"/);
  assert.match(model, /trusted_proxy_ip\.datatype = "ipaddr"/);
  assert.match(model, /trusted_proxy_ip:depends\("trust_proxy_enabled", "1"\)/);
  assert.doesNotMatch(model, /remove\.description\s*=/, 'keep the uninstall data-retention warning in one place before confirmation');
  assert.ok(model.indexOf('local install = s:taboption("basic", Button') < model.indexOf('local port = s:taboption("basic", Value'), 'put the primary install/update action before less-frequent settings');
  assert.doesNotMatch(model, /data_path_display/, 'show the detected Docker data directory once in the service overview');
  assert.match(manager, /account-status\) account_status/);
  assert.match(manager, /set_env REGISTRATION_ENABLED/);
  assert.match(manager, /set_env TRUST_PROXY "\$trust_proxy_enabled"/);
  assert.match(manager, /set_env TRUSTED_PROXY_IPS "\$trusted_proxy_ip"/);
  assert.match(manager, /启用反向代理信任前，请填写直接连接栖点容器的代理 IP/);
  assert.match(manager, /IMAGE_REPOSITORY=docker\.io\/luckyalanzhou\/qidian/);
  assert.match(manager, /set_env QIDIAN_IMAGE "\$IMAGE_REPOSITORY:latest"/);
  assert.match(manager, /image_name=\$IMAGE_REPOSITORY:\$latest_version/);
  assert.match(manager, /docker pull "\$image_name"/);
  assert.match(manager, /check-update\)\s*check_and_apply_updates/);
  assert.match(manager, /version_is_newer "\$latest_version" "\$installed_plugin_version"/);
  assert.match(manager, /version_is_newer "\$latest_version" "\$container_version"/);
  assert.match(manager, /sha256sum -c "\$checksum"/);
  assert.ok(manager.indexOf('sha256sum -c "$checksum"') < manager.indexOf('QIDIAN_UPDATE_WORKER=1 "./$archive"'), 'verify the plugin installer before execution');
  assert.match(manager, /QIDIAN_UPDATE_WORKER=1 "\.\/\$archive"/);
  assert.match(manager, /compose up -d --no-build --force-recreate qidian/);
  assert.match(manager, /compose create --force-recreate qidian/);
  assert.match(manager, /check-update-worker/);
  assert.match(manager, /cp "\$0" "\$worker"/);
  assert.doesNotMatch(manager, /docker volume rm|rm -rf "\$data_dir/);
  assert.match(model, /s:taboption\("maintenance", Button, "_check_update", translate\("软件更新"\)\)/);
  assert.match(model, /button\(updates, translate\("检查并更新"\), "apply", "check-update"\)/);
  assert.match(model, /button\(start, translate\("启动服务"\), "apply", "start"\)/);
  assert.match(model, /button\(stop, translate\("停止服务"\), "reset", "stop"\)/);
  assert.match(model, /button\(remove, translate\("卸载服务"\), "remove", "remove"\)/);
  assert.doesNotMatch(model, /发现更新时自动安装。/);
  assert.doesNotMatch(manager, /docker build/);
});

test('Docker service and LuCI use HTTP 9908 without requiring certificates', async () => {
  const dockerfile = await read('../Dockerfile');
  const compose = await read('../packaging/istoreos/compose.yaml');
  const manager = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh');
  const installer = await read('../packaging/istoreos/install.sh');
  const view = await read('../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/view/qidian/status.htm');

  assert.match(dockerfile, /node:http.*http:\/\/127\.0\.0\.1:9908\/readyz/);
  assert.match(compose, /APP_PORT:-9908/);
  assert.match(compose, /QIDIAN_DATA_PATH:\?请先在LuCI执行安装或更新/);
  assert.match(compose, /QIDIAN_IMAGE:\?请先在LuCI执行安装或更新/);
  assert.doesNotMatch(compose, /TLS_CERT_PATH|TLS_KEY_PATH|certs\//);
  assert.doesNotMatch(manager, /openssl req|QIDIAN_CERT_PATH|QIDIAN_KEY_PATH/);
  assert.match(installer, /默认访问端口：9908（HTTP）/);
  assert.ok(view.includes('href="http://localhost:'));
  assert.ok(view.includes('"http://" + window.location.hostname'));
});

test('LuCI uses native CBI sections, controls, tabs, and log output', async () => {
  const base = '../packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/';
  const controller = await read(`${base}controller/qidian.lua`);
  const model = await read(`${base}model/cbi/qidian.lua`);
  const service = await read(`${base}view/qidian/status.htm`);
  const account = await read(`${base}view/qidian/account-tools.htm`);
  const logs = await read(`${base}view/qidian/logs.htm`);
  const styles = service.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const logStyles = logs.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

  assert.match(controller, /entry\(\{"admin", "services", "qidian"\}, cbi\("qidian"\)/);
  assert.doesNotMatch(controller, /"qidian", "logs"/);
  assert.match(controller, /"qidian", "log-data"}, call\("log_data"\)/);
  assert.match(model, /m:section\(NamedSection, "main", "qidian", translate\("部署设置"\)\)/);
  assert.doesNotMatch(model, /\bs\.description\s*=/, 'avoid repeating field guidance above the deployment form');
  assert.match(model, /s:tab\("basic", translate\("基本设置"\)\)/);
  assert.match(model, /s:tab\("advanced", translate\("高级设置"\)\)/);
  assert.match(model, /s:tab\("logs", translate\("日志"\)\)/);
  assert.match(model, /s:tab\("maintenance", translate\("更新"\)\)/);
  assert.match(model, /s:taboption\("basic", Button, "_install"/);
  assert.match(model, /s:taboption\("maintenance", Button, "_check_update"/);
  assert.match(model, /s:taboption\("advanced", DummyValue, "_account_tools"/);
  assert.match(model, /_account_tools", translate\("管理员密码重置"\)/);
  assert.match(model, /account\.template = "qidian\/account-tools"/);
  assert.match(model, /s:taboption\("logs", Button, "_clear_logs", translate\("日志"\)\)/);
  assert.match(model, /clear_logs\.inputtitle = translate\("清空日志"\)/);
  assert.match(model, /: > \/tmp\/qidian-operation\.log && rm -f \/tmp\/qidian-operation\.result/);
  assert.match(model, /s:taboption\("logs", DummyValue, "_operation_log"/);
  assert.match(model, /logs\.template = "qidian\/logs"/);
  assert.doesNotMatch(model, /install\.description|port\.description|registration\.description|image\.description|updates\.description/, 'remove routine helper descriptions from LuCI fields');
  assert.doesNotMatch(model, /栖点容器管理与更新|首次部署，或应用配置更改|默认端口：9908|首个管理员仍可创建|多架构镜像会自动匹配设备|发现更新时自动安装/);
  assert.match(service, /class="cbi-section qidian-overview"/);
  assert.match(service, /<h3><%:服务概览%><\/h3>/);
  assert.match(service, /class="cbi-value-title"/);
  assert.match(service, /<table class="table cbi-section-table">[\s\S]*?<%:服务状态%>[\s\S]*?<%:版本%>[\s\S]*?<%:管理插件%>[\s\S]*?<%:Docker 镜像%>[\s\S]*?<%:Docker 数据目录%>[\s\S]*?<%:账号状态%>[\s\S]*?<\/table>/, 'show concise service information in native LuCI table rows');
  assert.doesNotMatch(service, /<div class="cbi-value"><div class="cbi-value-title"><%:访问端口%>/, 'do not squeeze read-only service details into editable CBI rows');
  assert.match(service, /serviceActionFields\.appendChild\(button\)/);
  assert.match(service, /if \(startButton\) startButton\.disabled = busy \|\| running/);
  assert.match(service, /if \(stopButton\) stopButton\.disabled = busy \|\| !running/);
  assert.match(service, /if \(removeButton\) removeButton\.disabled = busy/);
  assert.match(service, /if \(moved\) serviceActionFields\.appendChild\(document\.createTextNode\(" "\)\)/);
  assert.match(service, /field\.remove\(\)/, 'remove empty CBI rows after grouping the native action buttons');
  assert.match(service, /if \(label\) label\.remove\(\)/, 'hide redundant CBI field titles for action buttons');
  assert.doesNotMatch(service, /cbi-section-descr"><%:卸载仅移除容器/);
  assert.doesNotMatch(service, /cbi-value-title"><%:运行状态%>|cbi-value-title"><%:网页入口%>/);
  assert.doesNotMatch(service, /<details|<summary|qidian-modal|仅在需要重置密码时展开/);
  assert.match(service, /qidian-data-path/);
  assert.match(service, /name\$="\.' \+ suffix/);
  assert.match(service, /name\$="\._remove"/);
  assert.doesNotMatch(service, /refreshStatus|fetch\(endpoint/, 'poll service state through the same request as the live log');
  assert.match(service, /window\.confirm\("卸载栖点服务？此操作会移除容器/);
  assert.match(service, /<%:打开栖点%>/);
  assert.match(service, /<tr id="qidian-open-row"[\s\S]*?<th scope="row"><%:网页入口%><\/th><td><a id="qidian-open"/);
  assert.doesNotMatch(service, /打开栖点并创建管理员/);
  assert.match(service, /栖点服务运行中/);
  assert.match(service, /知识库数据、附件、证书和配置会保留/);
  assert.doesNotMatch(styles, /\b(background|color|grid|border-radius|border-color|border-width|@media|@keyframes)\b|display:\s*flex/i, 'the page leaves layout and colors to the active LuCI theme');
  assert.doesNotMatch(service, /syncArgonPalette|argon\/css\/dark|--qidian-(?:ink|surface|blue)|display:grid/);
  assert.match(service, /<%:Docker 数据目录%><\/th><td><code id="qidian-data-path">/);
  assert.doesNotMatch(service, /qidian-copy-path|复制路径|function copyText/);
  assert.match(account, /id="qidian-account-tools"/);
  assert.match(account, /docker exec -it qidian node server\/reset-password\.mjs/);
  assert.match(account, /navigator\.clipboard/);
  assert.doesNotMatch(account, /在 OpenWrt 终端运行命令/);
  assert.match(model, /_operation_log", translate\("操作日志"\)/);
  assert.match(logs, /tail -c 65536/);
  assert.match(logs, /var operationBusy = <%=busy and "true" or "false"%>/);
  assert.match(logs, /cbi-tabmenu li\[data-tab="logs"\] a/);
  assert.match(logs, /if \(operationBusy\) \{\s*pollLog\(\);\s*activateLogTab\(\);/);
  assert.match(logs, /window\.setTimeout\(pollLog, 1800\)/);
  assert.match(logs, /qidian-log-state-text/);
  assert.match(logs, /class="table cbi-section-table qidian-log-status"[\s\S]*?<th scope="row"><%:操作状态%><\/th><td><strong id="qidian-log-state-text"/);
  assert.match(logs, /function updateOverview\(data\)/);
  assert.match(logs, /updateOverview\(data\)/);
  assert.match(logs, /startButton\.disabled = data\.busy \|\| data\.state === "running"/);
  assert.match(logs, /stopButton\.disabled = data\.busy \|\| data\.state !== "running"/);
  assert.match(logs, /id="qidian-log-updated"/);
  assert.match(logs, /followLog/);
  assert.match(logs, /class="cbi-input-textarea" rows="18" readonly/);
  assert.match(logs, /class="cbi-value qidian-log-output"/);
  assert.match(logStyles, /\.cbi-value\.qidian-log-output \{ display: block; \}/);
  assert.match(logStyles, /\.qidian-log-output \.cbi-value-field \{ display: block; float: none; width: 100%; max-width: none; margin: 0; \}/);
  assert.match(logStyles, /width: 100% !important; max-width: none !important; min-width: 0; min-height: 32em/);
  assert.match(logs, /class="cbi-button" type="button"><%:滚动到底部%>/);
  assert.doesNotMatch(logs, /最多显示最近 64 KB|日志操作|qidian-service-description|请查看日志了解操作进度|首次访问时创建管理员账号/);
  assert.match(logs, /if \(followLog\) panelLog\.scrollTop = panelLog\.scrollHeight/);
  assert.doesNotMatch(logs, /qidian-log-refresh|刷新日志/);
  assert.match(logs, /qidian-log-bottom/);
  assert.match(logStyles, /textarea#qidian-panel-log \{ display: block; box-sizing: border-box; width: 100% !important; max-width: none !important; min-width: 0; min-height: 32em;/);
  assert.doesNotMatch(logStyles, /\b(background|color|grid|border-radius|border-color|border-width|@media|@keyframes)\b|display:\s*flex/i);
  assert.doesNotMatch(logs, /操作已完成|等待操作|正在部署栖点|部署已完成|安装 \/ 更新过程|请保持页面打开|最近一次操作的实时输出/);
  const inlineScript = service.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(inlineScript, 'LuCI view includes its in-page interaction script');
  const renderedScript = inlineScript
    .replaceAll('<%=util.pcdata(port)%>', '9908')
    .replaceAll('<%=busy and "true" or "false"%>', 'false')
    .replaceAll('<%=log_endpoint%>', '/admin/services/qidian/log-data');
  assert.doesNotThrow(() => new Function(renderedScript), 'LuCI inline JavaScript parses after template interpolation');

  const logScript = logs.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(logScript, 'LuCI log tab includes its live-output behavior');
  const renderedLogScript = logScript
    .replaceAll('<%=log_endpoint%>', '/admin/services/qidian/log-data')
    .replaceAll('<%=busy and "true" or "false"%>', 'false');
  assert.doesNotThrow(() => new Function(renderedLogScript), 'LuCI log-tab script parses after template interpolation');

  const accountScript = account.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  assert.ok(accountScript, 'advanced settings include administrator password reset');
  assert.doesNotThrow(() => new Function(accountScript), 'LuCI account-tools script parses');

  const updater = await read('../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian-updater.sh');
  assert.match(updater, /while \[ ! -f "\$result_file" \]/);
  assert.match(updater, /正在下载：已接收/);
});
