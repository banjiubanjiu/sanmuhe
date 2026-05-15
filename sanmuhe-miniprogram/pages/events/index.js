const { events } = require("../../data/catalog");
const { joinEvent: joinEventRequest, listEvents } = require("../../utils/cloudApi");

const categories = ["全部", "养心茶会", "学茶"];
const CONTACT_KEY = "sanmuhe_contact";

const eventDisplay = {
  "event-001": {
    title: "养心茶会",
    category: "养心茶会",
    date: "5月25日 周六",
    time: "14:00",
    place: "三木合・佛山",
    quota: 12,
    image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-event-spring.jpg",
    summary: "在茶香与静心中，慢慢安住自己",
    joinText: "报名中",
    actionClass: "primary"
  },
  "event-002": {
    title: "学茶入门",
    category: "学茶",
    date: "6月1日 周六",
    time: "10:00",
    place: "三木合・佛山",
    quota: 10,
    image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-event-handmade.jpg",
    summary: "从识香、泡茶到品饮，轻松了解基础茶知识",
    joinText: "可预约",
    actionClass: "outline"
  },
  "event-003": {
    title: "时令茶会",
    category: "养心茶会",
    date: "6月8日 周六",
    time: "15:00",
    place: "三木合・佛山",
    quota: 8,
    image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-event-culture.jpg",
    summary: "顺时品茶，感受节气与日常之美",
    joinText: "少量名额",
    actionClass: "outline"
  }
};

function normalizeCategory(category) {
  if (category === "讲座" || category === "体验") {
    return "学茶";
  }
  if (category === "茶会" || category === "展览") {
    return "养心茶会";
  }
  return category || "养心茶会";
}

function normalizeEvents(items) {
  return items.map((raw, index) => {
    const fallbackKey = `event-00${index + 1}`;
    const display = eventDisplay[raw.id] || eventDisplay[fallbackKey] || {};
    const usesDisplay = Boolean(display.title);
    const item = Object.assign({}, raw, display);
    const signed = Number(usesDisplay ? (display.signed || 0) : (raw.signed || 0));
    const quota = Number(item.quota || raw.quota || 0);
    const isFull = quota > 0 && signed >= quota;
    const available = quota > 0 ? Math.max(0, quota - signed) : 0;
    const joinText = isFull ? "已满" : (display.joinText || item.status || "报名中");
    return Object.assign({
      category: "养心茶会",
      image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-event-spring.jpg",
      signed,
      quota,
      canJoin: !isFull,
      joinText,
      actionClass: display.actionClass || "primary",
      limitText: quota > 0 ? `限${quota}人` : "名额有限"
    }, item, {
      signed,
      quota,
      available,
      category: normalizeCategory(item.category),
      canJoin: !isFull,
      joinText,
      actionClass: isFull ? "disabled" : (display.actionClass || "primary"),
      limitText: quota > 0 ? `限${quota}人` : "名额有限"
    });
  });
}

Page({
  data: {
    categories,
    activeCategory: "全部",
    allEvents: [],
    events: [],
    signupOpen: false,
    selectedEvent: null,
    signupName: "",
    signupPhone: "",
    signupNote: "",
    submitting: false
  },

  onShow() {
    listEvents().then((nextEvents) => {
      const allEvents = normalizeEvents(nextEvents && nextEvents.length ? nextEvents : events);
      this.setData({ allEvents }, () => this.applyFilter());
    });
  },

  applyFilter() {
    const { activeCategory, allEvents } = this.data;
    const filtered = activeCategory === "全部"
      ? allEvents
      : allEvents.filter((item) => item.category === activeCategory);
    this.setData({ events: filtered });
  },

  changeCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.category }, () => this.applyFilter());
  },

  goBack() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  openSignup(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.events.find((item) => item.id === id);
    if (!target || !target.canJoin) {
      wx.showToast({ title: "名额已满", icon: "none" });
      return;
    }
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    this.setData({
      selectedEvent: target,
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
    this.setData({ signupOpen: false, selectedEvent: null });
  },

  noop() {},

  onSignupInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  submitSignup() {
    const target = this.data.selectedEvent;
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
      this.markJoined(target.id);
      this.setData({ signupOpen: false, selectedEvent: null, submitting: false });
      wx.showModal({
        title: "报名已提交",
        content: "门店确认后会通过电话或服务通知联系你。",
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    }).catch(() => {
      const signups = wx.getStorageSync("sanmuhe_event_signups") || [];
      const alreadyJoined = signups.some((item) => item.eventId === target.id);
      if (alreadyJoined) {
        wx.showToast({ title: "你已经报名过该活动", icon: "none" });
        this.setData({ submitting: false });
        return;
      }
      signups.unshift({
        id: `JOIN${Date.now()}`,
        eventId: target.id,
        title: target.title,
        date: target.date,
        time: target.time,
        place: target.place,
        image: target.image,
        name,
        phone,
        note,
        createdAt: new Date().toISOString(),
        status: "待确认"
      });
      wx.setStorageSync("sanmuhe_event_signups", signups);
      this.markJoined(target.id);
      this.setData({ signupOpen: false, selectedEvent: null, submitting: false });
      wx.showModal({
        title: "报名已提交",
        content: "当前云服务不可用，报名已临时保存在本机。",
        showCancel: false,
        success: () => wx.switchTab({ url: "/pages/profile/index" })
      });
    });
  },

  markJoined(eventId) {
    const allEvents = this.data.allEvents.map((item) => {
      if (item.id !== eventId) {
        return item;
      }
      const signed = Number(item.signed || 0) + 1;
      const quota = Number(item.quota || 0);
      const isFull = quota > 0 && signed >= quota;
      return Object.assign({}, item, {
        signed,
        canJoin: false,
        joinText: isFull ? "已满" : "已报名"
      });
    });
    this.setData({ allEvents }, () => this.applyFilter());
  }
});
