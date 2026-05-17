const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const backupCollections = [
  "orders",
  "reservations",
  "event_signups",
  "members",
  "tea_products",
  "drinks",
  "rooms",
  "events",
  "content_blocks",
  "coupons",
  "user_coupons",
  "store_settings",
  "admin_roles",
  "admin_audit_logs",
  "notification_logs",
  "inventory_logs",
  "data_backup_logs"
];

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected after first setup.
  }
}

async function readCollection(collection, limit) {
  await ensureCollection(collection);
  const result = await db.collection(collection).limit(limit).get();
  return result.data || [];
}

async function writeBackupLog(data) {
  await ensureCollection("data_backup_logs");
  await db.collection("data_backup_logs").add({
    data: Object.assign({
      source: "scheduledBackup",
      createdAt: db.serverDate()
    }, data)
  });
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "scheduledBackup" };
  }

  const limit = Math.min(1000, Math.max(50, Number(event.limit || process.env.BACKUP_LIMIT) || 500));
  const selected = Array.isArray(event.collections) && event.collections.length
    ? event.collections.filter((item) => backupCollections.includes(item))
    : backupCollections;
  const exported = {};
  const counts = {};
  const startedAt = new Date();

  try {
    for (const collection of selected) {
      exported[collection] = await readCollection(collection, limit);
      counts[collection] = exported[collection].length;
    }

    const dateKey = startedAt.toISOString().slice(0, 10);
    const fileName = `scheduled-${dateKey}-${Date.now()}.json`;
    const cloudPath = `admin-backups/scheduled/${fileName}`;
    const payload = {
      exportedAt: startedAt.toISOString(),
      operator: "scheduledBackup",
      limit,
      counts,
      data: exported
    };
    const fileContent = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    const upload = await cloud.uploadFile({ cloudPath, fileContent });
    const fileId = upload.fileID || upload.fileId || "";

    await writeBackupLog({
      cloudPath,
      fileId,
      size: fileContent.length,
      counts,
      operator: "scheduledBackup",
      status: "success"
    });

    return {
      ok: true,
      cloudPath,
      fileId,
      size: fileContent.length,
      counts
    };
  } catch (error) {
    await writeBackupLog({
      cloudPath: "",
      size: 0,
      counts,
      operator: "scheduledBackup",
      status: "failed",
      error: error.message || String(error)
    });
    return {
      ok: false,
      message: error.message || "定时备份失败",
      counts
    };
  }
};
