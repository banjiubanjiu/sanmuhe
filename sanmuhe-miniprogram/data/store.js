/**
 * 禾煦门店主数据（Single-store first）
 *
 * 产品当前只有一家实体店。预约、联系、首页茶室入口都应消费这里，
 * 而不是各自硬编码，更不要用多店演示名（观山/听雨…）冒充门店。
 *
 * 以后若开分店：mode 改为 multi，并按 storeId 扩展列表即可。
 */

const STORE_MODE = "single";

const store = {
  id: "store-hexi",
  name: "禾煦茶书房",
  city: "佛山・禅城",
  address: "佛山市禅城区石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  shortAddress: "石湾镇街道怡翠宏璟P9铺禾煦茶书房",
  phone: "18038768716",
  wechat: "zizi66",
  businessHours: "周一～周日 9:00～21:30",
  heroImage: "/assets/images/reservation-hero.jpg"
};

/** 本店可预约茶席（单店阶段与门店同一展示名） */
const teaRoom = {
  id: "room-001",
  storeId: store.id,
  name: store.name,
  capacity: "6人以内",
  priceFrom: 188,
  floor: "每场 2 小时 ｜ 6 位以内",
  features: ["每场 2 小时", "6 位以内", "赠 2 泡茶"],
  image: store.heroImage,
  color: "#5a844c",
  status: "可预定"
};

const booking = {
  sessionMinutes: 120,
  maxPeople: 6,
  giftTea: {
    cups: 2,
    valueYuan: 78,
    copy: "含赠 2 泡茶（价值 ¥78）"
  },
  /** 日间结束 19:30 仍算日间；晚间从 19:30 开场 */
  periods: [
    { id: "day", label: "日间", start: "10:00", end: "19:30", price: 188 },
    { id: "evening", label: "晚间", start: "19:30", end: "21:30", price: 208 }
  ]
};

function getStore() {
  return store;
}

function getTeaRoom() {
  return Object.assign({}, teaRoom, {
    displayName: teaRoom.name,
    city: store.city,
    address: store.shortAddress || store.address
  });
}

/** 兼容旧 catalog.rooms 消费方：始终返回本店茶席列表 */
function getRooms() {
  const room = getTeaRoom();
  return [Object.assign({}, room)];
}

function getBookingPolicy() {
  return booking;
}

function isSingleStore() {
  return STORE_MODE === "single";
}

/**
 * 列表展示用：单店模式下统一出门店名；
 * 多店模式再用记录里的 storeName / room。
 */
function displayReservationPlace(record = {}) {
  if (isSingleStore()) {
    return store.name;
  }
  return record.storeName || record.room || store.name;
}

module.exports = {
  STORE_MODE,
  store,
  teaRoom,
  booking,
  getStore,
  getTeaRoom,
  getRooms,
  getBookingPolicy,
  isSingleStore,
  displayReservationPlace
};
