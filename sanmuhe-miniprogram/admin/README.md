# 三木合经营后台

这是无需构建的 CloudBase 静态后台，入口是 `admin/index.html`。

上线前需要完成：

- 在 CloudBase 身份认证中启用用户名密码登录，并创建管理员账号。
- 将管理员加入云函数环境变量白名单：优先配置 `ADMIN_UIDS`，也可配置 `ADMIN_USERNAMES`；小程序内部测试账号继续用 `ADMIN_OPENIDS`。
- 将后台访问域名加入 CloudBase 安全域名。
- 部署 `manageCatalog`、`manageOperations`、支付相关云函数后，再把 `admin/` 上传到静态托管。

图片上传保存的是 CloudBase Storage `cloud://` 文件 ID，适合小程序端直接读取；如果要在后台网页中显示私有桶图片，可后续增加临时链接换取逻辑。
