const { listMyRecords } = require("../../utils/cloudApi");
const { getFavorites } = require("../../utils/favorites");

const defaultUser = {
  name: "木木",
  title: "三木合雅客・茶生活会员",
  avatar: "/assets/images/design-hero-tea.jpg"
};

const defaultMember = {
  tier: "雅客会员",
  points: 1280,
  coupons: 5
};

const orderShortcutBase = [
  { key: "all", label: "全部订单", icon: "/assets/icons/cart-line.png" },
  { key: "pending", label: "待付款", icon: "/assets/icons/clock-line.png" },
  { key: "usable", label: "待使用", icon: "/assets/icons/calendar-active.png" },
  { key: "afterSale", label: "退款/售后", icon: "/assets/icons/profile-active.png" }
];

const serviceItems = [
  { label: "我的收藏", icon: "/assets/icons/heart-ink.png", action: "favorites" },
  { label: "茶室预约", icon: "/assets/icons/room-white.png", action: "reservation", filled: true },
  { label: "活动报名", icon: "/assets/icons/calendar-active.png", action: "events" },
  { label: "收货地址", icon: "/assets/icons/map-pin-line.png", action: "address" },
  { label: "优惠券", icon: "/assets/icons/category-active.png", action: "coupons" },
  { label: "联系客服", icon: "/assets/icons/headset-ink.png", action: "service" },
  { label: "设置", icon: "/assets/icons/profile-line.png", action: "settings" }
];

function normalizeRecords(records, type) {
  return (records || []).map((item, index) => {
    const fallback = `${type}-${index}`;
    return Object.assign({}, item, {
      id: item.id || item.orderNo || item._id || fallback
    });
  });
}

function buildOrderShortcuts(orders) {
  return orderShortcutBase.map((item) => {
    let count = 0;
    if (item.key === "all") {
      count = orders.length;
    } else if (item.key === "pending") {
      count = orders.filter((order) => String(order.status || "").includes("待")).length;
    } else if (item.key === "usable") {
      count = orders.filter((order) => ["已下单", "待使用", "已预约"].includes(order.status)).length;
    } else if (item.key === "afterSale") {
      count = orders.filter((order) => String(order.status || "").includes("退款")).length;
    }
    return Object.assign({}, item, { count });
  });
}

function getRecentReservation(reservations) {
  const item = reservations[0] || {};
  return {
    id: item.id || "reservation-demo",
    room: item.room || "三木合・观山店",
    dateText: item.day && item.time ? `${item.day} ${item.time}` : "5月20日 周六 14:00-16:00",
    people: item.people || 2,
    status: item.status || "即将到店",
    image: item.image || "/assets/images/design-room-guanshan.jpg"
  };
}

function getRecentSignup(signups) {
  const item = signups[0] || {};
  return {
    id: item.id || "signup-demo",
    title: item.title || "春日茶会・品新茶",
    dateText: item.date && item.time ? `${item.date} ${item.time}` : "05.25 周六 14:00",
    place: item.place || "三木合・观山店",
    status: item.status || "报名成功",
    image: item.image || "/assets/images/design-event-spring.jpg"
  };
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
    hasCloudRecords: false,
    favorites: [],
    recentReservation: getRecentReservation([]),
    recentSignup: getRecentSignup([]),
    shippingAddress: ""
  },

  onShow() {
    this.setData({ favorites: getFavorites() });
    listMyRecords().then((records) => {
      const orders = normalizeRecords(records.orders, "order");
      const reservations = normalizeRecords(records.reservations, "reservation");
      const signups = normalizeRecords(records.signups, "signup");
      this.setData({
        orders,
        reservations,
        signups,
        hasCloudRecords: orders.length + reservations.length + signups.length > 0,
        favorites: getFavorites(),
        orderShortcuts: buildOrderShortcuts(orders),
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

  goProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` });
  },

  handleOrderShortcut() {
    wx.switchTab({ url: "/pages/cart/index" });
  },

  handleService(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "favorites") {
      wx.pageScrollTo({ selector: "#favorites-section", duration: 220 });
      return;
    }
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
    if (action === "service") {
      wx.makePhoneCall({ phoneNumber: "4008001234" });
      return;
    }
    if (action === "settings") {
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
    wx.showToast({ title: "会员权益已同步", icon: "none" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.switchTab({ url: "/pages/events/index" });
  }
});
