const { drinks, teaProducts } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const categoryOrder = ["全部", "绿茶", "红茶", "乌龙茶", "白茶", "黄茶", "黑茶", "花茶", "茶具", "茶饮", "茶点"];
const TARGET_CATEGORY_KEY = "sanmuhe_shop_category";

function normalizeTeaProducts(products) {
  return products.map((item) => Object.assign({}, item, {
    productType: "tea",
    thumb: item.thumb || item.image,
    sold: item.soldStock || item.sold || 0,
    availableStock: item.availableStock !== undefined
      ? item.availableStock
      : (item.stock !== undefined ? Math.max(0, Number(item.stock) || 0) : "")
  }));
}

function normalizeDrinkProducts(items) {
  return items.map((item) => Object.assign({}, item, {
    productType: "drink",
    category: "茶饮",
    thumb: item.image,
    taste: item.notes,
    origin: item.badge || item.category,
    unit: "杯",
    availableStock: ""
  }));
}

function buildProducts(catalog = {}) {
  const fromCloud = catalog.fromCloud === true;
  const nextTeaProducts = fromCloud ? (catalog.teaProducts || []) : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
  const nextDrinks = fromCloud ? (catalog.drinks || []) : (catalog.drinks && catalog.drinks.length ? catalog.drinks : drinks);
  return normalizeTeaProducts(nextTeaProducts).concat(normalizeDrinkProducts(nextDrinks));
}

function buildCategories(products) {
  const unique = products.reduce((result, item) => {
    if (item.category && result.indexOf(item.category) < 0) {
      result.push(item.category);
    }
    return result;
  }, []);
  const ordered = categoryOrder.filter((category) => category === "全部" || unique.indexOf(category) >= 0);
  const extras = unique.filter((category) => ordered.indexOf(category) < 0);
  return ordered.concat(extras);
}

Page({
  data: {
    categories: buildCategories(buildProducts({ teaProducts, drinks })),
    activeCategory: "全部",
    keyword: "",
    products: buildProducts({ teaProducts, drinks }),
    filteredProducts: buildProducts({ teaProducts, drinks }),
    drinkSheetOpen: false,
    selectedDrink: null,
    selectedTemp: "",
    selectedSugar: "",
    drinkTable: "",
    cartCount: 0,
    cartTotal: 0
  },

  onLoad() {
    this.loadCatalog();
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
    this.applyPendingCategory();
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
      const products = buildProducts(catalog);
      this.setData({
        products,
        categories: buildCategories(products),
        activeCategory: this.data.activeCategory === "全部" || products.some((item) => item.category === this.data.activeCategory)
          ? this.data.activeCategory
          : "全部"
      }, () => this.applyFilters());
    });
  },

  applyPendingCategory() {
    const targetCategory = wx.getStorageSync(TARGET_CATEGORY_KEY);
    if (!targetCategory || this.data.categories.indexOf(targetCategory) < 0) {
      return;
    }
    wx.removeStorageSync(TARGET_CATEGORY_KEY);
    this.setData({
      activeCategory: targetCategory,
      keyword: ""
    }, () => this.applyFilters());
  },

  applyFilters() {
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const filteredProducts = this.data.products.filter((item) => {
      const categoryMatched = this.data.activeCategory === "全部" || item.category === this.data.activeCategory;
      const keywordMatched = !keyword || [
        item.name,
        item.category,
        item.origin,
        item.taste,
        item.notes
      ].join(" ").toLowerCase().indexOf(keyword) >= 0;
      return categoryMatched && keywordMatched;
    });
    this.setData({ filteredProducts });
  },

  changeCategory(event) {
    const activeCategory = event.currentTarget.dataset.category;
    this.setData({ activeCategory }, () => this.applyFilters());
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilters());
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.applyFilters());
  },

  viewProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    if (product && product.productType === "drink") {
      this.openDrinkSheet(product);
      return;
    }
    wx.navigateTo({
      url: `/pages/product/index?id=${event.currentTarget.dataset.id}`
    });
  },

  addProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    if (product.productType === "drink") {
      this.openDrinkSheet(product);
      return;
    }
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: product.price,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      options: {
        unit: product.unit
      }
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  openDrinkSheet(drink) {
    this.setData({
      drinkSheetOpen: true,
      selectedDrink: drink,
      selectedTemp: drink.temps && drink.temps[0] ? drink.temps[0] : "冷",
      selectedSugar: drink.sugars && drink.sugars[0] ? drink.sugars[0] : "正常糖",
      drinkTable: ""
    });
  },

  closeDrinkSheet() {
    this.setData({ drinkSheetOpen: false, selectedDrink: null });
  },

  noop() {},

  chooseDrinkTemp(event) {
    this.setData({ selectedTemp: event.currentTarget.dataset.value });
  },

  chooseDrinkSugar(event) {
    this.setData({ selectedSugar: event.currentTarget.dataset.value });
  },

  onDrinkTableInput(event) {
    this.setData({ drinkTable: event.detail.value });
  },

  confirmDrink() {
    const { selectedDrink, selectedTemp, selectedSugar, drinkTable } = this.data;
    if (!selectedDrink) {
      return;
    }
    addToCart({
      id: selectedDrink.id,
      type: "drink",
      name: selectedDrink.name,
      price: selectedDrink.price,
      color: selectedDrink.color,
      image: selectedDrink.thumb || selectedDrink.image,
      category: selectedDrink.category,
      options: {
        temp: selectedTemp,
        sugar: selectedSugar,
        table: String(drinkTable || "").trim()
      }
    });
    this.setData({ drinkSheetOpen: false, selectedDrink: null });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goCart() {
    wx.switchTab({ url: "/pages/cart/index" });
  },

  goBack() {
    wx.switchTab({ url: "/pages/index/index" });
  }
});
