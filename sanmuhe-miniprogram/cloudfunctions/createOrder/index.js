const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const specMultipliers = {
  "50g": 1,
  "100g": 2,
  "250g": 5,
  "500g": 10
};

const priceMap = {
  "drink:drink-001": { name: "桂花龙井", price: 28 },
  "drink:drink-002": { name: "芝士抹茶", price: 32 },
  "drink:drink-003": { name: "柠檬红茶", price: 24 },
  "drink:drink-004": { name: "经典龙井茶", price: 22 },
  "drink:drink-005": { name: "白桃乌龙", price: 30 },
  "drink:drink-006": { name: "红豆抹茶", price: 26 },
  "tea:tea-001": { name: "明前龙井", price: 268 },
  "tea:tea-002": { name: "大红袍", price: 198 },
  "tea:tea-003": { name: "白毫银针", price: 358 },
  "tea:tea-004": { name: "碧螺春", price: 198 },
  "tea:tea-005": { name: "黄山毛峰", price: 158 },
  "tea:tea-006": { name: "六安瓜片", price: 128 },
  "tea:tea-007": { name: "信阳毛尖", price: 138 }
};

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // The collection may already exist; writes below will surface real errors.
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeOptions(type, options) {
  const source = options || {};
  const clean = {};

  if (type === "tea") {
    const unit = cleanText(source.unit, 12);
    clean.unit = specMultipliers[unit] ? unit : "50g";
    return clean;
  }

  if (source.temp) {
    clean.temp = cleanText(source.temp, 12);
  }
  if (source.sugar) {
    clean.sugar = cleanText(source.sugar, 12);
  }
  if (source.table) {
    clean.table = cleanText(source.table, 20);
  }
  return clean;
}

function getTrustedPrice(type, basePrice, options) {
  if (type !== "tea") {
    return basePrice;
  }

  return Math.round(basePrice * (specMultipliers[options.unit] || 1));
}

async function findTrustedItem(type, id) {
  const collection = type === "tea" ? "tea_products" : "drinks";
  await ensureCollection(collection);

  try {
    const result = await db.collection(collection).where({ id }).limit(1).get();
    const item = result.data && result.data[0];
    if (item && item.visible !== false) {
      return {
        name: cleanText(item.name, 80),
        price: Math.max(0, Number(item.price) || 0)
      };
    }
  } catch (error) {
    // Fall through to the built-in catalog map.
  }

  return priceMap[`${type}:${id}`] || null;
}

async function sanitizeItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("订单商品不能为空");
  }

  let total = 0;
  const cleanItems = [];

  for (const item of items.slice(0, 30)) {
    const type = item.type === "tea" ? "tea" : "drink";
    const id = cleanText(item.id, 40);
    const trusted = await findTrustedItem(type, id);
    if (!trusted) {
      throw new Error("商品不存在或已下架");
    }

    const quantity = Math.max(1, Math.min(99, Number(item.quantity) || 1));
    const options = sanitizeOptions(type, item.options);
    const price = getTrustedPrice(type, trusted.price, options);
    total += price * quantity;

    cleanItems.push({
      id,
      type,
      name: trusted.name,
      price,
      quantity,
      options
    });
  }

  return {
    cleanItems,
    total
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const { cleanItems, total } = await sanitizeItems(event.items);
    const hasTea = cleanItems.some((item) => item.type === "tea");
    const consignee = cleanText(event.consignee, 40);
    const phone = cleanText(event.phone, 30);
    const address = cleanText(event.address, 160);

    if (hasTea && (!consignee || !phone || !address)) {
      return { ok: false, message: "请填写收货信息" };
    }

    await ensureCollection("orders");
    const orderNo = `SMH${Date.now()}`;
    const addResult = await db.collection("orders").add({
      data: {
        _openid: OPENID,
        orderNo,
        items: cleanItems,
        total,
        consignee,
        phone,
        address,
        remark: cleanText(event.remark, 200),
        source: cleanText(event.source, 40),
        status: "待支付",
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });

    return {
      ok: true,
      id: addResult._id,
      orderNo,
      total
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "订单提交失败"
    };
  }
};
