const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = "user_addresses";
const MAX_ADDRESSES = 20;

function clean(value, max) {
  const text = String(value || "").trim();
  return max ? text.slice(0, max) : text;
}

function buildFullAddress(parts = {}) {
  const region = [parts.province, parts.city, parts.district, parts.street]
    .map((item) => clean(item))
    .filter(Boolean)
    .join("");
  const detail = clean(parts.detailAddress || parts.detailInfo);
  if (detail && region && detail.indexOf(clean(parts.province)) === 0) {
    return detail;
  }
  return `${region}${detail}`.trim();
}

function normalizeInput(raw = {}) {
  const consignee = clean(raw.consignee || raw.userName, 40);
  const phone = clean(raw.phone || raw.telNumber, 20);
  const province = clean(raw.province || raw.provinceName, 40);
  const city = clean(raw.city || raw.cityName, 40);
  const district = clean(raw.district || raw.countyName, 40);
  const street = clean(raw.street || raw.streetName, 60);
  const detailAddress = clean(raw.detailAddress || raw.detailInfoNew || raw.detailInfo, 120);
  const postalCode = clean(raw.postalCode, 12);
  const nationalCode = clean(raw.nationalCode, 20);
  const address = clean(raw.address, 180) || buildFullAddress({
    province,
    city,
    district,
    street,
    detailAddress
  });

  if (!consignee) {
    throw Object.assign(new Error("请填写收货人"), { code: "INVALID_CONSIGNEE" });
  }
  if (!/^1\d{10}$/.test(phone)) {
    throw Object.assign(new Error("请填写正确手机号"), { code: "INVALID_PHONE" });
  }
  if (!province || !city || !district) {
    throw Object.assign(new Error("请选择省市区"), { code: "INVALID_REGION" });
  }
  if (!detailAddress || detailAddress.length < 4) {
    throw Object.assign(new Error("请填写详细地址"), { code: "INVALID_DETAIL" });
  }

  return {
    consignee,
    phone,
    province,
    city,
    district,
    street,
    detailAddress,
    postalCode,
    nationalCode,
    address,
    source: raw.source === "wechat" ? "wechat" : "manual"
  };
}

function publicAddress(doc = {}) {
  return {
    id: clean(doc._id || doc.id, 80),
    consignee: clean(doc.consignee, 40),
    phone: clean(doc.phone, 20),
    province: clean(doc.province, 40),
    city: clean(doc.city, 40),
    district: clean(doc.district, 40),
    street: clean(doc.street, 60),
    detailAddress: clean(doc.detailAddress, 120),
    postalCode: clean(doc.postalCode, 12),
    nationalCode: clean(doc.nationalCode, 20),
    address: clean(doc.address, 180),
    source: doc.source === "wechat" ? "wechat" : "manual",
    isDefault: doc.isDefault === true,
    createdAt: Number(doc.createdAt) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    hasAddress: Boolean(doc.consignee && doc.phone && doc.address)
  };
}

async function listRows(openid) {
  const result = await db.collection(COLLECTION)
    .where({ openid })
    .limit(MAX_ADDRESSES)
    .get();
  return (result.data || []).sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }
    return (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0);
  });
}

async function unsetDefaults(openid) {
  await db.collection(COLLECTION)
    .where({ openid, isDefault: true })
    .update({ data: { isDefault: false } });
}

async function ensureDefault(openid, preferredId) {
  const rows = await listRows(openid);
  if (!rows.length || rows.some((row) => row.isDefault === true)) {
    return rows;
  }
  const preferred = rows.find((row) => row._id === preferredId) || rows[0];
  await db.collection(COLLECTION).doc(preferred._id).update({
    data: { isDefault: true, updatedAt: Date.now() }
  });
  return listRows(openid);
}

async function findOwned(openid, id) {
  const safeId = clean(id, 80);
  if (!safeId) {
    return null;
  }
  const result = await db.collection(COLLECTION)
    .where({ _id: safeId, openid })
    .limit(1)
    .get();
  return result.data && result.data[0] ? result.data[0] : null;
}

async function listAddresses(openid) {
  const rows = await ensureDefault(openid, "");
  return {
    ok: true,
    addresses: rows.map(publicAddress)
  };
}

async function saveAddress(openid, event) {
  const raw = event.address || {};
  const input = normalizeInput(raw);
  const id = clean(raw.id || event.id, 80);
  const existingRows = await listRows(openid);
  const existing = id ? await findOwned(openid, id) : null;

  if (id && !existing) {
    throw Object.assign(new Error("地址不存在或已删除"), { code: "ADDRESS_NOT_FOUND" });
  }
  if (!existing && existingRows.length >= MAX_ADDRESSES) {
    throw Object.assign(new Error(`最多保存${MAX_ADDRESSES}个收货地址`), { code: "ADDRESS_LIMIT" });
  }

  const isDefault = raw.isDefault === true || existingRows.length === 0;
  const now = Date.now();
  if (isDefault) {
    await unsetDefaults(openid);
  }

  let savedId = id;
  if (existing) {
    await db.collection(COLLECTION).doc(existing._id).update({
      data: Object.assign({}, input, {
        isDefault,
        updatedAt: now
      })
    });
    savedId = existing._id;
  } else {
    const result = await db.collection(COLLECTION).add({
      data: Object.assign({}, input, {
        openid,
        isDefault,
        createdAt: now,
        updatedAt: now
      })
    });
    savedId = result._id;
  }

  const rows = await ensureDefault(openid, savedId);
  const saved = rows.find((row) => row._id === savedId);
  return {
    ok: true,
    address: publicAddress(saved),
    addresses: rows.map(publicAddress)
  };
}

async function removeAddress(openid, event) {
  const existing = await findOwned(openid, event.id);
  if (!existing) {
    throw Object.assign(new Error("地址不存在或已删除"), { code: "ADDRESS_NOT_FOUND" });
  }
  await db.collection(COLLECTION).doc(existing._id).remove();
  const rows = await ensureDefault(openid, "");
  return {
    ok: true,
    addresses: rows.map(publicAddress)
  };
}

async function setDefaultAddress(openid, event) {
  const existing = await findOwned(openid, event.id);
  if (!existing) {
    throw Object.assign(new Error("地址不存在或已删除"), { code: "ADDRESS_NOT_FOUND" });
  }
  await unsetDefaults(openid);
  await db.collection(COLLECTION).doc(existing._id).update({
    data: { isDefault: true, updatedAt: Date.now() }
  });
  return listAddresses(openid);
}

exports.main = async (event = {}) => {
  const context = cloud.getWXContext();
  const openid = clean(context.OPENID, 128);
  if (event.action === "health") {
    return { ok: true, name: "addressBook", authenticated: Boolean(openid) };
  }
  if (!openid) {
    return { ok: false, code: "UNAUTHORIZED", message: "暂时无法读取收货地址，请稍后重试" };
  }

  try {
    if (event.action === "save") {
      return await saveAddress(openid, event);
    }
    if (event.action === "remove") {
      return await removeAddress(openid, event);
    }
    if (event.action === "setDefault") {
      return await setDefaultAddress(openid, event);
    }
    return await listAddresses(openid);
  } catch (error) {
    console.error("[addressBook] action failed", {
      action: event.action || "list",
      code: error && error.code,
      message: error && error.message
    });
    return {
      ok: false,
      code: (error && error.code) || "ADDRESS_BOOK_ERROR",
      message: (error && error.message) || "地址操作失败，请稍后重试"
    };
  }
};
