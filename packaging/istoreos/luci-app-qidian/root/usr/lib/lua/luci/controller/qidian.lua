module("luci.controller.qidian", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/qidian") then
		return
	end

	local root = entry({"admin", "services", "qidian"}, alias("admin", "services", "qidian", "service"), _("栖点知识库"), 60)
	root.dependent = true

	entry({"admin", "services", "qidian", "service"}, cbi("qidian"), _("服务"), 10).leaf = true
	entry({"admin", "services", "qidian", "logs"}, template("qidian/logs"), _("日志"), 20).leaf = true
	entry({"admin", "services", "qidian", "log-data"}, call("log_data")).leaf = true
end

function log_data()
	local http = require "luci.http"
	local sys = require "luci.sys"
	local util = require "luci.util"

	local busy = sys.call("test -d /tmp/qidian-operation.lock || test -f /tmp/qidian-operation.queued") == 0
	local state = util.trim(sys.exec("/usr/libexec/istorec/qidian.sh status 2>/dev/null"))
	local account_status = util.trim(sys.exec("/usr/libexec/istorec/qidian.sh account-status 2>/dev/null"))
	local result = util.trim(sys.exec("cat /tmp/qidian-operation.result 2>/dev/null"))
	local log = sys.exec("tail -c 65536 /tmp/qidian-operation.log 2>/dev/null")

	http.prepare_content("application/json")
	http.write_json({ busy = busy, state = state, accountStatus = account_status, result = result, log = log })
end
