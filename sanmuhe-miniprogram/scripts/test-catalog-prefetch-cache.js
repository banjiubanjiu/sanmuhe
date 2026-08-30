const assert = require("assert");

const storage = new Map();
let cloudCalls = 0;

const fullCatalog = {
  drinks: [],
  teaProducts: Array.from({ length: 13 }, (_, index) => ({
    id: `tea-${index + 1}`,
    name: `茶品 ${index + 1}`,
    visible: true
  })),
  rooms: [],
  events: [],
  productCategories: [],
  giftBoxes: Array.from({ length: 3 }, (_, index) => ({
    id: `gift-${index + 1}`,
    name: `礼盒 ${index + 1}`,
    visible: true
  })),
  content: { homeSlides: [] },
  settings: null
};

global.getApp = () => ({ globalData: { cloudReady: true } });
global.wx = {
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  cloud: {
    callFunction() {
      cloudCalls += 1;
      return Promise.resolve({ result: { catalog: fullCatalog } });
    }
  }
};

async function run() {
  const api = require("../utils/cloudApi");
  const slimPrefetch = {
    prefetch: Object.assign({}, fullCatalog, {
      teaProducts: fullCatalog.teaProducts.slice(0, 4),
      giftBoxes: []
    })
  };

  assert.strictEqual(api.applyBackgroundPrefetch(slimPrefetch), true);
  assert.strictEqual(api.getCachedCatalog().teaProducts.length, 4);
  assert.strictEqual(api.getCachedCatalog().isPartial, true);
  assert.strictEqual(api.getCachedCatalog({ fullOnly: true }), null);

  const catalog = await api.getCatalog();
  assert.strictEqual(cloudCalls, 1, "精简缓存必须触发全量云端请求");
  assert.strictEqual(catalog.teaProducts.length, 13);
  assert.strictEqual(catalog.giftBoxes.length, 3);
  assert.strictEqual(catalog.isPartial, false);

  assert.strictEqual(api.applyBackgroundPrefetch(slimPrefetch), true);
  const cached = api.getCachedCatalog({ fullOnly: true });
  assert.ok(cached, "晚到的预拉取不能覆盖全量目录");
  assert.strictEqual(cached.teaProducts.length, 13);
  assert.strictEqual(cached.giftBoxes.length, 3);

  const recent = await api.getCatalog();
  assert.strictEqual(cloudCalls, 1, "近期完整缓存可以直接复用");
  assert.strictEqual(recent.teaProducts.length, 13);

  console.log("catalog prefetch cache regression: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
