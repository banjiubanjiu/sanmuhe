const DEFAULT_PURPOSE = "为了完成订单、预约、报名和售后服务，我们需要处理你的联系人、手机号、收货地址或报名备注。";
/** 必须与 privacy-gate 同意按钮 id 完全一致，微信会校验点击源 */
const AGREE_BUTTON_ID = "privacy-agree-btn";

/** 模块级挂起：同意按钮在自定义组件内，resolve 必须在按钮事件同步调用 */
let pendingEventResolve = null;
let pendingPage = null;
let pendingPromiseResolve = null;

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

function clearPendingBindings() {
  if (pendingPage) {
    pendingPage.__privacyResolve = null;
    pendingPage.__privacyEventResolve = null;
  }
  pendingEventResolve = null;
  pendingPromiseResolve = null;
  pendingPage = null;
}

/**
 * 在同意按钮的 bindagreeprivacyauthorization 回调里同步调用。
 * 必须先 resolve 挂起的隐私接口，再关弹层；关弹层略延迟，避免 buttonId 校验时节点已销毁。
 */
function agreePrivacyAuthorization() {
  const page = pendingPage;
  const eventResolve = pendingEventResolve;
  const promiseResolve = pendingPromiseResolve;

  // 先取出再清空，避免页面 bindagree 二次进入
  clearPendingBindings();

  if (typeof eventResolve === "function") {
    try {
      eventResolve({ event: "agree", buttonId: AGREE_BUTTON_ID });
    } catch (error) {
      // ignore
    }
  }

  if (typeof promiseResolve === "function") {
    try {
      promiseResolve(true);
    } catch (error) {
      // ignore
    }
  }

  if (page) {
    // 先在同意按钮同步栈内重试隐私接口（chooseAddress 依赖用户手势，禁止 setTimeout）
    if (typeof page.onPrivacyAuthorized === "function") {
      try {
        page.onPrivacyAuthorized();
      } catch (error) {
        // ignore
      }
    }

    // 再关弹层；略延迟避免 buttonId 校验时节点已销毁
    setTimeout(() => {
      page.setData({
        privacyGateOpen: false,
        privacyReady: true
      });
    }, 50);
  }

  return true;
}

function disagreePrivacyAuthorization() {
  const page = pendingPage;
  const eventResolve = pendingEventResolve;
  const promiseResolve = pendingPromiseResolve;

  clearPendingBindings();

  if (typeof eventResolve === "function") {
    try {
      eventResolve({ event: "disagree" });
    } catch (error) {
      // ignore
    }
  }

  if (typeof promiseResolve === "function") {
    try {
      promiseResolve(false);
    } catch (error) {
      // ignore
    }
  }

  if (page) {
    page.setData({
      privacyGateOpen: false,
      privacyReady: false
    });
  }

  wx.showToast({ title: "需同意隐私协议后继续", icon: "none" });
  return false;
}

/** @deprecated 兼容旧 finishPrivacy 调用路径 */
function finishPrivacy(page, accepted) {
  if (accepted) {
    if (page && !pendingPage) {
      pendingPage = page;
    }
    return agreePrivacyAuthorization();
  }
  if (page && !pendingPage) {
    pendingPage = page;
  }
  return disagreePrivacyAuthorization();
}

function openPrivacyGate(page, purpose, resolve) {
  if (pendingPromiseResolve && pendingPromiseResolve !== resolve) {
    try {
      pendingPromiseResolve(false);
    } catch (error) {
      // ignore superseded waiter
    }
  }
  pendingPage = page;
  pendingPromiseResolve = resolve || null;
  if (page) {
    page.__privacyResolve = resolve || null;
  }
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

    pendingPage = page;
    pendingPromiseResolve = (accepted) => resolve(!!accepted);
    page.__privacyResolve = pendingPromiseResolve;

    wx.requirePrivacyAuthorize({
      success: () => {
        pendingPromiseResolve = null;
        page.__privacyResolve = null;
        page.setData({ privacyReady: true, privacyGateOpen: false });
        resolve(true);
      },
      fail: () => {
        pendingPromiseResolve = null;
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
    if (typeof pendingEventResolve === "function" && pendingEventResolve !== resolve) {
      try {
        pendingEventResolve({ event: "disagree" });
      } catch (error) {
        // ignore
      }
    }
    pendingEventResolve = resolve;
    pendingPage = page;
    page.__privacyEventResolve = resolve;
    page.__privacyReferrer = (eventInfo && eventInfo.referrer) || "";
    // 原隐私接口（如 chooseAddress）保持挂起，同意后由微信自动续接。
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
  if (pendingPage && pendingPage !== page) {
    return;
  }
  const eventResolve = pendingEventResolve;
  const promiseResolve = pendingPromiseResolve;
  clearPendingBindings();
  if (typeof promiseResolve === "function") {
    try {
      promiseResolve(false);
    } catch (error) {
      // ignore
    }
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
      // privacy-gate 已在按钮回调内同步 resolve；仅当未处理时兜底
      if (pendingEventResolve || pendingPromiseResolve) {
        agreePrivacyAuthorization();
      }
    },

    onPrivacyCancel() {
      // 同上，避免组件 + 页面双重 disagree 连弹两次 toast
      if (pendingEventResolve || pendingPromiseResolve || pendingPage) {
        disagreePrivacyAuthorization();
      }
    },

    openPrivacyContract
  });
}

module.exports = {
  AGREE_BUTTON_ID,
  openPrivacyContract,
  requestPrivacy,
  requirePrivacy,
  agreePrivacyAuthorization,
  disagreePrivacyAuthorization,
  withPrivacy
};
