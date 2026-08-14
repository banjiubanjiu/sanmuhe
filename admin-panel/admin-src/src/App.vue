<script setup>
import { computed, h, markRaw, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  BadgeDollarSign,
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileText,
  HardDrive,
  Home,
  Menu,
  Package,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TicketPercent,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X
} from "@lucide/vue";

const CONFIG = {
  // 新小程序云环境（wx47e7cc7143682291）
  envId: "cloudbase-d2gq023qn50e9d82f",
  region: "ap-shanghai",
  // Publishable Key（客户端可发布密钥）；由 tcb env apikey create 生成
  accessKey: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2Nsb3VkYmFzZS1kMmdxMDIzcW41MGU5ZDgyZi5hcC1zaGFuZ2hhaS50Y2ItYXBpLnRlbmNlbnRjbG91ZGFwaS5jb20iLCJzdWIiOiJhbm9uIiwiYXVkIjoiY2xvdWRiYXNlLWQyZ3EwMjNxbjUwZTlkODJmIiwiZXhwIjo0MDg5MTM5NTE1LCJpYXQiOjE3ODU0NTYzMTUsIm5vbmNlIjoiRF94MTlmN1JTeU9NWEt4bkFwNDc1USIsImF0X2hhc2giOiJEX3gxOWY3UlN5T01YS3huQXA0NzVRIiwibmFtZSI6IkFub255bW91cyIsInNjb3BlIjoiYW5vbnltb3VzIiwicHJvamVjdF9pZCI6ImNsb3VkYmFzZS1kMmdxMDIzcW41MGU5ZDgyZiIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.Dh8LA8HsxhXV9zCMBPKvKNRpnbjEHGPZlnrZBiLaY4tLeyU5Pdy8UGMTk78tl-QBBmEZPH-hozCzweZC9IAlNWdIDmjNoN-R4G35f8lASt6cYMd4ypIHXkcjBYjDB6EnWL0Wq5muRAjEztKFFs-vdKvEpVaet2Vxr3dFWK7ElJWvRJOJveZ5TeNxkMWl7_ngmQhFFPN0E_g9lSB1S07i3HZ-2KrADw0aVAgJgKt28Lx0HuuQY_xpAnb971oeg0BWvkrajSslLq2hiEsu8gVUAfVVZbDVCXOo8y07OXeKY1J-j9vyj889kw0AvxwexSxlEr9JxFRF_69AbrLy1Pt9jg"
};

const PACKAGE_INFO = {
  appid: "wx47e7cc7143682291",
  sourceSizeLimit: "2MB",
  ignored: ["admin", "admin-src", "node_modules", "package-lock.json", "package.json", "vite.config.mjs"],
  requiredFunctions: [
    "getOpenId",
    "getCatalog",
    "listEvents",
    "listMyRecords",
    "memberCenter",
    "createOrder",
    "createPayment",
    "createReservation",
    "createEvent",
    "joinEvent",
    "manageCatalog",
    "serviceNotify",
    "releaseOrderLocks",
    "scheduledBackup",
    "seedDemoData",
    "cleanupSmokeData"
  ]
};

const SAVED_VIEWS_KEY = "hexu-admin-saved-views-v1";
const SAVED_VIEW_TABS = new Set(["catalog", "orders", "afterSales", "inventory", "reservations", "signups", "customers", "content", "audit", "notifications"]);
const ORDER_ALERT_POLL_MS = 5000;
const ORDER_ALERT_SEEN_LIMIT = 200;

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

const EmptyState = {
  props: {
    title: { type: String, required: true },
    hint: { type: String, required: true },
    actionLabel: { type: String, default: "" }
  },
  emits: ["action"],
  setup(props, { emit }) {
    return () => h("div", { class: "empty-state rich-empty", role: "status" }, [
      h("strong", props.title),
      h("span", props.hint),
      props.actionLabel
        ? h("button", { class: "empty-action", type: "button", onClick: () => emit("action") }, props.actionLabel)
        : null
    ]);
  }
};

const navItems = [
  { key: "dashboard", label: "首页", icon: Home },
  { key: "reservations", label: "茶室预约", icon: CalendarCheck },
  { key: "signups", label: "茶事活动", icon: TicketPercent },
  { key: "orders", label: "订单管理", icon: ClipboardList },
  { key: "afterSales", label: "售后管理", icon: BadgeDollarSign },
  { key: "inventory", label: "库存流水", icon: Package },
  { key: "customers", label: "用户管理", icon: UserRound },
  { key: "catalog", label: "商品管理", icon: Package },
  { key: "content", label: "内容管理", icon: FileText },
  { key: "analytics", label: "数据统计", icon: ChartNoAxesColumnIncreasing },
  { key: "audit", label: "审计日志", icon: FileText },
  { key: "notifications", label: "通知日志", icon: Bell },
  { key: "system", label: "系统状态", icon: ShieldCheck },
  { key: "roles", label: "角色权限", icon: Users },
  { key: "backups", label: "数据备份", icon: HardDrive },
  { key: "settings", label: "设置管理", icon: Settings }
];

const navGroups = [
  { label: "经营工作台", items: ["dashboard", "orders", "afterSales", "inventory"] },
  { label: "门店服务", items: ["reservations", "signups", "customers"] },
  { label: "内容与增长", items: ["catalog", "content", "analytics"] },
  { label: "系统治理", items: ["audit", "notifications", "system", "roles", "backups", "settings"] }
];

const navItemMap = navItems.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

const tabPermissions = {
  dashboard: "dashboard.read",
  reservations: "reservation.read",
  signups: "signup.read",
  orders: "order.read",
  afterSales: "afterSale.read",
  inventory: "inventory.read",
  customers: "customer.read",
  catalog: "catalog.read",
  content: "content.read",
  analytics: "analytics.read",
  audit: "audit.read",
  notifications: "notification.read",
  system: "system.read",
  roles: "roles.manage",
  backups: "backup.read",
  settings: "settings.read"
};

const collectionTabs = [
  { key: "tea_products", label: "茶叶", listTitle: "茶叶列表", entityLabel: "茶叶" },
  { key: "drinks", label: "堂饮茶单", listTitle: "档位下茶品", entityLabel: "茶品" },
  { key: "events", label: "活动", listTitle: "活动列表", entityLabel: "活动" }
];

const contentTabs = [
  { key: "home_carousel", label: "首页轮播" }
];

// 首页快捷入口固定 6 项，保证 3×2 规整网格（其余入口走左侧导航）
const quickActions = [
  { tab: "reservations", label: "茶室预约", icon: CalendarCheck },
  { tab: "signups", label: "活动报名", icon: TicketPercent },
  { tab: "orders", label: "订单管理", icon: ClipboardList },
  { tab: "catalog", label: "商品资料", icon: Package },
  { tab: "content", label: "运营内容", icon: PenLine },
  { tab: "customers", label: "用户管理", icon: Users }
];

const permissionCatalog = [
  { key: "dashboard.read", group: "经营首页", label: "查看首页与全局搜索", risk: "low" },
  { key: "order.read", group: "订单售后", label: "查看订单", risk: "low" },
  { key: "order.write", group: "订单售后", label: "确认、发货、自提、取消订单", risk: "medium" },
  { key: "afterSale.read", group: "订单售后", label: "查看售后", risk: "low" },
  { key: "afterSale.write", group: "订单售后", label: "处理售后状态", risk: "medium" },
  { key: "inventory.read", group: "库存", label: "查看库存流水", risk: "low" },
  { key: "inventory.write", group: "库存", label: "人工调整库存", risk: "medium" },
  { key: "reservation.read", group: "门店服务", label: "查看茶室预约", risk: "low" },
  { key: "reservation.write", group: "门店服务", label: "确认、完成、取消预约", risk: "medium" },
  { key: "signup.read", group: "门店服务", label: "查看活动报名", risk: "low" },
  { key: "signup.write", group: "门店服务", label: "报名确认与核销", risk: "medium" },
  { key: "customer.read", group: "用户数据", label: "查看用户画像", risk: "low" },
  { key: "export.read", group: "用户数据", label: "导出经营数据", risk: "high" },
  { key: "privacy.delete", group: "用户数据", label: "删除/匿名化个人数据", risk: "high" },
  { key: "catalog.read", group: "内容商品", label: "查看商品资料", risk: "low" },
  { key: "catalog.write", group: "内容商品", label: "编辑商品与活动资料", risk: "medium" },
  { key: "content.read", group: "内容商品", label: "查看运营内容", risk: "low" },
  { key: "content.write", group: "内容商品", label: "编辑轮播、卡片、公告", risk: "medium" },
  { key: "analytics.read", group: "数据统计", label: "查看经营统计", risk: "low" },
  { key: "audit.read", group: "系统治理", label: "查看审计日志", risk: "high" },
  { key: "settings.read", group: "系统治理", label: "查看系统设置", risk: "low" },
  { key: "settings.write", group: "系统治理", label: "修改门店、支付、通知配置", risk: "high" },
  { key: "notification.read", group: "系统治理", label: "查看通知日志", risk: "low" },
  { key: "notification.write", group: "系统治理", label: "发送测试通知", risk: "medium" },
  { key: "system.read", group: "系统治理", label: "查看系统状态", risk: "low" },
  { key: "roles.manage", group: "系统治理", label: "管理后台角色", risk: "high" },
  { key: "backup.read", group: "系统治理", label: "查看备份记录", risk: "low" },
  { key: "backup.create", group: "系统治理", label: "创建云端备份", risk: "high" }
];
const permissionGroupOrder = ["经营首页", "订单售后", "库存", "门店服务", "用户数据", "内容商品", "数据统计", "系统治理", "未归类"];
const permissionMap = permissionCatalog.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

const fallbackMetricIcons = [CalendarCheck, TicketPercent, BadgeDollarSign, UserPlus, CircleDollarSign];
const createPageState = () => ({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_ROWS = 5000;

const pageTitles = {
  dashboard: ["经营首页", "今日概览"],
  reservations: ["茶室预约", ""],
  signups: ["活动报名", ""],
  orders: ["订单管理", "待办工作台"],
  afterSales: ["售后管理", ""],
  inventory: ["库存流水", ""],
  customers: ["用户管理", ""],
  catalog: ["商品管理", ""],
  content: ["内容管理", ""],
  analytics: ["数据统计", ""],
  audit: ["审计日志", ""],
  notifications: ["通知日志", ""],
  system: ["系统状态", ""],
  roles: ["角色权限", ""],
  backups: ["数据备份", ""],
  settings: ["设置管理", ""]
};

/** 仅作模块元信息兜底，页面不再展示冗长说明条 */
const moduleProfiles = {
  dashboard: { group: "经营", subject: "首页", countLabel: "项", note: "" },
  reservations: { group: "门店", subject: "预约", countLabel: "条", note: "" },
  signups: { group: "门店", subject: "报名", countLabel: "条", note: "" },
  orders: { group: "经营", subject: "订单", countLabel: "笔", note: "" },
  afterSales: { group: "经营", subject: "售后", countLabel: "笔", note: "" },
  inventory: { group: "经营", subject: "库存", countLabel: "条", note: "" },
  customers: { group: "门店", subject: "用户", countLabel: "位", note: "" },
  catalog: { group: "商品", subject: "资料", countLabel: "条", note: "" },
  content: { group: "内容", subject: "内容", countLabel: "条", note: "" },
  analytics: { group: "数据", subject: "统计", countLabel: "项", note: "" },
  audit: { group: "系统", subject: "审计", countLabel: "条", note: "" },
  notifications: { group: "系统", subject: "通知", countLabel: "条", note: "" },
  system: { group: "系统", subject: "状态", countLabel: "项", note: "" },
  roles: { group: "系统", subject: "角色", countLabel: "个", note: "" },
  backups: { group: "系统", subject: "备份", countLabel: "条", note: "" },
  settings: { group: "系统", subject: "设置", countLabel: "项", note: "" }
};

const writePermissionsByTab = {
  orders: ["order.write", "afterSale.write"],
  afterSales: ["afterSale.write"],
  inventory: ["inventory.write"],
  reservations: ["reservation.write"],
  signups: ["signup.write"],
  customers: ["export.read", "privacy.delete"],
  catalog: ["catalog.write"],
  content: ["content.write"],
  audit: ["export.read"],
  notifications: ["notification.write"],
  roles: ["roles.manage"],
  backups: ["backup.create"],
  settings: ["settings.write"]
};

const riskPolicyByTab = {
  orders: "取消订单和售后动作需确认",
  afterSales: "退款状态需保留处理备注",
  inventory: "人工调整需填写库存原因",
  reservations: "取消预约需记录业务原因",
  signups: "取消报名需记录业务原因",
  customers: "导出/删除个人数据需原因",
  catalog: "价格库存状态变更需原因",
  content: "内容停用会影响小程序展示",
  audit: "导出审计记录需操作原因",
  notifications: "测试通知会写入投递日志",
  roles: "授权变更需二次确认",
  backups: "备份和下载均写入审计",
  settings: "生产配置变更需审计"
};

const state = reactive({
  user: null,
  ready: false,
  view: "login",
  activeTab: "dashboard",
  collection: "tea_products",
  contentType: "home_carousel",
  catalogDrawerOpen: false,
  selectedCatalogIds: [],
  /** 手机端侧栏导航抽屉 */
  navOpen: false,
  /** 各模块详情/编辑抽屉：列表默认全宽，点选后再打开 */
  drawers: {
    order: false,
    afterSale: false,
    inventory: false,
    reservation: false,
    signup: false,
    customer: false,
    content: false,
    audit: false,
    notification: false,
    role: false,
    backup: false
  },
  loading: "",
  loadingTab: "",
  loginError: "",
  moduleError: "",
  runtimeError: "",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  searchOpen: false,
  searching: false,
  searchMessage: "",
  adminProfile: null,
  adminProfileError: "",
  summary: [],
  dashboard: null,
  catalogItems: [],
  /** 商品类别（product_categories），茶叶/堂饮共用 */
  productCategories: [],
  categoryManagerOpen: false,
  orders: [],
  afterSales: [],
  inventoryLogs: [],
  auditLogs: [],
  notificationLogs: [],
  systemStatus: null,
  adminRoles: [],
  rolePresets: [],
  backupLogs: [],
  lastLoadedAt: {},
  reservations: [],
  /** 茶室资源（预约台历行）；从 rooms 集合读取，非商品管理 */
  roomResources: [],
  /** 茶室信息（单间配置）；随设置页加载与保存，写回 rooms 集合 */
  roomForm: {
    id: "",
    name: "",
    image: "",
    thumb: "",
    capacity: "",
    floor: "",
    status: "可预定",
    visible: true
  },
  signups: [],
  customers: [],
  contentItems: [],
  analytics: null,
  searchResults: [],
  savedViews: {},
  settings: {},
  /** 微信「发货信息管理」接入状态（getWxShippingStatus） */
  wxShippingStatus: null,
  /** 桌码列表（listTableQrs） */
  tableQrs: [],
  /** 会员储值档位（membership_plans，后台可维护） */
  rechargePlans: [],
  rechargePlanEditing: false,
  rechargePlanForm: { id: "", title: "", description: "", principalYuan: "", bonusYuan: "", sortOrder: "", enabled: true },
  rechargePlanSaving: false,
  pagination: {
    orders: createPageState(),
    afterSales: createPageState(),
    inventory: createPageState(),
    reservations: createPageState(),
    signups: createPageState(),
    customers: createPageState(),
    audit: createPageState(),
    notifications: createPageState(),
    backups: createPageState()
  },
  selectedCatalogId: "",
  selectedOrderId: "",
  /** listOrders 返回的队列元信息（待办/库总量） */
  orderListMeta: { queue: "", bizType: "", statuses: [], todoTotal: 0, allTotal: null },
  selectedAfterSaleId: "",
  selectedAuditLogId: "",
  selectedReservationId: "",
  selectedSignupId: "",
  selectedCustomerId: "",
  selectedContentKey: "",
  selectedRoleId: "",
  reservationCalendarDate: new Date().toISOString().slice(0, 10),
  reservationWeekStart: (() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 周一起始
    const start = new Date(now);
    start.setDate(now.getDate() - dow);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  })(),
  reservationView: "board",
  reservationDrawerOpen: false
});

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__SANMUHE_ADMIN_STATE__ = state;
}

const filters = reactive({
  global: "",
  catalog: "",
  catalogShelf: "",
  catalogCategory: "",
  catalogFlag: "",
  orderBizType: "",
  /** todo=店员待办队列（默认）；all=可查全部/单状态 */
  orderQueue: "todo",
  orderStatus: "",
  orderKeyword: "",
  afterSaleStatus: "",
  afterSaleKeyword: "",
  inventoryKeyword: "",
  reservationStatus: "",
  reservationKeyword: "",
  signupStatus: "",
  signupKeyword: "",
  customerKeyword: "",
  auditKeyword: "",
  notificationKeyword: ""
});

/** 订单业务线：与云函数 bizType 对齐（统一池 + 业务线视图） */
const ORDER_BIZ_OPTIONS = [
  { value: "", label: "全部业务" },
  { value: "dinein", label: "堂饮点单" },
  { value: "retail", label: "茶叶商城" }
];

/** 视图：待办工作台 vs 全部 */
const ORDER_QUEUE_OPTIONS = [
  { value: "todo", label: "待办" },
  { value: "all", label: "全部" }
];

/** 各业务线默认待办状态（与 manageOperations.todoStatusesForBiz 对齐） */
function todoStatusesForBiz(bizType = "") {
  if (bizType === "dinein") return ["已付款", "制作中", "待确认"];
  if (bizType === "retail") return ["待发货", "待自提"];
  return ["待支付", "待确认", "已付款", "制作中", "待发货", "待自提"];
}

function orderQueueHint() {
  const meta = state.orderListMeta || {};
  const listTotal = Number(state.pagination.orders?.total || state.orders.length || 0);
  if (filters.orderQueue !== "todo") {
    const statusPart = filters.orderStatus ? `状态：${filters.orderStatus}` : "全部状态";
    return `${statusPart} · 当前 ${listTotal} 笔`;
  }
  const biz = ORDER_BIZ_OPTIONS.find((item) => item.value === filters.orderBizType)?.label || "全部业务";
  const statuses = todoStatusesForBiz(filters.orderBizType).join(" / ");
  const allTotal = meta.allTotal != null ? Number(meta.allTotal) : null;
  if (allTotal != null && allTotal > listTotal) {
    return `待办 · ${biz} · ${statuses} · 待办 ${listTotal} 笔 / 库中 ${allTotal} 笔（历史在「全部」）`;
  }
  return `待办 · ${biz} · ${statuses} · ${listTotal} 笔`;
}

const loginForm = reactive({ username: "", password: "" });
const uploadState = reactive({ catalog: "", content: "", category: "", room: "" });
const orderForm = reactive({
  trackingCompany: "SF",
  trackingNo: "",
  cancelReason: ""
});
/** 微信运力编码（标记发货用） */
const EXPRESS_COMPANY_OPTIONS = [
  { code: "SF", label: "顺丰速运" },
  { code: "STO", label: "申通快递" },
  { code: "YTO", label: "圆通速递" },
  { code: "ZTO", label: "中通快递" },
  { code: "YD", label: "韵达速递" },
  { code: "JTSD", label: "极兔速递" },
  { code: "JD", label: "京东物流" },
  { code: "EMS", label: "邮政 EMS" },
  { code: "DBL", label: "德邦快递" },
  { code: "HTKY", label: "百世快递" }
];
const afterSaleForm = reactive({
  status: "审核中",
  refundAmount: 0,
  reason: "",
  note: ""
});
const inventoryForm = reactive({
  collection: "tea_products",
  id: "",
  delta: 0,
  note: ""
});
/** 调库抽屉：按类型加载的商品列表 */
const inventoryProductOptions = ref([]);
/** 分类下拉当前选项（含 SELECT_CUSTOM_VALUE） */
const catalogCategoryChoice = ref("");
/** 活动日期：HTML date 绑定（YYYY-MM-DD），保存时格式化为前台展示文案 */
const catalogDateIso = ref("");
/** 类别管理：新建/编辑表单（堂饮类别=档位，含价格/单位） */
const categoryForm = reactive({
  id: "",
  name: "",
  sort: 10,
  channel: "tea_products",
  visible: true,
  price: 0,
  unit: "道",
  badge: "",
  serviceType: "tasting",
  tagline: "",
  brewStyle: "热泡茶",
  color: "",
  image: ""
});
/** 内容链接目标：页面预设或自定义 */
const noticeTestForm = reactive({
  kind: "reservationStatus",
  openid: "",
  note: "后台测试发送"
});
const roleForm = reactive({
  id: "",
  subjectType: "username",
  subject: "",
  displayName: "",
  roleKey: "clerk",
  disabled: false
});
const backupForm = reactive({
  limit: 500
});
const toast = reactive({ show: false, text: "" });
const actionDialog = reactive({
  open: false,
  mode: "confirm",
  title: "",
  message: "",
  expected: "",
  input: "",
  reason: "",
  choice: "",
  choices: [],
  amount: "",
  amountLabel: "退款金额（元）",
  showAmountWhen: "",
  maxAmount: 0,
  inputLabel: "",
  confirmText: "确认",
  cancelText: "取消",
  danger: false,
  error: ""
});
const orderBroadcast = reactive({
  enabled: false,
  starting: false,
  polling: false,
  visible: typeof document === "undefined" ? true : !document.hidden,
  wakeLockSupported: typeof navigator !== "undefined" && "wakeLock" in navigator,
  wakeLockActive: false,
  wakeMessage: "",
  speechSupported: typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  lastCheckedAt: "",
  lastAlertAt: "",
  lastOrderNo: "",
  error: "",
  audioMessage: "",
  queueCount: 0
});
let toastTimer = null;
let actionDialogResolve = null;
let cleanupRuntimeGuards = null;
let cleanupOrderBroadcastRuntime = null;
let orderBroadcastTimer = null;
let wakeLockSentinel = null;
let broadcastAudioContext = null;
let broadcastVoices = [];
let speechQueue = [];
let speechActive = false;
let speechTimer = null;
let speechRunId = 0;
let broadcastSessionId = 0;
const seenOrderAlertKeys = new Set();
const globalSearchInput = ref(null);

const emptyCatalogSpec = () => ({
  label: "",
  weight: "",
  price: 0,
  stock: 0
});

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
  status: "上架",
  /** 表单用：on | off | draft，保存时映射 visible/status */
  shelfStatus: "on",
  image: "",
  thumb: "",
  notes: "",
  taste: "",
  summary: "",
  detail: "",
  origin: "",
  year: "",
  roast: "",
  sort: 10,
  visible: true,
  deleted: false,
  specs: [],
  /** 堂饮茶品：所属档位 id（drink-001） */
  categoryId: "",
  /** 档位内分组（知味下的岩茶/红茶…） */
  groupName: "",
  subtitle: "",
  /** 兼容旧数据；新堂饮不再用 teaGroups 文本 */
  teaGroups: [],
  tagline: "",
  brewStyle: "热泡茶",
  serviceType: "tasting",
  notes: ""
});

/** 零售茶叶才用 specs 计价；堂饮是「档位 + 可选茶」 */
function isTeaProductsCollection(collection = state.collection) {
  return collection === "tea_products";
}

function isDrinksCollection(collection = state.collection) {
  return collection === "drinks";
}

/** 茶叶/堂饮支持上架状态枚举 */
function supportsProductShelf(collection = state.collection) {
  return isTeaProductsCollection(collection) || isDrinksCollection(collection);
}

const CATALOG_SHELF_OPTIONS = [
  { value: "on", label: "上架" },
  { value: "off", label: "下架" },
  { value: "draft", label: "草稿" }
];

const CATALOG_FLAG_OPTIONS = [
  { value: "", label: "全部标记" },
  { value: "low_stock", label: "低库存" },
  { value: "no_image", label: "缺图片" }
];

/** 下拉中的「自定义」哨兵值，不落库 */
const SELECT_CUSTOM_VALUE = "__custom__";

/** 无云端类别时的兜底预设（与 seed product_categories 对齐） */
const TEA_CATEGORY_PRESETS = ["红茶", "白茶", "岩茶", "普洱茶", "单丛"];
/** 堂饮分类=点单左侧档位 */
const DRINK_CATEGORY_PRESETS = ["初见", "知味", "臻藏", "烹茶暖叙", "芳茗润茶"];
/** 活动 Tab：与 pages/events 固定分类对齐 */
const EVENT_CATEGORY_PRESETS = ["养心茶会", "学茶", "时令茶会"];
/** 活动状态：与前台 utils/eventStatus 一致；默认敬请期待 */
const EVENT_STATUS_OPTIONS = ["敬请期待", "报名中", "已满", "已结束", "已取消"];

const CONTENT_TYPE_OPTIONS = [
  { value: "home_carousel", label: "首页轮播" }
];

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const forms = reactive({
  catalog: emptyCatalog(),
  content: {
    key: "",
    type: "home_carousel",
    title: "",
    subtitle: "",
    summary: "",
    image: "",
    sort: 10,
    visible: true
  }
});

const currentTitle = computed(() => pageTitles[state.activeTab] || pageTitles.dashboard);
const currentModuleProfile = computed(() => moduleProfiles[state.activeTab] || moduleProfiles.dashboard);
const currentUser = computed(() => {
  const user = state.user;
  if (!user || typeof user !== "object") return "禾煦管理员";
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return user.username
    || user.name
    || user.email
    || user.nickName
    || user.nickname
    || meta.username
    || meta.nickName
    || meta.name
    || user.uid
    || user.id
    || meta.uid
    || "禾煦管理员";
});
const currentRoleName = computed(() => state.adminProfileError ? "未授权" : (state.adminProfile?.roleName || "管理员"));
const orderBroadcastStatusTone = computed(() => {
  if (orderBroadcast.error || orderBroadcast.audioMessage) return "danger";
  if (orderBroadcast.starting || (orderBroadcast.enabled && !orderBroadcast.visible)) return "warn";
  return orderBroadcast.enabled ? "good" : "neutral";
});
const orderBroadcastStatusLabel = computed(() => {
  if (orderBroadcast.starting) return "正在连接";
  if (orderBroadcast.audioMessage) return "声音异常，请点测试";
  if (orderBroadcast.error) return "检查异常，自动重试中";
  if (!orderBroadcast.enabled) return "未开启";
  if (!orderBroadcast.visible) return "等待回到前台";
  return "运行中";
});
const orderBroadcastStatusDetail = computed(() => {
  if (orderBroadcast.starting) return "正在建立最新已付款订单基线，不会补播开启前的旧订单。";
  if (orderBroadcast.audioMessage) return orderBroadcast.audioMessage;
  if (orderBroadcast.error) return `最近检查失败：${orderBroadcast.error}`;
  if (!orderBroadcast.enabled) return "连接普通蓝牙音箱后点击开启。语音：新订单 / 订单已支付 / 会员充值。";
  if (!orderBroadcast.visible) return "页面进入后台后浏览器可能暂停检查；回到本页会立即补查。";
  if (orderBroadcast.wakeMessage) return orderBroadcast.wakeMessage;
  return orderBroadcast.wakeLockActive
    ? "每 5 秒检查一次新订单，屏幕常亮已保持。"
    : "每 5 秒检查一次新订单，请保持本页在前台并关闭系统自动锁屏。";
});
const orderBroadcastLastCheck = computed(() => orderBroadcast.lastCheckedAt ? formatDate(orderBroadcast.lastCheckedAt) : "尚未检查");
const headerSignalCount = computed(() => {
  const summary = state.systemStatus?.summary || {};
  return Number(summary.warn || 0) + Number(summary.error || 0);
});
const selectedOrder = computed(() => state.orders.find((item) => item._id === state.selectedOrderId) || null);
const selectedAfterSale = computed(() => state.afterSales.find((item) => item._id === state.selectedAfterSaleId) || null);
const selectedAuditLog = computed(() => state.auditLogs.find((item) => item._id === state.selectedAuditLogId) || null);
const selectedReservation = computed(() => state.reservations.find((item) => item._id === state.selectedReservationId) || null);
const selectedSignup = computed(() => state.signups.find((item) => item._id === state.selectedSignupId) || null);
const selectedCustomer = computed(() => state.customers.find((item) => item.id === state.selectedCustomerId) || null);
const selectedCustomerSignal = computed(() => customerSignal(selectedCustomer.value));
const selectedRole = computed(() => state.adminRoles.find((item) => item.id === state.selectedRoleId) || null);

function openDrawer(key) {
  if (key in state.drawers) state.drawers[key] = true;
}

function closeDrawer(key) {
  if (key in state.drawers) state.drawers[key] = false;
}

function selectOrder(order) {
  state.selectedOrderId = order?._id || "";
  openDrawer("order");
}

function selectAfterSale(order) {
  state.selectedAfterSaleId = order?._id || "";
  if (order) fillAfterSaleForm(order);
  openDrawer("afterSale");
}

function selectReservation(record) {
  state.selectedReservationId = record?._id || "";
  state.reservationDrawerOpen = !!record;
}

function closeReservationDrawer() {
  state.reservationDrawerOpen = false;
}

function selectSignup(record) {
  state.selectedSignupId = record?._id || "";
  openDrawer("signup");
}

function selectCustomer(customer) {
  state.selectedCustomerId = customer?.id || "";
  openDrawer("customer");
}

function selectAuditLog(log) {
  state.selectedAuditLogId = log?._id || "";
  openDrawer("audit");
}
const currentRolePreset = computed(() => state.rolePresets.find((item) => item.key === roleForm.roleKey) || state.rolePresets[0] || null);
const currentPermissionGroups = computed(() => {
  const permissions = currentRolePreset.value?.permissions || [];
  if (permissions.includes("*")) {
    return [{
      group: "全部后台",
      items: [{ key: "*", label: "全部模块与高风险操作", risk: "high" }]
    }];
  }
  const groups = permissions.reduce((result, permission) => {
    const meta = permissionMap[permission] || { key: permission, group: "未归类", label: permission, risk: "low" };
    if (!result[meta.group]) result[meta.group] = [];
    result[meta.group].push(meta);
    return result;
  }, {});
  return permissionGroupOrder
    .filter((group) => groups[group]?.length)
    .map((group) => ({ group, items: groups[group] }));
});
const currentPermissionSummary = computed(() => {
  const permissions = currentRolePreset.value?.permissions || [];
  if (permissions.includes("*")) return "拥有全部权限，适合实际负责人或超级管理员。";
  const highRiskCount = currentPermissionGroups.value.reduce((sum, group) => sum + group.items.filter((item) => item.risk === "high").length, 0);
  return `${permissions.length} 项权限，其中 ${highRiskCount} 项高风险权限。`;
});
const visibleNavGroups = computed(() => navGroups
  .map((group) => ({
    ...group,
    items: group.items.map((key) => navItemMap[key]).filter((item) => item && canAccessTab(item.key))
  }))
  .filter((group) => group.items.length));
const visibleQuickActions = computed(() => quickActions.filter((action) => canAccessTab(action.tab)));
const activeCollectionTab = computed(() => {
  return collectionTabs.find((item) => item.key === state.collection) || collectionTabs[0];
});
const catalogListTitle = computed(() => activeCollectionTab.value?.listTitle || "资料列表");
const catalogEntityLabel = computed(() => activeCollectionTab.value?.entityLabel || "资料");
const accessBlocked = computed(() => !!state.adminProfileError || (!!state.adminProfile && (state.adminProfile.disabled === true || !visibleNavGroups.value.length)));
const accessBlockTitle = computed(() => {
  if (state.adminProfileError) return "无法读取后台权限";
  return state.adminProfile?.disabled ? "当前后台账号已停用" : "当前账号暂无可访问模块";
});
const accessBlockHint = computed(() => {
  if (state.adminProfileError) return `${state.adminProfileError}。后台不会继续读取经营数据，请退出后重新登录或检查账号权限配置。`;
  return state.adminProfile?.disabled
    ? "该账号已被停用，后台不会继续读取经营数据。请使用仍在启用状态的管理员账号重新登录。"
    : "该账号没有任何后台模块权限，无法查看订单、预约、用户或系统配置。";
});
function parseTimeToMinutes(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutesToTime(total) {
  const safe = Math.max(0, Number(total) || 0);
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 台历时刻列表：读设置里的可约时段与步长 */
const reservationBoardSlotTimes = computed(() => {
  const settings = state.settings || {};
  const open = parseTimeToMinutes(settings.bookingOpenTime || "10:00");
  const close = parseTimeToMinutes(settings.bookingCloseTime || "21:30");
  const step = Math.max(15, Math.min(60, Number(settings.bookingSlotStepMinutes) || 30));
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) {
    return ["10:00", "12:30", "15:00", "17:30", "20:00"];
  }
  const times = [];
  for (let m = open; m < close; m += step) {
    times.push(formatMinutesToTime(m));
  }
  return times.length ? times : ["10:00"];
});

const reservationBoardColumnStyle = computed(() => {
  const n = Math.max(1, reservationBoardSlotTimes.value.length);
  return {
    gridTemplateColumns: `118px repeat(${n}, minmax(58px, 1fr))`
  };
});

function reservationTimeRange(item = {}) {
  const start = parseTimeToMinutes(item.time || item.slot);
  let end = parseTimeToMinutes(item.endTime);
  if (!Number.isFinite(end) && Number.isFinite(start)) {
    const dur = Number(item.durationMinutes)
      || Number(state.settings?.bookingMinDurationMinutes)
      || 120;
    end = start + Math.max(30, dur);
  }
  return { start, end };
}

function reservationSlotLabel(item = {}) {
  const start = String(item.time || item.slot || "").trim();
  const end = String(item.endTime || "").trim();
  if (start && end) return `${start}–${end}`;
  return start || end || "—";
}

function reservationPayLabel(item = {}) {
  const pay = String(item.payStatus || "").trim();
  const map = {
    paid: "已支付",
    pending: "待支付",
    refunding: "退款中",
    refunded: "已退款",
    partial_refunded: "部分退款",
    cancelled: "已取消支付"
  };
  if (map[pay]) return map[pay];
  if (pay) return pay;
  if (/待支付/.test(item.status || "")) return "待支付";
  if (/已确认|已完成/.test(item.status || "")) return "已支付";
  return "—";
}

/** 当日台历：按茶室分行，按 time–endTime 与格子区间重叠标占用 */
const reservationCalendarRows = computed(() => {
  const day = state.reservationCalendarDate;
  const slotTimes = reservationBoardSlotTimes.value;
  const step = Math.max(15, Math.min(60, Number(state.settings?.bookingSlotStepMinutes) || 30));
  const slotMins = slotTimes.map(parseTimeToMinutes);

  const rows = {};
  const ensureRow = (key, roomId = "") => {
    if (!rows[key]) {
      rows[key] = {
        room: key,
        roomId: roomId || "",
        slots: slotTimes.map((time, index) => ({
          time,
          startMins: slotMins[index],
          endMins: slotMins[index] + step,
          busy: false,
          record: null,
          records: []
        }))
      };
    }
    return rows[key];
  };

  (state.roomResources || []).forEach((room) => {
    if (!room || room.removed === true) return;
    if (room.visible === false) return;
    const name = String(room.name || room.title || room.id || "茶室").trim();
    ensureRow(name, room.id);
  });

  (state.reservations || [])
    .filter((item) => (item.day || item.date || "").slice(0, 10) === day && !/已取消/.test(item.status || ""))
    .forEach((item) => {
      const roomKey = String(item.roomName || item.room || "未分配茶室").trim() || "未分配茶室";
      const row = ensureRow(roomKey, item.roomId || "");
      const { start, end } = reservationTimeRange(item);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      row.slots.forEach((slot) => {
        if (start < slot.endMins && end > slot.startMins) {
          slot.busy = true;
          slot.records.push(item);
          if (!slot.record) slot.record = item;
        }
      });
    });

  return Object.values(rows);
});

/** 当日列表（与台历同日） */
const reservationsForCalendarDay = computed(() => {
  const day = state.reservationCalendarDate;
  return (state.reservations || []).filter((item) => (item.day || item.date || "").slice(0, 10) === day);
});

/** 当前周：周一~周日日期数组 */
const reservationWeekDays = computed(() => {
  const start = weekStartOf(state.reservationWeekStart);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(start, i));
});

/** 周范围显示文案：2026-08-11 ~ 08-17 */
const reservationWeekStartOf = computed(() => {
  const days = reservationWeekDays.value;
  if (!days.length) return state.reservationWeekStart;
  const end = days[days.length - 1];
  return `${days[0]} ~ ${end.slice(5)}`;
});

/** 当前周全部预约（未取消优先，取消的仍保留供查看） */
const reservationsForWeek = computed(() => {
  const start = weekStartOf(state.reservationWeekStart);
  const end = weekEndOf(state.reservationWeekStart);
  return (state.reservations || []).filter((item) => {
    const d = (item.day || item.date || "").slice(0, 10);
    return d >= start && d <= end;
  });
});

/** 周视图：时段行 × 日期列，格子标记占用 */
const reservationWeekTable = computed(() => {
  const slotTimes = reservationBoardSlotTimes.value;
  const slotMins = slotTimes.map(parseTimeToMinutes);
  const rows = [];
  const dayItems = {};
  reservationWeekDays.value.forEach((day) => { dayItems[day] = []; });
  reservationsForWeek.value.forEach((item) => {
    const d = (item.day || item.date || "").slice(0, 10);
    if (dayItems[d]) dayItems[d].push(item);
  });
  slotTimes.forEach((time, index) => {
    const cells = reservationWeekDays.value.map((day) => {
      const records = dayItems[day].filter((item) => !/已取消/.test(item.status || ""));
      // 预约起点落在该时段的格子作为主格，占用信息随主格展示
      const hit = records.find((item) => {
        const { start } = reservationTimeRange(item);
        return Number.isFinite(start) && Math.abs(start - slotMins[index]) < 1;
      });
      return { day, time, records, record: hit || records[0] || null };
    });
    rows.push({ time, cells });
  });
  return rows;
});

const reservationDayStats = computed(() => {
  const rows = reservationsForCalendarDay.value;
  const count = (re) => rows.filter((item) => re.test(String(item.status || ""))).length;
  return {
    total: rows.length,
    pendingPay: count(/待支付/),
    confirmed: count(/已确认/),
    completed: count(/已完成/),
    noshow: count(/未到店/),
    cancelled: count(/已取消/),
    abnormal: count(/异常/)
  };
});

/** 资源台历：横跨事件条（非格子墙） */
const reservationTimelineModel = computed(() => {
  const open = parseTimeToMinutes(state.settings?.bookingOpenTime || "10:00");
  const close = parseTimeToMinutes(state.settings?.bookingCloseTime || "21:30");
  const openSafe = Number.isFinite(open) ? open : 10 * 60;
  const closeSafe = Number.isFinite(close) && close > openSafe ? close : openSafe + 11 * 60 + 30;
  const span = Math.max(60, closeSafe - openSafe);
  const hourMarks = [];
  for (let m = openSafe; m <= closeSafe; m += 60) {
    hourMarks.push({
      time: formatMinutesToTime(m),
      leftPct: ((m - openSafe) / span) * 100
    });
  }

  const day = state.reservationCalendarDate;
  const dayItems = (state.reservations || []).filter(
    (item) => (item.day || item.date || "").slice(0, 10) === day && !/已取消/.test(item.status || "")
  );

  const rowMap = {};
  const ensure = (name, roomId = "") => {
    const key = name || "茶室";
    if (!rowMap[key]) rowMap[key] = { room: key, roomId, events: [] };
    return rowMap[key];
  };

  (state.roomResources || []).forEach((room) => {
    if (!room || room.removed === true || room.visible === false) return;
    ensure(String(room.name || room.title || room.id || "茶室").trim(), room.id);
  });

  dayItems.forEach((item) => {
    const roomName = String(item.roomName || item.room || "未分配茶室").trim() || "未分配茶室";
    const row = ensure(roomName, item.roomId || "");
    const { start, end } = reservationTimeRange(item);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const left = ((Math.max(start, openSafe) - openSafe) / span) * 100;
    const right = ((Math.min(end, closeSafe) - openSafe) / span) * 100;
    const width = Math.max(2.5, right - left);
    row.events.push({
      id: item._id,
      record: item,
      leftPct: Math.max(0, Math.min(100, left)),
      widthPct: Math.max(2.5, Math.min(100 - left, width)),
      label: `${maskName(item.name || item.customerName) || "访客"} · ${reservationSlotLabel(item)}`,
      status: item.status || "",
      tone: statusTone(item.status)
    });
  });

  return {
    openLabel: formatMinutesToTime(openSafe),
    closeLabel: formatMinutesToTime(closeSafe),
    hourMarks,
    rows: Object.values(rowMap)
  };
});

/** 表格数据：当日 + 状态筛选（状态在客户端再滤一层，配合 workflow） */
const reservationTableRows = computed(() => {
  let rows = reservationsForCalendarDay.value.slice();
  const status = String(filters.reservationStatus || "").trim();
  if (status) {
    rows = rows.filter((item) => String(item.status || "") === status);
  }
  const keyword = String(filters.reservationKeyword || "").trim().toLowerCase();
  if (keyword) {
    rows = rows.filter((item) => {
      const hay = [
        item.roomName,
        item.room,
        item.name,
        item.customerName,
        item.phone,
        item.mobile,
        item.reservationNo,
        item.status
      ].join(" ").toLowerCase();
      return hay.includes(keyword);
    });
  }
  // 待办优先：待支付 > 已确认 > 其他
  const rank = (s) => {
    if (/待支付/.test(s)) return 0;
    if (/异常/.test(s)) return 1;
    if (/已确认/.test(s)) return 2;
    if (/已完成/.test(s)) return 3;
    return 4;
  };
  rows.sort((a, b) => {
    const d = rank(String(a.status || "")) - rank(String(b.status || ""));
    if (d !== 0) return d;
    return parseTimeToMinutes(a.time || a.slot) - parseTimeToMinutes(b.time || b.slot);
  });
  return rows;
});

function setReservationStatusFilter(status) {
  filters.reservationStatus = status || "";
  // 数据已按日拉取，状态筛选在客户端即可
}

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
        { label: "茶品订单", value: 0, className: "orders" },
        { label: "茶室预约", value: 0, className: "rooms" },
        { label: "活动报名", value: 0, className: "events" }
      ];
  return {
    revenue,
    orderCount,
    averagePrice: orderCount ? Math.round(revenue / orderCount) : 0,
    totalCount,
    segments
  };
});
const dashboardDonutStyle = computed(() => {
  const first = dashboardInsight.value.totalCount ? dashboardInsight.value.segments[0]?.value || 0 : 0;
  const second = first + (dashboardInsight.value.totalCount ? dashboardInsight.value.segments[1]?.value || 0 : 0);
  return {
    "--first-stop": `${first}%`,
    "--second-stop": `${Math.min(second, 100)}%`
  };
});
const activeFilterLabels = computed(() => {
  const items = [];
  const add = (label, value) => {
    const text = String(value || "").trim();
    if (text) items.push({ label, value: text });
  };
  if (state.activeTab === "catalog") {
    add("资料", filters.catalog);
    add("状态", filters.catalogShelf === "on" ? "上架" : filters.catalogShelf === "off" ? "下架" : filters.catalogShelf === "draft" ? "草稿" : "");
    add("分类", filters.catalogCategory);
    add("标记", filters.catalogFlag === "low_stock" ? "低库存" : filters.catalogFlag === "no_image" ? "缺图片" : "");
  }
  if (state.activeTab === "orders") {
    if (filters.orderQueue === "all") {
      add("视图", "全部");
    }
    if (filters.orderBizType) {
      add("业务线", ORDER_BIZ_OPTIONS.find((item) => item.value === filters.orderBizType)?.label || filters.orderBizType);
    }
    if (filters.orderQueue === "all") {
      add("状态", filters.orderStatus);
    }
    add("关键词", filters.orderKeyword);
  }
  if (state.activeTab === "afterSales") {
    add("售后", filters.afterSaleStatus);
    add("关键词", filters.afterSaleKeyword);
  }
  if (state.activeTab === "inventory") add("关键词", filters.inventoryKeyword);
  if (state.activeTab === "reservations") {
    add("日期", state.reservationCalendarDate);
    add("状态", filters.reservationStatus);
    add("关键词", filters.reservationKeyword);
  }
  if (state.activeTab === "signups") {
    add("状态", filters.signupStatus);
    add("关键词", filters.signupKeyword);
  }
  if (state.activeTab === "customers") add("关键词", filters.customerKeyword);
  if (state.activeTab === "audit") add("关键词", filters.auditKeyword);
  if (state.activeTab === "notifications") add("关键词", filters.notificationKeyword);
  return items;
});
const hasClearableFilters = computed(() => {
  if (state.activeTab === "catalog") {
    return !!(filters.catalog.trim() || filters.catalogShelf || filters.catalogCategory || filters.catalogFlag);
  }
  if (state.activeTab === "orders") {
    return !!(
      filters.orderBizType
      || filters.orderQueue !== "todo"
      || filters.orderStatus
      || filters.orderKeyword.trim()
    );
  }
  if (state.activeTab === "afterSales") return !!(filters.afterSaleStatus || filters.afterSaleKeyword.trim());
  if (state.activeTab === "inventory") return !!filters.inventoryKeyword.trim();
  if (state.activeTab === "reservations") return !!(filters.reservationStatus || filters.reservationKeyword.trim());
  if (state.activeTab === "signups") return !!(filters.signupStatus || filters.signupKeyword.trim());
  if (state.activeTab === "customers") return !!filters.customerKeyword.trim();
  if (state.activeTab === "audit") return !!filters.auditKeyword.trim();
  if (state.activeTab === "notifications") return !!filters.notificationKeyword.trim();
  return false;
});
const exportScopeLabel = computed(() => hasClearableFilters.value ? "按筛选导出 CSV" : "导出全部 CSV");
const showSyncBanner = computed(() => false);
const currentRecordCount = computed(() => {
  const counts = {
    dashboard: state.summary.length,
    catalog: filteredCatalog.value.length,
    orders: state.pagination.orders.total || state.orders.length,
    afterSales: state.pagination.afterSales.total || state.afterSales.length,
    inventory: state.pagination.inventory.total || state.inventoryLogs.length,
    reservations: state.pagination.reservations.total || state.reservations.length,
    signups: state.pagination.signups.total || state.signups.length,
    customers: state.pagination.customers.total || state.customers.length,
    content: state.contentItems.length,
    analytics: state.analytics?.topItems?.length || 0,
    audit: state.pagination.audit.total || state.auditLogs.length,
    notifications: state.pagination.notifications.total || state.notificationLogs.length,
    system: state.systemStatus?.checks?.length || 0,
    roles: state.adminRoles.length,
    backups: state.pagination.backups.total || state.backupLogs.length,
    settings: Object.keys(state.settings || {}).length
  };
  return counts[state.activeTab] || 0;
});
const globalSearchTotal = computed(() => state.searchResults.reduce((sum, group) => sum + Number(group.total || group.items?.length || 0), 0));
const activeSavedViews = computed(() => state.savedViews[state.activeTab] || []);
/** 常用视图：有已保存视图，或当前有可保存筛选时才显示（堂饮档位表不启用） */
const canSaveActiveView = computed(() => SAVED_VIEW_TABS.has(state.activeTab) && state.collection !== "drinks");
/** 仅订单/售后/预约展示状态流；其它页不堆砌工作流卡片 */
const showWorkflowStrip = computed(() => ["orders", "afterSales", "signups"].includes(state.activeTab) && moduleWorkflowSteps.value.length > 0);
/** 顶部 KPI 仅经营首页展示，避免商品页等重复「今日」指标 */
const showMetricRow = computed(() => state.activeTab === "dashboard" && state.summary.length > 0);
/** 有筛选条件时才显示轻量筛选条（堂饮档位表不显示） */
const showActiveFilters = computed(() => activeFilterLabels.value.length > 0 && state.collection !== "drinks");
/** 常用视图：有已保存视图，或当前有可保存筛选时才显示 */
const showSavedViewsBar = computed(() => canSaveActiveView.value && (activeSavedViews.value.length > 0 || hasClearableFilters.value));
const dashboardScopeText = computed(() => {
  const scope = state.dashboard?.dataScope || {};
  const ordersRead = Number(scope.ordersRead || 0);
  const reservationsRead = Number(scope.reservationsRead || 0);
  const signupsRead = Number(scope.signupsRead || 0);
  if (!ordersRead && !reservationsRead && !signupsRead) return "暂无经营记录统计口径";
  const limited = scope.limited ? "，已达读取上限，请进入订单列表导出复核" : "";
  return `首页按最近 ${numberText(ordersRead)} 笔订单、${numberText(reservationsRead)} 条预约、${numberText(signupsRead)} 条报名统计${limited}`;
});
const analyticsScopeText = computed(() => {
  const scope = state.analytics?.scope || {};
  const ordersRead = Number(scope.ordersRead || 0);
  if (!ordersRead) return "来自已支付订单";
  const limited = scope.limited ? "，已达读取上限，请用 CSV 导出核对完整口径" : "";
  return `按最近 ${numberText(ordersRead)} 笔订单统计${limited}`;
});
const currentFreshnessMeta = computed(() => {
  const value = state.lastLoadedAt[state.activeTab];
  if (!value) {
    return {
      text: "等待首次同步",
      title: "当前模块还没有成功读取云端数据",
      tone: "quiet"
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      text: "同步时间未知",
      title: "最近同步时间格式异常",
      tone: "risk"
    };
  }
  const diff = Date.now() - date.getTime();
  return {
    text: formatFreshness(value),
    title: `最近成功同步：${formatDate(value)}`,
    tone: diff > 10 * 60 * 1000 ? "risk" : ""
  };
});
const currentFreshnessText = computed(() => currentFreshnessMeta.value.text);
const currentAccessText = computed(() => {
  if (!state.adminProfile) return "角色资料未加载";
  const permissions = writePermissionsByTab[state.activeTab] || [];
  if (!permissions.length) return "只读核对";
  const allowed = permissions.filter((permission) => hasPermission(permission));
  if (!allowed.length) return "只读访问";
  if (allowed.length === permissions.length) return "可执行全部操作";
  return `可执行 ${allowed.length}/${permissions.length} 项操作`;
});
const currentResultText = computed(() => {
  const page = state.pagination[pageKeyForTab(state.activeTab)];
  if (page && (page.total || page.pageCount > 1)) {
    return page.total ? `${pageRangeText(state.activeTab)}，每页 ${numberText(page.pageSize)}` : "0 条记录";
  }
  const prefix = hasClearableFilters.value ? "筛选后" : "当前";
  return `${prefix} ${numberText(currentRecordCount.value)} 条`;
});
const currentRiskText = computed(() => {
  const permissions = writePermissionsByTab[state.activeTab] || [];
  if (permissions.length && !permissions.some((permission) => hasPermission(permission))) return "当前角色无写入风险";
  return riskPolicyByTab[state.activeTab] || "关键写入保留操作痕迹";
});
const operationAssuranceItems = computed(() => [
  { label: "最后同步", value: currentFreshnessText.value, tone: state.loading ? "busy" : currentFreshnessMeta.value.tone, title: currentFreshnessMeta.value.title },
  { label: "权限边界", value: currentAccessText.value, tone: currentAccessText.value.includes("只读") ? "quiet" : "" },
  { label: "结果范围", value: currentResultText.value, tone: hasClearableFilters.value ? "focus" : "" },
  { label: "风控提示", value: currentRiskText.value, tone: currentRiskText.value.includes("无写入") ? "quiet" : "risk" }
]);
const moduleWorkflowSteps = computed(() => buildWorkflowSteps(state.activeTab));

function supportsCatalogSpecs(collection = state.collection) {
  return isTeaProductsCollection(collection);
}

const emptyTeaGroup = () => ({ name: "本席可选", optionsText: "" });

function normalizeTeaGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group) => {
      if (!group || typeof group !== "object") return null;
      const name = String(group.name || group.label || "本席可选").trim().slice(0, 40) || "本席可选";
      let options = [];
      if (Array.isArray(group.options)) {
        options = group.options
          .map((item) => String(item && item.name ? item.name : item || "").trim())
          .filter(Boolean)
          .slice(0, 20);
      } else if (typeof group.optionsText === "string") {
        options = group.optionsText
          .split(/[,，、\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      if (!options.length) return null;
      return { name, options, optionsText: options.join("、") };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function addTeaGroup() {
  if (!Array.isArray(forms.catalog.teaGroups)) forms.catalog.teaGroups = [];
  if (forms.catalog.teaGroups.length >= 8) {
    showToast("最多 8 个茶款分组");
    return;
  }
  forms.catalog.teaGroups.push(emptyTeaGroup());
}

function removeTeaGroup(index) {
  if (!Array.isArray(forms.catalog.teaGroups)) return;
  forms.catalog.teaGroups.splice(index, 1);
}

function deriveCatalogShelfStatus(item = {}) {
  if (isCatalogRemoved(item)) return "removed";
  if (item.visible === false || item.deleted === true) {
    const status = String(item.status || "").trim();
    if (status === "草稿" || /draft/i.test(status)) return "draft";
    return "off";
  }
  return "on";
}

function applyCatalogShelfStatus(status) {
  const next = String(status || "on");
  forms.catalog.shelfStatus = next;
  if (next === "on") {
    forms.catalog.visible = true;
    forms.catalog.deleted = false;
    if (supportsProductShelf()) forms.catalog.status = "上架";
  } else if (next === "draft") {
    forms.catalog.visible = false;
    if (supportsProductShelf()) forms.catalog.status = "草稿";
  } else if (next === "off") {
    forms.catalog.visible = false;
    if (supportsProductShelf()) forms.catalog.status = "下架";
  }
}

function normalizeCatalogSpecs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = String(item.label || item.unit || "").trim();
      if (!label) return null;
      // 兼容旧 stockUnits：若无独立 stock，不当作库存
      const stock = item.stock !== undefined && item.stock !== null && item.stock !== ""
        ? Math.max(0, Number(item.stock) || 0)
        : 0;
      return {
        label: label.slice(0, 40),
        weight: String(item.weight || "").trim().slice(0, 20),
        price: Math.max(0, Number(item.price) || 0),
        stock
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function syncCatalogStockFromSpecs() {
  if (!isTeaProductsCollection()) return;
  const specs = normalizeCatalogSpecs(forms.catalog.specs);
  forms.catalog.stock = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec.stock) || 0), 0);
}

function addCatalogSpec() {
  if (!Array.isArray(forms.catalog.specs)) forms.catalog.specs = [];
  if (forms.catalog.specs.length >= 12) {
    showToast("最多 12 个规格");
    return;
  }
  forms.catalog.specs.push(emptyCatalogSpec());
}

function removeCatalogSpec(index) {
  if (!Array.isArray(forms.catalog.specs)) return;
  if (forms.catalog.specs.length <= 1) {
    showToast("至少保留 1 个规格");
    return;
  }
  forms.catalog.specs.splice(index, 1);
  syncCatalogPriceFromSpecs();
}

function syncCatalogPriceFromSpecs() {
  const specs = normalizeCatalogSpecs(forms.catalog.specs);
  if (!specs.length) return;
  forms.catalog.price = specs[0].price;
  if (specs[0].label) forms.catalog.unit = specs[0].label;
  syncCatalogStockFromSpecs();
}

/** 当前商品渠道下的可配置类别（按 sort；已删除不展示） */
const managedCategoriesForCollection = computed(() => {
  const channel = state.collection;
  if (channel !== "tea_products" && channel !== "drinks") return [];
  return (state.productCategories || [])
    .filter((item) => item && item.channel === channel && item.removed !== true)
    // 堂饮：只认带价格的档位，排除旧「推荐/品鉴/壶茶」空壳
    .filter((item) => {
      if (channel !== "drinks") return true;
      if (item.price === undefined || item.price === null || item.price === "") return false;
      return true;
    })
    .slice()
    .sort((a, b) => Number(a.sort || 9999) - Number(b.sort || 9999) || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
});

const managedCategoryNames = computed(() =>
  managedCategoriesForCollection.value
    .filter((item) => item.visible !== false)
    .map((item) => String(item.name || "").trim())
    .filter(Boolean)
);

/** 堂饮：当前选中档位的价格（提示用；0 表示未知） */
const drinkTierPrice = computed(() => {
  const tier = managedCategoriesForCollection.value.find(
    (item) => String(item.name || "").trim() === catalogCategoryChoice.value
  );
  return Math.max(0, Number(tier && tier.price) || 0);
});

/** 配置面板用：分类 + 商品数（只统计未删除） */
const managedCategoriesWithCount = computed(() =>
  managedCategoriesForCollection.value.map((cat) => {
    const name = String(cat.name || "").trim();
    let rows = state.catalogItems || [];
    if (isDrinksCollection()) rows = rows.filter(isDrinkTeaRow);
    const productCount = rows.filter(
      (item) => !isCatalogRemoved(item) && String(item.category || "").trim() === name
    ).length;
    return Object.assign({}, cat, { productCount });
  })
);

function setCatalogCategoryFilter(name) {
  filters.catalogCategory = String(name || "").trim();
}

/** 堂饮列表行：只要档位下的茶品，不要旧「档位当商品」脏数据 */
function isDrinkTeaRow(item) {
  if (!item) return false;
  if (item.categoryId) return true;
  // 旧档位文档：有 teaGroups、且名为初见/知味…
  if (Array.isArray(item.teaGroups) && item.teaGroups.length) return false;
  if (Number(item.price) > 0 && !item.categoryId) return false;
  return !!String(item.category || "").trim();
}

const catalogCategoryOptions = computed(() => {
  // 堂饮筛选项：只认档位表，避免混入推荐/品鉴/测试等历史脏类
  if (isDrinksCollection()) {
    return managedCategoryNames.value.slice();
  }
  const set = new Set(managedCategoryNames.value);
  (state.catalogItems || []).forEach((item) => {
    const cat = String(item?.category || "").trim();
    if (cat) set.add(cat);
  });
  return Array.from(set);
});

function categoryPresetsForCollection(collection = state.collection) {
  if (collection === "tea_products") return TEA_CATEGORY_PRESETS.slice();
  if (collection === "drinks") return DRINK_CATEGORY_PRESETS.slice();
  if (collection === "events") return EVENT_CATEGORY_PRESETS.slice();
  return [];
}

/**
 * 商品选类别：
 * - 堂饮：只选档位（初见/知味…），不混历史脏类
 * - 茶叶：可配置类别 + 历史 + 兜底
 */
const catalogCategorySelectOptions = computed(() => {
  if (state.collection === "events") {
    const presets = EVENT_CATEGORY_PRESETS.slice();
    const set = new Set(presets);
    const current = String(forms.catalog.category || "").trim();
    if (current) set.add(current);
    (state.catalogItems || []).forEach((item) => {
      const cat = String(item?.category || "").trim();
      if (cat) set.add(cat);
    });
    const ordered = [];
    presets.forEach((cat) => {
      if (set.has(cat)) {
        ordered.push(cat);
        set.delete(cat);
      }
    });
    Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((cat) => ordered.push(cat));
    return ordered;
  }

  // 堂饮：严格只用启用中的档位
  if (isDrinksCollection()) {
    const managed = managedCategoryNames.value;
    if (managed.length) return managed;
    return DRINK_CATEGORY_PRESETS.slice();
  }

  const managed = managedCategoryNames.value;
  const presets = managed.length ? managed : categoryPresetsForCollection();
  const set = new Set(presets);
  catalogCategoryOptions.value.forEach((cat) => set.add(cat));
  const current = String(forms.catalog.category || "").trim();
  if (current) set.add(current);
  const ordered = [];
  presets.forEach((cat) => {
    if (set.has(cat)) {
      ordered.push(cat);
      set.delete(cat);
    }
  });
  Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((cat) => ordered.push(cat));
  return ordered;
});

const catalogStatusSelectOptions = computed(() => {
  const base = state.collection === "events"
    ? EVENT_STATUS_OPTIONS.slice()
    : [];
  const current = String(forms.catalog.status || "").trim();
  if (current && !base.includes(current)) base.push(current);
  return base;
});

function syncCatalogCategoryChoice() {
  const cat = String(forms.catalog.category || "").trim();
  const options = catalogCategorySelectOptions.value;
  if (cat && options.includes(cat)) {
    catalogCategoryChoice.value = cat;
    return;
  }
  if (cat) {
    catalogCategoryChoice.value = SELECT_CUSTOM_VALUE;
    return;
  }
  const fallback = options[0] || "";
  catalogCategoryChoice.value = fallback || SELECT_CUSTOM_VALUE;
  if (fallback) forms.catalog.category = fallback;
}

function onCatalogCategoryChoiceChange() {
  if (catalogCategoryChoice.value === SELECT_CUSTOM_VALUE) {
    if (catalogCategorySelectOptions.value.includes(String(forms.catalog.category || "").trim())) {
      forms.catalog.category = "";
    }
    if (isDrinksCollection()) forms.catalog.categoryId = "";
    return;
  }
  forms.catalog.category = catalogCategoryChoice.value;
  syncDrinkCategoryIdFromName();
  // 堂饮：切换档位时价格自动联动为档位价（可在联动后再手动改）
  if (isDrinksCollection()) {
    forms.catalog.price = drinkTierPrice.value;
  }
}

function formatEventDateDisplay(iso) {
  const text = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const d = new Date(`${text}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd} ${WEEKDAY_LABELS[d.getDay()]}`;
}

function parseEventDateToIso(display) {
  const text = String(display || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\.(\d{1,2})/);
  if (!match) return "";
  const year = new Date().getFullYear();
  const mm = String(Number(match[1])).padStart(2, "0");
  const dd = String(Number(match[2])).padStart(2, "0");
  const candidate = `${year}-${mm}-${dd}`;
  const d = new Date(`${candidate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return candidate;
}

function normalizeEventTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function syncCatalogDateFields() {
  if (state.collection !== "events") {
    catalogDateIso.value = "";
    return;
  }
  catalogDateIso.value = parseEventDateToIso(forms.catalog.date);
  forms.catalog.time = normalizeEventTime(forms.catalog.time);
}

function onCatalogDateIsoChange() {
  const display = formatEventDateDisplay(catalogDateIso.value);
  if (display) forms.catalog.date = display;
}

const filteredCatalog = computed(() => {
  let rows = state.catalogItems || [];
  // 堂饮：列表只展示「档位下的茶品」，不展示旧档位文档 / 测试 SKU
  if (isDrinksCollection()) {
    rows = rows.filter(isDrinkTeaRow);
  }
  const keyword = filters.catalog.trim().toLowerCase();
  if (keyword) {
    rows = rows.filter((item) => textOf(item, ["id", "name", "title", "category", "groupName", "status"]).includes(keyword));
  }
  if (filters.catalogShelf === "on") {
    rows = rows.filter((item) => !isCatalogOffShelf(item) && !isCatalogRemoved(item));
  } else if (filters.catalogShelf === "off") {
    rows = rows.filter((item) => isCatalogOffShelf(item) && deriveCatalogShelfStatus(item) !== "draft");
  } else if (filters.catalogShelf === "draft") {
    rows = rows.filter((item) => deriveCatalogShelfStatus(item) === "draft");
  }
  if (filters.catalogCategory) {
    rows = rows.filter((item) => String(item.category || "").trim() === filters.catalogCategory);
  }
  if (filters.catalogFlag === "low_stock") {
    rows = rows.filter((item) => {
      if (item.stock === undefined || item.stock === null || item.stock === "") return false;
      const stock = Number(item.stock || 0);
      return stock > 0 && stock <= 5;
    });
  } else if (filters.catalogFlag === "no_image") {
    rows = rows.filter((item) => !item.image && !item.thumb);
  }
  // 堂饮：按档位 sort + 茶品 sort 排，方便对照点单左侧
  if (isDrinksCollection()) {
    const tierSort = new Map(
      managedCategoriesForCollection.value.map((tier) => [String(tier.name || "").trim(), Number(tier.sort) || 9999])
    );
    rows = rows.slice().sort((a, b) => {
      const sa = tierSort.get(String(a.category || "").trim()) ?? 9999;
      const sb = tierSort.get(String(b.category || "").trim()) ?? 9999;
      if (sa !== sb) return sa - sb;
      const ga = String(a.groupName || "").localeCompare(String(b.groupName || ""), "zh-CN");
      if (ga) return ga;
      return (Number(a.sort) || 9999) - (Number(b.sort) || 9999)
        || String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
  }
  return rows;
});

const allFilteredCatalogSelected = computed(() => {
  const rows = filteredCatalog.value;
  if (!rows.length) return false;
  return rows.every((item) => state.selectedCatalogIds.includes(item.id));
});

/** 表单 id 不在列表中 = 正在新建（含点「新建」后尚未保存） */
const isCreatingCatalog = computed(() => {
  const id = String(forms.catalog.id || "").trim();
  if (!id) return true;
  return !state.catalogItems.some((item) => item.id === id);
});

function workflowStep(label, value, hint = "", tone = "neutral") {
  return { label, value: String(value ?? "-"), hint, tone };
}

function countWhere(records, matcher) {
  return (records || []).filter((item) => matcher(item || {})).length;
}

function hasStatus(item, patterns, field = "status") {
  const text = String(item?.[field] || "");
  return patterns.some((pattern) => pattern.test(text));
}

function boolText(value) {
  return value ? "已启用" : "未启用";
}

function buildWorkflowSteps(tab) {
  if (tab === "orders") {
    // 待办工作台：只展示当前队列相关步骤，避免已完成干扰
    if (filters.orderQueue === "todo") {
      if (filters.orderBizType === "dinein") {
        return [
          workflowStep("已付款", countWhere(state.orders, (item) => hasStatus(item, [/^已付款$/])), "堂饮待交付", "warn"),
          workflowStep("制作中", countWhere(state.orders, (item) => hasStatus(item, [/制作中/])), "制作中", "warn"),
          workflowStep("待确认", countWhere(state.orders, (item) => hasStatus(item, [/待确认/])), "免支付待确认", "focus")
        ];
      }
      if (filters.orderBizType === "retail") {
        return [
          workflowStep("待发货", countWhere(state.orders, (item) => hasStatus(item, [/待发货/])), "填单发货", "focus"),
          workflowStep("待自提", countWhere(state.orders, (item) => hasStatus(item, [/待自提/])), "门店核销", "warn")
        ];
      }
      return [
        workflowStep("待支付", countWhere(state.orders, (item) => hasStatus(item, [/待支付/])), "跟进支付", "warn"),
        workflowStep("堂饮待办", countWhere(state.orders, (item) => hasStatus(item, [/已付款|制作中|待确认/])), "店内交付", "warn"),
        workflowStep("商城待办", countWhere(state.orders, (item) => hasStatus(item, [/待发货|待自提/])), "发货/自提", "focus")
      ];
    }
    return [
      workflowStep("已付款", countWhere(state.orders, (item) => hasStatus(item, [/已付款|制作中/])), "堂饮已付（口头交付即可）", "warn"),
      workflowStep("待确认", countWhere(state.orders, (item) => hasStatus(item, [/待确认/])), "历史免支付单（如有）", "warn"),
      workflowStep("待支付", countWhere(state.orders, (item) => hasStatus(item, [/待支付/])), "需跟进支付或取消", "warn"),
      workflowStep("待履约", countWhere(state.orders, (item) => hasStatus(item, [/待发货|待自提/])), "发货/自提动作", "focus"),
      workflowStep("已发货", countWhere(state.orders, (item) => hasStatus(item, [/已发货/])), "等待完成", "good"),
      workflowStep("已完成", countWhere(state.orders, (item) => hasStatus(item, [/已完成/])), "已闭环", "good"),
      workflowStep("售后关联", countWhere(state.orders, (item) => hasStatus(item, [/售后/]) || hasStatus(item, [/申请|审核|退款|拒绝|关闭|处理中/], "afterSaleStatus")), "需核对退款状态", "warn")
    ];
  }
  if (tab === "afterSales") {
    return [
      workflowStep("申请售后", countWhere(state.afterSales, (item) => hasStatus(item, [/申请售后/], "afterSaleStatus")), "用户已提交", "warn"),
      workflowStep("审核中", countWhere(state.afterSales, (item) => hasStatus(item, [/审核中|处理中/], "afterSaleStatus")), "需处理备注", "focus"),
      workflowStep("已退款", countWhere(state.afterSales, (item) => hasStatus(item, [/已退款/], "afterSaleStatus")), "状态闭环", "good"),
      workflowStep("已拒绝", countWhere(state.afterSales, (item) => hasStatus(item, [/已拒绝/], "afterSaleStatus")), "需保留原因", "danger"),
      workflowStep("已关闭", countWhere(state.afterSales, (item) => hasStatus(item, [/已关闭/], "afterSaleStatus")), "不再处理", "neutral")
    ];
  }
  if (tab === "inventory") {
    return [
      workflowStep("下单锁定", countWhere(state.inventoryLogs, (item) => hasStatus(item, [/锁定|lock/i], "type")), "未支付占用", "warn"),
      workflowStep("支付扣减", countWhere(state.inventoryLogs, (item) => hasStatus(item, [/扣减|支付|paid|deduct/i], "type")), "真实出库", "good"),
      workflowStep("取消释放", countWhere(state.inventoryLogs, (item) => hasStatus(item, [/释放|取消|release|cancel/i], "type")), "回补可售", "neutral"),
      workflowStep("人工调整", countWhere(state.inventoryLogs, (item) => hasStatus(item, [/人工|调整|manual|adjust/i], "type")), "需原因审计", "focus")
    ];
  }
  if (tab === "reservations") {
    const s = reservationDayStats.value;
    const day = state.reservationCalendarDate;
    return [
      workflowStep("当日预约", s.total, day, "focus"),
      workflowStep("待支付", s.pendingPay, "限时待付", "warn"),
      workflowStep("已确认", s.confirmed, "等待到店", "good"),
      workflowStep("未到店", s.noshow, "爽约", "warn"),
      workflowStep("已完成", s.completed, "已履约", "good"),
      workflowStep("已取消", s.cancelled, "已释放时段", "neutral")
    ];
  }
  if (tab === "signups") {
    return [
      workflowStep("待确认", countWhere(state.signups, (item) => hasStatus(item, [/待确认/])), "需确认名额", "warn"),
      workflowStep("已确认", countWhere(state.signups, (item) => hasStatus(item, [/已确认/])), "待到场", "good"),
      workflowStep("已到场", countWhere(state.signups, (item) => hasStatus(item, [/已到场/])), "已核销", "good"),
      workflowStep("未到场", countWhere(state.signups, (item) => hasStatus(item, [/未到场/])), "活动复盘", "warn"),
      workflowStep("取消/完成", countWhere(state.signups, (item) => hasStatus(item, [/已取消|已完成/])), "最终状态", "neutral")
    ];
  }
  if (tab === "catalog") {
    return [
      workflowStep("前台可见", countWhere(filteredCatalog.value, (item) => item.visible !== false && item.deleted !== true), "小程序展示", "good"),
      workflowStep("已下架", countWhere(filteredCatalog.value, (item) => item.visible === false || item.deleted === true), "前台隐藏", "neutral"),
      workflowStep("缺图片", countWhere(filteredCatalog.value, (item) => !item.image && !item.thumb), "影响质感", "warn"),
      workflowStep("低库存", countWhere(filteredCatalog.value, (item) => Number(item.stock || 0) > 0 && Number(item.stock || 0) <= 5), "需补货核对", "focus")
    ];
  }
  if (tab === "content") {
    return [
      workflowStep("启用内容", countWhere(state.contentItems, (item) => item.visible !== false), "前台展示", "good"),
      workflowStep("停用内容", countWhere(state.contentItems, (item) => item.visible === false), "前台隐藏", "neutral"),
      workflowStep("轮播", countWhere(state.contentItems, (item) => item.type === "home_carousel"), "首页首屏", "focus"),
      workflowStep("缺图片", countWhere(state.contentItems, (item) => !item.image), "需补素材", "warn")
    ];
  }
  if (tab === "customers") {
    return [
      workflowStep("有消费", countWhere(state.customers, (item) => customerSpend(item) > 0), "可运营", "good"),
      workflowStep("有预约", countWhere(state.customers, (item) => Number(item.reservations || 0) > 0), "茶室关系", "focus"),
      workflowStep("有报名", countWhere(state.customers, (item) => Number(item.signups || 0) > 0), "活动关系", "focus"),
      workflowStep("已匿名", countWhere(state.customers, (item) => item.privacyDeletedAt || item.name === "已匿名"), "隐私处理", "neutral")
    ];
  }
  if (tab === "audit") {
    return [
      workflowStep("日志数", state.auditLogs.length, "当前页", "focus"),
      workflowStep("导出动作", countWhere(state.auditLogs, (item) => hasStatus(item, [/export|导出/i], "action")), "高风险", "warn"),
      workflowStep("删除/停用", countWhere(state.auditLogs, (item) => hasStatus(item, [/delete|删除|停用|下架/i], "action")), "需复核", "danger"),
      workflowStep("配置变更", countWhere(state.auditLogs, (item) => hasStatus(item, [/settings|role|backup|配置|角色|备份/i], "action")), "治理类", "focus")
    ];
  }
  if (tab === "notifications") {
    return [
      workflowStep("发送成功", countWhere(state.notificationLogs, (item) => hasStatus(item, [/sent|success|成功|已发送/i])), "已投递", "good"),
      workflowStep("跳过", countWhere(state.notificationLogs, (item) => hasStatus(item, [/skipped|跳过/i])), "模板或订阅缺失", "warn"),
      workflowStep("失败", countWhere(state.notificationLogs, (item) => hasStatus(item, [/failed|error|失败|错误/i])), "需处理", "danger"),
      workflowStep("测试记录", countWhere(state.notificationLogs, (item) => hasStatus(item, [/test|测试/i], "kind")), "后台发起", "neutral")
    ];
  }
  if (tab === "system") {
    const summary = state.systemStatus?.summary || {};
    return [
      workflowStep("正常", numberText(summary.ok || 0), "检查通过", "good"),
      workflowStep("提醒", numberText(summary.warn || 0), "需补配置", "warn"),
      workflowStep("错误", numberText(summary.error || 0), "影响生产", "danger"),
      workflowStep("包体上限", PACKAGE_INFO.sourceSizeLimit, "预览限制", "focus")
    ];
  }
  if (tab === "roles") {
    return [
      workflowStep("启用角色", countWhere(state.adminRoles, (item) => item.disabled !== true), "可登录授权", "good"),
      workflowStep("停用角色", countWhere(state.adminRoles, (item) => item.disabled === true), "不可用", "neutral"),
      workflowStep("管理员", countWhere(state.adminRoles, (item) => item.roleKey === "admin"), "高风险", "danger"),
      workflowStep("可选预设", state.rolePresets.length, "权限模板", "focus")
    ];
  }
  if (tab === "backups") {
    return [
      workflowStep("成功备份", countWhere(state.backupLogs, (item) => hasStatus(item, [/success|成功/i])), "云存储", "good"),
      workflowStep("失败备份", countWhere(state.backupLogs, (item) => hasStatus(item, [/failed|error|失败|错误/i])), "需处理", "danger"),
      workflowStep("当前上限", numberText(backupForm.limit), "每集合", "focus"),
      workflowStep("下载链接", "临时", "会写审计", "warn")
    ];
  }
  if (tab === "settings") {
    const noticeMissing = [
      state.settings.orderPaidTemplateId,
      state.settings.orderShippedTemplateId,
      state.settings.reservationTemplateId,
      state.settings.eventTemplateId
    ].filter((value) => !String(value || "").trim()).length;
    return [
      workflowStep("微信支付", boolText(state.settings.paymentEnabled), "订单收款", state.settings.paymentEnabled ? "good" : "warn"),
      workflowStep("自提/配送", `${boolText(state.settings.pickupEnabled)} / ${boolText(state.settings.shippingEnabled)}`, "履约方式", "focus"),
      workflowStep("通知模板缺项", noticeMissing, "订阅消息", noticeMissing ? "warn" : "good"),
      workflowStep("积分倍率", state.settings.memberPointRate ?? "-", "会员规则", "neutral")
    ];
  }
  return [];
}

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

/** 门店后台需完整联系方式（自提核销/回访）；不再脱敏手机号 */
function maskPhone(value) {
  return String(value || "").trim();
}

function maskOpenid(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 3)}...`;
}

function maskName(value) {
  // 门店履约：姓名完整展示，便于按姓名对单
  return String(value || "").trim();
}

/** 订单列表联系人摘要：姓名 + 手机（字段兼容 consignee / name） */
function orderContactLabel(order = {}) {
  const name = String(order.consignee || order.name || order.contactName || "").trim();
  const phone = String(order.phone || order.mobile || "").trim();
  if (name && phone) {
    return `${name} · ${phone}`;
  }
  return name || phone || "未留联系人";
}

/** 业务线：优先服务端 enrich 的 bizType / bizLabel，再回退本地推断 */
function orderBizTypeOf(order = {}) {
  const raw = String(order.bizType || order.orderBizType || "").trim().toLowerCase();
  if (raw === "dinein" || raw === "dine-in" || raw === "onsite") return "dinein";
  if (raw === "retail" || raw === "mall" || raw === "shop") return "retail";
  const source = String(order.source || "").trim().toLowerCase();
  if (source === "dinein-tea-menu" || source === "onsite-cart" || source === "cart-confirm") return "dinein";
  if (source === "retail-tea-catalog") return "retail";
  const method = String(order.deliveryMethod || "").trim().toLowerCase();
  if (method === "onsite") return "dinein";
  if (method === "pickup" || method === "shipping") return "retail";
  const items = Array.isArray(order.items) ? order.items : [];
  const hasDrink = items.some((item) => item && item.type === "drink");
  const hasTea = items.some((item) => item && item.type === "tea");
  if (hasDrink && !hasTea) return "dinein";
  if (hasTea && !hasDrink) return "retail";
  return "retail";
}

function orderBizLabel(order = {}) {
  if (order.bizLabel) return String(order.bizLabel);
  return orderBizTypeOf(order) === "dinein" ? "堂饮点单" : "茶叶商城";
}

function orderFulfillmentLabel(order = {}) {
  if (order.fulfillmentLabel) return String(order.fulfillmentLabel);
  const method = String(order.deliveryMethod || "").trim().toLowerCase();
  if (method === "shipping") {
    return order.freightCollect || order.shippingPayMode === "collect" ? "快递到付" : "快递预付";
  }
  if (method === "onsite" || order.payMode === "manual") return "现场点单";
  if (method === "pickup") return "到店自提";
  return "—";
}

function isPhone(value) {
  const text = String(value || "").trim();
  return !text || /^1\d{10}$/.test(text) || /^[\d\s\-+()]{6,24}$/.test(text);
}

function isDiscountRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.01 && number <= 1;
}

function isNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function isSafePagePath(value) {
  const text = String(value || "").trim();
  return !text || (!/[\r\n]/.test(text) && !/^(javascript|data|vbscript):/i.test(text));
}

function isUrlish(value) {
  const text = String(value || "").trim();
  return !text || text.startsWith("cloud://") || text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/assets/");
}

/**
 * 茶叶年份：年份面板（与常见 DatePicker「选年」一致）
 * 范围覆盖陈茶（1950 起）～明年；可清空。
 */
const TEA_YEAR_MIN = 1950;
const TEA_YEAR_MAX = new Date().getFullYear() + 1;
const yearPickerOpen = ref(false);
const yearPickerDecade = ref(Math.floor(new Date().getFullYear() / 10) * 10);

function decadeStartForYear(yearValue) {
  const n = Number(yearValue);
  if (Number.isFinite(n) && n >= TEA_YEAR_MIN && n <= TEA_YEAR_MAX) {
    return Math.floor(n / 10) * 10;
  }
  return Math.floor(new Date().getFullYear() / 10) * 10;
}

const yearPickerCells = computed(() => {
  const start = yearPickerDecade.value;
  // 一屏 12 格：上一年 + 本十年 10 年 + 下一年（边缘可点到邻十年）
  const cells = [];
  for (let i = -1; i <= 10; i += 1) {
    const y = start + i;
    cells.push({
      year: y,
      label: String(y),
      inDecade: i >= 0 && i <= 9,
      disabled: y < TEA_YEAR_MIN || y > TEA_YEAR_MAX
    });
  }
  return cells;
});

const yearPickerRangeLabel = computed(() => {
  const start = yearPickerDecade.value;
  return `${start} – ${start + 9}`;
});

function openYearPicker() {
  yearPickerDecade.value = decadeStartForYear(forms.catalog.year);
  yearPickerOpen.value = true;
}

function closeYearPicker() {
  yearPickerOpen.value = false;
}

function toggleYearPicker() {
  if (yearPickerOpen.value) closeYearPicker();
  else openYearPicker();
}

function shiftYearPickerDecade(delta) {
  const next = yearPickerDecade.value + delta;
  const minDecade = Math.floor(TEA_YEAR_MIN / 10) * 10;
  const maxDecade = Math.floor(TEA_YEAR_MAX / 10) * 10;
  yearPickerDecade.value = Math.min(maxDecade, Math.max(minDecade, next));
}

function selectTeaYear(year) {
  if (year === "" || year === null || year === undefined) {
    forms.catalog.year = "";
    closeYearPicker();
    return;
  }
  const y = Number(year);
  if (!Number.isFinite(y) || y < TEA_YEAR_MIN || y > TEA_YEAR_MAX) return;
  forms.catalog.year = String(y);
  closeYearPicker();
}

function assertText(value, message) {
  if (!String(value || "").trim()) throw new Error(message);
}

function assertNonNegative(value, message) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(message);
}

function openActionDialog(options) {
  if (actionDialogResolve) {
    actionDialogResolve(false);
  }
  const choices = Array.isArray(options.choices) ? options.choices : [];
  Object.assign(actionDialog, {
    open: true,
    mode: options.mode || "confirm",
    title: options.title || "确认操作",
    message: options.message || "",
    expected: String(options.expected || "").trim(),
    input: String(options.defaultInput || ""),
    reason: "",
    choice: choices[0]?.value || options.defaultChoice || "",
    choices,
    amount: options.defaultAmount != null ? String(options.defaultAmount) : "",
    amountLabel: options.amountLabel || "退款金额（元）",
    showAmountWhen: options.showAmountWhen || "partial",
    maxAmount: Number(options.maxAmount) || 0,
    inputLabel: options.inputLabel || "",
    confirmText: options.confirmText || "确认",
    cancelText: options.cancelText || "取消",
    danger: options.danger === true,
    error: ""
  });
  return new Promise((resolve) => {
    actionDialogResolve = resolve;
    window.setTimeout(() => {
      document.querySelector(".action-dialog input, .action-dialog textarea, .action-dialog select")?.focus();
    }, 30);
  });
}

function closeActionDialog(value) {
  const resolve = actionDialogResolve;
  actionDialogResolve = null;
  actionDialog.open = false;
  if (resolve) resolve(value);
}

function submitActionDialog() {
  actionDialog.error = "";
  if (actionDialog.mode === "typed" && actionDialog.expected && actionDialog.input.trim() !== actionDialog.expected) {
    actionDialog.error = "输入内容与确认值不一致";
    return;
  }
  if (actionDialog.mode === "input") {
    const input = actionDialog.input.trim();
    if (!input) {
      actionDialog.error = "请填写名称";
      return;
    }
    closeActionDialog(input);
    return;
  }
  if (actionDialog.mode === "reason") {
    const reason = actionDialog.reason.trim();
    if (!reason) {
      actionDialog.error = "请填写操作原因";
      return;
    }
    closeActionDialog(reason);
    return;
  }
  if (actionDialog.mode === "choice_reason") {
    if (!actionDialog.choice) {
      actionDialog.error = "请选择处理方式";
      return;
    }
    const reason = actionDialog.reason.trim();
    if (!reason) {
      actionDialog.error = "请填写操作原因";
      return;
    }
    let amount = null;
    const needAmount = actionDialog.showAmountWhen && actionDialog.choice === actionDialog.showAmountWhen;
    if (needAmount) {
      amount = Number(actionDialog.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        actionDialog.error = "请填写有效的退款金额";
        return;
      }
      if (actionDialog.maxAmount > 0 && amount > actionDialog.maxAmount + 0.001) {
        actionDialog.error = `退款金额不能超过 ¥${actionDialog.maxAmount}`;
        return;
      }
    }
    closeActionDialog({ choice: actionDialog.choice, reason, amount });
    return;
  }
  closeActionDialog(true);
}

function cancelActionDialog() {
  if (actionDialog.mode === "reason") {
    closeActionDialog("");
    return;
  }
  if (actionDialog.mode === "choice_reason") {
    closeActionDialog(null);
    return;
  }
  closeActionDialog(false);
}

function promptTextValue(title, message, defaultInput = "") {
  return openActionDialog({
    mode: "input",
    title,
    message,
    defaultInput,
    inputLabel: "名称",
    confirmText: "保存",
    cancelText: "取消"
  });
}

function requireTypedConfirm(label, expected) {
  const text = String(expected || "").trim();
  return openActionDialog({
    mode: text ? "typed" : "confirm",
    title: "确认高风险操作",
    message: label,
    expected: text,
    confirmText: text ? "我已输入，继续" : "确认继续",
    danger: true
  });
}

function promptActionReason(label) {
  return openActionDialog({
    mode: "reason",
    title: "填写操作原因",
    message: `${label}。该原因会写入审计日志。`,
    confirmText: "记录并继续",
    danger: true
  });
}

/** 选择项 + 原因（茶室取消退款策略等）；可选 amount 字段 */
function promptChoiceWithReason({ title, message, choices, confirmText, danger = true, showAmountWhen, maxAmount, defaultAmount, amountLabel }) {
  return openActionDialog({
    mode: "choice_reason",
    title: title || "选择处理方式",
    message: message || "",
    choices: choices || [],
    confirmText: confirmText || "确认",
    danger,
    showAmountWhen: showAmountWhen || "",
    maxAmount: maxAmount || 0,
    defaultAmount,
    amountLabel
  });
}

function getReservationCancelAdvanceHours() {
  return Math.max(1, Math.min(168, Number(state.settings?.reservationCancelAdvanceHours) || 12));
}

function reservationPaid(row) {
  if (!row) return false;
  return (
    row.payStatus === "paid" ||
    row.payStatus === "partial_refunded" ||
    row.payStatus === "paid_retained" ||
    Boolean(row.transactionId)
  );
}

function reservationRemainingRefundYuan(row) {
  const total = Number(row?.total != null ? row.total : row?.price) || 0;
  const refunded = Number(row?.refundAmount) || 0;
  return Math.max(0, Math.round((total - refunded) * 100) / 100);
}

function reservationStartMs(row) {
  const day = String(row?.day || "").trim();
  const time = String(row?.time || row?.slot || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NaN;
  }
  return new Date(`${day}T${time.padStart(5, "0")}:00+08:00`).getTime();
}

function reservationInAutoRefundWindow(row) {
  const startMs = reservationStartMs(row);
  if (!Number.isFinite(startMs)) return false;
  return startMs - Date.now() >= getReservationCancelAdvanceHours() * 60 * 60 * 1000;
}

/** 按状态机返回可用后台操作 */
function reservationAdminActions(row) {
  if (!row) return [];
  const status = row.status || "";
  const paid = reservationPaid(row);
  const remaining = reservationRemainingRefundYuan(row);
  const actions = [];
  if (status === "异常待处理" && paid) {
    actions.push({ key: "restore", label: "恢复已确认", status: "已确认", kind: "secondary" });
  }
  if ((status === "已确认" || status === "待确认") && paid) {
    actions.push({ key: "complete", label: "服务完成", status: "已完成", kind: "secondary" });
    actions.push({ key: "noshow", label: "未到店", status: "未到店", kind: "secondary" });
  }
  if (["待支付", "已确认", "待确认", "异常待处理"].includes(status)) {
    actions.push({ key: "cancel", label: "取消预约", status: "已取消", kind: "danger" });
  }
  if (status === "已完成" && paid && remaining > 0 && row.payStatus !== "refunding") {
    actions.push({ key: "aftersale", label: "售后退款", status: "", kind: "danger" });
  }
  return actions;
}

function hasPermission(permission) {
  if (!permission) {
    return true;
  }
  if (!state.adminProfile) {
    return false;
  }
  const permissions = state.adminProfile.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function canAccessTab(tab) {
  return hasPermission(tabPermissions[tab]);
}

function customerDisplayName(customer) {
  return maskName(customer?.name) || maskPhone(customer?.phone) || maskOpenid(customer?.openid || customer?.id) || "访客";
}

function customerLevel(customer) {
  if (customer?.levelName) return customer.levelName;
  if (Array.isArray(customer?.tags) && customer.tags[0]) return customer.tags[0];
  return customer?.tag || "会员";
}

function customerSpend(customer) {
  return Number(customer?.totalSpend ?? customer?.spend ?? 0);
}

function customerLatestAt(customer) {
  return customer?.latestAt || customer?.lastSeenAt || "";
}

function numberText(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function pageMetaFor(key) {
  return state.pagination[key] || createPageState();
}

function pagePayload(key) {
  const page = pageMetaFor(key);
  return {
    page: page.page || 1,
    pageSize: page.pageSize || 20
  };
}

function setPageMeta(key, meta = {}) {
  if (!state.pagination[key]) {
    state.pagination[key] = createPageState();
  }
  Object.assign(state.pagination[key], {
    page: Number(meta.page) || 1,
    pageSize: Number(meta.pageSize) || state.pagination[key].pageSize || 20,
    total: Number(meta.total) || 0,
    pageCount: Math.max(1, Number(meta.pageCount) || 1)
  });
}

function resetPage(key) {
  if (!state.pagination[key]) return;
  state.pagination[key].page = 1;
}

function resetPageAndLoad(key, loader) {
  resetPage(key);
  loader();
}

function pageRangeText(key) {
  const page = pageMetaFor(key);
  if (!page.total) return "0 / 0";
  const start = (page.page - 1) * page.pageSize + 1;
  const end = Math.min(page.total, page.page * page.pageSize);
  return `${numberText(start)}-${numberText(end)} / ${numberText(page.total)}`;
}

function changePage(key, delta, loader) {
  const page = pageMetaFor(key);
  const next = Math.min(Math.max(1, page.page + delta), page.pageCount || 1);
  if (next === page.page) return;
  page.page = next;
  loader();
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
    { label: "今日预约（茶室）", value: summary.todayReservations || 0, meta: "茶室", tone: "green", icon: CalendarCheck, delta: "今日已记录" },
    { label: "今日活动报名", value: summary.todaySignups || 0, meta: "活动", tone: "moss", icon: TicketPercent, delta: "今日新增" },
    { label: "今日订单金额", value: summary.todayOrderAmount || 0, meta: "订单", tone: "gold", icon: BadgeDollarSign, delta: "已支付订单" },
    { label: "今日新增用户", value: summary.newCustomers || 0, meta: "用户", tone: "ink", icon: UserPlus, delta: "今日活跃" },
    { label: "本月营业额", value: summary.monthRevenue || summary.totalRevenue || 0, meta: "经营", tone: "sand", icon: CircleDollarSign, delta: "本月累计" }
  ];
}

function displayName(item) {
  return item?.name || item?.title || item?.orderNo || item?.id || "未命名";
}

/** 列表列文案随资料类型变化（库存 ≠ 名额） */
const catalogTableCols = computed(() => {
  if (isDrinksCollection()) {
    return {
      name: "茶品",
      category: "档位",
      price: "价格",
      meta: "分组/说明",
      stock: "—",
      stockMode: "none"
    };
  }
  if (state.collection === "events") {
    return {
      name: "活动",
      category: "分类",
      price: "价格",
      meta: "时间",
      stock: "报名/名额",
      stockMode: "quota"
    };
  }
  // 默认茶叶
  return {
    name: "茶叶",
    category: "分类",
    price: "价格",
    meta: "规格",
    stock: "库存",
    stockMode: "stock"
  };
});

function displayInventory(item) {
  if (!item) return "-";
  const mode = catalogTableCols.value.stockMode;
  if (mode === "none") return "—";
  if (mode === "quota" || (item.quota !== undefined && state.collection === "events")) {
    const signed = Math.max(0, Number(item.signed) || 0);
    const quota = Math.max(0, Number(item.quota) || 0);
    return `${signed} / ${quota}`;
  }
  if (mode === "stock" || item.stock !== undefined) {
    const stock = Math.max(0, Number(item.stock) || 0);
    const locked = Math.max(0, Number(item.lockedStock) || 0);
    const sold = Math.max(0, Number(item.soldStock) || 0);
    const available = Math.max(0, stock - locked - sold);
    if (locked > 0 || sold > 0) {
      return `可售 ${available}（总 ${stock}）`;
    }
    return String(available);
  }
  return "-";
}

function displayCatalogCategory(item) {
  if (!item) return "-";
  return item.category || "-";
}

function displayCatalogPrice(item) {
  if (!item) return "-";
  if (isDrinksCollection()) {
    // 茶品有独立价则显示独立价；否则显示档位价
    const own = Number(item.price) || 0;
    if (own > 0) return `¥${money(own)}`;
    const tier = managedCategoriesForCollection.value.find(
      (cat) => String(cat.name || "").trim() === String(item.category || "").trim()
    );
    const tierPrice = Number(tier && tier.price) || 0;
    return tierPrice > 0 ? `¥${money(tierPrice)}（档位）` : "-";
  }
  if (item.price !== undefined && item.price !== null && item.price !== "") {
    return `¥${money(item.price)}`;
  }
  return "-";
}

function displayCatalogMeta(item) {
  if (!item) return "-";
  if (isDrinksCollection()) {
    return [item.groupName, item.subtitle].filter(Boolean).join(" · ") || "-";
  }
  if (state.collection === "events") {
    return [item.date, item.time].filter(Boolean).join(" ") || "-";
  }
  if (Array.isArray(item.specs) && item.specs.length) return `${item.specs.length} 个`;
  return item.unit || "-";
}

function catalogComparableValue(field, item = {}) {
  if (["price", "stock", "quota", "signed"].includes(field)) return Number(item[field] || 0);
  if (["visible", "deleted"].includes(field)) return item[field] === true;
  return String(item[field] || "").trim();
}

function hasSensitiveCatalogChange(existing, next) {
  if (!existing) return false;
  const fieldChanged = ["price", "stock", "quota", "signed", "status", "visible", "deleted"].some(
    (field) => catalogComparableValue(field, existing) !== catalogComparableValue(field, next)
  );
  if (fieldChanged) return true;
  const prevSpecs = JSON.stringify(normalizeCatalogSpecs(existing.specs));
  const nextSpecs = JSON.stringify(normalizeCatalogSpecs(next.specs));
  return prevSpecs !== nextSpecs;
}

function toggleCatalogRowSelect(id, checked) {
  const key = String(id || "");
  if (!key) return;
  const set = new Set(state.selectedCatalogIds);
  if (checked) set.add(key);
  else set.delete(key);
  state.selectedCatalogIds = Array.from(set);
}

function toggleSelectAllFilteredCatalog(checked) {
  if (!checked) {
    state.selectedCatalogIds = [];
    return;
  }
  state.selectedCatalogIds = filteredCatalog.value.map((item) => item.id).filter(Boolean);
}

function clearCatalogSelection() {
  state.selectedCatalogIds = [];
}

async function batchCatalogShelf(action) {
  // action: off | on
  if (!hasPermission("catalog.write")) {
    showToast("当前角色无权修改商品");
    return;
  }
  const ids = state.selectedCatalogIds.slice();
  if (!ids.length) {
    showToast("请先勾选商品");
    return;
  }
  const restore = action === "on";
  const label = restore ? "批量恢复上架" : "批量下架";
  if (!restore && !(await requireTypedConfirm(`确认下架选中的 ${ids.length} 件资料？`, String(ids.length)))) return;
  const reason = await promptActionReason(`${label} ${ids.length} 件`);
  if (!reason) return;
  await withLoading(label, async () => {
    for (const id of ids) {
      const item = state.catalogItems.find((row) => row.id === id);
      if (!item || isCatalogRemoved(item)) continue;
      const isOff = isCatalogOffShelf(item);
      if (restore && !isOff) continue;
      if (!restore && isOff) continue;
      await callFunction("manageCatalog", {
        action: restore ? "restore" : "delete",
        collection: state.collection,
        id,
        reason
      });
    }
    clearCatalogSelection();
    showToast(restore ? "已批量恢复" : "已批量下架");
    invalidateCatalogCache(state.collection);
    await loadCatalog({ force: true });
  });
}

/** 后台预览：cloud:// 转公有 CDN；本地 /assets 走相对路径 */
function displayImage(src) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/assets/")) return `..${raw}`;
  if (raw.startsWith("cloud://")) {
    // cloud://envId.bucket/path -> https://bucket.tcb.qcloud.la/path
    const slash = raw.indexOf("/", "cloud://".length);
    if (slash > 0) {
      const filePath = raw.slice(slash + 1);
      return `https://636c-cloudbase-d2gq023qn50e9d82f-1458290161.tcb.qcloud.la/${filePath}`;
    }
  }
  return raw;
}

function formatDate(value) {
  if (!value) return "未记录";
  const raw = value?.$date || (value?.seconds ? value.seconds * 1000 : value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFreshness(value) {
  if (!value) return "等待首次同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "同步时间未知";
  const diff = Date.now() - date.getTime();
  if (diff < 15000) return "刚刚同步";
  if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  return formatDate(value);
}

function statusTone(value) {
  const text = String(value || "");
  if (/失败|拒绝|取消|关闭|停用|下架|错误|异常|failed|error/i.test(text)) return "danger";
  if (/待|申请|审核|处理中|未到场|提醒|跳过|pending|skipped|warn/i.test(text)) return "warn";
  if (/已支付|已发货|已完成|已确认|已退款|已到场|已使用|成功|启用|上架|success|sent|ok/i.test(text)) return "good";
  return "neutral";
}

function backupTruncatedCollections(log = {}) {
  if (Array.isArray(log.truncatedCollections)) {
    return log.truncatedCollections.filter(Boolean);
  }
  const truncated = log.truncated || {};
  return Object.keys(truncated).filter((collection) => truncated[collection]);
}

function backupCompleteness(log = {}) {
  if (log.status && log.status !== "success") {
    return {
      tone: statusTone(log.status),
      label: "未完成",
      hint: log.error || "备份未生成可核对文件"
    };
  }
  const names = backupTruncatedCollections(log);
  return {
    tone: names.length ? "warn" : "good",
    label: names.length ? "可能截断" : "完整",
    hint: names.length ? `超出上限：${names.join("、")}` : `上限 ${numberText(log.limit || backupForm.limit || 500)} / 集合`
  };
}

function backupFileHint(log = {}) {
  if (log.checksum) return `sha256 ${String(log.checksum).slice(0, 12)}`;
  return log.error || log.fileId || "";
}

function addTimeline(items, time, title, detail, tone = "") {
  if (!time) return;
  items.push({ time, title, detail, tone });
}

function orderTimeline(order) {
  if (!order) return [];
  const items = [];
  addTimeline(items, order.createdAt, "订单创建", order.orderNo || order._id, "neutral");
  addTimeline(items, order.paidAt || order.payAt || order.paymentAt, "支付确认", order.payStatus || "paid", "good");
  addTimeline(items, order.shippedAt, "已发货", [order.trackingCompany, order.trackingNo].filter(Boolean).join(" · ") || "后台标记发货", "good");
  addTimeline(items, order.completedAt, "履约完成", order.fulfillmentStatus || order.status, "good");
  addTimeline(items, order.afterSaleUpdatedAt, "售后更新", `${order.afterSaleStatus || ""}${order.refundAmount ? ` · ¥${money(order.refundAmount)}` : ""}`, "warn");
  addTimeline(items, order.updatedAt, "最近更新", order.status || "状态已更新", "neutral");
  return items.sort((a, b) => new Date(a.time?.$date || a.time?.seconds * 1000 || a.time || 0) - new Date(b.time?.$date || b.time?.seconds * 1000 || b.time || 0));
}

function recordTimeline(record) {
  if (!record) return [];
  const items = [];
  addTimeline(items, record.createdAt, "记录创建", record.status || "已提交", "neutral");
  addTimeline(items, record.updatedAt, "状态更新", record.status || "已更新", "good");
  addTimeline(items, record.privacyDeletedAt, "隐私删除", "个人信息已匿名化", "warn");
  return items.sort((a, b) => new Date(a.time?.$date || a.time?.seconds * 1000 || a.time || 0) - new Date(b.time?.$date || b.time?.seconds * 1000 || b.time || 0));
}

function customerActivityTone(activity) {
  const status = String(activity?.status || "");
  if (/待|申请|审核|异常|拒绝|取消/.test(status)) return "warn";
  if (/已支付|已发货|已完成|已确认|已到场|已使用/.test(status)) return "good";
  return "neutral";
}

function customerTimeline(customer) {
  const typeLabel = { order: "订单", reservation: "预约", signup: "报名" };
  return (customer?.recentActivity || []).map((activity) => {
    const amount = activity.amount ? `¥${money(activity.amount)}` : "";
    const detail = [activity.status, activity.meta, amount].filter(Boolean).join(" · ");
    return {
      time: activity.time,
      title: `${typeLabel[activity.type] || "互动"} · ${activity.title || "记录"}`,
      detail: detail || "已记录",
      tone: customerActivityTone(activity)
    };
  });
}

function customerSignal(customer) {
  if (!customer) {
    return { title: "暂无用户", detail: "选择用户后显示最近互动和运营判断。" };
  }
  const activity = customer.recentActivity || [];
  const pending = activity.find((item) => /待支付|已付款|制作中|待发货|待自提|待确认|申请售后|审核中/.test(String(item.status || "")));
  if (pending) {
    return { title: "需要跟进", detail: `${pending.title || "最近互动"} 处于「${pending.status}」状态。` };
  }
  if (customerSpend(customer) >= 3000) {
    return { title: "高价值用户", detail: "累计消费较高，可优先安排专属茶席、活动邀约或会员关怀。" };
  }
  if (Number(customer.reservations || 0) > 0 && Number(customer.signups || 0) > 0) {
    return { title: "深度体验用户", detail: "同时参与茶室预约和活动报名，适合持续运营和复访提醒。" };
  }
  if (!activity.length) {
    return { title: "资料待补全", detail: "暂无订单、预约或报名记录，后续互动会自动进入时间线。" };
  }
  return { title: "普通活跃用户", detail: "最近互动正常，可按消费、预约和报名记录继续服务。" };
}

function auditText(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function auditChangeEntries(log) {
  const changes = log?.detail?.changes || {};
  return Object.keys(changes).map((field) => ({
    field,
    before: auditText(changes[field]?.before),
    after: auditText(changes[field]?.after)
  }));
}

function auditSummary(log) {
  const detail = log?.detail || {};
  const subject = [
    detail.orderNo,
    detail.collection && detail.id ? `${detail.collection}/${detail.id}` : "",
    detail.key,
    detail.subject,
    detail.cloudPath,
    detail.title || detail.name
  ].filter(Boolean)[0];
  const changes = auditChangeEntries(log).length;
  const pieces = [];
  if (subject) pieces.push(subject);
  if (detail.status || detail.afterSaleStatus) pieces.push(detail.status || detail.afterSaleStatus);
  if (changes) pieces.push(`${changes} 项变更`);
  return pieces.join(" · ") || "已记录操作详情";
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
    const folder = target === "catalog"
      ? state.collection
      : target === "category"
        ? "product_categories"
        : target === "room"
          ? "rooms"
          : "content";
    const result = await cloudApp.uploadFile({
      cloudPath: `admin/${folder}/${Date.now()}-${sanitizeFileName(file.name)}`,
      filePath: file
    });
    const fileId = result.fileID || result.fileId || "";
    if (!fileId) throw new Error("上传成功但未返回文件 ID");
    if (target === "catalog") {
      forms.catalog.image = fileId;
      if (!String(forms.catalog.thumb || "").trim()) {
        forms.catalog.thumb = fileId;
      }
    }
    if (target === "content") forms.content.image = fileId;
    if (target === "category") categoryForm.image = fileId;
    if (target === "room") {
      state.roomForm.image = fileId;
      if (!String(state.roomForm.thumb || "").trim()) {
        state.roomForm.thumb = fileId;
      }
    }
    uploadState[target] = `已上传：${file.name}`;
    showToast("图片已上传到云存储");
  } catch (error) {
    uploadState[target] = error.message || "图片上传失败";
    showToast(uploadState[target]);
  } finally {
    if (event?.target) event.target.value = "";
  }
}

const catalogImageInput = ref(null);
const catalogImageDragOver = ref(false);
const catalogImagePreview = computed(() => displayImage(forms.catalog.image));

function triggerCatalogImagePick() {
  catalogImageInput.value?.click();
}

function onCatalogImageDrop(event) {
  catalogImageDragOver.value = false;
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file || !String(file.type || "").startsWith("image/")) {
    showToast("请拖入图片文件");
    return;
  }
  uploadFormImage("catalog", { target: { files: [file], value: "" } });
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
    setCurrentUser(normalizeSessionUser(result?.data?.user || result?.user || result, username));
    await enterDashboard();
  } catch (error) {
    state.loginError = error.message || "登录失败";
  } finally {
    state.loading = "";
  }
}

/** Normalize CloudBase Auth user shapes (v1 flat vs v2 session user_metadata). */
function normalizeSessionUser(user, fallbackUsername = "") {
  if (!user || typeof user !== "object") {
    return fallbackUsername ? { username: fallbackUsername } : null;
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return {
    ...user,
    uid: user.uid || user.id || meta.uid || "",
    username: user.username || user.name || meta.username || fallbackUsername || "",
    email: user.email || meta.email || "",
    nickName: user.nickName || user.nickname || meta.nickName || meta.name || ""
  };
}

async function getSessionUser() {
  if (!cloudAuth) return null;
  if (cloudAuth.getSession) {
    const result = await cloudAuth.getSession();
    return normalizeSessionUser(result?.data?.session?.user || null);
  }
  if (cloudAuth.getLoginState) {
    const result = await cloudAuth.getLoginState();
    return normalizeSessionUser(result?.user || null);
  }
  return null;
}

function refreshBroadcastVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  broadcastVoices = window.speechSynthesis.getVoices() || [];
}

function preferredBroadcastVoice() {
  return broadcastVoices.find((voice) => /^zh[-_]?CN$/i.test(voice.lang || ""))
    || broadcastVoices.find((voice) => /^zh/i.test(voice.lang || ""))
    || broadcastVoices.find((voice) => /mandarin|chinese|普通话|中文/i.test(voice.name || ""))
    || null;
}

function prepareBroadcastAudio() {
  if (typeof window === "undefined") return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!broadcastAudioContext && AudioContextClass) {
    try {
      broadcastAudioContext = new AudioContextClass();
    } catch (error) {
      broadcastAudioContext = null;
    }
  }
  if (broadcastAudioContext?.state === "suspended") {
    broadcastAudioContext.resume().catch(() => {});
  }
  if (window.speechSynthesis?.paused) {
    window.speechSynthesis.resume();
  }
  refreshBroadcastVoices();
  return Boolean(broadcastAudioContext || orderBroadcast.speechSupported);
}

function playBroadcastChime() {
  const context = broadcastAudioContext;
  if (!context || context.state === "closed") return false;
  try {
    const startAt = context.currentTime + 0.01;
    [
      { frequency: 783.99, delay: 0 },
      { frequency: 1046.5, delay: 0.16 }
    ].forEach(({ frequency, delay }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteAt = startAt + delay;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteAt);
      gain.gain.setValueAtTime(0.0001, noteAt);
      gain.gain.exponentialRampToValueAtTime(0.16, noteAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteAt + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteAt);
      oscillator.stop(noteAt + 0.26);
    });
    return true;
  } catch (error) {
    return false;
  }
}

function syncBroadcastQueueCount() {
  orderBroadcast.queueCount = speechQueue.length + (speechActive ? 1 : 0);
}

function processBroadcastSpeechQueue() {
  if (speechActive || speechQueue.length === 0 || typeof window === "undefined") return;
  const item = speechQueue.shift();
  if (item.kind === "order" && !orderBroadcast.enabled) {
    syncBroadcastQueueCount();
    processBroadcastSpeechQueue();
    return;
  }

  speechActive = true;
  syncBroadcastQueueCount();
  const runId = speechRunId;
  let settled = false;
  const finish = (errorMessage = "") => {
    if (settled || runId !== speechRunId) return;
    settled = true;
    if (speechTimer) {
      window.clearTimeout(speechTimer);
      speechTimer = null;
    }
    speechActive = false;
    if (errorMessage) {
      orderBroadcast.audioMessage = errorMessage;
    }
    syncBroadcastQueueCount();
    window.setTimeout(processBroadcastSpeechQueue, 120);
  };

  playBroadcastChime();
  if (!orderBroadcast.speechSupported) {
    speechTimer = window.setTimeout(() => finish(), 700);
    return;
  }

  const utterance = new window.SpeechSynthesisUtterance(item.text);
  const voice = preferredBroadcastVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "zh-CN";
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onend = () => finish();
  utterance.onerror = (event) => {
    const code = event?.error || "unknown";
    if (code === "canceled" || code === "interrupted") {
      finish();
      return;
    }
    finish(`语音播放失败（${code}），请保持媒体音量开启后重新测试。`);
  };
  speechTimer = window.setTimeout(() => {
    window.speechSynthesis.cancel();
    finish("语音播放等待超时，请重新点击测试声音。");
  }, 15000);
  window.speechSynthesis.speak(utterance);
}

function enqueueBroadcastSpeech(text, kind = "order") {
  speechQueue.push({ text, kind });
  syncBroadcastQueueCount();
  processBroadcastSpeechQueue();
}

function orderAlertKey(alert = {}) {
  return `${alert.kind || "order"}:${alert.id || alert.orderNo || "order"}:${alert.eventAt || alert.paidAt || "paid"}`;
}

function rememberOrderAlert(alert) {
  const key = orderAlertKey(alert);
  seenOrderAlertKeys.add(key);
  while (seenOrderAlertKeys.size > ORDER_ALERT_SEEN_LIMIT) {
    const oldestKey = seenOrderAlertKeys.values().next().value;
    seenOrderAlertKeys.delete(oldestKey);
  }
}

/** 店内短语音：尽量简短，TTS 更稳、更好懂 */
function orderAlertSpeech(alert = {}) {
  const tableNo = String(alert.tableNo || "").trim();
  if (alert.kind === "recharge") {
    return "会员充值";
  }
  if (alert.kind === "order_paid") {
    return tableNo ? `订单已支付，桌号${tableNo}` : "订单已支付";
  }
  return tableNo ? `新订单，桌号${tableNo}` : "新订单";
}

async function pollPaidOrderAlerts({ baseline = false } = {}) {
  if (orderBroadcast.polling || (!baseline && !orderBroadcast.enabled)) return;
  const sessionId = broadcastSessionId;
  orderBroadcast.polling = true;
  try {
    let result;
    try {
      result = await callFunction("manageOperations", { action: "listStoreVoiceAlerts" });
    } catch (error) {
      result = await callFunction("manageOperations", { action: "listPaidOrderAlerts" });
    }
    if (sessionId !== broadcastSessionId) return;
    const alerts = (Array.isArray(result.alerts) ? result.alerts : [])
      .filter((alert) => alert && (alert.eventAt || alert.paidAt))
      .map((alert) => Object.assign({}, alert, {
        kind: alert.kind || "order_paid",
        eventAt: alert.eventAt || alert.paidAt
      }))
      .sort((left, right) => new Date(left.eventAt).getTime() - new Date(right.eventAt).getTime());

    if (baseline) {
      seenOrderAlertKeys.clear();
      alerts.forEach(rememberOrderAlert);
    } else {
      alerts.filter((alert) => !seenOrderAlertKeys.has(orderAlertKey(alert))).forEach((alert) => {
        rememberOrderAlert(alert);
        orderBroadcast.lastAlertAt = alert.eventAt || alert.paidAt;
        orderBroadcast.lastOrderNo = alert.orderNo || alert.id || "新订单";
        enqueueBroadcastSpeech(orderAlertSpeech(alert), "order");
      });
    }

    orderBroadcast.lastCheckedAt = result.serverTime || new Date().toISOString();
    orderBroadcast.error = "";
  } catch (error) {
    if (sessionId === broadcastSessionId) {
      orderBroadcast.error = error.message || "新订单检查失败";
    }
    throw error;
  } finally {
    if (sessionId === broadcastSessionId) orderBroadcast.polling = false;
  }
}

function clearOrderBroadcastTimer() {
  if (!orderBroadcastTimer || typeof window === "undefined") return;
  window.clearTimeout(orderBroadcastTimer);
  orderBroadcastTimer = null;
}

function scheduleOrderBroadcastPoll() {
  clearOrderBroadcastTimer();
  if (!orderBroadcast.enabled || !orderBroadcast.visible || typeof window === "undefined") return;
  orderBroadcastTimer = window.setTimeout(async () => {
    try {
      await pollPaidOrderAlerts();
    } catch (error) {
      // The next scheduled check retries automatically and the status bar shows this error.
    } finally {
      scheduleOrderBroadcastPoll();
    }
  }, ORDER_ALERT_POLL_MS);
}

async function acquireOrderBroadcastWakeLock() {
  orderBroadcast.wakeMessage = "";
  if (!orderBroadcast.wakeLockSupported) {
    orderBroadcast.wakeMessage = "当前浏览器不支持自动常亮，请在系统设置中关闭自动锁屏并保持本页在前台。";
    return;
  }
  if (!orderBroadcast.enabled || !orderBroadcast.visible || wakeLockSentinel) return;
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel = sentinel;
    orderBroadcast.wakeLockActive = true;
    sentinel.addEventListener("release", () => {
      if (wakeLockSentinel === sentinel) wakeLockSentinel = null;
      orderBroadcast.wakeLockActive = false;
    });
  } catch (error) {
    orderBroadcast.wakeLockActive = false;
    orderBroadcast.wakeMessage = `无法自动常亮：${error.message || "请检查浏览器与系统设置"}。`;
  }
}

async function releaseOrderBroadcastWakeLock() {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  orderBroadcast.wakeLockActive = false;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch (error) {
    // A lock may already have been released automatically when the page was hidden.
  }
}

async function startOrderBroadcast() {
  if (orderBroadcast.enabled || orderBroadcast.starting) return;
  if (!hasPermission("order.read")) {
    showToast("当前角色无权读取订单提醒");
    return;
  }
  orderBroadcast.starting = true;
  orderBroadcast.error = "";
  orderBroadcast.audioMessage = "";
  orderBroadcast.wakeMessage = "";
  const sessionId = ++broadcastSessionId;

  if (!prepareBroadcastAudio()) {
    orderBroadcast.starting = false;
    orderBroadcast.audioMessage = "当前浏览器不支持网页声音播放，请改用新版 Chrome。";
    showToast(orderBroadcast.audioMessage);
    return;
  }
  playBroadcastChime();

  try {
    await pollPaidOrderAlerts({ baseline: true });
    if (sessionId !== broadcastSessionId) return;
    orderBroadcast.enabled = true;
    orderBroadcast.starting = false;
    await acquireOrderBroadcastWakeLock();
    enqueueBroadcastSpeech("播报已开启", "test");
    scheduleOrderBroadcastPoll();
    showToast("店内播报已开启：新订单 / 已支付 / 充值");
  } catch (error) {
    if (sessionId !== broadcastSessionId) return;
    orderBroadcast.enabled = false;
    orderBroadcast.starting = false;
    showToast(`播报开启失败：${error.message || "无法读取订单"}`);
  }
}

async function stopOrderBroadcast({ silent = false } = {}) {
  const wasActive = orderBroadcast.enabled || orderBroadcast.starting;
  broadcastSessionId += 1;
  orderBroadcast.enabled = false;
  orderBroadcast.starting = false;
  orderBroadcast.polling = false;
  orderBroadcast.error = "";
  orderBroadcast.audioMessage = "";
  orderBroadcast.wakeMessage = "";
  clearOrderBroadcastTimer();
  speechRunId += 1;
  speechQueue = [];
  speechActive = false;
  if (speechTimer && typeof window !== "undefined") {
    window.clearTimeout(speechTimer);
    speechTimer = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  syncBroadcastQueueCount();
  await releaseOrderBroadcastWakeLock();
  if (wasActive && !silent) showToast("店内播报已停止");
}

async function toggleOrderBroadcast() {
  if (orderBroadcast.enabled || orderBroadcast.starting) {
    await stopOrderBroadcast();
    return;
  }
  await startOrderBroadcast();
}

function testOrderBroadcastSound() {
  orderBroadcast.audioMessage = "";
  if (!prepareBroadcastAudio()) {
    orderBroadcast.audioMessage = "当前浏览器不支持网页声音播放，请改用新版 Chrome。";
    showToast(orderBroadcast.audioMessage);
    return;
  }
  enqueueBroadcastSpeech("新订单", "test");
  window.setTimeout(() => {
    if (orderBroadcast.enabled || true) {
      enqueueBroadcastSpeech("订单已支付", "test");
    }
  }, 900);
  window.setTimeout(() => {
    enqueueBroadcastSpeech("会员充值", "test");
  }, 1800);
  showToast(orderBroadcast.speechSupported ? "已播放：新订单 / 已支付 / 充值" : "浏览器无语音合成，已播放提示音");
}

async function handleOrderBroadcastVisibilityChange() {
  orderBroadcast.visible = !document.hidden;
  clearOrderBroadcastTimer();
  if (!orderBroadcast.enabled || !orderBroadcast.visible) return;
  await acquireOrderBroadcastWakeLock();
  try {
    await pollPaidOrderAlerts();
  } catch (error) {
    // The status bar exposes the error and the normal retry loop continues.
  }
  scheduleOrderBroadcastPoll();
}

function setupOrderBroadcastRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  orderBroadcast.visible = !document.hidden;
  orderBroadcast.wakeLockSupported = "wakeLock" in navigator;
  orderBroadcast.speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  refreshBroadcastVoices();
  const synthesis = window.speechSynthesis;
  if (synthesis?.addEventListener) synthesis.addEventListener("voiceschanged", refreshBroadcastVoices);
  document.addEventListener("visibilitychange", handleOrderBroadcastVisibilityChange);
  cleanupOrderBroadcastRuntime = () => {
    if (synthesis?.removeEventListener) synthesis.removeEventListener("voiceschanged", refreshBroadcastVoices);
    document.removeEventListener("visibilitychange", handleOrderBroadcastVisibilityChange);
  };
}

async function logout() {
  await stopOrderBroadcast({ silent: true });
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
  await loadAdminProfile();
  if (accessBlocked.value) {
    state.summary = [];
    state.moduleError = "";
    return;
  }
  if (!canAccessTab(state.activeTab)) {
    const firstGroup = visibleNavGroups.value[0];
    state.activeTab = firstGroup?.items?.[0]?.key || "dashboard";
  }
  await loadActiveTab();
  if (state.activeTab !== "dashboard") await refreshSummary();
}

function closeNav() {
  state.navOpen = false;
}

function toggleNav() {
  state.navOpen = !state.navOpen;
}

async function switchTab(tab) {
  if (!canAccessTab(tab)) {
    showToast("当前角色无权访问该模块");
    return;
  }
  state.activeTab = tab;
  closeNav();
  // 离开商品管理时清空列表态，避免切回瞬间残留旧集合数据
  if (tab !== "catalog") {
    state.catalogItems = [];
    state.selectedCatalogId = "";
    state.selectedCatalogIds = [];
  }
  await loadActiveTab();
}

async function refreshSummary() {
  try {
    const result = await callFunction("manageOperations", { action: "getSummary" });
    const s = result.summary || {};
    state.summary = [
      { label: "待确认订单", value: s.pendingConfirm || 0, meta: "订单", tone: "sand", icon: ClipboardList, delta: "免支付待确认" },
      { label: "待支付", value: s.pendingPay || 0, meta: "订单", tone: "sand", icon: CircleDollarSign, delta: "当前待处理" },
      { label: "待发货", value: s.toShip || 0, meta: "履约", tone: "green", icon: Package, delta: "待进入履约" },
      { label: "待自提", value: s.toPickup || 0, meta: "门店", tone: "moss", icon: CalendarDays, delta: "待门店核销" },
      { label: "待支付预约", value: s.pendingReservations || 0, meta: "茶室", tone: "ink", icon: CalendarCheck, delta: "限时待付" },
      { label: "待处理报名", value: s.pendingSignups || 0, meta: "活动", tone: "gold", icon: UserPlus, delta: "需要跟进" }
    ];
  } catch (error) {
    state.summary = [];
  }
}

async function loadActiveTab(forceRefresh = false) {
  const map = {
    dashboard: loadDashboard,
    catalog: async () => {
      await loadCatalog({ force: forceRefresh });
    },
    orders: loadOrders,
    afterSales: loadAfterSales,
    inventory: loadInventoryLogs,
    reservations: loadReservations,
    signups: loadSignups,
    customers: loadCustomers,
    content: loadContent,
    analytics: loadAnalytics,
    audit: loadAuditLogs,
    notifications: loadNotificationLogs,
    system: loadSystemStatus,
    roles: loadAdminRoles,
    backups: loadBackupLogs,
    settings: loadSettings
  };
  return map[state.activeTab]?.();
}

async function withLoading(label, task) {
  const tab = state.activeTab;
  state.loading = label;
  state.loadingTab = tab;
  state.moduleError = "";
  try {
    await task();
    state.lastLoadedAt[tab] = new Date().toISOString();
  } catch (error) {
    const message = error.message || `${label}失败`;
    state.moduleError = message;
    showToast(message);
  } finally {
    // 仅当仍是当前 tab 才清 loading，避免快速切换时旧请求误关新页面的遮罩
    if (state.loadingTab === tab) {
      state.loading = "";
      state.loadingTab = "";
    }
  }
}

async function loadAdminProfile() {
  try {
    state.adminProfileError = "";
    const result = await callFunction("manageOperations", { action: "getAdminProfile" });
    state.adminProfile = result.admin || null;
  } catch (error) {
    state.adminProfile = null;
    state.adminProfileError = error.message || "权限资料加载失败";
  }
}

async function loadDashboard() {
  await withLoading("读取首页", async () => {
    const result = await callFunction("manageOperations", { action: "getDashboard" });
    state.dashboard = result.dashboard || {};
    state.summary = buildDashboardSummaryCards(state.dashboard.summary || {});
  });
}

async function loadProductCategories() {
  try {
    const result = await callFunction("manageCatalog", {
      action: "list",
      collection: "product_categories",
      includeHidden: true
    });
    state.productCategories = result.items || [];
  } catch (error) {
    // 类别加载失败不阻断商品列表；下拉回退到预设
    state.productCategories = state.productCategories || [];
  }
}

function openCategoryManager() {
  if (state.collection !== "tea_products" && state.collection !== "drinks") return;
  resetCategoryForm();
  state.categoryManagerOpen = true;
}

function closeCategoryManager() {
  state.categoryManagerOpen = false;
}

function editManagedCategory(item) {
  if (!item) return;
  categoryForm.id = item.id;
  categoryForm.name = item.name || "";
  categoryForm.sort = Number(item.sort) || 10;
  categoryForm.channel = item.channel || state.collection;
  categoryForm.visible = item.visible !== false;
  categoryForm.price = Math.max(0, Number(item.price) || 0);
  categoryForm.unit = item.unit || item.badge || (state.collection === "drinks" ? "道" : "");
  categoryForm.badge = item.badge || categoryForm.unit;
  categoryForm.serviceType = item.serviceType || (categoryForm.unit === "壶" ? "pot" : "tasting");
  categoryForm.tagline = item.tagline || "";
  categoryForm.brewStyle = item.brewStyle || "热泡茶";
  categoryForm.color = item.color || "";
  categoryForm.image = item.image || "";
}

function resetCategoryForm() {
  const isDrink = state.collection === "drinks";
  categoryForm.id = "";
  categoryForm.name = "";
  categoryForm.sort = 10 + managedCategoriesForCollection.value.length * 10;
  categoryForm.channel = isDrink ? "drinks" : "tea_products";
  categoryForm.visible = true;
  categoryForm.price = isDrink ? 58 : 0;
  categoryForm.unit = isDrink ? "道" : "";
  categoryForm.badge = isDrink ? "道" : "";
  categoryForm.serviceType = "tasting";
  categoryForm.tagline = "";
  categoryForm.brewStyle = "热泡茶";
  categoryForm.color = "";
  categoryForm.image = "";
  uploadState.category = "";
}

async function saveManagedCategory() {
  const name = String(categoryForm.name || "").trim();
  if (!name) {
    showToast(state.collection === "drinks" ? "请填写档位名称（如：初见）" : "请填写类别名称");
    return;
  }
  const channel = state.collection === "drinks" ? "drinks" : "tea_products";
  if (channel === "drinks" && Number(categoryForm.price) < 0) {
    showToast("档位价格不能为负数");
    return;
  }
  const id = String(categoryForm.id || "").trim()
    || (channel === "drinks" ? `drink-${Date.now()}` : `cat-tea-${Date.now()}`);
  const payload = {
    id,
    name,
    channel,
    sort: Math.max(0, Number(categoryForm.sort) || 0),
    visible: categoryForm.visible !== false
  };
  if (channel === "drinks") {
    const unit = String(categoryForm.unit || "道").trim() || "道";
    payload.price = Math.max(0, Number(categoryForm.price) || 0);
    payload.unit = unit;
    payload.badge = String(categoryForm.badge || unit).trim() || unit;
    payload.serviceType = categoryForm.serviceType || (unit === "壶" ? "pot" : "tasting");
    payload.tagline = String(categoryForm.tagline || "").trim();
    payload.brewStyle = String(categoryForm.brewStyle || "热泡茶").trim() || "热泡茶";
    payload.color = String(categoryForm.color || "").trim();
    if (categoryForm.image) payload.image = String(categoryForm.image).trim();
  }
  await withLoading(channel === "drinks" ? "保存档位" : "保存类别", async () => {
    const existing = (state.productCategories || []).find((item) => item.id === id);
    await callFunction("manageCatalog", {
      action: existing ? "update" : "create",
      collection: "product_categories",
      id,
      data: payload
    });
    await loadProductCategories();
    resetCategoryForm();
    showToast(channel === "drinks" ? "档位已保存" : "类别已保存");
  });
}

async function toggleManagedCategory(item) {
  if (!item || !item.id) return;
  const nextVisible = item.visible === false;
  await withLoading(nextVisible ? "启用类别" : "停用类别", async () => {
    await callFunction("manageCatalog", {
      action: "update",
      collection: "product_categories",
      id: item.id,
      data: { visible: nextVisible }
    });
    await loadProductCategories();
  });
}

async function removeManagedCategory(item) {
  if (!item || !item.id) return;
  const used = (state.catalogItems || []).some(
    (row) => String(row.category || "").trim() === String(item.name || "").trim()
  );
  if (used) {
    showToast(`「${item.name}」下仍有商品，请先改商品类别后再删除`);
    return;
  }
  const reason = window.prompt("删除类别需填写原因（可恢复列表不再展示）", "清理未使用类别");
  if (reason === null) return;
  if (!String(reason || "").trim()) {
    showToast("删除类别需填写操作原因");
    return;
  }
  await withLoading("删除类别", async () => {
    // 先下架再软删除，与商品删除流程一致
    if (item.visible !== false) {
      await callFunction("manageCatalog", {
        action: "delete",
        collection: "product_categories",
        id: item.id,
        reason: String(reason).trim()
      });
    }
    await callFunction("manageCatalog", {
      action: "remove",
      collection: "product_categories",
      id: item.id,
      reason: String(reason).trim()
    });
    await loadProductCategories();
  });
}

/** 商品保存时：若类别尚不在配置表，自动登记（茶叶）；堂饮须先建档位 */
async function ensureProductCategory(name, channel) {
  const catName = String(name || "").trim();
  if (!catName || (channel !== "tea_products" && channel !== "drinks")) return;
  const exists = (state.productCategories || []).some(
    (item) => item.channel === channel
      && item.removed !== true
      && String(item.name || "").trim() === catName
  );
  if (exists) return;
  // 堂饮分类=档位，含价格；禁止用茶名误建空档位
  if (channel === "drinks") {
    throw new Error("请先在「配置档位」中创建档位（初见/知味…），再添加茶品");
  }
  const id = `cat-tea-${Date.now()}`;
  const maxSort = managedCategoriesForCollection.value.reduce(
    (max, item) => Math.max(max, Number(item.sort) || 0),
    0
  );
  await callFunction("manageCatalog", {
    action: "create",
    collection: "product_categories",
    data: {
      id,
      name: catName,
      channel,
      sort: maxSort + 10,
      visible: true
    }
  });
  await loadProductCategories();
}

/** 堂饮：选中类别名时同步 categoryId（档位 id） */
function syncDrinkCategoryIdFromName() {
  if (!isDrinksCollection()) return;
  const name = String(forms.catalog.category || "").trim();
  const tier = managedCategoriesForCollection.value.find(
    (item) => String(item.name || "").trim() === name
  );
  forms.catalog.categoryId = tier ? tier.id : "";
}

/** 商品列表内存缓存：避免切换 tab/集合时每次都白等云函数 */
const CATALOG_CACHE_TTL = 30 * 1000;
const catalogCache = {};

/** 写操作后失效缓存，保证下次读取拿到新数据 */
function invalidateCatalogCache(collection) {
  const key = collection || state.collection;
  if (key) delete catalogCache[key];
}

async function loadCatalog(options = {}) {
  const collection = state.collection;
  const force = options.force === true;
  const cached = catalogCache[collection];
  const fresh = cached && (Date.now() - cached.at) < CATALOG_CACHE_TTL;

  // 有新鲜缓存且非强制刷新：先秒开渲染，再后台静默刷新，避免切换 tab 白等云函数
  if (fresh && !force) {
    state.catalogItems = cached.items;
    loadCatalog({ force: true });
    return;
  }

  await withLoading(force ? "刷新商品" : "读取商品", async () => {
    const [result] = await Promise.all([
      callFunction("manageCatalog", {
        action: "list",
        collection,
        includeHidden: true
      }),
      supportsProductShelf() ? loadProductCategories() : Promise.resolve()
    ]);
    state.catalogItems = result.items || [];
    catalogCache[collection] = { items: state.catalogItems, at: Date.now() };
    // 抽屉打开时：同步表单到最新数据；关闭时只维护列表高亮，不强行打开编辑
    const preferredId = state.selectedCatalogId || forms.catalog.id;
    if (state.catalogDrawerOpen && preferredId) {
      const found = state.catalogItems.find((item) => item.id === preferredId);
      if (found) {
        state.selectedCatalogId = preferredId;
        editCatalog(found);
        return;
      }
      if (isCreatingCatalog.value) return;
    }
    if (preferredId && state.catalogItems.some((item) => item.id === preferredId)) {
      state.selectedCatalogId = preferredId;
      return;
    }
    state.selectedCatalogId = "";
  });
}

function selectCollection(key) {
  // 商品管理只切茶叶/堂饮/活动；茶室已并入设置管理
  state.collection = key;
  state.selectedCatalogId = "";
  state.catalogDrawerOpen = false;
  state.selectedCatalogIds = [];
  filters.catalogShelf = "";
  filters.catalogCategory = "";
  filters.catalogFlag = "";
  loadCatalog();
}

function closeCatalogDrawer() {
  state.catalogDrawerOpen = false;
  closeYearPicker();
}

function resetCatalog() {
  const nextId = isDrinksCollection()
    ? `drink-item-${Date.now()}`
    : `${state.collection}-${Date.now()}`;
  state.selectedCatalogId = nextId;
  state.catalogDrawerOpen = true;
  const baseStatus = state.collection === "events" ? "敬请期待" : "上架";
  const defaultCategory = categoryPresetsForCollection()[0]
    || managedCategoryNames.value[0]
    || "";
  Object.assign(forms.catalog, emptyCatalog(), {
    id: nextId,
    status: baseStatus,
    category: defaultCategory,
    categoryId: "",
    groupName: "",
    subtitle: "",
    shelfStatus: "on",
    image: "",
    thumb: "",
    price: 0,
    stock: 0,
    unit: "",
    brewStyle: "",
    serviceType: "",
    specs: isTeaProductsCollection() ? [emptyCatalogSpec()] : [],
    teaGroups: []
  });
  syncCatalogCategoryChoice();
  syncDrinkCategoryIdFromName();
  syncCatalogDateFields();
  // 堂饮新建：默认档位已选，直接带出档位价（可改，0=留空跟随档位）
  if (isDrinksCollection() && !Number(forms.catalog.price)) {
    forms.catalog.price = drinkTierPrice.value;
  }
}

function editCatalog(item) {
  if (!item) {
    resetCatalog();
    return;
  }
  state.selectedCatalogId = item.id;
  state.catalogDrawerOpen = true;
  const specs = normalizeCatalogSpecs(item.specs);
  Object.assign(forms.catalog, emptyCatalog(), item, {
    specs: isTeaProductsCollection()
      ? (specs.length
        ? specs
        : [{
          label: String(item.unit || "").trim() || "默认规格",
          weight: "",
          price: Math.max(0, Number(item.price) || 0),
          stock: Math.max(0, Number(item.stock) || 0)
        }])
      : [],
    teaGroups: [],
    categoryId: item.categoryId || "",
    groupName: item.groupName || "",
    subtitle: item.subtitle || "",
    shelfStatus: deriveCatalogShelfStatus(item)
  });
  if (forms.catalog.image && !forms.catalog.thumb) {
    forms.catalog.thumb = forms.catalog.image;
  }
  // 旧档位文档（teaGroups）不应在茶品列表里编辑；仍尽量展示
  if (isDrinksCollection() && Array.isArray(item.teaGroups) && item.teaGroups.length && !item.categoryId) {
    showToast("这是旧版档位数据，请用「配置档位」维护档位，茶品请新建");
  }
  syncCatalogCategoryChoice();
  syncDrinkCategoryIdFromName();
  syncCatalogDateFields();
}

async function saveCatalog() {
  try {
    assertText(forms.catalog.id, "请填写资料 ID");
    if (state.collection !== "events") assertText(forms.catalog.name || forms.catalog.title, "请填写名称");
    if (!isDrinksCollection() && !isTeaProductsCollection()) {
      assertNonNegative(forms.catalog.price, "价格不能为负数");
      assertNonNegative(forms.catalog.stock, "库存不能为负数");
    }
    if (isTeaProductsCollection() || isDrinksCollection() || state.collection === "events") {
      if (catalogCategoryChoice.value !== SELECT_CUSTOM_VALUE && catalogCategoryChoice.value) {
        forms.catalog.category = catalogCategoryChoice.value;
      }
      assertText(forms.catalog.category, isDrinksCollection() ? "请选择所属档位（初见/知味…）" : "请选择或填写分类");
    }
    if (supportsProductShelf()) {
      applyCatalogShelfStatus(forms.catalog.shelfStatus || "on");
    }
    if (isTeaProductsCollection()) {
      const specs = normalizeCatalogSpecs(forms.catalog.specs);
      if (!specs.length) throw new Error("请至少填写 1 个销售规格");
      for (const spec of specs) {
        if (spec.price < 0) throw new Error("规格价格不能为负数");
        if (spec.stock < 0) throw new Error("规格库存不能为负数");
      }
      forms.catalog.specs = specs;
      syncCatalogPriceFromSpecs();
      syncCatalogStockFromSpecs();
      forms.catalog.year = String(forms.catalog.year || "").trim();
    }
    if (isDrinksCollection()) {
      syncDrinkCategoryIdFromName();
      if (!forms.catalog.categoryId) {
        const tier = managedCategoriesForCollection.value.find(
          (item) => String(item.name || "").trim() === String(forms.catalog.category || "").trim()
        );
        if (!tier) throw new Error("请先在「配置档位」创建档位，再添加该档位下的茶品");
        forms.catalog.categoryId = tier.id;
      }
      forms.catalog.groupName = String(forms.catalog.groupName || "").trim();
      // 茶品价格可单独设置：>0 覆盖档位价；0/空 = 跟随档位价
      forms.catalog.price = Math.max(0, Number(forms.catalog.price) || 0);
      forms.catalog.stock = 0;
      delete forms.catalog.teaGroups;
    }
    // 有主图时缩略图可自动沿用
    if (forms.catalog.image && !String(forms.catalog.thumb || "").trim()) {
      forms.catalog.thumb = forms.catalog.image;
    }
    if (!String(forms.catalog.image || "").trim()) {
      throw new Error(isTeaProductsCollection() ? "请上传商品主图" : "请上传图片");
    }
    if (!isUrlish(forms.catalog.image) || !isUrlish(forms.catalog.thumb)) {
      throw new Error("请重新上传图片（需为云存储或网络地址）");
    }
    if (state.collection === "events") {
      assertText(forms.catalog.title || forms.catalog.name, "请填写活动标题");
      if (catalogDateIso.value) {
        forms.catalog.date = formatEventDateDisplay(catalogDateIso.value) || forms.catalog.date;
      }
      forms.catalog.time = normalizeEventTime(forms.catalog.time);
      assertText(forms.catalog.status, "请选择活动状态");
      if (Number(forms.catalog.signed || 0) > Number(forms.catalog.quota || 0)) throw new Error("已报名不能大于名额");
    }
  } catch (error) {
    showToast(error.message);
    return;
  }
  const existing = state.catalogItems.find((item) => item.id === forms.catalog.id);
  const action = existing ? "update" : "create";
  const payload = { ...forms.catalog };
  delete payload.shelfStatus;
  if (isTeaProductsCollection()) {
    payload.specs = normalizeCatalogSpecs(payload.specs);
    delete payload.teaGroups;
    delete payload.tagline;
    delete payload.brewStyle;
    delete payload.serviceType;
    delete payload.categoryId;
    delete payload.groupName;
    delete payload.subtitle;
  } else if (isDrinksCollection()) {
    payload.category = String(payload.category || "").trim();
    payload.categoryId = String(payload.categoryId || "").trim();
    payload.groupName = String(payload.groupName || "").trim();
    payload.subtitle = String(payload.subtitle || "").trim();
    payload.price = Math.max(0, Number(payload.price) || 0);
    delete payload.specs;
    delete payload.teaGroups;
    delete payload.origin;
    delete payload.year;
    delete payload.taste;
    delete payload.roast;
    delete payload.tagline;
    delete payload.brewStyle;
    delete payload.serviceType;
    delete payload.unit;
    delete payload.badge;
  } else {
    delete payload.specs;
    delete payload.teaGroups;
    delete payload.categoryId;
    delete payload.groupName;
    delete payload.subtitle;
  }
  const needsReason = action === "update" && hasSensitiveCatalogChange(existing, payload);
  const reason = needsReason
    ? await promptActionReason(`保存 ${displayName(forms.catalog)} 的价格、库存、名额或状态`)
    : "";
  if (needsReason && !reason) return;
  const savingId = String(forms.catalog.id || "").trim();
  await withLoading(action === "create" ? "新建商品" : "保存资料", async () => {
    if (isTeaProductsCollection() || isDrinksCollection()) {
      await ensureProductCategory(payload.category, state.collection);
    }
    await callFunction("manageCatalog", {
      action,
      collection: state.collection,
      id: savingId,
      reason,
      data: payload
    });
    state.selectedCatalogId = savingId;
    showToast(action === "create" ? "新商品已添加" : "资料已保存");
    closeCatalogDrawer();
    invalidateCatalogCache(state.collection);
    await loadCatalog({ force: true });
  });
}

function isCatalogRemoved(item) {
  return !!(item && item.removed === true);
}

/** 已下架且未删除（活动历史用 deleted 表示下架） */
function isCatalogOffShelf(item) {
  if (!item || isCatalogRemoved(item)) return false;
  return item.visible === false || item.deleted === true;
}

function catalogStatusLabel(item) {
  if (isCatalogRemoved(item)) return "已删除";
  const shelf = deriveCatalogShelfStatus(item);
  if (shelf === "draft") return "草稿";
  if (shelf === "off" || isCatalogOffShelf(item)) return "已下架";
  return item.status || "上架";
}

async function toggleCatalog(item) {
  if (isCatalogRemoved(item)) {
    showToast("已删除的资料不可恢复，请重新创建");
    return;
  }
  const restore = isCatalogOffShelf(item);
  if (!restore && !(await requireTypedConfirm(`确认下架 ${displayName(item)}？`, item.id || displayName(item)))) return;
  const reason = await promptActionReason(`${restore ? "恢复" : "下架"} ${displayName(item)}`);
  if (!reason) return;
  await withLoading(restore ? "恢复资料" : "下架资料", async () => {
    await callFunction("manageCatalog", {
      action: restore ? "restore" : "delete",
      collection: state.collection,
      id: item.id,
      reason
    });
    showToast(restore ? "已恢复" : "已下架");
    invalidateCatalogCache(state.collection);
    await loadCatalog({ force: true });
  });
}

/** 行业规则：须先下架，再软删除；二次确认 + 原因审计 */
async function removeCatalog(item) {
  if (!item?.id) return;
  if (isCatalogRemoved(item)) {
    showToast("资料已删除");
    return;
  }
  if (!isCatalogOffShelf(item)) {
    showToast("请先下架后再删除");
    return;
  }
  const name = displayName(item);
  if (!(await requireTypedConfirm(
    `确认删除「${name}」？删除后列表不再显示，历史订单中的信息仍保留。此操作不可恢复上架。`,
    item.id || name
  ))) return;
  const reason = await promptActionReason(`删除 ${name}`);
  if (!reason) return;
  await withLoading("删除资料", async () => {
    await callFunction("manageCatalog", {
      action: "remove",
      collection: state.collection,
      id: item.id,
      reason
    });
    if (state.selectedCatalogId === item.id) {
      closeCatalogDrawer();
    }
    showToast("已删除");
    invalidateCatalogCache(state.collection);
    await loadCatalog({ force: true });
  });
}

function orderListQueryPayload() {
  const payload = {
    bizType: filters.orderBizType,
    keyword: filters.orderKeyword
  };
  if (filters.orderQueue === "todo") {
    payload.queue = "todo";
  } else if (filters.orderStatus) {
    payload.status = filters.orderStatus;
  }
  return payload;
}

function setOrderQueue(queue) {
  filters.orderQueue = queue === "all" ? "all" : "todo";
  if (filters.orderQueue === "todo") {
    filters.orderStatus = "";
  }
  resetPageAndLoad("orders", loadOrders);
}

function setOrderBizType(bizType) {
  filters.orderBizType = bizType || "";
  // 切换业务线时保持待办视图，符合店员「先干活」心智
  if (!filters.orderQueue) {
    filters.orderQueue = "todo";
  }
  resetPageAndLoad("orders", loadOrders);
}

async function loadOrders() {
  await withLoading("读取订单", async () => {
    const result = await callFunction("manageOperations", {
      action: "listOrders",
      ...orderListQueryPayload(),
      ...pagePayload("orders")
    });
    state.orders = result.orders || [];
    setPageMeta("orders", result.page);
    state.orderListMeta = {
      queue: result.meta?.queue || filters.orderQueue || "",
      bizType: result.meta?.bizType || filters.orderBizType || "",
      statuses: Array.isArray(result.meta?.statuses) ? result.meta.statuses : [],
      todoTotal: Number(result.meta?.todoTotal ?? result.page?.total) || 0,
      allTotal: result.meta?.allTotal != null ? Number(result.meta.allTotal) : null
    };
    state.selectedOrderId = state.orders[0]?._id || "";
  });
}

async function loadAfterSales() {
  await withLoading("读取售后", async () => {
    const result = await callFunction("manageOperations", {
      action: "listAfterSales",
      status: filters.afterSaleStatus,
      keyword: filters.afterSaleKeyword,
      ...pagePayload("afterSales")
    });
    state.afterSales = result.orders || [];
    setPageMeta("afterSales", result.page);
    state.selectedAfterSaleId = state.afterSales[0]?._id || "";
    fillAfterSaleForm(selectedAfterSale.value);
  });
}

function fillAfterSaleForm(order) {
  Object.assign(afterSaleForm, {
    status: order?.afterSaleStatus || "审核中",
    refundAmount: Number(order?.refundAmount || 0),
    reason: order?.afterSaleReason || "",
    note: order?.afterSaleNote || ""
  });
}

async function saveAfterSale(order) {
  if (!order) return;
  if (!["申请售后", "审核中", "已退款", "已拒绝", "已关闭", "处理中"].includes(afterSaleForm.status)) {
    showToast("请选择有效售后状态");
    return;
  }
  if (Number(afterSaleForm.refundAmount || 0) > Number(order.total || 0)) {
    showToast("退款金额不能大于订单金额");
    return;
  }
  await withLoading("保存售后", async () => {
    await callFunction("manageOperations", {
      action: "updateAfterSale",
      orderId: order._id,
      orderNo: order.orderNo,
      afterSaleStatus: afterSaleForm.status,
      refundAmount: Number(afterSaleForm.refundAmount || 0),
      reason: afterSaleForm.reason,
      note: afterSaleForm.note
    });
    showToast("售后状态已保存");
    await loadAfterSales();
  });
}

async function startAfterSale(order) {
  if (!order) return;
  await withLoading("转入售后", async () => {
    await callFunction("manageOperations", {
      action: "updateAfterSale",
      orderId: order._id,
      orderNo: order.orderNo,
      afterSaleStatus: "审核中",
      refundAmount: Number(order.refundAmount || 0),
      reason: order.afterSaleReason || "后台发起售后处理",
      note: order.afterSaleNote || ""
    });
    showToast("已转入售后");
    state.activeTab = "afterSales";
    await loadAfterSales();
    selectAfterSale(state.afterSales.find((item) => item._id === order._id) || order);
  });
}

async function loadInventoryLogs() {
  await withLoading("读取库存流水", async () => {
    const result = await callFunction("manageOperations", {
      action: "listInventoryLogs",
      keyword: filters.inventoryKeyword,
      ...pagePayload("inventory")
    });
    state.inventoryLogs = result.logs || [];
    setPageMeta("inventory", result.page);
  });
}

async function loadInventoryProductOptions() {
  try {
    const result = await callFunction("manageCatalog", {
      action: "list",
      collection: inventoryForm.collection,
      includeHidden: true
    });
    inventoryProductOptions.value = (result.items || [])
      .filter((item) => item && item.id && !item.removed)
      .map((item) => ({
        id: item.id,
        name: displayName(item),
        stock: item.stock
      }));
  } catch (_error) {
    inventoryProductOptions.value = [];
  }
}

function openInventoryDrawer() {
  inventoryForm.id = "";
  inventoryForm.delta = 0;
  inventoryForm.note = "";
  openDrawer("inventory");
  loadInventoryProductOptions();
}

function onInventoryCollectionChange() {
  inventoryForm.id = "";
  loadInventoryProductOptions();
}

async function adjustInventory() {
  if (!inventoryForm.id.trim()) {
    showToast("请选择商品");
    return;
  }
  if (!Number.isFinite(Number(inventoryForm.delta)) || Number(inventoryForm.delta) === 0) {
    showToast("调整数量不能为 0");
    return;
  }
  if (!inventoryForm.note.trim()) {
    showToast("请填写库存调整原因");
    return;
  }
  await withLoading("调整库存", async () => {
    await callFunction("manageOperations", {
      action: "adjustInventory",
      collection: inventoryForm.collection,
      id: inventoryForm.id,
      delta: Number(inventoryForm.delta),
      note: inventoryForm.note
    });
    showToast("库存已调整");
    inventoryForm.delta = 0;
    inventoryForm.note = "";
    await loadInventoryLogs();
    await loadInventoryProductOptions();
  });
}

async function loadAuditLogs() {
  await withLoading("读取审计日志", async () => {
    const result = await callFunction("manageOperations", {
      action: "listAuditLogs",
      keyword: filters.auditKeyword,
      ...pagePayload("audit")
    });
    state.auditLogs = result.logs || [];
    setPageMeta("audit", result.page);
    state.selectedAuditLogId = state.auditLogs[0]?._id || "";
  });
}

async function loadNotificationLogs() {
  await withLoading("读取通知日志", async () => {
    const result = await callFunction("manageOperations", {
      action: "listNotificationLogs",
      keyword: filters.notificationKeyword,
      ...pagePayload("notifications")
    });
    state.notificationLogs = result.logs || [];
    setPageMeta("notifications", result.page);
  });
}

async function sendTestNotice() {
  if (!noticeTestForm.openid.trim()) {
    showToast("请填写 OpenID");
    return;
  }
  await withLoading("发送测试通知", async () => {
    await callFunction("manageOperations", {
      action: "sendTestNotice",
      kind: noticeTestForm.kind,
      openid: noticeTestForm.openid,
      payload: {
        room: "禾煦书茶空间",
        day: new Date().toISOString().slice(0, 10),
        time: "15:00",
        status: "测试通知",
        note: noticeTestForm.note
      }
    });
    showToast("测试通知已提交");
    await loadNotificationLogs();
  });
}

async function loadSystemStatus() {
  await withLoading("系统体检", async () => {
    const result = await callFunction("manageOperations", {
      action: "getSystemStatus",
      packageInfo: PACKAGE_INFO
    });
    state.systemStatus = result;
  });
}

async function loadAdminRoles() {
  await withLoading("读取角色", async () => {
    const result = await callFunction("manageOperations", { action: "listAdminRoles" });
    state.adminRoles = result.roles || [];
    state.rolePresets = result.presets || [];
    // 不自动打开角色编辑抽屉
    if (!state.drawers.role) state.selectedRoleId = "";
  });
}

function resetRole() {
  Object.assign(roleForm, {
    id: "",
    subjectType: "username",
    subject: "",
    displayName: "",
    roleKey: "clerk",
    disabled: false
  });
  state.selectedRoleId = "";
  openDrawer("role");
}

function editRole(role) {
  if (!role) {
    resetRole();
    return;
  }
  state.selectedRoleId = role.id;
  Object.assign(roleForm, {
    id: role.id || "",
    subjectType: role.subjectType || "username",
    subject: role.subject || "",
    displayName: role.displayName || "",
    roleKey: role.roleKey || "clerk",
    disabled: role.disabled === true
  });
  openDrawer("role");
}

async function saveAdminRole() {
  const subject = roleForm.subject.trim();
  if (!subject) {
    showToast("请填写账号标识");
    return;
  }
  if (roleForm.roleKey === "admin" && !(await requireTypedConfirm(`确认授予 ${subject} 管理员权限？`, subject))) return;
  const reason = await promptActionReason(`保存角色 ${subject}`);
  if (!reason) return;
  await withLoading("保存角色", async () => {
    await callFunction("manageOperations", {
      action: "saveAdminRole",
      reason,
      data: {
        ...roleForm,
        subject,
        id: roleForm.id || subject,
        permissions: currentRolePreset.value?.permissions || []
      }
    });
    showToast("角色已保存");
    await loadAdminRoles();
  });
}

async function loadBackupLogs() {
  await withLoading("读取备份", async () => {
    const result = await callFunction("manageOperations", {
      action: "listBackupLogs",
      ...pagePayload("backups")
    });
    state.backupLogs = result.logs || [];
    setPageMeta("backups", result.page);
  });
}

async function createDataBackup() {
  const limit = Number(backupForm.limit || 500);
  if (!Number.isFinite(limit) || limit < 50 || limit > 1000) {
    showToast("备份上限需在 50 到 1000 之间");
    return;
  }
  if (!(await requireTypedConfirm("确认创建包含订单、用户、审计和库存数据的云端备份？", "创建备份"))) return;
  const reason = await promptActionReason("创建云端数据备份");
  if (!reason) return;
  await withLoading("创建备份", async () => {
    const result = await callFunction("manageOperations", {
      action: "createDataBackup",
      limit,
      reason
    });
    showToast(result.cloudPath ? "备份已写入云存储" : "备份已完成");
    await loadBackupLogs();
  });
}

async function downloadBackup(log) {
  if (!log) return;
  const reason = await promptActionReason(`下载备份 ${log.cloudPath || log._id}`);
  if (!reason) return;
  await withLoading("获取备份链接", async () => {
    const result = await callFunction("manageOperations", {
      action: "getBackupDownloadUrl",
      id: log._id,
      cloudPath: log.cloudPath,
      reason
    });
    if (!result.url) throw new Error("未返回备份下载链接");
    window.open(result.url, "_blank", "noopener,noreferrer");
    showToast("临时备份下载链接已打开");
  });
}

async function fetchRoomResources() {
  try {
    const result = await callFunction("manageCatalog", {
      action: "list",
      collection: "rooms",
      includeHidden: true
    });
    return (result.items || []).filter((item) => item && item.removed !== true);
  } catch (_error) {
    return state.roomResources || [];
  }
}

async function ensureReservationWorkspaceContext() {
  if (!state.settings || !Object.keys(state.settings).length || !state.settings.bookingOpenTime) {
    try {
      const result = await callFunction("manageOperations", { action: "getSettings" });
      state.settings = Object.assign({}, state.settings || {}, result.settings || {});
    } catch (_error) {
      // 台历回退默认 10:00–21:30
    }
  }
  state.roomResources = await fetchRoomResources();
}

async function loadReservations() {
  await withLoading("读取预约", async () => {
    await ensureReservationWorkspaceContext();
    const result = await callFunction("manageOperations", {
      action: "listReservations",
      status: filters.reservationStatus,
      keyword: filters.reservationKeyword,
      startDay: weekStartOf(state.reservationWeekStart),
      endDay: weekEndOf(state.reservationWeekStart),
      // 周视图需要拉齐整周，避免分页截断
      page: 1,
      pageSize: 200
    });
    state.reservations = result.reservations || [];
    setPageMeta("reservations", result.page);
    const dayRows = (state.reservations || []).filter(
      (item) => (item.day || item.date || "").slice(0, 10) === state.reservationCalendarDate
    );
    if (state.selectedReservationId) {
      const still = dayRows.some((item) => item._id === state.selectedReservationId);
      if (!still) state.selectedReservationId = dayRows[0]?._id || "";
    } else if (dayRows.length) {
      // 默认选中当日第一条待办，右侧详情立刻可用
      const pending = dayRows.find((item) => /待支付|已确认|异常/.test(String(item.status || "")));
      state.selectedReservationId = (pending || dayRows[0])._id;
    } else {
      state.selectedReservationId = "";
    }
  });
}

function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStartOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 周一起始
  return addDaysToDateStr(dateStr, -dow);
}

function weekEndOf(dateStr) {
  return addDaysToDateStr(weekStartOf(dateStr), 6);
}

function shiftReservationCalendar(stepWeeks) {
  const weeks = Number(stepWeeks) || 0;
  const start = weekStartOf(state.reservationWeekStart);
  state.reservationWeekStart = addDaysToDateStr(start, weeks * 7);
  state.reservationCalendarDate = state.reservationWeekStart;
  resetPageAndLoad("reservations", loadReservations);
}

function jumpReservationCalendarToday() {
  const today = new Date().toISOString().slice(0, 10);
  state.reservationWeekStart = weekStartOf(today);
  state.reservationCalendarDate = today;
  resetPageAndLoad("reservations", loadReservations);
}

function openReservationSlot(slot) {
  const record = slot?.record || (slot?.records && slot.records[0]);
  if (record) selectReservation(record);
}

const RESERVATION_WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
function weekDayLabel(index) {
  return RESERVATION_WEEK_LABELS[index] || "";
}

const todayKeyStr = new Date().toISOString().slice(0, 10);

function reservationPrimaryHint(row) {
  if (!row) return "";
  const status = row.status || "";
  if (/待支付/.test(status)) return "顾客尚未支付，超时将自动释放时段。";
  if (/已确认/.test(status)) return "已付费待到店：可标记完成或未到店；取消须选择退款策略。";
  if (/异常/.test(status)) return "支付或状态异常，请核对后退款或恢复。";
  if (/已完成/.test(status)) return "服务已完成；如需售后可发起退款。";
  if (/未到店/.test(status)) return "终态：未到店（预付款默认不退，除非售后退款策略另议）。";
  if (/已取消/.test(status)) return "已取消，时段已释放。";
  return "查看明细并按状态操作。";
}

async function loadSignups() {
  await withLoading("读取报名", async () => {
    const result = await callFunction("manageOperations", {
      action: "listSignups",
      status: filters.signupStatus,
      keyword: filters.signupKeyword,
      ...pagePayload("signups")
    });
    state.signups = result.signups || [];
    setPageMeta("signups", result.page);
    state.selectedSignupId = state.signups[0]?._id || "";
  });
}

async function loadCustomers() {
  await withLoading("读取用户", async () => {
    const result = await callFunction("manageOperations", {
      action: "listCustomers",
      keyword: filters.customerKeyword,
      ...pagePayload("customers")
    });
    state.customers = result.customers || [];
    setPageMeta("customers", result.page);
    state.selectedCustomerId = state.customers[0]?.id || "";
  });
}

async function deleteCustomerData(customer) {
  if (!customer) return;
  const name = customerDisplayName(customer);
  const confirmed = await requireTypedConfirm(`确认删除/匿名化 ${name} 的个人信息？订单、预约、报名会保留经营记录，但姓名、手机号、地址、备注和用户关联会被清空。`, customer.phone || customer.id);
  if (!confirmed) return;
  const reason = await promptActionReason(`删除/匿名化 ${name} 的个人数据`);
  if (!reason) return;
  await withLoading("删除用户数据", async () => {
    const result = await callFunction("manageOperations", {
      action: "deleteCustomerData",
      customerId: customer.id,
      openid: customer.openid,
      phone: customer.phone,
      reason
    });
    const counts = result.counts || {};
    const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    showToast(total ? `已处理 ${total} 条相关数据` : "未找到可处理的数据");
    await loadCustomers();
  });
}

async function exportCustomerData(customer) {
  if (!customer) return;
  const name = customerDisplayName(customer);
  const reason = await promptActionReason(`导出 ${name} 的个人数据`);
  if (!reason) return;
  await withLoading("导出用户数据", async () => {
    const result = await callFunction("manageOperations", {
      action: "exportCustomerData",
      customerId: customer.id,
      openid: customer.openid,
      phone: customer.phone,
      reason
    });
    const data = result.data || {};
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hexu-customer-${customer.phone || customer.id || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("用户数据已导出");
  });
}

async function updateRecord(type, id, status) {
  if (type === "reservation") {
    await updateReservationRecord(id, status);
    return;
  }
  let adminNote = "";
  if (status === "已取消") {
    if (!(await requireTypedConfirm(`确认取消这条报名？`, id))) return;
    adminNote = await promptActionReason("取消报名");
    if (!adminNote) return;
  }
  await withLoading("更新状态", async () => {
    await callFunction("manageOperations", {
      action: "updateSignup",
      id,
      status,
      adminNote
    });
    showToast("状态已更新");
    await loadSignups();
  });
}

/**
 * 茶室预约后台状态机：
 * - 待支付：仅可取消（不退款）
 * - 已确认(已付)：服务完成 / 未到店 / 取消（须选退款策略，含部分退）
 * - 异常待处理(已付)：可恢复已确认 / 取消
 * - 已完成：售后退款（全额/部分）
 * - 已取消、未到店：终态
 */
async function updateReservationRecord(id, status, actionKey = "") {
  const row = state.reservations.find((item) => item._id === id) || selectedReservation.value;
  if (!row) {
    showToast("预约不存在");
    return;
  }

  const advanceHours = getReservationCancelAdvanceHours();
  const remainingYuan = reservationRemainingRefundYuan(row);

  // 售后退款（业务状态保持已完成）
  if (actionKey === "aftersale" || status === "__aftersale__") {
    if (remainingYuan <= 0) {
      showToast("无可退余额");
      return;
    }
    const picked = await promptChoiceWithReason({
      title: "售后退款",
      message: `已完成预约可退余额 ¥${remainingYuan}。选择全额或部分退款（原路返回）。`,
      choices: [
        { value: "full", label: `全额退款（¥${remainingYuan}）` },
        { value: "partial", label: "部分退款（填写金额）" }
      ],
      confirmText: "发起退款",
      danger: true,
      showAmountWhen: "partial",
      maxAmount: remainingYuan,
      defaultAmount: remainingYuan,
      amountLabel: `退款金额（元，可退 ¥${remainingYuan}）`
    });
    if (!picked || !picked.choice) return;
    await withLoading("发起售后退款", async () => {
      const result = await callFunction("manageOperations", {
        action: "afterSaleRefundReservation",
        afterSaleRefund: true,
        id,
        adminNote: picked.reason,
        refundMode: picked.choice,
        refundAmount: picked.choice === "partial" ? picked.amount : remainingYuan
      });
      showToast(result.message || "售后退款已发起");
      if (result.warning) showToast(result.warning);
      await loadReservations();
    });
    return;
  }

  let adminNote = "";
  let refundMode = "";
  let refundAmount = null;

  if (status === "已取消") {
    if (!(await requireTypedConfirm("确认取消这条茶室预约？取消后时段释放。", id))) return;
    const paid = reservationPaid(row);
    if (paid) {
      const inWindow = reservationInAutoRefundWindow(row);
      const picked = await promptChoiceWithReason({
        title: "取消已支付预约",
        message: `请选择退款策略。用户自助规则：提前 ${advanceHours} 小时可全额退。当前${inWindow ? "仍在" : "已超出"}自动全额退窗口。可退余额 ¥${remainingYuan}。`,
        choices: [
          { value: "merchant", label: "店家原因 · 全额退款（推荐店家取消）" },
          { value: "full", label: `全额退款（¥${remainingYuan}）` },
          { value: "partial", label: "部分退款（填写金额）" },
          { value: "auto", label: `按规则（提前≥${advanceHours}h 才退）` },
          { value: "none", label: "不退款（政策外/违约）" }
        ],
        confirmText: "确认取消",
        danger: true,
        showAmountWhen: "partial",
        maxAmount: remainingYuan,
        defaultAmount: remainingYuan > 0 ? Math.min(remainingYuan, Math.round(remainingYuan / 2 * 100) / 100) : 0,
        amountLabel: `退款金额（元，可退 ¥${remainingYuan}）`
      });
      if (!picked || !picked.choice) return;
      refundMode = picked.choice;
      adminNote = picked.reason;
      if (picked.choice === "partial") {
        refundAmount = picked.amount;
      }
    } else {
      adminNote = await promptActionReason("取消未支付预约");
      if (!adminNote) return;
      refundMode = "none";
    }
  } else if (status === "未到店") {
    adminNote = await promptActionReason("标记未到店（预付款默认不退）");
    if (!adminNote) return;
  } else if (status === "已完成") {
    // 轻量确认即可
  } else if (status === "已确认") {
    adminNote = await promptActionReason("从异常待处理恢复为已确认");
    if (!adminNote) return;
  }

  await withLoading("更新预约状态", async () => {
    const payload = {
      action: "updateReservation",
      id,
      status,
      adminNote,
      refundMode
    };
    if (refundAmount != null) {
      payload.refundAmount = refundAmount;
    }
    const result = await callFunction("manageOperations", payload);
    showToast(result.message || "状态已更新");
    if (result.warning) showToast(result.warning);
    await loadReservations();
  });
}

function runReservationAction(action) {
  if (!selectedReservation.value || !action) return;
  if (action.key === "aftersale") {
    updateReservationRecord(selectedReservation.value._id, "__aftersale__", "aftersale");
    return;
  }
  updateReservationRecord(selectedReservation.value._id, action.status, action.key);
}

async function checkInSignup(signup, status) {
  if (!signup) return;
  await withLoading("核销报名", async () => {
    await callFunction("manageOperations", {
      action: "checkInSignup",
      id: signup._id,
      status
    });
    showToast(status === "已到场" ? "已标记到场" : "已标记未到场");
    await loadSignups();
  });
}

async function orderAction(action, order) {
  if (action === "cancel" && !(await requireTypedConfirm(`确认取消订单 ${order.orderNo || order._id}？`, order.orderNo || order._id))) return;
  if (action === "cancel" && !orderForm.cancelReason.trim()) {
    showToast("请填写取消订单原因");
    return;
  }
  if (action === "confirm" && !(await requireTypedConfirm(`确认接单 ${order.orderNo || order._id}？确认后进入履约，无需顾客在线支付。`, order.orderNo || order._id))) return;
  await withLoading("处理订单", async () => {
    const payload = { orderId: order._id, orderNo: order.orderNo };
    if (action === "confirm") {
      await callFunction("manageOperations", { action: "confirmManualOrder", ...payload });
    }
    if (action === "ship") {
      if (!orderForm.trackingNo.trim()) throw new Error("请填写快递单号");
      if (!orderForm.trackingCompany.trim()) throw new Error("请选择快递公司");
      const shipResult = await callFunction("manageOperations", {
        action: "markShipped",
        ...payload,
        trackingCompany: orderForm.trackingCompany.trim(),
        trackingNo: orderForm.trackingNo.trim()
      });
      orderForm.trackingCompany = "SF";
      orderForm.trackingNo = "";
      const wxMsg = shipResult && shipResult.wxShipping && shipResult.wxShipping.message;
      showToast(wxMsg || "订单已更新");
    } else if (action === "retryWxShipping") {
      const retryResult = await callFunction("manageOperations", {
        action: "retryWxShipping",
        ...payload
      });
      showToast((retryResult && retryResult.message) || "已重试微信发货同步");
    } else {
      if (action === "pickup") await callFunction("manageOperations", { action: "markPickupDone", ...payload });
      if (action === "prepareDone") await callFunction("manageOperations", { action: "markPreparingDone", ...payload });
      if (action === "cancel") await callFunction("manageOperations", { action: "cancelOrder", ...payload, reason: orderForm.cancelReason.trim() });
      showToast("订单已更新");
    }
    if (action === "cancel") orderForm.cancelReason = "";
    await loadOrders();
    await refreshSummary();
  });
}

function wxShippingStatusText(order) {
  if (!order) return "-";
  if (order.wxShippingUploaded) {
    return order.wxShippingSkipped ? "微信已发货（幂等）" : "已同步微信";
  }
  if (order.wxShippingError) {
    return `同步失败：${order.wxShippingError}`;
  }
  if (order.deliveryMethod === "shipping" && order.status === "待发货") {
    return "待发货后同步";
  }
  if ((order.deliveryMethod === "pickup" || order.deliveryMethod === "onsite") && order.payStatus === "paid") {
    return "待同步（支付成功应自动上传）";
  }
  if (order.payMode === "wechat" || order.transactionId) {
    return "未同步";
  }
  return "非微信支付，无需同步";
}

function protectCsvCell(value) {
  const text = String(value ?? "");
  const trimmed = text.trimStart();
  const safeNegativeNumber = /^-\d+(\.\d+)?$/.test(trimmed);
  if (/^[=+\-@]/.test(trimmed) && !safeNegativeNumber) {
    return `'${text}`;
  }
  return text;
}

function escapeCsv(value) {
  const text = protectCsvCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, columns, rows) {
  const head = columns.map((item) => escapeCsv(item.label)).join(",");
  const body = rows.map((row) => columns.map((item) => escapeCsv(item.value(row))).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${head}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvFilename(name) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `hexu-${name}-${stamp}.csv`;
}

async function fetchExportRows({ action, rowsKey, label, payload = {} }) {
  if (!hasPermission("export.read")) {
    throw new Error("当前角色无权导出数据");
  }
  const exportReason = await promptActionReason(`导出${label} CSV`);
  if (!exportReason) return null;
  let rows = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await callFunction("manageOperations", {
      action,
      ...payload,
      exportAll: true,
      exportReason,
      page,
      pageSize: EXPORT_PAGE_SIZE
    });
    const nextRows = result[rowsKey] || [];
    const meta = result.page || {};
    if (page === 1 && Number(meta.total || 0) > EXPORT_MAX_ROWS) {
      throw new Error(`当前筛选有 ${numberText(meta.total)} 条${label}，单次导出上限 ${numberText(EXPORT_MAX_ROWS)} 条，请先缩小筛选条件。`);
    }
    rows = rows.concat(nextRows);
    pageCount = Number(meta.pageCount) || 1;
    page += 1;
  } while (page <= pageCount && rows.length < EXPORT_MAX_ROWS);
  return rows;
}

async function exportOrders() {
  await withLoading("导出订单", async () => {
    const rows = await fetchExportRows({
      action: "listOrders",
      rowsKey: "orders",
      label: "订单",
      payload: orderListQueryPayload()
    });
    if (!rows) return;
    downloadCsv(csvFilename("orders"), [
      { label: "订单号", value: (item) => item.orderNo || item._id },
      { label: "业务线", value: (item) => orderBizLabel(item) },
      { label: "履约方式", value: (item) => orderFulfillmentLabel(item) },
      { label: "桌号", value: (item) => item.tableNo || "" },
      { label: "状态", value: (item) => item.status || "" },
      { label: "支付", value: (item) => item.payStatus || "" },
      { label: "金额", value: (item) => money(item.total) },
      { label: "客户", value: (item) => item.name || item.contactName || item.consignee || "" },
      { label: "手机号", value: (item) => item.phone || item.mobile || "" },
      { label: "创建时间", value: (item) => formatDate(item.createdAt) }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条订单`);
  });
}

async function exportAfterSales() {
  await withLoading("导出售后", async () => {
    const rows = await fetchExportRows({
      action: "listAfterSales",
      rowsKey: "orders",
      label: "售后",
      payload: {
        status: filters.afterSaleStatus,
        keyword: filters.afterSaleKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("after-sales"), [
      { label: "订单号", value: (item) => item.orderNo || item._id },
      { label: "售后状态", value: (item) => item.afterSaleStatus || item.afterSale?.status || "" },
      { label: "订单状态", value: (item) => item.status || "" },
      { label: "退款金额", value: (item) => money(item.refundAmount || item.afterSale?.refundAmount || 0) },
      { label: "订单金额", value: (item) => money(item.total) },
      { label: "客户", value: (item) => item.name || item.contactName || item.consignee || "" },
      { label: "手机号", value: (item) => item.phone || item.mobile || "" },
      { label: "原因", value: (item) => item.afterSaleReason || item.afterSale?.reason || item.afterSaleNote || "" },
      { label: "创建时间", value: (item) => formatDate(item.createdAt) }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条售后`);
  });
}

async function exportReservations() {
  await withLoading("导出预约", async () => {
    const rows = await fetchExportRows({
      action: "listReservations",
      rowsKey: "reservations",
      label: "预约",
      payload: {
        status: filters.reservationStatus,
        keyword: filters.reservationKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("reservations"), [
      { label: "茶室", value: (item) => item.roomName || item.room || "" },
      { label: "客户", value: (item) => item.name || item.customerName || "" },
      { label: "手机号", value: (item) => item.phone || item.mobile || "" },
      { label: "日期", value: (item) => item.day || item.date || "" },
      { label: "时段", value: (item) => item.time || item.slot || "" },
      { label: "人数", value: (item) => item.people || item.count || "" },
      { label: "状态", value: (item) => item.status || "" }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条预约`);
  });
}

async function exportSignups() {
  await withLoading("导出报名", async () => {
    const rows = await fetchExportRows({
      action: "listSignups",
      rowsKey: "signups",
      label: "报名",
      payload: {
        status: filters.signupStatus,
        keyword: filters.signupKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("signups"), [
      { label: "活动", value: (item) => item.eventTitle || item.title || "" },
      { label: "客户", value: (item) => item.name || item.customerName || "" },
      { label: "手机号", value: (item) => item.phone || item.mobile || "" },
      { label: "日期", value: (item) => item.date || "" },
      { label: "时段", value: (item) => item.time || "" },
      { label: "状态", value: (item) => item.status || "" }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条报名`);
  });
}

async function exportCustomers() {
  await withLoading("导出用户", async () => {
    const rows = await fetchExportRows({
      action: "listCustomers",
      rowsKey: "customers",
      label: "用户",
      payload: {
        keyword: filters.customerKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("customers"), [
      { label: "标识", value: (item) => item.openid || item.id || "" },
      { label: "姓名", value: (item) => item.name || "" },
      { label: "手机号", value: (item) => item.phone || "" },
      { label: "订单数", value: (item) => item.orders || 0 },
      { label: "预约数", value: (item) => item.reservations || 0 },
      { label: "报名数", value: (item) => item.signups || 0 },
      { label: "消费", value: (item) => money(customerSpend(item)) },
      { label: "标签", value: (item) => Array.isArray(item.tags) ? item.tags.join(" ") : item.tag || "" }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 位用户`);
  });
}

async function exportInventoryLogs() {
  await withLoading("导出库存流水", async () => {
    const rows = await fetchExportRows({
      action: "listInventoryLogs",
      rowsKey: "logs",
      label: "库存流水",
      payload: {
        keyword: filters.inventoryKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("inventory-logs"), [
      { label: "时间", value: (item) => formatDate(item.createdAt) },
      { label: "商品", value: (item) => item.itemName || item.itemId || "" },
      { label: "集合", value: (item) => item.collection || "" },
      { label: "类型", value: (item) => item.type || "" },
      { label: "数量", value: (item) => item.quantity || 0 },
      { label: "库存前", value: (item) => item.beforeStock ?? "" },
      { label: "库存后", value: (item) => item.afterStock ?? "" },
      { label: "订单号", value: (item) => item.orderNo || "" },
      { label: "操作人", value: (item) => item.operator || "" },
      { label: "备注", value: (item) => item.note || "" }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条库存流水`);
  });
}

async function exportAuditLogs() {
  await withLoading("导出审计日志", async () => {
    const rows = await fetchExportRows({
      action: "listAuditLogs",
      rowsKey: "logs",
      label: "审计日志",
      payload: {
        keyword: filters.auditKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("audit-logs"), [
      { label: "时间", value: (item) => formatDate(item.createdAt) },
      { label: "动作", value: (item) => item.action || "" },
      { label: "管理员", value: (item) => item.adminUid || item.adminOpenid || "" },
      { label: "摘要", value: (item) => auditSummary(item) },
      { label: "变更", value: (item) => auditChangeEntries(item).map((change) => `${change.field}: ${change.before} -> ${change.after}`).join("; ") },
      { label: "详情", value: (item) => JSON.stringify(item.detail || {}) }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条审计日志`);
  });
}

async function exportNotificationLogs() {
  await withLoading("导出通知日志", async () => {
    const rows = await fetchExportRows({
      action: "listNotificationLogs",
      rowsKey: "logs",
      label: "通知日志",
      payload: {
        keyword: filters.notificationKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("notification-logs"), [
      { label: "时间", value: (item) => formatDate(item.createdAt) },
      { label: "类型", value: (item) => item.kind || "" },
      { label: "状态", value: (item) => item.status || "" },
      { label: "模板", value: (item) => item.templateId || "" },
      { label: "OpenID", value: (item) => item.openid || "" },
      { label: "原因", value: (item) => item.reason || item.error || "" }
    ], rows);
    showToast(`已导出 ${numberText(rows.length)} 条通知日志`);
  });
}

async function loadContent() {
  await withLoading("读取内容", async () => {
    const result = await callFunction("manageOperations", {
      action: "listContent",
      type: state.contentType
    });
    state.contentItems = result.items || [];
    // 不自动打开编辑抽屉
  });
}

function resetContent() {
  Object.assign(forms.content, {
    key: `content-${Date.now()}`,
    type: "home_carousel",
    title: "",
    subtitle: "",
    summary: "",
    image: "",
    sort: 10,
    visible: true
  });
  state.selectedContentKey = forms.content.key;
  openDrawer("content");
}

function editContent(item) {
  if (!item) {
    resetContent();
    return;
  }
  state.selectedContentKey = item.key;
  Object.assign(forms.content, item);
  if (!CONTENT_TYPE_OPTIONS.some((opt) => opt.value === forms.content.type)) {
    forms.content.type = "home_carousel";
  }
  openDrawer("content");
}

async function saveContent() {
  try {
    assertText(forms.content.key, "请填写内容 Key");
    assertText(forms.content.title, "请填写内容标题");
    assertText(forms.content.type, "请选择内容类型");
    if (!isUrlish(forms.content.image)) throw new Error("图片地址必须是 cloud://、http(s) 或 /assets/");
  } catch (error) {
    showToast(error.message);
    return;
  }
  await withLoading("保存内容", async () => {
    await callFunction("manageOperations", { action: "saveContent", data: { ...forms.content } });
    showToast("内容已保存");
    await loadContent();
  });
}

async function deleteContent(item) {
  if (!(await requireTypedConfirm(`确认停用内容 ${item.title || item.key}？`, item.key))) return;
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

async function loadSettings() {
  await withLoading("读取设置", async () => {
    const result = await callFunction("manageOperations", { action: "getSettings" });
    state.settings = result.settings || {};
  });
  await loadRoomInfo();
  // 静默拉取微信「发货信息管理」接入状态，不阻塞设置表单
  state.wxShippingStatus = null;
  callFunction("manageOperations", { action: "getWxShippingStatus" })
    .then((result) => {
      state.wxShippingStatus = (result && result.status) || null;
    })
    .catch(() => {});
  // 静默拉取已生成的桌码，不阻塞设置表单
  loadTableQrs();
  // 静默拉取会员储值档位，不阻塞设置表单
  callFunction("manageOperations", { action: "listMembershipPlans" })
    .then((result) => {
      state.rechargePlans = (result && result.plans) || [];
    })
    .catch(() => {});
}

async function saveSettings() {
  if (!isPhone(state.settings.phone)) {
    showToast("电话格式不正确");
    return;
  }
  if (!isNonNegativeNumber(state.settings.reservationCancelAdvanceHours) || Number(state.settings.reservationCancelAdvanceHours) < 1 || Number(state.settings.reservationCancelAdvanceHours) > 168) {
    showToast("取消提前小时须在 1–168 之间");
    return;
  }
  if (!isNonNegativeNumber(state.settings.reservationLockMinutes) || Number(state.settings.reservationLockMinutes) < 1 || Number(state.settings.reservationLockMinutes) > 120) {
    showToast("待支付锁单分钟须在 1–120 之间");
    return;
  }
  if (
    state.settings.reservationAutoCompleteGraceMinutes !== "" &&
    state.settings.reservationAutoCompleteGraceMinutes != null &&
    (!isNonNegativeNumber(state.settings.reservationAutoCompleteGraceMinutes) ||
      Number(state.settings.reservationAutoCompleteGraceMinutes) > 1440)
  ) {
    showToast("自动完成宽限分钟须在 0–1440 之间");
    return;
  }
  const bookingNums = [
    ["bookingMinDurationMinutes", 30, 480, "最短时长"],
    ["bookingSlotStepMinutes", 15, 60, "时段步长"],
    ["bookingMaxPeople", 1, 30, "人数上限"],
    ["bookingDayBasePrice", 0, undefined, "日间基础价"],
    ["bookingEveningBasePrice", 0, undefined, "晚间基础价"],
    ["bookingHalfHourPrice", 0, undefined, "加时单价"]
  ];
  for (const [field, min, max, label] of bookingNums) {
    const raw = state.settings[field];
    if (raw === "" || raw == null) continue;
    if (!isNonNegativeNumber(raw)) {
      showToast(`${label}须为数字`);
      return;
    }
    const n = Number(raw);
    if (n < min || (max != null && n > max)) {
      showToast(`${label}超出范围`);
      return;
    }
  }
  if (!isNonNegativeNumber(state.settings.memberPointRate)) {
    showToast("积分倍率不能为负数");
    return;
  }
  const levelMinSpends = [
    Number(state.settings.levelOneMinSpend),
    Number(state.settings.levelTwoMinSpend),
    Number(state.settings.levelThreeMinSpend)
  ];
  if (levelMinSpends.some((value) => !Number.isFinite(value) || value < 0)) {
    showToast("会员门槛必须是非负数字");
    return;
  }
  if (levelMinSpends[1] < levelMinSpends[0] || levelMinSpends[2] < levelMinSpends[1]) {
    showToast("会员等级门槛需按一档、二档、三档递增");
    return;
  }
  const discountRates = [
    state.settings.levelOneDiscountRate,
    state.settings.levelTwoDiscountRate,
    state.settings.levelThreeDiscountRate
  ];
  if (discountRates.some((rate) => !isDiscountRate(rate))) {
    showToast("会员折扣需在 0.01 到 1 之间");
    return;
  }
  const discountNumbers = discountRates.map(Number);
  if (discountNumbers[1] > discountNumbers[0] || discountNumbers[2] > discountNumbers[1]) {
    showToast("高等级会员折扣率不能高于低等级会员");
    return;
  }
  const noticePages = [
    state.settings.orderPaidPage,
    state.settings.orderShippedPage,
    state.settings.wxShippingJumpPath,
    state.settings.reservationNoticePage,
    state.settings.eventNoticePage
  ];
  if (noticePages.some((page) => !isSafePagePath(page))) {
    showToast("通知跳转页格式不安全");
    return;
  }
  const reason = await promptActionReason("保存系统设置");
  if (!reason) return;
  await withLoading("保存设置", async () => {
    await callFunction("manageOperations", { action: "updateSettings", data: state.settings, reason });
    showToast("设置已保存");
  });
}

/** 读取单间茶室信息（rooms 集合第一条）；同时刷新排期看板行数据 */
async function loadRoomInfo() {
  const items = await fetchRoomResources();
  state.roomResources = items;
  const room = items[0] || null;
  if (room) {
    Object.assign(state.roomForm, {
      id: String(room.id || ""),
      name: String(room.name || room.title || ""),
      image: String(room.image || room.thumb || ""),
      thumb: String(room.thumb || room.image || ""),
      capacity: String(room.capacity || ""),
      floor: String(room.floor || ""),
      status: String(room.status || "可预定"),
      visible: room.visible !== false
    });
  } else {
    Object.assign(state.roomForm, {
      id: "",
      name: "",
      image: "",
      thumb: "",
      capacity: "",
      floor: "",
      status: "可预定",
      visible: true
    });
  }
}

/** 保存单间茶室信息：写回 rooms 集合第一条文档，小程序与排期看板照常读取 */
async function saveRoomInfo() {
  const name = String(state.roomForm.name || "").trim();
  if (!name) {
    showToast("请填写茶室名称");
    return;
  }
  const reason = await promptActionReason("保存茶室信息");
  if (!reason) return;
  await withLoading("保存茶室信息", async () => {
    const roomId = state.roomForm.id || `rooms-${Date.now()}`;
    const data = {
      id: roomId,
      name,
      image: String(state.roomForm.image || "").trim(),
      thumb: String(state.roomForm.thumb || "").trim(),
      capacity: String(state.roomForm.capacity || "").trim(),
      floor: String(state.roomForm.floor || "").trim(),
      status: state.roomForm.visible ? "可预定" : "暂停预约",
      visible: state.roomForm.visible,
      sort: 1
    };
    await callFunction("manageCatalog", {
      action: state.roomForm.id ? "update" : "create",
      collection: "rooms",
      id: roomId,
      data,
      reason
    });
    state.roomForm.id = roomId;
    await loadRoomInfo();
    showToast("茶室信息已保存");
  });
}

/** 读取微信「发货信息管理」接入状态（开通、交易结算确认、跳转路径同步状态） */
async function refreshWxShippingStatus() {
  await withLoading("读取微信发货信息状态", async () => {
    const result = await callFunction("manageOperations", { action: "getWxShippingStatus" });
    state.wxShippingStatus = (result && result.status) || null;
  });
}

/** 将「订单发货通知」跳转路径同步到微信（set_msg_jump_path） */
async function syncWxShippingJumpPath() {
  const path = String(state.settings.wxShippingJumpPath || "").trim().replace(/^\/+/, "");
  if (!path || !/^[a-zA-Z0-9_/.-]+$/.test(path)) {
    showToast("请填写合法的小程序页面路径");
    return;
  }
  const reason = await promptActionReason("同步微信发货通知跳转路径");
  if (!reason) return;
  await withLoading("同步到微信", async () => {
    const result = await callFunction("manageOperations", {
      action: "setWxShippingJumpPath",
      path,
      reason
    });
    if (result && result.ok === false) {
      throw new Error(result.message || "同步失败");
    }
    showToast(result && result.message ? result.message : "已同步到微信");
    state.settings.wxShippingJumpPath = path;
    await refreshWxShippingStatus();
  });
}

/** 加载已生成的桌码 */
async function loadTableQrs() {
  try {
    const result = await callFunction("manageOperations", { action: "listTableQrs" });
    state.tableQrs = (result && result.qrs) || [];
  } catch (error) {
    state.tableQrs = [];
  }
}

/** 生成桌面扫码点单小程序码（01-04；需小程序已发布上线） */
async function generateTableQrs() {
  const reason = await promptActionReason("生成桌面扫码点单小程序码");
  if (!reason) return;
  await withLoading("生成桌码", async () => {
    const result = await callFunction("manageOperations", {
      action: "generateTableQr",
      tables: ["01", "02", "03", "04"],
      reason
    });
    if (result && result.ok === false) {
      throw new Error(result.message || "生成失败");
    }
    const parts = [];
    if (result.results && result.results.length) parts.push(`成功 ${result.results.length} 个`);
    if (result.errors && result.errors.length) parts.push(`失败 ${result.errors.length} 个`);
    showToast(parts.join("，") || "已完成");
    if (result.errors && result.errors.length) {
      // 部分失败时把详情挂到控制台，避免打断 toast
      console.warn("[tableQr] errors:", result.errors);
    }
    await loadTableQrs();
  });
}

/** 单桌重新生成 */
async function regenerateTableQr(tableNo) {
  const reason = await promptActionReason(`重新生成 ${tableNo} 号桌桌码`);
  if (!reason) return;
  await withLoading("重新生成", async () => {
    const result = await callFunction("manageOperations", {
      action: "generateTableQr",
      tables: [tableNo],
      reason
    });
    if (result && result.ok === false) {
      throw new Error(result.message || "生成失败");
    }
    const err = result.errors && result.errors.length ? result.errors.join(";") : "";
    showToast(err ? `失败：${err}` : `${tableNo} 号桌码已更新`);
    await loadTableQrs();
  });
}

/** 下载桌码图片到本地 */
async function downloadTableQr(qr) {
  if (!qr || !qr.url) {
    showToast("桌码尚未生成");
    return;
  }
  try {
    const resp = await fetch(qr.url);
    if (!resp.ok) {
      throw new Error("下载失败");
    }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `禾煦桌码-${qr.tableNo}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    showToast((error && error.message) || "下载失败，可右键图片另存");
  }
}

/** 桌码列表（默认 01-04，合并已生成的） */
const tableQrList = computed(() => {
  const DEFAULT = ["01", "02", "03", "04"];
  const map = {};
  (state.tableQrs || []).forEach((q) => {
    map[q.tableNo] = q;
  });
  return DEFAULT.map((no) => map[no] || { tableNo: no, url: "", fileID: "" });
});

function pageKeyForTab(tab) {
  return tab === "inventory" ? "inventory" : tab;
}

function applyKeywordToTab(tab, keyword) {
  if (tab === "orders") filters.orderKeyword = keyword;
  if (tab === "afterSales") filters.afterSaleKeyword = keyword;
  if (tab === "inventory") filters.inventoryKeyword = keyword;
  if (tab === "reservations") filters.reservationKeyword = keyword;
  if (tab === "signups") filters.signupKeyword = keyword;
  if (tab === "customers") filters.customerKeyword = keyword;
  if (tab === "catalog") filters.catalog = keyword;
  if (tab === "audit") filters.auditKeyword = keyword;
  if (tab === "notifications") filters.notificationKeyword = keyword;
}

function selectRecordFromSearch(tab, id) {
  if (!id) return;
  if (tab === "orders") {
    const order = state.orders.find((item) => item._id === id);
    if (order) selectOrder(order);
  }
  if (tab === "afterSales") {
    const row = state.afterSales.find((item) => item._id === id);
    if (row) selectAfterSale(row);
  }
  if (tab === "reservations") {
    const row = state.reservations.find((item) => item._id === id);
    if (row) selectReservation(row);
  }
  if (tab === "signups") {
    const row = state.signups.find((item) => item._id === id);
    if (row) selectSignup(row);
  }
  if (tab === "customers") {
    const row = state.customers.find((item) => item.id === id);
    if (row) selectCustomer(row);
  }
  if (tab === "audit") {
    const row = state.auditLogs.find((item) => item._id === id);
    if (row) selectAuditLog(row);
  }
}

async function openSearchResult(group, item) {
  const keyword = item.keyword || filters.global.trim();
  if (!group?.tab || !canAccessTab(group.tab)) {
    showToast("当前角色无权访问该模块");
    return;
  }
  applyKeywordToTab(group.tab, keyword);
  resetPage(pageKeyForTab(group.tab));
  state.searchOpen = false;
  state.activeTab = group.tab;
  await loadActiveTab();
  selectRecordFromSearch(group.tab, item.id);
}

async function runGlobalSearch() {
  const keyword = filters.global.trim();
  if (!keyword) {
    state.searchOpen = false;
    state.searchResults = [];
    state.searchMessage = "";
    return;
  }
  state.searchOpen = true;
  state.searching = true;
  state.searchMessage = "";
  try {
    const result = await callFunction("manageOperations", { action: "globalSearch", keyword });
    state.searchResults = result.groups || [];
    state.searchMessage = result.message || (state.searchResults.length ? "" : "没有找到匹配记录");
  } catch (error) {
    state.searchResults = [];
    state.searchMessage = error.message || "搜索失败";
  } finally {
    state.searching = false;
  }
}

function closeSearch() {
  state.searchOpen = false;
}

function loadSavedViews() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_VIEWS_KEY) || "{}");
    state.savedViews = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    state.savedViews = {};
  }
}

function persistSavedViews() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(state.savedViews));
  } catch (error) {
    showToast("常用视图保存失败，浏览器可能禁用了本地存储");
  }
}

function snapshotActiveFilters(tab = state.activeTab) {
  if (tab === "catalog") return { collection: state.collection, keyword: filters.catalog.trim() };
  if (tab === "orders") {
    return {
      bizType: filters.orderBizType,
      queue: filters.orderQueue || "todo",
      status: filters.orderStatus,
      keyword: filters.orderKeyword.trim()
    };
  }
  if (tab === "afterSales") return { status: filters.afterSaleStatus, keyword: filters.afterSaleKeyword.trim() };
  if (tab === "inventory") return { keyword: filters.inventoryKeyword.trim() };
  if (tab === "reservations") return { date: state.reservationCalendarDate, status: filters.reservationStatus, keyword: filters.reservationKeyword.trim() };
  if (tab === "signups") return { status: filters.signupStatus, keyword: filters.signupKeyword.trim() };
  if (tab === "customers") return { keyword: filters.customerKeyword.trim() };
  if (tab === "content") return { type: state.contentType };
  if (tab === "audit") return { keyword: filters.auditKeyword.trim() };
  if (tab === "notifications") return { keyword: filters.notificationKeyword.trim() };
  return {};
}

function savedViewDefaultName() {
  if (activeFilterLabels.value.length) {
    return activeFilterLabels.value.map((item) => `${item.label}${item.value}`).join("、").slice(0, 24);
  }
  return `${currentTitle.value[0]}全部`;
}

async function saveCurrentView() {
  if (!canSaveActiveView.value) return;
  const name = await promptTextValue("保存常用视图", "把当前筛选条件保存到本浏览器，后续可一键恢复。", savedViewDefaultName());
  if (!name) return;
  const tab = state.activeTab;
  const view = {
    id: `${Date.now()}`,
    tab,
    name: String(name).slice(0, 24),
    snapshot: snapshotActiveFilters(tab),
    createdAt: new Date().toISOString()
  };
  const existing = state.savedViews[tab] || [];
  state.savedViews = {
    ...state.savedViews,
    [tab]: [view, ...existing.filter((item) => item.name !== view.name)].slice(0, 6)
  };
  persistSavedViews();
  showToast("常用视图已保存");
}

async function applySavedView(view) {
  if (!view?.tab || !canAccessTab(view.tab)) {
    showToast("当前角色无权访问该视图");
    return;
  }
  const snapshot = view.snapshot || {};
  state.activeTab = view.tab;
  if (view.tab === "catalog") {
    state.collection = snapshot.collection || state.collection;
    filters.catalog = snapshot.keyword || "";
  }
  if (view.tab === "orders") {
    filters.orderBizType = snapshot.bizType || "";
    filters.orderQueue = snapshot.queue === "all" ? "all" : "todo";
    filters.orderStatus = snapshot.status || "";
    filters.orderKeyword = snapshot.keyword || "";
    if (filters.orderQueue === "todo") filters.orderStatus = "";
  }
  if (view.tab === "afterSales") {
    filters.afterSaleStatus = snapshot.status || "";
    filters.afterSaleKeyword = snapshot.keyword || "";
  }
  if (view.tab === "inventory") filters.inventoryKeyword = snapshot.keyword || "";
  if (view.tab === "reservations") {
    state.reservationCalendarDate = snapshot.date || state.reservationCalendarDate;
    filters.reservationStatus = snapshot.status || "";
    filters.reservationKeyword = snapshot.keyword || "";
  }
  if (view.tab === "signups") {
    filters.signupStatus = snapshot.status || "";
    filters.signupKeyword = snapshot.keyword || "";
  }
  if (view.tab === "customers") filters.customerKeyword = snapshot.keyword || "";
  if (view.tab === "content") state.contentType = snapshot.type || "home_carousel";
  if (view.tab === "audit") filters.auditKeyword = snapshot.keyword || "";
  if (view.tab === "notifications") filters.notificationKeyword = snapshot.keyword || "";
  resetPage(pageKeyForTab(view.tab));
  await loadActiveTab();
}

function deleteSavedView(view) {
  const tab = view?.tab || state.activeTab;
  const existing = state.savedViews[tab] || [];
  state.savedViews = {
    ...state.savedViews,
    [tab]: existing.filter((item) => item.id !== view.id)
  };
  persistSavedViews();
}

function clearActiveFilters() {
  if (state.activeTab === "catalog") {
    filters.catalog = "";
    filters.catalogShelf = "";
    filters.catalogCategory = "";
    filters.catalogFlag = "";
  }
  if (state.activeTab === "orders") {
    filters.orderBizType = "";
    filters.orderQueue = "todo";
    filters.orderStatus = "";
    filters.orderKeyword = "";
  }
  if (state.activeTab === "afterSales") {
    filters.afterSaleStatus = "";
    filters.afterSaleKeyword = "";
  }
  if (state.activeTab === "inventory") filters.inventoryKeyword = "";
  if (state.activeTab === "reservations") {
    filters.reservationStatus = "";
    filters.reservationKeyword = "";
  }
  if (state.activeTab === "signups") {
    filters.signupStatus = "";
    filters.signupKeyword = "";
  }
  if (state.activeTab === "customers") filters.customerKeyword = "";
  if (state.activeTab === "content") state.contentType = "home_carousel";
  if (state.activeTab === "audit") filters.auditKeyword = "";
  if (state.activeTab === "notifications") filters.notificationKeyword = "";
  resetPage(pageKeyForTab(state.activeTab));
  loadActiveTab();
}

function emptyTitle(tab = state.activeTab) {
  if (hasClearableFilters.value) return "没有匹配当前筛选";
  return {
    catalog: "暂无商品资料",
    orders: filters.orderQueue === "todo"
      ? (state.orderListMeta?.allTotal > 0 ? "当前没有待办订单" : "暂无订单")
      : "暂无订单",
    afterSales: "暂无售后记录",
    inventory: "暂无库存流水",
    reservations: "当日暂无预约",
    signups: "暂无活动报名",
    customers: "暂无用户记录",
    content: "暂无运营内容",
    audit: "暂无审计日志",
    notifications: "暂无订阅消息日志",
    roles: "暂无角色记录",
    backups: "暂无备份记录"
  }[tab] || "暂无数据";
}

function emptyHint(tab = state.activeTab) {
  if (hasClearableFilters.value) return "当前条件过窄，可以清除筛选后重新查看。";
  return {
    catalog: "在右侧保存资料后会同步写入前台可用数据。",
    orders: filters.orderQueue === "todo"
      ? (state.orderListMeta?.allTotal > 0
        ? `库中还有 ${state.orderListMeta.allTotal} 笔订单（多为已完成/已取消），不在待办里。点下方「查看全部订单」。`
        : "没有需要立刻处理的单。支付成功后的堂饮/待发货/待自提会出现在这里。")
      : "新订单支付或提交后会出现在这里。",
    afterSales: "订单转入售后后，可在这里处理退款状态闭环。",
    inventory: "订单锁定、支付扣减、取消释放和人工调整会自动沉淀流水。",
    reservations: "可切换日期，或检查小程序是否已有支付/提交。茶室信息与计价在「设置管理」配置。",
    signups: "活动报名、到场和未到场核销会集中展示。",
    customers: "有订单、预约或报名后会自动形成用户画像。",
    content: "新建轮播后会同步给小程序首页首屏。",
    audit: "后台关键操作会自动记录到这里。",
    notifications: "订阅消息发送、跳过和失败都会写入日志。",
    roles: "没有角色时，白名单账号按管理员处理。",
    backups: "可以先创建一次云端备份，之后定时任务会每日执行。"
  }[tab] || "暂无可展示记录。";
}

function emptyActionLabel(tab = state.activeTab) {
  if (tab === "orders" && filters.orderQueue === "todo" && Number(state.orderListMeta?.allTotal || 0) > 0) {
    return "查看全部订单";
  }
  if (hasClearableFilters.value) return "清除筛选";
  const labels = {
    catalog: hasPermission("catalog.write") ? "新建" : "刷新资料",
    content: hasPermission("content.write") ? "新建轮播" : "刷新内容",
    roles: hasPermission("roles.manage") ? "新建角色" : "刷新角色",
    backups: "刷新备份",
    system: "重新检查"
  };
  return labels[tab] || "刷新记录";
}

function handleEmptyAction(tab = state.activeTab) {
  if (tab === "orders" && filters.orderQueue === "todo" && Number(state.orderListMeta?.allTotal || 0) > 0) {
    setOrderQueue("all");
    return;
  }
  if (hasClearableFilters.value) {
    clearActiveFilters();
    return;
  }
  if (tab === "catalog" && hasPermission("catalog.write")) {
    resetCatalog();
    return;
  }
  if (tab === "content" && hasPermission("content.write")) {
    resetContent();
    return;
  }
  if (tab === "roles" && hasPermission("roles.manage")) {
    resetRole();
    return;
  }
  if (tab === "system") {
    loadSystemStatus();
    return;
  }
  loadActiveTab();
}

function setRuntimeError(error) {
  const message = error?.reason?.message || error?.message || error?.error?.message || String(error || "");
  state.runtimeError = message || "后台运行异常";
}

function focusGlobalSearch() {
  if (state.view !== "dashboard" || accessBlocked.value) return;
  globalSearchInput.value?.focus();
  state.searchOpen = !!(state.searchResults.length || state.searchMessage);
}

function setupRuntimeGuards() {
  if (typeof window === "undefined") return;
  const onError = (event) => setRuntimeError(event);
  const onUnhandledRejection = (event) => setRuntimeError(event);
  const onOnline = () => {
    state.online = true;
  };
  const onOffline = () => {
    state.online = false;
  };
  const onKeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusGlobalSearch();
    }
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("keydown", onKeydown);
  cleanupRuntimeGuards = () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("keydown", onKeydown);
  };
}

onMounted(async () => {
  try {
    setupRuntimeGuards();
    setupOrderBroadcastRuntime();
    loadSavedViews();
    initCloud();
    setCurrentUser(await getSessionUser());
    state.ready = true;
    if (state.user) await enterDashboard();
  } catch (error) {
    state.loginError = error.message || "后台初始化失败";
    state.ready = true;
  }
});

onBeforeUnmount(() => {
  cleanupRuntimeGuards?.();
  cleanupOrderBroadcastRuntime?.();
  const audioContext = broadcastAudioContext;
  stopOrderBroadcast({ silent: true }).finally(() => {
    if (audioContext?.state !== "closed") audioContext?.close().catch(() => {});
  });
});
</script>

<template>
  <main class="app-shell">
    <section v-if="state.view === 'login'" class="login-screen">
      <div class="login-art">
        <div class="brand-block">
          <span>禾 煦</span>
          <strong>HEXU TEA</strong>
        </div>
        <div class="ink-copy">
          <p>经营后台</p>
          <h1>茶事空间的秩序、审美与数据在此合一。</h1>
        </div>
      </div>
      <form class="login-card" @submit.prevent="signIn">
        <span class="section-kicker">经营后台</span>
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

    <section v-else class="admin-layout" :class="{ 'nav-open': state.navOpen }">
      <div
        v-if="state.navOpen"
        class="nav-mask"
        aria-hidden="true"
        @click="closeNav"
      ></div>
      <aside class="sidebar">
        <div class="logo-stack">
          <div class="logo-stack-main">
            <span>禾 煦</span>
            <strong>HEXU TEA</strong>
          </div>
          <button class="mobile-nav-close" type="button" aria-label="关闭菜单" @click="closeNav">
            <X :size="20" :stroke-width="1.8" />
          </button>
        </div>
        <nav class="nav-list">
          <div v-for="group in visibleNavGroups" :key="group.label" class="nav-group">
            <p class="nav-group-title">{{ group.label }}</p>
            <button
              v-for="item in group.items"
              :key="item.key"
              :class="{ active: state.activeTab === item.key }"
              :aria-current="state.activeTab === item.key ? 'page' : undefined"
              type="button"
              @click="switchTab(item.key)"
            >
              <span><component :is="item.icon" :size="18" :stroke-width="1.8" /></span>
              {{ item.label }}
            </button>
          </div>
        </nav>
        <div class="sidebar-scene" aria-hidden="true"></div>
        <div class="sidebar-user">
          <span>{{ currentUser }}</span>
          <em>{{ currentRoleName }}</em>
          <button type="button" @click="logout">退出</button>
        </div>
      </aside>

      <section v-if="accessBlocked" class="workspace access-workspace">
        <div class="access-block">
          <span class="section-kicker">权限边界</span>
          <h1>{{ accessBlockTitle }}</h1>
          <p>{{ accessBlockHint }}</p>
          <div class="access-facts">
            <span>账号 <strong>{{ currentUser }}</strong></span>
            <span>角色 <strong>{{ currentRoleName }}</strong></span>
          </div>
          <button class="secondary-action" type="button" @click="logout">退出并重新登录</button>
        </div>
      </section>

      <section v-else class="workspace" :aria-busy="!!state.loading">
        <header class="mobile-chrome">
          <button class="mobile-nav-toggle" type="button" aria-label="打开菜单" @click="toggleNav">
            <Menu :size="20" :stroke-width="1.8" />
          </button>
          <div class="mobile-chrome-title">
            <strong>禾煦</strong>
            <span>{{ currentTitle[0] }}</span>
          </div>
          <button
            class="mobile-nav-toggle"
            type="button"
            aria-label="刷新当前模块"
            :disabled="!!state.loading"
            @click="loadActiveTab"
          >
            <RefreshCw :size="18" :stroke-width="1.8" :class="{ spinning: !!state.loading }" />
          </button>
        </header>
        <header class="topbar">
          <div>
            <h1>{{ currentTitle[0] }}</h1>
            <p v-if="currentTitle[1]">{{ currentTitle[1] }}</p>
          </div>
          <div class="top-actions">
            <div class="global-search-wrap">
              <label class="search-box">
                <Search :size="17" :stroke-width="1.8" />
                <input
                  ref="globalSearchInput"
                  v-model="filters.global"
                  aria-label="全局搜索后台记录"
                  placeholder="全局搜索：手机号 / 订单号 / 预约"
                  @keydown.enter.prevent="runGlobalSearch"
                  @keydown.esc="closeSearch"
                  @focus="state.searchOpen = !!(state.searchResults.length || state.searchMessage)"
                >
              </label>
              <span class="shortcut-hint">Ctrl/⌘ K</span>
              <button class="search-trigger" type="button" :disabled="state.searching" @click="runGlobalSearch">
                {{ state.searching ? "搜索中" : "搜索" }}
              </button>
              <div v-if="state.searchOpen" class="global-search-panel" role="region" aria-label="全局搜索结果">
                <div class="search-panel-head">
                  <span>全局搜索</span>
                  <strong>{{ state.searching ? "正在查找" : `${numberText(globalSearchTotal)} 条匹配` }}</strong>
                  <button type="button" @click="closeSearch">关闭</button>
                </div>
                <p v-if="state.searchMessage" class="search-message">{{ state.searchMessage }}</p>
                <div v-for="group in state.searchResults" :key="group.key" class="search-group">
                  <div class="search-group-title">
                    <strong>{{ group.label }}</strong>
                    <span>{{ numberText(group.total) }} 条</span>
                  </div>
                  <button
                    v-for="item in group.items"
                    :key="`${group.key}-${item.id}`"
                    class="search-result"
                    type="button"
                    @click="openSearchResult(group, item)"
                  >
                    <span>
                      <strong>{{ item.title }}</strong>
                      <em>{{ item.subtitle || "无补充信息" }}</em>
                    </span>
                    <small>{{ item.status || item.meta || "查看" }}</small>
                  </button>
                </div>
              </div>
            </div>
            <button :class="['secondary-action icon-action', { spinning: !!state.loading }]" aria-label="刷新当前模块" type="button" :disabled="!!state.loading" @click="loadActiveTab(true)">
              <RefreshCw :size="16" :stroke-width="1.8" />
              {{ state.loading ? "同步中" : "刷新" }}
            </button>
            <div class="admin-chip">
              <span class="bell"><Bell :size="18" :stroke-width="1.9" /><em v-if="headerSignalCount">{{ headerSignalCount }}</em></span>
              <span class="avatar"></span>
              <span class="admin-name">{{ currentUser }}</span>
              <span class="role-badge">{{ currentRoleName }}</span>
              <ChevronDown :size="14" :stroke-width="1.8" />
            </div>
          </div>
        </header>

        <section
          v-if="state.activeTab === 'dashboard' && hasPermission('order.read')"
          :class="['order-broadcast-bar', `tone-${orderBroadcastStatusTone}`]"
          aria-label="店内新订单语音播报"
        >
          <div class="broadcast-symbol" aria-hidden="true">
            <Volume2 v-if="orderBroadcast.enabled" :size="22" :stroke-width="1.8" />
            <VolumeX v-else :size="22" :stroke-width="1.8" />
          </div>
          <div class="broadcast-copy" aria-live="polite">
            <div class="broadcast-title-row">
              <strong>店内语音播报</strong>
              <span :class="['broadcast-status', `tone-${orderBroadcastStatusTone}`]">
                <i aria-hidden="true"></i>{{ orderBroadcastStatusLabel }}
              </span>
            </div>
            <p>{{ orderBroadcastStatusDetail }}</p>
            <small>
              最近检查：{{ orderBroadcastLastCheck }}
              <template v-if="orderBroadcast.lastOrderNo"> · 最近播报：{{ orderBroadcast.lastOrderNo }}（{{ formatDate(orderBroadcast.lastAlertAt) }}）</template>
              <template v-if="orderBroadcast.queueCount"> · 待播 {{ orderBroadcast.queueCount }} 条</template>
            </small>
          </div>
          <div class="broadcast-actions">
            <button class="secondary-action icon-action" type="button" @click="testOrderBroadcastSound">
              <Play :size="15" :stroke-width="1.9" />
              测试声音
            </button>
            <button
              :class="['broadcast-toggle', 'icon-action', orderBroadcast.enabled || orderBroadcast.starting ? 'secondary-action' : 'primary-action']"
              type="button"
              :aria-pressed="orderBroadcast.enabled"
              @click="toggleOrderBroadcast"
            >
              <VolumeX v-if="orderBroadcast.enabled || orderBroadcast.starting" :size="16" :stroke-width="1.9" />
              <Volume2 v-else :size="16" :stroke-width="1.9" />
              {{ orderBroadcast.starting ? "取消开启" : (orderBroadcast.enabled ? "停止播报" : "开启播报") }}
            </button>
          </div>
        </section>

        <div v-if="state.moduleError" class="error-banner" role="alert">
          <span>当前模块加载失败</span>
          <strong>{{ state.moduleError }}</strong>
          <button type="button" @click="loadActiveTab">重试</button>
        </div>

        <div v-if="state.runtimeError" class="error-banner runtime-banner" role="alert">
          <span>后台运行异常</span>
          <strong>{{ state.runtimeError }}</strong>
          <button type="button" @click="state.runtimeError = ''">关闭</button>
        </div>

        <div v-if="!state.online" class="network-banner" role="status" aria-live="polite">
          <span>网络连接已断开</span>
          <strong>恢复网络后再继续保存、导出或刷新数据。</strong>
        </div>

        <section v-if="showActiveFilters" class="active-filters" aria-label="当前筛选">
          <span v-for="item in activeFilterLabels" :key="`${item.label}-${item.value}`" class="filter-chip">
            {{ item.label }}：{{ item.value }}
          </span>
          <button v-if="hasClearableFilters" class="clear-filter" type="button" @click="clearActiveFilters">清除筛选</button>
        </section>

        <section v-if="showSavedViewsBar" class="saved-views" aria-label="常用筛选视图">
          <span>常用视图</span>
          <button v-if="hasClearableFilters" class="save-view-button" type="button" @click="saveCurrentView">保存当前筛选</button>
          <div v-if="activeSavedViews.length" class="saved-view-list">
            <button v-for="view in activeSavedViews" :key="view.id" type="button" @click="applySavedView(view)">
              {{ view.name }}
              <i aria-label="删除视图" role="button" tabindex="0" @click.stop="deleteSavedView(view)" @keydown.enter.stop.prevent="deleteSavedView(view)">×</i>
            </button>
          </div>
        </section>

        <section v-if="showWorkflowStrip" class="workflow-strip" aria-label="当前模块状态流">
          <article v-for="step in moduleWorkflowSteps" :key="step.label" :data-tone="step.tone">
            <span>{{ step.label }}</span>
            <strong>{{ step.value }}</strong>
            <small v-if="step.hint">{{ step.hint }}</small>
          </article>
        </section>

        <section v-if="showMetricRow" class="metric-row">
          <article v-for="(card, index) in state.summary" :key="card.label" class="metric-card" :data-tone="card.tone">
            <div class="metric-icon"><component :is="metricIcon(card, index)" :size="24" :stroke-width="1.8" /></div>
            <div>
              <span>{{ card.label }}</span>
              <strong>{{ metricValue(card) }}</strong>
              <p v-if="card.delta">{{ card.delta }}</p>
            </div>
          </article>
        </section>

        <section v-if="state.activeTab === 'dashboard'" class="dashboard-home">
          <div class="dashboard-main">
            <article class="panel-card hero-panel">
              <div class="panel-title">
                <h2>今日茶室</h2>
                <div class="panel-title-meta">
                  <strong class="board-date">{{ state.dashboard?.dateLabel || state.reservationCalendarDate }}</strong>
                  <button class="secondary-action small icon-action" type="button" @click="switchTab('reservations')">
                    <CalendarDays :size="15" :stroke-width="1.8" />
                    预约管理
                  </button>
                </div>
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
              <EmptyState
                v-if="(state.dashboard?.roomBoard || []).length === 0"
                title="暂无茶室配置"
                hint="在「设置管理 → 茶室信息」维护可约茶席后，这里会显示今日时段。"
                action-label="去设置"
                @action="switchTab('settings')"
              />
              <div class="room-legend">
                <span><i class="free"></i>可预约</span>
                <span><i class="busy"></i>已预约</span>
                <span><i class="active"></i>进行中</span>
                <span><i class="done"></i>已结束</span>
              </div>
            </article>

            <aside class="dashboard-side">
              <article class="panel-card action-panel">
                <div class="panel-title"><h2>快捷入口</h2></div>
                <div class="quick-grid">
                  <button v-for="action in visibleQuickActions" :key="action.label" type="button" @click="switchTab(action.tab)">
                    <span><component :is="action.icon" :size="22" :stroke-width="1.7" /></span>
                    {{ action.label }}
                  </button>
                  <div v-if="visibleQuickActions.length === 0" class="empty-state">暂无快捷入口</div>
                </div>
              </article>
              <article class="panel-card insight-card">
                <div class="panel-title"><h2>今日结构</h2></div>
                <div class="insight-stats compact">
                  <span>订单<strong>{{ numberText(dashboardInsight.orderCount) }}</strong></span>
                  <span>客单价<strong>¥{{ numberText(dashboardInsight.averagePrice) }}</strong></span>
                  <span>营业额<strong>¥{{ numberText(dashboardInsight.revenue) }}</strong></span>
                </div>
                <ul class="donut-legend compact">
                  <li v-for="segment in dashboardInsight.segments" :key="segment.label" :class="segment.className">
                    <span></span>{{ segment.label }} <strong>{{ segment.value }}%</strong>
                  </li>
                </ul>
              </article>
            </aside>
          </div>

          <div class="dashboard-feeds">
            <article class="panel-card list-panel">
              <div class="panel-title">
                <h2>最新预约</h2>
                <button class="link-more" type="button" @click="switchTab('reservations')">更多 ›</button>
              </div>
              <div class="flow-list feed-list">
                <button v-for="item in (state.dashboard?.recentReservations || []).slice(0, 6)" :key="item._id" type="button" @click="switchTab('reservations')">
                  <span class="feed-avatar">{{ (maskName(item.name || item.customerName) || "访").slice(0, 1) }}</span>
                  <span class="feed-main">
                    <strong>{{ maskName(item.name || item.customerName) || "访客" }}</strong>
                    <small>{{ item.day || item.date }} · {{ item.roomName || item.room }}</small>
                  </span>
                  <em>{{ item.status || "已预约" }}</em>
                </button>
                <p v-if="!(state.dashboard?.recentReservations || []).length" class="feed-empty">暂无预约</p>
              </div>
            </article>
            <article class="panel-card list-panel">
              <div class="panel-title">
                <h2>最新报名</h2>
                <button class="link-more" type="button" @click="switchTab('signups')">更多 ›</button>
              </div>
              <div class="flow-list feed-list">
                <button v-for="item in (state.dashboard?.recentSignups || []).slice(0, 6)" :key="item._id" type="button" @click="switchTab('signups')">
                  <span class="feed-avatar">{{ (item.eventTitle || item.title || "茶").slice(0, 1) }}</span>
                  <span class="feed-main">
                    <strong>{{ item.eventTitle || item.title || "活动报名" }}</strong>
                    <small>{{ maskName(item.name || item.customerName) || "访客" }} · {{ item.status }}</small>
                  </span>
                  <em>{{ item.people || item.count || 1 }}人</em>
                </button>
                <p v-if="!(state.dashboard?.recentSignups || []).length" class="feed-empty">暂无报名</p>
              </div>
            </article>
            <article class="panel-card list-panel">
              <div class="panel-title">
                <h2>最新订单</h2>
                <button class="link-more" type="button" @click="switchTab('orders')">更多 ›</button>
              </div>
              <div class="flow-list feed-list">
                <button v-for="item in (state.dashboard?.recentOrders || []).slice(0, 6)" :key="item._id" type="button" @click="switchTab('orders')">
                  <span class="feed-avatar">单</span>
                  <span class="feed-main">
                    <strong>{{ item.orderNo || "订单" }}</strong>
                    <small>{{ item.status }} · {{ formatDate(item.createdAt) }}</small>
                  </span>
                  <em>¥{{ money(item.total) }}</em>
                </button>
                <p v-if="!(state.dashboard?.recentOrders || []).length" class="feed-empty">暂无订单</p>
              </div>
            </article>
          </div>
        </section>

        <section v-if="state.activeTab === 'catalog'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar catalog-toolbar">
              <div class="segmented">
                <button v-for="item in collectionTabs" :key="item.key" :class="{ active: state.collection === item.key }" type="button" @click="selectCollection(item.key)">
                  {{ item.label }}
                </button>
              </div>
              <div class="catalog-filters">
                <input v-model="filters.catalog" class="line-input" aria-label="筛选商品资料" placeholder="名称 / ID">
                <select v-model="filters.catalogShelf" class="line-input catalog-select" aria-label="上架状态">
                  <option value="">全部状态</option>
                  <option v-for="opt in CATALOG_SHELF_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <!-- 事件/茶室仍用下拉；茶叶/堂饮改用下方分类条 -->
                <select
                  v-if="!supportsProductShelf()"
                  v-model="filters.catalogCategory"
                  class="line-input catalog-select"
                  aria-label="分类"
                >
                  <option value="">全部分类</option>
                  <option v-for="cat in catalogCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
                </select>
                <select v-model="filters.catalogFlag" class="line-input catalog-select" aria-label="标记">
                  <option v-for="opt in CATALOG_FLAG_OPTIONS" :key="opt.value || 'all'" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>
            <!-- 方案 A：顶部分类胶囊筛选 + 配置入口 -->
            <div
              v-if="supportsProductShelf() && state.activeTab === 'catalog'"
              class="catalog-category-bar"
              role="tablist"
              :aria-label="isDrinksCollection() ? '按档位筛选' : '按分类筛选'"
            >
              <button
                type="button"
                role="tab"
                :aria-selected="!filters.catalogCategory"
                :class="['catalog-cat-chip', { active: !filters.catalogCategory }]"
                @click="setCatalogCategoryFilter('')"
              >全部</button>
              <button
                v-for="cat in managedCategoryNames"
                :key="`chip-${cat}`"
                type="button"
                role="tab"
                :aria-selected="filters.catalogCategory === cat"
                :class="['catalog-cat-chip', { active: filters.catalogCategory === cat }]"
                @click="setCatalogCategoryFilter(cat)"
              >{{ cat }}</button>
              <button
                v-if="hasPermission('catalog.write')"
                type="button"
                class="catalog-cat-config ghost-button small"
                @click="openCategoryManager"
              >{{ isDrinksCollection() ? "配置档位" : "配置分类" }}</button>
            </div>
            <div class="list-header">
              <h2>{{ catalogListTitle }}</h2>
              <div class="list-header-actions">
                <template v-if="hasPermission('catalog.write') && state.selectedCatalogIds.length">
                  <span class="batch-count">已选 {{ state.selectedCatalogIds.length }}</span>
                  <button class="ghost-button small" type="button" @click="batchCatalogShelf('off')">批量下架</button>
                  <button class="ghost-button small" type="button" @click="batchCatalogShelf('on')">批量上架</button>
                  <button class="ghost-button small" type="button" @click="clearCatalogSelection">取消选择</button>
                </template>
                <button
                  v-if="hasPermission('catalog.write')"
                  class="primary-action small"
                  type="button"
                  @click="resetCatalog"
                >
                  新建
                </button>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <caption>{{ catalogListTitle }}</caption>
                <thead>
                  <tr>
                    <th scope="col" class="col-check">
                      <input
                        type="checkbox"
                        :checked="allFilteredCatalogSelected"
                        :disabled="!filteredCatalog.length"
                        aria-label="全选当前列表"
                        @change="toggleSelectAllFilteredCatalog($event.target.checked)"
                        @click.stop
                      >
                    </th>
                    <th scope="col">{{ catalogTableCols.name }}</th>
                    <th scope="col">{{ catalogTableCols.category }}</th>
                    <th scope="col">{{ catalogTableCols.price }}</th>
                    <th scope="col">{{ catalogTableCols.meta }}</th>
                    <th scope="col">{{ catalogTableCols.stock }}</th>
                    <th scope="col">状态</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in filteredCatalog"
                    :key="item.id"
                    :class="['interactive-row', { selected: state.catalogDrawerOpen && state.selectedCatalogId === item.id }]"
                    role="button"
                    tabindex="0"
                    :aria-selected="state.catalogDrawerOpen && state.selectedCatalogId === item.id"
                    :aria-label="`编辑资料：${displayName(item)}`"
                    @click="editCatalog(item)"
                    @keydown.enter.prevent="editCatalog(item)"
                    @keydown.space.prevent="editCatalog(item)"
                  >
                    <td class="col-check" @click.stop>
                      <input
                        type="checkbox"
                        :checked="state.selectedCatalogIds.includes(item.id)"
                        :aria-label="`选择 ${displayName(item)}`"
                        @change="toggleCatalogRowSelect(item.id, $event.target.checked)"
                      >
                    </td>
                    <td><strong>{{ displayName(item) }}</strong><small>{{ item.id }}</small></td>
                    <td>{{ displayCatalogCategory(item) }}</td>
                    <td>{{ displayCatalogPrice(item) }}</td>
                    <td>{{ displayCatalogMeta(item) }}</td>
                    <td>{{ displayInventory(item) }}</td>
                    <td>
                      <span
                        :class="[
                          'status-pill',
                          isCatalogRemoved(item) || isCatalogOffShelf(item) || deriveCatalogShelfStatus(item) === 'draft' ? 'neutral' : 'good'
                        ]"
                      >{{ catalogStatusLabel(item) }}</span>
                    </td>
                    <td>
                      <div class="row-actions" @click.stop>
                        <button v-if="hasPermission('catalog.write')" class="ghost-button small" type="button" @click="editCatalog(item)">编辑</button>
                        <button v-if="hasPermission('catalog.write')" class="ghost-button small" type="button" @click="toggleCatalog(item)">{{ isCatalogOffShelf(item) ? "恢复" : "下架" }}</button>
                        <button
                          v-if="hasPermission('catalog.write') && isCatalogOffShelf(item)"
                          class="ghost-button small danger-text"
                          type="button"
                          @click="removeCatalog(item)"
                        >删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="filteredCatalog.length === 0" :title="emptyTitle('catalog')" :hint="emptyHint('catalog')" :action-label="emptyActionLabel('catalog')" @action="handleEmptyAction('catalog')" />
          </article>

          <!-- 右侧滑出编辑：不全屏并排占版面 -->
          <div v-if="state.catalogDrawerOpen" class="editor-drawer" role="dialog" aria-modal="true" :aria-label="isCreatingCatalog ? `新建${catalogEntityLabel}` : `编辑${catalogEntityLabel}`">
            <div class="editor-drawer-mask" @click="closeCatalogDrawer"></div>
            <aside class="panel-card editor-panel drawer-panel">
              <div class="panel-title">
                <h2>{{ isCreatingCatalog ? `新建${catalogEntityLabel}` : `编辑${catalogEntityLabel}` }}</h2>
                <button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeCatalogDrawer">×</button>
              </div>
              <p class="editor-hint">
                {{ isDrinksCollection()
                  ? "标 * 为必填：茶品名称、所属档位、主图。价格留空跟随档位价。"
                  : isTeaProductsCollection()
                    ? "标 * 为必填：名称、类别、上架状态、销售规格（名/售价/库存）、主图。产地·年份·口感可空。"
                    : "填写前台展示与履约所需信息后保存。" }}
              </p>
              <form class="editor-grid" @submit.prevent="saveCatalog">
                <label v-if="!isCreatingCatalog"><span>编号</span><input :value="forms.catalog.id" readonly></label>
                <input v-if="isCreatingCatalog" type="hidden" v-model="forms.catalog.id">

                <!-- ===== 商城茶叶 ===== -->
                <template v-if="isTeaProductsCollection()">
                  <label>
                    <span>名称 <em class="req" aria-label="必填">*</em></span>
                    <input v-model="forms.catalog.name" required placeholder="例如：有机红茶">
                  </label>
                  <label>
                    <span>类别 <em class="req" aria-label="必填">*</em></span>
                    <select v-model="catalogCategoryChoice" class="catalog-select-input" required @change="onCatalogCategoryChoiceChange">
                      <option v-for="cat in catalogCategorySelectOptions" :key="cat" :value="cat">{{ cat }}</option>
                      <option :value="SELECT_CUSTOM_VALUE">自定义…</option>
                    </select>
                  </label>
                  <label v-if="catalogCategoryChoice === SELECT_CUSTOM_VALUE">
                    <span>自定义类别 <em class="req" aria-label="必填">*</em></span>
                    <input v-model="forms.catalog.category" required placeholder="输入新类别名，保存时自动登记">
                  </label>
                  <label>
                    <span>上架状态 <em class="req" aria-label="必填">*</em></span>
                    <select v-model="forms.catalog.shelfStatus" class="catalog-select-input" required @change="applyCatalogShelfStatus(forms.catalog.shelfStatus)">
                      <option v-for="opt in CATALOG_SHELF_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </label>
                  <label><span>产地</span><input v-model="forms.catalog.origin" placeholder="选填，前台详情展示"></label>
                  <div class="year-picker-field">
                    <span>年份</span>
                    <div class="year-picker" :class="{ open: yearPickerOpen }">
                      <button
                        type="button"
                        class="year-picker-trigger catalog-select-input"
                        :aria-expanded="yearPickerOpen"
                        aria-haspopup="dialog"
                        @click="toggleYearPicker"
                      >
                        {{ forms.catalog.year || "选择年份（可空）" }}
                      </button>
                      <div v-if="yearPickerOpen" class="year-picker-panel" role="dialog" aria-label="选择年份">
                        <div class="year-picker-header">
                          <button type="button" class="year-picker-nav" aria-label="上一个十年" @click="shiftYearPickerDecade(-10)">‹</button>
                          <strong>{{ yearPickerRangeLabel }}</strong>
                          <button type="button" class="year-picker-nav" aria-label="下一个十年" @click="shiftYearPickerDecade(10)">›</button>
                        </div>
                        <div class="year-picker-grid">
                          <button
                            v-for="cell in yearPickerCells"
                            :key="cell.year"
                            type="button"
                            class="year-picker-cell"
                            :class="{
                              muted: !cell.inDecade,
                              active: String(forms.catalog.year) === cell.label,
                              disabled: cell.disabled
                            }"
                            :disabled="cell.disabled"
                            @click="selectTeaYear(cell.year)"
                          >{{ cell.label }}</button>
                        </div>
                        <div class="year-picker-footer">
                          <button type="button" class="ghost-button small" @click="selectTeaYear('')">不填</button>
                          <button type="button" class="ghost-button small" @click="closeYearPicker">关闭</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="wide specs-editor">
                    <div class="specs-editor-head">
                      <strong>销售规格 <em class="req" aria-label="必填">*</em></strong>
                      <button type="button" class="ghost-button small" @click="addCatalogSpec">＋ 添加规格</button>
                    </div>
                    <p class="specs-editor-hint">至少 1 条。规格名 / 售价 / 库存为必填；净含量选填。每个规格独立库存，首条为列表展示价。</p>
                    <table class="specs-table">
                      <thead>
                        <tr>
                          <th>规格名 <em class="req">*</em></th>
                          <th>净含量</th>
                          <th>售价 <em class="req">*</em></th>
                          <th>库存 <em class="req">*</em></th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(spec, index) in forms.catalog.specs" :key="`spec-${index}`">
                          <td><input v-model="spec.label" placeholder="一泡 / 50g" required @change="syncCatalogPriceFromSpecs"></td>
                          <td><input v-model="spec.weight" placeholder="5g"></td>
                          <td><input v-model.number="spec.price" type="number" min="0" step="0.01" required @change="syncCatalogPriceFromSpecs"></td>
                          <td><input v-model.number="spec.stock" type="number" min="0" step="1" required @change="syncCatalogStockFromSpecs"></td>
                          <td>
                            <button v-if="forms.catalog.specs.length > 1" type="button" class="ghost-button small danger-text" @click="removeCatalogSpec(index)">删</button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p class="specs-editor-hint">合计可售库存：{{ forms.catalog.stock || 0 }}</p>
                  </div>

                  <div class="wide image-dropzone-field">
                    <span>主图 <em class="req" aria-label="必填">*</em></span>
                    <div
                      class="image-dropzone"
                      :class="{ filled: !!catalogImagePreview, dragging: catalogImageDragOver }"
                      role="button"
                      tabindex="0"
                      :aria-label="catalogImagePreview ? '更换主图' : '上传主图'"
                      @click="triggerCatalogImagePick"
                      @keydown.enter.prevent="triggerCatalogImagePick"
                      @dragover.prevent="catalogImageDragOver = true"
                      @dragleave.prevent="catalogImageDragOver = false"
                      @drop.prevent="onCatalogImageDrop"
                    >
                      <input
                        ref="catalogImageInput"
                        class="image-dropzone-input"
                        accept="image/*"
                        type="file"
                        @change="uploadFormImage('catalog', $event)"
                        @click.stop
                      >
                      <template v-if="catalogImagePreview">
                        <img :src="catalogImagePreview" alt="商品主图预览">
                        <div class="image-dropzone-mask">更换图片</div>
                      </template>
                      <div v-else class="image-dropzone-empty">
                        <Upload :size="28" :stroke-width="1.6" />
                        <strong>点击上传主图</strong>
                        <span>{{ uploadState.catalog || "或将图片拖到此处 · JPG / PNG · 建议 1:1" }}</span>
                      </div>
                    </div>
                  </div>
                  <label class="wide"><span>口感</span><textarea v-model="forms.catalog.taste" rows="3" placeholder="选填，商城列表与详情展示"></textarea></label>
                </template>

                <!-- ===== 堂饮：档位下的茶品 ===== -->
                <template v-else-if="isDrinksCollection()">
                  <label><span>茶品名称</span><input v-model="forms.catalog.name" required placeholder="古树红茶 / 花香大红袍…"></label>
                  <label>
                    <span>所属档位</span>
                    <select v-model="catalogCategoryChoice" class="catalog-select-input" required @change="onCatalogCategoryChoiceChange">
                      <option v-for="cat in catalogCategorySelectOptions" :key="cat" :value="cat">{{ cat }}</option>
                    </select>
                  </label>
                  <label>
                    <span>价格</span>
                    <input v-model.number="forms.catalog.price" type="number" min="0" step="0.01" placeholder="留空跟随档位价">
                  </label>
                  <p class="wide specs-editor-hint">
                    价格留空时自动用档位价（¥{{ drinkTierPrice }}）；填了则本茶款单独计价。
                  </p>
                  <label>
                    <span>上架状态</span>
                    <select v-model="forms.catalog.shelfStatus" class="catalog-select-input" @change="applyCatalogShelfStatus(forms.catalog.shelfStatus)">
                      <option v-for="opt in CATALOG_SHELF_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </label>
                  <label>
                    <span>分组</span>
                    <input v-model="forms.catalog.groupName" placeholder="如红茶、普洱、单丛…">
                  </label>
                  <label class="wide"><span>副标题</span><input v-model="forms.catalog.subtitle" placeholder="点单卡片副文案，可空"></label>

                  <div class="wide image-dropzone-field">
                    <span>茶品图 <em class="req" aria-label="必填">*</em></span>
                    <div
                      class="image-dropzone"
                      :class="{ filled: !!catalogImagePreview, dragging: catalogImageDragOver }"
                      role="button"
                      tabindex="0"
                      :aria-label="catalogImagePreview ? '更换茶品图' : '上传茶品图'"
                      @click="triggerCatalogImagePick"
                      @keydown.enter.prevent="triggerCatalogImagePick"
                      @dragover.prevent="catalogImageDragOver = true"
                      @dragleave.prevent="catalogImageDragOver = false"
                      @drop.prevent="onCatalogImageDrop"
                    >
                      <input
                        ref="catalogImageInput"
                        class="image-dropzone-input"
                        accept="image/*"
                        type="file"
                        @change="uploadFormImage('catalog', $event)"
                        @click.stop
                      >
                      <template v-if="catalogImagePreview">
                        <img :src="catalogImagePreview" alt="茶品图预览">
                        <div class="image-dropzone-mask">更换图片</div>
                      </template>
                      <div v-else class="image-dropzone-empty">
                        <Upload :size="28" :stroke-width="1.6" />
                        <strong>点击上传茶品图</strong>
                        <span>{{ uploadState.catalog || "或将图片拖到此处 · 点单卡片用图" }}</span>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- ===== 茶室 / 活动：维持履约字段（非商品最小集） ===== -->
                <template v-else>
                  <label><span>名称</span><input v-model="forms.catalog.name" :placeholder="state.collection === 'events' ? '可留空，使用标题' : '茶室名称'"></label>
                  <label v-if="state.collection === 'events'"><span>标题</span><input v-model="forms.catalog.title" required placeholder="活动标题"></label>
                  <template v-if="state.collection === 'events'">
                    <label>
                      <span>分类</span>
                      <select v-model="catalogCategoryChoice" class="catalog-select-input" required @change="onCatalogCategoryChoiceChange">
                        <option v-for="cat in catalogCategorySelectOptions" :key="cat" :value="cat">{{ cat }}</option>
                        <option :value="SELECT_CUSTOM_VALUE">自定义…</option>
                      </select>
                    </label>
                    <label v-if="catalogCategoryChoice === SELECT_CUSTOM_VALUE">
                      <span>自定义分类</span>
                      <input v-model="forms.catalog.category" required placeholder="与小程序活动 Tab 对齐更佳">
                    </label>
                  </template>
                  <label>
                    <span>状态 <em v-if="state.collection === 'events'" class="req">*</em></span>
                    <select v-model="forms.catalog.status" class="catalog-select-input" required>
                      <option v-for="opt in catalogStatusSelectOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                  </label>
                  <p v-if="state.collection === 'events'" class="wide specs-editor-hint">
                    前台状态由此控制：敬请期待（默认不可报）→ 报名中（可报）→ 已满/已结束/已取消。人数满时前台自动显示已满。
                  </p>
                  <label v-if="state.collection === 'events'"><span>价格</span><input v-model.number="forms.catalog.price" type="number" min="0" step="0.01"></label>
                  <label v-if="state.collection === 'events'"><span>名额</span><input v-model.number="forms.catalog.quota" type="number" min="1"></label>
                  <label v-if="state.collection === 'events'"><span>已报名</span><input v-model.number="forms.catalog.signed" type="number" min="0"></label>
                  <label v-if="state.collection === 'events'">
                    <span>日期</span>
                    <input v-model="catalogDateIso" type="date" @change="onCatalogDateIsoChange">
                  </label>
                  <label v-if="state.collection === 'events' && forms.catalog.date" class="field-hint-label">
                    <span>前台展示</span>
                    <input :value="forms.catalog.date" readonly>
                  </label>
                  <label v-if="state.collection === 'events'">
                    <span>时间</span>
                    <input v-model="forms.catalog.time" type="time" step="60">
                  </label>
                  <label v-if="state.collection === 'events'"><span>地点</span><input v-model="forms.catalog.place" placeholder="活动地点"></label>
                  <div class="wide image-dropzone-field">
                    <span>图片 <em class="req" aria-label="必填">*</em></span>
                    <div
                      class="image-dropzone"
                      :class="{ filled: !!catalogImagePreview, dragging: catalogImageDragOver }"
                      role="button"
                      tabindex="0"
                      :aria-label="catalogImagePreview ? '更换图片' : '上传图片'"
                      @click="triggerCatalogImagePick"
                      @keydown.enter.prevent="triggerCatalogImagePick"
                      @dragover.prevent="catalogImageDragOver = true"
                      @dragleave.prevent="catalogImageDragOver = false"
                      @drop.prevent="onCatalogImageDrop"
                    >
                      <input
                        ref="catalogImageInput"
                        class="image-dropzone-input"
                        accept="image/*"
                        type="file"
                        @change="uploadFormImage('catalog', $event)"
                        @click.stop
                      >
                      <template v-if="catalogImagePreview">
                        <img :src="catalogImagePreview" alt="图片预览">
                        <div class="image-dropzone-mask">更换图片</div>
                      </template>
                      <div v-else class="image-dropzone-empty">
                        <Upload :size="28" :stroke-width="1.6" />
                        <strong>点击上传图片</strong>
                        <span>{{ uploadState.catalog || "或将图片拖到此处 · JPG / PNG" }}</span>
                      </div>
                    </div>
                  </div>
                  <label v-if="state.collection === 'events'" class="wide"><span>简介</span><textarea v-model="forms.catalog.summary" rows="3"></textarea></label>
                </template>

                <div class="drawer-actions wide">
                  <button type="button" class="secondary-action" @click="closeCatalogDrawer">取消</button>
                  <button
                    v-if="hasPermission('catalog.write') && !isCreatingCatalog && isCatalogOffShelf(forms.catalog)"
                    class="danger-action"
                    type="button"
                    @click="removeCatalog(forms.catalog)"
                  >删除</button>
                  <button v-if="hasPermission('catalog.write')" class="primary-action" type="submit">{{ isCreatingCatalog ? "创建并上架" : "保存" }}</button>
                  <div v-else class="permission-note">当前角色仅可查看。</div>
                </div>
              </form>
            </aside>
          </div>

          <!-- 方案 A：配置分类/档位 — 居中宽弹窗（非窄侧栏） -->
          <div
            v-if="state.categoryManagerOpen"
            class="category-modal-backdrop"
            role="dialog"
            aria-modal="true"
            :aria-label="isDrinksCollection() ? '配置堂饮档位' : '配置茶叶分类'"
            @click.self="closeCategoryManager"
            @keydown.esc.prevent="closeCategoryManager"
          >
            <div class="category-modal panel-card">
              <div class="panel-title">
                <h2>{{ isDrinksCollection() ? "配置档位" : "配置分类" }}</h2>
                <button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeCategoryManager">×</button>
              </div>
              <p class="editor-hint">
                {{ isDrinksCollection()
                  ? "档位＝点单左侧（初见/知味…），含价格与主图；茶品在列表「新建」并挂到档位下。"
                  : "分类决定商城侧栏与列表筛选。排序越小越靠前。可在上方胶囊条快速筛选商品。" }}
              </p>
              <form class="editor-grid category-manager-form" @submit.prevent="saveManagedCategory">
                <label>
                  <span>{{ isDrinksCollection() ? "档位名称" : "类别名称" }} <em class="req">*</em></span>
                  <input v-model="categoryForm.name" required maxlength="20" :placeholder="isDrinksCollection() ? '如：初见' : '如：红茶'">
                </label>
                <label>
                  <span>排序</span>
                  <input v-model.number="categoryForm.sort" type="number" min="0" step="1">
                </label>
                <template v-if="isDrinksCollection()">
                  <label>
                    <span>价格 <em class="req">*</em></span>
                    <input v-model.number="categoryForm.price" type="number" min="0" step="0.01" required>
                  </label>
                  <label>
                    <span>单位 <em class="req">*</em></span>
                    <input v-model="categoryForm.unit" required placeholder="道 / 壶">
                  </label>
                  <label class="wide">
                    <span>标语</span>
                    <input v-model="categoryForm.tagline" placeholder="点单页大图下一句话">
                  </label>
                  <label>
                    <span>冲泡</span>
                    <input v-model="categoryForm.brewStyle" placeholder="热泡茶">
                  </label>
                  <label class="file-picker wide">
                    <span>档位主图</span>
                    <Upload :size="17" :stroke-width="1.8" />
                    <input accept="image/*" type="file" @change="uploadFormImage('category', $event)">
                    <em>{{ uploadState.category || "点击上传到云存储" }}</em>
                  </label>
                  <div class="wide catalog-image-preview">
                    <img v-if="displayImage(categoryForm.image)" :src="displayImage(categoryForm.image)" alt="档位主图预览">
                    <div v-else-if="categoryForm.image && String(categoryForm.image).startsWith('cloud://')" class="catalog-image-placeholder">已绑定云存储图片</div>
                    <div v-else class="catalog-image-placeholder">上传后点单页大图即用此图</div>
                  </div>
                </template>
                <label class="wide category-manager-actions">
                  <span></span>
                  <div class="row-actions">
                    <button v-if="categoryForm.id" type="button" class="ghost-button small" @click="resetCategoryForm">清空表单</button>
                    <button class="primary-action small" type="submit">{{ categoryForm.id ? "保存" : (isDrinksCollection() ? "添加档位" : "添加分类") }}</button>
                  </div>
                </label>
              </form>
              <div class="table-wrap category-manager-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{{ isDrinksCollection() ? "档位" : "分类" }}</th>
                      <th v-if="isDrinksCollection()" scope="col">价格</th>
                      <th scope="col">排序</th>
                      <th scope="col">商品数</th>
                      <th scope="col">状态</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in managedCategoriesWithCount" :key="item.id">
                      <td><strong>{{ item.name }}</strong><small>{{ item.id }}</small></td>
                      <td v-if="isDrinksCollection()">¥{{ money(item.price) }} / {{ item.unit || item.badge || "道" }}</td>
                      <td>{{ item.sort ?? "-" }}</td>
                      <td>{{ item.productCount }}</td>
                      <td>
                        <span :class="['status-pill', item.visible === false ? 'neutral' : 'good']">
                          {{ item.visible === false ? "已停用" : "启用" }}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="ghost-button small" type="button" @click="editManagedCategory(item)">编辑</button>
                          <button class="ghost-button small" type="button" @click="setCatalogCategoryFilter(item.name); closeCategoryManager()">看商品</button>
                          <button class="ghost-button small" type="button" @click="toggleManagedCategory(item)">
                            {{ item.visible === false ? "启用" : "停用" }}
                          </button>
                          <button class="ghost-button small danger-text" type="button" @click="removeManagedCategory(item)">删除</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <EmptyState
                  v-if="!managedCategoriesWithCount.length"
                  :title="isDrinksCollection() ? '还没有档位' : '还没有分类'"
                  :hint="isDrinksCollection() ? '先添加初见/知味等档位，再在列表新建茶品。' : '先添加分类，再建商品时下拉选择。'"
                />
              </div>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeCategoryManager">完成</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="state.activeTab === 'orders'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar order-biz-toolbar">
              <div class="order-biz-tabs" role="tablist" aria-label="订单视图">
                <button
                  v-for="opt in ORDER_QUEUE_OPTIONS"
                  :key="`queue-${opt.value}`"
                  type="button"
                  role="tab"
                  :aria-selected="filters.orderQueue === opt.value"
                  :class="['order-biz-tab', { active: filters.orderQueue === opt.value }]"
                  @click="setOrderQueue(opt.value)"
                >{{ opt.label }}</button>
              </div>
              <div class="order-biz-tabs" role="tablist" aria-label="订单业务线">
                <button
                  v-for="opt in ORDER_BIZ_OPTIONS"
                  :key="opt.value || 'all'"
                  type="button"
                  role="tab"
                  :aria-selected="filters.orderBizType === opt.value"
                  :class="['order-biz-tab', { active: filters.orderBizType === opt.value }]"
                  @click="setOrderBizType(opt.value)"
                >{{ opt.label }}</button>
              </div>
              <select
                v-if="filters.orderQueue === 'all'"
                v-model="filters.orderStatus"
                class="line-input"
                aria-label="筛选订单状态"
                @change="resetPageAndLoad('orders', loadOrders)"
              >
                <option value="">全部状态</option>
                <option>待支付</option><option>已付款</option><option>制作中</option><option>待确认</option><option>待发货</option><option>待自提</option><option>已发货</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-model="filters.orderKeyword" class="line-input" aria-label="搜索订单" placeholder="订单号 / 姓名 / 手机 / 桌号" @keydown.enter="resetPageAndLoad('orders', loadOrders)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('orders', loadOrders)">搜索</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportOrders">{{ exportScopeLabel }}</button>
            </div>
            <p class="order-queue-hint">{{ orderQueueHint() }}</p>

            <div class="record-list">
              <button v-for="order in state.orders" :key="order._id" :class="['record-row', { selected: state.drawers.order && state.selectedOrderId === order._id }]" type="button" @click="selectOrder(order)">
                <strong>
                  <span class="order-row-title">
                    <i :class="['biz-badge', orderBizTypeOf(order) === 'dinein' ? 'biz-dinein' : 'biz-retail']">{{ orderBizLabel(order) }}</i>
                    <span>{{ order.orderNo || order._id }}</span>
                  </span>
                  <em>¥{{ money(order.total) }}</em>
                </strong>
                <span class="record-meta">
                  <span>{{ orderFulfillmentLabel(order) }}{{ order.tableNo ? ` · 桌${order.tableNo}` : '' }} · {{ orderContactLabel(order) }} · {{ formatDate(order.createdAt) }}</span>
                  <i :class="['record-status', statusTone(order.status)]">{{ order.status }}</i>
                </span>
              </button>
              <EmptyState v-if="state.orders.length === 0" :title="emptyTitle('orders')" :hint="emptyHint('orders')" :action-label="emptyActionLabel('orders')" @action="handleEmptyAction('orders')" />
            </div>
            <div v-if="pageMetaFor('orders').total > pageMetaFor('orders').pageSize" class="pager">
              <span>{{ pageRangeText('orders') }}</span>
              <button type="button" :disabled="pageMetaFor('orders').page <= 1" @click="changePage('orders', -1, loadOrders)">上一页</button>
              <button type="button" :disabled="pageMetaFor('orders').page >= pageMetaFor('orders').pageCount" @click="changePage('orders', 1, loadOrders)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.order && selectedOrder" class="editor-drawer" role="dialog" aria-modal="true" aria-label="订单详情">
            <div class="editor-drawer-mask" @click="closeDrawer('order')"></div>
            <aside class="panel-card detail-panel drawer-panel">
            <div class="panel-title"><h2>订单详情</h2><span :class="['status-pill', statusTone(selectedOrder.status)]">{{ selectedOrder.status }}</span><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('order')">×</button></div>
            <DetailRow label="订单号" :value="selectedOrder.orderNo || selectedOrder._id" />
            <DetailRow label="业务线" :value="orderBizLabel(selectedOrder)" />
            <DetailRow label="金额" :value="`¥${money(selectedOrder.total)}`" />
            <DetailRow label="支付" :value="selectedOrder.payMode === 'manual' ? (selectedOrder.payStatus === 'manual' ? '免支付·待确认' : (selectedOrder.payStatus || '免支付')) : (selectedOrder.payStatus || '-')" />
            <DetailRow label="履约" :value="orderFulfillmentLabel(selectedOrder)" />
            <DetailRow label="桌号" :value="selectedOrder.tableNo || '—'" />
            <DetailRow label="运费" :value="selectedOrder.deliveryMethod === 'shipping' ? ((selectedOrder.freightCollect || selectedOrder.shippingPayMode === 'collect') ? '快递到付（签收付快递员）' : (`在线 ¥${money(selectedOrder.shippingFee)}`)) : '—'" />
            <DetailRow label="客户" :value="selectedOrder.consignee || selectedOrder.name || selectedOrder.contactName || '-'" />
            <DetailRow label="电话" :value="selectedOrder.phone || selectedOrder.mobile || '-'" />
            <DetailRow label="地址/备注" :value="selectedOrder.address || selectedOrder.pickupNote || selectedOrder.remark || '-'" />
            <DetailRow label="创建时间" :value="formatDate(selectedOrder.createdAt)" />
            <div class="line-items" v-if="selectedOrder.items?.length">
              <div v-for="item in selectedOrder.items" :key="item.id || item.name" class="line-item">
                <span>{{ item.name || item.id || "商品" }}</span>
                <strong>x{{ item.quantity || 1 }}</strong>
              </div>
            </div>
            <div class="record-timeline" v-if="orderTimeline(selectedOrder).length">
              <h3>处理时间线</h3>
              <div v-for="step in orderTimeline(selectedOrder)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                <span></span>
                <strong>{{ step.title }}</strong>
                <small>{{ formatDate(step.time) }}</small>
                <p>{{ step.detail || "-" }}</p>
              </div>
            </div>
            <DetailRow label="微信发货" :value="wxShippingStatusText(selectedOrder)" />
            <div class="ship-box" v-if="selectedOrder.status === '待发货'">
              <label>
                <span>快递公司</span>
                <select v-model="orderForm.trackingCompany" aria-label="快递公司">
                  <option v-for="item in EXPRESS_COMPANY_OPTIONS" :key="item.code" :value="item.code">{{ item.label }}（{{ item.code }}）</option>
                </select>
              </label>
              <label><span>快递单号</span><input v-model="orderForm.trackingNo" placeholder="填写后标记发货，将同步微信"></label>
            </div>
            <label v-if="selectedOrder.status === '待支付' || selectedOrder.status === '待确认'" class="cancel-box">
              <span>取消原因</span>
              <input v-model="orderForm.cancelReason" placeholder="必填，审计日志会记录">
            </label>
            <div class="action-row">
              <button v-if="selectedOrder.status === '待确认' && hasPermission('order.write')" class="primary-action" type="button" @click="orderAction('confirm', selectedOrder)">确认接单</button>
              <button v-if="(selectedOrder.status === '已付款' || selectedOrder.status === '制作中') && hasPermission('order.write')" class="secondary-action" type="button" @click="orderAction('prepareDone', selectedOrder)">标记完成（可选）</button>
              <button v-if="selectedOrder.status === '待发货' && hasPermission('order.write')" class="secondary-action" type="button" @click="orderAction('ship', selectedOrder)">标记发货</button>
              <button v-if="selectedOrder.status === '待自提' && hasPermission('order.write')" class="secondary-action" type="button" @click="orderAction('pickup', selectedOrder)">完成自提</button>
              <button
                v-if="hasPermission('order.write') && selectedOrder.transactionId && !selectedOrder.wxShippingUploaded"
                class="secondary-action"
                type="button"
                @click="orderAction('retryWxShipping', selectedOrder)"
              >重试微信发货同步</button>
              <button v-if="(selectedOrder.status === '待支付' || selectedOrder.status === '待确认') && hasPermission('order.write')" class="danger-action" type="button" @click="orderAction('cancel', selectedOrder)">取消订单</button>
              <button v-if="hasPermission('afterSale.write')" class="secondary-action" type="button" @click="startAfterSale(selectedOrder)">转售后处理</button>
              <div v-if="!hasPermission('order.write') && !hasPermission('afterSale.write')" class="permission-note">当前角色仅可查看订单。</div>
            </div>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'afterSales'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-model="filters.afterSaleStatus" class="line-input" aria-label="筛选售后状态" @change="resetPageAndLoad('afterSales', loadAfterSales)">
                <option value="">全部售后</option>
                <option>申请售后</option><option>审核中</option><option>已退款</option><option>已拒绝</option><option>已关闭</option>
              </select>
              <input v-model="filters.afterSaleKeyword" class="line-input" aria-label="搜索售后记录" placeholder="订单号、姓名、手机号、原因" @keydown.enter="resetPageAndLoad('afterSales', loadAfterSales)">
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportAfterSales">{{ exportScopeLabel }}</button>
            </div>
            <div class="record-list">
              <button
                v-for="order in state.afterSales"
                :key="order._id"
                :class="['record-row', { selected: state.drawers.afterSale && state.selectedAfterSaleId === order._id }]"
                type="button"
                @click="selectAfterSale(order)"
              >
                <strong><span>{{ order.orderNo || order._id }}</span><em>¥{{ money(order.total) }}</em></strong>
                <span class="record-meta">
                  <span>{{ maskName(order.name || order.contactName || order.consignee) || "访客" }} · {{ formatDate(order.afterSaleUpdatedAt || order.updatedAt) }}</span>
                  <i :class="['record-status', statusTone(order.afterSaleStatus || order.status)]">{{ order.afterSaleStatus || order.status }}</i>
                </span>
              </button>
              <EmptyState v-if="state.afterSales.length === 0" :title="emptyTitle('afterSales')" :hint="emptyHint('afterSales')" :action-label="emptyActionLabel('afterSales')" @action="handleEmptyAction('afterSales')" />
            </div>
            <div v-if="pageMetaFor('afterSales').total > pageMetaFor('afterSales').pageSize" class="pager">
              <span>{{ pageRangeText('afterSales') }}</span>
              <button type="button" :disabled="pageMetaFor('afterSales').page <= 1" @click="changePage('afterSales', -1, loadAfterSales)">上一页</button>
              <button type="button" :disabled="pageMetaFor('afterSales').page >= pageMetaFor('afterSales').pageCount" @click="changePage('afterSales', 1, loadAfterSales)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.afterSale && selectedAfterSale" class="editor-drawer" role="dialog" aria-modal="true" aria-label="售后处理">
            <div class="editor-drawer-mask" @click="closeDrawer('afterSale')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>售后处理</h2><span :class="['status-pill', statusTone(selectedAfterSale.afterSaleStatus || '未处理')]">{{ selectedAfterSale.afterSaleStatus || "未处理" }}</span><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('afterSale')">×</button></div>
            <DetailRow label="订单号" :value="selectedAfterSale.orderNo || selectedAfterSale._id" />
            <DetailRow label="金额" :value="`¥${money(selectedAfterSale.total)}`" />
            <DetailRow label="客户" :value="maskName(selectedAfterSale.name || selectedAfterSale.contactName || selectedAfterSale.consignee) || '-'" />
            <div class="record-timeline" v-if="orderTimeline(selectedAfterSale).length">
              <h3>售后时间线</h3>
              <div v-for="step in orderTimeline(selectedAfterSale)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                <span></span>
                <strong>{{ step.title }}</strong>
                <small>{{ formatDate(step.time) }}</small>
                <p>{{ step.detail || "-" }}</p>
              </div>
            </div>
            <form class="editor-grid" @submit.prevent="saveAfterSale(selectedAfterSale)">
              <label><span>售后状态</span><select v-model="afterSaleForm.status"><option>申请售后</option><option>审核中</option><option>已退款</option><option>已拒绝</option><option>已关闭</option></select></label>
              <label><span>退款金额</span><input v-model.number="afterSaleForm.refundAmount" type="number" min="0"></label>
              <label class="wide"><span>售后原因</span><input v-model="afterSaleForm.reason" placeholder="如用户申请退款、商品异常"></label>
              <label class="wide"><span>处理备注</span><textarea v-model="afterSaleForm.note" rows="4"></textarea></label>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('afterSale')">关闭</button>
                <button v-if="hasPermission('afterSale.write')" class="primary-action" type="submit">保存</button>
                <div v-else class="permission-note">当前角色仅可查看售后记录。</div>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'inventory'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.inventoryKeyword" class="line-input" aria-label="搜索库存流水" placeholder="商品、订单号、类型、备注" @keydown.enter="resetPageAndLoad('inventory', loadInventoryLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('inventory', loadInventoryLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportInventoryLogs">{{ exportScopeLabel }}</button>
              <button v-if="hasPermission('inventory.write')" class="primary-action small" type="button" @click="openInventoryDrawer">调库</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>库存变化流水</caption>
                <thead><tr><th scope="col">时间</th><th scope="col">商品</th><th scope="col">类型</th><th scope="col">数量</th><th scope="col">库存变化</th><th scope="col">订单/备注</th></tr></thead>
                <tbody>
                  <tr v-for="log in state.inventoryLogs" :key="log._id">
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td><strong>{{ log.itemName || log.itemId || "-" }}</strong><small>{{ log.collection }}</small></td>
                    <td>{{ log.type || "-" }}</td>
                    <td>{{ log.quantity }}</td>
                    <td>{{ log.beforeStock }} → {{ log.afterStock }}</td>
                    <td><small>{{ log.orderNo || log.note || "-" }}</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="state.inventoryLogs.length === 0" :title="emptyTitle('inventory')" :hint="emptyHint('inventory')" :action-label="emptyActionLabel('inventory')" @action="handleEmptyAction('inventory')" />
            <div v-if="pageMetaFor('inventory').total > pageMetaFor('inventory').pageSize" class="pager">
              <span>{{ pageRangeText('inventory') }}</span>
              <button type="button" :disabled="pageMetaFor('inventory').page <= 1" @click="changePage('inventory', -1, loadInventoryLogs)">上一页</button>
              <button type="button" :disabled="pageMetaFor('inventory').page >= pageMetaFor('inventory').pageCount" @click="changePage('inventory', 1, loadInventoryLogs)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.inventory" class="editor-drawer" role="dialog" aria-modal="true" aria-label="人工调整库存">
            <div class="editor-drawer-mask" @click="closeDrawer('inventory')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>人工调整库存</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('inventory')">×</button></div>
            <form class="editor-grid" @submit.prevent="adjustInventory">
              <label>
                <span>类型</span>
                <select v-model="inventoryForm.collection" class="catalog-select-input" @change="onInventoryCollectionChange">
                  <option value="tea_products">茶叶</option>
                  <option value="drinks">堂饮茶单</option>
                </select>
              </label>
              <label>
                <span>商品</span>
                <select v-model="inventoryForm.id" class="catalog-select-input" required>
                  <option disabled value="">请选择商品</option>
                  <option
                    v-for="item in inventoryProductOptions"
                    :key="item.id"
                    :value="item.id"
                  >{{ item.name }}（库存 {{ item.stock ?? "-" }} · {{ item.id }}）</option>
                </select>
              </label>
              <p v-if="inventoryProductOptions.length === 0" class="field-inline-hint wide">暂无该类型商品，请先在商品管理中创建。</p>
              <label><span>调整数量</span><input v-model.number="inventoryForm.delta" type="number" required placeholder="正数增加，负数减少"></label>
              <label class="wide"><span>原因</span><textarea v-model="inventoryForm.note" rows="4" placeholder="盘点、损耗、补货等"></textarea></label>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('inventory')">取消</button>
                <button v-if="hasPermission('inventory.write')" class="primary-action" type="submit">确认调整</button>
                <div v-else class="permission-note">当前角色仅可查看库存流水。</div>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'reservations'" class="reservation-workspace">
          <div class="reservation-toolbar">
            <div class="calendar-strip" role="group" aria-label="预约周">
              <button type="button" aria-label="上一周" @click="shiftReservationCalendar(-1)">‹</button>
              <strong>{{ reservationWeekStartOf }}</strong>
              <button type="button" aria-label="下一周" @click="shiftReservationCalendar(1)">›</button>
              <button type="button" class="strip-today" @click="jumpReservationCalendarToday">本周</button>
            </div>
            <div class="reservation-view-tabs" role="tablist" aria-label="预约视图">
              <button type="button" role="tab" :aria-selected="state.reservationView === 'board'" :class="['order-biz-tab', { active: state.reservationView === 'board' }]" @click="state.reservationView = 'board'">排期看板</button>
              <button type="button" role="tab" :aria-selected="state.reservationView === 'list'" :class="['order-biz-tab', { active: state.reservationView === 'list' }]" @click="state.reservationView = 'list'">全部记录</button>
            </div>
            <input v-model="filters.reservationKeyword" class="line-input" aria-label="搜索茶室预约" placeholder="茶室 / 姓名 / 手机 / 单号" @keydown.enter.prevent>
            <div class="reservation-toolbar-more">
              <button class="ghost-button small" type="button" @click="resetPageAndLoad('reservations', loadReservations)">刷新</button>
              <button v-if="hasPermission('export.read')" class="ghost-button small" type="button" @click="exportReservations">导出</button>
              <button v-if="hasPermission('settings.read')" class="ghost-button small" type="button" @click="switchTab('settings')">预约设置</button>
            </div>
          </div>

          <div class="reservation-summary" v-if="reservationDayStats.total > 0">
            <span>今日共 <strong>{{ reservationDayStats.total }}</strong> 单</span>
            <span v-if="reservationDayStats.pendingPay">待支付 <strong>{{ reservationDayStats.pendingPay }}</strong></span>
            <span v-if="reservationDayStats.confirmed">已确认 <strong>{{ reservationDayStats.confirmed }}</strong></span>
            <span v-if="reservationDayStats.completed">已完成 <strong>{{ reservationDayStats.completed }}</strong></span>
            <span v-if="reservationDayStats.noshow">未到店 <strong>{{ reservationDayStats.noshow }}</strong></span>
          </div>

          <!-- 排期看板：周表格为主视图 -->
          <div v-if="state.reservationView === 'board'" class="reservation-board">
            <div class="reservation-week-table">
              <div class="week-table-head">
                <div class="week-time-col">时段</div>
                <div
                  v-for="(day, i) in reservationWeekDays"
                  :key="day"
                  class="week-day-col"
                  :class="{ today: day === todayKeyStr }"
                >{{ weekDayLabel(i) }} {{ day.slice(5) }}</div>
              </div>
              <div v-for="row in reservationWeekTable" :key="row.time" class="week-table-row">
                <div class="week-time-col mono-time">{{ row.time }}</div>
                <div
                  v-for="cell in row.cells"
                  :key="cell.day"
                  class="week-cell"
                  :class="{ busy: !!cell.record, today: cell.day === todayKeyStr }"
                  role="button"
                  tabindex="0"
                  @click="openReservationSlot(cell)"
                  @keydown.enter.prevent="openReservationSlot(cell)"
                >
                  <template v-if="cell.record">
                    <span class="week-cell-name">{{ maskName(cell.record.name || cell.record.customerName) || '访客' }}</span>
                    <span :class="['status-pill', statusTone(cell.record.status)]">{{ cell.record.status || '—' }}</span>
                  </template>
                  <span v-else class="week-cell-free">—</span>
                </div>
              </div>
              <p v-if="!reservationWeekTable.length" class="timeline-empty">暂无预约时段，请先在「预约计价」配置可约时段。</p>
            </div>
            <p class="board-tip">点击格子查看并处理预约 · 周一至周日 · 箭头切换周</p>
          </div>

          <!-- 全部记录：列表视图 -->
          <div v-else class="reservation-list-view">
            <div class="reservation-status-tabs" role="tablist" aria-label="预约状态">
              <button type="button" role="tab" :aria-selected="!filters.reservationStatus" :class="['order-biz-tab', { active: !filters.reservationStatus }]" @click="setReservationStatusFilter('')">全部</button>
              <button type="button" role="tab" :aria-selected="filters.reservationStatus === '待支付'" :class="['order-biz-tab', { active: filters.reservationStatus === '待支付' }]" @click="setReservationStatusFilter('待支付')">待支付</button>
              <button type="button" role="tab" :aria-selected="filters.reservationStatus === '已确认'" :class="['order-biz-tab', { active: filters.reservationStatus === '已确认' }]" @click="setReservationStatusFilter('已确认')">已确认</button>
              <button type="button" role="tab" :aria-selected="filters.reservationStatus === '已完成'" :class="['order-biz-tab', { active: filters.reservationStatus === '已完成' }]" @click="setReservationStatusFilter('已完成')">已完成</button>
              <button type="button" role="tab" :aria-selected="filters.reservationStatus === '已取消'" :class="['order-biz-tab', { active: filters.reservationStatus === '已取消' }]" @click="setReservationStatusFilter('已取消')">已取消</button>
            </div>
            <div class="table-wrap reservation-table-wrap">
              <table class="reservation-table">
                <caption class="sr-only">预约列表</caption>
                <thead>
                  <tr>
                    <th scope="col">状态</th>
                    <th scope="col">日期</th>
                    <th scope="col">时段</th>
                    <th scope="col">茶室</th>
                    <th scope="col">客户</th>
                    <th scope="col">人数</th>
                    <th scope="col">金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="record in reservationTableRows"
                    :key="record._id"
                    :class="{ selected: state.selectedReservationId === record._id }"
                    tabindex="0"
                    role="button"
                    :aria-selected="state.selectedReservationId === record._id"
                    @click="selectReservation(record)"
                    @keydown.enter.prevent="selectReservation(record)"
                  >
                    <td><span :class="['status-pill', statusTone(record.status)]">{{ record.status || '—' }}</span></td>
                    <td>{{ (record.day || record.date || '').slice(0, 10) }}</td>
                    <td><strong class="mono-time">{{ reservationSlotLabel(record) }}</strong></td>
                    <td>{{ record.roomName || record.room || '—' }}</td>
                    <td>
                      <strong>{{ maskName(record.name || record.customerName) || '访客' }}</strong>
                      <small v-if="record.phone || record.mobile">{{ maskPhone(record.phone || record.mobile) }}</small>
                    </td>
                    <td>{{ record.people || record.count || '—' }}</td>
                    <td>¥{{ money(record.total != null ? record.total : record.price) }}</td>
                  </tr>
                </tbody>
              </table>
              <EmptyState
                v-if="reservationTableRows.length === 0"
                :title="emptyTitle('reservations')"
                :hint="emptyHint('reservations')"
                action-label="去设置"
                @action="switchTab('settings')"
              />
            </div>
          </div>

          <!-- 预约详情抽屉 -->
          <div v-if="state.reservationDrawerOpen && selectedReservation" class="editor-drawer" role="dialog" aria-modal="true" aria-label="预约详情">
            <div class="editor-drawer-mask" @click="closeReservationDrawer"></div>
            <aside class="panel-card detail-panel drawer-panel reservation-detail-pane">
              <div class="panel-title">
                <h2>预约详情</h2>
                <span :class="['status-pill', statusTone(selectedReservation.status)]">{{ selectedReservation.status || '—' }}</span>
                <button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeReservationDrawer">×</button>
              </div>
              <p class="reservation-task-hint">{{ reservationPrimaryHint(selectedReservation) }}</p>
              <div v-if="hasPermission('reservation.write') && reservationAdminActions(selectedReservation).length" class="action-row reservation-primary-actions">
                <button
                  v-for="action in reservationAdminActions(selectedReservation)"
                  :key="`side-${action.key}`"
                  :class="action.kind === 'danger' ? 'danger-action' : (action.key === 'complete' ? 'primary-action' : 'secondary-action')"
                  type="button"
                  @click="runReservationAction(action)"
                >{{ action.label }}</button>
              </div>
              <DetailRow label="茶室" :value="selectedReservation.roomName || selectedReservation.room || selectedReservation.storeName || '-'" />
              <DetailRow label="客户" :value="maskName(selectedReservation.name || selectedReservation.customerName) || '-'" />
              <DetailRow label="电话" :value="maskPhone(selectedReservation.phone || selectedReservation.mobile) || '-'" />
              <DetailRow label="日期" :value="selectedReservation.day || selectedReservation.date || '-'" />
              <DetailRow label="时段" :value="reservationSlotLabel(selectedReservation)" />
              <DetailRow label="人数" :value="selectedReservation.people || selectedReservation.count || '-'" />
              <DetailRow label="支付" :value="reservationPayLabel(selectedReservation)" />
              <DetailRow label="金额" :value="selectedReservation.total != null || selectedReservation.price != null ? `¥${money(selectedReservation.total != null ? selectedReservation.total : selectedReservation.price)}` : '-'" />
              <DetailRow label="单号" :value="selectedReservation.reservationNo || selectedReservation._id || '-'" />
              <div class="record-timeline" v-if="recordTimeline(selectedReservation).length">
                <h3>预约时间线</h3>
                <div v-for="step in recordTimeline(selectedReservation)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                  <span></span>
                  <strong>{{ step.title }}</strong>
                  <small>{{ formatDate(step.time) }}</small>
                  <p>{{ step.detail || "-" }}</p>
                </div>
              </div>
              <div v-if="!hasPermission('reservation.write')" class="permission-note">当前角色仅可查看预约。</div>
              <p v-else-if="!reservationAdminActions(selectedReservation).length" class="permission-note">当前为终态或无可操作项。</p>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'signups'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-model="filters.signupStatus" class="line-input" aria-label="筛选报名状态" @change="resetPageAndLoad('signups', loadSignups)">
                <option value="">全部状态</option><option>待确认</option><option>已确认</option><option>已到场</option><option>未到场</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-model="filters.signupKeyword" class="line-input" aria-label="搜索活动报名" placeholder="活动、姓名、手机号" @keydown.enter="resetPageAndLoad('signups', loadSignups)">
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportSignups">{{ exportScopeLabel }}</button>
            </div>
            <div class="record-list">
              <button
                v-for="record in state.signups"
                :key="record._id"
                :class="['record-row', { selected: state.selectedSignupId === record._id }]"
                type="button"
                @click="selectSignup(record)"
              >
                <strong><span>{{ record.eventTitle || record.title || record.name || "记录" }}</span><em>{{ record.day || record.date || formatDate(record.createdAt) }}</em></strong>
                <span class="record-meta">
                  <span>{{ maskName(record.name || record.customerName) || "访客" }}</span>
                  <i :class="['record-status', statusTone(record.status)]">{{ record.status }}</i>
                </span>
              </button>
              <EmptyState v-if="state.signups.length === 0" :title="emptyTitle('signups')" :hint="emptyHint('signups')" :action-label="emptyActionLabel('signups')" @action="handleEmptyAction('signups')" />
            </div>
            <div v-if="pageMetaFor('signups').total > pageMetaFor('signups').pageSize" class="pager">
              <span>{{ pageRangeText('signups') }}</span>
              <button type="button" :disabled="pageMetaFor('signups').page <= 1" @click="changePage('signups', -1, loadSignups)">上一页</button>
              <button type="button" :disabled="pageMetaFor('signups').page >= pageMetaFor('signups').pageCount" @click="changePage('signups', 1, loadSignups)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.signup && selectedSignup" class="editor-drawer" role="dialog" aria-modal="true" aria-label="报名详情">
            <div class="editor-drawer-mask" @click="closeDrawer('signup')"></div>
            <aside class="panel-card detail-panel drawer-panel">
              <div class="panel-title"><h2>报名详情</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('signup')">×</button></div>
              <DetailRow label="活动" :value="selectedSignup.eventTitle || selectedSignup.title || '-'" />
              <DetailRow label="客户" :value="maskName(selectedSignup.name || selectedSignup.customerName) || '-'" />
              <DetailRow label="电话" :value="maskPhone(selectedSignup.phone || selectedSignup.mobile) || '-'" />
              <DetailRow label="状态" :value="selectedSignup.status || '-'" />
              <div class="record-timeline" v-if="recordTimeline(selectedSignup).length">
                <h3>报名时间线</h3>
                <div v-for="step in recordTimeline(selectedSignup)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                  <span></span>
                  <strong>{{ step.title }}</strong>
                  <small>{{ formatDate(step.time) }}</small>
                  <p>{{ step.detail || "-" }}</p>
                </div>
              </div>
              <div v-if="hasPermission('signup.write')" class="action-row">
                <button class="secondary-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已确认')">确认</button>
                <button class="secondary-action" type="button" @click="checkInSignup(selectedSignup, '已到场')">到场核销</button>
                <button class="secondary-action" type="button" @click="checkInSignup(selectedSignup, '未到场')">未到场</button>
                <button class="secondary-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已完成')">完成</button>
                <button class="danger-action" type="button" @click="updateRecord('signup', selectedSignup._id, '已取消')">取消</button>
              </div>
              <div v-else class="permission-note">当前角色仅可查看报名。</div>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'customers'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.customerKeyword" class="line-input" aria-label="搜索用户" placeholder="姓名、手机号、OpenID" @keydown.enter="resetPageAndLoad('customers', loadCustomers)">
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportCustomers">{{ exportScopeLabel }}</button>
            </div>
            <div class="record-list">
              <button v-for="customer in state.customers" :key="customer.id" :class="['record-row', { selected: state.drawers.customer && state.selectedCustomerId === customer.id }]" type="button" @click="selectCustomer(customer)">
                <strong><span>{{ customerDisplayName(customer) }}</span><em>{{ customerLevel(customer) }}</em></strong>
                <span class="record-meta">
                  <span>消费 ¥{{ money(customerSpend(customer)) }} · 订单 {{ customer.orders || 0 }}</span>
                  <i class="record-status neutral">预约 {{ customer.reservations || 0 }}</i>
                </span>
              </button>
              <EmptyState v-if="state.customers.length === 0" :title="emptyTitle('customers')" :hint="emptyHint('customers')" :action-label="emptyActionLabel('customers')" @action="handleEmptyAction('customers')" />
            </div>
            <div v-if="pageMetaFor('customers').total > pageMetaFor('customers').pageSize" class="pager">
              <span>{{ pageRangeText('customers') }}</span>
              <button type="button" :disabled="pageMetaFor('customers').page <= 1" @click="changePage('customers', -1, loadCustomers)">上一页</button>
              <button type="button" :disabled="pageMetaFor('customers').page >= pageMetaFor('customers').pageCount" @click="changePage('customers', 1, loadCustomers)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.customer && selectedCustomer" class="editor-drawer" role="dialog" aria-modal="true" aria-label="用户画像">
            <div class="editor-drawer-mask" @click="closeDrawer('customer')"></div>
            <aside class="panel-card detail-panel drawer-panel">
            <div class="panel-title"><h2>用户画像</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('customer')">×</button></div>
            <DetailRow label="标识" :value="maskOpenid(selectedCustomer.openid || selectedCustomer.id) || '-'" />
            <DetailRow label="手机号" :value="maskPhone(selectedCustomer.phone) || '-'" />
            <DetailRow label="累计消费" :value="`¥${money(customerSpend(selectedCustomer))}`" />
            <DetailRow label="积分" :value="selectedCustomer.points || 0" />
            <DetailRow label="最近访问" :value="formatDate(customerLatestAt(selectedCustomer))" />
            <div class="customer-signal">
              <span>{{ selectedCustomerSignal.title }}</span>
              <strong>{{ selectedCustomerSignal.detail }}</strong>
            </div>
            <div class="record-timeline" v-if="customerTimeline(selectedCustomer).length">
              <h3>最近互动</h3>
              <div v-for="step in customerTimeline(selectedCustomer)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                <span></span>
                <strong>{{ step.title }}</strong>
                <small>{{ formatDate(step.time) }}</small>
                <p>{{ step.detail }}</p>
              </div>
            </div>
            <div class="privacy-note">默认脱敏展示；删除个人数据会清空联系方式、地址、备注、订阅偏好和未使用优惠券。</div>
            <div class="action-row">
              <button v-if="hasPermission('export.read')" class="secondary-action" type="button" @click="exportCustomerData(selectedCustomer)">导出该用户数据</button>
              <button v-if="hasPermission('privacy.delete')" class="danger-action" type="button" @click="deleteCustomerData(selectedCustomer)">删除个人数据</button>
              <div v-if="!hasPermission('export.read') && !hasPermission('privacy.delete')" class="permission-note">当前角色仅可查看用户画像。</div>
            </div>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'content'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <span class="module-kicker">首页轮播</span>
              <button v-if="hasPermission('content.write')" class="secondary-action small icon-action" type="button" @click="resetContent"><Plus :size="15" :stroke-width="1.8" /> 新建轮播</button>
            </div>
            <div class="record-list with-images">
              <button v-for="item in state.contentItems" :key="item.key" :class="{ selected: state.selectedContentKey === item.key }" type="button" @click="editContent(item)">
                <img v-if="displayImage(item.image)" :src="displayImage(item.image)" alt="">
                <span><strong>{{ item.title || item.key }} <em>{{ item.visible === false ? "停用" : "启用" }}</em></strong><small>{{ item.subtitle || item.type }}</small></span>
              </button>
              <EmptyState v-if="state.contentItems.length === 0" :title="emptyTitle('content')" :hint="emptyHint('content')" :action-label="emptyActionLabel('content')" @action="handleEmptyAction('content')" />
            </div>
          </article>
          <div v-if="state.drawers.content" class="editor-drawer" role="dialog" aria-modal="true" aria-label="内容编辑">
            <div class="editor-drawer-mask" @click="closeDrawer('content')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>内容编辑</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('content')">×</button></div>
            <form class="editor-grid" @submit.prevent="saveContent">
              <label><span>Key</span><input v-model="forms.content.key" required></label>
              <label>
                <span>类型</span>
                <select v-model="forms.content.type" class="catalog-select-input" required>
                  <option v-for="opt in CONTENT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label><span>标题</span><input v-model="forms.content.title"></label>
              <label><span>副标题</span><input v-model="forms.content.subtitle"></label>
              <label class="wide"><span>图片 URL</span><input v-model="forms.content.image"></label>
              <label class="file-picker wide">
                <span>上传图片 · 建议 1500 × 800 px（15:8）</span>
                <Upload :size="17" :stroke-width="1.8" />
                <input accept="image/*" type="file" @change="uploadFormImage('content', $event)">
                <em>{{ uploadState.content || "主体尽量居中，其他比例在小程序首页会被裁切" }}</em>
              </label>
              <label class="wide"><span>摘要</span><textarea v-model="forms.content.summary" rows="4"></textarea></label>
              <label><span>排序</span><input v-model.number="forms.content.sort" type="number" min="0"></label>
              <label class="switch"><input v-model="forms.content.visible" type="checkbox"> 启用</label>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('content')">取消</button>
                <button v-if="hasPermission('content.write')" class="primary-action" type="submit">保存内容</button>
                <button v-if="hasPermission('content.write')" class="danger-action" type="button" @click="deleteContent(forms.content)">停用内容</button>
                <div v-else class="permission-note">当前角色仅可查看内容。</div>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'analytics'" class="analytics-layout">
          <article class="panel-card metric-card large">
            <span>总营业额</span>
            <strong>¥{{ money(state.analytics?.summary?.revenue) }}</strong>
            <p>{{ analyticsScopeText }}</p>
          </article>
          <article class="panel-card metric-card large">
            <span>已支付订单数</span>
            <strong>{{ numberText(state.analytics?.summary?.orders || 0) }}</strong>
            <p>含零售茶品和堂饮茶单订单</p>
          </article>
          <article class="panel-card metric-card large">
            <span>预约量</span>
            <strong>{{ numberText(state.analytics?.summary?.reservations || 0) }}</strong>
            <p>未取消茶室预约</p>
          </article>
          <article class="panel-card wide-table">
            <div class="panel-title"><h2>热销项目</h2></div>
            <table><caption>热销项目统计</caption><thead><tr><th scope="col">名称</th><th scope="col">类型</th><th scope="col">销售额</th><th scope="col">数量</th></tr></thead><tbody><tr v-for="item in (state.analytics?.topItems || [])" :key="item.name"><td>{{ item.name }}</td><td>{{ item.type }}</td><td>¥{{ money(item.amount) }}</td><td>{{ item.count }}</td></tr></tbody></table>
            <EmptyState v-if="(state.analytics?.topItems || []).length === 0" title="暂无热销项目" hint="有已支付订单后会自动生成销售排行。" :action-label="emptyActionLabel('analytics')" @action="handleEmptyAction('analytics')" />
          </article>
        </section>

        <section v-if="state.activeTab === 'audit'" class="list-workspace">
          <article class="panel-card data-panel audit-panel">
            <div class="panel-toolbar">
              <input v-model="filters.auditKeyword" class="line-input" aria-label="搜索审计日志" placeholder="动作、管理员、详情" @keydown.enter="resetPageAndLoad('audit', loadAuditLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('audit', loadAuditLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportAuditLogs">{{ exportScopeLabel }}</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>后台关键操作审计日志</caption>
                <thead><tr><th scope="col">时间</th><th scope="col">动作</th><th scope="col">管理员</th><th scope="col">摘要</th></tr></thead>
                <tbody>
                  <tr
                    v-for="log in state.auditLogs"
                    :key="log._id"
                    :class="['interactive-row', { selected: state.selectedAuditLogId === log._id }]"
                    role="button"
                    tabindex="0"
                    :aria-selected="state.selectedAuditLogId === log._id"
                    :aria-label="`查看审计日志：${log.action || '后台操作'}`"
                    @click="selectAuditLog(log)"
                    @keydown.enter.prevent="selectAuditLog(log)"
                    @keydown.space.prevent="selectAuditLog(log)"
                  >
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td>{{ log.action }}</td>
                    <td>{{ log.adminUid || log.adminOpenid || "-" }}</td>
                    <td><small>{{ auditSummary(log) }}</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="state.auditLogs.length === 0" :title="emptyTitle('audit')" :hint="emptyHint('audit')" :action-label="emptyActionLabel('audit')" @action="handleEmptyAction('audit')" />
            <div v-if="pageMetaFor('audit').total > pageMetaFor('audit').pageSize" class="pager">
              <span>{{ pageRangeText('audit') }}</span>
              <button type="button" :disabled="pageMetaFor('audit').page <= 1" @click="changePage('audit', -1, loadAuditLogs)">上一页</button>
              <button type="button" :disabled="pageMetaFor('audit').page >= pageMetaFor('audit').pageCount" @click="changePage('audit', 1, loadAuditLogs)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.audit && selectedAuditLog" class="editor-drawer" role="dialog" aria-modal="true" aria-label="审计详情">
            <div class="editor-drawer-mask" @click="closeDrawer('audit')"></div>
            <aside class="panel-card detail-panel drawer-panel">
            <div class="panel-title"><h2>审计详情</h2><span class="status-pill neutral">{{ selectedAuditLog.action }}</span><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('audit')">×</button></div>
            <DetailRow label="时间" :value="formatDate(selectedAuditLog.createdAt)" />
            <DetailRow label="管理员" :value="selectedAuditLog.adminUid || selectedAuditLog.adminOpenid || '-'" />
            <DetailRow label="摘要" :value="auditSummary(selectedAuditLog)" />
            <div class="change-list" v-if="auditChangeEntries(selectedAuditLog).length">
              <h3>字段变更</h3>
              <div v-for="change in auditChangeEntries(selectedAuditLog)" :key="change.field" class="change-row">
                <strong>{{ change.field }}</strong>
                <span>{{ change.before }}</span>
                <em>→</em>
                <span>{{ change.after }}</span>
              </div>
            </div>
            <div class="raw-detail">
              <h3>原始详情</h3>
              <code>{{ JSON.stringify(selectedAuditLog.detail || {}, null, 2) }}</code>
            </div>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'notifications'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.notificationKeyword" class="line-input" aria-label="搜索通知日志" placeholder="类型、OpenID、模板、原因" @keydown.enter="resetPageAndLoad('notifications', loadNotificationLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('notifications', loadNotificationLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportNotificationLogs">{{ exportScopeLabel }}</button>
              <button v-if="hasPermission('notification.write')" class="primary-action small" type="button" @click="openDrawer('notification')">测试通知</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>订阅消息投递日志</caption>
                <thead><tr><th scope="col">时间</th><th scope="col">类型</th><th scope="col">状态</th><th scope="col">模板/OpenID</th><th scope="col">原因</th></tr></thead>
                <tbody>
                  <tr v-for="log in state.notificationLogs" :key="log._id">
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td>{{ log.kind || "-" }}</td>
                    <td><span :class="['status-pill', statusTone(log.status)]">{{ log.status || "-" }}</span></td>
                    <td><strong>{{ log.templateId || "-" }}</strong><small>{{ maskOpenid(log.openid) }}</small></td>
                    <td><small>{{ log.reason || log.error || "-" }}</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="state.notificationLogs.length === 0" :title="emptyTitle('notifications')" :hint="emptyHint('notifications')" :action-label="emptyActionLabel('notifications')" @action="handleEmptyAction('notifications')" />
            <div v-if="pageMetaFor('notifications').total > pageMetaFor('notifications').pageSize" class="pager">
              <span>{{ pageRangeText('notifications') }}</span>
              <button type="button" :disabled="pageMetaFor('notifications').page <= 1" @click="changePage('notifications', -1, loadNotificationLogs)">上一页</button>
              <button type="button" :disabled="pageMetaFor('notifications').page >= pageMetaFor('notifications').pageCount" @click="changePage('notifications', 1, loadNotificationLogs)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.notification && hasPermission('notification.write')" class="editor-drawer" role="dialog" aria-modal="true" aria-label="测试通知">
            <div class="editor-drawer-mask" @click="closeDrawer('notification')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>测试通知</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('notification')">×</button></div>
            <form class="editor-grid" @submit.prevent="sendTestNotice">
              <label><span>类型</span><select v-model="noticeTestForm.kind"><option value="reservationStatus">预约状态</option><option value="eventStatus">活动报名</option><option value="orderShipped">订单发货</option><option value="orderPaid">订单支付</option></select></label>
              <label><span>OpenID</span><input v-model="noticeTestForm.openid" placeholder="用户 OpenID"></label>
              <label class="wide"><span>备注</span><textarea v-model="noticeTestForm.note" rows="3"></textarea></label>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('notification')">取消</button>
                <button class="primary-action" type="submit">发送测试</button>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'system'" class="system-grid">
          <article class="panel-card metric-card large">
            <span>正常</span>
            <strong>{{ state.systemStatus?.summary?.ok || 0 }}</strong>
            <p>已通过检查</p>
          </article>
          <article class="panel-card metric-card large">
            <span>提醒</span>
            <strong>{{ state.systemStatus?.summary?.warn || 0 }}</strong>
            <p>需要补配置</p>
          </article>
          <article class="panel-card metric-card large">
            <span>错误</span>
            <strong>{{ state.systemStatus?.summary?.error || 0 }}</strong>
            <p>会影响生产</p>
          </article>
          <article class="panel-card wide-table">
            <div class="panel-title"><h2>系统检查</h2><button class="secondary-action small" type="button" @click="loadSystemStatus">重新检查</button></div>
            <div class="status-grid">
              <div v-for="item in (state.systemStatus?.checks || [])" :key="item.key" :class="['status-check', item.status]">
                <span><CheckCircle2 :size="17" :stroke-width="1.8" /></span>
                <strong>{{ item.label }}</strong>
                <small>{{ item.detail }}</small>
              </div>
            </div>
            <EmptyState v-if="(state.systemStatus?.checks || []).length === 0" title="暂无系统检查结果" hint="重新检查后会读取当前云端配置和包体规则。" :action-label="emptyActionLabel('system')" @action="handleEmptyAction('system')" />
          </article>
          <article v-if="(state.systemStatus?.functionHealth?.results || []).length" class="panel-card wide-table">
            <div class="panel-title">
              <h2>云函数探测明细</h2>
              <span>{{ state.systemStatus.functionHealth.passed.length }}/{{ state.systemStatus.functionHealth.total }} 可调用</span>
            </div>
            <div class="table-wrap">
              <table class="health-table">
                <caption>云函数健康探测明细</caption>
                <thead>
                  <tr><th>函数</th><th>状态</th><th>耗时</th><th>结果</th></tr>
                </thead>
                <tbody>
                  <tr v-for="item in state.systemStatus.functionHealth.results" :key="item.name">
                    <td><strong class="health-function-name">{{ item.name }}</strong></td>
                    <td><span :class="['status-pill', item.ok ? 'good' : 'danger']">{{ item.ok ? "可调用" : "异常" }}</span></td>
                    <td>{{ item.durationMs ? item.durationMs + "ms" : "-" }}</td>
                    <td>{{ item.message || "-" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section v-if="state.activeTab === 'roles'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <button v-if="hasPermission('roles.manage')" class="secondary-action small icon-action" type="button" @click="resetRole"><Plus :size="15" :stroke-width="1.8" /> 新建角色</button>
            </div>
            <div class="record-list">
              <button v-for="role in state.adminRoles" :key="role.id" :class="{ selected: state.selectedRoleId === role.id }" type="button" @click="editRole(role)">
                <strong>{{ role.displayName || role.subject }} <em>{{ role.roleName || role.roleKey }}</em></strong>
                <span>{{ role.subjectType || "username" }} · {{ role.disabled ? "已停用" : "启用" }}</span>
              </button>
              <EmptyState v-if="state.adminRoles.length === 0" :title="emptyTitle('roles')" :hint="emptyHint('roles')" :action-label="emptyActionLabel('roles')" @action="handleEmptyAction('roles')" />
            </div>
          </article>
          <div v-if="state.drawers.role" class="editor-drawer" role="dialog" aria-modal="true" aria-label="角色编辑">
            <div class="editor-drawer-mask" @click="closeDrawer('role')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>角色编辑</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('role')">×</button></div>
            <form class="editor-grid" @submit.prevent="saveAdminRole">
              <label><span>标识类型</span><select v-model="roleForm.subjectType"><option value="username">用户名</option><option value="uid">UID</option><option value="openid">OpenID</option></select></label>
              <label><span>角色</span><select v-model="roleForm.roleKey"><option value="admin">管理员</option><option value="operator">运营</option><option value="clerk">店员</option></select></label>
              <label class="wide"><span>账号标识</span><input v-model="roleForm.subject" required placeholder="用户名、UID 或 OpenID"></label>
              <label class="wide"><span>显示名</span><input v-model="roleForm.displayName" placeholder="如 前台店员"></label>
              <label class="switch wide"><input v-model="roleForm.disabled" type="checkbox"> 停用该角色</label>
              <div class="permission-preview wide">
                <div class="permission-summary">
                  <span>{{ currentRolePreset?.label || "角色" }}</span>
                  <strong>{{ currentPermissionSummary }}</strong>
                </div>
                <div v-for="group in currentPermissionGroups" :key="group.group" class="permission-group">
                  <strong>{{ group.group }} <em>{{ group.items.length }} 项</em></strong>
                  <div>
                    <span v-for="permission in group.items" :key="permission.key" :class="`risk-${permission.risk}`">{{ permission.label }}</span>
                  </div>
                </div>
              </div>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('role')">取消</button>
                <button v-if="hasPermission('roles.manage')" class="primary-action" type="submit">保存角色</button>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'backups'" class="list-workspace">
          <article class="panel-card data-panel">
            <div class="panel-title"><h2>备份记录</h2>
              <div class="panel-toolbar" style="margin:0">
                <button class="secondary-action small" type="button" @click="loadBackupLogs">刷新</button>
                <button v-if="hasPermission('backup.create')" class="primary-action small" type="button" @click="openDrawer('backup')">创建备份</button>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <caption>云端备份记录</caption>
                <thead><tr><th scope="col">时间</th><th scope="col">状态</th><th scope="col">完整性</th><th scope="col">文件</th><th scope="col">大小</th><th scope="col">操作</th></tr></thead>
                <tbody>
                  <tr v-for="log in state.backupLogs" :key="log._id">
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td><span :class="['status-pill', statusTone(log.status)]">{{ log.status }}</span></td>
                    <td><span :class="['status-pill', backupCompleteness(log).tone]">{{ backupCompleteness(log).label }}</span><small>{{ backupCompleteness(log).hint }}</small></td>
                    <td><strong>{{ log.cloudPath || "-" }}</strong><small>{{ backupFileHint(log) }}</small></td>
                    <td>{{ numberText(log.size || 0) }} B</td>
                    <td><button v-if="log.status === 'success' && log.fileId" class="ghost-button" type="button" @click="downloadBackup(log)">下载</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="state.backupLogs.length === 0" :title="emptyTitle('backups')" :hint="emptyHint('backups')" :action-label="emptyActionLabel('backups')" @action="handleEmptyAction('backups')" />
            <div v-if="pageMetaFor('backups').total > pageMetaFor('backups').pageSize" class="pager">
              <span>{{ pageRangeText('backups') }}</span>
              <button type="button" :disabled="pageMetaFor('backups').page <= 1" @click="changePage('backups', -1, loadBackupLogs)">上一页</button>
              <button type="button" :disabled="pageMetaFor('backups').page >= pageMetaFor('backups').pageCount" @click="changePage('backups', 1, loadBackupLogs)">下一页</button>
            </div>
          </article>
          <div v-if="state.drawers.backup" class="editor-drawer" role="dialog" aria-modal="true" aria-label="创建备份">
            <div class="editor-drawer-mask" @click="closeDrawer('backup')"></div>
            <aside class="panel-card editor-panel drawer-panel">
            <div class="panel-title"><h2>创建备份</h2><button class="ghost-button icon-action" type="button" aria-label="关闭" @click="closeDrawer('backup')">×</button></div>
            <form class="editor-grid" @submit.prevent="createDataBackup">
              <label><span>每个集合上限</span><input v-model.number="backupForm.limit" type="number" min="50" max="1000"></label>
              <div class="privacy-note wide">导出订单、预约、会员、商品等关键集合到云存储；超过上限会标记为可能截断。</div>
              <div class="drawer-actions wide">
                <button type="button" class="secondary-action" @click="closeDrawer('backup')">取消</button>
                <button v-if="hasPermission('backup.create')" class="primary-action icon-action" type="submit"><Database :size="16" :stroke-width="1.8" /> 创建备份</button>
                <div v-else class="permission-note">当前角色仅可查看备份记录。</div>
              </div>
            </form>
            </aside>
          </div>
        </section>

        <section v-if="state.activeTab === 'settings'" class="panel-card settings-panel">
          <form class="settings-stack" @submit.prevent="saveSettings">
            <div class="settings-section">
              <div class="settings-section-head">
                <span>01</span>
                <h2>门店与品牌</h2>
              </div>
              <div class="settings-fields">
                <label><span>品牌名</span><input v-model="state.settings.brandName"></label>
                <label><span>门店名</span><input v-model="state.settings.storeName"></label>
                <label class="wide"><span>品牌标语</span><input v-model="state.settings.slogan"></label>
                <label><span>电话</span><input v-model="state.settings.phone"></label>
                <label><span>营业时间</span><input v-model="state.settings.businessHours"></label>
                <label class="wide"><span>地址</span><input v-model="state.settings.address"></label>
                <label class="wide"><span>预约规则文案</span><textarea v-model="state.settings.reservationRule" rows="4" placeholder="展示给顾客的说明（非系统强制逻辑）"></textarea></label>
                <label><span>取消提前小时</span><input v-model.number="state.settings.reservationCancelAdvanceHours" type="number" min="1" max="168" step="1" title="已支付预约须至少提前这么多小时取消才可自助全额退"></label>
                <label><span>待支付锁单分钟</span><input v-model.number="state.settings.reservationLockMinutes" type="number" min="1" max="120" step="1" title="提交预约后须在多少分钟内完成微信支付"></label>
                <label><span>自动完成宽限分钟</span><input v-model.number="state.settings.reservationAutoCompleteGraceMinutes" type="number" min="0" max="1440" step="1" title="已确认预约在结束时间后再等这么多分钟，自动标为已完成"></label>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section-head">
                <span>02</span>
                <h2>预约计价</h2>
              </div>
              <div class="settings-fields">
                <p class="settings-note settings-intro">
                  真正扣款规则：按开始时刻落入日间/晚间价带，满「最短时长」收基础价，超出部分按步长加价。与「茶室信息」无关。
                </p>
                <label><span>可约开始</span><input v-model="state.settings.bookingOpenTime" placeholder="10:00"></label>
                <label><span>可约结束</span><input v-model="state.settings.bookingCloseTime" placeholder="21:30"></label>
                <label><span>最短时长（分钟）</span><input v-model.number="state.settings.bookingMinDurationMinutes" type="number" min="30" max="480" step="15"></label>
                <label><span>时段步长（分钟）</span><input v-model.number="state.settings.bookingSlotStepMinutes" type="number" min="15" max="60" step="15"></label>
                <label><span>每场人数上限</span><input v-model.number="state.settings.bookingMaxPeople" type="number" min="1" max="30"></label>
                <label><span>加时单价（每步长）</span><input v-model.number="state.settings.bookingHalfHourPrice" type="number" min="0" step="1"></label>
                <label><span>日间名称</span><input v-model="state.settings.bookingDayLabel" placeholder="日间"></label>
                <label><span>日间起点</span><input v-model="state.settings.bookingDayStart" placeholder="10:00"></label>
                <label><span>日间终点</span><input v-model="state.settings.bookingDayEnd" placeholder="19:30"></label>
                <label><span>日间满时长价</span><input v-model.number="state.settings.bookingDayBasePrice" type="number" min="0" step="1"></label>
                <label><span>晚间名称</span><input v-model="state.settings.bookingEveningLabel" placeholder="晚间"></label>
                <label><span>晚间起点</span><input v-model="state.settings.bookingEveningStart" placeholder="19:30"></label>
                <label><span>晚间终点</span><input v-model="state.settings.bookingEveningEnd" placeholder="21:30"></label>
                <label><span>晚间满时长价</span><input v-model.number="state.settings.bookingEveningBasePrice" type="number" min="0" step="1"></label>
                <label><span>赠茶泡数</span><input v-model.number="state.settings.bookingGiftTeaCups" type="number" min="0" max="20"></label>
                <label><span>赠茶价值（元）</span><input v-model.number="state.settings.bookingGiftTeaValueYuan" type="number" min="0" step="1"></label>
                <label class="wide"><span>赠茶文案</span><input v-model="state.settings.bookingGiftTeaCopy" placeholder="含赠 2 泡茶（价值 ¥78）"></label>
              </div>
              <p class="settings-note">茶室预付：用户自助取消须提前「取消提前小时」才全额退；后台取消可选手动全额/部分/不退。锁单超时后待支付单自动释放时段。已确认预约过「结束时间 + 自动完成宽限」后由定时任务标为已完成（默认 60 分钟，未到店仍需人工标记）。</p>
            </div>
            <div class="settings-section" v-if="hasPermission('catalog.read')">
              <div class="settings-section-head">
                <span>03</span>
                <h2>茶室信息</h2>
              </div>
              <div class="settings-fields">
                <p class="settings-note settings-intro">
                  门店只有一间可预约茶室，这里维护前台「预约茶室」页展示的名称、图片与可约状态；计价在上方「预约计价」配置。保存后小程序与排期看板立即生效。
                </p>
                <label><span>茶室名称</span><input v-model="state.roomForm.name" placeholder="如 观山雅间"></label>
                <label><span>容量</span><input v-model="state.roomForm.capacity" placeholder="如 2-4人"></label>
                <label><span>楼层/氛围</span><input v-model="state.roomForm.floor" placeholder="如 安静雅致 ｜ 观山景"></label>
                <label class="file-picker wide">
                  <span>茶室图片</span>
                  <Upload :size="17" :stroke-width="1.8" />
                  <input accept="image/*" type="file" @change="uploadFormImage('room', $event)">
                  <em>{{ uploadState.room || "选择本地图片上传到云存储" }}</em>
                </label>
                <label v-if="displayImage(state.roomForm.image)" class="wide">
                  <span>当前图片</span>
                  <img :src="displayImage(state.roomForm.image)" alt="茶室图片" style="max-width: 180px; border-radius: 8px; border: 1px solid var(--admin-line);">
                </label>
              </div>
              <div class="settings-switches">
                <label class="switch"><input v-model="state.roomForm.visible" type="checkbox"> 开放预约（关闭后小程序不可约）</label>
              </div>
              <div class="settings-row-actions">
                <button v-if="hasPermission('catalog.write')" class="secondary-action" type="button" @click="saveRoomInfo">保存茶室信息</button>
                <span v-else class="permission-note">当前角色无修改茶室信息的权限。</span>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-head">
                <span>04</span>
                <h2>会员与积分</h2>
              </div>
              <div class="settings-fields">
                <label><span>积分倍率</span><input v-model.number="state.settings.memberPointRate" type="number" min="0"></label>
                <label><span>一档会员</span><input v-model="state.settings.levelOneName"></label>
                <label><span>一档门槛</span><input v-model.number="state.settings.levelOneMinSpend" type="number" min="0"></label>
                <label><span>一档折扣</span><input v-model.number="state.settings.levelOneDiscountRate" type="number" min="0.01" max="1" step="0.01"></label>
                <label><span>二档会员</span><input v-model="state.settings.levelTwoName"></label>
                <label><span>二档门槛</span><input v-model.number="state.settings.levelTwoMinSpend" type="number" min="0"></label>
                <label><span>二档折扣</span><input v-model.number="state.settings.levelTwoDiscountRate" type="number" min="0.01" max="1" step="0.01"></label>
                <label><span>三档会员</span><input v-model="state.settings.levelThreeName"></label>
                <label><span>三档门槛</span><input v-model.number="state.settings.levelThreeMinSpend" type="number" min="0"></label>
                <label><span>三档折扣</span><input v-model.number="state.settings.levelThreeDiscountRate" type="number" min="0.01" max="1" step="0.01"></label>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-head">
                <span>05</span>
                <h2>订单与履约</h2>
              </div>
              <div class="settings-switches">
                <label class="switch"><input v-model="state.settings.paymentEnabled" type="checkbox"> 启用微信支付</label>
                <label class="switch"><input v-model="state.settings.pickupEnabled" type="checkbox"> 启用自提</label>
                <label class="switch"><input v-model="state.settings.shippingEnabled" type="checkbox"> 启用配送</label>
              </div>
              <div class="settings-subsection">
                <h3>微信发货信息管理</h3>
                <p class="settings-note">后台标记快递发货、自提/堂饮/预约/充值支付成功时，云函数会自动上传发货信息到微信；用户收到「订单发货通知」后点击进入下方跳转页，即可查询物流、申请售后。</p>
                <div v-if="state.wxShippingStatus" class="settings-status-row">
                  <span class="status-pill" :class="state.wxShippingStatus.isTradeManaged ? 'good' : 'warn'">
                    发货信息管理：{{ state.wxShippingStatus.isTradeManaged ? "已开通" : "未开通" }}
                  </span>
                  <span class="status-pill" :class="state.wxShippingStatus.confirmationCompleted ? 'good' : 'warn'">
                    交易结算确认：{{ state.wxShippingStatus.confirmationCompleted ? "已完成" : "未完成" }}
                  </span>
                  <span class="status-pill" :class="state.wxShippingStatus.jumpPathSynced ? 'good' : 'warn'">
                    通知跳转：{{ state.wxShippingStatus.jumpPathSynced ? "已同步" : "未同步" }}
                  </span>
                </div>
                <p v-if="state.wxShippingStatus && state.wxShippingStatus.managedError" class="settings-status-error">
                  {{ state.wxShippingStatus.managedError }}
                </p>
                <p v-if="state.wxShippingStatus && state.wxShippingStatus.confirmError" class="settings-status-error">
                  {{ state.wxShippingStatus.confirmError }}
                </p>
                <p v-if="state.wxShippingStatus && state.wxShippingStatus.jumpPathError" class="settings-status-error">
                  跳转同步失败：{{ state.wxShippingStatus.jumpPathError }}{{ state.wxShippingStatus.pendingPath ? "（期望路径 " + state.wxShippingStatus.pendingPath + "，微信侧仍生效旧路径）" : "" }}
                </p>
                <div class="settings-fields">
                  <label class="wide"><span>发货通知跳转页</span><input v-model="state.settings.wxShippingJumpPath" placeholder="pages/order-detail/index"></label>
                </div>
                <div class="settings-row-actions">
                  <button v-if="hasPermission('settings.write')" class="secondary-action" type="button" @click="syncWxShippingJumpPath">同步跳转路径到微信</button>
                  <button class="secondary-action" type="button" @click="refreshWxShippingStatus">刷新接入状态</button>
                </div>
              </div>
              <div class="settings-subsection">
                <h3>桌面扫码点单码</h3>
                <p class="settings-note">顾客扫桌上小程序码直接进入点单页并自动绑定桌号。需小程序已发布上线后才能生成，生成后图片可右键另存打印。</p>
                <div class="table-qr-grid">
                  <div v-for="qr in tableQrList" :key="qr.tableNo" class="table-qr-item">
                    <div class="table-qr-head">
                      <span class="table-qr-no">{{ qr.tableNo }} 号桌</span>
                      <div class="table-qr-actions">
                        <button v-if="qr.url" class="mini-action" type="button" @click="downloadTableQr(qr)">下载</button>
                        <button v-if="hasPermission('settings.write')" class="mini-action" type="button" @click="regenerateTableQr(qr.tableNo)">重新生成</button>
                      </div>
                    </div>
                    <img v-if="qr.url" class="table-qr-img" :src="qr.url" :alt="qr.tableNo + ' 号桌码'" />
                    <div v-else class="table-qr-empty">未生成</div>
                  </div>
                </div>
                <div class="settings-row-actions">
                  <button v-if="hasPermission('settings.write')" class="secondary-action" type="button" @click="generateTableQrs">生成 01–04 桌码</button>
                  <button class="secondary-action" type="button" @click="loadTableQrs">刷新</button>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-head">
                <span>06</span>
                <h2>订阅消息</h2>
              </div>
              <div class="settings-switches">
                <label class="switch"><input v-model="state.settings.orderNoticeEnabled" type="checkbox"> 订单通知</label>
                <label class="switch"><input v-model="state.settings.staffOrderNoticeEnabled" type="checkbox"> 店员新订单微信提醒</label>
                <label class="switch"><input v-model="state.settings.reservationNoticeEnabled" type="checkbox"> 预约通知</label>
                <label class="switch"><input v-model="state.settings.eventNoticeEnabled" type="checkbox"> 活动通知</label>
              </div>
              <div class="settings-fields">
                <label class="wide"><span>支付成功模板 ID</span><input v-model="state.settings.orderPaidTemplateId"></label>
                <label class="wide"><span>支付成功跳转页</span><input v-model="state.settings.orderPaidPage"></label>
                <label class="wide"><span>发货通知模板 ID</span><input v-model="state.settings.orderShippedTemplateId"></label>
                <label class="wide"><span>发货通知跳转页</span><input v-model="state.settings.orderShippedPage"></label>
                <label class="wide"><span>店员新订单模板 ID</span><input v-model="state.settings.staffOrderTemplateId" placeholder="微信公众平台订阅消息模板 ID"></label>
                <label class="wide"><span>店员新订单字段映射 JSON</span><input v-model="state.settings.staffOrderTemplateMap" placeholder='{"thing1":"orderNo","amount2":"total","phrase3":"status","time4":"time"}'></label>
                <label class="wide"><span>店员新订单跳转页</span><input v-model="state.settings.staffOrderPage" placeholder="pages/profile/index"></label>
                <label class="wide"><span>预约通知模板 ID</span><input v-model="state.settings.reservationTemplateId"></label>
                <label class="wide"><span>预约通知跳转页</span><input v-model="state.settings.reservationNoticePage"></label>
                <label class="wide"><span>活动通知模板 ID</span><input v-model="state.settings.eventTemplateId"></label>
                <label class="wide"><span>活动通知跳转页</span><input v-model="state.settings.eventNoticePage"></label>
              </div>
              <p class="settings-note">店员微信提醒：需配置云函数环境变量 STAFF_OPENIDS 或 ADMIN_OPENIDS（店员 openid，逗号分隔）；店员在小程序「我的」点「接单提醒」授权后，顾客现场点单会推送订阅消息。</p>
            </div>
            <div class="settings-footer">
              <button v-if="hasPermission('settings.write')" class="primary-action" type="submit">保存设置</button>
              <div v-else class="permission-note">当前角色仅可查看设置。</div>
            </div>
          </form>
        </section>
      </section>

      <div v-if="actionDialog.open" class="action-dialog-backdrop" @click.self="cancelActionDialog">
        <form class="action-dialog" role="dialog" aria-modal="true" :aria-label="actionDialog.title" @submit.prevent="submitActionDialog" @keydown.esc.prevent="cancelActionDialog">
          <span class="dialog-kicker">{{ actionDialog.mode === "reason" || actionDialog.mode === "choice_reason" ? "Audit Required" : "Risk Control" }}</span>
          <h2>{{ actionDialog.title }}</h2>
          <p>{{ actionDialog.message }}</p>
          <div v-if="actionDialog.expected" class="confirm-target">
            <span>确认值</span>
            <strong>{{ actionDialog.expected }}</strong>
          </div>
          <label v-if="actionDialog.mode === 'typed' || actionDialog.mode === 'input'" class="wide">
            <span>{{ actionDialog.inputLabel || "输入确认值" }}</span>
            <input v-model="actionDialog.input" autocomplete="off" :placeholder="actionDialog.expected">
          </label>
          <label v-if="actionDialog.mode === 'choice_reason'" class="wide">
            <span>处理方式</span>
            <select v-model="actionDialog.choice">
              <option v-for="item in actionDialog.choices" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label v-if="actionDialog.mode === 'choice_reason' && actionDialog.showAmountWhen && actionDialog.choice === actionDialog.showAmountWhen" class="wide">
            <span>{{ actionDialog.amountLabel || "退款金额（元）" }}</span>
            <input v-model="actionDialog.amount" type="number" min="0.01" step="0.01" :max="actionDialog.maxAmount || undefined" placeholder="请输入退款金额">
          </label>
          <label v-if="actionDialog.mode === 'reason' || actionDialog.mode === 'choice_reason'" class="wide">
            <span>操作原因</span>
            <textarea v-model="actionDialog.reason" rows="4" placeholder="写清楚业务原因，后续会进入审计日志"></textarea>
          </label>
          <p v-if="actionDialog.error" class="dialog-error" role="alert">{{ actionDialog.error }}</p>
          <div class="dialog-actions">
            <button class="secondary-action" type="button" @click="cancelActionDialog">{{ actionDialog.cancelText }}</button>
            <button :class="[actionDialog.danger ? 'danger-action' : 'primary-action']" type="submit">{{ actionDialog.confirmText }}</button>
          </div>
        </form>
      </div>
      <div v-if="state.loading" class="loading-mask">{{ state.loading }}</div>
      <div :class="['toast', { show: toast.show }]" role="status" aria-live="polite">{{ toast.text }}</div>
    </section>
  </main>
</template>
