const tabBarRoutes = [
  "pages/index/index",
  "pages/shop/index",
  "pages/cart/index",
  "pages/events/index",
  "pages/profile/index"
];

function getTabIndex(route) {
  return tabBarRoutes.indexOf(route);
}

function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== "function") {
    return;
  }
  const tabBar = page.getTabBar();
  const selected = getTabIndex(page.route || "");
  if (!tabBar || selected < 0) {
    return;
  }
  if (typeof tabBar.setSelected === "function") {
    tabBar.setSelected(selected);
    return;
  }
  if (tabBar.data && tabBar.data.selected !== selected) {
    tabBar.setData({ selected });
  }
}

module.exports = {
  getTabIndex,
  syncTabBar,
  tabBarRoutes
};
