/**
 * 下单/支付后引导订阅微信服务通知（支付成功、发货等）
 * 必须由用户点击/支付成功后的同步链路触发，不能静默调用。
 */

function getMemberCenterSafe() {
  try {
    const cloudApi = require("./cloudApi");
    return cloudApi.getMemberCenter();
  } catch (error) {
    return Promise.resolve({ subscriptionTemplates: [] });
  }
}

function saveSubscriptionSafe(res, templates) {
  try {
    const cloudApi = require("./cloudApi");
    return cloudApi.saveSubscription(res, templates).catch(() => null);
  } catch (error) {
    return Promise.resolve(null);
  }
}

/**
 * @param {object} options
 * @param {string[]} [options.keys] 模板 key，如 orderPaidTemplateId / orderShippedTemplateId
 * @param {number} [options.max] 最多同时申请几个（微信上限 3）
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>}
 */
function requestOrderSubscriptions(options = {}) {
  const keys = Array.isArray(options.keys) && options.keys.length
    ? options.keys
    : ["orderPaidTemplateId", "orderShippedTemplateId"];
  const max = Math.min(3, Math.max(1, Number(options.max) || 3));

  if (typeof wx === "undefined" || !wx.requestSubscribeMessage) {
    return Promise.resolve({ ok: false, skipped: true, reason: "unsupported" });
  }

  return getMemberCenterSafe().then((center) => {
    const all = (center && center.subscriptionTemplates) || [];
    const templates = keys
      .map((key) => all.find((item) => item && item.key === key && item.templateId))
      .filter(Boolean)
      .slice(0, max);

    const tmplIds = templates.map((item) => item.templateId).filter(Boolean);
    if (!tmplIds.length) {
      return { ok: true, skipped: true, reason: "no_templates_configured" };
    }

    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds,
        success: (res) => {
          saveSubscriptionSafe(res, templates).finally(() => {
            resolve({ ok: true, result: res, templates });
          });
        },
        fail: (error) => {
          resolve({
            ok: false,
            skipped: true,
            reason: (error && (error.errMsg || error.message)) || "subscribe_fail"
          });
        }
      });
    });
  }).catch(() => ({ ok: false, skipped: true, reason: "member_center_fail" }));
}

module.exports = {
  requestOrderSubscriptions
};
