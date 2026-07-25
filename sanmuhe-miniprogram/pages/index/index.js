const { drinks, teaProducts, rooms, events, homeSlides } = require("../../data/catalog");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog, listEvents } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const ORDER_DRINK_KEY = "sanmuhe_order_drink_id";

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
      label: "堂饮",
      items: catalog.drinks,
      getMeta: (item) => `堂饮茶单 · ¥${item.price}/${item.unit || item.badge || "道"}`
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

// 轮播图行业通用：首屏稳定图源 + 同源不替换，避免「本地 → CDN」二次 setData 闪一下。
const HOME_SLIDES_CACHE_KEY = "sanmuhe_home_slides_v1";

function getSlideImageKey(image) {
  const normalized = String(image || "").split("?")[0].replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  const assetIndex = normalized.indexOf("/assets/");
  if (assetIndex >= 0) {
    return normalized.slice(assetIndex);
  }
  // cloud://env/xxx/file.jpg 或 CDN 自定义路径：退化为文件名比较
  const fileName = normalized.split("/").filter(Boolean).pop() || "";
  return fileName.toLowerCase();
}

const PACKAGE_SLIDE_IMAGE_BY_KEY = (homeSlides || []).reduce((map, item) => {
  if (item && item.key && item.image) {
    map[item.key] = item.image;
  }
  return map;
}, {});

const PACKAGE_IMAGE_BY_ASSET = Object.keys(PACKAGE_SLIDE_IMAGE_BY_KEY).reduce((map, key) => {
  const image = PACKAGE_SLIDE_IMAGE_BY_KEY[key];
  const assetPath = getSlideImageKey(image);
  if (assetPath) {
    map[assetPath] = image;
  }
  return map;
}, {});

/**
 * 云端图与包内图实质相同时，继续用包内路径。
 * 避免同一张图从 /assets/... 换成 tcb CDN 触发 image 重载闪动。
 */
function resolveSlideImage(image, key) {
  const remote = String(image || "").trim();
  const packageByKey = key ? PACKAGE_SLIDE_IMAGE_BY_KEY[key] : "";
  if (!remote) {
    return packageByKey || "";
  }
  if (remote.indexOf("/assets/") === 0) {
    return remote;
  }
  const remoteKey = getSlideImageKey(remote);
  if (packageByKey && getSlideImageKey(packageByKey) === remoteKey) {
    return packageByKey;
  }
  if (PACKAGE_IMAGE_BY_ASSET[remoteKey]) {
    return PACKAGE_IMAGE_BY_ASSET[remoteKey];
  }
  // 仅文件名与包内资源一致时也视为同源（CDN 不带 /assets/ 前缀的情况）
  if (packageByKey) {
    const packageFile = String(getSlideImageKey(packageByKey).split("/").pop() || "").toLowerCase();
    if (packageFile && packageFile === remoteKey) {
      return packageByKey;
    }
  }
  return remote;
}

function buildHomeSlides(contentSlides, fallbackSlides) {
  const slides = Array.isArray(contentSlides) ? contentSlides : [];
  const normalized = slides
    .filter((item) => item && item.visible !== false && (item.image || PACKAGE_SLIDE_IMAGE_BY_KEY[item.key]))
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
    .map((item, index) => {
      const id = item.key || item.id || `content-slide-${index}`;
      return {
        id,
        image: resolveSlideImage(item.image, item.key || id),
        titleTop: item.title || "",
        titleBottom: item.subtitle || "",
        descTop: item.summary || "",
        descBottom: "",
        seal: item.badge || "茶",
        linkType: item.linkType || "",
        linkTarget: item.linkTarget || ""
      };
    })
    .filter((item) => item.image);
  return normalized.length ? normalized : (fallbackSlides || []);
}

function hasSameVisibleSlides(currentSlides, nextSlides) {
  const current = Array.isArray(currentSlides) ? currentSlides : [];
  const next = Array.isArray(nextSlides) ? nextSlides : [];
  return current.length === next.length && current.every((item, index) => (
    item.id === next[index].id
    && getSlideImageKey(item.image) === getSlideImageKey(next[index].image)
    && String(item.image || "") === String(next[index].image || "")
  ));
}

function readCachedHomeSlides() {
  try {
    const cached = wx.getStorageSync(HOME_SLIDES_CACHE_KEY);
    if (!Array.isArray(cached) || !cached.length) {
      return null;
    }
    const valid = cached.every((item) => item && item.id && item.image);
    return valid ? cached : null;
  } catch (error) {
    return null;
  }
}

function writeCachedHomeSlides(slides) {
  try {
    if (Array.isArray(slides) && slides.length) {
      wx.setStorageSync(HOME_SLIDES_CACHE_KEY, slides);
    }
  } catch (error) {
    // storage 满或不可用时忽略，不影响展示
  }
}

function getInitialHeroSlides() {
  // 冷启动：优先上次已验证的轮播，避免每次都先本地再跳云端
  const cached = readCachedHomeSlides();
  if (cached && cached.length) {
    return cached.map((item) => Object.assign({}, item, {
      image: resolveSlideImage(item.image, item.id)
    }));
  }
  return buildHomeSlides(homeSlides, []);
}

Page({
  data: {
    homeCatalog: normalizeCatalog({ drinks, teaProducts, rooms, events }, events),
    heroSlides: getInitialHeroSlides(),
    heroCurrent: 0,
    quickActions: [
      { key: "tea", title: "茶叶购买", desc: "甄选好茶", icon: "/assets/icons/home-leaf.png" },
      { key: "drink", title: "堂饮茶单", desc: "一席一味", icon: "/assets/icons/home-cup.png" },
      { key: "room", title: "茶室预定", desc: "静享茶时", icon: "/assets/icons/home-house.png" },
      { key: "event", title: "沙龙活动", desc: "茶事雅集", icon: "/assets/icons/home-calendar.png" }
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
    getCatalog().then((catalogResult) => {
      const homeCatalog = normalizeCatalog(catalogResult || {}, null);
      const content = catalogResult && catalogResult.content || {};
      // 云端与包内同源时 resolve 为包内路径，src 不变则 swiper 不重载
      const nextHeroSlides = buildHomeSlides(content.homeSlides, this.data.heroSlides);
      const nextData = {
        homeCatalog,
        featuredDrink: homeCatalog.drinks[0] || drinks[0],
        featuredTea: homeCatalog.teaProducts[0] || teaProducts[0],
        featuredRoom: homeCatalog.rooms[0] || rooms[0],
        nextEvent: homeCatalog.events[0] || events[0],
        recommendTeas: buildSeasonRecommendations(homeCatalog.teaProducts),
        searchResults: buildSearchResults(this.data.query, homeCatalog)
      };
      if (!hasSameVisibleSlides(this.data.heroSlides, nextHeroSlides)) {
        nextData.heroSlides = nextHeroSlides;
        // 不强制归零：避免轮播已在滑动时被重置造成「一晃」
      }
      // 缓存已解析后的稳定图源，供下次冷启动首屏直接使用
      writeCachedHomeSlides(nextHeroSlides);
      this.setData(nextData);
    });

    listEvents().then((eventList) => {
      const eventsFromCloud = Array.isArray(eventList) ? eventList : [];
      const homeCatalog = Object.assign({}, this.data.homeCatalog, {
        events: eventsFromCloud
      });
      this.setData({
        homeCatalog,
        nextEvent: eventsFromCloud[0] || events[0],
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
      wx.setStorageSync(ORDER_DRINK_KEY, id);
      wx.switchTab({ url: "/pages/order/index" });
      return;
    }
    if (type === "room") {
      wx.navigateTo({ url: "/pages/reservation/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/events/index" });
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
    wx.switchTab({ url: "/pages/order/index" });
  },

  goShop() {
    // 茶叶购买：进入分类页并定位到红茶
    wx.setStorageSync("sanmuhe_shop_category", "红茶");
    wx.switchTab({ url: "/pages/shop/index" });
  },

  goReservation() {
    wx.navigateTo({ url: "/pages/reservation/index" });
  },

  goEvents() {
    wx.navigateTo({ url: "/pages/events/index" });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index" });
  },

  goCart() {
    wx.navigateTo({ url: "/pages/cart/index?mode=retail" });
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
