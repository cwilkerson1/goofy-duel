import { W, H, GROUND, HEAD_R, ARM, LEG, BLADE, PART_MAX, WIN_SCORE, skeleton, zoneFromAim, legsLeft } from '/shared/sim.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const COLORS = ['#e0493e', '#3e7be0'];
const ZONE_COLOR = { over: '#ffd23f', thrust: '#3fe0ff', low: '#ff4fd8' };
const ZONE_LABEL = { over: 'OVERHEAD', thrust: 'THRUST', low: 'LOW' };

// ---------- lobby ----------
const GOOFY = ['Sir Flops-a-Lot', 'Lady Stabsworth', 'Duke Nubbin', 'Earl of Ouch', 'Sir Limpsalot', 'Baroness Bonk'];
const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const params = new URLSearchParams(location.search);
$('name').value = store.get('duel.name') || GOOFY[(Math.random() * GOOFY.length) | 0];
$('room').value = params.get('room') || store.get('duel.room') || 'main';
$('go').onclick = () => {
  const name = $('name').value.trim() || 'Nameless Knight', room = $('room').value.trim() || 'main';
  store.set('duel.name', name); store.set('duel.room', room);
  $('lobby').remove();
  audio.init();
  connect(name, room);
};
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && $('go').click());

// ---------- layout ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H) * 0.98;
  canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
}
addEventListener('resize', fit); fit();

// ---------- network ----------
let ws = null, myId = null, amFighter = false, connected = false;
let prev = null, cur = null, prevT = 0, curT = 0;
function connect(name, room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);
  ws.onopen = () => { connected = true; };
  ws.onclose = () => { connected = false; setTimeout(() => connect(name, room), 1500); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; amFighter = m.fighter; return; }
    if (m.t === 's') {
      prev = cur; prevT = curT; cur = m; curT = performance.now();
      amFighter = m.players.some((p) => p && p.id === myId);
      for (const ev of m.ev) handleEvent(ev);
    }
  };
}
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- input ----------
const keys = new Set();
let mouse = { x: W / 2, y: H / 2 }, mouseBlock = false;
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyB' && !e.repeat) send({ t: 'bot' });
  if (e.code === 'KeyM' && !e.repeat) audio.muted = !audio.muted;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseBlock = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
});
canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (e.button === 0) send({ t: 'atk' });
  if (e.button === 2) mouseBlock = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) mouseBlock = false; });

let lastSent = '', lastSentT = 0, myAim = 0, myFace = 1;
function sendInput(me) {
  if (!me) return;
  const sh = skeleton(me).shoulder;
  const dx = mouse.x - sh[0], dy = mouse.y - sh[1];
  if (Math.abs(dx) > 6) myFace = dx > 0 ? 1 : -1;
  myAim = (Math.atan2(-dy, Math.max(Math.abs(dx), 1)) * 180) / Math.PI;
  const o = {
    t: 'in', l: keys.has('KeyA') || keys.has('ArrowLeft'), r: keys.has('KeyD') || keys.has('ArrowRight'),
    j: keys.has('KeyW') || keys.has('Space') || keys.has('ArrowUp'), b: mouseBlock || keys.has('ShiftLeft') || keys.has('ShiftRight'),
    aim: Math.round(myAim), face: myFace,
  };
  const s = JSON.stringify(o), now = performance.now();
  if (s !== lastSent || now - lastSentT > 100) { send(o); lastSent = s; lastSentT = now; }
}

// ---------- effects ----------
const particles = [], gibs = [], decals = [], floaters = [], bubbles = [];
let shake = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const findP = (id) => cur && cur.players.find((p) => p && p.id === id);

function blood(x, y, n, dir = 0, power = 1) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: dir * rnd(40, 260) * power + rnd(-120, 120), vy: rnd(-380, -40) * power, r: rnd(2, 4.5), life: rnd(0.6, 1.4) });
}
const QUIPS = {
  armF: ["It's just a flesh wound!", 'I have another one!', 'That arm was a loan!', 'Unarmed? Rude.'],
  armB: ["Didn't need that one", 'Lefty no more!', 'My best waving arm!'],
  legF: ["I'll hop it off!", 'Who needs legs anyway?', 'Behold, my unicycle mode!'],
  legB: ['Hop-a-long time!', "That's going to hurt tomorrow", 'Leg day: cancelled.'],
  spare: ['Good thing I brought a spare sword!', 'Switching hands!'],
  both_legs: ['Come back, I shall bite your ankles!', 'Tactical crawl!'],
  no_arms: ['I can still kick you!', 'Fine, HEADBUTTS then.'],
  wrongblock: ['Wrong way!', 'Ow, other side!'],
  parry: ['Nope!', 'Not today!', 'CLANG!'],
};
function say(id, kind) { const lines = QUIPS[kind]; if (lines) bubbles.push({ id, text: pick(lines), life: 2.2 }); }

function handleEvent(ev) {
  const p = findP(ev.id);
  switch (ev.t) {
    case 'swing': audio.whoosh(ev.dir); break;
    case 'hit':
      blood(ev.x, ev.y, 18, ev.dir); shake = Math.max(shake, 6); audio.thud();
      floaters.push({ x: ev.x, y: ev.y - 10, text: `-${ev.dmg}`, life: 0.9, color: '#fff' });
      break;
    case 'sever': {
      const kind = ev.part === 'head' ? 'head' : ev.part.startsWith('arm') ? 'arm' : 'leg';
      gibs.push({ kind, x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, ang: rnd(0, 6.28), va: rnd(-14, 14), color: COLORS[ev.color], sword: ev.sword, face: ev.face, life: 0, rest: false });
      blood(ev.x, ev.y, 55, Math.sign(ev.vx), 1.4); shake = 14; audio.squelch();
      floaters.push({ x: ev.x, y: ev.y - 30, text: kind === 'head' ? 'DECAPITATED!' : 'SEVERED!', life: 1.3, color: '#ffd23f', big: true });
      if (p && kind !== 'head') {
        const legs = (p.parts.legF.cut || ev.part === 'legF' ? 0 : 1) + (p.parts.legB.cut || ev.part === 'legB' ? 0 : 1);
        const arms = (p.parts.armF.cut || ev.part === 'armF' ? 0 : 1) + (p.parts.armB.cut || ev.part === 'armB' ? 0 : 1);
        say(ev.id, legs === 0 && kind === 'leg' ? 'both_legs' : arms === 0 && kind === 'arm' ? 'no_arms' : ev.part);
      }
      break;
    }
    case 'quip': setTimeout(() => say(ev.id, ev.kind), 900); break;
    case 'parry': audio.clang(); shake = Math.max(shake, 5); say(ev.id, 'parry');
      for (let i = 0; i < 14; i++) particles.push({ x: ev.x, y: ev.y, vx: rnd(-300, 300), vy: rnd(-300, 100), r: 2, life: 0.3, spark: true });
      break;
    case 'wrongblock': say(ev.id, 'wrongblock'); break;
    case 'death': audio.slide(); break;
    case 'jump': audio.boing(1); break;
    case 'hop': audio.boing(1.6); break;
    case 'round': gibs.length = 0; decals.length = Math.min(decals.length, 120); bubbles.length = 0; audio.horn(); break;
  }
}

function stepEffects(dt) {
  for (const p of particles) {
    p.vy += 1300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.y >= GROUND && !p.spark) { if (decals.length < 400) decals.push({ x: p.x, w: rnd(4, 11), h: rnd(1.5, 3.5) }); p.life = 0; }
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  for (const g of gibs) {
    g.life += dt;
    if (g.rest) continue;
    g.vy += 1500 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.ang += g.va * dt;
    if (g.life < 1.6 && Math.random() < 0.7) particles.push({ x: g.x, y: g.y, vx: rnd(-60, 60), vy: rnd(-120, 20), r: rnd(1.5, 3), life: 0.8 });
    const floor = GROUND - (g.kind === 'head' ? HEAD_R : 4);
    if (g.y > floor) {
      g.y = floor; g.vy *= -0.38; g.vx *= 0.6; g.va *= 0.6;
      if (Math.abs(g.vy) < 60) { g.vy = 0; if (Math.abs(g.vx) < 15) { g.rest = true; g.ang = g.kind === 'head' ? g.ang : Math.round(g.ang / Math.PI) * Math.PI; } }
      if (Math.abs(g.vy) > 100) audio.boing(2.4, 0.04);
    }
    if (g.x < 10 || g.x > W - 10) { g.vx *= -0.6; g.x = Math.max(10, Math.min(W - 10, g.x)); }
  }
  for (const f of floaters) { f.life -= dt; f.y -= 40 * dt; }
  for (const b of bubbles) b.life -= dt;
  for (const a of [floaters, bubbles]) for (let i = a.length - 1; i >= 0; i--) if (a[i].life <= 0) a.splice(i, 1);
  shake = Math.max(0, shake - 40 * dt);
}

// ---------- interpolation ----------
function interpPlayers() {
  if (!cur) return [];
  if (!prev) return cur.players;
  const k = Math.min(1, (performance.now() - curT) / Math.max(16, curT - prevT));
  return cur.players.map((p) => {
    if (!p) return null;
    const q = prev.players.find((o) => o && o.id === p.id);
    if (!q || Math.abs(q.x - p.x) > 120 || q.state !== p.state) return p;
    const L = (a, b) => a + (b - a) * k;
    return { ...p, x: L(q.x, p.x), y: L(q.y, p.y), walk: L(q.walk, p.walk), st: L(q.st, p.st), stun: L(q.stun, p.stun), deathT: L(q.deathT, p.deathT) };
  });
}

// ---------- drawing ----------
function line(a, b, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
function circle(x, y, r, fill, stroke, lw = 3) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#6db3ff'); g.addColorStop(1, '#cfe9ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  circle(1100, 90, 46, '#fff6b0');
  ctx.fillStyle = '#ffffffcc';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 380 + t * 12) % (W + 300)) - 150, y = 70 + i * 37;
    for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 32], [60, 0, 24]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }
  }
  ctx.fillStyle = '#7fc46a';
  ctx.beginPath(); ctx.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, GROUND - 90 - Math.sin(x / 170) * 45 - Math.sin(x / 63) * 12);
  ctx.lineTo(W, GROUND); ctx.fill();
  // a tiny castle, for honour
  ctx.fillStyle = '#9a8fb0';
  ctx.fillRect(170, GROUND - 210, 90, 110);
  for (let i = 0; i < 5; i++) ctx.fillRect(170 + i * 20, GROUND - 222, 12, 14);
  ctx.fillStyle = '#5a4f73'; ctx.fillRect(205, GROUND - 140, 22, 40);
  ctx.fillStyle = '#5a9e4a'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#4b8a3d'; for (let x = 0; x < W; x += 22) ctx.fillRect(x, GROUND, 11, 6);
  ctx.fillStyle = '#8a0f0f';
  for (const d of decals) { ctx.beginPath(); ctx.ellipse(d.x, GROUND + 2, d.w, d.h, 0, 0, 7); ctx.fill(); }
}

function drawSword(hand, tip, glow) {
  const dx = tip[0] - hand[0], dy = tip[1] - hand[1], l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l, ux = dx / l, uy = dy / l;
  if (glow) { ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 18; line(hand, tip, 7, glow); ctx.restore(); }
  line([hand[0] - ux * 10, hand[1] - uy * 10], hand, 5, '#6b4423');
  line([hand[0] + ux * 4, hand[1] + uy * 4], tip, 4, '#e8eef5');
  line([hand[0] + ux * 4 + nx * 9, hand[1] + uy * 4 + ny * 9], [hand[0] + ux * 4 - nx * 9, hand[1] + uy * 4 - ny * 9], 4, '#c9a227');
}

function drawHead(x, y, face, color, mood, ang = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  circle(0, 0, HEAD_R, '#ffe0bd', '#3a2a1a', 3);
  // helmet
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -2, HEAD_R + 1, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-3, -HEAD_R - 1); ctx.lineTo(0, -HEAD_R - 12); ctx.lineTo(3, -HEAD_R - 1); ctx.fill();
  const ex = face * 5;
  ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 2.2;
  if (mood === 'dead') {
    for (const ox of [ex - 4, ex + 4]) { ctx.beginPath(); ctx.moveTo(ox - 2.5, 1.5); ctx.lineTo(ox + 2.5, 6.5); ctx.moveTo(ox + 2.5, 1.5); ctx.lineTo(ox - 2.5, 6.5); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(ex, 10, 3, 2, 0, 0, 7); ctx.fill();
  } else {
    const r = mood === 'ouch' ? 2.8 : 1.8;
    circle(ex - 4, 3, r, '#1a1a1a'); circle(ex + 4, 3, r, '#1a1a1a');
    ctx.beginPath();
    if (mood === 'ouch') ctx.ellipse(ex, 10, 3, 3.5, 0, 0, 7), ctx.fill();
    else if (mood === 'grin') { ctx.arc(ex, 7, 4, 0.1, Math.PI - 0.1); ctx.stroke(); }
    else { ctx.moveTo(ex - 3, 10); ctx.lineTo(ex + 3, 9); ctx.stroke(); }
  }
  ctx.restore();
}

function stump(pt) { circle(pt[0], pt[1], 5, '#b3121b'); if (Math.random() < 0.5) particles.push({ x: pt[0], y: pt[1], vx: rnd(-90, 90), vy: rnd(-200, -60), r: rnd(1.5, 3), life: 0.7 }); }

function drawFighter(p, isMe) {
  const sk = skeleton(p);
  const col = COLORS[p.color], dark = '#2a1e33';
  ctx.save();
  // Fall over when dead (unless the headless body is still sprinting around).
  const running = p.headless && p.deathT < 2.6 && legsLeft(p);
  if (p.dead && !running) {
    const k = Math.min(1, (p.headless ? p.deathT - 2.6 : p.deathT) / 0.45);
    ctx.translate(p.x, p.y); ctx.rotate(-p.face * k * Math.PI / 2 * 0.95); ctx.translate(-p.x, -p.y);
  }
  const cut = (k) => p.parts[k].cut;
  if (!cut('legB')) { line(sk.hip, sk.kneeB, 8, dark); line(sk.kneeB, sk.footB, 8, dark); }
  if (!cut('armB') && sk.hand !== sk.handB) line(sk.shoulder, sk.handB, 7, '#c9b49a');
  line(sk.hip, sk.neck, 14, col);
  // belt
  line([sk.hip[0] - 7, sk.hip[1] - 4], [sk.hip[0] + 7, sk.hip[1] - 4], 4, '#3a2a1a');
  if (!cut('legF')) { line(sk.hip, sk.kneeF, 8, '#3b2c4a'); line(sk.kneeF, sk.footF, 8, '#3b2c4a'); }
  for (const k of ['legF', 'legB']) if (cut(k)) stump([sk.hip[0] + (k === 'legF' ? 4 : -4) * p.face, sk.hip[1] + 2]);
  for (const k of ['armF', 'armB']) if (cut(k)) stump(sk.shoulder);
  if (cut('head')) stump(sk.neck);

  // Telegraph the swing direction while winding up, so it can be read and blocked.
  const glow = p.state === 'windup' ? ZONE_COLOR[p.sdir] : p.blocking ? '#ffffff' : null;
  if (sk.tip) drawSword(sk.hand, sk.tip, glow);
  const holder = !cut('armF') ? 'armF' : !cut('armB') ? 'armB' : null;
  if (holder) line(sk.shoulder, sk.hand, 7, '#e8cba8');
  if (!cut('armF') && holder !== 'armF') line(sk.shoulder, sk.handF, 7, '#e8cba8');
  if (!cut('head')) {
    const hurt = p.parts.torso.hp < 40 || p.stun > 0;
    drawHead(sk.head[0], sk.head[1], p.face, col, p.dead ? 'dead' : hurt ? 'ouch' : p.state === 'active' ? 'grin' : 'meh');
  }
  ctx.restore();

  if (p.dead) return;
  if (p.state === 'windup') {
    ctx.fillStyle = ZONE_COLOR[p.sdir]; ctx.font = 'bold 16px Trebuchet MS'; ctx.textAlign = 'center';
    ctx.fillText(p.sdir === 'over' ? '⬇' : p.sdir === 'low' ? '〰' : '➜', sk.head[0], sk.head[1] - 34);
  }
  if (p.stun > 0) { ctx.fillStyle = '#ffd23f'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('💫', sk.head[0] + Math.sin(p.stun * 20) * 10, sk.head[1] - 30); }
  if (isMe) drawAimWheel(p, sk);
  ctx.fillStyle = '#ffffffdd'; ctx.font = 'bold 13px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.fillText(p.name + (p.bot ? ' 🤖' : ''), p.x, sk.head[1] - HEAD_R - (p.state === 'windup' ? 52 : 20));
}

function drawAimWheel(p, sk) {
  const zone = zoneFromAim(myAim), [cx, cy] = sk.shoulder, f = myFace, R = 110;
  const sectors = { over: [35, 90], thrust: [-20, 35], low: [-90, -20] };
  for (const [z, [a, b]] of Object.entries(sectors)) {
    ctx.beginPath();
    const toCanvas = (deg) => (f > 0 ? -deg : 180 + deg) * Math.PI / 180;
    ctx.arc(cx, cy, R, Math.min(toCanvas(a), toCanvas(b)), Math.max(toCanvas(a), toCanvas(b)));
    ctx.strokeStyle = z === zone ? ZONE_COLOR[z] : '#ffffff30'; ctx.lineWidth = z === zone ? 5 : 3; ctx.stroke();
  }
  ctx.fillStyle = ZONE_COLOR[zone]; ctx.font = 'bold 12px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.fillText(ZONE_LABEL[zone] + (p.blocking ? ' BLOCK' : ''), cx + f * (R + 40), cy + (zone === 'over' ? -60 : zone === 'low' ? 70 : 0));
}

function drawGib(g) {
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ang);
  if (g.kind === 'head') { ctx.restore(); drawHead(g.x, g.y, g.face, g.color, 'dead', g.ang); return; }
  const len = g.kind === 'arm' ? ARM : LEG;
  line([-len / 2, 0], [len / 2, 0], g.kind === 'arm' ? 7 : 8, g.kind === 'arm' ? '#e8cba8' : '#3b2c4a');
  circle(-len / 2, 0, 4.5, '#b3121b');
  if (g.sword) drawSword([len / 2, 0], [len / 2 + BLADE, 0], null);
  ctx.restore();
}

function drawHud(players) {
  ctx.textAlign = 'left';
  players.forEach((p, i) => {
    const x = i === 0 ? 24 : W - 24, al = i === 0 ? 'left' : 'right';
    ctx.textAlign = al; ctx.fillStyle = COLORS[i]; ctx.font = 'bold 20px Trebuchet MS';
    ctx.fillText(p ? p.name : '— empty —', x, 34);
    if (!p) return;
    ctx.font = '20px sans-serif'; ctx.fillStyle = '#fff';
    let pips = ''; for (let k = 0; k < WIN_SCORE; k++) pips += k < p.score ? '🏆' : '·';
    ctx.fillText(pips, x, 60);
    // torso health bar
    const bw = 220, bx = i === 0 ? x : x - bw;
    ctx.fillStyle = '#0006'; ctx.fillRect(bx, 70, bw, 12);
    ctx.fillStyle = p.parts.torso.hp > 40 ? '#5ad15a' : '#e0493e';
    ctx.fillRect(bx, 70, (bw * p.parts.torso.hp) / PART_MAX.torso, 12);
    if (p.bleed) { ctx.fillStyle = '#ff6b6b'; ctx.font = '12px Trebuchet MS'; ctx.fillText('bleeding!', x, 98); }
    // mini body chart
    const mx = i === 0 ? x + 250 : x - 250, my = 48;
    const c = (k) => (p.parts[k].cut ? '#00000055' : p.parts[k].hp / PART_MAX[k] > 0.5 ? '#5ad15a' : '#ffb03f');
    circle(mx, my - 22, 7, c('head'));
    line([mx, my - 14], [mx, my + 10], 6, c('torso'));
    line([mx, my - 10], [mx + 13, my + 2], 4, c('armF')); line([mx, my - 10], [mx - 13, my + 2], 4, c('armB'));
    line([mx, my + 10], [mx + 8, my + 28], 4, c('legF')); line([mx, my + 10], [mx - 8, my + 28], 4, c('legB'));
  });
}

function drawCenterText(text, y, size, color = '#fff') {
  ctx.textAlign = 'center'; ctx.font = `bold ${size}px Trebuchet MS`;
  ctx.lineWidth = 6; ctx.strokeStyle = '#2a1e33'; ctx.strokeText(text, W / 2, y);
  ctx.fillStyle = color; ctx.fillText(text, W / 2, y);
}

let last = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  const players = interpPlayers();
  const me = players.find((p) => p && p.id === myId);
  if (me && !me.dead) sendInput(me);
  stepEffects(dt);

  ctx.save();
  if (shake) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  drawBackground(clock);
  for (const g of gibs) drawGib(g);
  for (const p of players) if (p) drawFighter(p, p.id === myId);
  for (const p of particles) circle(p.x, p.y, p.r, p.spark ? '#fff7a8' : '#c0141f');
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2); ctx.textAlign = 'center'; ctx.font = `bold ${f.big ? 26 : 16}px Trebuchet MS`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#2a1e33'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  for (const b of bubbles) {
    const p = players.find((q) => q && q.id === b.id); if (!p) continue;
    const sk = skeleton(p), bx = sk.head[0], by = sk.head[1] - 70;
    ctx.font = '15px Trebuchet MS'; const w = ctx.measureText(b.text).width + 20;
    ctx.globalAlpha = Math.min(1, b.life * 3);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx - w / 2, by - 18, w, 28, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - 6, by + 9); ctx.lineTo(bx, by + 20); ctx.lineTo(bx + 6, by + 9); ctx.fill();
    ctx.fillStyle = '#2a1e33'; ctx.textAlign = 'center'; ctx.fillText(b.text, bx, by + 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (cur) {
    drawHud(cur.players);
    if (cur.phase !== 'fight' || clock < 0) drawCenterText(cur.msg, 230, cur.phase === 'roundEnd' ? 44 : 34, cur.phase === 'roundEnd' ? '#ffd23f' : '#fff');
    if (!amFighter) drawCenterText(`Spectating (arena full)`, 290, 18);
    ctx.textAlign = 'center'; ctx.font = '13px Trebuchet MS'; ctx.fillStyle = '#ffffffb0';
    ctx.fillText('A/D move · W jump · mouse aims · click swing · right-click/Shift block · B bot · M mute', W / 2, H - 14);
  } else if (ws) drawCenterText(connected ? 'Connecting…' : 'Looking for the server…', H / 2, 30);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- goofy synth sounds ----------
const audio = {
  ctx: null, muted: false,
  init() { if (!this.ctx) try { this.ctx = new AudioContext(); } catch {} else if (this.ctx.state === 'suspended') this.ctx.resume(); },
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
  horn() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [392, 523, 659].forEach((fr, i) => { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; this.env(o, t + i * 0.12, 0.01, 0.18, 0.06); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.25); });
  },
};
