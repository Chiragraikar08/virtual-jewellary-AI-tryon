// tryon.js — 2D Canvas + MediaPipe FaceLandmarker Try-On Engine
// Faithful port of desktop_tryon.py (Python/OpenCV) to browser JavaScript
// Uses PNG images with alpha compositing on HTML5 Canvas
// No Three.js, no GLB, no WebGL — pure 2D rendering

// ══════════════════════════════════════
//  LANDMARK SMOOTHER (EMA)
// ══════════════════════════════════════
class LandmarkSmoother {
    /**
     * Exponential Moving Average smoother — prevents jittery jewelry.
     * Direct port of Python LandmarkSmoother class.
     * @param {number} alpha - Smoothing factor (0 = no update, 1 = instant)
     */
    constructor(alpha = 0.3) {
        this.alpha = alpha;
        this._prev = {};
    }

    smooth(key, value) {
        if (!(key in this._prev)) {
            this._prev[key] = value;
            return value;
        }
        const s = this._prev[key] * (1 - this.alpha) + value * this.alpha;
        this._prev[key] = s;
        return s;
    }

    reset() {
        this._prev = {};
    }
}

// ══════════════════════════════════════
//  DESIGN PARAMS ANALYZER
// ══════════════════════════════════════

/**
 * Analyze PNG alpha channel to compute dynamic scale/offset.
 * Faithful port of Python get_design_params().
 * Uses an offscreen canvas to read pixel data.
 *
 * @param {HTMLImageElement} img - Loaded Image element
 * @returns {{ scaleFactor: number, yOffsetFactor: number, centerOffset: number, topPaddingRatio: number }}
 */
function getDesignParams(img) {
    const w_img = img.naturalWidth || img.width;
    const h_img = img.naturalHeight || img.height;
    if (h_img === 0 || w_img === 0) {
        return { scaleFactor: 1.15, yOffsetFactor: 0.10, centerOffset: 0, topPaddingRatio: 0.0 };
    }

    // Draw image to offscreen canvas to read pixel data
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w_img;
    offCanvas.height = h_img;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    let trueW = w_img, trueH = h_img;
    let topPadPx = 0;
    let centerOffset = 0;

    try {
        const imageData = ctx.getImageData(0, 0, w_img, h_img);
        const data = imageData.data; // RGBA

        // Find bounding box of non-transparent pixels (alpha > 20)
        let xMin = w_img, yMin = h_img, xMax = 0, yMax = 0;
        let found = false;

        for (let y = 0; y < h_img; y++) {
            for (let x = 0; x < w_img; x++) {
                const idx = (y * w_img + x) * 4;
                const alpha = data[idx + 3];
                if (alpha > 20) {
                    found = true;
                    if (x < xMin) xMin = x;
                    if (y < yMin) yMin = y;
                    if (x > xMax) xMax = x;
                    if (y > yMax) yMax = y;
                }
            }
        }

        if (found) {
            trueW = xMax - xMin;
            trueH = yMax - yMin;
            topPadPx = yMin;

            // How far off-center is the actual jewelry bounding box?
            const bboxCenterX = xMin + (trueW / 2);
            const imgCenterX = w_img / 2;
            centerOffset = imgCenterX - bboxCenterX;

            if (trueH === 0) trueH = 1;
        }
    } catch (e) {
        // CORS or security error — fall back to image dimensions
        console.warn('getDesignParams: Could not read pixel data:', e);
    }

    const aspectRatio = trueW / trueH;

    let scaleFactor, yOffsetFactor;
    if (aspectRatio >= 0.95) {
        // Wide designs (chokers, broad necklaces)
        scaleFactor = 1.42;
        yOffsetFactor = -0.05;
    } else if (aspectRatio <= 0.8) {
        // Long/hanging designs (chains, pendants)
        scaleFactor = 1.10;
        yOffsetFactor = 0.15;
    } else {
        // Normal proportioned designs
        scaleFactor = 1.22;
        yOffsetFactor = 0.05;
    }

    const topPaddingRatio = h_img > 0 ? topPadPx / h_img : 0.0;
    return { scaleFactor, yOffsetFactor, centerOffset, topPaddingRatio };
}

// ══════════════════════════════════════
//  IMAGE CACHE
// ══════════════════════════════════════
const _imageCache = new Map();
const _designParamsCache = new Map();

/**
 * Preload an image by URL and cache it.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function preloadImage(src) {
    if (_imageCache.has(src)) return Promise.resolve(_imageCache.get(src));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            _imageCache.set(src, img);
            // Pre-compute design params
            _designParamsCache.set(src, getDesignParams(img));
            resolve(img);
        };
        img.onerror = () => {
            console.warn('Failed to preload:', src);
            reject(new Error('Image load failed: ' + src));
        };
        img.src = src;
    });
}

/**
 * Get cached design params for a loaded image.
 */
function getCachedDesignParams(src) {
    if (_designParamsCache.has(src)) return _designParamsCache.get(src);
    const img = _imageCache.get(src);
    if (!img) return { scaleFactor: 1.22, yOffsetFactor: 0.05, centerOffset: 0, topPaddingRatio: 0 };
    
    const params = getDesignParams(img);

    // User requested specifically to make these necklaces BIG and wide
    const filename = src.split('/').pop().toLowerCase();
    if (filename.includes('112') || filename.includes('113') || filename.includes('115') || filename.includes('116') ||
        filename.includes('157') || filename.includes('159') || filename.includes('162') || filename.includes('163')) {
        params.scaleFactor = Math.max(params.scaleFactor * 2.2, 3.4); // extremely big and wide
        params.yOffsetFactor = 0.08; // sitting a bit lower to cover the chest since they are huge
    }

    _designParamsCache.set(src, params);
    return params;
}

// ══════════════════════════════════════
//  TRY-ON ENGINE 2D
// ══════════════════════════════════════

class TryOnEngine {
    constructor(opts) {
        this.videoEl = opts.videoEl;
        this.canvasEl = opts.canvasEl;
        this.hudEl = opts.hudEl;
        this.ctx = null;

        this.currentItem = null;
        this.isRunning = false;
        this.landmarkerVideo = null;
        this.stream = null;
        this.animId = null;
        this.isCapturing = false;
        this.capturedDataURL = null;

        // ── Multi Jewelry Selection ──
        this.enabledTypes = {
            earrings: true,
            necklace: true,
            nosepin: true
        };
        this.currentCategory = 'earrings';
        this.galleryItems = [];

        // ── Face state ──
        this.lastFaceLandmarks = null;

        // ── Smoother (port of Python LandmarkSmoother) ──
        this.smoother = new LandmarkSmoother(0.3);

        // ── Necklace stabilization state (port of Python prev_nk_*) ──
        this._prevNkX = 0;
        this._prevNkY = 0;
        this._prevNkWidth = 100;

        // ── Upload / Freeze state ──
        this._isFrozen = false;
        this._uploadedImage = null;
        this._lastCapturedCanvas = null;

        // ── Feedback ──
        this._feedbackMsg = 'Align your face to begin';
        this._feedbackType = 'neutral'; // neutral | success | warn

        // ── Currently loaded jewelry images (keyed by category) ──
        this._selectedItems = {
            earrings: null,
            necklace: null,
            nosepin: null
        };

        // Landmark indices (same as Python)
        this.LM = {
            leftEar: 234,
            rightEar: 454,
            chin: 152,
            nose: 1,
        };
    }

    // ── MediaPipe FaceLandmarker Setup ──
    async initDetector() {
        try {
            const visionPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs';
            const mod = await import(visionPath);
            const { FaceLandmarker, FilesetResolver } = mod;

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
            );

            // VIDEO mode for live detection
            this.landmarkerVideo = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            });

            // IMAGE mode for static photo analysis
            this._landmarkerImage = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU',
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            });

            return true;
        } catch (e) {
            console.error('FaceLandmarker init failed:', e);
            return false;
        }
    }

    // ── Webcam ──
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
                audio: false,
            });
            this.videoEl.srcObject = this.stream;

            await new Promise((res) => {
                this.videoEl.onloadedmetadata = () => {
                    this.videoEl.play();
                    res();
                };
            });

            // Setup 2D canvas context
            this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: false });
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
            
            this.isRunning = true;
            this._resizeCanvas();
            this._loop();
            return true;
        } catch (e) {
            console.error('Camera error:', e);
            return false;
        }
    }

    stopCamera() {
        this.isRunning = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
    }

    _resizeCanvas() {
        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;
        if (!vw || !vh) return;

        // Match canvas to its CSS layout size
        const cw = this.canvasEl.clientWidth || this.canvasEl.parentElement.clientWidth;
        const ch = this.canvasEl.clientHeight || this.canvasEl.parentElement.clientHeight;

        if (this.canvasEl.width !== cw || this.canvasEl.height !== ch) {
            this.canvasEl.width = cw;
            this.canvasEl.height = ch;
        }
    }

    // ── Item Selection ──
    setItem(item) {
        this.currentItem = item;
        if (!item) return;

        // Determine category and cache the image
        const cat = item.category || item.type;
        const imgSrc = item.image;
        if (imgSrc) {
            preloadImage(imgSrc).then(img => {
                if (cat === 'earrings' || item.type === 'earring') {
                    this._selectedItems.earrings = { item, img, src: imgSrc };
                } else if (cat === 'necklace') {
                    this._selectedItems.necklace = { item, img, src: imgSrc };
                } else if (cat === 'nosepin') {
                    this._selectedItems.nosepin = { item, img, src: imgSrc };
                }
            }).catch(() => {});
        }
    }

    setEnabledTypes(types) {
        this.enabledTypes = { ...this.enabledTypes, ...types };
    }

    setGalleryItems(items, _key) {
        this.galleryItems = items || [];
    }

    // ── Upload Photo ──
    async uploadPhoto(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this._uploadedImage = img;
                    this._isFrozen = true;
                    this._feedbackMsg = '✓ Uploaded photo loaded!';
                    this._feedbackType = 'success';
                    // Process immediately
                    this._renderFrame(img);
                    resolve(true);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // ── Retake ──
    retake() {
        this._isFrozen = false;
        this._uploadedImage = null;
        this._lastCapturedCanvas = null;
        this._feedbackMsg = 'Ready for new capture';
        this._feedbackType = 'neutral';
    }

    // ── Capture ──
    async capture() {
        this.isCapturing = true;

        // Create a high-quality capture canvas
        const captureCanvas = document.createElement('canvas');
        const vw = this.videoEl.videoWidth || this.canvasEl.width;
        const vh = this.videoEl.videoHeight || this.canvasEl.height;
        captureCanvas.width = vw;
        captureCanvas.height = vh;
        const captureCtx = captureCanvas.getContext('2d');

        // Draw the current video/image frame
        if (this._uploadedImage) {
            captureCtx.drawImage(this._uploadedImage, 0, 0, vw, vh);
        } else {
            // Mirror the video (same as CSS scaleX(-1))
            captureCtx.save();
            captureCtx.translate(vw, 0);
            captureCtx.scale(-1, 1);
            captureCtx.drawImage(this.videoEl, 0, 0, vw, vh);
            captureCtx.restore();
        }

        // Detect face on this frame
        let landmarks = null;
        let isCaptureMirrored = false;

        if (this._uploadedImage) {
            if (this._landmarkerImage) {
                try {
                    const result = this._landmarkerImage.detect(captureCanvas);
                    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                        landmarks = result.faceLandmarks[0];
                    }
                } catch (e) {
                    // Use last known landmarks if available
                    landmarks = this.lastFaceLandmarks;
                }
            }
        } else {
            // For live video capture, we already have the landmarks for the current frame
            // Since we just drew the video mirrored onto captureCanvas, the coords must also be mirrored
            landmarks = this.lastFaceLandmarks;
            isCaptureMirrored = true;
        }

        // Draw jewelry overlays on capture canvas
        if (landmarks) {
            this._drawJewelryOverlays(captureCtx, landmarks, vw, vh, isCaptureMirrored, false);
        }

        // Add watermark
        captureCtx.font = '14px Inter, sans-serif';
        captureCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        captureCtx.fillText('VINAYAKA JEWELLARY TRY ON', 15, vh - 15);

        // Store captured frame
        this._isFrozen = true;
        this._lastCapturedCanvas = captureCanvas;
        this.isCapturing = false;

        const dataURL = captureCanvas.toDataURL('image/jpeg', 0.95);
        this.capturedDataURL = dataURL;
        this._feedbackMsg = '✓ Captured! Click DOWNLOAD to save.';
        this._feedbackType = 'success';
        return dataURL;
    }

    // ── Download ──
    download(dataURL) {
        const url = dataURL || this.capturedDataURL;
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = `tryon_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ── Image Enhancement (simple CSS-filter based) ──
    async enhanceImage(dataURL, mode = 'standard') {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const ctx = c.getContext('2d');

                // Apply enhancement via CSS filter
                if (mode === 'light') {
                    ctx.filter = 'brightness(1.1) contrast(1.05)';
                } else if (mode === 'glamour') {
                    ctx.filter = 'brightness(1.2) contrast(1.15) saturate(1.2)';
                } else {
                    // Standard
                    ctx.filter = 'brightness(1.1) contrast(1.1) saturate(1.05)';
                }

                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/jpeg', 0.95));
            };
            img.src = dataURL;
        });
    }

    // ══════════════════════════════════════
    //  MAIN RENDER LOOP
    // ══════════════════════════════════════
    _loop() {
        if (!this.isRunning) return;
        this.animId = requestAnimationFrame(() => this._loop());

        if (this.isCapturing) return;

        const video = this.videoEl;
        if (video.readyState < 2 && !this._uploadedImage && !this._isFrozen) return;

        this._resizeCanvas();

        // If frozen on captured frame, just redraw it
        if (this._isFrozen && this._lastCapturedCanvas) {
            this.ctx.drawImage(this._lastCapturedCanvas, 0, 0, this.canvasEl.width, this.canvasEl.height);
            this._updateHUD();
            return;
        }

        // Determine source frame
        let sourceEl = video;
        let isMirrored = true;
        if (this._uploadedImage) {
            sourceEl = this._uploadedImage;
            isMirrored = false;
        }

        // Run face landmark detection
        let landmarks = null;
        if (this.landmarkerVideo && !this._uploadedImage) {
            try {
                const ts = performance.now();
                const result = this.landmarkerVideo.detectForVideo(video, ts);
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    landmarks = result.faceLandmarks[0];
                    this.lastFaceLandmarks = landmarks;
                } else {
                    this.lastFaceLandmarks = null;
                }
            } catch (e) { /* ignore frame errors */ }
        } else if (this._uploadedImage && this._landmarkerImage) {
            try {
                const result = this._landmarkerImage.detect(this._uploadedImage);
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    landmarks = result.faceLandmarks[0];
                    this.lastFaceLandmarks = landmarks;
                }
            } catch (e) { /* ignore */ }
        }

        // Render the frame
        this._renderFrame(sourceEl, landmarks, isMirrored);
    }

    _renderFrame(sourceEl, landmarks, isMirrored) {
        const ctx = this.ctx;
        if (!ctx) return;
        const cw = this.canvasEl.width;
        const ch = this.canvasEl.height;

        // Clear canvas
        ctx.clearRect(0, 0, cw, ch);

        // Draw video/image frame
        ctx.save();
        if (isMirrored) {
            // Mirror for selfie view using exact requested logic
            ctx.scale(-1, 1);
            ctx.drawImage(sourceEl, -cw, 0, cw, ch);
        } else {
            ctx.drawImage(sourceEl, 0, 0, cw, ch);
        }
        ctx.restore();

        // If landmarks available, detect face and apply the mirroring to landmark coordinates
        landmarks = landmarks || this.lastFaceLandmarks;

        if (landmarks && landmarks.length >= 468) {
            this._feedbackMsg = 'Perfect Alignment';
            this._feedbackType = 'success';

            // Draw jewelry overlays
            this._drawJewelryOverlays(ctx, landmarks, cw, ch, isMirrored);
        } else {
            this.smoother.reset();
            this._prevNkX = 0;
            this._prevNkY = 0;
            this._prevNkWidth = 100;
            this._feedbackMsg = 'Align your face to begin';
            this._feedbackType = 'neutral';
        }

        this._updateHUD();
    }

    // ══════════════════════════════════════
    //  JEWELRY OVERLAY LOGIC
    //  (Faithful port of desktop_tryon.py)
    // ══════════════════════════════════════
    _drawJewelryOverlays(ctx, lm, w, h, isMirrored, useHistory = true) {
        // Convert normalized landmarks to pixel coordinates
        // Using exactly the logic requested: flippedX = canvas.width - landmark.x * canvas.width
        const getX = (idx) => isMirrored ? w - lm[idx].x * w : lm[idx].x * w;
        const getY = (idx) => lm[idx].y * h;

        // Smoothed landmark positions (exact port of Python)
        const le_x = useHistory ? this.smoother.smooth('le', getX(this.LM.leftEar)) : getX(this.LM.leftEar);
        const le_y = useHistory ? this.smoother.smooth('ley', getY(this.LM.leftEar)) : getY(this.LM.leftEar);
        const re_x = useHistory ? this.smoother.smooth('re', getX(this.LM.rightEar)) : getX(this.LM.rightEar);
        const re_y = useHistory ? this.smoother.smooth('rey', getY(this.LM.rightEar)) : getY(this.LM.rightEar);
        const ch_x = useHistory ? this.smoother.smooth('ch', getX(this.LM.chin)) : getX(this.LM.chin);
        const ch_y = useHistory ? this.smoother.smooth('chy', getY(this.LM.chin)) : getY(this.LM.chin);
        const ns_x = useHistory ? this.smoother.smooth('ns', getX(this.LM.nose)) : getX(this.LM.nose);
        const ns_y = useHistory ? this.smoother.smooth('nsy', getY(this.LM.nose)) : getY(this.LM.nose);

        const fw = Math.abs(re_x - le_x); // face width
        const fh = Math.abs(ch_y - ns_y); // face height (chin to nose)

        // ── Head turn detection (port of Python) ──
        const faceCenter = (le_x + re_x) / 2.0;
        const rawOffset = ns_x - faceCenter;
        const smoothOffset = useHistory ? this.smoother.smooth('head_offset', rawOffset) : rawOffset;
        
        // Lowered threshold so earrings hide more responsively on head turn
        const turnThreshold = fw * 0.03;

        let showLeftEarring = true;
        let showRightEarring = true;

        if (smoothOffset > turnThreshold) {
            // Nose shifts screen-right -> User turned to their LEFT shoulder.
            // Left ear goes behind head. Hidden -> hide Left Earring.
            showLeftEarring = false;
        } else if (smoothOffset < -turnThreshold) {
            // Nose shifts screen-left -> User turned to their RIGHT shoulder.
            // Right ear goes behind head. Hidden -> hide Right Earring.
            showRightEarring = false;
        }

        // ── Calculate tilt angle for rotation ──
        const tiltAngle = Math.atan2(re_y - le_y, re_x - le_x);

        // ══════════════════════════════════════
        //  NECKLACE OVERLAY
        // ══════════════════════════════════════
        if (this.enabledTypes.necklace && this._selectedItems.necklace) {
            const { img: nkImg, src: nkSrc } = this._selectedItems.necklace;
            const params = getCachedDesignParams(nkSrc);

            // Use dynamic scale based on aspect ratio for perfect fit
            const necklaceWidth = Math.round(fw * params.scaleFactor); 
            const targetWidth = necklaceWidth;

            // Calculate rendered height for content-aware offset
            const nk_h = nkImg.naturalHeight || nkImg.height;
            const nk_w = nkImg.naturalWidth || nkImg.width;
            const renderedHeight = Math.round(targetWidth * nk_h / Math.max(nk_w, 1));

            // STABLE NECKLACE: Anchor to face center instead of chin tip to prevent swinging
            const neckX = faceCenter;
            const neckY = Math.round(ch_y + (fw * 0.08)) - Math.round(renderedHeight * params.topPaddingRatio);

            // Auto center correction
            let targetX = Math.round(neckX - targetWidth / 2 - params.centerOffset);
            let targetY = neckY;

            // Custom Exponential Smoothing (exact Python port)
            const smoothFactor = 0.85;
            let finalX = targetX;
            let finalY = targetY;
            let finalWidth = targetWidth;

            if (useHistory) {
                let smoothNkX = Math.round(this._prevNkX * smoothFactor + targetX * (1 - smoothFactor));
                let smoothNkY = Math.round(this._prevNkY * smoothFactor + targetY * (1 - smoothFactor));
                let smoothNkWidth = Math.round(this._prevNkWidth * smoothFactor + targetWidth * (1 - smoothFactor));

                // Dead Zone (Anti-shake) — ignores micro-movements
                if (Math.abs(targetX - this._prevNkX) < 5) {
                    smoothNkX = this._prevNkX;
                }
                if (Math.abs(targetY - this._prevNkY) < 5) {
                    smoothNkY = this._prevNkY;
                }

                // Max step limit to prevent leaps
                const maxMove = 20;
                let dx = smoothNkX - this._prevNkX;
                let dy = smoothNkY - this._prevNkY;
                if (Math.abs(dx) > maxMove) {
                    smoothNkX = Math.round(this._prevNkX + maxMove * Math.sign(dx));
                }
                if (Math.abs(dy) > maxMove) {
                    smoothNkY = Math.round(this._prevNkY + maxMove * Math.sign(dy));
                }

                finalX = smoothNkX;
                finalY = smoothNkY;
                finalWidth = smoothNkWidth;

                // Update history ONLY during live loop
                this._prevNkX = finalX;
                this._prevNkY = finalY;
                this._prevNkWidth = finalWidth;
            }

            // Render necklace with rotation
            this._drawJewelryImage(ctx, nkImg, finalX, finalY, finalWidth, 0, 0, w, h);
        }

        // ══════════════════════════════════════
        //  EARRING OVERLAY
        // ══════════════════════════════════════
        if (this.enabledTypes.earrings && this._selectedItems.earrings) {
            const { img: earImg, src: earSrc } = this._selectedItems.earrings;
            const earParams = getCachedDesignParams(earSrc);

            // Strict Final Correct Positioning - MIRROR CALIBRATED (Perfect Attachment V5)
            const ew = Math.round(fw * 0.095);     // slightly smaller designs
            const earOffsetX = Math.round(fw * 0.05);
            const earOffsetY = Math.round(fw * 0.08); // Adjusted upwards (was 0.14)

            // ── Left Earring (idx 234) ──
            // Mirror: Real Left is on Screen-Right. To move OUTWARD, we ADD (+)
            if (showLeftEarring) {
                const lx = Math.round(le_x + earOffsetX - ew / 2);
                const ly = Math.round(le_y + earOffsetY);
                this._drawJewelryImage(ctx, earImg, lx, ly, ew, 0, 0, w, h);
            }

            // ── Right Earring (idx 454) ──
            // Mirror: Real Right is on Screen-Left. To move OUTWARD, we SUBTRACT (-)
            if (showRightEarring) {
                const rx = Math.round(re_x - earOffsetX - ew / 2);
                const ry = Math.round(re_y + earOffsetY);
                this._drawJewelryImage(ctx, earImg, rx, ry, ew, 0, 0, w, h);
            }
        }

        // ══════════════════════════════════════
        //  NOSEPIN OVERLAY
        // ══════════════════════════════════════
        if (this.enabledTypes.nosepin && this._selectedItems.nosepin) {
            const { img: npImg, src: npSrc } = this._selectedItems.nosepin;
            const np_h = npImg.naturalHeight || npImg.height;
            const np_w = npImg.naturalWidth || npImg.width;
            const npAR = np_w / Math.max(np_h, 1);

            let nw;
            if (npAR > 1.5) {
                nw = Math.round(fw * 0.14); // Wider nosepin designs
            } else if (npAR < 0.7) {
                nw = Math.round(fw * 0.10); // Tall/dangling nosepins
            } else {
                nw = Math.round(fw * 0.12); // Standard studs
            }

            const npX = Math.round(ns_x - nw / 2);
            const npY = Math.round(ns_y - nw / 4);
            this._drawJewelryImage(ctx, npImg, npX, npY, nw, 0, 0, w, h);
        }
    }

    // ══════════════════════════════════════
    //  CANVAS OVERLAY (port of overlay_png)
    // ══════════════════════════════════════
    /**
     * Draw a PNG image on canvas with scaling and clipping, matching Python overlay_png.
     * Canvas natively handles PNG alpha blending.
     */
    _drawJewelryImage(ctx, img, x, y, targetWidth, minX, minY, maxX, maxY) {
        if (!img || targetWidth <= 0) return;

        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (srcW === 0 || srcH === 0) return;

        const scale = targetWidth / srcW;
        const nw = Math.round(srcW * scale);
        const nh = Math.round(srcH * scale);

        if (nw <= 0 || nh <= 0) return;

        ctx.save();

        // Apply clipping region
        if (minX !== undefined && maxX !== undefined) {
            ctx.beginPath();
            ctx.rect(minX || 0, minY || 0, (maxX || ctx.canvas.width) - (minX || 0), (maxY || ctx.canvas.height) - (minY || 0));
            ctx.clip();
        }

        // Python overlay_png does NOT rotate, it just draws at (x,y)
        ctx.drawImage(img, x, y, nw, nh);

        ctx.restore();
    }

    // ── HUD Update ──
    _updateHUD() {
        if (!this.hudEl) return;
        const statusEl = this.hudEl.querySelector('.hud-status');
        if (statusEl) {
            statusEl.textContent = this._feedbackMsg;

            // Color based on feedback type
            if (this._feedbackType === 'success') {
                statusEl.style.color = '#4ecb71';
            } else if (this._feedbackType === 'warn') {
                statusEl.style.color = '#ff6b6b';
            } else {
                statusEl.style.color = '#fff';
            }
        }
    }

    // ── Debug Landmarks (optional) ──
    setDebugLandmarks(on) {
        this._debugLandmarks = on;
    }

    // ── Anti-Gravity (no-op for 2D, kept for API compat) ──
    setAntiGravity(_on) {
        // No-op: Anti-Gravity was a 3D floating effect, not applicable to 2D overlay
    }

    // ── Keyboard Controls ──
    _setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (!this.isRunning) return;

            // Number keys 1-9 to switch design
            const idx = parseInt(e.key) - 1;
            if (idx >= 0 && idx < this.galleryItems.length) {
                const item = this.galleryItems[idx];
                this.setItem(item);
                // Trigger external selectItem if available
                if (window._tryonSelectCallback) {
                    window._tryonSelectCallback(item);
                }
            }

            // ESC to stop camera
            if (e.key === 'Escape') {
                this.stopCamera();
            }
        });
    }
}

// ══════════════════════════════════════
//  PRELOAD ALL JEWELRY IMAGES ON INIT
// ══════════════════════════════════════
(function preloadAllJewelryImages() {
    // Wait for JEWELRY_CATALOG to be available
    const tryPreload = () => {
        if (typeof JEWELRY_CATALOG === 'undefined') {
            setTimeout(tryPreload, 200);
            return;
        }
        // Preload all images in catalog
        const categories = ['earring', 'necklace', 'nosepin'];
        JEWELRY_CATALOG.forEach(item => {
            if (item.image && categories.includes(item.type)) {
                preloadImage(item.image).catch(() => {});
            }
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryPreload);
    } else {
        tryPreload();
    }
})();
