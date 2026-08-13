const { drinks } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { normalizeMenuItems } = require("../../utils/teaMenu");
const { syncTabBar } = require("../../utils/tabbar");
const tableUtil = require("../../utils/table");

const DINEIN_CART_MODE = "dinein";
const ORDER_DRINK_KEY = "sanmuhe_order_drink_id";
/** 开发阶段默认桌号；桌上小程序码扫入后会覆盖 */
const DEV_DEFAULT_TABLE = "1";
const ORDER_HERO_IMAGE_BY_DRINK_ID = {
  "drink-001": "/assets/images/order-hero-001-chujian.jpg",
  "drink-002": "/assets/images/order-hero-002-zhiwei.jpg",
  "drink-003": "/assets/images/order-hero-003-zhencang.jpg",
  "drink-004": "/assets/images/order-hero-004-pengcha.jpg",
  "drink-005": "/assets/images/order-hero-005-fangming.jpg"
};
const localDrinkMap = drinks.reduce((map, item) => {
  map[item.id] = item;
  return map;
}, {});

function decorateTeaOptions(items) {
  return (items || []).map((item) => Object.assign({}, item, {
    heroImage: ORDER_HERO_IMAGE_BY_DRINK_ID[item.id] || item.image,
    teaOptions: (item.teaOptions || []).map((tea) => Object.assign({}, tea, {
      categoryChars: String(tea.category || "茶品").split("")
    }))
  }));
}

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

/** 启动参数 / 缓存优先；都没有时用开发默认桌号 */
function resolveBoundTable(options = {}) {
  const fromOptions = tableUtil.parseTableFromLaunch(options)
    || tableUtil.parseTableFromRaw(options.table || options.t || options.scene || "");
  const bound = bindTable(fromOptions) || tableUtil.getTableNo();
  if (bound) {
    return bound;
  }
  return bindTable(DEV_DEFAULT_TABLE);
}

function formatTableChip(table) {
  const value = tableUtil.normalizeTable(table);
  if (!value) {
    return "";
  }
  // 已是「桌1」类文案则不再叠「桌」
  if (/^桌/.test(value)) {
    return value;
  }
  return `桌 ${value}`;
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

// 云端茶单常缺 teaGroups / 图文字段：按 id 用本地目录补字段，空列表保持为空
function mergeDrinkSource(remoteItems) {
  if (!remoteItems || !remoteItems.length) {
    return [];
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

Page({
  data: {
    statusBarHeight: 20,
    menuItems: [],
    activeDrink: null,
    activeDrinkId: "",
    catalogLoading: true,
    catalogError: false,
    refreshing: false,
    tableLabel: "",
    tableChipText: "",
    tableBound: false,
    requestedDrinkId: "",
    scrollIntoView: "",
    cartCount: 0,
    cartTotal: 0
  },

  applyTableState(table) {
    const value = tableUtil.normalizeTable(table);
    this.setData({
      tableLabel: value || "",
      tableBound: Boolean(value),
      tableChipText: value ? formatTableChip(value) : "请扫桌上码"
    });
  },

  onLoad(options = {}) {
    const systemInfo = wx.getSystemInfoSync();
    const table = resolveBoundTable(options);
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20,
      requestedDrinkId: decodeURIComponent(options.id || "")
    });
    this.applyTableState(table);
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
    this.loadCatalog();
    // 热启动扫了新桌码时覆盖展示；无缓存时保持开发默认桌
    let table = tableUtil.getTableNo();
    if (!table) {
      table = bindTable(DEV_DEFAULT_TABLE);
    }
    if (table !== this.data.tableLabel) {
      this.applyTableState(table);
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

  onPullRefresh() {
    if (this._catalogRefreshing) {
      return;
    }
    this._catalogRefreshing = true;
    this.setData({ refreshing: true });
    this.loadCatalog({ fromRefresh: true });
  },

  finishCatalogRefresh(fromRefresh) {
    if (!fromRefresh) {
      return;
    }
    setTimeout(() => {
      this.setData({ refreshing: false });
      this._catalogRefreshing = false;
    }, 400);
  },

  loadCatalog(options = {}) {
    const fromRefresh = options.fromRefresh === true;
    if (!fromRefresh) {
      this.setData({ catalogLoading: true });
    }
    getCatalog()
      .then((catalog) => {
        const remote = (catalog && catalog.drinks) || [];
        this.applyCatalog(mergeDrinkSource(remote), catalog.source === "error", fromRefresh);
      });
  },

  applyCatalog(source, catalogError, fromRefresh) {
    const menuItems = decorateTeaOptions(normalizeMenuItems(source || []));
    const preferredId = this.data.requestedDrinkId || this.data.activeDrinkId;
    const activeDrink = pickDefaultDrink(menuItems, preferredId);
    this.setData({
      menuItems,
      activeDrink,
      activeDrinkId: activeDrink ? activeDrink.id : "",
      catalogLoading: false,
      catalogError: !!catalogError
    }, () => {
      this.finishCatalogRefresh(fromRefresh);
      if (this.data.requestedDrinkId && activeDrink && activeDrink.id === this.data.requestedDrinkId) {
        this.setData({ requestedDrinkId: "" });
      }
    });
  },

  /** 状态芯片：说明正规路径；需要时再二次确认扫码（开发兜底） */
  onTableChipTap() {
    const bound = this.data.tableBound;
    const current = this.data.tableChipText || "未绑定";
    wx.showModal({
      title: bound ? current : "绑定桌号",
      content: bound
        ? "到店请扫桌上的点单码，桌号会自动绑定。若需换桌，请直接扫描新桌的码。"
        : "请使用微信扫描桌上的点单码。开发阶段也可临时扫一扫绑定。",
      confirmText: "扫一扫",
      cancelText: "知道了",
      success: (res) => {
        if (res.confirm) {
          this.scanTable();
        }
      }
    });
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
        this.applyTableState(table);
        wx.showToast({ title: `已绑定桌 ${table}`, icon: "none" });
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
    this.setData({
      activeDrink,
      activeDrinkId: activeDrink.id,
      scrollIntoView: "hero"
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
    const cart = addToCart({
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
    this.updateCartSummary(cart);
    wx.showToast({ title: "已加入茶单" });
  },

  refreshCart() {
    this.updateCartSummary(getCart(DINEIN_CART_MODE));
  },

  updateCartSummary(cart) {
    const source = Array.isArray(cart) ? cart : [];
    this.setData({
      cartCount: source.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      cartTotal: getTotal(source)
    });
  },

  goCart() {
    wx.navigateTo({
      url: "/pages/cart/index?mode=dinein",
      fail: () => {
        wx.showToast({ title: "暂时无法打开茶单", icon: "none" });
      }
    });
  }
});
