const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const fallbackCatalog = {
  drinks: [
    { id: "drink-001", name: "三木合冷萃", category: "冷萃", price: 28, notes: "乌龙、桂花、清爽回甘", badge: "招牌", color: "#6f8b73", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/drink-osmanthus.jpg", temps: ["冷", "常温"], sugars: ["无糖", "微甜"], visible: true, sort: 10 },
    { id: "drink-002", name: "松烟拿铁", category: "奶茶", price: 32, notes: "正山小种、鲜奶、木质香", badge: "热卖", color: "#8a6a49", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/drink-matcha.jpg", temps: ["热", "少冰"], sugars: ["无糖", "微甜", "半糖"], visible: true, sort: 20 },
    { id: "drink-003", name: "白毫柠檬茶", category: "果茶", price: 30, notes: "白茶、香水柠檬、轻盈花香", badge: "清爽", color: "#b4a35f", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/drink-lemon.jpg", temps: ["冷", "少冰"], sugars: ["无糖", "微甜"], visible: true, sort: 30 },
    { id: "drink-004", name: "焙火乌龙茶汤", category: "纯茶", price: 22, notes: "炭焙乌龙、坚果香、适合热饮", badge: "纯茶", color: "#6e4f34", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/hero-tea.jpg", temps: ["热", "常温"], sugars: ["无糖"], visible: true, sort: 40 },
    { id: "drink-005", name: "茉莉青提冰茶", category: "果茶", price: 34, notes: "茉莉绿茶、青提、淡花香", badge: "季节", color: "#8ba56f", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/drink-lemon.jpg", temps: ["冷", "少冰"], sugars: ["无糖", "微甜"], visible: true, sort: 50 },
    { id: "drink-006", name: "普洱厚乳", category: "奶茶", price: 33, notes: "熟普、厚乳、糯香收尾", badge: "醇厚", color: "#745b43", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/drink-matcha.jpg", temps: ["热", "少冰"], sugars: ["无糖", "微甜", "半糖"], visible: true, sort: 60 }
  ],
  teaProducts: [
    { id: "tea-001", name: "溪山龙井 2026 春茶", category: "绿茶", price: 168, unit: "50g", origin: "浙江杭州", roast: "轻炒青", taste: "豆香、鲜爽、兰花尾韵", stock: 38, color: "#8f9d5d", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/product-longjing.jpg", thumb: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-longjing.jpg", detail: "明前采摘，适合玻璃杯或盖碗冲泡。建议水温 85 度，茶水比 1:50。", visible: true, sort: 10 },
    { id: "tea-002", name: "岩上肉桂", category: "乌龙", price: 236, unit: "80g", origin: "福建武夷山", roast: "中足火", taste: "桂皮香、岩骨、果木甜", stock: 21, color: "#9a6a40", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-dahongpao.jpg", thumb: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-dahongpao.jpg", detail: "山场风格清晰，适合功夫泡。首泡快速出汤，后续按口感递增。", visible: true, sort: 20 },
    { id: "tea-003", name: "三年陈白牡丹", category: "白茶", price: 128, unit: "100g", origin: "福建福鼎", roast: "日晒萎凋", taste: "毫香、枣甜、汤感柔", stock: 44, color: "#b2a772", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-white.jpg", thumb: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-white.jpg", detail: "散茶陈化三年，适合日常饮用，也可冷泡。", visible: true, sort: 30 },
    { id: "tea-004", name: "古树晒红", category: "红茶", price: 198, unit: "100g", origin: "云南临沧", roast: "日光干燥", taste: "蜜香、果干、汤色橙红", stock: 27, color: "#a4563e", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-biluochun.jpg", thumb: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-biluochun.jpg", detail: "古树原料制作，甜感稳定。适合办公室分享或茶礼搭配。", visible: true, sort: 40 },
    { id: "tea-005", name: "熟普小方砖", category: "普洱", price: 156, unit: "120g", origin: "云南勐海", roast: "渥堆熟化", taste: "糯香、陈香、顺滑", stock: 52, color: "#5d4738", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-maofeng.jpg", thumb: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/tea-maofeng.jpg", detail: "独立小砖便携，适合差旅和茶室备茶。", visible: true, sort: 50 }
  ],
  rooms: [
    { id: "room-001", name: "听松", capacity: "2-4 人", price: 168, floor: "一层临窗", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/room-guan-shan.jpg", features: ["盖碗", "电陶炉", "独立茶席"], color: "#6d866d", visible: true, sort: 10 },
    { id: "room-002", name: "合院", capacity: "4-8 人", price: 298, floor: "二层包间", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/room-ting-yu.jpg", features: ["投影", "私密会谈", "茶点"], color: "#9a744e", visible: true, sort: 20 },
    { id: "room-003", name: "木生", capacity: "1-2 人", price: 98, floor: "吧台茶席", image: "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/room-shu-xiang.jpg", features: ["主理人冲泡", "试茶", "轻办公"], color: "#536f62", visible: true, sort: 30 }
  ]
};

function sortCatalog(items) {
  return items.sort((a, b) => {
    const sortA = Number(a.sort || 9999);
    const sortB = Number(b.sort || 9999);
    if (sortA !== sortB) {
      return sortA - sortB;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
  });
}

function withInventory(item) {
  if (!item || item.stock === undefined || item.stock === null || item.stock === "") {
    return item;
  }
  const stock = Math.max(0, Number(item.stock) || 0);
  const lockedStock = Math.max(0, Number(item.lockedStock) || 0);
  const soldStock = Math.max(0, Number(item.soldStock) || 0);
  return Object.assign({}, item, {
    stock,
    lockedStock,
    soldStock,
    availableStock: Math.max(0, stock - lockedStock - soldStock)
  });
}

async function getCollectionData(collection, fallback) {
  try {
    const result = await db.collection(collection).where({
      visible: true
    }).limit(100).get();
    const data = result.data && result.data.length ? result.data : fallback;
    return sortCatalog(data.map(withInventory));
  } catch (error) {
    return sortCatalog(fallback.map(withInventory));
  }
}

exports.main = async () => {
  const [cloudDrinks, cloudTeaProducts, cloudRooms] = await Promise.all([
    getCollectionData("drinks", fallbackCatalog.drinks),
    getCollectionData("tea_products", fallbackCatalog.teaProducts),
    getCollectionData("rooms", fallbackCatalog.rooms)
  ]);

  return {
    ok: true,
    catalog: {
      drinks: cloudDrinks,
      teaProducts: cloudTeaProducts,
      rooms: cloudRooms
    }
  };
};
