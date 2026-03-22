// viewer3d.js — Three.js 3D Jewelry Viewer (GLB model loader)
// Realistic gold rendering with proper PBR, HDR environment, and balanced lighting

class JewelryViewer {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.currentMesh = null;
        this.autoRotate = true;
        this.animFrameId = null;
        this.loader = null;
        this._init();
    }

    _init() {
        // ── STEP 1: Renderer with physically correct settings ──
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.physicallyCorrectLights = true;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;

        // ── STEP 8: Shadows for realism ──
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Scene
        this.scene = new THREE.Scene();

        // ── STEP 7: Dark premium background for contrast ──
        this.scene.background = new THREE.Color(0x0b0f1a);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.001,
            200
        );
        this.camera.position.set(0, 0.5, 4);

        // ── STEP 2 & 3: Balanced lighting ──
        this._setupLights();

        // ── STEP 4: HDR Environment for gold reflections ──
        this._setupEnvironment();

        // GLTFLoader
        this.loader = new THREE.GLTFLoader();

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.07;
        this.controls.enablePan = false;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 12;
        this.controls.minPolarAngle = Math.PI * 0.05;
        this.controls.maxPolarAngle = Math.PI * 0.9;

        // Ground reflection plane
        this._setupGround();

        // Loading indicator + spinner elements
        this._setupLoadingIndicator();

        // Resize
        window.addEventListener('resize', () => this._onResize());

        // Start loop
        this._animate();
    }

    // ── STEP 2 & 3: Controlled lighting (no white > 1.5) ──
    _setupLights() {
        // STEP 3: Soft ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // STEP 2: Main directional light (reduced, not overpowered)
        this.keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.keyLight.position.set(2, 2, 2);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = 2048;
        this.keyLight.shadow.mapSize.height = 2048;
        this.keyLight.shadow.camera.near = 0.1;
        this.keyLight.shadow.camera.far = 50;
        this.scene.add(this.keyLight);

        // Fill light (warm gold tone for jewellery)
        const fillLight = new THREE.DirectionalLight(0xfde8a0, 0.5);
        fillLight.position.set(-3, 3, -1);
        this.scene.add(fillLight);

        // Rim light (gold accent from behind)
        this.rimLight = new THREE.DirectionalLight(0xd4a847, 0.6);
        this.rimLight.position.set(0, -2, -4);
        this.scene.add(this.rimLight);

        // Subtle sparkle point lights
        const pLight1 = new THREE.PointLight(0xffffff, 0.5, 15);
        pLight1.position.set(2, 3, 2);
        this.scene.add(pLight1);

        const pLight2 = new THREE.PointLight(0xd4a847, 0.4, 15);
        pLight2.position.set(-2, -1, 2);
        this.scene.add(pLight2);
    }

    // ── STEP 4: Environment map for realistic reflections ──
    _setupEnvironment() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        if (THREE.RoomEnvironment) {
            const roomEnv = new THREE.RoomEnvironment();
            const envTexture = pmremGenerator.fromScene(roomEnv).texture;
            this.scene.environment = envTexture;
        }
        pmremGenerator.dispose();
    }

    _setupGround() {
        const geo = new THREE.PlaneGeometry(20, 20);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x080a14,
            roughness: 0.8,
            metalness: 0.2,
            transparent: true,
            opacity: 0.6,
        });
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -1.5;
        plane.receiveShadow = true;
        this.scene.add(plane);

        // Circular glow under jewelry
        const glowGeo = new THREE.CircleGeometry(1.5, 64);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xd4a847,
            transparent: true,
            opacity: 0.04,
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.glow.rotation.x = -Math.PI / 2;
        this.glow.position.y = -1.48;
        this.scene.add(this.glow);
    }

    _setupLoadingIndicator() {
        const wrapper = this.canvas.parentElement;
        if (!wrapper) return;

        let loadDiv = wrapper.querySelector('.viewer-loading-glb');
        if (!loadDiv) {
            loadDiv = document.createElement('div');
            loadDiv.className = 'viewer-loading-glb';
            loadDiv.innerHTML = `
                <div class="glb-spinner"></div>
                <div class="glb-loading-text">Loading 3D Model…</div>
            `;
            wrapper.appendChild(loadDiv);
        }
        this.loadingEl = loadDiv;
    }

    _showLoading(show) {
        if (this.loadingEl) {
            this.loadingEl.style.display = show ? 'flex' : 'none';
        }
    }

    _onResize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    // ── Auto-center and scale a loaded GLTF scene ─────────────
    _fitModel(gltfScene) {
        const box = new THREE.Box3().setFromObject(gltfScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const targetScale = maxDim > 0 ? (1.8 / maxDim) : 1;
        gltfScene.scale.setScalar(targetScale);

        const scaledBox = new THREE.Box3().setFromObject(gltfScene);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        gltfScene.position.x -= scaledCenter.x;
        gltfScene.position.z -= scaledCenter.z;
        gltfScene.position.y -= scaledBox.min.y;

        const scaledSize = new THREE.Vector3();
        new THREE.Box3().setFromObject(gltfScene).getSize(scaledSize);
        const maxScaledDim = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
        const camDist = Math.min(Math.max(maxScaledDim * 2.4, 2.5), 10);
        this.camera.position.set(0, scaledSize.y * 0.45, camDist);
        this.controls.target.set(0, scaledSize.y * 0.35, 0);
        this.controls.update();

        return targetScale;
    }

    // ── STEP 5: Enhance materials — preserve original colors ──────────────
    _enhanceMaterials(gltfScene, item) {
        gltfScene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Ensure geometry has normals for proper lighting
                if (child.geometry && !child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals();
                }

                let mat = child.material;
                if (!mat) return;

                // IMPORTANT: Do NOT use MeshBasicMaterial — it causes flat white look
                // Convert non-PBR materials to MeshStandardMaterial but KEEP original color
                if (mat.type === 'MeshBasicMaterial' || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) {
                    const originalColor = mat.color ? mat.color.clone() : new THREE.Color(0xcccccc);
                    const originalMap = mat.map || null;
                    const newMat = new THREE.MeshStandardMaterial({
                        color: originalColor,
                        map: originalMap,
                        metalness: 0.9,
                        roughness: 0.25,
                        envMapIntensity: 1.5,
                    });
                    child.material = newMat;
                    mat = child.material;
                }

                // Kill emissive channel — it causes overexposure / white blowout
                if (mat.emissive) {
                    mat.emissive.setHex(0x000000);
                    mat.emissiveIntensity = 0;
                }

                // Enhance PBR without overriding the original color
                // Only slightly boost metalness if it's too low
                if (mat.metalness !== undefined) {
                    mat.metalness = Math.max(mat.metalness, 0.6);
                }
                if (mat.roughness !== undefined) {
                    mat.roughness = Math.min(Math.max(mat.roughness, 0.15), 0.4);
                }

                // Environment map intensity for realistic reflections
                mat.envMapIntensity = 1.5;

                mat.needsUpdate = true;
            }
        });
    }

    // ── Public API ─────────────────────────────────────────────
    loadJewelry(item) {
        const glbFile = item.glbFile;
        if (!glbFile) {
            console.warn('No glbFile for item:', item.id);
            return;
        }

        this._showLoading(true);

        // Immediately remove the previous model so it never overlaps
        if (this.currentMesh) {
            this.scene.remove(this.currentMesh);
            this.currentMesh = null;
        }

        const url = `static/models/${encodeURIComponent(glbFile)}`;

        this.loader.load(
            url,
            (gltf) => {
                const model = gltf.scene;

                // 1. Auto-scale & center
                const fittedScale = this._fitModel(model);

                // 2. Enhance materials for realistic gold look
                this._enhanceMaterials(model, item);

                // 3. Add to scene at near-zero scale, then animate
                model.scale.setScalar(0.001);
                this.scene.add(model);
                this.currentMesh = model;

                this._showLoading(false);
                this._fadeIn(model, fittedScale);

                // Update rim light colour to echo the gem
                if (item.gemColor) {
                    this.rimLight.color.set(item.gemColor);
                } else {
                    this.rimLight.color.set(0xd4a847);
                }
            },
            undefined,
            (err) => {
                console.error('GLB load error for', glbFile, err);
                this._showLoading(false);
                this._showFallback(item);
            }
        );
    }

    _showFallback(item) {
        const geo = new THREE.TorusGeometry(0.8, 0.2, 32, 128);
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(item.color || 0xD4AF37),
            metalness: 1.0,
            roughness: 0.25,
            envMapIntensity: 1.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.position.y = 0.3;
        this.scene.add(mesh);
        this.currentMesh = mesh;
        this._fadeIn(mesh);
    }

    _fadeIn(mesh, targetScale) {
        const start = Date.now();
        const duration = 650;
        const to = (targetScale && targetScale > 0) ? targetScale : 1;

        const tick = () => {
            const t = Math.min((Date.now() - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            mesh.scale.setScalar(ease * to);
            if (t < 1) requestAnimationFrame(tick);
        };
        tick();
    }

    _fadeOut(mesh, cb) {
        const start = Date.now();
        const duration = 280;
        const startScale = mesh.scale.x;
        const tick = () => {
            const t = Math.min((Date.now() - start) / duration, 1);
            const s = startScale * (1 - t);
            mesh.scale.setScalar(s);
            if (t < 1) requestAnimationFrame(tick);
            else cb();
        };
        tick();
    }

    setAutoRotate(val) {
        this.autoRotate = val;
    }

    _animate() {
        this.animFrameId = requestAnimationFrame(() => this._animate());

        if (this.autoRotate && this.currentMesh) {
            this.currentMesh.rotation.y += 0.005;
        }

        // Subtle glow pulse
        if (this.glow) {
            this.glow.material.opacity = 0.03 + 0.02 * Math.sin(Date.now() * 0.0015);
        }

        // Rim light subtle oscillation (kept low to avoid overexposure)
        if (this.rimLight) {
            this.rimLight.intensity = 0.5 + 0.15 * Math.sin(Date.now() * 0.001);
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        cancelAnimationFrame(this.animFrameId);
        this.renderer.dispose();
    }
}
