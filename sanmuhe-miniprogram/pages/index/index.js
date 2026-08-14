const { homeSlides } = require("../../data/catalog");
const { resolveCloudImage } = require("../../config/assets");
const { addToCart, getCart, getTotal } = require("../../utils/cart");
const { getCatalog, getCachedCatalog } = require("../../utils/cloudApi");
const { syncTabBar } = require("../../utils/tabbar");

const ORDER_DRINK_KEY = "sanmuhe_order_drink_id";

function normalizeCatalog(catalog, eventList) {
  const source = catalog || {};
  return {
    drinks: Array.isArray(source.drinks) ? source.drinks : [],
    teaProducts: Array.isArray(source.teaProducts) ? source.teaProducts : [],
    rooms: Array.isArray(source.rooms) ? source.rooms : [],
    events: Array.isArray(eventList)
      ? eventList
      : (Array.isArray(source.events) ? source.events : []),
    fromCloud: source.fromCloud === true,
    fromCache: source.fromCache === true,
    source: source.source || "",
    catalogError: source.source === "error"
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
      getMeta: (item) => `${item.capacity || "茶室"} · ${item.status || "可预约"}`
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
      image: resolveCloudImage(item.thumb || item.image)
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
    displayImage: resolveCloudImage(item.thumb || item.image),
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
 * 轮播图：与包内资源同源时优先包内路径（避免重载闪烁）；
 * 其余云路径转 CDN 直链展示后台真实图（存储已配置公开读）。
 */
function resolveSlideImage(image, key) {
  const remote = String(image || "").trim();
  const packageByKey = key ? PACKAGE_SLIDE_IMAGE_BY_KEY[key] : "";
  if (!remote) {
    return packageByKey || "";
  }
  // 已是本地包内路径
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
  // 仅文件名与包内资源一致时也视为同源（cloud:// 与 CDN）
  if (packageByKey) {
    const packageFile = String(getSlideImageKey(packageByKey).split("/").pop() || "").toLowerCase();
    if (packageFile && packageFile === remoteKey) {
      return packageByKey;
    }
  }
  // 常见轮播文件名回落
  if (remoteKey && /^home-carousel-[123]\.(jpe?g|png|webp)$/i.test(remoteKey)) {
    return `/assets/images/${remoteKey.replace(/\.png$/i, ".jpg")}`;
  }
  // 云路径转 CDN 直链，展示后台真实上传的图；网络地址原样
  if (remote.indexOf("cloud://") === 0) {
    return resolveCloudImage(remote, packageByKey || "/assets/images/home-carousel-1.jpg");
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

/** 包内兜底轮播：任何路径失败时保证首屏有图，避免白屏 */
const PACKAGE_FALLBACK_HERO_SLIDES = [
  {
    id: "home-carousel-1",
    image: "/assets/images/home-carousel-1.jpg",
    titleTop: "",
    titleBottom: "",
    descTop: "",
    descBottom: "",
    seal: "茶"
  },
  {
    id: "home-carousel-2",
    image: "/assets/images/home-carousel-2.jpg",
    titleTop: "",
    titleBottom: "",
    descTop: "",
    descBottom: "",
    seal: "茶"
  },
  {
    id: "home-carousel-3",
    image: "/assets/images/home-carousel-3.jpg",
    titleTop: "",
    titleBottom: "",
    descTop: "",
    descBottom: "",
    seal: "茶"
  }
];

function getInitialHeroSlides() {
  try {
    // 冷启动：优先上次已验证的轮播；始终 resolve 到包内路径，清理历史 cloud:// 缓存
    const cached = readCachedHomeSlides();
    if (cached && cached.length) {
      const resolved = cached.map((item) => Object.assign({}, item, {
        image: resolveSlideImage(item.image, item.id)
      })).filter((item) => item.image && String(item.image).indexOf("/assets/") === 0);
      if (resolved.length) {
        return resolved;
      }
    }
    const fromPackage = buildHomeSlides(homeSlides, PACKAGE_FALLBACK_HERO_SLIDES);
    return fromPackage && fromPackage.length ? fromPackage : PACKAGE_FALLBACK_HERO_SLIDES;
  } catch (error) {
    console.warn("[home] getInitialHeroSlides failed", error);
    return PACKAGE_FALLBACK_HERO_SLIDES;
  }
}

Page({
  data: {
    homeCatalog: normalizeCatalog({}, []),
    heroSlides: getInitialHeroSlides(),
    heroCurrent: 0,
    quickActions: [
      { key: "tea", title: "茶叶购买", desc: "甄选好茶", icon: "/assets/images/home-quick-tea.png" },
      { key: "drink", title: "堂饮茶单", desc: "一席一味", icon: "/assets/images/home-quick-drink.png" },
      { key: "room", title: "茶室预定", desc: "静享茶时", icon: "/assets/images/home-quick-room.png" },
      { key: "event", title: "沙龙活动", desc: "茶事雅集", icon: "/assets/images/home-quick-event.png" }
    ],
    featuredDrink: null,
    featuredTea: null,
    featuredRoom: null,
    recommendTeas: [],
    catalogLoading: true,
    catalogError: false,
    refreshing: false,
    query: "",
    searchOpen: false,
    searchResults: [],
    cartCount: 0,
    cartTotal: 0
  },

  onLoad() {
    // 尽早点亮底部「首页」，避免自定义 tabBar 首屏 selected=-1
    syncTabBar(this);
    this.hydrateHomeFromCache();
  },

  onReady() {
    syncTabBar(this);
  },

  onShow() {
    syncTabBar(this);
    this.refreshCart();
    this.loadHomeData();
  },

  onPullRefresh() {
    if (this._homeRefreshing) {
      return;
    }
    this._homeRefreshing = true;
    this.setData({ refreshing: true });
    this.loadHomeData({ fromRefresh: true });
  },

  finishHomeRefresh(fromRefresh) {
    if (!fromRefresh) {
      return;
    }
    // 官方 scroll-view：triggered 必须先 true 再延迟 false，立刻关会卡住不回弹
    setTimeout(() => {
      this.setData({ refreshing: false });
      this._homeRefreshing = false;
    }, 400);
  },

  refreshCart() {
    const cart = getCart();
    this.setData({
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: getTotal(cart)
    });
  },

  hydrateHomeFromCache() {
    const cachedCatalog = getCachedCatalog();
    if (cachedCatalog) {
      this.applyCatalog(cachedCatalog);
    }
  },

  applyCatalog(catalogResult) {
    const homeCatalog = normalizeCatalog(catalogResult || {}, null);
    const content = (catalogResult && catalogResult.content) || {};
    // 云端与包内同源时 resolve 为包内路径，src 不变则 swiper 不重载
    let nextHeroSlides = buildHomeSlides(content.homeSlides, this.data.heroSlides);
    if (!nextHeroSlides || !nextHeroSlides.length) {
      nextHeroSlides = this.data.heroSlides && this.data.heroSlides.length
        ? this.data.heroSlides
        : PACKAGE_FALLBACK_HERO_SLIDES;
    }
    const nextData = {
      homeCatalog,
      featuredDrink: homeCatalog.drinks[0] || null,
      featuredTea: homeCatalog.teaProducts[0] || null,
      featuredRoom: homeCatalog.rooms[0] || null,
      recommendTeas: buildSeasonRecommendations(homeCatalog.teaProducts),
      searchResults: buildSearchResults(this.data.query, homeCatalog),
      catalogLoading: false,
      catalogError: homeCatalog.catalogError === true
    };
    if (!hasSameVisibleSlides(this.data.heroSlides, nextHeroSlides)) {
      nextData.heroSlides = nextHeroSlides;
    }
    writeCachedHomeSlides(nextHeroSlides);
    this.setData(nextData);
  },

  loadHomeData(options = {}) {
    const fromRefresh = options.fromRefresh === true;
    if (!fromRefresh) {
      this.setData({ catalogLoading: true });
    }
    getCatalog().then((catalogResult) => {
      this.applyCatalog(catalogResult);
      this.finishHomeRefresh(fromRefresh);
    }).catch((error) => {
      console.warn("[home] getCatalog failed", error);
      this.setData({ catalogLoading: false, catalogError: true });
      this.finishHomeRefresh(fromRefresh);
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
    // 与文案「查看权益」一致：直达会员中心并定位权益区
    wx.navigateTo({ url: "/pages/member/index?focus=benefits" });
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
      image: resolveCloudImage(product.thumb || product.image),
      category: product.category,
      options: {
        unit: defaultSpec ? defaultSpec.label : product.unit
      }
    });
    this.refreshCart();
    // 首页不展示购物车浮层，用 toast 反馈；完整结算在点单/商城
    wx.showToast({ title: "已加入购物车", icon: "success" });
  },

  goProduct(event) {
    wx.navigateTo({
      url: `/pages/product/index?id=${event.currentTarget.dataset.id}`
    });
  }
});
