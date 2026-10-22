// The arena's traps, shared by the server (which checks who gets hurt) and the browser (which draws them).
// Each round rolls a fresh layout. Everything that moves is worked out from the hazard clock, so every
// browser shows the pendulum and the vents exactly where the server has them.
//
// - Two stone pillars hold up a beam across the arena, and a huge axe blade swings from it through the
//   middle, right across the line between the two spawns.
// - Fire vents in the floor hiss and glow for a moment, then roar up in a column of flame.
// - Spike plates: step on one and it clicks; a moment later spikes shoot up through it.

export const HAZ = {
  // pivotY/len: where the arm hangs from and how long it is. amp: how far it swings each way (radians).
  // period: one full there-and-back. half/r: the blade's half-length along its swing and its thickness.
  PEND: { pivotY: 8.4, len: 7.2, amp: 0.78, period: 6.4, half: 0.72, r: 0.16, dmg: 34, knock: 7, cool: 1.2 },
  PILLAR: { r: 0.62, at: 6.7 }, // radius, and distance from the centre along the pendulum's line
  // r: radius of the flame. cycle: seconds between eruptions. warn: hissing and glowing first. burn: how
  // long the flame lasts. dps: damage per second while you stand in it. h: how high it reaches.
  VENT: { r: 0.85, cycle: 9, warn: 1.3, burn: 1.9, dps: 28, h: 3.4 },
  // half: half-width of the plate. delay: from the click to the spikes. up: how long they stay up.
  // rearm: how long before it can click again. dmg: to each leg.
  PLATE: { half: 0.55, delay: 0.4, up: 0.9, rearm: 3, dmg: 19 },
};

const r2 = (v) => Math.round(v * 100) / 100;

// A new arena. Fighters spawn at (0, ±4), so nothing is placed on top of them.
export function rollLayout(rnd = Math.random) {
  const ang = (rnd() - 0.5) * 0.9; // the pendulum's line runs roughly across the gap between the spawns
  const ax = [Math.cos(ang), Math.sin(ang)];
  const pillars = [1, -1].map((s) => [r2(ax[0] * HAZ.PILLAR.at * s), r2(ax[1] * HAZ.PILLAR.at * s)]);
  const taken = [[0, 4, 1.9], [0, -4, 1.9], ...pillars.map(([x, z]) => [x, z, HAZ.PILLAR.r + 0.6])];
  const offLine = (x, z) => Math.abs(-x * ax[1] + z * ax[0]); // distance from the pendulum's line
  const place = (n, r, minR, maxR) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < 400; tries++) {
      const a = rnd() * Math.PI * 2, d = minR + rnd() * (maxR - minR), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (offLine(x, z) < r + 0.5 || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr)) continue;
      out.push([r2(x), r2(z)]); taken.push([x, z, r + 0.4]);
    }
    return out;
  };
  const vents = place(3, HAZ.VENT.r, 2.2, 8.6).map(([x, z], i) => ({ x, z, ph: r2((i * HAZ.VENT.cycle) / 3 + rnd() * 1.5) }));
  const plates = place(4, HAZ.PLATE.half * 1.5, 1.6, 8.8).map(([x, z]) => ({ x, z }));
  return { id: Math.floor(rnd() * 1e9), ang: r2(ang), pillars, vents, plates };
}

// Where the pendulum blade is at time t: its centre, the way its edge runs (along the swing), its swing
// angle, and how fast it's moving (m/s along dir).
export function pendulum(L, t) {
  const P = HAZ.PEND, w = (2 * Math.PI) / P.period, th = P.amp * Math.sin(w * t), thv = P.amp * w * Math.cos(w * t);
  const ax = [Math.cos(L.ang), Math.sin(L.ang)], reach = P.len + 0.15, s = Math.sin(th), c = Math.cos(th);
  return { th, pos: [ax[0] * s * reach, P.pivotY - c * reach, ax[1] * s * reach], dir: [ax[0] * c, s, ax[1] * c], speed: thv * reach };
}

// A vent's state at time t: 'idle', 'warn' or 'burn', and how far through that state it is (0..1).
export function vent(v, t) {
  const V = HAZ.VENT, u = (((t + v.ph) % V.cycle) + V.cycle) % V.cycle, idle = V.cycle - V.warn - V.burn;
  if (u < idle) return { s: 'idle', k: u / idle };
  if (u < idle + V.warn) return { s: 'warn', k: (u - idle) / V.warn };
  return { s: 'burn', k: (u - idle - V.warn) / V.burn };
}

// How far a plate's spikes are up (0..1), given how long ago it clicked (null: armed and waiting).
export function spikes(since) {
  const P = HAZ.PLATE;
  if (since == null || since < P.delay) return 0;
  const u = since - P.delay;
  return u < 0.06 ? u / 0.06 : u < P.up ? 1 : Math.max(0, 1 - (u - P.up) / 0.25);
}

// Keep someone out of the pillars (x, z changed in place).
export function pushOutOfPillars(L, p, bodyR = 0.3) {
  if (!L) return;
  for (const [x, z] of L.pillars) {
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1e-3, min = HAZ.PILLAR.r + bodyR;
    if (d < min) { p.x = x + (dx / d) * min; p.z = z + (dz / d) * min; }
  }
}
