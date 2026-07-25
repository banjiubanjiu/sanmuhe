const { drinks } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { normalizeMenuItems } = require("../../utils/teaMenu");
const { syncTabBar } = require("../../utils/tabbar");
const tableUtil = require("../../utils/table");

const DINEIN_CART_MODE = "dinein";
const ORDER_DRINK_KEY = "sanmuhe_order_drink_id";
const defaultMenuItems = normalizeMenuItems(drinks);
const localDrinkMap = drinks.reduce((map, item) => {
  map[item.id] = item;
  return map;
}, {});

function bindTable(raw) {
  const table = tableUtil.parseTableFromRaw(raw) || tableUtil.normalizeTable(raw);
  if (!table) {
    return "";
  }
  tableUtil.setTableNo(table);
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.tableNo = table;
    }
  } catch (error) {
    // 缓存桌号成功即可，不阻断点茶。
  }
  return table;
}

function pickDefaultDrink(menuItems, requestedId) {
  if (!menuItems || !menuItems.length) {
    return null;
  }
  if (requestedId) {
    const matched = menuItems.find((item) => item.id === requestedId);
    if (matched) {
      return matched;
    }
  }
  return menuItems[0];
}

// 云端茶单常缺 teaGroups / 图文字段：按 id 用本地目录补齐，避免列表空白
function mergeDrinkSource(remoteItems) {
  if (!remoteItems || !remoteItems.length) {
    return drinks.slice();
  }
  return remoteItems.map((item) => {
    const local = localDrinkMap[item.id];
    if (!local) {
      return item;
    }
    const hasGroups = Array.isArray(item.teaGroups) && item.teaGroups.length;
    return Object.assign({}, local, item, {
      teaGroups: hasGroups ? item.teaGroups : local.teaGroups,
      notes: item.notes || local.notes,
      image: item.image || local.image,
      unit: item.unit || item.badge || local.unit || local.badge,
      tagline: item.tagline || local.tagline,
      brewStyle: item.brewStyle || local.brewStyle,
      serviceType: item.serviceType || local.serviceType,
      price: item.price != null ? item.price : local.price
    });
  });
}

function teaMatchesKeyword(tea, keyword) {
  if (!keyword) {
    return true;
  }
  const haystack = [
    tea.name,
    tea.category,
    tea.subtitle,
    tea.groupName,
    ...(tea.tags || [])
  ].join(" ").toLowerCase();
  return haystack.indexOf(keyword) >= 0;
}

function packageMatchesKeyword(item, keyword) {
  if (!keyword) {
    return true;
  }
  const packageText = [
    item.name,
    item.tagline,
    item.selectionHint,
    item.notes
  ].join(" ").toLowerCase();
  if (packageText.indexOf(keyword) >= 0) {
    return true;
  }
  return (item.teaOptions || []).some((tea) => teaMatchesKeyword(tea, keyword));
}

function filterTeaOptions(activeDrink, keyword) {
  const options = (activeDrink && activeDrink.teaOptions) || [];
  if (!keyword) {
    return options;
  }
  const packageHit = [
    activeDrink.name,
    activeDrink.tagline,
    activeDrink.selectionHint,
    activeDrink.notes
  ].join(" ").toLowerCase().indexOf(keyword) >= 0;
  if (packageHit) {
    return options;
  }
  return options.filter((tea) => teaMatchesKeyword(tea, keyword));
}

Page({
  data: {
    statusBarHeight: 20,
    keyword: "",
    menuItems: defaultMenuItems,
    sideMenuItems: defaultMenuItems,
    activeDrink: defaultMenuItems[0] || null,
    activeDrinkId: defaultMenuItems[0] ? defaultMenuItems[0].id : "",
    filteredTeaOptions: (defaultMenuItems[0] && defaultMenuItems[0].teaOptions) || [],
    tableLabel: "",
    requestedDrinkId: "",
    scrollIntoView: ""
  },

  onLoad(options = {}) {
    const systemInfo = wx.getSystemInfoSync();
    const fromOptions = tableUtil.parseTableFromLaunch(options)
      || tableUtil.parseTableFromRaw(options.table || options.t || options.scene || "");
    const table = bindTable(fromOptions) || tableUtil.getTableNo();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      tableLabel: table || "",
      requestedDrinkId: decodeURIComponent(options.id || "")
    });
    this.loadCatalog();
  },

  onShow() {
    syncTabBar(this);
    const table = tableUtil.getTableNo();
    if (table && table !== this.data.tableLabel) {
      this.setData({ tableLabel: table });
    }
    const pendingDrinkId = wx.getStorageSync(ORDER_DRINK_KEY);
    if (pendingDrinkId) {
      wx.removeStorageSync(ORDER_DRINK_KEY);
      this.setData({ requestedDrinkId: pendingDrinkId }, () => {
        this.selectPackageById(pendingDrinkId);
        this.setData({ requestedDrinkId: "" });
      });
    }
  },

  loadCatalog() {
    getCatalog()
      .then((catalog) => {
        const remote = (catalog && catalog.drinks) || [];
        this.applyCatalog(mergeDrinkSource(remote));
      })
      .catch(() => {
        this.applyCatalog(drinks);
      });
  },

  applyCatalog(source) {
    const menuItems = normalizeMenuItems(source && source.length ? source : drinks);
    const preferredId = this.data.requestedDrinkId || this.data.activeDrinkId;
    const activeDrink = pickDefaultDrink(menuItems, preferredId);
    this.setData({
      menuItems,
      activeDrink,
      activeDrinkId: activeDrink ? activeDrink.id : "",
      sideMenuItems: menuItems,
      filteredTeaOptions: (activeDrink && activeDrink.teaOptions) || []
    }, () => {
      this.applyFilters();
      if (this.data.requestedDrinkId && activeDrink && activeDrink.id === this.data.requestedDrinkId) {
        this.setData({ requestedDrinkId: "" });
      }
    });
  },

  applyFilters() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const menuItems = this.data.menuItems || [];
    const sideMenuItems = keyword
      ? menuItems.filter((item) => packageMatchesKeyword(item, keyword))
      : menuItems;

    let activeDrink = this.data.activeDrink;
    if (sideMenuItems.length) {
      const stillVisible = activeDrink && sideMenuItems.some((item) => item.id === activeDrink.id);
      if (!stillVisible) {
        activeDrink = sideMenuItems[0];
      } else {
        activeDrink = menuItems.find((item) => item.id === activeDrink.id) || sideMenuItems[0];
      }
    } else {
      activeDrink = null;
    }

    const filteredTeaOptions = filterTeaOptions(activeDrink, keyword);
    this.setData({
      sideMenuItems,
      activeDrink,
      activeDrinkId: activeDrink ? activeDrink.id : "",
      filteredTeaOptions
    });
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilters());
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.applyFilters());
  },

  scanTable() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const result = res.result || "";
        const table = bindTable(tableUtil.parseTableFromRaw(result) || result.slice(-8));
        if (!table) {
          wx.showToast({ title: "未识别到桌号", icon: "none" });
          return;
        }
        this.setData({ tableLabel: table });
        wx.showToast({ title: `已绑定 ${table}`, icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: "未完成扫码", icon: "none" });
      }
    });
  },

  selectPackage(event) {
    this.selectPackageById(event.currentTarget.dataset.id);
  },

  selectPackageById(id) {
    const activeDrink = this.data.menuItems.find((item) => item.id === id);
    if (!activeDrink) {
      return;
    }
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    this.setData({
      activeDrink,
      activeDrinkId: activeDrink.id,
      filteredTeaOptions: filterTeaOptions(activeDrink, keyword),
      scrollIntoView: keyword ? "" : "hero"
    });
  },

  // 兼容首页跳转旧入口
  openServiceById(id) {
    this.selectPackageById(id);
  },

  addTea(event) {
    const teaChoice = event.currentTarget.dataset.tea;
    const activeDrink = this.data.activeDrink;
    if (!activeDrink || !teaChoice) {
      return;
    }
    this.addMenuItem(activeDrink, teaChoice);
  },

  addMenuItem(activeDrink, teaChoice) {
    const table = this.data.tableLabel || tableUtil.getTableNo();
    addToCart({
      id: activeDrink.id,
      type: "drink",
      name: activeDrink.name,
      price: activeDrink.price,
      color: activeDrink.color,
      image: activeDrink.image,
      category: activeDrink.section,
      options: {
        unit: activeDrink.unit,
        teaChoice,
        table: table || ""
      }
    }, DINEIN_CART_MODE);
    wx.showToast({ title: "已加入茶单" });
  }
});
