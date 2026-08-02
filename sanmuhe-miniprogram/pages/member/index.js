const { teaProducts } = require("../../data/catalog");
const { addToCart } = require("../../utils/cart");
const {
  activateMember,
  claimCoupon,
  getMemberCenter,
  rechargeMember,
  saveSubscription,
  simulateMemberRecharge
} = require("../../utils/cloudApi");
const { withPrivacy } = require("../../utils/privacy");

const MEMBER_PRIVACY_PURPOSE = "开通会员需要使用你的微信绑定手机号，用于识别会员账户、储值入账与会员服务联系。";
const MEMBER_AGREEMENT_VERSION = "member-wallet-privacy-v2";

function describePhoneAuthFailure(detail = {}) {
  const errMsg = String(detail.errMsg || "");
  const errno = Number(detail.errno);
  // errno 112：公众平台「用户隐私保护指引」未声明 / 未审核通过「手机号」
  if (errno === 112 || /api scope is not declared in the privacy agreement/i.test(errMsg)) {
    return "手机号服务暂未就绪，请稍后重试";
  }
  if (/privacy|permission is not authorized|隐私/i.test(errMsg)) {
    return "需同意隐私保护指引后继续";
  }
  if (/deny|cancel|拒绝|取消/i.test(errMsg)) {
    return "需要授权手机号才能开通会员";
  }
  if (/no permission|not authorized|scope|权限|未开通|not support/i.test(errMsg)) {
    return "手机号快捷开通暂不可用，请稍后重试";
  }
  return "手机号授权未完成，请重试";
}

const member = {
  isMember: false,
  name: "禾煦茶友",
  tier: "普通顾客",
  cardNo: "",
  points: 0,
  discountRate: 1
};

const emptyWallet = {
  enabled: false,
  balance: "0.00",
  principalBalance: "0.00",
  bonusBalance: "0.00",
  balanceFen: 0
};

const highlights = [
  { title: "储值礼遇", desc: "充 500 送 100", icon: "/assets/icons/profile-wallet.png" },
  { title: "进阶礼遇", desc: "充 1000 送 250", icon: "/assets/icons/profile-star.png" },
  { title: "余额支付", desc: "到账即可用", icon: "/assets/icons/profile-coupon.png" },
  { title: "本金赠送分记", desc: "账目清晰可查", icon: "/assets/icons/profile-calendar.png" }
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

/** 会员储值权益以门店公示为准 */
const benefitDetails = [
  { title: "充 500 送 100", desc: "充值 500 元，赠送 100 元，到账 600 元", icon: "/assets/icons/profile-wallet.png" },
  { title: "充 1000 送 250", desc: "充值 1000 元，赠送 250 元，到账 1250 元", icon: "/assets/icons/profile-star.png" },
  { title: "余额即享支付", desc: "储值余额可在结算时直接使用", icon: "/assets/icons/profile-coupon.png" },
  { title: "本金与赠送分记", desc: "充值本金与赠送金额分别记账，清晰可查", icon: "/assets/icons/profile-ticket.png" }
];

function countUsableCoupons(coupons) {
  return (coupons || []).filter((item) => item.status === "可使用").length;
}

function pickRecommendations() {
  return ["tea-001", "tea-014"]
    .map((id) => teaProducts.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => Object.assign({}, item, {
      displayImage: item.thumb || item.image,
      memberNote: item.id === "tea-001" ? "鲜爽甘醇  春日之味" : "雅致茶礼  送礼佳选"
    }));
}

const DEFAULT_PLANS = [
  {
    id: "recharge-500",
    title: "充 500 送 100",
    description: "充值 500 元，赠送 100 元，到账 600 元",
    principal: "500.00",
    bonus: "100.00",
    total: "600.00"
  },
  {
    id: "recharge-1000",
    title: "充 1000 送 250",
    description: "充值 1000 元，赠送 250 元，到账 1250 元",
    principal: "1000.00",
    bonus: "250.00",
    total: "1250.00"
  }
];

function getSelectedPlanLabel(plans, planId) {
  const plan = (plans || []).find((item) => item.id === planId);
  if (!plan) {
    return "";
  }
  if (plan.principal != null && plan.total != null) {
    return `充 ¥${plan.principal} · 到账 ¥${plan.total}`;
  }
  return plan.title || plan.description || "";
}

function getRechargeButtonText(memberInfo, payment) {
  if (!(memberInfo && memberInfo.isMember)) {
    return "请先开通会员";
  }
  // 真实支付就绪时优先走微信支付，避免白名单测试模式挡住真机联调
  if (payment && payment.realPaymentReady) {
    return "微信支付充值";
  }
  if (payment && payment.testRechargeEnabled) {
    return "确认模拟充值";
  }
  return "暂不可充值";
}

Page(withPrivacy({
  data: {
    member,
    wallet: emptyWallet,
    plans: DEFAULT_PLANS,
    payment: {
      realPaymentReady: false,
      testRechargeEnabled: false
    },
    selectedPlanId: "recharge-500",
    selectedPlanLabel: getSelectedPlanLabel(DEFAULT_PLANS, "recharge-500"),
    rechargeButtonText: getRechargeButtonText(member, { testRechargeEnabled: false }),
    nameInput: "",
    agreementAccepted: false,
    activationReady: false,
    canActivatePhone: false,
    activationSubmitting: false,
    rechargeSubmitting: false,
    highlights,
    level,
    benefitDetails,
    recommendations: pickRecommendations(),
    availableCoupons: [],
    userCoupons: [],
    subscriptionTemplates: [],
    loadingMember: false,
    privacyPurpose: MEMBER_PRIVACY_PURPOSE,
    privacyReady: false
  },

  onLoad(options = {}) {
    this.focusRecharge = String(options.focus || "") === "recharge";
  },

  onShow() {
    this.syncMemberTabBar();
    this.loadMemberCenter();
    this.syncPrivacyState();
  },

  /** 会员中心非 tab 页，内嵌 custom-tab-bar 应固定高亮「我的」 */
  syncMemberTabBar() {
    const tabBar = typeof this.selectComponent === "function"
      ? this.selectComponent("#member-tab-bar")
      : null;
    if (tabBar && typeof tabBar.setSelected === "function") {
      tabBar.setSelected(4);
    }
  },

  syncPrivacyState() {
    if (typeof wx.getPrivacySetting !== "function") {
      this.refreshActivationState({ privacyReady: true });
      return;
    }
    wx.getPrivacySetting({
      success: (setting) => {
        const need = !!(setting && setting.needAuthorization);
        this.refreshActivationState({
          privacyReady: !need,
          privacyGateOpen: need ? this.data.privacyGateOpen : false,
          privacyContractName: (setting && setting.privacyContractName) || this.data.privacyContractName
        });
      },
      fail: () => {
        this.refreshActivationState({ privacyReady: true });
      }
    });
  },

  refreshActivationState(extra = {}) {
    const nameInput = extra.nameInput !== undefined ? extra.nameInput : this.data.nameInput;
    const agreementAccepted = extra.agreementAccepted !== undefined ? extra.agreementAccepted : this.data.agreementAccepted;
    const privacyReady = extra.privacyReady !== undefined ? extra.privacyReady : this.data.privacyReady;
    const activationReady = String(nameInput || "").trim().length >= 2 && !!agreementAccepted;
    // 保留 getPhoneNumber 的原始用户点击，让微信在同一条链路里处理隐私授权并继续手机号授权。
    const canActivatePhone = activationReady && !this.data.activationSubmitting;
    this.setData(Object.assign({}, extra, {
      activationReady,
      canActivatePhone,
      privacyReady
    }));
  },

  onPrivacyAuthorized() {
    this.refreshActivationState({ privacyReady: true, privacyGateOpen: false });
  },

  loadMemberCenter() {
    this.setData({ loadingMember: true });
    getMemberCenter().then((result) => {
      const memberInfo = Object.assign({}, member, result.member || {});
      const remotePlans = result.plans || [];
      const plans = remotePlans.length ? remotePlans : DEFAULT_PLANS;
      const payment = Object.assign(
        { realPaymentReady: false, testRechargeEnabled: false },
        result.payment || {}
      );
      const preferredId = this.data.selectedPlanId;
      const selectedPlanId = (plans.some((p) => p.id === preferredId) ? preferredId : null)
        || (plans[0] && plans[0].id)
        || "";
      this.setData({
        member: memberInfo,
        wallet: Object.assign({}, emptyWallet, result.wallet || {}),
        plans,
        payment,
        selectedPlanId,
        selectedPlanLabel: getSelectedPlanLabel(plans, selectedPlanId),
        rechargeButtonText: getRechargeButtonText(memberInfo, payment),
        nameInput: this.data.nameInput || (memberInfo.isMember ? memberInfo.name : ""),
        level: buildLevel(memberInfo),
        benefitDetails,
        highlights: [
          { title: "储值礼遇", desc: "充 500 送 100", icon: "/assets/icons/profile-wallet.png" },
          { title: "进阶礼遇", desc: "充 1000 送 250", icon: "/assets/icons/profile-star.png" },
          { title: "当前余额", desc: `¥${(result.wallet && result.wallet.balance) || "0.00"}`, icon: "/assets/icons/profile-coupon.png" },
          { title: "可用券", desc: `${countUsableCoupons(result.userCoupons)} 张`, icon: "/assets/icons/profile-ticket.png" }
        ],
        availableCoupons: result.availableCoupons || [],
        userCoupons: result.userCoupons || [],
        subscriptionTemplates: result.subscriptionTemplates || []
      });
      this.refreshActivationState();
      this.syncPrivacyState();
      if (this.focusRecharge) {
        this.focusRecharge = false;
        setTimeout(() => {
          wx.pageScrollTo({
            selector: "#wallet-card",
            duration: 280
          });
        }, 200);
      }
    }).catch(() => {
      // 云函数失败时仍展示本地档位，避免“无入口”
      const plans = DEFAULT_PLANS;
      const payment = { realPaymentReady: false, testRechargeEnabled: false };
      this.setData({
        plans,
        payment,
        selectedPlanId: plans[0].id,
        selectedPlanLabel: getSelectedPlanLabel(plans, plans[0].id),
        rechargeButtonText: getRechargeButtonText(this.data.member, payment)
      });
    }).finally(() => {
      this.setData({ loadingMember: false });
    });
  },

  onNameInput(event) {
    const nameInput = String(event.detail.value || "").slice(0, 20);
    this.refreshActivationState({ nameInput });
  },

  toggleAgreement() {
    const agreementAccepted = !this.data.agreementAccepted;
    this.refreshActivationState({ agreementAccepted });
  },

  showMemberAgreement() {
    wx.showModal({
      title: "会员及储值规则",
      content: "当前储值礼遇：充 500 送 100、充 1000 送 250。充值本金与赠送金额分别记账，余额仅限禾煦消费使用。退款及赠送金额处理以门店公示规则为准；如需帮助，请联系门店。",
      showCancel: false
    });
  },

  onActivationTap() {
    if (this.data.activationSubmitting) {
      return;
    }
    if (!this.data.agreementAccepted) {
      wx.showToast({ title: "请先阅读并同意相关规则", icon: "none" });
      return;
    }
    const name = String(this.data.nameInput || "").trim();
    if (name.length < 2) {
      wx.showToast({ title: "请填写姓名或称呼", icon: "none" });
    }
  },

  handlePhoneActivation(event) {
    if (this.data.activationSubmitting) {
      return;
    }
    const detail = (event && event.detail) || {};
    const phoneCode = detail.code;
    if (!phoneCode) {
      console.warn("[member] phone authorization failed", {
        errno: detail.errno,
        errMsg: detail.errMsg
      });
      const message = describePhoneAuthFailure(detail);
      if (/隐私/.test(message)) {
        this.refreshActivationState({ privacyReady: false, privacyGateOpen: false });
      }
      // duration 稍长，避免用户误以为「点了没反应」
      wx.showToast({ title: message, icon: "none", duration: 2500 });
      return;
    }
    if (!this.data.agreementAccepted) {
      wx.showToast({ title: "请先阅读并同意相关规则", icon: "none" });
      return;
    }
    const name = String(this.data.nameInput || "").trim();
    if (name.length < 2) {
      wx.showToast({ title: "请填写姓名或称呼", icon: "none" });
      return;
    }
    this.setData({ activationSubmitting: true, canActivatePhone: false });
    activateMember({
      name,
      phoneCode,
      agreementAccepted: true,
      agreementVersion: MEMBER_AGREEMENT_VERSION
    }).then((result) => {
      if (!result || result.ok === false) {
        throw new Error(result && result.message || "会员开通失败");
      }
      wx.showToast({ title: "会员已开通" });
      return this.loadMemberCenter();
    }).catch((error) => {
      wx.showToast({ title: error.message || "会员开通失败", icon: "none" });
    }).finally(() => {
      this.setData({ activationSubmitting: false });
      this.refreshActivationState();
    });
  },

  selectPlan(event) {
    const selectedPlanId = event.currentTarget.dataset.id || "";
    this.setData({
      selectedPlanId,
      selectedPlanLabel: getSelectedPlanLabel(this.data.plans, selectedPlanId)
    });
  },

  startRealRecharge(planId, plan) {
    wx.showModal({
      title: "确认微信支付充值",
      content: `${plan ? plan.description : "当前充值档位"}\n将调起微信支付，成功后余额自动到账。`,
      success: (modalResult) => {
        if (!modalResult.confirm) {
          return;
        }
        this.setData({ rechargeSubmitting: true });
        rechargeMember(planId).then(() => {
          wx.showToast({ title: "支付结果确认中", icon: "none" });
          setTimeout(() => this.loadMemberCenter(), 1500);
        }).catch((error) => {
          wx.showToast({ title: error.message || "充值未完成", icon: "none" });
        }).finally(() => {
          this.setData({ rechargeSubmitting: false });
        });
      }
    });
  },

  startSimulateRecharge(planId, plan) {
    wx.showModal({
      title: "确认模拟充值",
      content: `${plan ? plan.description : "当前充值档位"}\n体验余额仅用于测试，不会真实扣款。`,
      success: (modalResult) => {
        if (!modalResult.confirm) {
          return;
        }
        const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        this.setData({ rechargeSubmitting: true });
        simulateMemberRecharge({ planId, requestId }).then((result) => {
          if (!result || result.ok === false) {
            throw new Error((result && result.message) || "模拟充值失败");
          }
          wx.showToast({ title: "模拟余额已到账" });
          return this.loadMemberCenter();
        }).catch((error) => {
          wx.showToast({ title: error.message || "模拟充值失败", icon: "none" });
        }).finally(() => {
          this.setData({ rechargeSubmitting: false });
        });
      }
    });
  },

  rechargeMember() {
    if (this.data.rechargeSubmitting) {
      return;
    }
    if (!this.data.member || !this.data.member.isMember) {
      wx.showToast({ title: "请先开通会员", icon: "none" });
      wx.pageScrollTo({ scrollTop: 0, duration: 240 });
      return;
    }
    const planId = this.data.selectedPlanId;
    if (!planId) {
      wx.showToast({ title: "请选择充值档位", icon: "none" });
      return;
    }
    const plan = this.data.plans.find((item) => item.id === planId);
    const canTest = !!(this.data.payment && this.data.payment.testRechargeEnabled);
    const canReal = !!(this.data.payment && this.data.payment.realPaymentReady);

    if (!canTest && !canReal) {
      wx.showModal({
        title: "暂不可充值",
        content: "在线充值暂未开放，请稍后再试或到店咨询。",
        showCancel: false
      });
      return;
    }

    // 真实支付优先：白名单模拟仅作为未配密钥时的兜底，不再挡住真机微信支付
    if (canReal) {
      this.startRealRecharge(planId, plan);
      return;
    }

    this.startSimulateRecharge(planId, plan);
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
      content: "储值礼遇：充 500 送 100（到账 600）、充 1000 送 250（到账 1250）。本金与赠送金额分别记账，余额可在禾煦结算时使用。",
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
      wx.showToast({ title: "通知服务暂不可用", icon: "none" });
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
}));
