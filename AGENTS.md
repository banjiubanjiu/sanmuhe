# Project Rules

## Cloud-First Assets And Data

- If a file or dataset is needed by the WeChat Mini Program frontend, persist it to CloudBase first. Do not leave frontend-required content only as local files.
- Local images are source material only unless they are deliberately part of the mini program package. Business images for carousel, products, tea rooms, events, notices, and profile surfaces should be uploaded to CloudBase storage or managed through the backend content/catalog forms.
- Admin web builds are deployed through CloudBase static hosting or CloudApp. They are not mini program source code and must not be included in WeChat preview/upload packages.
- Before previewing or uploading the mini program, confirm `project.config.json` ignores `admin/`, `admin-src/`, `node_modules/`, and admin build dependencies so the source package stays below the WeChat size limit.
- When adding new generated assets, state whether they are local-only design references, mini program package assets, CloudBase storage files, or CloudBase-hosted admin assets.
