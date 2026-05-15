function pad(num) {
  return num < 10 ? `0${num}` : String(num);
}

function getBookingDays() {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const today = new Date();
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      label: index === 0 ? "今天" : weekdays[date.getDay()],
      value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      display: `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
    };
  });
}

module.exports = {
  getBookingDays
};
