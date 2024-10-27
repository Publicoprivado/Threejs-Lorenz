import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import dat from 'https://cdn.jsdelivr.net/npm/dat.gui@0.7.7/build/dat.gui.module.js';

let scene, camera, renderer, stats, lorenzLines = [], particles = [];
let lorenzData = [];
let previousMousePosition = { x: 0, y: 0 };
let isDragging = false;
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
let attractorPosition = { x: 0, y: -17 };
let targetAttractorPosition = { x: -12, y: -12 };
let targetZoom = 50;
let currentZoom = 50;
let geometryChanged = true;
const fullCircle = Math.PI * 2;
const targetFPS = 60;
const frameDuration = 1000 / targetFPS;
const maxDeltaTime = 100;
let lastFrameTime = 0;
let animationId;

const params = {
  sigma: 10,
  beta: 8 / 3,
  rho: 28,
  stepSize: 0.003,
  lineCount: 60,
  particleCount: 4,
  particleSpeed: 0.08 
};

const particleSpacing = 100;

const currentMaxLength = 200;
const precomputeSteps = 5000;
const maxPoints = 200;
const startColor = { r: 0.53, g: 0, b: 0.40 };
const endColor = { r: 0.13, g: 0, b: 0.55 };
const precomputedColors = calculateColors();

async function loadStats() {
  const StatsModule = await import('https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js');
  stats = new StatsModule.default();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);
}

async function init() {
  await loadStats();

  scene = new THREE.Scene();
  const attractorGroup = new THREE.Group();
  scene.add(attractorGroup);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.001, 15000);
  camera.position.set(0, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.id = 'lorenz';
  document.body.appendChild(canvas);
  document.body.style.overflow = 'auto';
  document.body.style.height = '200vh';

  const isHighPerformanceDevice = window.devicePixelRatio < 1.5;
  renderer = new THREE.WebGLRenderer({ antialias: isHighPerformanceDevice, canvas: canvas });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Create Lorenz attractor lines with precomputed starting points
  for (let i = 0; i < params.lineCount; i++) {
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 100;
    const offsetZ = (Math.random() - 0.5) * 100;
    const startPoint = new THREE.Vector3(0.1 + offsetX, offsetY, offsetZ);

    const precomputedPoints = precomputeLorenz(startPoint, precomputeSteps, params.stepSize);
    lorenzData.push(precomputedPoints.slice(-currentMaxLength));

    const geometry = new THREE.BufferGeometry().setFromPoints(precomputedPoints);
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    lorenzLines.push({ line, points: precomputedPoints });
    attractorGroup.add(line);

    // Create sparse particles for each line
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(params.particleCount * 3);
    const particleColors = new Float32Array(params.particleCount * 3);

    for (let j = 0; j < params.particleCount; j++) {
      const index = (j * particleSpacing) % precomputedPoints.length;
      const point = precomputedPoints[index];
      particlePositions[j * 3] = point.x;
      particlePositions[j * 3 + 1] = point.y;
      particlePositions[j * 3 + 2] = point.z;

      if (Math.random() < 0.3) {
        particleColors[j * 3] = 1.0;
        particleColors[j * 3 + 1] = 1.0;
        particleColors[j * 3 + 2] = 1.0;
      } else {
        particleColors[j * 3] = precomputedColors[j * 3];
        particleColors[j * 3 + 1] = precomputedColors[j * 3 + 1];
        particleColors[j * 3 + 2] = precomputedColors[j * 3 + 2];
      }
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMaterial = new THREE.PointsMaterial({ size: 0.1, vertexColors: true });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particles.push({ system: particleSystem, positions: particlePositions });
    attractorGroup.add(particleSystem);
  }

  addEventListeners(canvas);
  animate(attractorGroup);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
    } else {
      lastFrameTime = performance.now();
      animate(attractorGroup);
    }
  });
}

function calculateColors() {
  const colors = [];
  for (let i = 0; i < maxPoints; i++) {
    let r, g, b;
    if (i < 3) {
      r = g = b = 0;
    } else {
      const blendFactor = 1 - (i - 3) / (maxPoints - 3);
      r = startColor.r * blendFactor + endColor.r * (1 - blendFactor);
      g = startColor.g * blendFactor + endColor.g * (1 - blendFactor);
      b = startColor.b * blendFactor + endColor.b * (1 - blendFactor);
    }
    colors.push(r, g, b);
  }
  return colors;
}

function precomputeLorenz(startPoint, steps, dt) {
  const points = [startPoint.clone()];
  let point = startPoint.clone();
  for (let i = 0; i < steps; i++) {
    point = stepLorenz(point, dt);
    points.push(point.clone());
  }
  return points;
}

function addEventListeners(canvas) {
  // Handle mouse events for desktop
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mousemove', throttle((e) => {
    if (isDragging) {
      handleMove(e.clientX, e.clientY);
    }
  }, 50));

  // Handle touch events for mobile
  canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    previousMousePosition = { x: touch.clientX, y: touch.clientY };
  });

  canvas.addEventListener('touchmove', throttle((e) => {
    if (isDragging) {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    }
    e.preventDefault(); // Prevent scrolling while interacting
  }, 50));

  canvas.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Handle scroll for Y-rotation
  window.addEventListener('scroll', throttle(() => {
    const scrollAmount = window.scrollY / window.innerHeight;
    targetRotation.y = scrollAmount * fullCircle;
  }, 50));
}

function throttle(callback, delay) {
  let timeout;
  return (...args) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        callback(...args);
        timeout = null;
      }, delay);
    }
  };
}

function handleMove(clientX, clientY) {
  const deltaX = clientX - previousMousePosition.x;
  const deltaY = clientY - previousMousePosition.y;

  if (isDragging) {
    targetAttractorPosition.x += deltaX * 0.1;
    targetAttractorPosition.y -= deltaY * 0.1;
    geometryChanged = true;
  } else {
    const rotationSpeed = 0.0005;
    targetRotation.y += deltaX * rotationSpeed;
    targetRotation.x += deltaY * rotationSpeed;
  }

  previousMousePosition = { x: clientX, y: clientY };
}

function stepLorenz(v, dt) {
  const dx = params.sigma * (v.y - v.x);
  const dy = v.x * (params.rho - v.z) - v.y;
  const dz = v.x * v.y - params.beta * v.z;

  v.x += dx * dt;
  v.y += dy * dt;
  v.z += dz * dt;

  return v;
}

function updateLorenz(deltaTime) {
  lorenzLines.forEach((lorenz, index) => {
    const data = lorenzData[index];
    if (!data || data.length === 0) return;

    const lastPoint = data[data.length - 1].clone();
    const nextPoint = stepLorenz(lastPoint, params.stepSize * deltaTime / frameDuration);
    data.push(nextPoint);

    if (data.length > currentMaxLength) {
      data.shift();
    }

    const positions = [];
    const colors = [];
    data.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      colors.push(precomputedColors[i * 3], precomputedColors[i * 3 + 1], precomputedColors[i * 3 + 2]);
    });

    lorenz.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lorenz.line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    if (geometryChanged) {
      lorenz.line.geometry.attributes.position.needsUpdate = true;
      lorenz.line.geometry.attributes.color.needsUpdate = true;
    }
  });
  geometryChanged = false;
}

function animate(attractorGroup, currentTime = 0) {
  stats.begin();

  const deltaTime = Math.min(currentTime - lastFrameTime, maxDeltaTime);
  if (deltaTime < frameDuration) {
    animationId = requestAnimationFrame((time) => animate(attractorGroup, time));
    stats.end();
    return;
  }

  lastFrameTime = currentTime;
  animationId = requestAnimationFrame((time) => animate(attractorGroup, time));

  currentRotation.x += (targetRotation.x - currentRotation.x) * 0.05;
  currentRotation.y += (targetRotation.y - currentRotation.y) * 0.05;
  attractorGroup.rotation.x = currentRotation.x;
  attractorGroup.rotation.y = currentRotation.y;

  currentZoom += (targetZoom - currentZoom) * 0.1;
  camera.position.set(0, 0, currentZoom);
  camera.updateProjectionMatrix();

  attractorPosition.x += (targetAttractorPosition.x - attractorPosition.x) * 0.05;
  attractorPosition.y += (targetAttractorPosition.y - attractorPosition.y) * 0.05;
  attractorGroup.position.set(attractorPosition.x, attractorPosition.y, 0);

  updateLorenz(deltaTime);
  updateParticles();
  renderer.render(scene, camera);

  stats.end();
}

function updateParticles() {
  particles.forEach((particleObj, index) => {
    const lineData = lorenzData[index];
    const particlePositions = particleObj.positions;

    for (let i = 0; i < params.particleCount; i++) {
      const particleIndex = (i * particleSpacing + Math.floor(params.particleSpeed * i)) % lineData.length;
      const particlePoint = lineData[particleIndex];
      particlePositions[i * 3] = particlePoint.x;
      particlePositions[i * 3 + 1] = particlePoint.y;
      particlePositions[i * 3 + 2] = particlePoint.z;
    }
    particleObj.system.geometry.attributes.position.needsUpdate = true;
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);
init();
