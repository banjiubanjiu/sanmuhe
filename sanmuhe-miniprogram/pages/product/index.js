const { addToCart } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { isFavorite, toggleFavorite } = require("../../utils/favorites");

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
  return Object.assign({}, product, {
    sold: product.soldStock || product.sold || 0,
    availableStock,
    unit: defaultSpec.label,
    specs,
    hasMultiSpecs: specs.length > 1,
    specLayout: resolveSpecLayout(specs),
    taste,
    tasteExpandable: taste.length > TASTE_CLAMP_CHARS,
    /** 多图：优先 images 数组，旧数据回退单图 */
    images: Array.isArray(product.images) && product.images.length
      ? product.images.filter(Boolean)
      : (product.image ? [product.image] : [])
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

Page({
  data: {
    product: null,
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
    this.loadProduct();
  },

  loadProduct() {
    const productId = this.productId;
    this.setData({ catalogLoading: true, catalogError: false });
    getCatalog().then((catalog) => {
      const products = Array.isArray(catalog.teaProducts) ? catalog.teaProducts : [];
      const nextProduct = products.find((item) => item.id === productId);
      if (nextProduct) {
        const normalized = normalizeProduct(nextProduct);
        const selectedSpec = findSpec(normalized.specs, this.data.selectedSpec) || normalized.specs[0];
        this.setData(Object.assign({
          catalogLoading: false,
          catalogError: false
        }, buildViewState(normalized, selectedSpec.label, isFavorite(normalized.id))));
        return;
      }
      this.setData({
        product: null,
        catalogLoading: false,
        catalogError: catalog.source === "error"
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

  addProduct() {
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
