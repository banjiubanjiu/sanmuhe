const assert = require("assert");

let componentConfig = null;

global.Component = (config) => {
  componentConfig = config;
};

require("../components/progressive-image/index");

function createInstance(src) {
  const instance = {
    data: {
      src,
      loaded: false,
      failed: false
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent() {}
  };

  componentConfig.properties.src.observer.call(instance, src);
  return instance;
}

assert.ok(componentConfig, "渐进图片组件应正常注册");

const firstImage = createInstance("cloud://catalog/tea-a.jpg");
assert.strictEqual(firstImage.data.loaded, false, "图片首次出现时应正常等待加载");

componentConfig.methods.handleLoad.call(firstImage, { detail: { width: 800, height: 800 } });
assert.strictEqual(firstImage.data.loaded, true, "图片加载成功后应立即显示");

const recreatedImage = createInstance("cloud://catalog/tea-a.jpg");
assert.strictEqual(recreatedImage.data.loaded, false, "组件重建后仍须等待当前 image 真正触发 load");

const differentImage = createInstance("cloud://catalog/tea-b.jpg");
assert.strictEqual(differentImage.data.loaded, false, "不同图片首次出现时仍应正常等待加载");

componentConfig.methods.handleError.call(recreatedImage, { detail: { errMsg: "load failed" } });
const imageAfterFailure = createInstance("cloud://catalog/tea-a.jpg");
assert.strictEqual(imageAfterFailure.data.loaded, false, "加载失败后仍应显示占位状态");

console.log("progressive image cache regression: ok");
