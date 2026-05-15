const { teaProducts } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog } = require("../../utils/cloudApi");

const categories = ["绿茶", "乌龙茶", "红茶", "白茶", "普洱茶", "花茶", "茶具", "茶点"];

function normalizeProducts(products) {
  return products.map((item) => Object.assign({}, item, {
    thumb: item.thumb || item.image
  }));
}

Page({
  data: {
    categories,
    activeCategory: "绿茶",
    products: normalizeProducts(teaProducts),
    filteredProducts: normalizeProducts(teaProducts).filter((item) => item.category === "绿茶"),
    cartCount: 0,
    cartTotal: 0
  },

  onLoad() {
    this.loadCatalog();
  },

  onShow() {
    this.refreshCart();
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
      const products = normalizeProducts(catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts);
      const filteredProducts = products.filter((item) => item.category === this.data.activeCategory);
      this.setData({
        products,
        filteredProducts
      });
    });
  },

  changeCategory(event) {
    const activeCategory = event.currentTarget.dataset.category;
    const filteredProducts = this.data.products.filter((item) => item.category === activeCategory);
    this.setData({ activeCategory, filteredProducts });
  },

  viewProduct(event) {
    wx.navigateTo({
      url: `/pages/product/index?id=${event.currentTarget.dataset.id}`
    });
  },

  addProduct(event) {
    const product = this.data.products.find((item) => item.id === event.currentTarget.dataset.id);
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: product.price,
      color: product.color,
      image: product.thumb || product.image,
      options: {
        unit: product.unit
      }
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goCart() {
    wx.switchTab({ url: "/pages/cart/index" });
  },

  goBack() {
    wx.switchTab({ url: "/pages/index/index" });
  }
});
