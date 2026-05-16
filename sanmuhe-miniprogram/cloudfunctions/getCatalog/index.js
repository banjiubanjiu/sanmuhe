const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function sortCatalog(items) {
  return items.sort((a, b) => {
    const sortA = Number(a.sort || 9999);
    const sortB = Number(b.sort || 9999);
    if (sortA !== sortB) {
      return sortA - sortB;
    }
    return String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""), "zh-Hans-CN");
  });
}

function withInventory(item) {
  if (!item || item.stock === undefined || item.stock === null || item.stock === "") {
    return item;
  }
  const stock = Math.max(0, Number(item.stock) || 0);
  const lockedStock = Math.max(0, Number(item.lockedStock) || 0);
  const soldStock = Math.max(0, Number(item.soldStock) || 0);
  return Object.assign({}, item, {
    stock,
    lockedStock,
    soldStock,
    availableStock: Math.max(0, stock - lockedStock - soldStock)
  });
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    // Existing collections are expected.
  }
}

async function getCollectionData(collection) {
  await ensureCollection(collection);
  try {
    const where = collection === "events"
      ? { visible: true, deleted: false }
      : { visible: true };
    const result = await db.collection(collection).where(where).limit(100).get();
    return sortCatalog((result.data || []).map(withInventory));
  } catch (error) {
    return [];
  }
}

async function getContentBlocks() {
  try {
    await db.createCollection("content_blocks");
  } catch (error) {
    // Existing collections are expected.
  }
  try {
    const result = await db.collection("content_blocks")
      .where({ visible: true })
      .orderBy("sort", "asc")
      .limit(50)
      .get();
    return result.data || [];
  } catch (error) {
    return [];
  }
}

async function getStoreSettings() {
  try {
    const result = await db.collection("store_settings").where({ key: "store" }).limit(1).get();
    return result.data && result.data[0] ? result.data[0] : null;
  } catch (error) {
    return null;
  }
}

exports.main = async () => {
  const [cloudDrinks, cloudTeaProducts, cloudRooms, cloudEvents, contentBlocks, storeSettings] = await Promise.all([
    getCollectionData("drinks"),
    getCollectionData("tea_products"),
    getCollectionData("rooms"),
    getCollectionData("events"),
    getContentBlocks(),
    getStoreSettings()
  ]);

  return {
    ok: true,
    catalog: {
      drinks: cloudDrinks,
      teaProducts: cloudTeaProducts,
      rooms: cloudRooms,
      events: cloudEvents,
      content: {
        homeSlides: contentBlocks.filter((item) => item.type === "home_carousel"),
        blocks: contentBlocks
      },
      settings: storeSettings
    }
  };
};
