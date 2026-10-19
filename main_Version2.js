// Dreamspace: interactive Three.js background with bloom, dust, and a procedural planet.
// No external textures required; all textures are generated at runtime.
import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.154.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.154.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.154.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'https://unpkg.com/three@0.154.0/examples/jsm/shaders/FXAAShader.js';
import { ShaderPass } from 'https://unpkg.com/three@0.154.0/examples/jsm/postprocessing/ShaderPass.js';
import { OrbitControls } from 'https://unpkg.com/three@0.154.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, composer;
let starPoints, dustPoints, planet, atmosphere;
let raycaster, pointer;
let hovering = false;
let focusProgress = 0; // 0..1 camera focus on click
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();

init();
animate();

function init() {
  // Scene and camera
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040612, 0.0006);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 35);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  // Post-processing: composer + bloom + FXAA
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.1);
  bloom.threshold = 0.1;
  bloom.strength = 0.9;
  bloom.radius = 0.6;
  composer.addPass(bloom);
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
  composer.addPass(fxaaPass);

  // Lighting
  const hemi = new THREE.HemisphereLight(0x99ccff, 0x101025, 0.7);
  scene.add(hemi);
  const point = new THREE.PointLight(0xbfe8ff, 1.2, 200);
  point.position.set(40, 40, 50);
  scene.add(point);

  // Controls (subtle, disabled rotate by default but useful for debug)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false; // keep user-facing focus on parallax and click interactions

  // Raycaster for hover / click
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Create procedural planet texture (canvas-based)
  const planetTexture = generatePlanetTexture(1024, 512);

  // Planet mesh
  const planetGeo = new THREE.SphereGeometry(6, 64, 48);
  const planetMat = new THREE.MeshStandardMaterial({
    map: planetTexture,
    roughness: 0.6,
    metalness: 0.05,
    emissive: 0x001226,
    emissiveIntensity: 0.08,
  });
  planet = new THREE.Mesh(planetGeo, planetMat);
  planet.position.set(-12, 2, -8);
  scene.add(planet);

  // Atmosphere: larger, slightly emissive, additive
  const atmGeo = new THREE.SphereGeometry(6.4, 64, 48);
  const atmMat = new THREE.MeshBasicMaterial({
    color: 0x79e0ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  atmosphere = new THREE.Mesh(atmGeo, atmMat);
  atmosphere.position.copy(planet.position);
  scene.add(atmosphere);

  // Starfield (distant)
  starPoints = createStarField(12000, 180, 0.7);
  scene.add(starPoints);

  // Floating dust (closer, soft sprites)
  dustPoints = createDust(1200, 40, 0.8);
  scene.add(dustPoints);

  // Subtle foreground glow plane (to give depth/dreaminess)
  // (we use a very large, transparent sphere to create a soft ambient tint)
  const glowGeo = new THREE.SphereGeometry(200, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x071022, transparent: true, opacity: 0.25, side: THREE.BackSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 10, -30);
  scene.add(glow);

  // Events
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerdown', onPointerDown);
  // touch fallback
  document.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length) onPointerDown(e.touches[0]);
  }, {passive: true});

  // Accessibility: respect prefers-reduced-motion
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    // disable heavy postprocessing
    composer.passes = composer.passes.filter(p => !(p instanceof UnrealBloomPass));
  }
}

/* ---------- Helpers: generate procedural planet texture ---------- */
function generatePlanetTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // background gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3d5fe0');
  g.addColorStop(1, '#273a7a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // add large soft cloud blobs (dreamlike)
  for (let i = 0; i < 20; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const r = 60 + Math.random() * 220;
    const grd = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.14})`);
    grd.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // add subtle noise for surface detail
  const image = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 8;
    image.data[i] = clamp(image.data[i] + v, 0, 255);
    image.data[i + 1] = clamp(image.data[i + 1] + v * 0.4, 0, 255);
    image.data[i + 2] = clamp(image.data[i + 2] + v * 0.1, 0, 255);
  }
  ctx.putImageData(image, 0, 0);

  // add a soft terminator (dark side)
  ctx.globalCompositeOperation = 'multiply';
  const term = ctx.createLinearGradient(0, 0, w, 0);
  term.addColorStop(0, 'rgba(0,0,0,0.0)');
  term.addColorStop(0.55, 'rgba(0,0,0,0.0)');
  term.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = term;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // return as THREE texture
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------- Starfield: distant points ---------- */
function createStarField(count, radius = 150, size = 1.0) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = radius + Math.random() * 20;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    const i3 = i * 3;
    positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;

    const c = 0.7 + Math.random() * 0.3;
    colors[i3] = c; colors[i3 + 1] = c; colors[i3 + 2] = c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.6 * size, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  return new THREE.Points(geo, mat);
}

/* ---------- Dust: closer, slow-moving soft sprites ---------- */
function createDust(count = 1000, spread = 50, size = 0.9) {
  // create small circular sprite texture
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const sctx = sprite.getContext('2d');
  const sg = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  sg.addColorStop(0, 'rgba(255,255,255,0.95)');
  sg.addColorStop(0.4, 'rgba(200,240,255,0.35)');
  sg.addColorStop(1, 'rgba(200,240,255,0)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(sprite);

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * spread * (1 + Math.random() * 1.2);
    const y = (Math.random() - 0.5) * spread * 0.6 + 5;
    const z = (Math.random() - 0.5) * spread * (0.3 + Math.random() * 1.2);
    const i3 = i * 3;
    positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ map: tex, size: 1.5 * size, transparent: true, depthWrite: false, opacity: 0.9, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.userData.spin = Math.random() * 0.2 + 0.1;
  return points;
}

/* ---------- Interaction handlers ---------- */
function onPointerMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pointer.set(x, y);
  mouse.x = e.clientX; mouse.y = e.clientY;
}

function onPointerDown(e) {
  // map click to NDC
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const clickNDC = new THREE.Vector2(x, y);
  raycaster.setFromCamera(clickNDC, camera);
  const hits = raycaster.intersectObject(planet, true);
  if (hits.length) {
    // start focus animation
    focusProgress = 0.001;
  }
}

/* ---------- Resize ---------- */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  const fxaa = composer.passes.find(p => p.material && p.material.uniforms && p.material.uniforms['resolution']);
  if (fxaa) fxaa.material.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
}

/* ---------- Animation loop ---------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Move camera subtly with cursor (parallax)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    const targetX = (mouse.x / window.innerWidth - 0.5) * 6;
    const targetY = (mouse.y / window.innerHeight - 0.5) * 4;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += ( -targetY - camera.position.y) * 0.04;
  }

  // Stars rotate very slowly
  starPoints.rotation.y += 0.0003;
  starPoints.rotation.x += 0.00008;

  // Dust drifts
  dustPoints.rotation.y += 0.0006;
  dustPoints.position.y += Math.sin(t * 0.3) * 0.001;

  // planet movement: bob and rotate
  planet.rotation.y += 0.0024;
  planet.position.y = 2 + Math.sin(t * 0.7) * 0.6;
  atmosphere.position.copy(planet.position);
  atmosphere.rotation.y = planet.rotation.y * 1.02;

  // hover detection
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(planet, false);
  if (intersects.length) {
    if (!hovering) {
      hovering = true;
      // subtle scale & glow on hover
      new Ticker(0.12, (v) => planet.scale.setScalar(1 + 0.06 * v)).start(0.2);
    }
  } else {
    if (hovering) {
      hovering = false;
      new Ticker(0.12, (v) => planet.scale.setScalar(1.06 - 0.06 * v)).start(0.2);
    }
  }

  // focus animation when clicked: camera smoothly lerps to focus position near the planet
  if (focusProgress > 0 && focusProgress < 1) {
    focusProgress += dt * 0.9;
    const frac = easeOutCubic(Math.min(focusProgress, 1));
    // camera wants to move from current to a target offset near the planet
    const target = new THREE.Vector3().copy(planet.position).add(new THREE.Vector3(12, 2, 24));
    camera.position.lerp(target, frac * 0.05);
    camera.lookAt(planet.position);
    // small bloom increase while focusing
    const bloomPass = composer.passes.find(p => p instanceof UnrealBloomPass);
    if (bloomPass) bloomPass.strength = 0.9 + frac * 0.8;
    if (focusProgress >= 1) {
      // revert bloom slowly
      setTimeout(() => { if (bloomPass) bloomPass.strength = 0.9; }, 600);
      focusProgress = 0; // stop
    }
  } else {
    // make sure camera slowly returns to general look-at
    camera.lookAt(new THREE.Vector3(-5, 2, -10));
  }

  // render via composer to get bloom
  composer.render();
}

/* ---------- Small utility & micro-animation ticker ---------- */
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

// Ticker: calls update with v in [0..1] over duration seconds, then stops
class Ticker {
  constructor(duration, updateFn) {
    this.duration = duration;
    this.updateFn = updateFn;
    this.start = null;
    this.running = false;
    this.raf = null;
  }
  start(delay = 0) {
    if (this.running) return;
    this.running = true;
    setTimeout(() => {
      this.start = performance.now();
      const loop = (t) => {
        const p = Math.min((t - this.start) / (this.duration * 1000), 1);
        this.updateFn(easeOutCubic(p));
        if (p < 1) this.raf = requestAnimationFrame(loop);
        else this.running = false;
      };
      this.raf = requestAnimationFrame(loop);
    }, delay * 1000);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.running = false; }
}

/* ---------- End of file ---------- */