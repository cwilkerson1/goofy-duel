// Client-side prediction of your own movement. Kept apart from client.js so it can be tested in Node.
import { ARENA_R, legsLeft, COST, moveGoal, ACCEL, STRIDE } from './sim.js';

// Your knight moves on your screen the moment you press a key, using the same movement rules as the
// server, and quietly eases toward where the server says you are. So your own view never waits on
// the connection; only big disagreements (a knockback, a new round) snap you into place.
export function makePredictor() {
  return {
  on: false, spawn: -1, rtt: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, walk: 0, ex: 0, ey: 0, ez: 0, hist: [],
  reset(s) { Object.assign(this, { on: true, spawn: s.spawn, x: s.x, y: s.y, z: s.z, vx: s.vx || 0, vy: s.vy || 0, vz: s.vz || 0, onGround: s.onGround, ex: 0, ey: 0, ez: 0, hist: [] }); },
  correct(s, phase, now) {
    if (!s || s.dead || phase === 'countdown' || phase === 'spin') { this.on = false; return; }
    if (!this.on || s.spawn !== this.spawn) { this.reset(s); return; }
    // Where were we when the server worked this out? About one round trip ago, plus input batching.
    const back = now - (this.rtt ?? 80) - 25;
    let h = this.hist[0];
    for (const e of this.hist) { if (e.t > back) break; h = e; }
    if (!h) return;
    const ex = s.x - h.x, ey = s.y - h.y, ez = s.z - h.z;
    if (Math.hypot(ex, ez) > 2.5) { this.reset(s); return; }
    this.ex = ex; this.ey = ey; this.ez = ez;
    // Pushes we can't predict (knockback, being launched): take the server's velocity.
    if (s.stun > 0 || Math.hypot(s.vx - this.vx, s.vz - this.vz) > 3) { this.vx = s.vx; this.vz = s.vz; }
    if (!s.onGround && s.vy > this.vy + 2) { this.vy = s.vy; this.onGround = false; }
  },
  step(s, opp, inp, dt, now) {
    if (!this.on || !s) return;
    const legs = legsLeft(s);
    const goal = moveGoal(s, inp.mf, inp.ms, inp.yaw, inp.b && s.state === 'idle' && s.stun <= 0, inp.s), ml = goal.moving ? 1 : 0;
    const accel = this.onGround ? ACCEL : 2;
    this.vx += (goal.vx - this.vx) * Math.min(1, accel * dt);
    this.vz += (goal.vz - this.vz) * Math.min(1, accel * dt);
    if (this.onGround && legs && inp.j && s.stun <= 0 && !(s.downT > 0) && s.stam >= COST.jump) { this.vy = legs === 2 ? 5.2 : 4; this.onGround = false; }
    else if (this.onGround && legs === 1 && ml > 0.1 && s.state !== 'kick') { this.vy = 2.6; this.onGround = false; }
    this.vy -= 14 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    // Ease out the server's correction, moving the recorded path along with it so it isn't counted twice.
    const e = Math.hypot(this.ex, this.ez), c = Math.min(1, dt * (e > 0.5 ? 12 : e > 0.15 ? 4 : 1.5)); // tiny drifts fix slowly, so you never feel them
    const cx = this.ex * c, cy = this.ey * c, cz = this.ez * c;
    this.x += cx; this.y = Math.max(0, this.y + cy); this.z += cz; this.ex -= cx; this.ey -= cy; this.ez -= cz;
    for (const e of this.hist) { e.x += cx; e.y += cy; e.z += cz; }
    const d = Math.hypot(this.x, this.z), maxR = ARENA_R - 0.5;
    if (d > maxR) { this.x *= maxR / d; this.z *= maxR / d; }
    if (opp && !opp.dead && !s.dead) { // don't walk through them (the server splits the push between you)
      const dx = this.x - opp.x, dz = this.z - opp.z, dd = Math.hypot(dx, dz) || 1e-3;
      if (dd < 0.75) { const push = (0.75 - dd) / 2; this.x += (dx / dd) * push; this.z += (dz / dd) * push; }
    }
    if (this.onGround) this.walk += Math.hypot(this.vx, this.vz) * dt * STRIDE;
    this.hist.push({ t: now, x: this.x, y: this.y, z: this.z });
    while (this.hist.length && this.hist[0].t < now - 1000) this.hist.shift();
  },
};
}
