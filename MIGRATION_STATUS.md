# 禾煦云开发迁移状态

更新时间：2026-07-25

## 当前目标环境

| 项 | 值 |
| --- | --- |
| AppID | `wx47e7cc7143682291` |
| envId | `cloudbase-d2gq023qn50e9d82f` |

旧环境 `wxaf9aedf1f6343786` / `sanmuhe-env-d3g1nt3jsa1be67e3` 已停止作为默认目标；几乎无正式用户，不做 openid/余额迁移。

## 代码侧已对齐

- 小程序 `project.config.json`、`config/cloud.js`、`cloudbaserc.json`
- 根目录 `project.config.json`
- 管理后台 `admin-src` 的 AppID/envId（Publishable Key 需在新环境重新粘贴）
- 云函数白名单 openid 已清空，等待新号真机 `getOpenId` 后回填

## 你这边待完成

详见 `docs/新小程序迁移清单.md`：

1. 微信开发者工具打开 `sanmuhe-miniprogram`，部署全部云函数  
2. 真机取 openid，写入 `ADMIN_OPENIDS` / `STAFF_OPENIDS` / `MEMBER_TEST_OPENIDS`  
3. 新环境创建 Publishable Key，写入后台并 `npm run admin:build`  
4. 云开发状态页写入默认商品/活动  
5. 公众平台：隐私指引、类目、支付（按需）

## 本地静态检查

```bash
cd sanmuhe-miniprogram
find . -path ./node_modules -prune -o -name '*.js' -print0 | xargs -0 -n1 node --check
node ../scripts/verify-cloud-migration.js
```
