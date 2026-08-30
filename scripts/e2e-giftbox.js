const automator = require("miniprogram-automator");
(async () => {
  const miniProgram = await automator.launch({
    projectPath: "/home/colin/softdev/sanmuhe/sanmuhe/sanmuhe-miniprogram",
    cliPath: "/home/colin/.local/bin/wechat-devtools-cli",
    port: 9420
  });
  await miniProgram.evaluate(() => { wx.clearStorageSync(); return true; });
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
  if (!clicked) throw new Error("礼盒分类中未找到秋拾");
  await shop.waitFor(2500);
  const prod = await miniProgram.currentPage();
  console.log("详情页路径:", prod.path);
  const hasSel = await prod.$(".giftbox-section");
  console.log("自选器存在:", !!hasSel ? "✅" : "❌");
  if (!hasSel) throw new Error("秋拾详情缺少自选器");
  const thumbnails = await prod.$$(".giftbox-tea-img");
  console.log("茶品缩略图已移除:", thumbnails.length === 0 ? "✅" : "❌");
  if (thumbnails.length) throw new Error("自选搭配仍显示茶品缩略图");

  const teas = await prod.$$(".giftbox-tea");
  const idx = [];
  for (const t of teas) {
    const nm = (await (await t.$(".giftbox-tea-name")).text()).trim();
    idx.push(nm);
  }
  console.log("茶池:", idx.join(" | "));
  const tapPlus = async (name) => {
    const currentTeas = await prod.$$(".giftbox-tea");
    for (const tea of currentTeas) {
      const nameEl = await tea.$(".giftbox-tea-name");
      if (nameEl && (await nameEl.text()).trim() === name) {
        await (await tea.$(".giftbox-step-btn.plus")).tap();
        await prod.waitFor(300);
        return;
      }
    }
    throw new Error(`茶池中未找到：${name}`);
  };
  await tapPlus("红茶");
  await tapPlus("大红袍");
  const price = await prod.$(".detail-price .price");
  const priceText = price ? (await price.text()).trim() : "?";
  console.log("红茶+大红袍 价格:", priceText, priceText === "¥198" ? "✅" : "❌");
  if (priceText !== "¥198") throw new Error(`秋拾计价异常：${priceText}`);

  await (await prod.$(".cart-action")).tap();
  await prod.waitFor(500);
  const cart = await miniProgram.reLaunch("/pages/cart/index");
  await cart.waitFor(1500);
  const cartNames = await cart.$$(".cart-name");
  const cartTexts = [];
  for (const c of cartNames) cartTexts.push((await c.text()).trim());
  console.log("购物车:", cartTexts.join(" | "));
  if (!cartTexts.some((name) => name.includes("秋拾"))) throw new Error("秋拾未加入购物车");
  const opt = await cart.$(".cart-option");
  if (opt) console.log("自选明细:", (await opt.text()).trim());

  await miniProgram.close();
  console.log("E2E 完成");
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message || e); process.exit(1); });
