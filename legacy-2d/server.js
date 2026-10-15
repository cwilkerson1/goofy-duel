// Goofy Duel server: serves the browser client and runs the authoritative
// simulation. No npm dependencies; WebSocket handling is built in below.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { newRoom, newPlayer, stepRoom, snapshotPlayer, tryAttack, botName } from './shared/sim.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TICK = 1 / 60, SEND_EVERY = 2; // simulate at 60 Hz, broadcast at 30 Hz

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  const base = url.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
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
const getRoom = (name) => { if (!rooms.has(name)) rooms.set(name, Object.assign(newRoom(name), { clients: new Set() })); return rooms.get(name); };

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  const ws = wsAccept(req, socket);
  if (!ws) return;
  const room = getRoom((url.searchParams.get('room') || 'main').slice(0, 24));
  const name = (url.searchParams.get('name') || 'Anonymous Knight').slice(0, 20);
  const me = newPlayer(nextId++, name);
  room.clients.add(ws);
  const freeSlot = () => room.fighters.findIndex((f) => !f);
  const botSlot = () => room.fighters.findIndex((f) => f && f.isBot);
  // Humans take a free slot, or kick a bot out of one.
  let slot = freeSlot();
  if (slot < 0) slot = botSlot();
  if (slot >= 0) { room.fighters[slot] = me; room.phase = 'waiting'; }
  ws.send(JSON.stringify({ t: 'welcome', id: me.id, room: room.name, fighter: slot >= 0 }));
  console.log(`[${room.name}] ${name} joined as ${slot >= 0 ? 'fighter' : 'spectator'}`);

  ws.onmessage = (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'in') {
      const i = me.input;
      i.l = m.l ? 1 : 0; i.r = m.r ? 1 : 0; i.j = m.j ? 1 : 0; i.b = m.b ? 1 : 0;
      i.face = m.face === -1 ? -1 : 1;
      if (Number.isFinite(m.aim)) me.aim = Math.max(-90, Math.min(90, m.aim));
    } else if (m.t === 'atk') tryAttack(me);
    else if (m.t === 'bot') {
      // Toggle bots: add one to an empty slot, or remove bots if none are free.
      const s = freeSlot();
      if (s >= 0) { const b = newPlayer(nextId++, botName()); b.isBot = true; room.fighters[s] = b; room.phase = 'waiting'; }
      else room.fighters.forEach((f, k) => { if (f && f.isBot) room.fighters[k] = null; });
    }
  };
  ws.onclose = () => {
    room.clients.delete(ws);
    const k = room.fighters.indexOf(me);
    if (k >= 0) room.fighters[k] = null;
    console.log(`[${room.name}] ${name} left`);
    if (!room.clients.size) rooms.delete(room.name);
  };
});

let frame = 0;
setInterval(() => {
  frame++;
  for (const room of rooms.values()) {
    stepRoom(room, TICK);
    if (frame % SEND_EVERY) continue;
    const msg = JSON.stringify({
      t: 's', phase: room.phase, msg: room.msg, timer: Math.max(0, Math.round(room.timer * 10) / 10),
      players: room.fighters.map((p) => (p ? snapshotPlayer(p) : null)),
      ev: room.events, spectators: room.clients.size - room.fighters.filter((p) => p && !p.isBot).length,
    });
    room.events = [];
    for (const c of room.clients) c.send(msg);
  }
}, TICK * 1000);

server.listen(PORT, HOST, () => {
  console.log(`Goofy Duel running on port ${PORT}`);
  console.log(`  This machine:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  On your LAN:   http://${a.address}:${PORT}`);
});
