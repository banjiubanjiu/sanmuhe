const DEFAULT_RANGE_DAYS = 30;
const ALLOWED_RANGE_DAYS = new Set([7, 30, 90]);

function normalizeRangeDays(value) {
  const days = Number(value);
  return ALLOWED_RANGE_DAYS.has(days) ? days : DEFAULT_RANGE_DAYS;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.$date) return toDate(value.$date);
  if (value.seconds) return new Date(Number(value.seconds) * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = toDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value, offset) {
  const date = toDate(value) || new Date();
  const shifted = new Date(date.getTime());
  shifted.setHours(12, 0, 0, 0);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function roundMoney(value) {
  return Math.round(number(value) * 100) / 100;
}

function roundRate(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function orderDate(order = {}) {
  return order.paidAt || order.payAt || order.paymentAt || order.createdAt;
}

function isPaidOrder(order = {}) {
  const payStatus = String(order.payStatus || "").toLowerCase();
  const status = String(order.status || "");
  return Boolean(order.transactionId)
    || ["paid", "partial_refunded", "refunded", "refunding", "paid_retained"].includes(payStatus)
    || ["已付款", "制作中", "待发货", "待自提", "已发货", "已完成", "已退款"].includes(status);
}

function orderRefund(order = {}) {
  return Math.min(
    number(order.total),
    Math.max(number(order.refundAmount), number(order.cancelRefundAmount), number(order.refundedAmount))
  );
}

function orderChannel(order = {}) {
  const raw = String(order.bizType || order.orderBizType || order.channel || "").toLowerCase();
  const source = String(order.source || "").toLowerCase();
  const delivery = String(order.deliveryMethod || "").toLowerCase();
  const hasDrinkItem = (Array.isArray(order.items) ? order.items : []).some((item) => item.type === "drink");
  if (["dinein", "dine-in", "onsite"].includes(raw) || delivery === "onsite" || /dinein|onsite|tea-menu/.test(source) || hasDrinkItem) {
    return { key: "dinein", name: "堂饮茶单" };
  }
  if (["retail", "mall", "shop"].includes(raw) || /retail|shop|mall/.test(source)) {
    return { key: "retail", name: "零售茶品" };
  }
  return { key: "other", name: "其他订单" };
}

function itemCategory(item = {}, order = {}) {
  const channel = orderChannel(order);
  if (channel.key === "dinein" || item.type === "drink") return "堂饮";
  return "零售";
}

function inPeriod(value, startDate, endDate) {
  const key = dateKey(value);
  return Boolean(key && key >= startDate && key <= endDate);
}

function isCancelled(record = {}) {
  return /^(已取消|cancelled|canceled)$/i.test(String(record.status || "").trim());
}

function percentageChange(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return roundRate(((currentValue - previousValue) / previousValue) * 100);
}

function summarizePeriod({ orders, reservations, signups, startDate, endDate }) {
  const paidOrders = orders.filter((order) => isPaidOrder(order) && inPeriod(orderDate(order), startDate, endDate));
  const activeReservations = reservations.filter((item) => !isCancelled(item) && inPeriod(item.createdAt, startDate, endDate));
  const activeSignups = signups.filter((item) => !isCancelled(item) && inPeriod(item.createdAt, startDate, endDate));
  const grossRevenue = roundMoney(paidOrders.reduce((sum, order) => sum + number(order.total), 0));
  const refunds = roundMoney(paidOrders.reduce((sum, order) => sum + orderRefund(order), 0));
  const revenue = roundMoney(Math.max(0, grossRevenue - refunds));
  const completedOrders = paidOrders.filter((order) => String(order.status || "") === "已完成").length;

  return {
    paidOrders,
    summary: {
      revenue,
      grossRevenue,
      refunds,
      orders: paidOrders.length,
      averageOrder: paidOrders.length ? roundMoney(grossRevenue / paidOrders.length) : 0,
      reservations: activeReservations.length,
      signups: activeSignups.length,
      refundRate: grossRevenue ? roundRate((refunds / grossRevenue) * 100) : 0,
      completionRate: paidOrders.length ? roundRate((completedOrders / paidOrders.length) * 100) : 0
    }
  };
}

function buildAnalytics({ orders = [], reservations = [], signups = [], rangeDays, now = new Date(), readLimit = 1000 }) {
  const days = normalizeRangeDays(rangeDays);
  const endDate = dateKey(now);
  const startDate = dateKey(shiftDate(now, -(days - 1)));
  const previousEndDate = dateKey(shiftDate(now, -days));
  const previousStartDate = dateKey(shiftDate(now, -(days * 2 - 1)));
  const current = summarizePeriod({ orders, reservations, signups, startDate, endDate });
  const previous = summarizePeriod({ orders, reservations, signups, startDate: previousStartDate, endDate: previousEndDate });

  const trendBucket = {};
  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const key = dateKey(shiftDate(now, offset));
    trendBucket[key] = { date: key, amount: 0, grossRevenue: 0, refunds: 0, orders: 0 };
  }

  const channelBucket = {};
  const topItems = {};
  current.paidOrders.forEach((order) => {
    const day = dateKey(orderDate(order));
    const gross = number(order.total);
    const refund = orderRefund(order);
    if (trendBucket[day]) {
      trendBucket[day].grossRevenue += gross;
      trendBucket[day].refunds += refund;
      trendBucket[day].amount += Math.max(0, gross - refund);
      trendBucket[day].orders += 1;
    }

    const channel = orderChannel(order);
    if (!channelBucket[channel.key]) {
      channelBucket[channel.key] = { key: channel.key, name: channel.name, amount: 0, orders: 0 };
    }
    channelBucket[channel.key].amount += gross;
    channelBucket[channel.key].orders += 1;

    (Array.isArray(order.items) ? order.items : []).forEach((item) => {
      const name = String(item.name || item.title || "未命名项目").trim() || "未命名项目";
      const type = itemCategory(item, order);
      const key = `${type}:${name}`;
      if (!topItems[key]) topItems[key] = { name, type, amount: 0, count: 0 };
      topItems[key].amount += number(item.lineTotal || number(item.price) * number(item.quantity));
      topItems[key].count += number(item.quantity || 1);
    });
  });

  const grossTotal = current.summary.grossRevenue;
  const channels = Object.values(channelBucket)
    .map((item) => ({
      ...item,
      amount: roundMoney(item.amount),
      share: grossTotal ? roundRate((item.amount / grossTotal) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);
  const rankedItems = Object.values(topItems)
    .map((item) => ({
      ...item,
      amount: roundMoney(item.amount),
      share: grossTotal ? roundRate((item.amount / grossTotal) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const comparableKeys = ["revenue", "grossRevenue", "refunds", "orders", "averageOrder", "reservations", "signups"];
  const comparison = comparableKeys.reduce((result, key) => {
    result[key] = percentageChange(current.summary[key], previous.summary[key]);
    return result;
  }, {});

  return {
    summary: current.summary,
    previous: previous.summary,
    comparison,
    trend: Object.values(trendBucket).map((item) => ({
      ...item,
      amount: roundMoney(item.amount),
      grossRevenue: roundMoney(item.grossRevenue),
      refunds: roundMoney(item.refunds),
      label: item.date.slice(5).replace("-", "/")
    })),
    channels,
    topItems: rankedItems,
    scope: {
      days,
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
      readLimit,
      ordersRead: orders.length,
      reservationsRead: reservations.length,
      signupsRead: signups.length,
      limited: orders.length >= readLimit || reservations.length >= readLimit || signups.length >= readLimit,
      revenueBasis: "按支付日期归属订单，净收入为订单金额减已记录退款；退款不向商品和渠道分摊"
    },
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildAnalytics,
  normalizeRangeDays
};
