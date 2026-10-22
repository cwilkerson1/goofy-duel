// Drawing the arena's traps (the rules are in shared/hazards.js). The layout arrives with every update;
// a new one (a new round) rebuilds the scenery. Everything moving is posed from the hazard clock.
import * as THREE from 'three';
import { HAZ, pendulum, vent, spikes } from '/shared/hazards.js';

// A soft round dot, for flame and smoke.
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A pool of particles drawn as one Points object. Additive flame fades by darkening its colour; smoke
// is normal-blended and fades the same way against the night.
function particles(scene, n, size, additive, tex) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.55 });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const ps = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, c: [1, 1, 1] }));
  let next = 0;
  return {
    spawn(x, y, z, vx, vy, vz, life, c) { const p = ps[next]; next = (next + 1) % n; Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, c }); },
    step(dt, rise) {
      ps.forEach((p, i) => {
        if (p.life > 0) { p.life -= dt; p.vy += rise * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        const k = Math.max(0, p.life / p.max), f = additive ? Math.sqrt(k) * k : k;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.life > 0 ? p.y : -99; pos[i * 3 + 2] = p.z;
        // Flame cools from white-yellow at the base to deep red at the tips.
        const c = additive ? [p.c[0] * f, p.c[1] * f * (0.4 + 0.6 * k), p.c[2] * f * k] : [p.c[0] * f, p.c[1] * f, p.c[2] * f];
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

// The pendulum's blade: a big double crescent, edges facing both ways along its swing, centred on (0,0)
// in the swing plane (x along the swing, y up).
function crescent() {
  const s = new THREE.Shape(), R = 1.05, A = 0.82;
  s.absarc(0, 0.62, R, -Math.PI / 2 - A, -Math.PI / 2 + A, false); // the cutting edge, curving down
  s.absarc(0, 0.95, R, -Math.PI / 2 + 0.72, -Math.PI / 2 - 0.72, true); // the back of the blade
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
  g.translate(0, 0, -0.0175); return g;
}

export function makeHazardView({ scene, MAT, stone, iron }) {
  const fire = particles(scene, 900, 0.75, true, puffTexture()), smoke = particles(scene, 300, 1.4, false, puffTexture());
  let built = null, root = null, pend = null, vents = [], plates = [], lastTh = 0;

  function build(L) {
    if (root) { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    root = new THREE.Group(); scene.add(root); built = L.id;
    const add = (m, parent = root) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    // Pillars and the beam across them.
    const P = HAZ.PEND, top = P.pivotY + 0.45;
    for (const [x, z] of L.pillars) {
      const col = add(new THREE.Mesh(new THREE.CylinderGeometry(HAZ.PILLAR.r * 0.9, HAZ.PILLAR.r, top, 20), stone)); col.position.set(x, top / 2, z);
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(HAZ.PILLAR.r * 2.4, 0.35, HAZ.PILLAR.r * 2.4), stone)); base.position.set(x, 0.17, z);
      const cap = add(new THREE.Mesh(new THREE.BoxGeometry(HAZ.PILLAR.r * 2.2, 0.3, HAZ.PILLAR.r * 2.2), stone)); cap.position.set(x, top + 0.15, z);
    }
    pend = null;
    if (L.kind === 'pendulum') {
      const beam = add(new THREE.Mesh(new THREE.BoxGeometry(HAZ.PILLAR.at * 2 + 1.2, 0.55, 0.6), iron));
      beam.position.set(0, top + 0.55, 0); beam.rotation.y = -L.ang;
      // The pendulum: a hub on the beam, an iron arm, and the blade.
      const hang = new THREE.Group(); hang.position.set(0, P.pivotY, 0); hang.rotation.y = -L.ang; root.add(hang);
      pend = new THREE.Group(); hang.add(pend);
      const hub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16), iron), hang); hub.rotation.x = Math.PI / 2;
      const arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, P.len, 10), iron), pend); arm.position.y = -P.len / 2;
      const collar = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), iron), pend); collar.position.y = -P.len + 0.12;
      const blade = add(new THREE.Mesh(crescent(), MAT.steel), pend); blade.position.y = -P.len - 0.15;
    }
    // Fire vents: an iron grate over a glowing pit.
    vents = L.vents.map((v) => {
      const g = new THREE.Group(); g.position.set(v.x, 0, v.z); root.add(g);
      const pit = new THREE.Mesh(new THREE.CircleGeometry(HAZ.VENT.r, 32), new THREE.MeshBasicMaterial({ color: 0x110805 }));
      pit.rotation.x = -Math.PI / 2; pit.position.y = 0.012; g.add(pit);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(HAZ.VENT.r * 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.016; g.add(glow);
      const rim = add(new THREE.Mesh(new THREE.TorusGeometry(HAZ.VENT.r, 0.07, 8, 40), iron), g); rim.rotation.x = Math.PI / 2; rim.position.y = 0.03;
      for (let k = -3; k <= 3; k++) {
        const len = 2 * Math.sqrt(HAZ.VENT.r ** 2 - (k * 0.22) ** 2), bar = add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), iron), g);
        bar.position.set(0, 0.035, k * 0.22);
      }
      const light = new THREE.PointLight(0xff7a2a, 0, 7, 1.6); light.position.y = 1; g.add(light);
      return { v, glow, light, was: 'idle' };
    });
    // Spike plates: an iron plate with holes, and a bed of spikes hidden under it.
    plates = L.plates.map((pl) => {
      const g = new THREE.Group(); g.position.set(pl.x, 0, pl.z); root.add(g);
      const h = HAZ.PLATE.half, plate = add(new THREE.Mesh(new THREE.BoxGeometry(h * 2, 0.05, h * 2), iron), g); plate.position.y = 0.025;
      const holes = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.8, h * 1.8), new THREE.MeshBasicMaterial({ map: holesTexture(), transparent: true, depthWrite: false }));
      holes.rotation.x = -Math.PI / 2; holes.position.y = 0.052; g.add(holes);
      const cone = new THREE.ConeGeometry(0.045, 0.6, 6); cone.translate(0, 0.3, 0);
      const bed = new THREE.InstancedMesh(cone, MAT.darkSteel, 16), m = new THREE.Matrix4();
      for (let i = 0; i < 16; i++) { m.makeTranslation(((i % 4) - 1.5) * h * 0.45, 0, (Math.floor(i / 4) - 1.5) * h * 0.45); bed.setMatrixAt(i, m); }
      bed.castShadow = true; g.add(bed);
      return { plate, bed };
    });
  }

  return {
    // hz: the latest update's traps. t: the hazard clock to draw at. me: your own position (for sound).
    update(hz, t, dt, me, audio) {
      if (!hz) { if (root) { scene.remove(root); root = null; built = null; } fire.step(dt, 3); smoke.step(dt, 0.6); return; }
      const L = hz.L; if (built !== L.id) build(L);
      if (pend) {
        const pd = pendulum(L, t); pend.rotation.z = pd.th;
        // A heavy whoosh as the blade sweeps past you.
        if (Math.sign(pd.th) !== Math.sign(lastTh) && me && Math.hypot(me.x, me.z) < 5) audio.whoosh('low');
        lastTh = pd.th;
      }
      for (const V of vents) {
        const st = vent(V.v, t);
        V.glow.material.opacity = st.s === 'warn' ? 0.25 + 0.5 * st.k : st.s === 'burn' ? 0.9 : 0.08 + 0.04 * Math.sin(t * 3 + V.v.x);
        V.light.intensity = st.s === 'burn' ? 9 + Math.random() * 4 : st.s === 'warn' ? 2.5 * st.k : 0.3;
        const r = HAZ.VENT.r;
        if (st.s === 'warn') { // sparks and a wisp of smoke: get off it
          if (Math.random() < dt * 30) fire.spawn(V.v.x + (Math.random() - 0.5) * r, 0.1, V.v.z + (Math.random() - 0.5) * r, 0, 1 + Math.random() * 2, 0, 0.4, [0.9, 0.5, 0.15]);
          if (Math.random() < dt * 6) smoke.spawn(V.v.x, 0.2, V.v.z, 0, 0.5, 0, 1.5, [0.25, 0.22, 0.22]);
        } else if (st.s === 'burn') {
          for (let k = 0; k < dt * 220; k++) {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
            fire.spawn(V.v.x + Math.cos(a) * d, 0.1, V.v.z + Math.sin(a) * d, -Math.cos(a) * 0.5, 6 + Math.random() * 3, -Math.sin(a) * 0.5, 0.5 + Math.random() * 0.25, [0.34, 0.17, 0.05]);
          }
          if (Math.random() < dt * 14) smoke.spawn(V.v.x, HAZ.VENT.h * 0.8, V.v.z, (Math.random() - 0.5) * 0.5, 1.2, (Math.random() - 0.5) * 0.5, 2.2, [0.18, 0.16, 0.16]);
        }
        if (st.s === 'burn' && V.was !== 'burn' && me && Math.hypot(me.x - V.v.x, me.z - V.v.z) < 9) audio.whoosh('low');
        V.was = st.s;
      }
      plates.forEach((P, i) => {
        const since = hz.pl[i] < 0 ? null : hz.pl[i] + (t - hz.t), up = spikes(since);
        P.bed.position.y = -0.62 + up * 0.62; P.plate.position.y = since != null && up === 0 ? 0.012 : 0.025; // the plate sinks when it clicks
      });
      fire.step(dt, 3); smoke.step(dt, 0.6);
    },
    // Someone on fire trails flames.
    burning(pos, dt) {
      for (let k = 0; k < dt * 90; k++) fire.spawn(pos[0] + (Math.random() - 0.5) * 0.4, pos[1] + Math.random() * 1.4, pos[2] + (Math.random() - 0.5) * 0.4, 0, 1.5 + Math.random(), 0, 0.35, [0.7, 0.4, 0.12]);
    },
  };
}

// Dark slots in the plate where the spikes come through.
function holesTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.85)';
  for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(((i % 4) + 0.5) * 32, (Math.floor(i / 4) + 0.5) * 32, 6, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
