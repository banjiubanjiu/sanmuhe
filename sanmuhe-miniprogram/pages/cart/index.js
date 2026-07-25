const { getCart, getTotal, setCart, updateQuantity } = require("../../utils/cart");
const { createOrder, getMemberCenter } = require("../../utils/cloudApi");
const tableUtil = require("../../utils/table");

const SHOP_CATEGORY_KEY = "sanmuhe_shop_category";

function formatFen(fen) {
  return (Math.max(0, Math.round(Number(fen) || 0)) / 100).toFixed(2);
}

function getOptionText(item) {
  const options = item.options || {};
  if (item.type === "drink") {
    return ["大杯", options.temp || "冷饮", options.sugar || "正常糖", options.table ? `桌${options.table}` : ""]
      .filter(Boolean)
      .join(" / ");
  }
  return [options.unit || item.unit || "默认", item.category || "茶品"].filter(Boolean).join(" / ");
}

function enrichCart(cart) {
  return cart.map((item) => Object.assign({}, item, {
    optionText: getOptionText(item),
    lineTotal: Number(item.price || 0) * Number(item.quantity || 1)
  }));
}

function resolveTableNo(cart) {
  const stored = tableUtil.getTableNo();
  if (stored) {
    return stored;
  }
  for (let i = 0; i < (cart || []).length; i += 1) {
    const table = tableUtil.normalizeTable(cart[i].options && cart[i].options.table);
    if (table) {
      tableUtil.setTableNo(table);
      return table;
    }
  }
  return "";
}

Page({
  data: {
    cart: [],
    items: [],
    total: 0,
    count: 0,
    tableNo: "",
    remark: "",
    isMember: false,
    walletBalance: "0.00",
    walletBalanceFen: 0,
    balanceAfter: "0.00",
    balanceAvailable: false,
    payMode: "manual",
    submitting: false
  },

  onShow() {
    this.refresh();
    this.loadMemberPayment();
  },

  refresh() {
    const cart = getCart();
    const items = enrichCart(cart);
    const tableNo = resolveTableNo(cart) || this.data.tableNo || "";
    const total = getTotal(cart);
    const balanceAvailable = this.data.isMember && this.data.walletBalanceFen >= Math.round(total * 100);
    this.setData({
      cart,
      items,
      total,
      count: cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
      tableNo,
      balanceAvailable,
      balanceAfter: formatFen(this.data.walletBalanceFen - Math.round(total * 100)),
      payMode: balanceAvailable ? this.data.payMode : "manual"
    });
  },

  loadMemberPayment() {
    getMemberCenter().then((result) => {
      const isMember = !!(result.member && result.member.isMember);
      const walletBalanceFen = Math.max(0, Number(result.wallet && result.wallet.balanceFen) || 0);
      const balanceAvailable = isMember && walletBalanceFen >= Math.round(Number(this.data.total || 0) * 100);
      this.setData({
        isMember,
        walletBalance: result.wallet && result.wallet.balance || "0.00",
        walletBalanceFen,
        balanceAfter: formatFen(walletBalanceFen - Math.round(Number(this.data.total || 0) * 100)),
        balanceAvailable,
        payMode: balanceAvailable ? "balance" : "manual"
      });
    }).catch(() => {
      this.setData({
        isMember: false,
        walletBalance: "0.00",
        walletBalanceFen: 0,
        balanceAfter: "0.00",
        balanceAvailable: false,
        payMode: "manual"
      });
    });
  },

  choosePayMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === "balance" && !this.data.balanceAvailable) {
      wx.showToast({ title: "会员余额不足", icon: "none" });
      return;
    }
    this.setData({ payMode: mode === "balance" ? "balance" : "manual" });
  },

  decrease(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) - 1);
    this.refresh();
  },

  increase(event) {
    updateQuantity(event.currentTarget.dataset.key, Number(event.currentTarget.dataset.quantity) + 1);
    this.refresh();
  },

  removeItem(event) {
    updateQuantity(event.currentTarget.dataset.key, 0);
    this.refresh();
    wx.showToast({ title: "已移除" });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    this.setData({ [field]: value });
    if (field === "tableNo") {
      const table = tableUtil.normalizeTable(value);
      if (table) {
        tableUtil.setTableNo(table);
      }
    }
  },

  goShop() {
    wx.setStorageSync(SHOP_CATEGORY_KEY, "全部");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/shop/index" });
  },

  submitOrder() {
    const { cart, total, tableNo, remark, payMode, submitting } = this.data;
    if (submitting) {
      return;
    }
    if (!cart.length) {
      wx.showToast({ title: "购物车是空的", icon: "none" });
      return;
    }

    const table = tableUtil.normalizeTable(tableNo) || resolveTableNo(cart);
    if (table) {
      tableUtil.setTableNo(table);
    }
    const note = String(remark || "").trim();
    const payload = {
      items: cart,
      total,
      deliveryMethod: "onsite",
      payMode,
      skipPayment: payMode !== "balance",
      source: "onsite-cart",
      consignee: "到店顾客",
      phone: "现场",
      tableNo: table,
      table: table,
      pickupNote: table ? `桌号 ${table}` : "",
      remark: tableUtil.formatTableRemark(table, note)
    };

    this.setData({ submitting: true });
    createOrder(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "提交失败", icon: "none" });
        this.setData({ submitting: false });
        return;
      }
      setCart([]);
      this.setData({
        cart: [],
        items: [],
        total: 0,
        count: 0,
        // keep tableNo so same table can order again
        tableNo: table || "",
        remark: "",
        submitting: false
      });
      const tableTip = table ? `（${table}）` : "";
      const paidByBalance = result.payMode === "balance" && result.payStatus === "paid";
      wx.showModal({
        title: paidByBalance ? "余额支付成功" : "下单成功",
        content: paidByBalance
          ? `订单 ${result.orderNo || ""} 已从会员余额扣除 ¥${Number(result.total || 0).toFixed(2)}，门店已收到${tableTip}。`
          : `订单 ${result.orderNo || ""} 已通知门店${tableTip}。请到柜台扫码付款。`,
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    }).catch(() => {
      wx.showModal({
        title: "订单未提交",
        content: "当前网络或云服务不可用，请稍后重试。购物车内容已保留。",
        showCancel: false
      });
      this.setData({ submitting: false });
    });
  }
});
