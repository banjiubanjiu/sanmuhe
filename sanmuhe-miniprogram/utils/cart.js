const LEGACY_CART_KEY = "sanmuhe_cart";
const MIGRATION_KEY = "sanmuhe_cart_scopes_migrated";
const CART_KEYS = {
  retail: "sanmuhe_cart_retail",
  dinein: "sanmuhe_cart_dinein"
};

function normalizeMode(mode, item) {
  if (mode === "dinein" || mode === "retail") {
    return mode;
  }
  return item && item.type === "drink" ? "dinein" : "retail";
}

function migrateLegacyCart() {
  if (wx.getStorageSync(MIGRATION_KEY)) {
    return;
  }
  const legacyCart = wx.getStorageSync(LEGACY_CART_KEY);
  if (Array.isArray(legacyCart) && legacyCart.length) {
    const retailCart = wx.getStorageSync(CART_KEYS.retail);
    const dineinCart = wx.getStorageSync(CART_KEYS.dinein);
    if (!Array.isArray(retailCart) || !retailCart.length) {
      wx.setStorageSync(CART_KEYS.retail, legacyCart.filter((item) => item.type !== "drink"));
    }
    if (!Array.isArray(dineinCart) || !dineinCart.length) {
      wx.setStorageSync(CART_KEYS.dinein, legacyCart.filter((item) => item.type === "drink"));
    }
  }
  wx.setStorageSync(MIGRATION_KEY, true);
}

function getCart(mode = "retail") {
  migrateLegacyCart();
  const cart = wx.getStorageSync(CART_KEYS[normalizeMode(mode)]);
  return Array.isArray(cart) ? cart : [];
}

function setCart(cart, mode = "retail") {
  migrateLegacyCart();
  wx.setStorageSync(CART_KEYS[normalizeMode(mode)], Array.isArray(cart) ? cart : []);
}

function makeKey(item) {
  const options = item.options || {};
  return [
    item.type,
    item.id,
    options.unit || "",
    options.teaChoice || "",
    options.table || ""
  ].join("|");
}

function addToCart(item, mode) {
  const targetMode = normalizeMode(mode, item);
  const cart = getCart(targetMode);
  const key = makeKey(item);
  const index = cart.findIndex((entry) => entry.key === key);
  if (index >= 0) {
    cart[index].quantity += item.quantity || 1;
  } else {
    cart.push(Object.assign({}, item, {
      key,
      quantity: item.quantity || 1
    }));
  }
  setCart(cart, targetMode);
  return cart;
}

function updateQuantity(key, quantity, mode = "retail") {
  const next = getCart(mode)
    .map((entry) => {
      if (entry.key !== key) return entry;
      return Object.assign({}, entry, { quantity });
    })
    .filter((entry) => entry.quantity > 0);
  setCart(next, mode);
  return next;
}

function clearCart(mode = "retail") {
  setCart([], mode);
}

function getTotal(cart) {
  const source = Array.isArray(cart) ? cart : getCart();
  return source.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

module.exports = {
  addToCart,
  clearCart,
  getCart,
  getTotal,
  setCart,
  updateQuantity
};
