const { getMemberCenter, listMyRecords, saveSubscription } = require("../../utils/cloudApi");
const { resolveCloudImage } = require("../../config/assets");
const { normalizeOrder } = require("../../utils/orderCenter");
const { syncTabBar } = require("../../utils/tabbar");
const { withPrivacy } = require("../../utils/privacy");
const { readMemberSnapshot, writeMemberSnapshot } = require("../../utils/memberSnapshot");

const defaultUser = {
  name: "禾煦茶友",
  title: "愿你在此，得一盏清欢",
  avatar: require("../../config/assets").localImage("assets/images/profile-avatar.jpg")
};

const defaultMember = {
  isMember: false,
  tier: "普通顾客",
  points: 0,
  orders: 0,
  balance: "0.00"
};

function buildInitialProfileState() {
  const snap = readMemberSnapshot();
  if (snap && snap.member) {
    return {
      user: Object.assign({}, defaultUser, snap.user || {}),
      member: Object.assign({}, defaultMember, snap.member),
      // 有缓存时视为已就绪，避免首帧闪「立即开通」
      memberStatusReady: true
    };
  }
  return {
    user: defaultUser,
    member: defaultMember,
    // 无缓存：先不判定为非会员，等接口返回
    memberStatusReady: false
  };
}

const orderShortcutBase = [
  { key: "all", label: "全部订单", icon: "/assets/icons/profile-order.png" },
  { key: "pending", label: "待付款", icon: "/assets/icons/profile-wallet.png" },
  { key: "active", label: "进行中", icon: "/assets/icons/profile-clock.png" },
  { key: "afterSale", label: "退款/售后", icon: "/assets/icons/profile-refund.png" }
];

const serviceItemsBase = [
  { label: "我的预约", icon: "/assets/icons/profile-room.png", action: "myReservations" },
  { label: "我的活动", icon: "/assets/icons/profile-calendar.png", action: "myEvents" },
  { label: "收货地址", icon: "/assets/icons/profile-pin.png", action: "address" },
  { label: "联系客服", icon: "/assets/icons/profile-headset.png", action: "service" },
  { label: "隐私协议", icon: "/assets/icons/profile-setting.png", action: "privacy" }
];

function buildServices() {
  return serviceItemsBase.slice();
}

function normalizeRecords(records, type) {
  if (type === "order") {
    return (records || []).map(normalizeOrder);
  }
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
      image: resolveCloudImage(item.image, type === "reservation" ? "/assets/images/reservation-hero.jpg" : "/assets/images/event-yangxin-tea.jpg")
    });
  });
}

function buildOrderShortcuts(orders, summary) {
  return orderShortcutBase.map((item) => {
    let count = 0;
    // 行业通用：角标只表示「待用户处理」数量；「全部订单」永不显示红点/数字
    if (item.key === "all") {
      count = 0;
    } else if (summary && summary[item.key] !== undefined) {
      count = Number(summary[item.key]) || 0;
    } else if (item.key === "pending") {
      count = orders.filter((order) => order.status === "待支付" || order.payStatus === "pending").length;
    } else if (item.key === "active") {
      count = orders.filter((order) => ["已付款", "制作中", "待发货", "待自提", "已发货", "待确认"].includes(order.status)).length;
    } else if (item.key === "afterSale") {
      count = orders.filter((order) => order.afterSaleStatus || /退款|售后|异常/.test(String(order.status || ""))).length;
    }
    return Object.assign({}, item, { count });
  });
}

const { displayReservationPlace } = require("../../data/store");

function getRecentReservation(reservations) {
  const item = reservations[0];
  if (!item) {
    return null;
  }
  const timeRange = item.endTime ? `${item.time || ""}–${item.endTime}` : (item.time || "");
  return {
    id: item.id,
    // 单店模式：展示门店主数据名（storeName 优先，见 data/store.js）
    room: displayReservationPlace(item),
    dateText: item.day && timeRange ? `${item.day} ${timeRange}` : (item.dateText || item.day || ""),
    people: item.people || 2,
    status: item.status || "待确认",
    image: resolveCloudImage(item.image, "/assets/images/reservation-hero.jpg")
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
    place: item.place || "禾煦",
    status: item.status || "待确认",
    image: resolveCloudImage(item.image, "/assets/images/event-yangxin-tea.jpg")
  };
}

function getRecentOrders(orders) {
  return orders.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.displayId || "订单",
    total: item.totalText || "0.00",
    status: item.statusLabel || item.status || "待处理",
    meta: item.itemSummary || item.deliveryText || ""
  }));
}

Page(withPrivacy({
  data: Object.assign({
    orderShortcuts: buildOrderShortcuts([]),
    services: buildServices(),
    orders: [],
    reservations: [],
    signups: [],
    recentOrders: [],
    recentReservation: null,
    recentSignup: null,
    recordsLoading: false,
    recordsError: "",
    staffNotice: null,
    staffSubscribeSubmitting: false
  }, buildInitialProfileState()),

  onShow() {
    syncTabBar(this);
    this.loadRecords();
    this.loadStaffNotice();
  },

  loadStaffNotice() {
    getMemberCenter().then((result) => {
      const staffNotice = result && result.staffNotice ? result.staffNotice : null;
      this.setData({ staffNotice });
    }).catch(() => {
      this.setData({ staffNotice: null });
    });
  },

  /** 店员授权订阅消息：每次允许后可累计发送次数 */
  subscribeStaffOrders() {
    if (this.data.staffSubscribeSubmitting) {
      return;
    }
    const staffNotice = this.data.staffNotice || {};
    const templates = staffNotice.templates || [];
    const tmplIds = templates.map((item) => item.templateId).filter(Boolean);
    if (!staffNotice.isStaff) {
      wx.showToast({ title: "当前账号不是店员", icon: "none" });
      return;
    }
    if (!tmplIds.length) {
      wx.showToast({ title: "店员通知模板未配置", icon: "none" });
      return;
    }
    this.setData({ staffSubscribeSubmitting: true });
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = tmplIds.some((id) => res && res[id] === "accept");
        saveSubscription(res, templates).then(() => {
          wx.showToast({
            title: accepted ? "接单提醒已开启" : "未授权提醒",
            icon: accepted ? "success" : "none"
          });
          this.loadStaffNotice();
        }).catch(() => {
          wx.showToast({ title: "订阅保存失败", icon: "none" });
        }).finally(() => {
          this.setData({ staffSubscribeSubmitting: false });
        });
      },
      fail: () => {
        this.setData({ staffSubscribeSubmitting: false });
        wx.showToast({ title: "未完成授权", icon: "none" });
      }
    });
  },

  loadRecords() {
    // 有缓存时保留 memberStatusReady=true，仅在无缓存时显示加载态文案
    const nextLoading = { recordsLoading: true, recordsError: "" };
    if (!this.data.memberStatusReady) {
      nextLoading.memberStatusReady = false;
    }
    this.setData(nextLoading);
    listMyRecords().then((records) => {
      const orders = normalizeRecords(records.orders, "order");
      const reservations = normalizeRecords(records.reservations, "reservation");
      const signups = normalizeRecords(records.signups, "signup");
      const isMember = !!(records.member && records.member.status === "active");
      const user = isMember ? {
        name: records.member.name || "禾煦会员",
        title: `${records.member.tier || "雅客会员"} · 欢迎回来`,
        avatar: defaultUser.avatar
      } : defaultUser;
      const member = Object.assign({}, defaultMember, {
        isMember,
        tier: isMember ? records.member.tier : defaultMember.tier,
        points: records.member && records.member.points !== undefined ? records.member.points : defaultMember.points,
        orders: orders.length,
        balance: isMember && records.wallet ? records.wallet.balance : defaultMember.balance
      });
      writeMemberSnapshot({
        user,
        member,
        wallet: isMember && records.wallet ? records.wallet : null
      });
      this.setData({
        user,
        orders,
        reservations,
        signups,
        member,
        memberStatusReady: true,
        orderShortcuts: buildOrderShortcuts(orders, records.orderSummary),
        recentOrders: getRecentOrders(orders),
        recentReservation: getRecentReservation(reservations),
        recentSignup: getRecentSignup(signups),
        recordsLoading: false,
        recordsError: ""
      });
    }).catch((error) => {
      // 失败时：有缓存继续展示缓存会员态；无缓存再按非会员展示，避免一直「加载中」
      const hasCache = !!this.data.memberStatusReady;
      this.setData({
        recordsLoading: false,
        memberStatusReady: true,
        recordsError: error && error.message ? error.message : "记录暂时加载失败",
        member: hasCache ? this.data.member : defaultMember,
        user: hasCache ? this.data.user : defaultUser
      });
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  handleOrderShortcut(event) {
    const key = event.currentTarget.dataset.key;
    wx.navigateTo({
      url: `/pages/orders/index?tab=${encodeURIComponent(key || "all")}`
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
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${encodeURIComponent(order.id)}`
    });
  },

  retryRecords() {
    this.loadRecords();
  },

  handleService(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "myReservations") {
      wx.navigateTo({ url: "/pages/my-records/index?tab=reservation" });
      return;
    }
    if (action === "myEvents") {
      wx.navigateTo({ url: "/pages/my-records/index?tab=event" });
      return;
    }
    if (action === "address") {
      wx.navigateTo({ url: "/pages/address/index" });
      return;
    }
    if (action === "service") {
      wx.navigateTo({ url: "/pages/contact/index" });
      return;
    }
    if (action === "privacy") {
      this.openPrivacyContract();
      return;
    }
    this.showMemberBenefits();
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index?focus=benefits" });
  },

  onMemberCardAction() {
    // 状态未就绪时不跳转，避免误导到开通页
    if (!this.data.memberStatusReady) {
      wx.showToast({ title: "会员状态读取中", icon: "none" });
      return;
    }
    if (this.data.member && this.data.member.isMember) {
      this.startRecharge();
      return;
    }
    this.showMemberBenefits();
  },

  showMemberBenefits() {
    // 开通/查看权益：进入会员中心并定位权益区
    wx.navigateTo({ url: "/pages/member/index?focus=benefits" });
  },

  startRecharge() {
    // 充值档位选择与支付/模拟充值均在会员中心完成
    wx.navigateTo({ url: "/pages/member/index?focus=recharge" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.navigateTo({ url: "/pages/events/index" });
  }
}));
