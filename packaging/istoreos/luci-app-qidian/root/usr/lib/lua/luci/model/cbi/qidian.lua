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

local m = Map("qidian", translate("栖点知识库"))
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
s:tab("logs", translate("日志"))

local registration = s:taboption("basic", Flag, "registration_enabled", translate("允许创建其他账号"))
registration.default = "0"
registration.rmempty = false

local trust_proxy = s:taboption("basic", Flag, "trust_proxy_enabled", translate("信任反向代理"))
trust_proxy.default = "0"
trust_proxy.rmempty = false

local trusted_proxy_ip = s:taboption("basic", Value, "trusted_proxy_ip", translate("反向代理 IP"))
trusted_proxy_ip.datatype = "ipaddr"
trusted_proxy_ip.rmempty = true
trusted_proxy_ip:depends("trust_proxy_enabled", "1")
trusted_proxy_ip.description = translate("填写直接连接栖点容器的代理地址；启用反代时必填。")

local account = s:taboption("basic", DummyValue, "_account_tools", translate("管理员密码重置"))
account.template = "qidian/account-tools"

if not docker_ready or not compose_ready then
	local environment = s:taboption("basic", DummyValue, "environment_display", translate("环境检查"))
	environment.default = not docker_ready and translate("请先启动 Docker 服务。") or translate("请先安装 Docker Compose。")
end

local needs_deployment = not docker_ready or sys.call("docker inspect --type container qidian >/dev/null 2>&1") ~= 0 or sys.call("test -f /tmp/qidian-deployment.failed") == 0
if needs_deployment then
	local install = s:taboption("basic", Button, "_install", "")
	button(install, translate("重试部署"), "apply", "install-package")
end

local updates = s:taboption("basic", Button, "_check_update", "")
button(updates, translate("检查更新"), "apply", "check-update")

local clear_logs = s:taboption("logs", Button, "_clear_logs", translate("日志"))
clear_logs.inputtitle = translate("清空日志")
clear_logs.inputstyle = "reset"
clear_logs.write = function()
	sys.call(": > /tmp/qidian-operation.log && rm -f /tmp/qidian-operation.result")
end

local logs = s:taboption("logs", DummyValue, "_operation_log", translate("操作日志"))
logs.template = "qidian/logs"

local start = s:taboption("basic", Button, "_start", translate("服务控制"))
button(start, translate("启动服务"), "apply", "start")
local stop = s:taboption("basic", Button, "_stop", translate("服务控制"))
button(stop, translate("停止服务"), "reset", "stop")
local remove = s:taboption("basic", Button, "_remove", translate("服务控制"))
button(remove, translate("卸载服务"), "remove", "remove")

return m
