function cleanText(value) {
  return String(value || "").trim();
}

function splitChoices(value) {
  return cleanText(value)
    .split(/[\/、]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizeStructuredGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups.map((group) => {
    const name = cleanText(group && (group.name || group.label));
    const options = Array.isArray(group && group.options)
      ? group.options.map((item) => cleanText(item && item.name ? item.name : item)).filter(Boolean)
      : [];
    return {
      name: name || "本席可选",
      options
    };
  }).filter((group) => group.options.length);
}

function parseGroupsFromNotes(notes, unit) {
  const segments = cleanText(notes).split(/[；;]/).map((item) => cleanText(item)).filter(Boolean);
  return segments.map((segment) => {
    const match = segment.match(/^([^：:]+)[：:](.+)$/);
    if (match) {
      return {
        name: cleanText(match[1]),
        options: splitChoices(match[2])
      };
    }
    return {
      name: unit === "壶" ? "本壶可选" : "本席可选",
      options: splitChoices(segment)
    };
  }).filter((group) => group.options.length);
}

function getTeaGroups(item) {
  const structured = normalizeStructuredGroups(item && item.teaGroups);
  if (structured.length) {
    return structured;
  }
  return parseGroupsFromNotes(item && item.notes, item && (item.unit || item.badge));
}

function getTeaChoices(item) {
  return getTeaGroups(item).reduce((result, group) => result.concat(group.options), []);
}

function getSelectionHint(teaGroups, teaChoices) {
  if (teaChoices.length <= 1) {
    return teaChoices[0] || "本款茶品";
  }
  if (teaGroups.length > 1) {
    return `${teaGroups.map((group) => group.name).join(" · ")}，共${teaChoices.length}款可选`;
  }
  return `${teaChoices[0]}等${teaChoices.length}款可选`;
}

const DEFAULT_PACKAGE_TAGLINES = {
  "初见": "初识好茶，邂逅本真之味",
  "知味": "细品层次，感知茶中真味",
  "臻藏": "臻选名岩，珍藏一味",
  "烹茶暖叙": "一壶暖茶，从容叙旧",
  "芳茗润茶": "芳华入盏，温润于心"
};

// 堂饮茶款展示信息：侧栏点档位后右侧卡片用
const TEA_OPTION_META = {
  "古树红茶": {
    category: "红茶",
    image: "/assets/images/product-tea-001-organic-black.jpg",
    subtitle: "花果蜜香 · 汤色红亮",
    tags: ["花香", "甘甜", "醇厚"]
  },
  "清香单丛": {
    category: "乌龙茶",
    image: "/assets/images/product-tea-010-gongxiang.jpg",
    subtitle: "清香高扬 · 鲜爽回甘",
    tags: ["清香", "花香", "鲜爽"]
  },
  "留白白茶": {
    category: "白茶",
    image: "/assets/images/product-tea-004-mtn-white.jpg",
    subtitle: "清甜干净 · 余韵绵长",
    tags: ["清润", "醇和", "余韵"]
  },
  "顺景普洱": {
    category: "普洱茶",
    image: "/assets/images/product-tea-008-puer.jpg",
    subtitle: "陈韵沉稳 · 汤感醇厚",
    tags: ["醇厚", "木香", "回甘"]
  },
  "花香大红袍": {
    category: "岩茶",
    image: "/assets/images/product-tea-007-floral-dhp.jpg",
    subtitle: "花果馥郁 · 岩韵分明",
    tags: ["花香", "岩韵", "回甘"]
  },
  "十五年陈茶": {
    category: "岩茶",
    image: "/assets/images/product-tea-006-aged-rock.jpg",
    subtitle: "药香转参 · 汤水绵柔",
    tags: ["陈韵", "药香", "绵柔"]
  },
  "有机红茶": {
    category: "红茶",
    image: "/assets/images/product-tea-001-organic-black.jpg",
    subtitle: "花果蜜香 · 水路细腻",
    tags: ["有机", "花果", "甘甜"]
  },
  "正山小种": {
    category: "红茶",
    image: "/assets/images/product-tea-002-wild-black.jpg",
    subtitle: "松烟底韵 · 甜润顺口",
    tags: ["红茶", "甜润", "顺口"]
  },
  "荒野蜜兰": {
    category: "单丛",
    image: "/assets/images/product-tea-011-mielan.jpg",
    subtitle: "蜜甜浓郁 · 兰香清雅",
    tags: ["蜜兰", "回甘", "耐泡"]
  },
  "贡香": {
    category: "单丛",
    image: "/assets/images/product-tea-010-gongxiang.jpg",
    subtitle: "清香纯粹 · 夏日鲜爽",
    tags: ["清香", "鲜雅", "甘甜"]
  },
  "高山蜜兰": {
    category: "单丛",
    image: "/assets/images/product-tea-011-mielan.jpg",
    subtitle: "高山蜜韵 · 汤感稠糯",
    tags: ["高山", "蜜香", "稠糯"]
  },
  "马头岩肉桂": {
    category: "岩茶",
    image: "/assets/images/product-tea-005-rougui.jpg",
    subtitle: "辛锐桂皮香 · 喉韵清凉",
    tags: ["名岩", "辛锐", "回甘"]
  },
  "老白茶": {
    category: "白茶",
    image: "/assets/images/product-tea-003-aged-white.jpg",
    subtitle: "醇润陈香 · 温和不伤胃",
    tags: ["陈香", "醇润", "煮饮"]
  },
  "熟普": {
    category: "普洱茶",
    image: "/assets/images/product-tea-008-puer.jpg",
    subtitle: "温润醇和 · 一壶从容",
    tags: ["醇和", "温润", "耐泡"]
  },
  "养生茶": {
    category: "花茶",
    image: "/assets/images/product-drink-004-pengcha.jpg",
    subtitle: "温和调养 · 宜日常暖饮",
    tags: ["温和", "暖饮", "日常"]
  },
  "玫瑰花茶": {
    category: "花茶",
    image: "/assets/images/product-drink-005-fangming.jpg",
    subtitle: "玫瑰清芳 · 温润于心",
    tags: ["花香", "清甜", "润燥"]
  }
};

const CATEGORY_FALLBACK = {
  "岩茶": "岩茶",
  "红茶": "红茶",
  "单丛": "乌龙茶",
  "白茶": "白茶",
  "普洱茶": "普洱茶",
  "壶茶": "壶茶",
  "本席可选": "茶品",
  "本席茶品": "茶品",
  "本壶可选": "壶茶",
  "本壶茶品": "壶茶"
};

function inferCategory(name, groupName) {
  const meta = TEA_OPTION_META[name];
  if (meta && meta.category) {
    return meta.category;
  }
  const mapped = CATEGORY_FALLBACK[cleanText(groupName)];
  if (mapped && mapped !== "茶品") {
    return mapped;
  }
  if (/红茶|小种/.test(name)) return "红茶";
  if (/白茶|寿眉|白毫/.test(name)) return "白茶";
  if (/普洱|熟普|生普|归藏/.test(name)) return "普洱茶";
  if (/单丛|蜜兰|贡香|栀|芝兰|大红袍|肉桂|岩/.test(name)) return /大红袍|肉桂|岩|陈茶/.test(name) ? "岩茶" : "乌龙茶";
  if (/花|玫瑰|养生/.test(name)) return "花茶";
  return "茶品";
}

function shortTagsFromText(text, max = 3) {
  const parts = cleanText(text)
    .split(/[，,、。；;\s·/]+/)
    .map((item) => cleanText(item))
    .filter((item) => item.length >= 2 && item.length <= 4);
  const unique = [];
  parts.forEach((item) => {
    if (unique.indexOf(item) < 0) {
      unique.push(item);
    }
  });
  return unique.slice(0, max);
}

function buildTeaOptions(item, teaGroups) {
  const fallbackImage = item.image || "/assets/images/product-drink-001-chujian.jpg";
  return teaGroups.reduce((result, group) => {
    group.options.forEach((name) => {
      const meta = TEA_OPTION_META[name] || {};
      const category = inferCategory(name, group.name);
      const subtitle = meta.subtitle
        || (group.name && group.name.indexOf("本") !== 0 ? `${group.name}可选` : "本席精选茶款");
      const tags = Array.isArray(meta.tags) && meta.tags.length
        ? meta.tags
        : shortTagsFromText(subtitle || category, 3);
      result.push({
        name,
        category,
        image: meta.image || fallbackImage,
        subtitle,
        tags: tags.length ? tags : [category],
        groupName: group.name
      });
    });
    return result;
  }, []);
}

function normalizeMenuItems(items) {
  return (items || []).map((item, index) => {
    const unit = item.unit || item.badge || "道";
    const section = item.serviceType === "pot" || unit === "壶" ? "壶茶" : "品饮";
    const teaGroups = getTeaGroups(item);
    const teaChoices = teaGroups.reduce((result, group) => result.concat(group.options), []);
    const teaOptions = buildTeaOptions(item, teaGroups);
    const tagline = cleanText(item.tagline)
      || DEFAULT_PACKAGE_TAGLINES[item.name]
      || (unit === "壶" ? "一壶清茶，慢慢叙话" : "本席精选，细品一杯");
    const brewStyle = cleanText(item.brewStyle) || "热泡茶";
    return Object.assign({}, item, {
      unit,
      section,
      teaGroups,
      teaChoices,
      teaOptions,
      tagline,
      brewStyle,
      sidePriceLabel: `${item.price}元/${unit}`,
      menuIndex: String(index + 1).padStart(2, "0"),
      selectionHint: getSelectionHint(teaGroups, teaChoices)
    });
  });
}

module.exports = {
  getTeaChoices,
  getTeaGroups,
  normalizeMenuItems,
  parseGroupsFromNotes
};
