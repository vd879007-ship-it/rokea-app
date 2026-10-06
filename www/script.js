// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

let db = null;
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  if (typeof firebase.analytics === 'function') {
    firebase.analytics();
  }
  console.log("Firebase Connected to rokeya-3ccaa!");
}

// Initial Data
const JEWELLERY_CARE_INSTRUCTIONS = `CARE & SAFETY
✦	Cleaning: Wipe gently with a soft, dry cloth after each use. Avoid water, soap, or chemical cleaners.
✦	Storage: Store in a zip-lock pouch or airtight jewellery box to prevent tarnishing and dust accumulation.
✦	Avoid Moisture: Do not wear while bathing, swimming, or during heavy perspiration. Moisture accelerates tarnishing.
✦	Perfume & Chemicals: Apply perfume and hairspray before wearing. Keep the jewellery away from cosmetics and cleaning agents.
✦	Handling: Handle gently; avoid bending, dropping, or pulling on delicate motifs or stone settings.
✦	Stone Care: Do not scrub stone-set pieces. Wipe stone surfaces with a cotton swab to maintain shine.
✦	Longevity Tip: Occasional light polish with a soft cloth keeps the finish bright. Store separately to avoid scratches.`;

let products = JSON.parse(localStorage.getItem('saforio_products')) || [];

// Migration removed to ensure no automatic changes happen.
// Products will load exactly as they are in storage.
products = products.map(p => ({
  ...p,
  id: p.id || Date.now() + Math.random(),
  position: p.position ?? 999
}));

function cleanProductDescription(desc) { return desc || ""; }
function extractPriceFromDesc(desc) { return 0; }

// --- SEO & Image Optimization Helpers ---
function optimizeImageUrl(url) {
  if (!url) return '';
  if (url.includes('cloudinary.com') && !url.includes('f_auto,q_auto')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto/');
  }
  return url;
}

function getSEOAttributes(product) {
  let name = product.name;
  if (!name && product.slug) {
    name = product.slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  if (!name) name = "Rokea Premium Product";

  name = name.replace(/"/g, '&quot;');

  return `alt="${name}" title="${name}" aria-label="${name}" loading="lazy" decoding="async" width="800" height="1000"`;
}

function generateSlug(text) {
  if (!text) return "";
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Sort products by ID descending so newest are at the top
products.sort((a, b) => (b.id || 0) - (a.id || 0));

localStorage.setItem('saforio_products', JSON.stringify(products));


// Global Image Error Handler - Bulletproof way to stop question marks
window.addEventListener('error', function (e) {
  if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
    e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.target.style.background = 'linear-gradient(135deg, #f0e6d3, #faf6ef)';
    e.target.style.display = 'block'; // Ensure it doesn't break layout
  }
}, true);

let cart = JSON.parse(localStorage.getItem('saforio_cart')) || [];
let wishlist = JSON.parse(localStorage.getItem('saforio_wishlist')) || [];
let users = JSON.parse(localStorage.getItem('saforio_users')) || [];
let currentCategory = 'sarees';
let currentSort = 'default';
let currentUser = JSON.parse(localStorage.getItem('saforio_currentUser')) || null;
let modalHistory = [];
let adminCurrentProductFilter = 'all';

// --- Environment & Native App Detection ---
function isNativeApp() {
  return typeof window.Capacitor !== 'undefined' ||
         window.location.protocol === 'capacitor:' ||
         window.location.protocol === 'ionic:' ||
         window.location.protocol === 'file:';
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function getProductLink(p) {
  if (!p) return '/collections.html';
  if (isNativeApp() || isLocalhost) {
    return p.slug ? `product-details.html?slug=${encodeURIComponent(p.slug)}` : `product-details.html?id=${encodeURIComponent(p.id)}`;
  } else {
    return p.slug ? `/product/${p.slug}` : `/product-details?id=${p.id}`;
  }
}

function getAbsoluteProductLink(p) {
  const path = getProductLink(p);
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return window.location.origin + (path.startsWith('/') ? path : '/' + path);
}

function getApiBaseUrl() {
  if (isNativeApp()) {
    return 'https://rokeabyrk.com';
  }
  return '';
}

// Initialize URL Parameters globally on script load to prevent ReferenceError
const urlParams = new URLSearchParams(window.location.search);
const urlCat = urlParams.get('category') || localStorage.getItem('rokea_selected_category');
let urlId = urlParams.get('slug') || urlParams.get('id');

// Detect Vercel rewrite or native /product/ path
if (!urlId && window.location.pathname.startsWith('/product/')) {
  urlId = window.location.pathname.replace('/product/', '').replace(/\/$/, '');
}

function saveProducts() {
  localStorage.setItem('saforio_products', JSON.stringify(products));
  renderAll();
}

// Sync across multiple tabs in real-time
window.addEventListener('storage', (e) => {
  if (e.key === 'saforio_products') {
    products = JSON.parse(e.newValue) || [];
    renderAll();
  }
});

// --- FIRESTORE PRODUCT SYNC ---
function loadProducts() {
  return new Promise((resolve) => {
    if (db) {
      db.collection("products").onSnapshot((snapshot) => {
        const fsProducts = [];
        snapshot.forEach(doc => {
          let p = doc.data();
          p.id = p.id || doc.id;
          fsProducts.push(p);
        });
        // Sort products by position (ascending)
        products = fsProducts.sort((a, b) => (a.position || 0) - (b.position || 0));
        localStorage.setItem('saforio_products', JSON.stringify(products));
        renderAll();
        resolve();
      }, (err) => {
        console.error("Firestore product listen error:", err);
        resolve();
      });
    } else {
      renderAll();
      resolve();
    }
  });
}

async function loadUsers() {
  if (db) {
    try {
      const snapshot = await db.collection("users").get();
      if (!snapshot.empty) {
        const fsUsers = [];
        snapshot.forEach(doc => fsUsers.push(doc.data()));
        users = fsUsers;
        localStorage.setItem('saforio_users', JSON.stringify(users));
      }
    } catch (err) {
      console.error("Firestore users load error:", err);
    }
  }
}

loadProducts().then(() => {
  renderMarquee();
});
loadUsers();

function saveUsers() {
  localStorage.setItem('saforio_users', JSON.stringify(users));
}

// --- CART & PAYMENT ---

function toggleCart() {
  const modal = document.getElementById('cartModal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  document.body.classList.toggle('modal-open', modal.style.display === 'flex');
  renderCart();
}

window.toggleMobileMenu = () => {
  const menu = document.getElementById('mobileMenu');
  if (menu) {
    menu.classList.toggle('active');
    document.body.classList.toggle('modal-open', menu.classList.contains('active'));
  }
}

// PREMIUM CUSTOM ALERT (DYNAMIC INJECTION)
function showToast(message, type = 'success', subText = '') {
  let overlay = document.getElementById('customAlertOverlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'customAlertOverlay';
    overlay.className = 'custom-alert-overlay';
    overlay.onclick = () => closeCustomAlert();
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); display:none; align-items:center; justify-content:center; z-index:10001; animation: fadeIn 0.3s ease;";

    overlay.innerHTML = `
      <div class="custom-alert-box" onclick="event.stopPropagation()" style="background:#fff; width:90%; max-width:380px; border-radius:24px; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,0.4); transform:scale(0.8); opacity:0; transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); border:1px solid rgba(201,168,76,0.2);">
        <div style="background:linear-gradient(135deg, #b0937a, #8e6d4f); padding:30px 20px; text-align:center; color:#fff;">
          <div style="font-size:40px; margin-bottom:10px; filter:drop-shadow(0 2px 5px rgba(0,0,0,0.2));">✦</div>
          <div id="alertTitle" style="font-family:'Playfair Display',serif; font-size:24px; font-weight:700; letter-spacing:1px;">ROKEA Luxury</div>
        </div>
        <div style="padding:40px 30px; text-align:center;">
          <p id="alertMessage" style="font-family:'Poppins',sans-serif; font-size:15px; color:#444; line-height:1.6; margin:0; font-weight:500;">Item added successfully.</p>
        </div>
      </div>
      <style>
        .custom-alert-overlay.active { display:flex !important; }
        .custom-alert-overlay.active .custom-alert-box { transform:scale(1) !important; opacity:1 !important; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      </style>
    `;
    document.body.appendChild(overlay);
  }

  const msgEl = overlay.querySelector('#alertMessage');
  const titleEl = overlay.querySelector('#alertTitle');

  if (msgEl) {
    msgEl.innerHTML = `<strong>${message}</strong>${subText ? `<br><span style="font-size:12px; color:#888; font-weight:400; margin-top:8px; display:block;">${subText}</span>` : ''}`;
    if (titleEl) {
      titleEl.innerText = type === 'success' ? 'Success!' : (type === 'info' ? 'Rokea Update' : 'Notice');
    }
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      closeCustomAlert();
    }, 2000);
  }
}

window.closeCustomAlert = () => {
  const overlay = document.getElementById('customAlertOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// --- SIDE NOTIFICATION ---
function showSideNotification(product) {
  let container = document.getElementById('sideNotificationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sideNotificationContainer';
    container.className = 'side-notification-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = 'side-notification';
  notification.innerHTML = `
        <img src="${product.image || product.img}" class="side-notification-img" loading="lazy" decoding="async" ${getSEOAttributes(product)}>
        <div class="side-notification-content">
            <div class="side-notification-title">Added to Cart</div>
            <div class="side-notification-msg">${product.name} has been added to your bag.</div>
            <a href="javascript:void(0)" class="side-notification-btn" onclick="toggleCart()">View Cart & Checkout</a>
        </div>
        <span class="side-notification-close">&times;</span>
    `;

  container.appendChild(notification);

  // Close button
  notification.querySelector('.side-notification-close').onclick = () => {
    notification.classList.remove('active');
    setTimeout(() => notification.remove(), 500);
  };

  // Auto animate in
  setTimeout(() => notification.classList.add('active'), 10);

  // Auto remove
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.remove('active');
      setTimeout(() => notification.remove(), 500);
    }
  }, 5000);
}





function addToCart(productId) {
  const p = products.find(prod => prod.id == productId);
  if (!p || p.stock === "Out of Stock") return;
  cart.push(p);
  localStorage.setItem('saforio_cart', JSON.stringify(cart));
  updateCartIcon();

  // Amazon-style button change if event exists
  if (window.event && window.event.currentTarget && window.event.currentTarget.tagName === 'BUTTON') {
    const btn = window.event.currentTarget;
    const originalText = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = 'Added';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = originalText;
    }, 3000);
  }

  showSideNotification(p);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  localStorage.setItem('saforio_cart', JSON.stringify(cart));
  renderCart();
  updateCartIcon();
}

function updateCartIcon() {
  const countEls = document.querySelectorAll('#cart-count, #mobile-cart-count, .cart-count-badge');
  countEls.forEach(el => {
    if (el) el.innerText = cart.length;
  });
}

// --- WISHLIST LOGIC ---

function toggleWishlist() {
  const modal = document.getElementById('wishlistModal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
  document.body.classList.toggle('modal-open', modal.style.display === 'flex');
  renderWishlist();
}

function addToWishlist(productId) {
  const index = wishlist.findIndex(p => p.id == productId);
  const p = products.find(prod => prod.id == productId);

  if (index === -1 && p) {
    wishlist.push(p);
    showToast("Added to Wishlist!", "success", p.name);
  } else if (p) {
    wishlist.splice(index, 1);
    showToast("Removed from Wishlist", "info", p.name);
  }

  // Find the element that was clicked to animate it
  const btn = event?.currentTarget;
  if (btn) {
    btn.classList.add('wish-animate');
    setTimeout(() => btn.classList.remove('wish-animate'), 500);

    // Sparkle effect
    if (index === -1) {
      const sparkleCont = document.createElement('div');
      sparkleCont.className = 'sparkle-container';
      sparkleCont.style.position = 'absolute';
      sparkleCont.style.top = '50%';
      sparkleCont.style.left = '50%';
      sparkleCont.style.transform = 'translate(-50%, -50%)';
      btn.appendChild(sparkleCont);

      for (let i = 0; i < 8; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle animate';
        const angle = (i * 45) * (Math.PI / 180);
        const dist = 25;
        sparkle.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
        sparkle.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
        sparkleCont.appendChild(sparkle);
      }
      setTimeout(() => sparkleCont.remove(), 700);
    }

    // Instagram-style big heart pop
    if (index === -1) { // Only on "Add"
      const productCard = btn.closest('.product-card');
      const imgCont = productCard?.querySelector('.product-img');
      if (imgCont) {
        const heartPop = document.createElement('div');
        heartPop.className = 'insta-heart-pop animate';
        heartPop.innerHTML = `<svg viewBox="0 0 24 24" fill="#e91e63" style="width: 80px; height: 80px; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.3));"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
        imgCont.appendChild(heartPop);

        setTimeout(() => heartPop.remove(), 900);
      }
    }

  }

  if (index > -1) {
    wishlist.splice(index, 1);
  } else {
    const p = products.find(prod => prod.id == productId);
    if (p) wishlist.push(p);
  }
  localStorage.setItem('saforio_wishlist', JSON.stringify(wishlist));
  updateWishlistIcon();
  renderGrid();
}



function removeFromWishlist(index) {
  wishlist.splice(index, 1);
  localStorage.setItem('saforio_wishlist', JSON.stringify(wishlist));
  updateWishlistIcon();
  renderWishlist();
  renderGrid();
}

function updateWishlistIcon() {
  const countEls = document.querySelectorAll('#wish-count, #mobile-wish-count, .wish-count-badge');
  countEls.forEach(el => {
    if (el) {
      el.innerText = wishlist.length;
      el.classList.add('wish-animate');
      setTimeout(() => el.classList.remove('wish-animate'), 400);
    }
  });
}


function renderWishlist() {
  const list = document.getElementById('wishlist-items');
  if (!list) return;
  list.innerHTML = '';
  if (wishlist.length === 0) {
    list.innerHTML = '<div style="text-align:center; margin-top: 40px; color: #888;">Your wishlist is empty. ✿</div>';
  }
  wishlist.forEach((item, index) => {
    list.innerHTML += `
      <div class="cart-item" style="animation: fadeInUp 0.4s ease forwards; animation-delay: ${index * 0.1}s; opacity: 0;">

        <img src="${optimizeImageUrl(item.image || item.img)}" width="50" height="66" style="width:50px" loading="lazy" decoding="async" ${getSEOAttributes(item)}>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${item.price}</div>
          <button class="btn-primary" style="margin-top:5px; font-size:9px; padding:6px 10px;" onclick="wishToCart(${index})">Move to Cart</button>
        </div>
        <button class="btn-remove" onclick="removeFromWishlist(${index})">&times;</button>
      </div>`;
  });
}

function wishToCart(index) {
  const p = wishlist[index];
  addToCart(p.id);
  wishlist.splice(index, 1);
  localStorage.setItem('saforio_wishlist', JSON.stringify(wishlist));
  updateWishlistIcon();
  renderWishlist();
  renderGrid();
}

function moveAllToCart() {
  if (wishlist.length === 0) return alert("Wishlist is empty!");
  wishlist.forEach(p => addToCart(p.id));
  wishlist = [];
  localStorage.setItem('saforio_wishlist', JSON.stringify(wishlist));
  updateWishlistIcon();
  renderWishlist();
  renderGrid();
  toggleWishlist();
  toggleCart();
}

function renderCart() {
  const list = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!list) return;
  list.innerHTML = '';
  let total = 0;
  cart.forEach((item, index) => {
    total += parseInt(item.price);
    list.innerHTML += `
      <div class="cart-item">
        <img src="${optimizeImageUrl(item.image || item.img)}" width="50" height="66" style="width:50px" loading="lazy" decoding="async" ${getSEOAttributes(item)}>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${item.price}</div>
        </div>
        <button class="btn-remove" onclick="removeFromCart(${index})">&times;</button>
      </div>`;
  });
  if (totalEl) totalEl.innerText = `₹${total}`;
}

function openCheckout() {
  if (cart.length === 0) { alert("Your cart is empty!"); return; }

  if (currentUser) {
    document.getElementById('orderName').value = currentUser.name || '';
    document.getElementById('orderPhone').value = currentUser.phone || '';
  }

  document.getElementById('cartModal').style.display = 'none';
  document.getElementById('checkoutModal').style.display = 'flex';
}

function closeCheckout() {
  document.getElementById('checkoutModal').style.display = 'none';
}

async function handleOrder(e) {
  e.preventDefault();
  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  const address = document.getElementById('orderAddress').value.trim();

  if (!name || !phone || !address) {
    alert("Please fill in all required shipping details.");
    return;
  }

  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('#checkoutModal .btn-primary');
  const originalBtnText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Initializing Secure Payment...";
  }

  const customer = { name, phone, address, email: currentUser ? currentUser.email : '' };
  const userId = currentUser ? currentUser.uid : 'guest';

  try {
    // 1. Authoritative Server-Side Order Creation
    const apiBase = getApiBaseUrl();
    const createOrderRes = await fetch(`${apiBase}/api/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, customer, userId })
    });

    const orderInit = await createOrderRes.json();

    if (!createOrderRes.ok || !orderInit.success) {
      throw new Error(orderInit.error || "Failed to initialize payment.");
    }

    // 2. Open Razorpay Checkout with authoritative Order ID
    const options = {
      key: orderInit.keyId || process.env.RAZORPAY_KEY_ID,
      amount: orderInit.amount,
      currency: orderInit.currency || "INR",
      name: "ROKEA by RK",
      description: `Order Payment (${cart.length} item${cart.length > 1 ? 's' : ''})`,
      order_id: orderInit.orderId,
      handler: async function (response) {
        if (submitBtn) submitBtn.innerText = "Verifying Payment...";
        try {
          // 3. Server-Side HMAC Signature Verification & Firestore Confirmation
          const verifyRes = await fetch(`${apiBase}/api/verify-razorpay-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              customer,
              items: orderInit.items,
              verifiedTotal: orderInit.verifiedTotal,
              userId
            })
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData.success) {
            throw new Error(verifyData.error || "Payment signature verification failed.");
          }

          // Save local receipt copy for user convenience
          const localOrder = {
            id: verifyData.orderId,
            items: orderInit.items,
            total: orderInit.verifiedTotal,
            customer,
            paymentId: response.razorpay_payment_id,
            userId,
            date: new Date().toLocaleDateString()
          };
          const orders = JSON.parse(localStorage.getItem('saforio_orders')) || [];
          orders.push(localOrder);
          localStorage.setItem('saforio_orders', JSON.stringify(orders));

          alert(`✓ Payment Successful! Order ID: ${verifyData.orderId}`);
          cart = [];
          localStorage.removeItem('saforio_cart');
          updateCartIcon();
          closeCheckout();
        } catch (verifyErr) {
          console.error("Verification Error:", verifyErr);
          alert("Payment recorded with ID: " + response.razorpay_payment_id + ", but confirmation failed: " + verifyErr.message);
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
          }
        }
      },
      prefill: {
        name: customer.name,
        contact: customer.phone,
        email: customer.email || ''
      },
      theme: { color: "#C9A84C" },
      modal: {
        ondismiss: function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
          }
        }
      }
    };

    const rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response) {
      alert("Payment Failed! Reason: " + (response.error ? response.error.description : 'Transaction failed'));
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
      }
    });
    rzp1.open();

  } catch (err) {
    console.error("Checkout Error:", err);
    alert("Unable to process order: " + err.message);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

// AUTH LOGIC
window.openAuth = (showLogin = true) => {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.style.display = 'flex';
    document.body.classList.add('modal-open');
    window.toggleAuth(showLogin);
  }
};

window.closeAuth = () => {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
};

window.toggleAuth = (showLogin) => {
  const loginView = document.getElementById('loginView');
  const regView = document.getElementById('registerView');
  const quote = document.getElementById('authBrandQuote');

  if (loginView) loginView.style.display = showLogin ? 'block' : 'none';
  if (regView) regView.style.display = showLogin ? 'none' : 'block';

  if (quote) {
    quote.innerHTML = showLogin 
      ? '<em>Sign in to continue your elegant journey with us.</em>' 
      : '<em>Sign up to begin your elegant journey with us.</em>';
  }
};

window.togglePasswordVisibility = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';

  if (btn) {
    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');
    if (eyeOpen && eyeClosed) {
      eyeOpen.style.display = isPass ? 'none' : 'block';
      eyeClosed.style.display = isPass ? 'block' : 'none';
    }
  }
};

// REEL MODAL LOGIC
const reelVideos = {
  'REEL_ID_1': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'REEL_ID_2': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'REEL_ID_3': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'REEL_ID_4': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'REEL_ID_5': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'REEL_ID_6': 'https://www.w3schools.com/html/mov_bbb.mp4'
};

window.openReelModal = (reelId) => {
  const modal = document.getElementById('reelModal');
  const video = document.getElementById('reelVideo');
  if (modal && video) {
    // Set the source to a direct mp4 video URL instead of Instagram embed
    video.src = reelVideos[reelId] || 'https://www.w3schools.com/html/mov_bbb.mp4';
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    video.play();
  }
}
window.closeReelModal = () => {
  const modal = document.getElementById('reelModal');
  const video = document.getElementById('reelVideo');
  if (modal && video) {
    video.pause();
    video.src = ''; // stops the video
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
}

window.handleRegister = () => {
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const pass = document.getElementById('regPass').value;
  if (!name || !email || !pass) return alert('Fill all fields');

  firebase.auth().createUserWithEmailAndPassword(email, pass)
    .then((userCredential) => {
      const user = userCredential.user;
      const userData = { name, email, phone, date: new Date().toISOString() };

      // Save extra details to Firestore
      if (db) {
        db.collection("users").doc(user.uid).set(userData)
          .then(() => {
            console.log("User profile saved to Firestore!");
            alert('Account created successfully! Welcome to ROKEA.');
            toggleAuth(true);
          })
          .catch(err => console.error("Firestore user profile error:", err));
      }
    })
    .catch((error) => {
      alert(error.message);
    });
}

window.handleAuth = () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;

  if (!email || !pass) {
    alert("Please enter your email and password.");
    return;
  }

  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(async (userCredential) => {
      console.log("Logged in with Firebase Auth");
      closeAuth();
      try {
        const tokenResult = await userCredential.user.getIdTokenResult(true);
        if (tokenResult.claims && tokenResult.claims.admin) {
          const adminModal = document.getElementById('adminModal');
          if (adminModal) {
            adminModal.style.display = 'flex';
            renderAll();
          }
        }
      } catch (err) {
        console.warn("Admin claim check:", err);
      }
    })
    .catch((error) => {
      alert("Login failed: " + error.message);
    });
};

// Firebase Auth State Observer
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    let isAdmin = false;
    try {
      const tokenResult = await user.getIdTokenResult();
      isAdmin = !!(tokenResult.claims && tokenResult.claims.admin);
    } catch (e) {
      console.warn("Token claim error:", e);
    }

    if (db) {
      db.collection("users").doc(user.uid).get().then((doc) => {
        if (doc.exists) {
          currentUser = doc.data();
          currentUser.uid = user.uid;
          currentUser.isAdmin = isAdmin;
        } else {
          currentUser = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || (user.email ? user.email.split('@')[0] : 'Customer'),
            isAdmin: isAdmin
          };
        }
        localStorage.setItem('saforio_currentUser', JSON.stringify(currentUser));
        updateUserUI();
      }).catch(() => {
        currentUser = {
          uid: user.uid,
          email: user.email,
          name: user.displayName || (user.email ? user.email.split('@')[0] : 'Customer'),
          isAdmin: isAdmin
        };
        localStorage.setItem('saforio_currentUser', JSON.stringify(currentUser));
        updateUserUI();
      });
    }
  } else {
    // User is signed out
    currentUser = null;
    localStorage.removeItem('saforio_currentUser');
    const link = document.getElementById('userLinkCont');
    if (link) link.innerHTML = '<a href="javascript:void(0)" onclick="openAuth()" id="navLogin">Login / Register</a>';
  }
});

function openAdminDashboard() {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Admin privileges required. Please sign in with an authorized admin account.");
    return;
  }
  const adminModal = document.getElementById('adminModal');
  if (adminModal) {
    adminModal.style.display = 'flex';
    renderAll();
  }
}

function updateUserUI() {
  const link = document.getElementById('userLinkCont');
  const mobileLink = document.getElementById('mobileLoginCont');

  if (currentUser) {
    const firstInitial = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U';
    const shortName = currentUser.name ? currentUser.name.split(' ')[0] : 'User';

    const adminMenuItem = currentUser.isAdmin
      ? `<a href="javascript:void(0)" class="dropdown-item" onclick="openAdminDashboard()" style="color:var(--gold); font-weight:600;">
           <span>★</span> Admin Dashboard
         </a>`
      : '';

    const profileHtml = `
      <div class="user-profile-cont" onclick="toggleUserDropdown(event)">
        <div class="user-info-text">
          <span class="user-welcome">Welcome</span>
          <span class="user-name-display">${shortName}</span>
        </div>
        <div class="user-avatar-badge">${firstInitial}</div>
        
        <div class="user-dropdown" id="userDropdown">
          <div class="dropdown-header">
            <div class="user-avatar-badge" style="width: 50px; height: 50px; font-size: 20px;">${firstInitial}</div>
            <div style="font-family:'Playfair Display',serif; font-weight:700; color:var(--dark);">${currentUser.name}</div>
            <div style="font-size:10px; color:var(--muted);">${currentUser.email}</div>
          </div>
          ${adminMenuItem}
          <a href="javascript:void(0)" class="dropdown-item" onclick="toggleWishlist()">
            <span>✦</span> My Wishlist
          </a>
          <a href="javascript:void(0)" class="dropdown-item" onclick="toggleCart()">
            <span>✦</span> My Shopping Cart
          </a>
          <a href="javascript:void(0)" class="dropdown-item logout-item" onclick="logoutUser()">
            <span>✕</span> Sign Out
          </a>
        </div>
      </div>`;

    if (link) link.innerHTML = profileHtml;
    if (mobileLink) mobileLink.innerHTML = `<a href="javascript:void(0)" onclick="logoutUser()" style="color:#ff4d4d">Logout (${shortName})</a>`;
  }
}

window.toggleUserDropdown = (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('active');
}

// Close dropdown on click outside
window.addEventListener('click', () => {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.remove('active');
});

window.logoutUser = () => {
  firebase.auth().signOut().then(() => {
    localStorage.removeItem('saforio_currentUser');
    location.reload();
  });
}

window.toggleAdminMenu = (forceClose = false) => {
  if (window.innerWidth > 1024) return;
  const navLinks = document.querySelector('.admin-nav-links');
  const toggleBtn = document.querySelector('.admin-menu-toggle');
  if (!navLinks || !toggleBtn) return;

  if (forceClose) {
    navLinks.classList.remove('active');
    toggleBtn.classList.remove('active');
  } else {
    navLinks.classList.toggle('active');
    toggleBtn.classList.toggle('active');
  }
}


// =============================================
// ADMIN DASHBOARD TABS
// =============================================

window.switchAdminTab = (tab) => {
  document.getElementById('viewProducts').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('viewCustomers').style.display = tab === 'customers' ? 'block' : 'none';
  document.getElementById('viewLeads').style.display = tab === 'leads' ? 'block' : 'none';
  document.getElementById('viewOrders').style.display = tab === 'orders' ? 'block' : 'none';

  document.getElementById('tabProducts').classList.toggle('active', tab === 'products');
  document.getElementById('tabCustomers').classList.toggle('active', tab === 'customers');
  document.getElementById('tabLeads').classList.toggle('active', tab === 'leads');
  document.getElementById('tabOrders').classList.toggle('active', tab === 'orders');

  const titleEl = document.getElementById('adminTabTitle');
  if (tab === 'products') titleEl.innerText = 'Product Management';
  else if (tab === 'customers') titleEl.innerText = 'Customer Records';
  else if (tab === 'leads') titleEl.innerText = 'Consultation Leads';
  else titleEl.innerText = 'Order & Payment History';

  document.getElementById('addBtnTop').style.display = tab === 'products' ? 'block' : 'none';

  if (tab === 'customers') renderAdminCustomers();
  if (tab === 'leads') renderAdminLeads();
  if (tab === 'orders') renderAdminOrders();

  // Auto-close menu on mobile after switching tab
  window.toggleAdminMenu(true);
}

window.switchAdminProductFilter = (filter) => {
  adminCurrentProductFilter = filter;
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (filter === 'all') document.getElementById('adminFilterAll').classList.add('active');
  else if (filter === 'sarees') document.getElementById('adminFilterSarees').classList.add('active');
  else if (filter === 'imitation') document.getElementById('adminFilterJewels').classList.add('active');
  renderAdminList();
}

// =============================================
// ADMIN: LEADS — Firestore + localStorage fallback
// =============================================

function renderAdminLeads() {
  const list = document.getElementById('adminLeadList');
  if (!list) return;

  // Show loading state
  list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--muted);">Loading leads...</td></tr>';

  if (db) {
    db.collection("leads")
      .orderBy("date", "desc")
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted);">No leads captured yet.</td></tr>';
          return;
        }
        list.innerHTML = snapshot.docs.map((doc) => {
          const l = doc.data();
          const dateStr = l.date ? new Date(l.date).toLocaleDateString('en-IN') : 'N/A';
          return `
            <tr>
              <td><strong>${l.name || 'N/A'}</strong></td>
              <td>${l.phone || 'N/A'}</td>
              <td><span class="badge" style="background:var(--ivory); padding:5px 10px; font-size:10px; border:1px solid var(--gold);">${l.interest || 'N/A'}</span></td>
              <td>${dateStr}</td>
              <td><button class="admin-btn btn-delete" onclick="deleteFirebaseLead('${doc.id}')">Delete</button></td>
            </tr>`;
        }).join('');
      })
      .catch((err) => {
        console.error("Firestore leads fetch error:", err);
        renderAdminLeadsLocal(); // fallback
      });
  } else {
    renderAdminLeadsLocal();
  }
}

function renderAdminLeadsLocal() {
  const list = document.getElementById('adminLeadList');
  if (!list) return;
  const leads = JSON.parse(localStorage.getItem('saforio_leads')) || [];
  if (leads.length === 0) {
    list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted);">No leads captured yet.</td></tr>';
    return;
  }
  list.innerHTML = leads.map((l, idx) => `
    <tr>
      <td><strong>${l.name}</strong></td>
      <td>${l.phone}</td>
      <td><span class="badge" style="background:var(--ivory); padding:5px 10px; font-size:10px; border:1px solid var(--gold);">${l.interest}</span></td>
      <td>${l.date}</td>
      <td><button class="admin-btn btn-delete" onclick="deleteLocalLead(${idx})">Delete</button></td>
    </tr>`).join('');
}

window.deleteFirebaseLead = (docId) => {
  if (!confirm('Delete this lead?')) return;
  db.collection("leads").doc(docId).delete()
    .then(() => { console.log("Lead deleted from Firestore"); renderAdminLeads(); })
    .catch(err => console.error("Delete lead error:", err));
}

window.deleteLocalLead = (idx) => {
  if (!confirm('Delete this lead record?')) return;
  const leads = JSON.parse(localStorage.getItem('saforio_leads')) || [];
  leads.splice(idx, 1);
  localStorage.setItem('saforio_leads', JSON.stringify(leads));
  renderAdminLeadsLocal();
}

// Legacy alias
window.deleteLead = window.deleteLocalLead;

// =============================================
// ADMIN: CUSTOMERS — Firestore + localStorage fallback
// =============================================

function renderAdminCustomers() {
  const list = document.getElementById('adminCustomerList');
  if (!list) return;

  list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--muted);">Loading customers...</td></tr>';

  if (db) {
    db.collection("users")
      .orderBy("date", "desc")
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--muted);">No customers registered yet.</td></tr>';
          return;
        }
        list.innerHTML = snapshot.docs.map((doc) => {
          const u = doc.data();
          const dateStr = u.date ? new Date(u.date).toLocaleDateString('en-IN') : 'N/A';
          return `
            <tr>
              <td><strong>${u.name || 'N/A'}</strong></td>
              <td>${u.email || 'N/A'}</td>
              <td>${u.phone || 'N/A'}</td>
              <td>${dateStr}</td>
            </tr>`;
        }).join('');
      })
      .catch((err) => {
        console.error("Firestore customers fetch error:", err);
        renderAdminCustomersLocal(); // fallback
      });
  } else {
    renderAdminCustomersLocal();
  }
}

function renderAdminCustomersLocal() {
  const list = document.getElementById('adminCustomerList');
  if (!list) return;
  if (users.length === 0) {
    list.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--muted);">No customers yet.</td></tr>';
    return;
  }
  list.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td>${u.phone}</td>
      <td>${u.date}</td>
    </tr>`).join('');
}

// =============================================
// ADMIN: ORDERS — Firestore + localStorage fallback
// =============================================

function renderAdminOrders() {
  const list = document.getElementById('adminOrderList');
  if (!list) return;

  list.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--muted);">Loading orders...</td></tr>';

  if (db) {
    db.collection("orders")
      .orderBy("date", "desc")
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          list.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--muted);">No orders found.</td></tr>';
          return;
        }

        // Save globally for lookup
        window.loadedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        list.innerHTML = window.loadedOrders.map((o) => {
          const dateStr = o.date ? new Date(o.date).toLocaleDateString('en-IN') : 'N/A';
          const shortId = o.id.slice(0, 8).toUpperCase();
          return `
            <tr>
              <td><strong>#${shortId}</strong></td>
              <td>${o.customer?.name || 'N/A'}</td>
              <td>${o.customer?.phone || 'N/A'}</td>
              <td>₹${(o.total || 0).toLocaleString('en-IN')}</td>
              <td><span class="badge" style="background:var(--ivory); padding:5px 10px; font-size:10px; border:1px solid var(--gold);">${o.paymentId || 'N/A'}</span></td>
              <td>${dateStr}</td>
              <td>
                <button class="admin-btn btn-edit" onclick="viewOrderDetails('${o.id}', true)">View Items</button>
              </td>
            </tr>`;
        }).join('');
      })
      .catch((err) => {
        console.error("Firestore orders fetch error:", err);
        renderAdminOrdersLocal(); // fallback
      });
  } else {
    renderAdminOrdersLocal();
  }
}

function renderAdminOrdersLocal() {
  const list = document.getElementById('adminOrderList');
  const orders = JSON.parse(localStorage.getItem('saforio_orders')) || [];
  if (orders.length === 0) {
    list.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--muted);">No orders found.</td></tr>';
    return;
  }
  list.innerHTML = orders.map((o) => `
    <tr>
      <td><strong>#${o.id}</strong></td>
      <td>${o.customer.name}</td>
      <td>${o.customer.phone}</td>
      <td>₹${o.total.toLocaleString()}</td>
      <td><span class="badge" style="background:var(--ivory); padding:5px 10px; font-size:10px; border:1px solid var(--gold);">${o.paymentId || 'N/A'}</span></td>
      <td>${o.date}</td>
      <td><button class="admin-btn btn-edit" onclick="viewOrderDetails('${o.id}', false)">View Items</button></td>
    </tr>`).join('');
}

window.viewOrderDetails = (orderId, isFirestore = true) => {
  let order = null;

  if (isFirestore) {
    order = (window.loadedOrders || []).find(o => o.id.toString() === orderId.toString());
  } else {
    const orders = JSON.parse(localStorage.getItem('saforio_orders')) || [];
    order = orders.find(o => o.id.toString() === orderId.toString());
  }

  if (!order) return alert("Order not found!");

  // Create the modal overlay if it doesn't exist
  let modal = document.getElementById('orderDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'orderDetailModal';
    modal.className = 'modal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      z-index: 3000;
      inset: 0;
      background: rgba(6, 6, 9, 0.75);
      backdrop-filter: blur(6px);
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(modal);
  }

  const shortId = orderId.length > 8 ? orderId.slice(0, 8).toUpperCase() : orderId;

  // Render items with image, price details
  const itemsHtml = (order.items || []).map(item => `
    <div style="display: flex; align-items: center; gap: 15px; padding: 12px; background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(201, 168, 76, 0.15); border-radius: 8px; margin-bottom: 10px;">
      <div style="width: 60px; height: 60px; border-radius: 6px; overflow: hidden; background: url('${item.image || item.img}') center/cover; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;"></div>
      <div style="flex-grow: 1; min-width: 0;">
        <h4 style="margin: 0 0 4px 0; font-family: 'Playfair Display', serif; font-size: 15px; color: var(--dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</h4>
        <span style="font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">${item.category || 'Product'}</span>
      </div>
      <div style="font-family: 'Poppins', sans-serif; font-weight: 700; color: var(--gold-dark); font-size: 14px;">₹${(parseInt(item.price) || 0).toLocaleString('en-IN')}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 650px; width: 95%; background: var(--ivory); padding: 30px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); border: 1px solid rgba(201, 168, 76, 0.3); animation: fadeInUp 0.3s ease forwards; display: flex; flex-direction: column; max-height: 85vh; box-sizing: border-box; overflow: hidden;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(201, 168, 76, 0.2); padding-bottom: 15px; margin-bottom: 20px;">
        <div>
          <span class="section-label" style="margin-bottom: 2px;">Order Summary</span>
          <h3 style="font-family: 'Playfair Display', serif; font-size: 24px; margin: 0; color: var(--dark);">Order <em style="color: var(--gold-dark);">#${shortId}</em></h3>
        </div>
        <span onclick="closeOrderDetails()" style="font-size: 28px; cursor: pointer; color: var(--muted); transition: color 0.2s;" onmouseover="this.style.color='var(--gold-dark)'" onmouseout="this.style.color='var(--muted)'">&times;</span>
      </div>

      <div style="overflow-y: auto; flex-grow: 1; padding-right: 5px;">
        <!-- Two Column Details Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-bottom: 25px;">
          <!-- Customer Address Card -->
          <div style="background: rgba(255, 255, 255, 0.8); border: 1px solid rgba(201, 168, 76, 0.15); border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.01);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--gold-dark); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 15px; height: 15px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Customer & Address
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.5; color: var(--text);">
              <div><strong style="color: var(--dark);">Name:</strong> ${order.customer?.name || 'Guest Customer'}</div>
              <div><strong style="color: var(--dark);">Phone:</strong> ${order.customer?.phone || 'N/A'}</div>
              <div><strong style="color: var(--dark);">Address:</strong> <span style="font-style: italic; color: #555;">${order.customer?.address || 'No Address Provided'}</span></div>
            </div>
          </div>

          <!-- Order Stats Card -->
          <div style="background: rgba(255, 255, 255, 0.8); border: 1px solid rgba(201, 168, 76, 0.15); border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.01);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--gold-dark); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 15px; height: 15px;"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              Payment & Status
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.5; color: var(--text);">
              <div><strong style="color: var(--dark);">Payment ID:</strong> <span style="font-family: monospace; font-size: 11px; background: rgba(201,168,76,0.1); padding: 2px 6px; border-radius: 4px; color: var(--gold-dark); font-weight: 600;">${order.paymentId || 'N/A'}</span></div>
              <div><strong style="color: var(--dark);">Date:</strong> ${order.date ? new Date(order.date).toLocaleString('en-IN') : 'N/A'}</div>
              <div style="margin-top: 5px; padding-top: 5px; border-top: 1px dashed rgba(201, 168, 76, 0.15); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; color: var(--dark);">Total Amount:</span>
                <span style="font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 18px; color: var(--gold-dark);">₹${(order.total || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Items Ordered Header -->
        <h4 style="margin: 0 0 12px 0; color: var(--dark); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 15px; height: 15px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          Ordered Items (${(order.items || []).length})
        </h4>

        <!-- Items Container -->
        <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
          ${itemsHtml}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid rgba(201, 168, 76, 0.2); padding-top: 15px;">
        <button class="btn-primary" onclick="closeOrderDetails()" style="padding: 10px 25px; font-size: 11px; font-weight: 600; border-radius: 4px; cursor: pointer; background: var(--gold-dark); border: none; color: #fff; text-transform: uppercase; letter-spacing: 1px; font-family: 'Poppins', sans-serif; transition: all 0.2s;" onmouseover="this.style.background='var(--dark)'" onmouseout="this.style.background='var(--gold-dark)'">Close Details</button>
      </div>
    </div>
  `;

  modal.style.setProperty('display', 'flex', 'important');
  document.body.classList.add('modal-open');
}

window.closeOrderDetails = () => {
  const modal = document.getElementById('orderDetailModal');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
  }
  document.body.classList.remove('modal-open');
}

// =============================================
// MARQUEE RENDERING
// =============================================

function renderMarquee() {
  const track = document.getElementById('marquee-track');
  if (!track) return;

  const marqueeProductNames = [
    "Premium soft silk saree",
    "Dubion saree",
    "Glow Viscose saree",
    "White stone necklace",
    "Deep wine floral necklace",
    "Antique gold coin necklace with Lakshmi pendant"
  ];

  let content = marqueeProductNames.map(name => `
    <span class="marquee-item">
      ${name} <span class="marquee-dot"></span>
    </span>
  `).join('');

  // Duplicate for seamless loop
  track.innerHTML = content + content + content;
}

// =============================================
// PRODUCT GRID (FLIPKART / AMAZON HIGH-END ANIMATED EXPERIENCE)
// =============================================

function showGridShimmer(grid) {
  if (!grid) return;
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="app-skeleton-card">
      <div class="app-skeleton-img"></div>
      <div class="app-skeleton-info">
        <div class="app-skeleton-line" style="width: 40%;"></div>
        <div class="app-skeleton-line" style="width: 85%;"></div>
        <div class="app-skeleton-line" style="width: 60%; height: 16px;"></div>
        <div class="app-skeleton-line" style="width: 100%; height: 28px; margin-top: 5px;"></div>
      </div>
    </div>
  `).join('');
}

function setupScrollObserver() {
  const cards = document.querySelectorAll('.app-scroll-reveal:not(.revealed)');
  if (!cards.length) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    });

    cards.forEach((card, index) => {
      card.style.transitionDelay = `${(index % 4) * 0.08}s`;
      observer.observe(card);
    });
  } else {
    cards.forEach(card => card.classList.add('revealed'));
  }
}

function renderGrid(showShimmer = false) {
  const grid = document.getElementById('main-product-grid');
  if (!grid) return;

  if (showShimmer) {
    showGridShimmer(grid);
    setTimeout(() => renderGrid(false), 250);
    return;
  }

  let filtered = products;
  if (currentCategory && currentCategory !== 'all') {
    filtered = products.filter(p => p.category === currentCategory);
  }

  // Quick Chip / Search Filter
  if (window.appCurrentChip) {
    if (window.appCurrentChip === 'bestseller') {
      filtered = filtered.slice(0, 8);
    } else if (window.appCurrentChip === 'under3000') {
      filtered = filtered.filter(p => (extractPriceFromDesc(p.description) || p.price || 0) <= 3000);
    } else if (window.appCurrentChip === 'silk') {
      filtered = filtered.filter(p => p.category === 'silk');
    } else if (window.appCurrentChip === 'jewellery') {
      filtered = filtered.filter(p => p.category === 'jewellery');
    } else if (window.appCurrentChip === 'offers') {
      filtered = filtered.filter(p => (extractPriceFromDesc(p.description) || p.price || 0) > 1500);
    }
  }

  // App Search query filter
  if (window.appSearchQuery && window.appSearchQuery.trim()) {
    const q = window.appSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  // Apply Sorting
  if (currentSort === 'low') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (currentSort === 'high') {
    filtered.sort((a, b) => b.price - a.price);
  } else {
    // Default: Sort by position (ascending)
    filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #a39587;">
        <div style="font-size: 38px; margin-bottom: 10px;">🔍</div>
        <h4 style="color: #fff; font-size: 16px; margin-bottom: 6px;">No Matching Products Found</h4>
        <p style="font-size: 12px; margin-bottom: 15px;">Try exploring another category or clearing your search.</p>
        <button class="btn-primary" onclick="appFilterCategory('all')" style="padding: 8px 18px; font-size: 11px;">View All Items</button>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((p, idx) => {
    const inWishlist = wishlist.find(w => w.id == p.id);
    const isOOS = p.stock === 'Out of Stock';
    const actualPrice = extractPriceFromDesc(p.description) || p.price || 0;
    // Calculate realistic MRP & Discount percentage (35% to 45% discount like Flipkart)
    const discountPercent = 35 + ((p.id ? String(p.id).charCodeAt(0) : idx) % 15);
    const mrpPrice = Math.round(actualPrice / (1 - discountPercent / 100));
    const ratingScore = (4.7 + ((idx % 3) * 0.1)).toFixed(1);
    const reviewCount = 45 + ((idx * 17) % 150);

    return `
    <div class="product-card app-scroll-reveal" onclick="openProductDetail(${p.id})">
      ${isOOS 
        ? `<div class="oos-ribbon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:9px;height:9px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Sold Out</div>` 
        : `<span class="app-card-discount">${discountPercent}% OFF</span>`
      }

      <div class="product-img ${isOOS ? 'out-of-stock' : ''}">
        <img src="${optimizeImageUrl(p.image || p.img)}" width="300" height="400" class="img-main" loading="lazy" decoding="async" ${getSEOAttributes(p)} onerror="this.onerror=null; this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; this.style.background='linear-gradient(135deg,#2b1f13,#1a1209)';">
        <img src="${optimizeImageUrl(p.imageHover || p.imgHover || p.image || p.img)}" width="300" height="400" class="img-hover" loading="lazy" decoding="async" ${getSEOAttributes(p)} onerror="this.style.display='none'">
        
        <div class="app-card-rating">
          <span style="color:#ffc107;">★</span> ${ratingScore} <em>(${reviewCount})</em>
        </div>

        <div class="product-wish ${inWishlist ? 'active' : ''}" onclick="event.stopPropagation(); addToWishlist('${p.id}')">
          <svg class="wish-icon-svg" viewBox="0 0 24 24" fill="${inWishlist ? '#e91e63' : 'none'}" stroke="${inWishlist ? '#e91e63' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
        </div>
      </div>

      <div class="product-info">
        <div class="product-type">${p.category ? p.category.toUpperCase() : 'HANDPICKED'}</div>
        <h3 class="product-name" title="${p.name}">${p.name}</h3>

        <div class="app-card-price-row">
          <span class="price-main">₹${actualPrice.toLocaleString('en-IN')}</span>
          <span class="price-mrp">₹${mrpPrice.toLocaleString('en-IN')}</span>
          <span class="price-save">${discountPercent}% off</span>
        </div>

        <div class="app-card-delivery">
          <span>⚡</span> <span>Free Next-Day Delivery</span>
        </div>

        ${isOOS
        ? `<button class="btn-oos" style="width:100%;padding:8px 0;font-size:10px;font-weight:700;border-radius:8px;background:#2a1a12;color:#998a7a;border:1px solid #442a1b;cursor:not-allowed;" disabled>Sold Out</button>`
        : `<button class="btn-primary" onclick="event.stopPropagation(); addToCart('${p.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              Add to Cart
            </button>`
        }
      </div>
    </div>`;
  }).join('');

  // Trigger smooth scroll reveal animation
  requestAnimationFrame(setupScrollObserver);
}

window.switchCategory = (cat) => {
  currentCategory = cat;
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === cat);
  });
  renderGrid(true);
}

window.selectCategory = (cat) => {
  // Navigate to collections page
  localStorage.setItem('rokea_selected_category', cat);
  window.location.href = 'collections.html';
}

window.backToCategories = () => {
  // Navigate back to home page category section
  window.location.href = 'index.html#products';
}

window.applySort = (sortType) => {
  currentSort = sortType;
  renderGrid();
}

function renderAdminList() {
  const list = document.getElementById('adminProductList');
  if (!list) return;

  let filtered = products;
  if (adminCurrentProductFilter !== 'all') {
    filtered = products.filter(p => p.category === adminCurrentProductFilter);
  }

  list.innerHTML = filtered.map((p, idx) => {
    const isOutOfStock = p.stock === 'Out of Stock';
    return `
    <div class="admin-item" data-id="${p.id}" style="background-color: ${isOutOfStock ? 'rgba(217, 48, 37, 0.05)' : 'transparent'}; border-left: 3px solid ${isOutOfStock ? '#D93025' : '#4CAF50'};">
      <div class="drag-handle" style="cursor: grab; padding: 0 10px; color: #ccc;">☰</div>
      <div class="admin-img" style="width:40px;height:40px;border-radius:4px;flex-shrink:0; background:url('${p.image || p.img}') center/cover; opacity: ${isOutOfStock ? '0.5' : '1'};"></div>
      <div class="admin-item-info">
        <div style="font-size:12px; font-weight:600; ${isOutOfStock ? 'color: #999;' : ''}">${p.name}</div>
        <div style="font-size:10px; color:var(--muted); display: flex; align-items: center; gap: 8px;">
          <span>${p.category} • ₹${p.price.toLocaleString('en-IN')}</span>
          <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; background: ${isOutOfStock ? '#ffebee' : '#e8f5e9'}; font-size: 9px; font-weight: 600; color: ${isOutOfStock ? '#D93025' : '#388e3c'};">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${isOutOfStock ? '#D93025' : '#4CAF50'};"></span>
            ${isOutOfStock ? 'SOLD OUT' : 'IN STOCK'}
          </span>
        </div>
      </div>
      <div class="admin-item-actions">
        <button class="admin-btn btn-edit" onclick="editProductById(${p.id})">Edit</button>
        <button class="admin-btn btn-delete" onclick="deleteProductById(${p.id})">Delete</button>
      </div>
    </div>`;
  }).join('');

  // Initialize Sortable
  if (window.Sortable && filtered.length > 1) {
    Sortable.create(list, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: function () {
        updateProductPositions();
      }
    });
  }
}

function updateProductPositions() {
  const list = document.getElementById('adminProductList');
  const items = list.querySelectorAll('.admin-item');
  const newOrderIds = Array.from(items).map(item => item.getAttribute('data-id'));

  // Create a map of IDs to their new positions based on the UI
  const idToPosition = {};
  newOrderIds.forEach((id, index) => {
    idToPosition[id] = index;
  });

  // Update positions in the products array
  // If we are filtered, we only update the positions of the filtered items relative to each other?
  // Actually, it's easier to maintain a global position.
  // When we reorder in a filtered view, we should update the 'position' field of these items.

  // To keep it simple and consistent:
  // 1. Get the current filtered items.
  // 2. Reorder them in the global 'products' array based on the new UI order.

  const currentFilteredIds = newOrderIds;
  const otherProducts = products.filter(p => !currentFilteredIds.includes(p.id.toString()));
  const reorderedFilteredProducts = currentFilteredIds.map(id => products.find(p => p.id.toString() === id));

  // Reconstruct products array: others + reordered
  // Actually, to maintain overall order, we can just update the 'position' field.

  products.forEach(p => {
    if (idToPosition[p.id.toString()] !== undefined) {
      // We need to offset this position based on where the filtered group starts in the global list?
      // No, let's just use absolute positions.
      p.position = idToPosition[p.id.toString()];
    } else {
      // For products not in the current filter, we can keep their position or shift them.
      // Simplest: just update the ones we dragged.
    }
  });

  // Re-sort products by position
  products.sort((a, b) => (a.position || 0) - (b.position || 0));

  // Re-normalize positions 0, 1, 2...
  products.forEach((p, i) => p.position = i);

  saveProducts();

  // Sync all changed positions to Firestore
  if (db) {
    products.forEach(p => {
      db.collection("products").doc(p.id.toString()).update({ position: p.position })
        .catch(err => console.error("Position sync error:", err));
    });
  }
}

// Helper to find index by ID since positions change
window.editProductById = (id) => {
  const idx = products.findIndex(p => p.id == id);
  if (idx > -1) editProduct(idx);
}

window.deleteProductById = (id) => {
  const idx = products.findIndex(p => p.id == id);
  if (idx > -1) deleteProduct(idx);
}

function renderAll() {
  renderGrid();
  renderAdminList();
  renderMarquee();
  if (typeof renderBestsellerShowcase === 'function') {
    renderBestsellerShowcase();
  }
  // Load product page: prefer URL ?id=, fallback to sessionStorage (after refresh)
  const activeId = (typeof urlId !== 'undefined' && urlId)
    ? urlId
    : (window._pendingProductId || sessionStorage.getItem('rokea_current_product_id'));
  if (activeId && document.getElementById('detailMainImg')) {
    initProductPage(activeId);
  }
}

const adminModal = document.getElementById('adminModal');
const productForm = document.getElementById('productForm');

if (productForm) {
  productForm.onsubmit = (e) => {
    e.preventDefault();
    const editProductId = document.getElementById('editProductId').value;
    const newProd = {
      name: document.getElementById('prodName').value,
      category: document.getElementById('prodCategory').value,
      price: parseInt(document.getElementById('prodPrice').value),
      image: document.getElementById('prodImg').value,
      imageHover: document.getElementById('prodImgHover').value,
      extraImages: document.getElementById('prodExtraImgs') ? document.getElementById('prodExtraImgs').value.split(',').map(s => s.trim()).filter(Boolean) : [],
      stock: document.getElementById('prodStock').value,
      description: document.getElementById('prodDesc').value,
      productCare: document.getElementById('prodCare').value,
      slug: generateSlug(document.getElementById('prodName').value),
      seoTitle: document.getElementById('seoTitle') ? document.getElementById('seoTitle').value : '',
      seoKeyword: document.getElementById('seoKeyword') ? document.getElementById('seoKeyword').value : '',
      seoDesc: document.getElementById('seoDesc') ? document.getElementById('seoDesc').value : '',
      seoSecondaryKeywords: document.getElementById('seoSecondaryKeywords') ? document.getElementById('seoSecondaryKeywords').value : '',
      seoLongTailKeywords: document.getElementById('seoLongTailKeywords') ? document.getElementById('seoLongTailKeywords').value : '',
      seoTransactionalKeywords: document.getElementById('seoTransactionalKeywords') ? document.getElementById('seoTransactionalKeywords').value : '',
      seoCommercialKeywords: document.getElementById('seoCommercialKeywords') ? document.getElementById('seoCommercialKeywords').value : '',
      seoKeywords: document.getElementById('seoKeywords') ? document.getElementById('seoKeywords').value : '',
      seoSearchIntent: document.getElementById('seoSearchIntent') ? document.getElementById('seoSearchIntent').value : '',
      seoCanonical: document.getElementById('seoCanonical') ? document.getElementById('seoCanonical').value : '',
      seoRobots: document.getElementById('seoRobots') ? document.getElementById('seoRobots').value : 'index, follow',
      seoImgAlt: document.getElementById('seoImgAlt') ? document.getElementById('seoImgAlt').value : '',
      seoOgTags: document.getElementById('seoOgTags') ? document.getElementById('seoOgTags').value : '',
      seoTwitterTags: document.getElementById('seoTwitterTags') ? document.getElementById('seoTwitterTags').value : '',
      seoProductSchema: document.getElementById('seoProductSchema') ? document.getElementById('seoProductSchema').value : '',
      seoBreadcrumbSchema: document.getElementById('seoBreadcrumbSchema') ? document.getElementById('seoBreadcrumbSchema').value : '',
      seoWebPageSchema: document.getElementById('seoWebPageSchema') ? document.getElementById('seoWebPageSchema').value : '',
      seoOrganizationSchema: document.getElementById('seoOrganizationSchema') ? document.getElementById('seoOrganizationSchema').value : '',
      seoFaq: document.getElementById('seoFaq') ? document.getElementById('seoFaq').value : ''
    };

    if (editProductId) {
      const existingIdx = products.findIndex(p => p.id.toString() === editProductId.toString());
      if (existingIdx > -1) {
        newProd.id = products[existingIdx].id;
        newProd.position = products[existingIdx].position; // Keep existing position
        newProd.slug = products[existingIdx].slug || newProd.slug;
        products[existingIdx] = newProd;
      } else {
        newProd.id = parseFloat(editProductId);
        newProd.position = products.length;
        products.push(newProd);
      }
    } else {
      newProd.id = Date.now();
      newProd.position = -1; // Set to -1 to put at top during re-normalization
      products.unshift(newProd);
    }

    // Re-normalize positions after add/edit
    products.sort((a, b) => (a.position ?? -1) - (b.position ?? -1));
    products.forEach((p, i) => p.position = i);

    // Sync to Firestore
    if (db) {
      db.collection("products").doc(newProd.id.toString()).set(newProd)
        .then(() => console.log("Product synced to Cloud"))
        .catch(err => {
          console.error("Cloud sync error:", err);
          showToast("Cloud sync failed! " + err.message, "error", "Reverting local change...");
          alert("Cloud Sync Error: " + err.message + "\n\nPlease check if your Firestore Security Rules allow writes for anonymous users.");
        });
    }

    saveProducts();
    currentCategory = newProd.category;
    switchCategory(currentCategory);
    productForm.reset();
    document.getElementById('editProductId').value = "";
    document.getElementById('submitBtn').innerText = "Save Product";
    alert("Successfully Saved: " + newProd.name);
  };
}

window.editProduct = (idx) => {
  const p = products[idx];
  document.getElementById('editProductId').value = p.id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodCategory').value = p.category;
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('prodImg').value = p.image || p.img;
  document.getElementById('prodImgHover').value = p.imageHover || p.imgHover || p.image || p.img;
  if (document.getElementById('prodExtraImgs')) document.getElementById('prodExtraImgs').value = p.extraImages ? p.extraImages.join(', ') : "";
  document.getElementById('prodStock').value = p.stock || "In Stock";
  document.getElementById('prodDesc').value = p.description || "";
  if (document.getElementById('prodCare')) document.getElementById('prodCare').value = p.productCare || "";

  if (document.getElementById('seoTitle')) document.getElementById('seoTitle').value = p.seoTitle || "";
  if (document.getElementById('seoKeyword')) document.getElementById('seoKeyword').value = p.seoKeyword || "";
  if (document.getElementById('seoDesc')) document.getElementById('seoDesc').value = p.seoDesc || "";
  if (document.getElementById('seoSecondaryKeywords')) document.getElementById('seoSecondaryKeywords').value = p.seoSecondaryKeywords || "";
  if (document.getElementById('seoLongTailKeywords')) document.getElementById('seoLongTailKeywords').value = p.seoLongTailKeywords || "";
  if (document.getElementById('seoTransactionalKeywords')) document.getElementById('seoTransactionalKeywords').value = p.seoTransactionalKeywords || "";
  if (document.getElementById('seoCommercialKeywords')) document.getElementById('seoCommercialKeywords').value = p.seoCommercialKeywords || "";
  if (document.getElementById('seoKeywords')) document.getElementById('seoKeywords').value = p.seoKeywords || "";
  if (document.getElementById('seoSearchIntent')) document.getElementById('seoSearchIntent').value = p.seoSearchIntent || "";
  if (document.getElementById('seoCanonical')) document.getElementById('seoCanonical').value = p.seoCanonical || "";
  if (document.getElementById('seoRobots')) document.getElementById('seoRobots').value = p.seoRobots || "index, follow";
  if (document.getElementById('seoImgAlt')) document.getElementById('seoImgAlt').value = p.seoImgAlt || "";
  if (document.getElementById('seoOgTags')) document.getElementById('seoOgTags').value = p.seoOgTags || "";
  if (document.getElementById('seoTwitterTags')) document.getElementById('seoTwitterTags').value = p.seoTwitterTags || "";
  if (document.getElementById('seoProductSchema')) document.getElementById('seoProductSchema').value = p.seoProductSchema || "";
  if (document.getElementById('seoBreadcrumbSchema')) document.getElementById('seoBreadcrumbSchema').value = p.seoBreadcrumbSchema || "";
  if (document.getElementById('seoWebPageSchema')) document.getElementById('seoWebPageSchema').value = p.seoWebPageSchema || "";
  if (document.getElementById('seoOrganizationSchema')) document.getElementById('seoOrganizationSchema').value = p.seoOrganizationSchema || "";
  if (document.getElementById('seoFaq')) document.getElementById('seoFaq').value = p.seoFaq || "";

  document.getElementById('submitBtn').innerText = "Update Product";
  if (adminModal) adminModal.querySelector('.admin-main').scrollTop = 0;
};

window.generateSeoFromDescription = () => {
  const name = document.getElementById('prodName').value || 'Product';
  const category = document.getElementById('prodCategory').value || 'Category';
  const price = document.getElementById('prodPrice').value || '0';
  const descRaw = document.getElementById('prodDesc').value || '';
  const care = document.getElementById('prodCare').value || '';
  const imgUrl = document.getElementById('prodImg').value || '';
  const stock = document.getElementById('prodStock').value || 'In Stock';
  const slug = generateSlug(name) || 'product';
  const url = `https://rokeabyrk.com/product/${slug}`;

  if (!descRaw) {
    alert("Please enter a product description first.");
    return;
  }

  // --- Advanced Local Rule-Based Generation ---
  const cleanDesc = descRaw.split('\n')[0].replace(/^[✦•\-\*]\s*/, '').trim() || name;
  const shortDesc = cleanDesc.slice(0, 150) + (cleanDesc.length > 150 ? '...' : '');
  const lowerName = name.toLowerCase();
  const lowerCat = category.toLowerCase();

  // Keyword Generation
  const words = lowerName.split(' ').filter(w => w.length > 3);
  const primaryKws = words.join(', ');

  const focusKeyword = lowerName;
  const secondaryKeywords = `${lowerName} online, authentic ${lowerCat}, ${lowerCat} india`;
  const longTailKeywords = `buy ${lowerName} online best price, authentic ${lowerName} ${lowerCat}, ${lowerName} rokea by rk`;
  const transactionalKeywords = `buy ${lowerName}, order ${lowerCat} online, best price ${lowerName}, shop ${lowerCat}`;
  const commercialKeywords = `${lowerName} reviews, top ${lowerCat} brands, premium ${lowerCat}`;
  const seoKeywords = `${focusKeyword}, ${secondaryKeywords}, luxury ${lowerCat}`;

  // Schemas
  const faqArray = [
    {
      "question": `What is the price of ${name}?`,
      "answer": `The current best price for ${name} is ₹${price} at ROKEA by RK.`
    },
    {
      "question": `Is ${name} available in stock?`,
      "answer": `Yes, ${name} is currently ${stock}. You can order it directly online.`
    },
    {
      "question": `How should I care for my ${category}?`,
      "answer": care || `We recommend professional dry cleaning for premium ${lowerCat} to maintain their quality and longevity.`
    }
  ];

  const productSchema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": name,
    "description": shortDesc,
    "brand": { "@type": "Brand", "name": "ROKEA by RK" },
    "image": imgUrl,
    "offers": {
      "@type": "Offer",
      "priceCurrency": "INR",
      "price": price,
      "availability": stock.toLowerCase().includes('out') ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      "url": url
    }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://rokeabyrk.com/" },
      { "@type": "ListItem", "position": 2, "name": category, "item": `https://rokeabyrk.com/category/${category.toLowerCase()}` },
      { "@type": "ListItem", "position": 3, "name": name, "item": url }
    ]
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `${name} | ROKEA by RK`,
    "description": shortDesc,
    "url": url,
    "publisher": { "@type": "Organization", "name": "ROKEA by RK" }
  };

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ROKEA by RK",
    "url": "https://rokeabyrk.com/",
    "logo": "https://rokeabyrk.com/images/logo.png"
  };

  // Populate Form Fields
  if (document.getElementById('seoTitle')) document.getElementById('seoTitle').value = `${name} | ROKEA by RK`;
  if (document.getElementById('seoKeyword')) document.getElementById('seoKeyword').value = focusKeyword;
  if (document.getElementById('seoDesc')) document.getElementById('seoDesc').value = `Buy ${name} online. ${shortDesc} Shop authentic luxury at ROKEA by RK.`;
  if (document.getElementById('seoSecondaryKeywords')) document.getElementById('seoSecondaryKeywords').value = secondaryKeywords;
  if (document.getElementById('seoLongTailKeywords')) document.getElementById('seoLongTailKeywords').value = longTailKeywords;
  if (document.getElementById('seoTransactionalKeywords')) document.getElementById('seoTransactionalKeywords').value = transactionalKeywords;
  if (document.getElementById('seoCommercialKeywords')) document.getElementById('seoCommercialKeywords').value = commercialKeywords;
  if (document.getElementById('seoKeywords')) document.getElementById('seoKeywords').value = seoKeywords;
  if (document.getElementById('seoSearchIntent')) document.getElementById('seoSearchIntent').value = "Transactional, Commercial Investigation";
  if (document.getElementById('seoCanonical')) document.getElementById('seoCanonical').value = url;
  if (document.getElementById('seoRobots')) document.getElementById('seoRobots').value = "index, follow, max-image-preview:large";
  if (document.getElementById('seoImgAlt')) document.getElementById('seoImgAlt').value = `Premium ${name} - ROKEA by RK`;

  if (document.getElementById('seoOgTags')) document.getElementById('seoOgTags').value =
    `<meta property="og:title" content="${name} | ROKEA by RK">
<meta property="og:description" content="${shortDesc}">
<meta property="og:image" content="${imgUrl}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="product">`;

  if (document.getElementById('seoTwitterTags')) document.getElementById('seoTwitterTags').value =
    `<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${name} | ROKEA by RK">
<meta name="twitter:description" content="${shortDesc}">
<meta name="twitter:image" content="${imgUrl}">`;

  if (document.getElementById('seoProductSchema')) document.getElementById('seoProductSchema').value = JSON.stringify(productSchema, null, 2);
  if (document.getElementById('seoBreadcrumbSchema')) document.getElementById('seoBreadcrumbSchema').value = JSON.stringify(breadcrumbSchema, null, 2);
  if (document.getElementById('seoWebPageSchema')) document.getElementById('seoWebPageSchema').value = JSON.stringify(webPageSchema, null, 2);
  if (document.getElementById('seoOrganizationSchema')) document.getElementById('seoOrganizationSchema').value = JSON.stringify(orgSchema, null, 2);
  if (document.getElementById('seoFaq')) document.getElementById('seoFaq').value = JSON.stringify(faqArray, null, 2);

  alert('Advanced SEO Generated Locally! Please review before saving.');
};

window.bulkGenerateAllSeo = async () => {
  if (!confirm("This will loop through ALL products and generate advanced SEO locally. Are you sure?")) return;

  const btn = document.getElementById('bulkGenerateSeoBtn');
  const originalText = btn.innerText;
  btn.disabled = true;

  let generatedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    btn.innerText = `Processing ${i + 1} / ${products.length} (${p.name})`;

    const name = p.name || 'Product';
    const category = p.category || 'Category';
    const price = p.price || '0';
    const descRaw = p.description || '';
    const care = p.productCare || '';
    const imgUrl = p.image || '';
    const stock = p.stock || 'In Stock';
    const slug = generateSlug(name) || 'product';
    const url = `https://rokeabyrk.com/product/${slug}`;

    const cleanDesc = descRaw.split('\n')[0].replace(/^[✦•\-\*]\s*/, '').trim() || name;
    const shortDesc = cleanDesc.slice(0, 150) + (cleanDesc.length > 150 ? '...' : '');
    const lowerName = name.toLowerCase();
    const lowerCat = category.toLowerCase();

    p.seoTitle = `${name} | ROKEA by RK`;
    p.seoKeyword = lowerName;
    p.seoDesc = `Buy ${name} online. ${shortDesc} Shop authentic luxury at ROKEA by RK.`;
    p.seoSecondaryKeywords = `${lowerName} online, authentic ${lowerCat}, ${lowerCat} india`;
    p.seoLongTailKeywords = `buy ${lowerName} online best price, authentic ${lowerName} ${lowerCat}, ${lowerName} rokea by rk`;
    p.seoTransactionalKeywords = `buy ${lowerName}, order ${lowerCat} online, best price ${lowerName}, shop ${lowerCat}`;
    p.seoCommercialKeywords = `${lowerName} reviews, top ${lowerCat} brands, premium ${lowerCat}`;
    p.seoKeywords = `${p.seoKeyword}, ${p.seoSecondaryKeywords}, luxury ${lowerCat}`;
    p.seoSearchIntent = "Transactional, Commercial Investigation";
    p.seoCanonical = url;
    p.seoRobots = "index, follow, max-image-preview:large";
    p.seoImgAlt = `Premium ${name} - ROKEA by RK`;

    p.seoOgTags = `<meta property="og:title" content="${name} | ROKEA by RK">\n<meta property="og:description" content="${shortDesc}">\n<meta property="og:image" content="${imgUrl}">\n<meta property="og:url" content="${url}">\n<meta property="og:type" content="product">`;
    p.seoTwitterTags = `<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${name} | ROKEA by RK">\n<meta name="twitter:description" content="${shortDesc}">\n<meta name="twitter:image" content="${imgUrl}">`;

    p.seoProductSchema = JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": name,
      "description": shortDesc,
      "brand": { "@type": "Brand", "name": "ROKEA by RK" },
      "image": imgUrl,
      "offers": { "@type": "Offer", "priceCurrency": "INR", "price": price, "availability": stock.toLowerCase().includes('out') ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", "url": url }
    });

    p.seoBreadcrumbSchema = JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://rokeabyrk.com/" },
        { "@type": "ListItem", "position": 2, "name": category, "item": `https://rokeabyrk.com/category/${category.toLowerCase()}` },
        { "@type": "ListItem", "position": 3, "name": name, "item": url }
      ]
    });

    p.seoWebPageSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": p.seoTitle,
      "description": shortDesc,
      "url": url,
      "publisher": { "@type": "Organization", "name": "ROKEA by RK" }
    });

    p.seoOrganizationSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "ROKEA by RK",
      "url": "https://rokeabyrk.com/",
      "logo": "https://rokeabyrk.com/images/logo.png"
    });

    p.seoFaq = JSON.stringify([
      { "question": `What is the price of ${name}?`, "answer": `The current best price for ${name} is ₹${price} at ROKEA by RK.` },
      { "question": `Is ${name} available in stock?`, "answer": `Yes, ${name} is currently ${stock}. You can order it directly online.` },
      { "question": `How should I care for my ${category}?`, "answer": care || `We recommend professional dry cleaning for premium ${lowerCat} to maintain their quality and longevity.` }
    ]);

    if (db) {
      try {
        await db.collection("products").doc(p.id.toString()).set(p);
        generatedCount++;
      } catch (e) {
        console.error("Bulk save failed for " + name, e);
      }
    }
  }

  saveProducts();
  btn.innerText = originalText;
  btn.disabled = false;
  alert(`Bulk SEO Generation Completed! Successfully generated and saved SEO for ${generatedCount} products.`);
};



window.deleteProduct = (idx) => {
  if (confirm('Delete this product permanently?')) {
    const p = products[idx];
    products.splice(idx, 1);
    saveProducts();
    if (db && p.id) {
      db.collection("products").doc(p.id.toString()).delete()
        .then(() => console.log("Product deleted from cloud"))
        .catch(err => console.error("Cloud delete error:", err));
    }
  }
};

window.editProductById = (id) => {
  const idx = products.findIndex(p => p.id == id);
  if (idx > -1) window.editProduct(idx);
};

window.deleteProductById = (id) => {
  const idx = products.findIndex(p => p.id == id);
  if (idx > -1) window.deleteProduct(idx);
};

window.deleteAllProducts = () => {
  if (confirm("Are you sure you want to delete ALL products? This action cannot be undone.")) {
    if (confirm("This will permanently delete all products from your database. Proceed?")) {
      const allIds = products.map(p => p.id);
      products = [];
      saveProducts();

      if (db) {
        allIds.forEach(id => {
          db.collection("products").doc(id.toString()).delete()
            .catch(err => console.error("Cloud delete error:", err));
        });
        console.log("All products deleted from cloud");
      }
      alert("All products have been successfully deleted.");
    }
  }
};

// Full Story Logic
const storyModal = document.getElementById('storyModal');
window.openFullStory = () => { if (storyModal) storyModal.style.display = 'flex'; }
window.closeFullStory = () => { if (storyModal) storyModal.style.display = 'none'; }

// Close modals on background click
window.onclick = (e) => {
  if (e.target === adminModal) return;
  if (e.target === authModal) closeAuth();
  if (e.target === storyModal) closeFullStory();
  if (e.target === document.getElementById('leadModal')) closeLeadModal();
  if (e.target === document.getElementById('appointmentModal')) closeAppointmentModal();
  if (e.target === document.getElementById('productDetailModal')) closeProductDetail();
  if (e.target === document.getElementById('shareModal')) closeShareModal();
}

// PRODUCT DETAIL LOGIC
let currentDetailImages = [];
let currentDetailIndex = 0;
let touchstartX = 0;
let touchendX = 0;

window.openProductDetail = (productId) => {
  if (!productId) return;
  const searchKey = String(productId).trim().toLowerCase();
  const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const p = (typeof products !== 'undefined' && products.length > 0)
    ? products.find(prod =>
        String(prod.id) === String(productId) ||
        (prod.slug && prod.slug.toLowerCase() === searchKey) ||
        (prod.name && toSlug(prod.name) === searchKey) ||
        (prod.name && prod.name.toLowerCase() === searchKey)
      )
    : null;

  if (p) {
    window.location.href = getProductLink(p);
  } else {
    window.location.href = (isNativeApp() || isLocalhost)
      ? `product-details.html?id=${encodeURIComponent(productId)}`
      : `/product-details?id=${encodeURIComponent(productId)}`;
  }
};

function renderRelatedProducts(category, currentId) {
  const slider = document.getElementById('relatedSlider');
  if (!slider) return;
  // Fallback to all products if less than 5 related
  let related = products.filter(p => p.category === category && p.id != currentId);
  if (related.length < 5) related = products.filter(p => p.id != currentId);
  slider.innerHTML = related.map((p, idx) => `
    <div class="slider-item product-card" onclick="openProductDetail(${p.id})" style="flex: 0 0 calc(20% - 12px); min-width: 190px; overflow: visible;">
      <div style="position: relative; width: 100%; aspect-ratio: 4/5; background: #fafafa;">
         <img src="${optimizeImageUrl(p.imageHover || p.imgHover || p.image || p.img)}" width="300" height="400" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" decoding="async" ${getSEOAttributes(p)} onerror="this.onerror=null; this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; this.style.background='linear-gradient(135deg,#f0e6d3,#faf6ef)';">
         <div style="position: absolute; top: 12px; left: 12px; border: 1px solid rgba(0,0,0,0.3); color: #222; padding: 4px 14px; font-size: 10px; border-radius: 20px; background: rgba(255,255,255,0.85); display: ${idx % 3 === 0 ? 'none' : 'block'}">Best Seller</div>
         <div class="product-share" style="top: 12px; right: 12px; width: 32px; height: 32px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12);" onclick="event.stopPropagation(); shareProduct(${p.id})">
           <svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
         </div>
      </div>
      <div style="padding: 16px 15px; display: flex; flex-direction: column; flex-grow: 1;">
         <div style="font-size: 13px; color: var(--gold-dark); font-weight: 700; margin-bottom: 8px;">₹${(extractPriceFromDesc(p.description) || p.price || 0).toLocaleString('en-IN')}</div>
         <div style="font-family: 'Poppins', sans-serif; font-size: 11px; color: #444; text-transform: uppercase; margin-bottom: 12px; font-weight: 500; letter-spacing: 0px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.5; height: 33px;">${p.name}</div>
      </div>
    </div>`).join('');
}

window.scrollSlider = (dir) => {
  const slider = document.getElementById('relatedSlider');
  slider.scrollBy({ left: 300 * dir, behavior: 'smooth' });
}

window.closeProductDetail = () => {
  const modal = document.getElementById('productDetailModal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  modalHistory = [];
}

window.modalGoBack = () => {
  if (modalHistory.length > 0) {
    const lastId = modalHistory.pop();
    openProductDetail(lastId, true);
  }
}

window.switchDetailImage = (index) => {
  if (index < 0 || index >= currentDetailImages.length) return;
  currentDetailIndex = index;
  const src = currentDetailImages[index];
  document.getElementById('detailMainImg').src = src;

  const tItems = document.querySelectorAll('.thumb-item');
  tItems.forEach(t => { t.classList.remove('active'); t.style.borderColor = 'transparent'; });

  if (tItems[index]) {
    tItems[index].classList.add('active');
    tItems[index].style.borderColor = '#000';
  }
}

window.switchDetailTab = (tab) => {
  const descBtn = document.getElementById('tabDescBtn');
  const careBtn = document.getElementById('tabCareBtn');
  const descContent = document.getElementById('detailDesc');
  const careContent = document.getElementById('detailCare');

  if (!descBtn || !careBtn || !descContent || !careContent) return;

  if (tab === 'desc') {
    descBtn.classList.add('active');
    descBtn.style.background = '#000';
    descBtn.style.color = '#fff';
    descBtn.style.borderColor = '#000';

    careBtn.classList.remove('active');
    careBtn.style.background = '#fff';
    careBtn.style.color = '#888';
    careBtn.style.borderColor = '#eee';

    descContent.style.display = 'block';
    careContent.style.display = 'none';
  } else {
    careBtn.classList.add('active');
    careBtn.style.background = '#000';
    careBtn.style.color = '#fff';
    careBtn.style.borderColor = '#000';

    descBtn.classList.remove('active');
    descBtn.style.background = '#fff';
    descBtn.style.color = '#888';
    descBtn.style.borderColor = '#eee';

    descContent.style.display = 'none';
    careContent.style.display = 'block';
  }
}

function handleMainImgSwipe() {
  if (touchendX < touchstartX - 40) { // Swipe Left -> Next
    if (currentDetailIndex < currentDetailImages.length - 1) {
      switchDetailImage(currentDetailIndex + 1);
    }
  }
  if (touchendX > touchstartX + 40) { // Swipe Right -> Prev
    if (currentDetailIndex > 0) {
      switchDetailImage(currentDetailIndex - 1);
    }
  }
}

// AUTOMATIC SIGN UP / VIP POPUP LOGIC (Trigger exactly 5 seconds after page entry)
setTimeout(() => {
  const authModal = document.getElementById('authModal') || document.getElementById('leadModal');
  if (authModal && !currentUser && !sessionStorage.getItem('signUpShown')) {
    window.openAuth(false); // Opens Sign Up view
    sessionStorage.setItem('signUpShown', 'true');
  }
}, 5000);

window.closeLeadModal = () => {
  window.closeAuth();
};

window.handleLead = (e) => {
  window.handleContactForm(e);
};

// CONTACT FORM SUBMISSION LOGIC
window.handleContactForm = (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const nameInput = document.getElementById('contactFullName') || document.getElementById('leadName');
  const phoneInput = document.getElementById('contactPhoneNumber') || document.getElementById('leadPhone');
  const emailInput = document.getElementById('contactEmailAddress');
  const interestSelect = document.getElementById('contactInterestSelect') || document.getElementById('leadInterest');
  const messageText = document.getElementById('contactMessageText');

  const name = nameInput ? nameInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const interest = interestSelect ? interestSelect.value : 'Bridal Saree Consultation';
  const message = messageText ? messageText.value.trim() : '';

  if (!name || !phone) {
    alert('Please enter your full name and phone number.');
    return;
  }

  const btn = document.getElementById('contactSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>SUBMITTING...</span>';
  }

  const contactData = { name, phone, email, interest, message, date: new Date().toISOString() };

  // Save to localStorage
  const leads = JSON.parse(localStorage.getItem('saforio_leads')) || [];
  leads.push({ name, phone, email, interest, message, date: new Date().toLocaleDateString() });
  localStorage.setItem('saforio_leads', JSON.stringify(leads));

  // Save to Firestore if available
  if (typeof db !== 'undefined' && db) {
    db.collection("leads").add(contactData)
      .then(() => console.log("Contact enquiry saved to Firestore!"))
      .catch(err => console.error("Firestore error:", err));
  }

  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✓ ENQUIRY SENT</span>';
      btn.style.background = '#2E7D32';
    }
    alert("Thank you, " + name + "! Your consultation request has been received. Our master stylist will contact you on WhatsApp/Phone within 2 hours.");
    const form = document.getElementById('contactForm');
    if (form) form.reset();
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = '<span>REQUEST CONSULTATION</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        btn.style.background = '';
      }
    }, 4000);
  }, 600);
};

// ── APPOINTMENT / CONSULTATION POPUP MODAL LOGIC ──
window.openAppointmentModal = () => {
  let modal = document.getElementById('appointmentModal');
  if (!modal) {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.id = 'appointmentModal';
    modalDiv.innerHTML = `
      <div class="modal-content appointment-popup-content">
        <span class="modal-close" onclick="closeAppointmentModal()">×</span>
        <div class="appointment-popup-inner">
          <div class="appointment-popup-header">
            <span class="contact-form-pill">✨ Priority Consultation</span>
            <h3 class="appointment-popup-title">Book an <em>Appointment</em></h3>
            <p class="appointment-popup-sub">
              Connect with our master stylists for bespoke bridal sarees, jewellery &amp; custom blouse consultations.
            </p>
          </div>
          <form id="appointmentForm" class="contact-form" onsubmit="handleAppointmentModal(event)">
            <div class="contact-form-row">
              <div class="contact-input-group">
                <label for="apptFullName">Full Name *</label>
                <input type="text" id="apptFullName" required placeholder="Ex: Priya Sundaram">
              </div>
              <div class="contact-input-group">
                <label for="apptPhoneNumber">Phone / WhatsApp *</label>
                <input type="tel" id="apptPhoneNumber" required placeholder="+91 98765 43210">
              </div>
            </div>
            <div class="contact-form-row">
              <div class="contact-input-group">
                <label for="apptEmailAddress">Email Address</label>
                <input type="email" id="apptEmailAddress" placeholder="priya@example.com">
              </div>
              <div class="contact-input-group">
                <label for="apptInterestSelect">Interested Service / Product *</label>
                <select id="apptInterestSelect" required>
                  <option value="Bridal Saree Consultation">Bridal Saree Consultation</option>
                  <option value="Handcrafted Temple Jewellery">Handcrafted Temple Jewellery</option>
                  <option value="Custom Blouse Stitching Studio">Custom Blouse Stitching Studio</option>
                  <option value="International Shipping & Bulk Orders">International Shipping &amp; Bulk Orders</option>
                  <option value="Studio Boutique Visit">Studio Boutique Visit</option>
                </select>
              </div>
            </div>
            <div class="contact-input-group">
              <label for="apptMessageText">Your Requirements / Preferred Date &amp; Time</label>
              <textarea id="apptMessageText" rows="3" placeholder="Tell us about your wedding date, design preferences, or appointment timing..."></textarea>
            </div>
            <button type="submit" class="contact-submit-btn" id="apptSubmitBtn" style="width: 100%; justify-content: center;">
              <span>CONFIRM APPOINTMENT REQUEST</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <p class="contact-form-footer-note" style="text-align: center; margin-top: 8px;">
              ✦ 100% Confidential. Our stylist will reach out within 2 hours.
            </p>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modalDiv);
    modal = modalDiv;
  }
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  const firstInp = modal.querySelector('#apptFullName');
  if (firstInp) setTimeout(() => firstInp.focus(), 100);
};

window.closeAppointmentModal = () => {
  const modal = document.getElementById('appointmentModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
};

window.handleAppointmentModal = (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const nameInp = document.getElementById('apptFullName');
  const phoneInp = document.getElementById('apptPhoneNumber');
  const emailInp = document.getElementById('apptEmailAddress');
  const interestSelect = document.getElementById('apptInterestSelect');
  const messageText = document.getElementById('apptMessageText');

  const name = nameInp ? nameInp.value.trim() : '';
  const phone = phoneInp ? phoneInp.value.trim() : '';
  const email = emailInp ? emailInp.value.trim() : '';
  const interest = interestSelect ? interestSelect.value : 'Bridal Saree Consultation';
  const message = messageText ? messageText.value.trim() : '';

  if (!name || !phone) {
    alert('Please enter your full name and phone number.');
    return;
  }

  const btn = document.getElementById('apptSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>SUBMITTING...</span>';
  }

  const contactData = { name, phone, email, interest, message, date: new Date().toISOString() };

  // Save to localStorage
  const leads = JSON.parse(localStorage.getItem('saforio_leads')) || [];
  leads.push({ name, phone, email, interest, message, date: new Date().toLocaleDateString() });
  localStorage.setItem('saforio_leads', JSON.stringify(leads));

  // Save to Firestore if available
  if (typeof db !== 'undefined' && db) {
    db.collection("leads").add(contactData)
      .then(() => console.log("Appointment enquiry saved to Firestore!"))
      .catch(err => console.error("Firestore error:", err));
  }

  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✓ APPOINTMENT REQUESTED</span>';
      btn.style.background = '#2E7D32';
    }
    alert("Thank you, " + name + "! Your appointment request has been received. Our master stylist will contact you on WhatsApp/Phone within 2 hours.");
    const form = document.getElementById('appointmentForm');
    if (form) form.reset();
    setTimeout(() => {
      window.closeAppointmentModal();
      if (btn) {
        btn.innerHTML = '<span>CONFIRM APPOINTMENT REQUEST</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        btn.style.background = '';
      }
    }, 1200);
  }, 600);
};

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .preview-close:hover {
    transform: scale(1.1);
    background: #c2185b !important;
  }

  .stylist-recommendation-card {
    position: relative;
    transition: all 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
    cursor: pointer;
    background: transparent !important;
    text-align: center !important;
    z-index: 1;
  }

  .stylist-recommendation-card:hover {
    transform: translateY(-10px) scale(1.05);
  }

  /* Elegant Glow for Circular Cards */
  .stylist-recommendation-card::before {
    content: "";
    position: absolute;
    inset: -10px;
    z-index: -1;
    background: radial-gradient(circle at center, rgba(201, 168, 76, 0.3) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.5s ease;
    filter: blur(10px);
  }

  .stylist-recommendation-card:hover::before {
    opacity: 1;
  }

  .stylist-recommendation-card .product-img {
    width: 150px !important;
    height: 150px !important;
    border-radius: 50% !important;
    margin: 0 auto 15px auto !important;
    border: 3px solid var(--gold);
    box-shadow: 0 10px 25px rgba(201,168,76,0.2);
    overflow: hidden;
    background: #fff;
    position: relative;
    z-index: 2;
    transition: all 0.5s ease;
  }

  .stylist-recommendation-card:hover .product-img {
    border-color: var(--gold-light);
    box-shadow: 0 15px 35px rgba(201, 168, 76, 0.4);
    transform: rotate(3deg);
  }

  .results-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 40px;
    margin-top: 40px;
  }

  .admin-tab-btn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .admin-tab-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: var(--gold);
  }

  .admin-tab-btn.active {
    background: var(--gold);
    border-color: var(--gold);
    color: #000;
    font-weight: 600;
  }

  .sortable-ghost {
    opacity: 0.4;
    background: var(--gold-light) !important;
  }

  .admin-item {
    transition: transform 0.1s ease;
  }

  /* Flipkart Style Share Button */
  .product-share {
    position: absolute;
    top: 55px;
    right: 15px;
    width: 32px;
    height: 32px;
    background: #ffffff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    z-index: 5;
    opacity: 1;
    border: none !important;
  }

  .product-share:hover {
    background: #f0f0f0;
    transform: scale(1.1);
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  }

  .product-share-floating {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10;
    transition: all 0.3s ease;
  }

  .product-share-floating:hover {
    transform: scale(1.1);
    background: #f8f8f8;
  }

  .product-share:hover svg {
    stroke: #fff;
  }

  /* Share Modal Styles */
  .share-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-top: 25px;
  }

  .share-opt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: transform 0.3s;
  }

  .share-opt:hover {
    transform: translateY(-5px);
  }

  .share-icon-circle {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
  }

  .share-text {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
  }
`;
document.head.appendChild(styleSheet);

updateUserUI();
updateWishlistIcon();
updateCartIcon();
renderAll();

// SHARE FUNCTIONALITY
let currentShareProduct = null;

window.shareProduct = (productId) => {
  const p = (typeof products !== 'undefined' && products.length > 0)
    ? products.find(prod => String(prod.id) === String(productId) || prod.slug === productId)
    : null;
  if (!p) return;

  currentShareProduct = p;
  const shareUrl = p.slug ? `https://rokeabyrk.com/product/${p.slug}` : `https://rokeabyrk.com/product-details?id=${p.id}`;
  const shareText = `Check out ${p.name} on ROKEA by RK:`;

  // Native Capacitor Share (Android / iOS)
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isPluginAvailable('Share')) {
    window.Capacitor.Plugins.Share.share({
      title: `${p.name} | ROKEA by RK`,
      text: shareText,
      url: shareUrl,
      dialogTitle: 'Share Saree / Jewellery'
    }).catch(() => {});
    return;
  }

  // Web Share API if available
  if (navigator.share) {
    navigator.share({
      title: `${p.name} | ROKEA by RK`,
      text: shareText,
      url: shareUrl
    }).catch(() => {});
  } else {
    // Show custom share modal
    const modal = document.getElementById('shareModal');
    const nameEl = document.getElementById('shareProductName');
    if (modal) {
      if (nameEl) nameEl.innerText = p.name;
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    }
  }
};

window.closeShareModal = () => {
  const modal = document.getElementById('shareModal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('modal-open');
  document.getElementById('copySuccess').style.display = 'none';
}

window.shareTo = (platform) => {
  if (!currentShareProduct) return;

  const url = getAbsoluteProductLink(currentShareProduct);
  const text = `Check out this beautiful ${currentShareProduct.name} at ROKEA!`;

  let shareUrl = '';

  switch (platform) {
    case 'whatsapp':
      shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
      break;
    case 'facebook':
      shareUrl = `https://www.facebook.com/profile.php?id=61587639092396`;
      break;
    case 'twitter':
      shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      break;
    case 'copy':
      navigator.clipboard.writeText(url).then(() => {
        document.getElementById('copySuccess').style.display = 'block';
        setTimeout(() => {
          document.getElementById('copySuccess').style.display = 'none';
        }, 3000);
      });
      return;
  }

  if (shareUrl) window.open(shareUrl, '_blank');
}

// AI Stylist Logic
let stylistCache = new Map();

let faceapiLoaded = false;
async function loadFaceAPI() {
  if (faceapiLoaded) return true;
  if (!window.faceapi) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } catch (e) {
      console.error("Failed to load FaceAPI script", e);
      return false;
    }
  }
  const modelPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.ageGenderNet.loadFromUri(modelPath)
    ]);
    faceapiLoaded = true;
    return true;
  } catch (err) {
    console.error("FaceAPI Model Load Error:", err);
    return false;
  }
}

window.handleUserImage = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 1. Check Filename for Boys/Men keywords
  const fileNameLower = file.name.toLowerCase();
  const maleKeywords = ['boy', 'man', 'men', 'male', 'guy', 'gentleman', 'uncle', 'father', 'husband', 'son', 'groom', 'him', 'his', 'mr', 'actor', 'hero', 'boys', 'guys'];
  const hasMaleKeyword = maleKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b|_${keyword}_|-${keyword}-|\\b${keyword}s\\b`, 'i');
    return regex.test(fileNameLower);
  });

  if (hasMaleKeyword) {
    showToast("AI Vision Error", "info", "Our Virtual Stylist is strictly designed for girls & women's products. Please upload a clear girl or women image.");
    resetStylist();
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    const previewImg = document.getElementById('userPhotoPreview');
    const previewCont = document.getElementById('userPreviewCont');
    const zone = document.getElementById('uploadZone');
    const loader = document.getElementById('aiAnalysis');
    const results = document.getElementById('aiResults');

    if (previewImg) previewImg.src = imageData;
    if (zone) zone.style.display = 'none';
    if (previewCont) previewCont.style.display = 'block';

    if (loader) {
      loader.innerHTML = `
        <div class="ai-loader"></div>
        <p id="aiStatus" style="font-family:'Poppins', sans-serif; font-weight:600; color:var(--gold); font-size:16px;">Initializing AI Vision Engine...</p>
        <div id="aiProgressContainer" style="width: 80%; margin: 15px auto; background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; overflow: hidden; position: relative;">
          <div id="aiProgressBar" style="width: 0%; background: var(--gold); height: 100%; transition: width 0.4s ease;"></div>
        </div>
      `;
      loader.style.display = 'block';
    }
    if (results) results.style.display = 'none';

    const statusEl = document.getElementById('aiStatus');
    const barEl = document.getElementById('aiProgressBar');
    const updateProgress = (pct, text) => {
      if (barEl) barEl.style.width = pct + "%";
      if (statusEl) statusEl.innerText = text;
    };

    updateProgress(20, "Loading Advanced AI Models...");

    const img = new Image();
    img.src = imageData;
    img.onload = async () => {
      // Blur check using canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // Scale proportionally to max 300px for blur analysis to maintain texture
      const scale = Math.min(300 / img.width, 300 / img.height);
      const targetW = Math.max(100, Math.floor(img.width * scale));
      const targetH = Math.max(100, Math.floor(img.height * scale));
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const imgData = ctx.getImageData(0, 0, targetW, targetH).data;
      let grayData = new Uint8ClampedArray(targetW * targetH);
      let totalBrightness = 0;
      let skinPixels = 0;

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;
        grayData[i / 4] = brightness;
        if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 15) skinPixels++;
      }

      const skinRatio = skinPixels / (targetW * targetH);

      // Calculate variance for blur detection on correctly scaled image
      let varianceSum = 0;
      for (let y = 1; y < targetH - 1; y++) {
        for (let x = 1; x < targetW - 1; x++) {
          const idx = y * targetW + x;
          const laplacian = (
            grayData[idx] * 4 -
            grayData[idx - 1] -
            grayData[idx + 1] -
            grayData[idx - targetW] -
            grayData[idx + targetW]
          );
          varianceSum += laplacian * laplacian;
        }
      }
      const sharpnessScore = varianceSum / (targetW * targetH);

      updateProgress(40, "Scanning image quality...");

      if (sharpnessScore < 4) {
        showToast("Low Image Quality", "info", "Please upload a clear, high-resolution photo. Blurry or out-of-focus images cannot be processed.");
        resetStylist();
        return;
      }

      if (skinRatio < 0.02) {
        showToast("No Face Detected", "info", "Could not locate facial features. Please upload a clear photo showing your face.");
        resetStylist();
        return;
      }

      updateProgress(60, "Running Face Mesh & Gender Analysis...");

      const apiLoaded = await loadFaceAPI();

      if (apiLoaded && window.faceapi) {
        try {
          const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
          if (detections) {
            if (detections.gender === 'male' && detections.genderProbability > 0.6) {
              showToast("AI Gender Check Failed", "info", "Our Virtual Stylist is strictly designed for girls & women's products. Please upload a clear girl or women image.");
              resetStylist();
              return;
            }
          }
        } catch (e) {
          console.error("Face API Error:", e);
        }
      } else {
        // Fallback to heuristic if API fails
        let bottomFaceVariance = 0;
        let bottomFacePixels = 0;
        let startY = Math.floor(targetH * 0.6);
        let endY = Math.floor(targetH * 0.9);
        let startX = Math.floor(targetW * 0.3);
        let endX = Math.floor(targetW * 0.7);
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = y * targetW + x;
            bottomFaceVariance += Math.abs(grayData[idx] - (grayData[idx - 1] || 0));
            bottomFacePixels++;
          }
        }
        const jawlineTextureRoughness = bottomFaceVariance / (bottomFacePixels || 1);
        if (jawlineTextureRoughness > 20) {
          showToast("AI Gender Check Failed", "info", "Our Virtual Stylist is strictly designed for girls & women's products. Please upload a clear girl or women image.");
          resetStylist();
          return;
        }
      }

      updateProgress(80, "Female Profile Verified. Curating Perfect Match...");
      setTimeout(() => {
        updateProgress(100, "Curation Completed!");
        setTimeout(() => {
          if (loader) loader.style.display = 'none';
          if (results) results.style.display = 'block';
          let curatedLook;
          if (stylistCache.has(imageData)) {
            curatedLook = stylistCache.get(imageData);
          } else {
            curatedLook = curateLuxuryLook();
            stylistCache.set(imageData, curatedLook);
          }
          renderRecommendations(curatedLook);
        }, 600);
      }, 1000);
    };
  };
  reader.readAsDataURL(file);
}


function curateLuxuryLook() {
  const look = [];
  const allProds = [...products];

  // 1. Get Saree (category == 'sarees')
  const sareesList = allProds.filter(p => p.category === 'sarees');
  const selectedSaree = sareesList.length > 0
    ? sareesList[Math.floor(Math.random() * sareesList.length)]
    : null;
  if (selectedSaree) look.push({ ...selectedSaree, stylistRole: "Exquisite Handwoven Saree" });

  // 2. Get Jewelry (category == 'imitation' without earring/bangle keywords)
  const jewelryKeywords = ['earring', 'jhumka', 'stud', 'bangle', 'valayal', 'kangan', 'kada'];
  const jewelList = allProds.filter(p =>
    p.category === 'imitation' &&
    !jewelryKeywords.some(kw => p.name.toLowerCase().includes(kw))
  );
  const selectedJewel = jewelList.length > 0
    ? jewelList[Math.floor(Math.random() * jewelList.length)]
    : null;
  if (selectedJewel) look.push({ ...selectedJewel, stylistRole: "Heritage Jewellery Set" });

  // 3. Get Earring or Bangle (category == 'imitation' with earring/bangle keywords)
  const earringBangleList = allProds.filter(p =>
    p.category === 'imitation' &&
    jewelryKeywords.some(kw => p.name.toLowerCase().includes(kw))
  );
  const selectedEarringBangle = earringBangleList.length > 0
    ? earringBangleList[Math.floor(Math.random() * earringBangleList.length)]
    : null;
  if (selectedEarringBangle) look.push({ ...selectedEarringBangle, stylistRole: "Matching Earring / Bangle" });

  // Fallback if inventory is empty
  if (look.length < 3) {
    const remaining = allProds.filter(p => !look.some(item => item.id === p.id));
    while (look.length < 3 && remaining.length > 0) {
      look.push(remaining.shift());
    }
  }

  return look;
}

window.resetStylist = () => {
  const zone = document.getElementById('uploadZone');
  const previewCont = document.getElementById('userPreviewCont');
  const results = document.getElementById('aiResults');
  const loader = document.getElementById('aiAnalysis');
  const input = document.getElementById('userImageInput');
  if (zone) zone.style.display = 'block';
  if (previewCont) previewCont.style.display = 'none';
  if (results) results.style.display = 'none';
  if (loader) loader.style.display = 'none';
  if (input) input.value = '';
}

function renderRecommendations(selected) {
  const recContainer = document.getElementById('stylistRecommendations');
  if (!recContainer) return;

  const titleEl = document.querySelector('.results-title');
  if (titleEl) {
    titleEl.innerHTML = `AI Complete Heritage Look: Curated Just For You`;
  }

  recContainer.innerHTML = selected.map(p => `
    <div class="product-card stylist-recommendation-card" onclick="openProductDetail(${p.id})">
      <div style="background:var(--gold); color:#000; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; padding:4px 10px; border-radius:12px; width:fit-content; margin:0 auto 15px auto;">
        ${p.stylistRole || 'Heritage Piece'}
      </div>
      <div class="product-img">
        <img src="${optimizeImageUrl(p.image || p.img)}" width="300" height="400" class="img-main" loading="lazy" decoding="async" ${getSEOAttributes(p)} style="width:100%; height:100%; object-fit:cover;">
        <img src="${optimizeImageUrl(p.imageHover || p.imgHover || p.image || p.img)}" width="300" height="400" class="img-hover" loading="lazy" decoding="async" ${getSEOAttributes(p)} style="width:100%; height:100%; object-fit:cover;">
      </div>
      <div style="padding: 15px; text-align: center;">
        <div style="color:var(--gold-dark); font-weight:700; font-size: 14px; margin-bottom: 5px;">₹${(extractPriceFromDesc(p.description) || p.price || 0).toLocaleString('en-IN')}</div>
        <div style="font-size:9px; color:var(--gold); text-transform: uppercase; letter-spacing:1px; margin-bottom: 5px;">${p.category}</div>
        <h3 class="product-name" style="font-family:'Playfair Display',serif; font-size:15px; color:var(--dark); margin:0 auto 5px; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h3>
        <button class="btn-primary" style="padding:6px 12px; font-size:11px; margin-top:10px; width:100%;" onclick="event.stopPropagation(); addToCartFromStylist(${p.id})">Add to Look</button>
      </div>
    </div>`).join('');
}

// Global helper to add to cart straight from AI results
window.addToCartFromStylist = (id) => {
  const p = products.find(prod => prod.id == id);
  if (!p) return;
  cart.push(p);
  localStorage.setItem('saforio_cart', JSON.stringify(cart));
  updateCartIcon();
  showToast("Added to Cart", "success", `${p.name} has been added to your styled look.`);
};


// Handle Category from URL
if (urlCat) {
  currentCategory = urlCat;
  // Update Tab UI if on collections page
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === currentCategory);
  });
}

// Handle Product ID from URL
// Wait for Firestore to load before initialising the product page
if (urlId) {
  // Save product ID to sessionStorage so refresh still works
  sessionStorage.setItem('rokea_current_product_id', urlId);

  // Show a skeleton loader so the user doesn't see a broken image
  const mainImg = document.getElementById('detailMainImg');
  if (mainImg) {
    mainImg.style.background = 'linear-gradient(90deg, #f0e6d3 25%, #faf6ef 50%, #f0e6d3 75%)';
    mainImg.style.backgroundSize = '200% 100%';
    mainImg.style.animation = 'shimmer 1.5s infinite';
    // Inject shimmer keyframe once
    if (!document.getElementById('shimmerStyle')) {
      const s = document.createElement('style');
      s.id = 'shimmerStyle';
      s.textContent = '@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }';
      document.head.appendChild(s);
    }
  }

  if (products.length > 0) {
    // Products already in memory from localStorage — init immediately
    setTimeout(() => { initProductPage(urlId); }, 100);
  }
  // initProductPage is also called by renderAll() once Firestore snapshot arrives,
  // so first-time visitors (empty localStorage) are handled automatically.

} else {
  // No ?id= in URL — check sessionStorage (happens after refresh when URL is clean)
  const savedId = sessionStorage.getItem('rokea_current_product_id');
  if (savedId && document.getElementById('detailMainImg')) {
    if (products.length > 0) {
      setTimeout(() => { initProductPage(savedId); }, 100);
    } else {
      // Wait for Firestore — renderAll() will call initProductPage(savedId)
      window._pendingProductId = savedId;
    }
  }
}

function initProductPage(productId) {
  // If Server-Side Rendering provided the initial data, use it immediately!
  if (window.__INITIAL_PRODUCT_DATA__ && (window.__INITIAL_PRODUCT_DATA__.id === productId || window.__INITIAL_PRODUCT_DATA__.slug === productId)) {
    let fetched = window.__INITIAL_PRODUCT_DATA__;
    if (!products.find(x => x.id == fetched.id)) products.push(fetched);
    return _populateProductPage(fetched);
  }

  const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const searchKey = String(productId).trim().toLowerCase();

  let p = products.find(prod => 
    String(prod.id) === String(productId) || 
    (prod.slug && prod.slug.toLowerCase() === searchKey) ||
    (prod.name && toSlug(prod.name) === searchKey) ||
    (prod.name && prod.name.toLowerCase() === searchKey)
  );

  // If not found locally, try fetching directly from Firestore
  if (!p) {
    if (db) {
      // First try to find by ID
      db.collection('products').doc(productId.toString()).get()
        .then(doc => {
          if (doc.exists) {
            let fetched = doc.data();
            fetched.id = fetched.id || doc.id;
            // Merge into local products array so subsequent calls work
            if (!products.find(x => x.id == fetched.id)) products.push(fetched);
            _populateProductPage(fetched);
          } else {
            // Try fetching by slug
            return db.collection('products').where('slug', '==', productId).get().then(snap => {
              if (!snap.empty) {
                let fetched = snap.docs[0].data();
                fetched.id = fetched.id || snap.docs[0].id;
                if (!products.find(x => x.id == fetched.id)) products.push(fetched);
                _populateProductPage(fetched);
              } else {
                console.warn('Product not found in Firestore:', productId);
              }
            });
          }
        })
        .catch(err => console.error('Firestore product fetch error:', err));
    }
    return;
  }

  _populateProductPage(p);
}

function _populateProductPage(p) {

  // Update URL to show slug instead of stripping it
  if (window.history && window.history.replaceState) {
    let newUrl = (isNativeApp() || isLocalhost)
      ? (p.slug ? `${window.location.pathname}?slug=${encodeURIComponent(p.slug)}` : `${window.location.pathname}?id=${encodeURIComponent(p.id)}`)
      : (p.slug ? `/product/${p.slug}` : `/product-details?id=${p.id}`);
    history.replaceState(null, document.title, newUrl);
  }

  // ── SEO: Update page title, meta tags, OG tags, schema ──────────────────
  const productPrice = extractPriceFromDesc(p.description) || p.price || 0;
  const productImg = p.image || p.img || '';
  const productDesc = (p.description || '').split('\n')[0].replace(/^[✦•\-\*]\s*/, '').trim()
    || 'Luxury handwoven saree from ROKEA by RK, Coimbatore.';

  // Page title
  document.title = `${p.name} | ${p.category || 'Luxury Saree'} — ROKEA by RK`;

  // Meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = 'description'; document.head.appendChild(metaDesc); }
  metaDesc.content = `${productDesc.slice(0, 140)} | Buy ${p.name} at ROKEA by RK, Coimbatore.`;

  // OG tags
  const setMeta = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  setMeta('ogTitle', 'content', `${p.name} | ROKEA by RK`);
  setMeta('ogDesc', 'content', productDesc.slice(0, 200));
  setMeta('ogImage', 'content', productImg);
  // Canonical URL
  let canonicalUrl = document.getElementById('canonicalUrl');
  if (canonicalUrl) {
    const productUrl = p.slug
      ? `https://rokeabyrk.com/product/${p.slug}`
      : `https://rokeabyrk.com/product-details?id=${p.id}`;
    canonicalUrl.href = productUrl;
    setMeta('ogUrl', 'content', productUrl);
  } else {
    setMeta('ogUrl', 'content', window.location.href);
  }

  setMeta('twTitle', 'content', `${p.name} | ROKEA by RK`);
  setMeta('twDesc', 'content', productDesc.slice(0, 200));
  setMeta('twImage', 'content', productImg);

  // Product Schema & Breadcrumbs JSON-LD
  let schemaScript = document.getElementById('productSchema');

  // Remove ALL existing schema tags with Product to prevent duplicates
  // Populate Elements (similar to old openProductDetail logic but for static page)
  const mainImg = document.getElementById('detailMainImg');
  const name = document.getElementById('detailName');
  const price = document.getElementById('detailPrice');
  const desc = document.getElementById('descBody');
  const care = document.getElementById('careBody');
  const stock = document.getElementById('detailStockStatus');
  const btn = document.getElementById('detailAddToCartBtn');
  const buyBtn = document.getElementById('detailBuyNowBtn');
  const thumbs = document.getElementById('detailThumbnails');
  const qtyVal = document.getElementById('detailQtyVal');
  const qtyMinus = document.getElementById('detailQtyMinus');
  const qtyPlus = document.getElementById('detailQtyPlus');
  const breadCat = document.getElementById('breadcrumb-cat');
  const breadName = document.getElementById('breadcrumb-name');
  const shopBannerText = document.getElementById('shopBannerText');
  if (shopBannerText) {
      shopBannerText.innerHTML = `Shop this elegant <strong>${p.name || 'product'}</strong> from ROKEA BY RK in Coimbatore and discover timeless sarees curated for every special occasion.`;
  }

  if (!name) return; // Not on product page

  let currentQty = 1;
  if (qtyVal) qtyVal.innerText = currentQty;
  if (qtyMinus) qtyMinus.onclick = () => { if (currentQty > 1) { currentQty--; qtyVal.innerText = currentQty; } };
  if (qtyPlus) qtyPlus.onclick = () => { currentQty++; qtyVal.innerText = currentQty; };

  // Set the real image and hide skeleton when loaded
  if (mainImg) {
    const skeleton = document.getElementById('imgSkeleton');
    const imgSrc = p.image || p.img || '';

    // SEO: descriptive alt text with product name, category, brand
    const altText = p.name
      ? `${p.name} - ${p.category || 'Luxury Saree'} | ROKEA by RK`
      : 'Luxury Handwoven Saree | ROKEA by RK';
    mainImg.alt = altText;
    mainImg.setAttribute('fetchpriority', 'high'); // LCP image — load first
    mainImg.setAttribute('decoding', 'async');

    if (imgSrc) {
      mainImg.onload = () => {
        mainImg.classList.add('img-loaded');   // fade in
        if (skeleton) skeleton.classList.add('hide');  // hide shimmer
      };
      mainImg.src = imgSrc;
    } else {
      // No image URL — show branded gradient placeholder
      if (skeleton) skeleton.classList.add('hide');
      mainImg.classList.add('img-loaded');
      mainImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // transparent
      mainImg.style.background = 'linear-gradient(135deg, #f0e6d3, #faf6ef)';
    }
  }
  if (name) name.innerText = p.name;
  if (breadName) breadName.innerText = (p.name || '').toUpperCase();
  if (breadCat) {
    const rawCat = (p.category || '').toLowerCase();
    const isJewellery = rawCat.includes('jewel') || rawCat.includes('imitation');
    const catLabel = isJewellery ? 'Jewellery' : 'Sarees';
    const catParam = isJewellery ? 'imitation' : 'sarees';
    breadCat.innerText = catLabel;
    breadCat.href = '/collections.html';
    breadCat.onclick = (e) => {
      e.preventDefault();
      localStorage.setItem('rokea_selected_category', catParam);
      window.location.href = '/collections.html';
    };
  }
  if (price) price.innerText = `₹${(extractPriceFromDesc(p.description) || p.price || 0).toLocaleString('en-IN')}`;

  if (desc) {
    const descText = p.description || "Exquisite premium collection from ROKEA by RK.";
    const descLines = descText.split('\n').filter(line => line.trim().length > 0).map(l => l.replace(/^[✦•\-\*]\s*/, '').trim());
    
    // Filter out "Why You'll Love It" and styling tips if present in description text
    const filteredLines = descLines.filter(line => {
      const lower = line.toLowerCase();
      return !lower.includes('why you') && 
             !lower.includes('pair with gold jewellery') && 
             !lower.includes('style as bridal wear');
    });
    
    let prodDesc = filteredLines.length > 0 ? filteredLines.join('<br><br>') : descText;
    
    let color = p.color || "As shown";
    let occasion = p.occasion || "Wedding, Festival & Traditional Wear";
    let type = p.category || "Soft Silk Saree";

    desc.innerHTML = `
      <div class="info-box">
          <div class="info-box-title">Product Description</div>
          <div class="info-box-text">${prodDesc}</div>
      </div>
      <div class="info-box">
          <div class="info-box-title">Product Details</div>
          <div class="details-grid">
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path></svg></div>
                  <div class="detail-label">Type</div>
                  <div class="detail-value">: ${type}</div>
              </div>
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path></svg></div>
                  <div class="detail-label">Style</div>
                  <div class="detail-value">: Traditional Indian</div>
              </div>
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path></svg></div>
                  <div class="detail-label">Colour</div>
                  <div class="detail-value">: ${color}</div>
              </div>
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                  <div class="detail-label">Ideal For</div>
                  <div class="detail-value">: Women</div>
              </div>
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></div>
                  <div class="detail-label">Occasion</div>
                  <div class="detail-value">: ${occasion}</div>
              </div>
              <div class="detail-item">
                  <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg></div>
                  <div class="detail-label">Care</div>
                  <div class="detail-value">: Dry Wash Only</div>
              </div>
          </div>
      </div>
    `;
  }

  if (care) {
    const careText = p.productCare || "Handle with care to maintain the longevity of this premium piece.";
    const items = careText.split('\n').filter(line => line.trim().length > 0);

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px; margin-top: 10px;">`;

    items.forEach(item => {
      const text = item.replace(/^[✦•\-\*]\s*/, '').trim();
      if (text === "CARE & SAFETY") return;

      let title = "Care Tip";
      let descText = text;

      if (text.includes(':')) {
        const parts = text.split(':');
        title = parts[0].trim();
        descText = parts.slice(1).join(':').trim();
      }

      let iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      if (title.toLowerCase().includes('clean')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`;
      if (title.toLowerCase().includes('water') || title.toLowerCase().includes('moisture')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
      if (title.toLowerCase().includes('stor')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`;
      if (title.toLowerCase().includes('perfume') || title.toLowerCase().includes('chemical')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M10 2v4M14 2v4M6 10v10a2 2 0 002 2h8a2 2 0 002-2V10a2 2 0 00-2-2H8a2 2 0 00-2 2z"/></svg>`;
      if (title.toLowerCase().includes('handl')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
      if (title.toLowerCase().includes('longevity') || title.toLowerCase().includes('tip')) iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

      html += `
        <div style="background: rgba(255,255,255,0.7); border: 1px solid rgba(201,168,76,0.15); border-radius: 8px; padding: 18px; display: flex; flex-direction: column; gap: 10px; transition: transform 0.3s, box-shadow 0.3s; cursor: default;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 5px 15px rgba(201,168,76,0.1)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 2px;">
            <div style="background: rgba(201,168,76,0.1); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: inset 0 0 10px rgba(201,168,76,0.05);">
               ${iconSvg}
            </div>
            <div style="font-family: 'Playfair Display', serif; font-weight: 600; font-size: 15px; color: var(--dark); letter-spacing: 0.3px;">${title}</div>
          </div>
          <div style="font-size: 13px; line-height: 1.6; color: var(--text);">${descText}</div>
        </div>
      `;
    });

    html += `</div>`;
    care.innerHTML = html;
  }

  if (stock) {
    const isOut = p.stock === 'Out of Stock';
    stock.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${isOut ? '#D93025' : '#4CAF50'};"></span> Availability: ${isOut ? 'Sold Out' : 'In Stock'}`;
  }

  if (p.stock === 'Out of Stock') {
    if (btn) { btn.innerText = 'Sold Out'; btn.disabled = true; }
    if (buyBtn) { buyBtn.disabled = true; }
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Add to Cart';
      btn.onclick = () => {
        for (let i = 0; i < currentQty; i++) cart.push(p);
        localStorage.setItem('saforio_cart', JSON.stringify(cart));
        updateCartIcon();

        // Amazon-style button change
        const originalText = btn.innerHTML;
        btn.classList.add('added');
        btn.innerHTML = 'Added to Cart';

        showSideNotification(p);

        setTimeout(() => {
          btn.classList.remove('added');
          btn.innerHTML = originalText;
        }, 3000);
      };
    }
    if (buyBtn) {
      buyBtn.disabled = false;
      buyBtn.onclick = () => {
        for (let i = 0; i < currentQty; i++) cart.push(p);
        localStorage.setItem('saforio_cart', JSON.stringify(cart));
        updateCartIcon();
        showToast("Preparing Checkout...", "info", p.name);
        openCheckout();
      };
    }
  }

  // Thumbs — filter out empty/undefined values
  const rawImages = [
    p.image || p.img,
    p.imageHover || p.imgHover || p.image || p.img,
    ...(p.extraImages || [])
  ];
  currentDetailImages = [...new Set(rawImages.filter(u => u && u.trim && u.trim() !== ''))];
  currentDetailIndex = 0;

  if (thumbs) {
    thumbs.innerHTML = currentDetailImages.map((img, i) => {
      const thumbAlt = i === 0
        ? `${p.name} - Front View | ROKEA by RK`
        : `${p.name} - View ${i + 1} | ROKEA by RK`;
      return `<img src="${img}" class="thumb-item ${i === 0 ? 'active' : ''}" loading="lazy" decoding="async" ${getSEOAttributes({ name: thumbAlt })} onclick="switchDetailImage(${i})" onerror="this.style.display='none'">`;
    }).join('');
  }

  // Swipe Logic
  const visualCont = document.getElementById('mainVisualCont');
  if (visualCont) {
    visualCont.addEventListener('touchstart', e => {
      touchstartX = e.changedTouches[0].screenX;
    }, { passive: true });

    visualCont.addEventListener('touchend', e => {
      touchendX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    // Premium Interactive Pan-Zoom (Cursor tracking to prevent image cut-off on zoom)
    if (mainImg) {
      visualCont.addEventListener('mousemove', (e) => {
        const rect = visualCont.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        mainImg.style.transformOrigin = `${x}% ${y}%`;
      });

      visualCont.addEventListener('mouseleave', () => {
        // Reset to original focus position
        mainImg.style.transformOrigin = 'center 10%';
      });

      // Mobile Touch Move Zoom support
      visualCont.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const rect = visualCont.getBoundingClientRect();
          const touch = e.touches[0];
          const x = ((touch.clientX - rect.left) / rect.width) * 100;
          const y = ((touch.clientY - rect.top) / rect.height) * 100;
          mainImg.style.transformOrigin = `${x}% ${y}%`;
        }
      }, { passive: true });
    }
  }

  renderRelatedProducts(p.category, p.id);

  // Update page title
  if (p.name) document.title = p.name + ' — ROKEA by RK';
}

window.switchDetailImage = (index) => {
  currentDetailIndex = index;
  const mainImg = document.getElementById('detailMainImg');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = currentDetailImages[currentDetailIndex];
      mainImg.style.opacity = '1';
    }, 200);
  }

  // Update thumbs
  document.querySelectorAll('.thumb-item').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === index);
  });
}

function handleSwipe() {
  if (touchendX < touchstartX - 50) {
    // Swipe Left -> Next Image
    if (currentDetailIndex < currentDetailImages.length - 1) {
      switchDetailImage(currentDetailIndex + 1);
    } else {
      switchDetailImage(0);
    }
  }
  if (touchendX > touchstartX + 50) {
    // Swipe Right -> Prev Image
    if (currentDetailIndex > 0) {
      switchDetailImage(currentDetailIndex - 1);
    } else {
      switchDetailImage(currentDetailImages.length - 1);
    }
  }
}

// Initial Render
renderAll();
updateCartIcon();
updateWishlistIcon();
updateUserUI();

// =============================================
// SPLASH SCREEN LOGIC
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('openAdmin') === 'true') {
    sessionStorage.removeItem('openAdmin');
    const adminModal = document.getElementById('adminModal');
    if (adminModal) {
      adminModal.style.display = 'flex';
      renderAll();
    }
  }

  const splashScreen = document.getElementById('splashScreen');
  const splashLogo = document.getElementById('splashLogo');
  const navLogoImg = document.getElementById('navLogoImg');

  if (splashScreen && splashLogo && navLogoImg) {
    const hasSplashPlayed = sessionStorage.getItem('splashPlayed') === 'true';

    if (document.getElementById('home') && !hasSplashPlayed) {
      sessionStorage.setItem('splashPlayed', 'true');
      navLogoImg.style.opacity = '0';
      navLogoImg.style.transition = 'opacity 0.5s ease';

      // Strictly prevent scrolling before and during animation
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      let splashDone = false;

      const preventScroll = (e) => {
        if (!splashDone) e.preventDefault();
      };

      window.addEventListener('wheel', preventScroll, { passive: false });
      window.addEventListener('touchmove', preventScroll, { passive: false });

      const handleSplash = (e) => {
        if (splashDone) return;

        if (e.type === 'wheel' && e.deltaY <= 0) return;

        splashDone = true;

        // Hide scroll indicator immediately
        const scrollInd = splashScreen.querySelector('.splash-scroll-indicator');
        if (scrollInd) scrollInd.style.opacity = '0';

        const navRect = navLogoImg.getBoundingClientRect();
        const logoRect = splashLogo.getBoundingClientRect();

        const xTranslate = navRect.left + (navRect.width / 2) - (logoRect.left + logoRect.width / 2);
        const yTranslate = navRect.top + (navRect.height / 2) - (logoRect.top + logoRect.height / 2);
        const scale = navRect.width / logoRect.width;

        splashLogo.style.transform = `translate(${xTranslate}px, ${yTranslate}px) scale(${Math.max(scale, 0.2)})`;

        // Wait for the logo to reach the destination
        setTimeout(() => {
          splashLogo.style.opacity = '0';
          navLogoImg.style.transition = 'opacity 0.5s ease';
          navLogoImg.style.opacity = '1';
          splashScreen.classList.add('scrolled');

          const heroEl = document.querySelector('.hero');
          if (heroEl) {
            setTimeout(() => heroEl.classList.add('hero-revealed'), 150);
          }

          // Restore scrolling only after the splash background is gone
          setTimeout(() => {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            window.removeEventListener('wheel', preventScroll);
            window.removeEventListener('touchmove', preventScroll);
          }, 800);
        }, 950);

        window.removeEventListener('wheel', handleSplash);
        window.removeEventListener('touchmove', handleSplash);
        window.removeEventListener('touchstart', handleSplash);
      };

      window.addEventListener('wheel', handleSplash, { passive: false });
      window.addEventListener('touchmove', handleSplash, { passive: false });
      window.addEventListener('touchstart', handleSplash, { passive: false });
    } else {
      splashScreen.style.display = 'none';
      navLogoImg.style.opacity = '1';
      const heroEl = document.querySelector('.hero');
      if (heroEl) {
        setTimeout(() => heroEl.classList.add('hero-revealed'), 100);
      }
    }
  } else {
    const heroEl = document.querySelector('.hero');
    if (heroEl) {
      setTimeout(() => heroEl.classList.add('hero-revealed'), 100);
    }
  }
});

// --- FAB INJECTION ---
function injectFABs() {
  if (!document.querySelector('.whatsapp-fab')) {
    const waFAB = document.createElement('a');
    waFAB.href = "https://wa.me/917010394051";
    waFAB.className = "whatsapp-fab";
    waFAB.target = "_blank";
    waFAB.setAttribute('aria-label', 'Chat on WhatsApp');
    waFAB.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
      </svg>
      <div class="whatsapp-tooltip">Chat with us</div>
    `;
    document.body.appendChild(waFAB);
  }
  if (!document.querySelector('.ai-fab')) {
    const aiFAB = document.createElement('a');
    aiFAB.href = "/ai-stylist";
    aiFAB.className = "ai-fab";
    aiFAB.innerHTML = `
      <div class="ai-fab-icon">✦<span class="ai-fab-badge">New</span></div>
      <span class="ai-fab-text">AI Virtual Stylist is Here</span>
    `;
    document.body.appendChild(aiFAB);
  }
}

// --- NATIVE MOBILE APP BOTTOM NAVIGATION BAR ---
function injectMobileAppBottomBar() {
  if (document.querySelector('.mobile-app-bottom-bar')) return;
  const path = (window.location.pathname || '').toLowerCase();
  const isHome = path === '/' || path.endsWith('index.html') || path === '' || !path.includes('.html');
  const isShop = path.includes('collections');

  const bar = document.createElement('nav');
  bar.className = 'mobile-app-bottom-bar';
  bar.id = 'mobileAppBottomBar';
  bar.setAttribute('aria-label', 'Mobile App Bottom Navigation');
  bar.innerHTML = `
    <a href="/" class="app-nav-item ${isHome ? 'active' : ''}" id="appNavHome" aria-label="Home">
      <div class="app-nav-icon-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
      <span class="app-nav-label">Home</span>
    </a>

    <a href="/collections.html" class="app-nav-item ${isShop ? 'active' : ''}" id="appNavCollections" aria-label="Collections">
      <div class="app-nav-icon-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      </div>
      <span class="app-nav-label">Shop</span>
    </a>

    <button type="button" class="app-nav-item app-nav-center-btn" onclick="openAppointmentModal()" aria-label="Book Boutique Appointment">
      <div class="app-nav-center-circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <path d="M12 14l1.5 2.5L16 14"></path>
        </svg>
      </div>
      <span class="app-nav-label app-center-label">Book Visit</span>
    </button>

    <button type="button" class="app-nav-item" onclick="toggleWishlist()" aria-label="Wishlist">
      <div class="app-nav-icon-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="app-nav-badge" id="mobile-wish-count">0</span>
      </div>
      <span class="app-nav-label">Wishlist</span>
    </button>

    <button type="button" class="app-nav-item" onclick="toggleCart()" aria-label="Shopping Bag">
      <div class="app-nav-icon-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
          <path d="M3 6h18"></path>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <span class="app-nav-badge" id="mobile-cart-count">0</span>
      </div>
      <span class="app-nav-label">Bag</span>
    </button>
  `;
  document.body.appendChild(bar);
  if (typeof updateCartIcon === 'function') updateCartIcon();
  if (typeof updateWishlistIcon === 'function') updateWishlistIcon();
}

function initAppElements() {
  injectFABs();
  injectMobileAppBottomBar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppElements);
} else {
  initAppElements();
}

// Disable right-click & drag on all images to prevent opening them in a new tab (which triggers free-hosting ads)
document.addEventListener('contextmenu', function (e) {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
  }
});
document.addEventListener('dragstart', function (e) {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
  }
});

// =============================================
// TESTIMONIAL CAROUSEL LOGIC
// =============================================
let currentTestimonialIndex = 0;
let testimonialInterval;

function initTestimonialCarousel() {
  const slides = document.querySelectorAll('.nt-featured-card.slide');
  const dots = document.querySelectorAll('.nt-dot');
  if (slides.length === 0) return;

  function showTestimonial(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    slides[index].classList.add('active');
    if (dots[index]) dots[index].classList.add('active');
    currentTestimonialIndex = index;
  }

  window.nextTestimonial = () => {
    let nextIndex = (currentTestimonialIndex + 1) % slides.length;
    showTestimonial(nextIndex);
    resetTestimonialInterval();
  };

  window.prevTestimonial = () => {
    let prevIndex = (currentTestimonialIndex - 1 + slides.length) % slides.length;
    showTestimonial(prevIndex);
    resetTestimonialInterval();
  };

  window.goToTestimonial = (index) => {
    showTestimonial(index);
    resetTestimonialInterval();
  };

  function resetTestimonialInterval() {
    clearInterval(testimonialInterval);
    testimonialInterval = setInterval(window.nextTestimonial, 5000);
  }

  // Start auto-play
  resetTestimonialInterval();
}

document.addEventListener('DOMContentLoaded', initTestimonialCarousel);
// Custom Blouse Booking Logic - Direct Google Form Open
window.openBlouseBooking = () => {
  window.open('https://forms.gle/xHJ6hSpyreHVNsNc8', '_blank');
}

// FAQ Accordion Toggle
window.toggleFaq = (element) => {
  const faqItem = element.closest('.faq-item');
  if (!faqItem) return;
  const wasActive = faqItem.classList.contains('active');
  
  // Close other open FAQ items for neat accordion behavior
  document.querySelectorAll('.faq-item').forEach(item => {
    item.classList.remove('active');
  });

  if (!wasActive) {
    faqItem.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const customForm = document.getElementById('customBlouseForm');
  if (customForm) {
    customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Thank you! Your custom blouse order details have been received. We will contact you shortly on WhatsApp to confirm the order.');
      // Here you would typically send the data to your backend or Firebase
      window.location.href = 'index.html';
    });
  }
});

// =============================================
// TEMPORARY SLUG MIGRATION FROM ADMIN DASHBOARD
// =============================================
window.executeSlugMigration = async () => {
  if (!db) {
    console.error("Firestore DB not found.");
    alert("Firestore DB not found.");
    return;
  }

  const btn = document.getElementById('generateSlugsBtn');
  if (btn) btn.innerText = "Generating...";

  console.log("Starting slug migration from Admin Dashboard...");

  try {
    const snapshot = await db.collection("products").get();
    let updatedCount = 0;
    let skippedCount = 0;

    for (let doc of snapshot.docs) {
      const data = doc.data();
      if (!data.slug) {
        const newSlug = generateSlug(data.name);
        if (newSlug) {
          console.log(`Updating product: ${data.name} -> ${newSlug}`);
          await db.collection("products").doc(doc.id).update({ slug: newSlug });
          updatedCount++;
        } else {
          console.warn(`Could not generate slug for product: ${doc.id}`);
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`Migration Complete! 🎉`);
    console.log(`Updated: ${updatedCount} products.`);
    console.log(`Skipped (already had slug or invalid name): ${skippedCount} products.`);
    alert(`Migration successful! Updated ${updatedCount} products. Check console for details.`);
  } catch (error) {
    console.error("Error during migration:", error);
    alert("Migration failed. Check console for details.");
  } finally {
    if (btn) btn.innerText = "Generate Slugs";
  }
};

// Function to handle sharing products
window.shareProduct = function (productId) {
  let urlToShare = window.location.href;
  let titleToShare = document.title;

  // Try to find the exact product if it exists
  if (typeof products !== 'undefined' && products.length > 0) {
    let p = products.find(prod => prod.id == productId || prod.slug === productId);
    if (p) {
      if (p.slug) {
        urlToShare = `https://rokeabyrk.com/product/${p.slug}`;
      } else if (p.id) {
        urlToShare = `https://rokeabyrk.com/product-details?id=${p.id}`;
      }
      titleToShare = `${p.name} | ROKEA by RK`;
    }
  }

  const shareData = {
    title: titleToShare,
    text: 'Check out this beautiful product from ROKEA by RK!',
    url: urlToShare
  };

  if (navigator.share) {
    navigator.share(shareData).catch(err => {
      console.log('Error sharing:', err);
    });
  } else {
    // Fallback: Copy to clipboard
    navigator.clipboard.writeText(urlToShare).then(() => {
      alert("Link copied to clipboard!");
    }).catch(err => {
      console.error('Failed to copy: ', err);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = urlToShare;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert("Link copied to clipboard!");
      } catch (err) {
        alert("Failed to copy link. Please copy the URL manually.");
      }
      document.body.removeChild(textArea);
    });
  }
};

// ================================================================
// OUR BEST SELLERS - COLLECTIONS SHOWCASE (ADMIN PRODUCTS ONLY)
// ================================================================
let currentBestsellerSlide = 0;
let currentBestsellerFilter = 'sarees'; // Default to Sarees tab

window.filterBestsellers = (cat, btn) => {
  currentBestsellerFilter = cat;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    const activeBtn = document.querySelector(`.filter-pill[data-cat="${cat}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }
  window.renderBestsellerShowcase();
};

window.renderBestsellerShowcase = () => {
  const track = document.getElementById('bestsellerTrack');
  if (!track) return;

  // STRICTLY USE ADMIN PRODUCTS ONLY
  let filtered = products.filter(p => {
    if (currentBestsellerFilter === 'sarees') return p.category === 'sarees';
    if (currentBestsellerFilter === 'imitation') return p.category === 'imitation';
    return true;
  });

  // Apply Sorting if configured
  if (window.currentSort === 'low') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (window.currentSort === 'high') {
    filtered.sort((a, b) => b.price - a.price);
  } else {
    filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  if (!filtered || filtered.length === 0) {
    track.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #8C7D6E;">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#C9A84C" stroke-width="1.5" style="margin-bottom: 12px; display: inline-block;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h3 style="font-family: 'Cinzel', serif; font-size: 20px; color: #4A0E17; margin-bottom: 6px;">No Products Found</h3>
        <p style="font-family: 'Poppins', sans-serif; font-size: 13px; color: #7A6A50;">No products have been added to this category in the Admin Dashboard yet.</p>
      </div>
    `;
    return;
  }

  track.innerHTML = filtered.map((p, idx) => {
    const inWishlist = wishlist && wishlist.find(w => w.id == p.id);
    const isOOS = p.stock === 'Out of Stock';
    const mainImg = optimizeImageUrl(p.image || p.img);
    const displayPrice = (extractPriceFromDesc(p.description) || p.price || 0);

    // Badges
    let badgeText = isOOS ? 'Sold Out' : (p.badge || (idx === 0 ? 'Bestseller' : (idx === 1 ? 'New' : 'Trending')));
    let badgeClass = isOOS ? 'badge-blush' : (idx === 0 ? 'badge-green' : (idx === 1 ? 'badge-sage' : (idx === 2 ? 'badge-blush' : 'badge-gold')));

    return `
      <div class="bestseller-card" onclick="openProductDetail('${p.id}')">
        <div class="bestseller-card-img-wrap ${isOOS ? 'out-of-stock' : ''}">
          <span class="bestseller-badge ${badgeClass}">${badgeText}</span>
          <button type="button" class="bestseller-wish-btn ${inWishlist ? 'active' : ''}" onclick="event.stopPropagation(); addToWishlist('${p.id}'); this.classList.toggle('active');" aria-label="Wishlist">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${inWishlist ? '#e91e63' : 'none'}" stroke="${inWishlist ? '#e91e63' : '#4A3B32'}" stroke-width="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <img src="${mainImg}" alt="${p.name}" class="bestseller-card-img" loading="lazy" decoding="async" ${getSEOAttributes(p)} onerror="this.onerror=null; this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; this.style.background='linear-gradient(135deg,#f0e6d3,#faf6ef)';">
        </div>
        <div class="bestseller-card-body">
          <div class="bestseller-card-price">₹${displayPrice.toLocaleString('en-IN')}</div>
          <div class="bestseller-card-category">${p.category === 'sarees' ? 'SAREES' : 'JEWELLERY'}</div>
          <h3 class="bestseller-card-title">${p.name}</h3>
          <div class="bestseller-rating-row">
            <span class="rating-stars">★★★★★</span>
            <span class="rating-score">(4.8)</span>
          </div>
          ${isOOS
            ? `<button type="button" class="bestseller-add-btn" style="background: #EFE8E1; color: #8C7D6E; border-color: #D4C7BA; cursor: not-allowed;" disabled onclick="event.stopPropagation();">
                <span>SOLD OUT</span>
              </button>`
            : `<button type="button" class="bestseller-add-btn" onclick="event.stopPropagation(); addToCart('${p.id}')">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                  <path d="M3 6h18"></path>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                <span>ADD TO CART</span>
              </button>`
          }
        </div>
      </div>
    `;
  }).join('');
};

window.slideBestsellers = (dir) => {
  const dots = document.querySelectorAll('.v-dot');
  if (dots.length === 0) return;
  currentBestsellerSlide = (currentBestsellerSlide + dir + dots.length) % dots.length;
  window.goToBestsellerSlide(currentBestsellerSlide);
};

window.goToBestsellerSlide = (idx) => {
  currentBestsellerSlide = idx;
  const dots = document.querySelectorAll('.v-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
};

// Initial trigger for collections page
document.addEventListener('DOMContentLoaded', () => {
  const selectedCat = localStorage.getItem('rokea_selected_category');
  if (selectedCat && (selectedCat === 'sarees' || selectedCat === 'imitation')) {
    currentBestsellerFilter = selectedCat;
    const tabBtn = document.querySelector(`.filter-pill[data-cat="${selectedCat}"]`);
    if (tabBtn) {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      tabBtn.classList.add('active');
    }
    localStorage.removeItem('rokea_selected_category');
  }

  if (document.getElementById('bestsellerTrack')) {
    window.renderBestsellerShowcase();
  }
});

// ── Native Mobile & Android Hardware Back-Button Modal Manager ────────
window.addEventListener('popstate', function () {
  const modalIds = [
    'cartModal', 'wishlistModal', 'authModal', 'mobileMenu',
    'shareModal', 'reelModal', 'measureVideoModal', 'leadModal', 'adminModal'
  ];
  let closedAny = false;
  modalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && (el.classList.contains('active') || el.style.display === 'flex' || el.style.display === 'block')) {
      el.classList.remove('active');
      el.style.display = 'none';
      closedAny = true;
    }
  });
  if (closedAny) {
    document.body.classList.remove('modal-open');
    if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
  }
});

// ── CAPACITOR NATIVE APP BRIDGE & SYSTEM EVENT CONTROLS ────────
(function initCapacitorBridge() {
  if (typeof window === 'undefined') return;

  function setupNativeFeatures() {
    const Cap = window.Capacitor;
    if (!Cap) return;

    // 1. Native Status Bar
    if (Cap.isPluginAvailable && Cap.isPluginAvailable('StatusBar')) {
      Cap.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
      Cap.Plugins.StatusBar.setBackgroundColor({ color: '#1A1209' }).catch(() => {});
      Cap.Plugins.StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    }

    // 2. Native Splash Screen Dismissal
    if (Cap.isPluginAvailable && Cap.isPluginAvailable('SplashScreen')) {
      setTimeout(() => {
        Cap.Plugins.SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
      }, 500);
    }

    // 3. Android Hardware Back Button Priority Chain
    if (Cap.isPluginAvailable && Cap.isPluginAvailable('App')) {
      Cap.Plugins.App.addListener('backButton', ({ canGoBack }) => {
        // Priority 1: Check and close active modals
        const modalIds = [
          'cartModal', 'wishlistModal', 'authModal',
          'shareModal', 'reelModal', 'measureVideoModal', 'leadModal', 'adminModal'
        ];
        for (const id of modalIds) {
          const el = document.getElementById(id);
          if (el && (el.classList.contains('active') || el.style.display === 'flex' || el.style.display === 'block')) {
            el.classList.remove('active');
            el.style.display = 'none';
            document.body.classList.remove('modal-open');
            if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
            return;
          }
        }

        // Priority 2: Check and close mobile menu drawer
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu && mobileMenu.classList.contains('active')) {
          mobileMenu.classList.remove('active');
          document.body.classList.remove('modal-open');
          return;
        }

        // Priority 3: Navigate back in history if not on root home
        const path = window.location.pathname;
        const isHome = path === '/' || path === '/index.html' || path.endsWith('/index.html') || path === '';
        if (canGoBack && !isHome) {
          window.history.back();
          return;
        }

        // Priority 4: Exit App gracefully if on root screen
        if (isHome) {
          Cap.Plugins.App.exitApp();
        } else {
          window.location.href = 'index.html';
        }
      });
    }

    // 4. Offline & Network Status Handling
    if (Cap.isPluginAvailable && Cap.isPluginAvailable('Network')) {
      function showNetworkNotice(connected) {
        let banner = document.getElementById('nativeOfflineBanner');
        if (!connected) {
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'nativeOfflineBanner';
            banner.style.cssText = 'position:fixed;top:calc(12px + var(--sat,0px));left:50%;transform:translateX(-50%);background:#D93025;color:#fff;padding:8px 18px;border-radius:20px;font-size:12px;font-weight:500;font-family:Poppins,sans-serif;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.3);text-align:center;pointer-events:none;';
            banner.innerText = 'No internet connection. Please check your network and try again.';
            document.body.appendChild(banner);
          }
          banner.style.display = 'block';
        } else if (banner) {
          banner.style.display = 'none';
        }
      }

      Cap.Plugins.Network.getStatus().then(status => {
        if (!status.connected) showNetworkNotice(false);
      }).catch(() => {});

      Cap.Plugins.Network.addListener('networkStatusChange', status => {
        showNetworkNotice(status.connected);
      });
    }

    // 5. External Link Interception (WhatsApp, Instagram, Tel, Mailto)
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (!link || !link.href) return;
      const href = link.href;

      if (href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('sms:')) {
        return; // Handled by native OS
      }

      if (href.includes('wa.me') || href.includes('whatsapp.com') || href.includes('instagram.com') || href.includes('facebook.com') || href.includes('youtube.com') || href.includes('maps.google.com') || href.includes('goo.gl/maps')) {
        e.preventDefault();
        if (Cap.isPluginAvailable('Browser')) {
          Cap.Plugins.Browser.open({ url: href }).catch(() => {
            window.open(href, '_system');
          });
        } else {
          window.open(href, '_system');
        }
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNativeFeatures);
  } else {
    setupNativeFeatures();
  }
})();

// ================================================================
// FLIPKART / AMAZON LUXURY MOBILE APP INTERACTIVE MODULES
// ================================================================

(function initMobileAppInteractions() {
  // 1. Pincode Location Management
  window.openPincodeSelector = function() {
    const modal = document.getElementById('pincodeModal');
    if (modal) {
      modal.style.display = 'flex';
      const input = document.getElementById('pincodeInput');
      if (input) {
        input.value = localStorage.getItem('saforio_pincode') || '641001';
        setTimeout(() => input.focus(), 200);
      }
    }
  };

  window.closePincodeSelector = function() {
    const modal = document.getElementById('pincodeModal');
    if (modal) modal.style.display = 'none';
  };

  window.applyUserPincode = function() {
    const input = document.getElementById('pincodeInput');
    if (!input) return;
    const pin = input.value.trim();
    if (!pin || pin.length < 6) {
      alert("Please enter a valid 6-digit Pincode.");
      return;
    }
    localStorage.setItem('saforio_pincode', pin);
    const label = document.getElementById('appUserPincode');
    if (label) label.innerText = `Pin ${pin}`;
    closePincodeSelector();
    showToast(`📍 Delivery location set to ${pin}`);
  };

  // 2. Animated Typing Search Placeholder
  function initTypingPlaceholder() {
    const input = document.getElementById('appSearchInput');
    if (!input) return;

    const phrases = [
      "Search 'Pure Kanjivaram Silk'...",
      "Search 'Handcrafted Temple Jewellery'...",
      "Search 'Designer Bridal Blouses'...",
      "Search 'Festive Dubion Sarees'...",
      "Search 'Bridal Antique Chokers'..."
    ];
    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function typeLoop() {
      // Don't animate if input has focus or value
      if (document.activeElement === input || input.value) {
        setTimeout(typeLoop, 1500);
        return;
      }

      const currentPhrase = phrases[phraseIdx];
      if (isDeleting) {
        input.placeholder = currentPhrase.substring(0, charIdx - 1);
        charIdx--;
      } else {
        input.placeholder = currentPhrase.substring(0, charIdx + 1);
        charIdx++;
      }

      let speed = isDeleting ? 40 : 80;

      if (!isDeleting && charIdx === currentPhrase.length) {
        speed = 2000; // Pause at full phrase
        isDeleting = true;
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        speed = 400;
      }

      setTimeout(typeLoop, speed);
    }
    typeLoop();
  }

  // 3. Banner Carousel Slider (Flipkart Style Auto + Touch)
  let currentSlide = 0;
  const totalSlides = 3;
  let bannerTimer = null;

  window.appGoToSlide = function(idx) {
    currentSlide = (idx + totalSlides) % totalSlides;
    const track = document.getElementById('appCarouselTrack');
    if (track) {
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
    }
    const dots = document.querySelectorAll('#appCarouselDots .app-dot');
    dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
  };

  function initAppCarousel() {
    const carousel = document.getElementById('appBannerCarousel');
    if (!carousel) return;

    // Auto rotate every 4 seconds
    bannerTimer = setInterval(() => {
      window.appGoToSlide(currentSlide + 1);
    }, 4000);

    // Touch swipe gestures
    let startX = 0;
    let endX = 0;
    carousel.addEventListener('touchstart', (e) => {
      clearInterval(bannerTimer);
      startX = e.touches[0].clientX;
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
      endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) window.appGoToSlide(currentSlide + 1);
        else window.appGoToSlide(currentSlide - 1);
      }
      bannerTimer = setInterval(() => window.appGoToSlide(currentSlide + 1), 4000);
    }, { passive: true });
  }

  // 4. Live Flash Deal Countdown Timer
  function initDealCountdown() {
    const timerEl = document.getElementById('appDealTimer');
    if (!timerEl) return;

    function updateTimer() {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const diff = endOfDay - now;

      if (diff <= 0) {
        timerEl.innerText = "00h : 00m : 00s";
        return;
      }

      const hrs = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0');
      const mins = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, '0');
      const secs = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');

      timerEl.innerText = `${hrs}h : ${mins}m : ${secs}s`;
    }
    updateTimer();
    setInterval(updateTimer, 1000);
  }

  // 5. Category Story Bubbles & Quick Filter Chips
  window.appFilterCategory = function(cat) {
    window.appSearchQuery = '';
    window.appCurrentChip = '';
    const searchInput = document.getElementById('appSearchInput');
    if (searchInput) searchInput.value = '';

    // Update Story Items
    document.querySelectorAll('.app-story-item').forEach(item => item.classList.remove('active'));
    if (cat === 'all') {
      const allItem = document.querySelector('.app-story-item');
      if (allItem) allItem.classList.add('active');
    }

    // Update Chips
    document.querySelectorAll('.app-chip').forEach(c => c.classList.remove('active'));
    const allChip = document.querySelector('.app-chip[data-chip="all"]');
    if (allChip) allChip.classList.add('active');

    window.switchCategory(cat);
  };

  window.appSelectChip = function(chip, el) {
    window.appCurrentChip = chip;
    document.querySelectorAll('.app-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderGrid(true);
  };

  window.appFilterOffers = function() {
    window.appCurrentChip = 'offers';
    document.querySelectorAll('.app-chip').forEach(c => c.classList.toggle('active', c.dataset.chip === 'offers'));
    renderGrid(true);
  };

  window.handleAppSearch = function(query) {
    window.appSearchQuery = query;
    renderGrid(false);
  };

  window.focusAppSearch = function() {
    const input = document.getElementById('appSearchInput');
    if (input) input.focus();
  };

  window.triggerSearchAction = function() {
    const input = document.getElementById('appSearchInput');
    if (input && input.value.trim()) {
      handleAppSearch(input.value);
    } else {
      focusAppSearch();
    }
  };

  window.openAppAccount = function() {
    if (currentUser) {
      toggleWishlist();
    } else {
      openAuth();
    }
  };

  // Initialize all mobile modules on page load
  document.addEventListener('DOMContentLoaded', () => {
    initTypingPlaceholder();
    initAppCarousel();
    initDealCountdown();

    const savedPin = localStorage.getItem('saforio_pincode');
    if (savedPin) {
      const label = document.getElementById('appUserPincode');
      if (label) label.innerText = `Pin ${savedPin}`;
    }
  });
})();

// ================================================================
// ROKEA BY RK — EXACT LUXURY 5-SCREEN MOBILE APP CONTROLLER
// 100% Dynamic Real Store Database & Inventory Integration
// ================================================================
(function () {
  window.currentAppScreen = 'home';
  window.currentShopTab = 'sarees';
  window.currentShopCategory = 'all';
  window.currentShopSortOrder = 'newest';
  window.currentDetailProduct = null;
  window.appSearchQuery = '';

  // 1. Screen Switching Engine
  window.switchAppScreen = function (screenName) {
    window.currentAppScreen = screenName;
    const screens = {
      home: document.getElementById('appScreenHome'),
      shop: document.getElementById('appScreenShop'),
      detail: document.getElementById('appScreenDetail'),
      stylist: document.getElementById('appScreenStylist'),
      profile: document.getElementById('appScreenProfile')
    };

    Object.keys(screens).forEach(key => {
      if (screens[key]) {
        screens[key].classList.toggle('active-screen', key === screenName);
      }
    });

    const tabMap = {
      home: 'tabHome',
      shop: 'tabShop',
      stylist: 'tabStylist',
      profile: 'tabProfile'
    };

    document.querySelectorAll('.app-nav-item').forEach(item => item.classList.remove('active'));
    if (tabMap[screenName]) {
      const activeTab = document.getElementById(tabMap[screenName]);
      if (activeTab) activeTab.classList.add('active');
    }

    const leftIcon = document.getElementById('appHeaderLeftIcon');
    if (leftIcon) {
      if (screenName === 'home') {
        leftIcon.innerHTML = `<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`;
      } else {
        leftIcon.innerHTML = `<polyline points="15 18 9 12 15 6"/><line x1="9" y1="12" x2="21" y2="12"/>`;
      }
    }

    // Header Right: On shop screen, show Search 🔍; on other screens show Wishlist ♡
    const searchWrap = document.getElementById('appHeaderSearchWrap');
    const wishWrap = document.getElementById('appHeaderWishWrap');
    if (searchWrap && wishWrap) {
      if (screenName === 'shop') {
        searchWrap.style.display = 'block';
        wishWrap.style.display = 'none';
      } else {
        searchWrap.style.display = 'none';
        wishWrap.style.display = 'block';
      }
    }

    if (screenName === 'home') {
      window.renderAppHomeScreen();
    } else if (screenName === 'shop') {
      window.renderAppShopGrid();
    } else if (screenName === 'stylist') {
      window.renderAppStylistScreen();
    } else if (screenName === 'profile') {
      window.syncAppProfileData();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.toggleAppHeaderSearch = function () {
    const dropdown = document.getElementById('appHeaderSearchDropdown');
    const input = document.getElementById('appLiveSearchInput');
    if (dropdown) {
      const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
      dropdown.style.display = isHidden ? 'block' : 'none';
      if (isHidden && input) {
        input.focus();
      }
    }
  };

  window.handleAppHeaderLeft = function () {
    if (window.currentAppScreen === 'home') {
      if (typeof openAppointmentModal === 'function') {
        openAppointmentModal();
      }
    } else {
      window.switchAppScreen('home');
    }
  };

  // 2. Real Store Data Home Screen Renderer
  window.renderAppHomeScreen = function () {
    if (!Array.isArray(products) || products.length === 0) return;

    const sarees = products.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return !cat.includes('jewel') && !name.includes('necklace') && !name.includes('earring') && !name.includes('choker');
    });

    const jewellery = products.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return cat.includes('jewel') || name.includes('necklace') || name.includes('earring') || name.includes('choker') || name.includes('pendant');
    });

    // Update Featured Cards Images
    const featImgSaree = document.getElementById('appFeatImgSaree');
    const featImgJewel = document.getElementById('appFeatImgJewel');
    if (featImgSaree && sarees.length > 0 && sarees[0].image) {
      featImgSaree.src = sarees[0].image;
    }
    if (featImgJewel && jewellery.length > 0 && jewellery[0].image) {
      featImgJewel.src = jewellery[0].image;
    }
  };

  // 3. Real Store Data Shop Screen Renderer
  window.openShopCategory = function (category) {
    window.currentShopCategory = category;
    if (category === 'jewellery') {
      window.currentShopTab = 'jewellery';
    } else {
      window.currentShopTab = 'sarees';
    }
    window.switchAppScreen('shop');
    window.updateShopTabUI();
    window.renderAppShopGrid(category);
  };

  window.switchShopTab = function (tabName) {
    window.currentShopTab = tabName;
    window.currentShopCategory = tabName === 'jewellery' ? 'jewellery' : 'all';
    window.updateShopTabUI();
    window.renderAppShopGrid();
  };

  window.updateShopTabUI = function () {
    const tabSarees = document.getElementById('shopTabSarees');
    const tabJewellery = document.getElementById('shopTabJewellery');
    if (tabSarees && tabJewellery) {
      tabSarees.classList.toggle('active', window.currentShopTab === 'sarees');
      tabJewellery.classList.toggle('active', window.currentShopTab === 'jewellery');
    }
  };

  window.handleAppLiveSearch = function (query) {
    window.appSearchQuery = (query || '').toLowerCase().trim();
    if (window.currentAppScreen !== 'shop') {
      window.switchAppScreen('shop');
    }
    window.renderAppShopGrid();
  };

  window.renderAppShopGrid = function (explicitFilter) {
    const gridEl = document.getElementById('appShopProductGrid');
    if (!gridEl) return;

    const filter = explicitFilter || window.currentShopCategory || 'all';
    const isJewelleryTab = window.currentShopTab === 'jewellery';

    let list = Array.isArray(products) ? [...products] : [];

    // Filter by Tab
    if (isJewelleryTab) {
      list = list.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        return cat.includes('jewel') || name.includes('necklace') || name.includes('earring') || name.includes('choker') || name.includes('pendant') || name.includes('bangle');
      });
    } else {
      list = list.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const isJ = cat.includes('jewel') || name.includes('necklace') || name.includes('earring') || name.includes('choker') || name.includes('pendant') || name.includes('bangle');
        return !isJ;
      });
    }

    // Filter by category
    if (filter !== 'all' && filter !== 'jewellery') {
      list = list.filter(p => {
        const text = ((p.category || '') + ' ' + (p.name || '') + ' ' + (p.description || '')).toLowerCase();
        return text.includes(filter);
      });
    }

    // Filter by Search Query
    if (window.appSearchQuery) {
      list = list.filter(p => {
        const text = ((p.name || '') + ' ' + (p.category || '') + ' ' + (p.description || '')).toLowerCase();
        return text.includes(window.appSearchQuery);
      });
    }

    // Sort order
    if (window.currentShopSortOrder === 'price-low') {
      list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (window.currentShopSortOrder === 'price-high') {
      list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else {
      list.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    if (list.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #7E7267;">
          <p style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">No products found</p>
          <p style="font-size: 11px;">Explore our other handcrafted collections.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = list.map(p => {
      const pName = p.name || 'Handcrafted Luxury Saree';
      const pPrice = Number(p.price) ? '₹ ' + Number(p.price).toLocaleString('en-IN') : '₹ 4,999';
      const pImg = p.image || 'https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_400/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg';
      const isWishlisted = Array.isArray(wishlist) && wishlist.some(w => String(w.id) === String(p.id));

      return `
        <div class="app-grid-card" onclick="openAppProductDetail('${p.id}')">
          <span class="app-card-badge-new">${p.badge || 'New'}</span>
          <div class="app-card-img-wrap">
            <img src="${pImg}" alt="${pName}" loading="lazy" onerror="this.src='https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_400/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg'">
            <button class="app-card-heart-btn" onclick="event.stopPropagation(); toggleWishlistFromApp('${p.id}')" aria-label="Add to Wishlist">
              <svg viewBox="0 0 24 24" fill="${isWishlisted ? '#e91e63' : 'none'}" stroke="${isWishlisted ? '#e91e63' : '#140C06'}" stroke-width="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
          </div>
          <div class="app-card-body">
            <h3 class="app-card-name">${pName}</h3>
            <div class="app-card-price-row">
              <p class="app-card-price">${pPrice}</p>
              <span class="app-card-heart-icon-small" onclick="event.stopPropagation(); toggleWishlistFromApp('${p.id}')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${isWishlisted ? '#e91e63' : 'none'}" stroke="${isWishlisted ? '#e91e63' : '#8C7D6E'}" stroke-width="1.8">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  window.selectShopFilterChip = function (chipId) {
    window.currentShopCategory = chipId;
    window.renderAppShopGrid(chipId);
  };

  window.toggleShopFilter = function () {
    const isJ = window.currentShopTab === 'jewellery';
    const modes = isJ ? ['all', 'necklace', 'antique', 'choker'] : ['all', 'silk', 'dubion', 'viscose', 'bridal'];
    const curIdx = modes.indexOf(window.currentShopCategory);
    const nextMode = modes[(curIdx + 1) % modes.length];
    window.selectShopFilterChip(nextMode);
  };

  window.toggleShopSort = function () {
    const sortLabel = document.getElementById('appSortLabel');
    if (window.currentShopSortOrder === 'newest') {
      window.currentShopSortOrder = 'price-low';
      if (sortLabel) sortLabel.innerText = 'Price: Low ▾';
    } else if (window.currentShopSortOrder === 'price-low') {
      window.currentShopSortOrder = 'price-high';
      if (sortLabel) sortLabel.innerText = 'Price: High ▾';
    } else {
      window.currentShopSortOrder = 'newest';
      if (sortLabel) sortLabel.innerText = 'Newest ▾';
    }
    window.renderAppShopGrid();
  };

  // 4. Real Store Product Detail Engine (Screen 3)
  window.openAppProductDetail = function (productId) {
    let p = products.find(item => String(item.id) === String(productId));
    if (!p && products.length > 0) p = products[0];
    if (!p) return;

    window.currentDetailProduct = p;

    const isJewellery = (p.category || '').toLowerCase().includes('jewel') || 
                        (p.name || '').toLowerCase().includes('necklace') || 
                        (p.name || '').toLowerCase().includes('earring') || 
                        (p.name || '').toLowerCase().includes('choker');

    const imgEl = document.getElementById('appDetailImg');
    const titleEl = document.getElementById('appDetailTitle');
    const priceEl = document.getElementById('appDetailPrice');
    const origPriceEl = document.getElementById('appDetailOriginalPrice');
    const taglineEl = document.getElementById('appDetailTagline');
    const descEl = document.getElementById('appDetailFullDesc');
    const careDescEl = document.getElementById('appDetailCareDesc');
    const pageBadge = document.getElementById('appDetailPageBadge');

    if (imgEl) imgEl.src = p.image || 'https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_600/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg';
    if (titleEl) titleEl.innerText = p.name || 'Handcrafted Luxury Piece';
    if (priceEl) priceEl.innerText = Number(p.price) ? '₹ ' + Number(p.price).toLocaleString('en-IN') : '₹ 4,999';

    if (origPriceEl) {
      if (p.originalPrice && Number(p.originalPrice) > Number(p.price)) {
        origPriceEl.innerText = '₹ ' + Number(p.originalPrice).toLocaleString('en-IN');
        origPriceEl.style.display = 'inline';
      } else {
        origPriceEl.style.display = 'none';
      }
    }

    if (taglineEl) {
      taglineEl.innerText = isJewellery 
        ? 'Antique Gold Finish | Premium Handcrafted Jewellery | Coimbatore'
        : `${(p.category || 'Handloom Silk').toUpperCase()} | Authentic Zari Weave | Coimbatore`;
    }

    // Dynamic Category Specific Badges
    const b1Icon = document.getElementById('appBadge1Icon');
    const b1Text = document.getElementById('appBadge1Text');
    const b2Icon = document.getElementById('appBadge2Icon');
    const b2Text = document.getElementById('appBadge2Text');
    const b3Icon = document.getElementById('appBadge3Icon');
    const b3Text = document.getElementById('appBadge3Text');

    if (b1Icon && b1Text && b2Icon && b2Text && b3Icon && b3Text) {
      if (isJewellery) {
        b1Icon.innerText = '💎'; b1Text.innerText = 'Antique Finish';
        b2Icon.innerText = '✨'; b2Text.innerText = '100% Handcrafted';
        b3Icon.innerText = '🔒'; b3Text.innerText = 'Tarnish Protected';
      } else {
        b1Icon.innerText = '🥻'; b1Text.innerText = '100% Pure Silk';
        b2Icon.innerText = '🏛️'; b2Text.innerText = 'Direct Weavers';
        b3Icon.innerText = '👑'; b3Text.innerText = 'Heritage Quality';
      }
    }

    if (descEl) {
      descEl.innerText = p.description || 'Exquisitely handcrafted with pure craftsmanship and authentic traditional motifs, ensuring timeless elegance for your special occasions.';
    }

    if (careDescEl) {
      careDescEl.innerText = isJewellery ? JEWELLERY_CARE_INSTRUCTIONS : `SILK SAREE CARE & PRESERVATION
✦ Dry clean only for the first three washes.
✦ Store in pure cotton cloth bags in a cool, dry place.
✦ Iron on low heat on the reverse side.
✦ Avoid direct contact with liquid perfumes or sprays.`;
    }

    if (pageBadge) {
      pageBadge.innerText = '1/1';
    }

    window.switchAppScreen('detail');
  };

  window.askProductOnWhatsApp = function () {
    const p = window.currentDetailProduct || (products.length > 0 ? products[0] : null);
    const prodName = p ? p.name : 'ROKEA Collection';
    const prodPrice = p && p.price ? '₹' + p.price : '';
    const text = encodeURIComponent(`Hi ROKEA by RK, I am interested in purchasing "${prodName}" ${prodPrice}. Can you assist me?`);
    window.open(`https://wa.me/917010394051?text=${text}`, '_blank');
  };

  window.openCustomBlouseModal = function () {
    const section = document.getElementById('custom-blouse');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
    if (typeof openAppointmentModal === 'function') {
      openAppointmentModal();
    }
  };

  // Detail Controls
  window.selectColorSwatch = function (el, colorName) {
    document.querySelectorAll('.app-color-dot').forEach(dot => dot.classList.remove('active'));
    if (el) el.classList.add('active');
    const nameEl = document.getElementById('appSelectedColorName');
    if (nameEl) nameEl.innerText = colorName;
  };

  window.selectSize = function (el) {
    document.querySelectorAll('.app-size-btn').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
  };

  window.toggleDetailAccordion = function () {
    const descEl = document.getElementById('appDetailFullDesc');
    const arrowEl = document.getElementById('appDetailAccArrow');
    if (descEl) {
      const isHidden = descEl.style.display === 'none';
      descEl.style.display = isHidden ? 'block' : 'none';
      if (arrowEl) arrowEl.innerText = isHidden ? '▴' : '▾';
    }
  };

  window.toggleCareAccordion = function () {
    const descEl = document.getElementById('appDetailCareDesc');
    const arrowEl = document.getElementById('appCareAccArrow');
    if (descEl) {
      const isHidden = descEl.style.display === 'none';
      descEl.style.display = isHidden ? 'block' : 'none';
      if (arrowEl) arrowEl.innerText = isHidden ? '▴' : '▾';
    }
  };

  window.addCurrentDetailToCart = function () {
    if (!window.currentDetailProduct && products.length > 0) {
      window.currentDetailProduct = products[0];
    }
    if (!window.currentDetailProduct) return;

    if (typeof addToCart === 'function') {
      addToCart(window.currentDetailProduct.id);
    } else {
      const existing = cart.find(c => String(c.id) === String(window.currentDetailProduct.id));
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        cart.push({ ...window.currentDetailProduct, quantity: 1 });
      }
      localStorage.setItem('saforio_cart', JSON.stringify(cart));
    }

    window.updateAppBadges();
    if (typeof showToast === 'function') {
      showToast(`Added "${window.currentDetailProduct.name}" to Bag! 🛍️`);
    } else {
      alert(`Added "${window.currentDetailProduct.name}" to Bag! 🛍️`);
    }
  };

  window.buyCurrentDetailNow = function () {
    window.addCurrentDetailToCart();
    if (typeof toggleCart === 'function') {
      toggleCart();
    }
  };

  // Wishlist toggle from app
  window.toggleWishlistFromApp = function (productId) {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;

    const idx = wishlist.findIndex(w => String(w.id) === String(productId));
    if (idx > -1) {
      wishlist.splice(idx, 1);
      if (typeof showToast === 'function') showToast('Removed from wishlist');
    } else {
      wishlist.push(prod);
      if (typeof showToast === 'function') showToast('Added to wishlist ❤️');
    }

    localStorage.setItem('saforio_wishlist', JSON.stringify(wishlist));
    window.updateAppBadges();
    if (window.currentAppScreen === 'shop') window.renderAppShopGrid();
    if (window.currentAppScreen === 'home') window.renderAppHomeScreen();
    if (window.currentAppScreen === 'stylist') window.renderAppStylistScreen();
  };

  // 5. Real Inventory AI Stylist Screen (Screen 4 - Exact Template Match)
  window.renderAppStylistScreen = function () {
    const sampleGrid = document.getElementById('appStylistSampleGrid');
    if (!sampleGrid) return;

    const sarees = (Array.isArray(products) && products.length > 0)
      ? products.filter(p => !((p.category || '').toLowerCase().includes('jewel')))
      : [];
    const jewels = (Array.isArray(products) && products.length > 0)
      ? products.filter(p => (p.category || '').toLowerCase().includes('jewel') || (p.name || '').toLowerCase().includes('necklace'))
      : [];

    const p1 = sarees[0] || (products && products[0]) || {
      id: 'style_trad_1',
      name: 'Traditional Elegance',
      price: 18500,
      image: 'https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_500/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg'
    };

    const p2 = sarees[1] || jewels[0] || (products && products[1]) || {
      id: 'style_royal_1',
      name: 'Royal Bridal',
      price: 26000,
      image: 'https://static.wixstatic.com/media/9881b8_1e967a508927429188094cfbb323fcf6~mv2.jpg/v1/fill/w_500,h_625,al_c,q_80/jewellery.jpg'
    };

    const currentWish = (JSON.parse(localStorage.getItem('saforio_wishlist') || '[]')).map(x => String(x.id));
    const wish1 = currentWish.includes(String(p1.id));
    const wish2 = currentWish.includes(String(p2.id));

    sampleGrid.innerHTML = `
      <div class="app-sample-card" onclick="openAppProductDetail('${p1.id}')">
        <div class="app-sample-img-wrap">
          <img src="${p1.image || 'https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_500/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg'}" alt="Traditional Elegance" loading="lazy" onerror="this.src='https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_500/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg'">
          <button class="app-sample-wishlist-btn" onclick="event.stopPropagation(); toggleAppWishlist('${p1.id}')" aria-label="Add to Wishlist">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${wish1 ? '#e91e63' : 'none'}" stroke="${wish1 ? '#e91e63' : '#1A120C'}" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
        </div>
        <div class="app-sample-info">
          <h4 class="app-sample-title">Traditional Elegance</h4>
          <p class="app-sample-subtitle">Saree + Temple Jewellery</p>
        </div>
      </div>

      <div class="app-sample-card" onclick="openAppProductDetail('${p2.id}')">
        <div class="app-sample-img-wrap">
          <img src="${p2.image || 'https://static.wixstatic.com/media/9881b8_1e967a508927429188094cfbb323fcf6~mv2.jpg/v1/fill/w_500,h_625,al_c,q_80/jewellery.jpg'}" alt="Royal Bridal" loading="lazy" onerror="this.src='https://res.cloudinary.com/drkgkgiat/image/upload/f_auto,q_auto,w_500/v1777447204/rk_saree_banner_copy.jpg_d6mphh.jpg'">
          <button class="app-sample-wishlist-btn" onclick="event.stopPropagation(); toggleAppWishlist('${p2.id}')" aria-label="Add to Wishlist">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${wish2 ? '#e91e63' : 'none'}" stroke="${wish2 ? '#e91e63' : '#1A120C'}" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
        </div>
        <div class="app-sample-info">
          <h4 class="app-sample-title">Royal Bridal</h4>
          <p class="app-sample-subtitle">Saree + Polki Jewellery</p>
        </div>
      </div>
    `;
  };

  window.triggerStylistUpload = function () {
    const fileInput = document.getElementById('stylistFileInput');
    if (fileInput) fileInput.click();
  };

  window.handleStylistFile = function (input) {
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const uploadCard = document.getElementById('appStylistUploadCard');
        if (uploadCard) {
          uploadCard.innerHTML = `
            <div style="width:74px; height:74px; border-radius:50%; overflow:hidden; margin:0 auto 12px; border:2.5px solid #C9A84C; box-shadow:0 4px 15px rgba(201,168,76,0.4);">
              <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <h3 class="app-upload-title" style="color:#C9A84C; font-size:16px; margin-bottom:4px;">✨ Stylist Analyzed!</h3>
            <p class="app-upload-desc">We matched your skin tone and occasion with our <strong>Handpicked Silk Sarees &amp; Temple Jewellery</strong>.</p>
            <button class="app-btn-upload-photo" onclick="switchAppScreen('shop')">EXPLORE MATCHED LOOKS &rarr;</button>
          `;
        }
      };
      reader.readAsDataURL(input.files[0]);
    }
  };

  // 6. User Profile Screen (Screen 5 - Real Dynamic User & Store Data)
  window.syncAppProfileData = function () {
    const profileName = document.getElementById('appProfileName');
    const profileEmail = document.getElementById('appProfileEmail');
    const profileBadge = document.getElementById('appProfileBadge');
    const authBtnText = document.getElementById('appAuthActionBtnText');
    const authIcon = document.getElementById('appAuthActionIcon');
    const userAvatar = document.getElementById('appUserAvatar');
    const wishSub = document.getElementById('appMenuWishSub');
    const ordersSub = document.getElementById('appMenuOrdersSub');
    const pincodeSub = document.getElementById('appMenuPincodeSub');

    const activeUser = currentUser || JSON.parse(localStorage.getItem('saforio_currentUser'));

    if (activeUser) {
      if (profileName) profileName.innerText = activeUser.name || activeUser.displayName || 'Karthikeyani M';
      if (profileEmail) profileEmail.innerText = activeUser.email || activeUser.phone || 'karthikeyani@gmail.com';
      if (profileBadge) profileBadge.innerText = 'Premium Member';
      if (authBtnText) authBtnText.innerText = 'Log Out';
      if (authIcon) authIcon.innerText = '🚪';
      if (userAvatar && activeUser.photoURL) userAvatar.src = activeUser.photoURL;
    } else {
      if (profileName) profileName.innerText = 'Welcome Customer';
      if (profileEmail) profileEmail.innerText = 'Sign in to access your orders & perks';
      if (profileBadge) profileBadge.innerText = 'Guest Member';
      if (authBtnText) authBtnText.innerText = 'Log In / Register';
      if (authIcon) authIcon.innerText = '🔐';
    }

    if (wishSub) {
      const count = Array.isArray(wishlist) ? wishlist.length : 0;
      wishSub.innerText = `${count} saved item${count === 1 ? '' : 's'}`;
    }

    if (ordersSub) {
      const cartCount = Array.isArray(cart) ? cart.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
      ordersSub.innerText = cartCount > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'} in bag` : 'View order history & track';
    }

    if (pincodeSub) {
      const savedPin = localStorage.getItem('saforio_pincode');
      pincodeSub.innerText = savedPin ? `Delivery to ${savedPin}` : 'Delivery addresses';
    }
  };

  window.handleAppLogout = function () {
    const activeUser = currentUser || JSON.parse(localStorage.getItem('saforio_currentUser'));
    if (activeUser) {
      if (typeof handleLogout === 'function') {
        handleLogout();
      } else {
        localStorage.removeItem('saforio_currentUser');
        currentUser = null;
        if (typeof showToast === 'function') showToast('Logged out successfully');
      }
      window.syncAppProfileData();
    } else {
      if (typeof openAuth === 'function') {
        openAuth();
      }
    }
  };

  // 7. Badge Sync
  window.updateAppBadges = function () {
    const cartCount = Array.isArray(cart) ? cart.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
    const wishCount = Array.isArray(wishlist) ? wishlist.length : 0;

    const cartBadge = document.getElementById('appCartBadge');
    if (cartBadge) {
      cartBadge.innerText = cartCount;
      cartBadge.style.display = cartCount > 0 ? 'flex' : 'none';
    }

    const wishBadge = document.getElementById('appWishBadge');
    if (wishBadge) {
      wishBadge.innerText = wishCount;
      wishBadge.style.display = wishCount > 0 ? 'flex' : 'none';
    }
  };

  // Hook into renderAll so real products instantly update mobile screens
  const originalRenderAll = window.renderAll;
  window.renderAll = function () {
    if (typeof originalRenderAll === 'function') originalRenderAll();
    window.updateAppBadges();
    window.renderAppHomeScreen();
    if (window.currentAppScreen === 'shop') window.renderAppShopGrid();
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.updateAppBadges();
    window.renderAppHomeScreen();
    window.renderAppShopGrid();
    window.syncAppProfileData();
  });
})();



