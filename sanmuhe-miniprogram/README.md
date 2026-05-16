# 三木合微信小程序

三木合茶事空间的小程序原型，使用原生微信小程序开发，无需安装依赖，可直接用微信开发者工具导入。

## 已完成的功能

- 茶饮点单：茶饮分类、图片菜单、小号图标加购、有商品时显示紧凑购物车结算胶囊。
- 茶叶购买：茶叶分类、商品详情、加入茶篮、统一结算。
- 茶室预约：茶室选择、日期时间选择、人数、联系人、备注、本地预约记录。
- 活动发布：活动列表、活动报名、活动发布表单、本地活动记录。
- 我的会员中心：会员权益、订单入口、服务宫格、最近预约和最近活动。
- 云开发迁移：已加入云函数根目录和云函数；订单、预约、活动发布/报名、我的记录优先走云函数，未配置云环境时商品与内容仍展示默认资料，但下单、预约、报名、发布不会伪造本地成功记录。
- 经营闭环：商品订单支持后端重算金额、15 分钟库存锁定、微信支付 JSAPI 预支付、支付成功回调更新订单、超时自动释放库存；`admin/` 提供独立经营后台静态页。

## 打开方式

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择 `sanmuhe-miniprogram`。
4. 如果要使用云开发，必须把 `project.config.json` 里的 `appid` 改成三木合真实小程序 AppID；`touristappid` 只能看本地演示界面，不能调用云开发。

如果已经安装微信开发者工具，也可以在 Windows 里双击项目上级目录的 `open-sanmuhe-devtools.bat` 直接打开项目。

也可以双击项目上级目录的 `start-sanmuhe.bat`，在一个菜单里选择配置云环境、预检、部署云函数或打开开发者工具。

## 云开发

云开发配置和部署说明见 `docs/cloud-migration.md`。正式使用云开发前，必须把 `project.config.json` 的 `appid` 替换成真实小程序 AppID，并把 `config/cloud.js` 的 `envId` 填成真实云环境 ID。

Windows 下可以双击项目上级目录的 `configure-cloud.bat` 自动配置 AppID 和 envId。

如果热部署前想先检查环境，双击 `check-cloud-ready.bat`。它会检查 D 盘微信开发者工具 CLI、AppID、envId、云函数目录和登录状态。

如果想检查代码迁移完整性，双击 `verify-cloud-migration.bat`，它会输出页面、云函数、脚本和配置状态。

不知道 AppID 或 envId 在哪里时，查看项目上级目录的 `docs/get-wechat-appid-envid.md`。

## 正式上线还需要的信息

- 小程序 AppID、主体认证信息、备案状态。
- 微信支付商户号、API v3 密钥、商户证书、支付回调域名。
- 支付回调域名和 SSL 证书；商品、订单、预约、活动的基础能力已经迁移到云函数，除非后续接入外部系统，否则不需要单独业务服务器。
- 云函数环境变量：`WECHAT_PAY_APPID`、`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_CERT_SERIAL_NO`、`WECHAT_PAY_PRIVATE_KEY`、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_NOTIFY_URL`、`WECHAT_PAY_PLATFORM_PUBLIC_KEY` 或 `WECHAT_PAY_PLATFORM_CERTIFICATE`。
- 管理后台白名单：`ADMIN_UIDS` 或 `ADMIN_USERNAMES`；小程序内测管理继续使用 `ADMIN_OPENIDS`。
- 茶叶经营资质：营业执照，以及《食品经营许可证》《食品生产许可证》或《预包装食品销售备案凭证》之一，按实际售卖类型确认。
- 门店信息：地址、营业时间、客服电话、茶室数量、可预约时段、取消规则。
- 商品资料：茶饮菜单、茶叶 SKU、库存、图片、价格、规格、运费规则。
- 活动运营规则：发布权限、报名名额、收费方式、退款规则。

## 经营后台

后台位于 `admin/`，是可直接上传到 CloudBase 静态托管的纯静态网页。上线前需在 CloudBase 身份认证中启用用户名密码登录、创建管理员账号、配置安全域名，并部署 `manageCatalog` 与 `manageOperations` 云函数。

后台已按经营后台参考图补齐主要板块：经营首页、茶室预约、茶事活动、订单管理、用户管理、商品管理、内容管理、数据统计、营销中心、设置管理。除优惠券核销、积分等级自动结算和订阅消息主动发送外，其他板块都直接读写 CloudBase 数据集合或云函数。

## 后续接口建议

- `GET /api/drinks` 茶饮菜单
- `GET /api/teas` 茶叶商品
- `POST /api/orders` 创建订单
- `POST /api/pay/wechat/prepay` 微信支付下单
- `POST /api/pay/wechat/notify` 微信支付回调
- `POST /api/shipping/upload` 订单发货信息上传
- `GET /api/rooms` 茶室列表
- `POST /api/reservations` 创建预约
- `GET /api/events` 活动列表
- `POST /api/events` 发布活动
- `POST /api/events/:id/signup` 活动报名

## 当前限制

未配置真实 AppID/envId 时，当前版本只会回退展示默认商品和内容，不会把下单、预约、报名伪造成真实成功。配置并部署云函数后，茶饮、茶叶、茶室、订单、预约、活动、首页轮播、优惠券数量会优先走云开发。商品支付必须等微信支付商户环境变量、支付回调 HTTP 入口和函数权限配置完成后才能真机实测；茶室预约和活动报名仍是提交后人工确认，不做在线收费和自动退款。
