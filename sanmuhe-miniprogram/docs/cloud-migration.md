# 禾煦云开发接入说明

当前项目已经完成代码层云开发迁移：小程序端会优先调用云函数；如果没有配置云环境，则自动使用本地演示数据，方便继续查看页面。

## 当前线上部署

- 云环境：`cloudbase-d2gq023qn50e9d82f`（新小程序 `wx47e7cc7143682291`）。
- 2026-07-25 已更新 `listMyRecords`：订单分页、详情、取消、确认收货、售后申请和用户归属校验。
- 2026-07-25 已更新 `createPayment`：增加支付预下单与取消订单的并发保护。
- 两支函数均为 Event Function，保持原有 Nodejs16.13 运行时、内存、超时和环境变量配置。
- 真实微信支付仍保持关闭；商户号、证书序列号、商户私钥及微信支付平台公钥/证书配置完整并完成真机验证前，不得开启 `REAL_PAYMENT_ENABLED`。

## 必填配置

1. 在微信公众平台拿到真实小程序 AppID。
2. 在 `project.config.json` 中把 `appid` 从 `touristappid` 改成真实 AppID。
3. 用微信开发者工具打开项目，进入「云开发」并创建环境。
4. 复制云环境 ID，填入 `config/cloud.js`：

```js
module.exports = {
  envId: "你的云环境ID",
  useCloud: true
};
```

没有真实 AppID 或环境 ID 时，微信不允许真正使用云开发。

也可以在 Windows 双击项目上级目录的 `configure-cloud.bat`，按提示输入 AppID 和 envId，脚本会自动写入 `project.config.json` 和 `config/cloud.js`。

## 云函数

项目已增加 `cloudfunctionRoot`：

```json
"cloudfunctionRoot": "cloudfunctions/"
```

云函数目录：

- `getOpenId`：验证云函数和微信登录态。
- `getCatalog`：读取云端茶饮、茶叶、茶室、活动和首页内容；云端为空时返回空列表，生产数据应由后台保存或导入到云数据库。
- `seedDemoData`：把默认茶饮、茶叶、茶室和活动写入云数据库。
- `manageCatalog`：后台商品、茶室和活动的列表、详情、新增、更新、下架/删除和恢复。
- `createOrder`：创建茶饮/茶叶订单。
- `createReservation`：创建茶室预约，并检查同一茶室时段冲突。
- `listEvents`：读取活动列表。
- `createEvent`：发布活动。
- `joinEvent`：活动报名，防止同一用户重复报名。
- `listMyRecords`：读取当前用户订单、预约和活动报名。
- `memberCenter`：会员主动开通、手机号核验、会员资料、储值套餐、测试充值与钱包查询。
- `createPayment`：普通订单和会员充值的微信支付预下单；缺少支付配置时拒绝真实下单。
- `wechatPayNotify`：微信支付回调验签、解密、订单确认和会员充值入账。
- `cleanupSmokeData`：清理「云开发状态」页自动检查产生的测试订单、预约、活动和报名记录。

项目还包含 `cloudbaserc.json`，用于让维护者快速了解当前云开发资源清单。实际部署仍建议优先使用微信开发者工具 CLI 或开发者工具右键部署。

## 部署步骤

在微信开发者工具里：

1. 打开项目后，确认左侧能看到 `cloudfunctions`。
2. 逐个右键云函数目录，选择「上传并部署：云端安装依赖」。
3. 先部署 `getOpenId`，测试通过后再部署其他函数。
4. 如果函数首次调用失败，等待云环境初始化完成后重试。

也可以在 Windows 命令行运行项目上级目录的批处理脚本：

```bat
deploy-cloudfunctions.bat 你的云环境ID
```

该脚本会调用微信开发者工具 CLI 一次性部署全部云函数，并启用云端安装依赖。

部署后可以进入「云开发状态」页面，先检查 `getOpenId`，再点击「写入默认商品和活动」。该按钮会调用 `seedDemoData`，把示例数据写入 `drinks`、`tea_products`、`rooms`、`events` 集合。

「运行云端写入检查」会依次调用 `createOrder`、`createReservation`、`createEvent`、`joinEvent`、`listMyRecords`、`manageCatalog`，用于确认订单、预约、活动发布、活动报名、我的记录和商品/活动管理链路都能写入并读回云数据库。检查记录会带 `source: cloud-status-smoke` 标记，跑完后可点「清理自动检查记录」，调用 `cleanupSmokeData` 删除当前用户的自动检查数据。

## 数据集合

云函数会尝试自动创建以下集合；如果控制台未自动出现，可以手动创建：

- `drinks`
- `tea_products`
- `rooms`
- `orders`
- `reservations`
- `events`
- `event_signups`
- `members`
- `membership_plans`
- `wallet_accounts`
- `wallet_ledger`
- `recharge_orders`

建议权限：

- `drinks`、`tea_products`、`rooms`、`events`：公开读，写入走云函数或后台。
- `orders`、`reservations`、`event_signups`：仅用户读自己的数据，写入走云函数。
- `members`、`membership_plans`、`wallet_accounts`、`wallet_ledger`、`recharge_orders`：全部仅管理员读写，客户端统一通过云函数访问，避免手机号、账户余额和流水被直接读取或篡改。

## 会员储值测试与上线

- 普通顾客不需要开通会员即可下单；会员权益、充值和余额支付才要求姓名与微信手机号授权。
- 当前云端套餐为「充 500 送 100」和「充 1000 送 250」，金额由云端 `membership_plans` 校验，客户端提交的金额不会被信任。
- `MEMBER_TEST_MODE=true` 时，只有 `MEMBER_TEST_OPENIDS`、`ADMIN_OPENIDS` 或 `STAFF_OPENIDS` 中的用户可以模拟充值。
- 真实充值还需要分别为支付下单函数和支付回调函数安全配置商户号、API v3 密钥、商户私钥、证书序列号、平台公钥/平台证书及回调 URL。密钥只放 CloudBase 环境变量，不写入仓库。
- 所有真实支付配置与真机小额回调验证完成前，保持 `memberCenter` 与 `createPayment` 的 `REAL_PAYMENT_ENABLED=false`（未配置也按关闭处理）。

## 开发者工具流程

Windows 里双击项目上级目录的：

- `start-sanmuhe.bat`：总入口菜单，可选择配置、预检、部署云函数或打开开发者工具。
- `read-cloud-config.ps1`：读取当前已保存的 AppID/envId，供部署脚本复用。
- `check-cloud-ready.bat`：预检 AppID、envId、云函数目录和微信开发者工具登录状态。
- `open-sanmuhe-devtools.bat`：打开项目。
- `deploy-cloudfunctions.bat`：部署 11 个云函数。

打开项目后，直接在微信开发者工具里点击编译或热部署查看效果。

云函数部署脚本会把输出写入 `downloads`：

- `sanmuhe-cloudfunctions-deploy.log`：云函数部署输出。

## 云开发状态检查

项目里已添加 `pages/cloud-status/index`。打开小程序后进入「我的禾煦」，点击「云状态」，再点击「检查 getOpenId 云函数」。

- 如果成功，会显示当前用户 `openid` 和 AppID。
- 如果提示未配置 envId，先运行 `configure-cloud.bat`。
- 如果提示云函数调用失败，先部署 `getOpenId`，再检查云函数日志。
- 如果默认商品没有出现在云数据库，确认 `seedDemoData` 已部署，再点击「写入默认商品和活动」。
- 如果云端写入检查失败，确认 11 个云函数都已部署，再查看 `downloads\sanmuhe-cloudfunctions-deploy.log` 和微信开发者工具云函数日志。
- 如果多次运行写入检查，跑完后点「清理自动检查记录」，避免测试数据混入真实订单、预约和活动。
