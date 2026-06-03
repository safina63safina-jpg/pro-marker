// cart.js — управление корзиной
// Корзина хранится в localStorage — не пропадёт при закрытии приложения.
// Все изменения сохраняются автоматически и уведомляют подписчиков через Cart.on().

const CART_KEY = 'pro_marker_cart_v1';

const Cart = {
  items: [], // [{ id, name, price, image, catLabel, qty }]

  // Загрузить из localStorage
  load() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      this.items = raw ? JSON.parse(raw) : [];
    } catch {
      this.items = [];
    }
  },

  // Сохранить в localStorage и уведомить подписчиков
  save() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(this.items));
    } catch { /* QuotaExceeded — игнорируем */ }
    this._notify();
  },

  // Добавить товар (или увеличить количество, если уже есть)
  add(product, qty = 1) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, 10);
    } else {
      this.items.push({
        id:       product.id,
        name:     product.name,
        price:    product.price,
        image:    product.image,
        catLabel: product.catLabel,
        qty,
      });
    }
    this.save();
  },

  // Изменить количество позиции (qty ≤ 0 → удалить)
  setQty(id, qty) {
    if (qty <= 0) { this.remove(id); return; }
    const item = this.items.find(i => i.id === id);
    if (item) { item.qty = Math.min(qty, 10); this.save(); }
  },

  // Удалить позицию
  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
  },

  // Очистить корзину
  clear() {
    this.items = [];
    this.save();
  },

  // Количество единиц товаров (не позиций)
  get count() {
    return this.items.reduce((s, i) => s + i.qty, 0);
  },

  // Итоговая сумма
  get total() {
    return this.items.reduce((s, i) => s + i.price * i.qty, 0);
  },

  // Подписка на изменения
  _listeners: [],
  on(cb) { this._listeners.push(cb); },
  _notify() { this._listeners.forEach(cb => cb()); },
};
