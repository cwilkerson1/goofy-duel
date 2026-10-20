// Shared game rules: used by the server (authoritative simulation) and the
// browser (to pose the knights from the snapshots the server sends).
// Units are metres and seconds. y is up; yaw 0 faces -z (Three.js camera convention).
//
// Combat follows Last Oasis-style directional melee:
// - Hold attack to draw the weapon back, move the mouse to pick left / right / overhead,
//   release to swing. A quick release is a light attack; holding past HEAVY_AT winds up a heavy one,
//   which swings slower, recovers slower, hits half again as hard and staggers through a block.
// - Block by holding block and moving the mouse toward the side the attack comes from.
// - Feint (Q, or block) to cancel an attack: any time while winding up, or early in the swing itself
//   before it connects. Kick is unblockable and interrupts.
// - Sprint (Shift) when idle and moving forward; it burns stamina.
// - Attacking into an incoming swing from the matching side, just in time, is a chamber.

export const ARENA_R = 11;
export const ARM = 0.6, BLADE = 0.95, HEAD_R = 0.14, TORSO = 0.6, LEG = 0.95;
export const PARTS = ['head', 'torso', 'armR', 'armL', 'legR', 'legL'];
export const PART_MAX = { head: 45, torso: 100, armR: 25, armL: 25, legR: 30, legL: 30 };
export const DIRS = ['left', 'over', 'right'];
export const WIN_SCORE = 3; // best of 5: the first to win 3 rounds wins the duel, and the match ends
export const STAM_MAX = 100;
// All weapon damage is scaled by this, so fights take several good hits. And no one blow can take
// more than HEAD_CAP of the head's health, so it always takes at least two hits to the head.
export const DMG_SCALE = 0.55, HEAD_CAP = 0.6;

export const T = {
  DRAW: 0.28,        // minimum time the weapon is drawn back before a release swings
  RIPOSTE_DRAW: 0.1, // draw time right after a successful block
  HEAVY_AT: 0.43,    // hold this long and the attack becomes heavy (scaled by the weapon's wind-up speed)
  MAX_HOLD: 2.5,     // auto-release after this
  ACTIVE: 0.18, RECOVER: 0.32, BOUNCE: 0.5,
  FEINT_IN: 0.55,
  COMBO_AT: 0.5,     // from this far through a normal recovery you can wind up the next attack    // a swing can still be cancelled during this first fraction of it, if it hasn't hit yet
  CHAMBER: 0.14,     // a fresh swing this young chambers an incoming one from the matching side
  KICK: 0.42, KICK_HIT: [0.12, 0.26],
  KICK_MISS: 0.65,   // stumble after kicking nothing
};
// The weapon wheel. Every round each fighter gets one at random (weight = slice size).
// len: blade reach in metres. dmg: overall damage. sever: extra damage to limbs and heads.
// Swing feel (lower is faster): draw = wind-up, swing = how long the blade takes to cross,
// rec = recovery after a swing or bounce. stam: stamina per swing/feint. move: footwork speed.
// small: a small weapon, slowed by SMALL_PACE instead of PACE.
// two: a two-handed weapon (the big ones): both hands on the grip, slower, hits harder. grip: how far
// down the handle the second hand sits. Swung with one arm left, it's slower still and hits softer.
// knock: shove on hit (big = launch).
// (heads only get a third of the sever bonus, so big blades don't one-shot every neck.)
// stun: dazes whoever gets hit. block: stamina cost multiplier when blocking with it.
export const WEAPONS = {
  longsword:  { name: 'Longsword',         emoji: '🗡️', len: 0.95, dmg: 1,    sever: 1,   draw: 1, swing: 1, rec: 1, stam: 1, move: 1, knock: 1,   stun: 0,    block: 1,   weight: 1.2, color: '#9fb4c7', line: 'Reach and speed in balance.' },
  greatsword: { name: 'Greatsword',        emoji: '⚔️', len: 1.35, dmg: 1.6, sever: 1.2, draw: 1.45, swing: 1.35, rec: 1.45, stam: 1.5, move: 0.85, two: true, grip: 0.17, knock: 1.7, stun: 0,    block: 0.8, weight: 1,   color: '#5d7fa3', line: 'Two hands, huge arcs, huge hits.' },
  dagger:     { name: 'Rondel Dagger',     emoji: '🔪', small: true, len: 0.45, dmg: 0.7,  sever: 0.5, draw: 0.55, swing: 0.7, rec: 0.6, stam: 0.6, move: 1.15, knock: 0.6, stun: 0,    block: 1.4, weight: 1,   color: '#c7c7c7', line: 'Tiny reach, lightning quick.' },
  axe:        { name: 'Battle Axe',        emoji: '🪓', len: 0.85, dmg: 1.0, sever: 1.6, draw: 1.2, swing: 0.85, rec: 1.3, stam: 1.2, move: 0.95, knock: 1.1, stun: 0,    block: 1,   weight: 1,   color: '#b5651d', line: 'Takes limbs off clean.' },
  hammer:     { name: 'War Hammer',        emoji: '🔨', len: 0.9,  dmg: 1.45,  sever: 0.6, draw: 1.5, swing: 1.35, rec: 1.2, stam: 1.35, move: 0.9, two: true, grip: 0.3, knock: 2.6, stun: 0.5,  block: 1,   weight: 1,   color: '#7a6a5a', line: 'Every hit a concussion.' },
  spear:      { name: 'Spear',             emoji: '🔱', len: 1.6,  dmg: 1.25,  sever: 0.5, draw: 1.0, swing: 1.05, rec: 1.3, stam: 0.9, move: 1, two: true, grip: 0.4, knock: 1.4, stun: 0,    block: 1.1, weight: 1,   color: '#8e7d5a', line: 'Keep them at the point.' },
  scythe:     { name: 'War Scythe',        emoji: '💀', len: 1.3,  dmg: 1.3,  sever: 1.5, draw: 1.4, swing: 1.55, rec: 1.1, stam: 1.2, move: 0.9, two: true, grip: 0.4, knock: 1,   stun: 0,    block: 1.1, weight: 0.8, color: '#4a4a5a', line: 'Strike with the heel of the blade.' },
  arming:     { name: 'Arming Sword',      emoji: '🗡️', len: 0.78, dmg: 0.85, sever: 1,   draw: 0.75, swing: 0.85, rec: 0.8, stam: 0.8, move: 1.05, knock: 0.9, stun: 0,   block: 0.9, weight: 1,   color: '#b8c4d0', line: 'Short, light and quick.' },
  mace:       { name: 'Flanged Mace',      emoji: '⚒️', len: 0.75, dmg: 1.2, sever: 0.6, draw: 1, swing: 1, rec: 1, stam: 1.05, move: 1, knock: 1.8, stun: 0.35, block: 1.1, weight: 1,   color: '#8a8f96', line: 'Dents helmets, rattles skulls.' },
  flail:      { name: 'Flail',             emoji: '⛓️', len: 0.86, dmg: 1.15, sever: 0.7, draw: 1.1, swing: 1.25, rec: 1.1, stam: 1.15, move: 1, knock: 2.4, stun: 0.3,  block: 1.3, weight: 1,   color: '#6f6a64', line: 'Hard to block with, harder to be hit by.' },
  pick:       { name: 'War Pick',          emoji: '⛏️', len: 0.8,  dmg: 1.25,  sever: 0.6, draw: 1.15, swing: 0.95, rec: 1.15, stam: 1.1, move: 0.95, knock: 1.2, stun: 0.25, block: 1, weight: 1,   color: '#5f6670', line: 'Punches straight through plate.' },
  fists:      { name: 'Bare Fists',        emoji: '👊', small: true, len: 0.15, dmg: 0.8,  sever: 0.5, draw: 0.45, swing: 0.6, rec: 0.5, stam: 0.5, move: 1.2, knock: 1.6, stun: 0.15, block: 1.5, weight: 0.8, color: '#e8cba8', line: 'No weapon this round. Good luck.' },
  excalibur:  { name: 'Excalibur',         emoji: '✨', len: 1.1,  dmg: 1.4,  sever: 2,   draw: 0.8, swing: 0.8, rec: 0.85, stam: 0.8, move: 1.05, knock: 1.5, stun: 0,    block: 0.6, weight: 0.35, color: '#ffd700', line: 'Jackpot! The legendary blade.' },
};
// Slice order around the wheel. Bare fists are off the wheel (WEAPON=fists npm start still forces them).
export const WHEEL = Object.keys(WEAPONS).filter((k) => k !== 'fists');

// Hitboxes, matched to each weapon's 3D model. Each zone is a capsule in the weapon's own frame:
// y runs from the grip along the weapon, x points along its edge (the side facing the target).
// m is the damage multiplier for landing with that zone: sweet spots > 1, handles and shafts < 1.
const Z = (x0, y0, x1, y1, r, m, tag) => ({ a: [x0, y0], b: [x1, y1], r, m, tag });
export const HITBOX = {
  longsword:  [Z(0, 0.03, 0, 0.35, 0.03, 0.6, 'near the hilt'), Z(0, 0.35, 0, 0.62, 0.03, 1), Z(0, 0.62, 0, 0.86, 0.03, 1.25, 'sweet spot'), Z(0, 0.86, 0, 0.98, 0.03, 1)],
  greatsword: [Z(0, 0.03, 0, 0.5, 0.04, 0.6, 'near the hilt'), Z(0, 0.5, 0, 0.9, 0.04, 1), Z(0, 0.9, 0, 1.22, 0.04, 1.25, 'sweet spot'), Z(0, 1.22, 0, 1.38, 0.04, 1)],
  dagger:     [Z(0, 0.02, 0, 0.3, 0.025, 0.8), Z(0, 0.3, 0, 0.47, 0.025, 1.3, 'right in the point')],
  axe:        [Z(0, -0.1, 0, 0.64, 0.025, 0.35, 'just the handle'), Z(0.12, 0.71, 0.12, 0.79, 0.1, 1.4, 'axe head')],
  hammer:     [Z(0, -0.08, 0, 0.74, 0.026, 0.3, 'just the handle'), Z(-0.075, 0.82, 0.075, 0.82, 0.077, 1.4, 'hammer face')],
  spear:      [Z(0, -0.1, 0, 1.45, 0.022, 0.3, 'shaft poke'), Z(0, 1.46, 0, 1.71, 0.04, 1.4, 'spear tip')],
  // The scythe's sweet spot is the heel, the inner part of the blade next to the pole, where it's strongest.
  scythe:     [Z(0, -0.1, 0, 1.24, 0.024, 0.4, 'just the pole'), Z(0.01, 1.315, 0.16, 1.277, 0.05, 1.6, 'HEEL STRIKE'), Z(0.16, 1.277, 0.52, 1.186, 0.035, 1)],
  arming:     [Z(0, 0.03, 0, 0.28, 0.028, 0.6, 'near the hilt'), Z(0, 0.28, 0, 0.5, 0.028, 1), Z(0, 0.5, 0, 0.7, 0.028, 1.25, 'sweet spot'), Z(0, 0.7, 0, 0.81, 0.028, 1)],
  mace:       [Z(0, -0.08, 0, 0.58, 0.02, 0.35, 'just the haft'), Z(0, 0.6, 0, 0.76, 0.075, 1.35, 'flanged head')],
  // The flail's chain is drawn straight out along the swing, with the spiked ball at the end.
  flail:      [Z(0, -0.05, 0, 0.36, 0.022, 0.3, 'just the handle'), Z(0, 0.38, 0, 0.74, 0.02, 0.6, 'the chain'), Z(0, 0.79, 0, 0.87, 0.08, 1.45, 'spiked ball')],
  pick:       [Z(0, -0.1, 0, 0.7, 0.024, 0.35, 'just the handle'), Z(0.03, 0.74, 0.2, 0.72, 0.03, 1.5, 'the spike')],
  fists:      [Z(0, 0.03, 0, 0.03, 0.1, 1)],
  excalibur:  [Z(0, 0.03, 0, 0.4, 0.035, 0.7, 'near the hilt'), Z(0, 0.4, 0, 0.72, 0.035, 1), Z(0, 0.72, 0, 1.0, 0.035, 1.3, 'sweet spot'), Z(0, 1.0, 0, 1.13, 0.035, 1)],
};
// Blunt weapons still knock limbs off, but every hit also leaves a bruise that slowly hurts.
export const BLUNT = new Set(['hammer', 'mace', 'flail', 'fists']);
// Where the best part of a weapon sits, handy for tuning reach.
const sweetDist = (id) => { const z = HITBOX[id].reduce((a, b) => (b.m > a.m ? b : a)); return (z.a[1] + z.b[1]) / 2; };
export const SPIN_TIME = 5.5;
export function rollWeapon() {
  const total = WHEEL.reduce((t, k) => t + WEAPONS[k].weight, 0);
  let r = Math.random() * total;
  for (const k of WHEEL) { r -= WEAPONS[k].weight; if (r <= 0) return k; }
  return 'longsword';
}
export const wpn = (p) => WEAPONS[p.weapon] || WEAPONS.longsword;
// Each timing scales with the matching part of the weapon's swing profile.
const PHASE = { DRAW: 'draw', HEAVY_AT: 'draw', ACTIVE: 'swing', CHAMBER: 'swing', RECOVER: 'rec', BOUNCE: 'rec' };
export const armsLeft = (p) => (p.parts.armR.cut ? 0 : 1) + (p.parts.armL.cut ? 0 : 1);
// A two-hander with only one arm left to swing it.
export const oneHanding = (p) => !!wpn(p).two && armsLeft(p) < 2;
// Heavy attacks swing a third slower and take a bit longer to recover from.
const HEAVY_TIME = { ACTIVE: 1.35, RECOVER: 1.2, CHAMBER: 1.35 };
// Overall swing pace: every weapon's wind-up, swing and recovery is this much slower than its table
// value, and the small ones (dagger, fists) a bit less so. The heavy-attack charge keeps its own timing.
export const PACE = 1.5, SMALL_PACE = 1.2;
export const tm = (p, k) => T[k] * (wpn(p)[PHASE[k]] ?? 1) * (k !== 'HEAVY_AT' && PHASE[k] ? (wpn(p).small ? SMALL_PACE : PACE) : 1) * (oneHanding(p) && PHASE[k] !== 'rec' ? 1.25 : 1) // weapon-scaled timing
  * (p.heavy && p.state !== 'hold' ? HEAVY_TIME[k] ?? 1 : 1);

// Bleeding, in health per second: each lost limb starts at `fresh` and eases down to `trickle`.
export const BLEED = { fresh: 1.2, trickle: 0.4, ease: 0.05 };
// Bruising from blunt hits, in health per second: it throbs at first, then eases to a dull ache.
export const BRUISE = { perDamage: 0.03, linger: 0.3, ease: 0.05 };
export const COST = { swing: 12, heavy: 20, block: 10, blockHeavy: 25, kick: 65, kickMin: 40, feint: 6, swingFeint: 10, jump: 6, sprint: 14 };

// Directions name the side the weapon is drawn back on, from the attacker's point of view.
// The blade arrives on the defender's opposite side, so they block with the mirrored direction.
export const MIRROR = { left: 'right', right: 'left', over: 'over' };
// a = yaw of the blade in degrees (+ is to the swinger's right), p = pitch (+ is up).
// Side slashes follow where you look, so looking down cuts at the legs.
export const SWING = {
  // wa, wp: where the swing's arc starts. show: where the weapon is held while drawn back, out where the
  // opponent can read it (a side swing high and wide on that side, an overhead straight up above the head),
  // instead of tucked behind the back. The swing blends from there into its arc in its first moments.
  left:  { wa: -125, wp: 25,  show: [-110, 34], a: [-100, 80], p: [12, -2],   dmg: [24, 32] },
  right: { wa: 125,  wp: 25,  show: [100, 48],  a: [100, -80], p: [12, -2],   dmg: [24, 32] },
  over:  { wa: -9,   wp: 150, show: [14, 108],  a: [-9, -9],   p: [125, -45], dmg: [28, 36] },
};

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - (1 - k) * (1 - k);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const D2R = Math.PI / 180;

export const legsLeft = (p) => (p.parts.legR.cut ? 0 : 1) + (p.parts.legL.cut ? 0 : 1);
export const swordArm = (p) => (!p.parts.armR.cut ? 'armR' : !p.parts.armL.cut ? 'armL' : null);
export const forward = (yaw) => [-Math.sin(yaw), 0, -Math.cos(yaw)];
export const rightOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];
// Footwork. A knight in armour walks at a steady 2.4 m/s, backs off slower and sidesteps a bit slower,
// and takes a moment to get going or stop. Used by the server and by your browser's prediction.
// Sprinting (Shift) is 60% faster, forward only, with both legs, and only with a weapon at rest.
export const WALK_SPEED = 2.4, ACCEL = 8, STRIDE = 3, SPRINT = 1.6;
export function moveGoal(p, mf, ms, yaw, blocking, sprint) {
  const legs = legsLeft(p);
  let speed = (legs === 2 ? WALK_SPEED : legs === 1 ? 2 : 0.9) * wpn(p).move;
  const sprinting = !!sprint && mf > 0 && legs === 2 && p.state === 'idle' && !blocking && p.stam > 1 && p.onGround !== false && !(p.stun > 0) && !(p.downT > 0);
  if (sprinting) speed *= SPRINT;
  if (p.state === 'hold') speed *= isHeavy(p) ? 0.45 : 0.65;
  else if (p.state !== 'idle' || blocking) speed *= 0.5;
  if (p.stun > 0 || p.downT > 0) speed = 0;
  const f = forward(yaw), r = rightOf(yaw), fw = mf > 0 ? mf : mf * 0.65, sd = ms * 0.8;
  let mx = f[0] * fw + r[0] * sd, mz = f[2] * fw + r[2] * sd;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  return { vx: mx * speed, vz: mz * speed, moving: ml > 0.1, sprinting: sprinting && ml > 0.1 };
}
export const isHeavy = (p) => (p.state === 'hold' && p.st >= tm(p, 'HEAVY_AT')) || (p.state === 'active' && p.heavy);
// How far up/down a side slash is aimed, from the head pitch in degrees.
// Looking well down (at someone lying on the ground) bends the swing down to the floor.
const slashTilt = (p, deg) => (p.sdir === 'over' ? 0 : clamp(deg, -75, 25) * 0.9);
// An overhead chop follows through lower when you look down.
const chopTilt = (p, deg) => (p.sdir === 'over' ? clamp(deg + 25, -35, 0) : 0);

// Where the weapon is drawn back to: a light attack's wind-up, or (hk = 1) a heavy's bigger one.
const windUp = (s, hk) => [s.wa * (1 + 0.15 * hk), s.wp + (s.wp > 90 ? 18 : 15) * hk];
const showUp = (s, hk) => [s.show[0] * (1 + 0.1 * hk), s.show[1] + (s.show[1] > 90 ? 12 : 10) * hk];
const SHOW_BLEND = 0.3; // fraction of the swing spent moving from the held pose onto the arc
// Local (forward, right, up) direction from blade yaw/pitch in degrees.
const bladeDir = (a, p) => [Math.cos(p * D2R) * Math.cos(a * D2R), Math.cos(p * D2R) * Math.sin(a * D2R), Math.sin(p * D2R)];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// Guard and block poses: hand offset from the neck (fwd, right, up) and blade direction.
const GUARD = [[0.32, 0.2, -0.38], [0.6, -0.1, 0.75]];
const BLOCK = {
  over: [[0.42, 0.3, 0.22], [0, -1, 0.08]],
  left: [[0.42, -0.28, -0.25], [0.15, 0, 1]],
  right: [[0.42, 0.32, -0.25], [0.15, 0, 1]],
};

// Sword pose in the knight's local frame: hand offset from the neck and blade direction.
export function swordLocal(p) {
  if (p.dead) return { hand: [0.25, 0.25, -0.7], dir: norm([0.3, 0, -1]) };
  if (p.weapon === 'fists' && p.stun <= 0) return fistLocal(p);
  if (p.stun > 0) return swingPose(140 + Math.sin(p.stun * 40) * 30, 60);
  if (p.blocking) return { hand: BLOCK[p.gdir][0], dir: norm(BLOCK[p.gdir][1]) };
  // Kicking: the weapon arm swings out wide for balance, clearing the view of the kick.
  if (p.state === 'kick') return mix(guardPose(p), { hand: [0.12, 0.5, -0.12], dir: norm([0.35, 0.75, 0.45]) }, kickCurve(p).knee);
  const s = SWING[p.sdir];
  if (p.state === 'hold') {
    const k = ease(clamp(p.st / tm(p, 'DRAW'), 0, 1));
    // Charging a heavy: the weapon keeps going further back until it's ready.
    const hk = ease(clamp((p.st - tm(p, 'DRAW')) / (tm(p, 'HEAVY_AT') - tm(p, 'DRAW')), 0, 1));
    const [wa, wp] = showUp(s, hk);
    return mix(guardPose(p), swingPose(wa, wp + slashTilt(p, p.pitch / D2R)), k);
  }
  const tilt = slashTilt(p, p.saim);
  if (p.state === 'active') {
    // The blade leaves from exactly where it was drawn back to, picks up speed, and slows into the
    // follow-through, so there's no jump at release and no robotic constant-speed sweep.
    const u = clamp(p.st / tm(p, 'ACTIVE'), 0, 1), k = u * u * (3 - 2 * u), hk = p.heavy ? 1 : 0, [wa, wp] = windUp(s, hk);
    const arc = swingPose(lerp(wa, s.a[1], k), lerp(wp, s.p[1] + chopTilt(p, p.saim), k) + tilt);
    if (u >= SHOW_BLEND) return arc;
    const [ha, hp] = showUp(s, hk);
    return mix(swingPose(ha, hp + tilt), arc, ease(u / SHOW_BLEND));
  }
  if (p.state === 'recover') {
    const k = ease(clamp(p.st / p.recDur, 0, 1));
    return mix(swingPose(s.a[1], s.p[1] + chopTilt(p, p.saim) + tilt), guardPose(p), k);
  }
  return guardPose(p);
}
// Bare fists box instead of swinging a weapon. Hands up by the chin at guard; an overhead attack is a
// straight right; a side attack is a hook thrown with the hand on that side, so a left is a left hook.
// Poses are worked out for the right hand and mirrored for the left. dir is the way the knuckles face.
const FIST_SH = [0, 0.2, -0.06];
const fistGuard = (p) => { const k = gait(p), w = p.walk || 0, br = p.breath || 0;
  return { hand: [0.34 + 0.015 * Math.sin(br * 1.6), 0.15, -0.01 + 0.02 * k * Math.sin(2 * w + 1.2)], dir: norm([0.55, -0.15, 0.8]) }; };
export const punchHand = (p) => (p.sdir === 'left' && ['hold', 'active', 'recover'].includes(p.state) && !p.parts.armL.cut) || p.parts.armR.cut ? 'armL' : 'armR';
const mirror = (q) => ({ hand: [q.hand[0], -q.hand[1], q.hand[2]], dir: [q.dir[0], -q.dir[1], q.dir[2]] });
// A hook: the fist travels round an arc in front of the shoulder, knuckles leading into the target. The
// elbow is bent at the wind-up and the arm opens out to full reach as it comes across the front.
const hookPose = (a, pt) => { const d = bladeDir(a, pt), r = ARM * lerp(0.95, 0.62, clamp(a / 65, 0, 1)); return { hand: [FIST_SH[0] + d[0] * r, FIST_SH[1] + d[1] * r, FIST_SH[2] + d[2] * r], dir: norm(bladeDir(a - 35, pt)) }; };
// A straight: drawn back to the cheek, then driven out to full reach along the line you're looking.
const jabBack = (hk) => ({ hand: [0.1 - 0.08 * hk, 0.2 + 0.04 * hk, -0.1], dir: norm([1, -0.05, 0.25]) });
const jabOut = (pt) => { const d = bladeDir(-6, pt); return { hand: [FIST_SH[0] + d[0] * ARM, FIST_SH[1] + d[1] * ARM, FIST_SH[2] + d[2] * ARM], dir: d }; };
function fistLocal(p) {
  const g = fistGuard(p);
  let q;
  if (p.blocking) q = { hand: [0.3, 0.1, 0.02], dir: norm([0.25, -0.1, 1]) }; // forearms up in front of the face
  else if (p.state === 'kick') q = g;
  else {
    const straight = p.sdir === 'over', aim = (deg) => clamp(deg, -60, 30) * 0.9 + 4;
    const wound = (hk, deg) => (straight ? jabBack(hk) : hookPose(55 + 15 * hk, aim(deg) * 0.6));
    if (p.state === 'hold') {
      const k = ease(clamp(p.st / tm(p, 'DRAW'), 0, 1));
      const hk = ease(clamp((p.st - tm(p, 'DRAW')) / (tm(p, 'HEAVY_AT') - tm(p, 'DRAW')), 0, 1));
      q = mix(g, wound(hk, p.pitch / D2R), k);
    } else if (p.state === 'active' || p.state === 'recover') {
      const deg = p.saim, end = straight ? jabOut(aim(deg)) : hookPose(-25, aim(deg) * 0.6);
      if (p.state === 'active') {
        const u = clamp(p.st / tm(p, 'ACTIVE'), 0, 1), k = u * u * (3 - 2 * u), w = wound(p.heavy ? 1 : 0, deg);
        q = straight ? mix(w, end, k) : hookPose(lerp(55 + (p.heavy ? 15 : 0), -25, k), aim(deg) * 0.6);
      } else q = mix(end, g, ease(clamp(p.st / p.recDur, 0, 1)));
    } else q = g;
  }
  return punchHand(p) === 'armL' ? mirror(q) : q;
}
// The weapon isn't frozen in place at guard: it rocks with each step (slightly behind the body, so it
// swings rather than riding along), breathes when you stand still, and lags a touch when you turn.
// p.breath and p.lag are only set in the browser, for looks.
function guardPose(p) {
  const k = gait(p), w = p.walk || 0, br = p.breath || 0, lag = p.lag || 0;
  const hand = [GUARD[0][0] - 0.03 * k * (1 - Math.cos(2 * w)), GUARD[0][1] + 0.03 * k * Math.sin(w + 0.6) + lag * 0.5,
    GUARD[0][2] + 0.035 * k * Math.sin(2 * w + 1.2) + 0.008 * Math.sin(br * 1.6)];
  const dir = [GUARD[1][0], GUARD[1][1] + 0.12 * k * Math.sin(w + 0.3) + lag, GUARD[1][2] + 0.06 * k * Math.cos(2 * w) + 0.02 * Math.sin(br * 1.6 + 0.5)];
  return { hand, dir: norm(dir) };
}
// 0 standing still, 1 at full walking pace.
const gait = (p) => (p.onGround === false ? 0 : clamp(Math.hypot(p.vx || 0, p.vz || 0) / (WALK_SPEED * 0.85), 0, 1));
// Swings pivot around the right shoulder (0.2 right, 0.06 below the neck).
function swingPose(a, pp) { const d = bladeDir(a, pp); return { hand: [d[0] * ARM, d[1] * ARM + 0.2, d[2] * ARM - 0.06], dir: d }; }
function mix(A, B, k) { return { hand: A.hand.map((v, i) => lerp(v, B.hand[i], k)), dir: norm(A.dir.map((v, i) => lerp(v, B.dir[i], k))) }; }

// Kick timing, 0..1: knee comes up (chamber), foot drives out to full extension, then pulls back.
export function kickCurve(p) {
  if (p.state !== 'kick') return { knee: 0, ext: 0 };
  const u = clamp(p.st / T.KICK, 0, 1);
  const knee = u < 0.28 ? ease(u / 0.28) : u < 0.7 ? 1 : 1 - ease((u - 0.7) / 0.3);
  const ext = u < 0.28 ? 0 : u < 0.5 ? ease((u - 0.28) / 0.22) : u < 0.62 ? 1 : 1 - ease((u - 0.62) / 0.38);
  return { knee, ext };
}
// All joint positions in world space, as [x, y, z].
export function skeleton(p) {
  const f = forward(p.yaw), r = rightOf(p.yaw);
  const L = (base, a, b, c) => [base[0] + f[0] * a + r[0] * b, base[1] + c, base[2] + f[2] * a + r[2] * b];
  const dirW = (d) => [f[0] * d[0] + r[0] * d[1], d[2], f[2] * d[0] + r[2] * d[1]];
  const base = [p.x, p.y, p.z];
  const legs = legsLeft(p);
  // Walking: feet stride along the direction of travel and lift as they swing through, the body rises
  // over each planted foot and dips between steps, and shifts a little over whichever leg is down.
  const k = legs === 2 ? gait(p) : 0, w = p.walk || 0;
  const sp = Math.hypot(p.vx || 0, p.vz || 0), vF = sp > 0.1 ? ((p.vx || 0) * f[0] + (p.vz || 0) * f[2]) / sp : 1, vR = sp > 0.1 ? ((p.vx || 0) * r[0] + (p.vz || 0) * r[2]) / sp : 0;
  const bob = 0.03 * k * Math.cos(2 * w), shift = -0.025 * k * Math.cos(w);
  const lean = (p.state === 'active' ? (p.sdir === 'over' ? 0.12 : 0.06) : p.state === 'hold' ? -0.04 : 0) + 0.04 * k * vF - 0.1 * kickCurve(p).knee;
  const hipH = (legs ? LEG : 0.22) + bob;
  const hip = L(base, 0, shift, hipH);
  const neck = L(base, lean, shift * 0.6, hipH + TORSO);
  const head = L(base, lean * 1.2, shift * 0.5, hipH + TORSO + HEAD_R + 0.06);
  const shR = L(neck, 0, 0.2, -0.06), shL = L(neck, 0, -0.2, -0.06);

  const sw = Math.sin(w) * 0.3 * k, air = p.onGround ? 0 : 1;
  const liftR = Math.max(0, Math.cos(w)) * 0.14 * k, liftL = Math.max(0, -Math.cos(w)) * 0.14 * k;
  let footR = L(base, sw * vF * (1 - air) + 0.15 * air, 0.12 + sw * vR, liftR + 0.25 * air);
  const footL = L(base, -sw * vF * (1 - air) - 0.05 * air, -0.12 - sw * vR, liftL + 0.12 * air);
  // Kick: the right leg (or the left one if that's all that's left) chambers, knee up, then the foot
  // drives out to hip height and pulls back. A missed kick ends overextended (see stepPlayer).
  const kc = kickCurve(p), kickLeg = p.parts.legR.cut ? 'legL' : 'legR', ks = kickLeg === 'legR' ? 0.07 : -0.07;
  const kneeH = lerp(hipH * 0.5, hipH - 0.05, kc.knee), kneeF = lerp(0.12, 0.42, kc.knee);
  const kickKnee = L(base, kneeF, ks, kneeH);
  const kickFoot = L(base, lerp(kneeF - 0.08, 1.02, kc.ext), ks + 0.02, lerp(Math.max(0.02, kneeH - 0.42), hipH * 1.05, kc.ext));
  const kicking = kc.knee > 0 || kc.ext > 0;
  if (kicking && kickLeg === 'legR') footR = kickFoot;
  const footL2 = kicking && kickLeg === 'legL' ? kickFoot : footL;
  const hipR = L(hip, 0, 0.1, 0), hipL = L(hip, 0, -0.1, 0);
  const bend = (h, ft) => [(h[0] + ft[0]) / 2 + f[0] * 0.12, (h[1] + ft[1]) / 2 + 0.05, (h[2] + ft[2]) / 2 + f[2] * 0.12];
  const knee = (h, ft, leg) => (kicking && leg === kickLeg && kc.ext < 0.95 ? kickKnee : bend(h, ft));

  const fists = p.weapon === 'fists', holder = fists && swordArm(p) ? punchHand(p) : swordArm(p);
  let hand = null, tip = null;
  if (holder) {
    // p.swordPose: the browser passes a smoothed copy of swordLocal so the weapon glides between poses.
    const s = p.swordPose || swordLocal(p);
    // An off-hand holder shifts the grip over to its own side.
    const ho = holder === 'armL' && !fists ? [s.hand[0], s.hand[1] - 0.3, s.hand[2]] : s.hand;
    hand = L(neck, ho[0], ho[1], ho[2]);
    const d = dirW(s.dir);
    const len = wpn(p).len;
    tip = [hand[0] + d[0] * len, hand[1] + d[1] * len, hand[2] + d[2] * len];
    // The edge faces the way the knight is facing, so axe heads and scythe blades point at the target.
    let e = [f[0], 0, f[2]], k = dot(e, d);
    e = [e[0] - d[0] * k, e[1] - d[1] * k, e[2] - d[2] * k];
    if (Math.hypot(...e) < 0.2) { k = d[1]; e = [-d[0] * k, 1 - d[1] * k, -d[2] * k]; }
    var wdir = d, wedge = norm(e);
  }
  // The free arm flails goofily.
  const fl = -Math.sin(w) * 0.22 * k + Math.sin(w * 1.3 + 1) * 0.08 * (1 - k) + (p.stun > 0 ? Math.sin(p.stun * 30) * 0.4 : 0);
  const limp = p.dead || p.downT > 0;
  const freeHand = (side) => {
    if (limp) return L(neck, 0.05, side * 0.28, -0.6);
    // With bare fists the other hand stays up guarding the face.
    if (fists && p.stun <= 0) { const q = p.blocking ? [0.3, 0.1, 0.02] : fistGuard(p).hand; return L(neck, q[0], side * Math.abs(q[1]), q[2]); }
    return L(neck, 0.15 + fl, side * 0.32, -0.55 + Math.abs(fl) * 0.3);
  };
  const handR = holder === 'armR' ? hand : freeHand(1);
  // Two-handed weapons: the left hand grips further down the handle.
  const g = wpn(p).grip || 0, twoHands = holder === 'armR' && wpn(p).two && !p.parts.armL.cut && !p.dead;
  const handL = holder === 'armL' ? hand : twoHands ? [hand[0] - wdir[0] * g, hand[1] - wdir[1] * g, hand[2] - wdir[2] * g] : freeHand(-1);
  const sk = { wdir: holder ? wdir : null, wedge: holder ? wedge : null, hip, hipR, hipL, neck, head, shR, shL, footR, footL: footL2, kneeR: knee(hipR, footR, 'legR'), kneeL: knee(hipL, footL2, 'legL'), handR, handL, hand, tip, f, r };
  // Knocked down or dead: the whole body tips over around the feet.
  const tb = tumble(p);
  if (tb.angle || tb.lift) {
    const pt = (v) => { if (!v) return v; const q = rotAxis([v[0] - base[0], v[1] - base[1], v[2] - base[2]], tb.axis, tb.angle); return [q[0] + base[0], q[1] + base[1] + tb.lift, q[2] + base[2]]; };
    for (const key of ['hip', 'hipR', 'hipL', 'neck', 'head', 'shR', 'shL', 'footR', 'footL', 'kneeR', 'kneeL', 'handR', 'handL', 'hand', 'tip']) sk[key] = pt(sk[key]);
    if (sk.wdir) { sk.wdir = rotAxis(sk.wdir, tb.axis, tb.angle); sk.wedge = rotAxis(sk.wedge, tb.axis, tb.angle); }
  }
  return sk;
}

// Falling over. Knocked down (by a kick): thrown onto your back, lie there a moment, then get up.
// Dead: the knees give, then the body drops like dead weight in the direction it was hit, with a
// small bounce. angle tips the body around the feet toward fallYaw; lift keeps it resting on the ground.
export const DOWN = { fall: 0.3, lie: 1.0, rise: 0.6 };
export function tumble(p) {
  let a = 0, lift = 0;
  if (p.dead) {
    const t = p.deathT || 0, fall = clamp((t - 0.12) / 0.45, 0, 1);
    a = 1.5 * fall * fall;
    if (t > 0.57) a -= 0.09 * Math.exp(-(t - 0.57) * 7) * Math.abs(Math.sin((t - 0.57) * 18));
    lift = -0.3 * ease(clamp(t / 0.25, 0, 1)) * (1 - fall) + 0.1 * fall;
  } else if (p.downT > 0) {
    const t = p.downT, D = DOWN;
    const k = t < D.fall ? ease(t / D.fall) : t < D.fall + D.lie ? 1 : 1 - ease(clamp((t - D.fall - D.lie) / D.rise, 0, 1));
    a = 1.45 * k; lift = 0.1 * k;
  }
  if (!a && !lift) return { angle: 0, lift: 0 };
  const fy = p.fallYaw ?? p.yaw + Math.PI, d = forward(fy);
  return { angle: a, lift, axis: [d[2], 0, -d[0]] };
}
// Rotate vector v around a unit axis by angle (Rodrigues).
function rotAxis(v, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cx = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cx[i] * s + k[i] * kd * (1 - c));
}

// ---------- geometry ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function segSegDist(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return Math.hypot(...r);
  if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return Math.hypot(...sub(c1, c2));
}

export function partShapes(sk) {
  return {
    head: { a: sk.head, b: sk.head, r: HEAD_R },
    torso: { a: sk.hip, b: sk.neck, r: 0.17 },
    armR: { a: sk.shR, b: sk.handR, r: 0.07 },
    armL: { a: sk.shL, b: sk.handL, r: 0.07 },
    legR: { a: sk.hipR, b: sk.footR, r: 0.09 },
    legL: { a: sk.hipL, b: sk.footL, r: 0.09 },
  };
}
const touching = (w, def, shapes, order) => order.filter((k) => !def.parts[k].cut && segSegDist(w.a, w.b, shapes[k].a, shapes[k].b) <= shapes[k].r + (w.r ?? 0.04));

// The part of the attacker that does damage this tick.
// The damaging zones of whatever the attacker is swinging, in world space, best zones first.
export function weaponZones(p, sk) {
  if (sk.tip) {
    const off = p.parts.armR.cut && p.weapon !== 'fists' ? 0.8 : 1, h = sk.hand, d = sk.wdir, e = sk.wedge;
    const at = ([x, y]) => [h[0] + d[0] * y + e[0] * x, h[1] + d[1] * y + e[1] * x, h[2] + d[2] * y + e[2] * x];
    return (HITBOX[p.weapon] || HITBOX.longsword).map((z) => ({ a: at(z.a), b: at(z.b), r: z.r, m: z.m * off, tag: z.tag })).sort((a, b) => b.m - a.m);
  }
  const f = sk.f;
  if (legsLeft(p)) return [{ a: sk.hip, b: [sk.hip[0] + f[0] * 0.75, sk.hip[1] - 0.2, sk.hip[2] + f[2] * 0.75], r: 0.06, m: 0.25 }];
  return [{ a: sk.head, b: [sk.head[0] + f[0] * 0.4, sk.head[1], sk.head[2] + f[2] * 0.4], r: 0.08, m: 0.2 }];
}

// ---------- players & rooms ----------
export function newParts() {
  const o = {};
  for (const k of PARTS) o[k] = { hp: PART_MAX[k], cut: false };
  return o;
}

export function newPlayer(id, name) {
  return {
    id, name, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true,
    weapon: 'longsword', parts: newParts(), gdir: 'right', state: 'idle', sdir: 'right', st: 0, saim: 0, recDur: T.RECOVER,
    release: false, heavy: false, hitDone: false, blocking: false, stun: 0, flinch: 0, cd: 0, riposte: 0,
    stam: STAM_MAX, stamWait: 0, dead: false, deathT: 0, headless: false,
    walk: 0, bleed: 0, score: 0, color: 0, input: { mf: 0, ms: 0, j: 0, b: 0, s: 0 }, prevB: 0,
  };
}

export function resetFighter(p, side) {
  Object.assign(p, {
    x: 0, y: 0, z: side === 0 ? 4 : -4, vx: 0, vy: 0, vz: 0, yaw: side === 0 ? 0 : Math.PI, pitch: 0, onGround: true,
    parts: newParts(), state: 'idle', st: 0, release: false, heavy: false, hitDone: false, blocking: false,
    stun: 0, flinch: 0, cd: 0, riposte: 0, stam: STAM_MAX, stamWait: 0,
    dead: false, deathT: 0, downT: 0, fallYaw: 0, headless: false, bleed: 0, wounds: 0, bruise: 0, bruiseAche: 0, color: side, panic: undefined, queued: null,
  });
  p.input.yaw = p.yaw; p.input.pitch = 0;
  p.spawnSeq = (p.spawnSeq || 0) + 1; // tells the client to snap its camera to the new spawn
}

const spend = (p, n) => { p.stam = Math.max(0, p.stam - n); p.stamWait = 0.7; };
const canAct = (p) => !p.dead && p.stun <= 0 && !(p.downT > 0);

// Start drawing the weapon back. The direction can still change until release.
// An attack pressed while you're still finishing the last one (or a moment too early) isn't thrown
// away: it's remembered for a moment and starts the instant you're free, so swings chain.
const QUEUE_FOR = 0.8;
// Combo: the second half of a normal recovery (not a parried bounce) can go straight into the next wind-up.
const canStart = (p) => canAct(p) && !(p.flinch > 0) && p.stam >= 5
  && ((p.state === 'idle' && !(p.cd > 0)) || (p.state === 'recover' && p.comboOk && p.st >= p.recDur * T.COMBO_AT));
export function startHold(p, dir) {
  if (!canStart(p)) {
    // Remember the click so it swings as soon as it can, including a click made while your last
    // swing is still winding up after you let go (spam clicking chains swings instead of losing them).
    if (!p.dead && (p.state !== 'hold' || p.release)) p.queued = { dir, t: 0, release: false };
    return false;
  }
  p.state = 'hold'; p.st = 0; p.release = false; p.heavy = false; p.blocking = false; p.queued = null; p.comboOk = false;
  if (DIRS.includes(dir)) p.sdir = dir;
  return true;
}
export function releaseHold(p) { if (p.state === 'hold') p.release = true; else if (p.queued) p.queued.release = true; }
// Cancel an attack: any time during the wind-up, or early in the swing before it connects.
export function feint(p, room) {
  if (p.dead) return false;
  p.queued = null;
  if (p.state === 'hold') { p.state = 'idle'; p.st = 0; p.cd = 0.15; spend(p, COST.feint * wpn(p).stam); }
  else if (p.state === 'active' && !p.hitDone && p.st < tm(p, 'ACTIVE') * T.FEINT_IN) { p.state = 'idle'; p.st = 0; p.cd = 0.2; p.heavy = false; spend(p, COST.swingFeint * wpn(p).stam); }
  else return false;
  room.events.push({ t: 'feint', id: p.id });
  return true;
}
export function kick(p, room) {
  // A kick is a big commitment: it needs a good reserve of stamina and burns most of it.
  if (!canAct(p) || !(p.state === 'idle' || p.state === 'hold') || p.stam < COST.kickMin || !legsLeft(p) || !p.onGround) return false;
  p.state = 'kick'; p.st = 0; p.hitDone = false; p.blocking = false; spend(p, COST.kick);
  room.events.push({ t: 'kickSwing', id: p.id });
  return true;
}
// Old one-shot attack: hold and release in one go (used by tests and simple clients).
export function tryAttack(p, dir) { if (startHold(p, dir)) { releaseHold(p); return true; } return false; }

function kill(room, p, how, fallYaw) {
  if (p.dead) return;
  p.dead = true; p.deathT = 0; p.state = 'idle'; p.blocking = false; p.downT = 0;
  // The body drops the way the killing blow pushed it; bleeding out, it slumps backwards.
  p.fallYaw = fallYaw ?? p.yaw + Math.PI + rand(-0.6, 0.6);
  room.events.push({ t: 'death', id: p.id, how });
}
// Taking a hit cancels whatever you were winding up and briefly stops you attacking.
function interrupt(p, flinch) {
  if (p.state === 'hold' || p.state === 'active') { p.state = 'idle'; p.st = 0; }
  p.flinch = Math.max(p.flinch, flinch);
}

function damage(room, att, def, partName, amount, sk, zone = {}) {
  const part = def.parts[partName];
  part.hp -= amount;
  const sh = partShapes(sk)[partName];
  const at = [(sh.a[0] + sh.b[0]) / 2, (sh.a[1] + sh.b[1]) / 2, (sh.a[2] + sh.b[2]) / 2];
  const fa = forward(att.yaw);
  const W = wpn(att);
  room.events.push({ t: 'hit', id: def.id, by: att.id, part: partName, pos: at, dmg: Math.round(amount), dir: [fa[0], fa[2]], heavy: att.heavy, weapon: att.weapon, zm: zone.m, tag: zone.tag });
  if (BLUNT.has(att.weapon)) { const b = amount * BRUISE.perDamage; def.bruise = (def.bruise || 0) + b; def.bruiseAche = (def.bruiseAche || 0) + b * BRUISE.linger; }
  def.vx += fa[0] * 2.2 * W.knock; def.vz += fa[2] * 2.2 * W.knock;
  if (W.knock >= 2.5) { def.vy = Math.max(def.vy, W.knock * 0.9); def.onGround = false; } // yeet
  if (W.stun) def.stun = Math.max(def.stun, W.stun * (att.heavy ? 1.5 : 1));
  interrupt(def, 0.35);
  if (part.hp > 0) return;
  // Punches can't tear anything off: a battered limb stays on, and a final blow to the head is a knockout.
  if (att.weapon === 'fists' && partName !== 'torso') {
    if (partName === 'head') return kill(room, def, 'knockout', att.yaw + rand(-0.4, 0.4));
    part.hp = 1; return;
  }
  if (partName === 'torso') return kill(room, def, 'gutted', att.yaw + rand(-0.4, 0.4));
  const hadSword = swordArm(def) === partName;
  part.cut = true; part.hp = 0;
  // A fresh stump gushes at first, then slows to a trickle that never quite stops.
  if (partName !== 'head') { def.bleed += BLEED.fresh; def.wounds = (def.wounds || 0) + 1; }
  const ra = rightOf(att.yaw), side = att.sdir === 'left' ? 1 : att.sdir === 'right' ? -1 : rand(-0.5, 0.5);
  room.events.push({
    t: 'sever', id: def.id, by: att.id, part: partName, pos: at, sword: hadSword, weapon: def.weapon, color: def.color,
    vel: [fa[0] * rand(2, 4) + ra[0] * side * 3, rand(4, 6.5), fa[2] * rand(2, 4) + ra[2] * side * 3], yaw: def.yaw,
  });
  if (partName === 'head') { def.headless = true; kill(room, def, 'decapitated', att.yaw + rand(-0.4, 0.4)); }
  else if (hadSword && swordArm(def)) room.events.push({ t: 'quip', id: def.id, kind: 'spare' });
}

function stepPlayer(room, p, dt) {
  if (p.dead) {
    p.deathT += dt;
    // Dead weight: the body just slides to a stop where it fell.
    const k = Math.pow(0.002, dt); p.vx *= k; p.vz *= k;
  } else {
    p.st += dt; p.cd = Math.max(0, p.cd - dt); p.flinch = Math.max(0, p.flinch - dt); p.riposte = Math.max(0, p.riposte - dt);
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
    if (p.downT > 0) { p.downT += dt; if (p.downT >= DOWN.fall + DOWN.lie + DOWN.rise) p.downT = 0; }
    const blockPressed = p.input.b && !p.prevB;
    p.prevB = p.input.b;
    if (blockPressed && feint(p, room)) { /* pressing block mid-attack cancels it */ }
    else if (p.state === 'hold') {
      if (DIRS.includes(p.input.d)) p.sdir = p.input.d;
      if (p.st >= T.MAX_HOLD) p.release = true;
      const draw = p.riposte > 0 ? T.RIPOSTE_DRAW : tm(p, 'DRAW');
      if (p.release && p.st >= draw) {
        p.heavy = p.st >= tm(p, 'HEAVY_AT'); p.saim = p.pitch / D2R;
        p.state = 'active'; p.st = 0; p.hitDone = false; p.riposte = 0;
        spend(p, (p.heavy ? COST.heavy : COST.swing) * wpn(p).stam);
        room.events.push({ t: 'swing', id: p.id, dir: p.sdir, heavy: p.heavy });
      }
    } else if (p.state === 'active' && p.st >= tm(p, 'ACTIVE')) { p.state = 'recover'; p.st = 0; p.recDur = tm(p, 'RECOVER'); p.comboOk = true; }
    else if (p.state === 'recover' && p.st >= p.recDur) { p.state = 'idle'; p.st = 0; p.cd = p.queued ? 0 : 0.05; }
    else if (p.state === 'kick' && p.st >= T.KICK) {
      p.state = 'idle'; p.st = 0; p.cd = 0.1;
      // Kicking thin air leaves you overextended: you stumble forward and can't act for a moment.
      if (!p.hitDone) {
        const f = forward(p.yaw); p.vx += f[0] * 1.6; p.vz += f[2] * 1.6;
        p.stun = Math.max(p.stun, T.KICK_MISS); p.stamWait = Math.max(p.stamWait || 0, 0.8);
        room.events.push({ t: 'kickMiss', id: p.id });
      }
    }
    if (p.queued) { // a buffered attack: start it as soon as you can, on the side you're steering to now
      const q = p.queued; q.t += dt;
      if (q.t > QUEUE_FOR) p.queued = null;
      else if (canStart(p) && startHold(p, DIRS.includes(p.input.d) ? p.input.d : q.dir) && q.release) p.release = true;
    }
    if (p.state === 'idle' && DIRS.includes(p.input.d)) p.gdir = p.input.d;
    p.blocking = !!p.input.b && p.state === 'idle' && p.stun <= 0 && !(p.downT > 0);

    if (p.stamWait > 0) p.stamWait -= dt;
    else if (!p.blocking) p.stam = Math.min(STAM_MAX, p.stam + 20 * dt);

    const legs = legsLeft(p);
    const goal = moveGoal(p, p.input.mf, p.input.ms, p.yaw, p.blocking, p.input.s), ml = goal.moving ? 1 : 0;
    p.sprinting = goal.sprinting;
    if (p.sprinting) { p.stam = Math.max(0, p.stam - COST.sprint * dt); p.stamWait = Math.max(p.stamWait, 0.4); }
    const accel = p.onGround ? ACCEL : 2;
    p.vx += (goal.vx - p.vx) * Math.min(1, accel * dt);
    p.vz += (goal.vz - p.vz) * Math.min(1, accel * dt);
    if (p.onGround && legs && p.input.j && p.stun <= 0 && !(p.downT > 0) && p.stam >= COST.jump) {
      p.vy = legs === 2 ? 5.2 : 4; p.onGround = false; spend(p, COST.jump);
      room.events.push({ t: 'jump', id: p.id });
    } else if (p.onGround && legs === 1 && ml > 0.1 && p.state !== 'kick') {
      p.vy = 2.6; p.onGround = false; // one leg left: hop everywhere
      room.events.push({ t: 'hop', id: p.id });
    }
    if (p.bleed) { p.bleed = Math.max((p.wounds || 0) * BLEED.trickle, p.bleed - BLEED.ease * dt); p.parts.torso.hp -= p.bleed * dt; }
    if (p.bruise) { p.bruise = Math.max(p.bruiseAche || 0, p.bruise - BRUISE.ease * dt); p.parts.torso.hp -= p.bruise * dt; } // internal bruising from blunt hits
    if (p.parts.torso.hp <= 0) { p.parts.torso.hp = 0; kill(room, p, p.bleed >= (p.bruise || 0) ? 'bled out' : 'bruised to death'); }
  }
  p.vy -= 14 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  const d = Math.hypot(p.x, p.z), maxR = ARENA_R - 0.5;
  if (d > maxR) { p.x *= maxR / d; p.z *= maxR / d; }
  if (p.onGround) p.walk += Math.hypot(p.vx, p.vz) * dt * STRIDE;
}

function facing(def, att) {
  const fd = forward(def.yaw), to = [att.x - def.x, att.z - def.z], tl = Math.hypot(...to) || 1;
  return (fd[0] * to[0] + fd[2] * to[1]) / tl > 0.35;
}

function resolveSwing(room, att, def) {
  if (att.state !== 'active') att.lastSt = 0;
  if (att.dead || def.dead || att.hitDone) return;
  const ska = skeleton(att), skd = skeleton(def), shapes = partShapes(skd);

  if (att.state === 'kick') {
    if (att.st < T.KICK_HIT[0] || att.st > T.KICK_HIT[1]) return;
    const foot = att.parts.legR.cut ? ska.footL : ska.footR;
    if (def.downT > 0 || !touching({ a: ska.hip, b: foot }, def, shapes, ['torso', 'legR', 'legL', 'armR', 'armL']).length) return;
    // Kicks can't be blocked: they knock you flat on your back, and you have to get up again,
    // which leaves you open to a free hit.
    att.hitDone = true;
    def.parts.torso.hp -= 6; def.blocking = false; interrupt(def, 0.3);
    if (def.state === 'kick') def.state = 'idle';
    def.downT = 1e-3; def.fallYaw = att.yaw;
    const fa = forward(att.yaw); def.vx += fa[0] * 3; def.vz += fa[2] * 3;
    room.events.push({ t: 'kick', id: def.id, by: att.id, pos: skd.hip });
    return;
  }
  if (att.state !== 'active') return;
  const tilt = slashTilt(att, att.saim);
  const order = att.sdir === 'over' ? ['head', 'armR', 'armL', 'torso', 'legR', 'legL']
    : tilt < -15 ? ['legR', 'legL', 'armR', 'armL', 'torso', 'head'] : ['head', 'armR', 'armL', 'torso', 'legR', 'legL'];
  // The part of the weapon that actually connects decides the damage: at the first moment of contact,
  // whichever zone is pressed deepest into the target. Several blade positions between last tick and this
  // one are checked, so quick swings can't skip past a target, and contact is found where it first happens.
  const stNow = att.st, stPrev = Math.min(att.lastSt || 0, stNow); att.lastSt = stNow;
  let touched = [], w = null;
  for (let k = 1; k <= 4 && !w; k++) {
    att.st = stPrev + ((stNow - stPrev) * k) / 4;
    const sk = k === 4 ? ska : skeleton(att);
    let best = Infinity;
    for (const z of weaponZones(att, sk)) {
      const t = touching(z, def, shapes, order); if (!t.length) continue;
      const depth = Math.min(...t.map((k) => segSegDist(z.a, z.b, shapes[k].a, shapes[k].b) - shapes[k].r - z.r));
      if (depth < best) { best = depth; w = z; touched = t; }
    }
  }
  att.st = stNow;
  if (!w) return;
  att.hitDone = true;
  const faces = facing(def, att);
  let mul = 1;

  // Chamber: the defender released a swing from the matching side at just the right moment.
  if (def.state === 'active' && def.st <= tm(def, 'CHAMBER') && def.sdir === MIRROR[att.sdir] && skd.tip && faces) {
    att.state = 'recover'; att.st = 0; att.recDur = tm(att, 'BOUNCE'); att.stun = 0.4;
    room.events.push({ t: 'chamber', id: def.id, by: att.id, pos: ska.tip || ska.head });
    return;
  }
  if (def.blocking && def.gdir === MIRROR[att.sdir] && faces && skd.tip) {
    const cost = (att.heavy ? COST.blockHeavy : COST.block) * wpn(def).block;
    if (def.stam >= cost) {
      spend(def, cost);
      att.state = 'recover'; att.st = 0; att.recDur = tm(att, 'BOUNCE');
      const fa = forward(att.yaw); att.vx -= fa[0] * 2; att.vz -= fa[2] * 2;
      def.riposte = 0.7; // the blocker gets a faster swing back
      if (att.heavy) def.stun = 0.45; // heavies stagger even when blocked
      room.events.push({ t: 'parry', id: def.id, by: att.id, pos: ska.tip || ska.head, heavy: att.heavy });
      return;
    }
    // Not enough stamina: the guard breaks and the hit goes through, softened.
    def.stam = 0; def.stun = 0.8; mul = 0.6;
    room.events.push({ t: 'guardbreak', id: def.id });
  } else if (def.blocking && faces) room.events.push({ t: 'wrongblock', id: def.id });

  const part = touched[0];
  // Moving into a swing hits harder; backing away from one softens it.
  const n = [def.x - att.x, def.z - att.z], nl = Math.hypot(...n) || 1;
  const closing = ((att.vx - def.vx) * n[0] + (att.vz - def.vz) * n[1]) / nl;
  const W = wpn(att);
  let dmg = DMG_SCALE * rand(...SWING[att.sdir].dmg) * W.dmg * (part === 'torso' ? 1 : part === 'head' ? 1 + (W.sever - 1) * 0.3 : W.sever) * w.m * mul * (att.heavy ? 1.5 : 1) * (oneHanding(att) ? 0.7 : 1) * clamp(1 + closing * 0.1, 0.75, 1.35);
  if (part === 'head') dmg = Math.min(dmg, PART_MAX.head * HEAD_CAP); // no single blow to the head kills
  damage(room, att, def, part, dmg, skd, w);
}

export function stepRoom(room, dt) {
  const fighters = room.fighters.filter(Boolean);
  for (const p of fighters) {
    const frozen = room.phase === 'countdown' || room.phase === 'spin';
    if (!p.dead && !frozen) {
      if (Number.isFinite(p.input.yaw)) p.yaw = p.input.yaw;
      if (Number.isFinite(p.input.pitch)) p.pitch = p.input.pitch;
    }
    if (frozen) { p.vx = p.vz = 0; continue; }
    stepPlayer(room, p, dt);
  }
  if (fighters.length === 2) {
    const [a, b] = fighters;
    resolveSwing(room, a, b); resolveSwing(room, b, a);
    // Don't let them walk through each other.
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3, min = 0.75;
    if (!a.dead && !b.dead && d < min) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
    }
  }
  // Round flow.
  room.timer -= dt;
  if (room.phase === 'waiting' && fighters.length === 2) startRound(room, true);
  else if (room.phase !== 'waiting' && fighters.length < 2) { room.phase = 'waiting'; room.msg = 'Waiting for a challenger…'; }
  else if (room.phase === 'fight') {
    const alive = fighters.filter((p) => !p.dead);
    if (alive.length < 2) {
      room.phase = 'roundEnd'; room.timer = 3.5;
      if (alive.length === 1) {
        alive[0].score++;
        room.msg = `${alive[0].name} wins the round!`;
        if (alive[0].score >= WIN_SCORE) {
          // That's the match. Both fighters can vote for a rematch (voteRematch), or leave.
          const [a, b] = fighters.map((p) => p.score).sort((x, y) => y - x);
          room.phase = 'over'; room.msg = `${alive[0].name} WINS THE DUEL ${a}–${b}!`;
          room.events.push({ t: 'matchEnd', winner: alive[0].id });
        }
      } else room.msg = 'Everybody died. Classic.';
      room.events.push({ t: 'roundEnd' });
    }
  } else if (room.phase === 'roundEnd' && room.timer <= 0) {
    startRound(room, false);
  } else if (room.phase === 'spin' && room.timer <= 0) { room.phase = 'countdown'; room.timer = 1.3; room.msg = 'Ready…'; }
  else if (room.phase === 'countdown' && room.timer <= 0) { room.phase = 'fight'; room.msg = 'FIGHT!'; }
}

// After a match, a fighter asks for a rematch. When both have, a fresh best-of-5 starts at 0–0.
export function voteRematch(room, p) {
  if (room.phase !== 'over' || !room.fighters.includes(p)) return false;
  p.rematch = true;
  if (room.fighters.every((f) => f && f.rematch)) startRound(room, true);
  else room.events.push({ t: 'rematchAsk', id: p.id });
  return true;
}

function startRound(room, resetScores) {
  room.fighters.forEach((p, i) => { if (p) { resetFighter(p, i); p.rematch = false; if (resetScores) p.score = 0; } });
  // Spin the wheel of fortune for everyone's weapon this round.
  const result = {};
  room.fighters.forEach((p) => { if (p) { p.weapon = WEAPONS[room.forceWeapon] ? room.forceWeapon : rollWeapon(); result[p.id] = p.weapon; } });
  room.phase = 'spin'; room.timer = SPIN_TIME; room.msg = 'Spinning the Wheel of Weapons…';
  room.song = Math.floor(Math.random() * 1e9); // everyone's browser plays the same fight track from this
  room.events.push({ t: 'round' }, { t: 'spin', result, dur: SPIN_TIME });
}

export function newRoom(name) {
  return { name, fighters: [null, null], phase: 'waiting', timer: 0, msg: 'Waiting for a challenger…', events: [] };
}

const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
export function snapshotPlayer(p) {
  return {
    id: p.id, name: p.name, x: r3(p.x), y: r3(p.y), z: r3(p.z), vx: r2(p.vx), vy: r2(p.vy), vz: r2(p.vz), yaw: r3(p.yaw), pitch: r2(p.pitch),
    onGround: p.onGround, gdir: p.gdir, state: p.state, sdir: p.sdir, st: r3(p.st), saim: Math.round(p.saim), recDur: p.recDur,
    heavy: p.heavy, blocking: p.blocking, sprinting: !!p.sprinting, comboOk: !!p.comboOk, stun: r2(p.stun), riposte: p.riposte > 0, stam: Math.round(p.stam),
    ack: p.ack || 0, queued: !!p.queued,
    dead: p.dead, deathT: r2(p.deathT), headless: p.headless, downT: r2(p.downT || 0), fallYaw: r2(p.fallYaw ?? 0),
    weapon: p.weapon, walk: r2(p.walk), score: p.score, rematch: !!p.rematch, color: p.color, bleed: p.bleed, bruise: r2(p.bruise || 0), spawn: p.spawnSeq || 0,
    parts: Object.fromEntries(PARTS.map((k) => [k, { hp: Math.max(0, Math.round(p.parts[k].hp)), cut: p.parts[k].cut }])),
  };
}
