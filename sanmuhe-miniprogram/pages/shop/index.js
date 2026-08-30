const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog, getCachedCatalog } = require("../../utils/cloudApi");
const { preloadImages, toThumbnailUrl } = require("../../utils/imagePerformance");
const { syncTabBar } = require("../../utils/tabbar");
const { buildShareMessage } = require("../../utils/share");

/** 无云端类别时的兜底顺序（与 seed product_categories 对齐） */
const DEFAULT_CATEGORY_ORDER = ["全部", "红茶", "白茶", "岩茶", "普洱茶", "单丛"];
const TARGET_CATEGORY_KEY = "sanmuhe_shop_category";
const RETAIL_MODE = "retail";
const INITIAL_PRODUCT_BATCH_SIZE = 6;
const PRODUCT_BATCH_SIZE = 4;

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
      thumb: toThumbnailUrl(item.thumb || item.image),
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

/** 自选礼盒 → 商城商品条目（礼盒分类展示，带「自选」角标） */
function normalizeGiftBoxes(plans) {
  return (Array.isArray(plans) ? plans : []).map((plan) => {
    const selection = plan.selection || {};
    const mode = selection.mode === "double" ? "double" : "single";
    const minTypes = Math.max(1, Number(selection.minTypes) || (mode === "double" ? 2 : 1));
    const brewsPerType = Math.max(1, Number(selection.brewsPerType) || 1);
    const wholeBox = plan.priceMode === "whole_box";
    const boxFeeFen = wholeBox ? 0 : Math.max(0, Number(plan.boxFeeFen) || 0);
    const pool = Array.isArray(plan.pool) ? plan.pool : [];
    const prices = pool.map((t) => Math.max(0, Number(t.priceFen) || 0)).filter((p) => p > 0);
    // 展示价：整盒 → 最低整盒价；按泡 → 最低组合价（单价×泡数×最少款数+包装费）
    const minPriceFen = wholeBox
      ? (prices.length ? Math.min(...prices) : 0)
      : (prices.length ? Math.min(...prices) : 0) * brewsPerType * minTypes + boxFeeFen;
    const stock = Math.max(0, Number(plan.stock) || 0);
    const locked = Math.max(0, Number(plan.lockedStock) || 0);
    const sold = Math.max(0, Number(plan.soldStock) || 0);
    const availableStock = Math.max(0, stock - locked - sold);
    const isSoldOut = availableStock <= 0;
    const image = plan.image || (plan.images && plan.images[0]) || "";
    return Object.assign({}, plan, {
      productType: "giftbox",
      isGiftBox: true,
      category: plan.category || "礼盒",
      unit: "盒",
      thumb: toThumbnailUrl(image),
      image,
      availableStock,
      isSoldOut,
      displayPrice: minPriceFen / 100,
      priceSuffix: "起",
      actionKind: isSoldOut ? "soldout" : "giftbox",
      actionText: isSoldOut ? "售罄" : "自选",
      actionLabel: isSoldOut ? "已售罄" : "自选搭配",
      actionAriaLabel: `选择${plan.name}的搭配`
    });
  });
}

function buildProducts(catalog = {}) {
  const teas = normalizeTeaProducts(Array.isArray(catalog.teaProducts) ? catalog.teaProducts : []);
  const giftBoxes = normalizeGiftBoxes(catalog.giftBoxes);
  return teas.concat(giftBoxes);
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
    visibleProducts: [],
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
    // 首页预拉取只有少量精选条目；商城首屏只能使用完整目录缓存。
    const cachedCatalog = getCachedCatalog({ fullOnly: true });
    if (cachedCatalog) {
      this.applyCatalog(cachedCatalog, false);
    }
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
    this.loadCatalog();
  },

  onShareAppMessage() {
    return buildShareMessage({
      title: "禾煦甄选好茶",
      path: "/pages/shop/index"
    });
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
      this.applyFilters({ preserveVisible: true });
      this.finishCatalogRefresh(fromRefresh);
    });
  },

  applyFilters(options = {}) {
    const { activeCategory, products, visibleProducts } = this.data;
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const filteredProducts = products.filter((item) => {
      const categoryMatched = activeCategory === "全部" || item.category === activeCategory;
      const keywordMatched = !keyword || [
        item.name,
        item.category,
        item.origin,
        item.taste,
        item.notes
      ].join(" ").toLowerCase().indexOf(keyword) >= 0;
      return categoryMatched && keywordMatched;
    });
    const visibleLimit = options.preserveVisible
      ? Math.max(INITIAL_PRODUCT_BATCH_SIZE, visibleProducts.length)
      : INITIAL_PRODUCT_BATCH_SIZE;
    const nextVisibleProducts = filteredProducts.slice(0, visibleLimit);
    preloadImages(nextVisibleProducts.map((item) => item.thumb), { limit: INITIAL_PRODUCT_BATCH_SIZE });
    this.setData({
      filteredProducts,
      visibleProducts: nextVisibleProducts
    });
  },

  loadMoreProducts() {
    const { filteredProducts, visibleProducts } = this.data;
    if (visibleProducts.length >= filteredProducts.length) {
      return;
    }
    this.setData({
      visibleProducts: filteredProducts.slice(0, visibleProducts.length + PRODUCT_BATCH_SIZE)
    });
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
    // 自选礼盒：必须进详情页自选搭配
    if (product.productType === "giftbox") {
      this.openProductDetail(product.id);
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
