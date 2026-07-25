const { listMyOrders } = require("../../utils/cloudApi");
const { normalizeOrder } = require("../../utils/orderCenter");

const tabs = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待付款" },
  { key: "active", label: "进行中" },
  { key: "completed", label: "已完成" },
  { key: "afterSale", label: "退款/售后" }
];

function validTab(value) {
  return tabs.some((item) => item.key === value) ? value : "all";
}

Page({
  data: {
    tabs,
    activeTab: "all",
    orders: [],
    page: 0,
    pageSize: 8,
    total: 0,
    hasMore: true,
    loading: false,
    loaded: false,
    error: "",
    skeletons: [1, 2, 3]
  },

  onLoad(options = {}) {
    this.setData({ activeTab: validTab(options.tab) });
    this.loadOrders(true);
  },

  onShow() {
    if (this.needsRefresh) {
      this.needsRefresh = false;
      this.loadOrders(true);
    }
  },

  onPullDownRefresh() {
    this.loadOrders(true);
  },

  onReachBottom() {
    this.loadOrders(false);
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/profile/index" });
  },

  switchTab(event) {
    const tab = validTab(event.currentTarget.dataset.tab);
    if (tab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: tab });
    this.loadOrders(true);
  },

  retry() {
    this.loadOrders(true);
  },

  goShop() {
    wx.switchTab({ url: "/pages/shop/index" });
  },

  viewOrder(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) {
      return;
    }
    this.needsRefresh = true;
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${encodeURIComponent(id)}`
    });
  },

  loadOrders(reset) {
    if (this.data.loading || (!reset && !this.data.hasMore)) {
      wx.stopPullDownRefresh();
      return;
    }
    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({
      loading: true,
      error: reset ? "" : this.data.error,
      ...(reset ? { orders: [], page: 0, total: 0, hasMore: true } : {})
    });

    listMyOrders({
      tab: this.data.activeTab,
      page: nextPage,
      pageSize: this.data.pageSize
    }).then((result) => {
      const nextOrders = (result.orders || []).map(normalizeOrder);
      const page = result.page || {};
      this.setData({
        orders: reset ? nextOrders : this.data.orders.concat(nextOrders),
        page: page.page || nextPage,
        total: Number(page.total) || 0,
        hasMore: !!page.hasMore,
        loading: false,
        loaded: true,
        error: ""
      });
    }).catch((error) => {
      this.setData({
        loading: false,
        loaded: true,
        error: error && error.message ? error.message : "订单暂时加载失败，请稍后重试"
      });
    }).finally(() => {
      wx.stopPullDownRefresh();
    });
  }
});
