const { teaProducts } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");
const { claimCoupon, getMemberCenter, saveSubscription } = require("../../utils/cloudApi");

const member = {
  name: "木木",
  tier: "雅客会员",
  cardNo: "NO. 8888 2026",
  points: 0,
  discountRate: 0.98
};

const highlights = [
  { title: "会员折扣", desc: "购茶 98 折", icon: "/assets/icons/profile-coupon.png" },
  { title: "积分兑换", desc: "好礼兑不停", icon: "/assets/icons/profile-wallet.png" },
  { title: "专属活动", desc: "会员专享", icon: "/assets/icons/profile-star.png" },
  { title: "生日礼遇", desc: "专属好礼", icon: "/assets/icons/profile-calendar.png" }
];

const level = {
  current: "雅客会员",
  next: "臻享会员",
  points: 0,
  target: 1600,
  progress: 0,
  spendMore: 1600
};

function buildLevel(memberInfo = {}) {
  return {
    current: memberInfo.tier || level.current,
    next: memberInfo.nextTier || level.next,
    points: memberInfo.points || 0,
    target: memberInfo.nextTarget || level.target,
    progress: memberInfo.progress === undefined ? level.progress : memberInfo.progress,
    spendMore: memberInfo.spendMore === undefined ? level.spendMore : memberInfo.spendMore
  };
}

function buildBenefits(memberInfo = {}) {
  const discount = memberInfo.discountRate && memberInfo.discountRate < 1
    ? `${Math.round(memberInfo.discountRate * 100)} 折`
    : "会员价";
  return [
    { title: `购茶 ${discount}`, desc: "茶叶商品下单时自动计算会员折扣", icon: "/assets/icons/profile-coupon.png" },
    { title: "积分自动入账", desc: "支付成功后按实付金额累计积分", icon: "/assets/icons/profile-wallet.png" },
    { title: "优惠券可核销", desc: "领取后下单可抵扣，支付成功自动核销", icon: "/assets/icons/profile-ticket.png" },
    { title: "服务通知", desc: "订阅后接收订单、预约和活动状态更新", icon: "/assets/icons/profile-bell.png" }
  ];
}

function countUsableCoupons(coupons) {
  return (coupons || []).filter((item) => item.status === "可使用").length;
}

const benefitDetails = [
  { title: "购茶 98 折", desc: "全场茶叶产品享 98 折优惠（特价商品除外）", icon: "/assets/icons/profile-coupon.png" },
  { title: "茶饮每月 2 张优惠券", desc: "每月可领取 2 张茶饮优惠券", icon: "/assets/icons/profile-ticket.png" },
  { title: "茶室预定优先", desc: "享受茶室预定优先权益", icon: "/assets/icons/profile-room.png" },
  { title: "活动报名优先通知", desc: "第一时间获取专属活动信息与报名资格", icon: "/assets/icons/profile-bell.png" }
];

function pickRecommendations() {
  return ["tea-001", "tea-014"]
    .map((id) => teaProducts.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => Object.assign({}, item, {
      displayImage: item.thumb || item.image,
      memberNote: item.id === "tea-001" ? "鲜爽甘醇  春日之味" : "雅致茶礼  送礼佳选"
    }));
}

Page({
  data: {
    member,
    highlights,
    level,
    benefitDetails,
    recommendations: pickRecommendations(),
    availableCoupons: [],
    userCoupons: [],
    subscriptionTemplates: [],
    loadingMember: false
  },

  onShow() {
    this.loadMemberCenter();
  },

  loadMemberCenter() {
    this.setData({ loadingMember: true });
    getMemberCenter().then((result) => {
      const memberInfo = Object.assign({}, member, result.member || {});
      this.setData({
        member: memberInfo,
        level: buildLevel(memberInfo),
        benefitDetails: buildBenefits(memberInfo),
        highlights: [
          { title: "会员折扣", desc: memberInfo.discountRate < 1 ? `购茶 ${Math.round(memberInfo.discountRate * 100)} 折` : "会员价", icon: "/assets/icons/profile-coupon.png" },
          { title: "当前积分", desc: `${memberInfo.points || 0} 分`, icon: "/assets/icons/profile-wallet.png" },
          { title: "可用券", desc: `${countUsableCoupons(result.userCoupons)} 张`, icon: "/assets/icons/profile-star.png" },
          { title: "服务通知", desc: result.subscriptionTemplates && result.subscriptionTemplates.length ? "可订阅" : "待配置", icon: "/assets/icons/profile-calendar.png" }
        ],
        availableCoupons: result.availableCoupons || [],
        userCoupons: result.userCoupons || [],
        subscriptionTemplates: result.subscriptionTemplates || []
      });
    }).finally(() => {
      this.setData({ loadingMember: false });
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/profile/index" });
  },

  showAllLevels() {
    wx.showModal({
      title: "会员等级",
      content: `${this.data.level.current}：购茶自动享会员折扣。再消费 ¥${this.data.level.spendMore} 可升级为 ${this.data.level.next}。`,
      showCancel: false
    });
  },

  showAllBenefits() {
    wx.showModal({
      title: "会员权益",
      content: "会员折扣、积分、优惠券抵扣已经接入订单闭环；订阅通知需要你授权后才能发送。",
      showCancel: false
    });
  },

  claimCoupon(event) {
    const id = event.currentTarget.dataset.id;
    claimCoupon(id).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "领取失败", icon: "none" });
        return;
      }
      wx.showToast({ title: "已领取" });
      this.loadMemberCenter();
    }).catch(() => {
      wx.showToast({ title: "领取失败", icon: "none" });
    });
  },

  subscribeNotices() {
    const templates = this.data.subscriptionTemplates || [];
    const tmplIds = templates.map((item) => item.templateId).filter(Boolean);
    if (!tmplIds.length) {
      wx.showToast({ title: "后台未配置订阅模板", icon: "none" });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        saveSubscription(res, templates).then(() => {
          wx.showToast({ title: "订阅已保存" });
        }).catch(() => {
          wx.showToast({ title: "订阅保存失败", icon: "none" });
        });
      },
      fail: () => {
        wx.showToast({ title: "未完成订阅", icon: "none" });
      }
    });
  },

  goMoreRecommendations() {
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` });
  },

  addRecommendation(event) {
    const product = this.data.recommendations.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    addToCart({
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
    wx.showToast({ title: "已加入购物车" });
  }
});
