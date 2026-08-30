const { addToCart } = require("../../utils/cart");
const {
  activateMember,
  getCatalog,
  getMemberCenter,
  rechargeMember,
  saveSubscription,
  simulateMemberRecharge
} = require("../../utils/cloudApi");
const { withPrivacy } = require("../../utils/privacy");
const { buildMemberPageBootstrap, writeMemberSnapshot } = require("../../utils/memberSnapshot");
const { toThumbnailUrl } = require("../../utils/imagePerformance");

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

function pickRecommendations(products) {
  const list = Array.isArray(products) ? products : [];
  const preferred = ["tea-001", "tea-014"]
    .map((id) => list.find((item) => item && item.id === id))
    .filter(Boolean);
  const extra = list.filter((item) => preferred.every((picked) => picked.id !== item.id));
  return preferred.concat(extra).slice(0, 2).map((item) => Object.assign({}, item, {
    displayImage: toThumbnailUrl(item.thumb || item.image),
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

/** 金额展示去掉无意义的 .00 */
function formatMoneyDisplay(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) {
    return "";
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return raw.replace(/\.00$/, "");
  }
  return Number.isInteger(num) ? String(num) : String(num);
}

function decoratePlans(plans) {
  return (plans || []).map((plan) => Object.assign({}, plan, {
    principalDisplay: formatMoneyDisplay(plan.principal),
    bonusDisplay: formatMoneyDisplay(plan.bonus),
    totalDisplay: formatMoneyDisplay(plan.total)
  }));
}

function getSelectedPlan(plans, planId) {
  return (plans || []).find((item) => item.id === planId) || null;
}

/** 弹层主按钮：一句说清，不重复档位卡片上的「送/到账」 */
function getSheetPayText(memberInfo, payment, memberStatusReady, plan) {
  if (memberStatusReady === false) {
    return "读取中";
  }
  if (!(memberInfo && memberInfo.isMember)) {
    return "请先开通会员";
  }
  const amount = plan ? formatMoneyDisplay(plan.principal) : "";
  if (payment && payment.realPaymentReady) {
    return amount ? `微信支付 ¥${amount}` : "微信支付";
  }
  if (payment && payment.testRechargeEnabled) {
    return amount ? `模拟充值 ¥${amount}` : "模拟充值";
  }
  return "暂不可充值";
}

const memberBootstrap = buildMemberPageBootstrap(member, emptyWallet);

Page(withPrivacy({
  data: {
    member: memberBootstrap.member,
    wallet: memberBootstrap.wallet,
    memberStatusReady: memberBootstrap.memberStatusReady,
    plans: decoratePlans(DEFAULT_PLANS),
    payment: {
      realPaymentReady: false,
      testRechargeEnabled: false
    },
    selectedPlanId: "recharge-500",
    sheetPayText: getSheetPayText(
      memberBootstrap.member,
      { testRechargeEnabled: false },
      memberBootstrap.memberStatusReady,
      DEFAULT_PLANS[0]
    ),
    nameInput: "",
    agreementAccepted: false,
    activationReady: false,
    canActivatePhone: false,
    activationSubmitting: false,
    rechargeSubmitting: false,
    rechargeSheetOpen: false,
    highlights,
    level: buildLevel(memberBootstrap.member),
    benefitDetails,
    recommendations: [],
    subscriptionTemplates: [],
    loadingMember: !memberBootstrap.memberStatusReady,
    privacyPurpose: MEMBER_PRIVACY_PURPOSE,
    privacyReady: false
  },

  onLoad(options = {}) {
    // focus=recharge | benefits，由首页/我的入口带入，数据就绪后滚动定位
    this.focusTarget = String(options.focus || "").trim();
  },

  onShow() {
    this.syncMemberTabBar();
    this.loadMemberCenter();
    this.loadRecommendations();
    this.syncPrivacyState();
  },

  loadRecommendations() {
    getCatalog().then((catalog) => {
      this.setData({
        recommendations: pickRecommendations(catalog && catalog.teaProducts)
      });
    });
  },

  /** 会员中心非 tab 页，内嵌 custom-tab-bar 应固定高亮「我的」(下标 3) */
  syncMemberTabBar() {
    const tabBar = typeof this.selectComponent === "function"
      ? this.selectComponent("#member-tab-bar")
      : null;
    if (tabBar && typeof tabBar.setSelected === "function") {
      tabBar.setSelected(3);
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
    // 有快照时保留会员态展示，仅后台刷新；无快照时显示读取中
    this.setData({
      loadingMember: true,
      memberStatusReady: this.data.memberStatusReady,
      sheetPayText: getSheetPayText(
        this.data.member,
        this.data.payment,
        this.data.memberStatusReady,
        getSelectedPlan(this.data.plans, this.data.selectedPlanId)
      )
    });
    getMemberCenter().then((result) => {
      const memberInfo = Object.assign({}, member, result.member || {});
      const walletInfo = Object.assign({}, emptyWallet, result.wallet || {});
      const remotePlans = result.plans || [];
      const plans = decoratePlans(remotePlans.length ? remotePlans : DEFAULT_PLANS);
      const payment = Object.assign(
        { realPaymentReady: false, testRechargeEnabled: false },
        result.payment || {}
      );
      const preferredId = this.data.selectedPlanId;
      const selectedPlanId = (plans.some((p) => p.id === preferredId) ? preferredId : null)
        || (plans[0] && plans[0].id)
        || "";
      const selectedPlan = getSelectedPlan(plans, selectedPlanId);
      writeMemberSnapshot({
        user: {
          name: memberInfo.isMember ? (memberInfo.name || "禾煦会员") : "禾煦茶友",
          title: memberInfo.isMember
            ? `${memberInfo.tier || "雅客会员"} · 欢迎回来`
            : "愿你在此，得一盏清欢"
        },
        member: {
          isMember: !!memberInfo.isMember,
          name: memberInfo.name,
          tier: memberInfo.tier,
          cardNo: memberInfo.cardNo,
          points: memberInfo.points,
          balance: walletInfo.balance,
          phoneMasked: memberInfo.phoneMasked,
          discountRate: memberInfo.discountRate
        },
        wallet: walletInfo
      });
      this.setData({
        member: memberInfo,
        wallet: walletInfo,
        memberStatusReady: true,
        plans,
        payment,
        selectedPlanId,
        sheetPayText: getSheetPayText(memberInfo, payment, true, selectedPlan),
        nameInput: this.data.nameInput || (memberInfo.isMember ? memberInfo.name : ""),
        level: buildLevel(memberInfo),
        benefitDetails,
        highlights: [
          { title: "储值礼遇", desc: "充 500 送 100", icon: "/assets/icons/profile-wallet.png" },
          { title: "进阶礼遇", desc: "充 1000 送 250", icon: "/assets/icons/profile-star.png" },
          { title: "当前余额", desc: `¥${walletInfo.balance || "0.00"}`, icon: "/assets/icons/profile-coupon.png" }
        ],
        subscriptionTemplates: result.subscriptionTemplates || []
      });
      this.refreshActivationState();
      this.syncPrivacyState();
      this.applyFocusTarget();
    }).catch(() => {
      // 云函数失败：有快照继续用快照；无快照再按非会员展示
      const plans = decoratePlans(DEFAULT_PLANS);
      const payment = { realPaymentReady: false, testRechargeEnabled: false };
      const ready = true;
      this.setData({
        plans,
        payment,
        memberStatusReady: ready,
        selectedPlanId: plans[0].id,
        sheetPayText: getSheetPayText(this.data.member, payment, ready, plans[0])
      });
      // 权益区为本地静态内容，失败时仍可定位
      this.applyFocusTarget();
    }).finally(() => {
      this.setData({ loadingMember: false });
    });
  },

  /** 按入口 focus：仅 benefits 滚动定位；充值弹层必须由用户点击「充值」打开 */
  applyFocusTarget() {
    const focus = this.focusTarget;
    if (!focus) {
      return;
    }
    this.focusTarget = "";
    // focus=recharge 不再自动弹层，避免未点击就出现「选择充值金额」
    if (focus === "benefits") {
      setTimeout(() => {
        wx.pageScrollTo({
          selector: "#benefit-card",
          duration: 280
        });
      }, 200);
    }
  },

  openRechargeSheet() {
    if (!this.data.memberStatusReady) {
      wx.showToast({ title: "会员状态读取中", icon: "none" });
      return;
    }
    if (!this.data.member || !this.data.member.isMember) {
      wx.showToast({ title: "请先开通会员", icon: "none" });
      wx.pageScrollTo({ scrollTop: 0, duration: 240 });
      return;
    }
    this.setData({
      rechargeSheetOpen: true,
      sheetPayText: getSheetPayText(
        this.data.member,
        this.data.payment,
        this.data.memberStatusReady,
        getSelectedPlan(this.data.plans, this.data.selectedPlanId)
      )
    });
  },

  closeRechargeSheet() {
    if (this.data.rechargeSubmitting) {
      return;
    }
    this.setData({ rechargeSheetOpen: false });
  },

  preventMove() {},

  noop() {},

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
    const plan = getSelectedPlan(this.data.plans, selectedPlanId);
    this.setData({
      selectedPlanId,
      sheetPayText: getSheetPayText(
        this.data.member,
        this.data.payment,
        this.data.memberStatusReady,
        plan
      )
    });
  },

  startRealRecharge(planId) {
    // 弹层已完成选档，不再二次弹窗复述档位文案
    this.setData({ rechargeSubmitting: true });
    rechargeMember(planId).then(() => {
      wx.showToast({ title: "支付结果确认中", icon: "none" });
      this.setData({ rechargeSheetOpen: false });
      setTimeout(() => this.loadMemberCenter(), 1500);
    }).catch((error) => {
      wx.showToast({ title: error.message || "充值未完成", icon: "none" });
    }).finally(() => {
      this.setData({ rechargeSubmitting: false });
    });
  },

  startSimulateRecharge(planId) {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.setData({ rechargeSubmitting: true });
    simulateMemberRecharge({ planId, requestId }).then((result) => {
      if (!result || result.ok === false) {
        throw new Error((result && result.message) || "模拟充值失败");
      }
      wx.showToast({ title: "已到账" });
      this.setData({ rechargeSheetOpen: false });
      return this.loadMemberCenter();
    }).catch((error) => {
      wx.showToast({ title: error.message || "模拟充值失败", icon: "none" });
    }).finally(() => {
      this.setData({ rechargeSubmitting: false });
    });
  },

  rechargeMember() {
    if (this.data.rechargeSubmitting) {
      return;
    }
    if (!this.data.memberStatusReady) {
      wx.showToast({ title: "会员状态读取中", icon: "none" });
      return;
    }
    if (!this.data.member || !this.data.member.isMember) {
      this.setData({ rechargeSheetOpen: false });
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
      this.startRealRecharge(planId);
      return;
    }

    this.startSimulateRecharge(planId);
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
      content: `当前为${this.data.level.current}。再消费 ¥${this.data.level.spendMore} 可升级为 ${this.data.level.next}。`,
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
