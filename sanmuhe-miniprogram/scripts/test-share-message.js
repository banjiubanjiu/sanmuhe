const assert = require("assert");
const { buildShareMessage, normalizeShareImageUrl } = require("../utils/share");

const cloudFileId = "cloud://cloudbase-demo.636c-cloudbase-demo-123/mp-assets/images/茶 室.jpg";
const expectedPublicUrl = "https://636c-cloudbase-demo-123.tcb.qcloud.la/mp-assets/images/%E8%8C%B6%20%E5%AE%A4.jpg";

assert.strictEqual(normalizeShareImageUrl(cloudFileId), expectedPublicUrl);
assert.strictEqual(normalizeShareImageUrl("https://example.com/share.jpg"), "https://example.com/share.jpg");
assert.strictEqual(normalizeShareImageUrl("/assets/icons/share.jpg"), "/assets/icons/share.jpg");
assert.strictEqual(normalizeShareImageUrl("cloud://malformed/file.jpg"), "");
assert.strictEqual(normalizeShareImageUrl("wxfile://tmp/share.jpg"), "");

assert.deepStrictEqual(buildShareMessage({
  title: " 茶室分享 ",
  path: "pages/reservation/index",
  imageUrl: cloudFileId
}), {
  title: "茶室分享",
  path: "/pages/reservation/index",
  imageUrl: expectedPublicUrl
});

assert.deepStrictEqual(buildShareMessage({ imageUrl: "wxfile://tmp/share.jpg" }), {
  title: "禾煦书茶空间｜茶饮、茶事与雅集",
  path: "/pages/index/index"
});

console.log("share message regression: ok");
