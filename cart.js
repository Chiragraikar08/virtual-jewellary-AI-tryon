// cart.js — Shopping Cart Logic

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let cartOpen = false;

// ── Init ───────────────────────────────────────────────────────
window.onload = function () { loadCart(); };
document.addEventListener('DOMContentLoaded', () => { loadCart(); });

// ── Toggle Cart Panel ──────────────────────────────────────────
function toggleCart() {
    cartOpen = !cartOpen;
    const panel = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    if (panel)   panel.classList.toggle('open', cartOpen);
    if (overlay) overlay.classList.toggle('visible', cartOpen);
}

// ── Add to Cart ────────────────────────────────────────────────
function addToCart(itemId) {
    if (typeof JEWELRY_CATALOG === 'undefined') return;
    const item = JEWELRY_CATALOG.find(j => j.id === itemId);
    if (!item) return;

    cart.push(item);
    localStorage.setItem("cart", JSON.stringify(cart));
    loadCart();

    // Auto-open the panel
    const panel = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    if (panel && !cartOpen) {
        cartOpen = true;
        panel.classList.add('open');
        if (overlay) overlay.classList.add('visible');
    }

    showCartToast(item.name);
}

// ── Remove Item ────────────────────────────────────────────────
function removeItem(index) {
    cart = JSON.parse(localStorage.getItem("cart")) || [];
    cart.splice(index, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    loadCart();
}

// ── Load / Render Cart ─────────────────────────────────────────
function loadCart() {
    cart = JSON.parse(localStorage.getItem("cart")) || [];

    // Update badge
    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.textContent = cart.length;

    const container = document.getElementById('cart-items');
    const totalEl   = document.getElementById('cart-total');
    if (!container) return;

    container.innerHTML = '';

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <p>Your bag is empty</p>
                <small>Add some jewelry to get started!</small>
            </div>`;
        if (totalEl) totalEl.textContent = '₹0';
        return;
    }

    let total = 0;

    cart.forEach((item, index) => {
        // Parse INR value — handles "Rs. 87,150" and "₹87,150" formats
        const rawPrice = parseInt(String(item.price).replace(/[^0-9]/g, '')) || 0;
        total += rawPrice;

        const div = document.createElement('div');
        div.className = 'cart-card';
        div.innerHTML = `
            <img src="${item.image || '/static/images/placeholder.png'}"
                 class="cart-img"
                 alt="${item.name}"
                 onerror="this.src='/static/images/placeholder.png'">
            <div class="cart-info">
                <p class="cart-name">${item.name}</p>
                <p class="cart-price">${item.price}</p>
            </div>
            <button class="remove-btn" onclick="removeItem(${index})" title="Remove item">❌</button>
        `;
        container.appendChild(div);
    });

    // Show formatted total
    if (totalEl) {
        totalEl.textContent = '₹' + total.toLocaleString('en-IN');
    }
}

// ── Buy Now handled globally by app.js ──────────────────────

// ── Proceed to Buy (from cart footer) ─────────────────────────
function proceedToBuy() {
    const freshCart = JSON.parse(localStorage.getItem("cart")) || [];
    if (freshCart.length === 0) {
        showCartToast('Your bag is empty!');
        return;
    }
    // Trigger the invoice modal using the first item in the cart
    if (window.buyNow) {
        window.buyNow(freshCart[0].id);
        toggleCart(); // Close the cart overlay
    }
}

// ── Toast Notification ─────────────────────────────────────────
function showCartToast(msg) {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        toast.style.cssText = [
            'position:fixed', 'bottom:28px', 'left:50%',
            'transform:translateX(-50%)',
            'background:linear-gradient(135deg,#d4a847,#8a6a22)',
            'color:#000', 'font-weight:700', 'font-size:13px',
            'padding:10px 20px', 'border-radius:24px',
            'box-shadow:0 4px 20px rgba(212,168,71,0.5)',
            'z-index:9999', 'opacity:0',
            'transition:opacity 0.3s ease',
            'font-family:Inter,sans-serif',
            'pointer-events:none', 'white-space:nowrap'
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent = `✅ ${msg}`;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

// ── formatINR fallback ─────────────────────────────────────────
function formatINR(p) {
    if (window._appFormatINR) return window._appFormatINR(p);
    return p;
}
