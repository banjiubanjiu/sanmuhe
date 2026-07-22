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

function normalizeSpecs(product) {
  if (Array.isArray(product.specs) && product.specs.length) {
    return product.specs.map((spec) => ({
      label: String(spec.label || spec.unit || product.unit || "默认").trim(),
      weight: String(spec.weight || "").trim(),
      price: Math.max(0, Number(spec.price) || 0),
      stockUnits: Math.max(1, Number(spec.stockUnits) || 1),
      display: (() => {
        const label = String(spec.label || spec.unit || product.unit || "默认").trim();
        const weight = String(spec.weight || "").trim();
        if (weight && label.indexOf(weight) < 0) {
          return `${label} · ${weight}`;
        }
        return label;
      })()
    }));
  }

  const unit = product.unit || "50g";
  if (legacySpecMultipliers[unit]) {
    return Object.keys(legacySpecMultipliers).map((label) => ({
      label,
      weight: label,
      price: Math.round((Number(product.price) || 0) * legacySpecMultipliers[label]),
      stockUnits: legacySpecMultipliers[label],
      display: label
    }));
  }

  return [{
    label: unit,
    weight: "",
    price: Math.max(0, Number(product.price) || 0),
    stockUnits: 1,
    display: unit
  }];
}

function normalizeProduct(product) {
  const specs = normalizeSpecs(product);
  const defaultSpec = specs[0];
  return Object.assign({}, product, {
    sold: product.soldStock || product.sold || 0,
    availableStock: product.availableStock,
    unit: defaultSpec.label,
    specs,
    hasMultiSpecs: specs.length > 1
  });
}

function findSpec(specs, label) {
  return (specs || []).find((item) => item.label === label) || (specs && specs[0]) || null;
}

Page({
  data: {
    product: null,
    selectedSpec: "",
    selectedSpecDisplay: "",
    quantity: 1,
    displayPrice: 0,
    favored: false
  },

  onLoad(options) {
    const product = normalizeProduct(teaProducts.find((item) => item.id === options.id) || teaProducts[0]);
    const selected = product.specs[0];
    this.setData({
      product,
      selectedSpec: selected.label,
      selectedSpecDisplay: selected.display,
      displayPrice: selected.price,
      favored: isFavorite(product.id)
    });
    getCatalog().then((catalog) => {
      const products = catalog.fromCloud ? (catalog.teaProducts || []) : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
      const nextProduct = products.find((item) => item.id === options.id);
      if (nextProduct) {
        const normalized = normalizeProduct(nextProduct);
        const selectedSpec = findSpec(normalized.specs, this.data.selectedSpec) || normalized.specs[0];
        this.setData({
          product: normalized,
          selectedSpec: selectedSpec.label,
          selectedSpecDisplay: selectedSpec.display,
          displayPrice: selectedSpec.price,
          favored: isFavorite(normalized.id)
        });
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
      displayPrice: matched.price
    });
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

  contactService() {
    wx.navigateTo({ url: "/pages/contact/index" });
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
