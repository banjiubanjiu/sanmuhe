# 禾熙云开发迁移状态

更新时间：2026-05-15

## 目标

把 `sanmuhe-miniprogram` 从本地缓存原型迁移成接近真实可用的微信小程序：按 `docs` 下全部设计图补齐页面、素材、图标和关键业务流程，并接入 CloudBase 云函数与数据库。

## 已完成

| 要求 | 证据 |
| --- | --- |
| 全套 UI 设计稿落地 | 已核对 `docs/UI设计.png`、`docs/1.png` 到 `docs/6.png`、`docs/我的界面.png`；首页、分类、商品详情、茶饮点单、茶室预定、活动发布、我的页面均有对应实现 |
| 本地图标库 | 从 `lucide-static@1.16.0` 生成 PNG 图标到 `assets/icons`；底部导航、首页入口、加购、商品详情和活动信息图标已替换，图标包约 47KB |
| 异常长条点击面修正 | 分类/点单加购为本地图标容器；点单购物车为有商品才显示的紧凑结算胶囊；非提交操作不再依赖原生大按钮 |
| 包体积控制 | 当前本地图片和图标素材约 886KB，综合验证器限制 `assets` 小于 2MB |
| 商品购买流程 | 商品详情支持规格、数量、动态价格，并将规格/数量写入购物车 |
| 购物车结算体验 | 支持微信地址选择；订单状态为“待支付”；异常兜底为本机暂存并提示重新提交 |
| 商品详情服务/收藏 | 客服入口拨号；收藏写入本地收藏夹，并在“我的”页展示收藏茶品 |
| 我的页会员中心 | 补齐头像会员区、会员权益横幅、订单状态入口、服务宫格、最近预约和最近活动 |
| 茶室预约流程 | 茶室列表、预约底栏和弹层可提交日期、时间、人数、联系人、备注 |
| 茶饮点单流程 | 商品列表、小号图标加购、紧凑购物车胶囊、图标底栏均已实现 |
| 活动运营流程 | 活动分类可筛选，发布入口可见，发布表单支持类别 |
| 活动报名计数 | 满员禁用报名；报名成功后本地更新并在云端 `events.signed` 自增 |
| CloudBase 初始化 | `app.js` 调用 `wx.cloud.init`，配置来源为 `config/cloud.js` |
| 云函数后端 | 11 个云函数：`getOpenId`、`getCatalog`、`seedDemoData`、`manageCatalog`、`createOrder`、`createReservation`、`listEvents`、`createEvent`、`joinEvent`、`listMyRecords`、`cleanupSmokeData` |
| 云状态检查页面 | `pages/cloud-status/index` 可检查 openid、写入默认数据、跑订单/预约/活动/报名/记录/商品管理链路，并清理自动检查记录 |
| Windows 工具入口收敛 | `start-sanmuhe.bat` 只保留配置、预检、部署云函数、打开微信开发者工具；已移除二维码生成和网页预览入口 |

## 已验证

本机静态验证：

```text
find sanmuhe-miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check
node --check scripts/verify-cloud-migration.js
node scripts/verify-cloud-migration.js
```

当前综合验证结果：

```text
ok: true
codeReady: true
readyForWechatDevtools: true
pages: 10
cloud functions: 11
cloudfunctionRoot: cloudfunctions/
icon package budget: 47KB
local asset package budget: 886KB
lean launcher: true
```

CloudBase MCP 实时验证：

```text
auth_status: READY
current_env_id: sanmuhe-env-d3g1nt3jsa1be67e3
env Status: NORMAL
database Status: RUNNING
function totalCount: 11
function statuses: Active
latest createOrder ModTime: 2026-05-15 15:39:30
```

## 当前使用方式

1. 用微信开发者工具打开 `F:\sanmuhe\sanmuhe-miniprogram`。
2. 点击编译或热部署查看效果。
3. 需要重新部署云函数时，运行 `deploy-cloudfunctions.bat`。
4. 在小程序「云开发状态」页依次点击 `检查 getOpenId 云函数`、`写入默认商品和活动`、`检查商品/活动管理`、`运行云端写入检查`。

## 当前限制

支付、库存扣减、发货管理、管理员权限和消息通知仍需要接入微信支付、运营侧权限规则和通知模板后才能用于真实经营。基础商品、茶饮、预约、活动、订单和用户记录链路已经接入 CloudBase。
