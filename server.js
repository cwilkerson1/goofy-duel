// Arena Roulette server: serves the browser client and runs the authoritative
// simulation. No npm dependencies; WebSocket handling is built in below.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newRoom, newPlayer, stepRoom, snapshotPlayer, tryAttack, startHold, releaseHold, kick, feint, voteRematch, hazardSnapshot } from './shared/sim.js';
import { makeBot, botThink } from './bot.js';
import { rtcReady, answerOffer } from './rtc.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TICK = 1 / 60, SEND_EVERY = 2; // simulate at 60 Hz, broadcast at 30 Hz

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.webm': 'audio/webm' };
const MUSIC_DIR = path.join(ROOT, 'public', 'music'), SFX_DIR = path.join(ROOT, 'public', 'sfx');
const isAudio = (f) => /\.(mp3|ogg|wav|m4a|aac|flac|webm)$/i.test(f);

// The game's version: the git commit it's running, or the time the game code last changed.
let ver = { at: 0, v: '' };
function version() {
  if (Date.now() - ver.at < 5000) return ver.v;
  let v = '';
  try { v = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  if (!v) try { v = String(Math.round(fs.statSync(path.join(ROOT, 'public', 'client.js')).mtimeMs)); } catch {}
  ver = { at: Date.now(), v };
  return v;
}
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  // Fight music: every audio file dropped into public/music/ is listed here and picked at random each fight.
  if (url === '/music.json') {
    fs.readdir(MUSIC_DIR, (err, files) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(err ? [] : files.filter(isAudio).sort().map((f) => '/music/' + encodeURIComponent(f))));
    });
    return;
  }
  // Recorded sound effects: public/sfx/<kind>/ holds any number of takes of each sound (clang, blade,
  // blunt, thud, swing, step, gore, grunt). Whatever's there is used; anything missing is synthesized.
  if (url === '/sfx.json') {
    const list = {};
    let kinds = [];
    try { kinds = fs.readdirSync(SFX_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
    for (const k of kinds) {
      try { const f = fs.readdirSync(path.join(SFX_DIR, k)).filter(isAudio).sort(); if (f.length) list[k] = f.map((x) => `/sfx/${encodeURIComponent(k)}/${encodeURIComponent(x)}`); } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(list));
    return;
  }
  const base = url.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // Game code is never cached, so a refresh always picks up an update. The page also stamps the
    // script address with the current version, and shows that version on the start screen.
    if (/\.(html|js|css|json)$/.test(file)) {
      if (file.endsWith('index.html')) {
        const v = version();
        const html = fs.readFileSync(file, 'utf8').replace('/client.js"', `/client.js?v=${v}"`).replace('__VERSION__', v);
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(html);
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    // Byte ranges let browsers (Safari especially) stream and loop music files.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- minimal WebSocket (RFC 6455, text frames only) ----------
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const ws = { socket, open: true, onmessage: () => {}, onclose: () => {} };
  let buf = Buffer.alloc(0);
  const frame = (op, payload) => {
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len])
      : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
    return Buffer.concat([head, payload]);
  };
  ws.send = (str) => { if (ws.open && !socket.destroyed) socket.write(frame(1, Buffer.from(str))); };
  ws.backlog = () => socket.writableLength; // bytes queued up that this player's connection hasn't taken yet
  const close = () => { if (!ws.open) return; ws.open = false; socket.destroy(); ws.onclose(); };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return close();
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i & 3])); }
      buf = buf.subarray(need);
      if (op === 8) { socket.write(frame(8, Buffer.alloc(0))); return close(); }
      if (op === 9) { socket.write(frame(10, payload)); continue; }
      if (op === 1) ws.onmessage(payload.toString());
    }
  });
  socket.on('close', close);
  socket.on('error', close);
  return ws;
}

// ---------- rooms ----------
const rooms = new Map();
let nextId = 1;
// WEAPON=scythe npm start  makes the wheel always land on one weapon (handy for practice).
const getRoom = (name) => { if (!rooms.has(name)) rooms.set(name, Object.assign(newRoom(name), { clients: new Set(), forceWeapon: process.env.WEAPON, forceMod: process.env.MOD })); return rooms.get(name); };

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  const ws = wsAccept(req, socket);
  if (!ws) return;
  // Practice: a private arena of your own against the computer knight.
  const practice = url.searchParams.has('practice');
  const room = getRoom(practice ? `practice-${nextId++}` : (url.searchParams.get('room') || 'main').slice(0, 24));
  if (practice) room.fighters[1] = makeBot(nextId++);
  const name = (url.searchParams.get('name') || 'Anonymous Knight').slice(0, 20);
  const me = newPlayer(nextId++, name);
  ws.me = me;
  room.clients.add(ws);
  const freeSlot = () => room.fighters.findIndex((f) => !f);
  // Strictly 1v1: the first two players fight, everyone after that watches.
  const slot = freeSlot();
  if (slot >= 0) { room.fighters[slot] = me; room.phase = 'waiting'; }
  ws.send(JSON.stringify({ t: 'welcome', id: me.id, room: room.name, fighter: slot >= 0, rtc: rtcReady() }));
  console.log(`[${room.name}] ${name} joined as ${slot >= 0 ? 'fighter' : 'spectator'}`);

  ws.onmessage = (raw) => handle(raw, (s) => ws.send(s));
  // Messages arrive over the WebSocket or the fast lane (rtc.js); reply goes back the way it came.
  const handle = (raw, reply) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'rtc-offer' && typeof m.sdp === 'string' && rtcReady() && !ws.rtc) { openFastLane(m.sdp); return; }
    // Connection diagnostics: browsers send at least every 0.1 s, so a long silence is their upload stalling.
    const nowMs = Date.now();
    if (ws.lastMsg && nowMs - ws.lastMsg > 400 && room.phase === 'fight') console.log(`[${room.name}] nothing arrived from ${me.name} for ${nowMs - ws.lastMsg} ms (their connection stalled)`);
    ws.lastMsg = nowMs;
    if (m.t === 'ping') { reply(JSON.stringify({ t: 'pong', c: m.c })); return; }
    // Every attack press is numbered, and the number of the last one handled goes back in the updates,
    // so the browser can tell "the server hasn't heard yet" (slow link) from "the server said no".
    if (m.t === 'hold' && Number.isFinite(m.q)) me.ack = m.q;
    if (m.t === 'in') {
      // The fast lane can deliver out of order: ignore anything older than what we already have.
      if (Number.isFinite(m.k)) { if (m.k <= (me.inSeq || 0)) return; me.inSeq = m.k; }
      const i = me.input, c = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
      i.mf = c(m.mf); i.ms = c(m.ms); i.j = m.j ? 1 : 0; i.b = m.b ? 1 : 0; i.s = m.s ? 1 : 0; i.d = m.d;
      if (Number.isFinite(m.yaw)) i.yaw = m.yaw;
      if (Number.isFinite(m.pitch)) i.pitch = Math.max(-1.5, Math.min(1.5, m.pitch));
    } else if ((room.phase === 'countdown' || room.phase === 'spin' || room.phase === 'over') && (m.t === 'hold' || m.t === 'atk' || m.t === 'kick')) {
      // no attacking before the horn
    } else if (m.t === 'hold') startHold(me, m.d);
    else if (m.t === 'release') releaseHold(me);
    else if (m.t === 'kick') kick(me, room);
    else if (m.t === 'feint') feint(me, room);
    else if (m.t === 'rematch') voteRematch(room, me);
    else if (m.t === 'hitch' && !(ws.hitchLogged > Date.now() - 1000)) {
      // A player's browser reporting a freeze: 'frame' is their computer stalling, 'update' their connection.
      ws.hitchLogged = Date.now(); const str = (v) => String(v ?? '').slice(0, 80);
      console.log(`[${room.name}] ${me.name}'s game froze for ${str(m.ms)} ms: ${m.kind === 'frame' ? 'slow frame (their computer)' : 'late update (connection)'}, ${str(m.fps)} fps, quality ${str(m.quality)}, link ${str(m.link)}${m.after ? `, right after: ${str(m.after)}` : ''}`);
    }
    else if (m.t === 'atk') tryAttack(me, m.d);
  };
  const openFastLane = (sdp) => {
    ws.rtc = { channel: null };
    answerOffer(sdp, {
      onOpen: (ch) => { if (!ws.rtc) return; ws.rtc.channel = ch; console.log(`[${room.name}] ${me.name} is on the fast lane (WebRTC)`); },
      onMessage: (raw) => handle(raw, (s) => { try { ws.rtc && ws.rtc.channel && ws.rtc.channel.send(s); } catch {} }),
      onGone: () => { if (ws.rtc && ws.rtc.channel) console.log(`[${room.name}] ${me.name}'s fast lane closed: back to the WebSocket`); if (ws.rtc) ws.rtc.channel = null; },
    }).then((a) => { if (ws.rtc) { ws.rtc.close = a.close; ws.send(JSON.stringify({ t: 'rtc-answer', sdp: a.sdp })); } })
      .catch((e) => { console.log(`[${room.name}] couldn't set up the fast lane for ${me.name}: ${e.message}`); ws.rtc = null; });
  };
  // Send on the fast lane when it's open; returns false if the WebSocket has to carry it.
  ws.fast = (s) => { const ch = ws.rtc && ws.rtc.channel; if (!ch || ch.readyState !== 'open') return false; try { ch.send(s); return true; } catch { return false; } };
  ws.onclose = () => {
    if (ws.rtc && ws.rtc.close) ws.rtc.close(); ws.rtc = null;
    room.clients.delete(ws);
    const k = room.fighters.indexOf(me);
    if (k >= 0) {
      // The next person watching (whoever arrived first) takes the empty spot.
      const next = [...room.clients].find((c) => !room.fighters.includes(c.me));
      room.fighters[k] = next ? next.me : null;
      if (next) { room.phase = 'waiting'; console.log(`[${room.name}] ${next.me.name} steps in to fight`); }
    }
    console.log(`[${room.name}] ${name} left`);
    if (!room.clients.size) rooms.delete(room.name);
  };
});

// Fixed 60 Hz steps tied to the real clock, so the game runs at the same speed even when the
// operating system wakes the timer late (macOS does this to background apps).
let frame = 0, lastWake = Date.now(), hiccup = 0, hiccupAt = 0;
const t0 = process.hrtime.bigint();
setInterval(() => {
  // How late the timer woke us, worst over the last second: shown in players' connection stats (F3).
  const nowMs = Date.now(), gap = nowMs - lastWake; lastWake = nowMs;
  if (gap > hiccup || nowMs - hiccupAt > 1000) { hiccup = gap; hiccupAt = nowMs; }
  if (gap > 150 && rooms.size) console.log(`server stalled for ${gap} ms`);
  const due = Math.floor(Number(process.hrtime.bigint() - t0) / 1e9 / TICK);
  if (due - frame > 30) frame = due - 1; // after a long stall, skip ahead instead of fast-forwarding
  while (frame < due) tick();
}, 4);
function tick() {
  frame++;
  for (const room of rooms.values()) {
    for (const f of room.fighters) if (f && f.bot) botThink(f, room, TICK);
    stepRoom(room, TICK);
    if (frame % SEND_EVERY) continue;
    const snap = {
      t: 's', n: frame, phase: room.phase, msg: room.msg, song: room.song, timer: Math.max(0, Math.round(room.timer * 10) / 10), trap: hazardSnapshot(room),
      players: room.fighters.map((p) => (p ? snapshotPlayer(p) : null)),
      ev: room.events, spectators: room.clients.size - room.fighters.filter(Boolean).length, hz: hiccup,
    };
    const msg = JSON.stringify(snap);
    // On the fast lane an update can be lost, so events (hits, sounds) go separately over the WebSocket.
    const ev = room.events.length ? JSON.stringify({ t: 'e', n: frame, ev: room.events }) : null;
    const fastMsg = JSON.stringify({ ...snap, ev: [] });
    room.events = [];
    for (const c of room.clients) {
      if (c.fast && c.fast(fastMsg)) { if (ev) c.send(ev); } else c.send(msg);
      // Updates piling up unsent means this player's download can't keep up (or has stalled).
      const b = c.backlog ? c.backlog() : 0;
      if (b > 20000 && !(c.slowAt > Date.now() - 2000)) { c.slowAt = Date.now(); console.log(`[${room.name}] updates to ${c.me ? c.me.name : 'a player'} are backing up (${Math.round(b / 1024)} KB unsent; their download is stalling)`); }
    }
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Arena Roulette running on port ${PORT}`);
  console.log(`  This machine:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On your LAN:   http://${a.address}:${PORT}`);
});
