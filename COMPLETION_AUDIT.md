# 三木合完成度审计

更新时间：2026-05-15

## 目标拆解

用户目标：阅读 `docs` 下全部 UI 图片，补齐缺失界面和真实可用流程；补足图片、文字、图标等素材；在控制小程序包体积的前提下，让微信小程序接近真实可用。

已根据最新反馈移除二维码生成、二维码检查、浏览器网页预览等冗余交付路径。网页预览原本只是当前环境下的截图和 UI 冒烟工具，不属于小程序本体。

## Prompt 到产物清单

| 要求 | 产物 / 命令 | 当前证据 | 状态 |
| --- | --- | --- | --- |
| 阅读 docs 下全部图片 | `docs/UI设计.png`、`docs/1.png` 到 `docs/6.png`、`docs/我的界面.png` | 首页、分类、商品详情、茶饮点单、茶室预定、活动发布、我的页面均已实现 | 已完成 |
| 补齐缺失界面 | `pages/index`、`pages/shop`、`pages/product`、`pages/order`、`pages/cart`、`pages/reservation`、`pages/events`、`pages/event-edit`、`pages/profile`、`pages/cloud-status` | `app.json` 注册 10 个页面，验证器检查全部页面四件套存在 | 已完成 |
| 补足素材和文字 | `assets/images/*`、`data/catalog.js` | 茶叶、茶饮、茶室、活动、会员中心图片均为本地素材；商品和活动数据携带 `image/thumb` | 已完成 |
| 专业图标库 | `assets/icons/*.png` | 使用 `lucide-static@1.16.0` 生成本地图标，图标包约 47KB | 已完成 |
| 控制包体积 | `scripts/verify-cloud-migration.js` | 本地素材包约 886KB，验证器限制 `assets` 小于 2MB | 已完成 |
| 分类/点单加号不再丑大 | `pages/shop/index.*`、`pages/order/index.*` | 加购控件为本地 `plus-white.png` 图标容器；点单购物车为有商品才出现的紧凑胶囊 | 已完成 |
| 商品真实可买 | `pages/product/index.*`、`utils/cart.js` | 规格、数量、动态价格、加入购物车均已接入 | 已完成 |
| 购物车结算体验 | `pages/cart/index.*`、`cloudfunctions/createOrder` | 微信地址选择、到店支付/客服确认配送文案、云端订单写入、服务端价格重算 | 已完成 |
| 茶室真实可约 | `pages/reservation/index.*`、`cloudfunctions/createReservation` | 预约弹层可提交日期、时间、人数、联系人和备注 | 已完成 |
| 活动真实可运营 | `pages/events`、`pages/event-edit`、`createEvent`、`joinEvent` | 活动筛选、发布、报名、满员禁用、云端报名数自增均已接入 | 已完成 |
| 我的页真实可用 | `pages/profile/index.*`、`listMyRecords`、`utils/favorites.js` | 会员中心、订单入口、服务宫格、收藏、最近预约/活动、云端记录均已实现 | 已完成 |
| 云开发接入 | `app.js`、`config/cloud.js`、`utils/cloudApi.js`、`cloudfunctions/*` | AppID/envId 已写入；11 个云函数目录和 `cloudbaserc.json` 已存在 | 已完成 |
| 云端部署状态 | CloudBase MCP | 环境 `NORMAL`，数据库 `RUNNING`，11 个云函数全部 `Active` | 已完成 |
| 冗余二维码/网页流程移除 | 根目录脚本、`scripts/verify-cloud-migration.js`、文档 | 已删除二维码生成/检查脚本、网页预览目录和截图；启动菜单只保留配置、预检、部署云函数、打开开发者工具 | 已完成 |

## 当前验证命令

```text
find sanmuhe-miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check
node --check scripts/verify-cloud-migration.js
node scripts/verify-cloud-migration.js
```

当前验证结果：

```text
ok: true
codeReady: true
readyForWechatDevtools: true
icon package budget: 47KB
local asset package budget: 886KB
compact icon add and cart pill: true
cart checkout production copy: true
reservation fallback production copy: true
cloud smoke cleanup flow: true
lean launcher: true
```

## 实际使用

在微信开发者工具中打开 `F:\sanmuhe\sanmuhe-miniprogram`，点击编译或热部署即可查看。需要重新部署云函数时运行根目录 `deploy-cloudfunctions.bat`。

## 仍需业务侧配置

支付、库存、发货、管理员权限、消息通知需要正式经营资料和微信支付/运营规则后继续接入；这不属于当前 UI 与 CloudBase 基础链路补齐范围。
