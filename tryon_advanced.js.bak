// tryon.js — 3D WebGL + MediaPipe FaceLandmarker Try-On Engine
// Uses 468 facial landmarks for precise jewelry positioning
// Features Anti-Gravity levitation with floating offset, bobbing, and shadows

class TryOnEngine {
    constructor(opts) {
        this.videoEl = opts.videoEl;
        this.canvasEl = opts.canvasEl;
        this.hudEl = opts.hudEl;

        this.currentItem = null;
        this.isRunning = false;
        this.landmarker = null;
        this.landmarkerVideo = null;
        this.detector = null;
        this.detectorVideo = null;
        this.stream = null;
        this.animId = null;
        this.isCapturing = false;

        // ── Multi Jewelry Selection ──────────────────────────────
        this.enabledTypes = {
            earrings: true,
            necklace: true,
            nosepin: true
        };
        this.currentCategory = 'earrings'; // For gallery selection
        this.galleryItems = []; // Items in current category

        // ── Face Distance & Tilt Detection ──────────────────────
        this.faceDistance = null;
        this.faceTilt = null;
        this.distanceThreshold = 0.3; // Normalized distance
        this.tiltThreshold = 0.2; // Radians

        // ── Hand Detection ────────────────────────────────────
        this.handLandmarker = null;
        this.handLandmarkerVideo = null;
        this.lastHandLandmarks = null;

        this.lastFaceLandmarks = null;   // Array of 468 {x,y,z}
        this.lastFaceBox = null;         // Computed bounding box
        this.lastKeypoints = null;       // Legacy compat (6 keypoints)

        this.loadedModels = new Map();   // Cache for GLB models
        this.debugLandmarks = false;     // Toggle landmark dots

        // ── Position Smoothing (EMA) ──────────────────────────────
        this._smoothAlpha = 0.35;        // EMA smoothing factor (0=no update, 1=instant)
        this._smoothPositions = {
            leftEar: null,   // {x, y}
            rightEar: null,
            necklace: null,
            nosepin: null,
            ring: null,
        };
        this._smoothHeadPose = { yaw: 0, pitch: 0, roll: 0 };
        this.landmarkIndex = {
            leftEar: 234,
            rightEar: 454,
            chin: 152,
            nose: 1,
            forehead: 10,
            leftEye: 33,
            rightEye: 263,
            leftEarLobe: 127,
            rightEarLobe: 356,
            leftEarTop: 132,
            rightEarTop: 361,
            leftJaw: 58,
            rightJaw: 288,
            noseLeftWing: 98,
            noseRightWing: 327,
            noseBottom: 2,
        };

        // ── Face Angle State ──────────────────────────────────────
        this.faceAngle = 'front';  // 'left' | 'right' | 'front'
        this._faceAngleYawThreshold = 0.18; // radians (~10°)

        // ── Anti-Gravity Levitation State ──────────────────────────
        this.antiGravityEnabled = true;  // ON by default
        this.levOffset = 28;             // Pixel offset: gap between jewelry and skin
        this.bobSpeed = 3.0;             // Sinusoidal float speed
        this.bobAmplitude = 6;           // Bobbing amplitude in pixels
        this.levZPush = 0.6;             // How far forward (toward camera) jewelry floats

        // Store anchor positions for shadow rendering during capture
        this._shadowAnchors = {
            leftEar: null,   // { x, y } in video pixels (non-mirrored)
            rightEar: null,
            necklace: null,
        };

        // Setup Three.js
        this._initThreeJS();
    }

    _initThreeJS() {
        this.scene = new THREE.Scene();

        // Perspective Camera for 3D realism
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.camera.position.z = 10;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvasEl,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.renderer.outputEncoding = THREE.sRGBEncoding;

        // ── Studio-quality lighting ──────────────────────────────
        // Warm ambient fill
        const ambient = new THREE.AmbientLight(0xfff5e0, 0.65);
        this.scene.add(ambient);

        // Key light (warm, simulates window light)
        const keyLight = new THREE.DirectionalLight(0xfffae0, 1.6);
        keyLight.position.set(2, 5, 5);
        keyLight.castShadow = false;
        this.scene.add(keyLight);

        // Fill light (cooler, softer)
        const fillLight = new THREE.DirectionalLight(0xe0eaff, 0.6);
        fillLight.position.set(-3, 2, 4);
        this.scene.add(fillLight);

        // Rim/back light for edge highlights
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
        rimLight.position.set(0, -3, -5);
        this.scene.add(rimLight);

        // Accent point lights for sparkle on metals
        const sparkle1 = new THREE.PointLight(0xffd700, 0.6, 20);
        sparkle1.position.set(3, 3, 6);
        this.scene.add(sparkle1);

        const sparkle2 = new THREE.PointLight(0xffffff, 0.4, 20);
        sparkle2.position.set(-3, -2, 8);
        this.scene.add(sparkle2);

        // Environment map for realistic metallic reflections
        this._setupEnvironment();

        this.gltfLoader = new THREE.GLTFLoader();

        // Containers for jewelry types
        this.leftEarContainer = new THREE.Group();
        this.rightEarContainer = new THREE.Group();
        this.neckContainer = new THREE.Group();
        this.ringContainer = new THREE.Group();
        this.nosepinContainer = new THREE.Group();

        this.scene.add(this.leftEarContainer);
        this.scene.add(this.rightEarContainer);
        this.scene.add(this.neckContainer);
        this.scene.add(this.ringContainer);
        this.scene.add(this.nosepinContainer);

        // ── Anti-Gravity Shadow Meshes ─────────────────────────────
        // Soft elliptical shadow planes that sit at the "anchor" point on skin
        this._shadowMeshes = {};
        this._createShadowMesh('leftEarShadow');
        this._createShadowMesh('rightEarShadow');
        this._createShadowMesh('neckShadow', 1.8); // wider shadow for necklace
    }

    _createShadowMesh(name, scale = 1.0) {
        // Create a radial-gradient shadow texture
        const size = 128;
        const shadowCanvas = document.createElement('canvas');
        shadowCanvas.width = size;
        shadowCanvas.height = size;
        const sCtx = shadowCanvas.getContext('2d');

        const grad = sCtx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0.35)');
        grad.addColorStop(0.4, 'rgba(0,0,0,0.18)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.06)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = grad;
        sCtx.fillRect(0, 0, size, size);

        const tex = new THREE.CanvasTexture(shadowCanvas);
        const geo = new THREE.PlaneGeometry(0.5 * scale, 0.3 * scale);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        this.scene.add(mesh);
        this._shadowMeshes[name] = mesh;
    }

    _setupEnvironment() {
        try {
            const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            pmremGenerator.compileEquirectangularShader();
            // Use RoomEnvironment for realistic indoor reflections
            if (THREE.RoomEnvironment) {
                const roomEnv = new THREE.RoomEnvironment();
                this.envMap = pmremGenerator.fromScene(roomEnv).texture;
                this.scene.environment = this.envMap;
                roomEnv.dispose();
            }
            pmremGenerator.dispose();
        } catch (e) {
            console.warn('Environment map setup skipped:', e);
        }
    }

    // ── MediaPipe FaceLandmarker Setup ─────────────────────────
    async initDetector() {
        try {
            const visionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";
            const mod = await import(visionPath);
            const { FaceLandmarker, FilesetResolver } = mod;

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
            );

            // IMAGE mode for static capture analysis
            this.landmarker = await FaceLandmarker.createFromOptions(vision, {
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

            // VIDEO mode for live HUD feedback
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

            // Also keep a basic FaceDetector for fallback
            try {
                const { FaceDetector } = mod;
                this.detector = await FaceDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                        delegate: 'GPU',
                    },
                    runningMode: 'IMAGE',
                    minDetectionConfidence: 0.5,
                });
            } catch (e) {
                this.detector = null;
            }

            // Initialize Hand Landmarker for ring try-on (VIDEO mode for live detection)
            try {
                const { HandLandmarker } = mod;
                this.handLandmarkerVideo = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                        delegate: 'GPU',
                    },
                    runningMode: 'VIDEO',
                    numHands: 2,
                    minHandDetectionConfidence: 0.5,
                });
            } catch (e) {
                console.warn('Hand Landmarker init failed:', e);
                this.handLandmarkerVideo = null;
            }

            return true;
        } catch (e) {
            console.warn('FaceLandmarker init failed, trying FaceDetector fallback:', e);
            return this._initFallbackDetector();
        }
    }

    async _initFallbackDetector() {
        try {
            const visionPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";
            const { FaceDetector, FilesetResolver } = await import(visionPath);

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
            );

            // VIDEO mode for live HUD
            this.detectorVideo = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                minDetectionConfidence: 0.5,
            });

            // IMAGE mode for capture
            this.detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                    delegate: 'GPU',
                },
                runningMode: 'IMAGE',
                minDetectionConfidence: 0.5,
            });

            this.landmarkerVideo = null;
            this.landmarker = null;
            return true;
        } catch (e) {
            console.error('All face detection init failed:', e);
            return false;
        }
    }

    // ── Webcam ────────────────────────────────────────────────
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
        cancelAnimationFrame(this.animId);
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
    }

    _resizeCanvas() {
        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;
        if (!vw || !vh) return;

        const cw = this.canvasEl.clientWidth;
        const ch = this.canvasEl.clientHeight;

        if (this.canvasEl.width !== cw || this.canvasEl.height !== ch) {
            this.renderer.setSize(cw, ch, false);
            this.camera.aspect = cw / ch;
            this.camera.updateProjectionMatrix();
        }
    }

    // ── Head Pose Estimation (uses Z-depth for accuracy) ──────
    _estimateHeadPose(landmarks) {
        if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0, roll: 0 };

        const lm = landmarks;
        const noseTip = lm[this.landmarkIndex.nose];
        const foreheadCenter = lm[this.landmarkIndex.forehead];
        const chinTip = lm[this.landmarkIndex.chin];
        const leftEye = lm[this.landmarkIndex.leftEye];
        const rightEye = lm[this.landmarkIndex.rightEye];
        const leftEar = lm[this.landmarkIndex.leftEar];
        const rightEar = lm[this.landmarkIndex.rightEar];

        // ROLL: Eye-to-eye angle
        const eyeDx = leftEye.x - rightEye.x;
        const eyeDy = leftEye.y - rightEye.y;
        const roll = Math.atan2(eyeDy, eyeDx);

        // YAW: Use both X-distance ratio AND Z-depth difference for accuracy
        const noseToLeftEar = Math.abs(noseTip.x - leftEar.x);
        const noseToRightEar = Math.abs(noseTip.x - rightEar.x);
        const xAsymmetry = (noseToLeftEar - noseToRightEar) / (noseToLeftEar + noseToRightEar + 0.001);

        // Z-depth: when head turns right, left ear Z decreases (comes forward)
        const hasZ = noseTip.z !== undefined && leftEar.z !== undefined;
        let zAsymmetry = 0;
        if (hasZ) {
            const earZDiff = (leftEar.z - rightEar.z);
            zAsymmetry = earZDiff * 2.0;  // amplify Z signal
        }

        // Blend X and Z signals (Z is more reliable for large turns)
        const blendedAsymmetry = xAsymmetry * 0.6 + zAsymmetry * 0.4;
        const rawYaw = blendedAsymmetry * Math.PI * 0.35;  // -35° to +35°

        // PITCH: Use Z-depth of nose vs forehead/chin
        const foreheadToChin = Math.abs(foreheadCenter.y - chinTip.y);
        const noseToForehead = Math.abs(noseTip.y - foreheadCenter.y);
        const noseToChin = Math.abs(noseTip.y - chinTip.y);
        let rawPitch;
        if (hasZ) {
            // Nose sticks out more when looking down (nose.z decreases)
            const noseDepth = noseTip.z - (foreheadCenter.z + chinTip.z) / 2;
            rawPitch = noseDepth * Math.PI * 0.6;
        } else {
            const pitchRatio = (noseToForehead - noseToChin) / (foreheadToChin || 1);
            rawPitch = pitchRatio * Math.PI * 0.25;
        }
        const pitch = Math.min(Math.max(rawPitch, -0.55), 0.55);

        // Smooth the head pose with EMA
        const a = this._smoothAlpha;
        const yaw = this._smoothHeadPose.yaw * (1 - a) + rawYaw * a;
        const smoothPitch = this._smoothHeadPose.pitch * (1 - a) + pitch * a;
        const smoothRoll = this._smoothHeadPose.roll * (1 - a) + roll * a;

        this._smoothHeadPose = { yaw, pitch: smoothPitch, roll: smoothRoll };

        // Update face angle classification
        if (yaw < -this._faceAngleYawThreshold) {
            this.faceAngle = 'right';  // head turned right
        } else if (yaw > this._faceAngleYawThreshold) {
            this.faceAngle = 'left';   // head turned left
        } else {
            this.faceAngle = 'front';
        }

        return { yaw, pitch: smoothPitch, roll: smoothRoll };
    }

    // ── Landmark extraction helpers ───────────────────────────
    _extractLandmarkData(landmarks) {
        if (!landmarks || landmarks.length === 0) return null;

        const lm = landmarks[0]; // First face
        if (!lm || lm.length < 468) return null;

        // Compute bounding box from landmarks
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const p of lm) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;

        const faceBox = {
            originX: minX * vw,
            originY: minY * vh,
            width: (maxX - minX) * vw,
            height: (maxY - minY) * vh,
        };

        // Extract legacy-compat keypoints (6 points) for HUD
        // MediaPipe FaceLandmarker indices:
        // Right eye center: ~#33, Left eye center: ~#263
        // Nose tip: #1, Mouth center: #13
        // Left ear (tragion): #234, Right ear (tragion): #454
        const keypoints = [
            { x: lm[33].x, y: lm[33].y },   // 0: Right Eye
            { x: lm[263].x, y: lm[263].y },   // 1: Left Eye
            { x: lm[1].x, y: lm[1].y },   // 2: Nose Tip
            { x: lm[13].x, y: lm[13].y },   // 3: Mouth Center
            { x: lm[234].x, y: lm[234].y },   // 4: Left Ear (tragion)
            { x: lm[454].x, y: lm[454].y },   // 5: Right Ear (tragion)
        ];

        return { landmarks: lm, faceBox, keypoints };
    }

    // ── Main render loop ──────────────────────────────────────
    _loop() {
        if (!this.isRunning) return;
        this.animId = requestAnimationFrame(() => this._loop());

        const video = this.videoEl;
        if (video.readyState < 2 || this.isCapturing) return;

        this._resizeCanvas();

        // Run face landmark detection on the live feed for HUD
        if (this.landmarkerVideo) {
            try {
                const ts = performance.now();
                const result = this.landmarkerVideo.detectForVideo(video, ts);
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    const data = this._extractLandmarkData(result.faceLandmarks);
                    if (data) {
                        this.lastFaceLandmarks = data.landmarks;
                        this.lastFaceBox = data.faceBox;
                        this.lastKeypoints = data.keypoints;
                    }
                } else {
                    this.lastFaceLandmarks = null;
                    this.lastFaceBox = null;
                    this.lastKeypoints = null;
                }
            } catch (e) { /* ignore frame errors */ }
        } else if (this.detectorVideo) {
            // Fallback to basic FaceDetector for HUD (VIDEO mode instance)
            try {
                const ts = performance.now();
                const result = this.detectorVideo.detectForVideo(video, ts);
                if (result.detections && result.detections.length > 0) {
                    const d = result.detections[0];
                    this.lastFaceBox = d.boundingBox;
                    this.lastKeypoints = d.keypoints;
                    this.lastFaceLandmarks = null;
                } else {
                    this.lastFaceBox = null;
                    this.lastKeypoints = null;
                    this.lastFaceLandmarks = null;
                }
            } catch (e) { /* ignore */ }
        }

        // Run hand landmark detection for ring try-on
        if (this.handLandmarkerVideo && this.currentItem?.type === 'ring') {
            try {
                const ts = performance.now();
                const result = this.handLandmarkerVideo.detectForVideo(video, ts);
                if (result.landmarks && result.landmarks.length > 0) {
                    this.lastHandLandmarks = result.landmarks;  // Array of hand landmarks
                } else {
                    this.lastHandLandmarks = null;
                }
            } catch (e) { /* ignore hand detection errors */ }
        } else {
            this.lastHandLandmarks = null;
        }

        this._updateHUD(this.lastFaceBox);

        // Draw landmark debug dots if enabled
        if (this.debugLandmarks && this.lastFaceLandmarks) {
            this._drawDebugLandmarks();
        }

        // ── Live 3D Jewelry Rendering ──────────────────────────────
        // Position and render 3D jewelry over the video feed in real-time
        if (this.currentItem && (this.lastFaceBox || this.currentItem.type === 'ring')) {
            this._update3DJewelry(this.lastFaceBox, this.lastKeypoints, this.lastFaceLandmarks);
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderer.clear();
        }
    }

    _drawDebugLandmarks() {
        const debugCanvas = document.getElementById('debug-landmark-canvas');
        if (!debugCanvas) return;

        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;
        debugCanvas.width = debugCanvas.clientWidth;
        debugCanvas.height = debugCanvas.clientHeight;

        const ctx = debugCanvas.getContext('2d');
        ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

        const scaleX = debugCanvas.width / vw;
        const scaleY = debugCanvas.height / vh;

        const lm = this.lastFaceLandmarks;

        // Key landmark indices to highlight
        const earLandmarks = [
            this.landmarkIndex.leftEar,
            this.landmarkIndex.rightEar,
            this.landmarkIndex.leftEarLobe,
            this.landmarkIndex.rightEarLobe,
            this.landmarkIndex.leftEarTop,
            this.landmarkIndex.rightEarTop,
        ];
        const jawLandmarks = [this.landmarkIndex.chin, 148, 176, 149, 150, 136, 172, 377, 378, 379, 365, 397, 400, this.landmarkIndex.rightJaw, this.landmarkIndex.leftJaw];
        const noseLandmarks = [this.landmarkIndex.nose, this.landmarkIndex.noseBottom, this.landmarkIndex.noseLeftWing, this.landmarkIndex.noseRightWing];
        const chinLandmarks = [this.landmarkIndex.chin, 199, 175];

        // Draw all landmarks as tiny dots
        for (let i = 0; i < lm.length; i++) {
            const px = (1 - lm[i].x) * debugCanvas.width; // Mirror X
            const py = lm[i].y * debugCanvas.height;
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.arc(px, py, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Highlight ear landmarks (gold)
        for (const idx of earLandmarks) {
            if (idx >= lm.length) continue;
            const px = (1 - lm[idx].x) * debugCanvas.width;
            const py = lm[idx].y * debugCanvas.height;
            ctx.fillStyle = '#d4a847';
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Label
            ctx.fillStyle = '#fff';
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText(idx.toString(), px + 6, py - 4);
        }

        // Highlight jaw/chin landmarks (cyan)
        for (const idx of [...jawLandmarks, ...chinLandmarks]) {
            if (idx >= lm.length) continue;
            const px = (1 - lm[idx].x) * debugCanvas.width;
            const py = lm[idx].y * debugCanvas.height;
            ctx.fillStyle = '#4ecbff';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Highlight nose landmarks (green)
        for (const idx of noseLandmarks) {
            if (idx >= lm.length) continue;
            const px = (1 - lm[idx].x) * debugCanvas.width;
            const py = lm[idx].y * debugCanvas.height;
            ctx.fillStyle = '#4ecb71';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── EMA smoothing helper ────────────────────────────────────
    _ema(key, rawX, rawY) {
        const a = this._smoothAlpha;
        const prev = this._smoothPositions[key];
        if (!prev) {
            this._smoothPositions[key] = { x: rawX, y: rawY };
            return { x: rawX, y: rawY };
        }
        const x = prev.x * (1 - a) + rawX * a;
        const y = prev.y * (1 - a) + rawY * a;
        this._smoothPositions[key] = { x, y };
        return { x, y };
    }

    // ── 3D Positioning Logic ──────────────────────────────────
    _pixelTo3D(px, py, distance = 10) {
        // Convert to Normalized Device Coordinates (NDC) -1 to +1
        // NOTE: Video is mirrored (transform: scaleX(-1)), so we flip the X coordinate
        const x = -((px / this.videoEl.videoWidth) * 2 - 1);
        const y = -((py / this.videoEl.videoHeight) * 2 - 1);

        const vector = new THREE.Vector3(x, y, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const dist = (distance - this.camera.position.z) / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(dist));
        return pos;
    }

    _update3DJewelry(box, keypoints, faceLandmarks = null) {
        // Hide all initially
        this.leftEarContainer.visible = false;
        this.rightEarContainer.visible = false;
        this.neckContainer.visible = false;
        this.ringContainer.visible = false;
        this.nosepinContainer.visible = false;

        // Hide all shadow meshes
        Object.values(this._shadowMeshes).forEach(m => m.visible = false);

        // Reset shadow anchors
        this._shadowAnchors = { leftEar: null, rightEar: null, necklace: null };

        if (!this.currentItem) return;

        // Calculate face metrics for scaling
        const faceMetrics = faceLandmarks ? this._calculateFaceMetrics(faceLandmarks) : null;
        if (faceMetrics) {
            this._updateWarnings(faceMetrics);
        }

        // Estimate head pose for better rotation
        const headPose = faceLandmarks ? this._estimateHeadPose(faceLandmarks) : { yaw: 0, pitch: 0, roll: 0 };

        // Anti-Gravity bobbing offset (sinusoidal)
        const now = Date.now() * 0.001;
        const bobPx = this.antiGravityEnabled
            ? Math.sin(now * this.bobSpeed) * this.bobAmplitude
            : 0;
        const levPx = this.antiGravityEnabled ? this.levOffset : 0;
        const zPush = this.antiGravityEnabled ? this.levZPush : 0;

        if (this.currentItem.type === 'ring') {
            // Rings can be placed on fingers if hand is detected, or on face as fallback
            this.ringContainer.visible = true;

            if (this.lastHandLandmarks && this.lastHandLandmarks.length > 0) {
                // Hand detected: place ring on ring finger (index 11-13 for left hand)
                const hand = this.lastHandLandmarks[0];  // Use first detected hand
                if (hand && hand.length >= 12) {
                    const ringFinger = hand[11];  // Ring finger MCP joint
                    const vw = this.videoEl.videoWidth;
                    const vh = this.videoEl.videoHeight;

                    const ringX = ringFinger.x * vw;
                    const ringY = ringFinger.y * vh + bobPx;

                    const ringPos = this._pixelTo3D(ringX, ringY, 8);
                    ringPos.z += zPush;

                    this.ringContainer.position.copy(ringPos);
                    this.ringContainer.rotation.y += 0.015;
                    this.ringContainer.rotation.x = Math.PI / 6;
                    this.ringContainer.scale.setScalar(0.7);
                } else {
                    // Hand detected but not enough landmarks
                    this._positionRingAsDefault();
                }
            } else {
                // No hand: use default position
                this._positionRingAsDefault();
            }
            return;
        }

        if (!box || !keypoints || keypoints.length < 6) return;

        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;

        // Estimate face depth/scale
        const faceWidthPx = box.width;
        const refWidth = vw * 0.25;
        const depth = 10 - ((faceWidthPx - refWidth) / refWidth) * 4;

        // ── Use 468 landmarks for precise positioning if available ──
        if (faceLandmarks && faceLandmarks.length >= 468) {
            const lm = faceLandmarks;

            if (this.currentItem.type === 'earring' && this.enabledTypes.earrings) {
                this.leftEarContainer.visible = true;
                this.rightEarContainer.visible = true;

                // Extract specific ear landmarks
                const leftEarlobe = lm[this.landmarkIndex.leftEarLobe];
                const rightEarlobe = lm[this.landmarkIndex.rightEarLobe];
                const leftTragion = lm[this.landmarkIndex.leftEar];
                const rightTragion = lm[this.landmarkIndex.rightEar];

                if (!leftEarlobe || !rightEarlobe || !leftTragion || !rightTragion) return;

                // Use earlobe landmarks for perfect earring positioning
                const rawLX = leftEarlobe.x * vw;
                const rawLY = leftEarlobe.y * vh;
                const rawRX = rightEarlobe.x * vw;
                const rawRY = rightEarlobe.y * vh;

                // Calculate ear orientation for backward positioning
                const leftEarAngle = Math.atan2(leftEarlobe.y - leftTragion.y, leftEarlobe.x - leftTragion.x);
                const rightEarAngle = Math.atan2(rightEarlobe.y - rightTragion.y, rightEarlobe.x - rightTragion.x);

                // Offset earrings inward (toward back of ear) for realistic positioning
                const earringSize = Math.max(0.8, Math.min(2.0, faceMetrics ? faceMetrics.width * 0.4 : faceWidthPx / (vw * 0.22)));
                const leftOffsetX = earringSize * 0.3 * Math.cos(leftEarAngle + Math.PI / 2) * 0.1;
                const leftOffsetY = earringSize * 0.2 * Math.sin(leftEarAngle + Math.PI / 2) * 0.1;
                const rightOffsetX = earringSize * 0.3 * Math.cos(rightEarAngle - Math.PI / 2) * 0.1;
                const rightOffsetY = earringSize * 0.2 * Math.sin(rightEarAngle - Math.PI / 2) * 0.1;

                // Smooth with EMA
                const sL = this._ema('leftEar', rawLX + leftOffsetX, rawLY + leftOffsetY);
                const sR = this._ema('rightEar', rawRX + rightOffsetX, rawRY + rightOffsetY);

                this._shadowAnchors.leftEar = { x: sL.x, y: sL.y };
                this._shadowAnchors.rightEar = { x: sR.x, y: sR.y };

                const lEarX = sL.x + levPx;
                const lEarY = sL.y + bobPx;
                const rEarX = sR.x - levPx;
                const rEarY = sR.y + bobPx;

                const lPos = this._pixelTo3D(lEarX, lEarY, depth);
                lPos.z += zPush;
                this.leftEarContainer.position.copy(lPos);
                this.leftEarContainer.rotation.z = headPose.roll;
                this.leftEarContainer.rotation.y = headPose.yaw * 0.5;

                const rPos = this._pixelTo3D(rEarX, rEarY, depth);
                rPos.z += zPush;
                this.rightEarContainer.position.copy(rPos);
                this.rightEarContainer.rotation.z = headPose.roll;
                this.rightEarContainer.rotation.y = headPose.yaw * 0.5;

                const swingAmp = this.antiGravityEnabled ? 0.08 : 0.04;
                this.leftEarContainer.rotation.x = Math.sin(now * 2) * swingAmp;
                this.rightEarContainer.rotation.x = Math.sin(now * 2.1) * swingAmp;

                let earScale;
                if (faceMetrics) {
                    // Use face width for dynamic scaling: earrings = face_width * 0.42
                    earScale = faceMetrics.width * 0.42;
                } else {
                    // Fallback
                    earScale = faceWidthPx / (vw * 0.18);
                }
                const clampedES = Math.max(1.0, Math.min(2.5, earScale));
                this.leftEarContainer.scale.setScalar(clampedES);
                this.rightEarContainer.scale.setScalar(clampedES);

                // Head-turn: fade/hide far-side earring for better left-right profiles
                const yawAbs = Math.abs(headPose.yaw);
                const farFade = Math.max(0.15, 1.0 - yawAbs * 3.0);
                if (headPose.yaw > 0.08) {
                    this.rightEarContainer.scale.setScalar(clampedES * farFade);
                    this.rightEarContainer.visible = farFade > 0.18;
                } else if (headPose.yaw < -0.08) {
                    this.leftEarContainer.scale.setScalar(clampedES * farFade);
                    this.leftEarContainer.visible = farFade > 0.18;
                }

                if (this.antiGravityEnabled) {
                    const lShadow = this._shadowMeshes.leftEarShadow;
                    const rShadow = this._shadowMeshes.rightEarShadow;
                    if (lShadow && rShadow) {
                        const lSP = this._pixelTo3D(sL.x, sL.y, depth);
                        lSP.z += 0.05;
                        lShadow.position.copy(lSP);
                        lShadow.rotation.z = headPose.roll;
                        lShadow.visible = true;
                        lShadow.material.opacity = 0.4 + Math.abs(bobPx / this.bobAmplitude) * 0.2;

                        const rSP = this._pixelTo3D(sR.x, sR.y, depth);
                        rSP.z += 0.05;
                        rShadow.position.copy(rSP);
                        rShadow.rotation.z = headPose.roll;
                        rShadow.visible = true;
                        rShadow.material.opacity = 0.4 + Math.abs(bobPx / this.bobAmplitude) * 0.2;
                    }
                }

            } else if (this.currentItem.type === 'necklace' && this.enabledTypes.necklace) {
                this.neckContainer.visible = true;

                const chin = lm[this.landmarkIndex.chin];
                const jawLeft = lm[this.landmarkIndex.leftJaw];
                const jawRight = lm[this.landmarkIndex.rightJaw];
                const sternum = lm[200];

                const jawLandmarks = [
                    lm[this.landmarkIndex.leftJaw], lm[172], lm[136], lm[177], lm[200], lm[261], lm[369],
                    lm[this.landmarkIndex.rightJaw], lm[309], lm[397], lm[388], lm[381], lm[this.landmarkIndex.chin]
                ];

                let avgX = 0, avgY = 0, cnt = 0;
                for (const p of jawLandmarks) {
                    if (p) { avgX += p.x; avgY += p.y; cnt++; }
                }
                avgX /= cnt; avgY /= cnt;

                const rawNX = avgX * vw;
                const ftc = Math.abs(lm[this.landmarkIndex.forehead].y - chin.y) * vh;
                const stF = sternum ? sternum.y * vh : chin.y * vh + ftc * 0.42;
                const rawNY = Math.max(chin.y * vh + ftc * 0.38, stF);

                const sN = this._ema('necklace', rawNX, rawNY);
                this._shadowAnchors.necklace = { x: sN.x, y: sN.y };

                const neckCX = sN.x;
                const neckCY = sN.y + levPx * 0.6 + bobPx;
                const neckPos = this._pixelTo3D(neckCX, neckCY, depth);
                neckPos.z += 0.4 + zPush;

                this.neckContainer.position.copy(neckPos);
                this.neckContainer.rotation.z = headPose.roll;
                this.neckContainer.rotation.x = Math.PI / 12 + headPose.pitch * 0.3;
                this.neckContainer.rotation.y = headPose.yaw * 0.45;

                const jawWidth = Math.abs(jawRight.x - jawLeft.x) * vw;
                let neckScale;
                if (faceMetrics) {
                    // Use face width for dynamic scaling: necklace = face_width * 2.2 (made bigger)
                    neckScale = faceMetrics.width * 2.2;
                } else {
                    // Fallback to jaw width
                    neckScale = jawWidth / (vw * 0.12);
                }
                this.neckContainer.scale.setScalar(Math.max(1.2, Math.min(3.5, neckScale)));

                if (this.antiGravityEnabled) {
                    const nSh = this._shadowMeshes.neckShadow;
                    if (nSh) {
                        const nSP = this._pixelTo3D(sN.x, sN.y, depth);
                        nSP.z += 0.05;
                        nSh.position.copy(nSP);
                        nSh.rotation.z = headPose.roll;
                        nSh.visible = true;
                        nSh.material.opacity = 0.35 + Math.abs(bobPx / this.bobAmplitude) * 0.15;
                        nSh.scale.setScalar(Math.max(0.7, Math.min(1.8, neckScale)));
                    }
                }

            } else if (this.currentItem.type === 'nosepin' && this.enabledTypes.nosepin) {
                this.nosepinContainer.visible = true;

                const noseTip = lm[this.landmarkIndex.nose];
                const leftNostril = lm[this.landmarkIndex.noseLeftWing];
                const rightNostril = lm[this.landmarkIndex.noseRightWing];
                const noseBottom = lm[this.landmarkIndex.noseBottom];
                const sideOffset = Math.max(-0.03, Math.min(0.03, headPose.yaw * 0.12));

                // Anchor around nose tip (landmark 1) and offset slightly with yaw.
                const rawNpX = (noseTip.x + sideOffset) * vw;
                const rawNpY = ((noseTip.y * 0.65) + (noseBottom.y * 0.35)) * vh + bobPx * 0.3;
                const sNP = this._ema('nosepin', rawNpX, rawNpY);

                const nosePos = this._pixelTo3D(sNP.x, sNP.y, depth);
                nosePos.z += 0.7 + zPush - headPose.pitch * 0.3;

                this.nosepinContainer.position.copy(nosePos);
                this.nosepinContainer.rotation.z = headPose.roll;
                this.nosepinContainer.rotation.y = headPose.yaw * 0.9;
                this.nosepinContainer.rotation.x = headPose.pitch * 0.5;

                const nostrilW = Math.abs(rightNostril.x - leftNostril.x) * vw;
                let nsScale;
                if (faceMetrics) {
                    // Use face width for dynamic scaling: nosepin = face_width * 0.15
                    nsScale = faceMetrics.width * 0.15;
                } else {
                    // Fallback
                    nsScale = nostrilW / (vw * 0.06);
                }
                this.nosepinContainer.scale.setScalar(Math.max(0.4, Math.min(1.5, nsScale)));

                const nsSwing = this.antiGravityEnabled ? 0.02 : 0.008;
                this.nosepinContainer.rotation.x += Math.sin(now * 1.5) * nsSwing;
            }
        } else {
            // Fallback: use 6-keypoint FaceDetector data
            this._update3DJewelryFallback(box, keypoints, depth, levPx, bobPx, zPush);
        }
    }

    _update3DJewelryFallback(box, keypoints, depth, levPx = 0, bobPx = 0, zPush = 0) {
        const lEar = keypoints[4];
        const rEar = keypoints[5];
        const nose = keypoints[2];
        const rightEye = keypoints[0];
        const leftEye = keypoints[1];
        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;

        const dx = leftEye.x - rightEye.x;
        const dy = leftEye.y - rightEye.y;
        const headRoll = Math.atan2(dy, dx);

        if (this.currentItem.type === 'earring') {
            if (lEar && rEar) {
                this.leftEarContainer.visible = true;
                this.rightEarContainer.visible = true;

                // Anti-Gravity: push earrings outward horizontally
                const lPos = this._pixelTo3D(lEar.x * vw + levPx, lEar.y * vh + bobPx, depth);
                lPos.z += zPush;
                this.leftEarContainer.position.copy(lPos);
                this.leftEarContainer.rotation.z = headRoll;

                const rPos = this._pixelTo3D(rEar.x * vw - levPx, rEar.y * vh + bobPx, depth);
                rPos.z += zPush;
                this.rightEarContainer.position.copy(rPos);
                this.rightEarContainer.rotation.z = headRoll;

                const now = Date.now() * 0.001;
                const swingAmp = this.antiGravityEnabled ? 0.08 : 0.05;
                this.leftEarContainer.rotation.x = Math.sin(now * 2) * swingAmp;
                this.rightEarContainer.rotation.x = Math.sin(now * 2.1) * swingAmp;

                // Store shadow anchors (on-skin position)
                this._shadowAnchors.leftEar = { x: lEar.x * vw, y: lEar.y * vh };
                this._shadowAnchors.rightEar = { x: rEar.x * vw, y: rEar.y * vh };
            }
        } else if (this.currentItem.type === 'necklace') {
            if (nose) {
                this.neckContainer.visible = true;
                const neckBaseY = box.originY + box.height * 1.2;
                const neckBaseX = box.originX + box.width / 2;

                // Anti-Gravity: push necklace down + bob
                const neckY = neckBaseY + levPx * 0.6 + bobPx;
                const neckPos = this._pixelTo3D(neckBaseX, neckY, depth);
                neckPos.z += 0.5 + zPush;
                this.neckContainer.position.copy(neckPos);
                this.neckContainer.rotation.z = headRoll;
                this.neckContainer.rotation.x = Math.PI / 12;

                // Store shadow anchor
                this._shadowAnchors.necklace = { x: neckBaseX, y: neckBaseY };
            }
        }
    }

    // ── Model Loading ─────────────────────────────────────────
    setItem(item) {
        this.currentItem = item;
        this.isCapturing = false;
        this.capturedDataURL = null;

        // Clear existing models
        while (this.leftEarContainer.children.length) this.leftEarContainer.remove(this.leftEarContainer.children[0]);
        while (this.rightEarContainer.children.length) this.rightEarContainer.remove(this.rightEarContainer.children[0]);
        while (this.neckContainer.children.length) this.neckContainer.remove(this.neckContainer.children[0]);
        while (this.ringContainer.children.length) this.ringContainer.remove(this.ringContainer.children[0]);
        while (this.nosepinContainer.children.length) this.nosepinContainer.remove(this.nosepinContainer.children[0]);

        if (!item || !item.glbFile) return;

        this._loadGLB(item);
    }

    async _loadGLB(item) {
        const url = `/static/models/${item.glbFile}`;

        let gltf = this.loadedModels.get(url);

        if (!gltf) {
            try {
                gltf = await new Promise((resolve, reject) => {
                    this.gltfLoader.load(url, resolve, undefined, reject);
                });
                this.loadedModels.set(url, gltf);
            } catch (err) {
                console.error("Failed to load GLB for try-on:", err);
                return;
            }
        }

        // Just in case user switched item while loading
        if (this.currentItem?.id !== item.id) return;

        const model = gltf.scene.clone();

        // Enhanced material processing for realistic jewelry
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const mat = child.material;
                // Apply environment map for reflections
                if (this.envMap) {
                    mat.envMap = this.envMap;
                    mat.envMapIntensity = 1.5;
                }
                // Boost metallic appearance
                if (mat.metalness !== undefined) {
                    mat.metalness = Math.max(mat.metalness, 0.7);
                    mat.roughness = Math.min(mat.roughness, 0.35);
                }
                mat.needsUpdate = true;
            }
        });

        // Normalize scale
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        let baseScale = 1.0 / maxDim;

        // Item-specific scaling
        if (item.type === 'earring') baseScale *= 1.2;
        if (item.type === 'necklace') baseScale *= 4.0;
        if (item.type === 'ring') baseScale *= 2.8;
        if (item.type === 'nosepin') baseScale *= 0.45;

        model.scale.set(baseScale, baseScale, baseScale);

        // Center the model's pivot
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center.multiplyScalar(baseScale));

        if (item.type === 'earring') {
            const leftObj = new THREE.Group();
            leftObj.add(model.clone());
            this.leftEarContainer.add(leftObj);

            const rightObj = new THREE.Group();
            rightObj.add(model.clone());
            this.rightEarContainer.add(rightObj);

            // Attach at top hook
            leftObj.children[0].position.y -= (size.y * baseScale) / 2;
            rightObj.children[0].position.y -= (size.y * baseScale) / 2;

        } else if (item.type === 'necklace') {
            const neckObj = new THREE.Group();
            neckObj.add(model);
            this.neckContainer.add(neckObj);

        } else if (item.type === 'ring') {
            const ringObj = new THREE.Group();
            ringObj.add(model);
            this.ringContainer.add(ringObj);

        } else if (item.type === 'nosepin') {
            const nosepinObj = new THREE.Group();
            nosepinObj.add(model);
            this.nosepinContainer.add(nosepinObj);
        }
    }

    _positionRingAsDefault() {
        const now = Date.now() * 0.001;
        const ringBob = this.antiGravityEnabled
            ? Math.sin(now * 2.0) * 0.25
            : Math.sin(now * 1.5) * 0.15;
        this.ringContainer.position.set(0, -2 + ringBob, -3);
        this.ringContainer.rotation.y += 0.012;
        this.ringContainer.rotation.x = Math.PI / 8;
    }

    // ── HUD ───────────────────────────────────────────────────
    _updateHUD(faceBox) {
        if (!faceBox) {
            this._setHUD('warn', '👤 Position your face in the frame');
            return;
        }

        const videoW = this.videoEl.videoWidth;
        const videoH = this.videoEl.videoHeight;

        const fw = faceBox.width;
        const faceCX = faceBox.originX + faceBox.width / 2;
        const faceCY = faceBox.originY + faceBox.height / 2;

        const cx = videoW / 2;
        const cy = videoH / 2;

        const distFromCenter = Math.sqrt(Math.pow(faceCX - cx, 2) + Math.pow(faceCY - cy, 2));

        if (fw < videoW * 0.15) {
            this._setHUD('warn', '🔍 Move closer to the camera');
            return;
        }
        if (fw > videoW * 0.6) {
            this._setHUD('warn', '↔️ Move farther from the camera');
            return;
        }
        if (distFromCenter > videoW * 0.2) {
            this._setHUD('warn', '🎯 Center your face in the frame');
            return;
        }

        // ── Jewelry-specific tips when ready ──
        let readyMsg = '✅ Face aligned — Ready to capture!';

        if (this.currentItem) {
            const itemType = this.currentItem.type;
            const itemName = this.currentItem.name;

            switch (itemType) {
                case 'earring':
                    readyMsg = `✅ Perfect! ${itemName} is positioned on your ears.`;
                    break;
                case 'necklace':
                    readyMsg = `✅ Perfect! ${itemName} is centered on your neck.`;
                    break;
                case 'nosepin':
                    readyMsg = `✅ Perfect! ${itemName} is centered on your nose.`;
                    break;
                case 'ring':
                    readyMsg = `✅ Perfect! ${itemName} is ready to showcase.`;
                    break;
                default:
                    readyMsg = `✅ Face aligned — Ready to capture!`;
            }
        }

        // Show active face-angle state and landmark count for dynamic alignment feedback.
        const angleInfo = ` [${this.faceAngle}]`;
        const lmInfo = this.lastFaceLandmarks ? ' (468 landmarks)' : '';
        this._setHUD('ready', readyMsg + angleInfo + lmInfo);
    }

    _setHUD(type, text) {
        const hud = this.hudEl;
        if (!hud) return;
        hud.className = 'tryon-hud ' + type;
        const label = hud.querySelector('.hud-label');
        if (label) label.textContent = text;
    }

    isReady() {
        return this.hudEl && this.hudEl.classList.contains('ready');
    }

    // ── Capture ───────────────────────────────────────────────
    async capture() {
        this.isCapturing = true;

        const vw = this.videoEl.videoWidth;
        const vh = this.videoEl.videoHeight;

        // ── Step 1: Freeze the exact frame from the webcam ────
        const frozenCanvas = document.createElement('canvas');
        frozenCanvas.width = vw;
        frozenCanvas.height = vh;
        const frozenCtx = frozenCanvas.getContext('2d');
        frozenCtx.drawImage(this.videoEl, 0, 0, vw, vh);

        // ── Step 2: Run FaceLandmarker in IMAGE mode on frozen frame ──
        let faceBox = this.lastFaceBox;
        let keypoints = this.lastKeypoints;
        let faceLandmarks = this.lastFaceLandmarks;

        if (this.landmarker) {
            try {
                const result = this.landmarker.detect(frozenCanvas);
                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    const data = this._extractLandmarkData(result.faceLandmarks);
                    if (data) {
                        faceLandmarks = data.landmarks;
                        faceBox = data.faceBox;
                        keypoints = data.keypoints;
                    }
                }
            } catch (e) {
                console.warn('FaceLandmarker IMAGE detect failed:', e);
            }
        } else if (this.detector) {
            // Fallback to FaceDetector
            try {
                const result = this.detector.detect(frozenCanvas);
                if (result.detections && result.detections.length > 0) {
                    const d = result.detections[0];
                    faceBox = d.boundingBox;
                    keypoints = d.keypoints;
                    faceLandmarks = null;
                }
            } catch (e) {
                console.warn('Static frame detection failed:', e);
            }
        }

        // Fallback geometry if no face detected
        if (!faceBox || !keypoints) {
            faceBox = { originX: vw * 0.25, originY: vh * 0.15, width: vw * 0.5, height: vh * 0.65 };
            keypoints = [
                { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 },
                { x: 0.2, y: 0.45 }, { x: 0.8, y: 0.45 }
            ];
            faceLandmarks = null;
        }

        // ── Step 3: Build polished base photo ──────────────────
        const offCanvas = document.createElement('canvas');
        offCanvas.width = vw;
        offCanvas.height = vh;
        const offCtx = offCanvas.getContext('2d');

        // Draw the frozen frame mirrored
        offCtx.save();
        offCtx.translate(vw, 0);
        offCtx.scale(-1, 1);

        // AI aesthetic: warm skin tones, contrast, clarity
        offCtx.filter = 'contrast(1.10) saturate(1.12) brightness(1.05) sepia(6%)';
        offCtx.drawImage(frozenCanvas, 0, 0, vw, vh);
        offCtx.restore();

        // Warm light overlay for golden jewelry feel
        offCtx.save();
        offCtx.globalCompositeOperation = 'overlay';
        offCtx.fillStyle = 'rgba(212, 168, 71, 0.03)';
        offCtx.fillRect(0, 0, vw, vh);
        offCtx.restore();

        // Soft vignette for studio feel
        const vig = offCtx.createRadialGradient(vw / 2, vh / 2, vh * 0.32, vw / 2, vh / 2, vh * 0.88);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(0.7, 'rgba(0,0,0,0.08)');
        vig.addColorStop(1, 'rgba(0,0,0,0.30)');
        offCtx.fillStyle = vig;
        offCtx.fillRect(0, 0, vw, vh);

        // Subtle highlight glow around face
        if (faceBox) {
            const glowX = vw - (faceBox.originX + faceBox.width / 2);  // mirrored
            const glowY = faceBox.originY + faceBox.height / 2;
            const glowR = Math.max(faceBox.width, faceBox.height) * 0.7;
            const glow = offCtx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR);
            glow.addColorStop(0, 'rgba(255,248,230,0.08)');
            glow.addColorStop(1, 'rgba(255,248,230,0)');
            offCtx.fillStyle = glow;
            offCtx.fillRect(0, 0, vw, vh);
        }

        // ── Step 3b: Paint Anti-Gravity shadows on the base photo ──
        // (Before 3D rendering so shadows appear UNDER the jewelry)
        this._update3DJewelry(faceBox, keypoints, faceLandmarks);

        if (this.antiGravityEnabled) {
            this._paintCaptureShadows(offCtx, vw, vh, faceBox);
        }

        // ── Step 4: Render 3D jewelry for this frame ──
        const prevSize = this.renderer.getSize(new THREE.Vector2());
        this.renderer.setSize(vw, vh, false);
        this.camera.aspect = vw / vh;
        this.camera.updateProjectionMatrix();

        // Boost exposure for capture
        const prevExposure = this.renderer.toneMappingExposure;
        this.renderer.toneMappingExposure = 1.4;

        this.renderer.render(this.scene, this.camera);

        // ── Step 5: Composite Three.js jewelry over the polished photo ──
        offCtx.drawImage(this.renderer.domElement, 0, 0, vw, vh);

        // Restore renderer
        this.renderer.toneMappingExposure = prevExposure;
        this.renderer.setSize(prevSize.x, prevSize.y, false);
        this.camera.aspect = prevSize.x / prevSize.y;
        this.camera.updateProjectionMatrix();

        // ── Step 6: Brand watermark ──────────────────────────────
        // Subtle bottom-right watermark
        offCtx.save();
        offCtx.font = 'bold 14px Inter, sans-serif';
        offCtx.fillStyle = 'rgba(255,255,255,0.50)';
        offCtx.textAlign = 'right';
        offCtx.shadowColor = 'rgba(0,0,0,0.4)';
        offCtx.shadowBlur = 4;
        offCtx.fillText('VINAYAKA JEWELLERS • Virtual Try-On', vw - 16, vh - 16);
        offCtx.restore();

        // Small gold accent line above watermark
        offCtx.save();
        offCtx.strokeStyle = 'rgba(212, 168, 71, 0.35)';
        offCtx.lineWidth = 1;
        offCtx.beginPath();
        offCtx.moveTo(vw - 300, vh - 28);
        offCtx.lineTo(vw - 16, vh - 28);
        offCtx.stroke();
        offCtx.restore();

        this._flashEffect();

        this.capturedDataURL = offCanvas.toDataURL('image/jpeg', 0.95);

        // Clear renderer after compositing
        this.renderer.clear();

        return this.capturedDataURL;
    }

    retake() {
        this.isCapturing = false;
        this.capturedDataURL = null;
    }

    download(dataURL = null) {
        const finalDataURL = dataURL || this.capturedDataURL;
        if (!finalDataURL) return;
        const a = document.createElement('a');
        a.href = finalDataURL;
        const itemName = this.currentItem ? this.currentItem.name.replace(/\s+/g, '_') : 'jewelry';
        a.download = `VirtualTryOn_${itemName}_${Date.now()}.jpg`;
        a.click();
    }

    // ── AI Image Enhancement ──────────────────────────────────
    enhanceImage(dataURL, enhancementLevel = 'standard') {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // Apply enhancement based on level
                if (enhancementLevel === 'light') {
                    this._applyLightEnhancement(ctx, canvas.width, canvas.height);
                } else if (enhancementLevel === 'standard') {
                    this._applyStandardEnhancement(ctx, canvas.width, canvas.height);
                } else if (enhancementLevel === 'glamour') {
                    this._applyGlamourEnhancement(ctx, canvas.width, canvas.height);
                }

                resolve(canvas.toDataURL('image/jpeg', 0.96));
            };
            img.src = dataURL;
        });
    }

    _applyLightEnhancement(ctx, w, h) {
        // Subtle brightness and clarity boost
        ctx.save();
        ctx.globalCompositeOperation = 'lighten';
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Slight contrast boost
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(128,128,128,0.05)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    _applyStandardEnhancement(ctx, w, h) {
        // Warm tone enhancement (flattering for jewelry)
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,240,200,0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Soft glow effect
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(255,248,240,0.12)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Slight saturation boost
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    _applyGlamourEnhancement(ctx, w, h) {
        // Professional glamour enhancement

        // Warm professional tone
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,245,220,0.12)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Enhanced glow
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(255,250,245,0.18)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Soft highlight on upper half (faces)
        ctx.save();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(255,255,255,0.15)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Subtle vignette darkening (focus on center)
        ctx.save();
        const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.6, 'rgba(0,0,0,0.08)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Gold accent tint for jewelry emphasis
        ctx.save();
        ctx.globalCompositeOperation = 'color-dodge';
        ctx.fillStyle = 'rgba(212,168,71,0.04)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    _flashEffect() {
        const flash = document.createElement('div');
        flash.style.cssText = `
          position:fixed;inset:0;background:white;opacity:0.7;
          z-index:999;pointer-events:none;transition:opacity 0.45s ease-out;
        `;
        document.body.appendChild(flash);
        requestAnimationFrame(() => {
            flash.style.opacity = '0';
            setTimeout(() => flash.remove(), 550);
        });
    }

    setDebugLandmarks(enabled) {
        this.debugLandmarks = enabled;
        const debugCanvas = document.getElementById('debug-landmark-canvas');
        if (debugCanvas) {
            debugCanvas.style.display = enabled ? 'block' : 'none';
            if (!enabled) {
                const ctx = debugCanvas.getContext('2d');
                ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
            }
        }
    }

    // ── Anti-Gravity API ───────────────────────────────────────
    setAntiGravity(enabled) {
        this.antiGravityEnabled = enabled;
        // Hide shadow meshes immediately when disabled
        if (!enabled) {
            Object.values(this._shadowMeshes).forEach(m => m.visible = false);
        }
    }

    setLevitationOffset(px) {
        this.levOffset = Math.max(0, Math.min(80, px));
    }

    // ── Paint 2D shadows on the capture canvas ─────────────────
    // Called BEFORE 3D render so shadows appear beneath the jewelry
    _paintCaptureShadows(ctx, vw, vh, faceBox) {
        const anchors = this._shadowAnchors;
        if (!anchors) return;

        // Shadow size proportional to face
        const shadowW = faceBox ? faceBox.width * 0.12 : 30;
        const shadowH = shadowW * 0.5;

        const drawShadow = (anchor, w, h) => {
            if (!anchor) return;
            // Mirror X for compositing canvas
            const sx = vw - anchor.x;
            const sy = anchor.y;

            ctx.save();
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h));
            grad.addColorStop(0, 'rgba(0,0,0,0.22)');
            grad.addColorStop(0.4, 'rgba(0,0,0,0.10)');
            grad.addColorStop(0.7, 'rgba(0,0,0,0.03)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;

            // Draw as ellipse for natural skin shadow
            ctx.beginPath();
            ctx.ellipse(sx, sy, w, h, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        // Ear shadows (smaller)
        drawShadow(anchors.leftEar, shadowW, shadowH);
        drawShadow(anchors.rightEar, shadowW, shadowH);

        // Necklace shadow (wider)
        const neckShadowW = faceBox ? faceBox.width * 0.3 : 80;
        const neckShadowH = neckShadowW * 0.25;
        drawShadow(anchors.necklace, neckShadowW, neckShadowH);
    }

    // ── Multi Jewelry Methods ──────────────────────────────────
    setEnabledTypes(types) {
        this.enabledTypes = { ...types };
        this._updateVisibility();
    }

    _updateVisibility() {
        if (this.leftEarContainer) this.leftEarContainer.visible = this.enabledTypes.earrings && this.currentItem?.type === 'earring';
        if (this.rightEarContainer) this.rightEarContainer.visible = this.enabledTypes.earrings && this.currentItem?.type === 'earring';
        if (this.neckContainer) this.neckContainer.visible = this.enabledTypes.necklace && this.currentItem?.type === 'necklace';
        if (this.nosepinContainer) this.nosepinContainer.visible = this.enabledTypes.nosepin && this.currentItem?.type === 'nosepin';
    }

    // ── Gallery Methods ────────────────────────────────────────
    setGalleryItems(items, category) {
        this.galleryItems = items;
        this.currentCategory = category;
        this._renderGallery();

        // Also update the Left Panel collection list (managed in app.js via this engine)
        const collectionList = document.getElementById('tryon-collection-list');
        if (collectionList) {
            collectionList.innerHTML = '';
            items.forEach((item, index) => {
                const el = document.createElement('div');
                el.className = 'collection-item' + (this.currentItem?.id === item.id ? ' active' : '');
                el.textContent = item.name;
                el.onclick = () => {
                    if (window.appSelect) window.appSelect(item.id, 'tryon');
                };
                collectionList.appendChild(el);
            });
        }
    }

    selectGalleryItem(index) {
        if (index >= 0 && index < this.galleryItems.length) {
            const item = this.galleryItems[index];
            if (window.appSelect) window.appSelect(item.id, 'tryon');
        }
    }

    _renderGallery() {
        const galleryEl = document.getElementById('jewelry-gallery');
        if (!galleryEl) return;

        galleryEl.innerHTML = '';
        const categoryIcons = { earrings: '💎', necklace: '📿', nosepin: '✦', rings: '💍' };

        this.galleryItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'gallery-item' + (this.currentItem && this.currentItem.id === item.id ? ' active' : '');
            div.dataset.id = item.id;

            div.innerHTML = `
                <div class="gallery-item-thumb">
                    <img src="${item.image || ''}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/100x100?text=${item.name}'">
                </div>
                <div class="gallery-item-info">
                   <div class="gallery-item-name">${item.name}</div>
                   <div class="gallery-item-hint">${index + 1}</div>
                </div>
            `;

            div.addEventListener('click', () => {
                if (window.appSelect) window.appSelect(item.id, 'tryon');
            });
            galleryEl.appendChild(div);
        });
    }

    // ── Face Analysis Methods ──────────────────────────────────
    _calculateFaceMetrics(lm) {
        const leftEar = lm[this.landmarkIndex.leftEar];
        const rightEar = lm[this.landmarkIndex.rightEar];
        const nose = lm[this.landmarkIndex.nose];
        const chin = lm[this.landmarkIndex.chin];

        if (!leftEar || !rightEar || !nose || !chin) return null;

        // Face width using ear distance
        const faceWidth = Math.abs(rightEar.x - leftEar.x);

        // Face height from forehead to chin
        const forehead = lm[this.landmarkIndex.forehead];
        const faceHeight = forehead ? Math.abs(chin.y - forehead.y) : faceWidth * 1.2;

        // Distance estimation (inverse relationship with size)
        const distance = 1 / (faceWidth + 0.001); // Normalize

        // Tilt detection (nose deviation from center)
        const faceCenterX = (leftEar.x + rightEar.x) / 2;
        const tilt = (nose.x - faceCenterX) / faceWidth;

        return {
            width: faceWidth,
            height: faceHeight,
            distance: distance,
            tilt: tilt
        };
    }

    // ── Distance & Tilt Detection ─────────────────────────────
    _updateWarnings(metrics) {
        const warningsEl = document.getElementById('tryon-warnings');
        const distanceEl = document.getElementById('distance-warning');
        const tiltEl = document.getElementById('tilt-warning');

        if (!warningsEl || !distanceEl || !tiltEl) return;

        const showDistance = metrics.distance > this.distanceThreshold;
        const showTilt = Math.abs(metrics.tilt) > this.tiltThreshold;

        distanceEl.classList.toggle('show', showDistance);
        tiltEl.classList.toggle('show', showTilt);
        warningsEl.style.display = (showDistance || showTilt) ? 'block' : 'none';
    }

    // ── Keyboard Controls ─────────────────────────────────────
    _setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (!this.isRunning) return;

            // Number keys 1-9 for gallery selection
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                this.selectGalleryItem(num - 1);
                e.preventDefault();
            }

            // ESC to exit
            if (e.key === 'Escape') {
                // Switch back to catalog mode
                const catalogBtn = document.querySelector('[data-mode="catalog"]');
                if (catalogBtn) catalogBtn.click();
                e.preventDefault();
            }
        });
    }
}
