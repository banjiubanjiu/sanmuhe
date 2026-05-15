const { teaProducts } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");

const specOptions = ["50g", "100g", "250g", "500g"];
const specMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
};

function normalizeProduct(product) {
  return Object.assign({}, product, {
    sold: product.sold || 1286
  });
}

Page({
  data: {
    product: null,
    specOptions,
    selectedSpec: "50g",
    quantity: 1,
    displayPrice: 0
  },

  onLoad(options) {
    const product = normalizeProduct(teaProducts.find((item) => item.id === options.id) || teaProducts[0]);
    this.setData({ product, displayPrice: product.price });
    getCatalog().then((catalog) => {
      const products = catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts;
      const nextProduct = products.find((item) => item.id === options.id);
      if (nextProduct) {
        const normalized = normalizeProduct(nextProduct);
        this.setData({
          product: normalized,
          displayPrice: this.getPrice(normalized.price, this.data.selectedSpec)
        });
      }
    });
  },

  getPrice(basePrice, spec) {
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

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/index/index" });
  }
});
