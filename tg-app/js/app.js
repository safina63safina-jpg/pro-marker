// app.js — главная логика приложения Pro-Marker
// Управляет навигацией, экранами, интеграцией с Telegram WebApp API.

// ════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ TELEGRAM
// ════════════════════════════════════════════════════════════════

const tg = window.Telegram && window.Telegram.WebApp || null;

if (tg) {
  tg.ready();    // убирает мигание белого экрана
  tg.expand();   // разворачивает на весь экран
  _applyTheme(); // применяет цвета Telegram
  tg.onEvent('themeChanged', _applyTheme);
}

// Яркость цвета по luminance (0 = чёрный, 255 = белый)
function _luma(hex) {
  if (!hex || hex.length < 7) return 255;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function _applyTheme() {
  if (!tg || !tg.themeParams) return;
  const p = tg.themeParams;
  const s = document.documentElement.style;
  const set = (k, v) => v && s.setProperty(k, v);

  // Акцент, текст, подсказки — строго из темы Telegram
  set('--tg-theme-text-color',        p.text_color);
  set('--tg-theme-hint-color',        p.hint_color);
  set('--tg-theme-button-color',      p.button_color);
  set('--tg-theme-button-text-color', p.button_text_color);

  // Фон: в светлой теме используем наш серый, в тёмной — тему Telegram
  const dark = _luma(p.bg_color) < 128;
  s.setProperty('--tg-theme-bg-color',           dark ? p.bg_color           : '#f0f2f5');
  s.setProperty('--tg-theme-secondary-bg-color', dark ? p.secondary_bg_color : '#e5e8ee');
}

// ════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK
// ════════════════════════════════════════════════════════════════

const Haptic = {
  light()   { tg?.HapticFeedback?.impactOccurred('light'); },
  medium()  { tg?.HapticFeedback?.impactOccurred('medium'); },
  success() { tg?.HapticFeedback?.notificationOccurred('success'); },
  warning() { tg?.HapticFeedback?.notificationOccurred('warning'); },
  error()   { tg?.HapticFeedback?.notificationOccurred('error'); },
};

// ════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}

// ════════════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ════════════════════════════════════════════════════════════════

let _curScreen = 'catalog';   // текущий id экрана (без «screen-»)
const _history = [];       // стек для «Назад»

// Кнопка Назад — хранимый обработчик, чтобы не накапливались
let _backHandler = null;
let _backAction  = null; // действие «назад» — всегда, даже без Telegram

function _setBack(fn) {
  _backAction = fn;

  // Внутриприложенческая кнопка — всегда, в любом окружении
  const btn = document.getElementById('app-back-btn');
  if (btn) btn.classList.toggle('visible', !!fn);

  // Нативная кнопка Telegram
  if (!tg) return;
  if (_backHandler) tg.BackButton.offClick(_backHandler);
  _backHandler = fn;
  if (fn) { tg.BackButton.onClick(fn); tg.BackButton.show(); }
  else     { tg.BackButton.hide(); }
}

// Кнопка Главная Telegram
let _mainHandler = null;
function _setMain(text, fn, color) {
  if (!tg) return;
  const btn = tg.MainButton;
  if (_mainHandler) btn.offClick(_mainHandler);
  _mainHandler = fn;
  if (fn) {
    btn.setText(text);
    if (color) btn.setParams({ color, text_color: '#ffffff' });
    else       btn.setParams({ color: tg.themeParams?.button_color || '#2AABEE', text_color: '#ffffff' });
    btn.onClick(fn);
    btn.show();
  } else {
    btn.hide();
  }
}

// Форматирование цены
function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

// ── Переход вперёд ──────────────────────────────────────────────
const App = {

  _currentTab: 'highlighters',
  _currentProduct: null,
  _qty: 1,
  _checkoutStep: 1,

  navigate(screenId, data = {}) {
    if (screenId === _curScreen) return;

    const prevEl = document.getElementById(`screen-${_curScreen}`);
    const nextEl = document.getElementById(`screen-${screenId}`);
    if (!nextEl) return;

    _history.push(_curScreen);
    _curScreen = screenId;

    // Старый уходит влево
    prevEl.classList.add('behind');
    prevEl.classList.remove('active');

    // Новый приходит справа (его transform:translateX(100%) → 0)
    nextEl.classList.add('active');

    setTimeout(() => {
      // Сначала отключаем transition, потом убираем класс — иначе браузер
      // анимирует snap от -28% → 100% и будет видно «прыжок» экрана.
      prevEl.style.transition = 'none';
      prevEl.classList.remove('behind'); // CSS .screen → translateX(100%), мгновенно
      requestAnimationFrame(() => { prevEl.style.transition = ''; });
    }, 290);

    this._prepareScreen(screenId, data);
    this._updateTgUI(screenId);
    this._updateFAB(screenId);
    this._updateNav(screenId);
    Haptic.light();
  },

  // ── Переход назад ───────────────────────────────────────────────
  goBack() {
    if (!_history.length) return;

    const prevId = _history.pop();
    const oldId  = _curScreen;
    _curScreen   = prevId; // Обновляем сразу, чтобы Cart.on() и другие коллбэки видели правильный экран

    const curEl  = document.getElementById(`screen-${oldId}`);
    const prevEl = document.getElementById(`screen-${prevId}`);

    // 1. Без анимации ставим prevEl чуть левее (-28%)
    prevEl.style.transition = 'none';
    prevEl.style.transform  = 'translateX(-28%)';
    prevEl.classList.add('active');

    // 2. getBoundingClientRect — форс-reflow, браузер запоминает -28% как текущее значение
    prevEl.getBoundingClientRect();

    // 3. Включаем transition + убираем inline transform →
    //    CSS .active говорит translateX(0), transition запускается -28% → 0
    prevEl.style.transition = '';
    prevEl.style.transform  = '';

    // 4. Текущий экран уезжает вправо
    curEl.style.transition = 'transform 270ms cubic-bezier(0.4,0,0.2,1)';
    curEl.style.transform  = 'translateX(100%)';

    setTimeout(() => {
      curEl.classList.remove('active');
      curEl.style.transition = '';
      curEl.style.transform  = '';
    }, 290);

    this._updateTgUI(prevId);
    this._updateFAB(prevId);
    this._updateNav(prevId);
    if (prevId === 'catalog') this._renderCatalog(this._currentTab);
    Haptic.light();
  },

  // ── Обработчик кнопки «Назад» ──────────────────────────────────
  handleBack() {
    if (_backAction) _backAction();
  },

  // ── Онбординг ───────────────────────────────────────────────────
  _renderOnboarding() {
    const first = tg?.initDataUnsafe?.user?.first_name;
    const el = document.getElementById('onboard-greeting');
    if (el) el.textContent = first ? `Привет, ${first}! 👋` : 'Привет! 👋';
  },

  startApp() {
    localStorage.setItem('pm_onboarded', '1');
    Haptic.light();

    const onboard = document.getElementById('screen-onboarding');
    const catalog = document.getElementById('screen-catalog');

    onboard.classList.add('behind');
    onboard.classList.remove('active');
    catalog.classList.add('active');
    _curScreen = 'catalog';

    setTimeout(() => {
      onboard.style.transition = 'none';
      onboard.classList.remove('behind');
      requestAnimationFrame(() => { onboard.style.transition = ''; });
    }, 290);

    _setBack(null);
    this._updateFAB('catalog');
    this._updateNav('catalog');
    this._updateNavBadge();

    if (!localStorage.getItem('pm_offer_seen')) {
      const offerEl = document.getElementById('offer-overlay');
      if (offerEl) {
        offerEl.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => offerEl.classList.add('visible')));
      }
    }
  },

  // ── Поделиться ботом ────────────────────────────────────────────
  share() {
    Haptic.light();
    const url  = 'https://t.me/highliter_rus_bot';
    const text = 'Посмотри — маркеры и стикеры-закладки для красивых записей 🎨';
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg) {
      tg.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
  },

  // ── Закрыть оффер-модал ─────────────────────────────────────────
  closeOffer() {
    const overlay = document.getElementById('offer-overlay');
    if (!overlay) return;
    localStorage.setItem('pm_offer_seen', '1');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 320);
    Haptic.light();
  },

  // ── Вернуться на главную после заказа ──────────────────────────
  goHome() {
    _history.length = 0;

    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active', 'behind');
      s.style.cssText = '';
    });
    document.getElementById('screen-catalog').classList.add('active');
    _curScreen = 'catalog';

    document.getElementById('ck-circle').classList.remove('drawn');
    document.getElementById('ck-check').classList.remove('drawn');

    this._renderCatalog(this._currentTab);
    Cart.clear();
    _setBack(null);
    this._updateFAB('catalog');
    this._updateNav('catalog');
    this._updateNavBadge();
    Haptic.light();
  },

  // ── Баннер → каталог с активным сезоном ────────────────────────
  goToCatalogSeason() {
    this.navigate('catalog', { tab: this._currentTab });
  },

  // ════════════════════════════════════════════════════════════════
  // ПОДГОТОВКА ЭКРАНОВ
  // ════════════════════════════════════════════════════════════════

  _prepareScreen(id, data) {
    switch (id) {
      case 'home':     this._prepHome(); break;
      case 'catalog':
        if (data.tab) this._currentTab = data.tab;
        this._renderCatalog(this._currentTab);
        this._syncTabs();
        break;
      case 'product':
        if (data.product) { this._currentProduct = data.product; this._qty = 1; }
        this._renderProduct();
        break;
      case 'cart':     this._renderCart(); break;
      case 'checkout': this._initCheckout(); break;
      case 'success':  this._renderSuccess(); break;
      case 'gift':     this._renderGift(); break;
    }
  },

  // ── Главная ────────────────────────────────────────────────────
  _prepHome() {
    // Приветствие
    const nameEl = document.getElementById('greeting-name');
    const first  = tg?.initDataUnsafe?.user?.first_name;
    nameEl.textContent = first ? `Привет, ${first}! 👋` : 'Привет! 👋';

    // Баннер
    const cur     = getCurrentSeason();
    const banner  = document.getElementById('season-banner');
    banner.className = `season-banner ${cur.cssClass}`;
    document.getElementById('banner-emoji').textContent = cur.emoji;
    document.getElementById('banner-title').textContent = `${cur.nameAdj} коллекция`;
  },

  // ── Каталог ────────────────────────────────────────────────────
  switchTab(btn) {
    this._currentTab = btn.dataset.tab;
    this._syncTabs();
    this._renderCatalog(this._currentTab);
    Haptic.light();
  },

  _syncTabs() {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === this._currentTab)
    );
  },

  _renderCatalog(catKey) {
    const titleEl = document.getElementById('catalog-title');
    if (titleEl) titleEl.textContent = catKey === 'highlighters' ? 'Текстовыделители' : 'Стикеры-закладки';
    const body = document.getElementById('catalog-body');
    const { seasonalActive, regular, otherSeasons, currentSeason } = getCategoryProducts(catKey);
    const cur = currentSeason;

    body.innerHTML =
      // Секция 1: сезонные активные — выделена цветом сезона
      `<div class="seasonal-section ${cur.cssClass}">
         <div class="section-label">${cur.emoji} Сезонная коллекция · ${cur.name}</div>
         <div class="product-grid" id="grid-seasonal">${seasonalActive.map(p => this._cardHTML(p)).join('')}</div>
       </div>` +

      // Секция 2: постоянный каталог
      `<div class="section-label">✨ Классика</div>
       <div class="product-grid">${regular.map(p => this._cardHTML(p)).join('')}</div>` +

      // Секция 3: заблокированные
      `<div class="section-label">🔒 Другие сезоны</div>
       <div class="product-grid">${otherSeasons.map(p => this._cardHTML(p)).join('')}</div>`;

    // Стаггер-появление: первые 6 карточек вылетают сразу, остальные — при скролле
    if (this._catalogObserver) {
      this._catalogObserver.disconnect();
      this._catalogObserver = null;
    }

    body.querySelectorAll('.product-card').forEach((card, i) => {
      if (i < 6) {
        card.style.setProperty('--card-delay', (i * 30) + 'ms');
        card.classList.add('card-fresh');
        card.addEventListener('animationend', () => card.classList.remove('card-fresh'), { once: true });
      } else {
        card.classList.add('card-offscreen');
      }
    });

    this._catalogObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const card = entry.target;
        card.classList.remove('card-offscreen');
        card.classList.add('card-scroll-in');
        card.addEventListener('animationend', () => card.classList.remove('card-scroll-in'), { once: true });
        this._catalogObserver.unobserve(card);
      });
    }, { threshold: 0.08 });

    body.querySelectorAll('.product-card.card-offscreen').forEach(card => {
      this._catalogObserver.observe(card);
    });

    // Навесить события
    body.querySelectorAll('.product-card:not(.locked)').forEach(card => {
      // Тактильная press-анимация (игнорируем нажатия на кнопки корзины)
      const press   = (e) => {
        if (e.target.closest('.card-add-btn, .card-qty-btn, .card-qty-wrap')) return;
        card.classList.add('pressed'); Haptic.light();
      };
      const release = () => card.classList.remove('pressed');
      card.addEventListener('touchstart', press,   { passive: true });
      card.addEventListener('touchend',   release, { passive: true });
      card.addEventListener('mousedown',  press);
      card.addEventListener('mouseup',    release);
      card.addEventListener('mouseleave', release);

      card.addEventListener('click', () => {
        const product = getProductById(card.dataset.id);
        if (product) this.navigate('product', { product });
      });
    });

    body.querySelectorAll('.product-card.locked').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.add('shaking');
        const s = SEASON[card.dataset.season];
        toast(`Набор появится ${s ? s.nameIns : 'позже'} 🔒`);
        Haptic.warning();
        setTimeout(() => card.classList.remove('shaking'), 420);
      });
    });
  },

  _cardHTML(p) {
    const s     = p.season ? SEASON[p.season] : null;
    let badge   = '';
    if (s && !p.locked)        badge = `<div class="card-badge">${s.emoji} ${s.name}</div>`;
    else if (p.badge === 'hot')  badge = `<div class="card-badge card-badge--hot">🔥 хит продаж</div>`;
    else if (p.badge === 'week') badge = `<div class="card-badge card-badge--week">⭐ лидер недели</div>`;
    const overlay = p.locked
      ? `<div class="locked-overlay">
           <span class="locked-icon">🔒</span>
           <span class="locked-label">Доступно<br>${SEASON[p.season]?.nameIns || ''}</span>
         </div>`
      : '';
    const priceStr = p.locked ? '···' : fmt(p.price);

    let cartCtrl = '';
    if (!p.locked) {
      const cartItem = Cart.items.find(i => i.id === p.id);
      const qty = cartItem ? cartItem.qty : 0;
      cartCtrl = qty === 0
        ? `<button class="card-add-btn" onclick="event.stopPropagation();App._cardAdd('${p.id}')">В корзину</button>`
        : `<div class="card-qty-wrap">
             <button class="card-qty-btn" onclick="event.stopPropagation();App._cardDelta('${p.id}',-1)">−</button>
             <span class="card-qty-val">${qty}</span>
             <button class="card-qty-btn" onclick="event.stopPropagation();App._cardDelta('${p.id}',+1)">+</button>
           </div>`;
    }

    return `
      <div class="product-card${p.locked ? ' locked' : ''}" data-id="${p.id}" data-season="${p.season || ''}">
        <img src="${p.image}" alt="${p.name}" loading="lazy">
        ${badge}${overlay}
        <div class="product-card-info">
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-price">${priceStr}</div>
          ${cartCtrl}
        </div>
      </div>`;
  },

  // ── Карточка товара ────────────────────────────────────────────
  _renderProduct() {
    const p = this._currentProduct;
    if (!p) return;

    document.getElementById('product-img').src  = p.image;
    document.getElementById('product-img').alt  = p.name;
    document.getElementById('product-name').textContent = p.name;
    document.getElementById('product-desc').textContent = p.shortDesc;
    document.getElementById('product-price').textContent = fmt(p.price);

    // Сезонная плашка
    const pill = document.getElementById('product-season-pill');
    if (p.season) {
      const s = SEASON[p.season];
      pill.className = `season-pill ${p.season}`;
      pill.textContent = `${s.emoji} Только ${s.name}`;
      pill.style.display = 'inline-flex';
    } else {
      pill.style.display = 'none';
    }

    this._qty = 1;
    this._updateQty();
  },

  changeQty(delta) {
    const n = this._qty + delta;
    if (n < 1 || n > 10) return;
    this._qty = n;
    this._updateQty();
    Haptic.light();
  },

  _updateQty() {
    document.getElementById('qty-val').textContent   = this._qty;
    const total = this._currentProduct.price * this._qty;
    document.getElementById('product-total').innerHTML =
      `Итого: <strong>${fmt(total)}</strong>`;
    // Обновить MainButton
    if (tg) tg.MainButton.setText(`Добавить в корзину — ${fmt(total)}`);
  },

  _addToCart() {
    Cart.add(this._currentProduct, this._qty);
    toast('✓ Добавлено в корзину');
    Haptic.medium();

    // Кратковременное изменение кнопки на «Добавлено»
    if (tg) {
      tg.MainButton.setParams({ color: '#27AE60', text: '✓ Добавлено' });
      setTimeout(() => {
        tg.MainButton.setParams({
          color: tg.themeParams?.button_color || '#2AABEE',
          text: `Добавить в корзину — ${fmt(this._currentProduct.price * this._qty)}`,
        });
      }, 1100);
    }
  },

  // Fullscreen фото
  openPhoto() {
    if (!this._currentProduct) return;
    const fs = document.getElementById('photo-fs');
    document.getElementById('photo-fs-img').src = this._currentProduct.image;
    fs.classList.add('open');
  },
  closePhoto() { document.getElementById('photo-fs').classList.remove('open'); },

  // ── Корзина ────────────────────────────────────────────────────
  _renderCart() {
    const empty  = document.getElementById('cart-empty');
    const filled = document.getElementById('cart-filled');

    if (!Cart.items.length) {
      empty.style.display  = 'flex';
      filled.style.display = 'none';
      return;
    }

    empty.style.display  = 'none';
    filled.style.display = 'block';

    document.getElementById('cart-list').innerHTML = Cart.items.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <img class="cart-thumb" src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="cart-info">
          <div class="cart-name">${item.name}</div>
          <div class="cart-cat">${item.catLabel}</div>
          <div class="cart-line-total">${fmt(item.price * item.qty)}</div>
        </div>
        <div class="cart-controls">
          <div class="cart-qty">
            <button class="cart-qty-btn" onclick="App._cartDelta('${item.id}',-1)">−</button>
            <span   class="cart-qty-val">${item.qty}</span>
            <button class="cart-qty-btn" onclick="App._cartDelta('${item.id}',+1)">+</button>
          </div>
          <button class="cart-del" onclick="App._cartRemove('${item.id}')">🗑</button>
        </div>
      </div>`).join('');

    document.getElementById('cart-total').textContent = fmt(Cart.total);
  },

  _cartDelta(id, delta) {
    const item = Cart.items.find(i => i.id === id);
    if (item) { Cart.setQty(id, item.qty + delta); this._renderCart(); }
    if (tg && Cart.items.length) tg.MainButton.setText(`Оформить заказ — ${fmt(Cart.total)}`);
    Haptic.light();
  },

  _cartRemove(id) {
    const el = document.querySelector(`.cart-item[data-id="${id}"]`);
    if (el) { el.classList.add('removing'); setTimeout(() => { Cart.remove(id); this._renderCart(); }, 200); }
    else    { Cart.remove(id); this._renderCart(); }
    if (!Cart.items.length && tg) tg.MainButton.hide();
    Haptic.warning();
  },

  // ── Оформление ─────────────────────────────────────────────────
  _initCheckout() {
    this._checkoutStep = 1;
    document.getElementById('form-step-1').style.display = 'block';
    document.getElementById('form-step-2').style.display = 'none';
    document.getElementById('step-1').classList.add('done');
    document.getElementById('step-2').classList.remove('done');

    // Предзаполнить имя
    const nameInput = document.getElementById('input-name');
    if (!nameInput.value && tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      nameInput.value = [u.first_name, u.last_name].filter(Boolean).join(' ');
    }

    this._updateTgUI('checkout');
  },

  nextStep() {
    if (this._checkoutStep === 1) {
      const name    = document.getElementById('input-name').value.trim();
      const address = document.getElementById('input-address').value.trim();

      if (!name) {
        document.getElementById('input-name').classList.add('err');
        toast('Введи имя получателя'); Haptic.error(); return;
      }
      if (!address) {
        document.getElementById('input-address').classList.add('err');
        toast('Введи адрес доставки'); Haptic.error(); return;
      }

      this._checkoutStep = 2;
      document.getElementById('form-step-1').style.display = 'none';
      document.getElementById('form-step-2').style.display = 'block';
      document.getElementById('step-2').classList.add('done');

      // Сводка
      const summary = document.getElementById('order-summary');
      summary.innerHTML =
        `<div class="summary-title">Твой заказ</div>` +
        Cart.items.map(i =>
          `<div class="summary-line"><span>${i.name} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`
        ).join('') +
        `<div class="summary-total">
           <span class="lbl">Итого</span>
           <span class="amt">${fmt(Cart.total)}</span>
         </div>`;

      // MainButton: «Оплатить»
      _setMain(`Оплатить — ${fmt(Cart.total)}`, () => this._submit(), '#27AE60');

      // BackButton: назад на шаг 1
      _setBack(() => {
        this._checkoutStep = 1;
        document.getElementById('form-step-1').style.display = 'block';
        document.getElementById('form-step-2').style.display = 'none';
        document.getElementById('step-2').classList.remove('done');
        _setMain(null, null); // Скрыть MainButton
        _setBack(() => this.goBack());
      });

      document.getElementById('input-phone').focus();
      Haptic.light();

    } else {
      this._submit();
    }
  },

  _submit() {
    const phone = document.getElementById('input-phone').value.trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      document.getElementById('input-phone').classList.add('err');
      toast('Введи корректный номер телефона'); Haptic.error(); return;
    }

    // Собираем данные заказа
    const name    = document.getElementById('input-name').value.trim();
    const address = document.getElementById('input-address').value.trim();
    const orderNo = '#' + (1000 + Math.floor(Math.random() * 9000));

    const itemsText = Cart.items
      .map(i => `  • ${i.name} × ${i.qty} = ${fmt(i.price * i.qty)}`)
      .join('\n');

    // Телеграм-юзер из initData (если есть)
    let buyerInfo = '';
    if (tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      buyerInfo = `\nПокупатель: ${[u.first_name, u.last_name].filter(Boolean).join(' ')}`;
      if (u.username) buyerInfo += ` (@${u.username})`;
    }

    const message =
      `🛒 Новый заказ ${orderNo}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${itemsText}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 Итого: ${fmt(Cart.total)}\n\n` +
      `👤 Получатель: ${name}` +
      `${buyerInfo}\n` +
      `📍 Адрес: ${address}\n` +
      `📞 Телефон: ${phone}`;

    // Отправляем уведомление через Telegram Bot API
    const token  = (typeof CONFIG !== 'undefined') ? CONFIG.BOT_TOKEN     : null;
    const chatId = (typeof CONFIG !== 'undefined') ? CONFIG.OWNER_CHAT_ID : null;

    if (token && chatId && !token.startsWith('ВСТАВЬ')) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      }).catch(() => {
        // Не прерываем пользовательский флоу при ошибке сети
        console.warn('Не удалось отправить уведомление боту');
      });
    } else {
      // CONFIG не заполнен — просто логируем (для разработки)
      console.log('ORDER:', message);
    }

    // Сохраняем прогресс программы лояльности
    const totalSets = Cart.items.reduce((s, i) => s + i.qty, 0);
    this._addGiftProgress(totalSets);

    // Передаём номер заказа на экран успеха
    this._pendingOrderNo = orderNo;
    this.navigate('success');
  },

  // ── Успех ──────────────────────────────────────────────────────
  _renderSuccess() {
    // Номер заказа берём из _submit(), чтобы совпадал с уведомлением боту
    document.getElementById('order-num').textContent =
      this._pendingOrderNo || ('#' + (1000 + Math.floor(Math.random() * 9000)));

    // Запустить SVG-анимацию через 120ms (после появления экрана)
    setTimeout(() => {
      document.getElementById('ck-circle').classList.add('drawn');
      document.getElementById('ck-check').classList.add('drawn');
    }, 120);

    Haptic.success();
  },

  // ════════════════════════════════════════════════════════════════
  // TELEGRAM UI — MainButton + BackButton
  // ════════════════════════════════════════════════════════════════

  _updateTgUI(screenId) {
    if (!tg) return;

    switch (screenId) {
      case 'home':
        _setBack(null);
        _setMain(null, null);
        break;

      case 'catalog':
        _setBack(_history.length > 0 ? () => this.goBack() : null);
        _setMain(null, null);
        break;

      case 'product':
        _setBack(() => this.goBack());
        if (this._currentProduct) {
          _setMain(
            `Добавить в корзину — ${fmt(this._currentProduct.price)}`,
            () => this._addToCart()
          );
        }
        break;

      case 'cart':
        _setBack(() => this.goBack());
        if (Cart.items.length) {
          _setMain(`Оформить заказ — ${fmt(Cart.total)}`, () => this.navigate('checkout'));
        } else {
          _setMain(null, null);
        }
        break;

      case 'checkout':
        _setBack(() => this.goBack());
        _setMain(null, null); // Шаг 1: «Далее» — обычная кнопка
        break;

      case 'success':
        _setBack(null);
        _setMain(null, null);
        break;

      case 'gift':
        _setBack(_history.length > 0 ? () => this.goBack() : null);
        _setMain(null, null);
        break;
    }
  },

  // ════════════════════════════════════════════════════════════════
  // НИЖНЯЯ НАВИГАЦИЯ
  // ════════════════════════════════════════════════════════════════

  navTo(dest) {
    switch (dest) {
      case 'markers':
        if (_curScreen === 'catalog') {
          this._currentTab = 'highlighters';
          this._renderCatalog('highlighters');
          this._updateNav('catalog');
          Haptic.light();
        } else {
          this.navigate('catalog', { tab: 'highlighters' });
        }
        break;
      case 'stickers':
        if (_curScreen === 'catalog') {
          this._currentTab = 'stickers';
          this._renderCatalog('stickers');
          this._updateNav('catalog');
          Haptic.light();
        } else {
          this.navigate('catalog', { tab: 'stickers' });
        }
        break;
      case 'cart':     this.navigate('cart'); break;
      case 'gift':
        if (_curScreen === 'gift') { Haptic.light(); return; }
        this.navigate('gift');
        break;
    }
  },

  _updateNav(screenId) {
    let activeId = null;
    if (screenId === 'catalog' || screenId === 'product') {
      activeId = this._currentTab === 'highlighters' ? 'nav-markers' : 'nav-stickers';
    } else if (screenId === 'cart' || screenId === 'checkout') {
      activeId = 'nav-cart';
    } else if (screenId === 'gift') {
      activeId = 'nav-gift';
    }

    const nav = document.getElementById('bottom-nav');
    if (nav) nav.classList.toggle('hidden', screenId === 'success' || screenId === 'onboarding');

    ['nav-markers', 'nav-stickers', 'nav-cart', 'nav-gift'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === activeId);
    });
  },

  _updateNavBadge() {
    const badge = document.getElementById('nav-badge');
    if (!badge) return;
    const total = Cart.items.reduce((s, i) => s + i.qty, 0);
    badge.textContent = total;
    const showing = total > 0;
    badge.classList.toggle('visible', showing);
    if (showing) {
      badge.classList.remove('pop');
      requestAnimationFrame(() => badge.classList.add('pop'));
    }
  },

  // ════════════════════════════════════════════════════════════════
  // INLINE КОРЗИНА НА КАРТОЧКАХ
  // ════════════════════════════════════════════════════════════════

  _cardAdd(id) {
    const product = getProductById(id);
    if (!product) return;

    const card    = document.querySelector(`.product-card[data-id="${id}"]`);
    const cartNav = document.getElementById('nav-cart');
    if (card && cartNav) this._flyToCart(card.querySelector('img'), cartNav);

    Cart.add(product, 1);
    this._updateCardControl(id);
    Haptic.medium();
  },

  _flyToCart(imgEl, destEl) {
    if (!imgEl || !destEl) return;
    const from = imgEl.getBoundingClientRect();
    const to   = destEl.getBoundingClientRect();

    const fly = document.createElement('img');
    fly.src   = imgEl.src;
    Object.assign(fly.style, {
      position:      'fixed',
      left:          from.left   + 'px',
      top:           from.top    + 'px',
      width:         from.width  + 'px',
      height:        from.height + 'px',
      borderRadius:  '10px',
      objectFit:     'cover',
      pointerEvents: 'none',
      zIndex:        '999',
      transition:    'none',
      willChange:    'transform, opacity',
    });
    document.body.appendChild(fly);

    fly.getBoundingClientRect(); // force reflow

    const dx    = to.left + to.width  / 2 - from.left - from.width  / 2;
    const dy    = to.top  + to.height / 2 - from.top  - from.height / 2;
    const scale = 32 / Math.max(from.width, from.height);

    fly.style.transition = 'transform 500ms cubic-bezier(0.4,0,0.6,1), opacity 360ms ease 150ms';
    fly.style.transform  = `translate(${dx}px, ${dy}px) scale(${scale})`;
    fly.style.opacity    = '0';

    fly.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'transform') return;
      fly.remove();
      this._popCartIcon();
    });
  },

  _popCartIcon() {
    const wrap = document.querySelector('#nav-cart .nav-icon-wrap');
    if (!wrap) return;
    wrap.classList.remove('cart-pop');
    requestAnimationFrame(() => wrap.classList.add('cart-pop'));
    wrap.addEventListener('animationend', () => wrap.classList.remove('cart-pop'), { once: true });
  },

  _cardDelta(id, delta) {
    const item = Cart.items.find(i => i.id === id);
    const cur  = item ? item.qty : 0;
    const next = cur + delta;
    if (next > 10) return;
    if (next <= 0) Cart.remove(id); else Cart.setQty(id, next);
    this._updateCardControl(id);
    Haptic.light();
  },

  _updateCardControl(id) {
    const card = document.querySelector(`.product-card[data-id="${id}"]`);
    if (!card) return;
    const info = card.querySelector('.product-card-info');
    const old  = info.querySelector('.card-add-btn, .card-qty-wrap');
    if (old) old.remove();

    const cartItem = Cart.items.find(i => i.id === id);
    const qty = cartItem ? cartItem.qty : 0;

    info.insertAdjacentHTML('beforeend', qty === 0
      ? `<button class="card-add-btn" onclick="event.stopPropagation();App._cardAdd('${id}')">В корзину</button>`
      : `<div class="card-qty-wrap">
           <button class="card-qty-btn" onclick="event.stopPropagation();App._cardDelta('${id}',-1)">−</button>
           <span class="card-qty-val">${qty}</span>
           <button class="card-qty-btn" onclick="event.stopPropagation();App._cardDelta('${id}',+1)">+</button>
         </div>`
    );
  },

  // ════════════════════════════════════════════════════════════════
  // ПРОГРАММА ЛОЯЛЬНОСТИ (ПОДАРОК)
  // ════════════════════════════════════════════════════════════════

  _getGiftProgress() {
    return Math.min(10, 2 + parseInt(localStorage.getItem('pm_gift') || '0'));
  },

  _addGiftProgress(n) {
    const cur = parseInt(localStorage.getItem('pm_gift') || '0');
    localStorage.setItem('pm_gift', String(cur + n));
  },

  _plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  },

  _renderGift() {
    const STICKER_ICONS = ['✏️', '✏️', '🌟', '🩷', '✨', '💛', '🌸', '🦋', '🎀', '🌺'];
    const STICKER_ROTS  = [-4, 3, -3, 5, -2, 4, -5, 2, -4, 3];
    const STICKER_BG    = [
      'linear-gradient(135deg,#7B61FF,#B5C7FF)',
      'linear-gradient(135deg,#7B61FF,#B5C7FF)',
      'linear-gradient(135deg,#FF7B42,#FFD060)',
      'linear-gradient(135deg,#FF85A1,#FF5E8A)',
      'linear-gradient(135deg,#52B788,#A8D8A8)',
      'linear-gradient(135deg,#FFD060,#FF7B42)',
      'linear-gradient(135deg,#7BD4FF,#2AABEE)',
      'linear-gradient(135deg,#FF7B42,#FF85A1)',
      'linear-gradient(135deg,#B5C7FF,#7B61FF)',
      'linear-gradient(135deg,#A8D8A8,#52B788)',
    ];

    const prog     = this._getGiftProgress();
    const unlocked = prog >= 10;

    document.getElementById('gift-unlocked-banner').style.display = unlocked ? 'block' : 'none';
    document.getElementById('gift-count').textContent = prog + ' / 10';

    const slotsEl = document.getElementById('gift-slots');
    slotsEl.innerHTML = Array.from({ length: 10 }, (_, i) => {
      const isPre    = i < 2;
      const isBought = !isPre && i < prog;
      const filled   = isPre || isBought;
      const rot      = STICKER_ROTS[i];
      const bg       = STICKER_BG[i];
      const icon     = filled ? STICKER_ICONS[i] : '';
      const style    = filled ? `style="--sticker-rot:${rot}deg;--sticker-bg:${bg}"` : '';
      return `<div class="gift-slot${filled ? ' filled' : ''}" ${style}>${icon}</div>`;
    }).join('');

    document.getElementById('gift-progress-fill').style.width = (prog / 10 * 100) + '%';

    const textEl = document.getElementById('gift-progress-text');
    if (unlocked) {
      textEl.textContent  = '🎉 Подарок разблокирован!';
      textEl.style.color  = '#FF7B42';
      textEl.style.fontWeight = '800';
    } else {
      const left = 10 - prog;
      textEl.textContent  = `Ещё ${left} ${this._plural(left, 'набор', 'набора', 'наборов')} до подарка`;
      textEl.style.color  = '';
      textEl.style.fontWeight = '';
    }

    // Наклейки приклеиваются поочерёдно с задержкой
    slotsEl.querySelectorAll('.gift-slot.filled').forEach((slot, i) => {
      slot.style.setProperty('--slot-delay', (150 + i * 75) + 'ms');
      slot.classList.add('sticker-pop');
      slot.addEventListener('animationend', () => slot.classList.remove('sticker-pop'), { once: true });
    });

    // Ежедневник выпрыгивает при входе на экран
    const bookImg = document.getElementById('gift-book-img');
    if (bookImg) {
      bookImg.classList.remove('book-entering', 'book-pressing');
      void bookImg.offsetWidth;
      bookImg.classList.add('book-entering');
      bookImg.addEventListener('animationend', () => bookImg.classList.remove('book-entering'), { once: true });
    }

    // Карточка выпрыгивает при открытии экрана
    setTimeout(() => {
      const cardEl = document.querySelector('#screen-gift .gift-card');
      if (!cardEl) return;
      cardEl.classList.remove('card-entrance');
      void cardEl.offsetWidth;
      cardEl.classList.add('card-entrance');
      cardEl.addEventListener('animationend', () => cardEl.classList.remove('card-entrance'), { once: true });
    }, 60);
  },

  _bookTap(e) {
    Haptic.light();
    const img = document.getElementById('gift-book-img');
    if (!img) return;
    img.classList.remove('book-pressing');
    void img.offsetWidth;
    img.classList.add('book-pressing');
    img.addEventListener('animationend', () => img.classList.remove('book-pressing'), { once: true });

    const wrap = document.getElementById('gift-book-wrap');
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - wrapRect.left;
    const centerPct = Math.max(10, Math.min(90, (cx / wrapRect.width) * 100));

    const HEARTS = ['❤️', '🧡', '💛', '💗', '🩷'];
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('span');
      h.className = 'gift-heart';
      h.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];
      const x   = Math.max(5, Math.min(92, centerPct + (-22 + Math.random() * 44)));
      const sz  = 20 + Math.floor(Math.random() * 14);
      const rot = -28 + Math.random() * 56;
      const dur = 820 + Math.floor(Math.random() * 320);
      const del = i * 85;
      h.style.cssText = `left:${x}%;bottom:60%;--hr:${rot}deg;--hs:${sz}px;--hd:${dur}ms;animation-delay:${del}ms;`;
      wrap.appendChild(h);
      setTimeout(() => h.remove(), dur + del + 120);
    }
  },

  // ════════════════════════════════════════════════════════════════
  // FAB КОРЗИНЫ
  // ════════════════════════════════════════════════════════════════

  _updateFAB(screenId) {
    const fab   = document.getElementById('cart-fab');
    const count = document.getElementById('fab-count');
    const hide  = ['cart', 'checkout', 'success'];

    if (Cart.count > 0 && !hide.includes(screenId)) {
      count.textContent = Cart.count;
      fab.classList.add('visible');
      // Бейдж «прыгает»
      count.classList.remove('pop');
      requestAnimationFrame(() => count.classList.add('pop'));
    } else {
      fab.classList.remove('visible');
    }
  },
};

// ════════════════════════════════════════════════════════════════
// РЕАКЦИЯ НА ИЗМЕНЕНИЯ КОРЗИНЫ
// ════════════════════════════════════════════════════════════════

Cart.on(() => {
  App._updateFAB(_curScreen);
  App._updateNavBadge();

  // Обновить MainButton если открыта корзина
  if (_curScreen === 'cart' && tg) {
    if (Cart.items.length) {
      tg.MainButton.setText(`Оформить заказ — ${fmt(Cart.total)}`);
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }
  }
});

// ════════════════════════════════════════════════════════════════
// FULLSCREEN ФОТО — закрытие свайпом вниз
// ════════════════════════════════════════════════════════════════

let _fsY = 0;
const fsEl = document.getElementById('photo-fs');
fsEl.addEventListener('touchstart', e => { _fsY = e.touches[0].clientY; }, { passive: true });
fsEl.addEventListener('touchend', e => {
  if (e.changedTouches[0].clientY - _fsY > 60) App.closePhoto();
}, { passive: true });

// ════════════════════════════════════════════════════════════════
// УБИРАТЬ КЛАСС .pressed ПРИ ПОТЕРЕ КАСАНИЯ
// ════════════════════════════════════════════════════════════════

document.addEventListener('touchend',    () => {
  document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
}, { passive: true });

document.addEventListener('touchcancel', () => {
  document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
}, { passive: true });

// ════════════════════════════════════════════════════════════════
// УБИРАТЬ КЛАСС .err ПРИ ВВОДЕ
// ════════════════════════════════════════════════════════════════

document.querySelectorAll('.field-input').forEach(input =>
  input.addEventListener('input', () => input.classList.remove('err'))
);

// ════════════════════════════════════════════════════════════════
// СТАРТ
// ════════════════════════════════════════════════════════════════

Cart.load();
App._currentTab = 'highlighters';
App._renderCatalog('highlighters');

if (localStorage.getItem('pm_onboarded')) {
  // Возвращающийся пользователь — мгновенно переключаем на каталог
  const s1 = document.getElementById('screen-onboarding');
  const s2 = document.getElementById('screen-catalog');
  s1.style.transition = 'none';
  s2.style.transition = 'none';
  s1.classList.remove('active');
  s2.classList.add('active');
  _curScreen = 'catalog';
  requestAnimationFrame(() => { s1.style.transition = ''; s2.style.transition = ''; });
  _setBack(null);
  App._updateFAB('catalog');
  App._updateNav('catalog');
  App._updateNavBadge();
  // Оффер если ещё не видел
  if (!localStorage.getItem('pm_offer_seen')) {
    const offerEl = document.getElementById('offer-overlay');
    if (offerEl) {
      offerEl.style.display = 'flex';
      requestAnimationFrame(() => requestAnimationFrame(() => offerEl.classList.add('visible')));
    }
  }
} else {
  // Первый запуск — онбординг
  _curScreen = 'onboarding';
  App._renderOnboarding();
  _setBack(null);
  App._updateNav('onboarding');
}
