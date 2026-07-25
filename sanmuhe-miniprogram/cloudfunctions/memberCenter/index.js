const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const MEMBER_AGREEMENT_VERSION = "member-wallet-privacy-v2";

const defaultLevels = [
  { tier: "雅客会员", minSpend: 0, discountRate: 0.98, pointsTarget: 1600 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 0.95, pointsTarget: 5000 },
  { tier: "山房会员", minSpend: 5000, discountRate: 0.92, pointsTarget: 12000 }
];

/** 门店公示储值权益：充 500 送 100、充 1000 送 250（金额单位：分） */
const DEFAULT_MEMBERSHIP_PLANS = [
  {
    id: "recharge-500",
    title: "充 500 送 100",
    description: "充值 500 元，赠送 100 元，到账 600 元",
    principalFen: 50000,
    bonusFen: 10000,
    totalFen: 60000,
    sortOrder: 1,
    enabled: true
  },
  {
    id: "recharge-1000",
    title: "充 1000 送 250",
    description: "充值 1000 元，赠送 250 元，到账 1250 元",
    principalFen: 100000,
    bonusFen: 25000,
    totalFen: 125000,
    sortOrder: 2,
    enabled: true
  }
];

const templateLabels = {
  orderPaidTemplateId: "订单支付通知",
  orderShippedTemplateId: "订单发货通知",
  reservationTemplateId: "茶室预约通知",
  eventTemplateId: "活动报名通知"
};

const staffTemplateLabels = {
  staffOrderTemplateId: "店员新订单提醒"
};

function parseList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isStaffOpenid(openid) {
  const staff = parseList(process.env.STAFF_OPENIDS);
  const admins = parseList(process.env.ADMIN_OPENIDS);
  const allowed = staff.length ? staff : admins;
  return !!(openid && allowed.includes(openid));
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function integer(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function stableDocumentId(prefix, openid) {
  const digest = crypto.createHash("sha256").update(String(openid || "")).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

function isActiveMember(member) {
  return !!(member && member.status === "active" && member.phone);
}

function pickMember(records) {
  const items = Array.isArray(records) ? records : [];
  return items.find(isActiveMember) || items[0] || null;
}

function getErrorText(error) {
  return cleanText(error && (error.errMsg || error.message || error.errmsg), 160);
}

function getErrorNumber(error) {
  const value = error && (error.errCode !== undefined
    ? error.errCode
    : error.errno !== undefined
      ? error.errno
      : error.code);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function phoneExchangeFailure(error) {
  const errCode = getErrorNumber(error);
  const errMsg = getErrorText(error);
  if (errCode === -604101 || /-604101|permission|access.denied|unauthorized|无权限/i.test(errMsg)) {
    return {
      code: "PHONE_OPENAPI_PERMISSION",
      message: "手机号快捷开通暂不可用，请稍后重试"
    };
  }
  if (errCode === 40029 || /invalid.*code|code.*invalid|expired|used/i.test(errMsg)) {
    return {
      code: "PHONE_CODE_INVALID",
      message: "手机号授权已失效，请重新点击开通"
    };
  }
  if (errCode === -1 || errCode === 45011 || /system error|frequency|rate limit|busy|频繁/i.test(errMsg)) {
    return {
      code: "PHONE_SERVICE_BUSY",
      message: "手机号验证繁忙，请稍后重试"
    };
  }
  return {
    code: "PHONE_EXCHANGE_FAILED",
    message: "手机号验证未完成，请重新授权"
  };
}

function logMemberCenterError(stage, openid, error) {
  console.error("memberCenter operation failed", {
    stage,
    actor: stableDocumentId("user", openid),
    errCode: getErrorNumber(error),
    errMsg: getErrorText(error)
  });
}

function isTestModeEnabled() {
  return String(process.env.MEMBER_TEST_MODE || "").toLowerCase() === "true";
}

function isTestOpenid(openid) {
  if (!isTestModeEnabled()) {
    return false;
  }
  const allowed = parseList(process.env.MEMBER_TEST_OPENIDS)
    .concat(parseList(process.env.ADMIN_OPENIDS))
    .concat(parseList(process.env.STAFF_OPENIDS));
  return allowed.includes(openid);
}

function money(fen) {
  return (integer(fen) / 100).toFixed(2);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value.$date) {
    return toDate(value.$date);
  }
  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateActive(startAt, endAt) {
  const now = Date.now();
  const start = toDate(startAt);
  const end = toDate(endAt);
  return (!start || start.getTime() <= now) && (!end || end.getTime() + 86400000 > now);
}

async function readSettings() {
  await ensureCollection("store_settings");
  const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
  return result.data && result.data[0] ? result.data[0] : {};
}

function getLevelRules(settings = {}) {
  const levels = [
    {
      tier: cleanText(settings.levelOneName, 20) || defaultLevels[0].tier,
      minSpend: number(settings.levelOneMinSpend),
      discountRate: Number(settings.levelOneDiscountRate || defaultLevels[0].discountRate)
    },
    {
      tier: cleanText(settings.levelTwoName, 20) || defaultLevels[1].tier,
      minSpend: number(settings.levelTwoMinSpend || defaultLevels[1].minSpend),
      discountRate: Number(settings.levelTwoDiscountRate || defaultLevels[1].discountRate)
    },
    {
      tier: cleanText(settings.levelThreeName, 20) || defaultLevels[2].tier,
      minSpend: number(settings.levelThreeMinSpend || defaultLevels[2].minSpend),
      discountRate: Number(settings.levelThreeDiscountRate || defaultLevels[2].discountRate)
    }
  ];

  return levels
    .map((level, index) => ({
      tier: level.tier,
      minSpend: level.minSpend,
      discountRate: level.discountRate > 0 && level.discountRate <= 1 ? level.discountRate : defaultLevels[index].discountRate,
      pointsTarget: defaultLevels[index].pointsTarget
    }))
    .sort((a, b) => a.minSpend - b.minSpend);
}

function getLevelBySpend(totalSpend, levels) {
  return levels.reduce((current, level) => totalSpend >= level.minSpend ? level : current, levels[0]);
}

function getNextLevel(totalSpend, levels) {
  return levels.find((level) => totalSpend < level.minSpend) || null;
}

function isRevenueOrder(order) {
  return order && (order.payStatus === "paid" || ["待发货", "待自提", "已发货", "已完成"].includes(order.status));
}

async function getPaidOrders(openid) {
  await ensureCollection("orders");
  const result = await db.collection("orders").where({ _openid: openid }).orderBy("createdAt", "desc").limit(200).get();
  return (result.data || []).filter(isRevenueOrder);
}

async function getMember(openid, settings) {
  await ensureCollection("members");
  const existing = await db.collection("members").where({ _openid: openid }).limit(20).get();
  const saved = pickMember(existing.data);
  if (!isActiveMember(saved)) {
    return {
      isMember: false,
      status: "inactive",
      name: "微信顾客",
      tier: "普通顾客",
      cardNo: "",
      phoneMasked: "",
      points: 0,
      totalSpend: 0,
      paidOrders: 0,
      discountRate: 1,
      nextTier: defaultLevels[0].tier,
      nextTarget: 0,
      spendMore: 0,
      progress: 0,
      levels: getLevelRules(settings)
    };
  }

  const orders = await getPaidOrders(openid);
  const pointRate = Math.max(0, Number(settings.memberPointRate || 1));
  const totalSpend = orders.reduce((sum, order) => sum + number(order.total), 0);
  const points = orders.reduce((sum, order) => sum + number(order.pointsEarned || Math.floor(number(order.total) * pointRate)), 0);
  const levels = getLevelRules(settings);
  const level = getLevelBySpend(totalSpend, levels);
  const nextLevel = getNextLevel(totalSpend, levels);

  const member = {
    _openid: openid,
    isMember: true,
    status: "active",
    name: saved.name || "禾煦会员",
    tier: level.tier,
    cardNo: saved.cardNo || `SMH ${String(openid || "000000").slice(-6).toUpperCase()}`,
    phone: saved.phone,
    phoneMasked: saved.phone ? `${String(saved.phone).slice(0, 3)}****${String(saved.phone).slice(-4)}` : "",
    points,
    totalSpend,
    paidOrders: orders.length,
    discountRate: level.discountRate,
    nextTier: nextLevel ? nextLevel.tier : "已达最高等级",
    nextTarget: nextLevel ? nextLevel.minSpend : totalSpend,
    spendMore: nextLevel ? Math.max(0, nextLevel.minSpend - totalSpend) : 0,
    progress: nextLevel ? Math.min(100, Math.round(totalSpend / nextLevel.minSpend * 100)) : 100,
    updatedAt: db.serverDate()
  };

  await db.collection("members").doc(saved._id).update({ data: member });

  return Object.assign({}, saved, member, { levels });
}

function serializePlan(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    principalFen: integer(item.principalFen),
    bonusFen: integer(item.bonusFen),
    totalFen: integer(item.totalFen || integer(item.principalFen) + integer(item.bonusFen)),
    principal: money(item.principalFen),
    bonus: money(item.bonusFen),
    total: money(item.totalFen || integer(item.principalFen) + integer(item.bonusFen))
  };
}

function planNeedsCorrection(existing, expected) {
  return integer(existing.principalFen) !== expected.principalFen
    || integer(existing.bonusFen) !== expected.bonusFen
    || integer(existing.totalFen) !== expected.totalFen
    || cleanText(existing.title, 40) !== expected.title
    || cleanText(existing.description, 120) !== expected.description
    || existing.enabled === false
    || number(existing.sortOrder) !== expected.sortOrder;
}

async function ensureDefaultMembershipPlans() {
  await ensureCollection("membership_plans");
  const result = await db.collection("membership_plans").limit(50).get();
  const existing = result.data || [];
  const byId = {};
  existing.forEach((item) => {
    if (item && item.id) {
      byId[item.id] = item;
    }
  });

  for (const plan of DEFAULT_MEMBERSHIP_PLANS) {
    const saved = byId[plan.id];
    if (!saved) {
      await db.collection("membership_plans").add({
        data: Object.assign({}, plan, {
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        })
      });
      continue;
    }
    if (planNeedsCorrection(saved, plan)) {
      await db.collection("membership_plans").doc(saved._id).update({
        data: {
          title: plan.title,
          description: plan.description,
          principalFen: plan.principalFen,
          bonusFen: plan.bonusFen,
          totalFen: plan.totalFen,
          sortOrder: plan.sortOrder,
          enabled: true,
          updatedAt: db.serverDate()
        }
      });
    }
  }
}

async function listMembershipPlans() {
  await ensureDefaultMembershipPlans();
  const result = await db.collection("membership_plans")
    .limit(20)
    .get();
  const allowedIds = new Set(DEFAULT_MEMBERSHIP_PLANS.map((item) => item.id));
  const byId = {};
  (result.data || []).forEach((item) => {
    if (item && item.id && allowedIds.has(item.id) && item.enabled !== false) {
      byId[item.id] = item;
    }
  });
  // Always surface the two published tiers in fixed order with canonical amounts.
  return DEFAULT_MEMBERSHIP_PLANS.map((plan) => serializePlan(byId[plan.id] || plan));
}

async function getWallet(openid, member) {
  await ensureCollection("wallet_accounts");
  if (!isActiveMember(member)) {
    return {
      enabled: false,
      balanceFen: 0,
      principalBalanceFen: 0,
      bonusBalanceFen: 0,
      balance: "0.00",
      principalBalance: "0.00",
      bonusBalance: "0.00"
    };
  }
  const result = await db.collection("wallet_accounts").where({ _openid: openid }).limit(1).get();
  const wallet = result.data && result.data[0];
  if (!wallet) {
    const walletId = stableDocumentId("wallet", openid);
    const data = {
      _openid: openid,
      memberId: member._id,
      status: "active",
      balanceFen: 0,
      principalBalanceFen: 0,
      bonusBalanceFen: 0,
      totalRechargedFen: 0,
      totalBonusFen: 0,
      totalSpentFen: 0,
      processedRechargeIds: [],
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    await db.collection("wallet_accounts").doc(walletId).set({ data });
    return Object.assign({ _id: walletId }, data, {
      enabled: true,
      balance: "0.00",
      principalBalance: "0.00",
      bonusBalance: "0.00"
    });
  }
  return Object.assign({}, wallet, {
    enabled: wallet.status !== "frozen",
    balanceFen: integer(wallet.balanceFen),
    principalBalanceFen: integer(wallet.principalBalanceFen),
    bonusBalanceFen: integer(wallet.bonusBalanceFen),
    balance: money(wallet.balanceFen),
    principalBalance: money(wallet.principalBalanceFen),
    bonusBalance: money(wallet.bonusBalanceFen)
  });
}

function serializeMember(member) {
  const result = Object.assign({}, member);
  delete result._id;
  delete result._openid;
  delete result.phone;
  delete result.agreementAcceptedAt;
  delete result.updatedAt;
  delete result.createdAt;
  return result;
}

function serializeWallet(wallet) {
  return {
    enabled: wallet.enabled === true,
    status: wallet.status || (wallet.enabled === false ? "inactive" : "active"),
    balanceFen: integer(wallet.balanceFen),
    principalBalanceFen: integer(wallet.principalBalanceFen),
    bonusBalanceFen: integer(wallet.bonusBalanceFen),
    balance: wallet.balance || money(wallet.balanceFen),
    principalBalance: wallet.principalBalance || money(wallet.principalBalanceFen),
    bonusBalance: wallet.bonusBalance || money(wallet.bonusBalanceFen)
  };
}

function extractPhone(result) {
  const phoneInfo = result && (result.phoneInfo || result.phone_info || (result.result && (result.result.phoneInfo || result.result.phone_info)));
  return cleanText(phoneInfo && (phoneInfo.phoneNumber || phoneInfo.phone_number || phoneInfo.purePhoneNumber || phoneInfo.pure_phone_number), 30);
}

async function activateMember(openid, event, settings) {
  const name = cleanText(event.name, 20);
  const phoneCode = cleanText(event.phoneCode || event.code, 180);
  const agreementVersion = cleanText(event.agreementVersion, 40) || MEMBER_AGREEMENT_VERSION;
  if (name.length < 2) {
    return { ok: false, code: "MEMBER_NAME_INVALID", message: "请填写至少 2 个字的姓名或称呼" };
  }
  if (event.agreementAccepted !== true) {
    return { ok: false, code: "MEMBER_AGREEMENT_REQUIRED", message: "请先阅读并同意相关规则" };
  }
  if (!phoneCode) {
    return { ok: false, code: "PHONE_CODE_MISSING", message: "请授权手机号后再开通会员" };
  }

  let phoneResult;
  try {
    phoneResult = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
  } catch (error) {
    logMemberCenterError("phone_exchange", openid, error);
    return Object.assign({ ok: false }, phoneExchangeFailure(error));
  }
  const phone = extractPhone(phoneResult);
  if (!/^\+?\d{6,20}$/.test(phone)) {
    logMemberCenterError("phone_payload", openid, new Error("phone info missing or invalid"));
    return { ok: false, code: "PHONE_PAYLOAD_INVALID", message: "手机号验证未完成，请重新授权" };
  }

  await ensureCollection("members");
  const existing = await db.collection("members").where({ _openid: openid }).limit(20).get();
  const saved = pickMember(existing.data);
  const data = {
    _openid: openid,
    name,
    phone,
    status: "active",
    cardNo: saved && saved.cardNo || `SMH ${String(openid).slice(-6).toUpperCase()}`,
    tier: saved && saved.tier || defaultLevels[0].tier,
    discountRate: saved && saved.discountRate || defaultLevels[0].discountRate,
    points: number(saved && saved.points),
    totalSpend: number(saved && saved.totalSpend),
    paidOrders: number(saved && saved.paidOrders),
    agreementVersion,
    agreementAcceptedAt: db.serverDate(),
    activatedAt: saved && saved.activatedAt || db.serverDate(),
    updatedAt: db.serverDate()
  };
  const memberId = saved && saved._id || stableDocumentId("member", openid);
  if (saved && saved._id) {
    await db.collection("members").doc(memberId).update({ data });
  } else {
    await db.collection("members").doc(memberId).set({
      data: Object.assign({}, data, { createdAt: db.serverDate() })
    });
  }
  // member 与 wallet 都使用稳定文档 ID；重试或并发提交会落到同一记录。
  // 若一次调用在两次写入之间中断，下一次读取也会自动补齐钱包。
  await getWallet(openid, Object.assign({ _id: memberId }, data));
  return getMemberCenter(openid, settings);
}

async function simulateRecharge(openid, event, settings) {
  if (!isTestOpenid(openid)) {
    return { ok: false, message: "当前账号未开启测试充值权限" };
  }
  const member = await getMember(openid, settings);
  if (!isActiveMember(member)) {
    return { ok: false, message: "请先开通会员" };
  }
  const plans = await listMembershipPlans();
  const planId = cleanText(event.planId, 80);
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    return { ok: false, message: "充值档位不存在或已停用" };
  }
  const requestId = cleanText(event.requestId, 80).replace(/[^A-Za-z0-9_-]/g, "");
  if (!requestId) {
    return { ok: false, message: "缺少测试请求编号" };
  }

  const wallet = await getWallet(openid, member);
  const processed = Array.isArray(wallet.processedRechargeIds) ? wallet.processedRechargeIds : [];
  if (!processed.includes(requestId)) {
    await db.collection("wallet_accounts").doc(wallet._id).update({
      data: {
        balanceFen: _.inc(plan.totalFen),
        principalBalanceFen: _.inc(plan.principalFen),
        bonusBalanceFen: _.inc(plan.bonusFen),
        totalRechargedFen: _.inc(plan.principalFen),
        totalBonusFen: _.inc(plan.bonusFen),
        processedRechargeIds: _.push(requestId),
        updatedAt: db.serverDate()
      }
    });
    await ensureCollection("wallet_ledger");
    await db.collection("wallet_ledger").doc(`test_${requestId}`).set({
      data: {
        _openid: openid,
        walletId: wallet._id,
        memberId: member._id,
        type: "test_recharge",
        planId: plan.id,
        principalFen: plan.principalFen,
        bonusFen: plan.bonusFen,
        amountFen: plan.totalFen,
        requestId,
        status: "posted",
        note: "测试环境模拟充值，不代表真实微信支付入账",
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  }
  return getMemberCenter(openid, settings);
}

function normalizeCoupon(coupon, claimedIds = {}) {
  const stock = number(coupon.stock);
  const issued = number(coupon.issued);
  const active = coupon.visible !== false && coupon.status !== "已停用" && coupon.status !== "已结束" && isDateActive(coupon.startAt, coupon.endAt);
  return Object.assign({}, coupon, {
    claimable: active && !claimedIds[coupon.id] && (stock === 0 || issued < stock),
    stockLeft: stock === 0 ? 999999 : Math.max(0, stock - issued)
  });
}

async function listUserCoupons(openid) {
  await ensureCollection("user_coupons");
  const result = await db.collection("user_coupons").where({ _openid: openid }).orderBy("claimedAt", "desc").limit(100).get();
  return (result.data || []).map((item) => {
    const expired = item.status === "可使用" && item.endAt && !isDateActive("", item.endAt);
    return Object.assign({}, item, {
      id: item._id,
      displayStatus: expired ? "已过期" : item.status
    });
  });
}

async function listCoupons(openid) {
  await ensureCollection("coupons");
  const userCoupons = await listUserCoupons(openid);
  const claimedIds = userCoupons.reduce((map, item) => {
    if (["可使用", "已锁定", "已使用"].includes(item.status)) {
      map[item.couponId] = true;
    }
    return map;
  }, {});
  const result = await db.collection("coupons").where({ visible: _.neq(false) }).orderBy("createdAt", "desc").limit(100).get();
  const availableCoupons = (result.data || [])
    .filter((item) => item.status !== "已停用")
    .map((item) => normalizeCoupon(item, claimedIds));
  return { userCoupons, availableCoupons };
}

function getSubscriptionTemplates(settings = {}) {
  return Object.keys(templateLabels)
    .map((key) => ({
      key,
      name: templateLabels[key],
      templateId: cleanText(settings[key], 80)
    }))
    .filter((item) => item.templateId);
}

function getStaffSubscriptionTemplates(settings = {}) {
  return Object.keys(staffTemplateLabels)
    .map((key) => ({
      key,
      name: staffTemplateLabels[key],
      templateId: cleanText(settings[key], 80)
    }))
    .filter((item) => item.templateId);
}

async function getStaffNoticeState(openid, settings = {}) {
  const templates = getStaffSubscriptionTemplates(settings);
  const template = templates[0] || null;
  let remaining = 0;
  if (template && template.templateId) {
    try {
      await ensureCollection("subscription_preferences");
      const result = await db.collection("subscription_preferences")
        .where({ _openid: openid, templateId: template.templateId })
        .limit(1)
        .get();
      const pref = result.data && result.data[0];
      remaining = Math.max(0, Number(pref && pref.remaining) || 0);
    } catch (error) {
      remaining = 0;
    }
  }
  return {
    isStaff: isStaffOpenid(openid),
    enabled: settings.staffOrderNoticeEnabled !== false,
    templateId: template ? template.templateId : "",
    templateName: template ? template.name : staffTemplateLabels.staffOrderTemplateId,
    remaining,
    templates
  };
}

async function getMemberCenter(openid, knownSettings) {
  const settings = knownSettings || await readSettings();
  const [member, coupons, staffNotice, plans] = await Promise.all([
    getMember(openid, settings),
    listCoupons(openid),
    getStaffNoticeState(openid, settings),
    listMembershipPlans()
  ]);
  const wallet = await getWallet(openid, member);
  return {
    ok: true,
    member: serializeMember(member),
    wallet: serializeWallet(wallet),
    plans,
    payment: {
      realPaymentReady: String(process.env.REAL_PAYMENT_ENABLED || "").toLowerCase() === "true",
      testRechargeEnabled: isTestOpenid(openid)
    },
    userCoupons: coupons.userCoupons,
    availableCoupons: coupons.availableCoupons,
    subscriptionTemplates: getSubscriptionTemplates(settings),
    staffNotice
  };
}

async function claimCoupon(openid, event = {}) {
  const couponId = cleanText(event.couponId || event.id, 80);
  if (!couponId) {
    return { ok: false, message: "请选择优惠券" };
  }

  await Promise.all([ensureCollection("coupons"), ensureCollection("user_coupons")]);
  const settings = await readSettings();
  const member = await getMember(openid, settings);
  if (!isActiveMember(member)) {
    return { ok: false, message: "开通会员后可领取会员优惠券" };
  }
  const couponResult = await db.collection("coupons").where({ id: couponId }).limit(1).get();
  const coupon = couponResult.data && couponResult.data[0];
  if (!coupon || coupon.visible === false || coupon.status !== "领取中" || !isDateActive(coupon.startAt, coupon.endAt)) {
    return { ok: false, message: "优惠券不可领取" };
  }

  const existing = await db.collection("user_coupons").where({
    _openid: openid,
    couponId,
    status: _.in(["可使用", "已锁定", "已使用"])
  }).count();
  const claimLimit = Math.max(1, Number(coupon.claimLimit || 1));
  if (existing.total >= claimLimit) {
    return { ok: false, message: "已领取过该优惠券" };
  }

  const stock = number(coupon.stock);
  const issued = number(coupon.issued);
  if (stock > 0 && issued >= stock) {
    return { ok: false, message: "优惠券已领完" };
  }

  await db.collection("coupons").doc(coupon._id).update({
    data: {
      issued: _.inc(1),
      updatedAt: db.serverDate()
    }
  });

  const addResult = await db.collection("user_coupons").add({
    data: {
      _openid: openid,
      couponId: coupon.id,
      couponName: coupon.name,
      amount: number(coupon.amount),
      threshold: number(coupon.threshold),
      startAt: coupon.startAt || "",
      endAt: coupon.endAt || "",
      status: "可使用",
      claimedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return { ok: true, id: addResult._id };
}

async function saveSubscription(openid, event = {}) {
  const subscriptions = event.subscriptions || {};
  const templates = event.templates || [];
  await ensureCollection("subscription_preferences");
  const saved = [];

  for (const template of templates) {
    const templateId = cleanText(template.templateId || template.id, 80);
    const status = cleanText(subscriptions[templateId], 20);
    if (!templateId || !status) {
      continue;
    }

    const data = {
      _openid: openid,
      templateId,
      key: cleanText(template.key, 40),
      name: cleanText(template.name, 40),
      lastStatus: status,
      updatedAt: db.serverDate()
    };
    // 店员接单提醒：每次授权累加更多次数，减少反复点授权。
    const acceptDelta = template.key === "staffOrderTemplateId" || data.key === "staffOrderTemplateId"
      ? 20
      : 1;
    const existing = await db.collection("subscription_preferences").where({ _openid: openid, templateId }).limit(1).get();
    if (existing.data && existing.data[0]) {
      await db.collection("subscription_preferences").doc(existing.data[0]._id).update({
        data: Object.assign({}, data, {
          remaining: status === "accept" ? _.inc(acceptDelta) : _.inc(0)
        })
      });
      saved.push(existing.data[0]._id);
    } else {
      const addResult = await db.collection("subscription_preferences").add({
        data: Object.assign({}, data, {
          remaining: status === "accept" ? acceptDelta : 0,
          createdAt: db.serverDate()
        })
      });
      saved.push(addResult._id);
    }
  }

  return { ok: true, saved };
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return {
      ok: true,
      name: "memberCenter",
      activationFlowVersion: MEMBER_AGREEMENT_VERSION,
      testModeEnabled: isTestModeEnabled(),
      realPaymentReady: String(process.env.REAL_PAYMENT_ENABLED || "").toLowerCase() === "true"
    };
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: "无法识别当前用户" };
  }

  const action = cleanText(event.action, 40) || "getMemberCenter";
  try {
    const settings = await readSettings();
    if (action === "activateMember") {
      return await activateMember(OPENID, event, settings);
    }
    if (action === "simulateRecharge") {
      return await simulateRecharge(OPENID, event, settings);
    }
    if (action === "claimCoupon") {
      return await claimCoupon(OPENID, event);
    }
    if (action === "saveSubscription") {
      return await saveSubscription(OPENID, event);
    }
    return await getMemberCenter(OPENID, settings);
  } catch (error) {
    logMemberCenterError(action, OPENID, error);
    return {
      ok: false,
      code: "MEMBER_CENTER_ERROR",
      message: "会员中心暂时繁忙，请稍后重试"
    };
  }
};
