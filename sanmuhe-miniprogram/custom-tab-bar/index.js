function normalizeRoute(route) {
  return String(route || "").replace(/^\//, "").split("?")[0];
}

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
    // 默认选中首页，避免冷启动 attached 时 getCurrentPages 为空导致 selected=-1「无选中」
    selected: 0,
    list: [
      { pagePath: "pages/index/index", text: "首页", icon: "/assets/icons/home-line.png", activeIcon: "/assets/icons/home-active.png" },
      { pagePath: "pages/order/index", text: "点单", icon: "/assets/icons/menu-line.png", activeIcon: "/assets/icons/menu-active.png" },
      { pagePath: "pages/shop/index", text: "商城", icon: "/assets/icons/shop-line.png", activeIcon: "/assets/icons/shop-active.png" },
      { pagePath: "pages/profile/index", text: "我的", icon: "/assets/icons/profile-line.png", activeIcon: "/assets/icons/profile-active.png" }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    },
    ready() {
      // force-selected / 页面路由可能在 attached 之后才就绪
      this.syncSelected();
      // 再补一帧，规避自定义 tabBar 首屏路由尚未写入 getCurrentPages 的情况
      setTimeout(() => this.syncSelected(), 0);
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
      const normalized = normalizeRoute(path);
      const selected = this.data.list.findIndex((item) => item.pagePath === normalized);
      // 匹配不到时不要清成未选中
      if (selected < 0) {
        return;
      }
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
      if (!current) {
        // 栈未就绪：保持默认首页选中
        if (this.data.selected < 0) {
          this.setSelected(0);
        }
        return;
      }
      this.setSelectedByPath(current);
    },

    switchTab(event) {
      const path = normalizeRoute(event.currentTarget.dataset.path);
      const pages = getCurrentPages();
      const current = normalizeRoute(pages.length ? pages[pages.length - 1].route : "");
      // 先点亮，再跳转，避免切换瞬间无高亮
      this.setSelectedByPath(path);
      if (current === path) {
        return;
      }
      wx.switchTab({ url: `/${path}` });
    }
  }
});
