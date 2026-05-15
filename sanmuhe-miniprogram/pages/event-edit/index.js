const { createEvent } = require("../../utils/cloudApi");

const categories = ["茶会", "讲座", "体验", "展览"];

Page({
  data: {
    categories,
    category: "茶会",
    title: "",
    date: "",
    time: "",
    place: "三木合茶事空间",
    quota: "12",
    price: "68",
    summary: ""
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  chooseCategory(event) {
    this.setData({ category: event.currentTarget.dataset.category });
  },

  publish() {
    const { category, title, date, time, place, quota, price, summary } = this.data;
    if (!title || !date || !time || !summary) {
      wx.showToast({ title: "请补全活动信息", icon: "none" });
      return;
    }

    const payload = {
      title,
      category,
      date,
      time,
      place,
      quota: Number(quota) || 0,
      price: Number(price) || 0,
      summary,
      image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-event-spring.jpg",
      signed: 0
    };

    createEvent(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "发布失败", icon: "none" });
        return;
      }
      wx.showToast({ title: "已发布" });
      setTimeout(() => wx.navigateBack(), 450);
    }).catch(() => {
      const customEvents = wx.getStorageSync("sanmuhe_custom_events") || [];
      customEvents.unshift(Object.assign({
        id: `event-custom-${Date.now()}`,
        status: "新发布"
      }, payload));
      wx.setStorageSync("sanmuhe_custom_events", customEvents);
      wx.showToast({ title: "已发布" });
      setTimeout(() => wx.navigateBack(), 450);
    });
  }
});
