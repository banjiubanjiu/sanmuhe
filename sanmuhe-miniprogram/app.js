const cloudConfig = require("./config/cloud");

App({
  globalData: {
    brand: "三木合",
    storeName: "三木合茶事空间",
    storeAddress: "上海市徐汇区梧桐街 33 号",
    servicePhone: "021-0000-3333",
    cloudReady: false,
    cloudEnv: ""
  },

  onLaunch() {
    if (cloudConfig.useCloud && cloudConfig.envId && wx.cloud) {
      wx.cloud.init({
        env: cloudConfig.envId,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      this.globalData.cloudEnv = cloudConfig.envId;
    } else if (cloudConfig.useCloud && !cloudConfig.envId) {
      console.warn("三木合云开发未配置 envId，当前使用本地演示数据。");
    } else if (cloudConfig.useCloud && !wx.cloud) {
      console.warn("当前基础库不支持 wx.cloud，当前使用本地演示数据。");
    }

    const seeded = wx.getStorageSync("sanmuhe_seeded");
    if (!seeded) {
      wx.setStorageSync("sanmuhe_orders", []);
      wx.setStorageSync("sanmuhe_reservations", []);
      wx.setStorageSync("sanmuhe_custom_events", []);
      wx.setStorageSync("sanmuhe_seeded", true);
    }
  }
});
