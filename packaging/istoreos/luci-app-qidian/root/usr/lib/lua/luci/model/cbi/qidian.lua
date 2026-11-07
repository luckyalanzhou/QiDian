local sys = require "luci.sys"
local util = require "luci.util"

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
local pending_action
function m.on_after_save(self)
	if pending_action then
		self.uci:commit("qidian")
		run_action(pending_action)
		pending_action = nil
	end
end

local s = m:section(NamedSection, "main", "qidian", translate("部署设置"))
s.addremove = false
s.anonymous = true

local function button(option, title, style, action)
	option.inputtitle = title
	option.inputstyle = style
	option.write = function()
		pending_action = action
	end
	return option
end

s:tab("basic", translate("基本设置"))
s:tab("logs", translate("日志"))

local image_tag = s:taboption("basic", Value, "image_tag", translate("Docker 镜像"))
image_tag.template = "cbi/dropdown"
image_tag.custom = translate("-- 自定义 --")
image_tag:value("latest", "docker.io/luckyalanzhou/qidian:latest")
local package_version = util.trim(sys.exec("cat /etc/qidian-version 2>/dev/null"))
if package_version ~= "" then image_tag:value(package_version, "docker.io/luckyalanzhou/qidian:" .. package_version) end
image_tag.default = "latest"
image_tag.rmempty = false
image_tag.datatype = "uciname"
function image_tag.cfgvalue(self, section)
	local value = Value.cfgvalue(self, section)
	if value == "custom" then return m.uci:get("qidian", section, "custom_image") end
	return value
end

local data_path = s:taboption("basic", Value, "data_path", translate("配置文件路径"))
data_path.template = "cbi/dropdown"
data_path.custom = translate("-- 自定义 --")
data_path.title = translate("数据目录")
data_path.placeholder = "/opt/docker/volumes/qidian/data"
data_path:value("/opt/docker/volumes/qidian/data")
data_path.datatype = "string"
data_path.rmempty = true

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

local clear_logs = s:taboption("logs", Button, "_clear_logs", translate("日志"))
clear_logs.inputtitle = translate("清空日志")
clear_logs.inputstyle = "reset"
clear_logs.write = function()
	sys.call(": > /tmp/qidian-operation.log && rm -f /tmp/qidian-operation.result")
end

local logs = s:taboption("logs", DummyValue, "_operation_log", translate("操作日志"))
logs.template = "qidian/logs"

local state = util.trim(sys.exec("/usr/libexec/istorec/qidian.sh status 2>/dev/null"))
local container_exists = sys.call("docker inspect --type container qidian >/dev/null 2>&1") == 0
if not container_exists then
	local install = s:taboption("basic", Button, "_install", "")
	button(install, translate("安装"), "apply", "install-package")
elseif state == "running" then
	local apply = s:taboption("basic", Button, "_apply", "")
	button(apply, translate("升级/应用"), "apply", "check-update")
	local stop = s:taboption("basic", Button, "_stop", "")
	button(stop, translate("停止"), "reset", "stop")
	local restart = s:taboption("basic", Button, "_restart", "")
	button(restart, translate("重启"), "apply", "restart")
elseif state == "exited" or state == "created" or state == "dead" then
	local apply = s:taboption("basic", Button, "_apply", "")
	button(apply, translate("升级/应用"), "apply", "check-update")
	local start = s:taboption("basic", Button, "_start", "")
	button(start, translate("启动"), "apply", "start")
	local remove = s:taboption("basic", Button, "_remove", "")
	button(remove, translate("删除"), "remove", "remove")
end

return m
