const crypto = require("crypto");
const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);

const BACKUP_COLLECTIONS = [
  "admin_audit_logs",
  "admin_notices",
  "admin_roles",
  "content_blocks",
  "coupons",
  "drinks",
  "event_signups",
  "events",
  "inventory_logs",
  "marketing_campaigns",
  "members",
  "membership_plans",
  "notification_logs",
  "orders",
  "product_categories",
  "recharge_orders",
  "relation_data_depart",
  "reservations",
  "rooms",
  "store_settings",
  "subscription_preferences",
  "sys_department",
  "sys_user",
  "table_qrs",
  "tea_products",
  "user_addresses",
  "user_coupons",
  "user_profiles",
  "wallet_accounts",
  "wallet_ledger"
];

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function beijingDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((result, item) => {
    if (item.type !== "literal") result[item.type] = item.value;
    return result;
  }, {});
  return parts;
}

function buildObjectKey(startedAt, prefix = "sanmuhe/database") {
  const parts = beijingDateParts(startedAt);
  const stamp = `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}+0800`;
  const base = String(prefix || "sanmuhe/database").replace(/^\/+|\/+$/g, "");
  return `${base}/daily/${parts.year}/${parts.month}/${parts.day}/database-${stamp}-${startedAt.getTime()}.json.gz`;
}

async function readCollectionPage(db, collectionName, offset, pageSize) {
  const result = await db.collection(collectionName)
    .orderBy("_id", "asc")
    .skip(offset)
    .limit(pageSize)
    .get();
  return result.data || [];
}

async function readCollectionOnce(db, collectionName, options) {
  const pageSize = options.pageSize;
  const maxDocuments = options.maxDocuments;
  const before = Number((await db.collection(collectionName).count()).total || 0);
  if (before > maxDocuments) {
    throw new Error(`${collectionName} has ${before} documents, above BACKUP_MAX_DOCUMENTS=${maxDocuments}`);
  }

  const items = [];
  while (items.length < before) {
    const page = await readCollectionPage(db, collectionName, items.length, pageSize);
    if (!page.length) break;
    items.push(...page);
    if (items.length > maxDocuments) {
      throw new Error(`${collectionName} exceeded BACKUP_MAX_DOCUMENTS=${maxDocuments} while exporting`);
    }
  }

  const after = Number((await db.collection(collectionName).count()).total || 0);
  return { items, before, after, stable: before === after && after === items.length };
}

async function readStableCollection(db, collectionName, options) {
  const attempts = Math.max(1, options.consistencyAttempts || 2);
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await readCollectionOnce(db, collectionName, options);
    if (result.stable) return result.items;
  }
  throw new Error(
    `${collectionName} changed during export (before=${result.before}, exported=${result.items.length}, after=${result.after})`
  );
}

function putObject(cos, params) {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (error, result) => error ? reject(error) : resolve(result || {}));
  });
}

async function createBackup(options) {
  const startedAt = options.startedAt || new Date();
  const collections = options.collections || BACKUP_COLLECTIONS;
  const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize) || 200));
  const maxDocuments = Math.max(pageSize, Number(options.maxDocuments) || 100000);
  const data = {};
  const counts = {};

  for (const collectionName of collections) {
    const items = await readStableCollection(options.db, collectionName, {
      pageSize,
      maxDocuments,
      consistencyAttempts: 2
    });
    data[collectionName] = items;
    counts[collectionName] = items.length;
  }

  const payload = {
    schemaVersion: 2,
    exportedAt: startedAt.toISOString(),
    source: {
      environmentId: options.environmentId,
      region: options.sourceRegion
    },
    destination: {
      bucket: options.bucket,
      region: options.destinationRegion
    },
    counts,
    data
  };
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = await gzip(json, { level: zlib.constants.Z_BEST_COMPRESSION });
  const contentChecksum = sha256(json);
  const checksum = sha256(compressed);
  const objectKey = buildObjectKey(startedAt, options.prefix);

  const upload = await putObject(options.cos, {
    Bucket: options.bucket,
    Region: options.destinationRegion,
    Key: objectKey,
    Body: compressed,
    ContentLength: compressed.length,
    ContentType: "application/gzip",
    ServerSideEncryption: "AES256",
    Headers: {
      "x-cos-meta-sha256": checksum,
      "x-cos-meta-content-sha256": contentChecksum,
      "x-cos-meta-schema-version": "2"
    }
  });

  return {
    objectKey,
    size: compressed.length,
    uncompressedSize: json.length,
    checksum,
    contentChecksum,
    counts,
    collectionCount: collections.length,
    etag: String(upload.ETag || upload.etag || "").replace(/\"/g, "")
  };
}

module.exports = {
  BACKUP_COLLECTIONS,
  buildObjectKey,
  createBackup,
  readStableCollection,
  sha256
};
