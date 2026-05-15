const CART_KEY = "sanmuhe_cart";

function getCart() {
  return wx.getStorageSync(CART_KEY) || [];
}

function setCart(cart) {
  wx.setStorageSync(CART_KEY, cart);
}

function makeKey(item) {
  const options = item.options || {};
  return [
    item.type,
    item.id,
    options.unit || "",
    options.temp || "",
    options.sugar || "",
    options.table || ""
  ].join("|");
}

function addToCart(item) {
  const cart = getCart();
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
  setCart(cart);
  return cart;
}

function updateQuantity(key, quantity) {
  const next = getCart()
    .map((entry) => {
      if (entry.key !== key) return entry;
      return Object.assign({}, entry, { quantity });
    })
    .filter((entry) => entry.quantity > 0);
  setCart(next);
  return next;
}

function clearCart() {
  setCart([]);
}

function getTotal(cart = getCart()) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

module.exports = {
  addToCart,
  clearCart,
  getCart,
  getTotal,
  setCart,
  updateQuantity
};
