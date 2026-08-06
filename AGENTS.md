# Project Rules

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
