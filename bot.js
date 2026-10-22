// The practice knight: a computer opponent for fighting alone. It plays by the same rules as a person,
// only through the same inputs (move, look, block, wind up, release, feint, kick), with a human-ish
// reaction time and the odd mistake, so it can be beaten by reading it.
import { ARM, DIRS, MIRROR, newPlayer, startHold, releaseHold, feint, kick, tm, wpn, voteRematch, forward, rightOf, taunt, beaten } from './shared/sim.js';
import { HAZ, pendulum, vent, sweeper } from './shared/hazards.js';

const BOT_NAMES = ['Sir Practice', 'The Training Knight', 'Sir Strawman', 'Dummy the Bold'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// How good the bot is. React: seconds before it notices an attack. blockChance: how often it then
// blocks the right side. aggression: how soon it attacks again after a swing.
export const BOT = { react: [0.22, 0.42], blockChance: 0.6, heavyChance: 0.3, feintChance: 0.1, cooldown: [0.5, 1.4] };

export function makeBot(id) {
  const p = newPlayer(id, pick(BOT_NAMES));
  p.bot = { threat: false, seen: 0, react: 0, block: false, cool: 1.5, hold: 0, feint: false, strafe: 0, strafeT: 0, kickT: 0 };
  return p;
}

// Decide this tick's inputs for the bot. Called just before the room steps.
export function botThink(me, room, dt) {
  const B = me.bot, i = me.input, op = room.fighters.find((f) => f && f !== me);
  i.mf = 0; i.ms = 0; i.b = 0; i.j = 0; i.s = 0;
  // Always up for another go: agree to a rematch a moment after the match ends.
  if (room.phase === 'over') { B.overT = (B.overT || 0) + dt; if (B.overT > 1.5 && !me.rematch) voteRematch(room, me); return; }
  B.overT = 0;
  if (!op || me.dead || room.phase !== 'fight') { B.cool = 1.5; return; }
  const dx = op.x - me.x, dz = op.z - me.z, dist = Math.hypot(dx, dz);
  // Face the opponent, with a little wobble so it doesn't look robotic.
  i.yaw = Math.atan2(-dx, -dz) + Math.sin(Date.now() / 700) * 0.05;
  i.pitch = op.downT > 0 || op.dead ? -0.5 : 0;
  if (op.dead) return;
  const reach = wpn(me).len + ARM * 0.9, ideal = reach * 0.8;

  // Defence: notice an incoming attack after a reaction time, then (usually) block the side it comes from.
  const threat = (op.state === 'hold' || op.state === 'active') && dist < wpn(op).len + ARM + 1;
  if (threat && !B.threat) { B.seen = 0; B.react = rnd(...BOT.react); B.block = Math.random() < BOT.blockChance; }
  B.threat = threat;
  if (threat) B.seen += dt;
  const blocking = threat && B.block && B.seen >= B.react && (me.state === 'idle' || me.state === 'recover');
  if (blocking) { i.b = 1; i.d = MIRROR[op.sdir]; }

  // Footwork: keep to its weapon's best range and circle a little.
  if (!blocking || dist > ideal + 0.6) i.mf = dist > ideal + 0.3 ? 1 : dist < ideal - 0.4 ? -1 : 0;
  B.strafeT -= dt;
  if (B.strafeT <= 0) { B.strafe = pick([-1, 0, 0, 1]); B.strafeT = rnd(0.8, 2.2); }
  i.ms = B.strafe;
  dodgeTraps(me, room, i);
  // Rub it in when the opponent is in a bad way and not attacking.
  if (beaten(op) && !threat && me.state === 'idle' && Math.random() < dt * 1.5) taunt(me, room);

  // Attack: wind up from a random side, sometimes going for a heavy, sometimes feinting.
  B.cool -= dt;
  if (me.state === 'idle' && !blocking && B.cool <= 0 && dist < reach + 0.3 && me.stam > 25) {
    const dir = pick(DIRS);
    if (startHold(me, dir)) {
      i.d = dir;
      B.hold = Math.random() < BOT.heavyChance ? tm(me, 'HEAVY_AT') + rnd(0.05, 0.25) : tm(me, 'DRAW') + rnd(0, 0.05);
      B.feint = Math.random() < BOT.feintChance;
    }
  }
  if (me.state === 'hold') {
    B.hold -= dt;
    if (B.feint && B.hold < 0.08) { feint(me, room); B.feint = false; B.cool = rnd(0.3, 0.6); }
    else if (B.hold <= 0) { releaseHold(me); B.cool = rnd(...BOT.cooldown); }
  }

  // Kick a turtle: someone close who keeps blocking.
  B.kickT -= dt;
  if (op.blocking && dist < 1.1 && me.state === 'idle' && B.kickT <= 0) {
    B.kickT = rnd(1.5, 3);
    if (Math.random() < 0.35) kick(me, room);
  }
}

// Get out of the way of the traps, most of the time: step off the pendulum's line when the blade is on
// its way, and away from a vent that's hissing or burning. (Spike plates it just blunders onto.)
function dodgeTraps(me, room, i) {
  const H = room.hz; if (!H) return;
  const L = H.L, ax = [Math.cos(L.ang), Math.sin(L.ang)];
  let wx = 0, wz = 0;
  const off = -me.x * ax[1] + me.z * ax[0], along = me.x * ax[0] + me.z * ax[1];
  if (L.kind === 'pendulum' && Math.abs(off) < 1.2 && Math.abs(along) < 4) {
    // Is the blade coming through here within the next second or so?
    for (let k = 0; k <= 6; k++) {
      const pd = pendulum(L, H.t + k * 0.2), bAlong = pd.pos[0] * ax[0] + pd.pos[2] * ax[1];
      if (Math.abs(bAlong - along) < 1.2 && pd.pos[1] < 2.2) { const s = off >= 0 ? 1 : -1; wx += -ax[1] * s; wz += ax[0] * s; break; }
    }
  }
  for (const v of L.vents) {
    const st = vent(v, H.t), dx = me.x - v.x, dz = me.z - v.z, d = Math.hypot(dx, dz) || 1e-3;
    if (st.s !== 'idle' && d < HAZ.VENT.r + 1) { wx += dx / d; wz += dz / d; }
  }
  // The sweeper: hop over the arm just before it gets here (and misjudge it now and then).
  if (L.kind === 'sweeper' && me.onGround) {
    const sw = sweeper(L, H.t), r = Math.hypot(me.x, me.z);
    if (r < HAZ.SWEEP.len + 0.4) {
      const rel = Math.atan2(Math.sin(Math.atan2(me.z, me.x) - sw.a), Math.cos(Math.atan2(me.z, me.x) - sw.a)) * Math.sign(sw.w);
      const ahead = (rel < 0 ? rel + 2 * Math.PI : rel) / Math.abs(sw.w); // seconds until the arm reaches me
      if (ahead < (me.botJump ??= 0.24 + Math.random() * 0.1)) { i.j = 1; me.botJump = Math.random() < 0.15 ? 0.6 : 0.24 + Math.random() * 0.1; }
    }
  }
  // The bull: get out of its way when it's lining up on me or already coming.
  const Bu = H.bull;
  if (Bu && (Bu.s === 'aim' || Bu.s === 'charge')) {
    const f = [-Math.sin(Bu.yaw), -Math.cos(Bu.yaw)], dx = me.x - Bu.x, dz = me.z - Bu.z, along = dx * f[0] + dz * f[1], side = -dx * f[1] + dz * f[0];
    if (along > -1 && Math.abs(side) < 1.8 && along < (Bu.s === 'charge' ? 7 : 12)) { const s = side >= 0 ? 1 : -1; wx += -f[1] * s * 2; wz += f[0] * s * 2; }
  }
  if (!wx && !wz) return;
  const f = forward(me.yaw), r = rightOf(me.yaw), l = Math.hypot(wx, wz);
  i.mf = Math.sign(Math.round((wx * f[0] + wz * f[2]) / l * 2)); i.ms = Math.sign(Math.round((wx * r[0] + wz * r[2]) / l * 2)); i.b = 0;
}
