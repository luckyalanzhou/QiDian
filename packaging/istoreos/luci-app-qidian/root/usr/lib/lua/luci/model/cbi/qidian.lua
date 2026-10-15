local sys = require "luci.sys"

local function trim(value)
	return (value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

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

local m = Map("qidian", translate("栖点知识库"), translate("Docker 服务管理"))
local status = m:section(SimpleSection)
status.template = "qidian/status"

local s = m:section(NamedSection, "main", "qidian", translate("部署与配置"))
s.addremove = false
s.anonymous = true
s.description = translate("使用 Docker Hub 成品镜像部署服务，并配置访问端口与账号注册方式。")

local environment = s:option(DummyValue, "environment_display", translate("设备环境"))
if not docker_ready then
	environment.default = translate("Docker 未启动")
	environment.description = translate("请先在 OpenWrt 安装并启动 Docker，再返回本页部署。")
elseif not compose_ready then
	environment.default = translate("Docker 已启动 · Compose 未安装")
	environment.description = translate("请先安装 Docker Compose 插件，再返回本页部署。")
else
	environment.default = translate("Docker 与 Compose 已就绪")
	environment.description = translate("将从 Docker Hub 拉取适合当前设备架构的栖点成品镜像。")
end

local function button(option, title, style, action)
	option.inputtitle = title
	option.inputstyle = style
	option.write = function()
		run_action(action)
	end
	return option
end

local install = s:option(Button, "_install", translate("部署"))
button(install, translate("安装 / 更新"), "apply", "install")
install.description = translate("首次使用请部署服务；有新版本时再次点击即可更新。")

local port = s:option(Value, "http_port", translate("访问端口"))
port.datatype = "port"
port.default = "9908"
port.rmempty = false
port.description = translate("默认 9908；修改后点击安装 / 更新以应用。")

local registration = s:option(Flag, "registration_enabled", translate("允许创建其他账号"))
registration.default = "0"
registration.rmempty = false
registration.description = translate("首次管理员始终可以创建。管理员创建完成后，保持关闭可阻止其他人注册；开启后点击安装 / 更新以应用。")

local image = s:option(DummyValue, "image_display", translate("运行方式"))
image.default = "luckyalanzhou/qidian:latest"
image.description = translate("Docker Hub 最新多架构成品镜像；Docker 会自动选择 x86_64 或 ARM64。版本标签同时保留用于手动回滚。")

local start = s:option(Button, "_start", translate("启动服务"))
button(start, translate("启动"), "apply", "start")
local stop = s:option(Button, "_stop", translate("停止服务"))
button(stop, translate("停止"), "reset", "stop")
local remove = s:option(Button, "_remove", translate("卸载容器"))
button(remove, translate("卸载容器"), "remove", "remove")
remove.description = translate("只移除容器，保留 Docker 数据、附件、证书和配置。")

return m
