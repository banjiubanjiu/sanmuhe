const DEFAULT_PURPOSE = "为了完成订单、预约、报名和售后服务，我们需要处理你的联系人、手机号、收货地址或报名备注。";

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
  page.__privacyResolve = null;
  page.setData({ privacyGateOpen: false });
  if (typeof resolve === "function") {
    resolve(accepted);
  }
  if (!accepted) {
    wx.showToast({ title: "需同意隐私协议后继续", icon: "none" });
  }
}

function requestPrivacy(page, purpose) {
  return new Promise((resolve) => {
    if (!page || typeof wx.getPrivacySetting !== "function") {
      resolve(true);
      return;
    }
    wx.getPrivacySetting({
      success: (setting) => {
        if (!setting.needAuthorization) {
          resolve(true);
          return;
        }
        page.__privacyResolve = resolve;
        page.setData({
          privacyGateOpen: true,
          privacyPurpose: purpose || DEFAULT_PURPOSE,
          privacyContractName: getContractName(setting)
        });
      },
      fail: () => {
        resolve(true);
      }
    });
  });
}

function withPrivacy(config) {
  return Object.assign({}, config, {
    data: Object.assign({
      privacyGateOpen: false,
      privacyPurpose: DEFAULT_PURPOSE,
      privacyContractName: "用户隐私保护指引"
    }, config.data || {}),

    requestPrivacy(purpose) {
      return requestPrivacy(this, purpose);
    },

    onPrivacyAgree() {
      finishPrivacy(this, true);
    },

    onPrivacyCancel() {
      finishPrivacy(this, false);
    },

    openPrivacyContract
  });
}

module.exports = {
  openPrivacyContract,
  requestPrivacy,
  withPrivacy
};
