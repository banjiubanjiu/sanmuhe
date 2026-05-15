const { rooms } = require("../../data/catalog");
const { createReservation, getCatalog } = require("../../utils/cloudApi");
const { getBookingDays } = require("../../utils/date");

const timeOptions = [
  { value: "10:00", seats: 2 },
  { value: "12:30", seats: 1 },
  { value: "15:00", seats: 3 },
  { value: "17:30", seats: 2 },
  { value: "20:00", seats: 1 }
];
const timeSlots = timeOptions.map((item) => item.value);
const CONTACT_KEY = "sanmuhe_contact";

const roomCities = ["佛山", "杭州", "苏州", "广州", "上海"];
const roomAddresses = [
  "广东省佛山市",
  "浙江省杭州市西湖区",
  "江苏省苏州市姑苏区",
  "广东省广州市越秀区",
  "上海市徐汇区"
];

function getDayText(days, value) {
  const day = days.find((item) => item.value === value);
  return day ? `${day.display} ${day.label}` : value;
}

function decorateDays(days) {
  return days.map((item) => Object.assign({}, item, {
    slashDisplay: item.display.replace(".", "/")
  }));
}

function decorateRooms(roomList) {
  return (roomList || []).map((room, index) => Object.assign({}, room, {
    displayName: "三木合茶室",
    city: roomCities[index % roomCities.length],
    address: roomAddresses[index % roomAddresses.length],
    heroImage: room.image || "https://7361-sanmuhe-env-d3g1nt3jsa1be67e3-1316449112.tcb.qcloud.la/assets/images/design-room-guanshan.jpg"
  }));
}

const defaultRooms = decorateRooms(rooms);

Page({
  data: {
    rooms: defaultRooms,
    days: [],
    visibleDays: [],
    timeSlots,
    timeOptions,
    selectedRoom: defaultRooms[0],
    selectedDay: "",
    selectedDayText: "",
    selectedTime: "15:00",
    people: 2,
    name: "",
    phone: "",
    note: "",
    bookingOpen: false,
    roomSelectorOpen: false
  },

  onLoad() {
    const days = decorateDays(getBookingDays());
    const contact = wx.getStorageSync(CONTACT_KEY) || {};
    this.setData({
      days,
      visibleDays: days.slice(0, 5),
      selectedDay: days[0].value,
      selectedDayText: getDayText(days, days[0].value),
      name: contact.consignee || contact.name || "",
      phone: contact.phone || ""
    });
    this.loadCatalog();
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const nextRooms = decorateRooms(catalog.rooms && catalog.rooms.length ? catalog.rooms : rooms);
      const selectedRoom = nextRooms.find((item) => item.id === this.data.selectedRoom.id) || nextRooms[0];
      this.setData({
        rooms: nextRooms,
        selectedRoom
      });
    });
  },

  chooseRoom(event) {
    const room = this.data.rooms.find((item) => item.id === event.currentTarget.dataset.id);
    this.setData({
      selectedRoom: room,
      roomSelectorOpen: false
    });
  },

  openRoomPicker() {
    this.setData({ roomSelectorOpen: true });
  },

  closeRoomPicker() {
    this.setData({ roomSelectorOpen: false });
  },

  openBooking() {
    if (this.data.selectedRoom.status === "已订满") {
      wx.showToast({ title: "该茶室已订满", icon: "none" });
      return;
    }
    this.setData({ bookingOpen: true });
  },

  closeBooking() {
    this.setData({ bookingOpen: false });
  },

  noop() {},

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/index/index" });
  },

  chooseDay(event) {
    const selectedDay = event.currentTarget.dataset.value;
    this.setData({
      selectedDay,
      selectedDayText: getDayText(this.data.days, selectedDay)
    });
  },

  showMoreDates() {
    this.setData({ visibleDays: this.data.days });
  },

  chooseTime(event) {
    this.setData({ selectedTime: event.currentTarget.dataset.value });
  },

  setPeople(event) {
    const next = this.data.people + Number(event.currentTarget.dataset.step);
    this.setData({ people: Math.max(1, Math.min(12, next)) });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value }, () => {
      if (field === "name" || field === "phone") {
        wx.setStorageSync(CONTACT_KEY, {
          consignee: this.data.name,
          phone: this.data.phone,
          address: (wx.getStorageSync(CONTACT_KEY) || {}).address || ""
        });
      }
    });
  },

  submitReservation() {
    const { selectedRoom, selectedDay, selectedTime, people, name, phone, note } = this.data;
    if (!name || !phone) {
      wx.showToast({ title: "请填写联系人", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(String(phone).trim())) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }

    const payload = {
      roomId: selectedRoom.id,
      room: selectedRoom.name,
      day: selectedDay,
      time: selectedTime,
      people,
      name,
      phone,
      note
    };

    createReservation(payload).then((result) => {
      if (result && result.ok === false) {
        wx.showToast({ title: result.message || "预约失败", icon: "none" });
        return;
      }
      wx.showModal({
        title: "预约已提交",
        content: "门店确认后可通过服务通知或电话联系顾客。",
        showCancel: false,
        success: () => {
          this.setData({ bookingOpen: false });
          wx.switchTab({ url: "/pages/profile/index" });
        }
      });
    }).catch(() => {
      const reservations = wx.getStorageSync("sanmuhe_reservations") || [];
      reservations.unshift({
        id: `RSV${Date.now()}`,
        room: selectedRoom.name,
        day: selectedDay,
        time: selectedTime,
        people,
        name,
        phone,
        note,
        status: "待确认"
      });
      wx.setStorageSync("sanmuhe_reservations", reservations);
      wx.showModal({
        title: "预约已提交",
        content: "预约已临时保存在本机，云端恢复后请重新提交确认。",
        showCancel: false,
        success: () => {
          this.setData({ bookingOpen: false });
          wx.switchTab({ url: "/pages/profile/index" });
        }
      });
    });
  }
});
