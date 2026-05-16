const CONFIG = {
  envId: "sanmuhe-env-d3g1nt3jsa1be67e3",
  region: "ap-shanghai",
  accessKey: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL3Nhbm11aGUtZW52LWQzZzFudDNqc2ExYmU2N2UzLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJzYW5tdWhlLWVudi1kM2cxbnQzanNhMWJlNjdlMyIsImV4cCI6NDA4MjUxODk5NiwiaWF0IjoxNzc4ODM1Nzk2LCJub25jZSI6Im8xbE9LR053VGs2U2I4WGgyTUpfbmciLCJhdF9oYXNoIjoibzFsT0tHTndUazZTYjhYaDJNSl9uZyIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJzYW5tdWhlLWVudi1kM2cxbnQzanNhMWJlNjdlMyIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.OEuP69P5I_7iZiARFAcqBTO3jbhUwe2uruyIIlqLQPyqkikfnbuNS2AtPjy1zZqU0IFKU_QZH3HAG_oOvTPwH8n1WNWRcLNsetLvPM0pgCYvt5FcbaC6w8-zMxqSr2bCm1C0qLzz1Hu69LwD4YV86yhUUgsHiYsrrtIiRfdhX22sZgV6z57dlhidaCIFQCsr8bNdvEe_5tWPkDYqfernkqYHSZNfds2ILxAR-DYgt7j22zh2LUxzxLagIZ4SwTiea_UmNe7eUDdtjci-lqdLMDev7jbeVxndLnKq6cfBQvZANgjcI_57NxtQmDvSB7jVGuITgBCpPXBLGvNbjcUd9A"
};

const state = {
  app: null,
  auth: null,
  user: null,
  tab: "dashboard",
  collection: "tea_products",
  contentType: "home_carousel",
  catalogItems: [],
  orders: [],
  reservations: [],
  signups: [],
  customers: [],
  contentItems: [],
  coupons: [],
  campaigns: [],
  dashboard: null,
  analytics: null,
  settings: null,
  selectedCatalogId: "",
  selectedOrderId: "",
  selectedReservationId: "",
  selectedSignupId: "",
  selectedCustomerId: "",
  selectedContentKey: "",
  toastTimer: null
};

const collectionLabels = {
  tea_products: "茶叶",
  drinks: "茶饮",
  rooms: "茶室",
  events: "活动"
};

const tabTitles = {
  dashboard: "后台首页",
  catalog: "商品管理",
  orders: "订单管理",
  reservations: "茶室预约",
  signups: "茶事活动",
  customers: "用户管理",
  content: "内容管理",
  analytics: "数据统计",
  marketing: "营销中心",
  settings: "设置管理"
};

const panelKeywords = {
  catalog: "#catalogKeyword",
  orders: "#orderKeyword",
  reservations: "#reservationKeyword",
  signups: "#signupKeyword",
  customers: "#customerKeyword"
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(selector, text) {
  const node = $(selector);
  if (node) {
    node.textContent = text;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showView(name) {
  $("[data-view='login']").classList.toggle("hidden", name !== "login");
  $("[data-view='dashboard']").classList.toggle("hidden", name !== "dashboard");
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function normalizeAuth(app) {
  if (app.auth && typeof app.auth.getSession === "function") {
    return app.auth;
  }
  if (typeof app.auth === "function") {
    return app.auth({ persistence: "local" });
  }
  return app.auth;
}

function initCloud() {
  if (!window.cloudbase) {
    throw new Error("CloudBase Web SDK 加载失败");
  }
  const options = {
    env: CONFIG.envId,
    region: CONFIG.region,
    auth: { detectSessionInUrl: true }
  };
  if (CONFIG.accessKey) {
    options.accessKey = CONFIG.accessKey;
  }
  state.app = cloudbase.init(options);
  state.auth = normalizeAuth(state.app);
}

async function signIn(username, password) {
  if (state.auth.signInWithPassword) {
    const result = await state.auth.signInWithPassword({ username, password });
    if (result && result.error) {
      throw new Error(result.error.message || "登录失败");
    }
    return result && result.data ? result.data.user : result;
  }
  if (state.auth.signIn) {
    const result = await state.auth.signIn({ username, password });
    if (result && result.error) {
      throw new Error(result.error.message || "登录失败");
    }
    return result && result.data ? result.data.user : result;
  }
  if (state.auth.signInWithUsernameAndPassword) {
    return state.auth.signInWithUsernameAndPassword(username, password);
  }
  throw new Error("当前 SDK 不支持用户名密码登录");
}

async function getSessionUser() {
  if (!state.auth) {
    return null;
  }
  if (state.auth.getSession) {
    const result = await state.auth.getSession();
    return result && result.data && result.data.session ? result.data.session.user : null;
  }
  if (state.auth.getLoginState) {
    const loginState = await state.auth.getLoginState();
    return loginState && loginState.user ? loginState.user : null;
  }
  return null;
}

async function callFunction(name, data) {
  const response = await state.app.callFunction({ name, data });
  const result = response && response.result ? response.result : response;
  if (result && result.ok === false) {
    throw new Error(result.message || "云函数调用失败");
  }
  return result || {};
}

function displayImage(src) {
  if (!src || src.indexOf("cloud://") === 0) {
    return "";
  }
  if (src.indexOf("/assets/") === 0) {
    return `..${src}`;
  }
  return src;
}

function money(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function formatDate(value) {
  if (!value) {
    return "未记录";
  }
  if (value instanceof Date) {
    return value.toLocaleString("zh-CN", { hour12: false });
  }
  if (typeof value === "object") {
    if (value.$date) {
      return formatDate(value.$date);
    }
    if (value.seconds) {
      return formatDate(value.seconds * 1000);
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusTone(status) {
  if (["已确认", "已发货", "已完成", "上架", "可预定", "报名中"].includes(status)) {
    return "good";
  }
  if (["待支付", "待确认", "待发货", "待自提"].includes(status)) {
    return "warn";
  }
  if (["异常待处理"].includes(status)) {
    return "danger";
  }
  if (["已取消", "已下架"].includes(status)) {
    return "neutral";
  }
  return "info";
}

function statusBadge(status) {
  const label = status || "未设置";
  return `<span class="status-badge ${statusTone(label)}">${escapeHtml(label)}</span>`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text || "")}</span></div></div>`;
}

function loadingState(text) {
  return `<div class="loading-state"><div><strong>${escapeHtml(text || "加载中")}</strong></div></div>`;
}

function errorState(message) {
  return `<div class="error-state"><div><strong>加载失败</strong><span>${escapeHtml(message || "请稍后重试")}</span></div></div>`;
}

function syncGlobalKeyword() {
  const target = panelKeywords[state.tab];
  const value = target && $(target) ? $(target).value : "";
  $("#globalKeyword").value = value || "";
}

async function refreshSummary() {
  const result = await callFunction("manageOperations", { action: "getSummary" });
  const summary = result.summary || {};
  const pendingWork = Number(summary.toShip || 0)
    + Number(summary.toPickup || 0)
    + Number(summary.pendingReservations || 0)
    + Number(summary.pendingSignups || 0);
  const cards = [
    ["待处理", pendingWork, "履约与确认", pendingWork > 0],
    ["待支付", summary.pendingPay || 0, "未完成支付", false],
    ["待发货", summary.toShip || 0, "快递订单", false],
    ["待自提", summary.toPickup || 0, "门店自提", false],
    ["待确认", Number(summary.pendingReservations || 0) + Number(summary.pendingSignups || 0), "预约与报名", false]
  ];
  $("#summaryGrid").innerHTML = cards.map(([label, value, hint, urgent]) => (
    `<article class="summary-card ${urgent ? "urgent" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>`
  )).join("");
}

function setActiveTab(tab) {
  state.tab = tab;
  $all(".nav-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  $all(".panel").forEach((panel) => panel.classList.remove("active-panel"));
  const panel = $(`#${tab}Panel`);
  if (panel) {
    panel.classList.add("active-panel");
  }
  setText("#pageTitle", tabTitles[tab]);
  syncGlobalKeyword();
}

async function loadActiveTab() {
  await refreshSummary();
  if (state.tab === "dashboard") {
    await loadDashboard();
  } else if (state.tab === "catalog") {
    await loadCatalog();
  } else if (state.tab === "orders") {
    await loadOrders();
  } else if (state.tab === "reservations") {
    await loadReservations();
  } else if (state.tab === "signups") {
    await loadSignups();
  } else if (state.tab === "customers") {
    await loadCustomers();
  } else if (state.tab === "content") {
    await loadContent();
  } else if (state.tab === "analytics") {
    await loadAnalytics();
  } else if (state.tab === "marketing") {
    await loadMarketing();
  } else if (state.tab === "settings") {
    await loadSettings();
  }
}

function setTableLoading(selector, text) {
  $(selector).innerHTML = loadingState(text);
}

function setDetailEmpty(selector, title, text) {
  $(selector).classList.add("empty");
  $(selector).innerHTML = `<div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text || "")}</p></div>`;
}

function clearDetailEmpty(selector) {
  $(selector).classList.remove("empty");
}

function getVisibleStatus(item) {
  return item.visible === false || item.deleted === true ? "已下架" : (item.status || "上架");
}

function inventoryText(item) {
  if (item.stock === undefined) {
    return "";
  }
  return `总 ${Number(item.stock || 0)} / 锁 ${Number(item.lockedStock || 0)} / 售 ${Number(item.soldStock || 0)} / 可 ${Number(item.availableStock || 0)}`;
}

function bindImageFallback(scope) {
  $all(`${scope} img.thumb`).forEach((image) => {
    image.addEventListener("error", () => {
      const fallback = document.createElement("div");
      fallback.className = "thumb-fallback";
      fallback.textContent = image.dataset.fallback || "图片";
      image.replaceWith(fallback);
    }, { once: true });
  });
}

function compactRows(items, getTitle, getMeta, getEnd) {
  if (!items || !items.length) {
    return emptyState("暂无记录", "有新数据后会自动出现");
  }
  return items.map((item) => `
    <div class="compact-row">
      <div>
        <strong>${escapeHtml(getTitle(item))}</strong>
        <span>${escapeHtml(getMeta(item))}</span>
      </div>
      <em>${escapeHtml(getEnd(item))}</em>
    </div>
  `).join("");
}

async function loadDashboard() {
  $("#roomBoard").innerHTML = loadingState("读取经营首页");
  try {
    const result = await callFunction("manageOperations", { action: "getDashboard" });
    state.dashboard = result.dashboard || {};
    renderDashboard();
  } catch (error) {
    $("#roomBoard").innerHTML = errorState(error.message);
    showToast(error.message || "经营首页加载失败");
  }
}

function renderDashboard() {
  const dashboard = state.dashboard || {};
  const board = dashboard.roomBoard || [];
  $("#roomBoard").innerHTML = board.length ? `
    <div class="room-board-table">
      <div class="room-board-head">
        <span>茶室</span>
        <span>10:00</span>
        <span>12:30</span>
        <span>15:00</span>
        <span>17:30</span>
        <span>20:00</span>
      </div>
      ${board.map((room) => `
        <div class="room-board-row">
          <div><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.capacity || "")}</small></div>
          ${(room.slots || []).map((slot) => `
            <div class="slot ${slot.status === "可预约" ? "open" : "booked"}">
              <strong>${escapeHtml(slot.status)}</strong>
              <span>${escapeHtml(slot.name ? `${slot.name} ${slot.people || 1}人` : "")}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  ` : emptyState("暂无茶室排期", "配置茶室和预约后显示");

  $("#recentReservations").innerHTML = compactRows(
    dashboard.recentReservations || [],
    (item) => item.room || item.name || "茶室预约",
    (item) => `${item.day || ""} ${item.time || ""} · ${item.name || ""}`,
    (item) => item.status || "待确认"
  );
  $("#recentSignups").innerHTML = compactRows(
    dashboard.recentSignups || [],
    (item) => item.title || item.eventId || "活动报名",
    (item) => `${item.name || ""} · ${item.phone || ""}`,
    (item) => item.status || "待确认"
  );
  $("#recentOrders").innerHTML = compactRows(
    dashboard.recentOrders || [],
    (item) => item.orderNo || item._id || "订单",
    (item) => `${item.consignee || item.name || ""} · ¥${money(item.total)}`,
    (item) => item.status || "待支付"
  );
}

function getItemName(item) {
  return item.name || item.title || item.id || "未命名";
}

function filterCatalogItems() {
  const keyword = ($("#catalogKeyword").value || "").trim().toLowerCase();
  if (!keyword) {
    return state.catalogItems;
  }
  return state.catalogItems.filter((item) => [
    item.id,
    item.name,
    item.title,
    item.category,
    item.status,
    item.unit,
    item.capacity
  ].join(" ").toLowerCase().includes(keyword));
}

async function loadCatalog() {
  setTableLoading("#catalogTable", "读取商品资料");
  try {
    const result = await callFunction("manageCatalog", {
      action: "list",
      collection: state.collection,
      includeHidden: true
    });
    state.catalogItems = result.items || [];
    if (state.selectedCatalogId && !state.catalogItems.some((item) => item.id === state.selectedCatalogId)) {
      state.selectedCatalogId = "";
    }
    renderCatalog();
    if (!state.selectedCatalogId) {
      resetCatalogForm();
    }
  } catch (error) {
    $("#catalogTable").innerHTML = errorState(error.message);
    showToast(error.message || "商品资料加载失败");
  }
}

function renderCatalog() {
  const items = filterCatalogItems();
  if (!items.length) {
    $("#catalogTable").innerHTML = emptyState(`暂无${collectionLabels[state.collection]}`, "调整筛选条件或新建资料");
    return;
  }

  $("#catalogTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 34%">资料</th>
          <th style="width: 12%">分类</th>
          <th style="width: 12%">价格</th>
          <th style="width: 20%">库存</th>
          <th style="width: 10%">状态</th>
          <th style="width: 12%">操作</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => {
          const name = getItemName(item);
          const img = displayImage(item.image || item.thumb);
          return `
            <tr class="${state.selectedCatalogId === item.id ? "selected" : ""}" data-id="${escapeHtml(item.id)}">
              <td data-label="资料">
                <div class="name-cell">
                  ${img ? `<img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(name)}" data-fallback="${escapeHtml(collectionLabels[state.collection])}">` : `<div class="thumb-fallback">${escapeHtml(collectionLabels[state.collection])}</div>`}
                  <div class="cell-title">
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml(item.id || "未设置 ID")}</span>
                  </div>
                </div>
              </td>
              <td data-label="分类">${escapeHtml(item.category || "-")}</td>
              <td data-label="价格" class="numeric">${item.price !== undefined ? `¥${money(item.price)}` : "-"}</td>
              <td data-label="库存">${escapeHtml(inventoryText(item) || "-")}</td>
              <td data-label="状态">${statusBadge(getVisibleStatus(item))}</td>
              <td data-label="操作">
                <div class="row-actions">
                  <button class="btn btn-small btn-secondary" data-action="edit" data-id="${escapeHtml(item.id)}" type="button">编辑</button>
                  <button class="btn btn-small ${item.visible === false || item.deleted ? "btn-primary" : "btn-danger"}" data-action="toggle" data-id="${escapeHtml(item.id)}" type="button">${item.visible === false || item.deleted ? "上架" : "下架"}</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  $all("#catalogTable [data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const item = state.catalogItems.find((entry) => entry.id === button.dataset.id);
      if (!item) {
        return;
      }
      if (button.dataset.action === "edit") {
        fillCatalogForm(item);
        renderCatalog();
      } else {
        await toggleCatalogItem(item);
      }
    });
  });

  $all("#catalogTable tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      const item = state.catalogItems.find((entry) => entry.id === row.dataset.id);
      if (item) {
        fillCatalogForm(item);
        renderCatalog();
      }
    });
  });
  bindImageFallback("#catalogTable");
}

function updateImagePreview(value) {
  const preview = $("#imagePreview");
  const src = displayImage(value || "");
  if (src) {
    preview.innerHTML = `<img src="${escapeHtml(src)}" alt="资料图片预览">`;
    const image = preview.querySelector("img");
    image.addEventListener("error", () => {
      preview.textContent = "图片不可预览";
    }, { once: true });
  } else if (value && value.indexOf("cloud://") === 0) {
    preview.textContent = "Cloud 文件";
  } else {
    preview.textContent = "无图片";
  }
}

function updateSelectedFileName() {
  const file = $("#imageFile").files[0];
  setText("#imageFileName", file ? file.name : "未选择文件");
  if (file) {
    const url = URL.createObjectURL(file);
    const preview = $("#imagePreview");
    preview.innerHTML = `<img src="${url}" alt="待上传图片预览">`;
  }
}

function resetCatalogForm() {
  const form = $("#catalogForm");
  form.reset();
  state.selectedCatalogId = "";
  form.elements._mode.value = "create";
  form.elements.visible.checked = true;
  setText("#catalogFormTitle", `新建${collectionLabels[state.collection]}`);
  $("#catalogModeBadge").outerHTML = `<span id="catalogModeBadge" class="status-badge neutral">草稿</span>`;
  updateImagePreview("");
  $("#imageFile").value = "";
  setText("#imageFileName", "未选择文件");
  setText("#catalogMessage", "");
  renderCatalog();
}

function fillCatalogForm(item) {
  const form = $("#catalogForm");
  state.selectedCatalogId = item.id || "";
  form.elements._mode.value = "update";
  form.elements.id.value = item.id || "";
  form.elements.name.value = item.name || item.title || "";
  form.elements.category.value = item.category || "";
  form.elements.price.value = item.price !== undefined ? item.price : "";
  form.elements.sort.value = item.sort !== undefined ? item.sort : "";
  form.elements.stock.value = item.stock !== undefined ? item.stock : "";
  form.elements.unit.value = item.unit || item.capacity || "";
  form.elements.image.value = item.image || item.thumb || "";
  form.elements.summary.value = item.summary || item.detail || item.notes || item.taste || "";
  form.elements.visible.checked = item.visible !== false && item.deleted !== true;
  form.elements.extra.value = buildExtraText(item);
  setText("#catalogFormTitle", getItemName(item));
  $("#catalogModeBadge").outerHTML = statusBadge(getVisibleStatus(item)).replace("status-badge", "status-badge");
  $("#catalogForm .detail-head .status-badge").id = "catalogModeBadge";
  updateImagePreview(form.elements.image.value);
  setText("#catalogMessage", "");
}

function buildExtraText(item) {
  const keys = ["origin", "roast", "taste", "detail", "thumb", "notes", "badge", "color", "temps", "sugars", "floor", "status", "features", "date", "time", "place", "quota", "signed"];
  return keys
    .filter((key) => item[key] !== undefined && item[key] !== "")
    .map((key) => `${key}: ${Array.isArray(item[key]) ? item[key].join(", ") : item[key]}`)
    .join("\n");
}

function parseExtra(text) {
  const data = {};
  String(text || "").split("\n").forEach((line) => {
    const index = line.indexOf(":");
    if (index <= 0) {
      return;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key) {
      return;
    }
    if (["features", "temps", "sugars"].includes(key)) {
      data[key] = value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (["quota", "signed"].includes(key)) {
      data[key] = Number(value) || 0;
    } else {
      data[key] = value;
    }
  });
  return data;
}

function readCatalogForm() {
  const form = $("#catalogForm");
  const data = parseExtra(form.elements.extra.value);
  const nameValue = form.elements.name.value.trim();
  data.id = form.elements.id.value.trim();
  data.category = form.elements.category.value.trim();
  data.price = Number(form.elements.price.value || 0);
  data.sort = Number(form.elements.sort.value || 0);
  data.image = form.elements.image.value.trim();
  data.visible = form.elements.visible.checked;

  if (state.collection === "events") {
    data.title = nameValue;
    data.summary = form.elements.summary.value.trim();
    data.deleted = !data.visible;
  } else {
    data.name = nameValue;
    if (state.collection === "rooms") {
      data.capacity = form.elements.unit.value.trim();
      data.floor = data.floor || form.elements.summary.value.trim();
    } else {
      data.unit = form.elements.unit.value.trim();
      data.stock = form.elements.stock.value === "" ? undefined : Number(form.elements.stock.value);
      if (state.collection === "tea_products") {
        data.detail = data.detail || form.elements.summary.value.trim();
      } else {
        data.notes = data.notes || form.elements.summary.value.trim();
      }
    }
  }

  return data;
}

async function saveCatalogItem(event) {
  event.preventDefault();
  const form = $("#catalogForm");
  const submit = form.querySelector("button[type='submit']");
  const data = readCatalogForm();
  const mode = form.elements._mode.value;
  if (!(data.name || data.title)) {
    setText("#catalogMessage", "请填写名称或标题");
    return;
  }
  submit.disabled = true;
  try {
    await callFunction("manageCatalog", {
      action: mode,
      collection: state.collection,
      id: data.id,
      data
    });
    setText("#catalogMessage", "已保存");
    showToast("资料已保存");
    state.selectedCatalogId = data.id;
    await loadCatalog();
  } catch (error) {
    setText("#catalogMessage", error.message || "保存失败");
  } finally {
    submit.disabled = false;
  }
}

async function toggleCatalogItem(item) {
  const hidden = item.visible === false || item.deleted === true;
  await callFunction("manageCatalog", {
    action: hidden ? "restore" : "delete",
    collection: state.collection,
    id: item.id
  });
  showToast(hidden ? "资料已上架" : "资料已下架");
  await loadCatalog();
}

async function deleteCurrentItem() {
  const id = $("#catalogForm").elements.id.value.trim();
  if (!id) {
    setText("#catalogMessage", "请先选择一条资料");
    return;
  }
  await callFunction("manageCatalog", {
    action: "delete",
    collection: state.collection,
    id
  });
  showToast("资料已下架");
  await loadCatalog();
}

async function uploadImage() {
  const file = $("#imageFile").files[0];
  if (!file) {
    setText("#catalogMessage", "请选择图片");
    return;
  }
  const button = $("#uploadBtn");
  button.disabled = true;
  try {
    const cloudPath = `admin/${state.collection}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const result = await state.app.uploadFile({
      cloudPath,
      filePath: file
    });
    const fileId = result.fileID || result.fileId || "";
    $("#catalogForm").elements.image.value = fileId;
    updateImagePreview(fileId);
    setText("#catalogMessage", "图片已上传");
    showToast("图片已上传");
  } catch (error) {
    setText("#catalogMessage", error.message || "图片上传失败");
  } finally {
    button.disabled = false;
  }
}

async function loadOrders() {
  setTableLoading("#ordersTable", "读取订单");
  setDetailEmpty("#orderDetail", "选择订单", "查看履约和收货信息");
  try {
    const result = await callFunction("manageOperations", {
      action: "listOrders",
      status: $("#orderStatus").value,
      keyword: $("#orderKeyword").value.trim()
    });
    state.orders = result.orders || [];
    if (state.selectedOrderId && !state.orders.some((order) => order._id === state.selectedOrderId)) {
      state.selectedOrderId = "";
    }
    renderOrders();
  } catch (error) {
    $("#ordersTable").innerHTML = errorState(error.message);
    showToast(error.message || "订单加载失败");
  }
}

function renderOrders() {
  if (!state.orders.length) {
    $("#ordersTable").innerHTML = emptyState("暂无订单", "当前筛选条件下没有订单");
    setDetailEmpty("#orderDetail", "暂无订单", "切换状态或搜索条件");
    return;
  }

  $("#ordersTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 24%">订单</th>
          <th style="width: 12%">状态</th>
          <th style="width: 12%">金额</th>
          <th style="width: 16%">配送</th>
          <th style="width: 18%">客户</th>
          <th style="width: 18%">创建时间</th>
        </tr>
      </thead>
      <tbody>
        ${state.orders.map((order) => `
          <tr class="${state.selectedOrderId === order._id ? "selected" : ""}" data-id="${escapeHtml(order._id)}">
            <td data-label="订单">
              <div class="cell-title">
                <strong>${escapeHtml(order.orderNo || order._id)}</strong>
                <span>${escapeHtml((order.items || []).map((item) => `${item.name} x${item.quantity}`).join("，") || "无商品明细")}</span>
              </div>
            </td>
            <td data-label="状态">${statusBadge(order.status)}</td>
            <td data-label="金额" class="numeric">¥${money(order.total)}</td>
            <td data-label="配送">${escapeHtml(order.deliveryMethod === "shipping" ? "快递" : "到店自提")}</td>
            <td data-label="客户">${escapeHtml(order.consignee || order.name || "-")}<br><span class="muted">${escapeHtml(order.phone || "")}</span></td>
            <td data-label="创建时间">${escapeHtml(formatDate(order.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  $all("#ordersTable tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedOrderId = row.dataset.id;
      renderOrders();
      renderOrderDetail();
    });
  });

  if (!state.selectedOrderId) {
    state.selectedOrderId = state.orders[0]._id;
  }
  renderOrderDetail();
}

function renderOrderDetail() {
  const order = state.orders.find((item) => item._id === state.selectedOrderId);
  if (!order) {
    setDetailEmpty("#orderDetail", "选择订单", "查看履约和收货信息");
    return;
  }
  clearDetailEmpty("#orderDetail");
  const items = (order.items || []).map((item) => `
    <div class="line-item">
      <span>${escapeHtml(item.name || item.id || "商品")}</span>
      <strong>x${escapeHtml(item.quantity || 1)}</strong>
    </div>
  `).join("");
  const contact = [order.consignee || order.name, order.phone].filter(Boolean).join(" ");
  const address = order.deliveryMethod === "shipping"
    ? order.address
    : (order.pickupNote || order.remark || "到店自提");
  const actionBox = renderOrderActionBox(order);

  $("#orderDetail").innerHTML = `
    <div class="detail-head">
      <div>
        <span class="eyebrow">Order</span>
        <strong>${escapeHtml(order.orderNo || order._id)}</strong>
      </div>
      ${statusBadge(order.status)}
    </div>
    <div class="detail-list">
      <div class="detail-row"><span>金额</span><strong class="numeric">¥${money(order.total)}</strong></div>
      <div class="detail-row"><span>支付</span><div>${escapeHtml(order.payStatus || "-")}</div></div>
      <div class="detail-row"><span>配送</span><div>${escapeHtml(order.deliveryMethod === "shipping" ? "快递" : "到店自提")}</div></div>
      <div class="detail-row"><span>客户</span><div>${escapeHtml(contact || "-")}</div></div>
      <div class="detail-row"><span>地址/备注</span><div>${escapeHtml(address || "-")}</div></div>
      <div class="detail-row"><span>创建时间</span><div>${escapeHtml(formatDate(order.createdAt))}</div></div>
    </div>
    <div class="line-items">${items || "<span class=\"muted\">无商品明细</span>"}</div>
    ${actionBox}
  `;

  const shipButton = $("#shipOrderBtn");
  if (shipButton) {
    shipButton.addEventListener("click", () => handleOrderAction("ship", order._id));
  }
  const pickupButton = $("#pickupOrderBtn");
  if (pickupButton) {
    pickupButton.addEventListener("click", () => handleOrderAction("pickup", order._id));
  }
  const cancelButton = $("#cancelOrderBtn");
  if (cancelButton) {
    cancelButton.addEventListener("click", () => handleOrderAction("cancel", order._id));
  }
}

function renderOrderActionBox(order) {
  if (order.status === "待发货") {
    return `
      <div class="action-box">
        <label><span>快递公司</span><input id="trackingCompany" placeholder="如 顺丰"></label>
        <label><span>快递单号</span><input id="trackingNo" placeholder="填写后标记发货"></label>
        <button id="shipOrderBtn" class="btn btn-primary" type="button">标记发货</button>
      </div>
    `;
  }
  if (order.status === "待自提") {
    return `
      <div class="action-box">
        <button id="pickupOrderBtn" class="btn btn-primary" type="button">完成自提</button>
      </div>
    `;
  }
  if (order.status === "待支付") {
    return `
      <div class="action-box">
        <label><span>取消原因</span><input id="cancelReason" placeholder="管理员取消"></label>
        <button id="cancelOrderBtn" class="btn btn-danger" type="button">取消订单</button>
      </div>
    `;
  }
  return "";
}

async function handleOrderAction(action, id) {
  try {
    if (action === "ship") {
      const trackingNo = $("#trackingNo").value.trim();
      const trackingCompany = $("#trackingCompany").value.trim();
      if (!trackingNo) {
        showToast("请填写快递单号");
        return;
      }
      await callFunction("manageOperations", {
        action: "markShipped",
        orderId: id,
        trackingNo,
        trackingCompany
      });
      showToast("订单已标记发货");
    } else if (action === "pickup") {
      await callFunction("manageOperations", { action: "markPickupDone", orderId: id });
      showToast("自提订单已完成");
    } else if (action === "cancel") {
      await callFunction("manageOperations", {
        action: "cancelOrder",
        orderId: id,
        reason: ($("#cancelReason") && $("#cancelReason").value.trim()) || "管理员取消"
      });
      showToast("订单已取消");
    }
    await loadOrders();
    await refreshSummary();
  } catch (error) {
    showToast(error.message || "订单操作失败");
  }
}

async function loadReservations() {
  setTableLoading("#reservationsTable", "读取预约");
  setDetailEmpty("#reservationDetail", "选择预约", "查看确认状态和备注");
  try {
    const result = await callFunction("manageOperations", {
      action: "listReservations",
      status: $("#reservationStatus").value,
      keyword: $("#reservationKeyword").value.trim()
    });
    state.reservations = result.reservations || [];
    if (state.selectedReservationId && !state.reservations.some((item) => item._id === state.selectedReservationId)) {
      state.selectedReservationId = "";
    }
    renderRecords("reservation");
  } catch (error) {
    $("#reservationsTable").innerHTML = errorState(error.message);
    showToast(error.message || "预约加载失败");
  }
}

async function loadSignups() {
  setTableLoading("#signupsTable", "读取报名");
  setDetailEmpty("#signupDetail", "选择报名", "查看确认状态和备注");
  try {
    const result = await callFunction("manageOperations", {
      action: "listSignups",
      status: $("#signupStatus").value,
      keyword: $("#signupKeyword").value.trim()
    });
    state.signups = result.signups || [];
    if (state.selectedSignupId && !state.signups.some((item) => item._id === state.selectedSignupId)) {
      state.selectedSignupId = "";
    }
    renderRecords("signup");
  } catch (error) {
    $("#signupsTable").innerHTML = errorState(error.message);
    showToast(error.message || "报名加载失败");
  }
}

function recordConfig(type) {
  if (type === "reservation") {
    return {
      items: state.reservations,
      selectedKey: "selectedReservationId",
      table: "#reservationsTable",
      detail: "#reservationDetail",
      emptyTitle: "暂无预约",
      title: (record) => record.room || record.name || record._id,
      meta: (record) => `${record.day || ""} ${record.time || ""}`,
      customer: (record) => [record.name, record.phone].filter(Boolean).join(" "),
      action: "updateReservation",
      idKey: "reservationId"
    };
  }
  return {
    items: state.signups,
    selectedKey: "selectedSignupId",
    table: "#signupsTable",
    detail: "#signupDetail",
    emptyTitle: "暂无报名",
    title: (record) => record.title || record.eventTitle || record.eventId || record._id,
    meta: (record) => record.source || record.eventId || "",
    customer: (record) => [record.name, record.phone].filter(Boolean).join(" "),
    action: "updateSignup",
    idKey: "signupId"
  };
}

function renderRecords(type) {
  const config = recordConfig(type);
  if (!config.items.length) {
    $(config.table).innerHTML = emptyState(config.emptyTitle, "当前筛选条件下没有记录");
    setDetailEmpty(config.detail, config.emptyTitle, "切换状态或搜索条件");
    return;
  }

  $(config.table).innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 30%">项目</th>
          <th style="width: 13%">状态</th>
          <th style="width: 20%">客户</th>
          <th style="width: 18%">时间/来源</th>
          <th style="width: 19%">创建时间</th>
        </tr>
      </thead>
      <tbody>
        ${config.items.map((record) => `
          <tr class="${state[config.selectedKey] === record._id ? "selected" : ""}" data-id="${escapeHtml(record._id)}">
            <td data-label="项目">
              <div class="cell-title">
                <strong>${escapeHtml(config.title(record) || record._id)}</strong>
                <span>${escapeHtml(record.note || record.adminNote || "无备注")}</span>
              </div>
            </td>
            <td data-label="状态">${statusBadge(record.status)}</td>
            <td data-label="客户">${escapeHtml(config.customer(record) || "-")}</td>
            <td data-label="时间/来源">${escapeHtml(config.meta(record) || "-")}</td>
            <td data-label="创建时间">${escapeHtml(formatDate(record.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  $all(`${config.table} tbody tr`).forEach((row) => {
    row.addEventListener("click", () => {
      state[config.selectedKey] = row.dataset.id;
      renderRecords(type);
      renderRecordDetail(type);
    });
  });

  if (!state[config.selectedKey]) {
    state[config.selectedKey] = config.items[0]._id;
  }
  renderRecordDetail(type);
}

function renderRecordDetail(type) {
  const config = recordConfig(type);
  const record = config.items.find((item) => item._id === state[config.selectedKey]);
  if (!record) {
    setDetailEmpty(config.detail, config.emptyTitle, "选择一条记录查看详情");
    return;
  }
  clearDetailEmpty(config.detail);
  const title = config.title(record) || record._id;
  const customer = config.customer(record);
  const note = record.note || record.adminNote || "-";
  $(config.detail).innerHTML = `
    <div class="detail-head">
      <div>
        <span class="eyebrow">${type === "reservation" ? "Reservation" : "Signup"}</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
      ${statusBadge(record.status)}
    </div>
    <div class="detail-list">
      <div class="detail-row"><span>ID</span><div>${escapeHtml(record._id)}</div></div>
      <div class="detail-row"><span>客户</span><div>${escapeHtml(customer || "-")}</div></div>
      <div class="detail-row"><span>${type === "reservation" ? "预约" : "来源"}</span><div>${escapeHtml(config.meta(record) || "-")}</div></div>
      <div class="detail-row"><span>人数</span><div>${escapeHtml(record.people || record.count || "-")}</div></div>
      <div class="detail-row"><span>备注</span><div>${escapeHtml(note)}</div></div>
      <div class="detail-row"><span>创建时间</span><div>${escapeHtml(formatDate(record.createdAt))}</div></div>
    </div>
    <div class="action-box">
      <label><span>管理备注</span><textarea id="${type}AdminNote" rows="3">${escapeHtml(record.adminNote || "")}</textarea></label>
      <div class="detail-actions">
        <button class="btn btn-primary" data-record-action="已确认" type="button">确认</button>
        <button class="btn btn-danger" data-record-action="已取消" type="button">取消</button>
      </div>
    </div>
  `;
  $all(`${config.detail} [data-record-action]`).forEach((button) => {
    button.addEventListener("click", () => updateRecordStatus(type, record._id, button.dataset.recordAction));
  });
}

async function updateRecordStatus(type, id, status) {
  const config = recordConfig(type);
  const note = $(`#${type}AdminNote`) ? $(`#${type}AdminNote`).value.trim() : "";
  try {
    await callFunction("manageOperations", {
      action: config.action,
      [config.idKey]: id,
      status,
      adminNote: note
    });
    showToast(status === "已确认" ? "记录已确认" : "记录已取消");
    if (type === "reservation") {
      await loadReservations();
    } else {
      await loadSignups();
    }
    await refreshSummary();
  } catch (error) {
    showToast(error.message || "记录更新失败");
  }
}

async function loadCustomers() {
  setTableLoading("#customersTable", "读取用户");
  setDetailEmpty("#customerDetail", "选择用户", "查看消费、预约和活动概览");
  try {
    const result = await callFunction("manageOperations", {
      action: "listCustomers",
      keyword: $("#customerKeyword").value.trim()
    });
    state.customers = result.customers || [];
    if (state.selectedCustomerId && !state.customers.some((item) => item.id === state.selectedCustomerId)) {
      state.selectedCustomerId = "";
    }
    renderCustomers();
  } catch (error) {
    $("#customersTable").innerHTML = errorState(error.message);
    showToast(error.message || "用户加载失败");
  }
}

function renderCustomers() {
  if (!state.customers.length) {
    $("#customersTable").innerHTML = emptyState("暂无用户", "订单、预约或报名产生后自动聚合用户");
    setDetailEmpty("#customerDetail", "暂无用户", "当前筛选条件下没有用户");
    return;
  }
  $("#customersTable").innerHTML = `
    <table class="data-table">
      <thead><tr><th style="width: 26%">用户</th><th>标签</th><th>累计消费</th><th>订单</th><th>预约</th><th>活动</th><th>最近活跃</th></tr></thead>
      <tbody>
        ${state.customers.map((item) => `
          <tr class="${state.selectedCustomerId === item.id ? "selected" : ""}" data-id="${escapeHtml(item.id)}">
            <td data-label="用户"><div class="cell-title"><strong>${escapeHtml(item.name || "未留姓名")}</strong><span>${escapeHtml(item.phone || item.openid || "-")}</span></div></td>
            <td data-label="标签">${(item.tags || []).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join("")}</td>
            <td data-label="累计消费" class="numeric">¥${money(item.spend)}</td>
            <td data-label="订单">${escapeHtml(item.orders || 0)}</td>
            <td data-label="预约">${escapeHtml(item.reservations || 0)}</td>
            <td data-label="活动">${escapeHtml(item.signups || 0)}</td>
            <td data-label="最近活跃">${escapeHtml(formatDate(item.lastSeenAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  $all("#customersTable tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedCustomerId = row.dataset.id;
      renderCustomers();
      renderCustomerDetail();
    });
  });
  if (!state.selectedCustomerId) {
    state.selectedCustomerId = state.customers[0].id;
  }
  renderCustomerDetail();
}

function renderCustomerDetail() {
  const customer = state.customers.find((item) => item.id === state.selectedCustomerId);
  if (!customer) {
    setDetailEmpty("#customerDetail", "选择用户", "查看用户画像");
    return;
  }
  clearDetailEmpty("#customerDetail");
  $("#customerDetail").innerHTML = `
    <div class="detail-head">
      <div><span class="eyebrow">Customer</span><strong>${escapeHtml(customer.name || "未留姓名")}</strong></div>
      ${statusBadge(customer.spend >= 3000 ? "高价值" : "正常")}
    </div>
    <div class="detail-list">
      <div class="detail-row"><span>手机号</span><div>${escapeHtml(customer.phone || "-")}</div></div>
      <div class="detail-row"><span>OpenID</span><div>${escapeHtml(customer.openid || "-")}</div></div>
      <div class="detail-row"><span>累计消费</span><strong class="numeric">¥${money(customer.spend)}</strong></div>
      <div class="detail-row"><span>订单数</span><div>${escapeHtml(customer.orders || 0)}</div></div>
      <div class="detail-row"><span>预约数</span><div>${escapeHtml(customer.reservations || 0)}</div></div>
      <div class="detail-row"><span>活动数</span><div>${escapeHtml(customer.signups || 0)}</div></div>
      <div class="detail-row"><span>标签</span><div>${(customer.tags || []).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join("")}</div></div>
    </div>
  `;
}

const contentLabels = {
  home_carousel: "首页轮播",
  event_note: "活动说明",
  member_card: "会员背景",
  service: "客服内容"
};

async function loadContent() {
  setTableLoading("#contentTable", "读取内容");
  try {
    const result = await callFunction("manageOperations", {
      action: "listContent",
      type: state.contentType
    });
    state.contentItems = result.items || [];
    if (state.selectedContentKey && !state.contentItems.some((item) => item.key === state.selectedContentKey)) {
      state.selectedContentKey = "";
    }
    renderContent();
    if (!state.selectedContentKey) {
      resetContentForm();
    }
  } catch (error) {
    $("#contentTable").innerHTML = errorState(error.message);
    showToast(error.message || "内容加载失败");
  }
}

function renderContent() {
  if (!state.contentItems.length) {
    $("#contentTable").innerHTML = emptyState(`暂无${contentLabels[state.contentType] || "内容"}`, "新建后会被前台读取");
    return;
  }
  $("#contentTable").innerHTML = `
    <table class="data-table">
      <thead><tr><th style="width: 34%">内容</th><th>图片</th><th>链接</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        ${state.contentItems.map((item) => `
          <tr class="${state.selectedContentKey === item.key ? "selected" : ""}" data-key="${escapeHtml(item.key)}">
            <td data-label="内容"><div class="cell-title"><strong>${escapeHtml(item.title || item.key)}</strong><span>${escapeHtml(item.subtitle || item.summary || "")}</span></div></td>
            <td data-label="图片">${item.image ? `<img class="thumb" src="${escapeHtml(displayImage(item.image))}" alt="">` : "-"}</td>
            <td data-label="链接">${escapeHtml([item.linkType, item.linkTarget].filter(Boolean).join(": ") || "-")}</td>
            <td data-label="排序">${escapeHtml(item.sort || 0)}</td>
            <td data-label="状态">${statusBadge(item.visible === false ? "已停用" : "已发布")}</td>
            <td data-label="操作"><button class="btn btn-small btn-secondary" data-action="edit" type="button">编辑</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  $all("#contentTable tbody tr").forEach((row) => {
    row.addEventListener("click", () => {
      const item = state.contentItems.find((entry) => entry.key === row.dataset.key);
      if (item) {
        fillContentForm(item);
        renderContent();
      }
    });
  });
  bindImageFallback("#contentTable");
}

function resetContentForm() {
  const form = $("#contentForm");
  form.reset();
  state.selectedContentKey = "";
  form.elements.visible.checked = true;
  setText("#contentFormTitle", `新建${contentLabels[state.contentType] || "内容"}`);
  $("#contentModeBadge").outerHTML = `<span id="contentModeBadge" class="status-badge neutral">草稿</span>`;
  setText("#contentMessage", "");
  renderContent();
}

function fillContentForm(item) {
  const form = $("#contentForm");
  state.selectedContentKey = item.key || "";
  form.elements.key.value = item.key || "";
  form.elements.title.value = item.title || "";
  form.elements.subtitle.value = item.subtitle || "";
  form.elements.image.value = item.image || "";
  form.elements.summary.value = item.summary || "";
  form.elements.linkType.value = item.linkType || "";
  form.elements.linkTarget.value = item.linkTarget || "";
  form.elements.sort.value = item.sort || 0;
  form.elements.visible.checked = item.visible !== false;
  setText("#contentFormTitle", item.title || item.key || "内容");
  $("#contentModeBadge").outerHTML = statusBadge(item.visible === false ? "已停用" : "已发布");
  $("#contentForm .detail-head .status-badge").id = "contentModeBadge";
  setText("#contentMessage", "");
}

function readContentForm() {
  const form = $("#contentForm");
  return {
    key: form.elements.key.value.trim(),
    type: state.contentType,
    title: form.elements.title.value.trim(),
    subtitle: form.elements.subtitle.value.trim(),
    image: form.elements.image.value.trim(),
    summary: form.elements.summary.value.trim(),
    linkType: form.elements.linkType.value.trim(),
    linkTarget: form.elements.linkTarget.value.trim(),
    sort: Number(form.elements.sort.value || 0),
    visible: form.elements.visible.checked
  };
}

async function saveContent(event) {
  event.preventDefault();
  const data = readContentForm();
  if (!data.title) {
    setText("#contentMessage", "请填写标题");
    return;
  }
  try {
    const result = await callFunction("manageOperations", { action: "saveContent", data });
    state.selectedContentKey = result.key || data.key;
    setText("#contentMessage", "已保存");
    showToast("内容已保存");
    await loadContent();
  } catch (error) {
    setText("#contentMessage", error.message || "保存失败");
  }
}

async function deleteCurrentContent() {
  const key = $("#contentForm").elements.key.value.trim();
  if (!key) {
    setText("#contentMessage", "请先选择内容");
    return;
  }
  await callFunction("manageOperations", { action: "deleteContent", key });
  showToast("内容已停用");
  await loadContent();
}

async function loadAnalytics() {
  $("#analyticsGrid").innerHTML = loadingState("读取统计");
  try {
    const result = await callFunction("manageOperations", { action: "getAnalytics" });
    state.analytics = result.analytics || {};
    renderAnalytics();
  } catch (error) {
    $("#analyticsGrid").innerHTML = errorState(error.message);
    showToast(error.message || "统计加载失败");
  }
}

function renderAnalytics() {
  const analytics = state.analytics || {};
  const summary = analytics.summary || {};
  const maxTrend = Math.max(1, ...(analytics.trend || []).map((item) => Number(item.amount || 0)));
  const maxCategory = Math.max(1, ...(analytics.categories || []).map((item) => Number(item.amount || 0)));
  $("#analyticsGrid").innerHTML = `
    <section class="board-card metric-card"><span>销售额</span><strong>¥${money(summary.revenue)}</strong><small>真实支付或已履约订单</small></section>
    <section class="board-card metric-card"><span>预约量</span><strong>${escapeHtml(summary.reservations || 0)}</strong><small>未取消茶室预约</small></section>
    <section class="board-card metric-card"><span>活动报名</span><strong>${escapeHtml(summary.signups || 0)}</strong><small>未取消报名</small></section>
    <section class="board-card metric-card"><span>客单价</span><strong>¥${money(summary.averageOrder)}</strong><small>按有效订单计算</small></section>
    <section class="board-card chart-card wide-chart">
      <div class="board-head"><strong>近期销售趋势</strong></div>
      <div class="bar-chart">${(analytics.trend || []).map((item) => `<div style="height:${Math.max(8, Number(item.amount || 0) / maxTrend * 100)}%"><span>${escapeHtml(item.date.slice(5))}</span></div>`).join("")}</div>
    </section>
    <section class="board-card chart-card">
      <div class="board-head"><strong>品类销售额</strong></div>
      <div class="rank-list">${(analytics.categories || []).map((item) => `<div><span>${escapeHtml(item.name)}</span><strong>¥${money(item.amount)}</strong><em style="width:${Number(item.amount || 0) / maxCategory * 100}%"></em></div>`).join("") || emptyState("暂无销售", "支付回调完成后显示")}</div>
    </section>
    <section class="board-card wide-chart">
      <div class="board-head"><strong>热销商品 / 活动排行</strong></div>
      <table class="data-table embedded-table"><thead><tr><th>名称</th><th>类型</th><th>销售额</th><th>销量/报名数</th></tr></thead><tbody>${(analytics.topItems || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.type)}</td><td>¥${money(item.amount)}</td><td>${escapeHtml(item.count)}</td></tr>`).join("")}</tbody></table>
    </section>
  `;
}

async function loadMarketing() {
  $("#couponTable").innerHTML = loadingState("读取优惠券");
  $("#campaignTable").innerHTML = loadingState("读取营销计划");
  try {
    const result = await callFunction("manageOperations", { action: "listMarketing" });
    state.coupons = result.coupons || [];
    state.campaigns = result.campaigns || [];
    renderMarketing();
  } catch (error) {
    $("#couponTable").innerHTML = errorState(error.message);
    $("#campaignTable").innerHTML = errorState(error.message);
  }
}

function renderMarketing() {
  $("#couponTable").innerHTML = renderSimpleMarketingTable(state.coupons, "coupon");
  $("#campaignTable").innerHTML = renderSimpleMarketingTable(state.campaigns, "campaign");
  $all("[data-marketing-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = button.dataset.marketingType === "coupon" ? state.coupons : state.campaigns;
      const item = list.find((entry) => entry.id === button.dataset.id);
      if (item) {
        fillMarketingForm(button.dataset.marketingType, item);
      }
    });
  });
}

function renderSimpleMarketingTable(items, type) {
  if (!items.length) {
    return emptyState(type === "coupon" ? "暂无优惠券" : "暂无营销计划", "新建后保存到云数据库");
  }
  return `
    <table class="data-table embedded-table">
      <thead><tr><th>名称</th><th>状态</th><th>${type === "coupon" ? "面额/门槛/核销" : "类型"}</th><th>操作</th></tr></thead>
      <tbody>${items.map((item) => `
        <tr>
          <td><div class="cell-title"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.id)}</span></div></td>
          <td>${statusBadge(item.visible === false ? "已停用" : item.status)}</td>
          <td>${type === "coupon" ? `¥${money(item.amount)} / 满 ${money(item.threshold)} / ${Number(item.redeemed || 0)} 核销` : escapeHtml(item.type || "-")}</td>
          <td><button class="btn btn-small btn-secondary" data-marketing-type="${type}" data-id="${escapeHtml(item.id)}" type="button">编辑</button></td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function fillMarketingForm(type, item) {
  const form = type === "coupon" ? $("#couponForm") : $("#campaignForm");
  Object.keys(item).forEach((key) => {
    if (form.elements[key]) {
      if (form.elements[key].type === "checkbox") {
        form.elements[key].checked = item[key] !== false;
      } else {
        form.elements[key].value = item[key] === undefined ? "" : item[key];
      }
    }
  });
}

function readForm(form) {
  const data = {};
  Array.from(form.elements).forEach((element) => {
    if (!element.name) {
      return;
    }
    data[element.name] = element.type === "checkbox" ? element.checked : element.value;
  });
  return data;
}

async function saveCoupon(event) {
  event.preventDefault();
  const result = await callFunction("manageOperations", {
    action: "saveCoupon",
    data: readForm($("#couponForm"))
  });
  showToast(`优惠券已保存：${result.id}`);
  await loadMarketing();
}

async function saveCampaign(event) {
  event.preventDefault();
  const result = await callFunction("manageOperations", {
    action: "saveCampaign",
    data: readForm($("#campaignForm"))
  });
  showToast(`营销计划已保存：${result.id}`);
  await loadMarketing();
}

function resetMarketingForm(type) {
  const form = type === "coupon" ? $("#couponForm") : $("#campaignForm");
  form.reset();
  if (form.elements.visible) {
    form.elements.visible.checked = true;
  }
  if (form.elements.claimLimit) {
    form.elements.claimLimit.value = 1;
  }
}

async function loadSettings() {
  try {
    const result = await callFunction("manageOperations", { action: "getSettings" });
    state.settings = result.settings || {};
    fillSettingsForm(state.settings);
  } catch (error) {
    showToast(error.message || "设置加载失败");
  }
}

function fillSettingsForm(settings) {
  const form = $("#settingsForm");
  Object.keys(settings || {}).forEach((key) => {
    if (!form.elements[key]) {
      return;
    }
    if (form.elements[key].type === "checkbox") {
      form.elements[key].checked = settings[key] !== false;
    } else {
      form.elements[key].value = settings[key] || "";
    }
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = readForm($("#settingsForm"));
  await callFunction("manageOperations", { action: "updateSettings", data: settings });
  showToast("设置已保存");
  await loadSettings();
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setText("#loginError", "");
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      state.user = await signIn($("#username").value.trim(), $("#password").value);
      await enterDashboard();
    } catch (error) {
      setText("#loginError", error.message || "登录失败");
    } finally {
      button.disabled = false;
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    if (state.auth && state.auth.signOut) {
      await state.auth.signOut();
    }
    showView("login");
  });

  $all(".nav-tabs button").forEach((button) => {
    button.addEventListener("click", async () => {
      setActiveTab(button.dataset.tab);
      await loadActiveTab();
    });
  });
  $all("[data-jump-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      setActiveTab(button.dataset.jumpTab);
      await loadActiveTab();
    });
  });

  $all("#collectionTabs button").forEach((button) => {
    button.addEventListener("click", async () => {
      state.collection = button.dataset.collection;
      state.selectedCatalogId = "";
      $all("#collectionTabs button").forEach((item) => item.classList.toggle("active", item === button));
      await loadCatalog();
    });
  });

  $("#refreshBtn").addEventListener("click", loadActiveTab);
  $("#globalKeyword").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const target = panelKeywords[state.tab];
    if (target && $(target)) {
      $(target).value = $("#globalKeyword").value.trim();
      await loadActiveTab();
    }
  });
  $("#newItemBtn").addEventListener("click", resetCatalogForm);
  $("#catalogKeyword").addEventListener("input", () => {
    syncGlobalKeyword();
    renderCatalog();
  });
  $("#catalogForm").addEventListener("submit", saveCatalogItem);
  $("#catalogForm").elements.image.addEventListener("input", (event) => updateImagePreview(event.target.value));
  $("#imageFile").addEventListener("change", updateSelectedFileName);
  $("#deleteItemBtn").addEventListener("click", deleteCurrentItem);
  $("#uploadBtn").addEventListener("click", uploadImage);
  $("#reloadOrdersBtn").addEventListener("click", loadOrders);
  $("#orderStatus").addEventListener("change", loadOrders);
  $("#orderKeyword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      syncGlobalKeyword();
      loadOrders();
    }
  });
  $("#reloadReservationsBtn").addEventListener("click", loadReservations);
  $("#reservationStatus").addEventListener("change", loadReservations);
  $("#reservationKeyword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      syncGlobalKeyword();
      loadReservations();
    }
  });
  $("#reloadSignupsBtn").addEventListener("click", loadSignups);
  $("#signupStatus").addEventListener("change", loadSignups);
  $("#signupKeyword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      syncGlobalKeyword();
      loadSignups();
    }
  });
  $("#reloadCustomersBtn").addEventListener("click", loadCustomers);
  $("#customerKeyword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      syncGlobalKeyword();
      loadCustomers();
    }
  });
  $all("#contentTabs button").forEach((button) => {
    button.addEventListener("click", async () => {
      state.contentType = button.dataset.type;
      state.selectedContentKey = "";
      $all("#contentTabs button").forEach((item) => item.classList.toggle("active", item === button));
      await loadContent();
    });
  });
  $("#newContentBtn").addEventListener("click", resetContentForm);
  $("#contentForm").addEventListener("submit", saveContent);
  $("#deleteContentBtn").addEventListener("click", deleteCurrentContent);
  $("#reloadAnalyticsBtn").addEventListener("click", loadAnalytics);
  $("#couponForm").addEventListener("submit", saveCoupon);
  $("#campaignForm").addEventListener("submit", saveCampaign);
  $("#newCouponBtn").addEventListener("click", () => resetMarketingForm("coupon"));
  $("#newCampaignBtn").addEventListener("click", () => resetMarketingForm("campaign"));
  $("#settingsForm").addEventListener("submit", saveSettings);
}

async function enterDashboard() {
  showView("dashboard");
  const label = state.user && (state.user.username || state.user.email || state.user.uid) || "管理员";
  setText("#userLine", label);
  setActiveTab("dashboard");
  await loadActiveTab();
}

async function boot() {
  try {
    initCloud();
    bindEvents();
    state.user = await getSessionUser();
    if (state.user) {
      await enterDashboard();
    } else {
      showView("login");
    }
  } catch (error) {
    setText("#loginError", error.message || "初始化失败");
    showView("login");
  }
}

boot();
