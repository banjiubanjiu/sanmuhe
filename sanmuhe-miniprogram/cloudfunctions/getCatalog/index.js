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
  if (!item) {
    return item;
  }
  let next = item;
  if (Array.isArray(item.specs) && item.specs.length) {
    const specs = item.specs.map((spec) => {
      if (!spec || typeof spec !== "object") return spec;
      if (spec.stock === undefined || spec.stock === null || spec.stock === "") {
        return spec;
      }
      const stock = Math.max(0, Number(spec.stock) || 0);
      const lockedStock = Math.max(0, Number(spec.lockedStock) || 0);
      const soldStock = Math.max(0, Number(spec.soldStock) || 0);
      return Object.assign({}, spec, {
        stock,
        lockedStock,
        soldStock,
        availableStock: Math.max(0, stock - lockedStock - soldStock)
      });
    });
    const hasSpecStock = specs.some((spec) => spec && spec.stock !== undefined && spec.stock !== null && spec.stock !== "");
    if (hasSpecStock) {
      const totalStock = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.stock) || 0), 0);
      const totalLocked = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.lockedStock) || 0), 0);
      const totalSold = specs.reduce((sum, spec) => sum + Math.max(0, Number(spec && spec.soldStock) || 0), 0);
      next = Object.assign({}, item, {
        specs,
        stock: totalStock,
        lockedStock: totalLocked,
        soldStock: totalSold
      });
    } else {
      next = Object.assign({}, item, { specs });
    }
  }
  if (next.stock === undefined || next.stock === null || next.stock === "") {
    return next;
  }
  const stock = Math.max(0, Number(next.stock) || 0);
  const lockedStock = Math.max(0, Number(next.lockedStock) || 0);
  const soldStock = Math.max(0, Number(next.soldStock) || 0);
  return Object.assign({}, next, {
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
    // 软删除（removed）的资料不进小程序目录
    const items = (result.data || []).filter((item) => {
      if (item.removed === true) return false;
      // 与 listEvents 一致：已取消不进前台目录
      if (collection === "events" && String(item.status || "").trim() === "已取消") {
        return false;
      }
      return true;
    }).map(withInventory);
    return sortCatalog(items);
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

async function getProductCategories() {
  await ensureCollection("product_categories");
  try {
    const result = await db.collection("product_categories")
      .where({ visible: true })
      .limit(100)
      .get();
    const items = (result.data || []).filter((item) => item.removed !== true);
    return sortCatalog(items);
  } catch (error) {
    return [];
  }
}

function isLegacyDrinkTier(item) {
  return !!(item && Array.isArray(item.teaGroups) && item.teaGroups.length && !item.categoryId);
}

function isDrinkTeaItem(item) {
  if (!item || isLegacyDrinkTier(item)) return false;
  return !!(item.categoryId || (item.category && !Array.isArray(item.teaGroups)));
}

/**
 * 堂饮菜单：分类（档位）= 初见/知味…；drinks 集合存档位下茶品。
 * 组装成点单页仍使用的「档位 + teaGroups」结构，id 保持 drink-001 便于下单。
 */
function assembleDrinkMenu(productCategories, drinkRows) {
  const tiers = sortCatalog(
    (productCategories || []).filter((item) => item && item.channel === "drinks")
  );
  const teaItems = sortCatalog((drinkRows || []).filter(isDrinkTeaItem));
  const legacy = sortCatalog((drinkRows || []).filter(isLegacyDrinkTier));

  if (tiers.length && teaItems.length) {
    return tiers.map((tier) => {
      const teas = teaItems.filter(
        (item) => item.categoryId === tier.id || item.category === tier.name
      );
      const groupOrder = [];
      const groupMap = {};
      teas.forEach((tea) => {
        const groupName = String(tea.groupName || tea.unit || "本席可选").trim() || "本席可选";
        if (!groupMap[groupName]) {
          groupMap[groupName] = [];
          groupOrder.push(groupName);
        }
        groupMap[groupName].push(tea.name);
      });
      const teaGroups = groupOrder.map((name) => ({
        name,
        options: groupMap[name]
      }));
      const unit = tier.unit || tier.badge || "道";
      return {
        id: tier.id,
        name: tier.name,
        category: tier.name,
        serviceType: tier.serviceType || (unit === "壶" ? "pot" : "tasting"),
        price: Math.max(0, Number(tier.price) || 0),
        unit,
        badge: tier.badge || unit,
        tagline: tier.tagline || "",
        brewStyle: tier.brewStyle || "热泡茶",
        color: tier.color || "",
        image: tier.image || "",
        thumb: tier.thumb || tier.image || "",
        notes: teas.map((item) => item.name).filter(Boolean).join(" / "),
        teaGroups,
        teaItems: teas.map((item) => ({
          id: item.id,
          name: item.name,
          groupName: item.groupName || "",
          image: item.image || item.thumb || "",
          subtitle: item.subtitle || ""
        })),
        visible: true,
        sort: Number(tier.sort) || 0
      };
    });
  }

  if (legacy.length) {
    return legacy;
  }

  if (tiers.length) {
    return tiers.map((tier) => {
      const unit = tier.unit || tier.badge || "道";
      return {
        id: tier.id,
        name: tier.name,
        category: tier.name,
        serviceType: tier.serviceType || (unit === "壶" ? "pot" : "tasting"),
        price: Math.max(0, Number(tier.price) || 0),
        unit,
        badge: tier.badge || unit,
        tagline: tier.tagline || "",
        brewStyle: tier.brewStyle || "热泡茶",
        color: tier.color || "",
        image: tier.image || "",
        teaGroups: [],
        notes: "",
        visible: true,
        sort: Number(tier.sort) || 0
      };
    });
  }

  return [];
}

exports.main = async (event = {}) => {
  if (event.action === "health") {
    return { ok: true, name: "getCatalog" };
  }

  const [cloudDrinks, cloudTeaProducts, cloudRooms, cloudEvents, contentBlocks, storeSettings, productCategories] = await Promise.all([
    getCollectionData("drinks"),
    getCollectionData("tea_products"),
    getCollectionData("rooms"),
    getCollectionData("events"),
    getContentBlocks(),
    getStoreSettings(),
    getProductCategories()
  ]);

  return {
    ok: true,
    catalog: {
      drinks: assembleDrinkMenu(productCategories, cloudDrinks),
      teaProducts: cloudTeaProducts,
      // 茶室列表以后台 rooms 集合为准（可见且未软删），前台不再硬编码条数
      rooms: cloudRooms,
      events: cloudEvents,
      productCategories,
      content: {
        homeSlides: contentBlocks.filter((item) => item.type === "home_carousel"),
        blocks: contentBlocks
      },
      settings: storeSettings
    }
  };
};
