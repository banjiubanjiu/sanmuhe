/**
 * 上传小程序代码并用于设为体验版。
 *
 * 前置：
 * 1. 微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载私钥
 * 2. 把私钥存为：sanmuhe/.secrets/miniprogram-upload.key
 * 3. 同一页把本机公网 IP 加入「上传 IP 白名单」（可选，看后台要求）
 *
 * 用法（在 sanmuhe-miniprogram 目录）：
 *   node ../scripts/upload-trial-miniprogram.mjs
 *   VERSION=1.0.1 DESC="体验版修复" node ../scripts/upload-trial-miniprogram.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const projectPath = path.join(repoRoot, "sanmuhe-miniprogram");
const privateKeyPath = path.join(repoRoot, ".secrets", "miniprogram-upload.key");
const appid = "wx47e7cc7143682291";

// miniprogram-ci 装在小程序目录 node_modules
const require = createRequire(path.join(projectPath, "package.json"));
const ci = require("miniprogram-ci");

const version =
  process.env.VERSION ||
  `0.1.${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const desc =
  process.env.DESC ||
  `体验版 ${new Date().toISOString().slice(0, 16).replace("T", " ")} 支付/企微/购物车修复`;

if (!fs.existsSync(privateKeyPath)) {
  console.error("缺少上传密钥：", privateKeyPath);
  console.error("请到 mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载私钥");
  console.error("保存为上述路径后重新运行。");
  process.exit(1);
}

const keyText = fs.readFileSync(privateKeyPath, "utf8");
if (!/BEGIN (RSA )?PRIVATE KEY/.test(keyText)) {
  console.error("密钥文件格式不对，需要微信下载的 private.key 内容");
  process.exit(1);
}

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath,
  privateKeyPath,
  ignores: [
    "node_modules/**/*",
    "admin/**/*",
    "admin-src/**/*",
    "scripts/**/*",
    "docs/**/*",
    "**/*.md",
    "package-lock.json",
    "vite.config.mjs",
    "cloudbaserc.json",
    "cloudbaserc.json.bak"
  ]
});

console.log("appid:", appid);
console.log("project:", projectPath);
console.log("version:", version);
console.log("desc:", desc);
console.log("uploading...");

const uploadResult = await ci.upload({
  project,
  version,
  desc,
  setting: {
    es6: true,
    es7: true,
    minify: true,
    minifyWXSS: true,
    minifyWXML: true,
    autoPrefixWXSS: true,
    codeProtect: false
  },
  onProgressUpdate: (task) => {
    if (task && task.status === "doing") {
      process.stdout.write(`\r${task.message || task._msg || "uploading..."}   `);
    }
  }
});

console.log("\nupload ok");
console.log(JSON.stringify(uploadResult, null, 2));

// 再打一份预览二维码，方便立刻扫
const qrPath = path.join(repoRoot, ".secrets", "trial-preview-qr.jpg");
try {
  const previewResult = await ci.preview({
    project,
    desc: `preview ${desc}`,
    setting: {
      es6: true,
      minify: true,
      minifyWXSS: true,
      minifyWXML: true
    },
    qrcodeFormat: "image",
    qrcodeOutputDest: qrPath,
    onProgressUpdate: () => {}
  });
  console.log("preview qr saved:", qrPath);
  console.log(JSON.stringify(previewResult, null, 2));
} catch (error) {
  console.warn("preview 生成失败（上传仍可能已成功）:", error.message || error);
}

console.log(`
下一步（必须在公众平台点一次）：
1. 打开 https://mp.weixin.qq.com → 管理 → 版本管理
2. 在「开发版本」找到刚上传的 ${version}
3. 点「选为体验版」
4. 成员管理 → 体验成员里加入要测的微信号
5. 体验成员微信：小程序 → 搜索 / 下拉最近使用 或 扫体验版二维码
`);
