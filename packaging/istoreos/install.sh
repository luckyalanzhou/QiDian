#!/bin/sh
set -eu

fail() { printf '栖点管理界面安装失败：%s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail '请在 iStoreOS 软件商店中以管理员身份安装，或使用 root 执行此安装包。'

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL_DIR=${QIDIAN_INSTALL_DIR:-/opt/qidian}
case "$INSTALL_DIR" in /opt/qidian) ;; *) fail "程序目录必须为 /opt/qidian，收到：$INSTALL_DIR" ;; esac
[ -f "$SCRIPT_DIR/compose.yaml" ] || fail '安装包缺少 Docker Compose 配置。'
[ -f "$SCRIPT_DIR/root/usr/libexec/istorec/qidian.sh" ] || fail '安装包缺少 iStoreOS 服务管理脚本。'
[ -f "$SCRIPT_DIR/root/usr/libexec/istorec/qidian-updater.sh" ] || fail '安装包缺少网页更新管理服务。'
[ -f "$SCRIPT_DIR/root/etc/init.d/qidian-updater" ] || fail '安装包缺少网页更新服务启动脚本。'
command -v uci >/dev/null 2>&1 || fail '未检测到 iStoreOS UCI 配置工具。'
[ -d /usr/lib/lua/luci/controller ] || fail '未检测到兼容的 LuCI 控制器目录，请先安装 iStoreOS LuCI。'
[ -d /usr/lib/lua/luci/model/cbi ] || fail '当前系统没有 LuCI CBI 管理界面，无法提供服务配置页。'

HAD_CONFIG=false
[ ! -f /etc/config/qidian ] || HAD_CONFIG=true
HAD_ENV=false
[ ! -f "$INSTALL_DIR/.env" ] || HAD_ENV=true

mkdir -p "$INSTALL_DIR" /etc/config
cp "$SCRIPT_DIR/compose.yaml" "$INSTALL_DIR/compose.yaml"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env.example"
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
fi

# Install LuCI's menu, configuration model, status page and root-owned manager.
# Keep /etc/config/qidian separate so a package upgrade never resets user settings.
cp -a "$SCRIPT_DIR/root/usr/." /usr/
mkdir -p /etc/init.d
cp -a "$SCRIPT_DIR/root/etc/init.d/." /etc/init.d/
if [ "$HAD_CONFIG" = false ]; then
	cp "$SCRIPT_DIR/root/etc/config/qidian" /etc/config/qidian
fi
chmod 755 /usr/libexec/istorec/qidian.sh
chmod 755 /usr/libexec/istorec/qidian-updater.sh
chmod 755 /etc/init.d/qidian-updater
printf '%s\n' "$(cat "$SCRIPT_DIR/version")" > /etc/qidian-version

if [ "$HAD_CONFIG" = false ]; then
	uci set qidian.main=qidian
  uci set qidian.main.http_port=9908
  uci set qidian.main.registration_enabled=0
  uci set qidian.main.data_path=

  # Carry forward settings only when an environment file existed before this
  # package was installed.  A freshly copied example is not device state.
  if [ "$HAD_ENV" = true ]; then
    OLD_PORT=$(sed -n 's/^APP_PORT=//p' "$INSTALL_DIR/.env" | tail -n 1)
    OLD_DATA=$(sed -n 's/^QIDIAN_DATA_PATH=//p' "$INSTALL_DIR/.env" | tail -n 1)
    OLD_REGISTRATION=$(sed -n 's/^REGISTRATION_ENABLED=//p' "$INSTALL_DIR/.env" | tail -n 1)
    case "$OLD_PORT" in ''|*[!0-9]*) ;; *) uci set "qidian.main.http_port=$OLD_PORT" ;; esac
    case "$OLD_DATA" in /*) uci set "qidian.main.data_path=$OLD_DATA" ;; esac
    [ "$OLD_REGISTRATION" != true ] || uci set qidian.main.registration_enabled=1
  fi
  uci commit qidian
elif ! uci -q get qidian.main.registration_enabled >/dev/null 2>&1; then
  OLD_REGISTRATION=$(sed -n 's/^REGISTRATION_ENABLED=//p' "$INSTALL_DIR/.env" 2>/dev/null | tail -n 1)
  if [ "$OLD_REGISTRATION" = true ]; then
    uci set qidian.main.registration_enabled=1
  else
    uci set qidian.main.registration_enabled=0
  fi
  uci commit qidian
fi

# Move updater state into the configured Docker data directory before restarting its agent.
/usr/libexec/istorec/qidian.sh prepare-control

if [ -x /etc/init.d/qidian-updater ]; then
	/etc/init.d/qidian-updater enable
	if [ "${QIDIAN_UPDATE_WORKER:-0}" != 1 ]; then
		/etc/init.d/qidian-updater restart || /etc/init.d/qidian-updater start
	fi
fi

printf '\n栖点 iStoreOS 管理界面已安装。\n'
printf '打开 iStoreOS「管理 → 服务 → 栖点知识库」，检查端口和 Docker 数据目录后点击“安装 / 更新”。\n'
printf '默认访问端口：9908（HTTP）。首次部署时会读取本设备的 Docker Root Dir，再创建独立数据目录。\n'
printf '此步骤只安装管理页和设备管理文件；Docker 成品镜像会在 LuCI 部署时按版本拉取。\n'
printf '不会删除或覆盖已有数据库、附件或环境配置。\n'
