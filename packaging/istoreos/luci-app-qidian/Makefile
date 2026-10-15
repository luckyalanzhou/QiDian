QIDIAN_PKG_DIR:=$(realpath $(dir $(lastword $(MAKEFILE_LIST))))
QIDIAN_FEED_DIR:=$(realpath $(QIDIAN_PKG_DIR)/..)

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-qidian
PKG_VERSION:=$(strip $(shell cat "$(QIDIAN_FEED_DIR)/VERSION" 2>/dev/null))
PKG_RELEASE:=1
PKG_LICENSE:=LicenseRef-Proprietary
PKGARCH:=all
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

ifeq ($(PKG_VERSION),)
$(error Missing $(QIDIAN_FEED_DIR)/VERSION; prepare the OpenWrt feed with the project version)
endif

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-qidian
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=栖点知识库 Docker 管理
  URL:=https://github.com/luckyalanzhou/qidian
  MAINTAINER:=luckyalanzhou <zhiminzhou1@gmail.com>
  DEPENDS:=+luci-base +jsonfilter
endef

define Package/luci-app-qidian/description
LuCI service manager for deploying and maintaining the Qidian personal wiki Docker image.
endef

define Package/luci-app-qidian/conffiles
/etc/config/qidian
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)/root
	$(CP) $(QIDIAN_PKG_DIR)/root/. $(PKG_BUILD_DIR)/root/
endef

define Build/Compile
endef

define Package/luci-app-qidian/install
	$(CP) $(PKG_BUILD_DIR)/root/. $(1)/
	$(INSTALL_DIR) $(1)/opt/qidian
	$(INSTALL_DATA) $(QIDIAN_FEED_DIR)/compose.yaml $(1)/opt/qidian/compose.yaml
	$(INSTALL_DATA) $(QIDIAN_FEED_DIR)/.env.example $(1)/opt/qidian/.env.example
	$(INSTALL_DIR) $(1)/etc
	printf '%s\n' '$(PKG_VERSION)' > $(1)/etc/qidian-version
	printf '%s\n' '$(if $(CONFIG_USE_APK),apk,opkg)' > $(1)/etc/qidian-package-manager
	chmod 0755 $(1)/etc/init.d/qidian-updater
	chmod 0755 $(1)/usr/libexec/istorec/qidian.sh $(1)/usr/libexec/istorec/qidian-updater.sh
endef

define Package/luci-app-qidian/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/qidian-updater enable 2>/dev/null || true
/etc/init.d/qidian-updater restart 2>/dev/null || /etc/init.d/qidian-updater start 2>/dev/null || true
exit 0
endef

define Package/luci-app-qidian/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/etc/init.d/qidian-updater stop 2>/dev/null || true
/etc/init.d/qidian-updater disable 2>/dev/null || true
exit 0
endef

$(eval $(call BuildPackage,luci-app-qidian))
