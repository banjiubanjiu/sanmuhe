const { cloudFileToPublicUrl } = require("./imagePerformance");

const DEFAULT_TITLE = "禾煦书茶空间｜茶饮、茶事与雅集";
const DEFAULT_PATH = "/pages/index/index";

function normalizeShareImageUrl(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  const imageUrl = cloudFileToPublicUrl(source);
  if (/^https?:\/\/[^\s]+$/i.test(imageUrl) || imageUrl.startsWith("/")) {
    return imageUrl;
  }
  return "";
}

/** 构造“转发给好友”卡片；未提供图片时由微信使用页面截图。 */
function buildShareMessage(options = {}) {
  const title = String(options.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
  const rawPath = String(options.path || DEFAULT_PATH).trim() || DEFAULT_PATH;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const imageUrl = normalizeShareImageUrl(options.imageUrl);
  const message = { title, path };

  if (imageUrl) {
    message.imageUrl = imageUrl;
  }

  return message;
}

module.exports = {
  DEFAULT_TITLE,
  DEFAULT_PATH,
  buildShareMessage,
  normalizeShareImageUrl
};
