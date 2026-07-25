const { drinks, teaProducts, rooms, events, homeSlides } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog, listEvents } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

function normalizeCatalog(catalog, eventList) {
  const fromCloud = catalog && catalog.fromCloud;
  return {
    drinks: fromCloud ? (catalog.drinks || []) : (catalog.drinks && catalog.drinks.length ? catalog.drinks : drinks),
    teaProducts: fromCloud ? (catalog.teaProducts || []) : (catalog.teaProducts && catalog.teaProducts.length ? catalog.teaProducts : teaProducts),
    rooms: fromCloud ? (catalog.rooms || []) : (catalog.rooms && catalog.rooms.length ? catalog.rooms : rooms),
    events: eventList && eventList.length ? eventList : (fromCloud ? (catalog.events || []) : (catalog.events && catalog.events.length ? catalog.events : events)),
    fromCloud
  };
}

function buildSearchResults(query, catalog) {
  const keyword = String(query || "").trim().toLowerCase();
  if (!keyword) {
    return [];
  }

  const groups = [
    {
      type: "tea",
      label: "茶叶",
      items: catalog.teaProducts,
      getMeta: (item) => `${item.category || "茶叶"} · ¥${item.price}/${item.unit || "份"}`
    },
    {
      type: "drink",
      label: "茶饮",
      items: catalog.drinks,
      getMeta: (item) => `${item.category || "茶饮"} · ¥${item.price}`
    },
    {
      type: "room",
      label: "茶室",
      items: catalog.rooms,
      getMeta: (item) => `${item.capacity || ""} · ¥${item.price}/小时`
    },
    {
      type: "event",
      label: "活动",
      items: catalog.events,
      getMeta: (item) => `${item.date || ""} ${item.time || ""}`
    }
  ];

  return groups.reduce((result, group) => {
    const matched = (group.items || []).filter((item) => {
      const haystack = [
        item.name,
        item.title,
        item.category,
        item.summary,
        item.taste,
        item.origin,
        item.place
      ].join(" ").toLowerCase();
      return haystack.indexOf(keyword) >= 0;
    }).slice(0, 3).map((item) => ({
      id: item.id,
      type: group.type,
      label: group.label,
      title: item.name || item.title,
      meta: group.getMeta(item),
      image: item.thumb || item.image
    }));
    return result.concat(matched);
  }, []).slice(0, 8);
}

function buildSeasonRecommendations(products) {
  const tags = {
    "tea-001": "2024 新茶",
    "tea-002": "人气之选",
    "tea-003": "春日限定"
  };
  const notes = {
    "tea-001": "清香鲜爽",
    "tea-002": "岩骨花香",
    "tea-003": "毫香清雅"
  };
  const ids = ["tea-001", "tea-002", "tea-003"];
  const source = products || [];
  const picked = ids.map((id) => source.find((item) => item.id === id)).filter(Boolean);
  const fallback = source.filter((item) => picked.every((pickedItem) => pickedItem.id !== item.id)).slice(0, 3 - picked.length);
  return picked.concat(fallback).slice(0, 3).map((item) => Object.assign({}, item, {
    displayImage: item.thumb || item.image,
    seasonTag: tags[item.id] || item.category || "精选",
    shortNote: notes[item.id] || item.taste || "甄选好茶"
  }));
}

function buildHomeSlides(contentSlides, fallbackSlides) {
  const slides = Array.isArray(contentSlides) ? contentSlides : [];
  const normalized = slides
    .filter((item) => item && item.visible !== false && item.image)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map((item, index) => ({
      id: item.key || item.id || `content-slide-${index}`,
      image: item.image,
      titleTop: item.title || "",
      titleBottom: item.subtitle || "",
      descTop: item.summary || "",
      descBottom: "",
      seal: item.badge || "茶",
      linkType: item.linkType || "",
      linkTarget: item.linkTarget || ""
    }));
  return normalized.length ? normalized : fallbackSlides;
}

Page({
  data: {
    homeCatalog: normalizeCatalog({ drinks, teaProducts, rooms, events }, events),
    heroSlides: buildHomeSlides(homeSlides, []),
    heroCurrent: 0,
    quickActions: [
      { key: "tea", title: "茶叶购买", desc: "甄选好茶", icon: "/assets/icons/home-leaf.png" },
      { key: "drink", title: "茶饮点单", desc: "新鲜现制", icon: "/assets/icons/home-cup.png" },
      { key: "room", title: "茶室预定", desc: "静享茶时", icon: "/assets/icons/home-house.png" },
      { key: "event", title: "活动发布", desc: "茶事雅集", icon: "/assets/icons/home-calendar.png" }
    ],
    featuredDrink: drinks[0],
    featuredTea: teaProducts[0],
    featuredRoom: rooms[0],
    nextEvent: events[0],
    recommendTeas: buildSeasonRecommendations(teaProducts),
    query: "",
    searchOpen: false,
    searchResults: [],
    cartCount: 0,
    cartTotal: 0
  },

  onLoad() {
    this.loadHomeData();
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
  },

  refreshCart() {
    const cart = getCart();
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: getTotal(cart)
    });
  },

  loadHomeData() {
    Promise.all([
      getCatalog(),
      listEvents()
    ]).then(([catalogResult, eventList]) => {
      const homeCatalog = normalizeCatalog(catalogResult || {}, eventList);
      const content = catalogResult && catalogResult.content || {};
      this.setData({
        homeCatalog,
        heroSlides: buildHomeSlides(content.homeSlides, this.data.heroSlides),
        featuredDrink: homeCatalog.drinks[0] || drinks[0],
        featuredTea: homeCatalog.teaProducts[0] || teaProducts[0],
        featuredRoom: homeCatalog.rooms[0] || rooms[0],
        nextEvent: homeCatalog.events[0] || events[0],
        recommendTeas: buildSeasonRecommendations(homeCatalog.teaProducts),
        searchResults: buildSearchResults(this.data.query, homeCatalog)
      });
    });
  },

  onHeroChange(event) {
    this.setData({ heroCurrent: event.detail.current || 0 });
  },

  onSearchInput(event) {
    const query = event.detail.value;
    this.setData({
      query,
      searchOpen: true,
      searchResults: buildSearchResults(query, this.data.homeCatalog)
    });
  },

  focusSearch() {
    this.setData({ searchOpen: true });
  },

  clearSearch() {
    this.setData({
      query: "",
      searchOpen: false,
      searchResults: []
    });
  },

  submitSearch() {
    const first = this.data.searchResults[0];
    if (first) {
      this.routeSearchResult(first.type, first.id);
      return;
    }
    wx.showToast({ title: "没有找到相关内容", icon: "none" });
  },

  tapSearchResult(event) {
    this.routeSearchResult(event.currentTarget.dataset.type, event.currentTarget.dataset.id);
  },

  routeSearchResult(type, id) {
    this.clearSearch();
    if (type === "tea") {
      wx.navigateTo({ url: `/pages/product/index?id=${id}` });
      return;
    }
    if (type === "drink") {
      wx.setStorageSync("sanmuhe_shop_category", "茶饮");
      wx.switchTab({ url: "/pages/shop/index" });
      return;
    }
    if (type === "room") {
      wx.navigateTo({ url: "/pages/reservation/index" });
      return;
    }
    wx.switchTab({ url: "/pages/events/index" });
  },

  tapQuickAction(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "tea") {
      this.goShop();
      return;
    }
    if (key === "drink") {
      this.goOrder();
      return;
    }
    if (key === "room") {
      this.goReservation();
      return;
    }
    this.goEvents();
  },

  goOrder() {
    wx.setStorageSync("sanmuhe_shop_category", "茶饮");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goShop() {
    wx.setStorageSync("sanmuhe_shop_category", "茶叶");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.switchTab({ url: "/pages/events/index" });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index" });
  },

  goCart() {
    wx.navigateTo({ url: "/pages/cart/index" });
  },

  addRecommended(event) {
    const product = this.data.recommendTeas.find((item) => item.id === event.currentTarget.dataset.id);
    if (!product) {
      return;
    }
    if (Array.isArray(product.specs) && product.specs.length > 1) {
      wx.navigateTo({ url: `/pages/product/index?id=${product.id}` });
      return;
    }
    const defaultSpec = Array.isArray(product.specs) && product.specs[0] ? product.specs[0] : null;
    addToCart({
      id: product.id,
      type: "tea",
      name: product.name,
      price: defaultSpec ? defaultSpec.price : product.price,
      color: product.color,
      image: product.thumb || product.image,
      category: product.category,
      options: {
        unit: defaultSpec ? defaultSpec.label : product.unit
      }
    });
    this.refreshCart();
    wx.showToast({ title: "已加入" });
  },

  goProduct(event) {
    wx.navigateTo({
      url: `/pages/product/index?id=${event.currentTarget.dataset.id}`
    });
  }
});
