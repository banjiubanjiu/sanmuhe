const TABLE_KEY = "sanmuhe_table_no";

/**
 * 保留场景值：这些不是桌号。
 * 分享码 scene=share 扫进首页时，若被当作桌号，app.js 会 reLaunch 跳去点单页。
 */
const RESERVED_TABLE_VALUES = new Set(["share"]);

function decodeMaybe(value) {
  let text = String(value == null ? "" : value).trim();
  if (!text) {
    return "";
  }
  for (let i = 0; i < 2; i += 1) {
    try {
      if (!/%[0-9A-Fa-f]{2}/.test(text)) {
        break;
      }
      const next = decodeURIComponent(text);
      if (next === text) {
        break;
      }
      text = next;
    } catch (error) {
      break;
    }
  }
  return String(text || "").trim();
}

function normalizeTable(value) {
  const normalized = decodeMaybe(value)
    .replace(/^桌号\s*/i, "")
    .replace(/^桌\s*/i, "")
    .slice(0, 20);
  if (RESERVED_TABLE_VALUES.has(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}

/**
 * Parse table id from QR content, scene string, or query-like raw text.
 * Supports: table=A01 | t=A01 | A01 | 3号桌 | URL with table=
 */
function parseTableFromRaw(rawValue) {
  const decoded = decodeMaybe(rawValue);
  if (!decoded) {
    return "";
  }

  const fromPair = decoded.match(/(?:^|[?&#/])(?:table|t)=([^&?#/]+)/i);
  if (fromPair && fromPair[1]) {
    return normalizeTable(fromPair[1]);
  }

  const fromPrefix = decoded.match(/^(?:table|t)=(.+)$/i);
  if (fromPrefix && fromPrefix[1]) {
    return normalizeTable(fromPrefix[1]);
  }

  // 「桌号 5」「桌A01」
  const fromCn = decoded.match(/桌号\s*([^\s；;，,]+)/) || decoded.match(/^桌\s*([^\s；;，,]+)$/);
  if (fromCn && fromCn[1]) {
    return normalizeTable(fromCn[1]);
  }

  // Plain scene / label (avoid pure long numeric WeChat entrance scene codes if ever passed)
  if (/^[\w\u4e00-\u9fa5\-号桌\s]+$/i.test(decoded) && decoded.length <= 20) {
    const plain = normalizeTable(decoded);
    if (!plain || /^\d{4,}$/.test(plain)) {
      return "";
    }
    return plain;
  }

  return "";
}

/**
 * App onLaunch/onShow or page onLoad options.
 * Unlimited mini-code puts custom scene in query.scene (string).
 * Path QR may use query.table.
 * options.scene as number is WeChat entrance type — ignore as table.
 */
function parseTableFromLaunch(options = {}) {
  const source = options || {};
  const query = source.query && typeof source.query === "object" ? source.query : {};

  const candidates = [
    query.table,
    query.t,
    source.table,
    source.t,
    query.scene,
    typeof source.scene === "string" ? source.scene : ""
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const table = parseTableFromRaw(candidates[i]);
    if (table) {
      return table;
    }
  }

  // Unlimited code sometimes only has scene as plain table id
  if (query.scene != null && String(query.scene).trim()) {
    const plain = normalizeTable(query.scene);
    if (plain && !/^\d{4,}$/.test(plain)) {
      return plain;
    }
  }

  return "";
}

function setTableNo(table) {
  const value = normalizeTable(table);
  if (value) {
    wx.setStorageSync(TABLE_KEY, value);
  }
  return value;
}

function getTableNo() {
  return normalizeTable(wx.getStorageSync(TABLE_KEY) || "");
}

function clearTableNo() {
  try {
    wx.removeStorageSync(TABLE_KEY);
  } catch (error) {
    // ignore
  }
}

function formatTableRemark(table, extraNote) {
  const tableNo = normalizeTable(table);
  const note = String(extraNote || "").trim();
  const head = tableNo ? `桌号 ${tableNo}` : "";
  if (head && note) {
    // avoid duplicate 桌号 in note
    if (note.indexOf(head) === 0 || note.indexOf(`桌号${tableNo}`) >= 0) {
      return note.slice(0, 200);
    }
    return `${head}；${note}`.slice(0, 200);
  }
  return (head || note).slice(0, 200);
}

function orderUrl(table) {
  const tableNo = normalizeTable(table);
  if (!tableNo) {
    return "/pages/order/index";
  }
  return `/pages/order/index?table=${encodeURIComponent(tableNo)}`;
}

module.exports = {
  TABLE_KEY,
  clearTableNo,
  formatTableRemark,
  getTableNo,
  normalizeTable,
  orderUrl,
  parseTableFromLaunch,
  parseTableFromRaw,
  setTableNo
};
