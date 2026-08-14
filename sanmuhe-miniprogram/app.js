const cloudConfig = require("./config/cloud");
const tableUtil = require("./utils/table");
const { prefetchCatalog } = require("./utils/cloudApi");

function applyTableFromOptions(options) {
  const table = tableUtil.parseTableFromLaunch(options || {});
  if (!table) {
    return "";
  }
  tableUtil.setTableNo(table);
  return table;
}

function shouldOpenOrderPage(options) {
  const path = String((options && options.path) || "").replace(/^\//, "");
  // Already landing on order page — page onLoad will bind table.
  if (!path || path.indexOf("pages/order/index") === 0) {
    return false;
  }
  return true;
}

function openOrderWithTable(table) {
  if (!table) {
    return;
  }
  const url = tableUtil.orderUrl(table);
  wx.reLaunch({
    url,
    fail: () => {
      wx.switchTab({ url: "/pages/order/index" });
    }
  });
}

App({
  globalData: {
    brand: "禾煦",
    storeName: "禾煦书茶空间",
    storeAddress: "广东省佛山市",
    servicePhone: "18038768716",
    cloudReady: false,
    cloudEnv: "",
    tableNo: ""
  },

  onLaunch(options) {
    if (cloudConfig.useCloud && cloudConfig.envId && wx.cloud) {
      wx.cloud.init({
        env: cloudConfig.envId,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      this.globalData.cloudEnv = cloudConfig.envId;
      // 预热首页聚合云函数；首页会复用同一个 Promise，不会重复请求。
      prefetchCatalog();
    } else if (cloudConfig.useCloud && !cloudConfig.envId) {
      console.warn("禾煦云开发未配置 envId，当前仅展示本地基础资料。");
    } else if (cloudConfig.useCloud && !wx.cloud) {
      console.warn("当前基础库不支持 wx.cloud，当前仅展示本地基础资料。");
    }

    const table = applyTableFromOptions(options);
    if (table) {
      this.globalData.tableNo = table;
      if (shouldOpenOrderPage(options)) {
        // Defer until app route is ready
        setTimeout(() => openOrderWithTable(table), 0);
      }
    }
  },

  onShow(options) {
    // Hot start from scanning another table QR
    const table = applyTableFromOptions(options);
    if (!table) {
      const cached = tableUtil.getTableNo();
      if (cached) {
        this.globalData.tableNo = cached;
      }
      return;
    }
    this.globalData.tableNo = table;
    if (shouldOpenOrderPage(options)) {
      openOrderWithTable(table);
    }
  }
});
