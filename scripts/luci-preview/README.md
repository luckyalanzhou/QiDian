# 本地 LuCI 预览

在仓库根目录使用 PowerShell：

```powershell
gh release download v2.4.7 --repo jerrykuku/luci-theme-argon --pattern 'luci-theme-argon_2.4.7_all.ipk' --dir scripts/luci-preview
docker build -f scripts/luci-preview/Dockerfile -t qidian-luci-preview .
docker run --rm --name qidian-luci-preview -p 127.0.0.1:18080:80 -e QIDIAN_PREVIEW_STATE=running qidian-luci-preview
```

访问 `http://127.0.0.1:18080/cgi-bin/luci/admin/services/qidian`，使用 `root` 和空密码登录。状态可设置为 `not_installed`、`running` 或 `stopped`；变更状态需停止并重新运行容器。修改源码后重新构建镜像。

服务操作由容器内模拟程序处理，不接入宿主机 Docker 或真实数据。此预览使用 Argon 2.4.7，与你设备上的 iStoreOS Argon 版本并不相同，不能替代真实设备验收。
