const { teaProducts } = require("../../data/catalog");
const { getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const categoryOrder = ["全部", "红茶", "白茶", "岩茶", "普洱茶", "单丛"];
const TARGET_CATEGORY_KEY = "sanmuhe_shop_category";

function normalizeTeaProducts(products) {
  return products.map((item) => {
    const specs = Array.isArray(item.specs) ? item.specs : [];
    const availableStock = item.availableStock !== undefined && item.availableStock !== ""
      ? Math.max(0, Number(item.availableStock) || 0)
      : (item.stock !== undefined ? Math.max(0, Number(item.stock) || 0) : "");
    const hasMultipleSpecs = specs.length > 1;
    const isSoldOut = availableStock !== "" && availableStock <= 0;
    const specPrices = specs
      .map((spec) => Number(spec && spec.price))
      .filter((price) => Number.isFinite(price) && price >= 0);
    const displayPrice = specPrices.length
      ? Math.min(...specPrices)
      : Math.max(0, Number(item.price) || 0);
    const stockHint = isSoldOut
      ? "已售罄"
      : (availableStock !== "" && availableStock <= 10 ? `仅余 ${availableStock} 件` : "");

    return Object.assign({}, item, {
      productType: "tea",
      thumb: item.thumb || item.image,
      sold: item.soldStock || item.sold || 0,
      availableStock,
      hasMultipleSpecs,
      isSoldOut,
      displayPrice,
      priceSuffix: hasMultipleSpecs ? "起" : "",
      stockHint
    });
  });
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
    cartTotal: 0,
    statusBarHeight: 20
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight || 20 });
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
    }).catch(() => {
      wx.showToast({
        title: "茶品暂未更新，已显示现有内容",
        icon: "none"
      });
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
    this.setData({
      activeCategory,
      keyword: ""
    }, () => this.applyFilters());
  },

  onSearch(event) {
    const keyword = event.detail.value;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.setData({
      keyword,
      activeCategory: String(keyword || "").trim() ? "全部" : this.data.activeCategory
    });
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.applyFilters();
    }, 120);
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.applyFilters());
  },

  clearFilters() {
    this.setData({
      keyword: "",
      activeCategory: "全部"
    }, () => this.applyFilters());
  },

  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  },

  viewProduct(event) {
    this.openProductDetail(event.currentTarget.dataset.id);
  },

  openProductDetail(productId) {
    if (!productId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/product/index?id=${encodeURIComponent(productId)}`
    });
  },

  addProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    if (product.isSoldOut) {
      wx.showToast({ title: "这款茶暂时售罄", icon: "none" });
      return;
    }
    this.openProductDetail(product.id);
  },

  goCart() {
    wx.navigateTo({ url: "/pages/cart/index?mode=retail" });
  }
});
