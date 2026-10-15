import * as THREE from 'three';
import { ARENA_R, ARM, HEAD_R, LEG, PART_MAX, WIN_SCORE, STAM_MAX, WEAPONS, WHEEL, skeleton, forward, isHeavy } from '/shared/sim.js';

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
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c1ff);
scene.fog = new THREE.Fog(0x86c1ff, 30, 70);
const camera = new THREE.PerspectiveCamera(78, 1, 0.03, 200);
camera.rotation.order = 'YXZ';
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  hud.width = w * devicePixelRatio; hud.height = h * devicePixelRatio;
}
addEventListener('resize', resize); resize();

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- the arena ----------
const crowd = { bodies: null, heads: null, base: [], cheer: 0 };
const torches = [], torchLights = [];
function buildArena() {
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x8a6f4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(8, 18, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  scene.add(sun);

  const sand = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#d9b77a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${pick([120, 160, 250])},${pick([90, 120, 220])},60,${rnd(0.05, 0.18)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3)); }
  }, [6, 6]);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.3, 72), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // a painted duelling circle
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; scene.add(ring);

  const bricks = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#7d7468'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      g.fillStyle = `hsl(30, 8%, ${rnd(48, 62)}%)`;
      g.fillRect(col * 52 + (row % 2) * 26 - 26, row * 32 + 2, 48, 28);
    }
  }, [24, 2]);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.3, ARENA_R + 0.3, 2.2, 72, 1, true), new THREE.MeshStandardMaterial({ map: bricks, side: THREE.DoubleSide, roughness: 0.95 }));
  wall.position.y = 1.1; wall.receiveShadow = true; scene.add(wall);
  const cap = new THREE.Mesh(new THREE.RingGeometry(ARENA_R + 0.3, ARENA_R + 0.8, 72), new THREE.MeshStandardMaterial({ color: 0x9a8f80, side: THREE.DoubleSide }));
  cap.rotation.x = -Math.PI / 2; cap.position.y = 2.2; scene.add(cap);

  // Tiered stands full of a cheering crowd.
  const standMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, side: THREE.DoubleSide, roughness: 1 });
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const r0 = ARENA_R + 0.8 + i * 1.3, y = 2.2 + i * 0.75;
    const seat = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 1.3, 72), standMat); seat.rotation.x = -Math.PI / 2; seat.position.y = y; scene.add(seat);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1.3, r0 + 1.3, 0.75, 72, 1, true), standMat); riser.position.y = y + 0.375; scene.add(riser);
    seats.push([r0 + 0.6, y]);
  }
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 6.1, ARENA_R + 6.1, 6, 72, 1, true), new THREE.MeshStandardMaterial({ map: bricks, side: THREE.DoubleSide }));
  outer.position.y = 3; scene.add(outer);
  const N = 420;
  crowd.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.6, 0.3), new THREE.MeshStandardMaterial(), N);
  crowd.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }), N);
  const skin = [0xffe0bd, 0xf1c27d, 0xc68642, 0x8d5524, 0xffdbac];
  for (let k = 0; k < N;) {
    const [r, y] = pick(seats), a = rnd(0, Math.PI * 2);
    if (Math.abs(Math.cos(a)) < 0.1) continue; // leave the space above the two gates empty
    crowd.base.push({ k, x: Math.cos(a) * r, z: Math.sin(a) * r, y, ph: rnd(0, 6.28), sp: rnd(4, 9) });
    crowd.bodies.setColorAt(k, new THREE.Color().setHSL(Math.random(), 0.6, 0.5));
    crowd.heads.setColorAt(k, new THREE.Color(pick(skin)));
    k++;
  }
  scene.add(crowd.bodies, crowd.heads);

  // Pillars, torches and banners around the wall.
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xa69c8c });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12, x = Math.cos(a) * (ARENA_R + 0.1), z = Math.sin(a) * (ARENA_R + 0.1);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), pillarMat);
    pillar.position.set(x, 1.6, z); pillar.lookAt(0, 1.6, 0); pillar.castShadow = true; scene.add(pillar);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0xffa531 }));
    flame.position.set(x * 0.965, 3.45, z * 0.965); scene.add(flame); torches.push(flame);
    if (i % 3 === 0) { const l = new THREE.PointLight(0xffa531, 6, 9, 1.6); l.position.copy(flame.position); scene.add(l); torchLights.push(l); }
    const b = (i / 12) * Math.PI * 2;
    if (Math.abs(Math.cos(b)) < 0.2) continue;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshStandardMaterial({ color: TEAM[i % 2], side: THREE.DoubleSide }));
    banner.position.set(Math.cos(b) * (ARENA_R + 0.25), 1.35, Math.sin(b) * (ARENA_R + 0.25)); banner.lookAt(0, 1.35, 0); scene.add(banner);
  }
  // Gates where the fighters come out.
  for (const s of [1, -1]) {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    gate.position.set(0, 1.3, s * (ARENA_R + 0.4)); scene.add(gate);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.7), pillarMat);
    arch.position.set(0, 2.85, s * (ARENA_R + 0.4)); scene.add(arch);
  }
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false }));
  sunBall.position.set(40, 45, 30); scene.add(sunBall);
}
buildArena();

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
  for (const f of torches) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
  for (const l of torchLights) l.intensity = 5 + Math.random() * 2;
}

// ---------- knights ----------
const UP = new THREE.Vector3(0, 1, 0);
const unitCyl = (rTop, rBot) => { const g = new THREE.CylinderGeometry(rTop, rBot, 1, 12); g.translate(0, 0.5, 0); return g; };
const GEO = {
  arm: unitCyl(0.055, 0.065), leg: unitCyl(0.07, 0.085), torso: unitCyl(0.22, 0.17),
  hand: new THREE.SphereGeometry(0.07, 10, 8), boot: new THREE.BoxGeometry(0.14, 0.1, 0.26), stump: new THREE.SphereGeometry(0.075, 10, 8),
  head: new THREE.SphereGeometry(HEAD_R, 18, 14), helmet: new THREE.SphereGeometry(HEAD_R + 0.015, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  plume: new THREE.ConeGeometry(0.04, 0.2, 8), eye: new THREE.SphereGeometry(0.022, 8, 6), deadEye: new THREE.BoxGeometry(0.045, 0.01, 0.01),
  mouth: new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI),
};
const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xe8cba8, roughness: 0.8 }), pants: new THREE.MeshStandardMaterial({ color: 0x3b2c4a }),
  boot: new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), stump: new THREE.MeshStandardMaterial({ color: 0xb3121b, roughness: 0.4 }),
  face: new THREE.MeshStandardMaterial({ color: 0xffe0bd }), eye: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.6, roughness: 0.35 }), wood: new THREE.MeshStandardMaterial({ color: 0x6b4423 }),
};
// Each weapon is a group whose origin is the grip, pointing up +y along its reach.
// userData.glowMat is the part that glows while drawing back.
function makeWeapon(id) {
  const W = WEAPONS[id] || WEAPONS.longsword, L = W.len, g = new THREE.Group();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
  const steel = () => std(0xe8eef5, { metalness: 0.85, roughness: 0.25 });
  const add = (geo, mat, y = 0, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 10);
  const grip = () => { add(cyl(0.02, 0.17), MAT.wood, -0.08); add(new THREE.SphereGeometry(0.035, 8, 6), MAT.gold, -0.17); };
  let glow;
  switch (id) {
    case 'greatsword': glow = steel(); add(box(0.075, L, 0.014), glow, L / 2 + 0.03); add(box(0.34, 0.04, 0.05), MAT.gold, 0.01); add(cyl(0.022, 0.3), MAT.wood, -0.15); break;
    case 'dagger': glow = steel(); add(new THREE.ConeGeometry(0.03, L, 4), glow, L / 2 + 0.02); add(box(0.12, 0.025, 0.03), MAT.gold, 0.01); grip(); break;
    case 'axe': glow = steel(); add(cyl(0.022, L + 0.2), MAT.wood, L / 2 - 0.1); add(box(0.24, 0.2, 0.025), glow, L - 0.1, 0.12); break;
    case 'hammer': glow = std(0x777777, { metalness: 0.6 }); add(cyl(0.024, L + 0.15), MAT.wood, L / 2 - 0.08); add(box(0.3, 0.15, 0.15), glow, L - 0.08); break;
    case 'spear': glow = steel(); add(cyl(0.02, L), MAT.wood, L / 2 - 0.1); add(new THREE.ConeGeometry(0.045, 0.26, 6), glow, L - 0.02); break;
    case 'scythe': {
      glow = std(0xbfc6cc, { metalness: 0.8, roughness: 0.3 }); add(cyl(0.022, L + 0.2), std(0x3a2a1a), L / 2 - 0.1);
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
      const disc = add(new THREE.CylinderGeometry(0.17, 0.15, 0.04, 20), glow, L - 0.12); disc.rotation.x = Math.PI / 2;
      break;
    }
    case 'fists': glow = std(0xd8261f, { roughness: 0.4 }); add(new THREE.SphereGeometry(0.1, 14, 10), glow, 0.03).scale.set(1, 1.15, 1); break;
    case 'excalibur': glow = std(0xffd700, { metalness: 0.9, roughness: 0.15, emissive: 0x332200 }); add(box(0.06, L, 0.014), glow, L / 2 + 0.03); add(box(0.3, 0.045, 0.05), MAT.gold, 0.01); add(new THREE.SphereGeometry(0.03, 8, 6), std(0x3fa7ff, { emissive: 0x1050ff }), 0.01, 0, -0.03); grip(); break;
    default: glow = steel(); add(box(0.05, L, 0.012), glow, L / 2 + 0.03); add(box(0.24, 0.035, 0.04), MAT.gold, 0.01); grip();
  }
  g.userData.glowMat = glow; g.userData.baseEmissive = glow.emissive.clone();
  return g;
}
function makeHead(color, dead = false) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(GEO.head, MAT.face));
  const helmet = new THREE.Mesh(GEO.helmet, new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })); helmet.position.y = 0.01; g.add(helmet);
  const plume = new THREE.Mesh(GEO.plume, MAT.gold); plume.position.y = HEAD_R + 0.1; g.add(plume);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(dead ? GEO.deadEye : GEO.eye, MAT.eye);
    eye.position.set(s * 0.05, -0.01, -HEAD_R + 0.012); if (dead) eye.rotation.z = s * 0.8; g.add(eye);
    if (dead) { const e2 = eye.clone(); e2.rotation.z = -s * 0.8; g.add(e2); }
  }
  const mouth = new THREE.Mesh(GEO.mouth, MAT.eye);
  mouth.position.set(0, -0.07, -HEAD_R + 0.015); mouth.rotation.z = Math.PI; g.add(mouth);
  g.traverse((o) => { o.castShadow = true; });
  g.userData.mouth = mouth;
  return g;
}
const _d = new THREE.Vector3();
function seg(mesh, a, b) {
  _d.subVectors(b, a); const l = _d.length();
  mesh.position.copy(a); mesh.scale.set(1, Math.max(l, 1e-3), 1);
  if (l > 1e-5) mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(l));
}

class Knight {
  constructor(color) {
    this.color = color;
    this.root = new THREE.Group(); scene.add(this.root);
    const teamMat = new THREE.MeshStandardMaterial({ color: TEAM[color], roughness: 0.6 });
    const m = (geo, mat) => { const x = new THREE.Mesh(geo, mat); x.castShadow = true; this.root.add(x); return x; };
    this.torso = m(GEO.torso, teamMat);
    // Each body part gets its own material so it can bruise as it takes damage.
    this.mats = { armR: MAT.skin.clone(), armL: MAT.skin.clone(), legR: MAT.pants.clone(), legL: MAT.pants.clone(), head: MAT.face.clone(), torso: teamMat };
    for (const k in this.mats) this.mats[k].userData.base = this.mats[k].color.clone();
    this.armR = m(GEO.arm, this.mats.armR); this.armL = m(GEO.arm, this.mats.armL);
    this.handR = m(GEO.hand, this.mats.armR); this.handL = m(GEO.hand, this.mats.armL);
    this.legs = ['R', 'L'].map((s) => ({ thigh: m(GEO.leg, this.mats['leg' + s]), shin: m(GEO.leg, this.mats['leg' + s]), boot: m(GEO.boot, MAT.boot) }));
    this.stumps = [0, 1, 2, 3, 4].map(() => m(GEO.stump, MAT.stump));
    this.head = makeHead(TEAM[color]); this.head.children[0].material = this.mats.head; this.head.rotation.order = 'YXZ'; this.root.add(this.head);
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
    this.torso.visible = !firstPerson;
    seg(this.torso, P.hip, P.neck);
    for (const [arm, hand, key, sh, hk] of [[this.armR, this.handR, 'armR', P.shR, P.handR], [this.armL, this.handL, 'armL', P.shL, P.handL]]) {
      arm.visible = hand.visible = !cut(key);
      if (!cut(key)) { seg(arm, sh, hk); hand.position.copy(hk); }
    }
    [['legR', 'hipR', 'kneeR', 'footR'], ['legL', 'hipL', 'kneeL', 'footL']].forEach(([key, h, kn, ft], i) => {
      const L = this.legs[i], on = !firstPerson && !cut(key);
      L.thigh.visible = L.shin.visible = L.boot.visible = on;
      if (!on) return;
      seg(L.thigh, P[h], P[kn]); seg(L.shin, P[kn], P[ft]);
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
const BRUISE = new THREE.Color(0x4b1f5e);

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
    const limb = new THREE.Mesh(kind === 'arm' ? GEO.arm : GEO.leg, kind === 'arm' ? MAT.skin : MAT.pants);
    limb.scale.y = len; limb.position.y = -len / 2; limb.castShadow = true; g.add(limb);
    const st = new THREE.Mesh(GEO.stump, MAT.stump); st.position.y = len / 2; g.add(st);
    const end = new THREE.Mesh(kind === 'arm' ? GEO.hand : GEO.boot, kind === 'arm' ? MAT.skin : MAT.boot); end.position.y = -len / 2; g.add(end);
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

// ---------- network ----------
let ws = null, myId = null, connected = false;
let prev = null, cur = null, prevT = 0, curT = 0, mySpawn = -1;
function connect(name, room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);
  ws.onopen = () => { connected = true; };
  ws.onclose = () => { connected = false; setTimeout(() => connect(name, room), 1500); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; return; }
    if (m.t === 's') {
      prev = cur; prevT = curT; cur = m; curT = performance.now();
      const me = m.players.find((p) => p && p.id === myId);
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
let atkHeld = false, blockHeld = false, dir = 'right';
const locked = () => document.pointerLockElement === glCanvas;
function lockPointer() { try { const r = glCanvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} }
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
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
  const s = atkHeld || isBlocking() ? 0.0011 : 0.0023;
  look.yaw -= e.movementX * s;
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
  if (!joined) return;
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

let lastSent = '', lastSentT = 0;
function sendInput(dt) {
  const k = Math.exp(-dt * 12); flick.x *= k; flick.y *= k;
  const o = {
    t: 'in', mf: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    ms: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    j: keys.has('Space'), b: isBlocking(), yaw: Math.round(look.yaw * 1000) / 1000, pitch: Math.round(look.pitch * 1000) / 1000, d: dir,
  };
  const s = JSON.stringify(o), now = performance.now();
  if ((s !== lastSent && now - lastSentT > 30) || now - lastSentT > 100) { send(o); lastSent = s; lastSentT = now; }
}

// ---------- events, quips, floaters ----------
const floaters = [], bubbles = [];
let shake = 0, hurtFlash = 0, myHeadGib = null;
const findP = (id) => cur && cur.players.find((p) => p && p.id === id);
const QUIPS = {
  armR: ["It's just a flesh wound!", 'I have another one!', 'That arm was a loan!'],
  armL: ["Didn't need that one", 'Lefty no more!', 'My best waving arm!'],
  legR: ["I'll hop it off!", 'Who needs legs anyway?', 'Behold, unicycle mode!'],
  legL: ['Hop-a-long time!', "That'll hurt tomorrow", 'Leg day: cancelled.'],
  spare: ['Good thing I brought a spare sword!', 'Switching hands!'],
  both_legs: ['Come back, I shall bite your ankles!', 'Tactical crawl!'],
  no_arms: ['I can still kick you!', 'Fine, HEADBUTTS then.'],
  wrongblock: ['Wrong side!', 'Ow, other way!'],
  parry: ['Nope!', 'Not today!', 'CLANG!'],
  chamber: ['Chambered!', 'Right back at you!'],
  guardbreak: ['My guard!', 'Too tired to block!'],
  kicked: ['Oof!', 'Rude!', 'My dignity!'],
};
function say(id, kind) { const lines = QUIPS[kind]; if (lines) bubbles.push({ id, text: pick(lines), life: 2.4 }); }

function handleEvent(ev) {
  const p = findP(ev.id), mine = ev.id === myId;
  switch (ev.t) {
    case 'swing': audio.whoosh(ev.dir); if (ev.heavy) audio.thud(); break;
    case 'hit':
      blood.burst(V(ev.pos), 22, new THREE.Vector3(ev.dir[0], 0, ev.dir[1]));
      audio.hitFor(ev.weapon); floaters.push({ pos: V(ev.pos), text: `-${ev.dmg}`, life: 0.9, color: ev.zm >= 1.25 ? '#ffd23f' : ev.zm < 0.6 ? '#aaa' : '#fff', big: ev.zm >= 1.25 });
      if (ev.tag) floaters.push({ pos: V(ev.pos).add(new THREE.Vector3(0, 0.25, 0)), text: ev.zm >= 1.25 ? `${ev.tag.toUpperCase()}!` : ev.tag, life: 1.1, color: ev.zm >= 1.25 ? '#ffd23f' : '#ccc', big: ev.zm >= 1.25 });
      if (ev.weapon === 'baguette') for (let k = 0; k < 25; k++) sparks.spawn(V(ev.pos));
      if (mine) { shake = 0.06; hurtFlash = 0.5; }
      crowd.cheer = Math.min(1, crowd.cheer + 0.25);
      break;
    case 'sever': {
      const gib = spawnGib(ev); if (mine && ev.part === 'head') myHeadGib = gib;
      blood.burst(V(ev.pos), 70, V(ev.vel).normalize(), 1.4); audio.squelch(); audio.cheer();
      crowd.cheer = 1;
      floaters.push({ pos: V(ev.pos).add(new THREE.Vector3(0, 0.3, 0)), text: ev.part === 'head' ? 'DECAPITATED!' : 'SEVERED!', life: 1.4, color: '#ffd23f', big: true });
      if (mine) { shake = 0.12; hurtFlash = 1; }
      if (p && ev.part !== 'head') {
        const gone = (k) => p.parts[k].cut || ev.part === k;
        const kind = ev.part.startsWith('leg') && gone('legR') && gone('legL') ? 'both_legs' : ev.part.startsWith('arm') && gone('armR') && gone('armL') ? 'no_arms' : ev.part;
        say(ev.id, kind);
      }
      break;
    }
    case 'quip': setTimeout(() => say(ev.id, ev.kind), 900); break;
    case 'parry': audio.clang(); say(ev.id, 'parry'); if (ev.by === myId) shake = 0.05;
      for (let i = 0; i < 20; i++) sparks.spawn(V(ev.pos));
      break;
    case 'wrongblock': say(ev.id, 'wrongblock'); break;
    case 'chamber': audio.clang(); audio.clang(); say(ev.id, 'chamber'); floaters.push({ pos: V(ev.pos), text: 'CHAMBER!', life: 1.2, color: '#3fe0ff', big: true });
      for (let i = 0; i < 30; i++) sparks.spawn(V(ev.pos));
      break;
    case 'guardbreak': audio.thud(); say(ev.id, 'guardbreak'); if (mine) shake = 0.08; break;
    case 'kickSwing': audio.whoosh('low'); break;
    case 'kick': audio.thud(); say(ev.id, 'kicked'); if (mine) { shake = 0.1; hurtFlash = 0.4; } floaters.push({ pos: V(ev.pos), text: 'KICKED!', life: 1, color: '#fff', big: true }); break;
    case 'death': audio.slide(); break;
    case 'jump': if (mine) audio.boing(1); break;
    case 'hop': audio.boing(1.6, mine ? 0.12 : 0.06); break;
    case 'roundEnd': audio.cheer(); crowd.cheer = 1; break;
    case 'round': clearGibs(); blood.clearDecals(); bubbles.length = 0; myHeadGib = null; break;
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
function interpPlayers() {
  if (!cur) return [];
  if (!prev) return cur.players;
  const k = Math.min(1.2, (performance.now() - curT) / Math.max(16, curT - prevT));
  return cur.players.map((p) => {
    if (!p) return null;
    const q = prev.players.find((o) => o && o.id === p.id);
    if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 2 || q.state !== p.state || q.spawn !== p.spawn) return p;
    const L = (a, b) => a + (b - a) * k;
    const dy = Math.atan2(Math.sin(p.yaw - q.yaw), Math.cos(p.yaw - q.yaw));
    return { ...p, x: L(q.x, p.x), y: L(q.y, p.y), z: L(q.z, p.z), yaw: q.yaw + dy * k, walk: L(q.walk, p.walk), st: L(q.st, p.st), stun: L(q.stun, p.stun), deathT: L(q.deathT, p.deathT) };
  });
}

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

  // Floating damage numbers and speech bubbles.
  for (const f of floaters) { const s = project(f.pos); if (!s) continue; hctx.globalAlpha = Math.min(1, f.life * 2); text(f.text, s[0], s[1], f.big ? 30 : 20, f.color); hctx.globalAlpha = 1; }
  for (const b of bubbles) {
    const p = players.find((q) => q && q.id === b.id); if (!p) continue;
    const s = p.id === myId ? [w / 2, h * 0.72] : project(V(skeleton(p).head).add(new THREE.Vector3(0, 0.45, 0))); if (!s) continue;
    hctx.font = '16px Trebuchet MS, sans-serif'; const tw = hctx.measureText(b.text).width + 22;
    hctx.globalAlpha = Math.min(1, b.life * 3); hctx.fillStyle = '#fff';
    hctx.beginPath(); hctx.roundRect(s[0] - tw / 2, s[1] - 20, tw, 30, 12); hctx.fill();
    hctx.beginPath(); hctx.moveTo(s[0] - 7, s[1] + 9); hctx.lineTo(s[0], s[1] + 20); hctx.lineTo(s[0] + 7, s[1] + 9); hctx.fill();
    hctx.fillStyle = '#2a1e33'; hctx.textAlign = 'center'; hctx.fillText(b.text, s[0], s[1] + 1); hctx.globalAlpha = 1;
  }
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
    if (me.weapon && !wheel.hiding()) text(`${WEAPONS[me.weapon].emoji} ${WEAPONS[me.weapon].name}`, bx + 2, by - 30, 15, '#fff', 'left');
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
  if (joined && !locked()) text('Click to fight (the mouse looks around)', w / 2, h - 90, 22, '#fff');
  hctx.font = '13px Trebuchet MS, sans-serif'; hctx.textAlign = 'center'; hctx.fillStyle = '#ffffffb0';
  hctx.fillText('WASD move · hold left click, steer, release to swing · hold right click + steer to block · right click mid-swing feints · F kick · M mute', w / 2, h - 14);
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
        for (const p of players) if (p && p.id !== myId && st.result[p.id] && isMe) { const o = WEAPONS[st.result[p.id]]; text(`${p.name} got ${o.emoji} ${o.name}`, cx, cy + R + 114, 16, TEAM_CSS[p.color]); }
      } else text('Spinning…', cx, cy + R + 56, 24, '#fff');
      for (const c of confetti) { hctx.fillStyle = c.c; hctx.save(); hctx.translate(c.x, c.y); hctx.rotate(c.r); hctx.fillRect(-4, -2, 8, 4); hctx.restore(); }
    },
    step(dt) { for (const c of confetti) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.r += dt * 8; c.life -= dt; } confetti = confetti.filter((c) => c.life > 0); },
  };
})();

// ---------- main loop ----------
let last = performance.now(), clock = 0, lastPhase = '';
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; clock += dt;
  const players = interpPlayers();
  const me = players.find((p) => p && p.id === myId) || null;
  const opp = players.find((p) => p && p.id !== myId) || null;
  if (cur && cur.phase !== lastPhase) { if (cur.phase === 'fight') fightFlash = 1; lastPhase = cur.phase; }
  fightFlash = Math.max(0, fightFlash - dt);
  if (me) sendInput(dt);

  // Sync knight meshes with the players in the arena.
  const ids = new Set(players.filter(Boolean).map((p) => p.id));
  for (const [id, k] of knights) if (!ids.has(id)) { k.dispose(); knights.delete(id); }
  for (const p of players) {
    if (!p) continue;
    let k = knights.get(p.id);
    if (!k || k.color !== p.color) { if (k) k.dispose(); k = new Knight(p.color); knights.set(p.id, k); }
    const isMe = p.id === myId;
    // Use the local mouse look for our own body so the sword follows the camera instantly.
    const pose = isMe && !p.dead ? { ...p, yaw: look.yaw, pitch: look.pitch } : p;
    k.update(pose, skeleton(pose), isMe && !p.dead);
  }

  // Camera.
  if (me && !me.dead) {
    const sk = skeleton({ ...me, yaw: look.yaw });
    camera.position.set(sk.head[0], sk.head[1] + 0.02, sk.head[2]);
    camera.rotation.set(look.pitch, look.yaw, 0);
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
  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);

  blood.step(dt); stepGibs(dt); sparks.step(dt); updateCrowd(clock, dt); wheel.step(dt);
  for (const f of floaters) { f.life -= dt; f.pos.y += 0.4 * dt; }
  for (const b of bubbles) b.life -= dt;
  for (const a of [floaters, bubbles]) for (let i = a.length - 1; i >= 0; i--) if (a[i].life <= 0) a.splice(i, 1);

  renderer.render(scene, camera);
  drawHud(players, me, opp);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- goofy synth sounds ----------
const audio = {
  ctx: null, muted: false,
  init() { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch {} } else if (this.ctx.state === 'suspended') this.ctx.resume(); },
  ok() { return this.ctx && !this.muted; },
  env(node, t, a, d, peak = 0.3) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); g.connect(this.ctx.destination); return g; },
  noise(dur) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; return s; },
  whoosh(dir) {
    if (!this.ok()) return; const t = this.ctx.currentTime, n = this.noise(0.25), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(dir === 'low' ? 400 : 900, t); f.frequency.exponentialRampToValueAtTime(dir === 'over' ? 300 : 2500, t + 0.2);
    n.connect(f); this.env(f, t, 0.03, 0.2, 0.25); n.start(t);
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
  horn() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [392, 523, 659].forEach((fr, i) => { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; this.env(o, t + i * 0.12, 0.01, 0.18, 0.06); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.25); });
  },
};

// For automated testing: ?debug exposes a couple of hooks.
if (params.has('debug')) window.duel = { send, look, camera, scene, get state() { return cur; }, get fx() { return { hurtFlash, shake, fightFlash }; } };
