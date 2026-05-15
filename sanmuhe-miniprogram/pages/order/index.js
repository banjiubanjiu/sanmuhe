const { drinks } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");

const categories = ["推荐", "经典茶饮", "鲜果茶", "奶茶系列", "纯茶", "小食甜点"];

function parseTableLabel(rawValue) {
  const decoded = decodeURIComponent(rawValue || "");
  const tableMatch = decoded.match(/table=([^&]+)/);
  return tableMatch ? decodeURIComponent(tableMatch[1]) : decoded;
}

Page({
  data: {
    categories,
    activeCategory: "推荐",
    drinks,
    filteredDrinks: drinks.filter((item) => item.category === "推荐"),
    tableLabel: "",
    activeDrink: drinks[0],
    selectedTemp: drinks[0].temps[0],
    selectedSugar: drinks[0].sugars[0],
    cartCount: 0,
    cartTotal: 0
  },

  onLoad(options) {
    const table = options.table || options.scene;
    if (table) {
      this.setData({ tableLabel: parseTableLabel(table) });
    }
    this.loadCatalog();
  },

  onShow() {
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
      const nextDrinks = catalog.drinks && catalog.drinks.length ? catalog.drinks : drinks;
      const filteredDrinks = nextDrinks.filter((item) => item.category === this.data.activeCategory);
      const activeDrink = nextDrinks.find((item) => item.id === this.data.activeDrink.id) || nextDrinks[0];
      this.setData({
        drinks: nextDrinks,
        filteredDrinks,
        activeDrink,
        selectedTemp: activeDrink.temps[0],
        selectedSugar: activeDrink.sugars[0]
      });
    });
  },

  scanTable() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const result = res.result || "";
        this.setData({
          tableLabel: parseTableLabel(result) || result.slice(-8) || "现场茶桌"
        });
      },
      fail: () => {
        wx.showToast({ title: "未完成扫码", icon: "none" });
      }
    });
  },

  setDemoTable() {
    this.setData({ tableLabel: "A03 临窗席" });
  },

  changeCategory(event) {
    const activeCategory = event.currentTarget.dataset.category;
    const filteredDrinks = this.data.drinks.filter((item) => item.category === activeCategory);
    this.setData({ activeCategory, filteredDrinks });
  },

  chooseDrink(event) {
    const id = event.currentTarget.dataset.id;
    const activeDrink = this.data.drinks.find((item) => item.id === id);
    this.setData({
      activeDrink,
      selectedTemp: activeDrink.temps[0],
      selectedSugar: activeDrink.sugars[0]
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
        table: tableLabel
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
    addToCart({
      id: activeDrink.id,
      type: "drink",
      name: activeDrink.name,
      price: activeDrink.price,
      color: activeDrink.color,
      image: activeDrink.image,
      options: {
        temp: activeDrink.temps[0],
        sugar: activeDrink.sugars[0],
        table: this.data.tableLabel
      }
    });
    this.setData({
      activeDrink,
      selectedTemp: activeDrink.temps[0],
      selectedSugar: activeDrink.sugars[0]
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goCart() {
    wx.switchTab({ url: "/pages/cart/index" });
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
