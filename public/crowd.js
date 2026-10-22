// The crowd: people packed into the stands who jump up, wave their arms, scream, groan, boo and laugh,
// and throw things into the arena (the throwing itself is decided by the server, see THROWN in sim.js).
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------- the people ----------
const SKIN = [0xf1c8a6, 0xe0ac86, 0xc68a62, 0x9c6844, 0x744a30, 0x553524, 0xf6d5c0];
const HAIR = [0x1c1410, 0x2e1e14, 0x5a3a20, 0x8a5a30, 0xc8a060, 0xd8c8a8, 0x777070, 0x3a1810];
// Plain medieval cloth: undyed wool, browns, greens, the odd red or blue.
const CLOTH = [0x7a6a52, 0x5c4a36, 0x8a7a60, 0x4a5a3a, 0x6a3a2a, 0x3a4a6a, 0x8a2a24, 0x5a5048, 0xa08860, 0x2e3a2e, 0x6a5a7a];

export function makeCrowd(scene, seats, pbrMat, TEX) {
  const N = 420, people = [];
  const cloth = pbrMat({ normalMap: TEX.cloth.normalMap, roughnessMap: TEX.cloth.roughnessMap });
  const skin = new THREE.MeshStandardMaterial({ roughness: 0.75 }), hairMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const torsoGeo = new THREE.CapsuleGeometry(0.17, 0.32, 4, 10);
  const headGeo = new THREE.SphereGeometry(0.115, 14, 10); headGeo.scale(0.92, 1.05, 1);
  const hairGeo = new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); hairGeo.translate(0, 0.012, -0.012);
  // An arm hangs down from the shoulder (its origin), so rotating it raises it.
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.36, 3, 6); armGeo.translate(0, -0.22, 0);
  const handGeo = new THREE.SphereGeometry(0.05, 8, 6); handGeo.translate(0, -0.45, 0);
  const mouthGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.castShadow = false; m.receiveShadow = true; scene.add(m); return m; };
  const M = {
    torso: mk(torsoGeo, cloth), head: mk(headGeo, skin), hair: mk(hairGeo, hairMat),
    armL: mk(armGeo, cloth), armR: mk(armGeo, cloth), handL: mk(handGeo, skin), handR: mk(handGeo, skin),
    mouth: mk(mouthGeo, new THREE.MeshBasicMaterial({ color: 0x1a0606 })),
  };
  for (let k = 0; k < N;) {
    const [r, y] = pick(seats), a = rnd(0, Math.PI * 2);
    if (Math.abs(Math.cos(a)) < 0.1) continue; // leave the space above the two gates empty
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = rnd(0.9, 1.1);
    people.push({ k, x, z, y, s, yaw: Math.atan2(-x, -z) + rnd(-0.3, 0.3), ph: rnd(0, 6.28), sp: rnd(4, 9), hype: rnd(0.4, 1.2), throwT: -1, hidden: false, wave: Math.random() < 0.5 ? 1 : -1 });
    const c = new THREE.Color(pick(CLOTH)), sk = new THREE.Color(pick(SKIN)), hr = new THREE.Color(pick(HAIR));
    for (const part of ['torso', 'armL', 'armR']) M[part].setColorAt(k, c);
    for (const part of ['head', 'handL', 'handR']) M[part].setColorAt(k, sk);
    M.hair.setColorAt(k, hr);
    k++;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _o = new THREE.Vector3();
  const place = (mesh, k, pos, quat, sc) => { _m.compose(pos, quat, sc); mesh.setMatrixAt(k, _m); };
  // A point on a person, from their own frame (x right, y up, z towards the arena).
  const local = (P, bodyQ, x, y, z) => _o.set(x, y, z).multiplyScalar(P.s).applyQuaternion(bodyQ).add(_p.set(P.x, P.yy, P.z));

  return {
    people,
    cheer: 0,
    // The person sitting nearest a spot in the stands (to throw, or to hide behind your own camera).
    nearest(x, z) { let best = null, d = Infinity; for (const P of people) { const e = (P.x - x) ** 2 + (P.z - z) ** 2; if (e < d) { d = e; best = P; } } return best; },
    throwFrom(x, z) { const P = this.nearest(x, z); if (P) P.throwT = 0; },
    hideNear(x, z) { for (const P of people) P.hidden = false; const P = this.nearest(x, z); if (P) P.hidden = true; },
    update(t, dt) {
      this.cheer = Math.max(0, this.cheer - dt * 0.4);
      const ch = this.cheer;
      for (const P of people) {
        const k = P.k, h = Math.min(1, ch * P.hype);
        if (P.throwT >= 0) { P.throwT += dt; if (P.throwT > 0.7) P.throwT = -1; }
        if (P.hidden) { _s.set(0, 0, 0); for (const m of Object.values(M)) place(m, k, _p.set(0, -50, 0), _q, _s); continue; }
        // Bouncing on the bench, jumping up when it gets exciting.
        const bob = Math.max(0, Math.sin(t * P.sp + P.ph));
        P.yy = P.y + 0.3 * P.s + bob * (0.03 + h * 0.3);
        const lean = h * 0.25 * Math.sin(t * 2 + P.ph);
        _e.set(0.05 + h * 0.12, P.yaw, lean * 0.3, 'YXZ'); _q.setFromEuler(_e);
        _s.setScalar(P.s);
        place(M.torso, k, _p.set(P.x, P.yy, P.z), _q, _s);
        place(M.head, k, local(P, _q, 0, 0.42, 0.02), _q, _s);
        place(M.hair, k, local(P, _q, 0, 0.42, 0.02), _q, _s);
        // Mouth: shut when calm, wide open when screaming.
        const open = 0.25 + h * (0.8 + 0.5 * Math.sin(t * 9 + P.ph));
        place(M.mouth, k, local(P, _q, 0, 0.385, 0.115), _q, _s.set(P.s, P.s * open, P.s * 0.5));
        _s.setScalar(P.s);
        // Arms: resting on the knees, thrown up and waving when the crowd goes wild, or winding up a throw.
        for (const side of [-1, 1]) {
          let raise = 0.35 + h * (2.3 + 0.35 * Math.sin(t * 7 + P.ph + side)), out = 0.15 + h * 0.35;
          if (P.throwT >= 0 && side === P.wave) { const u = P.throwT / 0.7; raise = u < 0.45 ? 0.6 + (u / 0.45) * 2.4 : 3 - ((u - 0.45) / 0.55) * 2.6; out = 0.1; }
          _e.set(-raise, 0, side * out, 'XYZ'); _q2.setFromEuler(_e).premultiply(_q);
          const sh = local(P, _q, side * 0.2, 0.26, 0);
          place(side < 0 ? M.armL : M.armR, k, sh, _q2, _s);
          place(side < 0 ? M.handL : M.handR, k, sh, _q2, _s);
        }
      }
      for (const m of Object.values(M)) m.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- things thrown into the arena ----------
export function makeThrownView(scene, pbrMat) {
  const geo = {
    tomato: new THREE.SphereGeometry(0.065, 12, 9), rock: new THREE.DodecahedronGeometry(0.07, 0), cabbage: new THREE.IcosahedronGeometry(0.1, 1),
  };
  geo.tomato.scale(1, 0.85, 1);
  const mat = {
    tomato: new THREE.MeshStandardMaterial({ color: 0xd8200c, roughness: 0.25 }), rock: new THREE.MeshStandardMaterial({ color: 0x777068, roughness: 0.95, flatShading: true }),
    cabbage: new THREE.MeshStandardMaterial({ color: 0x7ea048, roughness: 0.7, flatShading: true }),
  };
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0x3a6a1a })); stem.position.y = 0.06;
  const live = new Map(), G = 14;
  return {
    toss(ev) {
      const m = new THREE.Mesh(geo[ev.kind] || geo.rock, mat[ev.kind] || mat.rock); m.castShadow = true;
      if (ev.kind === 'tomato') m.add(stem.clone());
      m.position.set(...ev.pos); scene.add(m);
      live.set(ev.pid, { m, v: new THREE.Vector3(...ev.vel), spin: new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), age: 0 });
    },
    end(pid) { const o = live.get(pid); if (o) { scene.remove(o.m); live.delete(pid); } },
    step(dt) {
      for (const [pid, o] of live) {
        o.age += dt; o.v.y -= G * dt; o.m.position.addScaledVector(o.v, dt);
        o.m.rotation.x += o.spin.x * dt; o.m.rotation.y += o.spin.y * dt; o.m.rotation.z += o.spin.z * dt;
        if (o.age > 4 || o.m.position.y < -3) this.end(pid);
      }
    },
  };
}

// ---------- crowd noise ----------
// Voices are built the way a throat makes them: a buzzing source (a sawtooth at the voice's pitch,
// with a wobble) shaped by two resonances that make the vowel. Lots of them at once is a crowd.
// Recorded files in public/sfx/cheer, scream, boo, laugh and ooh are used instead when present.
const VOWEL = { ah: [800, 1200], oo: [350, 800], ee: [300, 2300], eh: [550, 1800], oh: [500, 900] };
export function makeCrowdVoice(audio, sfx) {
  let bed = null;
  const ctx = () => audio.ctx;
  function voice(t, { f0, f1, vowel, dur, vol, attack = 0.08, vib = 5, pan = 0 }) {
    const c = ctx(), o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = vib + Math.random() * 2; lg.gain.value = f0 * 0.03; lfo.connect(lg); lg.connect(o.frequency);
    const fem = f0 > 220 ? 1.15 : 1, [F1, F2] = VOWEL[vowel].map((f) => f * fem * rnd(0.93, 1.07));
    const b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(); b1.type = b2.type = 'bandpass'; b1.frequency.value = F1; b2.frequency.value = F2; b1.Q.value = 6; b2.Q.value = 8;
    const g = c.createGain(), mix = c.createGain(); mix.gain.value = 1;
    o.connect(b1); o.connect(b2); b1.connect(mix); b2.connect(mix);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    mix.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(audio.out()); } else g.connect(audio.out());
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    return g;
  }
  // A breath of air under the voices, so a crowd sounds like a crowd and not a choir.
  function rush(t, dur, vol, freq = 900) {
    const c = ctx(), n = audio.noise(dur), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.5;
    n.connect(f); audio.env(f, t, dur * 0.25, dur * 0.75, vol); n.start(t);
  }
  const people = (n, fn) => { for (let i = 0; i < n; i++) fn(Math.random() < 0.5); };
  const ok = () => audio.ok();
  return {
    // A low murmur that never stops, swelling as the crowd gets excited.
    bed(excite) {
      if (!ok()) return;
      if (!bed) {
        const c = ctx(), n = c.createBufferSource(); n.buffer = audio.noise(4).buffer; n.loop = true;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.7;
        const g = c.createGain(); g.gain.value = 0.0; n.connect(f); f.connect(g); g.connect(audio.out()); n.start();
        bed = { g, f };
      }
      bed.g.gain.setTargetAtTime(0.025 + excite * 0.09, ctx().currentTime, 0.4);
      bed.f.frequency.setTargetAtTime(500 + excite * 500, ctx().currentTime, 0.4);
      // Odd shouts out of the murmur.
      if (Math.random() < 0.012 + excite * 0.05) this.shout();
    },
    shout() {
      if (!ok()) return; const t = ctx().currentTime, hi = Math.random() < 0.5, f0 = hi ? rnd(240, 340) : rnd(110, 170);
      voice(t, { f0, f1: f0 * rnd(0.8, 1.3), vowel: pick(['ah', 'eh', 'oh', 'ee']), dur: rnd(0.3, 0.7), vol: 0.035, pan: rnd(-0.8, 0.8) });
    },
    // Everyone on their feet: a roar of rising "aaah"s and "yeah"s.
    cheer(size = 1) {
      if (!ok() || sfx.play('cheer', 0.6 * size)) return; const t = ctx().currentTime;
      rush(t, 1.8, 0.14 * size, 1100);
      people(Math.round(8 + size * 10), (hi) => {
        const f0 = hi ? rnd(230, 380) : rnd(100, 180), d = rnd(0.9, 1.8);
        voice(t + rnd(0, 0.35), { f0, f1: f0 * rnd(1.05, 1.35), vowel: pick(['ah', 'eh', 'ah', 'oh']), dur: d, vol: 0.022 * size, attack: 0.15, pan: rnd(-1, 1) });
      });
    },
    // A fighter bellowing a taunt: one big voice, close by.
    yell(low = true) {
      if (!ok() || sfx.play('taunt', 0.7)) return; const t = ctx().currentTime, f0 = low ? rnd(105, 135) : rnd(200, 250);
      voice(t, { f0, f1: f0 * rnd(1.15, 1.35), vowel: pick(['ah', 'oh', 'eh']), dur: rnd(0.55, 0.8), vol: 0.09, attack: 0.04, vib: 6 });
      voice(t, { f0: f0 * 1.005, f1: f0 * rnd(1.15, 1.35), vowel: 'ah', dur: 0.7, vol: 0.05, attack: 0.05, vib: 4 });
    },
    // A few people screaming in horror.
    scream() {
      if (!ok() || sfx.play('scream', 0.5)) return; const t = ctx().currentTime;
      people(4, (hi) => { const f0 = hi ? rnd(500, 850) : rnd(260, 420); voice(t + rnd(0, 0.2), { f0, f1: f0 * rnd(0.7, 0.95), vowel: pick(['ah', 'ee']), dur: rnd(0.6, 1.1), vol: 0.03, attack: 0.03, vib: 7, pan: rnd(-1, 1) }); });
    },
    // "Ooooh": wincing at a big hit.
    ooh() {
      if (!ok() || sfx.play('ooh', 0.5)) return; const t = ctx().currentTime;
      people(10, (hi) => { const f0 = hi ? rnd(260, 360) : rnd(120, 190); voice(t + rnd(0, 0.15), { f0: f0 * 1.15, f1: f0 * 0.75, vowel: 'oo', dur: rnd(0.9, 1.3), vol: 0.022, attack: 0.12, pan: rnd(-1, 1) }); });
    },
    boo() {
      if (!ok() || sfx.play('boo', 0.5)) return; const t = ctx().currentTime;
      people(12, (hi) => { const f0 = hi ? rnd(200, 260) : rnd(95, 140); voice(t + rnd(0, 0.3), { f0, f1: f0 * 0.95, vowel: 'oo', dur: rnd(1, 1.6), vol: 0.022, attack: 0.1, vib: 3, pan: rnd(-1, 1) }); });
    },
    // Ha-ha-ha: a voice switched on and off a few times a second.
    laugh() {
      if (!ok() || sfx.play('laugh', 0.5)) return; const t = ctx().currentTime;
      people(6, (hi) => {
        const f0 = hi ? rnd(240, 330) : rnd(110, 160), start = t + rnd(0, 0.25), n = 3 + ((Math.random() * 4) | 0), rate = rnd(5, 7);
        for (let i = 0; i < n; i++) voice(start + i / rate, { f0: f0 * (1 - i * 0.03), f1: f0 * (0.95 - i * 0.03), vowel: 'ah', dur: 0.55 / rate * 1.6, vol: 0.03, attack: 0.015, pan: rnd(-1, 1) });
      });
    },
  };
}
