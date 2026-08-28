/**
 * keepWarm —— 定时预热云函数（成本 ≈ 0，替代昂贵的预置并发）。
 *
 * 原理：CloudBase 云函数实例空闲一段时间后会被回收，导致用户请求冷启动。
 * 本函数由定时触发器每分钟调用一次，通过同环境互调 health 接口，
 * 让 manageOperations（经营后台）与 getCatalog（小程序目录）实例保持热，
 * 用户/店员访问时无需再等冷启动。
 *
 * 成本：每分钟 1 次调用 ≈ 1440 次/天，按 SCF 调用费约几分钱/月。
 */
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 需要保持热的云函数；health 为免鉴权轻量接口
const TARGETS = [
  { name: "manageOperations", data: { action: "health" } },
  { name: "getCatalog", data: { action: "health" } }
];

exports.main = async () => {
  const results = [];
  for (const target of TARGETS) {
    const startedAt = Date.now();
    try {
      const res = await cloud.callFunction({
        name: target.name,
        data: target.data
      });
      const result = res && res.result;
      results.push({
        name: target.name,
        ok: !!(result && result.ok),
        durationMs: Date.now() - startedAt,
        code: result && result.code ? String(result.code).slice(0, 40) : ""
      });
    } catch (error) {
      results.push({
        name: target.name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: String((error && error.message) || error).slice(0, 120)
      });
    }
  }
  return { ok: true, results };
};
