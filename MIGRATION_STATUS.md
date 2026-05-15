# 三木合云开发迁移状态

更新时间：2026-05-15

## 目标

把 `sanmuhe-miniprogram` 从本地缓存演示版迁移到微信小程序云开发；按 `docs` 下全部设计图补齐界面、素材、图标和关键业务流程，让它接近真实可用。

## 已完成

| 要求 | 证据 |
| --- | --- |
| 使用本地云开发文档 | 已参考 `docs/wechat-miniprogram-cloud-development.md` 的 AppID、envId、`cloudfunctionRoot`、云函数、数据库集合建议 |
| 增加云函数根目录 | `sanmuhe-miniprogram/project.config.json` 包含 `"cloudfunctionRoot": "cloudfunctions/"` |
| 初始化云开发 | `sanmuhe-miniprogram/app.js` 调用 `wx.cloud.init`，配置来源为 `config/cloud.js` |
| 云开发配置文件 | `sanmuhe-miniprogram/config/cloud.js` |
| 小程序端云 API 适配 | `sanmuhe-miniprogram/utils/cloudApi.js` |
| 订单写入云函数 | `cloudfunctions/createOrder` |
| 茶室预约写入云函数 | `cloudfunctions/createReservation` |
| 活动发布写入云函数 | `cloudfunctions/createEvent` |
| 活动报名写入云函数 | `cloudfunctions/joinEvent` |
| 我的记录读取云函数 | `cloudfunctions/listMyRecords` |
| 商品/茶室/菜单读取云函数 | `cloudfunctions/getCatalog` |
| 微信登录态检查云函数 | `cloudfunctions/getOpenId` |
| 默认数据写入云函数 | `cloudfunctions/seedDemoData` |
| 商品/活动后台管理云函数 | `cloudfunctions/manageCatalog` |
| 云状态检查页面 | `pages/cloud-status/index`，首页和“我的三木合”页都有入口；支持 `getOpenId`、默认数据写入、商品/活动管理和订单/预约/活动/报名/记录一键云端写入检查 |
| 全套 UI 设计稿落地 | 已核对 `docs/UI设计.png` 和 `docs/1.png` 到 `docs/6.png`；首页、分类、商品详情、茶饮点单、茶室预定、活动发布均有对应页面 |
| 本地图标库 | 从 `lucide-static@1.16.0` 生成实际使用的 PNG 图标到 `assets/icons`；底部导航、首页入口、加购、商品详情和活动信息图标已替换，图标包约 47KB |
| 异常长条点击面修正 | 分类侧栏、点单侧栏、首页推荐卡等非提交操作已改为 `view` 点击面，避免原生 `button` 产生大块长条样式 |
| 包体积控制 | 当前本地图片和图标素材约 886KB，综合验证器限制 `assets` 小于 2MB；现阶段无需把图片上传到云存储分流 |
| 商品购买流程 | 商品详情支持规格、数量、动态价格，并将规格/数量写入购物车 |
| 商品详情服务/收藏 | 商品详情客服入口已接入拨号；收藏入口会写入本地收藏夹，并在“我的”页展示收藏茶品 |
| 我的页记录展示 | 云端和本地订单、茶室预约、活动报名会统一规范 `id`，列表展示更稳定 |
| 订单金额校验 | `createOrder` 云函数已按茶叶规格在服务端重新计算单价和总额，避免规格价被云端覆盖成 50g 基础价 |
| 茶室预约流程 | 茶室列表保留设计稿样式，新增预约底栏和弹层，可提交日期、时间、人数、联系人、备注 |
| 活动运营流程 | 活动分类可筛选，发布入口可见，发布表单支持类别；云端 `createEvent` 已支持 category/image/signed |
| 浏览器即时预览 | `preview/index.html`，入口脚本 `open-preview.bat` |
| Windows 配置脚本 | `configure-cloud.bat` / `configure-cloud.ps1` |
| Windows 配置读取脚本 | `read-cloud-config.ps1` |
| Windows 预检脚本 | `check-cloud-ready.bat` / `check-cloud-ready.ps1` |
| Windows 预览产物检查脚本 | `check-preview-output.bat` / `check-preview-output.ps1` |
| Windows 云函数部署脚本 | `deploy-cloudfunctions.bat` |
| Windows 开发者工具登录辅助脚本 | `wechat-devtools-login.bat` |
| Windows 总入口菜单 | `start-sanmuhe.bat` |
| Windows 完整预览向导 | `sanmuhe-cloud-preview.bat` |
| D 盘微信开发者工具路径适配 | bat 脚本优先查找 `D:\small_program_tool\微信web开发者工具\cli.bat` 和 `D:\微信web开发者工具\cli.bat` |
| CloudBase 资源清单 | `sanmuhe-miniprogram/cloudbaserc.json` 列出 10 个云函数 |

## 已验证

本机静态验证已通过：

```text
find sanmuhe-miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check
node --check preview/app.js
```

也可以运行综合验证脚本：

```text
node scripts/verify-cloud-migration.js
```

Windows 下可双击：

```text
verify-cloud-migration.bat
```

项目结构验证已通过：

```text
pages: 10
cloud functions: 10
cloudfunctionRoot: cloudfunctions/
D drive CLI scripts: covered
browser preview files: present
real AppID configured: wxaf9aedf1f6343786
cloud envId configured: sanmuhe-env-d3g1nt3jsa1be67e3
verify ok: true
readyForCloudPreview: true
```

综合验证器会输出 `completionAudit`，明确区分代码就绪、云预览配置就绪和真实微信预览验证。`readyForCloudPreview: true` 只表示本地 AppID/envId 配置已满足生成云开发预览的前置条件；最终完成仍需要在微信开发者工具里部署云函数并验证真实预览。

CloudBase MCP 云端验证已完成：

- 云端函数列表返回 10 个函数，包含新增 `manageCatalog`。
- 已更新 `seedDemoData`、`getCatalog`、`listEvents`、`manageCatalog` 云函数代码。
- 已调用 `seedDemoData`，云数据库现有默认数据已补齐 `image`、`thumb`、`sort`、`visible` 等字段。
- 已调用 `getCatalog`、`listEvents`、`manageCatalog`，均能读回带图片字段的云端数据。
- 已更新并确认 `createEvent` 云函数，云端代码包含 `category`、`image`、`signed`、`visible` 字段。
- 已更新并确认 `createOrder` 云函数，云端代码包含茶叶规格 `specMultipliers` 和服务端金额重算逻辑。

浏览器预览已通过 Playwright 冒烟检查：

- `preview/index.html` 可打开。
- 6 个设计稿对应视图均可切换。
- 首页、分类、详情、点单、茶室、活动里的图片和图标均加载成功。
- 手机壳内无横向溢出。

## 当前阻塞

真实微信二维码预览未完成，原因不是代码缺失、云函数缺失，也不是 AppID/envId 缺失；当前配置已写入：

```text
project.config.json appid: wxaf9aedf1f6343786
config/cloud.js envId: sanmuhe-env-d3g1nt3jsa1be67e3
```

当前 WSL 会话也不能直接执行 Windows 程序：

```text
cmd.exe /C ... -> Exec format error
```

所以我无法在这个会话中直接启动 D 盘的微信开发者工具 CLI，也无法替你完成扫码登录和微信真实预览二维码生成。云函数已通过 CloudBase MCP 部署；Windows 侧脚本已准备好，下一步需要在 Windows 环境执行。

已再次尝试直接执行：

```text
cmd.exe /C F:\sanmuhe\sanmuhe-cloud-preview.bat
```

仍失败为：

```text
/mnt/c/windows/system32/cmd.exe: cannot execute binary file: Exec format error
```

最近一次检查 `downloads` 目录时，尚未生成 `sanmuhe-preview.png`、`sanmuhe-preview-info.json` 或微信开发者工具 CLI 日志，说明 Windows 侧二维码流程还没有跑完。

## 下一步

1. 双击 `start-sanmuhe.bat` 使用菜单，或直接双击 `check-cloud-ready.bat` 做预检。
2. 如预检提示未登录，双击 `wechat-devtools-login.bat`，用微信扫码登录，并确认开发者工具「设置 -> 安全设置」已打开服务端口。
3. 双击 `preview-sanmuhe.bat` 只生成预览二维码；或双击 `sanmuhe-cloud-preview.bat` 重新部署并生成预览二维码。
4. 打开小程序首页，进入“云开发状态检查”，先检查 `getOpenId`，再点击“写入默认商品和活动”“检查商品/活动管理”“运行云端写入检查”。

## 完成判定

只有同时满足以下条件，迁移目标才算真正完成：

- `project.config.json` 使用真实 AppID。
- `config/cloud.js` 使用真实 envId。
- `getOpenId` 云函数在微信开发者工具预览中返回 openid。
- `seedDemoData` 能写入默认数据。
- 茶饮、茶叶、茶室、活动页面能从云端读取数据。
- 订单、预约、活动发布、活动报名能在云数据库中生成记录。
- `preview-sanmuhe.bat` 或 `sanmuhe-cloud-preview.bat` 生成可扫码的微信预览二维码。
