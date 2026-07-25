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

function normalizeMenuItems(items) {
  return (items || []).map((item, index) => {
    const unit = item.unit || item.badge || "道";
    const section = item.serviceType === "pot" || unit === "壶" ? "壶茶" : "品饮";
    const teaGroups = getTeaGroups(item);
    const teaChoices = teaGroups.reduce((result, group) => result.concat(group.options), []);
    return Object.assign({}, item, {
      unit,
      section,
      teaGroups,
      teaChoices,
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
