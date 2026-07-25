/**
 * 素材路径策略：
 * - 默认用本地 /assets/...（预览稳定、不依赖存储 ACL）
 * - 云路径 cloud:// 可选；主包已移出 admin，本地图可压在 2MB 内
 * - USE_CLOUD_ASSETS=true 时走云存储（需存储权限「所有用户可读」）
 */
const cloudConfig = require("./cloud");

// 与 content_blocks 轮播同一文件桶前缀
const CLOUD_FILE_HOST = `cloud://${cloudConfig.envId}.636c-${cloudConfig.envId}-1458290161`;

// 首页/核心展示默认本地，避免 ACL/云初始化导致破图
const USE_CLOUD_ASSETS = false;

function toLocalPath(path) {
  const raw = String(path || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.indexOf("cloud://") === 0 || raw.indexOf("https://") === 0 || raw.indexOf("http://") === 0) {
    // 云/CDN 链接保留
    return raw;
  }
  const clean = raw.replace(/^\//, "");
  return `/${clean}`;
}

function toCloudPath(localOrCloudPath) {
  const raw = String(localOrCloudPath || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.indexOf("cloud://") === 0 || raw.indexOf("https://") === 0 || raw.indexOf("http://") === 0) {
    return raw;
  }
  const clean = raw.replace(/^\//, "");
  // assets/images/foo.jpg -> mp-assets/images/foo.jpg
  const cloudRel = clean.indexOf("assets/") === 0
    ? `mp-${clean}`
    : clean.indexOf("mp-assets/") === 0
      ? clean
      : `mp-assets/${clean}`;
  return `${CLOUD_FILE_HOST}/${cloudRel}`;
}

function assetUrl(path) {
  if (!path) {
    return "";
  }
  const clean = String(path).replace(/^\//, "");
  // 图标始终本地
  if (clean.indexOf("assets/icons/") === 0) {
    return `/${clean}`;
  }
  if (USE_CLOUD_ASSETS) {
    return toCloudPath(path);
  }
  return toLocalPath(path);
}

function localImage(path) {
  const clean = String(path || "").trim();
  if (!clean) {
    return "";
  }
  if (clean.indexOf("cloud://") === 0 || clean.indexOf("http") === 0) {
    // 云端 content 已是 cloud:// 时：默认改回本地同源文件（若可映射）
    if (!USE_CLOUD_ASSETS && clean.indexOf("cloud://") === 0) {
      const fileName = clean.split("?")[0].split("/").filter(Boolean).pop() || "";
      if (fileName && /\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
        // 常见：mp-assets/images/xxx 或 carousel 路径
        if (/home-carousel|home-brand|product-|event-|order-hero|profile-|reservation-|contact-/.test(fileName)) {
          return `/assets/images/${fileName}`;
        }
      }
    }
    return clean;
  }
  return assetUrl(clean.startsWith("/") ? clean : `/${clean}`);
}

module.exports = {
  CLOUD_FILE_HOST,
  USE_CLOUD_ASSETS,
  assetUrl,
  localImage,
  toCloudPath,
  toLocalPath
};
