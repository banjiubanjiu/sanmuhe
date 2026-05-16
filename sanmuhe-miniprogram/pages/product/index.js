const { teaProducts } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");
const { isFavorite, toggleFavorite } = require("../../utils/favorites");

const specOptions = ["50g", "100g", "250g", "500g"];
const specMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
};

function normalizeProduct(product) {
  const unit = product.unit || "50g";
  const hasWeightSpecs = !!specMultipliers[unit];
  return Object.assign({}, product, {
    sold: product.soldStock || product.sold || 0,
    availableStock: product.availableStock,
    unit,
    hasWeightSpecs
  });
}

Page({
  data: {
    product: null,
    specOptions,
    selectedSpec: "50g",
    quantity: 1,
    displayPrice: 0,
    favored: false
  },

  onLoad(options) {
    const product = normalizeProduct(teaProducts.find((item) => item.id === options.id) || teaProducts[0]);
    this.setData({
      product,
      selectedSpec: product.hasWeightSpecs ? "50g" : product.unit,
      displayPrice: product.price,
      favored: isFavorite(product.id)
    });
    getCatalog().then((catalog) => {
      const products = catalog.fromCloud ? (catalog.teaProducts || []) : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
      const nextProduct = products.find((item) => item.id === options.id);
      if (nextProduct) {
        const normalized = normalizeProduct(nextProduct);
        const selectedSpec = normalized.hasWeightSpecs ? this.data.selectedSpec : normalized.unit;
        this.setData({
          product: normalized,
          selectedSpec,
          displayPrice: this.getPrice(normalized.price, selectedSpec),
          favored: isFavorite(normalized.id)
        });
      } else if (catalog.fromCloud) {
        this.setData({ product: null });
      }
    });
  },

  getPrice(basePrice, spec) {
    if (!specMultipliers[spec]) {
      return Math.round(basePrice);
    }
    return Math.round(basePrice * (specMultipliers[spec] || 1));
  },

  chooseSpec(event) {
    const selectedSpec = event.currentTarget.dataset.spec;
    this.setData({
      selectedSpec,
      displayPrice: this.getPrice(this.data.product.price, selectedSpec)
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
    wx.switchTab({ url: "/pages/cart/index" });
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
