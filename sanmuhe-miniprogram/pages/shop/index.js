const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog, getCachedCatalog } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

/** 无云端类别时的兜底顺序（与 seed product_categories 对齐） */
const DEFAULT_CATEGORY_ORDER = ["全部", "红茶", "白茶", "岩茶", "普洱茶", "单丛"];
const TARGET_CATEGORY_KEY = "sanmuhe_shop_category";
const RETAIL_MODE = "retail";

/** 列表直加：取唯一规格；无 specs 时回退商品默认 unit/price */
function resolveDefaultSpec(product) {
  const specs = Array.isArray(product.specs) ? product.specs : [];
  if (specs.length >= 1) {
    const spec = specs[0] || {};
    const label = String(spec.label || product.unit || "默认").trim() || "默认";
    const price = Number(spec.price);
    return {
      label,
      price: Number.isFinite(price) && price >= 0 ? price : Math.max(0, Number(product.price) || 0)
    };
  }
  return {
    label: String(product.unit || "默认").trim() || "默认",
    price: Math.max(0, Number(product.price) || 0)
  };
}

function normalizeTeaProducts(products) {
  return products.map((item) => {
    const specs = Array.isArray(item.specs) ? item.specs : [];
    const hasSpecStock = specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "");
    let availableStock = "";
    if (hasSpecStock) {
      availableStock = specs.reduce((sum, spec) => {
        if (!spec || spec.stock === undefined || spec.stock === null || spec.stock === "") return sum;
        if (spec.availableStock !== undefined && spec.availableStock !== "") {
          return sum + Math.max(0, Number(spec.availableStock) || 0);
        }
        const stock = Math.max(0, Number(spec.stock) || 0);
        const locked = Math.max(0, Number(spec.lockedStock) || 0);
        const sold = Math.max(0, Number(spec.soldStock) || 0);
        return sum + Math.max(0, stock - locked - sold);
      }, 0);
    } else if (item.availableStock !== undefined && item.availableStock !== "") {
      availableStock = Math.max(0, Number(item.availableStock) || 0);
    } else if (item.stock !== undefined) {
      availableStock = Math.max(0, Number(item.stock) || 0);
    }
    const hasMultipleSpecs = specs.length > 1;
    const isSoldOut = availableStock !== "" && availableStock <= 0;
    const actionKind = isSoldOut ? "soldout" : hasMultipleSpecs ? "spec" : "add";
    const actionText = isSoldOut ? "售罄" : hasMultipleSpecs ? "选规格" : "+";
    const specPrices = specs
      .map((spec) => Number(spec && spec.price))
      .filter((price) => Number.isFinite(price) && price >= 0);
    const displayPrice = specPrices.length
      ? Math.min(...specPrices)
      : Math.max(0, Number(item.price) || 0);

    return Object.assign({}, item, {
      productType: "tea",
      thumb: item.thumb || item.image,
      sold: item.soldStock || item.sold || 0,
      availableStock,
      hasMultipleSpecs,
      isSoldOut,
      actionKind,
      actionText,
      displayPrice,
      priceSuffix: hasMultipleSpecs ? "起" : "",
      actionLabel: hasMultipleSpecs ? "选规格" : "加购",
      actionAriaLabel: hasMultipleSpecs
        ? `选择${item.name}的规格`
        : `将${item.name}加入购物车`
    });
  });
}

function buildProducts(catalog = {}) {
  return normalizeTeaProducts(Array.isArray(catalog.teaProducts) ? catalog.teaProducts : []);
}

/**
 * 商城侧栏类别：优先用后台 product_categories（tea_products 渠道），
 * 再并入商品实际 category；无配置时用本地默认顺序。
 */
function buildCategories(products, productCategories = []) {
  const unique = products.reduce((result, item) => {
    if (item.category && result.indexOf(item.category) < 0) {
      result.push(item.category);
    }
    return result;
  }, []);

  const managed = (productCategories || [])
    .filter((item) => item && item.channel === "tea_products" && item.visible !== false && item.removed !== true)
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999))
    .map((item) => String(item.name || "").trim())
    .filter(Boolean);

  const preferred = managed.length
    ? ["全部"].concat(managed)
    : DEFAULT_CATEGORY_ORDER.slice();

  const ordered = preferred.filter((category) => category === "全部" || unique.indexOf(category) >= 0);
  // 有配置但暂时无商品的类别也展示，方便运营先建类再上架
  if (managed.length) {
    preferred.forEach((category) => {
      if (category !== "全部" && ordered.indexOf(category) < 0) {
        ordered.push(category);
      }
    });
  }
  const extras = unique.filter((category) => ordered.indexOf(category) < 0);
  return ordered.concat(extras);
}

Page({
  data: {
    categories: ["全部"],
    activeCategory: "全部",
    keyword: "",
    products: [],
    filteredProducts: [],
    catalogLoading: true,
    catalogError: false,
    refreshing: false,
    cartCount: 0,
    cartTotal: 0,
    statusBarHeight: 20
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight || 20 });
    const cachedCatalog = getCachedCatalog();
    if (cachedCatalog) {
      this.applyCatalog(cachedCatalog, false);
    }
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
    this.loadCatalog();
  },

  refreshCart() {
    const cart = getCart(RETAIL_MODE);
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      cartTotal: getTotal(cart)
    });
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
    getCatalog().then((catalog) => {
      this.applyCatalog(catalog, fromRefresh);
    });
  },

  applyCatalog(catalog, fromRefresh) {
    const products = buildProducts(catalog);
    const categories = buildCategories(products, catalog.productCategories || []);
    const pendingCategory = wx.getStorageSync(TARGET_CATEGORY_KEY);
    let activeCategory = this.data.activeCategory;
    if (pendingCategory && categories.indexOf(pendingCategory) >= 0) {
      wx.removeStorageSync(TARGET_CATEGORY_KEY);
      activeCategory = pendingCategory;
    } else if (activeCategory !== "全部" && categories.indexOf(activeCategory) < 0) {
      activeCategory = "全部";
    }
    this.setData({
      products,
      categories,
      activeCategory,
      catalogLoading: false,
      catalogError: catalog.source === "error"
    }, () => {
      this.applyFilters();
      this.finishCatalogRefresh(fromRefresh);
    });
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
    // 多规格：必须先选规格（进详情；半屏可后续再做）
    if (product.hasMultipleSpecs) {
      this.openProductDetail(product.id);
      return;
    }
    // 单规格 / 无可选规格：列表直接加入零售购物车
    const defaultSpec = resolveDefaultSpec(product);
    if (!(defaultSpec.price > 0)) {
      wx.showToast({ title: "该茶品暂不可购", icon: "none" });
      return;
    }
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: defaultSpec.price,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      quantity: 1,
      options: {
        unit: defaultSpec.label
      }
    }, RETAIL_MODE);
    this.refreshCart();
    wx.showToast({ title: "已加入购物车", icon: "success" });
  },

  goCart() {
    wx.navigateTo({
      url: `/pages/cart/index?mode=${RETAIL_MODE}`,
      fail: () => {
        wx.showToast({ title: "暂时无法打开购物车", icon: "none" });
      }
    });
  }
});
