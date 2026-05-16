const { events: localEvents } = require("../../data/catalog");
const { joinEvent: joinEventRequest, listEvents } = require("../../utils/cloudApi");

const CONTACT_KEY = "sanmuhe_contact";
const detailImages = {
  "event-001": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-1.png",
  "event-002": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-2.png",
  "event-003": "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/event-detail-content-3.png"
};

function normalizeEvent(raw, index) {
  const fallback = localEvents.find((item) => item.id === raw.id) || localEvents[index] || localEvents[0] || {};
  const item = Object.assign({}, fallback, raw);
  const signed = Number(item.signed || 0);
  const quota = Number(item.quota || 0);
  const isFull = quota > 0 && signed >= quota;
  return Object.assign({}, item, {
    signed,
    quota,
    available: quota > 0 ? Math.max(0, quota - signed) : 0,
    canJoin: !isFull,
    joinText: isFull ? "名额已满" : "立即报名",
    detailImage: item.detailImage || detailImages[item.id] || item.image
  });
}

function findEvent(id, source) {
  const list = Array.isArray(source) && source.length ? source : localEvents;
  const target = id ? list.find((item) => item.id === id) : list[0];
  if (!target && source !== localEvents) {
    return findEvent(id, localEvents);
  }
  return target ? normalizeEvent(target, list.indexOf(target)) : null;
}

Page({
  data: {
    event: null,
    signupOpen: false,
    signupName: "",
    signupPhone: "",
    signupNote: "",
    submitting: false
  },

  onLoad(options) {
    const eventId = options && options.id;
    this.eventId = eventId;
    const fallback = findEvent(eventId, localEvents);
    this.setData({ event: fallback });

    listEvents().then((remoteEvents) => {
      const event = findEvent(eventId, remoteEvents && remoteEvents.length ? remoteEvents : localEvents);
      if (event) {
        this.setData({ event });
      }
    });
  },

  onShareAppMessage() {
    const event = this.data.event || {};
    return {
      title: event.title || "禾熙茶事活动",
      path: `/pages/event-detail/index?id=${event.id || this.eventId || "event-001"}`,
      imageUrl: event.image || event.detailImage || ""
    };
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/events/index" });
  },

  previewDesign() {
    const image = this.data.event && this.data.event.detailImage;
    if (!image) {
      return;
    }
    wx.previewImage({
      current: image,
      urls: [image]
    });
  },

  contactService() {
    wx.navigateTo({ url: "/pages/contact/index" });
  },

  openSignup() {
    const event = this.data.event;
    if (!event || !event.canJoin) {
      wx.showToast({ title: "名额已满", icon: "none" });
      return;
    }
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    this.setData({
      signupOpen: true,
      signupName: contact.consignee || contact.name || "",
      signupPhone: contact.phone || "",
      signupNote: ""
    });
  },

  closeSignup() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ signupOpen: false });
  },

  noop() {},

  onSignupInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  submitSignup() {
    const target = this.data.event;
    const name = String(this.data.signupName || "").trim();
    const phone = String(this.data.signupPhone || "").trim();
    const note = String(this.data.signupNote || "").trim();
    if (!target || this.data.submitting) {
      return;
    }
    if (!name || !phone) {
      wx.showToast({ title: "请填写联系人和手机号", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }

    wx.setStorageSync(CONTACT_KEY, {
      consignee: name,
      phone
    });

    this.setData({ submitting: true });
    joinEventRequest({
      eventId: target.id,
      title: target.title,
      name,
      phone,
      note,
      date: target.date,
      time: target.time,
      place: target.place,
      image: target.image,
      source: "miniprogram"
    }).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "报名失败", icon: "none" });
        this.setData({ submitting: false });
        return;
      }
      const signed = Number(target.signed || 0) + 1;
      this.setData({
        event: Object.assign({}, target, {
          signed,
          canJoin: false,
          joinText: "已报名"
        }),
        signupOpen: false,
        submitting: false
      });
      wx.showModal({
        title: "报名已提交",
        content: "门店确认后会通过电话或服务通知联系你。",
        showCancel: false
      });
    }).catch((error) => {
      this.setData({ signupOpen: false, submitting: false });
      wx.showModal({
        title: "报名未提交",
        content: error && error.message ? error.message : "当前云服务不可用，请稍后重试。为避免误以为门店已收到报名，本次没有保存为有效报名。",
        showCancel: false
      });
    });
  }
});
