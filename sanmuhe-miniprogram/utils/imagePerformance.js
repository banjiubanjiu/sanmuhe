const DEFAULT_THUMBNAIL_EDGE = 320;
const DEFAULT_PRELOAD_LIMIT = 12;
const preloadedImageSources = new Set();
const preloadingImageSources = new Set();

function normalizeEdge(value) {
  const edge = Math.round(Number(value) || DEFAULT_THUMBNAIL_EDGE);
  return Math.max(96, Math.min(1200, edge));
}

function encodeCloudPath(path) {
  return String(path || "")
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch (error) {
        return encodeURIComponent(part);
      }
    })
    .join("/");
}

/** cloud://env.bucket/path -> 公有读 CloudBase CDN 地址。 */
function cloudFileToPublicUrl(value) {
  const source = String(value || "").trim();
  if (source.indexOf("cloud://") !== 0) {
    return source;
  }
  const withoutScheme = source.slice("cloud://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0) {
    return source;
  }
  const authority = withoutScheme.slice(0, slashIndex);
  const bucketSeparator = authority.indexOf(".");
  if (bucketSeparator <= 0) {
    return source;
  }
  const bucket = authority.slice(bucketSeparator + 1);
  const path = withoutScheme.slice(slashIndex + 1);
  if (!bucket || !path || !/^[a-z0-9.-]+$/i.test(bucket)) {
    return source;
  }
  return `https://${bucket}.tcb.qcloud.la/${encodeCloudPath(path)}`;
}

function supportsCloudImageTransform(value) {
  return /^https:\/\/[a-z0-9.-]+\.tcb\.qcloud\.la\/[^?#]+$/i.test(String(value || ""));
}

/**
 * 列表图走 CloudBase/COS 图片处理：限制解码尺寸并得到长期缓存的稳定 URL。
 * 非 CloudBase 地址保持原样，避免给第三方图片拼接不兼容参数。
 */
function toThumbnailUrl(value, edgeValue) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  if (source.indexOf("?imageMogr2/") >= 0) {
    return source;
  }
  const publicUrl = cloudFileToPublicUrl(source);
  if (!supportsCloudImageTransform(publicUrl)) {
    return source;
  }
  const edge = normalizeEdge(edgeValue);
  return `${publicUrl}?imageMogr2/thumbnail/${edge}x${edge}/format/webp/quality/76`;
}

function uniqueSources(sources, limitValue) {
  const limit = Math.max(1, Number(limitValue) || DEFAULT_PRELOAD_LIMIT);
  const seen = new Set();
  const result = [];
  (Array.isArray(sources) ? sources : []).forEach((value) => {
    const source = String(value || "").trim();
    if (!source || seen.has(source) || result.length >= limit) {
      return;
    }
    seen.add(source);
    result.push(source);
  });
  return result;
}

/** 预热视图层图片缓存；旧基础库或失败时静默降级。 */
function preloadImages(sources, options) {
  const config = options || {};
  const candidates = uniqueSources(sources, config.limit).filter(
    (source) => !preloadedImageSources.has(source) && !preloadingImageSources.has(source)
  );
  if (!candidates.length || typeof wx === "undefined" || !wx.preloadAssets) {
    return Promise.resolve(false);
  }
  candidates.forEach((source) => preloadingImageSources.add(source));
  return new Promise((resolve) => {
    let succeeded = false;
    try {
      wx.preloadAssets({
        data: candidates.map((src) => ({ type: "image", src })),
        success() {
          succeeded = true;
          candidates.forEach((source) => preloadedImageSources.add(source));
        },
        fail() {
          succeeded = false;
        },
        complete() {
          candidates.forEach((source) => preloadingImageSources.delete(source));
          resolve(succeeded);
        }
      });
    } catch (error) {
      candidates.forEach((source) => preloadingImageSources.delete(source));
      resolve(false);
    }
  });
}

function collectCatalogThumbnailUrls(catalog, limitValue) {
  const source = catalog || {};
  const urls = [];
  const addItem = (item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const image = item.thumb || item.image || (Array.isArray(item.images) ? item.images[0] : "");
    if (image) {
      urls.push(toThumbnailUrl(image));
    }
  };

  // 首批同时覆盖商城与点单，避免商城条目把整个预热配额占满。
  (Array.isArray(source.teaProducts) ? source.teaProducts : []).slice(0, 8).forEach(addItem);
  (Array.isArray(source.drinks) ? source.drinks : []).slice(0, 1).forEach((drink) => {
    const teaItems = Array.isArray(drink && drink.teaItems)
      ? drink.teaItems
      : (Array.isArray(drink && drink.teaOptions) ? drink.teaOptions : []);
    teaItems.slice(0, 4).forEach(addItem);
  });
  (Array.isArray(source.giftBoxes) ? source.giftBoxes : []).slice(0, 2).forEach(addItem);
  return uniqueSources(urls, limitValue);
}

function preloadCatalogThumbnails(catalog, options) {
  const config = options || {};
  return preloadImages(collectCatalogThumbnailUrls(catalog, config.limit), config);
}

module.exports = {
  cloudFileToPublicUrl,
  collectCatalogThumbnailUrls,
  preloadCatalogThumbnails,
  preloadImages,
  toThumbnailUrl
};
