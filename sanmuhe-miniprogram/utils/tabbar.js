const tabBarRoutes = [
  "pages/index/index",
  "pages/order/index",
  "pages/shop/index",
  "pages/profile/index"
];

function normalizeRoute(route) {
  return String(route || "").replace(/^\//, "").split("?")[0];
}

function getTabIndex(route) {
  return tabBarRoutes.indexOf(normalizeRoute(route));
}

function applyTabSelected(tabBar, selected) {
  if (!tabBar || selected < 0) {
    return false;
  }
  if (typeof tabBar.setSelected === "function") {
    tabBar.setSelected(selected);
    return true;
  }
  if (typeof tabBar.setSelectedByPath === "function") {
    tabBar.setSelectedByPath(tabBarRoutes[selected]);
    return true;
  }
  if (tabBar.data && tabBar.data.selected !== selected) {
    tabBar.setData({ selected });
    return true;
  }
  return false;
}

function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== "function") {
    return;
  }
  const selected = getTabIndex(page.route || "");
  if (selected < 0) {
    return;
  }

  const trySync = () => {
    const tabBar = page.getTabBar();
    return applyTabSelected(tabBar, selected);
  };

  if (trySync()) {
    return;
  }
  // 自定义 tabBar 冷启动时 getTabBar() 偶发为 null，短延迟再试
  setTimeout(trySync, 0);
  setTimeout(trySync, 50);
}

module.exports = {
  getTabIndex,
  syncTabBar,
  tabBarRoutes
};
