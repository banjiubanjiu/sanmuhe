# Sanmuhe Mini Program Rules

## 版本号（以仓库根 AGENTS.md「小程序版本号管理」为准）

当前版本 **`1.09`**；上传用 `VERSION="1.08" DESC="..." node ../scripts/upload-trial-miniprogram.mjs`（在 `sanmuhe-miniprogram/` 执行）。版本号以用户指定为准，勿自行改用日期号；上传后更新根 AGENTS.md 的「当前版本」段。

## 环境链接（找后台/控制台先看这里）

- 经营后台: `https://cloudbase-d2gq023qn50e9d82f-1458290161.tcloudbaseapp.com/`（域名带 `-1458290161` 后缀）
- CloudBase 控制台: `https://console.cloud.tencent.com/tcb/env/index?envId=cloudbase-d2gq023qn50e9d82f`
- 完整环境信息/部署命令见仓库根 `docs/环境与链接.md`；构建: `npm run admin:build`

## 云函数部署（支付密钥，必守）

`createPayment` / `wechatPayNotify` 的私钥、平台公钥、APIv3 密钥只在 `.secrets/`，**不在** `cloudbaserc.json`。
`tcb fn deploy <name> --force` 会用配置里的 env **整份覆盖**云端变量，支付会立刻不可用。

**禁止：**

```bash
tcb fn deploy createPayment --force
tcb fn deploy wechatPayNotify --force
```

**必须：**

```bash
# 有 .secrets/wechat-pay.env 时自动带密钥；没有则只更新代码、保留云端密钥
./scripts/deploy-cloudfunctions-safe.sh createPayment
./scripts/deploy-cloudfunctions-safe.sh wechatPayNotify
```

2026-08-13 已发生过一次：用仓库 cloudbaserc 全量部署冲掉平台公钥，顾客微信支付提示「环境变量未配置」。

## Cloud-First Frontend Content

- Mini program business content must be cloud-backed. Carousel images, product images, tea room images, event images, notices, coupons, member settings, and operational records should be stored in CloudBase database/storage instead of only local files.
- Use local assets only for deliberate package assets that are small, stable, and required at startup. Anything managed by the admin backend should be uploaded and referenced from CloudBase.
- Do not add admin-only source or build output to the mini program preview package. Keep `admin/`, `admin-src/`, `node_modules/`, `package-lock.json`, `package.json`, and `vite.config.mjs` ignored in `project.config.json`.
- Before any preview/upload task, check package size contributors with `du -h --max-depth=1 sanmuhe-miniprogram` and large files with `find sanmuhe-miniprogram -maxdepth 3 -type f -size +500k`.

## Cloud Storage Images (业务图规则)

业务图片走 **CloudBase 云存储**；UI 图标走小程序包。实现入口：`config/assets.js`、`config/cloud.js`。

### 环境与路径约定

| 项 | 值 |
|---|---|
| envId | `cloudbase-d2gq023qn50e9d82f` |
| 云文件前缀 | `cloud://cloudbase-d2gq023qn50e9d82f.636c-cloudbase-d2gq023qn50e9d82f-1458290161/` |
| 业务图目录 | `mp-assets/images/<filename>` |
| 库内字段 | `image` / `thumb` / `detailImage` 存 **fileID**（`cloud://...`）或 https |
| 本地源文件 | `assets/images/`（开发源与上传源；**不是**上线唯一来源） |
| 开关 | `USE_CLOUD_ASSETS = true`（`config/assets.js`）— 业务图映射到云路径 |

完整 fileID 示例：

```text
cloud://cloudbase-d2gq023qn50e9d82f.636c-cloudbase-d2gq023qn50e9d82f-1458290161/mp-assets/images/product-tea-001-organic-black.jpg
```

公有读 CDN（后台预览可用，与 fileID 同路径后缀）：

```text
https://636c-cloudbase-d2gq023qn50e9d82f-1458290161.tcb.qcloud.la/mp-assets/images/<filename>
```

### 哪些图必须上云

- 商城茶叶主图 / 缩略图 / 详情图
- 堂饮档位主图、档位下茶品图
- 首页轮播、茶室/预约主图、活动图、客服二维码/头图等运营素材
- 后台「上传图片」产生的文件（路径：`admin/<collection|content>/<timestamp>-name`）

### 哪些图留在小程序包

- **仅** `assets/icons/**`（tab、按钮、状态等 UI 图标）
- 不要把商品大图只放在包内当生产数据

### 读写与权限

- 存储 ACL 须允许用户读业务图：推荐 **「所有用户可读，仅创建者与管理员可写」**（CLI：`tcb storage set-acl` 选对应项，或 `tcb storage rules`）。
- 小程序：`wx.cloud` 已初始化后，`<image src="cloud://...">` 可直接用 fileID。
- 管理后台 Web：`cloudApp.uploadFile` 上传；预览时将 `cloud://` 转为上述 CDN URL（见 admin `displayImage`）。
- 校验允许：`cloud://`、`http(s)://`、临时兼容 `/assets/`（新数据优先云路径）。

### 映射 helper（必守）

- `localImage(path)` / `toCloudPath(path)`：本地 `/assets/images/x.jpg` → `cloud://.../mp-assets/images/x.jpg`。
- `USE_CLOUD_ASSETS=true` 时：**不要**把已有 `cloud://` 强行改回 `/assets/`。
- 图标路径含 `assets/icons/` 时**始终本地**，不上传、不改写。

### 批量上传 / 同步（agent 操作）

```bash
PROJ=/home/colin/softdev/sanmuhe/sanmuhe/sanmuhe-miniprogram
cd "$PROJ"

# 1) 上传本地业务图到云（目录 → mp-assets/images）
tcb storage upload ./assets/images mp-assets/images --times 3

# 2) 确认可读（可选）
tcb storage get-acl
tcb storage url mp-assets/images/product-tea-001-organic-black.jpg

# 3) seed 中 image/thumb/detailImage 写 cloud:// 后部署并同步
#    seed 版本与 frontendSeed.json 一并更新
tcb fn deploy seedDemoData --dir cloudfunctions/seedDemoData --force
# SEED_DEMO_ENABLED=true 时 invoke（用完改回 false）
tcb fn invoke seedDemoData --params '{"reason":"同步业务图 cloud://"}'
```

- 新增一张业务图：先放 `assets/images/`（源），上传到 `mp-assets/images/`，库字段写 `cloud://.../mp-assets/images/<file>`；或经后台上传拿 fileID。
- 改图后：更新存储对象 + 数据库字段（或重新 seed），并清 DevTools 缓存（`cache --clean storage` 如有裂图）。

### 禁止

- 新商品/运营位只写 `/assets/images/...` 且不上传云（会重新绑死主包、难运维）。
- 把 `admin/` 构建产物或整包 `assets/images` 大图依赖塞进预览包当唯一来源。
- 在存储 PRIVATE（仅创建者可读）下假定真机 `cloud://` 一定能显示——业务图需用户可读 ACL。

## Icons (Use An Icon Library First)

UI icons must look professional and match action semantics. Prefer a licensed icon library over inventing SVGs, reusing unrelated assets (e.g. star for share), or AI-generating icons.

### Preferred library

- **Lucide** (`lucide-static`, ISC license) is the default. Project icons under `assets/icons/` were largely generated from Lucide.
- Alternatives if needed: Heroicons, Phosphor (check license before commercial use).
- Do **not** scrape random PNG packs from the web without a clear license.

### When to pull new icons

- New tab/action/status needs a glyph (share, headset, calendar, cart, etc.).
- Existing icon is wrong semantically (wrong metaphor) or inconsistent in stroke style.
- Bottom bars, list meta rows, empty states, and form actions should use library icons—not decorative photos or mismatched profile icons.

### Workflow (SVG → PNG for mini program)

1. Get the SVG from Lucide, e.g. local pack `lucide-static` or CDN:
   - `https://cdn.jsdelivr.net/npm/lucide-static@0.469.0/icons/<name>.svg`
   - Common names: `share-2`, `headset`, `headphones`, `calendar-days`, `map-pin`, `clock`, `users`, `heart`, `search`.
2. Set stroke color for the UI context (ink `#312b23` / gold `#8a6230` / white `#fffaf0`), keep transparent background.
3. Rasterize to PNG (~96px, 2x for clarity) with `@resvg/resvg-js` or equivalent; write to `assets/icons/`.
4. Name by role + style: `share-line.png`, `service-line.png`, `calendar-wait.png`, `cart-active.png`—not by random source filename.
5. Reference as `/assets/icons/<file>.png` in WXML. Keep icons in the mini program package (small, stable UI chrome)—not CloudBase storage.

Example render sketch:

```js
// stroke color + size, then Resvg → PNG into assets/icons/
svg = svg.replace(/stroke="currentColor"/g, 'stroke="#312b23"');
```

### Design rules

- One icon = one clear action. Share must look like share; service must look like headset/phone—never repurpose stars/hearts for unrelated actions.
- Match stroke weight and corner style across a screen (prefer one family: Lucide outline).
- Tab bar / bottom safe-bar: compact single-row layouts; avoid stacking duplicate status copy next to icon labels.
- Prefer reusing existing `assets/icons/*` before adding files; only add when no suitable glyph exists.

## Separate Product Logic From User Copy

Product rules belong in code, specifications, and developer documentation. Customer-facing pages must not explain internal decisions or implementation details.

### Never show customers

- Authentication rationale: “普通点单无需登录”, “只有充值才需要登录”, “无需开通会员也可下单”. Enforce this silently in the flow.
- System internals: “云端提交”, “后台确认数据”, “自动识别身份”, collection/function names, environment variables, callback or deployment status.
- Operator/test language: “后台未配置”, “支付参数待配置”, “白名单测试”, “功能联调”, “真实支付已关闭”. Test labels may appear only to explicit internal testers and must clearly say no real charge will occur.
- Raw backend errors or diagnostics. Map them to a safe user message and retain the technical detail in logs.

### Write instead

- State the benefit: “加入会员，享储值礼遇：充 500 送 100、充 1000 送 250”.
- State the current user-relevant status: “储值服务暂未开放”, “通知服务暂不可用”.
- State the next action: “手机号快捷开通”, “选择充值档位”, “查看订单”.
- If no action is useful, omit the explanation entirely. Do not fill empty space with product-policy copy.

### Required copy review

Before finishing any page change, scan all visible WXML strings plus modal, toast, empty-state, loading, and error copy in the page JavaScript. Ask for every string:

1. Does the customer need this information now?
2. Is it expressed as a benefit, state, or next action?
3. Does it avoid developer, operator, test, and architecture terminology?
4. Does it sound like 禾煦 rather than a product requirements document?

If any answer is no, rewrite or remove the string before handoff.

## WeChat Development Tools

- `wechat-devtools-cli` is available globally on PATH (also: `/home/colin/tools/wechat-dev-tools/wechat-web-devtools-linux/bin/wechat-devtools-cli`).
- Use `wechat-devtools-cli` for opening WeChat DevTools, local preview, upload, npm build, and IDE automation.
- Use CloudBase MCP for cloud functions, databases, storage, permissions, environments, and logs.

### Compile yourself — do not ask the user to recompile

After UI/code changes that should show in the simulator, **the agent must refresh DevTools**, not tell the user to “重新编译”:

```bash
CLI=wechat-devtools-cli   # or full path under tools/wechat-dev-tools/...
PROJ=/home/colin/softdev/sanmuhe/sanmuhe/sanmuhe-miniprogram
"$CLI" cache --clean compile --project "$PROJ" --lang zh
"$CLI" open --project "$PROJ" --lang zh
```

- For stubborn cache (catalog/data/images): also `cache --clean storage` or `cache --clean all`.
- Only mention manual compile if the CLI fails or IDE is not running/login is broken.
