const { teaProducts } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");

const member = {
  name: "木木",
  tier: "雅客会员",
  cardNo: "NO. 8888 2026",
  points: 1280
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
  points: 1280,
  target: 1600,
  progress: 80,
  spendMore: 320
};

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
    recommendations: pickRecommendations()
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
      content: "雅客会员：购茶 98 折、茶饮优惠券、茶室预定优先。积分达到 1600 可升级为臻享会员。",
      showCancel: false
    });
  },

  showAllBenefits() {
    wx.showModal({
      title: "会员权益",
      content: "会员权益会随门店活动逐步开放，当前可享购茶折扣、茶饮券、茶室优先预定和活动优先通知。",
      showCancel: false
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
