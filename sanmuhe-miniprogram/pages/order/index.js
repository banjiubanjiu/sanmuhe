const { drinks } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const tableUtil = require("../../utils/table");

const categories = ["推荐", "品鉴", "壶茶"];

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
    // ignore
  }
  return table;
}

Page({
  data: {
    categories,
    activeCategory: "推荐",
    drinks,
    filteredDrinks: drinks.filter((item) => item.category === "推荐"),
    tableLabel: "",
    activeDrink: drinks[0],
    selectedTemp: drinks[0] && drinks[0].temps ? drinks[0].temps[0] : "热",
    selectedSugar: drinks[0] && drinks[0].sugars ? drinks[0].sugars[0] : "无糖",
    cartCount: 0,
    cartTotal: 0
  },

  onLoad(options) {
    // Mini-code: query.scene / table; path QR: table=
    const fromOptions = tableUtil.parseTableFromLaunch(options || {})
      || tableUtil.parseTableFromRaw((options && (options.table || options.t || options.scene)) || "");
    const table = bindTable(fromOptions) || tableUtil.getTableNo();
    if (table) {
      this.setData({ tableLabel: table });
    }
    this.loadCatalog();
  },

  onShow() {
    const table = tableUtil.getTableNo();
    if (table && table !== this.data.tableLabel) {
      this.setData({ tableLabel: table });
    }
    this.refreshCart();
  },

  refreshCart() {
    const cart = getCart();
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: getTotal(cart)
    });
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const nextDrinks = catalog.fromCloud ? (catalog.drinks || []) : (catalog.drinks && catalog.drinks.length ? catalog.drinks : drinks);
      const filteredDrinks = nextDrinks.filter((item) => item.category === this.data.activeCategory);
      const activeDrink = nextDrinks.find((item) => item.id === (this.data.activeDrink && this.data.activeDrink.id)) || nextDrinks[0];
      if (!activeDrink) {
        this.setData({
          drinks: [],
          filteredDrinks: [],
          activeDrink: null,
          selectedTemp: "",
          selectedSugar: ""
        });
        return;
      }
      this.setData({
        drinks: nextDrinks,
        filteredDrinks: filteredDrinks.length ? filteredDrinks : nextDrinks,
        activeDrink,
        selectedTemp: activeDrink.temps && activeDrink.temps[0] ? activeDrink.temps[0] : "热",
        selectedSugar: activeDrink.sugars && activeDrink.sugars[0] ? activeDrink.sugars[0] : "无糖"
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

  changeCategory(event) {
    const activeCategory = event.currentTarget.dataset.category;
    const filteredDrinks = this.data.drinks.filter((item) => item.category === activeCategory);
    this.setData({ activeCategory, filteredDrinks });
  },

  chooseDrink(event) {
    const id = event.currentTarget.dataset.id;
    const activeDrink = this.data.drinks.find((item) => item.id === id);
    if (!activeDrink) {
      return;
    }
    this.setData({
      activeDrink,
      selectedTemp: activeDrink.temps && activeDrink.temps[0] ? activeDrink.temps[0] : "热",
      selectedSugar: activeDrink.sugars && activeDrink.sugars[0] ? activeDrink.sugars[0] : "无糖"
    });
  },

  chooseTemp(event) {
    this.setData({ selectedTemp: event.currentTarget.dataset.value });
  },

  chooseSugar(event) {
    this.setData({ selectedSugar: event.currentTarget.dataset.value });
  },

  addDrink() {
    const { activeDrink, selectedTemp, selectedSugar, tableLabel } = this.data;
    if (!activeDrink) {
      wx.showToast({ title: "暂无可点茶饮", icon: "none" });
      return;
    }
    const table = tableLabel || tableUtil.getTableNo();
    addToCart({
      id: activeDrink.id,
      type: "drink",
      name: activeDrink.name,
      price: activeDrink.price,
      color: activeDrink.color,
      image: activeDrink.image,
      options: {
        temp: selectedTemp,
        sugar: selectedSugar,
        table: table || ""
      }
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  quickAddDrink(event) {
    const id = event.currentTarget.dataset.id;
    const activeDrink = this.data.drinks.find((item) => item.id === id);
    if (!activeDrink) {
      return;
    }
    const table = this.data.tableLabel || tableUtil.getTableNo();
    addToCart({
      id: activeDrink.id,
      type: "drink",
      name: activeDrink.name,
      price: activeDrink.price,
      color: activeDrink.color,
      image: activeDrink.image,
      options: {
        temp: activeDrink.temps && activeDrink.temps[0] ? activeDrink.temps[0] : "热",
        sugar: activeDrink.sugars && activeDrink.sugars[0] ? activeDrink.sugars[0] : "无糖",
        table: table || ""
      }
    });
    this.setData({
      activeDrink,
      selectedTemp: activeDrink.temps && activeDrink.temps[0] ? activeDrink.temps[0] : "热",
      selectedSugar: activeDrink.sugars && activeDrink.sugars[0] ? activeDrink.sugars[0] : "无糖"
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goCart() {
    wx.navigateTo({ url: "/pages/cart/index" });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/index/index" });
  }
});
