// app.js — Main orchestration layer (three independent modes)

document.addEventListener('DOMContentLoaded', () => {
    // ══════════════════════════════════════════════════════════
    // BACKEND CONFIGURATION
    // ══════════════════════════════════════════════════════════
    // ⚠️ AFTER deploying backend to Render, replace the URL below with your Render URL.
    // Example: "https://virtual-jewellary-api.onrender.com"
    // For local development, use: "http://127.0.0.1:5000"
    const BACKEND_URL = "https://virtual-jewellary-ai-tryon.onrender.com";

    // ── Wake Up Render Server (Cold-Start Ping) ───────────────
    // Render free tier sleeps after 15 minutes of inactivity.
    // We send a silent background request immediately on page load to wake it up.
    fetch(`${BACKEND_URL}/api/ping`).catch(e => console.warn('Ping failed - server might be sleeping.'));

    // ── State ─────────────────────────────────────────────────
    let currentMode = 'catalog';   // 'catalog' | 'explore' | 'tryon'
    let currentItem = null;
    let viewer = null;
    let viewerInitialized = false;
    let autoRotateOn = true;

    // ── DOM Refs ──────────────────────────────────────────────
    const panels = {
        catalog: document.getElementById('panel-catalog'),
        explore: document.getElementById('panel-explore'),
        tryon: document.getElementById('panel-tryon'),
    };
    const modeBtns = document.querySelectorAll('.mode-btn');
    const categoryFilter = document.getElementById('category-filter');
    const jewelryList = document.getElementById('jewelry-list');
    const autoRotateBtn = document.getElementById('btn-autorotate');
    const catalogGrid = document.getElementById('catalog-grid');

    // Try-on DOM
    const btnLaunchPython = document.getElementById('btn-launch-python');
    const btnEnableCam = document.getElementById('btn-enable-cam');
    const btnCapture = document.getElementById('btn-capture');
    const btnRetake = document.getElementById('btn-retake');
    const btnDownload = document.getElementById('btn-download');
    const webcamVideo = document.getElementById('webcam-video');
    const tryonCanvas = document.getElementById('tryon-canvas');
    const tryonContent = document.getElementById('tryon-content');
    const tryonPermission = document.getElementById('tryon-permission');
    const hudEl = document.getElementById('tryon-hud');

    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalImg = document.getElementById('modal-img');
    const modalClose = document.getElementById('modal-close');
    const modalRetake = document.getElementById('modal-retake');
    const modalDownload = document.getElementById('modal-download');

    // Product sidebar
    const productBadge = document.getElementById('product-badge');
    const productName = document.getElementById('product-name');
    const productPrice = document.getElementById('product-price');
    const productRating = document.getElementById('product-rating-val');
    const productRatCt = document.getElementById('product-rating-ct');
    const productRatStars = document.getElementById('product-rating-stars');
    const productDesc = document.getElementById('product-desc-text');
    const specMaterial = document.getElementById('spec-material');
    const specCategory = document.getElementById('spec-category');
    const specPrice = document.getElementById('spec-price');
    const specId = document.getElementById('spec-id');
    const colorDots = document.getElementById('color-dots');
    const btnTryonNow = document.getElementById('btn-tryon-now');
    const btnCart = document.getElementById('btn-cart');

    // Try-On quick category buttons
    const catQuickBtns = document.querySelectorAll('.cat-quick-btn');

    // ── State variables ───────────────────────────────────────
    let cameraStarted = false;
    let tryonEngine = null;
    let currentCatalogFilter = 'all';
    const catalogFilters = document.querySelectorAll('.filter-btn');

    // ── 3D Viewer — deferred init (canvas must be visible) ────
    const canvas3d = document.getElementById('canvas-3d');
    function initViewer() {
        if (viewerInitialized || !canvas3d) return;
        viewerInitialized = true;
        viewer = new JewelryViewer(canvas3d);
        // Load current item into viewer
        if (currentItem) viewer.loadJewelry(currentItem);
    }

    // ── Particles ─────────────────────────────────────────────
    initParticles();

    // ── Gold Rate & INR conversion ────────────────────────────
    let usdToInr = 83.5;   // safe fallback until API returns

    function formatINR(usdPrice) {
        if (typeof usdPrice === 'string' && (usdPrice.toLowerCase().includes('rs') || usdPrice.includes('₹'))) {
            return usdPrice.replace(/Rs\.?\s*/ig, '₹');
        }
        const num = parseFloat(String(usdPrice).replace(/[^0-9.]/g, ''));
        if (isNaN(num)) return usdPrice;
        const inr = Math.round(num * usdToInr);
        return '₹' + inr.toLocaleString('en-IN');
    }

    async function initGoldRate() {
        const CACHE_KEY = 'goldRate_v2';
        const todayKey = new Date().toISOString().slice(0, 10);
        const valEl = document.getElementById('gold-rate-values');

        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (cached && cached.date === todayKey) {
                applyGoldRate(cached);
                return;
            }
        } catch (e) { }

        // Setting a friendly loading message
        if (valEl) {
            valEl.innerHTML = '<span class="gold-rate-loading">⏳ Waking up server...</span>';
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/gold-rate`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            applyGoldRate(data);
        } catch (err) {
            console.warn('Gold rate fetch failed. Is Render sleeping?', err);
            // Fallback so the user isn't stuck waiting forever
            const staticData = {
                rate_22k_per_gram: 6800,
                rate_24k_per_gram: 7400,
                usd_to_inr: 83.5,
                date: new Date().toISOString().slice(0, 10)
            };
            applyGoldRate(staticData);
            if (valEl) {
                valEl.innerHTML += ' <span style="font-size: 8px; color: #ffaa00;">(Cached)</span>';
            }
        }
    }

    function applyGoldRate(data) {
        usdToInr = data.usd_to_inr || 83.5;
        renderGoldWidget(data);
        renderCatalog(activeCategory);
        render2DCatalog();
        if (currentItem) updateProductSidebar(currentItem);
    }

    function renderGoldWidget(data) {
        const valEl = document.getElementById('gold-rate-values');
        const metaEl = document.getElementById('gold-rate-meta');
        if (!valEl) return;

        if (!data) {
            valEl.innerHTML = '<span class="gold-rate-loading">Unavailable</span>';
            return;
        }

        const fmt = v => '₹' + Math.round(v).toLocaleString('en-IN');

        valEl.innerHTML = `
          <span class="gold-rate-chip">
            <span class="gold-karat k22">22K</span>
            <span class="gold-price-val">${fmt(data.rate_22k_per_gram)}</span>
            <span class="gold-per-unit">/g</span>
          </span>
          <span class="gold-rate-sep">|</span>
          <span class="gold-rate-chip">
            <span class="gold-karat k24">24K</span>
            <span class="gold-price-val">${fmt(data.rate_24k_per_gram)}</span>
            <span class="gold-per-unit">/g</span>
          </span>
        `;
        if (metaEl) {
            metaEl.textContent =
                `1 USD = ₹${data.usd_to_inr}  ·  Updated ${data.date}`;
        }
    }

    // ── Catalog rendering ─────────────────────────────────────
    let activeCategory = 'earrings';
    renderCatalog(activeCategory);
    render2DCatalog();

    // Select first item by default
    if (typeof JEWELRY_CATALOG !== 'undefined' && JEWELRY_CATALOG.length > 0) {
        currentItem = JEWELRY_CATALOG[0];
        selectItem(currentItem);
    }

    // Kick off gold rate load
    initGoldRate();

    // ── Category filter change ───────────────────────────────────
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            activeCategory = e.target.value;
            renderCatalog(activeCategory);
            
            if (activeCategory === 'all') {
                if (JEWELRY_CATALOG.length > 0) selectItem(JEWELRY_CATALOG[0]);
            } else {
                const first = JEWELRY_CATALOG.find(j => j.category === activeCategory);
                if (first) selectItem(first);
            }
        });
    }

    // ── Catalog Filter clicks (2D Viewer) ─────────────────────
    
    if (catalogFilters) {
        catalogFilters.forEach(btn => {
            btn.addEventListener('click', () => {
                catalogFilters.forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                currentCatalogFilter = btn.dataset.filter;
                render2DCatalog();
            });
        });
    }

    // ══════════════════════════════════════════════════════════
    // MODE SWITCHING — Clean separation
    // ══════════════════════════════════════════════════════════
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode === currentMode) return;
            switchMode(mode);
        });
    });

    function switchMode(mode) {
        currentMode = mode;
        modeBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
            b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false');
        });
        Object.values(panels).forEach(p => { if (p) p.classList.remove('active'); });
        if (panels[mode]) panels[mode].classList.add('active');

        if (mode === 'catalog') {
            render2DCatalog();
        }

        if (mode === 'explore') {
            // Initialize viewer on first visit (canvas must be visible)
            if (!viewerInitialized) {
                setTimeout(() => {
                    initViewer();
                }, 50);
            } else if (viewer) {
                // Force resize so canvas fills the visible panel
                viewer._onResize();
                // Reload current item so it renders
                if (currentItem) viewer.loadJewelry(currentItem);
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    // MODE 3: AI TRY-ON — Python Launcher
    // ══════════════════════════════════════════════════════════
    if (btnLaunchPython) {
        btnLaunchPython.addEventListener('click', async () => {
            btnLaunchPython.textContent = '🚀 Launching...';
            btnLaunchPython.disabled = true;
            try {
                const res = await fetch(`${BACKEND_URL}/api/start-tryon`);
                const data = await res.json();
                
                if (data.status === 'error') {
                     alert(data.message);
                } else {
                     alert(data.message);
                }
            } catch (err) {
                console.error('Launch failed:', err);
                alert('Could not connect to Replit backend. Is your Replit server running?');
            } finally {
                btnLaunchPython.textContent = '🚀 Launch AI Try-On (Desktop)';
                btnLaunchPython.disabled = false;
            }
        });
    }

    // ── Auto-rotate toggle (3D Viewer only) ──────────────────
    if (autoRotateBtn) {
        autoRotateBtn.addEventListener('click', () => {
            autoRotateOn = !autoRotateOn;
            if (viewer) viewer.setAutoRotate(autoRotateOn);
            autoRotateBtn.textContent = autoRotateOn ? '⟳ Auto Rotate: ON' : '⟳ Auto Rotate: OFF';
            autoRotateBtn.classList.toggle('off', !autoRotateOn);
        });
    }

    // ══════════════════════════════════════════════════════════
    // MODE 3: AI TRY-ON — Browser Camera (Experimental)
    // ══════════════════════════════════════════════════════════
    if (btnEnableCam) {
        console.log('[App] Enable Camera button found, attaching listener');
        btnEnableCam.addEventListener('click', async () => {
            console.log('[App] Camera button clicked');
            btnEnableCam.disabled = true;
            btnEnableCam.textContent = '⏳ Starting camera...';
            try {
                await startTryOnCamera();
            } catch (e) {
                console.error('[App] Camera start error:', e);
                btnEnableCam.disabled = false;
                btnEnableCam.textContent = '📷 Enable Browser Camera (Experimental)';
                return;
            }
            if (tryonPermission) tryonPermission.classList.add('hidden');
            if (tryonContent) tryonContent.classList.remove('hidden');
        });
    }

    // ══════════════════════════════════════════════════════════
    // MODE 1: 2D CATALOG — Product Cards
    // ══════════════════════════════════════════════════════════
    function render2DCatalog() {
        if (!catalogGrid) return;
        catalogGrid.innerHTML = '';

        if (typeof JEWELRY_CATALOG === 'undefined') return;

        let itemsToRender = JEWELRY_CATALOG;
        // The global variable currentCatalogFilter is set by the filter click listener. Default is 'all'.
        if (typeof currentCatalogFilter !== 'undefined' && currentCatalogFilter !== 'all') {
            itemsToRender = JEWELRY_CATALOG.filter(j => j.category === currentCatalogFilter);
        }

        itemsToRender.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';

            const discount = item.discount || (Math.floor(Math.random() * 20) + 10);
            const oldPrice = parseFloat(item.price.replace(/[^0-9.]/g, '')) * (1 + discount / 100);

            card.innerHTML = `
                <div class="product-card-badge">Premium</div>
                <div class="product-card-wishlist" onclick="this.textContent = this.textContent === '♡' ? '❤️' : '♡'">♡</div>
                <div class="product-card-img-wrapper">
                    <img src="${item.image || '/static/images/placeholder.png'}" alt="${item.name}" class="product-card-img" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'400\\'><rect fill=\\'%23161929\\' width=\\'400\\' height=\\'400\\'/><text fill=\\'%235a5570\\' x=\\'50%\\' y=\\'50%\\' font-family=\\'sans-serif\\' font-size=\\'14\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>No preview available</text></svg>'">
                </div>
                <div class="product-card-info">
                    <div class="product-card-name">${item.name}</div>
                    <div class="product-card-price-row">
                        <span class="product-card-price">${formatINR(item.price)}</span>
                        <span class="product-card-discount">${formatINR(oldPrice)}</span>
                    </div>
                    <div class="product-card-actions" style="margin-bottom: 8px;">
                        <button class="btn-card-action primary" onclick="addToCart('${item.id}')" style="background:var(--gold);color:#000;">Add to Cart</button>
                        <button class="btn-card-action primary" onclick="buyNow('${item.id}')" style="background:#fff;color:#000;">Buy Now</button>
                    </div>
                    <div class="product-card-actions">
                        <button class="btn-card-action" onclick="window.appSelect('${item.id}', 'explore')">3D View</button>
                        <button class="btn-card-action" onclick="window.appSelect('${item.id}', 'tryon')">Try On</button>
                    </div>
                </div>
            `;
            catalogGrid.appendChild(card);
        });
    }

    // Export select function for inline onclicks
    window.appSelect = (id, targetMode) => {
        const item = JEWELRY_CATALOG.find(j => j.id === id);
        if (item) {
            selectItem(item);
            switchMode(targetMode);
        }
    };

    // ── Sidebar Catalog rendering (Left Panel) ────────────────
    function renderCatalog(cat) {
        if (!jewelryList) return;
        jewelryList.innerHTML = '';
        if (typeof JEWELRY_CATALOG === 'undefined') return;

        const items = cat === 'all' 
            ? JEWELRY_CATALOG 
            : JEWELRY_CATALOG.filter(j => j.category === cat);
            
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'jewelry-card' + (currentItem?.id === item.id ? ' active' : '');
            card.dataset.id = item.id;

            const previewBg = item.gemColor
                ? `linear-gradient(135deg, ${item.color}55 0%, ${item.gemColor}44 100%)`
                : `linear-gradient(135deg, ${item.color}44 0%, ${item.color}22 100%)`;

            const stars = renderStars(item.rating);

            card.innerHTML = `
        <div class="card-preview" style="background:${previewBg}">
          <span style="filter:drop-shadow(0 0 6px ${item.color}99)">${getCategoryIcon(item.type)}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${item.name}</div>
          <div class="card-material">${item.material}</div>
          <div class="card-stars">${stars}</div>
        </div>
        <div class="card-price">${formatINR(item.price)}</div>
      `;

            card.addEventListener('click', () => selectItem(item));
            jewelryList.appendChild(card);
        });
    }

    function selectItem(item) {
        currentItem = item;

        // Update card highlights
        document.querySelectorAll('.jewelry-card').forEach(c => {
            c.classList.toggle('active', c.dataset.id === item.id);
        });

        // Update 3D viewer (only if in explore mode)
        if (viewer) viewer.loadJewelry(item);

        // Update try-on engine
        if (tryonEngine) tryonEngine.setItem(item);

        // Update try-on gallery
        if (cameraStarted) updateTryOnGallery();

        // Update sidebar
        updateProductSidebar(item);

        // Update category button states
        updateCategoryButtons();
    }

    function updateProductSidebar(item) {
        if (!productBadge || !productName) return;

        // Badge
        const badgeClass = item.material.toLowerCase().includes('platinum') ? 'badge-platinum' :
            item.material.toLowerCase().includes('silver') ? 'badge-silver' : 'badge-gold';
        productBadge.className = `product-badge ${badgeClass}`;
        productBadge.innerHTML = `${getMaterialIcon(item.material)} ${item.material}`;

        productName.textContent = item.name;
        if (productPrice) productPrice.textContent = formatINR(item.price);
        if (productRating) productRating.textContent = item.rating.toFixed(1);
        if (productRatCt) productRatCt.textContent = `(${item.ratingCount} reviews)`;
        if (productRatStars) productRatStars.innerHTML = renderStars(item.rating);
        if (productDesc) productDesc.textContent = item.description;

        if (specMaterial) specMaterial.textContent = item.material;
        if (specCategory) specCategory.textContent = capitalize(item.category);
        if (specPrice) specPrice.textContent = formatINR(item.price);
        if (specId) specId.textContent = item.id.toUpperCase();

        // Color dots
        if (colorDots) {
            colorDots.innerHTML = '';
            const colorVariants = [item.color];
            if (item.gemColor) colorVariants.push(item.gemColor);
            colorVariants.push('#c0c0c0', '#8b7355');
            colorVariants.slice(0, 4).forEach((c, i) => {
                const dot = document.createElement('div');
                dot.className = 'color-dot' + (i === 0 ? ' active' : '');
                dot.style.background = c;
                dot.title = c;
                dot.addEventListener('click', () => {
                    colorDots.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                });
                colorDots.appendChild(dot);
            });
        }
    }

    // ══════════════════════════════════════════════════════════
    // TRY-ON: Camera Start
    // ══════════════════════════════════════════════════════════
    async function startTryOnCamera() {
        if (typeof TryOnEngine === 'undefined') {
            alert('TryOnEngine not loaded. Please refresh.');
            return;
        }

        tryonEngine = new TryOnEngine({ videoEl: webcamVideo, canvasEl: tryonCanvas, hudEl });

        const detectorReady = await tryonEngine.initDetector();
        if (!detectorReady) {
            alert('Face detection failed to initialize. Please refresh and try again.');
            return;
        }

        const ok = await tryonEngine.startCamera();
        if (ok) {
            cameraStarted = true;

            if (tryonCanvas) {
                tryonCanvas.style.opacity = '1';
                tryonCanvas.style.pointerEvents = 'none';
            }

            tryonEngine.setItem(currentItem);
            if (btnCapture) btnCapture.disabled = false;

            setupTryOnControls();

            if (tryonEngine._setupKeyboardControls) {
                tryonEngine._setupKeyboardControls();
            }
        } else {
            alert('Camera access denied. Please allow camera access and try again.');
        }
    }

    function setupTryOnControls() {
        const toggleEarrings = document.getElementById('toggle-earrings');
        const toggleNecklace = document.getElementById('toggle-necklace');
        const toggleNosepin = document.getElementById('toggle-nosepin');

        function onToggleChange() {
            if (tryonEngine) {
                tryonEngine.setEnabledTypes({
                    earrings: toggleEarrings ? toggleEarrings.checked : true,
                    necklace: toggleNecklace ? toggleNecklace.checked : true,
                    nosepin: toggleNosepin ? toggleNosepin.checked : true
                });
            }
            updateTryOnGallery();
        }

        if (toggleEarrings) toggleEarrings.addEventListener('change', onToggleChange);
        if (toggleNecklace) toggleNecklace.addEventListener('change', onToggleChange);
        if (toggleNosepin) toggleNosepin.addEventListener('change', onToggleChange);

        updateTryOnGallery();
    }

    function updateTryOnGallery() {
        if (!tryonEngine) return;

        const toggleEarrings = document.getElementById('toggle-earrings');
        const toggleNecklace = document.getElementById('toggle-necklace');
        const toggleNosepin = document.getElementById('toggle-nosepin');

        const enabledCategories = [];
        if (toggleEarrings && toggleEarrings.checked) enabledCategories.push('earrings');
        if (toggleNecklace && toggleNecklace.checked) enabledCategories.push('necklace');
        if (toggleNosepin && toggleNosepin.checked) enabledCategories.push('nosepin');

        const items = JEWELRY_CATALOG.filter(j => enabledCategories.includes(j.category));
        if (tryonEngine.setGalleryItems) {
            tryonEngine.setGalleryItems(items, enabledCategories.join('+'));
        }

        // Update Left Panel Collection List
        const collectionList = document.getElementById('tryon-collection-list');
        if (collectionList) {
            collectionList.innerHTML = '';
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'collection-item' + (currentItem?.id === item.id ? ' active' : '');
                el.innerHTML = `<span class="coll-icon">${getCategoryIcon(item.type)}</span> ${item.name}`;
                el.onclick = () => selectItem(item);
                collectionList.appendChild(el);
            });
        }
    }

    // ── Capture ───────────────────────────────────────────────
    if (btnCapture) {
        btnCapture.addEventListener('click', async () => {
            if (!tryonEngine) return;

            const tryonWrapper = document.getElementById('tryon-content');
            if (!tryonWrapper) return;

            const overlay = document.createElement('div');
            overlay.className = 'tryon-analyzing-overlay';
            overlay.innerHTML = `
              <div class="tryon-analyzing-spinner"></div>
              <div class="tryon-analyzing-text">✦ AI Analyzing 468 facial landmarks…</div>
              <div class="tryon-analyzing-sub">Positioning 3D jewelry & applying studio finish</div>
            `;
            tryonWrapper.appendChild(overlay);

            btnCapture.disabled = true;

            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));

            const rawDataURL = await tryonEngine.capture();
            originalCaptureDataURL = rawDataURL;

            const enhancedURL = await tryonEngine.enhanceImage(rawDataURL, 'standard');
            tryonEngine.capturedDataURL = enhancedURL;

            overlay.remove();
            btnCapture.disabled = false;

            enhancementBtns.forEach(b => {
                b.classList.toggle('active', b.dataset.enhancement === 'standard');
            });

            if (modalImg && modalOverlay) {
                modalImg.src = enhancedURL;
                modalOverlay.classList.add('open');
            }
        });
    }

    // ── Retake ───────────────────────────────────────────────
    function doRetake() {
        if (tryonEngine) tryonEngine.retake();
        if (modalOverlay) modalOverlay.classList.remove('open');
    }

    if (btnRetake) btnRetake.addEventListener('click', doRetake);
    if (modalRetake) modalRetake.addEventListener('click', doRetake);
    if (modalClose) modalClose.addEventListener('click', () => {
        if (modalOverlay) modalOverlay.classList.remove('open');
    });

    // Close on backdrop click
    if (modalOverlay) {
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('open');
        });
    }

    // ── User Rating System ────────────────────────────────────
    const ratingOptions = document.querySelectorAll('.rating-option');
    const ratingFeedback = document.getElementById('rating-feedback');
    const enhancementBtns = document.querySelectorAll('.enhancement-btn');
    let selectedRating = null;
    let selectedEnhancement = 'standard';
    let originalCaptureDataURL = null;

    ratingOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            ratingOptions.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRating = btn.dataset.rating;
            if (ratingFeedback) {
                ratingFeedback.style.display = 'block';
                setTimeout(() => { ratingFeedback.style.display = 'none'; }, 2000);
            }
            if (tryonEngine && tryonEngine.currentItem) {
                console.log(`Rating: ${selectedRating} | Item: ${tryonEngine.currentItem.name}`);
            }
        });
    });

    // ── Image Enhancement System ──────────────────────────────
    enhancementBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            enhancementBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedEnhancement = btn.dataset.enhancement;

            if (tryonEngine && originalCaptureDataURL) {
                const enhancedURL = await tryonEngine.enhanceImage(originalCaptureDataURL, selectedEnhancement);
                if (modalImg) modalImg.src = enhancedURL;
                tryonEngine.capturedDataURL = enhancedURL;
            }
        });
    });

    // Reset rating when modal closes
    function resetRating() {
        ratingOptions.forEach(b => b.classList.remove('active'));
        selectedRating = null;
        if (ratingFeedback) ratingFeedback.style.display = 'none';
    }

    if (modalClose) modalClose.addEventListener('click', resetRating);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) resetRating();
        });
    }

    // ── Download ──────────────────────────────────────────────
    function doDownload() {
        if (!tryonEngine) return;
        const activeResult = modalImg && modalImg.src ? modalImg.src : null;
        tryonEngine.download(activeResult);
    }
    if (btnDownload) btnDownload.addEventListener('click', doDownload);
    if (modalDownload) modalDownload.addEventListener('click', doDownload);

    // ── Debug Landmarks Toggle ────────────────────────────────
    const btnDebugLandmarks = document.getElementById('btn-debug-landmarks');
    let landmarkDebugOn = false;
    if (btnDebugLandmarks) {
        btnDebugLandmarks.addEventListener('click', () => {
            landmarkDebugOn = !landmarkDebugOn;
            btnDebugLandmarks.classList.toggle('active', landmarkDebugOn);
            if (tryonEngine) tryonEngine.setDebugLandmarks(landmarkDebugOn);
        });
    }

    // ── Share Button ──────────────────────────────────────────
    const modalShare = document.getElementById('modal-share');
    if (modalShare) {
        modalShare.addEventListener('click', async () => {
            if (!tryonEngine || !tryonEngine.capturedDataURL) return;
            try {
                if (navigator.share) {
                    const blob = await (await fetch(tryonEngine.capturedDataURL)).blob();
                    const file = new File([blob], 'VirtualTryOn.jpg', { type: 'image/jpeg' });
                    await navigator.share({
                        title: 'Virtual Jewelry Try-On',
                        text: 'Check out my virtual jewelry try-on from VINAYAKA JEWELLERS!',
                        files: [file],
                    });
                } else {
                    await navigator.clipboard.writeText(tryonEngine.capturedDataURL);
                    modalShare.textContent = '✓ Copied!';
                    setTimeout(() => { modalShare.textContent = '⇪ Share'; }, 2000);
                }
            } catch (e) {
                console.warn('Share failed:', e);
            }
        });
    }

    // ── Anti-Gravity Toggle ───────────────────────────────────
    const btnAntiGravity = document.getElementById('btn-antigravity');
    let antiGravityOn = true;
    if (btnAntiGravity) {
        btnAntiGravity.addEventListener('click', () => {
            antiGravityOn = !antiGravityOn;
            btnAntiGravity.classList.toggle('active', antiGravityOn);
            if (tryonEngine) tryonEngine.setAntiGravity(antiGravityOn);
        });
    }

    // ── Try On Now (sidebar CTA) ──────────────────────────────
    if (btnTryonNow) {
        btnTryonNow.addEventListener('click', () => switchMode('tryon'));
    }

    // ── Add to Cart (sidebar CTA) ─────────────────────────────
    if (btnCart) {
        btnCart.addEventListener('click', () => {
            if (currentItem) {
                const msg = `✅ ${currentItem.name} added to cart! Price: ${formatINR(currentItem.price)}`;
                alert(msg);
                console.log('Added to cart:', currentItem);
            }
        });
    }

    // ── Try-On Category Quick Select ──────────────────────────
    catQuickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            const item = JEWELRY_CATALOG.find(j => j.category === cat);
            if (item) {
                selectItem(item);
                catQuickBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
            }
        });
    });

    // Initial active state for category buttons
    function updateCategoryButtons() {
        catQuickBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === currentItem?.category);
        });
    }
    updateCategoryButtons();

    // ── Helpers ───────────────────────────────────────────────
    function renderStars(rating) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += `<span class="star${i > rating ? ' empty' : ''}">${i <= rating ? '★' : '☆'}</span>`;
        }
        return html;
    }

    function getCategoryIcon(type) {
        return { earring: '💎', necklace: '📿', ring: '💍', nosepin: '✦' }[type] || '✨';
    }

    function getMaterialIcon(mat) {
        if (mat.toLowerCase().includes('platinum')) return '⬡';
        if (mat.toLowerCase().includes('diamond')) return '◆';
        if (mat.toLowerCase().includes('pearl')) return '○';
        return '◈';
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function initParticles() {
        const container = document.querySelector('.particles');
        if (!container) return;
        for (let i = 0; i < 18; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.cssText = `
        left: ${Math.random() * 100}%;
        top: ${100 + Math.random() * 20}%;
        animation-duration: ${8 + Math.random() * 12}s;
        animation-delay: ${Math.random() * 10}s;
        width: ${1 + Math.random() * 2}px;
        height: ${1 + Math.random() * 2}px;
        opacity: 0;
      `;
            container.appendChild(p);
        }
    }
});
