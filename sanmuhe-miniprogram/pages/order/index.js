const { drinks } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { normalizeMenuItems } = require("../../utils/teaMenu");
const { syncTabBar } = require("../../utils/tabbar");
const tableUtil = require("../../utils/table");

const DINEIN_CART_MODE = "dinein";
const ORDER_DRINK_KEY = "sanmuhe_order_drink_id";
const sections = ["品饮", "壶茶"];
const defaultMenuItems = normalizeMenuItems(drinks);

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

function filterBySection(items, section) {
  return (items || []).filter((item) => item.section === section);
}

Page({
  data: {
    sections,
    activeSection: "品饮",
    menuItems: defaultMenuItems,
    filteredItems: filterBySection(defaultMenuItems, "品饮"),
    activeDrink: null,
    activeDrinkId: "",
    selectedTea: "",
    sheetVisible: false,
    tableLabel: "",
    requestedDrinkId: "",
    cartCount: 0,
    cartTotal: 0
  },

  onLoad(options = {}) {
    const fromOptions = tableUtil.parseTableFromLaunch(options)
      || tableUtil.parseTableFromRaw(options.table || options.t || options.scene || "");
    const table = bindTable(fromOptions) || tableUtil.getTableNo();
    this.setData({
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
        const pendingDrink = this.data.menuItems.find((item) => item.id === pendingDrinkId);
        if (pendingDrink) {
          this.openServiceById(pendingDrink.id);
          this.setData({ requestedDrinkId: "" });
        }
      });
    }
    this.refreshCart();
  },

  refreshCart() {
    const cart = getCart(DINEIN_CART_MODE);
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      cartTotal: getTotal(cart)
    });
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const source = catalog.fromCloud
        ? (catalog.drinks || [])
        : (catalog.drinks && catalog.drinks.length ? catalog.drinks : drinks);
      const menuItems = normalizeMenuItems(source);
      const requested = menuItems.find((item) => item.id === this.data.requestedDrinkId);
      const activeSection = requested ? requested.section : this.data.activeSection;
      this.setData({
        menuItems,
        activeSection,
        filteredItems: filterBySection(menuItems, activeSection)
      }, () => {
        if (requested) {
          this.openServiceById(requested.id);
          this.setData({ requestedDrinkId: "" });
        }
      });
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
        this.setData({ tableLabel: table });
        wx.showToast({ title: `已绑定 ${table}`, icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: "未完成扫码", icon: "none" });
      }
    });
  },

  changeSection(event) {
    const activeSection = event.currentTarget.dataset.section;
    this.setData({
      activeSection,
      filteredItems: filterBySection(this.data.menuItems, activeSection),
      activeDrink: null,
      activeDrinkId: "",
      selectedTea: "",
      sheetVisible: false
    });
  },

  openService(event) {
    this.openServiceById(event.currentTarget.dataset.id);
  },

  openServiceById(id) {
    const activeDrink = this.data.menuItems.find((item) => item.id === id);
    if (!activeDrink) {
      return;
    }
    const defaultChoice = activeDrink.teaChoices[0] || "";
    this.setData({
      activeDrink,
      activeDrinkId: activeDrink.id,
      selectedTea: defaultChoice,
      sheetVisible: true
    });
  },

  chooseTea(event) {
    this.setData({ selectedTea: event.currentTarget.dataset.tea });
  },

  quickAddService(event) {
    const activeDrink = this.data.menuItems.find((item) => item.id === event.currentTarget.dataset.id);
    if (!activeDrink) {
      return;
    }
    if (activeDrink.teaChoices.length === 1) {
      this.addMenuItem(activeDrink, activeDrink.teaChoices[0]);
      return;
    }
    this.openServiceById(activeDrink.id);
  },

  closeSheet() {
    this.setData({ sheetVisible: false });
  },

  stopTap() {},

  addDrink() {
    const activeDrink = this.data.activeDrink;
    if (!activeDrink) {
      return;
    }
    if (!this.data.selectedTea) {
      wx.showToast({ title: "请先选择本次茶品", icon: "none" });
      return;
    }
    this.addMenuItem(activeDrink, this.data.selectedTea);
    this.setData({ sheetVisible: false });
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
    this.refreshCart();
    wx.showToast({ title: "已加入茶单" });
  },

  goCart() {
    if (!this.data.cartCount) {
      wx.showToast({ title: "请先选择茶品", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/cart/index?mode=dinein" });
  }
});
