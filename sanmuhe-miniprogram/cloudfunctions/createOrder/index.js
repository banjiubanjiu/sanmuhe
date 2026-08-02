const cloud = require("wx-server-sdk");
const { sendWeComOrderNotification } = require("./wecomOrderNotify");

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

// 旧版按克重倍率计价；新目录优先使用商品 specs 固定价
const legacySpecMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
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

function normalizeTrustedSpecs(item) {
  if (Array.isArray(item.specs) && item.specs.length) {
    return item.specs.map((spec) => ({
      label: cleanText(spec.label || spec.unit, 40),
      price: Math.max(0, Number(spec.price) || 0),
      stockUnits: Math.max(1, Number(spec.stockUnits) || 1)
    })).filter((spec) => spec.label);
  }
  return [];
}

function resolveTeaSpec(trusted, unitLabel) {
  const specs = trusted.specs || [];
  const requested = cleanText(unitLabel, 40);
  if (specs.length) {
    const matched = specs.find((spec) => spec.label === requested);
    return matched || specs[0];
  }
  if (requested && legacySpecMultipliers[requested]) {
    return {
      label: requested,
      price: Math.round((Number(trusted.price) || 0) * legacySpecMultipliers[requested]),
      stockUnits: legacySpecMultipliers[requested]
    };
  }
  const fallbackUnit = cleanText(trusted.unit, 40) || "默认";
  return {
    label: fallbackUnit,
    price: Math.max(0, Number(trusted.price) || 0),
    stockUnits: 1
  };
}

function getTrustedTeaChoices(trusted) {
  if (Array.isArray(trusted.teaGroups)) {
    const choices = trusted.teaGroups.reduce((result, group) => {
      const options = Array.isArray(group && group.options) ? group.options : [];
      return result.concat(options.map((item) => cleanText(item && item.name ? item.name : item, 40)).filter(Boolean));
    }, []);
    if (choices.length) {
      return choices;
    }
  }
  return cleanText(trusted.notes, 500)
    .split(/[；;]/)
    .reduce((result, segment) => {
      const value = segment.replace(/^([^：:]+)[：:]/, "");
      return result.concat(value.split(/[\/、]/));
    }, [])
    .map((item) => cleanText(item, 40))
    .filter(Boolean);
}

function sanitizeOptions(type, options, trusted) {
  const source = options || {};
  const clean = {};

  if (type === "tea") {
    const resolved = resolveTeaSpec(trusted, source.unit);
    clean.unit = resolved.label;
    return clean;
  }

  clean.unit = cleanText(trusted.unit || source.unit, 12) || "道";
  const choices = getTrustedTeaChoices(trusted);
  const requestedChoice = cleanText(source.teaChoice, 40);
  if (choices.length) {
    if (!requestedChoice) {
      clean.teaChoice = choices.length === 1 ? choices[0] : "到店确认";
    } else if (choices.includes(requestedChoice)) {
      clean.teaChoice = requestedChoice;
    } else {
      throw new Error("所选茶品已调整，请重新选择");
    }
  } else if (requestedChoice) {
    clean.teaChoice = requestedChoice;
  }
  if (source.table) {
    clean.table = cleanText(source.table, 20);
  }
  return clean;
}

function getTrustedPrice(type, trusted, options) {
  if (type !== "tea") {
    return Math.max(0, Number(trusted.price) || 0);
  }
  return resolveTeaSpec(trusted, options && options.unit).price;
}

function hasStockControl(item) {
  return item && item.stock !== undefined && item.stock !== null && item.stock !== "";
}

function getRequiredStockUnits(type, quantity, trusted, options) {
  if (type === "tea") {
    const resolved = resolveTeaSpec(trusted, options && options.unit);
    return quantity * (resolved.stockUnits || 1);
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

async function writeInventoryLog(entry = {}) {
  try {
    await ensureCollection("inventory_logs");
    await db.collection("inventory_logs").add({
      data: Object.assign({
        collection: "",
        docId: "",
        itemId: "",
        itemName: "",
        type: "",
        quantity: 0,
        beforeStock: null,
        afterStock: null,
        beforeLockedStock: null,
        afterLockedStock: null,
        beforeSoldStock: null,
        afterSoldStock: null,
        orderNo: "",
        operator: "system",
        note: "",
        createdAt: db.serverDate()
      }, entry)
    });
  } catch (error) {
    // Inventory logs are operational evidence; order creation should not fail solely because logging failed.
  }
}

async function findTrustedItem(type, id) {
  const collection = type === "tea" ? "tea_products" : "drinks";
  await ensureCollection(collection);

  try {
    const result = await db.collection(collection).where({ id }).limit(1).get();
    const item = result.data && result.data[0];
    if (item && item.visible !== false && item.removed !== true) {
      return {
        collection,
        docId: item._id,
        id: item.id,
        name: cleanText(item.name, 80),
        price: Math.max(0, Number(item.price) || 0),
        unit: cleanText(item.unit, 40),
        notes: cleanText(item.notes, 500),
        teaGroups: Array.isArray(item.teaGroups) ? item.teaGroups : [],
        specs: normalizeTrustedSpecs(item),
        image: cleanText(item.thumb || item.image, 240),
        stock: item.stock,
        lockedStock: item.lockedStock,
        soldStock: item.soldStock
      };
    }
  } catch (error) {
    return null;
  }

  return null;
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
    const price = getTrustedPrice(type, trusted, options);
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
      const requiredStock = getRequiredStockUnits(type, quantity, trusted, options);
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

async function lockInventory(locks, orderNo) {
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
    await writeInventoryLog({
      collection: lock.collection,
      docId: lock.docId,
      itemId: lock.id || "",
      itemName: lock.name || "",
      type: "order_lock",
      quantity: lock.quantity,
      beforeStock: inventory.stock,
      afterStock: inventory.stock,
      beforeLockedStock: inventory.lockedStock,
      afterLockedStock: inventory.lockedStock + lock.quantity,
      beforeSoldStock: inventory.soldStock,
      afterSoldStock: inventory.soldStock,
      orderNo,
      operator: "createOrder",
      note: "创建订单锁定库存"
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
      const latest = await db.collection(lock.collection).doc(lock.docId).get();
      const inventory = getInventorySnapshot(latest.data || {});
      await db.collection(lock.collection).doc(lock.docId).update({
        data: {
          lockedStock: _.inc(-lock.quantity),
          updatedAt: db.serverDate()
        }
      });
      await writeInventoryLog({
        collection: lock.collection,
        docId: lock.docId,
        itemId: lock.id || "",
        itemName: lock.name || "",
        type: "order_lock_rollback",
        quantity: lock.quantity,
        beforeStock: inventory.stock,
        afterStock: inventory.stock,
        beforeLockedStock: inventory.lockedStock,
        afterLockedStock: Math.max(0, inventory.lockedStock - lock.quantity),
        beforeSoldStock: inventory.soldStock,
        afterSoldStock: inventory.soldStock,
        operator: "createOrder",
        note: "订单创建失败回滚库存锁定"
      });
    } catch (error) {
      // Continue releasing the remaining locks.
    }
  }
}

function normalizeDeliveryMethod(value) {
  if (value === "shipping") {
    return "shipping";
  }
  if (value === "onsite" || value === "dine-in" || value === "store") {
    return "onsite";
  }
  return "pickup";
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
    if (!member || member.status !== "active" || !member.phone) {
      return {
        isMember: false,
        tier: "普通顾客",
        discountRate: 1,
        eligibleSubtotal: 0,
        discount: 0
      };
    }
    totalSpend = number(member.totalSpend);
  } catch (error) {
    return {
      isMember: false,
      tier: "普通顾客",
      discountRate: 1,
      eligibleSubtotal: 0,
      discount: 0
    };
  }

  const level = getLevelBySpend(totalSpend, levels);
  const eligibleSubtotal = cleanItems
    .filter((item) => item.type === "tea")
    .reduce((sum, item) => sum + number(item.lineTotal), 0);
  const discountRate = level.discountRate;
  const discount = discountRate < 1 ? Math.round(eligibleSubtotal * (1 - discountRate)) : 0;

  return {
    isMember: true,
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

  if (dbUpdatedCount(claim) <= 0) {
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

function parseList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isManualPayMode(event = {}) {
  const mode = cleanText(event.payMode || event.paymentMode || event.checkoutMode, 20).toLowerCase();
  const source = cleanText(event.source, 40).toLowerCase();
  return mode === "manual" ||
    mode === "offline" ||
    mode === "confirm" ||
    mode === "onsite" ||
    event.skipPayment === true ||
    source === "onsite-cart" ||
    source === "cart-confirm";
}

function isBalancePayMode(event = {}) {
  const mode = cleanText(event.payMode || event.paymentMode || event.checkoutMode, 20).toLowerCase();
  return mode === "balance" || mode === "wallet";
}

function isWechatPayMode(event = {}) {
  const mode = cleanText(event.payMode || event.paymentMode || event.checkoutMode, 20).toLowerCase();
  return mode === "wechat" ||
    mode === "wx" ||
    mode === "wxpay" ||
    mode === "jsapi" ||
    mode === "online";
}

function isOnsiteOrder(event = {}, deliveryMethod = "") {
  // 仅堂饮/现场点单算 onsite；商城自提是 pickup，邮寄是 shipping
  const source = cleanText(event.source, 40).toLowerCase();
  if (deliveryMethod === "onsite") {
    return true;
  }
  return source === "onsite-cart" || source === "dinein-tea-menu";
}

function toFen(value) {
  return Math.max(0, Math.round(number(value) * 100));
}

/** 兼容 wx-server-sdk / CloudBase：update 结果可能是 stats.updated 或 updated */
function dbUpdatedCount(result) {
  if (!result) {
    return 0;
  }
  if (result.stats && result.stats.updated != null) {
    return Number(result.stats.updated) || 0;
  }
  if (result.updated != null) {
    return Number(result.updated) || 0;
  }
  return 0;
}

function splitWalletDebit(wallet, amountFen) {
  const principal = Math.max(0, Math.round(Number(wallet.principalBalanceFen) || 0));
  const bonus = Math.max(0, Math.round(Number(wallet.bonusBalanceFen) || 0));
  const balance = principal + bonus;
  if (balance < amountFen) {
    throw new Error("会员余额不足，请选择柜台付款");
  }
  if (!amountFen || !balance) {
    return { principalFen: 0, bonusFen: 0 };
  }
  let principalFen = Math.round(amountFen * principal / balance);
  let bonusFen = amountFen - principalFen;
  if (principalFen > principal) {
    principalFen = principal;
    bonusFen = amountFen - principalFen;
  }
  if (bonusFen > bonus) {
    bonusFen = bonus;
    principalFen = amountFen - bonusFen;
  }
  return { principalFen, bonusFen };
}

async function debitWallet(openid, member, orderId, orderNo, total) {
  if (!member || !member.isMember) {
    throw new Error("请先开通会员再使用余额支付");
  }
  await Promise.all([ensureCollection("wallet_accounts"), ensureCollection("wallet_ledger")]);
  const result = await db.collection("wallet_accounts").where({ _openid: openid, status: "active" }).limit(1).get();
  const wallet = result.data && result.data[0];
  if (!wallet) {
    throw new Error("未找到可用的会员余额账户");
  }
  const amountFen = toFen(total);
  // 云数据库可能返回 Number 或 { $numberInt }，统一转数字
  const currentBalanceFen = Math.max(0, Math.round(Number(wallet.balanceFen && wallet.balanceFen.$numberInt != null
    ? wallet.balanceFen.$numberInt
    : wallet.balanceFen) || 0));
  const principalNow = Math.max(0, Math.round(Number(wallet.principalBalanceFen && wallet.principalBalanceFen.$numberInt != null
    ? wallet.principalBalanceFen.$numberInt
    : wallet.principalBalanceFen) || 0));
  const bonusNow = Math.max(0, Math.round(Number(wallet.bonusBalanceFen && wallet.bonusBalanceFen.$numberInt != null
    ? wallet.bonusBalanceFen.$numberInt
    : wallet.bonusBalanceFen) || 0));
  const walletNorm = Object.assign({}, wallet, {
    balanceFen: currentBalanceFen,
    principalBalanceFen: principalNow,
    bonusBalanceFen: bonusNow
  });
  const debit = splitWalletDebit(walletNorm, amountFen);

  // 幂等：同一 orderNo 已扣过则直接返回成功，避免重复扣款
  const existingLedger = await db.collection("wallet_ledger").doc(`order_${orderNo}`).get().catch(() => null);
  if (existingLedger && existingLedger.data && existingLedger.data.status === "posted") {
    return {
      amountFen: Math.abs(Number(existingLedger.data.amountFen) || amountFen),
      principalFen: Math.abs(Number(existingLedger.data.principalFen) || debit.principalFen),
      bonusFen: Math.abs(Number(existingLedger.data.bonusFen) || debit.bonusFen),
      balanceAfterFen: existingLedger.data.balanceAfterFen,
      idempotent: true
    };
  }

  const claim = await db.collection("wallet_accounts").where({
    _id: wallet._id,
    _openid: openid,
    status: "active",
    balanceFen: currentBalanceFen
  }).update({
    data: {
      balanceFen: _.inc(-amountFen),
      principalBalanceFen: _.inc(-debit.principalFen),
      bonusBalanceFen: _.inc(-debit.bonusFen),
      totalSpentFen: _.inc(amountFen),
      processedOrderIds: _.push(orderNo),
      updatedAt: db.serverDate()
    }
  });
  if (dbUpdatedCount(claim) <= 0) {
    throw new Error("会员余额已发生变化，请重新确认订单");
  }
  try {
    await db.collection("wallet_ledger").doc(`order_${orderNo}`).set({
      data: {
        _openid: openid,
        walletId: wallet._id,
        memberId: member._id || "",
        orderId,
        orderNo,
        type: "order_payment",
        amountFen: -amountFen,
        principalFen: -debit.principalFen,
        bonusFen: -debit.bonusFen,
        status: "posted",
        balanceAfterFen: currentBalanceFen - amountFen,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
  } catch (ledgerError) {
    // 流水写入失败则尝试回滚扣款，避免只扣钱不落单
    try {
      await db.collection("wallet_accounts").doc(wallet._id).update({
        data: {
          balanceFen: _.inc(amountFen),
          principalBalanceFen: _.inc(debit.principalFen),
          bonusBalanceFen: _.inc(debit.bonusFen),
          totalSpentFen: _.inc(-amountFen),
          updatedAt: db.serverDate()
        }
      });
    } catch (rollbackError) {
      // 保留原始错误
    }
    throw new Error(ledgerError.message || "余额流水写入失败，请重试");
  }
  return {
    amountFen,
    principalFen: debit.principalFen,
    bonusFen: debit.bonusFen,
    balanceAfterFen: currentBalanceFen - amountFen
  };
}

async function confirmPaidInventory(locks, orderNo) {
  for (const lock of locks || []) {
    if (!lock.docId || lock.quantity <= 0) {
      continue;
    }
    const latest = await db.collection(lock.collection).doc(lock.docId).get();
    const inventory = getInventorySnapshot(latest.data || {});
    await db.collection(lock.collection).doc(lock.docId).update({
      data: {
        lockedStock: _.inc(-lock.quantity),
        soldStock: _.inc(lock.quantity),
        updatedAt: db.serverDate()
      }
    });
    await writeInventoryLog({
      collection: lock.collection,
      docId: lock.docId,
      itemId: lock.id || "",
      itemName: lock.name || "",
      type: "order_paid",
      quantity: lock.quantity,
      beforeStock: inventory.stock,
      afterStock: inventory.stock,
      beforeLockedStock: inventory.lockedStock,
      afterLockedStock: Math.max(0, inventory.lockedStock - lock.quantity),
      beforeSoldStock: inventory.soldStock,
      afterSoldStock: inventory.soldStock + lock.quantity,
      orderNo,
      operator: "createOrder",
      note: "会员余额支付确认库存"
    });
  }
}

async function consumeCouponForBalance(coupon, orderId, orderNo) {
  if (!coupon || !coupon.userCouponId) {
    return;
  }
  await db.collection("user_coupons").doc(coupon.userCouponId).update({
    data: {
      status: "已使用",
      usedOrderId: orderId,
      usedOrderNo: orderNo,
      usedAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });
}

function extractTableNo(event = {}, items = []) {
  const direct = cleanText(event.tableNo || event.table || event.tableLabel, 20);
  if (direct) {
    return direct.replace(/^桌号\s*/i, "").replace(/^桌\s*/i, "").slice(0, 20);
  }
  const remark = cleanText(event.remark, 200);
  const fromRemark = remark.match(/桌号\s*([^\s；;，,]+)/);
  if (fromRemark && fromRemark[1]) {
    return cleanText(fromRemark[1], 20);
  }
  for (let i = 0; i < (items || []).length; i += 1) {
    const table = cleanText(items[i] && items[i].options && items[i].options.table, 20);
    if (table) {
      return table.replace(/^桌号\s*/i, "").replace(/^桌\s*/i, "").slice(0, 20);
    }
  }
  return "";
}

/** 已绑定手机号：会员或 user_profiles（与 memberCenter 轻绑定一致） */
async function loadBoundPhone(openid) {
  if (!openid) {
    return "";
  }
  try {
    await ensureCollection("members");
    const memberResult = await db.collection("members").where({ _openid: openid }).limit(20).get();
    const rows = memberResult.data || [];
    const active = rows.find((item) => item && item.status === "active" && item.phone);
    if (active && active.phone) {
      return cleanText(active.phone, 30);
    }
    const any = rows.find((item) => item && item.phone);
    if (any && any.phone) {
      return cleanText(any.phone, 30);
    }
  } catch (error) {
    // continue
  }
  try {
    await ensureCollection("user_profiles");
    const crypto = require("crypto");
    const digest = crypto.createHash("sha256").update(String(openid || "")).digest("hex").slice(0, 24);
    const profileId = `profile_${digest}`;
    const doc = await db.collection("user_profiles").doc(profileId).get();
    return cleanText(doc.data && doc.data.phone, 30);
  } catch (error) {
    return "";
  }
}

function buildOrderRemark(tableNo, rawRemark) {
  const table = cleanText(tableNo, 20);
  const note = cleanText(rawRemark, 200);
  const head = table ? `桌号 ${table}` : "";
  if (head && note) {
    if (note.indexOf(head) >= 0 || note.indexOf(`桌号${table}`) >= 0) {
      return note;
    }
    return `${head}；${note}`.slice(0, 200);
  }
  return head || note;
}

async function notifyStaffWechat(order = {}) {
  const tableNo = cleanText(order.tableNo, 20);
  const remark = buildOrderRemark(tableNo, order.remark) || (tableNo ? `桌号 ${tableNo}` : "柜台扫码付款");
  try {
    const result = await cloud.callFunction({
      name: "serviceNotify",
      data: {
        action: "notifyStaff",
        kind: "orderStaffNew",
        payload: {
          orderNo: order.orderNo || "",
          total: order.total,
          status: order.payStatus === "paid" ? "余额已支付" : "待扫码付款",
          itemSummary: order.itemSummary || "",
          remark,
          time: ""
        }
      }
    });
    return result && result.result ? result.result : result;
  } catch (error) {
    return {
      ok: false,
      message: error.message || "调用 serviceNotify 失败"
    };
  }
}

async function notifyAdmins(order = {}) {
  const itemSummary = (order.items || [])
    .map((item) => `${item.name}x${item.quantity}`)
    .join("、")
    .slice(0, 120);
  const tableNo = cleanText(order.tableNo, 20);
  const remark = buildOrderRemark(tableNo, order.remark);
  const tableTip = tableNo ? `桌号 ${tableNo}，` : "";
  const paidByBalance = order.payStatus === "paid" && order.payMode === "balance";
  const notice = {
    type: "order_created",
    orderNo: order.orderNo || "",
    orderId: order.orderId || "",
    total: number(order.total),
    status: order.status || "待确认",
    payStatus: order.payStatus || "manual",
    consignee: order.consignee || "",
    phone: order.phone || "",
    deliveryMethod: order.deliveryMethod || "pickup",
    tableNo,
    itemSummary,
    remark,
    read: false,
    createdAt: db.serverDate()
  };

  try {
    await ensureCollection("admin_notices");
    await db.collection("admin_notices").add({ data: notice });
  } catch (error) {
    // Notice board is best-effort; order creation should still succeed.
  }

  try {
    await ensureCollection("notification_logs");
    await db.collection("notification_logs").add({
      data: Object.assign({}, notice, {
        channel: "admin_notice",
        target: "admin",
        message: paidByBalance
          ? `会员余额订单 ${notice.orderNo} 已支付，${tableTip}合计 ¥${notice.total}，请安排制作。${itemSummary || ""}`
          : `现场点单 ${notice.orderNo} 已提交，${tableTip}合计 ¥${notice.total}。${itemSummary || ""}`
      })
    });
  } catch (error) {
    // Logging is best-effort.
  }

  const wechat = await notifyStaffWechat(Object.assign({}, notice, { itemSummary, tableNo, remark, payMode: order.payMode }));
  return {
    adminOpenids: parseList(process.env.ADMIN_OPENIDS).length,
    staffOpenids: parseList(process.env.STAFF_OPENIDS || process.env.ADMIN_OPENIDS).length,
    noticeWritten: true,
    wechat
  };
}

async function notifyWeComOrder(order = {}) {
  try {
    return await sendWeComOrderNotification(order);
  } catch (error) {
    console.warn(`[wecom-order] ${error.message || "发送失败"}`);
    return {
      ok: false,
      message: error.message || "企业微信新订单提醒发送失败"
    };
  }
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return {
      ok: true,
      name: "createOrder",
      wecomOrderNotifyConfigured: Boolean(process.env.WECOM_ORDER_WEBHOOK)
    };
  }

  if (event.action === "testWeComNotify") {
    try {
      const { sendWeComTestNotification } = require("./wecomOrderNotify");
      const result = await sendWeComTestNotification();
      return Object.assign({ ok: true, name: "createOrder" }, result);
    } catch (error) {
      return {
        ok: false,
        code: "WECOM_TEST_FAILED",
        message: error && error.message ? error.message : "企业微信测试失败"
      };
    }
  }

  const { OPENID } = cloud.getWXContext();
  let appliedLocks = [];
  let appliedCoupon = null;
  let createdOrderId = "";
  let walletDebited = false;

  try {
    const { cleanItems, inventoryLocks, subtotal } = await sanitizeItems(event.items);
    const deliveryMethod = normalizeDeliveryMethod(event.deliveryMethod);
    const balancePay = isBalancePayMode(event);
    // 小程序收银台已去掉柜台付款：禁止 manual / skipPayment 免付落单
    if (!balancePay && isManualPayMode(event)) {
      return {
        ok: false,
        code: "MANUAL_PAY_DISABLED",
        message: "小程序仅支持微信支付或会员余额，请选择在线支付"
      };
    }
    const wechatPay = !balancePay;
    // 兼容旧后台逻辑字段；小程序侧 manual 已关闭
    const manualPay = false;
    const onsiteOrder = isOnsiteOrder(event, deliveryMethod) || deliveryMethod === "onsite";
    const tableNo = extractTableNo(event, cleanItems);
    const orderRemark = buildOrderRemark(tableNo, event.remark);
    let consignee = cleanText(event.consignee || event.pickupName, 40) || (onsiteOrder ? "到店顾客" : "");
    // 现场点单允许非手机号占位；自提优先用已绑定手机号。
    let phone = cleanText(event.phone || event.pickupPhone, 30) || (onsiteOrder ? "现场" : "");
    if (!onsiteOrder && deliveryMethod === "pickup" && !/^1\d{10}$/.test(phone)) {
      const boundPhone = await loadBoundPhone(OPENID);
      if (boundPhone) {
        phone = boundPhone;
      }
    }
    if (!onsiteOrder && deliveryMethod === "pickup" && !consignee) {
      consignee = "顾客";
    }
    const address = cleanText(event.address, 180);
    // 微信 chooseAddress 结构化字段（便于履约/物流）
    const province = cleanText(event.province, 40);
    const city = cleanText(event.city, 40);
    const district = cleanText(event.district, 40);
    const detailAddress = cleanText(event.detailAddress, 120);
    const postalCode = cleanText(event.postalCode, 12);
    const pickupNote = cleanText(event.pickupNote, 120)
      || (tableNo ? `桌号 ${tableNo}` : "")
      || (deliveryMethod === "pickup" && phone ? `到店自提 · ${consignee} ${phone}` : "");

    // 堂饮不强制联系人；自提要手机号（可来自绑定）；快递要地址。
    if (!onsiteOrder) {
      if (deliveryMethod === "pickup") {
        if (!/^1\d{10}$/.test(phone)) {
          return { ok: false, message: "请先授权取货手机号" };
        }
      } else {
        if (!consignee || !phone) {
          return { ok: false, message: "请填写联系人和手机号" };
        }
        if (deliveryMethod === "shipping" && !address) {
          return { ok: false, message: "请选择或填写收货地址" };
        }
      }
    }

    const orderNo = `SMH${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    // 微信支付需库存锁定与支付超时；余额/柜台到店不锁超时
    const lockedUntil = wechatPay
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
      : null;
    const settings = await readSettings();
    const member = await getMemberDiscount(OPENID, settings, cleanItems);
    const memberDiscount = Math.min(subtotal, member.discount);
    const discountedSubtotal = Math.max(0, subtotal - memberDiscount);
    const shippingFee = calculateShippingFee(onsiteOrder ? "onsite" : deliveryMethod, discountedSubtotal);
    appliedCoupon = await lockUserCoupon(OPENID, event.couponUserId || event.userCouponId, orderNo, lockedUntil, discountedSubtotal);
    const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
    const total = Math.max(0, discountedSubtotal - couponDiscount) + shippingFee;
    if (total <= 0) {
      throw new Error("订单金额需大于 0 元");
    }

    await ensureCollection("orders");
    appliedLocks = await lockInventory(inventoryLocks, orderNo);

    const orderStatus = balancePay
      ? "余额支付处理中"
      : (wechatPay ? "待支付" : "待确认");
    const payStatus = balancePay
      ? "balance_processing"
      : (wechatPay ? "pending" : "manual");
    const finalDeliveryMethod = onsiteOrder ? "onsite" : deliveryMethod;
    const payModeValue = balancePay ? "balance" : (wechatPay ? "wechat" : "manual");
    const payHint = balancePay
      ? "会员余额支付"
      : (wechatPay ? "微信支付" : "现场扫码付款");

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
        deliveryMethod: finalDeliveryMethod,
        consignee: consignee || "到店顾客",
        phone: phone || (onsiteOrder ? "现场" : ""),
        address: finalDeliveryMethod === "shipping" ? address : "",
        province: finalDeliveryMethod === "shipping" ? province : "",
        city: finalDeliveryMethod === "shipping" ? city : "",
        district: finalDeliveryMethod === "shipping" ? district : "",
        detailAddress: finalDeliveryMethod === "shipping" ? detailAddress : "",
        postalCode: finalDeliveryMethod === "shipping" ? postalCode : "",
        pickupNote: finalDeliveryMethod === "pickup" || finalDeliveryMethod === "onsite" ? pickupNote : "",
        tableNo,
        remark: orderRemark,
        source: cleanText(event.source, 40) || (onsiteOrder ? "onsite-cart" : ""),
        status: orderStatus,
        payStatus,
        payMode: payModeValue,
        payHint,
        lockedUntil,
        lockReleased: false,
        adminNotified: !wechatPay,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    createdOrderId = addResult._id;

    // 在线付成功：堂饮直接「已付款」；自提/邮寄保留履约态
    function fulfillmentStatusAfterPaid(method) {
      if (method === "pickup") {
        return "待自提";
      }
      if (method === "onsite") {
        return "已付款";
      }
      return "待发货";
    }

    let walletPayment = null;
    if (balancePay) {
      walletPayment = await debitWallet(OPENID, member, addResult._id, orderNo, total);
      walletDebited = true;
      await Promise.all([
        confirmPaidInventory(appliedLocks, orderNo),
        consumeCouponForBalance(appliedCoupon, addResult._id, orderNo)
      ]);
      const paidStatus = fulfillmentStatusAfterPaid(finalDeliveryMethod);
      await db.collection("orders").doc(addResult._id).update({
        data: {
          status: paidStatus,
          payStatus: "paid",
          paidAt: db.serverDate(),
          walletPayment,
          updatedAt: db.serverDate()
        }
      });
      appliedLocks = [];
      appliedCoupon = null;
    }

    const finalStatus = balancePay ? fulfillmentStatusAfterPaid(finalDeliveryMethod) : orderStatus;
    const finalPayStatus = balancePay ? "paid" : payStatus;
    // 微信支付：先付成功再通知门店（回调 wechatPayNotify 再推）；未付款不报「新订单」
    let wecomNotify = null;
    let adminNotify = null;
    if (!wechatPay) {
      wecomNotify = await notifyWeComOrder({
        orderNo,
        total,
        status: finalStatus,
        payStatus: finalPayStatus,
        // 传规范化渠道码，企微文案会展开成「怎么付 + 去哪查」
        payMode: payModeValue,
        event: balancePay ? "order_paid" : "order_created",
        deliveryMethod: finalDeliveryMethod,
        source: cleanText(event.source, 40) || (onsiteOrder ? "dinein-tea-menu" : "retail-tea-catalog"),
        tableNo,
        remark: orderRemark,
        items: cleanItems,
        consignee: consignee || "",
        phone: phone || "",
        address: address || "",
        transactionId: walletPayment && walletPayment.transactionId ? walletPayment.transactionId : ""
      });

      if (manualPay || balancePay) {
        adminNotify = await notifyAdmins({
          orderId: addResult._id,
          orderNo,
          total,
          status: finalStatus,
          payStatus: finalPayStatus,
          payMode: payModeValue,
          consignee: consignee || "到店顾客",
          phone: phone || "现场",
          deliveryMethod: finalDeliveryMethod,
          tableNo,
          remark: orderRemark,
          items: cleanItems
        });
      }
    }

    return {
      ok: true,
      id: addResult._id,
      orderNo,
      subtotal,
      memberDiscount,
      couponDiscount,
      shippingFee,
      total,
      deliveryMethod: finalDeliveryMethod,
      status: finalStatus,
      payStatus: finalPayStatus,
      payMode: payModeValue,
      walletPayment,
      lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
      adminNotify,
      wecomNotify
    };
  } catch (error) {
    if (createdOrderId) {
      try {
        await db.collection("orders").doc(createdOrderId).update({
          data: {
            status: "支付异常待处理",
            payStatus: "balance_error",
            paymentError: error.message || "会员余额支付失败",
            updatedAt: db.serverDate()
          }
        });
      } catch (updateError) {
        // Preserve the original error.
      }
    }
    if (appliedLocks.length && !walletDebited) {
      await releaseInventory(appliedLocks);
    }
    if (appliedCoupon && !walletDebited) {
      await releaseUserCoupon(appliedCoupon);
    }
    return {
      ok: false,
      message: error.message || "订单提交失败"
    };
  }
};
