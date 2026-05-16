# Sanmuhe Mini Program Rules

## Cloud-First Frontend Content

- Mini program business content must be cloud-backed. Carousel images, product images, tea room images, event images, notices, coupons, member settings, and operational records should be stored in CloudBase database/storage instead of only local files.
- Use local assets only for deliberate package assets that are small, stable, and required at startup. Anything managed by the admin backend should be uploaded and referenced from CloudBase.
- Do not add admin-only source or build output to the mini program preview package. Keep `admin/`, `admin-src/`, `node_modules/`, `package-lock.json`, `package.json`, and `vite.config.mjs` ignored in `project.config.json`.
- Before any preview/upload task, check package size contributors with `du -h --max-depth=1 sanmuhe-miniprogram` and large files with `find sanmuhe-miniprogram -maxdepth 3 -type f -size +500k`.
