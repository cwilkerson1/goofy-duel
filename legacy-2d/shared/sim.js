// Shared game rules: used by the server (authoritative simulation) and the
// browser (to pose the stick figures from the snapshots the server sends).

export const W = 1280, H = 640, GROUND = 560;
export const LEG = 46, TORSO = 52, HEAD_R = 15, ARM = 38, BLADE = 66;
export const PARTS = ['head', 'torso', 'armF', 'armB', 'legF', 'legB'];
export const PART_MAX = { head: 45, torso: 100, armF: 25, armB: 25, legF: 30, legB: 30 };
export const WIN_SCORE = 5;

// Swing directions. The mouse angle picks one; blocking only works if the
// defender guards the same direction the attacker swings from.
export const SWING = {
  over:   { windup: 0.34, active: 0.16, recover: 0.30, from: 135, to: -50, dmg: [26, 36], reach: [1, 1] },
  thrust: { windup: 0.28, active: 0.14, recover: 0.34, from: 8,   to: 8,   dmg: [20, 27], reach: [0.35, 1.45] },
  low:    { windup: 0.32, active: 0.15, recover: 0.34, from: -25, to: -88, dmg: [28, 36], reach: [1, 1] },
};
const STANCE = { over: 70, thrust: 12, low: -25 };
const WINDUP_POSE = { over: 155, thrust: 10, low: 10 };
const BLOCK_POSE = { over: 95, thrust: 65, low: -70 };
// Which body part a swing reaches first when several overlap in one tick.
const HIT_PRIORITY = {
  over:   ['head', 'armF', 'armB', 'torso', 'legF', 'legB'],
  thrust: ['torso', 'armF', 'armB', 'head', 'legF', 'legB'],
  low:    ['legF', 'legB', 'armF', 'armB', 'torso', 'head'],
};
export const AIM_FOR_ZONE = { over: 60, thrust: 0, low: -45 };

export const zoneFromAim = (a) => (a > 35 ? 'over' : a < -20 ? 'low' : 'thrust');
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - (1 - k) * (1 - k);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const legsLeft = (p) => (p.parts.legF.cut ? 0 : 1) + (p.parts.legB.cut ? 0 : 1);
export const swordArm = (p) => (!p.parts.armF.cut ? 'armF' : !p.parts.armB.cut ? 'armB' : null);

// Sword angle (degrees, 0 = forward, positive = up) and arm reach for the current state.
export function swordPose(p) {
  const stance = p.zone === 'thrust' ? clamp(p.aim, -15, 30) * 0.6 + STANCE.thrust * 0.4 : STANCE[p.zone];
  if (p.dead) return { ang: -80, reach: 0.9 };
  if (p.stun > 0) return { ang: 150 + Math.sin(p.stun * 40) * 25, reach: 0.8 };
  if (p.blocking) return { ang: BLOCK_POSE[p.zone], reach: 0.75 };
  const s = SWING[p.sdir];
  const t = p.st;
  const thrustAng = clamp(p.saim, -15, 25);
  const from = p.sdir === 'thrust' ? thrustAng : s.from, to = p.sdir === 'thrust' ? thrustAng : s.to;
  if (p.state === 'windup') {
    const k = ease(clamp(t / s.windup, 0, 1));
    const wp = p.sdir === 'thrust' ? thrustAng : WINDUP_POSE[p.sdir];
    return { ang: lerp(stance, wp, k), reach: lerp(1, s.reach[0], k) };
  }
  if (p.state === 'active') {
    const k = clamp((t - s.windup) / s.active, 0, 1);
    return { ang: lerp(from, to, k), reach: lerp(s.reach[0], s.reach[1], k) };
  }
  if (p.state === 'recover') {
    const k = ease(clamp((t - s.windup - s.active) / s.recover, 0, 1));
    return { ang: lerp(to, stance, k), reach: lerp(s.reach[1], 1, k) };
  }
  return { ang: stance, reach: 1 };
}

// All joint positions in world space (y grows downward).
export function skeleton(p) {
  const f = p.face;
  const legs = legsLeft(p);
  const crouch = p.state === 'active' && p.sdir === 'low' ? 10 : 0;
  const hip = [p.x, p.y - (legs ? LEG : 9) + crouch];
  const lean = p.state === 'active' && p.sdir === 'thrust' ? 12 * f : p.state === 'active' && p.sdir === 'over' ? 6 * f : 0;
  const neck = [hip[0] + lean, hip[1] - TORSO];
  const head = [neck[0] + lean * 0.3, neck[1] - HEAD_R - 2];
  const shoulder = [neck[0], neck[1] + 7];

  const sw = Math.sin(p.walk) * 13;
  const air = p.onGround ? 0 : 1;
  const footF = [p.x + f * 7 + sw * (1 - air) + f * 10 * air, p.y - 12 * air];
  const footB = [p.x - f * 7 - sw * (1 - air) - f * 4 * air, p.y - 6 * air];
  const knee = (foot) => [(hip[0] + foot[0]) / 2 + f * 7, (hip[1] + foot[1]) / 2];
  const kneeF = knee(footF), kneeB = knee(footB);

  const { ang, reach } = swordPose(p);
  const rad = (ang * Math.PI) / 180;
  const d = [f * Math.cos(rad), -Math.sin(rad)];
  const holder = swordArm(p);
  const armHand = [shoulder[0] + d[0] * ARM * reach, shoulder[1] + d[1] * ARM * reach];
  const tip = [armHand[0] + d[0] * BLADE, armHand[1] + d[1] * BLADE];
  // The free arm flails goofily.
  const fl = -1.9 + Math.sin(p.walk * 1.3 + 1) * 0.5 + (p.stun > 0 ? Math.sin(p.stun * 30) : 0);
  const freeHand = [shoulder[0] + f * Math.cos(fl) * ARM * 0.9 - f * 6, shoulder[1] - Math.sin(fl) * ARM * 0.9];
  const handF = holder === 'armF' ? armHand : freeHand;
  const handB = holder === 'armB' ? armHand : [freeHand[0] - f * 10, freeHand[1]];
  return { hip, neck, head, shoulder, footF, footB, kneeF, kneeB, handF, handB, hand: holder ? armHand : null, tip: holder ? tip : null, ang };
}

// ---------- geometry ----------
function segSegDist(a, b, c, d) {
  const segPt = (p, a, b) => {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const l = abx * abx + aby * aby || 1e-9;
    const t = clamp(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l, 0, 1);
    return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t);
  };
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return 0;
  return Math.min(segPt(a, c, d), segPt(b, c, d), segPt(c, a, b), segPt(d, a, b));
}

function partShapes(sk) {
  return {
    head: { a: sk.head, b: sk.head, r: HEAD_R },
    torso: { a: sk.hip, b: sk.neck, r: 10 },
    armF: { a: sk.shoulder, b: sk.handF, r: 6 },
    armB: { a: sk.shoulder, b: sk.handB, r: 6 },
    legF: { a: sk.hip, b: sk.footF, r: 7 },
    legB: { a: sk.hip, b: sk.footB, r: 7 },
  };
}

// The part of the attacker that does damage this tick.
function weapon(p, sk) {
  if (sk.tip) return { a: sk.hand, b: sk.tip, mul: p.parts.armF.cut ? 0.8 : 1, kind: 'sword' };
  const f = p.face;
  if (legsLeft(p)) return { a: sk.hip, b: [sk.hip[0] + f * 55, sk.hip[1] + 10], mul: 0.25, kind: 'kick' };
  return { a: sk.head, b: [sk.head[0] + f * 30, sk.head[1]], mul: 0.2, kind: 'headbutt' };
}

// ---------- players & rooms ----------
export function newParts() {
  const o = {};
  for (const k of PARTS) o[k] = { hp: PART_MAX[k], cut: false };
  return o;
}

export function newPlayer(id, name) {
  return {
    id, name, x: 0, y: GROUND, vx: 0, vy: 0, face: 1, onGround: true,
    parts: newParts(), aim: 0, zone: 'thrust', state: 'idle', sdir: 'thrust', st: 0, saim: 0,
    hitDone: false, blocking: false, stun: 0, cd: 0, dead: false, deathT: 0, headless: false,
    walk: 0, bleed: 0, score: 0, color: 0, isBot: false, input: { l: 0, r: 0, j: 0, b: 0 }, prevB: 0,
    ai: null,
  };
}

export function resetFighter(p, side) {
  Object.assign(p, {
    x: side === 0 ? 420 : W - 420, y: GROUND, vx: 0, vy: 0, face: side === 0 ? 1 : -1, onGround: true,
    parts: newParts(), state: 'idle', st: 0, hitDone: false, blocking: false, stun: 0, cd: 0,
    dead: false, deathT: 0, headless: false, bleed: 0, color: side,
  });
}

export function tryAttack(p) {
  if (p.dead || p.stun > 0 || p.state !== 'idle' || p.cd > 0) return false;
  p.state = 'windup'; p.sdir = p.zone; p.st = 0; p.hitDone = false; p.saim = p.aim; p.blocking = false;
  return true;
}

function kill(room, p, how) {
  if (p.dead) return;
  p.dead = true; p.deathT = 0; p.state = 'idle'; p.blocking = false;
  room.events.push({ t: 'death', id: p.id, how });
}

function damage(room, att, def, partName, amount, sk) {
  const part = def.parts[partName];
  part.hp -= amount;
  const shape = partShapes(sk)[partName];
  const at = [(shape.a[0] + shape.b[0]) / 2, (shape.a[1] + shape.b[1]) / 2];
  room.events.push({ t: 'hit', id: def.id, by: att.id, part: partName, x: at[0], y: at[1], dmg: Math.round(amount), dir: att.face });
  def.vx += att.face * 160;
  if (part.hp > 0) return;
  if (partName === 'torso') return kill(room, def, 'gutted');
  const hadSword = swordArm(def) === partName;
  part.cut = true; part.hp = 0;
  def.bleed += partName === 'head' ? 0 : 1.6;
  room.events.push({
    t: 'sever', id: def.id, by: att.id, part: partName, x: at[0], y: at[1],
    vx: att.face * rand(150, 320), vy: rand(-520, -300), face: def.face, sword: hadSword, color: def.color,
  });
  if (partName === 'head') { def.headless = true; kill(room, def, 'decapitated'); }
  else if (hadSword && swordArm(def)) room.events.push({ t: 'quip', id: def.id, kind: 'spare' });
}

function stepPlayer(room, p, dt) {
  if (p.dead) {
    p.deathT += dt;
    // A headless body keeps running around for a bit, as one does.
    if (p.headless && p.deathT < 2.6 && legsLeft(p)) {
      if (!p.panic || Math.random() < dt * 2) p.panic = Math.random() < 0.5 ? -1 : 1;
      p.vx = p.panic * 200; p.face = p.panic;
      if (p.onGround && Math.random() < dt * 1.5) { p.vy = -380; p.onGround = false; }
    } else p.vx *= Math.pow(0.02, dt);
  } else {
    p.st += dt; p.cd = Math.max(0, p.cd - dt);
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
    const s = SWING[p.sdir];
    if (p.state === 'windup' && p.input.b && !p.prevB) { p.state = 'idle'; p.cd = 0.18; room.events.push({ t: 'feint', id: p.id }); }
    if (p.state === 'windup' && p.st >= s.windup) {
      p.state = 'active';
      room.events.push({ t: 'swing', id: p.id, dir: p.sdir });
      if (p.sdir === 'thrust' && p.onGround) p.vx += p.face * 260;
    }
    if (p.state === 'active' && p.st >= s.windup + s.active) p.state = 'recover';
    if (p.state === 'recover' && p.st >= s.windup + s.active + s.recover) { p.state = 'idle'; p.cd = 0.05; }
    p.blocking = !!p.input.b && p.state === 'idle' && p.stun <= 0;
    p.prevB = p.input.b;

    const legs = legsLeft(p);
    let speed = legs === 2 ? 230 : legs === 1 ? 140 : 55;
    if (p.state !== 'idle' || p.blocking) speed *= 0.45;
    if (p.stun > 0) speed = 0;
    const want = (p.input.r - p.input.l) * speed;
    const accel = p.onGround ? 14 : 4;
    p.vx += (want - p.vx) * Math.min(1, accel * dt);
    if (p.onGround && legs && p.input.j && p.stun <= 0) {
      p.vy = legs === 2 ? -560 : -430; p.onGround = false;
      room.events.push({ t: 'jump', id: p.id });
    } else if (p.onGround && legs === 1 && Math.abs(want) > 1) {
      p.vy = -240; p.onGround = false; // one leg left: hop everywhere
      room.events.push({ t: 'hop', id: p.id });
    }
    p.bleed && (p.parts.torso.hp -= p.bleed * dt);
    if (p.parts.torso.hp <= 0) { p.parts.torso.hp = 0; kill(room, p, 'bled out'); }
  }
  p.vy += 1500 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }
  p.x = clamp(p.x, 40, W - 40);
  if (p.onGround) p.walk += Math.abs(p.vx) * dt * 0.07;
}

function resolveSwing(room, att, def) {
  if (att.state !== 'active' || att.hitDone || def.dead || att.dead) return;
  const ska = skeleton(att), skd = skeleton(def);
  const w = weapon(att, ska);
  const shapes = partShapes(skd);
  const touched = HIT_PRIORITY[att.sdir].filter((k) => !def.parts[k].cut && segSegDist(w.a, w.b, shapes[k].a, shapes[k].b) <= shapes[k].r + 3);
  if (!touched.length) return;
  att.hitDone = true;
  const facingAttacker = Math.sign(att.x - def.x) === def.face;
  if (def.blocking && def.zone === att.sdir && facingAttacker && skd.tip) {
    att.stun = 0.75; att.state = 'idle'; att.vx -= att.face * 220;
    room.events.push({ t: 'parry', id: def.id, by: att.id, x: (ska.tip ? ska.tip[0] : ska.hip[0]), y: (ska.tip ? ska.tip[1] : ska.hip[1]) });
    return;
  }
  const part = touched[0];
  let dmg = rand(...SWING[att.sdir].dmg) * w.mul;
  if (att.sdir === 'thrust' && part === 'torso') dmg *= 1.6;
  if (def.blocking && facingAttacker && def.zone !== att.sdir) room.events.push({ t: 'wrongblock', id: def.id });
  damage(room, att, def, part, dmg, skd);
}

export function stepRoom(room, dt) {
  const fighters = room.fighters.filter(Boolean);
  for (const p of fighters) if (p.isBot) botThink(room, p, dt);
  for (const p of fighters) {
    if (!p.dead && p.state === 'idle' && p.stun <= 0) {
      p.zone = zoneFromAim(p.aim);
      if (p.input.face) p.face = p.input.face;
    }
    stepPlayer(room, p, dt);
  }
  if (fighters.length === 2) {
    const [a, b] = fighters;
    resolveSwing(room, a, b); resolveSwing(room, b, a);
    // Don't let them walk through each other.
    const dx = b.x - a.x;
    if (!a.dead && !b.dead && Math.abs(dx) < 48 && Math.abs(a.y - b.y) < 60) {
      const push = (48 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
    }
  }
  // Round flow.
  room.timer -= dt;
  if (room.phase === 'waiting' && fighters.length === 2) startRound(room, true);
  else if (room.phase !== 'waiting' && fighters.length < 2) { room.phase = 'waiting'; room.msg = 'Waiting for a challenger… (press B for a bot)'; }
  else if (room.phase === 'fight') {
    const alive = fighters.filter((p) => !p.dead);
    if (alive.length < 2) {
      room.phase = 'roundEnd'; room.timer = 3.2;
      if (alive.length === 1) {
        alive[0].score++;
        room.msg = alive[0].score >= WIN_SCORE ? `${alive[0].name} WINS THE DUEL!` : `${alive[0].name} wins the round!`;
        if (alive[0].score >= WIN_SCORE) room.timer = 6;
      } else room.msg = 'Everybody died. Classic.';
    }
  } else if (room.phase === 'roundEnd' && room.timer <= 0) {
    const over = fighters.some((p) => p.score >= WIN_SCORE);
    startRound(room, over);
  } else if (room.phase === 'countdown' && room.timer <= 0) { room.phase = 'fight'; room.msg = 'FIGHT!'; room.msgT = 1; }
}

function startRound(room, resetScores) {
  room.fighters.forEach((p, i) => { if (p) { resetFighter(p, i); if (resetScores) p.score = 0; } });
  room.phase = 'countdown'; room.timer = 1.5; room.msg = 'Ready…';
  room.events.push({ t: 'round' });
}

export function newRoom(name) {
  return { name, fighters: [null, null], phase: 'waiting', timer: 0, msg: 'Waiting for a challenger… (press B for a bot)', events: [] };
}

// ---------- bot ----------
const BOT_NAMES = ['Sir Wobbleton', 'Lady Flailsworth', 'Count Choppula', 'Baron von Noggin', 'Dame Limbsby', 'Squire Nubbins'];
export const botName = () => pick(BOT_NAMES);

function botThink(room, p, dt) {
  const opp = room.fighters.find((o) => o && o !== p);
  const ai = (p.ai ||= { think: 0.8, react: null, blockFor: 0, guess: null });
  const inp = p.input;
  inp.l = inp.r = inp.j = 0;
  if (!opp || room.phase !== 'fight' || p.dead) { inp.b = 0; return; }
  const dx = opp.x - p.x, dist = Math.abs(dx);
  inp.face = dx >= 0 ? 1 : -1;
  const legs = legsLeft(p);
  const ideal = swordArm(p) ? 95 : 45;
  if (!opp.dead) {
    if (dist > ideal + 15) dx > 0 ? (inp.r = 1) : (inp.l = 1);
    else if (dist < ideal - 30 && legs) dx > 0 ? (inp.l = 1) : (inp.r = 1);
  }
  // React to an incoming swing after a human-ish delay, guessing the direction.
  if (opp.state === 'windup' && !ai.react && !ai.guess) ai.react = rand(0.12, 0.32);
  if (ai.react !== null) {
    ai.react -= dt;
    if (ai.react <= 0) {
      ai.react = null;
      const right = Math.random() < 0.6;
      ai.guess = right ? opp.sdir : pick(['over', 'thrust', 'low']);
      if (ai.guess === 'low' && Math.random() < 0.35 && legs) { inp.j = 1; ai.guess = null; }
      else { p.aim = AIM_FOR_ZONE[ai.guess] + rand(-8, 8); ai.blockFor = 0.6; }
    }
  }
  if (ai.blockFor > 0) {
    ai.blockFor -= dt; inp.b = 1;
    if (ai.blockFor <= 0 || (opp.state !== 'windup' && opp.state !== 'active')) { ai.blockFor = 0; ai.guess = null; inp.b = 0; }
    return;
  }
  inp.b = 0;
  ai.think -= dt;
  if (ai.think <= 0 && dist < ideal + 40 && p.state === 'idle') {
    const z = pick(['over', 'thrust', 'low', 'over', 'low']);
    p.aim = AIM_FOR_ZONE[z] + rand(-6, 6);
    p.zone = z;
    tryAttack(p);
    ai.think = rand(0.5, 1.3);
  }
}

// Compact snapshot for the network.
export function snapshotPlayer(p) {
  return {
    id: p.id, name: p.name, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, face: p.face,
    onGround: p.onGround, aim: Math.round(p.aim), zone: p.zone, state: p.state, sdir: p.sdir,
    st: Math.round(p.st * 1000) / 1000, saim: Math.round(p.saim), blocking: p.blocking,
    stun: Math.round(p.stun * 100) / 100, dead: p.dead, deathT: Math.round(p.deathT * 100) / 100,
    headless: p.headless, walk: Math.round(p.walk * 100) / 100, score: p.score, color: p.color,
    bot: p.isBot, bleed: p.bleed,
    parts: Object.fromEntries(PARTS.map((k) => [k, { hp: Math.max(0, Math.round(p.parts[k].hp)), cut: p.parts[k].cut }])),
  };
}
