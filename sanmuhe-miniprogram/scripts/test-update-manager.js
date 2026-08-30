const assert = require("assert");

let appConfig = null;
let updateReady = null;
let updateFailed = null;
let applyUpdateCalls = 0;
let modalOptions = null;
let toastOptions = null;
const storage = new Map();

global.App = (config) => {
  appConfig = config;
};
global.getApp = () => appConfig;
global.wx = {
  getUpdateManager() {
    return {
      onUpdateReady(callback) {
        updateReady = callback;
      },
      onUpdateFailed(callback) {
        updateFailed = callback;
      },
      applyUpdate() {
        applyUpdateCalls += 1;
      }
    };
  },
  showModal(options) {
    modalOptions = options;
    options.success({ confirm: true });
  },
  showToast(options) {
    toastOptions = options;
  },
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  cloud: {
    init() {},
    callFunction() {
      return Promise.resolve({ result: { catalog: {} } });
    }
  }
};

require("../app");

assert.ok(appConfig && typeof appConfig.onLaunch === "function");
appConfig.onLaunch({});
assert.strictEqual(typeof updateReady, "function");
assert.strictEqual(typeof updateFailed, "function");

updateReady();
assert.strictEqual(modalOptions.title, "版本更新");
assert.strictEqual(modalOptions.showCancel, false);
assert.strictEqual(applyUpdateCalls, 1);

updateFailed();
assert.strictEqual(toastOptions.icon, "none");

console.log("update manager regression: ok");
