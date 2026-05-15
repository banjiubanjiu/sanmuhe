const { addToCart, getCart, getTotal, setCart, updateQuantity } = require("../../utils/cart");
const { createOrder, payOrder } = require("../../utils/cloudApi");
const { teaProducts } = require("../../data/catalog");

const deliveryMethods = [
  { value: "pickup", label: "到店自提", hint: "门店确认后自提" },
  { value: "shipping", label: "快递配送", hint: "填写收货地址" }
];
const CONTACT_KEY = "sanmuhe_contact";
const SHOP_CATEGORY_KEY = "sanmuhe_shop_category";

function getOptionText(item) {
  const options = item.options || {};
  if (item.type === "drink") {
    return ["大杯", options.temp || "冷饮", options.sugar || "正常糖"].filter(Boolean).join(" / ");
  }
  return [options.unit || item.unit || "50g", item.category || "茶品"].filter(Boolean).join(" / ");
}

function getItemTag(item) {
  if (item.type === "drink") {
    return "现制茶饮";
  }
  return item.category || item.badge || "精选";
}

function enrichCart(cart, selectedKeys) {
  return cart.map((item) => Object.assign({}, item, {
    selected: selectedKeys.indexOf(item.key) >= 0,
    optionText: getOptionText(item),
    tagText: getItemTag(item),
    lineTotal: Number(item.price || 0) * Number(item.quantity || 1)
  }));
}

function buildRecommendations(cart) {
  const cartIds = cart.map((item) => item.id);
  const preferredIds = ["tea-001", "tea-013", "tea-003", "tea-014"];
  const candidates = teaProducts
    .filter((item) => cartIds.indexOf(item.id) < 0)
    .filter((item) => ["绿茶", "白茶", "花茶", "茶具"].indexOf(item.category) >= 0)
    .sort((a, b) => {
      const aIndex = preferredIds.indexOf(a.id);
      const bIndex = preferredIds.indexOf(b.id);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    })
    .slice(0, 4);
  return candidates
    .map((item) => Object.assign({}, item, {
      displayImage: item.thumb || item.image
    }));
}

Page({
  data: {
    deliveryMethods,
    deliveryMethod: "pickup",
    cart: [],
    total: 0,
    selectedTotal: 0,
    selectedCount: 0,
    allSelected: true,
    selectedKeys: [],
    selectionInitialized: false,
    teaItems: [],
    drinkItems: [],
    recommendations: [],
    editing: false,
    remark: "",
    consignee: "",
    phone: "",
    address: "",
    submitting: false
  },

  onLoad() {
    this.loadContact();
  },

  onShow() {
    this.refresh();
    this.loadContact();
  },

  refresh() {
    const cart = getCart();
    const cartKeys = cart.map((item) => item.key);
    const selectedKeys = this.data.selectionInitialized
      ? this.data.selectedKeys.filter((key) => cartKeys.indexOf(key) >= 0)
      : cartKeys;
    const enriched = enrichCart(cart, selectedKeys);
    const selectedItems = enriched.filter((item) => item.selected);
    const selectedTotal = getTotal(selectedItems);
    const selectedCount = selectedItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    this.setData({
      cart,
      total: getTotal(cart),
      selectedKeys,
      selectionInitialized: true,
      selectedTotal,
      selectedCount,
      allSelected: cart.length > 0 && selectedKeys.length === cart.length,
      teaItems: enriched.filter((item) => item.type !== "drink"),
      drinkItems: enriched.filter((item) => item.type === "drink"),
      recommendations: buildRecommendations(cart)
    });
  },

  loadContact() {
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    const next = {};
    if (!this.data.consignee && contact.consignee) {
      next.consignee = contact.consignee;
    }
    if (!this.data.phone && contact.phone) {
      next.phone = contact.phone;
    }
    if (!this.data.address && contact.address) {
      next.address = contact.address;
    }
    if (Object.keys(next).length) {
      this.setData(next);
    }
  },

  saveContact(extra = {}) {
    const contact = Object.assign({}, wx.getStorageSync(CONTACT_KEY) || {}, {
      consignee: this.data.consignee,
      phone: this.data.phone,
      address: this.data.address
    }, extra);
    wx.setStorageSync(CONTACT_KEY, contact);
  },

  decrease(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) - 1);
    this.refresh();
  },

  increase(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) + 1);
    this.refresh();
  },

  toggleSelect(event) {
    const key = event.currentTarget.dataset.key;
    const selectedKeys = this.data.selectedKeys.indexOf(key) >= 0
      ? this.data.selectedKeys.filter((item) => item !== key)
      : this.data.selectedKeys.concat(key);
    this.setData({ selectedKeys, selectionInitialized: true }, () => this.refresh());
  },

  toggleAll() {
    const selectedKeys = this.data.allSelected ? [] : this.data.cart.map((item) => item.key);
    this.setData({ selectedKeys, selectionInitialized: true }, () => this.refresh());
  },

  toggleEdit() {
    this.setData({ editing: !this.data.editing });
  },

  removeItem(event) {
    updateQuantity(event.currentTarget.dataset.key, 0);
    this.refresh();
    wx.showToast({ title: "已移除" });
  },

  addRecommended(event) {
    const product = this.data.recommendations.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    const nextCart = addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: product.price,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      options: {
        unit: product.unit
      }
    });
    const added = nextCart.find((item) => item.id === product.id && item.type === "tea");
    this.setData({
      selectedKeys: added && this.data.selectedKeys.indexOf(added.key) < 0
        ? this.data.selectedKeys.concat(added.key)
        : this.data.selectedKeys,
      selectionInitialized: true
    }, () => this.refresh());
    wx.showToast({ title: "已加入" });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value }, () => {
      if (["consignee", "phone", "address"].indexOf(field) >= 0) {
        this.saveContact();
      }
    });
  },

  chooseDelivery(event) {
    this.setData({ deliveryMethod: event.currentTarget.dataset.value });
  },

  goOrder() {
    wx.setStorageSync(SHOP_CATEGORY_KEY, "全部");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index" });
  },

  chooseAddress() {
    wx.chooseAddress({
      success: (res) => {
        const address = `${res.provinceName || ""}${res.cityName || ""}${res.countyName || ""}${res.detailInfo || ""}`;
        this.setData({
          consignee: res.userName || "",
          phone: res.telNumber || "",
          address
        }, () => this.saveContact({ address }));
      },
      fail: () => {
        wx.showToast({ title: "未选择地址", icon: "none" });
      }
    });
  },

  submitOrder() {
    const { cart, selectedKeys, selectedTotal, deliveryMethod, consignee, phone, address, remark, submitting } = this.data;
    const selectedCart = cart.filter((item) => selectedKeys.indexOf(item.key) >= 0);
    if (submitting) {
      return;
    }
    if (!selectedCart.length) {
      wx.showToast({ title: "请选择要结算的商品", icon: "none" });
      return;
    }

    if (!consignee || !phone) {
      wx.showToast({ title: "请填写联系人和手机号", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(String(phone).trim())) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }

    if (deliveryMethod === "shipping" && !address) {
      wx.showToast({ title: "请填写收货地址", icon: "none" });
      return;
    }

    const payload = {
      items: selectedCart,
      total: selectedTotal,
      deliveryMethod,
      consignee,
      phone,
      address,
      remark
    };

    this.saveContact();
    this.setData({ submitting: true });
    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        this.setData({ submitting: false });
        return;
      }
      setCart(cart.filter((item) => selectedKeys.indexOf(item.key) < 0));
      this.setData({ selectedKeys: [], selectionInitialized: false });
      this.refresh();
      payOrder({
        _id: result.id,
        orderNo: result.orderNo
      }).then(() => {
        wx.showModal({
          title: "支付已提交",
          content: "订单支付结果以后端回调为准，可在我的页面查看最新状态。",
          showCancel: false,
          success: () => wx.switchTab({ url: "/pages/profile/index" })
        });
      }).catch((error) => {
        const message = error && error.errMsg && error.errMsg.indexOf("cancel") >= 0
          ? "订单已保留为待支付，可在我的页面继续支付。"
          : (error.message || "订单已生成，但暂未完成支付，可在我的页面继续处理。");
        wx.showModal({
          title: "待支付订单已生成",
          content: message,
          showCancel: false,
          success: () => wx.switchTab({ url: "/pages/profile/index" })
        });
      }).finally(() => {
        this.setData({ submitting: false });
      });
    }).catch(() => {
      wx.showModal({
        title: "订单未提交",
        content: "当前网络或云服务不可用，请稍后重试。购物车内容已保留。",
        showCancel: false,
      });
      this.setData({ submitting: false });
    });
  }
});
