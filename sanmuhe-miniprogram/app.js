const cloudConfig = require("./config/cloud");
const tableUtil = require("./utils/table");
const { prefetchCatalog, applyBackgroundPrefetch, getCachedCatalog } = require("./utils/cloudApi");
const { preloadCatalogThumbnails } = require("./utils/imagePerformance");

function applyTableFromOptions(options) {
  const table = tableUtil.parseTableFromLaunch(options || {});
  if (!table) {
    return "";
  }
  tableUtil.setTableNo(table);
  return table;
}

function initBackgroundPrefetch() {
  if (!wx.getBackgroundFetchData) {
    return;
  }
  const apply = (res) => {
    if (res && res.fetchedData != null) {
      const applied = applyBackgroundPrefetch(res.fetchedData);
      if (applied) {
        preloadCatalogThumbnails(getCachedCatalog(), { limit: 12 });
      }
    }
  };
  try {
    // 可选：标记预拉取请求，便于后台/服务端识别（本场景为全局数据，token 仅用于标识）
    if (wx.setBackgroundFetchToken) {
      wx.setBackgroundFetchToken({ token: "sanmuhe-prefetch-v1" });
    }
    // 启动即读：微信后台预拉取缓存的数据直接写本地缓存，首页秒开
    wx.getBackgroundFetchData({ fetchType: "pre", success: apply });
    // 首次打开时预拉取可能在启动后才完成：监听事件实时写入
    if (wx.onBackgroundFetchData) {
      wx.onBackgroundFetchData(apply);
    }
  } catch (error) {
    // 基础库不支持或未开启时静默降级，不影响正常启动
  }
}

function initUpdateManager() {
  if (!wx.getUpdateManager) {
    return;
  }
  const updateManager = wx.getUpdateManager();
  updateManager.onUpdateReady(() => {
    wx.showModal({
      title: "版本更新",
      content: "新版本已准备好，点击确定重新启动。",
      showCancel: false,
      success: (result) => {
        if (result.confirm) {
          updateManager.applyUpdate();
        }
      }
    });
  });
  updateManager.onUpdateFailed(() => {
    wx.showToast({
      title: "更新暂未完成，请稍后重新打开",
      icon: "none"
    });
  });
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
    initUpdateManager();
    // 微信「数据预拉取」：读取后台预拉取的目录数据 → 本地缓存，首页秒开
    initBackgroundPrefetch();
    if (cloudConfig.useCloud && cloudConfig.envId && wx.cloud) {
      wx.cloud.init({
        env: cloudConfig.envId,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      this.globalData.cloudEnv = cloudConfig.envId;
      // 预热聚合目录；各页面复用同一个请求，减少首屏等待和重复云函数调用。
      prefetchCatalog()
        .then((catalog) => preloadCatalogThumbnails(catalog, { limit: 12 }))
        .catch(() => {});
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
