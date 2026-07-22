const cloudConfig = require("./config/cloud");

App({
  globalData: {
    brand: "禾煦",
    storeName: "禾煦书茶空间",
    storeAddress: "广东省佛山市",
    servicePhone: "0757-8888 8888",
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
      console.warn("禾煦云开发未配置 envId，当前仅展示本地基础资料。");
    } else if (cloudConfig.useCloud && !wx.cloud) {
      console.warn("当前基础库不支持 wx.cloud，当前仅展示本地基础资料。");
    }

  }
});
