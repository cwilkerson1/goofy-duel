// The knight's plate armour and the weapons, modelled after real pieces: plates are lathed (spun) from
// side profiles, blades are lofted from cross-sections (bevelled edges, a fuller groove, a tapering
// point), and axe and halberd heads are cut from outlines and thinned to an edge. Everything is built
// in metres. A piece's front faces -z (the way the knight looks), and limb pieces run along +y from
// the joint they hang from.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Spin a side profile [[radius, y], ...] (listed bottom to top) around the y axis. phiStart 0 is +z,
// so a front-only sector centres on PI.
export const lathe = (pts, seg = 24, phiStart = 0, phiLen = TAU) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, phiStart, phiLen);
const FRONT = (half) => [Math.PI - half, half * 2];
const BACK = (half) => [-half, half * 2];

// Move a geometry into place: scale, then rotate (x, y, z order), then translate.
function T(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  if (x || y || z) g.translate(x, y, z);
  return g;
}
// Bend every vertex by f(position) (a Vector3 it may change), then recompute normals.
function warp(g, f) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); f(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
// Merge pieces that share a material into one geometry (one draw call).
export function merge(list) {
  const flat = list.some((g) => !g.index);
  const gs = list.map((g) => { let h = flat && g.index ? g.toNonIndexed() : g; h = h.clone(); for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k); h.clearGroups(); return h; });
  return mergeGeometries(gs, false);
}
// Mirror left-right (and fix the triangle winding so the faces still point outwards).
function mirrorX(g) {
  const h = g.clone(); h.scale(-1, 1, 1);
  if (h.index) { const a = h.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { const p = h.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } }
  h.computeVertexNormals(); return h;
}

// A tube along a path of points, radius r(t) for t 0..1 along it (or a number). radial 4 makes a
// square bar, 6 or 8 a faceted one. Ends are capped.
export function tubeGeo(pts, r, radial = 10, caps = true) {
  pts = pts.map((p) => (p.isVector3 ? p : V3(...p)));
  const n = pts.length, rad = typeof r === 'function' ? r : () => r;
  const Tn = pts.map((p, i) => pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  let N = Math.abs(Tn[0].y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0); N.addScaledVector(Tn[0], -N.dot(Tn[0])).normalize();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    if (i) N.addScaledVector(Tn[i], -N.dot(Tn[i])).normalize();
    const B = Tn[i].clone().cross(N), rr = rad(i / (n - 1));
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU + Math.PI / radial, c = Math.cos(a) * rr, s = Math.sin(a) * rr;
      pos.push(pts[i].x + N.x * c + B.x * s, pts[i].y + N.y * c + B.y * s, pts[i].z + N.z * c + B.z * s); uv.push(k / radial, i / (n - 1));
    }
  }
  const W = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) { const a = i * W + k, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
  if (caps) for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
    if (rad(i / (n - 1)) < 1e-4) continue;
    const ctr = pos.length / 3; pos.push(pts[i].x, pts[i].y, pts[i].z); uv.push(0.5, 0.5);
    for (let k = 0; k < radial; k++) { const a = i * W + k, b = a + 1; if (sgn > 0) idx.push(ctr, a, b); else idx.push(ctr, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
const bez = (a, c, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return V3(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * (a[2] || 0) + 2 * u * t * (c[2] || 0) + t * t * (b[2] || 0)); });

// A blade lofted from cross-sections along +y, edges along ±x: flat bevels to each edge, an optional
// fuller (groove) down the middle for the first `fuller` share of the length, tapering in width and
// thickness to an ogival point over the last `tip` share. With no fuller it's a diamond section.
export function bladeGeo({ len, w0, w1 = w0 * 0.65, th0 = 0.008, th1 = th0 * 0.55, tip = 0.18, fuller = 0, fw = 0.32, fd = 0.4, n = 30 }) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = t * len, s = clamp((t - (1 - tip)) / tip, 0, 1);
    const hw = (lerp(w0, w1, Math.min(t / (1 - tip), 1)) / 2) * (1 - s) * (1 + 0.6 * s);
    const h = (lerp(th0, th1, t) / 2) * (1 - 0.75 * s * s);
    const g = fuller ? clamp((fuller - t) / 0.07, 0, 1) : 0;
    const bev = hw * lerp(1, 0.42, g), f = hw * fw * g, d = h * fd * g;
    rows.push([[hw, 0], [hw - bev, h], [f, h], [f * 0.45, h - d], [-f * 0.45, h - d], [-f, h], [-hw + bev, h], [-hw, 0]].map(([x, z]) => [x, y, z]));
  }
  const pos = [], uv = [], idx = [], P = 8;
  for (const side of [1, -1]) for (let j = 0; j < P - 1; j++) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) for (const jj of [j, j + 1]) { const [x, y, z] = rows[i][jj]; pos.push(x, y, z * side); uv.push(jj / (P - 1) * 0.3, (i / n) * 3); }
    for (let i = 0; i < n; i++) { const a0 = base + i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3; if (side > 0) idx.push(a0, a1, b0, b0, a1, b1); else idx.push(a0, b0, a1, b0, b1, a1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}

// A flat head (axe, halberd, scythe) cut from an outline in the x-y plane, then thinned toward its
// cutting edge: thick(x, y) is the share of full thickness kept at that point (1 at the eye).
function plateHead(draw, thick, depth = 0.02, bevel = 0.0025) {
  const sh = new THREE.Shape(); draw(sh);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return warp(g.toNonIndexed(), (v) => { v.z *= clamp(thick(v.x, v.y), 0.06, 1); });
}
// A sword hilt's crossguard: a bar along x, thickest at the centre, the ends curling toward the blade
// (curl > 0) or the hand (curl < 0), with a little knob on each end.
function crossGeo(w, r, curl = 0) {
  const pts = Array.from({ length: 21 }, (_, i) => { const t = i / 20 * 2 - 1; return V3(t * w / 2, curl * t * t * Math.abs(t), 0); });
  const bar = tubeGeo(pts, (t) => r * (1 - 0.35 * Math.abs(t * 2 - 1) ** 1.5), 8);
  const knobs = [-1, 1].map((s) => T(new THREE.SphereGeometry(r * 1.05, 10, 8), { x: s * w / 2, y: curl }));
  const block = T(new THREE.BoxGeometry(r * 3.2, r * 3.4, r * 2.6), { y: r * 0.8 }); // the écusson where the blade passes through
  return merge([bar, ...knobs, block]);
}
// A grip from y0 (bottom) up to y1, swelling a little in the middle.
const gripGeo = (y0, y1, r0, r1 = r0, swell = 1.12) => lathe([[r0, y0], [r0 * 1.04, y0 + 0.01], [lerp(r0, r1, 0.5) * swell, (y0 + y1) / 2], [r1 * 1.04, y1 - 0.01], [r1, y1]], 12);
// Pommels: a wheel (a disc seen side-on), a scent-stopper (a pear), or a plain knob.
const wheelPommel = (r, t, y) => T(lathe([[r * 0.55, -t / 2], [r * 0.95, -t * 0.35], [r, 0], [r * 0.95, t * 0.35], [r * 0.55, t / 2]], 20), { rx: Math.PI / 2, y });
const pearPommel = (r, h, y) => lathe([[0.012, y + h * 0.5], [r * 0.95, y + h * 0.2], [r, y], [r * 0.7, y - h * 0.3], [r * 0.25, y - h * 0.48], [0.004, y - h * 0.5]].reverse(), 16);
// Steel strips riveted down a haft below a head, front and back (they stop it being cut through).
const langets = (yTop, len, r) => merge([1, -1].flatMap((s) => [T(new THREE.BoxGeometry(0.012, len, 0.004), { y: yTop - len / 2, z: s * (r + 0.002) }),
  ...[0.25, 0.75].map((k) => T(new THREE.SphereGeometry(0.0045, 6, 4), { y: yTop - len * k, z: s * (r + 0.004) }))]));
const haft = (y0, y1, r, sides = 10, rTop = r) => lathe([[r * 1.12, y0], [r * 1.12, y0 + 0.03], [r, y0 + 0.05], [rTop, y1]], sides);

// ---------- weapons ----------
// M holds the materials: blade() (a fresh one each call, so it can glow on its own), steel, dark,
// wood, grip (leather), brass, gold, jewel. Each weapon's origin is the grip, pointing up +y along
// its reach, with its edge or striking face toward +x.
export function buildWeapon(id, L, M) {
  const g = new THREE.Group(), byMat = new Map();
  const put = (mat, ...geos) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(...geos); };
  let glow = M.blade();
  const sword = ({ len = L, from = 0.03, w0, w1, th0, th1, tip, fuller, fw, guardW, guardR = 0.0085, curl = 0, gripLen, gripR = 0.016, pommel, guardMat = M.steel, pommelMat = M.steel, gripMat = M.grip }) => {
    put(glow, T(bladeGeo({ len: len - from + 0.03, w0, w1, th0, th1, tip, fuller, fw }), { y: from }));
    put(guardMat, T(crossGeo(guardW, guardR, curl), { y: from - guardR * 1.2 }));
    put(gripMat, gripGeo(-gripLen, from - guardR * 2.2, gripR));
    put(pommelMat, pommel(-gripLen));
  };
  switch (id) {
    case 'longsword':
      sword({ w0: 0.05, w1: 0.032, th0: 0.009, th1: 0.005, tip: 0.16, fuller: 0.6, fw: 0.3, guardW: 0.24, gripLen: 0.2, pommel: (y) => pearPommel(0.028, 0.06, y - 0.025) }); break;
    case 'arming':
      sword({ w0: 0.05, w1: 0.03, th0: 0.008, th1: 0.0045, tip: 0.17, fuller: 0.7, fw: 0.36, guardW: 0.19, guardR: 0.0075, gripLen: 0.1, pommel: (y) => wheelPommel(0.032, 0.022, y - 0.02) }); break;
    case 'excalibur': {
      glow = M.blade(true);
      sword({ w0: 0.058, w1: 0.036, th0: 0.009, th1: 0.005, tip: 0.15, fuller: 0.75, fw: 0.3, guardW: 0.28, guardR: 0.009, curl: -0.03, gripLen: 0.17, pommel: (y) => wheelPommel(0.036, 0.024, y - 0.022), guardMat: M.gold, pommelMat: M.gold });
      put(M.gold, ...[0.15, 0.3, 0.45, 0.6, 0.75].map((k) => T(new THREE.TorusGeometry(0.0172, 0.0018, 4, 16), { rx: Math.PI / 2, y: -0.17 * k }))); // gold wire round the grip
      put(M.jewel, ...[1, -1].map((s) => T(new THREE.SphereGeometry(0.009, 12, 8), { y: 0.022, z: s * 0.012 })), ...[1, -1].map((s) => T(new THREE.SphereGeometry(0.011, 12, 8), { y: -0.192, z: s * 0.01 })));
      break;
    }
    case 'greatsword': {
      // A Zweihänder: long two-hand grip with a ring between the hands, a leather-wrapped ricasso to
      // hold the blade by, little parrying hooks, then the long blade.
      put(glow, T(bladeGeo({ len: L - 0.2, w0: 0.068, w1: 0.044, th0: 0.011, th1: 0.006, tip: 0.13, fuller: 0.45, fw: 0.3 }), { y: 0.22 }));
      put(glow, T(new THREE.BoxGeometry(0.042, 0.2, 0.011), { y: 0.12 }));
      put(M.grip, T(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10), { y: 0.1, sz: 0.6, sx: 1.6 }));
      for (const s of [1, -1]) put(M.steel, tubeGeo(bez([s * 0.02, 0.22], [s * 0.065, 0.23], [s * 0.07, 0.19], 8), (t) => 0.007 * (1 - t * 0.6), 6));
      put(M.steel, T(crossGeo(0.4, 0.01, 0.015), { y: 0.012 }));
      put(M.grip, gripGeo(-0.33, 0.0, 0.019, 0.019, 1.06));
      put(M.steel, T(new THREE.TorusGeometry(0.021, 0.006, 6, 16), { rx: Math.PI / 2, y: -0.16 }), pearPommel(0.034, 0.07, -0.36));
      break;
    }
    case 'dagger': {
      // A rondel dagger: a stiff, thick, diamond-section thrusting blade between two steel discs.
      put(glow, T(bladeGeo({ len: L - 0.0, w0: 0.024, w1: 0.014, th0: 0.013, th1: 0.008, tip: 0.35 }), { y: 0.016 }));
      put(M.steel, T(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), { y: 0.011 }), T(new THREE.CylinderGeometry(0.033, 0.033, 0.01, 20), { y: -0.108 }));
      put(M.grip, gripGeo(-0.103, 0.007, 0.0135));
      put(M.brass, T(new THREE.SphereGeometry(0.008, 8, 6), { y: -0.118 }));
      break;
    }
    case 'axe': {
      // A bearded axe: the edge sweeps down into a long "beard", thick at the eye, thin at the edge.
      const yc = 0.74;
      put(M.wood, T(haft(-0.27, 0.87, 0.019), { sz: 0.82 }));
      put(glow, T(plateHead((s) => { s.moveTo(0.015, 0.04); s.lineTo(0.07, 0.034); s.quadraticCurveTo(0.13, 0.05, 0.2, 0.108); s.quadraticCurveTo(0.235, -0.01, 0.196, -0.138); s.quadraticCurveTo(0.12, -0.09, 0.068, -0.036); s.lineTo(0.015, -0.042); },
        (x) => lerp(1, 0.08, clamp((x - 0.05) / 0.15, 0, 1)), 0.022), { y: yc }));
      put(M.dark, T(lathe([[0.03, -0.05], [0.027, -0.02], [0.027, 0.02], [0.03, 0.05]], 14), { y: yc, sz: 0.85 }), T(new THREE.BoxGeometry(0.028, 0.05, 0.03), { x: -0.035, y: yc }));
      put(M.dark, langets(yc - 0.045, 0.13, 0.016));
      break;
    }
    case 'hammer': {
      // A war hammer on a pole: a toothed hammer face, a back spike and a short top spike.
      const yc = 0.82;
      put(M.wood, haft(-0.42, 0.88, 0.021, 8));
      put(M.dark, T(new THREE.BoxGeometry(0.052, 0.11, 0.052), { y: yc }), langets(yc - 0.05, 0.2, 0.021));
      put(glow, T(new THREE.CylinderGeometry(0.037, 0.03, 0.08, 4), { ry: Math.PI / 4, rz: -Math.PI / 2, x: 0.066, y: yc }));
      for (const a of [-1, 1]) for (const b of [-1, 1]) put(glow, T(new THREE.ConeGeometry(0.011, 0.02, 4), { rz: -Math.PI / 2, x: 0.115, y: yc + a * 0.015, z: b * 0.015 }));
      put(glow, T(new THREE.ConeGeometry(0.024, 0.12, 4), { ry: Math.PI / 4, rz: Math.PI / 2, x: -0.085, y: yc }));
      put(M.dark, T(new THREE.ConeGeometry(0.015, 0.1, 4), { ry: Math.PI / 4, y: yc + 0.105 }));
      break;
    }
    case 'halberd': {
      // Ash pole; a broad axe blade facing the target, a hooked back spike, and a spearpoint on top.
      put(M.wood, haft(-0.35, 1.37, 0.02, 8));
      put(M.dark, T(new THREE.CylinderGeometry(0.024, 0.022, 0.06, 8), { y: -0.33 })); // butt cap
      put(M.dark, lathe([[0.026, 1.06], [0.024, 1.1], [0.024, 1.34], [0.02, 1.38]], 10), langets(1.07, 0.26, 0.02));
      put(glow, plateHead((s) => { s.moveTo(0.02, 1.33); s.lineTo(0.07, 1.33); s.quadraticCurveTo(0.15, 1.35, 0.218, 1.405); s.quadraticCurveTo(0.188, 1.21, 0.206, 1.015); s.quadraticCurveTo(0.12, 1.06, 0.07, 1.09); s.lineTo(0.02, 1.09); },
        (x) => lerp(1, 0.1, clamp((x - 0.05) / 0.15, 0, 1)), 0.014, 0.002));
      put(glow, tubeGeo(bez([-0.02, 1.22], [-0.12, 1.21], [-0.165, 1.13], 10), (t) => 0.016 * (1 - t) + 0.0015, 4));
      put(glow, T(bladeGeo({ len: 0.2, w0: 0.036, w1: 0.026, th0: 0.022, th1: 0.014, tip: 0.5 }), { y: 1.365 }));
      break;
    }
    case 'scythe': {
      // A war scythe: the blade set on the pole's end, its edge on the inside of the curve, a thick
      // spine along the outside.
      put(M.wood, haft(-0.35, 1.32, 0.021, 10));
      put(M.dark, lathe([[0.026, 1.25], [0.026, 1.33]], 12));
      const spine = bez([0.0, 1.345], [0.3, 1.372], [0.56, 1.165], 24), edge = bez([0.02, 1.272], [0.33, 1.255], [0.56, 1.165], 24);
      const at = (curve, x) => { for (let i = 1; i < curve.length; i++) if (curve[i].x >= x) { const a = curve[i - 1], b = curve[i]; return lerp(a.y, b.y, (x - a.x) / (b.x - a.x || 1)); } return curve[curve.length - 1].y; };
      put(glow, plateHead((s) => { s.moveTo(0.0, 1.345); s.quadraticCurveTo(0.3, 1.372, 0.56, 1.165); s.quadraticCurveTo(0.33, 1.255, 0.02, 1.272); s.lineTo(0.0, 1.29); },
        (x, y) => { const sp = at(spine, x), ed = at(edge, x); return 0.12 + 0.88 * clamp((y - ed) / Math.max(0.004, sp - ed), 0, 1) ** 1.4; }, 0.012, 0.0015));
      break;
    }
    case 'mace': {
      // A Gothic flanged mace: a steel haft with a leather grip, seven pointed flanges round the head.
      put(M.dark, lathe([[0.017, -0.1], [0.024, -0.096], [0.024, -0.084], [0.016, -0.08], [0.016, 0.57], [0.021, 0.6]], 12));
      put(M.grip, gripGeo(-0.075, 0.1, 0.021, 0.021, 1.05));
      put(glow, lathe([[0.02, 0.58], [0.03, 0.6], [0.03, 0.75], [0.02, 0.77]], 14), lathe([[0.016, 0.76], [0.021, 0.775], [0.012, 0.79], [0.002, 0.805]], 12));
      const fl = plateHead((s) => { s.moveTo(0.02, 0.585); s.quadraticCurveTo(0.06, 0.6, 0.076, 0.65); s.lineTo(0.068, 0.68); s.quadraticCurveTo(0.082, 0.72, 0.062, 0.75); s.quadraticCurveTo(0.04, 0.762, 0.02, 0.772); },
        (x) => lerp(1, 0.45, clamp((x - 0.03) / 0.05, 0, 1)), 0.01, 0.002);
      for (let k = 0; k < 7; k++) put(glow, fl.clone().rotateY((k / 7) * TAU));
      break;
    }
    case 'flail': {
      // Wooden handle with an iron cap, then a loose chain and spiked ball on their own pivot.
      put(M.wood, haft(-0.05, 0.35, 0.021, 10));
      put(M.dark, lathe([[0.025, 0.33], [0.026, 0.37], [0.016, 0.39]], 12), T(new THREE.TorusGeometry(0.012, 0.004, 6, 12), { y: 0.395 }));
      const cg = new THREE.Group(); cg.position.y = 0.38; g.add(cg); g.userData.chain = cg;
      const links = [];
      for (let k = 0; k < 9; k++) links.push(T(new THREE.TorusGeometry(0.013, 0.0042, 6, 12), { sy: 1.5, ry: (k % 2) * Math.PI / 2, y: 0.025 + k * 0.04 }));
      const ball = [T(new THREE.SphereGeometry(0.054, 20, 14), { y: 0.45 })];
      for (let k = 0; k < 16; k++) {
        const yy = 1 - (k + 0.5) / 8, rr = Math.sqrt(1 - yy * yy), a = k * 2.39996, u = V3(Math.cos(a) * rr, yy, Math.sin(a) * rr);
        const c = new THREE.ConeGeometry(0.013, 0.045, 4); c.translate(0, 0.07, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), u)); c.translate(0, 0.45, 0); ball.push(c);
      }
      const chainMesh = new THREE.Mesh(merge(links), M.dark), ballMesh = new THREE.Mesh(merge(ball), glow);
      for (const m of [chainMesh, ballMesh]) { m.castShadow = true; cg.add(m); }
      break;
    }
    case 'pick': {
      // A war pick: a long, slightly drooping square spike for punching through plate, and a small
      // hammer face behind it.
      const yc = 0.74;
      put(M.wood, haft(-0.25, 0.79, 0.02, 10));
      put(M.dark, T(new THREE.BoxGeometry(0.045, 0.09, 0.045), { y: yc }), langets(yc - 0.04, 0.16, 0.02));
      put(glow, tubeGeo(bez([0.02, yc + 0.005], [0.13, yc + 0.006], [0.222, yc - 0.03], 14), (t) => 0.017 * (1 - t) + 0.0012, 4));
      put(M.dark, T(new THREE.CylinderGeometry(0.02, 0.022, 0.05, 10), { rz: Math.PI / 2, x: -0.045, y: yc }));
      put(M.dark, T(new THREE.ConeGeometry(0.012, 0.06, 4), { y: yc + 0.075 }));
      break;
    }
    default:
      sword({ w0: 0.05, w1: 0.032, th0: 0.009, th1: 0.005, tip: 0.16, fuller: 0.6, fw: 0.3, guardW: 0.22, gripLen: 0.17, pommel: (y) => pearPommel(0.028, 0.06, y - 0.025) });
  }
  for (const [mat, geos] of byMat) { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; g.add(m); }
  g.userData.glowMat = glow;
  return g;
}

// ---------- plate armour ----------
// Lengths the limb pieces are modelled at; the game stretches them a little to fit the skeleton.
export const UPPER_ARM = 0.29, FOREARM = 0.31, THIGH = 0.44, SHIN = 0.4;
// A slight keel down the front of a plate, the way breastplates and greaves are raised along the middle.
const keel = (amt, w, y0, y1) => (v) => { if (v.z < 0) v.z -= amt * Math.max(0, 1 - Math.abs(v.x) / w) * clamp(Math.min(v.y - y0, y1 - v.y) / 0.05, 0, 1); };
// A houndskull visor's snout: the front pushed out into a point around the eyes and breaths.
const snout = (v) => { if (v.z < 0) { const k = Math.max(0, 1 - Math.abs(v.x) / 0.1), b = Math.max(0, 1 - (v.y / 0.11) ** 2); v.z -= 0.03 * k * k * b; } };

export function knightGeometry() {
  const G = {};
  // Torso pieces, from the hips (y 0) up to the neck (y 0.6).
  G.cuirass = merge([
    warp(T(lathe([[0.15, -0.02], [0.162, 0.05], [0.152, 0.13], [0.165, 0.24], [0.195, 0.35], [0.212, 0.44], [0.205, 0.5], [0.17, 0.55], [0.11, 0.585], [0.08, 0.6]], 36), { sz: 0.8 }), keel(0.01, 0.07, 0.1, 0.52)),
    ...[0, 1, 2].map((k) => T(lathe([[0.176 + k * 0.008, -0.045 - 0.048 * k], [0.162 + k * 0.008, 0.005 - 0.048 * k]], 36), { sz: 0.8 })), // faulds: hooped plates over the hips
    T(lathe([[0.105, 0.55], [0.095, 0.6], [0.076, 0.64], [0.071, 0.67]], 28), { sz: 0.9 }), // gorget round the neck
  ]);
  const tabardPts = [[0.235, -0.36], [0.205, -0.15], [0.188, 0], [0.18, 0.1], [0.186, 0.22], [0.205, 0.34], [0.224, 0.44], [0.216, 0.5], [0.182, 0.545], [0.122, 0.585]];
  const tabardPanel = (phi) => {
    const g = T(lathe(tabardPts, 18, ...phi), { sz: 0.82 }), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + 0.36) / 0.945); // map the texture by height, not by point count
    return g;
  };
  G.tabard = merge([tabardPanel(FRONT(0.95)), tabardPanel(BACK(0.95))]);
  G.belt = T(lathe([[0.19, 0.04], [0.194, 0.065], [0.19, 0.09]], 32), { sz: 0.82 });
  G.buckle = merge([T(new THREE.BoxGeometry(0.06, 0.055, 0.008), { y: 0.065, z: -0.163 }), T(new THREE.BoxGeometry(0.008, 0.045, 0.006), { y: 0.065, z: -0.168 })]);
  // Spaulder (right shoulder; the left is its mirror image): a domed cop with three lames below it.
  G.pauldR = merge([
    T(new THREE.SphereGeometry(0.095, 22, 10, 0, TAU, 0, Math.PI * 0.55), { sx: 1.0, sy: 0.9, sz: 1.05, x: 0.012 }),
    ...[0, 1, 2].map((k) => T(lathe([[0.1 + k * 0.004, -0.046 - 0.03 * k], [0.094 + k * 0.004, -0.012 - 0.03 * k]], 18, Math.PI / 2 - 1.6, 3.2), { x: 0.012, sz: 1.05 })),
  ]);
  G.pauldL = mirrorX(G.pauldR);
  // Arm, from shoulder (y 0) to elbow (y UPPER_ARM): a rerebrace tube and an elbow cop facing +z.
  G.upperArm = merge([
    lathe([[0.05, 0.015], [0.054, 0.05], [0.052, 0.17], [0.047, UPPER_ARM - 0.02]], 18),
    T(new THREE.TorusGeometry(0.054, 0.004, 6, 18), { rx: Math.PI / 2, y: 0.05 }),
    T(new THREE.SphereGeometry(0.058, 16, 10, 0, TAU, 0, Math.PI * 0.5), { rx: Math.PI / 2, sy: 1.1, y: UPPER_ARM, z: 0.004 }),
  ]);
  // Forearm, elbow (y 0) to hand (y FOREARM): a vambrace.
  G.forearm = merge([lathe([[0.047, 0.02], [0.05, 0.08], [0.045, 0.21], [0.04, FOREARM - 0.03]], 18), T(new THREE.TorusGeometry(0.041, 0.0035, 6, 18), { rx: Math.PI / 2, y: FOREARM - 0.035 })]);
  // Gauntlet around the hand (origin), forearm running down -y: flared cuff, a plate over the back of
  // the hand, knuckle lames, and four curled finger lames with the thumb.
  const fingers = [];
  for (let k = 0; k < 4; k++) fingers.push(T(new THREE.TorusGeometry(0.021, 0.0105, 6, 10, Math.PI * 1.25), { ry: Math.PI / 2, rx: 0.4, x: -0.03 + k * 0.02, y: 0.015 - Math.abs(k - 1.5) * 0.004, z: -0.005 }));
  G.gauntlet = merge([
    lathe([[0.064, -0.13], [0.056, -0.1], [0.046, -0.065], [0.044, -0.05]], 18),
    T(new THREE.SphereGeometry(0.05, 16, 10), { sx: 1, sy: 0.85, sz: 0.55, y: -0.02, z: 0.012 }),
    ...[0, 1].map((k) => T(new THREE.SphereGeometry(0.048, 14, 6, 0, TAU, 0, Math.PI * 0.35), { rx: Math.PI / 2 + 0.3, sx: 1.05, y: 0.012 + k * 0.012, z: 0.008 })),
    ...fingers,
    T(new THREE.CapsuleGeometry(0.012, 0.04, 3, 8), { rz: Math.PI / 2 - 0.4, x: -0.04, y: -0.005, z: -0.03 }),
  ]);
  // Leg, hip (y 0) to knee: a cuisse over the front of the thigh, mail behind it.
  G.cuisse = merge([warp(lathe([[0.08, 0.035], [0.089, 0.12], [0.086, 0.25], [0.073, THIGH - 0.05]], 18, ...FRONT(1.95)), keel(0.006, 0.04, 0.05, THIGH - 0.06))]);
  G.thighMail = lathe([[0.072, 0.0], [0.077, 0.15], [0.064, THIGH - 0.02]], 14);
  // Knee to ankle: a greave shaped to the calf, with a ridge down the shin.
  G.greave = warp(lathe([[0.05, 0.035], [0.061, 0.09], [0.066, 0.16], [0.056, 0.27], [0.047, SHIN - 0.02]], 20), keel(0.008, 0.035, 0.05, SHIN - 0.03));
  // Poleyn at the knee (in the shin's frame): a cop over the kneecap, lames above and below, and a
  // wing on the outer side (-x for the right leg).
  G.poleynR = merge([
    T(new THREE.SphereGeometry(0.06, 16, 10, 0, TAU, 0, Math.PI * 0.5), { rx: -Math.PI / 2, sy: 1.15, z: -0.03 }),
    T(lathe([[0.07, -0.08], [0.067, -0.05]], 14, ...FRONT(1.4)), { z: 0.0 }), T(lathe([[0.066, 0.05], [0.07, 0.08]], 14, ...FRONT(1.4)), { z: 0.0 }),
    T(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 16), { rz: Math.PI / 2, sz: 1.3, x: -0.065, y: 0.005, z: -0.01 }),
  ]);
  G.poleynL = mirrorX(G.poleynR);
  // Sabaton (the steel shoe), origin at the sole under the ankle, toe toward -z: a heel cup, five
  // overlapping lames over the instep, a rounded toe cap; plus a leather sole.
  G.sabaton = merge([
    T(new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI * 0.6), { sx: 1.0, sy: 1.1, sz: 1.1, y: 0.035, z: 0.045 }),
    ...[0, 1, 2, 3, 4].map((k) => T(new THREE.CylinderGeometry(0.058 - k * 0.0065, 0.058 - k * 0.0065, 0.1 - k * 0.006, 14, 1, true, 0, Math.PI), { rz: Math.PI / 2, y: 0.026, z: 0.005 - k * 0.04 })),
    T(new THREE.SphereGeometry(0.045, 14, 8, 0, TAU, 0, Math.PI / 2), { sx: 1.0, sy: 0.75, sz: 1.2, y: 0.026, z: -0.15 }),
    lathe([[0.052, 0.06], [0.05, 0.12]], 16),
  ]);
  G.sole = T(new THREE.BoxGeometry(0.1, 0.026, 0.28), { y: 0.013, z: -0.055 });
  // The helm: a great bascinet with a pointed skull, a snouted visor with sights and breaths, rivets
  // where the visor pivots, and a mail aventail hanging round the neck.
  G.skull = lathe([[0.118, -0.13], [0.13, -0.08], [0.14, -0.02], [0.14, 0.05], [0.128, 0.1], [0.1, 0.145], [0.055, 0.175], [0.001, 0.195]], 36);
  const visorPts = [[0.11, -0.115], [0.142, -0.07], [0.152, -0.01], [0.153, 0.05], [0.14, 0.09], [0.118, 0.118]];
  const visorR = (y) => { for (let i = 1; i < visorPts.length; i++) if (visorPts[i][1] >= y) { const [r0, y0] = visorPts[i - 1], [r1, y1] = visorPts[i]; return lerp(r0, r1, (y - y0) / (y1 - y0)); } return 0.12; };
  G.visor = merge([warp(lathe(visorPts, 30, ...FRONT(1.3)), snout), ...[1, -1].map((s) => T(new THREE.SphereGeometry(0.011, 10, 8), { x: s * 0.142, y: 0.05 }))]);
  const holes = [];
  for (const [a0, a1] of [[-1.0, -0.06], [0.06, 1.0]]) holes.push(warp(lathe([[0.1545, 0.033], [0.1555, 0.045]], 14, Math.PI + a0, a1 - a0), snout)); // eye slits
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const phi = Math.PI - 0.32 - c * 0.11, y = -0.03 - r * 0.022, rr = visorR(y) + 0.0015, v = V3(Math.sin(phi) * rr, y, Math.cos(phi) * rr); snout(v);
    const h = new THREE.CircleGeometry(0.0045, 8); h.lookAt(V3(Math.sin(phi), 0, Math.cos(phi))); h.translate(v.x, v.y, v.z); holes.push(h);
  }
  G.slits = merge(holes);
  G.aventail = lathe([[0.19, -0.25], [0.166, -0.2], [0.136, -0.15], [0.12, -0.12]], 28);
  const feathers = [];
  for (let k = 0; k < 7; k++) {
    const f = warp(T(new THREE.SphereGeometry(1, 6, 12), { sx: 0.017, sy: 0.12, sz: 0.004, y: 0.12 }), (v) => { v.z += 0.9 * v.y * v.y; });
    feathers.push(T(f, { rx: 0.35 + k * 0.13, rz: (k % 2 ? 1 : -1) * 0.06 * k, y: 0.175, z: 0.03 }));
  }
  G.plume = merge(feathers);
  G.plumeHolder = T(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10), { rx: 0.5, y: 0.18, z: 0.025 });
  return G;
}
