# 微信小程序云开发学习记录

记录日期：2026-05-14

## 适用范围

这份笔记面向当前的 `sanmuhe-miniprogram` 项目，用来记录接入微信小程序云开发前必须确认的概念、配置和落地步骤。

当前项目状态：

- `sanmuhe-miniprogram/project.config.json` 的 `appid` 仍是 `touristappid`，不能使用云开发。
- 项目还没有 `cloudfunctionRoot`，也没有 `cloudfunctions/` 目录。
- `sanmuhe-miniprogram/app.js` 目前只初始化本地缓存，没有调用 `wx.cloud.init`。
- 订单、预约、购物车等数据目前主要放在 `wx.getStorageSync` / `wx.setStorageSync` 本地存储里。

## 核心概念

云开发是微信小程序内置的后端能力，适合不单独维护服务器的场景。基础能力主要包括：

- 云函数：运行在云端的 Node.js 逻辑，可通过微信登录态拿到可信的 `openid`、`appid`、满足条件时的 `unionid`。
- 云数据库：JSON 文档数据库，小程序端和云函数端都能访问，但权限模型不同。
- 云存储：小程序端或云函数端上传、下载和管理文件。
- 控制台：在微信开发者工具的「云开发」入口管理环境、数据库、存储、函数、日志、配额和运营分析。

## 接入前提

1. 必须使用真实小程序 AppID。游客模式和测试号不能使用云开发。
2. 微信基础库需支持云能力。官方文档说明云开发从基础库 `2.2.3` 开始支持；本项目配置的 `libVersion` 是 `3.7.12`，版本本身满足要求。
3. 需要在微信开发者工具里开通云开发并创建环境。默认配额下可创建多个隔离环境，每个环境都有独立的数据库、存储和云函数配置。
4. 首次创建云环境后，云 API 可能需要等待约 10 分钟才能正常调用。等待期间调用可能出现 `cloud init error: invalid scope`。
5. 当前项目要先把 `project.config.json` 的 `appid` 从 `touristappid` 换成真实 AppID，再在工具里开通云开发。

## 项目配置

在 `sanmuhe-miniprogram/project.config.json` 增加云函数根目录：

```json
{
  "cloudfunctionRoot": "cloudfunctions/"
}
```

建议目录结构：

```text
sanmuhe-miniprogram/
  app.js
  project.config.json
  cloudfunctions/
    getOpenId/
      index.js
      package.json
    createOrder/
      index.js
      package.json
    createReservation/
      index.js
      package.json
```

微信开发者工具识别 `cloudfunctionRoot` 后，可以在 `cloudfunctions/` 上右键创建、部署和调试云函数。

## 小程序端初始化

云 API 使用前需要全局初始化一次，通常放在 `app.js` 的 `onLaunch` 中。`wx.cloud.init` 多次调用时只有第一次生效，所以环境切换要提前设计好。

```js
App({
  globalData: {
    brand: "三木合",
    storeName: "三木合茶事空间",
    storeAddress: "上海市徐汇区梧桐街 33 号",
    servicePhone: "021-0000-3333"
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }

    wx.cloud.init({
      env: "your-env-id",
      traceUser: true
    });

    const seeded = wx.getStorageSync("sanmuhe_seeded");
    if (!seeded) {
      wx.setStorageSync("sanmuhe_orders", []);
      wx.setStorageSync("sanmuhe_reservations", []);
      wx.setStorageSync("sanmuhe_custom_events", []);
      wx.setStorageSync("sanmuhe_seeded", true);
    }
  }
});
```

`env` 是云开发环境 ID，可在云开发控制台复制。也可以按 API 类型拆分环境，例如数据库、存储、云函数分别指向不同环境，但本项目初期不建议复杂化。

## 云函数

云函数适合放置需要可信用户身份、权限校验、订单写入、库存扣减、预约冲突检查、服务通知等逻辑。

基础模板：

```js
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();

  return {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || "",
    input: event
  };
};
```

小程序端调用：

```js
wx.cloud.callFunction({
  name: "getOpenId",
  data: {}
}).then((res) => {
  console.log(res.result);
}).catch(console.error);
```

注意点：

- 云函数目录名就是函数名。
- 新建或修改云函数后，需要在微信开发者工具里上传并部署。
- 云函数可以本地调试，模拟器内发起的调用可以转到本地云函数实例。
- 云函数里的 `wx-server-sdk` 需要在对应函数目录安装依赖：`npm install --save wx-server-sdk@latest`。
- 云函数是管理端，默认拥有更高的数据库和存储权限。不能因为拿到了某个用户的 `openid` 就直接信任所有传入字段，仍要做业务校验。

## 数据库

小程序端获取默认环境数据库：

```js
const db = wx.cloud.database();
const orders = db.collection("orders");
```

指定环境：

```js
const db = wx.cloud.database({
  env: "your-env-id"
});
```

常见集合建议：

- `products`：茶饮、茶叶商品、库存、上下架状态。
- `orders`：堂食扫码下单、电商订单、金额、状态、`_openid`。
- `reservations`：茶室预约、联系人、手机号、日期时间、状态、`_openid`。
- `events`：活动报名、名额、报名状态。
- `users`：用户档案、授权手机号、会员信息。

本项目建议先不要让小程序端直接写关键业务集合，而是通过云函数写入 `orders` 和 `reservations`。原因是云函数能统一做库存、预约冲突、字段白名单和手机号格式校验。

## 权限规则

数据库和存储都要在控制台配置权限。一个常见起点：

```json
{
  "read": true,
  "write": "auth != null && doc._openid == auth.openid"
}
```

这表示公开可读，只有登录用户能写自己的记录。实际项目里要按集合拆分：

- `products`、`events` 可以公开读，后台或云函数写。
- `orders`、`reservations` 只允许用户读自己的记录，写入走云函数。
- 涉及手机号、实名认证、支付信息的集合不要公开读。

## 云存储

小程序端上传文件示例：

```js
wx.chooseMedia({
  count: 1,
  mediaType: ["image"]
}).then((res) => {
  const filePath = res.tempFiles[0].tempFilePath;
  const cloudPath = `uploads/${Date.now()}.jpg`;

  return wx.cloud.uploadFile({
    cloudPath,
    filePath
  });
}).then((res) => {
  console.log(res.fileID);
}).catch(console.error);
```

当前项目可能用到云存储的场景：

- 活动封面、茶室图片、商品图。
- 用户上传的售后凭证或定制活动素材。

存储权限需要特别谨慎。如果同一个存储桶里既有公开图片又有隐私图片，不要只靠目录名隔离；应结合数据库记录、云函数签发临时访问或把敏感文件单独设计访问链路。

## 三木合项目落地顺序

1. 使用真实 AppID 打开项目，确认开发者工具能开通云开发。
2. 创建开发环境，记录环境 ID。
3. 在 `app.js` 增加 `wx.cloud.init({ env, traceUser: true })`。
4. 在 `project.config.json` 增加 `cloudfunctionRoot`，创建 `cloudfunctions/`。
5. 先做 `getOpenId` 云函数，验证云函数调用和登录态。
6. 建立 `products`、`orders`、`reservations` 三个集合和基础权限规则。
7. 把预约提交从本地 `sanmuhe_reservations` 改为 `createReservation` 云函数。
8. 把购物车结算从本地 `sanmuhe_orders` 改为 `createOrder` 云函数。
9. 再考虑商品、活动数据从静态 `data/catalog.js` 迁移到云数据库。

## 常见问题排查

- `wx.cloud` 不存在：基础库太低，或不是云开发可用的小程序运行环境。
- `invalid scope`：首次开通环境后的后台准备期，等待后重试。
- `env not exists`：环境 ID 填错，或 AppID 与环境不属于同一个小程序。
- `storage permission denied`：未初始化正确环境，或存储权限规则不允许当前用户访问。
- 云函数调用失败：先看开发者工具云函数日志，再确认是否已部署、依赖是否安装、函数名是否和目录名一致。

## 参考资料

- 微信开放文档：新建云开发模板  
  https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/basis/quickstart.html
- 微信开放文档：云数据库初始化  
  https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/database/init
- 微信开放文档：我的第一个云函数  
  https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/functions/getting-started.html
- 微信开放文档：获取小程序用户信息  
  https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/functions/userinfo.html
- 微信开放文档：在云函数中使用 wx-server-sdk  
  https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/functions/wx-server-sdk
- 腾讯云开发 CloudBase：小程序快速开始  
  https://docs.cloudbase.net/quick-start/mini-program/introduce
