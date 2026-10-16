import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_R, ARM, HEAD_R, LEG, PART_MAX, WIN_SCORE, STAM_MAX, WEAPONS, WHEEL, skeleton, forward, isHeavy, kickCurve } from '/shared/sim.js';
import { makePredictor } from '/shared/predict.js';

const TEAM = [0xe0493e, 0x3e7be0];
const TEAM_CSS = ['#e0493e', '#3e7be0'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------- lobby ----------
const GOOFY = ['Sir Flops-a-Lot', 'Lady Stabsworth', 'Duke Nubbin', 'Earl of Ouch', 'Sir Limpsalot', 'Baroness Bonk'];
const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const params = new URLSearchParams(location.search);

// ---------- settings ----------
// Everything in the settings menu, remembered on this computer. The three graphics presets fill in the
// graphics options; changing any one of them by hand makes it "Custom".
const PRESETS = {
  Low: { scale: 0.75, shadows: 1, aa: 0, bloom: false, ao: false, vignette: false, lights: true, atmosphere: true },
  Medium: { scale: 1, shadows: 2, aa: 2, bloom: true, ao: false, vignette: true, lights: true, atmosphere: true },
  High: { scale: 2, shadows: 3, aa: 4, bloom: true, ao: true, vignette: true, lights: true, atmosphere: true },
};
const GFX_KEYS = Object.keys(PRESETS.Low);
const S = (() => {
  const d = { preset: 'Medium', ...PRESETS.Medium, auto: true, fps: false, fov: 78, sens: 1, music: 70, sfx: 80 };
  let saved = null;
  try { saved = JSON.parse(store.get('duel.settings')); } catch {}
  if (saved && typeof saved === 'object') for (const k of Object.keys(d)) { if (typeof saved[k] === typeof d[k]) d[k] = saved[k]; }
  else if (store.get('duel.quality') !== null) { d.preset = ['Low', 'Medium', 'High'][Number(store.get('duel.quality'))] || 'Medium'; Object.assign(d, PRESETS[d.preset]); d.auto = false; }
  // Graphics are fixed at Low, the fastest setting, for everyone.
  d.preset = 'Low'; Object.assign(d, PRESETS.Low); d.auto = false;
  return d;
})();
const saveSettings = () => store.set('duel.settings', JSON.stringify(S));
$('name').value = store.get('duel.name') || pick(GOOFY);
$('room').value = params.get('room') || store.get('duel.room') || 'main';
let joined = false;
$('go').onclick = () => {
  const name = $('name').value.trim() || 'Nameless Knight', room = $('room').value.trim() || 'main';
  store.set('duel.name', name); store.set('duel.room', room);
  $('lobby').remove(); joined = true;
  audio.init();
  connect(name, room);
  lockPointer();
};
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && $('go').click());

// ---------- renderer & scene ----------
const glCanvas = $('gl'), hud = $('hud'), hctx = hud.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: S.aa > 0 });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0820);
scene.fog = new THREE.FogExp2(0x231a36, 0.02);
const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.03, 200);
camera.rotation.order = 'YXZ';
// Post-processing: glow on bright things (bloom), then a soft dark vignette and a slight colour grade.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
// Ambient occlusion: soft contact shadows where things meet (feet on the ground, armour plates, stone joints).
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.blendIntensity = 0.85;
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.85);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float hurt; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, smoothstep(0.85, 0.3, d), 0.55);            // vignette
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.97, 1.1), 0.5);        // a touch of spooky purple
      c.rgb = mix(c.rgb, vec3(c.r * 1.4, c.g * 0.5, c.b * 0.5), hurt * smoothstep(0.2, 0.7, d)); // red edges when hurt
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
// Apply the graphics settings. Screen effects (glow, ambient occlusion, vignette) need the extra
// post-processing passes; with all of them off the scene is drawn straight to the screen, which is fastest.
let qualityToast = 0, toastText = '', moonLight = null;
const useComposer = () => S.bloom || S.ao || S.vignette;
function applySettings() {
  renderer.setPixelRatio(S.scale >= 2 ? Math.min(devicePixelRatio, 2) : S.scale);
  gtao.enabled = S.ao; bloom.enabled = S.bloom; grade.enabled = S.vignette;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== S.aa) { rt.samples = S.aa; rt.dispose(); }
  if (moonLight) {
    moonLight.castShadow = S.shadows > 0;
    const size = [512, 512, 1024, 2048][S.shadows];
    if (moonLight.shadow.mapSize.x !== size) { moonLight.shadow.mapSize.set(size, size); moonLight.shadow.map?.dispose(); moonLight.shadow.map = null; }
  }
  for (const l of torchLights) l.visible = S.lights;
  for (const o of [...mists.map((x) => x.m), ...ghosts.map((x) => x.g), ...bats.map((x) => x.g)]) o.visible = S.atmosphere;
  camera.fov = S.fov;
  resize();
}
function setPreset(name, why) {
  S.preset = name; Object.assign(S, PRESETS[name]); saveSettings(); applySettings(); menu.refresh();
  toastText = `Graphics: ${name}${why ? ` (${why})` : '  (G or Esc to change)'}`; qualityToast = 3;
}
// Watch the frame rate for a few seconds at a time; if it's poor and auto is on, drop a preset.
const perf = { t: 0, n: 0, fps: 0, ft: 0, fn: 0 };
function watchFrameRate(dt) {
  if (dt <= 0) return;
  perf.ft += dt; perf.fn++;
  if (perf.ft >= 0.5) { perf.fps = Math.round(perf.fn / perf.ft); perf.ft = 0; perf.fn = 0; }
  if (!S.auto || S.preset === 'Low' || document.hidden) { perf.t = 0; perf.n = 0; return; }
  perf.t += dt; perf.n++;
  if (perf.t >= 3) { if (perf.n / perf.t < 45) setPreset(S.preset === 'High' ? 'Medium' : 'Low', 'lowered to keep it smooth'); perf.t = 0; perf.n = 0; }
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  hud.width = w * devicePixelRatio; hud.height = h * devicePixelRatio;
}
addEventListener('resize', resize);

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- procedural PBR textures ----------
// Everything is generated at load (no image files): a colour map, a normal map for surface bumps,
// and a roughness map. Noise tiles seamlessly so the textures can repeat across big surfaces.
const tnoise = (() => {
  const perm = new Uint8Array(512); for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  // value noise on a lattice that wraps every `p` cells
  const val = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  // fractal noise over u,v in [0,1), tiling; `base` is how many cells across at the first octave
  return (u, v, base = 4, oct = 5) => { let s = 0, amp = 0.5, n = 0, p = base; for (let o = 0; o < oct; o++) { s += val(u * p, v * p, p) * amp; n += amp; amp *= 0.5; p *= 2; } return s / n; };
})();
function makePBR(w, h, fn, { repeat = [1, 1], bump = 2.5, wrap = true } = {}) {
  const H = new Float32Array(w * h), col = new Uint8ClampedArray(w * h * 4), rough = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = fn(x / w, y / h, x, y);
    H[i] = o.h; col[i * 4] = o.c[0]; col[i * 4 + 1] = o.c[1]; col[i * 4 + 2] = o.c[2]; col[i * 4 + 3] = 255;
    const r = Math.round((o.r ?? 0.8) * 255); rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r; rough[i * 4 + 3] = 255;
  }
  const nrm = new Uint8ClampedArray(w * h * 4);
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * bump, dy = (at(x, y + 1) - at(x, y - 1)) * bump, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    nrm[i] = (-dx / l * 0.5 + 0.5) * 255; nrm[i + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[i + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const tex = (data, srgb) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rough, false) };
}
const pbrMat = (set, extra = {}) => new THREE.MeshStandardMaterial({ ...set, ...extra });
const withRepeat = (set, rx, ry) => Object.fromEntries(Object.entries(set).map(([k, t]) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return [k, c]; }));
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const TEX = {};
// Packed earth with pebbles, ruts and dead leaves.
TEX.ground = (() => {
  const pebbles = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.003, 0.01), s: rnd(0.3, 0.8) }));
  const leaves = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.01, 0.022), a: rnd(0, 3.14), c: pick([[96, 50, 22], [78, 42, 20], [110, 72, 34], [70, 48, 26]]) }));
  return makePBR(512, 512, (u, v) => {
    let n = tnoise(u, v, 6, 6), big = tnoise(u + 0.37, v + 0.11, 2, 3), hgt = n * 0.5 + big * 0.3;
    let c = mixc([58, 44, 34], [104, 84, 64], clamp01(n * 1.4 - 0.2)); c = mixc(c, [72, 66, 56], clamp01(big - 0.35));
    let r = 0.95;
    for (const p of pebbles) {
      let dx = Math.abs(u - p.x), dy = Math.abs(v - p.y); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
      const d = Math.hypot(dx, dy * 1.3) / p.r; if (d < 1) { const k = Math.sqrt(1 - d * d); hgt += k * 0.5; c = mixc(c, [118 * p.s + 30, 112 * p.s + 30, 104 * p.s + 30], 0.85); r = 0.7; }
    }
    for (const l of leaves) {
      let dx = u - l.x, dy = v - l.y; dx -= Math.round(dx); dy -= Math.round(dy);
      const ca = Math.cos(l.a), sa = Math.sin(l.a), lx = (dx * ca + dy * sa) / l.r, ly = (-dx * sa + dy * ca) / (l.r * 0.45);
      if (lx * lx + ly * ly < 1) { c = mixc(c, l.c, 0.9); hgt += 0.05; r = 0.75; }
    }
    return { h: hgt, c, r };
  }, { repeat: [7, 7], bump: 3 });
})();
// Old castle stone: irregular blocks, dark mortar, moss creeping up from the bottom.
TEX.stone = (() => {
  const rows = 4, cols = 5, tint = Array.from({ length: rows * cols * 2 }, () => rnd(-0.12, 0.12));
  return makePBR(512, 256, (u, v) => {
    const row = Math.floor(v * rows), off = (row % 2) * 0.5, cu = u * cols + off, col = Math.floor(cu) % cols;
    const fx = cu - Math.floor(cu), fy = v * rows - row, edge = Math.min(fx, 1 - fx, (fy) * 0.6, (1 - fy) * 0.6) * 4;
    const n = tnoise(u, v, 8, 5), mortar = edge < 0.12 + n * 0.08;
    const t = tint[row * cols + col];
    let hgt = mortar ? 0.05 : Math.min(1, edge * 2.5) * 0.6 + n * 0.4;
    let c = mortar ? [40, 36, 40] : mixc([78, 74, 82], [120, 116, 124], clamp01(n + t));
    const moss = clamp01(tnoise(u + 0.5, v, 4, 4) * 1.6 - 1.05 + v * 0.45); // v near 1 is the bottom of the wall
    c = mixc(c, [52, 74, 38], moss * 0.8);
    return { h: hgt, c, r: mortar ? 1 : 0.85 - n * 0.2 };
  }, { repeat: [36, 2], bump: 4 });
})();
// Weathered wooden planks for the stands and gates.
TEX.wood = makePBR(256, 256, (u, v) => {
  const plank = Math.floor(v * 4), fy = v * 4 - plank, grain = tnoise(u * 1, v * 4 + plank * 0.3, 2, 5);
  const streak = Math.sin((u * 40 + grain * 8 + plank * 3)) * 0.5 + 0.5, gap = fy < 0.04 || fy > 0.96;
  const c = gap ? [20, 14, 10] : mixc([70, 48, 32], [112, 82, 56], clamp01(streak * 0.5 + grain * 0.6));
  return { h: gap ? 0 : 0.5 + streak * 0.15 + grain * 0.2, c, r: 0.85 };
}, { repeat: [40, 1], bump: 2 });
// Plain wood grain for weapon handles.
TEX.grain = makePBR(64, 256, (u, v) => {
  const g = tnoise(u, v * 0.25, 4, 5), streak = Math.sin(u * 30 + g * 10) * 0.5 + 0.5;
  return { h: streak * 0.3, c: mixc([66, 44, 28], [118, 84, 54], streak * 0.6 + g * 0.4), r: 0.7 };
}, { repeat: [1, 1], bump: 1 });
// Riveted chainmail.
TEX.mail = makePBR(128, 128, (u, v) => {
  const ru = u * 16, rv = v * 16, shift = (Math.floor(rv) % 2) * 0.5, fx = ru + shift - Math.floor(ru + shift) - 0.5, fy = rv - Math.floor(rv) - 0.5;
  const d = Math.hypot(fx, fy * 1.2), ring = Math.max(0, 1 - Math.abs(d - 0.33) / 0.12);
  const c = mixc([40, 42, 46], [170, 175, 182], ring);
  return { h: ring, c, r: 0.5 - ring * 0.2 };
}, { repeat: [4, 4], bump: 1.5 });
// Brushed, slightly worn steel.
TEX.steel = makePBR(256, 256, (u, v) => {
  const brush = tnoise(u * 0.25, v * 8, 4, 4), wear = tnoise(u, v, 5, 5);
  const c = mixc([150, 156, 164], [200, 206, 214], brush); return { h: brush * 0.15 + wear * 0.1, c: mixc(c, [110, 104, 98], clamp01(wear * 1.5 - 0.9)), r: 0.25 + wear * 0.25 };
}, { repeat: [1, 1], bump: 0.6 });
// Woven cloth.
TEX.cloth = makePBR(128, 128, (u, v) => {
  const a = Math.sin(u * Math.PI * 64) * 0.5 + 0.5, b = Math.sin(v * Math.PI * 64) * 0.5 + 0.5, n = tnoise(u, v, 4, 4);
  const k = 0.82 + (a * b) * 0.12 + n * 0.12; return { h: a * 0.5 + b * 0.5, c: [255 * k, 255 * k, 255 * k], r: 0.95 };
}, { repeat: [10, 10], bump: 0.5 });
// Wrapped leather grips.
TEX.leather = makePBR(64, 64, (u, v) => {
  const wrap = Math.sin((v * 6 + u) * Math.PI * 2) * 0.5 + 0.5, n = tnoise(u, v, 4, 4);
  return { h: wrap, c: mixc([50, 30, 18], [92, 60, 36], wrap * 0.5 + n * 0.5), r: 0.75 };
}, { repeat: [1, 1.5], bump: 1.5 });
// Granite for tombstones and pillars.
TEX.granite = makePBR(256, 256, (u, v) => {
  const n = tnoise(u, v, 6, 6), speck = tnoise(u, v, 64, 2);
  return { h: n * 0.6 + speck * 0.2, c: mixc([92, 90, 98], [150, 148, 156], clamp01(n * 1.3 - 0.15 + (speck > 0.72 ? 0.3 : 0))), r: 0.8 };
}, { repeat: [1, 1], bump: 2 });

// ---------- the arena (Halloween night) ----------
const crowd = { bodies: null, heads: null, base: [], cheer: 0 };
const torches = [], torchLights = [], ghosts = [], bats = [], mists = [];
// A carved pumpkin: orange ball with a glowing face painted on one side.
const pumpkinFace = canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = '#e8740c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(120,50,0,0.35)'; g.fillRect((i / 8) * w, 0, 3, h); }
  g.fillStyle = '#ffe14a';
  const cx = w * 0.25; // this part of the texture lands on the sphere's +z side, which lookAt aims at the arena
  const tri = (x, y, s) => { g.beginPath(); g.moveTo(x - s, y + s * 0.6); g.lineTo(x, y - s * 0.7); g.lineTo(x + s, y + s * 0.6); g.fill(); };
  tri(cx - 14, 48, 9); tri(cx + 14, 48, 9); tri(cx, 64, 5);
  g.beginPath(); g.moveTo(cx - 24, 76); g.lineTo(cx + 24, 76); g.lineTo(cx + 16, 92); g.lineTo(cx + 8, 86); g.lineTo(cx, 94); g.lineTo(cx - 8, 86); g.lineTo(cx - 16, 92); g.closePath(); g.fill();
});
pumpkinFace.wrapS = pumpkinFace.wrapT = THREE.ClampToEdgeWrapping; pumpkinFace.repeat.set(1, 1);
function makePumpkin(size) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), new THREE.MeshStandardMaterial({ map: pumpkinFace, emissive: 0xff8a1a, emissiveMap: pumpkinFace, emissiveIntensity: 1.2, roughness: 0.8 }));
  body.scale.y = 0.78; grp.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.16, size * 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x3f5a1c }));
  stem.position.y = size * 0.85; grp.add(stem);
  return grp;
}
function buildEnvironment() {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main() { p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 p; void main() { gl_FragColor = vec4(mix(vec3(0.25, 0.14, 0.08), vec3(0.18, 0.16, 0.42), smoothstep(-0.2, 0.5, p.y)), 1.0); }',
  }));
  env.add(sky);
  const glow = (color, x, y, z, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); env.add(m); };
  glow(0xfff0c8, -30, 26, -22, 6); // the moon
  for (let i = 0; i < 6; i++) glow(0xff8a2a, Math.cos(i) * 40, 4, Math.sin(i) * 40, 3); // pumpkin light all around
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.35;
}
buildEnvironment();
function buildArena() {
  scene.add(new THREE.HemisphereLight(0x8d84d6, 0x2a1b2e, 0.9));
  const moon = moonLight = new THREE.DirectionalLight(0xb9c8ff, 1.6);
  moon.position.set(-14, 20, -10); moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
  scene.add(moon);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.3, 72), pbrMat(TEX.ground, { normalScale: new THREE.Vector2(1.2, 1.2) }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // a glowing summoning circle instead of painted lines
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a1a).multiplyScalar(2.2), transparent: true, opacity: 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; scene.add(ring);

  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.3, ARENA_R + 0.3, 2.2, 72, 1, true), pbrMat(TEX.stone, { side: THREE.DoubleSide }));
  wall.position.y = 1.1; wall.receiveShadow = true; scene.add(wall);
  const cap = new THREE.Mesh(new THREE.RingGeometry(ARENA_R + 0.3, ARENA_R + 0.8, 72), pbrMat(withRepeat(TEX.granite, 30, 30), { side: THREE.DoubleSide }));
  cap.rotation.x = -Math.PI / 2; cap.position.y = 2.2; scene.add(cap);

  // Tiered stands full of cheering monsters.
  const standMat = pbrMat(withRepeat(TEX.stone, 14, 14), { side: THREE.DoubleSide, color: 0x8a8590 }), riserMat = pbrMat(withRepeat(TEX.stone, 50, 0.7), { side: THREE.DoubleSide, color: 0x8a8590 });
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const r0 = ARENA_R + 0.8 + i * 1.3, y = 2.2 + i * 0.75;
    const seat = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.3, 72), standMat); seat.rotation.x = -Math.PI / 2; seat.position.y = y; scene.add(seat);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.3, r0 + 1.3, 0.75, 72, 1, true), riserMat); riser.position.y = y + 0.375; scene.add(riser);
    seats.push([r0 + 0.6, y]);
  }
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 6.1, ARENA_R + 6.1, 6, 72, 1, true), pbrMat(withRepeat(TEX.stone, 60, 5), { side: THREE.DoubleSide, color: 0x77727e }));
  outer.position.y = 3; scene.add(outer);
  const N = 420;
  crowd.bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.19, 0.32, 4, 10), pbrMat({ normalMap: TEX.cloth.normalMap, roughnessMap: TEX.cloth.roughnessMap }), N);
  crowd.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), N);
  // pumpkin heads, skeletons, zombies, ghosts, vampires, witches
  const monsters = [[0xc8640c, 0x1e1a1c], [0xd8d3c4, 0x2b2826], [0x6f8e52, 0x3a3240], [0xc8ccd6, 0x8a8c96], [0xe0d2cc, 0x4a1218], [0x7f9c5c, 0x261a30]];
  for (let k = 0; k < N;) {
    const [r, y] = pick(seats), a = rnd(0, Math.PI * 2);
    if (Math.abs(Math.cos(a)) < 0.1) continue; // leave the space above the two gates empty
    crowd.base.push({ k, x: Math.cos(a) * r, z: Math.sin(a) * r, y, ph: rnd(0, 6.28), sp: rnd(4, 9) });
    const [head, body] = pick(monsters);
    crowd.bodies.setColorAt(k, new THREE.Color(body));
    crowd.heads.setColorAt(k, new THREE.Color(head));
    k++;
  }
  scene.add(crowd.bodies, crowd.heads);

  // Pillars topped with jack-o'-lanterns, and spooky banners.
  const pillarMat = pbrMat(withRepeat(TEX.granite, 1, 4), { color: 0x8a8494 });
  const bannerTex = canvasTexture(90, 150, (g, w, h) => {
    g.fillStyle = '#3b1856'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#111'; g.font = '48px serif'; g.textAlign = 'center'; g.fillText('🦇', w / 2, h / 2 + 16);
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12, x = Math.cos(a) * (ARENA_R + 0.1), z = Math.sin(a) * (ARENA_R + 0.1);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), pillarMat);
    pillar.position.set(x, 1.6, z); pillar.lookAt(0, 1.6, 0); pillar.castShadow = true; scene.add(pillar);
    const jack = makePumpkin(0.28);
    jack.position.set(x * 0.98, 3.42, z * 0.98); jack.lookAt(0, 3.42, 0); scene.add(jack); torches.push(jack.children[0]);
    if (i % 3 === 0) { const l = new THREE.PointLight(0xff8a2a, 7, 10, 1.6); l.position.set(x * 0.93, 3.5, z * 0.93); scene.add(l); torchLights.push(l); }
    const b = (i / 12) * Math.PI * 2;
    if (Math.abs(Math.cos(b)) < 0.2) continue;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide }));
    banner.position.set(Math.cos(b) * (ARENA_R + 0.25), 1.35, Math.sin(b) * (ARENA_R + 0.25)); banner.lookAt(0, 1.35, 0); scene.add(banner);
  }
  // Gates where the fighters come out.
  for (const s of [1, -1]) {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.5), pbrMat(withRepeat(TEX.wood, 1, 2.5), { color: 0x6a5a4a }));
    gate.position.set(0, 1.3, s * (ARENA_R + 0.4)); scene.add(gate);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.7), pillarMat);
    arch.position.set(0, 2.85, s * (ARENA_R + 0.4)); scene.add(arch);
  }

  // Tombstones leaning against the wall, with the odd pumpkin.
  const stoneMat = pbrMat(TEX.granite);
  const epitaphs = ['R.I.P.', 'Sir Lost-a-Leg', 'Should have blocked', 'Here lies a head', 'Fists. Again.', 'Hit by trout'];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd(-0.08, 0.08);
    if (Math.abs(Math.cos(a)) < 0.2) continue; // keep the gates clear
    const r = ARENA_R - 0.25, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (i % 3 === 1) { const p = makePumpkin(0.2); p.position.set(x, 0.16, z); p.lookAt(0, 0.16, 0); scene.add(p); continue; }
    const words = canvasTexture(128, 160, (g, w, h) => {
      g.fillStyle = '#7c7a84'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2e2b33'; g.font = 'bold 18px serif'; g.textAlign = 'center';
      const text = epitaphs[i % epitaphs.length].split(' '); let line = '', ly = 60;
      for (const word of text) { if (g.measureText(line + word).width > 100) { g.fillText(line, w / 2, ly); line = ''; ly += 22; } line += word + ' '; }
      g.fillText(line, w / 2, ly);
    });
    words.wrapS = words.wrapT = THREE.ClampToEdgeWrapping;
    const stone = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.12), [stoneMat, stoneMat, stoneMat, stoneMat, new THREE.MeshStandardMaterial({ map: words, normalMap: TEX.granite.normalMap, roughness: 0.85 }), stoneMat]);
    slab.position.y = 0.32; stone.add(slab);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 16, 1, false, 0, Math.PI), stoneMat);
    top.rotation.set(Math.PI / 2, Math.PI / 2, 0); top.position.y = 0.65; stone.add(top);
    stone.position.set(x, 0, z); stone.lookAt(0, 0, 0); stone.rotateZ(rnd(-0.15, 0.15)); stone.rotateX(rnd(-0.12, 0.05));
    stone.traverse((o) => { o.castShadow = true; }); scene.add(stone);
  }

  // Dead trees peeking over the outer wall.
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x1c1418, roughness: 1 });
  const branch = (parent, len, rad, depth) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 5), barkMat);
    m.position.y = len / 2; const holder = new THREE.Group(); holder.add(m); parent.add(holder);
    if (depth > 0) for (let k = 0; k < 2; k++) {
      const joint = new THREE.Group(); joint.position.y = len * rnd(0.7, 1); joint.rotation.set(rnd(-0.9, 0.9), rnd(0, 6), rnd(-0.9, 0.9)); holder.add(joint);
      branch(joint, len * 0.65, rad * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = ARENA_R + rnd(8.5, 11), tree = new THREE.Group();
    branch(tree, rnd(4, 6), 0.35, 3); tree.updateMatrixWorld(true);
    // Bake all the branches into a single mesh: one draw call per tree instead of dozens.
    const parts = []; tree.traverse((o) => { if (o.isMesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
    const merged = new THREE.Mesh(mergeGeometries(parts), barkMat); merged.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(merged);
  }

  // Night sky: a gradient dome glowing faintly toward the moon, with drifting clouds.
  const MOON_DIR = new THREE.Vector3(-55, 48, -40).normalize();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(175, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { moon: { value: MOON_DIR } },
    vertexShader: 'varying vec3 p; void main() { p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 moon; varying vec3 p;
      void main() {
        float up = clamp(p.y, 0.0, 1.0);
        vec3 c = mix(vec3(0.06, 0.04, 0.075), vec3(0.008, 0.007, 0.022), pow(up, 0.5));
        float m = max(dot(p, moon), 0.0);
        c += vec3(0.3, 0.24, 0.18) * pow(m, 60.0) + vec3(0.03, 0.025, 0.035) * pow(m, 6.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  dome.renderOrder = -1; scene.add(dome);
  const cloudTex = canvasTexture(256, 128, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = tnoise(x / w, y / h, 3, 5), fall = Math.sin((y / h) * Math.PI) * Math.sin((x / w) * Math.PI), a = clamp01((n - 0.42) * 3) * fall, i = (y * w + x) * 4;
      img.data[i] = 28; img.data[i + 1] = 24; img.data[i + 2] = 36; img.data[i + 3] = a * 220;
    }
    g.putImageData(img, 0, 0);
  });
  cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(rnd(60, 110), rnd(22, 36)), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: rnd(0.5, 0.9) }));
    const a = rnd(0, Math.PI * 2), el = rnd(0.25, 0.7), R = 140;
    cl.position.set(Math.cos(a) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(a) * Math.cos(el) * R); cl.lookAt(0, 0, 0); scene.add(cl);
  }

  // A big orange-tinged full moon and some stars.
  const moonTex = makePBR(256, 128, (u, v) => { const n = tnoise(u, v, 3, 5); return { h: n, c: mixc([170, 160, 140], [255, 246, 222], clamp01(n * 1.6 - 0.3)), r: 1 }; }, { wrap: true });
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(6, 48, 32), new THREE.MeshBasicMaterial({ map: moonTex.map, color: new THREE.Color(1.5, 1.45, 1.35), fog: false }));
  moonBall.position.set(-55, 48, -40); scene.add(moonBall);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.12, fog: false }));
  halo.position.copy(moonBall.position); scene.add(halo);
  const starPos = [];
  for (let i = 0; i < 700; i++) {
    const th = rnd(0, Math.PI * 2), ph = rnd(0.12, 1.4), R = 150;
    starPos.push(Math.cos(th) * Math.cos(ph) * R, Math.sin(ph) * R, Math.sin(th) * Math.cos(ph) * R);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false })));

  // Low mist creeping across the arena floor.
  const mistTex = canvasTexture(256, 256, (g, w, h) => {
    for (let i = 0; i < 40; i++) {
      const x = rnd(40, w - 40), y = rnd(40, h - 40), r = rnd(30, 70), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
  mistTex.wrapS = mistTex.wrapT = THREE.ClampToEdgeWrapping;
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x7a6aa8, transparent: true, opacity: 0.18, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    scene.add(m); mists.push({ m, a: rnd(0, 6.28), r: rnd(1, ARENA_R - 3), y: rnd(0.08, 0.5), sp: rnd(0.02, 0.06) * pick([1, -1]), spin: rnd(-0.05, 0.05) });
  }

  // Ghosts drifting over the stands.
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xeef4ff, emissive: 0x99aacc, emissiveIntensity: 0.5, transparent: true, opacity: 0.75 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let i = 0; i < 5; i++) {
    const gst = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), ghostMat); gst.add(head);
    const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.9, 16, 1, true), ghostMat); sheet.position.y = -0.45; gst.add(sheet);
    for (const ex of [-0.13, 0.13]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat); eye.position.set(ex, 0.12, 0.36); eye.scale.y = 1.6; gst.add(eye); }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat); mouth.position.set(0, -0.1, 0.37); mouth.scale.y = 1.4; gst.add(mouth);
    scene.add(gst); ghosts.push({ g: gst, a: rnd(0, 6.28), r: rnd(ARENA_R + 2, ARENA_R + 6), h: rnd(6, 9), sp: rnd(0.08, 0.16) * pick([1, -1]) });
  }
  // Bats flapping in circles above the arena.
  const batMat = new THREE.MeshBasicMaterial({ color: 0x0c0a10, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.45, 0.08, 0.05, 0.4, -0.05, -0.15, 0, 0, 0, 0.4, -0.05, -0.15, 0.08, -0.02, -0.2], 3));
  for (let i = 0; i < 14; i++) {
    const bat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), batMat); body.scale.z = 1.6; bat.add(body);
    const L = new THREE.Mesh(wingGeo, batMat), R = new THREE.Mesh(wingGeo, batMat); R.scale.x = -1; bat.add(L, R);
    scene.add(bat); bats.push({ g: bat, L, R, a: rnd(0, 6.28), r: rnd(4, 14), h: rnd(7, 13), sp: rnd(0.4, 0.9) * pick([1, -1]), fl: rnd(0, 6) });
  }
}
buildArena();
applySettings();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0);
function updateCrowd(t, dt) {
  crowd.cheer = Math.max(0, crowd.cheer - dt * 0.4);
  for (const c of crowd.base) {
    const y = c.y + 0.3 + Math.max(0, Math.sin(t * c.sp + c.ph)) * (0.04 + crowd.cheer * 0.35);
    _q.setFromAxisAngle(_yAxis, Math.atan2(c.x, c.z));
    _m.compose(_p.set(c.x, y, c.z), _q, _one); crowd.bodies.setMatrixAt(c.k, _m);
    _m.compose(_p.set(c.x, y + 0.45, c.z), _q, _one); crowd.heads.setMatrixAt(c.k, _m);
  }
  crowd.bodies.instanceMatrix.needsUpdate = crowd.heads.instanceMatrix.needsUpdate = true;
  for (const f of torches) f.material.emissiveIntensity = 1.3 + Math.random() * 0.9; // candles flicker inside the pumpkins
  for (const l of torchLights) l.intensity = 6 + Math.random() * 2.5;
  for (const o of ghosts) {
    o.a += o.sp * dt * (1 + crowd.cheer * 2);
    o.g.position.set(Math.cos(o.a) * o.r, o.h + Math.sin(t * 1.3 + o.r) * 0.4, Math.sin(o.a) * o.r);
    o.g.rotation.y = -o.a + (o.sp > 0 ? 0 : Math.PI);
  }
  for (const o of mists) {
    o.a += o.sp * dt; o.m.rotation.z += o.spin * dt;
    o.m.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(t * 0.3 + o.r) * 0.05, Math.sin(o.a) * o.r);
  }
  for (const b of bats) {
    b.a += b.sp * dt;
    b.g.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(t * 2 + b.fl) * 0.5, Math.sin(b.a) * b.r);
    b.g.rotation.y = -b.a + (b.sp > 0 ? Math.PI : 0);
    const flap = Math.sin(t * 18 + b.fl) * 0.7; b.L.rotation.z = flap; b.R.rotation.z = -flap;
  }
}

// ---------- knights ----------
const UP = new THREE.Vector3(0, 1, 0);
const unitCyl = (rTop, rBot) => { const g = new THREE.CylinderGeometry(rTop, rBot, 1, 20); g.translate(0, 0.5, 0); return g; };
// The torso is a surcoat over armour: a lathed shape with a chest, narrower waist and shoulders, flattened front-to-back.
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const torsoGeo = lathe([[0.001, 0], [0.175, 0], [0.168, 0.18], [0.178, 0.42], [0.212, 0.63], [0.222, 0.77], [0.205, 0.88], [0.14, 0.97], [0.075, 1], [0.001, 1]]); torsoGeo.scale(1, 1, 0.8);
const skirtGeo = lathe([[0.185, 0], [0.205, -0.15], [0.235, -0.36]]); skirtGeo.scale(1, 1, 0.85);
const GEO = {
  arm: unitCyl(0.055, 0.065), leg: unitCyl(0.07, 0.085), torso: torsoGeo, skirt: skirtGeo,
  vamb: unitCyl(0.066, 0.058), greave: unitCyl(0.08, 0.068),
  hand: new THREE.BoxGeometry(0.085, 0.1, 0.11), boot: new THREE.BoxGeometry(0.13, 0.09, 0.27), stump: new THREE.SphereGeometry(0.075, 10, 8),
  head: new THREE.CylinderGeometry(HEAD_R * 1.0, HEAD_R * 1.07, HEAD_R * 2.1, 28), helmTop: new THREE.SphereGeometry(HEAD_R * 1.0, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  slit: new THREE.BoxGeometry(HEAD_R * 1.5, 0.014, 0.03), strip: new THREE.BoxGeometry(0.026, HEAD_R * 1.7, 0.016), band: new THREE.TorusGeometry(HEAD_R * 1.04, 0.01, 6, 28),
  crest: new THREE.BoxGeometry(0.03, 0.09, HEAD_R * 2.2), hole: new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6),
  pauldron: new THREE.SphereGeometry(0.105, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), belt: new THREE.CylinderGeometry(0.185, 0.185, 0.06, 24),
  buckle: new THREE.BoxGeometry(0.07, 0.06, 0.02), knee: new THREE.SphereGeometry(0.06, 14, 10), rim: new THREE.TorusGeometry(HEAD_R + 0.015, 0.012, 8, 28),
  plume: new THREE.ConeGeometry(0.04, 0.2, 8), eye: new THREE.SphereGeometry(0.022, 8, 6), deadEye: new THREE.BoxGeometry(0.045, 0.01, 0.01),
  mouth: new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI),
};
const STEEL = pbrMat(TEX.steel, { metalness: 0.9, color: 0xd0d4da });
const MAT = {
  steel: STEEL, darkSteel: pbrMat(TEX.steel, { metalness: 0.85, color: 0x707680 }), mail: pbrMat(TEX.mail, { metalness: 0.8, color: 0xd8dbe0 }),
  slot: new THREE.MeshBasicMaterial({ color: 0x050505 }), grip: pbrMat(TEX.leather), brass: pbrMat(TEX.steel, { metalness: 0.9, color: 0xc8a050 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xe8cba8, roughness: 0.8 }), pants: new THREE.MeshStandardMaterial({ color: 0x3b2c4a }),
  boot: new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 }), leather: pbrMat(TEX.leather, { color: 0x8a6a50 }),
  iron: STEEL, stump: new THREE.MeshStandardMaterial({ color: 0x8a0f14, roughness: 0.35 }),
  face: new THREE.MeshStandardMaterial({ color: 0xffe0bd }), eye: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  gold: pbrMat(TEX.steel, { metalness: 0.95, color: 0xd9b048 }), wood: pbrMat(TEX.grain),
};
// Each weapon is a group whose origin is the grip, pointing up +y along its reach.
// userData.glowMat is the part that glows while drawing back.
function makeWeapon(id) {
  const W = WEAPONS[id] || WEAPONS.longsword, L = W.len, g = new THREE.Group();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const steel = () => pbrMat(TEX.steel, { metalness: 0.92, color: 0xe4e8ee });
  const add = (geo, mat, y = 0, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 10);
  // A real blade: tapered, pointed and bevelled to an edge.
  const blade = (w, len, thick = 0.008, tip = 0.16) => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(-w * 0.38, len * (1 - tip)); sh.lineTo(0, len); sh.lineTo(w * 0.38, len * (1 - tip)); sh.lineTo(w / 2, 0); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: thick * 0.4, bevelEnabled: true, bevelThickness: thick * 0.5, bevelSize: w * 0.22, bevelSegments: 2, curveSegments: 1 });
    geo.translate(0, 0, -thick * 0.2); geo.computeVertexNormals(); return geo;
  };
  const guard = (w) => new THREE.CapsuleGeometry(0.018, w, 3, 8).rotateZ(Math.PI / 2);
  const grip = () => { add(cyl(0.02, 0.17), MAT.grip, -0.08); add(new THREE.SphereGeometry(0.032, 12, 8), MAT.steel, -0.17); };
  let glow;
  switch (id) {
    case 'greatsword': glow = steel(); add(blade(0.075, L, 0.012), glow, 0.03); add(guard(0.32), MAT.steel, 0.01); add(cyl(0.022, 0.3), MAT.grip, -0.15); add(new THREE.SphereGeometry(0.04, 12, 8), MAT.steel, -0.31); break;
    case 'dagger': glow = steel(); add(blade(0.045, L, 0.007, 0.3), glow, 0.02); add(guard(0.1), MAT.brass, 0.01); grip(); break;
    case 'axe': glow = steel(); add(cyl(0.022, L + 0.2), MAT.wood, L / 2 - 0.1); add(box(0.24, 0.2, 0.025), glow, L - 0.1, 0.12); break;
    case 'hammer': glow = std(0x777777, { metalness: 0.6 }); add(cyl(0.024, L + 0.35), MAT.wood, L / 2 - 0.18); add(box(0.3, 0.15, 0.15), glow, L - 0.08); break;
    case 'spear': glow = steel(); add(cyl(0.02, L + 0.4), MAT.wood, L / 2 - 0.3); add(new THREE.ConeGeometry(0.045, 0.26, 6), glow, L - 0.02); break;
    case 'scythe': {
      glow = std(0xbfc6cc, { metalness: 0.8, roughness: 0.3 }); add(cyl(0.022, L + 0.5), std(0x3a2a1a), L / 2 - 0.25);
      const b = add(box(0.55, 0.06, 0.012), glow, L - 0.05, 0.26); b.rotation.z = -0.25; break;
    }
    case 'chicken': {
      glow = std(0xffd23f, { roughness: 0.7 });
      const body = add(new THREE.SphereGeometry(0.1, 14, 10), glow, L * 0.55); body.scale.set(0.8, 2.6, 0.9);
      add(new THREE.SphereGeometry(0.06, 12, 8), glow, L * 0.55 + 0.3);
      add(box(0.02, 0.07, 0.06), std(0xe0302e), L * 0.55 + 0.37);
      const beak = add(new THREE.ConeGeometry(0.02, 0.06, 6), std(0xff8c1a), L * 0.55 + 0.3, 0, -0.07); beak.rotation.x = -Math.PI / 2;
      add(cyl(0.012, 0.2), std(0xff8c1a), 0.02, 0.025); add(cyl(0.012, 0.2), std(0xff8c1a), 0.02, -0.025);
      break;
    }
    case 'baguette': {
      glow = std(0xd9a35b, { roughness: 0.9 }); add(new THREE.CapsuleGeometry(0.045, L, 6, 12), glow, L / 2 - 0.05);
      for (let k = 1; k < 5; k++) { const c = add(box(0.06, 0.012, 0.02), std(0xf3d9a6), (L * k) / 5, 0, -0.042); c.rotation.z = 0.5; }
      break;
    }
    case 'trout': {
      glow = std(0x7fb3a6, { roughness: 0.35, metalness: 0.3 });
      const body = add(new THREE.SphereGeometry(0.1, 14, 10), glow, L * 0.55); body.scale.set(0.55, 3, 1.1);
      const tail = add(new THREE.ConeGeometry(0.08, 0.12, 4), glow, 0.04); tail.rotation.x = Math.PI;
      add(new THREE.SphereGeometry(0.015, 6, 4), MAT.eye, L * 0.55 + 0.22, 0.05, -0.03); add(new THREE.SphereGeometry(0.015, 6, 4), MAT.eye, L * 0.55 + 0.22, -0.05, -0.03);
      break;
    }
    case 'pan': {
      glow = std(0x2a2a2a, { metalness: 0.7, roughness: 0.4 }); add(cyl(0.02, 0.32), std(0x111111), 0.12);
      const disc = add(new THREE.CylinderGeometry(0.17, 0.15, 0.04, 20), glow, L - 0.12); disc.rotation.z = Math.PI / 2; // flat face toward the target
      break;
    }
    case 'fists': glow = std(0xd8261f, { roughness: 0.4 }); add(new THREE.SphereGeometry(0.1, 14, 10), glow, 0.03).scale.set(1, 1.15, 1); break;
    case 'excalibur': glow = pbrMat(TEX.steel, { metalness: 0.95, color: 0xffe08a, emissive: 0x332200 }); add(blade(0.06, L, 0.01), glow, 0.03); add(guard(0.28), MAT.gold, 0.01); add(new THREE.SphereGeometry(0.03, 8, 6), std(0x3fa7ff, { emissive: 0x1050ff }), 0.01, 0, -0.03); grip(); break;
    default: glow = steel(); add(blade(0.05, L, 0.009), glow, 0.03); add(guard(0.22), MAT.steel, 0.01); grip();
  }
  g.userData.glowMat = glow; g.userData.baseEmissive = glow.emissive.clone();
  return g;
}
// A closed great helm with a visor slit, breathing holes and a crest in the team colour.
function makeHead(color, dead = false) {
  const g = new THREE.Group(), add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(GEO.head, STEEL.clone(), 0, -0.02); // child 0: the helm shell (takes bruise/damage tint)
  add(GEO.helmTop, STEEL, 0, HEAD_R * 1.03).scale.y = 0.42;
  add(GEO.slit, MAT.slot, 0, 0.025, -HEAD_R * 1.0);
  add(GEO.strip, MAT.darkSteel, 0, -0.03, -HEAD_R * 1.04);
  const band = add(GEO.band, MAT.darkSteel, 0, 0.05); band.rotation.x = Math.PI / 2;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const h = add(GEO.hole, MAT.slot, 0.035 + c * 0.022, -0.045 - r * 0.025, -HEAD_R * 1.02); h.rotation.x = Math.PI / 2; }
  const crest = add(GEO.crest, pbrMat({ normalMap: TEX.cloth.normalMap }, { color, roughness: 0.9 }), 0, HEAD_R * 1.35 + 0.03); crest.castShadow = true;
  if (dead) g.rotation.z = 0.2;
  g.traverse((o) => { o.castShadow = true; });
  g.userData.mouth = new THREE.Object3D();
  return g;
}
const _d = new THREE.Vector3();
function seg(mesh, a, b) {
  _d.subVectors(b, a); const l = _d.length();
  mesh.position.copy(a); mesh.scale.set(1, Math.max(l, 1e-3), 1);
  if (l > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(l));
}

// Surcoat colour map: the team colour with a white cross on the chest (and a hem stripe on the skirt).
const surcoatTex = (color, skirt) => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = new THREE.Color(color).getStyle(); g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0.02, 0.06)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4)); }
  g.fillStyle = '#efe8d8';
  if (skirt) { g.fillRect(0, h - 22, w, 10); return; }
  g.fillRect(w * 0.5 - 9, h * 0.18, 18, h * 0.42); g.fillRect(w * 0.5 - 34, h * 0.28, 68, 16); // the cross sits on the front (u = 0.5)
});
const _qYaw = new THREE.Quaternion();
class Knight {
  constructor(color) {
    this.color = color;
    this.root = new THREE.Group(); scene.add(this.root);
    const teamMat = pbrMat({ map: surcoatTex(TEAM[color], false), normalMap: TEX.cloth.normalMap, roughnessMap: TEX.cloth.roughnessMap }, { normalScale: new THREE.Vector2(0.4, 0.4) });
    teamMat.map.wrapS = teamMat.map.wrapT = THREE.ClampToEdgeWrapping; teamMat.map.repeat.set(1, 1);
    const m = (geo, mat) => { const x = new THREE.Mesh(geo, mat); x.castShadow = true; this.root.add(x); return x; };
    this.torso = m(GEO.torso, teamMat);
    // Each body part gets its own material so it can bruise as it takes damage.
    this.mats = { armR: MAT.mail.clone(), armL: MAT.mail.clone(), legR: MAT.mail.clone(), legL: MAT.mail.clone(), head: null, torso: teamMat };
    this.head = makeHead(TEAM[color]); this.mats.head = this.head.children[0].material; this.head.rotation.order = 'YXZ'; this.root.add(this.head);
    for (const k in this.mats) this.mats[k].userData.base = this.mats[k].color.clone();
    this.armR = m(GEO.arm, this.mats.armR); this.armL = m(GEO.arm, this.mats.armL);
    this.vambR = m(GEO.vamb, STEEL); this.vambL = m(GEO.vamb, STEEL);
    this.handR = m(GEO.hand, STEEL); this.handL = m(GEO.hand, STEEL);
    this.legs = ['R', 'L'].map((s) => ({ thigh: m(GEO.leg, this.mats['leg' + s]), shin: m(GEO.greave, STEEL), boot: m(GEO.boot, MAT.darkSteel) }));
    this.stumps = [0, 1, 2, 3, 4].map(() => m(GEO.stump, MAT.stump));
    this.skirt = m(GEO.skirt, pbrMat({ map: surcoatTex(TEAM[color], true), normalMap: TEX.cloth.normalMap, roughnessMap: TEX.cloth.roughnessMap }, { side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.4, 0.4) }));
    // Armour bits: shoulder plates, a belt with a gold buckle, and knee guards.
    const plate = STEEL;
    this.pauldR = m(GEO.pauldron, plate); this.pauldL = m(GEO.pauldron, plate);
    this.belt = m(GEO.belt, MAT.leather); this.buckle = m(GEO.buckle, MAT.brass);
    this.knees = [m(GEO.knee, MAT.iron), m(GEO.knee, MAT.iron)];
    this.weaponId = 'longsword'; this.sword = makeWeapon(this.weaponId); this.root.add(this.sword);
  }
  update(p, sk, firstPerson) {
    const cut = (k) => p.parts[k].cut;
    // Bruising: damaged parts go purple, and blunt-weapon bruising darkens the body too.
    for (const [k, mat] of Object.entries(this.mats)) {
      const hurt = Math.min(1, 1 - p.parts[k].hp / PART_MAX[k] + (k === 'torso' ? (p.bruise || 0) * 0.15 : 0));
      mat.color.copy(mat.userData.base).lerp(BRUISE, hurt * 0.75);
    }
    // Fall over when dead (unless the headless body is still sprinting around).
    const running = p.headless && p.deathT < 2.6 && (!cut('legR') || !cut('legL'));
    const fallK = p.dead && !running ? Math.min(1, (p.headless ? p.deathT - 2.6 : p.deathT) / 0.5) : 0;
    this.root.position.set(0, 0, 0); this.root.quaternion.identity();
    if (fallK > 0) {
      const pivot = new THREE.Vector3(p.x, p.y, p.z), f = forward(p.yaw);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(f[2], 0, -f[0]).normalize(), fallK * 1.5); // topple backwards
      this.root.quaternion.copy(q);
      this.root.position.copy(pivot).sub(pivot.clone().applyQuaternion(q));
      this.root.position.y += 0.05 * fallK;
    }
    const P = {};
    for (const [k, v] of Object.entries(sk)) if (Array.isArray(v) && v.length === 3) P[k] = V(v);
    this.torso.visible = this.belt.visible = this.buckle.visible = this.skirt.visible = !firstPerson;
    seg(this.torso, P.hip, P.neck); this.torso.quaternion.multiply(_qYaw.setFromAxisAngle(UP, p.yaw)); // keep the chest facing forward
    this.skirt.position.copy(P.hip); this.skirt.quaternion.copy(this.torso.quaternion);
    const up = P.neck.clone().sub(P.hip).normalize(), f = forward(p.yaw), fw = new THREE.Vector3(f[0], 0, f[2]);
    this.belt.position.copy(P.hip).addScaledVector(up, 0.07); this.belt.quaternion.copy(this.torso.quaternion);
    this.buckle.position.copy(this.belt.position).addScaledVector(fw, 0.185); this.buckle.rotation.set(0, p.yaw, 0);
    for (const [pd, key, sh] of [[this.pauldR, 'armR', P.shR], [this.pauldL, 'armL', P.shL]]) {
      pd.visible = !firstPerson && !cut(key); if (!pd.visible) continue;
      pd.position.copy(sh).addScaledVector(up, 0.02); pd.quaternion.copy(this.torso.quaternion); pd.scale.set(1.05, 0.8, 1.05);
    }
    for (const [arm, hand, key, sh, hk] of [[this.armR, this.handR, 'armR', P.shR, P.handR], [this.armL, this.handL, 'armL', P.shL, P.handL]]) {
      const vamb = arm === this.armR ? this.vambR : this.vambL;
      arm.visible = hand.visible = vamb.visible = !cut(key);
      if (!cut(key)) { seg(arm, sh, hk); seg(vamb, sh.clone().lerp(hk, 0.5), hk.clone().lerp(sh, 0.08)); hand.position.copy(hk); hand.quaternion.copy(arm.quaternion); }
    }
    [['legR', 'hipR', 'kneeR', 'footR'], ['legL', 'hipL', 'kneeL', 'footL']].forEach(([key, h, kn, ft], i) => {
      // In first person your legs are hidden, except the one you're kicking with, so you see the kick land.
      const kickLeg = cut('legR') ? 'legL' : 'legR', on = (!firstPerson || (p.state === 'kick' && key === kickLeg)) && !cut(key);
      const L = this.legs[i];
      L.thigh.visible = L.shin.visible = L.boot.visible = this.knees[i].visible = on;
      if (on && firstPerson) L.thigh.visible = this.knees[i].visible = false; // the thigh would fill the screen
      if (!on) return;
      seg(L.thigh, P[h], P[kn]); seg(L.shin, P[kn], P[ft].clone().lerp(P[kn], 0.1));
      this.knees[i].position.copy(P[kn]).addScaledVector(new THREE.Vector3(sk.f[0], 0, sk.f[2]), 0.04);
      L.boot.position.set(P[ft].x + sk.f[0] * 0.06, P[ft].y + 0.05, P[ft].z + sk.f[2] * 0.06); L.boot.rotation.y = p.yaw;
    });
    [['head', P.neck], ['armR', P.shR], ['armL', P.shL], ['legR', P.hipR], ['legL', P.hipL]].forEach(([k, pos], i) => {
      const s = this.stumps[i]; s.visible = cut(k) && !(firstPerson && (k === 'head' || k.startsWith('leg'))); if (!s.visible) return;
      s.position.copy(pos);
      if (Math.random() < (p.dead ? 0.15 : 0.5)) blood.spawn(pos.clone().applyQuaternion(this.root.quaternion).add(this.root.position), new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.8, 2.4), rnd(-0.6, 0.6)));
    });
    this.head.visible = !firstPerson && !cut('head');
    if (this.head.visible) {
      this.head.position.copy(P.head);
      this.head.rotation.set(p.dead ? 0 : p.pitch * 0.6, p.yaw, 0);
      this.head.userData.mouth.scale.setScalar(p.state === 'active' || p.stun > 0 ? 1.8 : 1);
    }
    if (p.weapon && p.weapon !== this.weaponId) {
      this.root.remove(this.sword); this.weaponId = p.weapon; this.sword = makeWeapon(p.weapon); this.root.add(this.sword);
    }
    this.sword.visible = !!sk.tip && !wheel.hiding();
    if (sk.tip) {
      this.sword.position.copy(P.hand);
      // Orient the model like the hitbox: +y along the weapon, +x along its edge.
      const d = V(sk.wdir), e = V(sk.wedge);
      this.sword.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(e, d, new THREE.Vector3().crossVectors(e, d)));
      // Drawn-back blades glow in their direction's colour, and white once the attack is heavy.
      const em = this.sword.userData.glowMat.emissive;
      // Only a charged heavy glows; which side they're on has to be read from the weapon itself.
      if (isHeavy(p)) em.set(0xffffff);
      else em.copy(this.sword.userData.baseEmissive);
    }
  }
  dispose() { scene.remove(this.root); }
}
const knights = new Map();
const BRUISE = new THREE.Color(0x3a0c10); // battered: dark, bloodied

// ---------- blood, decals and flying limbs ----------
const blood = (() => {
  const MAX = 3000, pos = new Float32Array(MAX * 3).fill(-99), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = canvasTexture(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, 7); g.fill(); });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc0141f, size: 0.035, map: dot, alphaTest: 0.5 }));
  pts.frustumCulled = false; scene.add(pts);
  const DMAX = 600, decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a0f0f, transparent: true, opacity: 0.85, depthWrite: false }), DMAX);
  decals.count = 0; decals.frustumCulled = false; scene.add(decals);
  let next = 0, dnext = 0;
  return {
    spawn(p, v) { const i = next = (next + 1) % MAX; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z; life[i] = rnd(0.8, 1.6); },
    burst(p, n, dir, power = 1) {
      for (let k = 0; k < n; k++) this.spawn(p, new THREE.Vector3(dir.x * rnd(0.5, 3) * power + rnd(-1.5, 1.5), rnd(0.5, 4) * power, dir.z * rnd(0.5, 3) * power + rnd(-1.5, 1.5)));
    },
    decal(x, z, s) {
      const d = dnext; dnext = (dnext + 1) % DMAX;
      _m.compose(_p.set(x, 0.004 + d * 2e-6, z), _q.identity(), new THREE.Vector3(s, 1, s * rnd(0.6, 1)));
      decals.setMatrixAt(d, _m); decals.count = Math.max(decals.count, d + 1); decals.instanceMatrix.needsUpdate = true;
    },
    clearDecals() { decals.count = 0; dnext = 0; },
    step(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt; vel[i * 3 + 1] -= 14 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] <= 0 || life[i] <= 0) {
          if (pos[i * 3 + 1] <= 0 && Math.random() < 0.35) this.decal(pos[i * 3], pos[i * 3 + 2], rnd(0.03, 0.12));
          life[i] = 0; pos[i * 3 + 1] = -99;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
})();

const gibs = [];
function spawnGib(ev) {
  const g = new THREE.Group(), kind = ev.part === 'head' ? 'head' : ev.part.startsWith('arm') ? 'arm' : 'leg';
  let radius = 0.08;
  if (kind === 'head') { g.add(makeHead(TEAM[ev.color], true)); radius = HEAD_R; g.rotation.y = ev.yaw; }
  else {
    const len = kind === 'arm' ? ARM : LEG;
    const limb = new THREE.Mesh(kind === 'arm' ? GEO.arm : GEO.leg, MAT.mail);
    limb.scale.y = len; limb.position.y = -len / 2; limb.castShadow = true; g.add(limb);
    const st = new THREE.Mesh(GEO.stump, MAT.stump); st.position.y = len / 2; g.add(st);
    const end = new THREE.Mesh(kind === 'arm' ? GEO.hand : GEO.boot, kind === 'arm' ? MAT.steel : MAT.darkSteel); end.position.y = -len / 2; g.add(end);
    if (ev.sword) { const s = makeWeapon(ev.weapon); s.position.y = -len / 2; s.rotation.z = Math.PI / 2; g.add(s); }
  }
  g.position.copy(V(ev.pos)); scene.add(g);
  const b = { g, kind, radius, vel: V(ev.vel), spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), life: 0, rest: false };
  gibs.push(b);
  return b;
}
function stepGibs(dt) {
  for (const b of gibs) {
    b.life += dt;
    if (b.rest) continue;
    b.vel.y -= 14 * dt;
    b.g.position.addScaledVector(b.vel, dt);
    const w = b.spin.length();
    if (w > 0.01) b.g.quaternion.premultiply(_q.setFromAxisAngle(_d.copy(b.spin).divideScalar(w), w * dt));
    if (b.life < 1.6 && Math.random() < 0.8) blood.spawn(b.g.position, new THREE.Vector3(rnd(-0.5, 0.5), rnd(0, 1.5), rnd(-0.5, 0.5)));
    if (b.g.position.y < b.radius) {
      b.g.position.y = b.radius;
      if (Math.abs(b.vel.y) > 1.5) { audio.boing(2.4, 0.04); blood.decal(b.g.position.x, b.g.position.z, 0.2); }
      b.vel.y *= -0.35; b.vel.x *= 0.6; b.vel.z *= 0.6; b.spin.multiplyScalar(0.6);
      if (Math.abs(b.vel.y) < 0.6 && Math.hypot(b.vel.x, b.vel.z) < 0.3) b.rest = true;
    }
    const r = Math.hypot(b.g.position.x, b.g.position.z);
    if (r > ARENA_R) { b.g.position.x *= ARENA_R / r; b.g.position.z *= ARENA_R / r; b.vel.x *= -0.5; b.vel.z *= -0.5; }
  }
}
function clearGibs() { for (const b of gibs) scene.remove(b.g); gibs.length = 0; }

// ---------- settings menu ----------
// Opens from the start screen's Settings button, or with Esc during a fight (Esc frees the mouse,
// and the menu appears). "Back to the fight" grabs the mouse again.
const MENU = [
  ['Controls'],
  ['sens', 'Mouse sensitivity', 'range', [0.2, 3, 0.05, '×']],
  ['fov', 'Field of view', 'range', [60, 110, 1, '°']],
  ['Sound'],
  ['music', 'Music volume', 'range', [0, 100, 1, '%']],
  ['sfx', 'Sound effects volume', 'range', [0, 100, 1, '%']],
];
const menu = (() => {
  const root = $('menu'), rows = $('menuRows'), inputs = {}, startAA = S.aa > 0;
  for (const [key, label, kind, opt] of MENU) {
    if (!label) { const h = document.createElement('h3'); h.textContent = key; rows.append(h); continue; }
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label'); lab.textContent = label; lab.htmlFor = 'set-' + key; row.append(lab);
    let el, val = null;
    if (kind === 'select') { el = document.createElement('select'); for (const [v, t] of opt) el.add(new Option(t, String(v))); }
    else if (kind === 'check') { el = document.createElement('input'); el.type = 'checkbox'; }
    else { el = document.createElement('input'); el.type = 'range'; [el.min, el.max, el.step] = opt; val = document.createElement('span'); val.className = 'val'; }
    el.id = 'set-' + key; row.append(el); if (val) row.append(val);
    inputs[key] = { el, kind, val, unit: opt && opt[3] };
    el.addEventListener(kind === 'range' ? 'input' : 'change', () => {
      const v = kind === 'check' ? el.checked : kind === 'select' && key === 'preset' ? el.value : Number(el.value);
      if (key === 'preset') { if (v !== 'Custom') { S.auto = false; setPreset(v); } return; }
      S[key] = v;
      if (GFX_KEYS.includes(key)) { S.auto = false; S.preset = Object.keys(PRESETS).find((n) => GFX_KEYS.every((k) => PRESETS[n][k] === S[k])) || 'Custom'; }
      saveSettings(); applySettings(); refresh();
    });
    rows.append(row);
  }
  function refresh() {
    for (const [key, { el, kind, val, unit }] of Object.entries(inputs)) {
      if (kind === 'check') el.checked = !!S[key]; else el.value = String(S[key]);
      if (val) val.textContent = (key === 'sens' ? Number(S[key]).toFixed(2) : S[key]) + unit;
    }
    // The plain (no effects) view gets its smooth edges from the browser, which only changes on reload.
    $('aaNote').textContent = !useComposer() && (S.aa > 0) !== startAA ? 'Anti-aliasing will switch over next time you load the page.' : '';
  }
  const open = () => { refresh(); root.classList.add('open'); keys.clear(); blockHeld = false; if (atkHeld) { atkHeld = false; send({ t: 'release' }); } $('menuClose').textContent = joined ? 'Back to the fight' : 'Done'; $('menuLeave').style.display = joined ? '' : 'none'; };
  const close = () => root.classList.remove('open');
  $('menuClose').onclick = () => { if (joined) lockPointer(); else close(); };
  $('gear').onclick = open;
  // Leaving frees your spot (the first person watching steps in) and takes you back to the start screen.
  $('menuLeave').onclick = () => { leaving = true; music.stop(); if (ws) ws.close(); location.reload(); };
  document.addEventListener('pointerlockchange', () => { if (locked()) close(); else if (joined) open(); });
  return { open, close, refresh, isOpen: () => root.classList.contains('open') };
})();

// ---------- network ----------
let ws = null, myId = null, connected = false, leaving = false;
let prev = null, cur = null, prevT = 0, curT = 0, mySpawn = -1;
function connect(name, room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);
  ws.onopen = () => { connected = true; send({ t: 'ping', c: performance.now() }); };
  ws.onclose = () => { connected = false; if (!leaving) setTimeout(() => connect(name, room), 1500); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; return; }
    if (m.t === 'pong') { const r = performance.now() - m.c; pred.rtt = pred.rtt === null ? r : pred.rtt * 0.8 + r * 0.2; return; }
    if (m.t === 's') {
      prev = cur; prevT = curT; cur = m; curT = performance.now(); netBuffer.push(m, curT);
      const me = m.players.find((p) => p && p.id === myId);
      pred.correct(me, m.phase, curT);
      if (me && me.spawn !== mySpawn) { mySpawn = me.spawn; look.yaw = me.yaw; look.pitch = 0; }
      for (const ev of m.ev) handleEvent(ev);
    }
  };
}
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- input: Last Oasis-style mouse direction ----------
// Moving the mouse picks a side (left / right / up) that sticks until you move another way.
// Hold left click to draw back on that side, keep steering, release to swing.
// Hold right click and steer toward the incoming blade to block. Right click during a draw feints.
const keys = new Set();
const look = { yaw: 0, pitch: 0 };
const flick = { x: 0, y: 0 };
// The weapon trails a little behind when you turn, then settles.
let turnPush = 0, turnLag = 0;
let atkHeld = false, blockHeld = false, dir = 'right';
const locked = () => document.pointerLockElement === glCanvas;
function lockPointer() { try { const r = glCanvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} }
addEventListener('keydown', (e) => {
  // Esc normally just frees the mouse (which opens the menu); if the mouse wasn't captured, it toggles the menu.
  // Browsers won't let Esc grab the mouse back, so in a fight closing the menu leaves a "click to fight" prompt.
  if (e.code === 'Escape' && !locked()) { if (menu.isOpen()) menu.close(); else menu.open(); return; }
  if (e.target.tagName === 'INPUT' || menu.isOpen()) return;
  keys.add(e.code);
  if (e.code === 'KeyM' && !e.repeat) audio.muted = !audio.muted;
  if ((e.code === 'KeyF' || e.code === 'KeyE') && !e.repeat) send({ t: 'kick' });
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); blockHeld = false; if (atkHeld) { atkHeld = false; send({ t: 'release' }); } });
addEventListener('contextmenu', (e) => joined && e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked()) return;
  // The camera turns slower while you're drawing or blocking, so steering the weapon doesn't spin you around.
  const s = (atkHeld || isBlocking() ? 0.0011 : 0.0023) * S.sens;
  look.yaw -= e.movementX * s; turnPush += e.movementX * s;
  look.pitch = Math.max(-1.3, Math.min(1.3, look.pitch - e.movementY * s));
  flick.x += e.movementX; flick.y += e.movementY;
  const ax = Math.abs(flick.x), ay = Math.abs(flick.y);
  if (Math.max(ax, ay) > 14) {
    if (ax > ay) dir = flick.x < 0 ? 'left' : 'right';
    else if (flick.y < 0) dir = 'over';
    flick.x = flick.y = 0;
  }
});
addEventListener('mousedown', (e) => {
  if (!joined || menu.isOpen()) return;
  audio.init();
  if (!locked()) { lockPointer(); return; }
  if (e.button === 0) { atkHeld = true; send({ t: 'hold', d: dir }); }
  if (e.button === 2) blockHeld = true;
  if (e.button === 3 || e.button === 4) send({ t: 'kick' });
});
addEventListener('mouseup', (e) => {
  if (e.button === 0 && atkHeld) { atkHeld = false; send({ t: 'release' }); }
  if (e.button === 2) blockHeld = false;
});
const isBlocking = () => blockHeld || keys.has('ShiftLeft') || keys.has('ShiftRight');

const moveFwd = () => (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
const moveSide = () => (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
let lastSent = '', lastSentT = 0;
function sendInput(dt) {
  const k = Math.exp(-dt * 12); flick.x *= k; flick.y *= k;
  const o = {
    t: 'in', mf: moveFwd(), ms: moveSide(),
    j: keys.has('Space'), b: isBlocking(), yaw: Math.round(look.yaw * 1000) / 1000, pitch: Math.round(look.pitch * 1000) / 1000, d: dir,
  };
  const s = JSON.stringify(o), now = performance.now();
  if ((s !== lastSent && now - lastSentT > 30) || now - lastSentT > 100) { send(o); lastSent = s; lastSentT = now; }
}

// ---------- events ----------
let shake = 0, hurtFlash = 0, myHeadGib = null;
const findP = (id) => cur && cur.players.find((p) => p && p.id === id);

function handleEvent(ev) {
  const p = findP(ev.id), mine = ev.id === myId;
  switch (ev.t) {
    case 'swing': audio.whoosh(ev.dir); if (ev.heavy) audio.thud(); break;
    case 'hit':
      // No pop-up numbers or words: how good a hit was shows in the blood, the sound and the shake.
      // A sweet-spot hit sprays more and lands with a heavy thud; a handle or shaft hit barely bleeds.
      blood.burst(V(ev.pos), ev.zm >= 1.25 ? 45 : ev.zm < 0.6 ? 8 : 22, new THREE.Vector3(ev.dir[0], 0, ev.dir[1]), ev.zm >= 1.25 ? 1.3 : 1);
      audio.hitFor(ev.weapon); if (ev.zm >= 1.25) audio.thud();
      if (ev.weapon === 'baguette') for (let k = 0; k < 25; k++) sparks.spawn(V(ev.pos));
      if (mine) { shake = ev.zm >= 1.25 ? 0.1 : 0.06; hurtFlash = ev.zm >= 1.25 ? 0.7 : 0.5; }
      crowd.cheer = Math.min(1, crowd.cheer + 0.25);
      break;
    case 'sever': {
      const gib = spawnGib(ev); if (mine && ev.part === 'head') myHeadGib = gib;
      blood.burst(V(ev.pos), 70, V(ev.vel).normalize(), 1.4); audio.squelch(); audio.cheer();
      crowd.cheer = 1;
      if (mine) { shake = 0.12; hurtFlash = 1; }
      break;
    }
    case 'parry': audio.clang(); if (ev.by === myId) shake = 0.05;
      for (let i = 0; i < 20; i++) sparks.spawn(V(ev.pos));
      break;
    case 'chamber': audio.clang(); audio.clang();
      for (let i = 0; i < 30; i++) sparks.spawn(V(ev.pos));
      break;
    case 'guardbreak': audio.thud(); if (mine) shake = 0.08; break;
    case 'kickSwing': audio.whoosh('low'); break;
    case 'kickMiss': audio.whoosh('low'); if (mine) shake = 0.05; break;
    case 'kick': audio.thud(); if (mine) { shake = 0.1; hurtFlash = 0.4; } break;
    case 'death': audio.slide(); break;
    case 'jump': if (mine) audio.boing(1); break;
    case 'hop': audio.boing(1.6, mine ? 0.12 : 0.06); break;
    case 'roundEnd': audio.cheer(); crowd.cheer = 1; break;
    case 'round': audio.howl(); clearGibs(); blood.clearDecals(); myHeadGib = null; break;
    case 'spin': wheel.start(ev); break;
  }
}

const sparks = (() => {
  const list = [], mat = new THREE.MeshBasicMaterial({ color: 0xfff7a8 }), geo = new THREE.SphereGeometry(0.015, 4, 3);
  return {
    spawn(p) { const m = new THREE.Mesh(geo, mat); m.position.copy(p); scene.add(m); list.push({ m, v: new THREE.Vector3(rnd(-4, 4), rnd(-1, 4), rnd(-4, 4)), life: 0.35 }); },
    step(dt) { for (let i = list.length - 1; i >= 0; i--) { const s = list[i]; s.life -= dt; s.v.y -= 10 * dt; s.m.position.addScaledVector(s.v, dt); if (s.life <= 0) { scene.remove(s.m); list.splice(i, 1); } } },
  };
})();

// ---------- interpolation ----------
// Smooth movement over a bumpy connection: keep a short buffer of server updates and draw the world
// slightly in the past, blending between the two updates either side of that moment. How far in the
// past adapts to how jittery the connection is, so a steady wired link stays snappy and Wi-Fi stays smooth.
const netBuffer = {
  snaps: [], offset: null, jitter: 0, delay: 70,
  push(m, now) {
    if (typeof m.n !== 'number') return;
    const st = (m.n / 60) * 1000, lag = now - st;
    // offset tracks the fastest arrival seen, creeping up slowly so clock drift can't strand it
    this.offset = this.offset === null ? lag : Math.min(lag, this.offset + 2);
    const j = lag - this.offset;
    this.jitter = j > this.jitter ? j : this.jitter * 0.97 + j * 0.03;
    this.delay += (Math.min(250, Math.max(45, this.jitter * 1.5 + 40)) - this.delay) * 0.1;
    this.snaps.push({ t: st, m });
    while (this.snaps.length > 2 && this.snaps[1].t < st - 1000) this.snaps.shift();
  },
};
function blendPlayer(q, p, k) {
  if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 2 || q.spawn !== p.spawn) return p; // teleported (new round): don't slide
  const L = (a, b) => a + (b - a) * k;
  const dy = Math.atan2(Math.sin(p.yaw - q.yaw), Math.cos(p.yaw - q.yaw));
  const out = { ...(k < 0.5 ? q : p), x: L(q.x, p.x), y: L(q.y, p.y), z: L(q.z, p.z), yaw: q.yaw + dy * k, walk: L(q.walk, p.walk), stun: L(q.stun, p.stun), deathT: L(q.deathT, p.deathT) };
  // swing timers only blend within the same move; across a change of move, take the newer one
  if (q.state === p.state) out.st = L(q.st, p.st); else { out.state = p.state; out.st = p.st; out.sdir = p.sdir; out.heavy = p.heavy; }
  out.parts = p.parts; out.dead = p.dead; out.weapon = p.weapon; out.blocking = p.blocking; out.gdir = p.gdir;
  return out;
}
function interpPlayers() {
  if (!cur) return [];
  const B = netBuffer;
  if (B.offset === null || B.snaps.length < 2) return cur.players;
  const renderT = performance.now() - B.offset - B.delay;
  let i = B.snaps.length - 1;
  while (i > 0 && B.snaps[i - 1].t > renderT) i--;
  const a = B.snaps[Math.max(0, i - 1)], b = B.snaps[i];
  const span = b.t - a.t;
  // past the newest update: hold it (with at most a sliver of extrapolation) rather than jumping
  const k = span > 0 ? Math.max(0, Math.min(1.15, (renderT - a.t) / span)) : 1;
  return cur.players.map((p) => {
    if (!p) return null;
    const pa = a.m.players.find((o) => o && o.id === p.id), pb = b.m.players.find((o) => o && o.id === p.id);
    if (!pa || !pb) return p;
    // positions come from the buffered moment; health, limbs and death are always the latest
    const o = blendPlayer(pa, pb, k);
    return { ...o, parts: p.parts, dead: p.dead, deathT: p.dead ? o.deathT : 0, headless: p.headless, weapon: p.weapon, score: p.score, stam: p.stam, bleed: p.bleed, bruise: p.bruise, color: p.color, name: p.name };
  });
}

// ---------- your own movement, predicted (shared/predict.js) ----------
const pred = makePredictor();

// ---------- HUD ----------
function project(v) {
  const p = v.clone().project(camera);
  if (p.z > 1) return null;
  return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight];
}
function text(t, x, y, size, color = '#fff', align = 'center') {
  hctx.font = `bold ${size}px Trebuchet MS, sans-serif`; hctx.textAlign = align; hctx.lineWidth = Math.max(3, size / 6); hctx.strokeStyle = '#2a1e33'; hctx.lineJoin = 'round';
  hctx.strokeText(t, x, y); hctx.fillStyle = color; hctx.fillText(t, x, y);
}
function bodyChart(x, y, p) {
  const c = (k) => (p.parts[k].cut ? '#00000066' : p.parts[k].hp / PART_MAX[k] > 0.5 ? '#5ad15a' : '#ffb03f');
  const L = (a, b, col, wdt) => { hctx.strokeStyle = col; hctx.lineWidth = wdt; hctx.lineCap = 'round'; hctx.beginPath(); hctx.moveTo(...a); hctx.lineTo(...b); hctx.stroke(); };
  hctx.beginPath(); hctx.arc(x, y - 26, 8, 0, 7); hctx.fillStyle = c('head'); hctx.fill();
  L([x, y - 16], [x, y + 12], c('torso'), 7);
  L([x, y - 12], [x + 15, y + 2], c('armR'), 4); L([x, y - 12], [x - 15, y + 2], c('armL'), 4);
  L([x, y + 12], [x + 9, y + 32], c('legR'), 4); L([x, y + 12], [x - 9, y + 32], c('legL'), 4);
}

let fightFlash = 0;
function drawHud(players, me, opp) {
  const w = innerWidth, h = innerHeight;
  hctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  hctx.clearRect(0, 0, w, h);
  if (hurtFlash > 0) { hctx.fillStyle = `rgba(200,0,0,${hurtFlash * 0.35})`; hctx.fillRect(0, 0, w, h); }
  if (qualityToast > 0) { hctx.globalAlpha = Math.min(1, qualityToast); text(toastText, w / 2, h - 44, 16, '#fff'); hctx.globalAlpha = 1; }
  if (S.fps) text(`${perf.fps} fps`, w - 12, 22, 14, perf.fps >= 50 ? '#9be89b' : perf.fps >= 30 ? '#ffd27a' : '#ff8a7a', 'right');

  if (opp && !opp.dead) { const s = project(V(skeleton(opp).head).add(new THREE.Vector3(0, 0.32, 0))); if (s) text(opp.name, s[0], s[1], 15, TEAM_CSS[opp.color]); }

  if (!cur) { if (ws) text(connected ? 'Connecting…' : 'Looking for the server…', w / 2, h / 2, 30); return; }

  // Scoreboard.
  if (!wheel.visible()) cur.players.forEach((p, i) => text(p ? `${p.name}  ${p.score}` : '— empty —', w / 2 + (i === 0 ? -30 : 30), 36, 20, TEAM_CSS[i], i === 0 ? 'right' : 'left'));
  if (!wheel.visible()) { text('vs', w / 2, 36, 14, '#ffffffb0'); text('first to ' + WIN_SCORE, w / 2, 56, 12, '#ffffffb0'); }

  if (me) {
    // Plain crosshair: your chosen direction is deliberately invisible, like Last Oasis.
    const cx = w / 2, cy = h / 2;
    hctx.beginPath(); hctx.arc(cx, cy, 2.5, 0, Math.PI * 2); hctx.fillStyle = '#ffffffc0'; hctx.fill();
    if (me.riposte) text('RIPOSTE! swing now', cx, cy - 70, 16, '#3fe0ff');

    // Health: body bar and a little body diagram.
    const bx = 24, by = h - 44, bw = 240;
    hctx.fillStyle = '#0008'; hctx.fillRect(bx, by, bw, 16);
    hctx.fillStyle = me.parts.torso.hp > 40 ? '#5ad15a' : '#e0493e'; hctx.fillRect(bx, by, (bw * me.parts.torso.hp) / PART_MAX.torso, 16);
    text([me.bleed && 'BLEEDING', me.bruise > 0.05 && 'BRUISED'].filter(Boolean).join(' + ') || 'HEALTH', bx + 2, by - 8, 13, me.bleed || me.bruise > 0.05 ? '#ff6b6b' : '#fff', 'left');
    hctx.fillStyle = '#0008'; hctx.fillRect(bx, by + 22, bw, 8);
    hctx.fillStyle = me.stam > 25 ? '#ffd23f' : '#ff6b3f'; hctx.fillRect(bx, by + 22, (bw * me.stam) / STAM_MAX, 8);
    bodyChart(bx + bw + 40, h - 72, me);
    if (me.weapon && !wheel.hiding()) text(`${WEAPONS[me.weapon].emoji} ${WEAPONS[me.weapon].name}${WEAPONS[me.weapon].two ? (me.parts.armR.cut || me.parts.armL.cut ? '  (two-handed, one arm: slow and weak!)' : '  (two-handed)') : ''}`, bx + 2, by - 30, 15, '#fff', 'left');
    if (opp) {
      text(opp.name + (opp.weapon && !wheel.hiding() ? `  ${WEAPONS[opp.weapon].emoji} ${WEAPONS[opp.weapon].name}` : ''), w - 24, 92, 14, TEAM_CSS[opp.color], 'right');
      hctx.fillStyle = '#0008'; hctx.fillRect(w - 264, 100, 240, 10);
      hctx.fillStyle = TEAM_CSS[opp.color]; hctx.fillRect(w - 264, 100, (240 * opp.parts.torso.hp) / PART_MAX.torso, 10);
      bodyChart(w - 300, 108, opp);
    }

    if (me.stun > 0) text('💫 STUNNED 💫', w / 2, h / 2 + 115, 26, '#ffd23f');
    if (me.dead) text(me.headless ? "You've lost your head!" : 'You have been slain.', w / 2, h / 2 + 140, 30, '#ff6b6b');
  } else if (cur.players.some(Boolean)) text('Spectating', w / 2, 90, 18);

  if (cur.phase === 'spin' || wheel.visible()) wheel.draw(w, h, players);
  else if (cur.phase !== 'fight') text(cur.msg, w / 2, h * 0.32, cur.phase === 'roundEnd' ? 46 : 34, cur.phase === 'roundEnd' ? '#ffd23f' : '#fff');
  else if (fightFlash > 0) text('FIGHT!', w / 2, h * 0.32, 52, '#ffd23f');
  if (joined && !locked() && !menu.isOpen()) text('Click to fight (the mouse looks around)', w / 2, h - 90, 22, '#fff');
  hctx.font = '13px Trebuchet MS, sans-serif'; hctx.textAlign = 'center'; hctx.fillStyle = '#ffffffb0';
  hctx.fillText('WASD move · hold left click, steer, release to swing · hold right click + steer to block · right click mid-swing feints · F kick · M mute · Esc settings', w / 2, h - 14);
}

// ---------- the Wheel of Weapons ----------
// The server rolls everyone's weapon; the wheel just spins dramatically to land on it.
const SLICE_COLORS = ['#e0493e', '#ffd23f', '#3e7be0', '#5ad15a', '#ff4fd8', '#ff9f3f', '#3fe0ff', '#9b59ff'];
const wheel = (() => {
  const total = WHEEL.reduce((t, k) => t + WEAPONS[k].weight, 0);
  let a = 0; // slice angles in wheel space; drawn rotated by `angle`
  const slices = WHEEL.map((k, i) => { const span = (WEAPONS[k].weight / total) * Math.PI * 2; const sl = { k, a0: a, a1: a + span, color: k === 'excalibur' ? '#ffd700' : k === 'fists' ? '#333' : SLICE_COLORS[i % SLICE_COLORS.length] }; a += span; return sl; });
  let st = null, angle = 0, lastSlice = -1, confetti = [];
  const POINTER = -Math.PI / 2;
  const TAU = Math.PI * 2;
  const sliceAt = (ang) => { const x = (((POINTER - ang) % TAU) + TAU) % TAU; return slices.findIndex((s) => x >= s.a0 && x < s.a1); };
  return {
    start(ev) {
      const mine = ev.result[myId] || Object.values(ev.result)[0];
      const sl = slices.find((s) => s.k === mine);
      const inside = sl.a0 + (sl.a1 - sl.a0) * (0.2 + Math.random() * 0.6);
      // Rotate so `inside` ends under the pointer, after several full turns.
      const target = POINTER - inside, turns = 6 + Math.floor(Math.random() * 3);
      const base = angle - (angle % (Math.PI * 2));
      st = { t0: performance.now(), dur: (ev.dur - 1.3) * 1000, from: angle, to: base + turns * Math.PI * 2 + target, mine, result: ev.result, landed: false };
      audio.drumroll(st.dur / 1000);
    },
    visible() { return st && performance.now() - st.t0 < st.dur + 1300; },
    // Weapons stay hidden until the wheel stops, so the HUD doesn't spoil the result.
    hiding() { return !!cur && cur.phase === 'spin' && !(st && st.landed); },
    draw(w, h, players) {
      if (!st) return;
      const now = performance.now(), k = Math.min(1, (now - st.t0) / st.dur);
      const eased = 1 - Math.pow(1 - k, 4);
      angle = st.from + (st.to - st.from) * eased;
      // Tick as each slice passes the pointer.
      const si = sliceAt(angle); if (si !== lastSlice) { lastSlice = si; if (k < 1) audio.tick(); }
      if (k >= 1 && !st.landed) {
        st.landed = true; audio.reveal(st.mine);
        for (let i = 0; i < 160; i++) confetti.push({ x: w / 2, y: h * 0.45, vx: rnd(-500, 500), vy: rnd(-700, -150), c: pick(SLICE_COLORS), life: rnd(1.2, 2.2), r: rnd(0, 6) });
      }
      const R = Math.min(w, h) * 0.3, cx = w / 2, cy = h * 0.47;
      hctx.fillStyle = 'rgba(20,12,35,0.55)'; hctx.fillRect(0, 0, w, h);
      const bob = Math.sin(now / 120) * 4;
      text('🎡 WHEEL OF WEAPONS 🎡', cx, cy - R - 46 + bob, 38, '#ffd23f');
      // Rim with chasing lights.
      hctx.beginPath(); hctx.arc(cx, cy, R + 16, 0, Math.PI * 2); hctx.fillStyle = '#5a3d1e'; hctx.fill();
      for (let i = 0; i < 28; i++) {
        const b = (i / 28) * Math.PI * 2, on = (i + Math.floor(now / 90)) % 3 === 0;
        hctx.beginPath(); hctx.arc(cx + Math.cos(b) * (R + 8), cy + Math.sin(b) * (R + 8), 4.5, 0, Math.PI * 2); hctx.fillStyle = on ? '#fff6b0' : '#8a6a3a'; hctx.fill();
      }
      for (const sl of slices) {
        hctx.beginPath(); hctx.moveTo(cx, cy); hctx.arc(cx, cy, R, sl.a0 + angle, sl.a1 + angle); hctx.closePath();
        hctx.fillStyle = sl.color; hctx.fill(); hctx.strokeStyle = '#2a1e33'; hctx.lineWidth = 2; hctx.stroke();
        const mid = (sl.a0 + sl.a1) / 2 + angle;
        hctx.save(); hctx.translate(cx, cy); hctx.rotate(mid);
        hctx.textAlign = 'right'; hctx.textBaseline = 'middle';
        hctx.font = `${Math.round(R * 0.13)}px sans-serif`; hctx.fillText(WEAPONS[sl.k].emoji, R - 10, 0);
        hctx.font = `bold ${Math.round(R * 0.055)}px Trebuchet MS, sans-serif`; hctx.fillStyle = sl.k === 'fists' ? '#fff' : '#2a1e33';
        hctx.fillText(WEAPONS[sl.k].name.toUpperCase(), R * 0.8, 0);
        hctx.restore();
      }
      hctx.textBaseline = 'alphabetic';
      hctx.beginPath(); hctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2); hctx.fillStyle = '#ffd23f'; hctx.fill(); hctx.strokeStyle = '#2a1e33'; hctx.lineWidth = 4; hctx.stroke();
      text('?', cx, cy + R * 0.06, R * 0.16, '#2a1e33');
      // The pointer, which wobbles as slices hit it.
      const wob = k < 1 ? Math.sin(now / 25) * 0.15 * (1 - k) : 0;
      hctx.save(); hctx.translate(cx, cy - R - 10); hctx.rotate(wob);
      hctx.beginPath(); hctx.moveTo(-18, -22); hctx.lineTo(18, -22); hctx.lineTo(0, 20); hctx.closePath(); hctx.fillStyle = '#fff'; hctx.fill(); hctx.strokeStyle = '#2a1e33'; hctx.lineWidth = 3; hctx.stroke();
      hctx.restore();
      if (st.landed) {
        const W = WEAPONS[st.mine], pop = 1 + Math.max(0, 0.3 - (now - st.t0 - st.dur) / 1000);
        const isMe = !!st.result[myId];
        text(`${isMe ? 'YOU GOT' : 'THEY GOT'}: ${W.emoji} ${W.name}!`, cx, cy + R + 56, 34 * pop, st.mine === 'excalibur' ? '#ffd700' : '#fff');
        text(W.line, cx, cy + R + 86, 18, '#c9bfe0');
        text(swingFeel(W), cx, cy + R + 140, 15, '#ffb060');
        for (const p of players) if (p && p.id !== myId && st.result[p.id] && isMe) { const o = WEAPONS[st.result[p.id]]; text(`${p.name} got ${o.emoji} ${o.name}`, cx, cy + R + 114, 16, TEAM_CSS[p.color]); }
      } else text('Spinning…', cx, cy + R + 56, 24, '#fff');
      for (const c of confetti) { hctx.fillStyle = c.c; hctx.save(); hctx.translate(c.x, c.y); hctx.rotate(c.r); hctx.fillRect(-4, -2, 8, 4); hctx.restore(); }
    },
    step(dt) { for (const c of confetti) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.r += dt * 8; c.life -= dt; } confetti = confetti.filter((c) => c.life > 0); },
  };
})();

// A short description of how a weapon swings, shown when the wheel lands.
function swingFeel(W) {
  const word = (v, fast, slow) => (v <= 0.85 ? fast : v >= 1.2 ? slow : null);
  const feet = W.move >= 1.1 ? 'nimble feet' : W.move <= 0.9 ? 'heavy feet' : null; // move is a speed, so higher is faster
  const bits = [W.two && 'two-handed', word(W.draw, 'quick wind-up', 'slow wind-up'), word(W.swing, 'snappy swing', 'sweeping swing'), word(W.rec, 'fast recovery', 'long recovery'), feet].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'balanced all round';
}

// ---------- footsteps ----------
// One step sound each time a foot comes down (twice per stride), quieter for the other knight far away.
const stepPhase = new Map();
function footsteps(p, isMe) {
  const n = Math.floor((p.walk || 0) / Math.PI), last = stepPhase.get(p.id);
  stepPhase.set(p.id, n);
  if (last === undefined || n === last || p.dead || !p.onGround || Math.hypot(p.vx || 0, p.vz || 0) < 0.6) return;
  const d = isMe ? 0 : Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  audio.step(isMe ? 0.12 : Math.max(0.02, 0.14 / (1 + d * 0.35)));
}

// ---------- main loop ----------
let last = performance.now(), clock = 0, lastPhase = '';
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; clock += dt;
  const players = interpPlayers().slice();
  let me = players.find((p) => p && p.id === myId) || null;
  const opp = players.find((p) => p && p.id !== myId) || null;
  if (me && pred.on && !me.dead) {
    pred.step(cur.players.find((p) => p && p.id === myId), opp, { mf: moveFwd(), ms: moveSide(), j: keys.has('Space'), b: isBlocking(), yaw: look.yaw }, dt, now);
    me = { ...me, x: pred.x, y: pred.y, z: pred.z, vx: pred.vx, vz: pred.vz, walk: pred.walk, onGround: pred.onGround };
    players[players.findIndex((p) => p && p.id === myId)] = me;
  }
  if (debugPose && me) { me = { ...me, ...debugPose }; players[players.findIndex((p) => p && p.id === myId)] = me; } // ?debug only
  if (cur && cur.phase !== lastPhase) {
    if (cur.phase === 'fight') { fightFlash = 1; music.start(); }
    else music.stop();
    lastPhase = cur.phase;
  }
  music.step(dt);
  fightFlash = Math.max(0, fightFlash - dt); qualityToast = Math.max(0, qualityToast - dt);
  if (me) sendInput(dt);
  turnLag += (Math.max(-0.12, Math.min(0.12, -turnPush * 1.5)) - turnLag) * Math.min(1, dt * 10); turnPush = 0;

  // Sync knight meshes with the players in the arena.
  const ids = new Set(players.filter(Boolean).map((p) => p.id));
  for (const [id, k] of knights) if (!ids.has(id)) { k.dispose(); knights.delete(id); }
  for (const p of players) {
    if (!p) continue;
    let k = knights.get(p.id);
    if (!k || k.color !== p.color) { if (k) k.dispose(); k = new Knight(p.color); knights.set(p.id, k); }
    const isMe = p.id === myId;
    // Use the local mouse look for our own body so the sword follows the camera instantly.
    const pose = isMe && !p.dead ? { ...p, yaw: look.yaw, pitch: look.pitch, breath: clock, lag: turnLag } : { ...p, breath: clock + p.id * 1.7 };
    footsteps(p, isMe);
    k.update(pose, skeleton(pose), isMe && !p.dead);
  }

  // Camera.
  if (me && !me.dead) {
    const sk = skeleton({ ...me, yaw: look.yaw });
    camera.position.set(sk.head[0], sk.head[1] + 0.02, sk.head[2]);
    // A slight roll with each step, so walking feels like walking.
    const gk = me.onGround ? Math.min(1, Math.hypot(me.vx || 0, me.vz || 0) / 2.4) : 0;
    // Kicking: the view tips down a little to follow your boot. Stumbling after a miss: the view wobbles.
    const kc = kickCurve(me), wob = me.stun > 0 ? Math.sin(clock * 17) * 0.05 * Math.min(1, me.stun * 2) : 0;
    camera.rotation.set(look.pitch - 0.38 * Math.max(kc.knee * 0.55, kc.ext), look.yaw, 0.012 * gk * Math.sin(me.walk || 0) + wob);
  } else if (me && myHeadGib) {
    // Your head is the camera now. Enjoy the ride.
    camera.position.copy(myHeadGib.g.position);
    camera.quaternion.copy(myHeadGib.g.quaternion);
  } else if (me) {
    // Death cam: float up and back to admire what happened.
    const k = Math.min(1, me.deathT / 1.2), f = forward(me.yaw);
    camera.position.set(me.x - f[0] * 2.6 * k, 1.6 + 1.4 * k, me.z - f[2] * 2.6 * k);
    camera.lookAt(me.x, 0.3, me.z);
  } else {
    // Spectator: slow orbit around the action.
    const a = clock * 0.12, fs = players.filter(Boolean);
    camera.position.set(Math.sin(a) * 9, 5, Math.cos(a) * 9);
    camera.lookAt(fs.length ? fs.reduce((s, p) => s + p.x, 0) / fs.length : 0, 1, fs.length ? fs.reduce((s, p) => s + p.z, 0) / fs.length : 0);
  }
  if (shake > 0) { camera.position.x += rnd(-shake, shake); camera.position.y += rnd(-shake, shake); shake = Math.max(0, shake - dt * 0.4); }
  if (debugCam) { camera.position.set(...debugCam.pos); camera.lookAt(...debugCam.at); } // ?debug only: a free camera for screenshots
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);

  blood.step(dt); stepGibs(dt); sparks.step(dt); updateCrowd(clock, dt); wheel.step(dt);

  watchFrameRate(dt);
  if (useComposer()) { grade.uniforms.hurt.value = Math.min(1, hurtFlash); composer.render(); } else renderer.render(scene, camera);
  drawHud(players, me, opp);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- goofy synth sounds ----------
// Fight music: plays a random track from public/music/ when a fight starts, fades out when the round ends.
const music = (() => {
  let tracks = [], el = null, target = 0, lastTrack = null;
  const VOL = 0.45;
  fetch('/music.json').then((r) => r.json()).then((list) => { tracks = list; }).catch(() => {});
  return {
    start() {
      if (!tracks.length) return;
      // A different track each fight when there's more than one.
      const choices = tracks.length > 1 ? tracks.filter((t) => t !== lastTrack) : tracks;
      const t = choices[(Math.random() * choices.length) | 0];
      if (!el || lastTrack !== t) { if (el) el.pause(); el = new Audio(t); el.loop = true; el.volume = 0; lastTrack = t; }
      else el.currentTime = 0;
      el.play().catch(() => {});
      target = VOL * (S.music / 100);
    },
    stop() { target = 0; },
    step(dt) {
      if (!el) return;
      const goal = audio.muted ? 0 : target && VOL * (S.music / 100);
      el.volume = Math.max(0, Math.min(1, el.volume + Math.sign(goal - el.volume) * Math.min(Math.abs(goal - el.volume), dt * (goal > el.volume ? 0.6 : 0.35))));
      if (target === 0 && el.volume === 0 && !el.paused) el.pause();
    },
  };
})();

const audio = {
  ctx: null, muted: false,
  init() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch {} } else if (this.ctx.state === 'suspended') this.ctx.resume(); },
  ok() { return this.ctx && !this.muted && S.sfx > 0; },
  out() { if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); } this.master.gain.value = S.sfx / 100; return this.master; },
  env(node, t, a, d, peak = 0.3) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); g.connect(this.out()); return g; },
  noise(dur) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; return s; },
  whoosh(dir) {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(0.25), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(dir === 'low' ? 400 : 900, t); f.frequency.exponentialRampToValueAtTime(dir === 'over' ? 300 : 2500, t + 0.2);
    n.connect(f); this.env(f, t, 0.03, 0.2, 0.25); n.start(t);
  },
  step(vol) {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(0.12), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 300; n.connect(f); this.env(f, t, 0.004, 0.09, vol); n.start(t);
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.08); this.env(o, t, 0.003, 0.08, vol * 0.8); o.start(t); o.stop(t + 0.12);
    // a faint clink of armour
    const c = this.ctx.createOscillator(); c.type = 'triangle'; c.frequency.value = 2400 + Math.random() * 900; this.env(c, t + 0.01, 0.002, 0.06, vol * 0.12); c.start(t + 0.01); c.stop(t + 0.1);
  },
  thud() {
    if (!this.ok()) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); this.env(o, t, 0.005, 0.18, 0.5); o.start(t); o.stop(t + 0.25);
  },
  squelch() {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(0.4), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.35); n.connect(f); this.env(f, t, 0.01, 0.35, 0.5); n.start(t);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.12);
    this.env(o, t, 0.005, 0.12, 0.25); o.start(t); o.stop(t + 0.2);
  },
  clang() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    for (const fr of [1250, 1870, 2630]) { const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; this.env(o, t, 0.002, 0.5, 0.12); o.start(t); o.stop(t + 0.6); }
  },
  slide() {
    if (!this.ok()) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.9); this.env(o, t, 0.02, 0.9, 0.25); o.start(t); o.stop(t + 1);
  },
  boing(pitch = 1, vol = 0.12) {
    if (!this.ok()) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(180 * pitch, t); o.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.12); this.env(o, t, 0.005, 0.15, vol); o.start(t); o.stop(t + 0.2);
  },
  cheer() {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(1.6), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7; n.connect(f); this.env(f, t, 0.25, 1.3, 0.18); n.start(t);
  },
  tick() {
    if (!this.ok()) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1500; this.env(o, t, 0.001, 0.03, 0.05); o.start(t); o.stop(t + 0.05);
  },
  drumroll(dur) {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(dur), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 400; n.connect(f); const g = this.env(f, t, dur * 0.8, dur * 0.2, 0.15); n.start(t);
  },
  notes(list, type = 'square', vol = 0.07) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    list.forEach(([fr, at, len, to]) => { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(fr, t + at); if (to) o.frequency.linearRampToValueAtTime(to, t + at + len); this.env(o, t + at, 0.01, len, vol); o.start(t + at); o.stop(t + at + len + 0.05); });
  },
  reveal(id) {
    if (id === 'fists') this.notes([[392, 0, 0.35], [370, 0.4, 0.35], [349, 0.8, 0.35], [330, 1.2, 0.9, 300]], 'sawtooth', 0.06); // sad trombone
    else if (id === 'excalibur') this.notes([[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.5], [784, 0.9, 0.1], [1047, 1.0, 0.6]]);
    else if (id === 'chicken') this.notes([[900, 0, 0.25, 1600], [1500, 0.3, 0.3, 700]], 'sine', 0.12);
    else this.horn();
    this.cheer();
  },
  hitFor(id) {
    if (!this.ok()) return;
    if (id === 'chicken') this.notes([[700, 0, 0.18, 1800], [1700, 0.18, 0.2, 900]], 'sine', 0.15);
    else if (id === 'pan') this.notes([[220, 0, 0.8], [331, 0, 0.8], [587, 0, 0.6]], 'triangle', 0.12);
    else if (id === 'trout') { const t = this.ctx.currentTime, n = this.noise(0.12), f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900; n.connect(f); this.env(f, t, 0.002, 0.1, 0.5); n.start(t); }
    else if (id === 'hammer') { this.thud(); this.notes([[120, 0, 0.3, 60]], 'square', 0.1); }
    else this.thud();
  },
  howl() { // a distant wolf, for atmosphere
    if (!this.ok()) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), v = this.ctx.createOscillator(), vg = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(720, t + 0.5); o.frequency.linearRampToValueAtTime(680, t + 1.6); o.frequency.linearRampToValueAtTime(420, t + 2.3);
    v.frequency.value = 5.5; vg.gain.value = 12; v.connect(vg); vg.connect(o.frequency);
    this.env(o, t, 0.4, 1.9, 0.05); o.start(t); v.start(t); o.stop(t + 2.4); v.stop(t + 2.4);
  },
  horn() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [392, 523, 659].forEach((fr, i) => { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; this.env(o, t + i * 0.12, 0.01, 0.18, 0.06); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.25); });
  },
};

// For automated testing: ?debug exposes a couple of hooks.
let debugCam = null, debugPose = null;
if (params.has('debug')) window.duel = { set cam(c) { debugCam = c; }, set pose(o) { debugPose = o; }, send, look, camera, scene, get state() { return cur; }, get fx() { return { hurtFlash, shake, fightFlash }; } };
