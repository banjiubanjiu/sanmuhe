const { addToCart } = require("../../utils/cart");
const { getCatalog, getCachedCatalog } = require("../../utils/cloudApi");
const { preloadImages, toThumbnailUrl } = require("../../utils/imagePerformance");
const { isFavorite, toggleFavorite } = require("../../utils/favorites");
const { buildShareMessage } = require("../../utils/share");

// 旧版按克重倍率计价（无 specs 时回退）
const legacySpecMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
};

const TASTE_CLAMP_CHARS = 42;

function isShortSpecLabel(text) {
  const value = String(text || "").trim();
  if (!value) {
    return true;
  }
  if (/^\d+(\.\d+)?\s*g$/i.test(value)) {
    return true;
  }
  // 中英文混排按字符数粗判，≤4 视为短标签（如 50g、一泡、小罐）
  return value.length <= 4;
}

function pickPillText(spec) {
  if (isShortSpecLabel(spec.label)) {
    return spec.label;
  }
  if (isShortSpecLabel(spec.weight)) {
    return spec.weight;
  }
  if (isShortSpecLabel(spec.display)) {
    return spec.display;
  }
  return String(spec.label || spec.display || "").slice(0, 4);
}

/** 价格行短单位：优先净含量，避免与规格名重复 */
function pickPriceUnit(spec) {
  const weight = String((spec && spec.weight) || "").trim();
  if (weight) {
    return weight;
  }
  const label = String((spec && spec.label) || "").trim();
  if (isShortSpecLabel(label)) {
    return label;
  }
  // 从标签里抠克重，如 50g/小罐
  const matched = label.match(/(\d+(?:\.\d+)?\s*g)/i);
  if (matched) {
    return matched[1].replace(/\s+/g, "");
  }
  return label;
}

function resolveSpecLayout(specs) {
  if (!specs || specs.length <= 1) {
    return "single";
  }
  // 仅看主标签：不能因 weight 是 50g 就把「纳福礼盒」误判成 pill
  const allShort = specs.every((spec) => isShortSpecLabel(spec.label));
  return allShort ? "pill" : "chip";
}

function normalizeSpecs(product) {
  if (Array.isArray(product.specs) && product.specs.length) {
    return product.specs.map((spec) => {
      const label = String(spec.label || spec.unit || product.unit || "默认").trim();
      const weight = String(spec.weight || "").trim();
      const display = weight && label.indexOf(weight) < 0 ? `${label} · ${weight}` : label;
      const hasStock = spec.stock !== undefined && spec.stock !== null && spec.stock !== "";
      const stock = hasStock ? Math.max(0, Number(spec.stock) || 0) : "";
      const lockedStock = Math.max(0, Number(spec.lockedStock) || 0);
      const soldStock = Math.max(0, Number(spec.soldStock) || 0);
      const availableStock = hasStock
        ? (spec.availableStock !== undefined
          ? Math.max(0, Number(spec.availableStock) || 0)
          : Math.max(0, stock - lockedStock - soldStock))
        : "";
      const item = {
        label,
        weight,
        price: Math.max(0, Number(spec.price) || 0),
        stock,
        availableStock,
        isSoldOut: availableStock !== "" && availableStock <= 0,
        display,
        pillText: "",
        chipTitle: label
      };
      item.pillText = pickPillText(item);
      return item;
    });
  }

  const unit = product.unit || "50g";
  if (legacySpecMultipliers[unit]) {
    return Object.keys(legacySpecMultipliers).map((label) => {
      const price = Math.round((Number(product.price) || 0) * legacySpecMultipliers[label]);
      return {
        label,
        weight: label,
        price,
        stock: "",
        availableStock: "",
        isSoldOut: false,
        display: label,
        pillText: label,
        chipTitle: label
      };
    });
  }

  const price = Math.max(0, Number(product.price) || 0);
  const productAvail = product.availableStock !== undefined
    ? Math.max(0, Number(product.availableStock) || 0)
    : (product.stock !== undefined ? Math.max(0, Number(product.stock) || 0) : "");
  return [{
    label: unit,
    weight: "",
    price,
    stock: productAvail,
    availableStock: productAvail,
    isSoldOut: productAvail !== "" && productAvail <= 0,
    display: unit,
    pillText: unit,
    chipTitle: unit
  }];
}

function normalizeProduct(product) {
  const specs = normalizeSpecs(product);
  const defaultSpec = specs[0];
  const taste = String(product.taste || "").trim();
  const hasSpecStock = specs.some((spec) => spec.availableStock !== "");
  const availableStock = hasSpecStock
    ? specs.reduce((sum, spec) => sum + (spec.availableStock === "" ? 0 : Number(spec.availableStock) || 0), 0)
    : product.availableStock;
  const images = Array.isArray(product.images) && product.images.length
    ? product.images.filter(Boolean)
    : (product.image ? [product.image] : []);
  return Object.assign({}, product, {
    sold: product.soldStock || product.sold || 0,
    availableStock,
    unit: defaultSpec.label,
    specs,
    hasMultiSpecs: specs.length > 1,
    specLayout: resolveSpecLayout(specs),
    taste,
    tasteExpandable: taste.length > TASTE_CLAMP_CHARS,
    /** 多图：详情保留原图，同时提供已在列表预热的小图作即时预览。 */
    images,
    imageSlides: images.map((src) => ({ src, previewSrc: toThumbnailUrl(src, 480) })),
    previewImage: toThumbnailUrl(product.thumb || images[0] || product.image, 480)
  });
}

function findSpec(specs, label) {
  return (specs || []).find((item) => item.label === label) || (specs && specs[0]) || null;
}

function buildContactMeta(product) {
  const id = product && product.id ? String(product.id) : "";
  const name = product && product.name ? String(product.name) : "茶品";
  const img = (product && (product.thumb || product.image)) || "/assets/images/contact-qr.jpg";
  return {
    contactSessionFrom: id ? `product:${id}` : "product-detail",
    contactMessageTitle: name.slice(0, 20),
    contactMessagePath: id ? `pages/product/index?id=${encodeURIComponent(id)}` : "pages/product/index",
    contactMessageImg: img
  };
}

function buildViewState(product, selectedSpecLabel, favored) {
  const selected = findSpec(product.specs, selectedSpecLabel) || product.specs[0];
  const avail = selected.availableStock;
  const isSoldOut = selected.isSoldOut || (avail !== "" && avail <= 0);
  const stockHint = isSoldOut
    ? "该规格已售罄"
    : (avail !== "" && avail <= 10 ? `仅余 ${avail} 件` : "");
  return Object.assign({
    product,
    selectedSpec: selected.label,
    selectedSpecDisplay: selected.display,
    priceUnit: pickPriceUnit(selected),
    displayPrice: selected.price,
    selectedSoldOut: isSoldOut,
    selectedStockHint: stockHint,
    favored: !!favored,
    tasteExpanded: false
  }, buildContactMeta(product));
}

/** 自选礼盒视图状态：茶池 + 已选槽位 + 实时价格 */
function buildGiftBoxViewState(plan, favored) {
  const selection = plan.selection || {};
  const mode = selection.mode === "double" ? "double" : "single";
  const minTypes = Math.max(1, Number(selection.minTypes) || (mode === "double" ? 2 : 1));
  const maxTypes = Math.max(minTypes, Number(selection.maxTypes) || minTypes);
  const brewsPerType = Math.max(1, Number(selection.brewsPerType) || 1);
  const wholeBox = plan.priceMode === "whole_box";
  const boxFeeFen = wholeBox ? 0 : Math.max(0, Number(plan.boxFeeFen) || 0);
  const pool = (Array.isArray(plan.pool) ? plan.pool : []).map((tea) => ({
    teaId: tea.teaId,
    name: tea.name,
    image: tea.image || "",
    priceFen: Math.max(0, Number(tea.priceFen) || 0),
    picked: 0
  }));
  const images = Array.isArray(plan.images) && plan.images.length
    ? plan.images.filter(Boolean)
    : (plan.image ? [plan.image] : []);
  const prices = pool.map((t) => t.priceFen).filter((p) => p > 0);
  const minPriceFen = wholeBox
    ? (prices.length ? Math.min(...prices) : 0)
    : (prices.length ? Math.min(...prices) : 0) * brewsPerType * minTypes + boxFeeFen;
  const availableStock = Math.max(0, (Number(plan.stock) || 0) - (Number(plan.lockedStock) || 0) - (Number(plan.soldStock) || 0));
  const giftBox = {
    id: plan.id,
    name: plan.name,
    description: plan.description || "",
    images,
    image: images[0] || plan.image || "",
    priceMode: plan.priceMode,
    wholeBox,
    boxFeeFen,
    mode,
    minTypes,
    maxTypes,
    brewsPerType,
    allowDuplicate: selection.allowDuplicate === true,
    note: selection.note || "",
    availableStock,
    pool,
    totalFen: minPriceFen,
    totalPicked: 0,
    filled: false
  };
  const imageSlides = images.map((src) => ({ src, previewSrc: toThumbnailUrl(src, 480) }));
  return Object.assign({
    product: Object.assign({}, plan, {
      images,
      imageSlides,
      image: images[0] || plan.image || "",
      previewImage: toThumbnailUrl(plan.thumb || images[0] || plan.image, 480),
      sold: plan.soldStock || 0,
      origin: "",
      taste: plan.description || "",
      tasteExpandable: false
    }),
    giftBox,
    selectedSpec: "",
    selectedSpecDisplay: "",
    priceUnit: "盒",
    displayPrice: minPriceFen / 100,
    selectedSoldOut: availableStock <= 0,
    selectedStockHint: availableStock <= 0 ? "礼盒已售罄" : "",
    favored: !!favored,
    tasteExpanded: false
  }, buildContactMeta(plan));
}

/** 重算礼盒：总价 / 已选槽位数 / 是否满足最少款数 */
function recomputeGiftBox(giftBox) {
  const totalPicked = giftBox.pool.reduce((sum, tea) => sum + tea.picked, 0);
  let totalFen = 0;
  giftBox.pool.forEach((tea) => {
    if (tea.picked > 0) {
      totalFen += giftBox.wholeBox
        ? tea.priceFen * tea.picked
        : tea.priceFen * giftBox.brewsPerType * tea.picked;
    }
  });
  if (!giftBox.wholeBox) {
    totalFen += giftBox.boxFeeFen;
  }
  return {
    totalFen,
    totalPicked,
    filled: totalPicked >= giftBox.minTypes && totalPicked <= giftBox.maxTypes
  };
}

Page({
  data: {
    product: null,
    giftBox: null,
    catalogLoading: true,
    catalogError: false,
    selectedSpec: "",
    selectedSpecDisplay: "",
    priceUnit: "",
    quantity: 1,
    displayPrice: 0,
    selectedSoldOut: false,
    selectedStockHint: "",
    favored: false,
    tasteExpanded: false,
    contactSessionFrom: "product-detail",
    contactMessageTitle: "茶品咨询",
    contactMessagePath: "pages/product/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  },

  onLoad(options) {
    this.productId = options && options.id;
    const cachedCatalog = getCachedCatalog();
    if (cachedCatalog) {
      this.applyProductCatalog(cachedCatalog);
    }
    this.loadProduct();
  },

  onShareAppMessage() {
    const product = this.data.product || {};
    const productId = product.id || this.productId || "";
    const images = Array.isArray(product.images) ? product.images : [];
    return buildShareMessage({
      title: product.name ? `${product.name}｜禾煦甄选` : "禾煦甄选好茶",
      path: productId
        ? `/pages/product/index?id=${encodeURIComponent(productId)}`
        : "/pages/shop/index",
      imageUrl: product.image || images[0] || product.previewImage || ""
    });
  },

  applyProductCatalog(catalog) {
    const productId = this.productId;
    const products = Array.isArray(catalog && catalog.teaProducts) ? catalog.teaProducts : [];
    const nextProduct = products.find((item) => item.id === productId);
    if (nextProduct) {
      const normalized = normalizeProduct(nextProduct);
      const selectedSpec = findSpec(normalized.specs, this.data.selectedSpec) || normalized.specs[0];
      preloadImages([normalized.previewImage], { limit: 1 });
      this.setData(Object.assign({
        catalogLoading: false,
        catalogError: false,
        giftBox: null
      }, buildViewState(normalized, selectedSpec.label, isFavorite(normalized.id))));
      return true;
    }
    // 自选礼盒
    const giftPlans = Array.isArray(catalog && catalog.giftBoxes) ? catalog.giftBoxes : [];
    const nextPlan = giftPlans.find((item) => item.id === productId);
    if (nextPlan) {
      const viewState = buildGiftBoxViewState(nextPlan, isFavorite(nextPlan.id));
      preloadImages([viewState.product.previewImage], { limit: 1 });
      this.setData(Object.assign({
        catalogLoading: false,
        catalogError: false
      }, viewState));
      return true;
    }
    return false;
  },

  loadProduct() {
    if (!this.data.product) {
      this.setData({ catalogLoading: true, catalogError: false });
    }
    getCatalog().then((catalog) => {
      if (this.applyProductCatalog(catalog)) {
        return;
      }
      // 弱网刷新失败时保留已显示的缓存内容，不让详情页重新闪空。
      if (this.data.product && catalog && catalog.source === "error") {
        this.setData({ catalogLoading: false });
        return;
      }
      this.setData({
        product: null,
        giftBox: null,
        catalogLoading: false,
        catalogError: !!(catalog && catalog.source === "error")
      });
    }).catch(() => {
      this.setData({
        catalogLoading: false,
        catalogError: !this.data.product
      });
    });
  },

  chooseSpec(event) {
    const selectedSpec = event.currentTarget.dataset.spec;
    const matched = findSpec(this.data.product.specs, selectedSpec);
    if (!matched) {
      return;
    }
    const next = buildViewState(this.data.product, matched.label, this.data.favored);
    this.setData({
      selectedSpec: next.selectedSpec,
      selectedSpecDisplay: next.selectedSpecDisplay,
      priceUnit: next.priceUnit,
      displayPrice: next.displayPrice,
      selectedSoldOut: next.selectedSoldOut,
      selectedStockHint: next.selectedStockHint
    });
  },

  toggleTaste() {
    if (!this.data.product || !this.data.product.tasteExpandable) {
      return;
    }
    this.setData({ tasteExpanded: !this.data.tasteExpanded });
  },

  changeQuantity(event) {
    const next = this.data.quantity + Number(event.currentTarget.dataset.step);
    this.setData({ quantity: Math.max(1, Math.min(99, next)) });
  },

  /** 礼盒自选：茶池 +/- 槽位 */
  toggleGiftTea(event) {
    const giftBox = this.data.giftBox;
    if (!giftBox) {
      return;
    }
    const teaId = event.currentTarget.dataset.teaId;
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    const pool = giftBox.pool.map((tea) => Object.assign({}, tea));
    const tea = pool.find((item) => item.teaId === teaId);
    if (!tea) {
      return;
    }
    const totalPicked = pool.reduce((sum, item) => sum + item.picked, 0);
    if (delta > 0) {
      if (totalPicked >= giftBox.maxTypes) {
        wx.showToast({ title: `最多选 ${giftBox.maxTypes} 款`, icon: "none" });
        return;
      }
      if (!giftBox.allowDuplicate && tea.picked >= 1) {
        wx.showToast({ title: "同一茶品只可选一次", icon: "none" });
        return;
      }
      tea.picked += 1;
    } else {
      tea.picked = Math.max(0, tea.picked - 1);
    }
    const calc = recomputeGiftBox(Object.assign({}, giftBox, { pool }));
    this.setData({
      "giftBox.pool": pool,
      "giftBox.totalFen": calc.totalFen,
      "giftBox.totalPicked": calc.totalPicked,
      "giftBox.filled": calc.filled,
      displayPrice: calc.totalFen / 100
    });
  },

  /** 礼盒加购：校验已选满 → 携带自选明细 */
  addGiftBoxToCart() {
    const giftBox = this.data.giftBox;
    if (!giftBox) {
      return;
    }
    if (giftBox.availableStock <= 0) {
      wx.showToast({ title: "礼盒已售罄", icon: "none" });
      return;
    }
    if (!giftBox.filled) {
      wx.showToast({ title: `请选择 ${giftBox.minTypes} 款茶品`, icon: "none" });
      return;
    }
    const picked = giftBox.pool.filter((tea) => tea.picked > 0);
    const giftSelection = picked.map((tea) => ({
      teaId: tea.teaId,
      name: tea.name,
      brews: giftBox.brewsPerType,
      count: tea.picked,
      priceFen: tea.priceFen
    }));
    addToCart({
      id: giftBox.id,
      type: "giftbox",
      name: giftBox.name,
      price: giftBox.totalFen / 100,
      image: giftBox.image,
      category: "礼盒",
      quantity: this.data.quantity,
      options: {
        unit: "盒",
        giftSelection
      }
    });
    wx.showToast({ title: "已加入" });
  },

  addProduct() {
    if (this.data.giftBox) {
      this.addGiftBoxToCart();
      return;
    }
    const { product, selectedSpec, quantity, displayPrice, selectedSoldOut } = this.data;
    if (!product) {
      return;
    }
    if (selectedSoldOut) {
      wx.showToast({ title: "该规格已售罄", icon: "none" });
      return;
    }
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: displayPrice,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      quantity,
      options: {
        unit: selectedSpec
      }
    });
    wx.showToast({ title: "已加入" });
  },

  buyNow() {
    this.addProduct();
    wx.navigateTo({ url: "/pages/cart/index" });
  },

  handleContact(event) {
    const detail = (event && event.detail) || {};
    if (!detail.path) {
      return;
    }
    const path = detail.path.startsWith("/") ? detail.path : `/${detail.path}`;
    const query = detail.query || {};
    const qs = Object.keys(query)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
      .join("&");
    const url = qs ? `${path}${path.indexOf("?") >= 0 ? "&" : "?"}${qs}` : path;
    wx.navigateTo({ url, fail: () => {} });
  },

  toggleFavorite() {
    const result = toggleFavorite(this.data.product);
    this.setData({ favored: result.favored });
    wx.showToast({ title: result.favored ? "已收藏" : "已取消" });
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
