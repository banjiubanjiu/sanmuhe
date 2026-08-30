const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const MEMBER_AGREEMENT_VERSION = "member-wallet-privacy-v2";

const defaultLevels = [
  { tier: "雅客会员", minSpend: 0, discountRate: 1, pointsTarget: 1600 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 1, pointsTarget: 5000 },
  { tier: "山房会员", minSpend: 5000, discountRate: 1, pointsTarget: 12000 }
];

/** 门店公示储值权益（金额单位：分）。正式环境不含联调测试档。 */
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

/** 与 serviceNotify 内置模板保持一致，设置未写入时仍可授权/发送 */
const DEFAULT_STAFF_ORDER_TEMPLATE_ID = "FKt8thCe64EU6d-fLRnwWs2KtM86rVFFjQlP0gFgAKE";

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
  if (!isTestModeEnabled() || !openid) {
    return false;
  }
  // 生产默认：仅白名单可模拟充值。全员开放需显式 MEMBER_TEST_OPEN_ALL=true（禁止上线使用）。
  if (String(process.env.MEMBER_TEST_OPEN_ALL || "").toLowerCase() === "true") {
    return true;
  }
  // 兼容旧变量：MEMBER_TEST_STRICT=false 且未设 OPEN_ALL 时仍只走白名单，避免误开全员。
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

  // 仅首次初始化时补写默认档；后台已调整的档位不再被强制纠正
  for (const plan of DEFAULT_MEMBERSHIP_PLANS) {
    const saved = byId[plan.id];
    if (!saved) {
      await db.collection("membership_plans").add({
        data: Object.assign({}, plan, {
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        })
      });
    }
  }

  // 下架历史联调档（如 recharge-0.01），避免脏数据被其它入口误用
  const allowedIds = new Set(DEFAULT_MEMBERSHIP_PLANS.map((item) => item.id));
  for (const item of existing) {
    if (!item || !item._id || !item.id || allowedIds.has(item.id)) {
      continue;
    }
    if (item.enabled === false) {
      continue;
    }
    if (/recharge-0\.01|测试|联调/i.test(`${item.id} ${item.title || ""}`)) {
      await db.collection("membership_plans").doc(item._id).update({
        data: {
          enabled: false,
          updatedAt: db.serverDate()
        }
      });
    }
  }
}

async function listMembershipPlans() {
  await ensureDefaultMembershipPlans();
  const result = await db.collection("membership_plans")
    .orderBy("sortOrder", "asc")
    .limit(20)
    .get();
  return (result.data || [])
    .filter((item) => item && item.enabled !== false && item.id)
    .map((item) => serializePlan(item));
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

function maskPhone(phone) {
  const value = cleanText(phone, 30);
  if (value.length < 7) {
    return value;
  }
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

/** 联系手机（轻绑定）：user_profiles + 会员记录，不要求开通会员 */
async function readContactPhone(openid) {
  await ensureCollection("members");
  const existing = await db.collection("members").where({ _openid: openid }).limit(20).get();
  const rows = existing.data || [];
  const active = rows.find((item) => item && item.status === "active" && item.phone);
  const anyMember = rows.find((item) => item && item.phone);
  if (active && active.phone) {
    return {
      phone: cleanText(active.phone, 30),
      phoneMasked: maskPhone(active.phone),
      source: "member"
    };
  }
  await ensureCollection("user_profiles");
  const profileId = stableDocumentId("profile", openid);
  try {
    const doc = await db.collection("user_profiles").doc(profileId).get();
    const phone = cleanText(doc.data && doc.data.phone, 30);
    if (phone) {
      return { phone, phoneMasked: maskPhone(phone), source: "profile" };
    }
  } catch (error) {
    // 文档不存在
  }
  if (anyMember && anyMember.phone) {
    return {
      phone: cleanText(anyMember.phone, 30),
      phoneMasked: maskPhone(anyMember.phone),
      source: "member"
    };
  }
  return { phone: "", phoneMasked: "", source: "" };
}

async function saveContactPhone(openid, phone) {
  const value = cleanText(phone, 30);
  if (!/^1\d{10}$/.test(value)) {
    return { ok: false, message: "请填写正确手机号" };
  }
  await ensureCollection("user_profiles");
  const profileId = stableDocumentId("profile", openid);
  const payload = {
    _openid: openid,
    phone: value,
    updatedAt: db.serverDate()
  };
  try {
    await db.collection("user_profiles").doc(profileId).update({
      data: {
        phone: value,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    await db.collection("user_profiles").doc(profileId).set({
      data: Object.assign({}, payload, { createdAt: db.serverDate() })
    });
  }
  // 若已有会员记录，同步手机号，避免两套号
  await ensureCollection("members");
  const existing = await db.collection("members").where({ _openid: openid }).limit(20).get();
  const saved = pickMember(existing.data);
  if (saved && saved._id) {
    await db.collection("members").doc(saved._id).update({
      data: { phone: value, updatedAt: db.serverDate() }
    });
  }
  return {
    ok: true,
    phone: value,
    phoneMasked: maskPhone(value),
    hasPhone: true
  };
}

/** 仅换取手机号并绑定到当前用户（自提/预约等），不开通会员 */
async function resolvePhone(openid, event) {
  const phoneCode = cleanText(event.phoneCode || event.code, 180);
  if (!phoneCode) {
    return { ok: false, code: "PHONE_CODE_MISSING", message: "请授权手机号" };
  }
  let phoneResult;
  try {
    phoneResult = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
  } catch (error) {
    logMemberCenterError("phone_exchange", openid, error);
    return Object.assign({ ok: false }, phoneExchangeFailure(error));
  }
  const phone = extractPhone(phoneResult);
  if (!/^1\d{10}$/.test(phone) && !/^\+?\d{6,20}$/.test(phone)) {
    logMemberCenterError("phone_payload", openid, new Error("phone info missing or invalid"));
    return { ok: false, code: "PHONE_PAYLOAD_INVALID", message: "手机号验证未完成，请重新授权" };
  }
  const saved = await saveContactPhone(openid, phone);
  if (!saved.ok) {
    return saved;
  }
  return {
    ok: true,
    phone: saved.phone,
    phoneMasked: saved.phoneMasked,
    hasPhone: true
  };
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

  const phoneResolved = await resolvePhone(openid, { phoneCode });
  if (!phoneResolved.ok) {
    return phoneResolved;
  }
  const phone = phoneResolved.phone;

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
  const templateId = cleanText(settings.staffOrderTemplateId, 80) || DEFAULT_STAFF_ORDER_TEMPLATE_ID;
  if (!templateId) {
    return [];
  }
  return [{
    key: "staffOrderTemplateId",
    name: staffTemplateLabels.staffOrderTemplateId,
    templateId
  }];
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
  const [member, staffNotice, plans, contact] = await Promise.all([
    getMember(openid, settings),
    getStaffNoticeState(openid, settings),
    listMembershipPlans(),
    readContactPhone(openid)
  ]);
  const wallet = await getWallet(openid, member);
  return {
    ok: true,
    member: serializeMember(member),
    wallet: serializeWallet(wallet),
    plans,
    // 轻绑定联系手机：有号即可自提，无需开通会员
    contact: {
      hasPhone: Boolean(contact.phone),
      phoneMasked: contact.phoneMasked || "",
      source: contact.source || ""
    },
    payment: {
      // 真实微信支付：需 createPayment 配置商户密钥且 REAL_PAYMENT_ENABLED=true
      realPaymentReady: String(process.env.REAL_PAYMENT_ENABLED || "").toLowerCase() === "true",
      testRechargeEnabled: isTestOpenid(openid),
      realPaymentEnabledFlag: String(process.env.REAL_PAYMENT_ENABLED || "").toLowerCase() === "true"
    },
    subscriptionTemplates: getSubscriptionTemplates(settings),
    staffNotice
  };
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
    if (action === "resolvePhone") {
      return await resolvePhone(OPENID, event);
    }
    if (action === "saveContactPhone") {
      return await saveContactPhone(OPENID, event.phone || event.mobile);
    }
    if (action === "simulateRecharge") {
      return await simulateRecharge(OPENID, event, settings);
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
