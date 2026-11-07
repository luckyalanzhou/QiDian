FROM openwrt/rootfs:x86-64-24.10.3
RUN mkdir -p /var/lock /var/run && opkg update && opkg install luci luci-compat luci-i18n-base-zh-cn coreutils-nohup && rm -rf /tmp/opkg-lists/*
COPY scripts/luci-preview/luci-theme-argon_2.4.7_all.ipk /tmp/argon.ipk
RUN opkg install /tmp/argon.ipk && rm /tmp/argon.ipk && uci set luci.main.mediaurlbase='/luci-static/argon' && uci commit luci
RUN sed -i "s/const boardinfo = ubus.call('system', 'board');/const boardinfo = ubus.call('system', 'board') ?? { hostname: 'LuCI Preview' };/" /usr/share/ucode/luci/template/themes/bootstrap/header.ut
COPY packaging/istoreos/luci-app-qidian/root/usr/lib/lua/luci/ /usr/lib/lua/luci/
COPY packaging/istoreos/luci-app-qidian/root/etc/config/qidian /etc/config/qidian
COPY scripts/luci-preview/start.sh /usr/local/bin/qidian-preview
RUN chmod +x /usr/local/bin/qidian-preview && mkdir -p /usr/libexec/istorec
EXPOSE 80
ENTRYPOINT ["/bin/sh", "/usr/local/bin/qidian-preview"]
