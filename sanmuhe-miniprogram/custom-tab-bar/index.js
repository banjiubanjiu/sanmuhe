Component({
  properties: {
    forceSelected: {
      type: Number,
      value: -1,
      observer(next) {
        this.applyForceSelected(next);
      }
    }
  },

  data: {
    selected: -1,
    list: [
      { pagePath: "pages/index/index", text: "首页", icon: "/assets/icons/home-line.png", activeIcon: "/assets/icons/home-active.png" },
      { pagePath: "pages/order/index", text: "点单", icon: "/assets/icons/cart-line.png", activeIcon: "/assets/icons/cart-active.png" },
      { pagePath: "pages/shop/index", text: "茶品", icon: "/assets/icons/category-line.png", activeIcon: "/assets/icons/category-active.png" },
      { pagePath: "pages/events/index", text: "活动", icon: "/assets/icons/events-line.png", activeIcon: "/assets/icons/events-active.png" },
      { pagePath: "pages/profile/index", text: "我的", icon: "/assets/icons/profile-line.png", activeIcon: "/assets/icons/profile-active.png" }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    },
    ready() {
      // force-selected 可能在 attached 之后才落到组件上，ready 再同步一次
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    applyForceSelected(value) {
      const forced = Number(value);
      if (Number.isNaN(forced) || forced < 0) {
        return;
      }
      this.setSelected(forced);
    },

    setSelected(selected) {
      const nextSelected = Number(selected);
      if (Number.isNaN(nextSelected) || nextSelected < 0 || nextSelected >= this.data.list.length) {
        return;
      }
      if (nextSelected !== this.data.selected) {
        this.setData({ selected: nextSelected });
      }
    },

    setSelectedByPath(path) {
      const selected = this.data.list.findIndex((item) => item.pagePath === path);
      this.setSelected(selected);
    },

    syncSelected() {
      const forced = Number(this.data.forceSelected);
      if (forced >= 0 && !Number.isNaN(forced)) {
        this.setSelected(forced);
        return;
      }
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : "";
      this.setSelectedByPath(current);
    },

    switchTab(event) {
      const path = event.currentTarget.dataset.path;
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : "";
      if (current === path) {
        return;
      }
      wx.switchTab({ url: `/${path}` });
    }
  }
});
