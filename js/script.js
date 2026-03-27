
const HAT_SIZES = ['6 7/8','7','7 1/8','7 1/4','7 3/8','7 1/2','7 5/8','7 3/4','7 7/8','8'];
const STORE_CONFIG = window.EL_CACHUCHON_CONFIG || {};
const PAYPAL_CONFIG = STORE_CONFIG.paypal || {};
const BASE_PRODUCTS = Array.isArray(window.EL_CACHUCHON_PRODUCTS) ? window.EL_CACHUCHON_PRODUCTS : [];
const RUNTIME_INVENTORY_KEY = 'elcachuchon_runtime_inventory_v1';
const CART_KEY = 'elcachuchon_cart_v1';

const state = {
  selectedSize: 'All',
  selectedTeam: 'All',
  searchQuery: '',
  cart: loadCart(),
  currentProduct: null,
  currentGalleryIndex: 0,
  currentModalSize: null,
  paypalLoaded: false,
  paypalRenderedForSignature: ''
};

const currentSizeLabel = document.getElementById('currentSizeLabel');
const resultsLabel = document.getElementById('resultsLabel');
const productSearch = document.getElementById('productSearch');
const teamFilterGrid = document.getElementById('teamFilterGrid');
const featuredCollections = document.getElementById('featuredCollections');
const productGrid = document.getElementById('productGrid');
const cartCount = document.getElementById('cartCount');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const cartDrawer = document.getElementById('cartDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const productModal = document.getElementById('productModal');
const modalTitle = document.getElementById('modalTitle');
const modalBadge = document.getElementById('modalBadge');
const modalPrice = document.getElementById('modalPrice');
const modalStock = document.getElementById('modalStock');
const modalDescription = document.getElementById('modalDescription');
const modalMainImage = document.getElementById('modalMainImage');
const modalThumbs = document.getElementById('modalThumbs');
const modalSizes = document.getElementById('modalSizes');
const modalDetails = document.getElementById('modalDetails');
const modalActions = document.getElementById('modalActions');
const modalFileName = document.getElementById('modalFileName');
const thankYouModal = document.getElementById('thankYouModal');
const toastEl = document.getElementById('toast');
const paypalWrap = document.getElementById('paypalButtonWrap');
const paypalContainer = document.getElementById('paypal-button-container');
const paypalMessage = document.getElementById('paypalMessage');

const products = BASE_PRODUCTS
  .map(product => hydrateProduct(product))
  .filter(product => product.enabled !== false);

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function getRuntimeInventory() {
  try {
    return JSON.parse(localStorage.getItem(RUNTIME_INVENTORY_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveRuntimeInventory(data) {
  localStorage.setItem(RUNTIME_INVENTORY_KEY, JSON.stringify(data));
}

function hydrateProduct(product) {
  const override = (STORE_CONFIG.products && STORE_CONFIG.products[product.id]) || {};
  const defaultStockBySize = STORE_CONFIG.defaultStockBySize || Object.fromEntries(HAT_SIZES.map(size => [size, 1]));
  const runtimeInventory = getRuntimeInventory()[product.id] || {};
  const configuredInventory = override.inventory || {};
  const sizes = {};

  HAT_SIZES.forEach(size => {
    const baseValue = Number.isFinite(configuredInventory[size]) ? configuredInventory[size] :
      (Number.isFinite(defaultStockBySize[size]) ? defaultStockBySize[size] : 0);
    sizes[size] = Number.isFinite(runtimeInventory[size]) ? runtimeInventory[size] : baseValue;
  });

  if (override.soldOut) {
    HAT_SIZES.forEach(size => { sizes[size] = 0; });
  }

  return {
    ...product,
    shortName: override.shortName || product.shortName || product.name,
    name: override.name || product.name,
    badge: override.badge || product.badge || STORE_CONFIG.defaultBadge || 'Premium fitted',
    price: Number.isFinite(override.price) ? override.price : (Number.isFinite(product.price) ? product.price : (STORE_CONFIG.defaultPrice || 60)),
    description: override.description || product.description,
    details: { ...product.details, ...(override.details || {}) },
    sizes,
    enabled: override.enabled !== false
  };
}

function refreshProductsFromConfig() {
  const updated = BASE_PRODUCTS.map(hydrateProduct).filter(product => product.enabled !== false);
  products.splice(0, products.length, ...updated);
}

function totalStock(product) {
  return HAT_SIZES.reduce((sum, size) => sum + (product.sizes[size] || 0), 0);
}

function cartQtyFor(productId, size) {
  return state.cart.filter(item => item.productId === productId && item.size === size).reduce((sum, item) => sum + item.qty, 0);
}

function availableStockForPurchase(product, size) {
  return Math.max(0, (product.sizes[size] || 0) - cartQtyFor(product.id, size));
}

function sizeAvailable(product, size) {
  return availableStockForPurchase(product, size) > 0;
}

function productStockLabel(product) {
  const total = totalStock(product);
  if (total === 0) return 'Sold out';
  if (total <= 3) return 'Low stock';
  return 'In stock';
}


const KNOWN_TEAMS = [
  'Atlanta Braves','Baltimore Orioles','Boston Red Sox','Brooklyn Dodgers','Chicago Cubs','Cleveland Indians',
  'Houston Astros','Los Angeles Dodgers','Milwaukee Brewers','Minnesota Twins','New York Yankees','New York Mets',
  'Oakland Athletics','Philadelphia Phillies','Pittsburgh Pirates','San Francisco Giants','Seattle Mariners','Texas Rangers'
];

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function inferTeam(product) {
  const rawTeam = product?.details?.Team;
  if (rawTeam) {
    const normalizedTeam = normalizeText(rawTeam);
    const directTeam = KNOWN_TEAMS.find(team => normalizeText(team) === normalizedTeam);
    if (directTeam) return directTeam;
  }

  const haystack = normalizeText([
    product.name,
    product.shortName,
    product.folder,
    product?.details?.Collection,
    product?.details?.Team
  ].filter(Boolean).join(' '));

  const matched = KNOWN_TEAMS.find(team => haystack.includes(normalizeText(team)));
  if (matched) return matched;

  return 'Other';
}

function teamOptions() {
  const map = new Map();
  products.forEach(product => {
    const team = inferTeam(product);
    map.set(team, (map.get(team) || 0) + 1);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function searchBlob(product) {
  return normalizeText([
    product.name,
    product.shortName,
    product.folder,
    ...Object.values(product.details || {})
  ].join(' '));
}

function updateResultsLabel(items) {
  const sizePart = state.selectedSize === 'All' ? '' : ` in size ${state.selectedSize}`;
  const teamPart = state.selectedTeam === 'All' ? '' : ` · ${state.selectedTeam}`;
  const queryPart = state.searchQuery ? ` · matching “${state.searchQuery}”` : '';
  resultsLabel.textContent = `Showing ${items.length} hats${sizePart}${teamPart}${queryPart}`;
}

function setTeamFilter(team) {
  state.selectedTeam = team;
  renderTeamFilters();
  renderFeaturedCollections();
  renderProductGrid();
}

function setSearchQuery(query) {
  state.searchQuery = String(query || '').trim().toLowerCase();
  renderProductGrid();
}

function renderTeamFilters() {
  if (!teamFilterGrid) return;
  const teams = teamOptions();
  teamFilterGrid.innerHTML = [
    `<button class="team-chip ${state.selectedTeam === 'All' ? 'is-active' : ''}" type="button" onclick="setTeamFilterValue('All')">All</button>`,
    ...teams.map(([team]) => `<button class="team-chip ${state.selectedTeam === team ? 'is-active' : ''}" type="button" onclick="setTeamFilterValue(${JSON.stringify(team)})">${team}</button>`)
  ].join('');
}

window.setTeamFilterValue = setTeamFilter;

function renderFeaturedCollections() {
  if (!featuredCollections) return;
  const teams = teamOptions().sort((a, b) => b[1] - a[1]).slice(0, 4);
  featuredCollections.innerHTML = teams.map(([team, count]) => `
    <button class="collection-card" type="button" onclick="setTeamFilterValue(${JSON.stringify(team)}); document.getElementById('shop').scrollIntoView({behavior:'smooth'});">
      <div>
        <p class="eyebrow">Featured collection</p>
        <h3>${team}</h3>
        <p>Shop this team faster instead of scrolling the full catalog.</p>
      </div>
      <div class="collection-card__count">${count} style${count === 1 ? '' : 's'}</div>
    </button>
  `).join('');
}


function filteredProducts() {
  return products.filter(product => {
    const matchesSize = state.selectedSize === 'All' || (product.sizes[state.selectedSize] || 0) > 0;
    const team = inferTeam(product);
    const matchesTeam = state.selectedTeam === 'All' || team === state.selectedTeam;
    const matchesSearch = !state.searchQuery || searchBlob(product).includes(normalizeText(state.searchQuery));
    return matchesSize && matchesTeam && matchesSearch;
  });
}


function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
}


function setSizeFilter(size) {
  state.selectedSize = size;
  currentSizeLabel.textContent = size;
  renderProductGrid();
  renderSizeChips(document.getElementById('headerSizeGrid'), setSizeFilter, size);
}


function renderSizeChips(container, onClick, active = state.selectedSize) {
  container.innerHTML = '';
  const all = ['All', ...HAT_SIZES];
  all.forEach(size => {
    const btn = document.createElement('button');
    btn.className = 'size-chip' + (size === active ? ' is-active' : '');
    btn.textContent = size;
    btn.type = 'button';
    btn.addEventListener('click', () => onClick(size));
    container.appendChild(btn);
  });
}

function createProductCard(product) {
  const stockLabel = productStockLabel(product);
  const soldOut = totalStock(product) === 0;
  const availableSizeCount = Object.values(product.sizes).filter(v => v > 0).length;
  return `
    <article class="product-card">
      <div class="product-media">
        <img src="${product.frontImage}" alt="${product.name}" loading="lazy" />
        <div class="badge-row">
          <span class="badge">${product.badge}</span>
          ${soldOut ? '<span class="sold-out-badge">Sold Out</span>' : ''}
        </div>
      </div>
      <div>
        <h3>${product.shortName}</h3>
        <p class="muted">${product.name}</p>
      </div>
      <div class="product-price">${currency(product.price)}</div>
      <p class="stock-text">${stockLabel} · ${availableSizeCount} sizes available</p>
      <div class="product-actions">
        <button class="btn btn-solid" type="button" onclick="openProduct('${product.id}')">View Details</button>
        ${soldOut
          ? `<button class="btn btn-outline" type="button" onclick="openProduct('${product.id}', true)">Notify Me</button>`
          : `<button class="btn btn-outline" type="button" onclick="quickAdd('${product.id}')">Quick Add</button>`}
      </div>
    </article>`;
}


function renderProductGrid() {
  const items = filteredProducts();
  updateResultsLabel(items);
  productGrid.innerHTML = items.length
    ? items.map(createProductCard).join('')
    : '<p class="muted">No hats match those filters right now.</p>';
}


function renderCart() {
  cartCount.textContent = String(state.cart.reduce((sum, item) => sum + item.qty, 0));
  if (!state.cart.length) {
    cartItemsEl.innerHTML = '<p class="muted">Your cart is empty for now.</p>';
    cartTotalEl.textContent = '$0.00';
    renderPayPalArea();
    return;
  }

  cartItemsEl.innerHTML = state.cart.map((item, index) => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" />
      <div>
        <h4>${item.name}</h4>
        <p>Size ${item.size}</p>
        <p>Qty ${item.qty}</p>
        <p>${currency(item.price * item.qty)}</p>
      </div>
      <button class="icon-btn" onclick="removeCartItem(${index})">✕</button>
    </div>`).join('');

  cartTotalEl.textContent = currency(cartTotal());
  renderPayPalArea();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

window.removeCartItem = function removeCartItem(index) {
  state.cart.splice(index, 1);
  saveCart();
  renderCart();
  renderProductGrid();
  if (state.currentProduct) {
    window.openProduct(state.currentProduct.id);
  }
};

window.quickAdd = function quickAdd(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const firstAvailableSize = HAT_SIZES.find(size => sizeAvailable(product, size));
  if (!firstAvailableSize) {
    showToast('This hat is sold out for the moment.');
    return;
  }
  addToCart(product, firstAvailableSize);
};

function addToCart(product, size) {
  if (!sizeAvailable(product, size)) {
    showToast(`Size ${size} is sold out for the moment.`);
    return;
  }
  const existing = state.cart.find(item => item.productId === product.id && item.size === size);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.shortName,
      size,
      price: product.price,
      qty: 1,
      image: product.frontImage
    });
  }
  saveCart();
  renderCart();
  renderProductGrid();
  showToast(`${product.shortName} added to cart · size ${size}`);
}

window.openProduct = function openProduct(productId, openNotify = false) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  state.currentProduct = product;
  state.currentGalleryIndex = 0;
  state.currentModalSize = HAT_SIZES.find(size => sizeAvailable(product, size)) || HAT_SIZES[0];

  modalTitle.textContent = product.name;
  modalBadge.textContent = product.badge;
  modalPrice.textContent = currency(product.price);
  modalStock.textContent = productStockLabel(product);
  modalDescription.textContent = product.description;
  modalMainImage.src = product.gallery[0];
  modalMainImage.alt = product.name;
  modalFileName.textContent = '';
  modalFileName.style.display = 'none';

  modalThumbs.innerHTML = product.gallery.map((img, index) => `
    <button class="modal-thumb ${index === 0 ? 'is-active' : ''}" type="button" onclick="changeThumb(${index})">
      <img src="${img}" alt="${product.shortName} angle ${index + 1}" loading="lazy" />
    </button>`).join('');

  modalSizes.innerHTML = HAT_SIZES.map(size => {
    const available = sizeAvailable(product, size);
    const active = size === state.currentModalSize;
    const label = `${size}${available ? '' : ' · sold out'}`;
    return `<button type="button" class="size-chip ${active ? ' is-active' : ''}" ${available ? '' : 'disabled'} onclick="selectModalSize('${size}')">${label}</button>`;
  }).join('');

  modalDetails.innerHTML = Object.entries(product.details)
    .map(([label, value]) => `<div class="detail-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  renderModalActions(openNotify);
  productModal.classList.add('is-open');
  productModal.setAttribute('aria-hidden', 'false');
};

window.changeThumb = function changeThumb(index) {
  state.currentGalleryIndex = index;
  modalMainImage.src = state.currentProduct.gallery[index];
  [...modalThumbs.children].forEach((el, i) => el.classList.toggle('is-active', i === index));
};

window.selectModalSize = function selectModalSize(size) {
  state.currentModalSize = size;
  [...modalSizes.children].forEach(btn => btn.classList.toggle('is-active', btn.textContent.startsWith(size)));
  renderModalActions(false);
};

function renderModalActions(forceNotify) {
  const product = state.currentProduct;
  if (!product) return;
  const selectedAvailable = sizeAvailable(product, state.currentModalSize);
  const soldOut = !selectedAvailable || totalStock(product) === 0 || forceNotify;
  if (soldOut) {
    modalActions.innerHTML = `
      <div>
        <p class="muted"><strong>Sold Out for the Moment.</strong> Enter your email and we’ll keep you posted when this hat or size comes back.</p>
        <form class="notify-form" onsubmit="submitRestock(event, '${product.id}', '${state.currentModalSize}')">
          <input type="email" placeholder="Enter your email" required />
          <button class="btn btn-solid" type="submit">Notify Me When Restocked</button>
        </form>
      </div>`;
    return;
  }
  modalActions.innerHTML = `
    <button class="btn btn-solid" type="button" onclick="addCurrentProductToCart()">Add to Cart</button>
    <button class="btn btn-outline" type="button" onclick="closeModal()">Keep Browsing</button>`;
}

window.addCurrentProductToCart = function addCurrentProductToCart() {
  addToCart(state.currentProduct, state.currentModalSize);
  closeModal();
};

window.submitRestock = function submitRestock(event, productId, size) {
  event.preventDefault();
  const email = event.target.querySelector('input').value.trim();
  const list = JSON.parse(localStorage.getItem('elcachuchon_restock') || '[]');
  list.push({ productId, size, email, createdAt: new Date().toISOString() });
  localStorage.setItem('elcachuchon_restock', JSON.stringify(list));
  showToast(`Restock request saved for size ${size}.`);
  event.target.reset();
};

function closeModal() {
  productModal.classList.remove('is-open');
  productModal.setAttribute('aria-hidden', 'true');
}
window.closeModal = closeModal;

function openCart() {
  cartDrawer.classList.add('is-open');
  drawerBackdrop.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
}

function closeCart() {
  cartDrawer.classList.remove('is-open');
  drawerBackdrop.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
}

function openThanks() {
  thankYouModal.classList.add('is-open');
  thankYouModal.setAttribute('aria-hidden', 'false');
}

function closeThanks() {
  thankYouModal.classList.remove('is-open');
  thankYouModal.setAttribute('aria-hidden', 'true');
}

function setupEntryExperience() {
  const entry = document.getElementById('sizeEntry');
  const entrySizeGrid = document.getElementById('entrySizeGrid');
  document.getElementById('openSizePicker').addEventListener('click', () => {
    document.getElementById('entrySizePicker').classList.remove('hidden');
  });
  document.getElementById('browseAllBtn').addEventListener('click', () => {
    setSizeFilter('All');
    entry.classList.add('is-hidden');
  });
  entrySizeGrid.innerHTML = HAT_SIZES.map(size => `<button type="button" class="size-chip" onclick="chooseEntrySize('${size}')">${size}</button>`).join('');
  window.chooseEntrySize = function chooseEntrySize(size) {
    setSizeFilter(size);
    entry.classList.add('is-hidden');
  };
}

function paypalClientReady() {
  return PAYPAL_CONFIG.clientId && !PAYPAL_CONFIG.clientId.includes('PASTE_YOUR_PAYPAL_CLIENT_ID_HERE');
}

function renderPayPalArea() {
  if (!paypalWrap || !paypalContainer || !paypalMessage) return;
  const empty = !state.cart.length;
  const total = cartTotal();
  if (empty) {
    paypalWrap.classList.add('hidden');
    paypalMessage.textContent = 'Add a hat to your cart to check out with PayPal.';
    return;
  }
  if (!paypalClientReady()) {
    paypalWrap.classList.add('hidden');
    paypalMessage.textContent = 'Add your PayPal Client ID in assets/js/store-config.js to activate live checkout.';
    return;
  }
  paypalMessage.textContent = 'Secure PayPal checkout is ready below.';
  paypalWrap.classList.remove('hidden');
  const signature = JSON.stringify(state.cart.map(item => ({ id: item.productId, size: item.size, qty: item.qty, price: item.price })));
  if (!state.paypalLoaded) {
    loadPayPalSdk().then(() => {
      state.paypalLoaded = true;
      state.paypalRenderedForSignature = '';
      renderPayPalButtons(signature, total);
    }).catch(() => {
      paypalWrap.classList.add('hidden');
      paypalMessage.textContent = 'PayPal could not load. Check your client ID and internet connection.';
    });
    return;
  }
  renderPayPalButtons(signature, total);
}

function loadPayPalSdk() {
  return new Promise((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    const currencyCode = PAYPAL_CONFIG.currency || STORE_CONFIG.currency || 'USD';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CONFIG.clientId)}&currency=${encodeURIComponent(currencyCode)}&intent=${encodeURIComponent(PAYPAL_CONFIG.intent || 'capture')}`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function renderPayPalButtons(signature) {
  if (state.paypalRenderedForSignature === signature || !window.paypal) return;
  paypalContainer.innerHTML = '';
  state.paypalRenderedForSignature = signature;
  window.paypal.Buttons({
    createOrder(data, actions) {
      return actions.order.create({
        purchase_units: [{
          amount: {
            currency_code: PAYPAL_CONFIG.currency || STORE_CONFIG.currency || 'USD',
            value: cartTotal().toFixed(2)
          },
          description: 'El Cachuchón fitted hat order'
        }]
      });
    },
    onApprove(data, actions) {
      return actions.order.capture().then(details => {
        completeOrder(details);
      });
    },
    onError() {
      showToast('PayPal checkout hit an error. Please try again.');
    }
  }).render('#paypal-button-container');
}

function completeOrder(paypalDetails) {
  const runtimeInventory = getRuntimeInventory();
  state.cart.forEach(item => {
    if (!runtimeInventory[item.productId]) runtimeInventory[item.productId] = {};
    const product = products.find(p => p.id === item.productId);
    const current = Number.isFinite(runtimeInventory[item.productId][item.size])
      ? runtimeInventory[item.productId][item.size]
      : (product?.sizes[item.size] || 0);
    runtimeInventory[item.productId][item.size] = Math.max(0, current - item.qty);
  });
  saveRuntimeInventory(runtimeInventory);
  state.cart = [];
  saveCart();
  refreshProductsFromConfig();
  renderCart();
  renderProductGrid();
  closeCart();
  openThanks();
  console.log('PayPal capture details', paypalDetails);
}

function setupGlobalEvents() {
  document.getElementById('openCartBtn').addEventListener('click', openCart);
  document.getElementById('closeCartBtn').addEventListener('click', closeCart);
  drawerBackdrop.addEventListener('click', closeCart);

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  document.querySelectorAll('[data-close-thanks]').forEach(el => {
    el.addEventListener('click', closeThanks);
  });

  document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (!state.cart.length) {
      showToast('Your cart is empty for now.');
      return;
    }

    if (!paypalClientReady()) {
      showToast('Add your PayPal Client ID in store-config.js first.');
      return;
    }

    showToast('Use the PayPal button below to finish checkout.');
    renderPayPalArea();
  });

  const clearSizeBtn = document.getElementById('clearSizeBtn');
  if (clearSizeBtn) {
    clearSizeBtn.addEventListener('click', () => setSizeFilter('All'));
  }

  const clearTeamBtn = document.getElementById('clearTeamBtn');
  if (clearTeamBtn) {
    clearTeamBtn.addEventListener('click', () => setTeamFilter('All'));
  }

  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      setSizeFilter('All');
      setTeamFilter('All');
      if (productSearch) productSearch.value = '';
      setSearchQuery('');
    });
  }

  if (productSearch) {
    productSearch.addEventListener('input', (event) => {
      setSearchQuery(event.target.value);
    });
  }

  document.getElementById('sizeFilterBtn').addEventListener('click', () => {
    document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('mobileMenuToggle').addEventListener('click', () => {
    document.getElementById('siteNav').classList.toggle('is-open');
  });

  document.getElementById('generalSignupForm').addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('Email captured. Ready to connect to a live email service.');
    event.target.reset();
  });

  const backToTopBtn = document.getElementById('backToTopBtn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
}

const TRANSLATIONS = {
  en: {
    topbar: 'Free standard shipping on orders over $100',
    nav: ['Shop', 'Size Guide', 'About', 'Contact'],
    heroEyebrow: 'Luxury streetwear',
    heroTitle: 'Your grind. Your pride. Your crown.',
    heroLead: 'Premium fitted hats with multiple angles and easy size-first shopping.',
    heroButtons: ['Shop the Collection', 'About the Brand'],
    quickEyebrow: 'Shop faster',
    quickTitle: 'Choose your fitted size',
    sizeGuideEyebrow: 'Size guide',
    sizeGuideTitle: 'Find the right fitted size',
    sizeGuideLead: 'Use a flexible tape measure around your head where the cap sits. Match that measurement to the fitted size chart below.',
    sizeGuideNote: 'Use this chart to find your fitted size.',
    aboutText: `You’re not just wearing a hat
      <span style="filter: grayscale(100%); font-size: 48px;">🧢</span>
      you’re wearing your grind, your pride, and your crown.
      <span style="display: inline-block; font-size: 48px; color: #000000;">🤴🏻</span>
      - <strong>El Cachuchon</strong>`,
    contactEyebrow: 'Stay in the loop',
    contactTitle: 'Need help, info, or just want launch updates, coupons, and discounts?',
    contactLead: 'Email us or join the mailing list.',
    contactButton: 'Join the Mailing List',
    footerTitle: 'Hasta la próxima plebes!',
    footerBackTop: 'Back to top ↑'
  },
  es: {
    topbar: 'Envío estándar gratis en pedidos de más de $100',
    nav: ['Tienda', 'Guía de Tallas', 'Nosotros', 'Contacto'],
    heroEyebrow: 'Streetwear de lujo',
    heroTitle: 'Tu esfuerzo. Tu orgullo. Tu corona.',
    heroLead: 'Gorras fitted premium con múltiples ángulos y compra fácil por talla.',
    heroButtons: ['Comprar la Colección', 'Sobre la Marca'],
    quickEyebrow: 'Compra más rápido',
    quickTitle: 'Elige tu talla fitted',
    sizeGuideEyebrow: 'Guía de tallas',
    sizeGuideTitle: 'Encuentra la talla fitted correcta',
    sizeGuideLead: 'Usa una cinta flexible alrededor de tu cabeza donde se acomoda la gorra. Luego compárala con la tabla de tallas.',
    sizeGuideNote: 'Usa esta tabla para encontrar tu talla fitted.',
    aboutText: `No solo estás usando una gorra
      <span style="filter: grayscale(100%); font-size: 48px;">🧢</span>
      estás usando tu esfuerzo, tu orgullo y tu corona.
      <span style="display: inline-block; font-size: 48px; color: #000000;">🤴🏻</span>
      - <strong>El Cachuchon</strong>`,
    contactEyebrow: 'Mantente al tanto',
    contactTitle: '¿Necesitas ayuda, información o quieres actualizaciones, cupones y descuentos?',
    contactLead: 'Escríbenos o únete a la lista de correos.',
    contactButton: 'Únete a la lista',
    footerTitle: '¡Hasta la próxima plebes!',
    footerBackTop: 'Volver arriba ↑'
  }
};

function applyLanguage(lang) {
  const t = TRANSLATIONS[lang];
  if (!t) return;

  const ticker = document.querySelector('.ticker');
  if (ticker) ticker.textContent = t.topbar;

  const navLinks = document.querySelectorAll('.site-nav a');
  navLinks.forEach((link, index) => {
    if (t.nav[index]) link.textContent = t.nav[index];
  });

  const heroEyebrow = document.querySelector('.hero-copy .eyebrow');
  const heroTitle = document.querySelector('.hero-copy h2');
  const heroLead = document.querySelector('.hero-copy .lead');
  const heroBtns = document.querySelectorAll('.hero-actions a');

  if (heroEyebrow) heroEyebrow.textContent = t.heroEyebrow;
  if (heroTitle) heroTitle.textContent = t.heroTitle;
  if (heroLead) heroLead.textContent = t.heroLead;
  if (heroBtns[0]) heroBtns[0].textContent = t.heroButtons[0];
  if (heroBtns[1]) heroBtns[1].textContent = t.heroButtons[1];

  const quickEyebrow = document.querySelector('.quick-filter .eyebrow');
  const quickTitle = document.querySelector('.quick-filter h3');
  if (quickEyebrow) quickEyebrow.textContent = t.quickEyebrow;
  if (quickTitle) quickTitle.textContent = t.quickTitle;

  const sizeGuideEyebrow = document.querySelector('.size-guide-section .eyebrow');
  const sizeGuideTitle = document.querySelector('.size-guide-section h2');
  const sizeGuideLead = document.querySelector('.size-guide-section .lead');
  const sizeGuideNote = document.querySelector('.size-guide-note');

  if (sizeGuideEyebrow) sizeGuideEyebrow.textContent = t.sizeGuideEyebrow;
  if (sizeGuideTitle) sizeGuideTitle.textContent = t.sizeGuideTitle;
  if (sizeGuideLead) sizeGuideLead.textContent = t.sizeGuideLead;
  if (sizeGuideNote) sizeGuideNote.textContent = t.sizeGuideNote;

  const aboutEyebrow = document.querySelector('.about-copy .eyebrow');
  if (aboutEyebrow) aboutEyebrow.innerHTML = t.aboutText;

  const contactEyebrow = document.querySelector('.contact-card .eyebrow');
  const contactTitle = document.querySelector('.contact-card h2');
  const contactLead = document.querySelector('.contact-card .lead');
  const contactButton = document.querySelector('#generalSignupForm button');

  if (contactEyebrow) contactEyebrow.textContent = t.contactEyebrow;
  if (contactTitle) contactTitle.textContent = t.contactTitle;
  if (contactLead) contactLead.textContent = t.contactLead;
  if (contactButton) contactButton.textContent = t.contactButton;

  const footerTitle = document.querySelector('.site-footer strong');
  const backToTopBtn = document.getElementById('backToTopBtn');

  if (footerTitle) footerTitle.textContent = t.footerTitle;
  if (backToTopBtn) backToTopBtn.textContent = t.footerBackTop;

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  localStorage.setItem('elCachuchonLang', lang);
  document.documentElement.setAttribute('lang', lang);
}

function setupLanguageSwitcher() {
  const buttons = document.querySelectorAll('.lang-btn');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyLanguage(btn.dataset.lang);
    });
  });

  const savedLang = localStorage.getItem('elCachuchonLang') || 'en';
  applyLanguage(savedLang);
}

renderSizeChips(document.getElementById('headerSizeGrid'), setSizeFilter, 'All');
renderTeamFilters();
renderFeaturedCollections();
if (productSearch) productSearch.value = '';
setSizeFilter('All');
renderCart();
setupEntryExperience();
setupGlobalEvents();
setupLanguageSwitcher();
