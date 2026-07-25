// 茶品/茶单主图：使用小程序本地素材，避免依赖旧云环境 CDN
const localImage = (path) => path.startsWith("/") ? path : `/${path}`;
const IMG = {
  tea001: localImage("assets/images/product-tea-001-organic-black.jpg"),
  tea002: localImage("assets/images/product-tea-002-wild-black.jpg"),
  tea003: localImage("assets/images/product-tea-003-aged-white.jpg"),
  tea004: localImage("assets/images/product-tea-004-mtn-white.jpg"),
  tea005: localImage("assets/images/product-tea-005-rougui.jpg"),
  tea006: localImage("assets/images/product-tea-006-aged-rock.jpg"),
  tea007: localImage("assets/images/product-tea-007-floral-dhp.jpg"),
  tea008: localImage("assets/images/product-tea-008-puer.jpg"),
  tea009: localImage("assets/images/product-tea-009-huangzhixiang.jpg"),
  tea010: localImage("assets/images/product-tea-010-gongxiang.jpg"),
  tea011: localImage("assets/images/product-tea-011-mielan.jpg"),
  tea012: localImage("assets/images/product-tea-012-zhilan.jpg"),
  tea013: localImage("assets/images/product-tea-013-jilongkan.jpg"),
  drink001: localImage("assets/images/product-drink-001-chujian.jpg"),
  drink002: localImage("assets/images/product-drink-002-zhiwei.jpg"),
  drink003: localImage("assets/images/product-drink-003-zhencang.jpg"),
  drink004: localImage("assets/images/product-drink-004-pengcha.jpg"),
  drink005: localImage("assets/images/product-drink-005-fangming.jpg")
};

// 禾煦堂饮茶单（门店现点）
const drinks = [
  {
    id: "drink-001",
    name: "初见",
    category: "推荐",
    serviceType: "tasting",
    price: 58,
    notes: "古树红茶 / 清香单丛 / 留白白茶 / 顺景普洱",
    teaGroups: [
      { name: "本席可选", options: ["古树红茶", "清香单丛", "留白白茶", "顺景普洱"] }
    ],
    badge: "道",
    color: "#8d4a2f",
    image: IMG.drink001,
    unit: "道"
  },
  {
    id: "drink-002",
    name: "知味",
    category: "品鉴",
    serviceType: "tasting",
    price: 78,
    notes: "岩茶：花香大红袍 / 十五年陈茶；红茶：有机红茶 / 正山小种；单丛：荒野蜜兰 / 贡香 / 高山蜜兰",
    teaGroups: [
      { name: "岩茶", options: ["花香大红袍", "十五年陈茶"] },
      { name: "红茶", options: ["有机红茶", "正山小种"] },
      { name: "单丛", options: ["荒野蜜兰", "贡香", "高山蜜兰"] }
    ],
    badge: "道",
    color: "#7b4e34",
    image: IMG.drink002,
    unit: "道"
  },
  {
    id: "drink-003",
    name: "臻藏",
    category: "品鉴",
    serviceType: "tasting",
    price: 98,
    notes: "马头岩肉桂",
    teaGroups: [
      { name: "本席茶品", options: ["马头岩肉桂"] }
    ],
    badge: "道",
    color: "#6b3f2f",
    image: IMG.drink003,
    unit: "道"
  },
  {
    id: "drink-004",
    name: "烹茶暖叙",
    category: "壶茶",
    serviceType: "pot",
    price: 48,
    notes: "老白茶 / 熟普 / 养生茶",
    teaGroups: [
      { name: "本壶可选", options: ["老白茶", "熟普", "养生茶"] }
    ],
    badge: "壶",
    color: "#9aa477",
    image: IMG.drink004,
    unit: "壶"
  },
  {
    id: "drink-005",
    name: "芳茗润茶",
    category: "壶茶",
    serviceType: "pot",
    price: 28,
    notes: "玫瑰花茶",
    teaGroups: [
      { name: "本壶茶品", options: ["玫瑰花茶"] }
    ],
    badge: "壶",
    color: "#c17831",
    image: IMG.drink005,
    unit: "壶"
  }
];

// 禾煦茶品目录（零售茶叶，价格与规格来自官方目录）
// specs: { label 展示名, weight 净含量说明, price 售价, stockUnits 扣库存单位 }
const teaProducts = [
  {
    id: "tea-001",
    name: "有机红茶",
    category: "红茶",
    year: "2025",
    price: 10,
    unit: "一泡",
    origin: "云南临沧有机茶园",
    roast: "2025",
    taste: "香气为花果香与蜜香交织，带点山野气韵。茶汤鲜红明亮、入口甘甜，滋味浓厚，水路细腻，回甘清甜。",
    stock: 200,
    color: "#8d4a2f",
    image: IMG.tea001,
    thumb: IMG.tea001,
    detail: "散装与礼盒多种规格可选。建议盖碗冲泡，沸水醒茶后细品花果蜜香。",
    specs: [
      { label: "一泡", weight: "5g", price: 10, stockUnits: 1 },
      { label: "20泡袋/盒", weight: "100g", price: 168, stockUnits: 20 },
      { label: "伴手礼盒", weight: "50g", price: 98, stockUnits: 10 },
      { label: "纳福礼盒（15泡）", weight: "75g", price: 188, stockUnits: 15 }
    ]
  },
  {
    id: "tea-002",
    name: "野生红茶",
    category: "红茶",
    year: "2024",
    price: 48,
    unit: "50g/小罐",
    origin: "云南临沧生态茶园",
    roast: "2024",
    taste: "花香果香浓郁，口感甘甜纯净，汤感细腻。",
    stock: 80,
    color: "#7a3f2a",
    image: IMG.tea002,
    thumb: IMG.tea002,
    detail: "体验装小罐，适合初次认识临沧野生红茶风味。",
    specs: [
      { label: "50g/小罐", weight: "50g", price: 48, stockUnits: 1 }
    ]
  },
  {
    id: "tea-003",
    name: "福鼎老白茶",
    category: "白茶",
    year: "2015",
    price: 78,
    unit: "50g/小罐",
    origin: "福鼎荒野茶园",
    roast: "2015",
    taste: "醇、润、甜、陈，十年干仓老寿眉，药枣香突出，茶汤温和不伤胃。",
    stock: 60,
    color: "#9aa477",
    image: IMG.tea003,
    thumb: IMG.tea003,
    detail: "十年干仓老寿眉，适合盖碗或煮饮，温和顺口。",
    specs: [
      { label: "50g/小罐", weight: "50g", price: 78, stockUnits: 1 }
    ]
  },
  {
    id: "tea-004",
    name: "高山小白茶",
    category: "白茶",
    year: "2021",
    price: 8,
    unit: "一泡",
    origin: "云南临沧生态茶园",
    roast: "2021",
    taste: "高山小白，清甜干净，适合日常浅饮与试泡。",
    stock: 120,
    color: "#a8b48a",
    image: IMG.tea004,
    thumb: IMG.tea004,
    detail: "单泡规格，便于随身携带与门店试饮。",
    specs: [
      { label: "一泡", weight: "5g", price: 8, stockUnits: 1 }
    ]
  },
  {
    id: "tea-005",
    name: "马头岩肉桂（手工制作）",
    category: "岩茶",
    year: "2025",
    price: 50,
    unit: "单泡",
    origin: "福建武夷山马头岩",
    roast: "2025",
    taste: "香气辛锐持久，富有层次。干香为辛锐桂皮香、焦糖香，茶汤馥郁、醇厚、绵滑，带有明显的辛辣感，其回甘迅捷，且带有清凉喉韵，尾水清甜如蔗汁。",
    stock: 40,
    color: "#7b4e34",
    image: IMG.tea005,
    thumb: IMG.tea005,
    detail: "马头岩核心产区手工制作。首泡快速出汤，后续按口感递增。",
    specs: [
      { label: "单泡", weight: "8.3g", price: 50, stockUnits: 1 },
      { label: "20泡袋/盒", weight: "166g", price: 888, stockUnits: 20 }
    ]
  },
  {
    id: "tea-006",
    name: "十五年陈茶",
    category: "岩茶",
    year: "2010",
    price: 20,
    unit: "单泡",
    origin: "福建武夷山狮子峰肉桂",
    roast: "2010",
    taste: "具药香转参香阶段，梅子花香，汤水滋味绵柔，略带武夷酸感。",
    stock: 50,
    color: "#6b3f2f",
    image: IMG.tea006,
    thumb: IMG.tea006,
    detail: "陈年岩茶，适合慢品老韵与药参香。",
    specs: [
      { label: "单泡", weight: "8.3g", price: 20, stockUnits: 1 }
    ]
  },
  {
    id: "tea-007",
    name: "花香大红袍",
    category: "岩茶",
    year: "2025",
    price: 20,
    unit: "单泡",
    origin: "福建武夷山正岩区域",
    roast: "2025",
    taste: "花果香馥郁、清幽而细润，似桂花、蜜桃、果甜交织，层次丰富，岩韵明显。入口醇厚顺滑、鲜爽甜润，回甘生津持久，喉韵绵长。",
    stock: 70,
    color: "#8a5a3a",
    image: IMG.tea007,
    thumb: IMG.tea007,
    detail: "正岩花香路线，适合功夫泡细品岩韵。",
    specs: [
      { label: "单泡", weight: "8.3g", price: 20, stockUnits: 1 }
    ]
  },
  {
    id: "tea-008",
    name: "归藏",
    category: "普洱茶",
    year: "2011",
    price: 20,
    unit: "单泡",
    origin: "云南",
    roast: "2011",
    taste: "陈韵沉稳，适合日常单泡品饮与茶席搭配。",
    stock: 60,
    color: "#6b3f2f",
    image: IMG.tea008,
    thumb: IMG.tea008,
    detail: "2011 年归藏，单泡规格便于品鉴与分享。",
    specs: [
      { label: "单泡", weight: "8.3g", price: 20, stockUnits: 1 }
    ]
  },
  {
    id: "tea-009",
    name: "黄栀香",
    category: "单丛",
    year: "2025",
    price: 48,
    unit: "30g/罐",
    origin: "潮州凤凰山",
    roast: "2025",
    taste: "黄栀香型单丛，花香清扬，茶汤顺滑。",
    stock: 55,
    color: "#8f7f4d",
    image: IMG.tea009,
    thumb: IMG.tea009,
    detail: "体验装与散装罐装可选，盖碗冲泡可闻栀子花香。",
    specs: [
      { label: "30g/罐", weight: "30g", price: 48, stockUnits: 1 },
      { label: "125g/罐", weight: "125g", price: 160, stockUnits: 4 }
    ]
  },
  {
    id: "tea-010",
    name: "贡香",
    category: "单丛",
    year: "2026",
    price: 68,
    unit: "30g/罐",
    origin: "潮州凤凰山",
    roast: "2026",
    taste: "鲜、清、雅、甜，标准清香型单丛，花香纯粹高扬；口感清爽无负担，适合偏爱淡香鲜爽口感人群、夏日冲泡。",
    stock: 50,
    color: "#7f9d60",
    image: IMG.tea010,
    thumb: IMG.tea010,
    detail: "清香型代表，夏日与入门单丛优选。",
    specs: [
      { label: "30g/罐", weight: "30g", price: 68, stockUnits: 1 },
      { label: "125g/罐", weight: "125g", price: 260, stockUnits: 4 }
    ]
  },
  {
    id: "tea-011",
    name: "荒野蜜兰",
    category: "单丛",
    year: "2026",
    price: 98,
    unit: "40g/罐",
    origin: "潮州乌岽高山核心茶园",
    roast: "2026",
    taste: "蜜甜浓郁、兰香清雅，入口绵柔醇厚，蜜甜铺满口腔，回甘迅猛持久，喉底留存淡淡兰韵；茶汤顺滑稠糯，耐泡稳定。",
    stock: 45,
    color: "#c2a34a",
    image: IMG.tea011,
    thumb: IMG.tea011,
    detail: "乌岽高山核心茶园，蜜兰香高扬耐泡。",
    specs: [
      { label: "40g/罐", weight: "40g", price: 98, stockUnits: 1 },
      { label: "125g/罐", weight: "125g", price: 280, stockUnits: 3 }
    ]
  },
  {
    id: "tea-012",
    name: "芝兰香",
    category: "单丛",
    year: "2025",
    price: 260,
    unit: "125g/罐",
    origin: "潮州凤凰山",
    roast: "2025",
    taste: "芝兰清雅，香气细腻，茶汤醇和。",
    stock: 35,
    color: "#8f7f4d",
    image: IMG.tea012,
    thumb: IMG.tea012,
    detail: "散装 125g 罐装，适合日常与馈赠。",
    specs: [
      { label: "125g/罐", weight: "125g", price: 260, stockUnits: 1 }
    ]
  },
  {
    id: "tea-013",
    name: "鸡笼刊",
    category: "单丛",
    year: "2025",
    price: 350,
    unit: "125g/罐",
    origin: "潮州凤凰山",
    roast: "2025",
    taste: "凤凰单丛名枞风味，香气高锐，岩韵与花蜜交织。",
    stock: 28,
    color: "#7b4e34",
    image: IMG.tea013,
    thumb: IMG.tea013,
    detail: "名枞级单丛，125g 罐装。",
    specs: [
      { label: "125g/罐", weight: "125g", price: 350, stockUnits: 1 }
    ]
  }
];

// 茶室列表由门店主数据派生（单店），避免再维护多套演示分店
const { getRooms } = require("./store");
const rooms = getRooms().map((room) => Object.assign({}, room, {
  price: room.priceFrom || room.price || 188
}));

const events = [
  {
    id: "event-001",
    title: "养心茶会",
    category: "养心茶会",
    date: "05.25 周六",
    time: "14:00",
    place: "禾煦",
    quota: 12,
    signed: 28,
    price: 68,
    image: "/assets/images/event-yangxin-tea.jpg",
    detailImage: localImage("assets/images/event-detail-content-1.png"),
    summary: "在茶香与静心中，慢慢安住自己",
    status: "报名中"
  },
  {
    id: "event-002",
    title: "学茶入门",
    category: "学茶",
    date: "06.01 周六",
    time: "10:00",
    place: "禾煦",
    quota: 10,
    signed: 45,
    price: 0,
    image: "/assets/images/event-tea-class.jpg",
    detailImage: localImage("assets/images/event-detail-content-2.png"),
    summary: "从识香、泡茶到品饮，轻松了解基础茶知识",
    status: "报名中"
  },
  {
    id: "event-003",
    title: "时令茶会",
    category: "时令茶会",
    date: "06.08 周六",
    time: "14:00",
    place: "禾煦",
    quota: 8,
    signed: 16,
    price: 128,
    image: "/assets/images/event-seasonal-tea.jpg",
    detailImage: localImage("assets/images/event-detail-content-3.png"),
    summary: "顺时品茶，感受节气与日常之美",
    status: "报名中"
  }
];

const homeSlides = [
  {
    key: "home-carousel-gu-yu",
    type: "home_carousel",
    title: "谷雨新茶",
    subtitle: "清润一季",
    summary: "春去夏来，茶韵正清\n山野之气，凝于一杯",
    image: localImage("assets/images/home-carousel-1.jpg"),
    badge: "新",
    linkType: "page",
    linkTarget: "/pages/shop/index",
    visible: true,
    sort: 10
  },
  {
    key: "home-carousel-tea-set",
    type: "home_carousel",
    title: "雅室新席",
    subtitle: "静候一盏",
    summary: "茶器、茶席、茶室\n把日常安放得更从容",
    image: localImage("assets/images/home-carousel-2.jpg"),
    badge: "雅",
    linkType: "page",
    linkTarget: "/pages/reservation/index",
    visible: true,
    sort: 20
  },
  {
    key: "home-carousel-matcha",
    type: "home_carousel",
    title: "堂饮茶单上新",
    subtitle: "清甜入夏",
    summary: "一席一味，门店现泡\n与好友从容共饮",
    image: localImage("assets/images/home-carousel-3.jpg"),
    badge: "饮",
    linkType: "page",
    linkTarget: "/pages/shop/index",
    visible: true,
    sort: 30
  }
];

module.exports = {
  drinks,
  teaProducts,
  rooms,
  events,
  homeSlides
};
