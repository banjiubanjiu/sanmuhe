const assert = require("assert");

let preloadRequest = null;
global.wx = {
  preloadAssets(options) {
    preloadRequest = options;
    options.success({ errMsg: "preloadAssets:ok" });
    options.complete({ errMsg: "preloadAssets:ok" });
  }
};

const {
  cloudFileToPublicUrl,
  collectCatalogThumbnailUrls,
  preloadImages,
  toThumbnailUrl
} = require("../utils/imagePerformance");

const fileId = "cloud://cloudbase-demo.636c-cloudbase-demo-123/mp-assets/images/礼盒/yixi 1.jpg";
const publicUrl = cloudFileToPublicUrl(fileId);
assert.strictEqual(
  publicUrl,
  "https://636c-cloudbase-demo-123.tcb.qcloud.la/mp-assets/images/%E7%A4%BC%E7%9B%92/yixi%201.jpg"
);
assert.strictEqual(
  toThumbnailUrl(fileId),
  `${publicUrl}?imageMogr2/thumbnail/320x320/format/webp/quality/76`
);
assert.strictEqual(toThumbnailUrl("/assets/icons/leaf.png"), "/assets/icons/leaf.png");
assert.strictEqual(toThumbnailUrl("https://example.com/image.jpg"), "https://example.com/image.jpg");

const catalogUrls = collectCatalogThumbnailUrls({
  teaProducts: [{ image: fileId }, { thumb: fileId }],
  giftBoxes: [{ image: "https://example.com/gift.jpg" }],
  drinks: [{ teaItems: [{ image: "https://example.com/tea.jpg" }] }]
});
assert.deepStrictEqual(catalogUrls, [
  toThumbnailUrl(fileId),
  "https://example.com/tea.jpg",
  "https://example.com/gift.jpg"
]);

preloadImages([catalogUrls[0], catalogUrls[0], catalogUrls[1]]).then((result) => {
  assert.strictEqual(result, true);
  assert.ok(preloadRequest);
  assert.deepStrictEqual(preloadRequest.data, [
    { type: "image", src: catalogUrls[0] },
    { type: "image", src: catalogUrls[1] }
  ]);
  console.log("image performance regression: ok");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
