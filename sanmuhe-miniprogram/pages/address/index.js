const addressUtil = require("../../utils/address");
const { withPrivacy } = require("../../utils/privacy");

function decorateAddresses(addresses, selectedId) {
  return (Array.isArray(addresses) ? addresses : []).map((item) => {
    const address = addressUtil.normalizeAddress(item);
    return Object.assign({}, address, {
      phoneMasked: addressUtil.phoneMasked(address.phone),
      isSelected: address.id === selectedId
    });
  });
}

Page(withPrivacy({
  data: {
    addresses: [],
    selectedId: "",
    selectMode: false,
    loading: true,
    loadError: false,
    submitting: false,
    formOpen: false,
    formTitle: "新增收货地址",
    editingId: "",
    formConsignee: "",
    formPhone: "",
    formProvince: "",
    formCity: "",
    formDistrict: "",
    formDetailAddress: "",
    formRegionValue: [],
    formRegionText: "",
    formIsDefault: false,
    formDefaultLocked: false,
    formSource: "manual",
    errorConsignee: "",
    errorPhone: "",
    errorRegion: "",
    errorDetail: ""
  },

  onLoad(options = {}) {
    const selectMode = options.from === "checkout" || options.from === "cart";
    wx.setNavigationBarTitle({ title: selectMode ? "选择收货地址" : "收货地址" });
    this.setData({ selectMode });
    this.applyAddresses(addressUtil.loadCachedAddresses());
    this.refreshCloud();
  },

  onShow() {
    if (this._loadedOnce && !this.data.formOpen) {
      this.applyAddresses(addressUtil.loadCachedAddresses());
    }
    this._loadedOnce = true;
  },

  applyAddresses(addresses, preferredId) {
    if (preferredId) {
      addressUtil.selectAddress(preferredId);
    }
    const selectedId = addressUtil.getSelectedAddressId();
    this.setData({
      addresses: decorateAddresses(addresses, selectedId),
      selectedId,
      loading: false
    });
  },

  refreshCloud() {
    this.setData({ loading: !this.data.addresses.length, loadError: false });
    addressUtil.syncAddressBook({ migrateLocal: true }).then((addresses) => {
      this.applyAddresses(addresses);
    }).catch((error) => {
      console.warn("[address] sync failed", error);
      this.setData({ loading: false, loadError: !this.data.addresses.length });
    });
  },

  retryLoad() {
    this.refreshCloud();
  },

  onAddressTap(event) {
    const id = event.currentTarget.dataset.id;
    if (this.data.selectMode) {
      this.selectForOrder(id);
      return;
    }
    this.openEditById(id);
  },

  selectForOrder(id) {
    const selected = addressUtil.selectAddress(id);
    if (!selected.hasAddress) {
      return;
    }
    this.applyAddresses(addressUtil.loadCachedAddresses(), selected.id);
    wx.navigateBack({ fail: () => {} });
  },

  editAddress(event) {
    this.openEditById(event.currentTarget.dataset.id);
  },

  openEditById(id) {
    const item = this.data.addresses.find((address) => address.id === id);
    if (!item) {
      wx.showToast({ title: "地址已更新，请重试", icon: "none" });
      this.refreshCloud();
      return;
    }
    this.openForm(item);
  },

  openNewForm() {
    this.openForm(null);
  },

  openForm(item) {
    const address = item ? addressUtil.normalizeAddress(item) : addressUtil.emptyAddress();
    const region = [address.province, address.city, address.district].filter(Boolean);
    const title = item ? "编辑收货地址" : "新增收货地址";
    wx.setNavigationBarTitle({ title });
    this.setData({
      formOpen: true,
      formTitle: title,
      editingId: address.id,
      formConsignee: address.consignee,
      formPhone: address.phone,
      formProvince: address.province,
      formCity: address.city,
      formDistrict: address.district,
      formDetailAddress: address.detailAddress,
      formRegionValue: region.length === 3 ? region : [],
      formRegionText: region.join(" "),
      formIsDefault: item ? address.isDefault : this.data.addresses.length === 0,
      formDefaultLocked: Boolean(item && address.isDefault),
      formSource: item ? address.source : "manual",
      errorConsignee: "",
      errorPhone: "",
      errorRegion: "",
      errorDetail: ""
    });
  },

  closeForm() {
    wx.setNavigationBarTitle({ title: this.data.selectMode ? "选择收货地址" : "收货地址" });
    this.setData({ formOpen: false, submitting: false });
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) {
      return;
    }
    const errorFieldMap = {
      formConsignee: "errorConsignee",
      formPhone: "errorPhone",
      formDetailAddress: "errorDetail"
    };
    const patch = { [field]: event.detail.value };
    if (errorFieldMap[field]) {
      patch[errorFieldMap[field]] = "";
    }
    this.setData(patch);
  },

  onRegionChange(event) {
    const value = (event.detail && event.detail.value) || [];
    this.setData({
      formRegionValue: value,
      formRegionText: value.filter(Boolean).join(" "),
      formProvince: value[0] || "",
      formCity: value[1] || "",
      formDistrict: value[2] || "",
      errorRegion: ""
    });
  },

  onDefaultChange(event) {
    if (this.data.formDefaultLocked) {
      return;
    }
    this.setData({ formIsDefault: Boolean(event.detail && event.detail.value) });
  },

  validateForm() {
    const consignee = String(this.data.formConsignee || "").trim();
    const phone = String(this.data.formPhone || "").trim();
    const province = String(this.data.formProvince || "").trim();
    const city = String(this.data.formCity || "").trim();
    const district = String(this.data.formDistrict || "").trim();
    const detailAddress = String(this.data.formDetailAddress || "").trim();
    const errors = {
      errorConsignee: consignee ? "" : "请填写收货人",
      errorPhone: /^1\d{10}$/.test(phone) ? "" : "请填写正确手机号",
      errorRegion: province && city && district ? "" : "请选择省市区",
      errorDetail: detailAddress.length >= 4 ? "" : "请填写街道、门牌等详细地址"
    };
    this.setData(errors);
    if (errors.errorConsignee || errors.errorPhone || errors.errorRegion || errors.errorDetail) {
      return null;
    }
    return {
      id: this.data.editingId,
      consignee,
      phone,
      province,
      city,
      district,
      detailAddress,
      isDefault: this.data.formIsDefault,
      source: this.data.formSource
    };
  },

  saveForm() {
    if (this.data.submitting) {
      return;
    }
    const address = this.validateForm();
    if (!address) {
      return;
    }
    this.setData({ submitting: true });
    addressUtil.saveCloudAddress(address, { select: this.data.selectMode }).then((result) => {
      this.applyAddresses(result.addresses, this.data.selectMode ? result.address.id : "");
      wx.showToast({ title: "已保存", icon: "success" });
      if (this.data.selectMode) {
        wx.navigateBack({ fail: () => {} });
        return;
      }
      this.closeForm();
    }).catch((error) => {
      console.warn("[address] save failed", error);
      wx.showToast({ title: error.message || "保存失败，请稍后重试", icon: "none" });
      this.setData({ submitting: false });
    });
  },

  deleteAddress() {
    const id = this.data.editingId;
    if (!id || this.data.submitting) {
      return;
    }
    wx.showModal({
      title: "删除地址",
      content: "确定删除这条收货地址？",
      confirmText: "删除",
      confirmColor: "#a05537",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({ submitting: true });
        addressUtil.removeCloudAddress(id).then((addresses) => {
          this.applyAddresses(addresses);
          this.closeForm();
          wx.showToast({ title: "已删除", icon: "success" });
        }).catch((error) => {
          wx.showToast({ title: error.message || "删除失败，请稍后重试", icon: "none" });
          this.setData({ submitting: false });
        });
      }
    });
  },

  importWechatAddress() {
    if (this.data.submitting) {
      return;
    }
    this._pendingChooseAddress = true;
    this.data.privacyPurpose = addressUtil.PRIVACY_PURPOSE;
    this.setData({ submitting: true });
    this._runChooseAddress();
  },

  _runChooseAddress() {
    addressUtil.chooseWechatAddress().then((address) => {
      return addressUtil.saveCloudAddress(Object.assign({}, address, {
        isDefault: this.data.addresses.length === 0,
        source: "wechat"
      }), { select: this.data.selectMode });
    }).then((result) => {
      this._pendingChooseAddress = false;
      this.applyAddresses(result.addresses, this.data.selectMode ? result.address.id : "");
      this.setData({ submitting: false });
      wx.showToast({ title: "已导入", icon: "success" });
      if (this.data.selectMode) {
        wx.navigateBack({ fail: () => {} });
      }
    }).catch((error) => {
      if (error && error.privacyBlocked && this._pendingChooseAddress) {
        this.setData({ submitting: false });
        return;
      }
      if (this.data.privacyGateOpen && this._pendingChooseAddress && !(error && error.cancelled)) {
        this.setData({ submitting: false });
        return;
      }
      this._pendingChooseAddress = false;
      this.setData({ submitting: false });
      addressUtil.handleChooseAddressError(error, { onManual: () => this.openNewForm() });
    });
  },

  onPrivacyAuthorized() {
    if (!this._pendingChooseAddress) {
      return;
    }
    this.setData({ submitting: true });
    this._runChooseAddress();
  }
}));
