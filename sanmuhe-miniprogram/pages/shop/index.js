const { teaProducts } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const categoryOrder = ["全部", "红茶", "白茶", "岩茶", "普洱茶", "单丛"];
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

function buildProducts(catalog = {}) {
  const fromCloud = catalog.fromCloud === true;
  const nextTeaProducts = fromCloud ? (catalog.teaProducts || []) : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
  return normalizeTeaProducts(nextTeaProducts);
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
    categories: buildCategories(buildProducts({ teaProducts })),
    activeCategory: "全部",
    keyword: "",
    products: buildProducts({ teaProducts }),
    filteredProducts: buildProducts({ teaProducts }),
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
    wx.navigateTo({
      url: `/pages/product/index?id=${event.currentTarget.dataset.id}`
    });
  },

  addProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    // 多规格茶叶进入详情页选择包装与价格
    if (Array.isArray(product.specs) && product.specs.length > 1) {
      wx.navigateTo({
        url: `/pages/product/index?id=${product.id}`
      });
      return;
    }
    const defaultSpec = Array.isArray(product.specs) && product.specs[0] ? product.specs[0] : null;
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: defaultSpec ? defaultSpec.price : product.price,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      options: {
        unit: defaultSpec ? defaultSpec.label : product.unit
      }
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goCart() {
    wx.navigateTo({ url: "/pages/cart/index?mode=retail" });
  },

  goBack() {
    wx.switchTab({ url: "/pages/index/index" });
  }
});
