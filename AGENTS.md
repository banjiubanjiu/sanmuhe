# Project Rules

## Environment Links (找后台/控制台先看这里)

- 经营后台（管理面板 Web）: `https://cloudbase-d2gq023qn50e9d82f-1458290161.tcloudbaseapp.com/`（注意域名带 `-1458290161` 后缀，缺后缀会 418）
- CloudBase 控制台: `https://console.cloud.tencent.com/tcb/env/index?envId=cloudbase-d2gq023qn50e9d82f`
- envId: `cloudbase-d2gq023qn50e9d82f`；完整环境信息、静态托管部署命令见 `docs/环境与链接.md`
- 微信支付接入角色：普通商户直连（商户自行申请商户号并收款），排查及文档检索默认使用 APIv3 普通商户路径。
- 支付资金结算受微信「交易类小程序」担保管控（发货信息录入后才进结算周期，快递 T+10 / 自提·虚拟 T+2）。发货上传自愈与部署纪律见 `docs/支付资金冻结防护.md`；禁用仓库 cloudbaserc 对支付函数裸 `tcb fn deploy --force`（会冲掉 WX_MP_APPSECRET 导致资金冻结）。
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
