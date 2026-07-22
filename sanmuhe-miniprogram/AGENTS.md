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
