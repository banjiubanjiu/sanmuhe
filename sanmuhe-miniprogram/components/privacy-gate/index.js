Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    purpose: {
      type: String,
      value: ""
    },
    contractName: {
      type: String,
      value: "用户隐私保护指引"
    }
  },

  methods: {
    noop() {},

    openContract() {
      if (typeof wx.openPrivacyContract === "function") {
        wx.openPrivacyContract({
          fail: () => wx.showToast({ title: "暂无法打开隐私协议", icon: "none" })
        });
        return;
      }
      wx.showModal({
        title: "隐私保护指引",
        content: "请在小程序右上角菜单中查看隐私保护指引。",
        showCancel: false
      });
    },

    agree() {
      this.triggerEvent("agree");
    },

    cancel() {
      this.triggerEvent("cancel");
    }
  }
});
