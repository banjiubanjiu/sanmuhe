const { createEvent } = require("../../utils/cloudApi");

const categories = ["茶会", "讲座", "体验", "展览"];

Page({
  data: {
    categories,
    category: "茶会",
    title: "",
    date: "",
    time: "",
    place: "禾煦书茶空间",
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
      image: "/assets/images/event-seasonal-tea.jpg",
      signed: 0
    };

    createEvent(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "发布失败", icon: "none" });
        return;
      }
      wx.showToast({ title: "已发布" });
      setTimeout(() => wx.navigateBack(), 450);
    }).catch((error) => {
      wx.showModal({
        title: "活动未发布",
        content: error && error.message ? error.message : "当前云服务不可用，请稍后重试。为避免前台展示无效活动，本次没有保存到本地。",
        showCancel: false
      });
    });
  }
});
