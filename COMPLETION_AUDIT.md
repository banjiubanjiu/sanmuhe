# 三木合云开发迁移完成度审计

更新时间：2026-05-15

## 目标拆解

用户目标：阅读 `docs` 下全部 UI 图片，补齐缺失界面和真实可用流程；补足图片、文字、图标等素材；在控制小程序包体积的前提下让微信小程序接近真实可用；云端函数和预览路径保持可验证。

## Prompt 到产物清单

| 要求 | 产物 / 命令 | 当前证据 | 状态 |
| --- | --- | --- | --- |
| 使用本地 docs 和微信开发 skill | `docs/wechat-miniprogram-cloud-development.md`、`miniprogram-development` skill | 已按 AppID/envId、`cloudfunctionRoot`、`wx.cloud.init`、云函数、OPENID 模式实现 | 已完成 |
| D 盘微信开发者工具适配 | `open-sanmuhe-devtools.bat`、`sanmuhe-cloud-preview.bat`、`preview-sanmuhe.bat` 等 | 验证器检查 D 盘 CLI 路径覆盖：通过 | 已完成 |
| 参考全部 UI 设计稿 | `docs/UI设计.png`、`docs/1.png` 到 `docs/6.png`、`sanmuhe-miniprogram/assets/images/*`、小程序页面 WXML/WXSS | 首页、分类、商品详情、茶饮点单、茶室预定、活动发布已按全套设计稿重做，并同步浏览器预览 | 已完成 |
| 专业图标库 | `lucide-static@1.16.0` 生成的 `sanmuhe-miniprogram/assets/icons/*.png` | 底部导航、首页入口、搜索/扫码、加购、商品详情、活动信息图标已切为本地线性图标；验证器检查图标包约 47KB | 已完成 |
| 去除异常长条点击面 | `pages/shop/index.wxml`、`pages/order/index.wxml`、`pages/index/index.wxml` | 分类侧栏、点单侧栏、首页推荐卡等非提交操作已从原生 `button` 改为 `view` 点击面，避免微信原生按钮样式造成大长条 | 已完成 |
| 控制包体积 | `sanmuhe-miniprogram/assets`、`scripts/verify-cloud-migration.js` | 本地图片和图标素材约 886KB，验证器限制本地素材包小于 2MB；当前无需上传云存储分流 | 已完成 |
| 商品真实可买 | `pages/product/index.*`、`utils/cart.js` | 商品规格和数量可选择，加入购物车会带入规格、数量和对应价格；不同规格不会被错误合并 | 已完成 |
| 订单云端金额一致 | `cloudfunctions/createOrder/index.js` | 云端 `createOrder` 已按 `50g/100g/250g/500g` 规格重新计算茶叶单价，避免前端金额与云端订单总额不一致 | 已完成 |
| 茶室真实可约 | `pages/reservation/index.*`、`createReservation` | 茶室列表保留设计稿样式，新增预约底栏和弹层，可选日期、时间、人数、联系人并提交云函数 | 已完成 |
| 活动真实可筛选/发布 | `pages/events/index.*`、`pages/event-edit/index.*`、`createEvent` | 活动分类 tabs 可筛选，发布入口可见，发布表单支持活动类别；云函数已支持 category/image/signed | 已完成 |
| 小程序迁移到云开发 | `sanmuhe-miniprogram/app.js`、`config/cloud.js`、`utils/cloudApi.js` | `wx.cloud.init` 已接入；AppID/envId 已配置 | 已完成 |
| 云函数后端 | `sanmuhe-miniprogram/cloudfunctions/*` | 10 个云函数：`getOpenId`、`getCatalog`、`seedDemoData`、`manageCatalog`、`createOrder`、`createReservation`、`listEvents`、`createEvent`、`joinEvent`、`listMyRecords` | 已完成 |
| 云函数部署 | CloudBase MCP、`sanmuhe-cloud-preview.bat`、`deploy-cloudfunctions.bat` | 云端函数列表已返回 10 个函数；`createEvent` 已更新并读回 `ModTime: 2026-05-15 14:41:59`，代码包含 category/image/signed 字段 | 已完成 |
| 默认数据初始化 | `seedDemoData`、云状态页按钮 | 已在云端调用成功：`drinks` 更新 6、`tea_products` 更新 5、`rooms` 更新 3、`events` 更新 2 | 已完成 |
| 商品/活动管理验证 | `manageCatalog` | 已在云端调用 `manageCatalog list tea_products`，读回 5 条带 `image/thumb/sort` 的商品 | 已完成 |
| 业务写入链路验证 | 云状态页 `运行云端写入检查` | 一键调用订单、预约、活动、报名、我的记录和商品管理云函数；需要在微信预览里用真实 openid 再跑一次 | 真实预览待验证 |
| 浏览器即时看效果 | `preview/index.html`、`open-preview.bat` | Playwright 检查 1 首页、2 分类、3 详情、4 点单、5 茶室、6 活动：图片/图标均加载，手机壳内无横向溢出 | 已完成 |
| 微信真实预览二维码 | `sanmuhe-cloud-preview.bat`、`downloads/sanmuhe-preview.png` | `downloads` 尚未生成二维码文件 | 未完成 |
| 部署/预览日志 | `downloads/*.log`、`check-preview-output.bat` | MCP 已完成云端部署验证；Windows CLI 二维码流程尚未生成本地日志 | 二维码待生成 |
| 最终完成判定 | `node scripts/verify-cloud-migration.js` + CloudBase MCP + Windows 真实预览证据 | 本地 `ok/codeReady/readyForCloudPreview` 均为 `true`；云函数和数据已部署验证；真实微信预览二维码证据缺失 | 二维码待生成 |

## 当前验证命令

```text
node scripts/verify-cloud-migration.js
find sanmuhe-miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check
if rg -n "wx:else|&&|\\\\n|\\|\\|" sanmuhe-miniprogram -g '*.wxml'; then exit 1; fi
```

当前本地验证结果：

```text
ok: true
codeReady: true
readyForCloudPreview: true
icon package budget: 47KB
local asset package budget: 886KB
non-command native button cleanup: true
product spec and quantity flow: true
order backend spec pricing: true
reservation booking flow: true
events filter and publish flow: true
```

## 剩余阻塞

当前会话不能执行 Windows GUI/CLI 程序，无法直接启动 D 盘微信开发者工具生成二维码。云函数已通过 CloudBase MCP 部署并验证；剩余的是 Windows 桌面侧二维码生成。还需要在 Windows 侧双击：

```text
F:\sanmuhe\start-sanmuhe.bat
```

选择 `5` 生成预览二维码；该流程会顺手重新部署 10 个云函数，重复部署是安全的。跑完后再选择 `7` 检查产物。

已尝试从当前会话直接执行 `cmd.exe /C F:\sanmuhe\sanmuhe-cloud-preview.bat`，失败为 `Exec format error`。因此最终预览部署必须在 Windows 桌面侧启动。

## 最终完成需要的证据

- `downloads\sanmuhe-preview.png` 存在且可扫码。
- `downloads\sanmuhe-preview-info.json` 存在。
- `downloads\sanmuhe-cloudfunctions-list.txt` 包含 10 个云函数名。
- 小程序「云开发状态」页 `检查 getOpenId 云函数` 成功返回 openid。
- `写入默认商品和活动` 成功。
- `运行云端写入检查` 成功返回订单、预约、活动、报名、我的记录摘要。
