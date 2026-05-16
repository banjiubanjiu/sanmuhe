<script setup>
import { computed, h, markRaw, onMounted, reactive } from "vue";
import {
  BadgeDollarSign,
  Bell,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Home,
  Megaphone,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  TicketPercent,
  Upload,
  UserPlus,
  UserRound,
  Users
} from "@lucide/vue";

const CONFIG = {
  envId: "sanmuhe-env-d3g1nt3jsa1be67e3",
  region: "ap-shanghai",
  accessKey: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL3Nhbm11aGUtZW52LWQzZzFudDNqc2ExYmU2N2UzLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJzYW5tdWhlLWVudi1kM2cxbnQzanNhMWJlNjdlMyIsImV4cCI6NDA4MjUxODk5NiwiaWF0IjoxNzc4ODM1Nzk2LCJub25jZSI6Im8xbE9LR053VGs2U2I4WGgyTUpfbmciLCJhdF9oYXNoIjoibzFsT0tHTndUazZTYjhYaDJNSl9uZyIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJzYW5tdWhlLWVudi1kM2cxbnQzanNhMWJlNjdlMyIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.OEuP69P5I_7iZiARFAcqBTO3jbhUwe2uruyIIlqLQPyqkikfnbuNS2AtPjy1zZqU0IFKU_QZH3HAG_oOvTPwH8n1WNWRcLNsetLvPM0pgCYvt5FcbaC6w8-zMxqSr2bCm1C0qLzz1Hu69LwD4YV86yhUUgsHiYsrrtIiRfdhX22sZgV6z57dlhidaCIFQCsr8bNdvEe_5tWPkDYqfernkqYHSZNfds2ILxAR-DYgt7j22zh2LUxzxLagIZ4SwTiea_UmNe7eUDdtjci-lqdLMDev7jbeVxndLnKq6cfBQvZANgjcI_57NxtQmDvSB7jVGuITgBCpPXBLGvNbjcUd9A"
};

let cloudApp = null;
let cloudAuth = null;

const DetailRow = {
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number], default: "" }
  },
  setup(props) {
    return () => h("div", { class: "detail-row" }, [
      h("span", props.label),
      h("strong", props.value || "-")
    ]);
  }
};

const navItems = [
  { key: "dashboard", label: "首页", icon: Home },
  { key: "reservations", label: "茶室预约", icon: CalendarCheck },
  { key: "signups", label: "茶事活动", icon: TicketPercent },
  { key: "orders", label: "订单管理", icon: ClipboardList },
  { key: "customers", label: "用户管理", icon: UserRound },
  { key: "catalog", label: "商品管理", icon: Package },
  { key: "content", label: "内容管理", icon: FileText },
  { key: "analytics", label: "数据统计", icon: ChartNoAxesColumnIncreasing },
  { key: "marketing", label: "营销中心", icon: Megaphone },
  { key: "settings", label: "设置管理", icon: Settings }
];

const collectionTabs = [
  { key: "tea_products", label: "茶叶" },
  { key: "drinks", label: "茶饮" },
  { key: "rooms", label: "茶室" },
  { key: "events", label: "活动" }
];

const contentTabs = [
  { key: "home_carousel", label: "首页轮播" },
  { key: "home_card", label: "首页卡片" },
  { key: "notice", label: "公告" },
  { key: "all", label: "全部内容" }
];

const quickActions = [
  { tab: "reservations", label: "新增预约", icon: CalendarCheck },
  { tab: "signups", label: "新增活动", icon: TicketPercent },
  { tab: "content", label: "发布内容", icon: PenLine },
  { tab: "orders", label: "订单管理", icon: ClipboardList },
  { tab: "customers", label: "用户管理", icon: Users },
  { tab: "analytics", label: "数据统计", icon: ChartNoAxesColumnIncreasing }
];

const fallbackMetricIcons = [CalendarCheck, TicketPercent, BadgeDollarSign, UserPlus, CircleDollarSign];

const pageTitles = {
  dashboard: ["后台首页", "今日经营、履约状态与高频动作"],
  reservations: ["茶室预约", "确认、取消与备注每一次茶席"],
  signups: ["活动报名", "茶会报名与名额动态"],
  orders: ["订单管理", "支付、发货、自提和异常处理"],
  customers: ["用户管理", "会员画像、消费与互动记录"],
  catalog: ["商品管理", "茶叶、茶饮、茶室与活动资料"],
  content: ["内容管理", "首页轮播、公告和运营内容"],
  analytics: ["数据统计", "经营走势、转化和热销项目"],
  marketing: ["营销中心", "优惠券和活动计划"],
  settings: ["设置管理", "门店、会员和通知配置"]
};

const state = reactive({
  user: null,
  ready: false,
  view: "login",
  activeTab: "dashboard",
  collection: "tea_products",
  contentType: "home_carousel",
  loading: "",
  loginError: "",
  summary: [],
  dashboard: null,
  catalogItems: [],
  orders: [],
  reservations: [],
  signups: [],
  customers: [],
  contentItems: [],
  analytics: null,
  coupons: [],
  campaigns: [],
  settings: {},
  selectedCatalogId: "",
  selectedOrderId: "",
  selectedReservationId: "",
  selectedSignupId: "",
  selectedCustomerId: "",
  selectedContentKey: ""
});

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__SANMUHE_ADMIN_STATE__ = state;
}

const filters = reactive({
  global: "",
  catalog: "",
  orderStatus: "",
  orderKeyword: "",
  reservationStatus: "",
  reservationKeyword: "",
  signupStatus: "",
  signupKeyword: "",
  customerKeyword: ""
});

const loginForm = reactive({ username: "", password: "" });
const uploadState = reactive({ catalog: "", content: "" });
const orderForm = reactive({
  trackingCompany: "",
  trackingNo: "",
  cancelReason: "管理员取消"
});
const toast = reactive({ show: false, text: "" });
let toastTimer = null;

const emptyCatalog = () => ({
  id: "",
  name: "",
  title: "",
  category: "",
  price: 0,
  unit: "",
  stock: 0,
  capacity: "",
  floor: "",
  date: "",
  time: "",
  place: "",
  quota: 30,
  signed: 0,
  status: "",
  image: "",
  thumb: "",
  notes: "",
  taste: "",
  summary: "",
  detail: "",
  origin: "",
  roast: "",
  sort: 10,
  visible: true,
  deleted: false
});

const forms = reactive({
  catalog: emptyCatalog(),
  content: {
    key: "",
    type: "home_carousel",
    title: "",
    subtitle: "",
    summary: "",
    image: "",
    linkType: "page",
    linkTarget: "",
    sort: 10,
    visible: true
  },
  coupon: {
    id: "",
    name: "",
    description: "",
    amount: 10,
    threshold: 0,
    stock: 100,
    claimLimit: 1,
    startAt: "",
    endAt: "",
    status: "领取中",
    visible: true
  },
  campaign: {
    id: "",
    name: "",
    type: "banner",
    summary: "",
    startAt: "",
    endAt: "",
    status: "进行中",
    visible: true
  }
});

const currentTitle = computed(() => pageTitles[state.activeTab] || pageTitles.dashboard);
const currentUser = computed(() => state.user?.username || state.user?.email || state.user?.uid || "三木合管理员");
const selectedOrder = computed(() => state.orders.find((item) => item._id === state.selectedOrderId) || state.orders[0] || null);
const selectedReservation = computed(() => state.reservations.find((item) => item._id === state.selectedReservationId) || state.reservations[0] || null);
const selectedSignup = computed(() => state.signups.find((item) => item._id === state.selectedSignupId) || state.signups[0] || null);
const selectedCustomer = computed(() => state.customers.find((item) => item.id === state.selectedCustomerId) || state.customers[0] || null);
const dashboardInsight = computed(() => {
  const summary = state.dashboard?.summary || {};
  const revenue = Number(summary.monthRevenue || summary.totalRevenue || 0);
  const orderCount = Number(summary.activeOrders || summary.todayOrders || 0);
  const reservationCount = Number(summary.todayReservations || 0);
  const signupCount = Number(summary.todaySignups || 0);
  const totalCount = orderCount + reservationCount + signupCount;
  const segments = totalCount
    ? [
        { label: "茶品订单", value: Math.round((orderCount / totalCount) * 1000) / 10, className: "orders" },
        { label: "茶室预约", value: Math.round((reservationCount / totalCount) * 1000) / 10, className: "rooms" },
        { label: "活动报名", value: Math.max(0, Math.round((signupCount / totalCount) * 1000) / 10), className: "events" }
      ]
    : [
        { label: "茶品订单", value: 68.5, className: "orders" },
        { label: "茶室预约", value: 20.3, className: "rooms" },
        { label: "活动报名", value: 11.2, className: "events" }
      ];
  return {
    revenue,
    orderCount,
    averagePrice: orderCount ? Math.round(revenue / orderCount) : 0,
    segments
  };
});
const dashboardDonutStyle = computed(() => {
  const first = dashboardInsight.value.segments[0]?.value || 68.5;
  const second = first + (dashboardInsight.value.segments[1]?.value || 20.3);
  return {
    "--first-stop": `${first}%`,
    "--second-stop": `${Math.min(second, 100)}%`
  };
});

const filteredCatalog = computed(() => {
  const keyword = filters.catalog.trim().toLowerCase();
  if (!keyword) return state.catalogItems;
  return state.catalogItems.filter((item) => textOf(item, ["id", "name", "title", "category", "status"]).includes(keyword));
});

function textOf(item, fields) {
  return fields.map((field) => String(item?.[field] || "")).join(" ").toLowerCase();
}

function showToast(text) {
  toast.text = text;
  toast.show = true;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.show = false;
  }, 2600);
}

function setCurrentUser(user) {
  state.user = user && typeof user === "object" ? markRaw(user) : user;
}

function money(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function numberText(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function metricValue(card) {
  const text = numberText(card.value);
  return /金额|营业额/.test(card.label) ? `¥ ${text}` : text;
}

function metricIcon(card, index) {
  return card.icon || fallbackMetricIcons[index % fallbackMetricIcons.length];
}

function buildDashboardSummaryCards(summary = {}) {
  return [
    { label: "今日预约（茶室）", value: summary.todayReservations || 0, meta: "茶室", tone: "green", icon: CalendarCheck, delta: "较昨日 +3" },
    { label: "今日活动报名", value: summary.todaySignups || 0, meta: "活动", tone: "moss", icon: TicketPercent, delta: "较昨日 +2" },
    { label: "今日订单金额", value: summary.todayOrderAmount || 0, meta: "订单", tone: "gold", icon: BadgeDollarSign, delta: "较昨日 +12.5%" },
    { label: "今日新增用户", value: summary.newCustomers || 0, meta: "用户", tone: "ink", icon: UserPlus, delta: "较昨日 +5" },
    { label: "本月营业额", value: summary.monthRevenue || summary.totalRevenue || 0, meta: "经营", tone: "sand", icon: CircleDollarSign, delta: "较上月 +18.6%" }
  ];
}

function displayName(item) {
  return item?.name || item?.title || item?.orderNo || item?.id || "未命名";
}

function displayInventory(item) {
  if (!item) return "-";
  if (item.stock !== undefined) {
    return `总 ${Number(item.stock || 0)} / 锁 ${Number(item.lockedStock || 0)} / 售 ${Number(item.soldStock || 0)}`;
  }
  if (item.quota !== undefined) {
    return `${Number(item.signed || 0)} / ${Number(item.quota || 0)}`;
  }
  return "-";
}

function displayImage(src) {
  if (!src || src.startsWith("cloud://")) return "";
  if (src.startsWith("/assets/")) return `..${src}`;
  return src;
}

function formatDate(value) {
  if (!value) return "未记录";
  const raw = value?.$date || (value?.seconds ? value.seconds * 1000 : value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function normalizeAuth(app) {
  if (app.auth && typeof app.auth.getSession === "function") return app.auth;
  if (typeof app.auth === "function") return app.auth({ persistence: "local" });
  return app.auth;
}

function sanitizeFileName(name) {
  return String(name || "image").replace(/[^\w.-]/g, "_");
}

async function uploadFormImage(target, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  uploadState[target] = "上传中";
  try {
    const folder = target === "catalog" ? state.collection : "content";
    const result = await cloudApp.uploadFile({
      cloudPath: `admin/${folder}/${Date.now()}-${sanitizeFileName(file.name)}`,
      filePath: file
    });
    const fileId = result.fileID || result.fileId || "";
    if (!fileId) throw new Error("上传成功但未返回文件 ID");
    if (target === "catalog") forms.catalog.image = fileId;
    if (target === "content") forms.content.image = fileId;
    uploadState[target] = `已上传：${file.name}`;
    showToast("图片已上传到云存储");
  } catch (error) {
    uploadState[target] = error.message || "图片上传失败";
    showToast(uploadState[target]);
  } finally {
    if (event?.target) event.target.value = "";
  }
}

function initCloud() {
  if (!window.cloudbase) throw new Error("CloudBase Web SDK 加载失败");
  const options = {
    env: CONFIG.envId,
    region: CONFIG.region,
    auth: { detectSessionInUrl: true }
  };
  if (CONFIG.accessKey && CONFIG.accessKey.indexOf("...") < 0) {
    options.accessKey = CONFIG.accessKey;
  }
  cloudApp = window.cloudbase.init(options);
  cloudAuth = normalizeAuth(cloudApp);
}

async function signIn() {
  state.loginError = "";
  state.loading = "登录中";
  try {
    const username = loginForm.username.trim();
    const password = loginForm.password;
    let result;
    if (cloudAuth.signInWithPassword) {
      result = await cloudAuth.signInWithPassword({ username, password });
    } else if (cloudAuth.signIn) {
      result = await cloudAuth.signIn({ username, password });
    } else if (cloudAuth.signInWithUsernameAndPassword) {
      result = await cloudAuth.signInWithUsernameAndPassword(username, password);
    } else {
      throw new Error("当前 SDK 不支持用户名密码登录");
    }
    setCurrentUser(result?.data?.user || result?.user || result || { username });
    await enterDashboard();
  } catch (error) {
    state.loginError = error.message || "登录失败";
  } finally {
    state.loading = "";
  }
}

async function getSessionUser() {
  if (!cloudAuth) return null;
  if (cloudAuth.getSession) {
    const result = await cloudAuth.getSession();
    return result?.data?.session?.user || null;
  }
  if (cloudAuth.getLoginState) {
    const result = await cloudAuth.getLoginState();
    return result?.user || null;
  }
  return null;
}

async function logout() {
  try {
    if (cloudAuth?.signOut) await cloudAuth.signOut();
  } finally {
    state.user = null;
    state.view = "login";
  }
}

async function callFunction(name, data = {}) {
  const response = await cloudApp.callFunction({ name, data });
  const result = response?.result || response || {};
  if (result.ok === false) throw new Error(result.message || "云函数调用失败");
  return result;
}

async function enterDashboard() {
  state.view = "dashboard";
  await loadActiveTab();
  if (state.activeTab !== "dashboard") await refreshSummary();
}

async function switchTab(tab) {
  state.activeTab = tab;
  await loadActiveTab();
}

async function refreshSummary() {
  try {
    const result = await callFunction("manageOperations", { action: "getSummary" });
    const s = result.summary || {};
    state.summary = [
      { label: "待支付", value: s.pendingPay || 0, meta: "订单", tone: "sand", icon: CircleDollarSign, delta: "较昨日 -" },
      { label: "待发货", value: s.toShip || 0, meta: "履约", tone: "green", icon: Package, delta: "较昨日 +2" },
      { label: "待自提", value: s.toPickup || 0, meta: "门店", tone: "moss", icon: CalendarDays, delta: "较昨日 +1" },
      { label: "待确认预约", value: s.pendingReservations || 0, meta: "茶室", tone: "ink", icon: CalendarCheck, delta: "较昨日 +3" },
      { label: "待处理报名", value: s.pendingSignups || 0, meta: "活动", tone: "gold", icon: UserPlus, delta: "较昨日 +2" }
    ];
  } catch (error) {
    state.summary = [];
  }
}

async function loadActiveTab() {
  const map = {
    dashboard: loadDashboard,
    catalog: loadCatalog,
    orders: loadOrders,
    reservations: loadReservations,
    signups: loadSignups,
    customers: loadCustomers,
    content: loadContent,
    analytics: loadAnalytics,
    marketing: loadMarketing,
    settings: loadSettings
  };
  return map[state.activeTab]?.();
}

async function withLoading(label, task) {
  state.loading = label;
  try {
    await task();
  } catch (error) {
    showToast(error.message || `${label}失败`);
  } finally {
    state.loading = "";
  }
}

async function loadDashboard() {
  await withLoading("读取首页", async () => {
    const result = await callFunction("manageOperations", { action: "getDashboard" });
    state.dashboard = result.dashboard || {};
    state.summary = buildDashboardSummaryCards(state.dashboard.summary || {});
  });
}

async function loadCatalog() {
  await withLoading("读取商品", async () => {
    const result = await callFunction("manageCatalog", {
      action: "list",
      collection: state.collection,
      includeHidden: true
    });
    state.catalogItems = result.items || [];
    if (!state.catalogItems.some((item) => item.id === state.selectedCatalogId)) {
      state.selectedCatalogId = state.catalogItems[0]?.id || "";
    }
    editCatalog(state.catalogItems.find((item) => item.id === state.selectedCatalogId) || null);
  });
}

function selectCollection(key) {
  state.collection = key;
  state.selectedCatalogId = "";
  resetCatalog();
  loadCatalog();
}

function resetCatalog() {
  Object.assign(forms.catalog, emptyCatalog(), {
    id: `${state.collection}-${Date.now()}`,
    status: state.collection === "events" ? "报名中" : state.collection === "rooms" ? "可预定" : "上架"
  });
}

function editCatalog(item) {
  if (!item) {
    resetCatalog();
    return;
  }
  state.selectedCatalogId = item.id;
  Object.assign(forms.catalog, emptyCatalog(), item);
}

async function saveCatalog() {
  const action = state.catalogItems.some((item) => item.id === forms.catalog.id) ? "update" : "create";
  await withLoading("保存资料", async () => {
    await callFunction("manageCatalog", {
      action,
      collection: state.collection,
      id: forms.catalog.id,
      data: { ...forms.catalog }
    });
    showToast("资料已保存");
    await loadCatalog();
  });
}

async function toggleCatalog(item) {
  const restore = item.visible === false || item.deleted;
  await withLoading(restore ? "恢复资料" : "下架资料", async () => {
    await callFunction("manageCatalog", {
      action: restore ? "restore" : "delete",
      collection: state.collection,
      id: item.id
    });
    showToast(restore ? "已恢复" : "已下架");
    await loadCatalog();
  });
}

async function loadOrders() {
  await withLoading("读取订单", async () => {
    const result = await callFunction("manageOperations", {
      action: "listOrders",
      status: filters.orderStatus,
      keyword: filters.orderKeyword
    });
    state.orders = result.orders || [];
    state.selectedOrderId = state.orders[0]?._id || "";
  });
}

async function loadReservations() {
  await withLoading("读取预约", async () => {
    const result = await callFunction("manageOperations", {
      action: "listReservations",
      status: filters.reservationStatus,
      keyword: filters.reservationKeyword
    });
    state.reservations = result.reservations || [];
    state.selectedReservationId = state.reservations[0]?._id || "";
  });
}

async function loadSignups() {
  await withLoading("读取报名", async () => {
    const result = await callFunction("manageOperations", {
      action: "listSignups",
      status: filters.signupStatus,
      keyword: filters.signupKeyword
    });
    state.signups = result.signups || [];
    state.selectedSignupId = state.signups[0]?._id || "";
  });
}

async function loadCustomers() {
  await withLoading("读取用户", async () => {
    const result = await callFunction("manageOperations", {
      action: "listCustomers",
      keyword: filters.customerKeyword
    });
    state.customers = result.customers || [];
    state.selectedCustomerId = state.customers[0]?.id || "";
  });
}

async function updateRecord(type, id, status) {
  await withLoading("更新状态", async () => {
    await callFunction("manageOperations", {
      action: type === "reservation" ? "updateReservation" : "updateSignup",
      id,
      status
    });
    showToast("状态已更新");
    await (type === "reservation" ? loadReservations() : loadSignups());
  });
}

async function orderAction(action, order) {
  await withLoading("处理订单", async () => {
    const payload = { orderId: order._id, orderNo: order.orderNo };
    if (action === "ship") {
      if (!orderForm.trackingNo.trim()) throw new Error("请填写快递单号");
      await callFunction("manageOperations", {
        action: "markShipped",
        ...payload,
        trackingCompany: orderForm.trackingCompany.trim(),
        trackingNo: orderForm.trackingNo.trim()
      });
      orderForm.trackingCompany = "";
      orderForm.trackingNo = "";
    }
    if (action === "pickup") await callFunction("manageOperations", { action: "markPickupDone", ...payload });
    if (action === "cancel") await callFunction("manageOperations", { action: "cancelOrder", ...payload, reason: orderForm.cancelReason.trim() || "管理员取消" });
    showToast("订单已更新");
    await loadOrders();
  });
}

async function loadContent() {
  await withLoading("读取内容", async () => {
    const result = await callFunction("manageOperations", {
      action: "listContent",
      type: state.contentType
    });
    state.contentItems = result.items || [];
    editContent(state.contentItems[0] || null);
  });
}

function selectContentType(type) {
  state.contentType = type;
  resetContent();
  loadContent();
}

function resetContent() {
  Object.assign(forms.content, {
    key: `content-${Date.now()}`,
    type: state.contentType === "all" ? "home_carousel" : state.contentType,
    title: "",
    subtitle: "",
    summary: "",
    image: "",
    linkType: "page",
    linkTarget: "",
    sort: 10,
    visible: true
  });
  state.selectedContentKey = "";
}

function editContent(item) {
  if (!item) {
    resetContent();
    return;
  }
  state.selectedContentKey = item.key;
  Object.assign(forms.content, item);
}

async function saveContent() {
  await withLoading("保存内容", async () => {
    await callFunction("manageOperations", { action: "saveContent", data: { ...forms.content } });
    showToast("内容已保存");
    await loadContent();
  });
}

async function deleteContent(item) {
  await withLoading("停用内容", async () => {
    await callFunction("manageOperations", { action: "deleteContent", key: item.key });
    showToast("内容已停用");
    await loadContent();
  });
}

async function loadAnalytics() {
  await withLoading("读取统计", async () => {
    const result = await callFunction("manageOperations", { action: "getAnalytics" });
    state.analytics = result.analytics || {};
  });
}

async function loadMarketing() {
  await withLoading("读取营销", async () => {
    const result = await callFunction("manageOperations", { action: "listMarketing" });
    state.coupons = result.coupons || [];
    state.campaigns = result.campaigns || [];
  });
}

async function saveCoupon() {
  await withLoading("保存优惠券", async () => {
    await callFunction("manageOperations", { action: "saveCoupon", data: forms.coupon });
    showToast("优惠券已保存");
    await loadMarketing();
  });
}

async function saveCampaign() {
  await withLoading("保存计划", async () => {
    await callFunction("manageOperations", { action: "saveCampaign", data: forms.campaign });
    showToast("营销计划已保存");
    await loadMarketing();
  });
}

async function loadSettings() {
  await withLoading("读取设置", async () => {
    const result = await callFunction("manageOperations", { action: "getSettings" });
    state.settings = result.settings || {};
  });
}

async function saveSettings() {
  await withLoading("保存设置", async () => {
    await callFunction("manageOperations", { action: "updateSettings", data: state.settings });
    showToast("设置已保存");
  });
}

function globalSearch() {
  const keyword = filters.global.trim();
  if (!keyword) return;
  if (state.activeTab === "orders") filters.orderKeyword = keyword;
  if (state.activeTab === "reservations") filters.reservationKeyword = keyword;
  if (state.activeTab === "signups") filters.signupKeyword = keyword;
  if (state.activeTab === "customers") filters.customerKeyword = keyword;
  if (state.activeTab === "catalog") filters.catalog = keyword;
  loadActiveTab();
}

onMounted(async () => {
  try {
    initCloud();
    setCurrentUser(await getSessionUser());
    state.ready = true;
    if (state.user) await enterDashboard();
  } catch (error) {
    state.loginError = error.message || "后台初始化失败";
    state.ready = true;
  }
});
</script>

<template>
  <main class="app-shell">
    <section v-if="state.view === 'login'" class="login-screen">
      <div class="login-art">
        <div class="brand-block">
          <span>三 木 合</span>
          <strong>SANMUHE TEA</strong>
        </div>
        <div class="ink-copy">
          <p>经营后台</p>
          <h1>茶事空间的秩序、审美与数据在此合一。</h1>
        </div>
      </div>
      <form class="login-card" @submit.prevent="signIn">
        <span class="section-kicker">Admin Access</span>
        <h2>管理员登录</h2>
        <label>
          <span>账号</span>
          <input v-model="loginForm.username" autocomplete="username" required>
        </label>
        <label>
          <span>密码</span>
          <input v-model="loginForm.password" type="password" autocomplete="current-password" required>
        </label>
        <button class="primary-action" :disabled="!!state.loading" type="submit">
          {{ state.loading || "进入后台" }}
        </button>
        <p class="form-error">{{ state.loginError }}</p>
      </form>
    </section>

    <section v-else class="admin-layout">
      <aside class="sidebar">
        <div class="logo-stack">
          <span>三 木 合</span>
          <strong>SANMUHE TEA</strong>
        </div>
        <nav class="nav-list">
          <button
            v-for="item in navItems"
            :key="item.key"
            :class="{ active: state.activeTab === item.key }"
            type="button"
            @click="switchTab(item.key)"
          >
            <span><component :is="item.icon" :size="18" :stroke-width="1.8" /></span>
            {{ item.label }}
          </button>
        </nav>
        <div class="sidebar-scene" aria-hidden="true"></div>
        <div class="sidebar-user">
          <span>{{ currentUser }}</span>
          <button type="button" @click="logout">退出</button>
        </div>
      </aside>

      <section class="workspace">
        <header class="topbar">
          <div>
            <span class="section-kicker">Sanmuhe Operations</span>
            <h1>{{ currentTitle[0] }}</h1>
            <p>{{ currentTitle[1] }}</p>
          </div>
          <div class="top-actions">
            <label class="search-box">
              <Search :size="17" :stroke-width="1.8" />
              <input v-model="filters.global" placeholder="搜索当前模块" @keydown.enter="globalSearch">
            </label>
            <button class="secondary-action icon-action" type="button" @click="loadActiveTab">
              <RefreshCw :size="16" :stroke-width="1.8" />
              刷新
            </button>
            <div class="admin-chip">
              <span class="bell"><Bell :size="18" :stroke-width="1.9" /><em>12</em></span>
              <span class="avatar"></span>
              {{ currentUser }}
              <ChevronDown :size="14" :stroke-width="1.8" />
            </div>
          </div>
        </header>

        <section class="metric-row">
          <article v-for="(card, index) in state.summary" :key="card.label" class="metric-card" :data-tone="card.tone">
            <div class="metric-icon"><component :is="metricIcon(card, index)" :size="24" :stroke-width="1.8" /></div>
            <div>
              <span>{{ card.label }}</span>
              <strong>{{ metricValue(card) }}</strong>
              <p>{{ card.delta }}</p>
            </div>
          </article>
        </section>

        <section v-if="state.activeTab === 'dashboard'" class="dashboard-grid">
          <article class="panel-card hero-panel">
            <div class="panel-title">
              <div>
                <h2>茶室预约概览</h2>
              </div>
              <button class="secondary-action small icon-action" type="button" @click="switchTab('reservations')">
                <CalendarDays :size="15" :stroke-width="1.8" />
                查看日历
              </button>
            </div>
            <div class="room-board-date">
              <button type="button" aria-label="前一天">‹</button>
              <strong>{{ state.dashboard?.dateLabel || "2024年5月20日" }}</strong>
              <button type="button" aria-label="后一天">›</button>
            </div>
            <div class="room-board">
              <div class="room-board-head">
                <span>茶室</span>
                <span>10:00</span>
                <span>12:30</span>
                <span>15:00</span>
                <span>17:30</span>
                <span>20:00</span>
              </div>
              <div v-for="room in (state.dashboard?.roomBoard || [])" :key="room.id || room.room || room.name" class="room-line">
                <strong>
                  <b>{{ room.name || room.room }}</b>
                  <small>{{ room.capacity || "" }}</small>
                </strong>
                <span v-for="slot in room.slots" :key="slot.time" :class="['slot', slot.status === '空闲' || slot.status === '可预约' ? 'free' : slot.status === '进行中' ? 'active' : 'busy']">
                  <b>{{ slot.status || "可预约" }}</b>
                  <small v-if="slot.name">{{ slot.name }}</small>
                  <small v-if="slot.people">{{ slot.people }}人</small>
                </span>
              </div>
            </div>
            <div class="room-legend">
              <span><i class="free"></i>可预约</span>
              <span><i class="busy"></i>已预约</span>
              <span><i class="active"></i>进行中</span>
              <span><i class="done"></i>已结束</span>
            </div>
          </article>
          <article class="panel-card action-panel">
            <div class="panel-title"><h2>快捷操作</h2></div>
            <div class="quick-grid">
              <button v-for="action in quickActions" :key="action.label" type="button" @click="switchTab(action.tab)">
                <span><component :is="action.icon" :size="24" :stroke-width="1.7" /></span>
                {{ action.label }}
              </button>
            </div>
          </article>
          <article class="panel-card list-panel">
            <div class="panel-title"><h2>最新预约</h2><button class="link-more" type="button" @click="switchTab('reservations')">查看更多 ›</button></div>
            <div class="flow-list feed-list">
              <button v-for="item in (state.dashboard?.recentReservations || [])" :key="item._id" type="button" @click="switchTab('reservations')">
                <span class="feed-avatar">{{ (item.name || item.customerName || "访").slice(0, 1) }}</span>
                <span class="feed-main">
                  <strong>{{ item.name || item.customerName || "访客" }}</strong>
                  <small>{{ item.day || item.date }} · {{ item.roomName || item.room }}</small>
                </span>
                <em>{{ item.status || "已预约" }}</em>
              </button>
            </div>
          </article>
          <article class="panel-card list-panel">
            <div class="panel-title"><h2>最新活动报名</h2><button class="link-more" type="button" @click="switchTab('signups')">查看更多 ›</button></div>
            <div class="flow-list feed-list media-feed">
              <button v-for="item in (state.dashboard?.recentSignups || [])" :key="item._id" type="button" @click="switchTab('signups')">
                <img v-if="displayImage(item.image || item.cover || item.eventImage)" :src="displayImage(item.image || item.cover || item.eventImage)" alt="">
                <span v-else class="feed-thumb">{{ (item.eventTitle || item.title || "茶").slice(0, 1) }}</span>
                <span class="feed-main">
                  <strong>{{ item.eventTitle || item.title || "活动报名" }}</strong>
                  <small>{{ item.name || item.customerName || "访客" }} · {{ item.status }}</small>
                </span>
                <em>{{ item.people || item.count || 1 }}人报名</em>
              </button>
            </div>
          </article>
          <article class="panel-card list-panel">
            <div class="panel-title"><h2>最新订单</h2><button class="link-more" type="button" @click="switchTab('orders')">查看更多 ›</button></div>
            <div class="flow-list feed-list media-feed">
              <button v-for="item in (state.dashboard?.recentOrders || [])" :key="item._id" type="button" @click="switchTab('orders')">
                <img v-if="displayImage(item.image || item.cover || item.items?.[0]?.image)" :src="displayImage(item.image || item.cover || item.items?.[0]?.image)" alt="">
                <span v-else class="feed-thumb">单</span>
                <span class="feed-main">
                  <strong>{{ item.orderNo || "订单" }}</strong>
                  <small>{{ item.status }} · {{ formatDate(item.createdAt) }}</small>
                </span>
                <em>¥{{ money(item.total) }}</em>
              </button>
            </div>
          </article>
          <article class="panel-card insight-card">
            <div class="panel-title">
              <h2>数据概览</h2>
              <select aria-label="统计周期"><option>本月</option><option>本周</option></select>
            </div>
            <div class="donut-row">
              <div class="donut" :style="dashboardDonutStyle">
                <div>
                  <span>总营业额</span>
                  <strong>¥{{ numberText(dashboardInsight.revenue) }}</strong>
                </div>
              </div>
              <ul class="donut-legend">
                <li v-for="segment in dashboardInsight.segments" :key="segment.label" :class="segment.className">
                  <span></span>{{ segment.label }} <strong>{{ segment.value }}%</strong>
                </li>
              </ul>
            </div>
            <div class="insight-stats">
              <span>总订单数<strong>{{ numberText(dashboardInsight.orderCount) }}</strong></span>
              <span>客单价<strong>¥{{ numberText(dashboardInsight.averagePrice) }}</strong></span>
            </div>
          </article>
        </section>

        <section v-if="state.activeTab === 'catalog'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <div class="segmented">
                <button v-for="item in collectionTabs" :key="item.key" :class="{ active: state.collection === item.key }" type="button" @click="selectCollection(item.key)">
                  {{ item.label }}
                </button>
              </div>
              <input v-model="filters.catalog" class="line-input" placeholder="筛选名称、分类、状态">
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>资料</th><th>分类</th><th>价格</th><th>库存/名额</th><th>状态</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="item in filteredCatalog" :key="item.id" :class="{ selected: state.selectedCatalogId === item.id }" @click="editCatalog(item)">
                    <td><strong>{{ displayName(item) }}</strong><small>{{ item.id }}</small></td>
                    <td>{{ item.category || item.capacity || "-" }}</td>
                    <td>{{ item.price !== undefined ? `¥${money(item.price)}` : "-" }}</td>
                    <td>{{ displayInventory(item) }}</td>
                    <td><span :class="['status-pill', item.visible === false || item.deleted ? 'neutral' : 'good']">{{ item.visible === false || item.deleted ? "已下架" : (item.status || "上架") }}</span></td>
                    <td><button class="ghost-button" type="button" @click.stop="toggleCatalog(item)">{{ item.visible === false || item.deleted ? "恢复" : "下架" }}</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
          <aside class="panel-card editor-panel">
            <div class="panel-title">
              <h2>{{ forms.catalog.id ? "编辑资料" : "新建资料" }}</h2>
              <button class="ghost-button icon-action" type="button" @click="resetCatalog"><Plus :size="15" :stroke-width="1.8" /> 新建</button>
            </div>
            <form class="editor-grid" @submit.prevent="saveCatalog">
              <label><span>ID</span><input v-model="forms.catalog.id" required></label>
              <label><span>名称</span><input v-model="forms.catalog.name" :placeholder="state.collection === 'events' ? '可留空，使用标题' : ''"></label>
              <label><span>标题</span><input v-model="forms.catalog.title"></label>
              <label><span>分类</span><input v-model="forms.catalog.category"></label>
              <label><span>价格</span><input v-model.number="forms.catalog.price" type="number" min="0"></label>
              <label><span>单位/规格</span><input v-model="forms.catalog.unit" placeholder="杯 / 50g / 份"></label>
              <label><span>库存</span><input v-model.number="forms.catalog.stock" type="number" min="0"></label>
              <label><span>名额</span><input v-model.number="forms.catalog.quota" type="number" min="1"></label>
              <label><span>已报名</span><input v-model.number="forms.catalog.signed" type="number" min="0"></label>
              <label><span>日期</span><input v-model="forms.catalog.date"></label>
              <label><span>时间</span><input v-model="forms.catalog.time"></label>
              <label><span>地点</span><input v-model="forms.catalog.place"></label>
              <label><span>容量</span><input v-model="forms.catalog.capacity"></label>
              <label><span>楼层</span><input v-model="forms.catalog.floor"></label>
              <label><span>产地</span><input v-model="forms.catalog.origin"></label>
              <label><span>焙火</span><input v-model="forms.catalog.roast"></label>
              <label><span>排序</span><input v-model.number="forms.catalog.sort" type="number" min="0"></label>
              <label><span>状态</span><input v-model="forms.catalog.status"></label>
              <label class="wide"><span>图片 URL</span><input v-model="forms.catalog.image"></label>
              <label class="file-picker wide">
                <span>上传图片</span>
                <Upload :size="17" :stroke-width="1.8" />
                <input accept="image/*" type="file" @change="uploadFormImage('catalog', $event)">
                <em>{{ uploadState.catalog || "选择本地图片上传到云存储" }}</em>
              </label>
              <label class="wide"><span>缩略图 URL</span><input v-model="forms.catalog.thumb"></label>
              <label class="wide"><span>简介</span><textarea v-model="forms.catalog.summary" rows="3"></textarea></label>
              <label class="wide"><span>详情</span><textarea v-model="forms.catalog.detail" rows="4"></textarea></label>
              <label class="wide"><span>口感</span><textarea v-model="forms.catalog.taste" rows="3"></textarea></label>
              <label class="wide"><span>说明</span><textarea v-model="forms.catalog.notes" rows="3"></textarea></label>
              <label class="switch"><input v-model="forms.catalog.visible" type="checkbox"> 前台可见</label>
              <button class="primary-action wide" type="submit">保存到云端</button>
            </form>
          </aside>
        </section>

        <section v-if="state.activeTab === 'orders'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-model="filters.orderStatus" class="line-input" @change="loadOrders">
                <option value="">全部状态</option>
                <option>待支付</option><option>待发货</option><option>待自提</option><option>已发货</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-model="filters.orderKeyword" class="line-input" placeholder="订单号、姓名、手机号" @keydown.enter="loadOrders">
            </div>
            <div class="record-list">
              <button v-for="order in state.orders" :key="order._id" :class="{ selected: state.selectedOrderId === order._id }" type="button" @click="state.selectedOrderId = order._id">
                <strong>{{ order.orderNo || order._id }} <em>¥{{ money(order.total) }}</em></strong>
                <span>{{ order.name || order.contactName || "访客" }} · {{ order.status }} · {{ formatDate(order.createdAt) }}</span>
              </button>
            </div>
          </article>
          <aside class="panel-card detail-panel" v-if="selectedOrder">
            <div class="panel-title"><h2>订单详情</h2><span class="status-pill good">{{ selectedOrder.status }}</span></div>
            <DetailRow label="订单号" :value="selectedOrder.orderNo || selectedOrder._id" />
            <DetailRow label="金额" :value="`¥${money(selectedOrder.total)}`" />
            <DetailRow label="支付" :value="selectedOrder.payStatus || '-'" />
            <DetailRow label="配送" :value="selectedOrder.deliveryMethod === 'shipping' ? '快递' : '到店自提'" />
            <DetailRow label="客户" :value="selectedOrder.name || selectedOrder.contactName || '-'" />
            <DetailRow label="电话" :value="selectedOrder.phone || selectedOrder.mobile || '-'" />
            <DetailRow label="地址/备注" :value="selectedOrder.address || selectedOrder.pickupNote || selectedOrder.remark || '-'" />
            <DetailRow label="创建时间" :value="formatDate(selectedOrder.createdAt)" />
            <div class="line-items" v-if="selectedOrder.items?.length">
              <div v-for="item in selectedOrder.items" :key="item.id || item.name" class="line-item">
                <span>{{ item.name || item.id || "商品" }}</span>
                <strong>x{{ item.quantity || 1 }}</strong>
              </div>
            </div>
            <div class="ship-box" v-if="selectedOrder.status === '待发货'">
              <label><span>快递公司</span><input v-model="orderForm.trackingCompany" placeholder="如 顺丰"></label>
              <label><span>快递单号</span><input v-model="orderForm.trackingNo" placeholder="填写后标记发货"></label>
            </div>
            <label v-if="selectedOrder.status === '待支付'" class="cancel-box">
              <span>取消原因</span>
              <input v-model="orderForm.cancelReason" placeholder="管理员取消">
            </label>
            <div class="action-row">
              <button v-if="selectedOrder.status === '待发货'" class="secondary-action" type="button" @click="orderAction('ship', selectedOrder)">标记发货</button>
              <button v-if="selectedOrder.status === '待自提'" class="secondary-action" type="button" @click="orderAction('pickup', selectedOrder)">完成自提</button>
              <button v-if="selectedOrder.status === '待支付'" class="danger-action" type="button" @click="orderAction('cancel', selectedOrder)">取消订单</button>
            </div>
          </aside>
        </section>

        <section v-if="state.activeTab === 'reservations' || state.activeTab === 'signups'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-if="state.activeTab === 'reservations'" v-model="filters.reservationStatus" class="line-input" @change="loadReservations">
                <option value="">全部状态</option><option>待确认</option><option>已确认</option><option>已完成</option><option>已取消</option>
              </select>
              <select v-else v-model="filters.signupStatus" class="line-input" @change="loadSignups">
                <option value="">全部状态</option><option>待确认</option><option>已确认</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-if="state.activeTab === 'reservations'" v-model="filters.reservationKeyword" class="line-input" placeholder="茶室、姓名、手机号" @keydown.enter="loadReservations">
              <input v-else v-model="filters.signupKeyword" class="line-input" placeholder="活动、姓名、手机号" @keydown.enter="loadSignups">
            </div>
            <div class="record-list">
              <button
                v-for="record in (state.activeTab === 'reservations' ? state.reservations : state.signups)"
                :key="record._id"
                :class="{ selected: (state.activeTab === 'reservations' ? state.selectedReservationId : state.selectedSignupId) === record._id }"
                type="button"
                @click="state.activeTab === 'reservations' ? state.selectedReservationId = record._id : state.selectedSignupId = record._id"
              >
                <strong>{{ record.roomName || record.eventTitle || record.title || record.name || "记录" }} <em>{{ record.status }}</em></strong>
                <span>{{ record.name || record.customerName || "访客" }} · {{ record.day || record.date || formatDate(record.createdAt) }}</span>
              </button>
            </div>
          </article>
          <aside class="panel-card detail-panel" v-if="state.activeTab === 'reservations' ? selectedReservation : selectedSignup">
            <div class="panel-title"><h2>{{ state.activeTab === 'reservations' ? "预约详情" : "报名详情" }}</h2></div>
            <template v-if="state.activeTab === 'reservations'">
              <DetailRow label="茶室" :value="selectedReservation.roomName || selectedReservation.room || '-'" />
              <DetailRow label="客户" :value="selectedReservation.name || selectedReservation.customerName || '-'" />
              <DetailRow label="日期" :value="selectedReservation.day || selectedReservation.date || '-'" />
              <DetailRow label="时段" :value="selectedReservation.time || selectedReservation.slot || '-'" />
              <DetailRow label="人数" :value="selectedReservation.people || selectedReservation.count || '-'" />
              <div class="action-row">
                <button class="secondary-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已确认')">确认</button>
                <button class="secondary-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已完成')">完成</button>
                <button class="danger-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已取消')">取消</button>
              </div>
            </template>
            <template v-else>
              <DetailRow label="活动" :value="selectedSignup.eventTitle || selectedSignup.title || '-'" />
              <DetailRow label="客户" :value="selectedSignup.name || selectedSignup.customerName || '-'" />
              <DetailRow label="电话" :value="selectedSignup.phone || selectedSignup.mobile || '-'" />
              <DetailRow label="状态" :value="selectedSignup.status || '-'" />
              <div class="action-row">
                <button class="secondary-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已确认')">确认</button>
                <button class="secondary-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已完成')">完成</button>
                <button class="danger-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已取消')">取消</button>
              </div>
            </template>
          </aside>
        </section>

        <section v-if="state.activeTab === 'customers'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar"><input v-model="filters.customerKeyword" class="line-input" placeholder="姓名、手机号、OpenID" @keydown.enter="loadCustomers"></div>
            <div class="record-list">
              <button v-for="customer in state.customers" :key="customer.id" :class="{ selected: state.selectedCustomerId === customer.id }" type="button" @click="state.selectedCustomerId = customer.id">
                <strong>{{ customer.name || customer.phone || customer.id }} <em>{{ customer.levelName || customer.tag || "会员" }}</em></strong>
                <span>消费 ¥{{ money(customer.totalSpend) }} · 订单 {{ customer.orders || 0 }} · 预约 {{ customer.reservations || 0 }}</span>
              </button>
            </div>
          </article>
          <aside class="panel-card detail-panel" v-if="selectedCustomer">
            <div class="panel-title"><h2>用户画像</h2></div>
            <DetailRow label="标识" :value="selectedCustomer.id" />
            <DetailRow label="手机号" :value="selectedCustomer.phone || '-'" />
            <DetailRow label="累计消费" :value="`¥${money(selectedCustomer.totalSpend)}`" />
            <DetailRow label="积分" :value="selectedCustomer.points || 0" />
            <DetailRow label="最近访问" :value="formatDate(selectedCustomer.latestAt)" />
          </aside>
        </section>

        <section v-if="state.activeTab === 'content'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <div class="segmented">
                <button v-for="item in contentTabs" :key="item.key" :class="{ active: state.contentType === item.key }" type="button" @click="selectContentType(item.key)">
                  {{ item.label }}
                </button>
              </div>
              <button class="secondary-action small icon-action" type="button" @click="resetContent"><Plus :size="15" :stroke-width="1.8" /> 新建内容</button>
            </div>
            <div class="record-list with-images">
              <button v-for="item in state.contentItems" :key="item.key" :class="{ selected: state.selectedContentKey === item.key }" type="button" @click="editContent(item)">
                <img v-if="displayImage(item.image)" :src="displayImage(item.image)" alt="">
                <span><strong>{{ item.title || item.key }} <em>{{ item.visible === false ? "停用" : "启用" }}</em></strong><small>{{ item.subtitle || item.type }}</small></span>
              </button>
            </div>
          </article>
          <aside class="panel-card editor-panel">
            <div class="panel-title"><h2>内容编辑</h2></div>
            <form class="editor-grid" @submit.prevent="saveContent">
              <label><span>Key</span><input v-model="forms.content.key" required></label>
              <label><span>类型</span><input v-model="forms.content.type"></label>
              <label><span>标题</span><input v-model="forms.content.title"></label>
              <label><span>副标题</span><input v-model="forms.content.subtitle"></label>
              <label class="wide"><span>图片 URL</span><input v-model="forms.content.image"></label>
              <label class="file-picker wide">
                <span>上传图片</span>
                <Upload :size="17" :stroke-width="1.8" />
                <input accept="image/*" type="file" @change="uploadFormImage('content', $event)">
                <em>{{ uploadState.content || "选择本地图片上传到云存储" }}</em>
              </label>
              <label class="wide"><span>摘要</span><textarea v-model="forms.content.summary" rows="4"></textarea></label>
              <label><span>链接类型</span><input v-model="forms.content.linkType"></label>
              <label><span>链接目标</span><input v-model="forms.content.linkTarget"></label>
              <label><span>排序</span><input v-model.number="forms.content.sort" type="number" min="0"></label>
              <label class="switch"><input v-model="forms.content.visible" type="checkbox"> 启用</label>
              <button class="primary-action" type="submit">保存内容</button>
              <button class="danger-action" type="button" @click="deleteContent(forms.content)">停用内容</button>
            </form>
          </aside>
        </section>

        <section v-if="state.activeTab === 'analytics'" class="analytics-layout">
          <article class="panel-card metric-card large">
            <span>总营业额</span>
            <strong>¥{{ money(state.analytics?.summary?.revenue) }}</strong>
            <p>来自已支付订单</p>
          </article>
          <article class="panel-card metric-card large">
            <span>总订单数</span>
            <strong>{{ numberText(state.analytics?.summary?.orders || 0) }}</strong>
            <p>含茶品和茶饮订单</p>
          </article>
          <article class="panel-card metric-card large">
            <span>预约量</span>
            <strong>{{ numberText(state.analytics?.summary?.reservations || 0) }}</strong>
            <p>未取消茶室预约</p>
          </article>
          <article class="panel-card wide-table">
            <div class="panel-title"><h2>热销项目</h2></div>
            <table><thead><tr><th>名称</th><th>类型</th><th>销售额</th><th>数量</th></tr></thead><tbody><tr v-for="item in (state.analytics?.topItems || [])" :key="item.name"><td>{{ item.name }}</td><td>{{ item.type }}</td><td>¥{{ money(item.amount) }}</td><td>{{ item.count }}</td></tr></tbody></table>
          </article>
        </section>

        <section v-if="state.activeTab === 'marketing'" class="marketing-grid">
          <article class="panel-card">
            <div class="panel-title"><h2>优惠券</h2></div>
            <div class="flow-list"><button v-for="item in state.coupons" :key="item.id" type="button"><strong>{{ item.name }} <em>¥{{ money(item.amount) }}</em></strong><span>{{ item.status }} · 库存 {{ item.stock }}</span></button></div>
          </article>
          <article class="panel-card">
            <div class="panel-title"><h2>营销计划</h2></div>
            <div class="flow-list"><button v-for="item in state.campaigns" :key="item.id" type="button"><strong>{{ item.name }} <em>{{ item.status }}</em></strong><span>{{ item.type }} · {{ item.summary }}</span></button></div>
          </article>
          <form class="panel-card editor-form" @submit.prevent="saveCoupon">
            <h2>新建优惠券</h2>
            <label><span>名称</span><input v-model="forms.coupon.name"></label>
            <label><span>面额</span><input v-model.number="forms.coupon.amount" type="number"></label>
            <label><span>门槛</span><input v-model.number="forms.coupon.threshold" type="number"></label>
            <label><span>库存</span><input v-model.number="forms.coupon.stock" type="number"></label>
            <button class="primary-action icon-action" type="submit"><BadgeDollarSign :size="16" :stroke-width="1.8" /> 保存优惠券</button>
          </form>
          <form class="panel-card editor-form" @submit.prevent="saveCampaign">
            <h2>新建营销计划</h2>
            <label><span>名称</span><input v-model="forms.campaign.name"></label>
            <label><span>类型</span><input v-model="forms.campaign.type"></label>
            <label><span>摘要</span><textarea v-model="forms.campaign.summary" rows="3"></textarea></label>
            <button class="primary-action icon-action" type="submit"><Send :size="16" :stroke-width="1.8" /> 保存计划</button>
          </form>
        </section>

        <section v-if="state.activeTab === 'settings'" class="panel-card settings-panel">
          <form class="settings-grid" @submit.prevent="saveSettings">
            <label><span>品牌名</span><input v-model="state.settings.brandName"></label>
            <label><span>门店名</span><input v-model="state.settings.storeName"></label>
            <label><span>电话</span><input v-model="state.settings.phone"></label>
            <label><span>营业时间</span><input v-model="state.settings.businessHours"></label>
            <label class="wide"><span>地址</span><input v-model="state.settings.address"></label>
            <label class="wide"><span>预约规则</span><textarea v-model="state.settings.reservationRule" rows="4"></textarea></label>
            <label><span>积分倍率</span><input v-model.number="state.settings.memberPointRate" type="number" min="0"></label>
            <label><span>一档会员</span><input v-model="state.settings.levelOneName"></label>
            <label><span>二档会员</span><input v-model="state.settings.levelTwoName"></label>
            <label><span>三档会员</span><input v-model="state.settings.levelThreeName"></label>
            <button class="primary-action" type="submit">保存设置</button>
          </form>
        </section>
      </section>

      <div v-if="state.loading" class="loading-mask">{{ state.loading }}</div>
      <div :class="['toast', { show: toast.show }]">{{ toast.text }}</div>
    </section>
  </main>
</template>
