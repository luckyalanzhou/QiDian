#!/bin/sh
set -eu
case "${QIDIAN_PREVIEW_STATE:-running}" in running|stopped|not_installed) ;; *) echo 'Invalid preview state' >&2; exit 1 ;; esac
printf '%s\n' "${QIDIAN_PREVIEW_STATE:-running}" > /tmp/qidian-preview-state
mkdir -p /var/run /var/lock /tmp/run /usr/libexec/istorec
printf '0.0.49\n' > /etc/qidian-version
printf '%s\n' '#!/bin/sh' 'state=$(cat /tmp/qidian-preview-state)' 'case "$1" in status) case "$state" in stopped) echo exited;; *) echo "$state";; esac;; account-status) echo ready;; install-package|start|restart) echo running > /tmp/qidian-preview-state; echo success > /tmp/qidian-operation.result; rm -f /tmp/qidian-operation.queued;; stop) echo stopped > /tmp/qidian-preview-state; echo success > /tmp/qidian-operation.result; rm -f /tmp/qidian-operation.queued;; remove) echo not_installed > /tmp/qidian-preview-state; echo success > /tmp/qidian-operation.result; rm -f /tmp/qidian-operation.queued;; check-update) echo success > /tmp/qidian-operation.result; rm -f /tmp/qidian-operation.queued;; esac' > /usr/libexec/istorec/qidian.sh
printf '%s\n' '#!/bin/sh' 'state=$(cat /tmp/qidian-preview-state)' 'case "$*" in "info"|"compose version") exit 0;; *"--type container"*) [ "$state" != not_installed ] && exit 0 || exit 1;; *".Config.Env"*) echo QIDIAN_VERSION=0.0.49;; esac' > /usr/bin/docker
chmod +x /usr/libexec/istorec/qidian.sh /usr/bin/docker
passwd -d root >/dev/null
ubusd &
attempt=0
until ubus list >/dev/null 2>&1; do
	attempt=$((attempt + 1))
	[ "$attempt" -lt 20 ] || { echo 'ubus failed to start' >&2; exit 1; }
	sleep 1
done
rpcd &
exec uhttpd -f -h /www -r OpenWrt -x /cgi-bin -u /ubus -p 0.0.0.0:80
