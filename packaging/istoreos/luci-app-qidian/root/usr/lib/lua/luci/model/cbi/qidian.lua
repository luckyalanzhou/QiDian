local sys = require "luci.sys"

local function run_action(action)
	if sys.call("test -d /tmp/qidian-operation.lock || test -f /tmp/qidian-operation.queued") == 0 then
		return
	end
	local command = string.format(
		"rm -f /tmp/qidian-operation.log /tmp/qidian-operation.result; touch /tmp/qidian-operation.queued; nohup /usr/libexec/istorec/qidian.sh %s >/tmp/qidian-operation.log 2>&1 </dev/null &",
		action
	)
	sys.call(command)
end

local docker_ready = sys.call("docker info >/dev/null 2>&1") == 0
local compose_ready = sys.call("docker compose version >/dev/null 2>&1") == 0 or sys.call("command -v docker-compose >/dev/null 2>&1") == 0

local m = Map("qidian", translate("栖点知识库"), translate("管理栖点容器与设备更新。"))
local status = m:section(SimpleSection)
status.template = "qidian/status"

local s = m:section(NamedSection, "main", "qidian", translate("部署设置"))
s.addremove = false
s.anonymous = true

local function button(option, title, style, action)
	option.inputtitle = title
	option.inputstyle = style
	option.write = function()
		run_action(action)
	end
	return option
end

s:tab("basic", translate("基本设置"))
s:tab("advanced", translate("高级设置"))
s:tab("logs", translate("日志"))
s:tab("maintenance", translate("更新维护"))

local environment = s:taboption("basic", DummyValue, "environment_display", translate("运行依赖"))
if not docker_ready then
	environment.default = translate("Docker 未启动")
	environment.description = translate("请先启动 Docker 服务。")
elseif not compose_ready then
	environment.default = translate("Docker 已就绪 · 缺少 Compose")
	environment.description = translate("请先安装 Docker Compose。")
else
	environment.default = translate("Docker 与 Compose 已就绪")
end

local install = s:taboption("basic", Button, "_install", translate("部署"))
button(install, translate("安装 / 更新"), "apply", "install")
install.description = translate("首次部署或重新应用下方设置。")

local port = s:taboption("basic", Value, "http_port", translate("访问端口"))
port.datatype = "port"
port.default = "9908"
port.rmempty = false
port.description = translate("默认 9908；更改后点击“安装 / 更新”应用。")

local registration = s:taboption("advanced", Flag, "registration_enabled", translate("允许创建其他账号"))
registration.default = "0"
registration.rmempty = false
registration.description = translate("首个管理员仍可创建；关闭后停止新账号注册。")

local image = s:taboption("advanced", DummyValue, "image_display", translate("Docker 镜像"))
image.default = "luckyalanzhou/qidian:latest"
image.description = translate("多架构镜像会自动匹配设备；固定版本标签可用于回滚。")

local account = s:taboption("advanced", DummyValue, "_account_tools", translate("管理员密码重置"))
account.template = "qidian/account-tools"

local logs = s:taboption("logs", DummyValue, "_operation_log", translate("操作日志"))
logs.template = "qidian/logs"

local updates = s:taboption("maintenance", Button, "_check_update", translate("软件更新"))
updates.description = translate("检查管理插件与 Docker 镜像；发现更新时自动更新对应组件。")
button(updates, translate("检查更新"), "apply", "check-update")

local start = s:taboption("basic", Button, "_start", translate("服务控制"))
button(start, translate("启动服务"), "apply", "start")
local stop = s:taboption("basic", Button, "_stop", translate("服务控制"))
button(stop, translate("停止服务"), "reset", "stop")
local remove = s:taboption("basic", Button, "_remove", translate("服务控制"))
button(remove, translate("卸载服务"), "remove", "remove")

return m
