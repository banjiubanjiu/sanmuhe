const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const defaultLevels = [
  { tier: "雅客会员", minSpend: 0, discountRate: 0.98, pointsTarget: 1600 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 0.95, pointsTarget: 5000 },
  { tier: "山房会员", minSpend: 5000, discountRate: 0.92, pointsTarget: 12000 }
];

const templateLabels = {
  orderPaidTemplateId: "订单支付通知",
  orderShippedTemplateId: "订单发货通知",
  reservationTemplateId: "茶室预约通知",
  eventTemplateId: "活动报名通知"
};

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
  const orders = await getPaidOrders(openid);
  const pointRate = Math.max(0, Number(settings.memberPointRate || 1));
  const totalSpend = orders.reduce((sum, order) => sum + number(order.total), 0);
  const points = orders.reduce((sum, order) => sum + number(order.pointsEarned || Math.floor(number(order.total) * pointRate)), 0);
  const levels = getLevelRules(settings);
  const level = getLevelBySpend(totalSpend, levels);
  const nextLevel = getNextLevel(totalSpend, levels);

  const existing = await db.collection("members").where({ _openid: openid }).limit(1).get();
  const saved = existing.data && existing.data[0] ? existing.data[0] : {};
  const member = {
    _openid: openid,
    name: saved.name || "禾熙会员",
    tier: level.tier,
    cardNo: saved.cardNo || `SMH ${String(openid || "000000").slice(-6).toUpperCase()}`,
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

  if (saved._id) {
    await db.collection("members").doc(saved._id).update({ data: member });
  } else {
    member.createdAt = db.serverDate();
    await db.collection("members").add({ data: member });
  }

  return Object.assign({}, saved, member, { levels });
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

async function getMemberCenter(openid) {
  const settings = await readSettings();
  const [member, coupons] = await Promise.all([
    getMember(openid, settings),
    listCoupons(openid)
  ]);
  return {
    ok: true,
    member,
    userCoupons: coupons.userCoupons,
    availableCoupons: coupons.availableCoupons,
    subscriptionTemplates: getSubscriptionTemplates(settings)
  };
}

async function claimCoupon(openid, event = {}) {
  const couponId = cleanText(event.couponId || event.id, 80);
  if (!couponId) {
    return { ok: false, message: "请选择优惠券" };
  }

  await Promise.all([ensureCollection("coupons"), ensureCollection("user_coupons")]);
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
    const existing = await db.collection("subscription_preferences").where({ _openid: openid, templateId }).limit(1).get();
    if (existing.data && existing.data[0]) {
      await db.collection("subscription_preferences").doc(existing.data[0]._id).update({
        data: Object.assign({}, data, {
          remaining: status === "accept" ? _.inc(1) : _.inc(0)
        })
      });
      saved.push(existing.data[0]._id);
    } else {
      const addResult = await db.collection("subscription_preferences").add({
        data: Object.assign({}, data, {
          remaining: status === "accept" ? 1 : 0,
          createdAt: db.serverDate()
        })
      });
      saved.push(addResult._id);
    }
  }

  return { ok: true, saved };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, message: "无法识别当前用户" };
  }

  const action = cleanText(event.action, 40) || "getMemberCenter";
  try {
    if (action === "claimCoupon") {
      return await claimCoupon(OPENID, event);
    }
    if (action === "saveSubscription") {
      return await saveSubscription(OPENID, event);
    }
    return await getMemberCenter(OPENID);
  } catch (error) {
    return {
      ok: false,
      code: "MEMBER_CENTER_ERROR",
      message: error.message || "会员中心服务异常"
    };
  }
};
