const { teaProducts } = require("../../data/catalog");
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
      const item = {
        label,
        weight,
        price: Math.max(0, Number(spec.price) || 0),
        stockUnits: Math.max(1, Number(spec.stockUnits) || 1),
        display,
        pillText: "",
        // 规格区只展示名称，价格/克数只出现在主价格行
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
        stockUnits: legacySpecMultipliers[label],
        display: label,
        pillText: label,
        chipTitle: label
      };
    });
  }

  const price = Math.max(0, Number(product.price) || 0);
  return [{
    label: unit,
    weight: "",
    price,
    stockUnits: 1,
    display: unit,
    pillText: unit,
    chipTitle: unit
  }];
}

function normalizeProduct(product) {
  const specs = normalizeSpecs(product);
  const defaultSpec = specs[0];
  const taste = String(product.taste || "").trim();
  return Object.assign({}, product, {
    sold: product.soldStock || product.sold || 0,
    availableStock: product.availableStock,
    unit: defaultSpec.label,
    specs,
    hasMultiSpecs: specs.length > 1,
    specLayout: resolveSpecLayout(specs),
    taste,
    tasteExpandable: taste.length > TASTE_CLAMP_CHARS,
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
  return Object.assign({
    product,
    selectedSpec: selected.label,
    selectedSpecDisplay: selected.display,
    priceUnit: pickPriceUnit(selected),
    displayPrice: selected.price,
    favored: !!favored,
    tasteExpanded: false
  }, buildContactMeta(product));
}

Page({
  data: {
    product: null,
    selectedSpec: "",
    selectedSpecDisplay: "",
    priceUnit: "",
    quantity: 1,
    displayPrice: 0,
    favored: false,
    tasteExpanded: false,
    contactSessionFrom: "product-detail",
    contactMessageTitle: "茶品咨询",
    contactMessagePath: "pages/product/index",
    contactMessageImg: "/assets/images/contact-qr.jpg"
  },

  onLoad(options) {
    const product = normalizeProduct(teaProducts.find((item) => item.id === options.id) || teaProducts[0]);
    this.setData(buildViewState(product, product.specs[0].label, isFavorite(product.id)));
    getCatalog().then((catalog) => {
      const products = catalog.fromCloud
        ? (catalog.teaProducts || [])
        : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
      const nextProduct = products.find((item) => item.id === options.id);
      if (nextProduct) {
        const normalized = normalizeProduct(nextProduct);
        const selectedSpec = findSpec(normalized.specs, this.data.selectedSpec) || normalized.specs[0];
        this.setData(buildViewState(normalized, selectedSpec.label, isFavorite(normalized.id)));
      } else if (catalog.fromCloud) {
        this.setData({ product: null });
      }
    });
  },

  chooseSpec(event) {
    const selectedSpec = event.currentTarget.dataset.spec;
    const matched = findSpec(this.data.product.specs, selectedSpec);
    if (!matched) {
      return;
    }
    this.setData({
      selectedSpec: matched.label,
      selectedSpecDisplay: matched.display,
      priceUnit: pickPriceUnit(matched),
      displayPrice: matched.price
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
    const { product, selectedSpec, quantity, displayPrice } = this.data;
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
