/**
 * backgroundPrefetch —— 微信「数据预拉取」专用云函数。
 *
 * 用途：微信客户端（或微信服务器）在用户打开小程序前/时，后台调用本函数，
 * 把首页所需的目录数据缓存到本地；用户启动时 wx.getBackgroundFetchData
 * 立即可读，首页秒开（无需等待云函数冷启动）。
 *
 * 说明：
 * - 复用 getCatalog 的组装逻辑（cloud.callFunction 同环境互调），保证与
 *   正式目录同源、同结构。
 * - 返回前做瘦身：首页只需要轮播 + 少量精选条目，控制在微信缓存上限
 *   256KB 以内（全量目录可能超限导致不缓存）。
 * - 客户端拿到后写入本地 catalog 缓存（sanmuhe_catalog_cache_v2），
 *   30 秒内 getCatalog 直接命中缓存，后续再静默刷新为全量。
 */
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const SLIM_LIMITS = {
  drinks: 4,
  teaProducts: 4,
  rooms: 4,
  events: 10,
  homeSlides: 8
};

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "backgroundPrefetch" };
  }
  try {
    const startedAt = Date.now();
    const res = await cloud.callFunction({ name: "getCatalog", data: {} });
    const catalog = res && res.result && res.result.catalog;
    if (!catalog || typeof catalog !== "object") {
      return { ok: false, message: "getCatalog 未返回目录" };
    }
    const content = catalog.content || {};
    const prefetch = {
      drinks: (catalog.drinks || []).slice(0, SLIM_LIMITS.drinks),
      teaProducts: (catalog.teaProducts || []).slice(0, SLIM_LIMITS.teaProducts),
      rooms: (catalog.rooms || []).slice(0, SLIM_LIMITS.rooms),
      events: (catalog.events || []).slice(0, SLIM_LIMITS.events),
      productCategories: catalog.productCategories || [],
      content: {
        homeSlides: (content.homeSlides || []).slice(0, SLIM_LIMITS.homeSlides)
      },
      settings: catalog.settings || null
    };
    return {
      ok: true,
      prefetch,
      durationMs: Date.now() - startedAt,
      fetchedAt: Date.now()
    };
  } catch (error) {
    return {
      ok: false,
      message: String((error && error.message) || error).slice(0, 200)
    };
  }
};
