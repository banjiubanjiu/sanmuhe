const automator = require("miniprogram-automator");
(async () => {
  const miniProgram = await automator.launch({
    projectPath: "/home/colin/softdev/sanmuhe/sanmuhe/sanmuhe-miniprogram",
    cliPath: "/home/colin/.local/bin/wechat-devtools-cli",
    port: 9420
  });
  const shop = await miniProgram.reLaunch("/pages/shop/index");
  await shop.waitFor(3000);

  // 切「礼盒」分类
  const cats = await shop.$$(".side-cat");
  for (const c of cats) {
    if ((await c.text()).trim() === "礼盒") { await c.tap(); break; }
  }
  await shop.waitFor(800);

  // 点秋拾（点 .goods-main）
  const goods = await shop.$$(".goods-item");
  let clicked = false;
  for (const g of goods) {
    const main = await g.$(".goods-main");
    if (!main) continue;
    const n = await main.$(".goods-name");
    if (n && (await n.text()).includes("秋拾")) { await main.tap(); clicked = true; break; }
  }
  console.log("点击秋拾:", clicked ? "✅" : "❌");
  await shop.waitFor(2500);
  const prod = await miniProgram.currentPage();
  console.log("详情页路径:", prod.path);
  const hasSel = await prod.$(".giftbox-section");
  console.log("自选器存在:", !!hasSel ? "✅" : "❌");

  const teas = await prod.$$(".giftbox-tea");
  const idx = [];
  for (const t of teas) {
    const nm = (await (await t.$(".giftbox-tea-name")).text()).trim();
    idx.push(nm);
  }
  console.log("茶池:", idx.join(" | "));
  const tapPlus = async (name) => {
    const i = idx.indexOf(name);
    if (i < 0) return console.log("  没找到:", name);
    await (await teas[i].$(".giftbox-step-btn.plus")).tap();
    await prod.waitFor(300);
  };
  await tapPlus("红茶");
  await tapPlus("大红袍");
  const price = await prod.$(".detail-price .price");
  const priceText = price ? (await price.text()).trim() : "?";
  console.log("红茶+大红袍 价格:", priceText, priceText === "¥198" ? "✅" : "❌");

  await (await prod.$(".cart-action")).tap();
  await prod.waitFor(500);
  const cart = await miniProgram.reLaunch("/pages/cart/index");
  await cart.waitFor(1500);
  const cartNames = await cart.$$(".cart-name");
  const cartTexts = [];
  for (const c of cartNames) cartTexts.push((await c.text()).trim());
  console.log("购物车:", cartTexts.join(" | "));
  const opt = await cart.$(".cart-option");
  if (opt) console.log("自选明细:", (await opt.text()).trim());

  await miniProgram.close();
  console.log("E2E 完成");
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message || e); process.exit(1); });
