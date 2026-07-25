# Sanmuhe Mini Program Rules

## Cloud-First Frontend Content

- Mini program business content must be cloud-backed. Carousel images, product images, tea room images, event images, notices, coupons, member settings, and operational records should be stored in CloudBase database/storage instead of only local files.
- Use local assets only for deliberate package assets that are small, stable, and required at startup. Anything managed by the admin backend should be uploaded and referenced from CloudBase.
- Do not add admin-only source or build output to the mini program preview package. Keep `admin/`, `admin-src/`, `node_modules/`, `package-lock.json`, `package.json`, and `vite.config.mjs` ignored in `project.config.json`.
- Before any preview/upload task, check package size contributors with `du -h --max-depth=1 sanmuhe-miniprogram` and large files with `find sanmuhe-miniprogram -maxdepth 3 -type f -size +500k`.

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
