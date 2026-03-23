// tryon.js - Beginner-Friendly Browser-based AI Try-On
// Uses MediaPipe FaceLandmarker and Three.js
// Completely runs in browser, no Python backend required.

class TryOnEngine {
    constructor(opts) {
        this.videoEl = opts.videoEl;
        this.canvasEl = opts.canvasEl;
        this.hudEl = opts.hudEl;
        
        this.isRunning = false;
        this.landmarker = null;
        this.stream = null;
        this.currentItem = null; 

        // 1. Setup 3D Scene (Three.js)
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.camera.position.z = 10;
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvasEl,
            alpha: true,
            antialias: true
        });

        // Add Lights for realistic jewelry sparkle
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xfffae0, 1.2);
        dirLight.position.set(0, 5, 5);
        this.scene.add(dirLight);

        // Containers for different jewelry types
        this.leftEarContainer = new THREE.Group();
        this.rightEarContainer = new THREE.Group();
        this.neckContainer = new THREE.Group();
        this.noseContainer = new THREE.Group();
        
        this.scene.add(this.leftEarContainer);
        this.scene.add(this.rightEarContainer);
        this.scene.add(this.neckContainer);
        this.scene.add(this.noseContainer);

        this.gltfLoader = new THREE.GLTFLoader();

        // Anti-jitter smoothing tracking state
        this.lastPositions = {
            leftEar: { x: 0, y: 0 },
            rightEar: { x: 0, y: 0 },
            neck: { x: 0, y: 0 },
            nose: { x: 0, y: 0 }
        };
        this.smoothFactor = 0.35; // Lower is smoother, higher is more responsive
    }

    // 2. Initialize MediaPipe FaceLandmarker JS
    async initDetector() {
        try {
            const visionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";
            const mod = await import(visionPath);
            const { FaceLandmarker, FilesetResolver } = mod;

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
            );

            this.landmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU' // Use GPU for fast browser performance
                },
                runningMode: 'VIDEO',
                numFaces: 1
            });
            return true;
        } catch (e) {
            console.error("Failed to load MediaPipe FaceLandmarker:", e);
            return false;
        }
    }

    // 3. Start Webcam using Web APIs
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            this.videoEl.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.videoEl.onloadedmetadata = () => {
                    this.videoEl.play();
                    resolve();
                };
            });

            this.isRunning = true;
            this.resizeCanvas();
            this.loop();
            return true;
        } catch (err) {
            console.error("Camera permissions denied or not found:", err);
            return false; // Fallback handled in app.js if denied
        }
    }

    stopCamera() {
        this.isRunning = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    resizeCanvas() {
        const width = this.canvasEl.clientWidth;
        const height = this.canvasEl.clientHeight;
        if(this.canvasEl.width !== width || this.canvasEl.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    // 4. Load 3D Jewelry Model Dynamically
    setItem(item) {
        this.currentItem = item;
        
        // Clear old models
        while(this.leftEarContainer.children.length > 0){ this.leftEarContainer.remove(this.leftEarContainer.children[0]); }
        while(this.rightEarContainer.children.length > 0){ this.rightEarContainer.remove(this.rightEarContainer.children[0]); }
        while(this.neckContainer.children.length > 0){ this.neckContainer.remove(this.neckContainer.children[0]); }
        while(this.noseContainer.children.length > 0){ this.noseContainer.remove(this.noseContainer.children[0]); }

        if (!item || !item.model) return;

        this.gltfLoader.load('static/models/' + item.model, (gltf) => {
            const model = gltf.scene;

            if (item.type === 'earrings') {
                const leftEarring = model.clone();
                const rightEarring = model.clone();
                this.leftEarContainer.add(leftEarring);
                this.rightEarContainer.add(rightEarring);
            } else if (item.type === 'necklace') {
                this.neckContainer.add(model);
            } else if (item.type === 'nosepin') {
                this.noseContainer.add(model);
            }
        });
    }

    // 5. Main Animation Loop (High FPS RequestAnimationFrame)
    loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        this.resizeCanvas();

        let faceDetected = false;

        // Detect faces using MediaPipe
        if (this.landmarker && this.videoEl.readyState >= 2) {
            const timeNow = performance.now();
            const results = this.landmarker.detectForVideo(this.videoEl, timeNow);

            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                const landmarks = results.faceLandmarks[0];
                faceDetected = true;
                this.updateJewelryPositions(landmarks);
            }
        }

        // Hide jewelry if no face detected
        this.leftEarContainer.visible = faceDetected && this.currentItem?.type === 'earrings';
        this.rightEarContainer.visible = faceDetected && this.currentItem?.type === 'earrings';
        this.neckContainer.visible = faceDetected && this.currentItem?.type === 'necklace';
        this.noseContainer.visible = faceDetected && this.currentItem?.type === 'nosepin';

        // Update UI HUD Text
        if (this.hudEl) {
            const statusText = document.getElementById('tryon-status-text');
            if (statusText) {
                statusText.innerText = faceDetected ? "🎯 Face Detected" : "⚠️ Looking for face...";
                statusText.style.color = faceDetected ? "#4caf50" : "#ff9800";
            }
        }

        // Render Frame
        this.renderer.render(this.scene, this.camera);
    }

    // Helper: Map 2D Screen Pixel to 3D Space
    pixelTo3D(xRatio, yRatio, depth = 10) {
        // Video is css transform: scaleX(-1) so x needs to be flipped for alignment
        const x = -((xRatio) * 2 - 1);
        const y = -((yRatio) * 2 - 1);
        
        const vector = new THREE.Vector3(x, y, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const dist = (depth - this.camera.position.z) / dir.z;
        return this.camera.position.clone().add(dir.multiplyScalar(dist));
    }

    // Helper: Exponential Moving Average (EMA) smoothing for stability
    smooth(key, rawX, rawY) {
        const last = this.lastPositions[key];
        const alpha = this.smoothFactor;
        const newX = last.x * (1 - alpha) + rawX * alpha;
        const newY = last.y * (1 - alpha) + rawY * alpha;
        this.lastPositions[key] = { x: newX, y: newY };
        return { x: newX, y: newY };
    }

    // 6. Face Landmarking Mapping
    updateJewelryPositions(landmarks) {
        // Specific MediaPipe face mesh indices
        // 127 = Left Ear Lobe, 356 = Right Ear Lobe, 152 = Chin, 1 = Nose Tip

        if (this.currentItem?.type === 'earrings') {
            const leftEarRaw = landmarks[127];
            const rightEarRaw = landmarks[356];
            
            // Apply smoothing filter to avoid jitter
            const leftEar = this.smooth('leftEar', leftEarRaw.x, leftEarRaw.y);
            const rightEar = this.smooth('rightEar', rightEarRaw.x, rightEarRaw.y);

            const leftPos = this.pixelTo3D(leftEar.x, leftEar.y, 8); // Depth 8
            const rightPos = this.pixelTo3D(rightEar.x, rightEar.y, 8); // Depth 8

            this.leftEarContainer.position.copy(leftPos);
            this.rightEarContainer.position.copy(rightPos);

            // Scale based on distance between ears (ensures proper depth illusion)
            const faceWidth = Math.abs(rightEar.x - leftEar.x);
            const scale = faceWidth * 2.8; 
            this.leftEarContainer.scale.set(scale, scale, scale);
            this.rightEarContainer.scale.set(scale, scale, scale);
        }
        else if (this.currentItem?.type === 'necklace') {
            const chinRaw = landmarks[152]; 
            const neckRawY = chinRaw.y + 0.15; // Shift down from chin to find neck
            
            const neck = this.smooth('neck', chinRaw.x, neckRawY);
            const neckPos = this.pixelTo3D(neck.x, neck.y, 8.5); // Push back slightly

            this.neckContainer.position.copy(neckPos);

            const faceWidth = Math.abs(landmarks[356].x - landmarks[127].x);
            const scale = faceWidth * 3.5;
            this.neckContainer.scale.set(scale, scale, scale);
        }
        else if (this.currentItem?.type === 'nosepin') {
            const noseRaw = landmarks[1];
            
            const nose = this.smooth('nose', noseRaw.x, noseRaw.y);
            const nosePos = this.pixelTo3D(nose.x, nose.y, 7.5); // Closer to camera

            this.noseContainer.position.copy(nosePos);

            const faceWidth = Math.abs(landmarks[356].x - landmarks[127].x);
            const scale = faceWidth * 1.5;
            this.noseContainer.scale.set(scale, scale, scale);
        }
    }

    // Capture photo of the screen
    capturePhoto() {
        if (!this.isRunning) return;
        
        const photoCanvas = document.createElement('canvas');
        photoCanvas.width = this.videoEl.videoWidth;
        photoCanvas.height = this.videoEl.videoHeight;
        const ctx = photoCanvas.getContext('2d');

        // Draw flipped webcam video
        ctx.translate(photoCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.videoEl, 0, 0, photoCanvas.width, photoCanvas.height);
        
        // Draw 3D transparent overlay
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.drawImage(this.canvasEl, 0, 0, photoCanvas.width, photoCanvas.height);

        // Download image
        const link = document.createElement('a');
        link.download = 'my_jewelry_tryon.png';
        link.href = photoCanvas.toDataURL('image/png');
        link.click();
    }

    // Compatibility methods for app.js
    setEnabledTypes(types) {
        // Simplified version doesn't use multiple simultaneous types
    }
    
    _setupKeyboardControls() {
        // Basic keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.stopCamera();
        });
    }
}
