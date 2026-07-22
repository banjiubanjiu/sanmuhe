# Project Rules

## Cloud-First Assets And Data

- If a file or dataset is needed by the WeChat Mini Program frontend, persist it to CloudBase first. Do not leave frontend-required content only as local files.
- Local images are source material only unless they are deliberately part of the mini program package. Business images for carousel, products, tea rooms, events, notices, and profile surfaces should be uploaded to CloudBase storage or managed through the backend content/catalog forms.
- Admin web builds are deployed through CloudBase static hosting or CloudApp. They are not mini program source code and must not be included in WeChat preview/upload packages.
- Before previewing or uploading the mini program, confirm `project.config.json` ignores `admin/`, `admin-src/`, `node_modules/`, and admin build dependencies so the source package stays below the WeChat size limit.
- When adding new generated assets, state whether they are local-only design references, mini program package assets, CloudBase storage files, or CloudBase-hosted admin assets.

## Icons

- For UI icons (tab bar, bottom actions, list meta, empty states), **use a professional icon library first**—default **Lucide** (`lucide-static`, ISC). Do not invent icons, reuse wrong metaphors (e.g. star for share), or AI-generate UI glyphs when a library icon exists.
- Mini program workflow: Lucide SVG → recolor stroke → PNG into `sanmuhe-miniprogram/assets/icons/` → reference `/assets/icons/...`. Keep UI icons in the package; business photos stay on CloudBase.
- Full steps, naming, and design rules: `sanmuhe-miniprogram/AGENTS.md` → section **Icons (Use An Icon Library First)**.

## DevTools compile

- After mini program UI/code changes, **compile/refresh via `wechat-devtools-cli` yourself** (`cache --clean compile` + `open --project`). Do not habitually ask the user to recompile. Details: `sanmuhe-miniprogram/AGENTS.md` → **Compile yourself**.
