const drinks = [
  {
    id: "drink-001",
    name: "桂花龙井",
    category: "推荐",
    price: 28,
    notes: "清香桂花，龙井茶底",
    badge: "推荐",
    color: "#5a844c",
    image: "/assets/images/design-drink-osmanthus.jpg",
    temps: ["冷", "常温"],
    sugars: ["无糖", "微甜"]
  },
  {
    id: "drink-002",
    name: "芝士抹茶",
    category: "奶茶系列",
    price: 32,
    notes: "抹茶茶底，芝士奶盖",
    badge: "热卖",
    color: "#5a844c",
    image: "/assets/images/design-drink-matcha.jpg",
    temps: ["冷", "少冰"],
    sugars: ["无糖", "微甜", "半糖"]
  },
  {
    id: "drink-003",
    name: "柠檬红茶",
    category: "鲜果茶",
    price: 24,
    notes: "清新柠檬，红茶茶底",
    badge: "清爽",
    color: "#c17831",
    image: "/assets/images/design-drink-lemon.jpg",
    temps: ["冷", "少冰"],
    sugars: ["无糖", "微甜"]
  },
  {
    id: "drink-004",
    name: "经典龙井茶",
    category: "经典茶饮",
    price: 22,
    notes: "清汤绿叶，鲜爽回甘",
    badge: "纯茶",
    color: "#4f7d43",
    image: "/assets/images/design-tea-longjing.jpg",
    temps: ["热", "常温"],
    sugars: ["无糖"]
  },
  {
    id: "drink-005",
    name: "白桃乌龙",
    category: "鲜果茶",
    price: 30,
    notes: "白桃香气，乌龙茶底",
    badge: "果香",
    color: "#8f7f4d",
    image: "/assets/images/design-hero-tea.jpg",
    temps: ["冷", "少冰"],
    sugars: ["无糖", "微甜"]
  },
  {
    id: "drink-006",
    name: "红豆抹茶",
    category: "小食甜点",
    price: 26,
    notes: "抹茶奶香，红豆绵密",
    badge: "甜点",
    color: "#607c4c",
    image: "/assets/images/design-drink-matcha.jpg",
    temps: ["冷"],
    sugars: ["微甜", "半糖"]
  }
];

const teaProducts = [
  {
    id: "tea-001",
    name: "明前龙井",
    category: "绿茶",
    price: 268,
    unit: "50g",
    origin: "浙江・杭州",
    roast: "轻炒青",
    taste: "口感鲜醇，鲜爽甘甜，春日限定的鲜爽滋味。",
    stock: 42,
    color: "#4f7d43",
    image: "/assets/images/design-product-longjing.jpg",
    thumb: "/assets/images/design-tea-longjing.jpg",
    detail: "色翠形美，鲜醇甘爽。建议 85 度水温冲泡，茶汤清亮，豆香与兰花香层次分明。"
  },
  {
    id: "tea-002",
    name: "大红袍",
    category: "乌龙茶",
    price: 198,
    unit: "50g",
    origin: "福建・武夷山",
    roast: "中足火",
    taste: "岩骨花香，焙火温润，茶汤厚实。",
    stock: 36,
    color: "#7b4e34",
    image: "/assets/images/design-tea-dahongpao.jpg",
    thumb: "/assets/images/design-tea-dahongpao.jpg",
    detail: "岩韵清晰，适合功夫泡。首泡快速出汤，后续按口感递增。"
  },
  {
    id: "tea-003",
    name: "白毫银针",
    category: "白茶",
    price: 358,
    unit: "50g",
    origin: "福建・福鼎",
    roast: "日晒萎凋",
    taste: "毫香清雅，汤感轻柔，回甘细腻。",
    stock: 28,
    color: "#9aa477",
    image: "/assets/images/design-tea-silver.jpg",
    thumb: "/assets/images/design-tea-silver.jpg",
    detail: "芽头肥壮，满披白毫，适合玻璃杯或盖碗慢泡。"
  },
  {
    id: "tea-004",
    name: "碧螺春",
    category: "绿茶",
    price: 198,
    unit: "50g",
    origin: "江苏・苏州",
    roast: "轻炒青",
    taste: "条索纤细，卷曲成螺，花果香明显。",
    stock: 35,
    color: "#688c48",
    image: "/assets/images/design-tea-biluochun.jpg",
    thumb: "/assets/images/design-tea-biluochun.jpg",
    detail: "洞庭风味，鲜爽细甜，适合日常清饮。"
  },
  {
    id: "tea-005",
    name: "黄山毛峰",
    category: "绿茶",
    price: 158,
    unit: "50g",
    origin: "安徽・黄山",
    roast: "轻炒青",
    taste: "条索微卷，白毫显露，兰香清长。",
    stock: 40,
    color: "#778b46",
    image: "/assets/images/design-tea-maofeng.jpg",
    thumb: "/assets/images/design-tea-maofeng.jpg",
    detail: "芽叶肥壮，汤色清澈，适合 85 度水温冲泡。"
  },
  {
    id: "tea-006",
    name: "六安瓜片",
    category: "绿茶",
    price: 128,
    unit: "50g",
    origin: "安徽・六安",
    roast: "轻炒青",
    taste: "形似瓜子，清香高长，滋味鲜醇。",
    stock: 32,
    color: "#4d6f38",
    image: "/assets/images/design-tea-liuan.jpg",
    thumb: "/assets/images/design-tea-liuan.jpg",
    detail: "单片无芽无梗，茶味干净，适合玻璃杯冲泡。"
  },
  {
    id: "tea-007",
    name: "信阳毛尖",
    category: "绿茶",
    price: 138,
    unit: "50g",
    origin: "河南・信阳",
    roast: "轻炒青",
    taste: "细圆紧直，香高味浓，回甘明显。",
    stock: 30,
    color: "#788342",
    image: "/assets/images/design-tea-xinyang.jpg",
    thumb: "/assets/images/design-tea-xinyang.jpg",
    detail: "嫩香鲜活，适合办公和日常茶饮。"
  }
];

const rooms = [
  {
    id: "room-001",
    name: "三木合・观山店",
    capacity: "2人",
    price: 168,
    floor: "安静雅致 ｜ 观山景",
    image: "/assets/images/design-room-guanshan.jpg",
    features: ["安静雅致", "观山景"],
    color: "#5a844c",
    status: "可预定"
  },
  {
    id: "room-002",
    name: "三木合・听雨店",
    capacity: "2-4人",
    price: 198,
    floor: "庭院茶室 ｜ 临窗听雨",
    image: "/assets/images/design-room-tingyu.jpg",
    features: ["庭院茶室", "临窗听雨"],
    color: "#6b8050",
    status: "可预定"
  },
  {
    id: "room-003",
    name: "三木合・书香店",
    capacity: "2人",
    price: 128,
    floor: "书香氛围 ｜ 静谧",
    image: "/assets/images/design-room-shuxiang.jpg",
    features: ["书香氛围", "静谧"],
    color: "#587249",
    status: "可预定"
  },
  {
    id: "room-004",
    name: "三木合・松风店",
    capacity: "4-6人",
    price: 148,
    floor: "松林清幽 ｜ 静心小室",
    image: "/assets/images/design-room-songfeng.jpg",
    features: ["松林清幽", "静心小室"],
    color: "#6d6a42",
    status: "已订满"
  },
  {
    id: "room-005",
    name: "三木合・竹韵店",
    capacity: "2-4人",
    price: 138,
    floor: "竹影摇曳 ｜ 清雅怡人",
    image: "/assets/images/design-room-zhuyun.jpg",
    features: ["竹影摇曳", "清雅怡人"],
    color: "#617b4b",
    status: "可预定"
  }
];

const events = [
  {
    id: "event-001",
    title: "春日茶会・品新茶",
    category: "茶会",
    date: "05.25 周六",
    time: "14:00",
    place: "三木合・双山店",
    quota: 30,
    signed: 28,
    price: 68,
    image: "/assets/images/design-event-spring.jpg",
    summary: "一起品鉴春日的新茶，感受茶香与自然的交融。",
    status: "报名中"
  },
  {
    id: "event-002",
    title: "茶文化讲座",
    category: "讲座",
    date: "06.01 周六",
    time: "10:00",
    place: "三木合・听雨店",
    quota: 50,
    signed: 45,
    price: 0,
    image: "/assets/images/design-event-culture.jpg",
    summary: "茶文化的历史与审美哲学分享。",
    status: "报名中"
  },
  {
    id: "event-003",
    title: "手作茶器体验",
    category: "体验",
    date: "06.08 周六",
    time: "14:00",
    place: "三木合・柏阳毛尖",
    quota: 20,
    signed: 16,
    price: 128,
    image: "/assets/images/design-event-handmade.jpg",
    summary: "亲手制作一只茶器，体验茶生活之美。",
    status: "报名中"
  }
];

module.exports = {
  drinks,
  teaProducts,
  rooms,
  events
};
