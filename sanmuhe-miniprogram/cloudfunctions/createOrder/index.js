const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const LOCK_MINUTES = Math.max(1, Number(process.env.ORDER_LOCK_MINUTES || 15));
const FREE_SHIPPING_AMOUNT = Math.max(0, Number(process.env.FREE_SHIPPING_AMOUNT || 0));
const SHIPPING_FEE = Math.max(0, Number(process.env.SHIPPING_FEE || 0));
const DEFAULT_MEMBER_LEVELS = [
  { tier: "雅客会员", minSpend: 0, discountRate: 0.98 },
  { tier: "臻享会员", minSpend: 1600, discountRate: 0.95 },
  { tier: "山房会员", minSpend: 5000, discountRate: 0.92 }
];

const specMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
};

const priceMap = {
  "drink:drink-001": { name: "桂花龙井", price: 28 },
  "drink:drink-002": { name: "芝士抹茶", price: 32 },
  "drink:drink-003": { name: "柠檬红茶", price: 24 },
  "drink:drink-004": { name: "经典龙井茶", price: 22 },
  "drink:drink-005": { name: "白桃乌龙", price: 30 },
  "drink:drink-006": { name: "红豆抹茶", price: 26 },
  "tea:tea-001": { name: "明前龙井", price: 268, unit: "50g" },
  "tea:tea-002": { name: "大红袍", price: 198, unit: "50g" },
  "tea:tea-003": { name: "白毫银针", price: 358, unit: "50g" },
  "tea:tea-004": { name: "碧螺春", price: 198, unit: "50g" },
  "tea:tea-005": { name: "黄山毛峰", price: 158, unit: "50g" },
  "tea:tea-006": { name: "六安瓜片", price: 128, unit: "50g" },
  "tea:tea-007": { name: "信阳毛尖", price: 138, unit: "50g" },
  "tea:tea-008": { name: "滇红金芽", price: 168, unit: "50g" },
  "tea:tea-009": { name: "正山小种", price: 158, unit: "50g" },
  "tea:tea-010": { name: "君山银针", price: 228, unit: "50g" },
  "tea:tea-011": { name: "普洱熟茶", price: 128, unit: "50g" },
  "tea:tea-012": { name: "安化黑茶", price: 118, unit: "50g" },
  "tea:tea-013": { name: "茉莉龙珠", price: 98, unit: "50g" },
  "tea:tea-014": { name: "玻璃煮茶壶", price: 168, unit: "件" },
  "tea:tea-015": { name: "手工盖碗", price: 138, unit: "件" },
  "tea:tea-016": { name: "桂花糕", price: 28, unit: "份" },
  "tea:tea-017": { name: "花样酥点", price: 36, unit: "盒" }
};

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // The collection may already exist; writes below will surface real errors.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeOptions(type, options, trusted) {
  const source = options || {};
  const clean = {};

  if (type === "tea") {
    const unit = cleanText(source.unit, 12);
    const trustedUnit = cleanText(trusted && trusted.unit, 12);
    clean.unit = trustedUnit && !specMultipliers[trustedUnit]
      ? trustedUnit
      : (specMultipliers[unit] ? unit : (trustedUnit || "50g"));
    return clean;
  }

  if (source.temp) {
    clean.temp = cleanText(source.temp, 12);
  }
  if (source.sugar) {
    clean.sugar = cleanText(source.sugar, 12);
  }
  if (source.table) {
    clean.table = cleanText(source.table, 20);
  }
  return clean;
}

function getTrustedPrice(type, basePrice, options) {
  if (type !== "tea") {
    return basePrice;
  }

  return Math.round(basePrice * (specMultipliers[options.unit] || 1));
}

function hasStockControl(item) {
  return item && item.stock !== undefined && item.stock !== null && item.stock !== "";
}

function getRequiredStockUnits(type, quantity, options) {
  if (type === "tea") {
    return quantity * (specMultipliers[options.unit] || 1);
  }
  return quantity;
}

function getInventorySnapshot(item) {
  const stock = Math.max(0, Number(item.stock) || 0);
  const lockedStock = Math.max(0, Number(item.lockedStock) || 0);
  const soldStock = Math.max(0, Number(item.soldStock) || 0);
  return {
    stock,
    lockedStock,
    soldStock,
    availableStock: Math.max(0, stock - lockedStock - soldStock)
  };
}

async function findTrustedItem(type, id) {
  const collection = type === "tea" ? "tea_products" : "drinks";
  await ensureCollection(collection);

  try {
    const result = await db.collection(collection).where({ id }).limit(1).get();
    const item = result.data && result.data[0];
    if (item && item.visible !== false) {
      return {
        collection,
        docId: item._id,
        id: item.id,
        name: cleanText(item.name, 80),
        price: Math.max(0, Number(item.price) || 0),
        unit: cleanText(item.unit, 12),
        image: cleanText(item.thumb || item.image, 240),
        stock: item.stock,
        lockedStock: item.lockedStock,
        soldStock: item.soldStock
      };
    }
  } catch (error) {
    // Fall through to the built-in catalog map.
  }

  const fallback = priceMap[`${type}:${id}`];
  return fallback ? {
    collection,
    docId: "",
    id,
    name: fallback.name,
    price: fallback.price,
    unit: fallback.unit,
    image: ""
  } : null;
}

async function sanitizeItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("订单商品不能为空");
  }

  let subtotal = 0;
  const cleanItems = [];
  const inventoryLocks = [];

  for (const item of items.slice(0, 30)) {
    const type = item.type === "tea" ? "tea" : "drink";
    const id = cleanText(item.id, 40);
    const trusted = await findTrustedItem(type, id);
    if (!trusted) {
      throw new Error("商品不存在或已下架");
    }

    const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    const options = sanitizeOptions(type, item.options, trusted);
    const price = getTrustedPrice(type, trusted.price, options);
    const lineTotal = price * quantity;
    subtotal += lineTotal;

    const cleanItem = {
      id,
      type,
      name: trusted.name,
      price,
      quantity,
      lineTotal,
      options
    };
    if (trusted.image) {
      cleanItem.image = trusted.image;
    }

    if (hasStockControl(trusted)) {
      const requiredStock = getRequiredStockUnits(type, quantity, options);
      const inventory = getInventorySnapshot(trusted);
      if (inventory.availableStock < requiredStock) {
        throw new Error(`${trusted.name} 库存不足`);
      }
      cleanItem.stockUnits = requiredStock;
      inventoryLocks.push({
        collection: trusted.collection,
        docId: trusted.docId,
        id,
        name: trusted.name,
        quantity: requiredStock
      });
    }

    cleanItems.push(cleanItem);
  }

  return {
    cleanItems,
    inventoryLocks,
    subtotal
  };
}

async function lockInventory(locks) {
  const applied = [];

  for (const lock of locks) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }

    const latest = await db.collection(lock.collection).doc(lock.docId).get();
    const item = latest.data;
    const inventory = getInventorySnapshot(item);
    if (inventory.availableStock < lock.quantity) {
      throw new Error(`${lock.name} 库存不足`);
    }

    await db.collection(lock.collection).doc(lock.docId).update({
      data: {
        lockedStock: _.inc(lock.quantity),
        updatedAt: db.serverDate()
      }
    });
    applied.push(lock);
  }

  return applied;
}

async function releaseInventory(locks) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    try {
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
      });
    } catch (error) {
      // Continue releasing the remaining locks.
    }
  }
}

function normalizeDeliveryMethod(value) {
  return value === "shipping" ? "shipping" : "pickup";
}

function calculateShippingFee(deliveryMethod, subtotal) {
  if (deliveryMethod !== "shipping") {
    return 0;
  }
  if (FREE_SHIPPING_AMOUNT > 0 && subtotal >= FREE_SHIPPING_AMOUNT) {
    return 0;
  }
  return SHIPPING_FEE;
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
  try {
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    return result.data && result.data[0] ? result.data[0] : {};
  } catch (error) {
    return {};
  }
}

function getLevelRules(settings = {}) {
  return [
    {
      tier: cleanText(settings.levelOneName, 20) || DEFAULT_MEMBER_LEVELS[0].tier,
      minSpend: number(settings.levelOneMinSpend),
      discountRate: Number(settings.levelOneDiscountRate || DEFAULT_MEMBER_LEVELS[0].discountRate)
    },
    {
      tier: cleanText(settings.levelTwoName, 20) || DEFAULT_MEMBER_LEVELS[1].tier,
      minSpend: number(settings.levelTwoMinSpend || DEFAULT_MEMBER_LEVELS[1].minSpend),
      discountRate: Number(settings.levelTwoDiscountRate || DEFAULT_MEMBER_LEVELS[1].discountRate)
    },
    {
      tier: cleanText(settings.levelThreeName, 20) || DEFAULT_MEMBER_LEVELS[2].tier,
      minSpend: number(settings.levelThreeMinSpend || DEFAULT_MEMBER_LEVELS[2].minSpend),
      discountRate: Number(settings.levelThreeDiscountRate || DEFAULT_MEMBER_LEVELS[2].discountRate)
    }
  ].map((level, index) => ({
    tier: level.tier,
    minSpend: level.minSpend,
    discountRate: level.discountRate > 0 && level.discountRate <= 1 ? level.discountRate : DEFAULT_MEMBER_LEVELS[index].discountRate
  })).sort((a, b) => a.minSpend - b.minSpend);
}

function getLevelBySpend(totalSpend, levels) {
  return levels.reduce((current, level) => totalSpend >= level.minSpend ? level : current, levels[0]);
}

async function getMemberDiscount(openid, settings, cleanItems) {
  await ensureCollection("members");
  const levels = getLevelRules(settings);
  let totalSpend = 0;
  try {
    const existing = await db.collection("members").where({ _openid: openid }).limit(1).get();
    const member = existing.data && existing.data[0];
    totalSpend = number(member && member.totalSpend);
  } catch (error) {
    totalSpend = 0;
  }

  const level = getLevelBySpend(totalSpend, levels);
  const eligibleSubtotal = cleanItems
    .filter((item) => item.type === "tea")
    .reduce((sum, item) => sum + number(item.lineTotal), 0);
  const discountRate = level.discountRate;
  const discount = discountRate < 1 ? Math.round(eligibleSubtotal * (1 - discountRate)) : 0;

  return {
    tier: level.tier,
    discountRate,
    eligibleSubtotal,
    discount
  };
}

async function lockUserCoupon(openid, couponUserId, orderNo, lockedUntil, payableSubtotal) {
  const id = cleanText(couponUserId, 80);
  if (!id) {
    return null;
  }

  await ensureCollection("user_coupons");
  const result = await db.collection("user_coupons").doc(id).get();
  const coupon = result.data;
  if (!coupon || coupon._openid !== openid || coupon.status !== "可使用") {
    throw new Error("优惠券不可用");
  }
  if (!isDateActive(coupon.startAt, coupon.endAt)) {
    throw new Error("优惠券已过期");
  }
  if (number(coupon.threshold) > payableSubtotal) {
    throw new Error(`订单满 ${coupon.threshold} 元可用该优惠券`);
  }

  const discount = Math.min(number(coupon.amount), payableSubtotal);
  if (discount <= 0) {
    throw new Error("优惠券金额无效");
  }

  const claim = await db.collection("user_coupons").where({
    _id: id,
    _openid: openid,
    status: "可使用"
  }).update({
    data: {
      status: "已锁定",
      lockedOrderNo: orderNo,
      lockedUntil,
      discount,
      updatedAt: db.serverDate()
    }
  });

  if (!claim.updated) {
    throw new Error("优惠券已被使用或锁定");
  }

  return {
    userCouponId: id,
    couponId: coupon.couponId,
    name: coupon.couponName,
    amount: number(coupon.amount),
    threshold: number(coupon.threshold),
    discount
  };
}

async function releaseUserCoupon(coupon) {
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  try {
    await db.collection("user_coupons").doc(coupon.userCouponId).update({
      data: {
        status: "可使用",
        lockedOrderNo: "",
        lockedUntil: null,
        discount: 0,
        updatedAt: db.serverDate()
      }
    });
  } catch (error) {
    // Continue returning the order error; coupon state can be repaired from admin logs.
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  let appliedLocks = [];
  let appliedCoupon = null;

  try {
    const { cleanItems, inventoryLocks, subtotal } = await sanitizeItems(event.items);
    const deliveryMethod = normalizeDeliveryMethod(event.deliveryMethod);
    const consignee = cleanText(event.consignee || event.pickupName, 40);
    const phone = cleanText(event.phone || event.pickupPhone, 30);
    const address = cleanText(event.address, 180);
    const pickupNote = cleanText(event.pickupNote, 120);

    if (!consignee || !phone) {
      return { ok: false, message: "请填写联系人和手机号" };
    }
    if (deliveryMethod === "shipping" && !address) {
      return { ok: false, message: "请选择或填写收货地址" };
    }

    const orderNo = `SMH${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    const settings = await readSettings();
    const member = await getMemberDiscount(OPENID, settings, cleanItems);
    const memberDiscount = Math.min(subtotal, member.discount);
    const discountedSubtotal = Math.max(0, subtotal - memberDiscount);
    const shippingFee = calculateShippingFee(deliveryMethod, discountedSubtotal);
    appliedCoupon = await lockUserCoupon(OPENID, event.couponUserId || event.userCouponId, orderNo, lockedUntil, discountedSubtotal);
    const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
    const total = Math.max(0, discountedSubtotal - couponDiscount) + shippingFee;
    if (total <= 0) {
      throw new Error("订单金额需大于 0 元");
    }

    await ensureCollection("orders");
    appliedLocks = await lockInventory(inventoryLocks);

    const addResult = await db.collection("orders").add({
      data: {
        _openid: OPENID,
        orderNo,
        items: cleanItems,
        inventoryLocks: appliedLocks,
        subtotal,
        memberTier: member.tier,
        memberDiscountRate: member.discountRate,
        memberDiscount,
        discountedSubtotal,
        coupon: appliedCoupon,
        couponDiscount,
        shippingFee,
        total,
        deliveryMethod,
        consignee,
        phone,
        address: deliveryMethod === "shipping" ? address : "",
        pickupNote: deliveryMethod === "pickup" ? pickupNote : "",
        remark: cleanText(event.remark, 200),
        source: cleanText(event.source, 40),
        status: "待支付",
        payStatus: "pending",
        lockedUntil,
        lockReleased: false,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    return {
      ok: true,
      id: addResult._id,
      orderNo,
      subtotal,
      memberDiscount,
      couponDiscount,
      shippingFee,
      total,
      deliveryMethod,
      payStatus: "pending",
      lockedUntil: lockedUntil.toISOString()
    };
  } catch (error) {
    if (appliedLocks.length) {
      await releaseInventory(appliedLocks);
    }
    if (appliedCoupon) {
      await releaseUserCoupon(appliedCoupon);
    }
    return {
      ok: false,
      message: error.message || "订单提交失败"
    };
  }
};
