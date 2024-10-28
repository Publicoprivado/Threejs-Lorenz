import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import Stats from 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js';

let scene, camera, renderer, strip, stats, backgroundSphere;
let previousTouchPosition = { x: 0, y: 0 };
let rotationVelocity = { x: 0, y: 0 };

const inertiaFactor = 0.1;
const sensitivity = 0.001;
const continuousRotationSpeedX = 0.0002;
const continuousRotationSpeedY = 0.01;

const params = {
    segments: 32,
    statsHidden: true,
    color1: new THREE.Color('#3a3a3a'),
    color2: new THREE.Color('#515151'),
    noiseScale: 5.0,
};

let widthScale = 1.5;
let targetWidthScale = 1.5; // Target width scale for smooth transition
let lastFrameTime = 0;
const frameInterval = 1000 / 60;

initScene();
render();

function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(0, 4, 7.5);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(renderer.domElement);

    stats = new Stats();
    stats.dom.style.position = 'absolute';
    stats.dom.style.top = '0px';
    stats.dom.style.right = '0px';
    document.body.appendChild(stats.dom);
    toggleStatsVisibility();

    createBackgroundSphere();
    createMobiusStrip();
    addEventListeners();
}

function createBackgroundSphere() {
    const geometry = new THREE.SphereGeometry(50, 64, 64);
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            color1: { value: params.color1 },
            color2: { value: params.color2 },
            noiseScale: { value: params.noiseScale },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float noiseScale;
            varying vec2 vUv;

            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            float noise(vec2 st) {
                vec2 i = floor(st);
                vec2 f = fract(st);
                float a = random(i);
                float b = random(i + vec2(1.0, 0.0));
                float c = random(i + vec2(0.0, 1.0));
                float d = random(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            void main() {
                float n = noise(vUv * noiseScale) * 0.5 + 0.5;
                vec3 color = mix(color1, color2, n);
                gl_FragColor = vec4(color, 1.0);
            }
        `,
    });

    backgroundSphere = new THREE.Mesh(geometry, material);
    scene.add(backgroundSphere);
}

function createMobiusStrip() {
    const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    strip = new THREE.Mesh(getStripGeometry(), material);
    strip.rotation.set(Math.PI, Math.PI / 2, Math.PI);
    scene.add(strip);
}

function getStripGeometry() {
    const geometry = new THREE.PlaneGeometry(1, 1, 5 * params.segments, params.segments);
    const positionAttr = geometry.attributes.position;
    const positions = positionAttr.array;

    for (let i = 0; i < positions.length; i += 3) {
        const mobiusCoords = mobiusStripPoint(positions[i], positions[i + 1]);
        positions[i] = mobiusCoords[0];
        positions[i + 1] = mobiusCoords[1];
        positions[i + 2] = mobiusCoords[2];
    }

    positionAttr.copyArray(positions);
    geometry.rotateX(0.5 * Math.PI);
    geometry.computeVertexNormals();

    return geometry;
}

function mobiusStripPoint(x, y) {
    y *= widthScale;
    const angle = 2 * Math.PI * x;
    const r = 1 + y * Math.cos(angle);
    const x1 = Math.cos(angle) * r;
    const y1 = Math.sin(angle) * r;
    const z1 = y * Math.sin(angle);
    return [x1, y1, z1];
}

function render(currentTime) {
    stats.begin();

    if (currentTime - lastFrameTime < frameInterval) {
        requestAnimationFrame(render);
        stats.end();
        return;
    }
    lastFrameTime = currentTime;

    // Smoothly interpolate widthScale towards targetWidthScale
    widthScale += (targetWidthScale - widthScale) * 0.02;

    strip.geometry = getStripGeometry();
    strip.rotation.y += rotationVelocity.y;
    strip.rotation.x += rotationVelocity.x;

    rotationVelocity.x *= 0.97;
    rotationVelocity.y *= 0.97;
    strip.rotation.y += continuousRotationSpeedY;
    strip.rotation.x += continuousRotationSpeedX;

    renderer.render(scene, camera);
    stats.end();
    requestAnimationFrame(render);
}

function addEventListeners() {
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const deltaX = touch.clientX - previousTouchPosition.x;
            const deltaY = previousTouchPosition.y - touch.clientY;
            rotationVelocity.y = deltaX * sensitivity*2;
            rotationVelocity.x = deltaY * sensitivity*2;
            previousTouchPosition = { x: touch.clientX, y: touch.clientY };
        }
    });

    window.addEventListener('touchstart', (e) => {
        e.preventDefault();
        targetWidthScale = 2.7; // Set scale when touch starts
        if (e.touches.length > 0) {
            previousTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    });

    window.addEventListener('touchend', () => {
        targetWidthScale = 1.5; // Reset scale when touch ends
    });

    window.addEventListener('mousemove', (e) => {
        const deltaX = e.clientX - window.innerWidth / 2;
        const deltaY = e.clientY - window.innerHeight / 2;
        backgroundSphere.rotation.y = deltaX * 0.0001;
        backgroundSphere.rotation.x = deltaY * 0.0001;
    });
}

function toggleStatsVisibility() {
    stats.dom.style.display = params.statsHidden ? 'none' : 'block';
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
