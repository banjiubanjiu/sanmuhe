const asset = (name) => `../sanmuhe-miniprogram/assets/images/${name}`;
const iconAsset = (name) => `../sanmuhe-miniprogram/assets/icons/${name}`;

const teas = [
  { id: "tea-001", name: "明前龙井", listName: "西湖龙井", category: "绿茶", origin: "浙江杭州", price: 268, unit: "50g", image: asset("design-product-longjing.jpg"), thumb: asset("design-tea-longjing.jpg"), sold: 1286, desc: "口感鲜醇，鲜爽甘甜，春日限定的鲜爽滋味。" },
  { id: "tea-004", name: "碧螺春", category: "绿茶", origin: "江苏苏州", price: 198, unit: "50g", image: asset("design-tea-biluochun.jpg"), thumb: asset("design-tea-biluochun.jpg") },
  { id: "tea-005", name: "黄山毛峰", category: "绿茶", origin: "安徽黄山", price: 158, unit: "50g", image: asset("design-tea-maofeng.jpg"), thumb: asset("design-tea-maofeng.jpg") },
  { id: "tea-006", name: "六安瓜片", category: "绿茶", origin: "安徽六安", price: 128, unit: "50g", image: asset("design-tea-liuan.jpg"), thumb: asset("design-tea-liuan.jpg") },
  { id: "tea-007", name: "信阳毛尖", category: "绿茶", origin: "河南信阳", price: 138, unit: "50g", image: asset("design-tea-xinyang.jpg"), thumb: asset("design-tea-xinyang.jpg") }
];

const homeTeas = [
  teas[0],
  { id: "tea-002", name: "大红袍", category: "乌龙茶", price: 198, unit: "50g", thumb: asset("design-tea-dahongpao.jpg") },
  { id: "tea-003", name: "白毫银针", category: "白茶", price: 358, unit: "50g", thumb: asset("design-tea-silver.jpg") }
];

const drinks = [
  { id: "drink-001", name: "桂花龙井", category: "推荐", price: 28, desc: "清香桂花，龙井茶底", image: asset("design-drink-osmanthus.jpg") },
  { id: "drink-002", name: "芝士抹茶", category: "奶茶系列", price: 32, desc: "抹茶茶底，芝士奶盖", image: asset("design-drink-matcha.jpg") },
  { id: "drink-003", name: "柠檬红茶", category: "鲜果茶", price: 24, desc: "清新柠檬，红茶茶底", image: asset("design-drink-lemon.jpg") }
];

const rooms = [
  { name: "三木合・观山店", meta: "安静雅致 | 观山景", status: "可预定", price: 168, image: asset("design-room-guanshan.jpg") },
  { name: "三木合・听雨店", meta: "庭院茶室 | 临窗听雨", status: "可预定", price: 198, image: asset("design-room-tingyu.jpg") },
  { name: "三木合・书香店", meta: "书香氛围 | 静谧", status: "可预定", price: 128, image: asset("design-room-shuxiang.jpg") },
  { name: "三木合・松风店", meta: "松林清幽 | 静心小室", status: "已订满", price: 148, image: asset("design-room-songfeng.jpg") },
  { name: "三木合・竹韵店", meta: "竹影摇曳 | 清雅怡人", status: "可预定", price: 138, image: asset("design-room-zhuyun.jpg") }
];

const events = [
  { title: "春日茶会・品新茶", category: "茶会", date: "05.25 周六 14:00", place: "三木合・双山店", signed: 28, quota: 30, image: asset("design-event-spring.jpg") },
  { title: "茶文化讲座", category: "讲座", date: "06.01 周六 10:00", place: "三木合・听雨店", signed: 45, quota: 50, image: asset("design-event-culture.jpg") },
  { title: "手作茶器体验", category: "体验", date: "06.08 周六 14:00", place: "三木合・柏阳毛尖", signed: 16, quota: 20, image: asset("design-event-handmade.jpg") }
];

const viewNames = {
  home: "首页",
  category: "分类",
  product: "详情",
  order: "点单",
  reservation: "茶室",
  events: "活动",
  cart: "购物车",
  profile: "我的"
};

const state = {
  view: "home",
  teaCategory: "绿茶",
  drinkCategory: "推荐",
  eventCategory: "全部",
  cartCount: 2
};

const screen = document.querySelector("#screen");
const viewPicker = document.querySelector("#viewPicker");

function money(value) {
  return `¥${value}`;
}

function pageShell(title, body, options = {}) {
  const navRight = options.navRight || '<span class="dot-menu">•••</span><span class="circle-menu"></span>';
  const tabbar = options.tabbar === false ? "" : renderTabbar(options.active || state.view);
  return `
    <article class="app-page ${options.className || ""}">
      <header class="nav">
        <span class="nav-space">${options.back ? "‹" : ""}</span>
        <strong>${title}</strong>
        <span class="nav-tools">${navRight}</span>
      </header>
      ${body}
      ${tabbar}
    </article>
  `;
}

function renderTabbar(active) {
  const tabs = [
    ["home", "首页", "home"],
    ["category", "分类", "category"],
    ["cart", "购物车", "cart"],
    ["events", "活动", "events"],
    ["profile", "我的", "profile"]
  ];
  return `
    <nav class="mini-tabbar">
      ${tabs.map(([view, label, icon]) => `
        <button class="mini-tab ${active === view ? "active" : ""}" data-view="${view}">
          <img class="tab-icon" src="${iconAsset(`${icon}-${active === view ? "active" : "line"}.png`)}" alt="">
          <span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderHome() {
  const body = `
    <section class="home-content">
      <div class="search">搜索茶叶、茶饮、茶室</div>
      <section class="hero-card" style="background-image:url('${asset("design-hero-tea.jpg")}')">
        <div>
          <p>一杯好茶</p>
          <h1>三木合</h1>
          <span>寻味东方茶生活</span>
        </div>
      </section>
      <section class="action-row">
        <button data-view="category"><span><img src="${iconAsset("leaf-white.png")}" alt=""></span><strong>茶叶购买</strong></button>
        <button data-view="order"><span><img src="${iconAsset("cup-white.png")}" alt=""></span><strong>茶饮点单</strong></button>
        <button data-view="reservation"><span><img src="${iconAsset("room-white.png")}" alt=""></span><strong>茶室预定</strong></button>
        <button data-view="events"><span><img src="${iconAsset("calendar-white.png")}" alt=""></span><strong>活动发布</strong></button>
      </section>
      <section class="block">
        <div class="block-head">
          <h2>推荐茶品</h2>
          <button data-view="category">更多</button>
        </div>
        <div class="recommend-grid">
          ${homeTeas.map((tea) => `
            <button class="tea-card" data-view="product">
              <img src="${tea.thumb}" alt="${tea.name}">
              <strong>${tea.name}</strong>
              <span>${tea.category}</span>
              <em>${money(tea.price)}/${tea.unit}</em>
            </button>
          `).join("")}
        </div>
      </section>
    </section>
  `;
  screen.innerHTML = pageShell("三木合", body, { active: "home" });
}

function renderCategory() {
  const categories = ["绿茶", "乌龙茶", "红茶", "白茶", "普洱茶", "花茶", "茶具", "茶点"];
  const body = `
    <section class="category-layout">
      <aside class="left-rail">
        ${categories.map((category) => `<button class="${state.teaCategory === category ? "active" : ""}" data-tea-category="${category}">${category}</button>`).join("")}
      </aside>
      <section class="goods-list">
        ${teas.map((tea) => `
          <button class="goods-row" data-view="product">
            <img src="${tea.thumb}" alt="${tea.listName || tea.name}">
            <span>
              <strong>${tea.listName || tea.name}</strong>
              <small>${tea.origin}</small>
              <em>${money(tea.price)}/${tea.unit}</em>
            </span>
          </button>
        `).join("")}
      </section>
    </section>
  `;
  screen.innerHTML = pageShell("分类", body, { active: "category" });
}

function renderProduct() {
  const tea = teas[0];
  const body = `
    <section class="product-detail">
      <img class="product-hero" src="${tea.image}" alt="${tea.name}">
      <section class="product-panel">
        <div class="product-title-row">
          <h1>${tea.name}</h1>
          <span>${tea.category}</span>
        </div>
        <p class="origin">产地：${tea.origin}</p>
        <div class="price-line"><strong>${money(tea.price)}</strong><span>/${tea.unit}</span><em>已售 ${tea.sold}</em></div>
        <p class="product-desc">${tea.desc}</p>
      </section>
      <section class="product-panel">
        <h2>规格选择</h2>
        <div class="spec-row">
          ${["50g", "100g", "250g", "500g"].map((spec, index) => `<button class="${index === 0 ? "active" : ""}">${spec}</button>`).join("")}
        </div>
      </section>
      <section class="product-panel qty-row">
        <h2>购买数量</h2>
        <div><button>-</button><span>1</span><button>+</button></div>
      </section>
    </section>
    <nav class="product-action">
      <button>客服</button>
      <button>收藏</button>
      <button class="cart-btn" data-view="cart">加入购物车</button>
      <button class="buy-btn" data-view="cart">立即购买</button>
    </nav>
  `;
  screen.innerHTML = pageShell("商品详情", body, { tabbar: false, back: true });
}

function renderOrder() {
  const categories = ["推荐", "经典茶饮", "鲜果茶", "奶茶系列", "纯茶", "小食甜点"];
  const body = `
    <section class="menu-layout">
      <aside class="left-rail drink-rail">
        ${categories.map((category) => `<button class="${state.drinkCategory === category ? "active" : ""}" data-drink-category="${category}">${category}</button>`).join("")}
      </aside>
      <section class="drink-list">
        ${drinks.map((drink) => `
          <article class="drink-row">
            <img src="${drink.image}" alt="${drink.name}">
            <span>
              <strong>${drink.name}</strong>
              <small>${drink.desc}</small>
              <em>${money(drink.price)}</em>
            </span>
            <span class="add-icon" role="button" data-add-drink="${drink.id}"><img src="${iconAsset("plus-white.png")}" alt=""></span>
          </article>
        `).join("")}
      </section>
    </section>
    <section class="floating-cart">
      <span>购物车（${state.cartCount}）</span>
      <strong>¥56</strong>
      <button data-view="cart">去结算</button>
    </section>
  `;
  screen.innerHTML = pageShell("茶饮点单", body, { active: "cart" });
}

function renderReservation() {
  const body = `
    <section class="filter-row">
      <button class="active">全部区域</button>
      <button>人数</button>
      <button>时间</button>
    </section>
    <section class="room-list">
      ${rooms.map((room) => `
        <article class="room-card">
          <img src="${room.image}" alt="${room.name}">
          <span>
            <strong>${room.name}</strong>
            <small>${room.meta}</small>
            <em>${money(room.price)}/小时</em>
          </span>
          <button class="${room.status === "已订满" ? "disabled" : ""}">${room.status}</button>
        </article>
      `).join("")}
    </section>
  `;
  screen.innerHTML = pageShell("茶室预定", body, { active: "home" });
}

function renderEvents() {
  const categories = ["全部", "茶会", "讲座", "体验", "展览"];
  const list = state.eventCategory === "全部" ? events : events.filter((event) => event.category === state.eventCategory);
  const body = `
    <section class="event-tabs">
      ${categories.map((category) => `<button class="${state.eventCategory === category ? "active" : ""}" data-event-category="${category}">${category}</button>`).join("")}
    </section>
    <section class="event-list">
      ${list.map((event) => `
        <article class="event-card">
          <img src="${event.image}" alt="${event.title}">
          <span>
            <strong>${event.title}</strong>
            <small>${event.date}</small>
            <small>${event.place}</small>
            <em>已报名 ${event.signed}/${event.quota}</em>
          </span>
          <button>报名中</button>
        </article>
      `).join("")}
    </section>
  `;
  screen.innerHTML = pageShell("活动发布", body, { active: "events" });
}

function renderCart() {
  const body = `
    <section class="cart-empty">
      <strong>购物车</strong>
      <p>已选茶饮 ${state.cartCount} 件，可继续点单或查看茶叶。</p>
      <button data-view="order">继续点单</button>
    </section>
  `;
  screen.innerHTML = pageShell("购物车", body, { active: "cart" });
}

function renderProfile() {
  const body = `
    <section class="profile-card">
      <strong>我的三木合</strong>
      <p>订单、预约和活动报名会在云开发预览中写入对应集合。</p>
    </section>
  `;
  screen.innerHTML = pageShell("我的", body, { active: "profile" });
}

function renderPicker() {
  const views = [
    ["home", "1 首页"],
    ["category", "2 分类"],
    ["product", "3 详情"],
    ["order", "4 点单"],
    ["reservation", "5 茶室"],
    ["events", "6 活动"]
  ];
  viewPicker.innerHTML = views.map(([view, label]) => `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`).join("");
}

function render() {
  if (state.view === "home") renderHome();
  if (state.view === "category") renderCategory();
  if (state.view === "product") renderProduct();
  if (state.view === "order") renderOrder();
  if (state.view === "reservation") renderReservation();
  if (state.view === "events") renderEvents();
  if (state.view === "cart") renderCart();
  if (state.view === "profile") renderProfile();
  renderPicker();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [role='button']");
  if (!target) return;

  if (target.dataset.view) {
    state.view = target.dataset.view;
    render();
  }
  if (target.dataset.teaCategory) {
    state.teaCategory = target.dataset.teaCategory;
    render();
  }
  if (target.dataset.drinkCategory) {
    state.drinkCategory = target.dataset.drinkCategory;
    render();
  }
  if (target.dataset.eventCategory) {
    state.eventCategory = target.dataset.eventCategory;
    render();
  }
  if (target.dataset.addDrink) {
    state.cartCount += 1;
    render();
  }
});

render();
