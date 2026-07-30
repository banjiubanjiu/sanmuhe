const addressUtil = require("../../utils/address");
const { withPrivacy } = require("../../utils/privacy");

Page(withPrivacy({
  data: {
    hasAddress: false,
    consignee: "",
    phone: "",
    phoneMasked: "",
    address: "",
    loading: false,
    fromCheckout: false
  },

  onLoad(options = {}) {
    this.setData({
      fromCheckout: options.from === "checkout" || options.from === "cart"
    });
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const saved = addressUtil.loadSavedAddress();
    this.setData({
      hasAddress: saved.hasAddress,
      consignee: saved.consignee,
      phone: saved.phone,
      phoneMasked: addressUtil.phoneMasked(saved.phone),
      address: saved.address
    });
  },

  openWechatAddress() {
    if (this.data.loading) {
      return;
    }
    this.requestPrivacy(addressUtil.PRIVACY_PURPOSE).then((accepted) => {
      if (!accepted) {
        return;
      }
      this.setData({ loading: true });
      addressUtil.chooseWechatAddress().then((address) => {
        this.setData({
          loading: false,
          hasAddress: true,
          consignee: address.consignee,
          phone: address.phone,
          phoneMasked: addressUtil.phoneMasked(address.phone),
          address: address.address
        });
        wx.showToast({ title: "已保存", icon: "success" });
        if (this.data.fromCheckout) {
          setTimeout(() => {
            wx.navigateBack({ fail: () => {} });
          }, 350);
        }
      }).catch((error) => {
        this.setData({ loading: false });
        if (error && error.cancelled) {
          return;
        }
        wx.showToast({ title: "请稍后重试", icon: "none" });
      });
    });
  },

  clearLocal() {
    if (!this.data.hasAddress) {
      return;
    }
    wx.showModal({
      title: "清除地址",
      content: "确定清除当前收货地址？",
      confirmText: "清除",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        addressUtil.clearAddress();
        this.refresh();
      }
    });
  }
}));
