const DEFAULT_PURPOSE = "为了完成订单、预约、报名和售后服务，我们需要处理你的联系人、手机号、收货地址或报名备注。";
const AGREE_BUTTON_ID = "privacy-agree-btn";

function getContractName(setting = {}) {
  return setting.privacyContractName || "用户隐私保护指引";
}

function openPrivacyContract() {
  if (typeof wx.openPrivacyContract === "function") {
    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({ title: "暂无法打开隐私协议", icon: "none" });
      }
    });
    return;
  }
  wx.showModal({
    title: "隐私保护指引",
    content: "请在小程序右上角菜单中查看隐私保护指引。",
    showCancel: false
  });
}

function finishPrivacy(page, accepted) {
  const resolve = page.__privacyResolve;
  const eventResolve = page.__privacyEventResolve;
  let continuedPendingEvent = false;

  // 微信会在 resolve 后校验 buttonId 对应的按钮是否刚刚被点击。
  // 必须先续接被挂起的隐私接口，再隐藏含同意按钮的弹层。
  if (typeof eventResolve === "function") {
    if (accepted) {
      eventResolve({ event: "agree", buttonId: AGREE_BUTTON_ID });
    } else {
      eventResolve({ event: "disagree" });
    }
    continuedPendingEvent = true;
  }

  page.__privacyResolve = null;
  page.__privacyEventResolve = null;
  page.setData({
    privacyGateOpen: false,
    privacyReady: !!accepted
  });

  // requirePrivacyAuthorize 会在上面的 eventResolve 完成后走自身 success/fail，
  // 由它负责结束 Promise；普通 requestPrivacy 则在这里直接结束。
  if (typeof resolve === "function" && !continuedPendingEvent) {
    resolve(!!accepted);
  }
  if (!accepted) {
    wx.showToast({ title: "需同意隐私协议后继续", icon: "none" });
  }
}

function openPrivacyGate(page, purpose, resolve) {
  if (page.__privacyResolve && page.__privacyResolve !== resolve) {
    try {
      page.__privacyResolve(false);
    } catch (error) {
      // ignore superseded waiter
    }
  }
  page.__privacyResolve = resolve || null;
  page.setData({
    privacyGateOpen: true,
    privacyReady: false,
    privacyPurpose: purpose || page.data.privacyPurpose || DEFAULT_PURPOSE,
    privacyContractName: page.data.privacyContractName || "用户隐私保护指引"
  });
}

function requestPrivacy(page, purpose) {
  return new Promise((resolve) => {
    if (!page) {
      resolve(true);
      return;
    }

    if (typeof wx.getPrivacySetting !== "function") {
      page.setData({ privacyReady: true });
      resolve(true);
      return;
    }

    wx.getPrivacySetting({
      success: (setting) => {
        page.setData({
          privacyContractName: getContractName(setting)
        });
        if (!setting.needAuthorization) {
          page.setData({ privacyReady: true });
          resolve(true);
          return;
        }
        openPrivacyGate(page, purpose, resolve);
      },
      fail: () => {
        page.setData({ privacyReady: true });
        resolve(true);
      }
    });
  });
}

/**
 * 主动拉起隐私授权（不依赖 getPhoneNumber 触发）。
 * 若用户已同意则直接 success。
 */
function requirePrivacy(page, purpose) {
  return new Promise((resolve) => {
    if (!page) {
      resolve(true);
      return;
    }
    if (page.data && page.data.privacyReady) {
      resolve(true);
      return;
    }
    if (typeof wx.requirePrivacyAuthorize !== "function") {
      return requestPrivacy(page, purpose).then(resolve);
    }

    // requirePrivacyAuthorize 会触发 onNeedPrivacyAuthorization（若尚未授权）
    page.__privacyResolve = (accepted) => resolve(!!accepted);
    wx.requirePrivacyAuthorize({
      success: () => {
        page.setData({ privacyReady: true, privacyGateOpen: false });
        page.__privacyResolve = null;
        resolve(true);
      },
      fail: () => {
        page.__privacyResolve = null;
        page.setData({ privacyReady: false, privacyGateOpen: false });
        resolve(false);
      }
    });
  });
}

function bindNeedPrivacyAuthorization(page) {
  if (!page || typeof wx.onNeedPrivacyAuthorization !== "function") {
    return;
  }
  // 覆盖注册：保证当前页能收到回调
  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    // 若上一轮 resolve 还挂着，先按拒绝收尾，避免悬挂
    if (typeof page.__privacyEventResolve === "function" && page.__privacyEventResolve !== resolve) {
      try {
        page.__privacyEventResolve({ event: "disagree" });
      } catch (error) {
        // ignore
      }
    }
    page.__privacyEventResolve = resolve;
    page.__privacyReferrer = eventInfo && eventInfo.referrer || "";
    // 原隐私接口保持挂起，等用户点击同意/拒绝后再续接或结束。
    page.setData({
      privacyGateOpen: true,
      privacyReady: false,
      privacyPurpose: page.data.privacyPurpose || DEFAULT_PURPOSE
    });
  });
}

function releasePendingPrivacy(page) {
  if (!page) {
    return;
  }
  const resolve = page.__privacyResolve;
  const eventResolve = page.__privacyEventResolve;
  page.__privacyResolve = null;
  page.__privacyEventResolve = null;
  if (typeof resolve === "function") {
    resolve(false);
  }
  if (typeof eventResolve === "function") {
    try {
      eventResolve({ event: "disagree" });
    } catch (error) {
      // ignore
    }
  }
}

function withPrivacy(config) {
  const userOnLoad = config.onLoad;
  const userOnShow = config.onShow;
  const userOnUnload = config.onUnload;
  const userOnHide = config.onHide;

  return Object.assign({}, config, {
    data: Object.assign({
      privacyGateOpen: false,
      privacyPurpose: DEFAULT_PURPOSE,
      privacyContractName: "用户隐私保护指引",
      privacyReady: false
    }, config.data || {}),

    onLoad(query) {
      bindNeedPrivacyAuthorization(this);
      if (typeof userOnLoad === "function") {
        userOnLoad.call(this, query);
      }
    },

    onShow() {
      bindNeedPrivacyAuthorization(this);
      if (typeof userOnShow === "function") {
        userOnShow.call(this);
      }
    },

    onHide() {
      if (typeof userOnHide === "function") {
        userOnHide.call(this);
      }
    },

    onUnload() {
      releasePendingPrivacy(this);
      if (typeof userOnUnload === "function") {
        userOnUnload.call(this);
      }
    },

    requestPrivacy(purpose) {
      return requestPrivacy(this, purpose);
    },

    requirePrivacy(purpose) {
      return requirePrivacy(this, purpose);
    },

    onPrivacyAgree() {
      // 由 open-type="agreePrivacyAuthorization" 的 bindagreeprivacyauthorization 触发
      finishPrivacy(this, true);
      if (typeof this.onPrivacyAuthorized === "function") {
        this.onPrivacyAuthorized();
      }
    },

    onPrivacyCancel() {
      finishPrivacy(this, false);
    },

    openPrivacyContract
  });
}

module.exports = {
  AGREE_BUTTON_ID,
  openPrivacyContract,
  requestPrivacy,
  requirePrivacy,
  withPrivacy
};
