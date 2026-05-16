const { listMyRecords } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const defaultUser = {
  name: "木木",
  title: "禾熙雅客 · 茶生活会员",
  avatar: "/assets/images/profile-avatar.jpg"
};

const defaultMember = {
  tier: "雅客会员",
  points: 0,
  coupons: 0,
  orders: 0
};

const orderShortcutBase = [
  { key: "all", label: "全部订单", icon: "/assets/icons/profile-order.png" },
  { key: "pending", label: "待付款", icon: "/assets/icons/profile-wallet.png" },
  { key: "usable", label: "待使用", icon: "/assets/icons/profile-clock.png" },
  { key: "afterSale", label: "退款/售后", icon: "/assets/icons/profile-refund.png" }
];

const serviceItems = [
  { label: "茶室预约", icon: "/assets/icons/profile-room.png", action: "reservation" },
  { label: "活动报名", icon: "/assets/icons/profile-calendar.png", action: "events" },
  { label: "收货地址", icon: "/assets/icons/profile-pin.png", action: "address" },
  { label: "优惠券", icon: "/assets/icons/profile-coupon.png", action: "coupon" },
  { label: "联系客服", icon: "/assets/icons/profile-headset.png", action: "service" },
  { label: "设置", icon: "/assets/icons/profile-setting.png", action: "status" }
];

function normalizeRecords(records, type) {
  return (records || []).map((item, index) => {
    const fallback = `${type}-${index}`;
    const id = item.id || item.orderNo || item._id || fallback;
    return Object.assign({}, item, {
      id,
      displayId: item.orderNo || id,
      deliveryText: item.deliveryMethod === "shipping" ? "快递" : "自提",
      canPay: item.status === "待支付" || item.payStatus === "pending",
      dateText: item.day && item.time ? `${item.day} ${item.time}` : (item.date && item.time ? `${item.date} ${item.time}` : ""),
      recordMeta: item.day && item.time ? `${item.day} ${item.time}` : (item.date && item.time ? `${item.date} ${item.time}` : (item.place || "待确认")),
      image: item.image || (type === "reservation" ? "/assets/images/reservation-hero.jpg" : "/assets/images/event-yangxin-tea.jpg")
    });
  });
}

function buildOrderShortcuts(orders) {
  return orderShortcutBase.map((item) => {
    let count = 0;
    if (item.key === "all") {
      count = orders.length;
    } else if (item.key === "pending") {
      count = orders.filter((order) => order.status === "待支付" || order.payStatus === "pending").length;
    } else if (item.key === "usable") {
      count = orders.filter((order) => ["待发货", "待自提", "已发货", "待确认"].includes(order.status)).length;
    } else if (item.key === "afterSale") {
      count = orders.filter((order) => /退款|售后|取消|异常/.test(String(order.status || ""))).length;
    }
    return Object.assign({}, item, { count });
  });
}

function getRecentReservation(reservations) {
  const item = reservations[0];
  if (!item) {
    return null;
  }
  return {
    id: item.id,
    room: item.room || "茶室预约",
    dateText: item.day && item.time ? `${item.day} ${item.time}` : item.dateText,
    people: item.people || 2,
    status: item.status || "待确认",
    image: item.image || "/assets/images/reservation-hero.jpg"
  };
}

function getRecentSignup(signups) {
  const item = signups[0];
  if (!item) {
    return null;
  }
  return {
    id: item.id,
    title: item.title || "活动报名",
    dateText: item.date && item.time ? `${item.date} ${item.time}` : item.dateText,
    place: item.place || "禾熙",
    status: item.status || "待确认",
    image: item.image || "/assets/images/event-yangxin-tea.jpg"
  };
}

function getRecentOrders(orders) {
  return orders.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.displayId || item.orderNo || "订单",
    total: item.total || 0,
    status: item.status || "待支付",
    meta: (item.items || []).map((line) => `${line.name} x${line.quantity}`).join("，") || item.deliveryText || ""
  }));
}

function getUsableCouponCount(coupons) {
  return (coupons || []).filter((item) => item.status === "可使用").length;
}

Page({
  data: {
    user: defaultUser,
    member: defaultMember,
    orderShortcuts: buildOrderShortcuts([]),
    services: serviceItems,
    orders: [],
    reservations: [],
    signups: [],
    recentOrders: [],
    recentReservation: null,
    recentSignup: null,
    shippingAddress: ""
  },

  onShow() {
    syncTabBar(this);
    this.loadRecords();
  },

  loadRecords() {
    listMyRecords().then((records) => {
      const orders = normalizeRecords(records.orders, "order");
      const reservations = normalizeRecords(records.reservations, "reservation");
      const signups = normalizeRecords(records.signups, "signup");
      this.setData({
        orders,
        reservations,
        signups,
        member: Object.assign({}, defaultMember, {
          tier: records.member && records.member.tier || defaultMember.tier,
          points: records.member && records.member.points !== undefined ? records.member.points : defaultMember.points,
          orders: orders.length,
          coupons: Array.isArray(records.coupons) ? getUsableCouponCount(records.coupons) : defaultMember.coupons
        }),
        orderShortcuts: buildOrderShortcuts(orders),
        recentOrders: getRecentOrders(orders),
        recentReservation: getRecentReservation(reservations),
        recentSignup: getRecentSignup(signups)
      });
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  goCloudStatus() {
    wx.navigateTo({ url: "/pages/cloud-status/index" });
  },

  handleOrderShortcut(event) {
    const key = event.currentTarget.dataset.key;
    const orders = this.data.orders;
    const filtered = orders.filter((order) => {
      if (key === "pending") {
        return order.status === "待支付" || order.payStatus === "pending";
      }
      if (key === "usable") {
        return ["待发货", "待自提", "已发货", "待确认"].includes(order.status);
      }
      if (key === "afterSale") {
        return /退款|售后|取消|异常/.test(String(order.status || ""));
      }
      return true;
    });
    if (!filtered.length) {
      wx.showToast({ title: "暂无相关订单", icon: "none" });
      return;
    }
    const latest = filtered[0];
    wx.showModal({
      title: latest.displayId || "订单记录",
      content: `${latest.status || "待处理"}｜¥${latest.total || 0}\n${(latest.items || []).map((item) => `${item.name} x${item.quantity}`).join("，") || "订单明细以后台为准"}`,
      showCancel: false
    });
  },

  viewOrderRecord(event) {
    const id = event.currentTarget.dataset.id;
    const order = this.data.orders.find((item) => item.id === id || item.displayId === id || item.orderNo === id);
    if (!order) {
      wx.showToast({ title: "订单记录已更新", icon: "none" });
      this.loadRecords();
      return;
    }
    wx.showModal({
      title: order.displayId || "订单记录",
      content: `${order.status || "待处理"}｜¥${order.total || 0}\n${(order.items || []).map((item) => `${item.name} x${item.quantity}`).join("，") || "订单明细以后台为准"}`,
      showCancel: false
    });
  },

  handleService(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "reservation") {
      wx.navigateTo({ url: "/pages/reservation/index" });
      return;
    }
    if (action === "events") {
      wx.switchTab({ url: "/pages/events/index" });
      return;
    }
    if (action === "address") {
      this.chooseAddress();
      return;
    }
    if (action === "coupon") {
      wx.showToast({ title: this.data.member.coupons ? `${this.data.member.coupons} 张可用优惠券` : "暂无可用优惠券", icon: "none" });
      return;
    }
    if (action === "service") {
      wx.navigateTo({ url: "/pages/contact/index" });
      return;
    }
    if (action === "status") {
      wx.navigateTo({ url: "/pages/cloud-status/index" });
      return;
    }
    this.showMemberBenefits();
  },

  chooseAddress() {
    wx.chooseAddress({
      success: (res) => {
        const address = `${res.provinceName}${res.cityName}${res.countyName}${res.detailInfo}`;
        this.setData({ shippingAddress: address });
        wx.showToast({ title: "地址已选择", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "未选择地址", icon: "none" });
      }
    });
  },

  showMemberBenefits() {
    wx.navigateTo({ url: "/pages/member/index" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.switchTab({ url: "/pages/events/index" });
  }
});
