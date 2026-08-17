import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const {
  BACKUP_COLLECTIONS,
  buildObjectKey,
  createBackup,
  sha256
} = require("../cloudfunctions/scheduledBackup/backup");

const fixture = {
  orders: Array.from({ length: 5 }, (_, index) => ({ _id: `order-${index + 1}`, amount: index + 10 })),
  recharge_orders: [{ _id: "recharge-1", amount: 500, bonus: 100 }],
  wallet_accounts: [{ _id: "wallet-1", balance: 600 }],
  wallet_ledger: [{ _id: "ledger-1", delta: 600, balanceAfter: 600 }]
};

const pageReads = [];
const db = {
  collection(name) {
    const records = fixture[name] || [];
    return {
      async count() {
        return { total: records.length };
      },
      orderBy(field, direction) {
        assert.equal(field, "_id");
        assert.equal(direction, "asc");
        let offset = 0;
        let limit = 100;
        return {
          skip(value) {
            offset = value;
            return this;
          },
          limit(value) {
            limit = value;
            return this;
          },
          async get() {
            pageReads.push({ name, offset, limit });
            return { data: records.slice(offset, offset + limit) };
          }
        };
      }
    };
  }
};

let uploaded = null;
const cos = {
  putObject(params, callback) {
    uploaded = params;
    callback(null, { ETag: '"fixture-etag"' });
  }
};

for (const required of ["orders", "members", "recharge_orders", "wallet_accounts", "wallet_ledger", "membership_plans"]) {
  assert.ok(BACKUP_COLLECTIONS.includes(required), `missing critical collection ${required}`);
}
assert.ok(!BACKUP_COLLECTIONS.includes("data_backup_logs"), "backup logs must not recursively back up themselves");

const startedAt = new Date("2026-08-17T21:30:00.000Z");
assert.match(buildObjectKey(startedAt), /daily\/2026\/08\/18\/database-20260818T053000\+0800-/);

const collections = Object.keys(fixture);
const result = await createBackup({
  db,
  cos,
  collections,
  startedAt,
  environmentId: "test-env",
  sourceRegion: "ap-shanghai",
  bucket: "test-backup-1234567890",
  destinationRegion: "ap-guangzhou",
  prefix: "sanmuhe/database",
  pageSize: 2,
  maxDocuments: 100
});

assert.ok(uploaded, "COS upload should be called");
assert.equal(uploaded.Bucket, "test-backup-1234567890");
assert.equal(uploaded.Region, "ap-guangzhou");
assert.equal(uploaded.ContentType, "application/gzip");
assert.equal(uploaded.ServerSideEncryption, "AES256");
assert.equal(uploaded.Headers["x-cos-meta-sha256"], sha256(uploaded.Body));
assert.equal(result.checksum, sha256(uploaded.Body));
assert.equal(result.etag, "fixture-etag");
assert.deepEqual(result.counts, {
  orders: 5,
  recharge_orders: 1,
  wallet_accounts: 1,
  wallet_ledger: 1
});
assert.ok(pageReads.filter((item) => item.name === "orders").length >= 3, "orders should be paginated");

const payload = JSON.parse(gunzipSync(uploaded.Body).toString("utf8"));
assert.equal(payload.schemaVersion, 2);
assert.equal(payload.source.environmentId, "test-env");
assert.equal(payload.destination.region, "ap-guangzhou");
assert.equal(payload.data.orders.length, 5);
assert.equal(payload.data.wallet_ledger[0].balanceAfter, 600);
assert.equal(result.contentChecksum, sha256(Buffer.from(JSON.stringify(payload), "utf8")));

console.log(`[scheduledBackup] verified ${collections.length} collections, pagination, gzip, checksums and COS upload metadata`);
