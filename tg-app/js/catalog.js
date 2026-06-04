// catalog.js — данные каталога Pro-Marker
// Чтобы добавить/изменить товар — редактируй объекты в CATALOG ниже.
// Фотографии лежат в папке photos/ относительно index.html.

// ── Названия сезонов для отображения ──────────────────────────────────────
const SEASON = {
  summer: {
    key: 'summer',
    name: 'лето',
    nameAdj: 'Летняя',       // «Летняя коллекция»
    nameIns: 'летом',        // «Доступно летом»
    emoji: '☀️',
    cssClass: 'summer',
  },
  autumn: {
    key: 'autumn',
    name: 'осень',
    nameAdj: 'Осенняя',
    nameIns: 'осенью',
    emoji: '🍂',
    cssClass: 'autumn',
  },
  winter: {
    key: 'winter',
    name: 'зима',
    nameAdj: 'Зимняя',
    nameIns: 'зимой',
    emoji: '❄️',
    cssClass: 'winter',
  },
  spring: {
    key: 'spring',
    name: 'весна',
    nameAdj: 'Весенняя',
    nameIns: 'весной',
    emoji: '🌸',
    cssClass: 'spring',
  },
};

// Определяем текущий сезон по месяцу
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1–12
  if (month >= 3 && month <= 5) return SEASON.spring;
  if (month >= 6 && month <= 8) return SEASON.summer;
  if (month >= 9 && month <= 11) return SEASON.autumn;
  return SEASON.winter;
}

// ── Каталог ────────────────────────────────────────────────────────────────
// IMG_8403–IMG_8416 → стикеры-закладки
// IMG_8384–IMG_8398 (без IMG_8390) → текстовыделители
const CATALOG = {

  highlighters: {
    id: 'highlighters',
    label: 'Текстовыделители',
    shortDesc: '6 маркеров · разные оттенки',
    price: 690,

    // 6 наборов в постоянном каталоге
    regular: [
      { id: 'h-r-1', name: 'Пастельный рассвет',   image: 'photos/IMG_8384.PNG', badge: 'hot' },
      { id: 'h-r-2', name: 'Нежный иней',           image: 'photos/IMG_8385.PNG' },
      { id: 'h-r-3', name: 'Ботанический этюд',     image: 'photos/IMG_8386.PNG', badge: 'week' },
      { id: 'h-r-4', name: 'Акварельный этюд',      image: 'photos/IMG_8387.PNG' },
      { id: 'h-r-5', name: 'Розовый туман',         image: 'photos/IMG_8388.PNG' },
      { id: 'h-r-6', name: 'Лавандовые сны',        image: 'photos/IMG_8389.PNG' },
    ],

    // 8 сезонных наборов (по 2 на сезон)
    seasonal: {
      summer: [
        { id: 'h-s-su1', name: 'Летний бриз',      image: 'photos/IMG_8391.PNG' },
        { id: 'h-s-su2', name: 'Тропический закат', image: 'photos/IMG_8392.PNG' },
      ],
      autumn: [
        { id: 'h-s-au1', name: 'Золотая осень',    image: 'photos/IMG_8393.PNG' },
        { id: 'h-s-au2', name: 'Янтарный дождь',   image: 'photos/IMG_8394.PNG' },
      ],
      winter: [
        { id: 'h-s-wi1', name: 'Морозный узор',    image: 'photos/IMG_8395.PNG' },
        { id: 'h-s-wi2', name: 'Зимний вечер',     image: 'photos/IMG_8396.PNG' },
      ],
      spring: [
        { id: 'h-s-sp1', name: 'Весенний сад',     image: 'photos/IMG_8397.PNG' },
        { id: 'h-s-sp2', name: 'Сакурный цвет',    image: 'photos/IMG_8398.PNG' },
      ],
    },
  },

  stickers: {
    id: 'stickers',
    label: 'Стикеры-закладки',
    shortDesc: '6 пластин · 10 стопок полосок каждая',
    price: 470,

    regular: [
      { id: 's-r-1', name: 'Акварельный сад',   image: 'photos/IMG_8403.PNG', badge: 'hot' },
      { id: 's-r-2', name: 'Пастельные мечты',  image: 'photos/IMG_8404.PNG' },
      { id: 's-r-3', name: 'Лавандовый бриз',   image: 'photos/IMG_8405.PNG', badge: 'week' },
      { id: 's-r-4', name: 'Нежный персик',     image: 'photos/IMG_8406.PNG' },
      { id: 's-r-5', name: 'Мятный свежий',     image: 'photos/IMG_8407.PNG' },
      { id: 's-r-6', name: 'Ванильное небо',    image: 'photos/IMG_8408.PNG' },
    ],

    seasonal: {
      summer: [
        { id: 's-s-su1', name: 'Морской горизонт', image: 'photos/IMG_8409.PNG' },
        { id: 's-s-su2', name: 'Солнечный полдень', image: 'photos/IMG_8410.PNG' },
      ],
      autumn: [
        { id: 's-s-au1', name: 'Кленовый листопад', image: 'photos/IMG_8411.PNG' },
        { id: 's-s-au2', name: 'Тыквенный уют',     image: 'photos/IMG_8412.PNG' },
      ],
      winter: [
        { id: 's-s-wi1', name: 'Снежный вечер',    image: 'photos/IMG_8413.PNG' },
        { id: 's-s-wi2', name: 'Новогодний иней',  image: 'photos/IMG_8414.PNG' },
      ],
      spring: [
        { id: 's-s-sp1', name: 'Цветение вишни',  image: 'photos/IMG_8415.PNG' },
        { id: 's-s-sp2', name: 'Весенний луг',    image: 'photos/IMG_8416.PNG' },
      ],
    },
  },
};

// ── Вспомогательные функции ────────────────────────────────────────────────

// Найти товар по id (во всём каталоге)
function getProductById(id) {
  for (const catKey of Object.keys(CATALOG)) {
    const cat = CATALOG[catKey];
    const base = { price: cat.price, shortDesc: cat.shortDesc, catLabel: cat.label, catKey };

    for (const item of cat.regular) {
      if (item.id === id) return { ...item, ...base, type: 'regular' };
    }
    for (const [season, items] of Object.entries(cat.seasonal)) {
      for (const item of items) {
        if (item.id === id) return { ...item, ...base, type: 'seasonal', season };
      }
    }
  }
  return null;
}

// Собрать все товары категории: активные сезонные / обычные / заблокированные
function getCategoryProducts(catKey) {
  const cat = CATALOG[catKey];
  const cur = getCurrentSeason();

  const seasonalActive = cat.seasonal[cur.key].map(p => ({
    ...p, price: cat.price, shortDesc: cat.shortDesc, catLabel: cat.label, catKey,
    type: 'seasonal', season: cur.key, locked: false,
  }));

  const regular = cat.regular.map(p => ({
    ...p, price: cat.price, shortDesc: cat.shortDesc, catLabel: cat.label, catKey,
    type: 'regular', locked: false,
  }));

  const otherSeasons = Object.entries(cat.seasonal)
    .filter(([s]) => s !== cur.key)
    .flatMap(([s, items]) => items.map(p => ({
      ...p, price: cat.price, shortDesc: cat.shortDesc, catLabel: cat.label, catKey,
      type: 'seasonal', season: s, locked: true,
    })));

  return { seasonalActive, regular, otherSeasons, currentSeason: cur };
}
