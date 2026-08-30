# Project Rules

## 小程序版本号管理（上传约定，务必先读）

**当前版本：`1.09`**（2026-08-28 按用户指定版本号重新上传的开发版；含：7 款礼盒商品及图片、秋拾/纳福/拾茗自选礼盒、自选茶卡移除缩略图、无产地商品列表及详情空占位修复、首页首屏优化、分享码进首页修复、后台商品中心/余额调整。状态：待设体验版 → 提审发布）。

上传命令（在 `sanmuhe-miniprogram/` 目录执行）：

```bash
VERSION="1.09" DESC="变更摘要" node ../scripts/upload-trial-miniprogram.mjs
```

规则：

- **版本号以用户指定为准**（用户说「版本号 1.08」就用 `1.08`）。用户未指定时**不要**自作主张用日期版本号，先确认或询问；上传脚本默认 `0.1.<yyyymmdd>` 仅作兜底。
- 每次上传后**立即更新本节的「当前版本」与变更摘要**，避免下次搞混。
- 通常不要重复使用版本号；若用户明确指定则以用户要求为准。已用：`0.1.20260828`、`0.1.20260829`、`0.1.20260830`（可忽略）、`1.08`（含礼盒丢失 bug，勿用）、`1.09`（当前，已按用户要求重传；含完整礼盒展示、图片、自选茶卡无缩略图和无产地占位修复）。
- 上传 ≠ 发布：设体验版需在公众平台「版本管理 → 选为体验版」；顾客生效需「提审 → 发布」。
- 上传前先跑 `node --check` 校验改动过的 JS；包体超限时先查 `du -h --max-depth=1`。

## Environment Links (找后台/控制台先看这里)

- 经营后台（管理面板 Web）: `https://cloudbase-d2gq023qn50e9d82f-1458290161.tcloudbaseapp.com/`（注意域名带 `-1458290161` 后缀，缺后缀会 418）
- CloudBase 控制台: `https://console.cloud.tencent.com/tcb/env/index?envId=cloudbase-d2gq023qn50e9d82f`
- envId: `cloudbase-d2gq023qn50e9d82f`；完整环境信息、静态托管部署命令见 `docs/环境与链接.md`
- 微信支付接入角色：普通商户直连（商户自行申请商户号并收款），排查及文档检索默认使用 APIv3 普通商户路径。
- 支付资金结算受微信「交易类小程序」担保管控（发货信息录入后才进结算周期，快递 T+10 / 自提·虚拟 T+2）。发货上传自愈与部署纪律见 `docs/支付资金冻结防护.md`；禁用仓库 cloudbaserc 对支付函数裸 `tcb fn deploy --force`（会冲掉 WX_MP_APPSECRET 导致资金冻结）。支付密钥已托管到云数据库 `app_secrets/live`（4 个支付函数冷启动自愈注入，部署冲不掉）；换密钥跑 `node scripts/sync-app-secrets.mjs`。
- 后台构建: `cd sanmuhe-miniprogram && npm run admin:build`，产物在 `admin-panel/admin/`，部署用 `tcb hosting deploy ../admin-panel/admin / --env-id cloudbase-d2gq023qn50e9d82f`

## Cloud-First Assets And Data

- If a file or dataset is needed by the WeChat Mini Program frontend, persist it to CloudBase first. Do not leave frontend-required content only as local files.
- Local images are source material only unless they are deliberately part of the mini program package. Business images for carousel, products, tea rooms, events, notices, and profile surfaces should be uploaded to CloudBase storage or managed through the backend content/catalog forms.
- Admin web builds are deployed through CloudBase static hosting or CloudApp. They are not mini program source code and must not be included in WeChat preview/upload packages.
- Before previewing or uploading the mini program, confirm `project.config.json` ignores `admin/`, `admin-src/`, `node_modules/`, and admin build dependencies so the source package stays below the WeChat size limit.
- When adding new generated assets, state whether they are local-only design references, mini program package assets, CloudBase storage files, or CloudBase-hosted admin assets.

### Cloud storage image rules (summary)

- **Business photos** (tea products, drinks, carousel, rooms, events, etc.): CloudBase storage under `mp-assets/images/`, DB fields store `cloud://...` fileIDs. Toggle/helpers: `sanmuhe-miniprogram/config/assets.js` (`USE_CLOUD_ASSETS=true`).
- **UI icons only**: keep in `sanmuhe-miniprogram/assets/icons/` package paths.
- **Upload**: `tcb storage upload ./assets/images mp-assets/images`; admin form uses `cloudApp.uploadFile` → `admin/<collection>/...`.
- **ACL**: storage must be user-readable for business images (not PRIVATE-only).
- **Full rules, path prefixes, CDN, seed sync, forbidden practices**: `sanmuhe-miniprogram/AGENTS.md` → **Cloud Storage Images (业务图规则)**.

## Icons

- For UI icons (tab bar, bottom actions, list meta, empty states), **use a professional icon library first**—default **Lucide** (`lucide-static`, ISC). Do not invent icons, reuse wrong metaphors (e.g. star for share), or AI-generate UI glyphs when a library icon exists.
- Mini program workflow: Lucide SVG → recolor stroke → PNG into `sanmuhe-miniprogram/assets/icons/` → reference `/assets/icons/...`. Keep UI icons in the package; business photos stay on CloudBase.
- Full steps, naming, and design rules: `sanmuhe-miniprogram/AGENTS.md` → section **Icons (Use An Icon Library First)**.

## Customer-Facing Copy

- Never turn product logic, implementation notes, test state, or architecture explanations into customer-facing copy. Internal facts should shape behavior, not be narrated to users.
- Do not expose phrases such as “普通点单无需登录/开通会员”, “云端提交”, “后台未配置”, “自动识别”, “白名单”, “功能联调”, missing environment variables, payment configuration, or release-state explanations in production UI.
- When a feature is unavailable, hide or disable the unavailable action when practical; otherwise use customer language such as “暂未开放” or “敬请期待”. Never explain backend configuration to the customer.
- UI copy should communicate the user’s benefit, current state, and next action in the 禾煦 brand voice. Keep technical diagnostics in logs, admin tools, health pages, and developer documentation.
- Detailed review rules and examples: `sanmuhe-miniprogram/AGENTS.md` → **Separate Product Logic From User Copy**.

## DevTools compile

- After mini program UI/code changes, **compile/refresh via `wechat-devtools-cli` yourself** (`cache --clean compile` + `open --project`). Do not habitually ask the user to recompile. Details: `sanmuhe-miniprogram/AGENTS.md` → **Compile yourself**.

## E2E 验证（功能改动必须自测，别让用户反复试）

- 验证小程序功能用 **miniprogram-automator 驱动微信开发者工具**做真实 E2E，不要只靠用户反馈。
- 前置：`wechat-devtools-cli auto --project sanmuhe-miniprogram --port 9420 --trust-project`（或直接让 automator.launch 自带启动；需先退出已占用端口的 IDE：`wechat-devtools-cli quit` + `pkill -9 -f wechat-web-devtools`）。
- 脚本：`sanmuhe-miniprogram/node_modules` 装 `miniprogram-automator`；示例 `scripts/e2e-giftbox.js`（连 9420 → reLaunch 商城 → 切礼盒分类 → 进详情选茶 → 断言价格 → 加购）。
- 注意：`automator.launch({ cliPath: '/home/colin/.local/bin/wechat-devtools-cli', port: 9420 })`；商城首屏只渲染 6 个商品（分页），断言“全部”列表时不要只看首屏；礼盒在「礼盒」分类下验证。
- 关键结论（2026-08-28 已验）：礼盒分类显示 3 款、自选器存在、红茶+大红袍=¥198、加购成功。
