const { resolveCloudImage } = require("../config/assets");

const FAVORITES_KEY = "sanmuhe_favorites";

function getFavorites() {
  return wx.getStorageSync(FAVORITES_KEY) || [];
}

function setFavorites(favorites) {
  wx.setStorageSync(FAVORITES_KEY, favorites);
}

function isFavorite(id) {
  return getFavorites().some((item) => item.id === id);
}

function toggleFavorite(product) {
  const favorites = getFavorites();
  const index = favorites.findIndex((item) => item.id === product.id);

  if (index >= 0) {
    favorites.splice(index, 1);
    setFavorites(favorites);
    return {
      favored: false,
      favorites
    };
  }

  const next = {
    id: product.id,
    name: product.name,
    price: product.price,
    unit: product.unit,
    category: product.category,
    image: resolveCloudImage(product.thumb || product.image),
    savedAt: Date.now()
  };
  favorites.unshift(next);
  setFavorites(favorites.slice(0, 30));

  return {
    favored: true,
    favorites: getFavorites()
  };
}

module.exports = {
  getFavorites,
  isFavorite,
  toggleFavorite
};
