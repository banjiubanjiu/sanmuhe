const cloudConfig = require("../../config/cloud");

Page({
  data: {
    appid: "",
    envId: cloudConfig.envId || "",
    appidText: "待检测",
    envIdText: cloudConfig.envId || "未配置",
    useCloud: cloudConfig.useCloud,
    cloudReady: false,
    checking: false,
    result: "",
    openid: "",
    error: "",
    seeding: false,
    seedResult: "",
    smoking: false,
    smokeResult: "",
    cataloging: false,
    catalogResult: "",
    cleaning: false,
    cleanupResult: ""
  },

  onLoad() {
    const app = getApp();
    let appid = "";

    if (wx.getAccountInfoSync) {
      const accountInfo = wx.getAccountInfoSync();
      appid = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.appId : "";
    }

    this.setData({
      appid,
      appidText: appid || "待检测",
      envIdText: cloudConfig.envId || "未配置",
      cloudReady: !!(app.globalData && app.globalData.cloudReady)
    });
  },

  checkCloud() {
    const app = getApp();

    this.setData({
      checking: true,
      result: "",
      openid: "",
      error: ""
    });

    if (!wx.cloud) {
      this.setData({
        checking: false,
        result: "基础库不支持 wx.cloud",
        error: "请在微信开发者工具里选择 2.2.3 或以上基础库。"
      });
      return;
    }

    if (!cloudConfig.envId) {
      this.setData({
        checking: false,
        result: "云环境未配置",
        error: "请先运行 configure-cloud.bat 或手动填写 config/cloud.js 的 envId。"
      });
      return;
    }

    if (!(app.globalData && app.globalData.cloudReady)) {
      this.setData({
        cloudReady: false,
        checking: false,
        result: "wx.cloud.init 未生效",
        error: "请确认 project.config.json 已使用真实 AppID，并重新编译小程序。"
      });
      return;
    }

    wx.cloud.callFunction({
      name: "getOpenId",
      data: {
        source: "cloud-status-page"
      }
    }).then((res) => {
      const data = res.result || {};
      this.setData({
        checking: false,
        cloudReady: true,
        result: data.ok ? "云函数调用成功" : "云函数返回异常",
        openid: data.openid || "",
        appid: data.appid || ""
      });
    }).catch((error) => {
      this.setData({
        checking: false,
        result: "云函数调用失败",
        error: error.errMsg || error.message || JSON.stringify(error)
      });
    });
  },

  seedDemoData() {
    const app = getApp();

    this.setData({
      seeding: true,
      seedResult: "",
      error: ""
    });

    if (!wx.cloud || !cloudConfig.envId || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({
        seeding: false,
        seedResult: "请先完成云环境配置并确认初始化成功"
      });
      return;
    }

    wx.cloud.callFunction({
      name: "seedDemoData",
      data: {}
    }).then((res) => {
      const data = res.result || {};
      const summary = (data.results || [])
        .map((item) => `${item.collection}: 新增 ${item.created}，更新 ${item.updated}`)
        .join("；");
      this.setData({
        seeding: false,
        seedResult: summary || "已完成"
      });
    }).catch((error) => {
      this.setData({
        seeding: false,
        seedResult: "写入失败",
        error: error.errMsg || error.message || JSON.stringify(error)
      });
    });
  },

  runSmokeTest() {
    const app = getApp();
    const stamp = String(Date.now()).slice(-8);
    const eventTitle = `云开发检查 ${stamp}`;
    const smokeSource = "cloud-status-smoke";
    const steps = [];

    this.setData({
      smoking: true,
      smokeResult: "",
      error: ""
    });

    if (!wx.cloud || !cloudConfig.envId || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({
        smoking: false,
        smokeResult: "请先完成云环境配置并确认初始化成功"
      });
      return;
    }

    wx.cloud.callFunction({
      name: "createOrder",
      data: {
        items: [
          {
            id: "drink-001",
            type: "drink",
            quantity: 1,
            options: {
              temp: "冷",
              sugar: "无糖"
            }
          }
        ],
        remark: "云开发状态页自动检查",
        source: smokeSource
      }
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(`订单写入失败：${data.message || "未知错误"}`);
      }

      steps.push(`订单 ${data.orderNo || data.id}`);
      return wx.cloud.callFunction({
        name: "createReservation",
        data: {
          roomId: "room-001",
          room: "听松",
          day: `验${stamp}`,
          time: `${stamp.slice(0, 2)}:${stamp.slice(2, 4)}`,
          people: 2,
          name: "云开发检查",
          phone: "13800000000",
          note: "云开发状态页自动检查",
          source: smokeSource
        }
      });
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(`预约写入失败：${data.message || "未知错误"}`);
      }

      steps.push(`预约 ${data.id}`);
      return wx.cloud.callFunction({
        name: "createEvent",
        data: {
          title: eventTitle,
          date: `验${stamp}`,
          time: `${stamp.slice(4, 6)}:${stamp.slice(6, 8)}`,
          place: "三木合茶事空间",
          quota: 8,
          price: 0,
          summary: "云开发状态页自动检查活动",
          source: smokeSource
        }
      });
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(`活动写入失败：${data.message || "未知错误"}`);
      }

      const eventId = data.id || `smoke-${stamp}`;
      steps.push(`活动 ${eventId}`);
      return wx.cloud.callFunction({
        name: "joinEvent",
        data: {
          eventId,
          title: eventTitle,
          source: smokeSource
        }
      });
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(`活动报名失败：${data.message || "未知错误"}`);
      }

      steps.push(`报名 ${data.id}`);
      return wx.cloud.callFunction({
        name: "listMyRecords",
        data: {}
      });
    }).then((res) => {
      const data = res.result || {};
      const orderCount = (data.orders || []).length;
      const reservationCount = (data.reservations || []).length;
      const signupCount = (data.signups || []).length;
      steps.push(`我的记录 订单${orderCount} 预约${reservationCount} 报名${signupCount}`);
      return wx.cloud.callFunction({
        name: "manageCatalog",
        data: {
          action: "list",
          collection: "tea_products"
        }
      });
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(`商品 CRUD 检查失败：${data.message || "未知错误"}`);
      }

      steps.push(`商品管理 ${data.items.length} 项`);
      this.setData({
        smoking: false,
        smokeResult: steps.join("；")
      });
    }).catch((error) => {
      this.setData({
        smoking: false,
        smokeResult: "云端写入检查失败",
        error: error.errMsg || error.message || JSON.stringify(error)
      });
    });
  },

  cleanupSmokeData() {
    const app = getApp();

    this.setData({
      cleaning: true,
      cleanupResult: "",
      error: ""
    });

    if (!wx.cloud || !cloudConfig.envId || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({
        cleaning: false,
        cleanupResult: "请先完成云环境配置并确认初始化成功"
      });
      return;
    }

    wx.cloud.callFunction({
      name: "cleanupSmokeData",
      data: {}
    }).then((res) => {
      const data = res.result || {};
      if (!data.ok) {
        throw new Error(data.message || "清理函数返回异常");
      }
      const details = (data.details || [])
        .map((item) => `${item.collection} ${item.removed}`)
        .join("；");
      this.setData({
        cleaning: false,
        cleanupResult: details ? `已清理 ${details}` : "没有需要清理的自动检查记录"
      });
    }).catch((error) => {
      this.setData({
        cleaning: false,
        cleanupResult: "清理失败",
        error: error.errMsg || error.message || JSON.stringify(error)
      });
    });
  },

  checkCatalogCrud() {
    const app = getApp();

    this.setData({
      cataloging: true,
      catalogResult: "",
      error: ""
    });

    if (!wx.cloud || !cloudConfig.envId || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({
        cataloging: false,
        catalogResult: "请先完成云环境配置并确认初始化成功"
      });
      return;
    }

    Promise.all([
      wx.cloud.callFunction({ name: "manageCatalog", data: { action: "list", collection: "drinks" } }),
      wx.cloud.callFunction({ name: "manageCatalog", data: { action: "list", collection: "tea_products" } }),
      wx.cloud.callFunction({ name: "manageCatalog", data: { action: "list", collection: "rooms" } }),
      wx.cloud.callFunction({ name: "manageCatalog", data: { action: "list", collection: "events" } })
    ]).then((results) => {
      const counts = results.map((res) => {
        const data = res.result || {};
        if (!data.ok) {
          throw new Error(data.message || "商品/活动管理函数返回异常");
        }
        return `${data.collection} ${data.items.length}`;
      });
      this.setData({
        cataloging: false,
        catalogResult: counts.join("；")
      });
    }).catch((error) => {
      this.setData({
        cataloging: false,
        catalogResult: "商品/活动管理检查失败",
        error: error.errMsg || error.message || JSON.stringify(error)
      });
    });
  }
});
