import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, model, controls;
let tryScene, tryCamera, tryRenderer, tryControls, tryModel;
let allModels = [];

let detectedDirection = "unknown";

const videoElement = document.getElementById("webcam");
const capturedPhoto = document.getElementById("captured-photo");

/* ========================= */
/* MAIN 3D VIEWER */
/* ========================= */

function init3D() {

    const viewer = document.getElementById("viewer");

    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setSize(viewer.clientWidth, viewer.clientHeight);
    viewer.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(),0.04).texture;

    camera = new THREE.PerspectiveCamera(40, viewer.clientWidth/viewer.clientHeight, 0.1,1000);
    camera.position.set(0,0,5);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    animate();
}

function animate(){
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene,camera);
}

/* ========================= */
/* TRY ON 3D */
/* ========================= */

function initTryOn3D(){

    const container = document.getElementById("tryon-container");

    tryScene = new THREE.Scene();

    tryCamera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );

    tryRenderer = new THREE.WebGLRenderer({
        alpha:true,
        antialias:true
    });

    tryRenderer.setSize(container.clientWidth, container.clientHeight);
    tryRenderer.domElement.style.position = "absolute";
    tryRenderer.domElement.style.top = "0";
    tryRenderer.domElement.style.left = "0";
    container.appendChild(tryRenderer.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    tryScene.add(light);

    tryCamera.position.set(0,0,3);

    tryControls = new OrbitControls(tryCamera, tryRenderer.domElement);
    tryControls.enableZoom = false;
    tryControls.enablePan = false;

    animateTryOn();
}

function animateTryOn(){
    requestAnimationFrame(animateTryOn);
    tryControls.update();
    tryRenderer.render(tryScene, tryCamera);
}

function loadTryOnModel(id){

    const loader = new GLTFLoader();

    if(tryModel) tryScene.remove(tryModel);

    loader.load(`/static/models/${id}.glb`, gltf=>{
        tryModel = gltf.scene;
        tryModel.scale.set(1.5,1.5,1.5);
        tryScene.add(tryModel);
    });
}

/* ========================= */
/* FACE DETECTION AI */
/* ========================= */

function initFaceAI(){

    const faceDetection = new FaceDetection({
        locateFile: (file) => 
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
    });

    faceDetection.setOptions({
        modelSelection: 0,
        minDetectionConfidence: 0.6
    });

    faceDetection.onResults(results => {

        if(results.detections.length > 0){

            const bbox = results.detections[0].boundingBox;
            const centerX = bbox.xCenter;

            if(centerX > 0.6){
                detectedDirection = "left";
            }
            else if(centerX < 0.4){
                detectedDirection = "right";
            }
            else{
                detectedDirection = "front";
            }

        } else {
            detectedDirection = "unknown";
        }
    });

    const cameraFeed = new Camera(videoElement, {
        onFrame: async () => {
            await faceDetection.send({image: videoElement});
        },
        width: 640,
        height: 480
    });

    cameraFeed.start();
}

/* ========================= */
/* CAPTURE VALIDATION */
/* ========================= */

window.capturePhoto = function(){

    if(detectedDirection !== "front"){
        alert("Please face FRONT to capture correct 3D try-on image.");
        return;
    }

    const container = document.getElementById("tryon-container");

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = container.clientWidth;
    finalCanvas.height = container.clientHeight;

    const ctx = finalCanvas.getContext("2d");

    ctx.drawImage(videoElement, 0, 0, finalCanvas.width, finalCanvas.height);
    ctx.drawImage(tryRenderer.domElement, 0, 0);

    capturedPhoto.src = finalCanvas.toDataURL("image/png");
    capturedPhoto.style.display = "block";
    videoElement.style.display = "none";
};

/* ========================= */
/* INIT */
/* ========================= */

window.addEventListener("load",async()=>{

    init3D();

    const res = await fetch('/api/models');
    allModels = await res.json();

    document.getElementById("tryon-btn")
        .addEventListener("click",()=>{

            document.getElementById("tryon-container").style.display="block";

            navigator.mediaDevices.getUserMedia({ video:true })
                .then(stream=>{
                    videoElement.srcObject = stream;
                });

            if(!tryRenderer){
                initTryOn3D();
            }

            if(allModels.length > 0){
                loadTryOnModel(allModels[0]);
            }

            initFaceAI();
        });
});