const { rooms } = require("../../data/catalog");
const { createReservation, getCatalog } = require("../../utils/cloudApi");
const { getBookingDays } = require("../../utils/date");

const timeSlots = ["10:00", "12:30", "15:00", "17:30", "19:30"];

function getDayText(days, value) {
  const day = days.find((item) => item.value === value);
  return day ? `${day.display} ${day.label}` : value;
}

Page({
  data: {
    rooms,
    days: [],
    timeSlots,
    selectedRoom: rooms[0],
    selectedDay: "",
    selectedDayText: "",
    selectedTime: timeSlots[1],
    people: 2,
    name: "",
    phone: "",
    note: "",
    bookingOpen: false
  },

  onLoad() {
    const days = getBookingDays();
    this.setData({
      days,
      selectedDay: days[0].value,
      selectedDayText: getDayText(days, days[0].value)
    });
    this.loadCatalog();
  },

  loadCatalog() {
    getCatalog().then((catalog) => {
      const nextRooms = catalog.rooms && catalog.rooms.length ? catalog.rooms : rooms;
      const selectedRoom = nextRooms.find((item) => item.id === this.data.selectedRoom.id) || nextRooms[0];
      this.setData({
        rooms: nextRooms,
        selectedRoom
      });
    });
  },

  chooseRoom(event) {
    const room = this.data.rooms.find((item) => item.id === event.currentTarget.dataset.id);
    this.setData({ selectedRoom: room });
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

  chooseTime(event) {
    this.setData({ selectedTime: event.currentTarget.dataset.value });
  },

  setPeople(event) {
    const next = this.data.people + Number(event.currentTarget.dataset.step);
    this.setData({ people: Math.max(1, Math.min(12, next)) });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  submitReservation() {
    const { selectedRoom, selectedDay, selectedTime, people, name, phone, note } = this.data;
    if (!name || !phone) {
      wx.showToast({ title: "请填写联系人", icon: "none" });
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
