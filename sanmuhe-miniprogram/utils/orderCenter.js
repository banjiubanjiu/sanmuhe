const ACTIVE_STATUSES = ["已付款", "制作中", "待确认", "待发货", "待自提", "已发货", "异常待处理", "支付异常待处理"];
const AFTER_SALE_STATUSES = ["申请售后", "审核中", "处理中", "已退款", "已拒绝", "已关闭"];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return number(value).toFixed(2);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object") {
    if (value.$date) {
      return toDate(value.$date);
    }
    if (value.seconds !== undefined) {
      return toDate(Number(value.seconds) * 1000);
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value, fallback = "") {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function optionText(item = {}) {
  const options = item.options || {};
  return [options.teaChoice, options.unit, options.table ? `桌号 ${options.table}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function statusTone(status) {
  const text = String(status || "");
  if (/取消|拒绝|异常/.test(text)) {
    return "danger";
  }
  if (/完成|已退款|已使用/.test(text)) {
    return "quiet";
  }
  if (/待支付|待付款/.test(text)) {
    return "warning";
  }
  if (/已付款|制作中|待|申请|审核|处理|发货/.test(text)) {
    return "active";
  }
  return "neutral";
}

function statusCopy(order = {}) {
  const status = order.status || "待处理";
  if (order.afterSaleStatus && !["已关闭"].includes(order.afterSaleStatus)) {
    return {
      label: order.afterSaleStatus,
      hint: order.afterSaleStatus === "已退款"
        ? `退款 ¥${money(order.refundAmount)} 已处理`
        : "售后申请正在处理中",
      tone: statusTone(order.afterSaleStatus)
    };
  }
  const copies = {
    "待支付": order.paymentStarted
      ? "尚未支付成功，请继续完成付款；付款成功后订单才生效"
      : "请先完成支付，付款成功后订单才会通知门店",
    "已付款": "已支付成功，门店已收到订单",
    "制作中": "已支付成功，门店已收到订单",
    "待确认": "门店正在处理本次订单",
    "待发货": "商品备货完成后将安排发出",
    "待自提": "请凭订单号到店取茶",
    "已发货": "商品已发出，可核对物流信息",
    "已完成": "本次订单已完成",
    "已取消": "本次订单已取消",
    "异常待处理": "订单状态需要门店协助确认",
    "支付异常待处理": "支付结果需要门店协助确认"
  };
  return {
    label: status,
    hint: copies[status] || "订单状态已更新",
    tone: statusTone(status)
  };
}

function deliveryText(order = {}) {
  if (order.deliveryMethod === "shipping") {
    return "快递配送";
  }
  if (order.deliveryMethod === "onsite") {
    return order.tableNo ? `现场点单 · ${order.tableNo}` : "现场点单";
  }
  return "到店自提";
}

function deliveryDetail(order = {}) {
  if (order.deliveryMethod === "shipping") {
    return order.address || [order.province, order.city, order.district, order.detailAddress].filter(Boolean).join("") || "收货地址待确认";
  }
  if (order.tableNo) {
    return `桌号 ${order.tableNo}`;
  }
  return order.pickupNote || order.remark || "禾煦门店";
}

function buildTimeline(order = {}) {
  const steps = [];
  const push = (title, time, detail, tone = "done") => {
    if (!time) {
      return;
    }
    steps.push({
      title,
      timeText: formatDate(time),
      detail,
      tone
    });
  };

  push("订单已提交", order.createdAt, `订单号 ${order.orderNo || order._id || ""}`);
  push("支付已确认", order.paidAt, order.payMode === "balance" ? "会员余额支付" : "微信支付");
  push("门店已确认", order.confirmedAt, order.deliveryMethod === "shipping" ? "开始备货" : "开始准备茶品");
  push("商品已发出", order.shippedAt, [order.trackingCompany, order.trackingNo].filter(Boolean).join(" "));
  push("订单已完成", order.completedAt, order.fulfillmentStatus === "delivered" ? "顾客已确认收货" : "门店已完成交付");
  push("订单已取消", order.cancelledAt || (order.status === "已取消" ? order.updatedAt : null), order.cancelReason || "订单已关闭", "quiet");
  push(order.afterSaleStatus || "售后状态更新", order.afterSaleUpdatedAt, order.afterSaleReason || order.afterSaleNote || "", statusTone(order.afterSaleStatus));

  return steps.reverse().map((step, index) => Object.assign({}, step, {
    latest: index === 0
  }));
}

function normalizeOrder(order = {}) {
  const status = statusCopy(order);
  const items = (order.items || []).map((item, index) => ({
    id: item.id || `${order.orderNo || order._id || "order"}-${index}`,
    type: item.type || "",
    name: item.name || "茶品",
    image: item.image || "",
    quantity: Math.max(1, number(item.quantity) || 1),
    price: number(item.price),
    priceText: money(item.price),
    lineTotalText: money(item.lineTotal !== undefined ? item.lineTotal : number(item.price) * number(item.quantity || 1)),
    options: item.options || {},
    optionText: optionText(item)
  }));
  const id = order._id || order.id || order.orderNo || "";
  const afterSaleOpen = !!order.afterSaleStatus && !["已退款", "已拒绝", "已关闭"].includes(order.afterSaleStatus);
  const paidOrFulfilling = order.payStatus === "paid"
    || order.payStatus === "manual_confirmed"
    || ["已付款", "制作中", "待发货", "待自提", "已发货", "已完成"].includes(order.status);

  return Object.assign({}, order, {
    id,
    displayId: order.orderNo || id,
    createdAtText: formatDate(order.createdAt, "时间待确认"),
    updatedAtText: formatDate(order.updatedAt),
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    itemSummary: items.map((item) => `${item.name} ×${item.quantity}`).join("，") || "商品明细待确认",
    previewImage: items.find((item) => item.image) ? items.find((item) => item.image).image : "",
    statusLabel: status.label,
    statusHint: status.hint,
    statusTone: status.tone,
    deliveryText: deliveryText(order),
    deliveryDetail: deliveryDetail(order),
    subtotalText: money(order.subtotal !== undefined ? order.subtotal : order.total),
    discountText: money(order.discount),
    shippingFeeText: money(order.shippingFee),
    totalText: money(order.total),
    refundAmountText: money(order.refundAmount),
    canPay: order.status === "待支付" && order.payStatus !== "paid",
    // 未付款均可取消（含已预下单）；付成功后不可取消
    canCancel: ["待支付", "待确认"].includes(order.status)
      && order.payStatus !== "paid"
      && order.payStatus !== "confirming",
    canConfirmReceipt: order.deliveryMethod === "shipping" && order.status === "已发货",
    canApplyAfterSale: paidOrFulfilling
      && order.status !== "已取消"
      && order.afterSaleStatus !== "已退款"
      && !afterSaleOpen,
    canViewLogistics: !!order.trackingNo,
    afterSaleOpen,
    timeline: buildTimeline(order)
  });
}

function orderGroup(order = {}) {
  if (order.afterSaleStatus && AFTER_SALE_STATUSES.includes(order.afterSaleStatus)) {
    return "afterSale";
  }
  if (order.status === "待支付") {
    return "pending";
  }
  if (ACTIVE_STATUSES.includes(order.status)) {
    return "active";
  }
  if (["已完成", "已取消"].includes(order.status)) {
    return "completed";
  }
  return "all";
}

module.exports = {
  ACTIVE_STATUSES,
  AFTER_SALE_STATUSES,
  formatDate,
  money,
  normalizeOrder,
  orderGroup,
  statusTone
};
