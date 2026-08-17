const cloud = require("wx-server-sdk");
const COS = require("cos-nodejs-sdk-v5");
const { BACKUP_COLLECTIONS, createBackup } = require("./backup");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cosCredentials() {
  return {
    SecretId: process.env.TENCENTCLOUD_SECRETID || process.env.TENCENTCLOUD_SECRET_ID || "",
    SecretKey: process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENTCLOUD_SECRET_KEY || "",
    SecurityToken: process.env.TENCENTCLOUD_SESSIONTOKEN || process.env.TENCENTCLOUD_SESSION_TOKEN || ""
  };
}

async function ensureBackupLogCollection() {
  try {
    await db.createCollection("data_backup_logs");
  } catch (error) {
    // The collection normally already exists in production.
  }
}

async function writeBackupLog(data) {
  await ensureBackupLogCollection();
  await db.collection("data_backup_logs").add({
    data: Object.assign({
      source: "scheduledBackup",
      createdAt: db.serverDate()
    }, data)
  });
}

async function safeWriteBackupLog(data) {
  try {
    await writeBackupLog(data);
  } catch (error) {
    console.error("scheduledBackup log write failed", error && error.message || String(error));
  }
}

exports.main = async (event = {}) => {
  const credentials = cosCredentials();
  const configuration = {
    bucket: String(process.env.BACKUP_COS_BUCKET || "").trim(),
    destinationRegion: String(process.env.BACKUP_COS_REGION || "").trim(),
    prefix: String(process.env.BACKUP_COS_PREFIX || "sanmuhe/database").trim(),
    environmentId: process.env.TCB_ENV || process.env.SCF_NAMESPACE || "cloudbase-d2gq023qn50e9d82f",
    sourceRegion: process.env.TENCENTCLOUD_REGION || "ap-shanghai"
  };

  if (event.action === "health") {
    return {
      ok: true,
      name: "scheduledBackup",
      destinationConfigured: Boolean(configuration.bucket && configuration.destinationRegion),
      runtimeCredentialsAvailable: Boolean(credentials.SecretId && credentials.SecretKey),
      collectionCount: BACKUP_COLLECTIONS.length
    };
  }

  const startedAt = new Date();
  let objectKey = "";
  try {
    configuration.bucket = requiredEnv("BACKUP_COS_BUCKET");
    configuration.destinationRegion = requiredEnv("BACKUP_COS_REGION");
    if (!credentials.SecretId || !credentials.SecretKey) {
      throw new Error("SCF runtime credentials are unavailable");
    }

    const result = await createBackup({
      db,
      cos: new COS(credentials),
      collections: BACKUP_COLLECTIONS,
      startedAt,
      environmentId: configuration.environmentId,
      sourceRegion: configuration.sourceRegion,
      bucket: configuration.bucket,
      destinationRegion: configuration.destinationRegion,
      prefix: configuration.prefix,
      pageSize: positiveInteger(process.env.BACKUP_PAGE_SIZE, 200),
      maxDocuments: positiveInteger(process.env.BACKUP_MAX_DOCUMENTS, 100000)
    });
    objectKey = result.objectKey;

    await safeWriteBackupLog({
      storage: "cos",
      bucket: configuration.bucket,
      region: configuration.destinationRegion,
      cloudPath: result.objectKey,
      objectKey: result.objectKey,
      size: result.size,
      uncompressedSize: result.uncompressedSize,
      checksum: result.checksum,
      contentChecksum: result.contentChecksum,
      etag: result.etag,
      counts: result.counts,
      totals: result.counts,
      truncated: {},
      truncatedCollections: [],
      collectionCount: result.collectionCount,
      operator: "scheduledBackup",
      status: "success"
    });

    console.log("scheduledBackup completed", JSON.stringify({
      objectKey: result.objectKey,
      size: result.size,
      checksum: result.checksum,
      collectionCount: result.collectionCount
    }));
    return { ok: true, ...result };
  } catch (error) {
    const message = error && error.message || String(error);
    await safeWriteBackupLog({
      storage: "cos",
      bucket: configuration.bucket,
      region: configuration.destinationRegion,
      cloudPath: objectKey,
      objectKey,
      operator: "scheduledBackup",
      status: "failed",
      error: message
    });
    console.error("scheduledBackup failed", message);
    return { ok: false, message };
  }
};
