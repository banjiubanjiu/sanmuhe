const addressUtil = require("../../utils/address");
const { withPrivacy } = require("../../utils/privacy");

Page(withPrivacy({
  data: {
    hasAddress: false,
    consignee: "",
    phone: "",
    phoneMasked: "",
    address: "",
    province: "",
    city: "",
    district: "",
    detailAddress: "",
    regionValue: [],
    regionText: "",
    loading: false,
    fromCheckout: false,
    showManual: false
  },

  onLoad(options = {}) {
    this.setData({
      fromCheckout: options.from === "checkout" || options.from === "cart"
    });
    this.refresh();
  },

  onShow() {
    if (!this.data.showManual) {
      this.refresh();
    }
  },

  refresh() {
    const saved = addressUtil.loadSavedAddress();
    const regionValue = [saved.province, saved.city, saved.district].filter(Boolean);
    this.setData({
      hasAddress: saved.hasAddress,
      consignee: saved.consignee,
      phone: saved.phone,
      phoneMasked: addressUtil.phoneMasked(saved.phone),
      address: saved.address,
      province: saved.province,
      city: saved.city,
      district: saved.district,
      detailAddress: saved.detailAddress,
      regionValue: regionValue.length === 3 ? regionValue : [],
      regionText: regionValue.length ? regionValue.join(" ") : ""
    });
  },

  openWechatAddress() {
    if (this.data.loading) {
      return;
    }
    this._pendingChooseAddress = true;
    this.data.privacyPurpose = addressUtil.PRIVACY_PURPOSE;
    this.setData({ loading: true });
    this._runChooseAddress();
  },

  _runChooseAddress() {
    addressUtil.chooseWechatAddress().then((address) => {
      this._pendingChooseAddress = false;
      this.setData({
        loading: false,
        showManual: false,
        hasAddress: true,
        consignee: address.consignee,
        phone: address.phone,
        phoneMasked: addressUtil.phoneMasked(address.phone),
        address: address.address,
        province: address.province,
        city: address.city,
        district: address.district,
        detailAddress: address.detailAddress,
        regionValue: [address.province, address.city, address.district].filter(Boolean),
        regionText: [address.province, address.city, address.district].filter(Boolean).join(" ")
      });
      wx.showToast({ title: "已保存", icon: "success" });
      if (this.data.fromCheckout) {
        setTimeout(() => {
          wx.navigateBack({ fail: () => {} });
        }, 350);
      }
    }).catch((error) => {
      if (error && error.privacyBlocked && this._pendingChooseAddress) {
        this.setData({ loading: false });
        return;
      }
      if (this.data.privacyGateOpen && this._pendingChooseAddress && !(error && error.cancelled)) {
        this.setData({ loading: false });
        return;
      }
      this._pendingChooseAddress = false;
      this.setData({ loading: false });
      addressUtil.handleChooseAddressError(error, {
        onManual: () => this.showManualForm()
      });
    });
  },

  onPrivacyAuthorized() {
    if (!this._pendingChooseAddress) {
      return;
    }
    this.setData({ loading: true });
    this._runChooseAddress();
  },

  showManualForm() {
    this.setData({ showManual: true, loading: false });
  },

  onManualInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    this.setData({ [field]: event.detail.value });
  },

  onRegionChange(event) {
    const value = (event.detail && event.detail.value) || [];
    this.setData({
      regionValue: value,
      regionText: value.filter(Boolean).join(" "),
      province: value[0] || "",
      city: value[1] || "",
      district: value[2] || ""
    });
  },

  saveManual() {
    const consignee = String(this.data.consignee || "").trim();
    const phone = String(this.data.phone || "").trim();
    const province = String(this.data.province || "").trim();
    const city = String(this.data.city || "").trim();
    const district = String(this.data.district || "").trim();
    const detailAddress = String(this.data.detailAddress || "").trim();
    if (!consignee) {
      wx.showToast({ title: "请填写收货人", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请填写正确手机号", icon: "none" });
      return;
    }
    if (!province || !city || !district) {
      wx.showToast({ title: "请选择省市区", icon: "none" });
      return;
    }
    if (!detailAddress || detailAddress.length < 4) {
      wx.showToast({ title: "请填写详细地址", icon: "none" });
      return;
    }
    const saved = addressUtil.saveAddress({
      consignee,
      phone,
      province,
      city,
      district,
      detailAddress
    });
    this.setData({
      showManual: false,
      hasAddress: true,
      consignee: saved.consignee,
      phone: saved.phone,
      phoneMasked: addressUtil.phoneMasked(saved.phone),
      address: saved.address,
      province: saved.province,
      city: saved.city,
      district: saved.district,
      detailAddress: saved.detailAddress
    });
    wx.showToast({ title: "已保存", icon: "success" });
    if (this.data.fromCheckout) {
      setTimeout(() => {
        wx.navigateBack({ fail: () => {} });
      }, 350);
    }
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
        this.setData({ showManual: false });
        this.refresh();
      }
    });
  }
}));
