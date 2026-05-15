Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "pages/index/index", text: "首页", icon: "/assets/icons/home-line.png", activeIcon: "/assets/icons/home-active.png" },
      { pagePath: "pages/shop/index", text: "分类", icon: "/assets/icons/category-line.png", activeIcon: "/assets/icons/category-active.png" },
      { pagePath: "pages/cart/index", text: "购物车", icon: "/assets/icons/cart-line.png", activeIcon: "/assets/icons/cart-active.png" },
      { pagePath: "pages/events/index", text: "活动", icon: "/assets/icons/events-line.png", activeIcon: "/assets/icons/events-active.png" },
      { pagePath: "pages/profile/index", text: "我的", icon: "/assets/icons/profile-line.png", activeIcon: "/assets/icons/profile-active.png" }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : "";
      const selected = this.data.list.findIndex((item) => item.pagePath === current);
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const path = event.currentTarget.dataset.path;
      this.setData({ selected: index });
      wx.switchTab({ url: `/${path}` });
    }
  }
});
