import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import dat from 'https://cdn.jsdelivr.net/npm/dat.gui@0.7.7/build/dat.gui.module.js';

let scene, camera, renderer, lorenzLines = [];
let lorenzData = [];
let previousMousePosition = { x: 0, y: 0 };
let isDragging = false;
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
let attractorPosition = { x: 0, y: 0 };
let targetAttractorPosition = { x: -10, y: -7 };
let targetZoom = 50;
let currentZoom = 50;
let geometryChanged = true;
const fullCircle = Math.PI * 2;  // Precomputed full circle
const params = {
  sigma: 10,
  beta: 8 / 3,
  rho: 28,
  stepSize: 0.002,
  lineCount: 60,
};

// Growth parameters
let currentMaxLength = 10;
const targetMaxLength = 200;
const growthDuration = 3000; // 3 seconds in milliseconds
let startTime;

// Precompute colors to avoid recalculating in each frame
const maxPoints = 200;
const startColor = { r: 0.57, g: 0.36, b: 0.91 };
const endColor = { r: 0, g: 0, b: 0 };
const precomputedColors = calculateColors();

function init() {
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

  // Set antialias based on device capabilities
  const isHighPerformanceDevice = window.devicePixelRatio < 1.5;
  renderer = new THREE.WebGLRenderer({ antialias: isHighPerformanceDevice, canvas: canvas });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  startTime = Date.now();  // Set start time to current time

  // Create Lorenz attractor lines
  for (let i = 0; i < params.lineCount; i++) {
    const points = [];
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 100;
    const offsetZ = (Math.random() - 0.5) * 100;
    lorenzData.push([new THREE.Vector3(0.1 + offsetX, offsetY, offsetZ)]);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    lorenzLines.push({ line, points });
    attractorGroup.add(line);
  }

  addEventListeners(canvas);
  animate(attractorGroup);
}

// Precompute colors for the gradient from black to violet
function calculateColors() {
  const colors = [];
  for (let i = 0; i < maxPoints; i++) {
    let r, g, b;
    if (i < 3) {
      r = g = b = 0; // Black for the first 3 points
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

// Add mouse and touch event listeners for rotation and movement
function addEventListeners(canvas) {
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mousemove', throttle((e) => {
    handleMove(e.clientX, e.clientY);
  }, 50));

  canvas.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    previousMousePosition = { x: touch.clientX, y: touch.clientY };
  });

  canvas.addEventListener('touchmove', throttle((e) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
    e.preventDefault(); // Prevent scrolling while interacting
  }, 50));

  canvas.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Throttle scroll event for rotation
  window.addEventListener('scroll', throttle(() => {
    const scrollAmount = window.scrollY / window.innerHeight;
    targetRotation.y = scrollAmount * fullCircle;
  }, 50));
}

// Throttle function to limit event listener calls
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

// Lorenz Attractor Calculation
function stepLorenz(v, dt) {
  const dx = params.sigma * (v.y - v.x);
  const dy = v.x * (params.rho - v.z) - v.y;
  const dz = v.x * v.y - params.beta * v.z;

  v.x += dx * dt;
  v.y += dy * dt;
  v.z += dz * dt;

  return v;
}

// Update the Lorenz Attractor with precomputed colors
function updateLorenz() {
  // Calculate the elapsed time since the start
  const elapsedTime = Date.now() - startTime;

  // Smoothly increase the max length from 10 to 200 over 3 seconds
  if (elapsedTime < growthDuration) {
    currentMaxLength = 10 + ((targetMaxLength - 10) * (elapsedTime / growthDuration));
  } else {
    currentMaxLength = targetMaxLength;
  }

  lorenzLines.forEach((lorenz, index) => {
    const data = lorenzData[index];
    if (!data || data.length === 0) return;

    const lastPoint = data[data.length - 1].clone();
    const nextPoint = stepLorenz(lastPoint, params.stepSize);
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

    lorenz.line.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    lorenz.line.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );

    if (geometryChanged) {
      lorenz.line.geometry.attributes.position.needsUpdate = true;
      lorenz.line.geometry.attributes.color.needsUpdate = true;
    }
  });
  geometryChanged = false;
}

// Animation Loop
function animate(attractorGroup) {
  requestAnimationFrame(() => animate(attractorGroup));

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

  updateLorenz();
  renderer.render(scene, camera);
}

// Handle Window Resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

init();