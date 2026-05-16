<script setup>
import { computed, h, markRaw, onMounted, reactive } from "vue";
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
  Megaphone,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
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

const PACKAGE_INFO = {
  appid: "wxaf9aedf1f6343786",
  sourceSizeLimit: "2MB",
  ignored: ["admin", "admin-src", "node_modules", "package-lock.json", "package.json", "vite.config.mjs"]
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
  { key: "marketing", label: "营销中心", icon: Megaphone },
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
  { label: "内容与增长", items: ["catalog", "content", "analytics", "marketing"] },
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
  marketing: "marketing.read",
  audit: "audit.read",
  notifications: "notification.read",
  system: "system.read",
  roles: "roles.manage",
  backups: "backup.read",
  settings: "settings.read"
};

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
  { tab: "afterSales", label: "售后处理", icon: BadgeDollarSign },
  { tab: "inventory", label: "库存流水", icon: Package },
  { tab: "system", label: "系统体检", icon: ShieldCheck },
  { tab: "notifications", label: "通知日志", icon: Bell },
  { tab: "customers", label: "用户管理", icon: Users },
  { tab: "analytics", label: "数据统计", icon: ChartNoAxesColumnIncreasing }
];

const permissionCatalog = [
  { key: "dashboard.read", group: "经营首页", label: "查看首页与全局搜索", risk: "low" },
  { key: "order.read", group: "订单售后", label: "查看订单", risk: "low" },
  { key: "order.write", group: "订单售后", label: "发货、自提、取消订单", risk: "medium" },
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
  { key: "marketing.read", group: "营销", label: "查看营销配置", risk: "low" },
  { key: "marketing.write", group: "营销", label: "编辑优惠券和计划", risk: "medium" },
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
const permissionGroupOrder = ["经营首页", "订单售后", "库存", "门店服务", "用户数据", "内容商品", "营销", "数据统计", "系统治理", "未归类"];
const permissionMap = permissionCatalog.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

const fallbackMetricIcons = [CalendarCheck, TicketPercent, BadgeDollarSign, UserPlus, CircleDollarSign];
const createPageState = () => ({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_ROWS = 5000;

const pageTitles = {
  dashboard: ["后台首页", "今日经营、履约状态与高频动作"],
  reservations: ["茶室预约", "确认、取消与备注每一次茶席"],
  signups: ["活动报名", "茶会报名与名额动态"],
  orders: ["订单管理", "支付、发货、自提和异常处理"],
  afterSales: ["售后管理", "退款、拒绝、关闭和人工处理记录"],
  inventory: ["库存流水", "库存锁定、释放、扣减和人工调整"],
  customers: ["用户管理", "会员画像、消费与互动记录"],
  catalog: ["商品管理", "茶叶、茶饮、茶室与活动资料"],
  content: ["内容管理", "首页轮播、公告和运营内容"],
  analytics: ["数据统计", "经营走势、转化和热销项目"],
  marketing: ["营销中心", "优惠券和活动计划"],
  audit: ["审计日志", "关键后台操作和隐私动作留痕"],
  notifications: ["通知日志", "订阅消息发送、跳过和失败原因"],
  system: ["系统状态", "配置缺项、包体规则和关键后台健康检查"],
  roles: ["角色权限", "管理员、店员和运营的后台权限边界"],
  backups: ["数据备份", "关键集合一键导出到云存储"],
  settings: ["设置管理", "门店、会员和通知配置"]
};

const moduleProfiles = {
  dashboard: { group: "经营工作台", subject: "今日经营", countLabel: "项经营指标", note: "预约、订单、报名和营业额集中查看。" },
  reservations: { group: "门店服务", subject: "预约队列", countLabel: "条预约", note: "按日期、茶室和时段确认履约。" },
  signups: { group: "门店服务", subject: "报名队列", countLabel: "条报名", note: "到场、未到场和取消都会留在活动记录里。" },
  orders: { group: "经营工作台", subject: "订单队列", countLabel: "笔订单", note: "发货、自提、取消和售后会写入审计日志。" },
  afterSales: { group: "经营工作台", subject: "售后队列", countLabel: "笔售后", note: "先完成状态闭环，真实微信退款等待商户配置。" },
  inventory: { group: "经营工作台", subject: "库存流水", countLabel: "条流水", note: "每次锁定、扣减、释放和人工调整都保留来源。" },
  customers: { group: "门店服务", subject: "用户画像", countLabel: "位用户", note: "默认脱敏展示，导出和删除个人数据需要权限。" },
  catalog: { group: "内容与增长", subject: "商品资料", countLabel: "条资料", note: "本地图片会优先上传到云存储后再写入前台数据。" },
  content: { group: "内容与增长", subject: "运营内容", countLabel: "条内容", note: "首页轮播、卡片和公告统一在云端维护。" },
  analytics: { group: "内容与增长", subject: "经营统计", countLabel: "项统计", note: "只展示可直接用于经营判断的数据。" },
  marketing: { group: "内容与增长", subject: "营销配置", countLabel: "项营销记录", note: "优惠券、计划和核销率在同一处核对。" },
  audit: { group: "系统治理", subject: "操作留痕", countLabel: "条日志", note: "关键改动保留操作人、时间、对象和字段差异。" },
  notifications: { group: "系统治理", subject: "通知投递", countLabel: "条日志", note: "模板缺失、跳过和发送失败都可回查。" },
  system: { group: "系统治理", subject: "上线体检", countLabel: "项检查", note: "包体、支付、通知、权限和备份状态集中检查。" },
  roles: { group: "系统治理", subject: "权限边界", countLabel: "个角色", note: "管理员、运营和店员按操作风险拆分权限。" },
  backups: { group: "系统治理", subject: "数据备份", countLabel: "条备份", note: "备份写入云存储，下载链接为临时链接。" },
  settings: { group: "系统治理", subject: "门店配置", countLabel: "项配置", note: "涉及支付和通知模板的配置会影响生产链路。" }
};

const state = reactive({
  user: null,
  ready: false,
  view: "login",
  activeTab: "dashboard",
  collection: "tea_products",
  contentType: "home_carousel",
  loading: "",
  loadingTab: "",
  loginError: "",
  moduleError: "",
  searchOpen: false,
  searching: false,
  searchMessage: "",
  adminProfile: null,
  summary: [],
  dashboard: null,
  catalogItems: [],
  orders: [],
  afterSales: [],
  inventoryLogs: [],
  auditLogs: [],
  notificationLogs: [],
  systemStatus: null,
  adminRoles: [],
  rolePresets: [],
  backupLogs: [],
  reservations: [],
  signups: [],
  customers: [],
  contentItems: [],
  analytics: null,
  coupons: [],
  couponStats: [],
  campaigns: [],
  searchResults: [],
  settings: {},
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
  selectedAfterSaleId: "",
  selectedAuditLogId: "",
  selectedReservationId: "",
  selectedSignupId: "",
  selectedCustomerId: "",
  selectedContentKey: "",
  selectedRoleId: "",
  selectedCouponId: "",
  selectedCampaignId: "",
  reservationCalendarDate: new Date().toISOString().slice(0, 10)
});

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__SANMUHE_ADMIN_STATE__ = state;
}

const filters = reactive({
  global: "",
  catalog: "",
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

const loginForm = reactive({ username: "", password: "" });
const uploadState = reactive({ catalog: "", content: "" });
const orderForm = reactive({
  trackingCompany: "",
  trackingNo: "",
  cancelReason: ""
});
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
  confirmText: "确认",
  cancelText: "取消",
  danger: false,
  error: ""
});
let toastTimer = null;
let actionDialogResolve = null;

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

const emptyCoupon = () => ({
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
});

const emptyCampaign = () => ({
  id: "",
  name: "",
  type: "banner",
  summary: "",
  startAt: "",
  endAt: "",
  status: "进行中",
  visible: true
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
  coupon: emptyCoupon(),
  campaign: emptyCampaign()
});

const currentTitle = computed(() => pageTitles[state.activeTab] || pageTitles.dashboard);
const currentModuleProfile = computed(() => moduleProfiles[state.activeTab] || moduleProfiles.dashboard);
const currentUser = computed(() => state.user?.username || state.user?.email || state.user?.uid || "禾熙管理员");
const currentRoleName = computed(() => state.adminProfile?.roleName || "管理员");
const headerSignalCount = computed(() => {
  const summary = state.systemStatus?.summary || {};
  return Number(summary.warn || 0) + Number(summary.error || 0);
});
const selectedOrder = computed(() => state.orders.find((item) => item._id === state.selectedOrderId) || state.orders[0] || null);
const selectedAfterSale = computed(() => state.afterSales.find((item) => item._id === state.selectedAfterSaleId) || state.afterSales[0] || null);
const selectedAuditLog = computed(() => state.auditLogs.find((item) => item._id === state.selectedAuditLogId) || state.auditLogs[0] || null);
const selectedReservation = computed(() => state.reservations.find((item) => item._id === state.selectedReservationId) || state.reservations[0] || null);
const selectedSignup = computed(() => state.signups.find((item) => item._id === state.selectedSignupId) || state.signups[0] || null);
const selectedCustomer = computed(() => state.customers.find((item) => item.id === state.selectedCustomerId) || state.customers[0] || null);
const selectedCustomerSignal = computed(() => customerSignal(selectedCustomer.value));
const selectedRole = computed(() => state.adminRoles.find((item) => item.id === state.selectedRoleId) || state.adminRoles[0] || null);
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
const reservationCalendarRows = computed(() => {
  const day = state.reservationCalendarDate;
  const slots = ["10:00", "12:30", "15:00", "17:30", "20:00"];
  const rows = {};
  state.reservations
    .filter((item) => (item.day || item.date || "").slice(0, 10) === day && item.status !== "已取消")
    .forEach((item) => {
      const room = item.roomName || item.room || "未分配茶室";
      if (!rows[room]) {
        rows[room] = { room, slots: slots.map((slot) => ({ time: slot, record: null })) };
      }
      const target = rows[room].slots.find((slot) => slot.time === item.time || slot.time === item.slot);
      if (target) {
        target.record = item;
      }
    });
  return Object.values(rows);
});
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
const activeFilterLabels = computed(() => {
  const items = [];
  const add = (label, value) => {
    const text = String(value || "").trim();
    if (text) items.push({ label, value: text });
  };
  if (state.activeTab === "catalog") add("资料", filters.catalog);
  if (state.activeTab === "orders") {
    add("状态", filters.orderStatus);
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
  if (state.activeTab === "content") add("类型", contentTabs.find((item) => item.key === state.contentType)?.label || state.contentType);
  if (state.activeTab === "audit") add("关键词", filters.auditKeyword);
  if (state.activeTab === "notifications") add("关键词", filters.notificationKeyword);
  return items;
});
const hasClearableFilters = computed(() => {
  if (state.activeTab === "catalog") return !!filters.catalog.trim();
  if (state.activeTab === "orders") return !!(filters.orderStatus || filters.orderKeyword.trim());
  if (state.activeTab === "afterSales") return !!(filters.afterSaleStatus || filters.afterSaleKeyword.trim());
  if (state.activeTab === "inventory") return !!filters.inventoryKeyword.trim();
  if (state.activeTab === "reservations") return !!(filters.reservationStatus || filters.reservationKeyword.trim());
  if (state.activeTab === "signups") return !!(filters.signupStatus || filters.signupKeyword.trim());
  if (state.activeTab === "customers") return !!filters.customerKeyword.trim();
  if (state.activeTab === "content") return state.contentType !== "home_carousel";
  if (state.activeTab === "audit") return !!filters.auditKeyword.trim();
  if (state.activeTab === "notifications") return !!filters.notificationKeyword.trim();
  return false;
});
const exportScopeLabel = computed(() => hasClearableFilters.value ? "按筛选导出 CSV" : "导出全部 CSV");
const showSyncBanner = computed(() => !!state.loading && /^读取/.test(state.loading));
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
    marketing: state.coupons.length + state.campaigns.length + state.couponStats.length,
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

function maskPhone(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^1\d{10}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(7)}`;
  return text.length > 4 ? `${text.slice(0, 2)}***${text.slice(-2)}` : "***";
}

function maskOpenid(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : `${text.slice(0, 3)}...`;
}

function maskName(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "已匿名") return text;
  return text.length <= 1 ? "*" : `${text.slice(0, 1)}*`;
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
  Object.assign(actionDialog, {
    open: true,
    mode: options.mode || "confirm",
    title: options.title || "确认操作",
    message: options.message || "",
    expected: String(options.expected || "").trim(),
    input: "",
    reason: "",
    confirmText: options.confirmText || "确认",
    cancelText: options.cancelText || "取消",
    danger: options.danger === true,
    error: ""
  });
  return new Promise((resolve) => {
    actionDialogResolve = resolve;
    window.setTimeout(() => {
      document.querySelector(".action-dialog input, .action-dialog textarea")?.focus();
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
  if (actionDialog.mode === "reason") {
    const reason = actionDialog.reason.trim();
    if (!reason) {
      actionDialog.error = "请填写操作原因";
      return;
    }
    closeActionDialog(reason);
    return;
  }
  closeActionDialog(true);
}

function cancelActionDialog() {
  closeActionDialog(actionDialog.mode === "reason" ? "" : false);
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

function hasPermission(permission) {
  if (!permission || !state.adminProfile) {
    return true;
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
  const pending = activity.find((item) => /待支付|待发货|待自提|待确认|申请售后|审核中/.test(String(item.status || "")));
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
  await loadAdminProfile();
  if (!canAccessTab(state.activeTab)) {
    state.activeTab = "dashboard";
  }
  await loadActiveTab();
  if (state.activeTab !== "dashboard") await refreshSummary();
}

async function switchTab(tab) {
  if (!canAccessTab(tab)) {
    showToast("当前角色无权访问该模块");
    return;
  }
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
    afterSales: loadAfterSales,
    inventory: loadInventoryLogs,
    reservations: loadReservations,
    signups: loadSignups,
    customers: loadCustomers,
    content: loadContent,
    analytics: loadAnalytics,
    marketing: loadMarketing,
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
  state.loading = label;
  state.loadingTab = state.activeTab;
  state.moduleError = "";
  try {
    await task();
  } catch (error) {
    const message = error.message || `${label}失败`;
    state.moduleError = message;
    showToast(message);
  } finally {
    state.loading = "";
    state.loadingTab = "";
  }
}

async function loadAdminProfile() {
  try {
    const result = await callFunction("manageOperations", { action: "getAdminProfile" });
    state.adminProfile = result.admin || null;
  } catch (error) {
    state.adminProfile = null;
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
  try {
    assertText(forms.catalog.id, "请填写资料 ID");
    if (state.collection !== "events") assertText(forms.catalog.name || forms.catalog.title, "请填写名称");
    assertNonNegative(forms.catalog.price, "价格不能为负数");
    assertNonNegative(forms.catalog.stock, "库存不能为负数");
    if (!isUrlish(forms.catalog.image) || !isUrlish(forms.catalog.thumb)) throw new Error("图片地址必须是 cloud://、http(s) 或 /assets/");
    if (state.collection === "events") {
      assertText(forms.catalog.title || forms.catalog.name, "请填写活动标题");
      if (Number(forms.catalog.signed || 0) > Number(forms.catalog.quota || 0)) throw new Error("已报名不能大于名额");
    }
  } catch (error) {
    showToast(error.message);
    return;
  }
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
  if (!restore && !(await requireTypedConfirm(`确认下架 ${displayName(item)}？`, item.id || displayName(item)))) return;
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
      keyword: filters.orderKeyword,
      ...pagePayload("orders")
    });
    state.orders = result.orders || [];
    setPageMeta("orders", result.page);
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
    state.selectedAfterSaleId = order._id;
    fillAfterSaleForm(state.afterSales.find((item) => item._id === order._id) || order);
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

async function adjustInventory() {
  if (!inventoryForm.id.trim()) {
    showToast("请填写商品 ID");
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
        room: "禾熙书茶空间",
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
    state.selectedRoleId = state.adminRoles[0]?.id || "";
    editRole(selectedRole.value);
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
}

async function saveAdminRole() {
  if (!roleForm.subject.trim()) {
    showToast("请填写账号标识");
    return;
  }
  await withLoading("保存角色", async () => {
    await callFunction("manageOperations", {
      action: "saveAdminRole",
      data: {
        ...roleForm,
        id: roleForm.id || roleForm.subject,
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
  await withLoading("创建备份", async () => {
    const result = await callFunction("manageOperations", {
      action: "createDataBackup",
      limit: Number(backupForm.limit || 500)
    });
    showToast(result.cloudPath ? "备份已写入云存储" : "备份已完成");
    await loadBackupLogs();
  });
}

async function downloadBackup(log) {
  if (!log) return;
  await withLoading("获取备份链接", async () => {
    const result = await callFunction("manageOperations", {
      action: "getBackupDownloadUrl",
      id: log._id,
      cloudPath: log.cloudPath
    });
    if (!result.url) throw new Error("未返回备份下载链接");
    window.open(result.url, "_blank", "noopener,noreferrer");
    showToast("临时备份下载链接已打开");
  });
}

async function loadReservations() {
  await withLoading("读取预约", async () => {
    const result = await callFunction("manageOperations", {
      action: "listReservations",
      status: filters.reservationStatus,
      keyword: filters.reservationKeyword,
      ...pagePayload("reservations")
    });
    state.reservations = result.reservations || [];
    setPageMeta("reservations", result.page);
    state.selectedReservationId = state.reservations[0]?._id || "";
  });
}

function shiftReservationCalendar(step) {
  const date = new Date(`${state.reservationCalendarDate}T00:00:00`);
  date.setDate(date.getDate() + step);
  state.reservationCalendarDate = date.toISOString().slice(0, 10);
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
    a.download = `hexi-customer-${customer.phone || customer.id || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("用户数据已导出");
  });
}

async function updateRecord(type, id, status) {
  let adminNote = "";
  if (status === "已取消") {
    if (!(await requireTypedConfirm(`确认取消这条${type === "reservation" ? "预约" : "报名"}？`, id))) return;
    adminNote = await promptActionReason(`取消${type === "reservation" ? "预约" : "报名"}`);
    if (!adminNote) return;
  }
  await withLoading("更新状态", async () => {
    await callFunction("manageOperations", {
      action: type === "reservation" ? "updateReservation" : "updateSignup",
      id,
      status,
      adminNote
    });
    showToast("状态已更新");
    await (type === "reservation" ? loadReservations() : loadSignups());
  });
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
    if (action === "cancel") await callFunction("manageOperations", { action: "cancelOrder", ...payload, reason: orderForm.cancelReason.trim() });
    showToast("订单已更新");
    if (action === "cancel") orderForm.cancelReason = "";
    await loadOrders();
  });
}

function escapeCsv(value) {
  const text = String(value ?? "");
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
  return `hexi-${name}-${stamp}.csv`;
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
      payload: {
        status: filters.orderStatus,
        keyword: filters.orderKeyword
      }
    });
    if (!rows) return;
    downloadCsv(csvFilename("orders"), [
      { label: "订单号", value: (item) => item.orderNo || item._id },
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
  try {
    assertText(forms.content.key, "请填写内容 Key");
    assertText(forms.content.title, "请填写内容标题");
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

async function loadMarketing() {
  await withLoading("读取营销", async () => {
    const result = await callFunction("manageOperations", { action: "listMarketing" });
    state.coupons = result.coupons || [];
    state.couponStats = result.couponStats || [];
    state.campaigns = result.campaigns || [];
  });
}

function resetCoupon() {
  Object.assign(forms.coupon, emptyCoupon());
  state.selectedCouponId = "";
}

function editCoupon(item) {
  if (!item) {
    resetCoupon();
    return;
  }
  state.selectedCouponId = item.id;
  Object.assign(forms.coupon, emptyCoupon(), item);
}

async function saveCoupon() {
  try {
    assertText(forms.coupon.name, "请填写优惠券名称");
    assertNonNegative(forms.coupon.amount, "优惠券面额不能为负数");
    assertNonNegative(forms.coupon.threshold, "使用门槛不能为负数");
    assertNonNegative(forms.coupon.stock, "库存不能为负数");
    if (!Number.isFinite(Number(forms.coupon.claimLimit)) || Number(forms.coupon.claimLimit) < 1) {
      throw new Error("每人限领至少为 1");
    }
    if (Number(forms.coupon.threshold || 0) > 0 && Number(forms.coupon.amount || 0) > Number(forms.coupon.threshold || 0)) {
      throw new Error("优惠金额不能大于使用门槛");
    }
    if (forms.coupon.startAt && forms.coupon.endAt && forms.coupon.startAt > forms.coupon.endAt) {
      throw new Error("优惠券结束日期不能早于开始日期");
    }
  } catch (error) {
    showToast(error.message);
    return;
  }
  await withLoading("保存优惠券", async () => {
    const result = await callFunction("manageOperations", { action: "saveCoupon", data: forms.coupon });
    state.selectedCouponId = result.id || forms.coupon.id || "";
    forms.coupon.id = state.selectedCouponId;
    showToast("优惠券已保存");
    await loadMarketing();
  });
}

async function disableCoupon(item = forms.coupon) {
  if (!item?.id) {
    showToast("请先选择优惠券");
    return;
  }
  if (!(await requireTypedConfirm(`确认停用优惠券 ${item.name || item.id}？`, item.id))) return;
  await withLoading("停用优惠券", async () => {
    await callFunction("manageOperations", { action: "disableCoupon", id: item.id });
    showToast("优惠券已停用");
    resetCoupon();
    await loadMarketing();
  });
}

function resetCampaign() {
  Object.assign(forms.campaign, emptyCampaign());
  state.selectedCampaignId = "";
}

function editCampaign(item) {
  if (!item) {
    resetCampaign();
    return;
  }
  state.selectedCampaignId = item.id;
  Object.assign(forms.campaign, emptyCampaign(), item);
}

async function saveCampaign() {
  try {
    assertText(forms.campaign.name, "请填写营销计划名称");
    if (forms.campaign.startAt && forms.campaign.endAt && forms.campaign.startAt > forms.campaign.endAt) {
      throw new Error("结束时间不能早于开始时间");
    }
  } catch (error) {
    showToast(error.message);
    return;
  }
  await withLoading("保存计划", async () => {
    const result = await callFunction("manageOperations", { action: "saveCampaign", data: forms.campaign });
    state.selectedCampaignId = result.id || forms.campaign.id || "";
    forms.campaign.id = state.selectedCampaignId;
    showToast("营销计划已保存");
    await loadMarketing();
  });
}

async function disableCampaign(item = forms.campaign) {
  if (!item?.id) {
    showToast("请先选择营销计划");
    return;
  }
  if (!(await requireTypedConfirm(`确认停用营销计划 ${item.name || item.id}？`, item.id))) return;
  await withLoading("停用计划", async () => {
    await callFunction("manageOperations", { action: "disableCampaign", id: item.id });
    showToast("营销计划已停用");
    resetCampaign();
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
  if (!isPhone(state.settings.phone)) {
    showToast("电话格式不正确");
    return;
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
    state.settings.reservationNoticePage,
    state.settings.eventNoticePage
  ];
  if (noticePages.some((page) => !isSafePagePath(page))) {
    showToast("通知跳转页格式不安全");
    return;
  }
  await withLoading("保存设置", async () => {
    await callFunction("manageOperations", { action: "updateSettings", data: state.settings });
    showToast("设置已保存");
  });
}

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
  if (tab === "orders" && state.orders.some((item) => item._id === id)) state.selectedOrderId = id;
  if (tab === "afterSales" && state.afterSales.some((item) => item._id === id)) {
    state.selectedAfterSaleId = id;
    fillAfterSaleForm(selectedAfterSale.value);
  }
  if (tab === "reservations" && state.reservations.some((item) => item._id === id)) state.selectedReservationId = id;
  if (tab === "signups" && state.signups.some((item) => item._id === id)) state.selectedSignupId = id;
  if (tab === "customers" && state.customers.some((item) => item.id === id)) state.selectedCustomerId = id;
  if (tab === "audit" && state.auditLogs.some((item) => item._id === id)) state.selectedAuditLogId = id;
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

function clearActiveFilters() {
  if (state.activeTab === "catalog") filters.catalog = "";
  if (state.activeTab === "orders") {
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
    orders: "暂无订单",
    afterSales: "暂无售后记录",
    inventory: "暂无库存流水",
    reservations: "当天暂无预约",
    signups: "暂无活动报名",
    customers: "暂无用户记录",
    content: "暂无运营内容",
    marketing: "暂无营销记录",
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
    orders: "新订单支付或提交后会出现在这里。",
    afterSales: "订单转入售后后，可在这里处理退款状态闭环。",
    inventory: "订单锁定、支付扣减、取消释放和人工调整会自动沉淀流水。",
    reservations: "选择其他日期，或等待小程序端提交预约。",
    signups: "活动报名、到场和未到场核销会集中展示。",
    customers: "有订单、预约或报名后会自动形成用户画像。",
    content: "新建轮播、卡片或公告后会同步给小程序端。",
    marketing: "创建优惠券或营销计划后可查看领取与核销表现。",
    audit: "后台关键操作会自动记录到这里。",
    notifications: "订阅消息发送、跳过和失败都会写入日志。",
    roles: "没有角色时，白名单账号按管理员处理。",
    backups: "可以先创建一次云端备份，之后定时任务会每日执行。"
  }[tab] || "暂无可展示记录。";
}

function emptyActionLabel(tab = state.activeTab) {
  if (hasClearableFilters.value) return "清除筛选";
  const labels = {
    catalog: hasPermission("catalog.write") ? "新建资料" : "刷新资料",
    content: hasPermission("content.write") ? "新建内容" : "刷新内容",
    marketing: hasPermission("marketing.write") ? "新建营销记录" : "刷新营销",
    roles: hasPermission("roles.manage") ? "新建角色" : "刷新角色",
    backups: "刷新备份",
    system: "重新检查"
  };
  return labels[tab] || "刷新记录";
}

function handleEmptyAction(tab = state.activeTab) {
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
  if (tab === "marketing" && hasPermission("marketing.write")) {
    resetCoupon();
    resetCampaign();
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
          <span>禾 熙</span>
          <strong>HEXI TEA</strong>
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

    <section v-else class="admin-layout">
      <aside class="sidebar">
        <div class="logo-stack">
          <span>禾 熙</span>
          <strong>HEXI TEA</strong>
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

      <section class="workspace">
        <header class="topbar">
          <div>
            <span class="section-kicker">禾熙运营中枢</span>
            <h1>{{ currentTitle[0] }}</h1>
            <p>{{ currentTitle[1] }}</p>
          </div>
          <div class="top-actions">
            <div class="global-search-wrap">
              <label class="search-box">
                <Search :size="17" :stroke-width="1.8" />
                <input
                  v-model="filters.global"
                  aria-label="全局搜索后台记录"
                  placeholder="全局搜索：手机号 / 订单号 / 预约"
                  @keydown.enter.prevent="runGlobalSearch"
                  @keydown.esc="closeSearch"
                  @focus="state.searchOpen = !!(state.searchResults.length || state.searchMessage)"
                >
              </label>
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
            <button class="secondary-action icon-action" aria-label="刷新当前模块" type="button" @click="loadActiveTab">
              <RefreshCw :size="16" :stroke-width="1.8" />
              刷新
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

        <div v-if="state.moduleError" class="error-banner" role="alert">
          <span>当前模块加载失败</span>
          <strong>{{ state.moduleError }}</strong>
          <button type="button" @click="loadActiveTab">重试</button>
        </div>

        <section v-if="showSyncBanner" class="sync-banner" role="status" aria-live="polite">
          <div>
            <span>正在同步云端数据</span>
            <strong>{{ state.loading }}</strong>
            <p>当前页面会保留原有内容，新的记录返回后自动更新。</p>
          </div>
          <div class="sync-skeleton" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </div>
        </section>

        <section class="work-context" aria-live="polite">
          <div class="context-main">
            <span>{{ currentModuleProfile.group }}</span>
            <strong>{{ currentModuleProfile.subject }}</strong>
            <p>{{ currentModuleProfile.note }}</p>
          </div>
          <div class="context-count">
            <strong>{{ numberText(currentRecordCount) }}</strong>
            <span>{{ currentModuleProfile.countLabel }}</span>
          </div>
          <div class="filter-strip">
            <template v-if="activeFilterLabels.length">
              <span v-for="item in activeFilterLabels" :key="`${item.label}-${item.value}`" class="filter-chip">
                {{ item.label }}：{{ item.value }}
              </span>
            </template>
            <span v-else class="filter-chip muted">未设置筛选</span>
            <button v-if="hasClearableFilters" class="clear-filter" type="button" @click="clearActiveFilters">清除筛选</button>
          </div>
        </section>

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
              <button v-for="action in visibleQuickActions" :key="action.label" type="button" @click="switchTab(action.tab)">
                <span><component :is="action.icon" :size="24" :stroke-width="1.7" /></span>
                {{ action.label }}
              </button>
              <div v-if="visibleQuickActions.length === 0" class="empty-state">当前角色暂无快捷操作</div>
            </div>
          </article>
          <article class="panel-card list-panel">
            <div class="panel-title"><h2>最新预约</h2><button class="link-more" type="button" @click="switchTab('reservations')">查看更多 ›</button></div>
            <div class="flow-list feed-list">
              <button v-for="item in (state.dashboard?.recentReservations || [])" :key="item._id" type="button" @click="switchTab('reservations')">
                <span class="feed-avatar">{{ (maskName(item.name || item.customerName) || "访").slice(0, 1) }}</span>
                <span class="feed-main">
                  <strong>{{ maskName(item.name || item.customerName) || "访客" }}</strong>
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
                  <small>{{ maskName(item.name || item.customerName) || "访客" }} · {{ item.status }}</small>
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
              <input v-model="filters.catalog" class="line-input" aria-label="筛选商品资料" placeholder="筛选名称、分类、状态">
            </div>
            <div class="table-wrap">
              <table>
                <caption>商品、茶饮、茶室和活动资料列表</caption>
                <thead><tr><th>资料</th><th>分类</th><th>价格</th><th>库存/名额</th><th>状态</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="item in filteredCatalog" :key="item.id" :class="{ selected: state.selectedCatalogId === item.id }" @click="editCatalog(item)">
                    <td><strong>{{ displayName(item) }}</strong><small>{{ item.id }}</small></td>
                    <td>{{ item.category || item.capacity || "-" }}</td>
                    <td>{{ item.price !== undefined ? `¥${money(item.price)}` : "-" }}</td>
                    <td>{{ displayInventory(item) }}</td>
                    <td><span :class="['status-pill', item.visible === false || item.deleted ? 'neutral' : 'good']">{{ item.visible === false || item.deleted ? "已下架" : (item.status || "上架") }}</span></td>
                    <td><button v-if="hasPermission('catalog.write')" class="ghost-button" type="button" @click.stop="toggleCatalog(item)">{{ item.visible === false || item.deleted ? "恢复" : "下架" }}</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EmptyState v-if="filteredCatalog.length === 0" :title="emptyTitle('catalog')" :hint="emptyHint('catalog')" :action-label="emptyActionLabel('catalog')" @action="handleEmptyAction('catalog')" />
          </article>
          <aside class="panel-card editor-panel">
            <div class="panel-title">
              <h2>{{ forms.catalog.id ? "编辑资料" : "新建资料" }}</h2>
              <button v-if="hasPermission('catalog.write')" class="ghost-button icon-action" type="button" @click="resetCatalog"><Plus :size="15" :stroke-width="1.8" /> 新建</button>
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
              <button v-if="hasPermission('catalog.write')" class="primary-action wide" type="submit">保存到云端</button>
              <div v-else class="permission-note wide">当前角色仅可查看商品资料。</div>
            </form>
          </aside>
        </section>

        <section v-if="state.activeTab === 'orders'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-model="filters.orderStatus" class="line-input" aria-label="筛选订单状态" @change="resetPageAndLoad('orders', loadOrders)">
                <option value="">全部状态</option>
                <option>待支付</option><option>待发货</option><option>待自提</option><option>已发货</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-model="filters.orderKeyword" class="line-input" aria-label="搜索订单" placeholder="订单号、姓名、手机号" @keydown.enter="resetPageAndLoad('orders', loadOrders)">
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportOrders">{{ exportScopeLabel }}</button>
            </div>
            <div class="record-list">
              <button v-for="order in state.orders" :key="order._id" :class="['record-row', { selected: state.selectedOrderId === order._id }]" type="button" @click="state.selectedOrderId = order._id">
                <strong><span>{{ order.orderNo || order._id }}</span><em>¥{{ money(order.total) }}</em></strong>
                <span class="record-meta">
                  <span>{{ maskName(order.name || order.contactName) || "访客" }} · {{ formatDate(order.createdAt) }}</span>
                  <i class="record-status">{{ order.status }}</i>
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
          <aside class="panel-card detail-panel" v-if="selectedOrder">
            <div class="panel-title"><h2>订单详情</h2><span class="status-pill good">{{ selectedOrder.status }}</span></div>
            <DetailRow label="订单号" :value="selectedOrder.orderNo || selectedOrder._id" />
            <DetailRow label="金额" :value="`¥${money(selectedOrder.total)}`" />
            <DetailRow label="支付" :value="selectedOrder.payStatus || '-'" />
            <DetailRow label="配送" :value="selectedOrder.deliveryMethod === 'shipping' ? '快递' : '到店自提'" />
            <DetailRow label="客户" :value="maskName(selectedOrder.name || selectedOrder.contactName) || '-'" />
            <DetailRow label="电话" :value="maskPhone(selectedOrder.phone || selectedOrder.mobile) || '-'" />
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
            <div class="ship-box" v-if="selectedOrder.status === '待发货'">
              <label><span>快递公司</span><input v-model="orderForm.trackingCompany" placeholder="如 顺丰"></label>
              <label><span>快递单号</span><input v-model="orderForm.trackingNo" placeholder="填写后标记发货"></label>
            </div>
            <label v-if="selectedOrder.status === '待支付'" class="cancel-box">
              <span>取消原因</span>
              <input v-model="orderForm.cancelReason" placeholder="必填，审计日志会记录">
            </label>
            <div class="action-row">
              <button v-if="selectedOrder.status === '待发货' && hasPermission('order.write')" class="secondary-action" type="button" @click="orderAction('ship', selectedOrder)">标记发货</button>
              <button v-if="selectedOrder.status === '待自提' && hasPermission('order.write')" class="secondary-action" type="button" @click="orderAction('pickup', selectedOrder)">完成自提</button>
              <button v-if="selectedOrder.status === '待支付' && hasPermission('order.write')" class="danger-action" type="button" @click="orderAction('cancel', selectedOrder)">取消订单</button>
              <button v-if="hasPermission('afterSale.write')" class="secondary-action" type="button" @click="startAfterSale(selectedOrder)">转售后处理</button>
              <div v-if="!hasPermission('order.write') && !hasPermission('afterSale.write')" class="permission-note">当前角色仅可查看订单。</div>
            </div>
          </aside>
          <aside v-else class="panel-card detail-panel quiet-detail">
            <div class="detail-empty">
              <span><ClipboardList :size="22" :stroke-width="1.8" /></span>
              <strong>选择一笔订单</strong>
              <p>订单号、支付、配送、商品明细和处理时间线会在这里集中核对。</p>
            </div>
          </aside>
        </section>

        <section v-if="state.activeTab === 'afterSales'" class="split-panel">
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
                :class="['record-row', { selected: state.selectedAfterSaleId === order._id }]"
                type="button"
                @click="state.selectedAfterSaleId = order._id; fillAfterSaleForm(order)"
              >
                <strong><span>{{ order.orderNo || order._id }}</span><em>¥{{ money(order.total) }}</em></strong>
                <span class="record-meta">
                  <span>{{ maskName(order.name || order.contactName || order.consignee) || "访客" }} · {{ formatDate(order.afterSaleUpdatedAt || order.updatedAt) }}</span>
                  <i class="record-status warn">{{ order.afterSaleStatus || order.status }}</i>
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
          <aside class="panel-card editor-panel" v-if="selectedAfterSale">
            <div class="panel-title"><h2>售后处理</h2><span class="status-pill neutral">{{ selectedAfterSale.afterSaleStatus || "未处理" }}</span></div>
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
              <button v-if="hasPermission('afterSale.write')" class="primary-action wide" type="submit">保存售后状态</button>
              <div v-else class="permission-note wide">当前角色仅可查看售后记录。</div>
            </form>
          </aside>
          <aside v-else class="panel-card detail-panel quiet-detail">
            <div class="detail-empty">
              <span><BadgeDollarSign :size="22" :stroke-width="1.8" /></span>
              <strong>选择一笔售后</strong>
              <p>退款金额、处理备注、售后状态和审计原因会在这里完成闭环。</p>
            </div>
          </aside>
        </section>

        <section v-if="state.activeTab === 'inventory'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.inventoryKeyword" class="line-input" aria-label="搜索库存流水" placeholder="商品、订单号、类型、备注" @keydown.enter="resetPageAndLoad('inventory', loadInventoryLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('inventory', loadInventoryLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportInventoryLogs">{{ exportScopeLabel }}</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>库存变化流水</caption>
                <thead><tr><th>时间</th><th>商品</th><th>类型</th><th>数量</th><th>库存变化</th><th>订单/备注</th></tr></thead>
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
          <aside class="panel-card editor-panel">
            <div class="panel-title"><h2>人工调整库存</h2></div>
            <form class="editor-grid" @submit.prevent="adjustInventory">
              <label><span>类型</span><select v-model="inventoryForm.collection"><option value="tea_products">茶叶</option><option value="drinks">茶饮</option></select></label>
              <label><span>商品 ID</span><input v-model="inventoryForm.id" required placeholder="如 tea-001"></label>
              <label><span>调整数量</span><input v-model.number="inventoryForm.delta" type="number" required placeholder="正数增加，负数减少"></label>
              <label class="wide"><span>原因</span><textarea v-model="inventoryForm.note" rows="4" placeholder="盘点、损耗、补货等"></textarea></label>
              <button v-if="hasPermission('inventory.write')" class="primary-action wide" type="submit">写入库存流水</button>
              <div v-else class="permission-note wide">当前角色仅可查看库存流水。</div>
            </form>
          </aside>
        </section>

        <section v-if="state.activeTab === 'reservations' || state.activeTab === 'signups'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <select v-if="state.activeTab === 'reservations'" v-model="filters.reservationStatus" class="line-input" aria-label="筛选预约状态" @change="resetPageAndLoad('reservations', loadReservations)">
                <option value="">全部状态</option><option>待确认</option><option>已确认</option><option>已完成</option><option>已取消</option>
              </select>
              <select v-else v-model="filters.signupStatus" class="line-input" aria-label="筛选报名状态" @change="resetPageAndLoad('signups', loadSignups)">
                <option value="">全部状态</option><option>待确认</option><option>已确认</option><option>已到场</option><option>未到场</option><option>已完成</option><option>已取消</option>
              </select>
              <input v-if="state.activeTab === 'reservations'" v-model="filters.reservationKeyword" class="line-input" aria-label="搜索茶室预约" placeholder="茶室、姓名、手机号" @keydown.enter="resetPageAndLoad('reservations', loadReservations)">
              <input v-else v-model="filters.signupKeyword" class="line-input" aria-label="搜索活动报名" placeholder="活动、姓名、手机号" @keydown.enter="resetPageAndLoad('signups', loadSignups)">
              <button v-if="state.activeTab === 'reservations' && hasPermission('export.read')" class="secondary-action small" type="button" @click="exportReservations">{{ exportScopeLabel }}</button>
              <button v-else-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportSignups">{{ exportScopeLabel }}</button>
            </div>
            <div v-if="state.activeTab === 'reservations'" class="calendar-strip">
              <button type="button" @click="shiftReservationCalendar(-1)">‹</button>
              <strong>{{ state.reservationCalendarDate }}</strong>
              <button type="button" @click="shiftReservationCalendar(1)">›</button>
            </div>
            <div v-if="state.activeTab === 'reservations'" class="calendar-board compact-board">
              <div v-for="row in reservationCalendarRows" :key="row.room" class="calendar-row">
                <strong>{{ row.room }}</strong>
                <span v-for="slot in row.slots" :key="slot.time" :class="['calendar-slot', slot.record ? 'busy' : 'free']">
                  <b>{{ slot.time }}</b>
                  <small>{{ slot.record ? `${maskName(slot.record.name || slot.record.customerName) || '访客'} · ${slot.record.people || 1}人` : "可预约" }}</small>
                </span>
              </div>
              <EmptyState v-if="reservationCalendarRows.length === 0" :title="emptyTitle('reservations')" :hint="emptyHint('reservations')" :action-label="emptyActionLabel('reservations')" @action="handleEmptyAction('reservations')" />
            </div>
            <div class="record-list">
              <button
                v-for="record in (state.activeTab === 'reservations' ? state.reservations : state.signups)"
                :key="record._id"
                :class="['record-row', { selected: (state.activeTab === 'reservations' ? state.selectedReservationId : state.selectedSignupId) === record._id }]"
                type="button"
                @click="state.activeTab === 'reservations' ? state.selectedReservationId = record._id : state.selectedSignupId = record._id"
              >
                <strong><span>{{ record.roomName || record.eventTitle || record.title || record.name || "记录" }}</span><em>{{ record.day || record.date || formatDate(record.createdAt) }}</em></strong>
                <span class="record-meta">
                  <span>{{ maskName(record.name || record.customerName) || "访客" }}</span>
                  <i class="record-status">{{ record.status }}</i>
                </span>
              </button>
              <EmptyState v-if="(state.activeTab === 'reservations' ? state.reservations : state.signups).length === 0" :title="emptyTitle(state.activeTab)" :hint="emptyHint(state.activeTab)" :action-label="emptyActionLabel(state.activeTab)" @action="handleEmptyAction(state.activeTab)" />
            </div>
            <div v-if="state.activeTab === 'reservations' && pageMetaFor('reservations').total > pageMetaFor('reservations').pageSize" class="pager">
              <span>{{ pageRangeText('reservations') }}</span>
              <button type="button" :disabled="pageMetaFor('reservations').page <= 1" @click="changePage('reservations', -1, loadReservations)">上一页</button>
              <button type="button" :disabled="pageMetaFor('reservations').page >= pageMetaFor('reservations').pageCount" @click="changePage('reservations', 1, loadReservations)">下一页</button>
            </div>
            <div v-if="state.activeTab === 'signups' && pageMetaFor('signups').total > pageMetaFor('signups').pageSize" class="pager">
              <span>{{ pageRangeText('signups') }}</span>
              <button type="button" :disabled="pageMetaFor('signups').page <= 1" @click="changePage('signups', -1, loadSignups)">上一页</button>
              <button type="button" :disabled="pageMetaFor('signups').page >= pageMetaFor('signups').pageCount" @click="changePage('signups', 1, loadSignups)">下一页</button>
            </div>
          </article>
          <aside class="panel-card detail-panel" v-if="state.activeTab === 'reservations' ? selectedReservation : selectedSignup">
            <div class="panel-title"><h2>{{ state.activeTab === 'reservations' ? "预约详情" : "报名详情" }}</h2></div>
            <template v-if="state.activeTab === 'reservations'">
              <DetailRow label="茶室" :value="selectedReservation.roomName || selectedReservation.room || '-'" />
              <DetailRow label="客户" :value="maskName(selectedReservation.name || selectedReservation.customerName) || '-'" />
              <DetailRow label="日期" :value="selectedReservation.day || selectedReservation.date || '-'" />
              <DetailRow label="时段" :value="selectedReservation.time || selectedReservation.slot || '-'" />
              <DetailRow label="人数" :value="selectedReservation.people || selectedReservation.count || '-'" />
              <div class="record-timeline" v-if="recordTimeline(selectedReservation).length">
                <h3>预约时间线</h3>
                <div v-for="step in recordTimeline(selectedReservation)" :key="`${step.title}-${formatDate(step.time)}`" :class="['timeline-step', step.tone]">
                  <span></span>
                  <strong>{{ step.title }}</strong>
                  <small>{{ formatDate(step.time) }}</small>
                  <p>{{ step.detail || "-" }}</p>
                </div>
              </div>
              <div v-if="hasPermission('reservation.write')" class="action-row">
                <button class="secondary-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已确认')">确认</button>
                <button class="secondary-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已完成')">完成</button>
                <button class="danger-action" type="button" @click="updateRecord('reservation', selectedReservation._id, '已取消')">取消</button>
              </div>
              <div v-else class="permission-note">当前角色仅可查看预约。</div>
            </template>
            <template v-else>
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
            </template>
          </aside>
          <aside v-else class="panel-card detail-panel quiet-detail">
            <div class="detail-empty">
              <span><CalendarCheck :size="22" :stroke-width="1.8" /></span>
              <strong>{{ state.activeTab === 'reservations' ? "选择一条预约" : "选择一条报名" }}</strong>
              <p>{{ state.activeTab === 'reservations' ? "茶室、时段、人数和处理动作会在这里显示。" : "报名人、电话、状态流转和到场核销会在这里显示。" }}</p>
            </div>
          </aside>
        </section>

        <section v-if="state.activeTab === 'customers'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.customerKeyword" class="line-input" aria-label="搜索用户" placeholder="姓名、手机号、OpenID" @keydown.enter="resetPageAndLoad('customers', loadCustomers)">
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportCustomers">{{ exportScopeLabel }}</button>
            </div>
            <div class="record-list">
              <button v-for="customer in state.customers" :key="customer.id" :class="['record-row', { selected: state.selectedCustomerId === customer.id }]" type="button" @click="state.selectedCustomerId = customer.id">
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
          <aside class="panel-card detail-panel" v-if="selectedCustomer">
            <div class="panel-title"><h2>用户画像</h2></div>
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
          <aside v-else class="panel-card detail-panel quiet-detail">
            <div class="detail-empty">
              <span><UserRound :size="22" :stroke-width="1.8" /></span>
              <strong>选择一位用户</strong>
              <p>脱敏联系方式、累计消费、积分、最近访问和隐私动作会在这里显示。</p>
            </div>
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
              <button v-if="hasPermission('content.write')" class="secondary-action small icon-action" type="button" @click="resetContent"><Plus :size="15" :stroke-width="1.8" /> 新建内容</button>
            </div>
            <div class="record-list with-images">
              <button v-for="item in state.contentItems" :key="item.key" :class="{ selected: state.selectedContentKey === item.key }" type="button" @click="editContent(item)">
                <img v-if="displayImage(item.image)" :src="displayImage(item.image)" alt="">
                <span><strong>{{ item.title || item.key }} <em>{{ item.visible === false ? "停用" : "启用" }}</em></strong><small>{{ item.subtitle || item.type }}</small></span>
              </button>
              <EmptyState v-if="state.contentItems.length === 0" :title="emptyTitle('content')" :hint="emptyHint('content')" :action-label="emptyActionLabel('content')" @action="handleEmptyAction('content')" />
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
              <button v-if="hasPermission('content.write')" class="primary-action" type="submit">保存内容</button>
              <button v-if="hasPermission('content.write')" class="danger-action" type="button" @click="deleteContent(forms.content)">停用内容</button>
              <div v-else class="permission-note wide">当前角色仅可查看内容。</div>
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
            <table><caption>热销项目统计</caption><thead><tr><th>名称</th><th>类型</th><th>销售额</th><th>数量</th></tr></thead><tbody><tr v-for="item in (state.analytics?.topItems || [])" :key="item.name"><td>{{ item.name }}</td><td>{{ item.type }}</td><td>¥{{ money(item.amount) }}</td><td>{{ item.count }}</td></tr></tbody></table>
            <EmptyState v-if="(state.analytics?.topItems || []).length === 0" title="暂无热销项目" hint="有已支付订单后会自动生成销售排行。" :action-label="emptyActionLabel('analytics')" @action="handleEmptyAction('analytics')" />
          </article>
        </section>

        <section v-if="state.activeTab === 'marketing'" class="marketing-grid">
          <article class="panel-card">
            <div class="panel-title">
              <h2>优惠券</h2>
              <button v-if="hasPermission('marketing.write')" class="link-more" type="button" @click="resetCoupon">新建 ›</button>
            </div>
            <div class="flow-list">
              <button v-for="item in state.coupons" :key="item.id" :class="['record-row', { selected: state.selectedCouponId === item.id }]" type="button" @click="editCoupon(item)">
                <strong><span>{{ item.name }}</span><em>¥{{ money(item.amount) }}</em></strong>
                <span class="record-meta">
                  <span>{{ item.status }} · 门槛 ¥{{ money(item.threshold) }}</span>
                  <i class="record-status neutral">库存 {{ item.stock || "不限" }}</i>
                </span>
              </button>
              <EmptyState v-if="state.coupons.length === 0" title="暂无优惠券" :hint="emptyHint('marketing')" :action-label="emptyActionLabel('marketing')" @action="handleEmptyAction('marketing')" />
            </div>
          </article>
          <article class="panel-card">
            <div class="panel-title">
              <h2>营销计划</h2>
              <button v-if="hasPermission('marketing.write')" class="link-more" type="button" @click="resetCampaign">新建 ›</button>
            </div>
            <div class="flow-list">
              <button v-for="item in state.campaigns" :key="item.id" :class="['record-row', { selected: state.selectedCampaignId === item.id }]" type="button" @click="editCampaign(item)">
                <strong><span>{{ item.name }}</span><em>{{ item.status }}</em></strong>
                <span class="record-meta">
                  <span>{{ item.type }} · {{ item.summary || "无摘要" }}</span>
                  <i class="record-status neutral">{{ item.visible === false ? "已停用" : "启用" }}</i>
                </span>
              </button>
              <EmptyState v-if="state.campaigns.length === 0" title="暂无营销计划" :hint="emptyHint('marketing')" :action-label="emptyActionLabel('marketing')" @action="handleEmptyAction('marketing')" />
            </div>
          </article>
          <article class="panel-card wide-table">
            <div class="panel-title"><h2>优惠券核销看板</h2></div>
            <table>
              <caption>优惠券领取与核销统计</caption>
              <thead><tr><th>优惠券</th><th>领取</th><th>使用</th><th>核销率</th><th>带来订单金额</th></tr></thead>
              <tbody>
                <tr v-for="item in state.couponStats" :key="item.id">
                  <td>{{ item.name || item.id }}</td>
                  <td>{{ item.claimed }}</td>
                  <td>{{ item.redeemed }}</td>
                  <td>{{ item.redeemRate }}%</td>
                  <td>¥{{ money(item.orderAmount) }}</td>
                </tr>
              </tbody>
            </table>
            <EmptyState v-if="state.couponStats.length === 0" title="暂无优惠券领取记录" hint="领取和核销后会自动形成转化统计。" :action-label="emptyActionLabel('marketing')" @action="handleEmptyAction('marketing')" />
          </article>
          <form v-if="hasPermission('marketing.write')" class="panel-card editor-form" @submit.prevent="saveCoupon">
            <div class="panel-title">
              <h2>{{ state.selectedCouponId ? "编辑优惠券" : "新建优惠券" }}</h2>
              <button class="link-more" type="button" @click="resetCoupon">清空</button>
            </div>
            <label><span>名称</span><input v-model="forms.coupon.name"></label>
            <label><span>面额</span><input v-model.number="forms.coupon.amount" type="number" min="0" step="0.01"></label>
            <label><span>门槛</span><input v-model.number="forms.coupon.threshold" type="number" min="0" step="0.01"></label>
            <label><span>库存</span><input v-model.number="forms.coupon.stock" type="number" min="0" placeholder="0 表示不限量"></label>
            <label><span>状态</span><select v-model="forms.coupon.status"><option>领取中</option><option>暂停领取</option><option>已结束</option></select></label>
            <label><span>每人限领</span><input v-model.number="forms.coupon.claimLimit" type="number" min="1"></label>
            <label><span>开始日期</span><input v-model="forms.coupon.startAt" type="date"></label>
            <label><span>结束日期</span><input v-model="forms.coupon.endAt" type="date"></label>
            <label class="wide"><span>优惠说明</span><textarea v-model="forms.coupon.description" rows="3"></textarea></label>
            <button class="primary-action icon-action" type="submit"><BadgeDollarSign :size="16" :stroke-width="1.8" /> 保存优惠券</button>
            <button v-if="state.selectedCouponId" class="danger-action icon-action" type="button" @click="disableCoupon()"><BadgeDollarSign :size="16" :stroke-width="1.8" /> 停用优惠券</button>
          </form>
          <form v-if="hasPermission('marketing.write')" class="panel-card editor-form" @submit.prevent="saveCampaign">
            <div class="panel-title">
              <h2>{{ state.selectedCampaignId ? "编辑营销计划" : "新建营销计划" }}</h2>
              <button class="link-more" type="button" @click="resetCampaign">清空</button>
            </div>
            <label><span>名称</span><input v-model="forms.campaign.name"></label>
            <label><span>类型</span><input v-model="forms.campaign.type"></label>
            <label><span>状态</span><select v-model="forms.campaign.status"><option>进行中</option><option>待上线</option><option>已暂停</option><option>已结束</option></select></label>
            <label><span>开始日期</span><input v-model="forms.campaign.startAt" type="date"></label>
            <label><span>结束日期</span><input v-model="forms.campaign.endAt" type="date"></label>
            <label><span>摘要</span><textarea v-model="forms.campaign.summary" rows="3"></textarea></label>
            <button class="primary-action icon-action" type="submit"><Send :size="16" :stroke-width="1.8" /> 保存计划</button>
            <button v-if="state.selectedCampaignId" class="danger-action icon-action" type="button" @click="disableCampaign()"><Send :size="16" :stroke-width="1.8" /> 停用计划</button>
          </form>
        </section>

        <section v-if="state.activeTab === 'audit'" class="split-panel">
          <article class="panel-card data-panel audit-panel">
            <div class="panel-toolbar">
              <input v-model="filters.auditKeyword" class="line-input" aria-label="搜索审计日志" placeholder="动作、管理员、详情" @keydown.enter="resetPageAndLoad('audit', loadAuditLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('audit', loadAuditLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportAuditLogs">{{ exportScopeLabel }}</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>后台关键操作审计日志</caption>
                <thead><tr><th>时间</th><th>动作</th><th>管理员</th><th>摘要</th></tr></thead>
                <tbody>
                  <tr v-for="log in state.auditLogs" :key="log._id" :class="{ selected: state.selectedAuditLogId === log._id }" @click="state.selectedAuditLogId = log._id">
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
          <aside class="panel-card detail-panel" v-if="selectedAuditLog">
            <div class="panel-title"><h2>审计详情</h2><span class="status-pill neutral">{{ selectedAuditLog.action }}</span></div>
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
        </section>

        <section v-if="state.activeTab === 'notifications'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-toolbar">
              <input v-model="filters.notificationKeyword" class="line-input" aria-label="搜索通知日志" placeholder="类型、OpenID、模板、原因" @keydown.enter="resetPageAndLoad('notifications', loadNotificationLogs)">
              <button class="secondary-action small" type="button" @click="resetPageAndLoad('notifications', loadNotificationLogs)">筛选</button>
              <button v-if="hasPermission('export.read')" class="secondary-action small" type="button" @click="exportNotificationLogs">{{ exportScopeLabel }}</button>
            </div>
            <div class="table-wrap">
              <table>
                <caption>订阅消息投递日志</caption>
                <thead><tr><th>时间</th><th>类型</th><th>状态</th><th>模板/OpenID</th><th>原因</th></tr></thead>
                <tbody>
                  <tr v-for="log in state.notificationLogs" :key="log._id">
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td>{{ log.kind || "-" }}</td>
                    <td><span :class="['status-pill', log.status === 'sent' ? 'good' : 'neutral']">{{ log.status || "-" }}</span></td>
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
          <aside v-if="hasPermission('notification.write')" class="panel-card editor-panel">
            <div class="panel-title"><h2>测试通知</h2></div>
            <form class="editor-grid" @submit.prevent="sendTestNotice">
              <label><span>类型</span><select v-model="noticeTestForm.kind"><option value="reservationStatus">预约状态</option><option value="eventStatus">活动报名</option><option value="orderShipped">订单发货</option><option value="orderPaid">订单支付</option></select></label>
              <label><span>OpenID</span><input v-model="noticeTestForm.openid" placeholder="用户 OpenID"></label>
              <label class="wide"><span>备注</span><textarea v-model="noticeTestForm.note" rows="3"></textarea></label>
              <button class="primary-action wide" type="submit">发送测试通知</button>
            </form>
          </aside>
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
        </section>

        <section v-if="state.activeTab === 'roles'" class="split-panel">
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
          <aside class="panel-card editor-panel">
            <div class="panel-title"><h2>角色编辑</h2></div>
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
              <button v-if="hasPermission('roles.manage')" class="primary-action wide" type="submit">保存角色</button>
            </form>
          </aside>
        </section>

        <section v-if="state.activeTab === 'backups'" class="split-panel">
          <article class="panel-card data-panel">
            <div class="panel-title"><h2>备份记录</h2><button class="secondary-action small" type="button" @click="loadBackupLogs">刷新</button></div>
            <div class="table-wrap">
              <table>
                <caption>云端备份记录</caption>
                <thead><tr><th>时间</th><th>状态</th><th>文件</th><th>大小</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="log in state.backupLogs" :key="log._id">
                    <td>{{ formatDate(log.createdAt) }}</td>
                    <td><span :class="['status-pill', log.status === 'success' ? 'good' : 'neutral']">{{ log.status }}</span></td>
                    <td><strong>{{ log.cloudPath || "-" }}</strong><small>{{ log.error || log.fileId || "" }}</small></td>
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
          <aside class="panel-card editor-panel">
            <div class="panel-title"><h2>创建备份</h2></div>
            <form class="editor-grid" @submit.prevent="createDataBackup">
              <label><span>每个集合上限</span><input v-model.number="backupForm.limit" type="number" min="50" max="1000"></label>
              <div class="privacy-note wide">备份会导出订单、预约、报名、会员、商品、内容、优惠券、审计、通知和库存日志，并写入云存储 admin-backups/。</div>
              <button v-if="hasPermission('backup.create')" class="primary-action wide icon-action" type="submit"><Database :size="16" :stroke-width="1.8" /> 创建云端备份</button>
              <div v-else class="permission-note wide">当前角色仅可查看备份记录。</div>
            </form>
          </aside>
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
                <label class="wide"><span>预约规则</span><textarea v-model="state.settings.reservationRule" rows="4"></textarea></label>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-head">
                <span>02</span>
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
                <span>03</span>
                <h2>订单与履约</h2>
              </div>
              <div class="settings-switches">
                <label class="switch"><input v-model="state.settings.paymentEnabled" type="checkbox"> 启用微信支付</label>
                <label class="switch"><input v-model="state.settings.pickupEnabled" type="checkbox"> 启用自提</label>
                <label class="switch"><input v-model="state.settings.shippingEnabled" type="checkbox"> 启用配送</label>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-head">
                <span>04</span>
                <h2>订阅消息</h2>
              </div>
              <div class="settings-switches">
                <label class="switch"><input v-model="state.settings.orderNoticeEnabled" type="checkbox"> 订单通知</label>
                <label class="switch"><input v-model="state.settings.reservationNoticeEnabled" type="checkbox"> 预约通知</label>
                <label class="switch"><input v-model="state.settings.eventNoticeEnabled" type="checkbox"> 活动通知</label>
              </div>
              <div class="settings-fields">
                <label class="wide"><span>支付成功模板 ID</span><input v-model="state.settings.orderPaidTemplateId"></label>
                <label class="wide"><span>支付成功跳转页</span><input v-model="state.settings.orderPaidPage"></label>
                <label class="wide"><span>发货通知模板 ID</span><input v-model="state.settings.orderShippedTemplateId"></label>
                <label class="wide"><span>发货通知跳转页</span><input v-model="state.settings.orderShippedPage"></label>
                <label class="wide"><span>预约通知模板 ID</span><input v-model="state.settings.reservationTemplateId"></label>
                <label class="wide"><span>预约通知跳转页</span><input v-model="state.settings.reservationNoticePage"></label>
                <label class="wide"><span>活动通知模板 ID</span><input v-model="state.settings.eventTemplateId"></label>
                <label class="wide"><span>活动通知跳转页</span><input v-model="state.settings.eventNoticePage"></label>
              </div>
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
          <span class="dialog-kicker">{{ actionDialog.mode === "reason" ? "Audit Required" : "Risk Control" }}</span>
          <h2>{{ actionDialog.title }}</h2>
          <p>{{ actionDialog.message }}</p>
          <div v-if="actionDialog.expected" class="confirm-target">
            <span>确认值</span>
            <strong>{{ actionDialog.expected }}</strong>
          </div>
          <label v-if="actionDialog.mode === 'typed'" class="wide">
            <span>输入确认值</span>
            <input v-model="actionDialog.input" autocomplete="off" :placeholder="actionDialog.expected">
          </label>
          <label v-if="actionDialog.mode === 'reason'" class="wide">
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
      <div :class="['toast', { show: toast.show }]">{{ toast.text }}</div>
    </section>
  </main>
</template>
