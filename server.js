'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const games = require('./games');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const TICK_MS = Number(process.env.TICK_MS || 1000);
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const PALETTE = ['#f472b6', '#22d3ee', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#34d399', '#f97316', '#818cf8', '#f87171'];
const rooms = new Map();

const rand = (n) => crypto.randomBytes(n).toString('hex');
const makeCode = () => {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
};
const cleanName = (n) => String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 16) || 'Joueur';
const cleanText = (t) => String(t || '').replace(/[-\u001f]/g, ' ').trim().slice(0, 200);

function addPlayer(room, name) {
  const p = {
    id: rand(8),
    token: rand(16),
    name: cleanName(name),
    color: PALETTE[room.players.size % PALETTE.length],
    sse: new Set(),
  };
  room.players.set(p.id, p);
  room.scores[p.id] = room.scores[p.id] || 0;
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function createRoom(name) {
  const code = makeCode();
  const room = {
    code,
    players: new Map(),
    chat: [],
    game: null,
    hostId: null,
    scores: {},
    lastActivity: Date.now(),
  };
  const player = addPlayer(room, name);
  rooms.set(code, room);
  return { room, player };
}

function findPlayer(room, token) {
  if (!room || !token) return null;
  for (const p of room.players.values()) if (p.token === token) return p;
  return null;
}

function serializePlayer(room, p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    score: room.scores[p.id] || 0,
    host: room.hostId === p.id,
    connected: p.sse.size > 0,
  };
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players.values()].map((p) => serializePlayer(room, p)),
    chat: room.chat.slice(-80),
    game: room.game ? games.publicGame(room.game) : null,
  };
}

function send(res, type, data) {
  try { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* client gone */ }
}

function sendTo(room, playerId, type, data) {
  const p = room.players.get(playerId);
  if (p) for (const res of p.sse) send(res, type, data);
}

function broadcast(room, type, data) {
  for (const p of room.players.values()) for (const res of p.sse) send(res, type, data);
}

function broadcastState(room) {
  broadcast(room, 'state', serializeRoom(room));
  const g = room.game;
  if (g && g.type === 'draw' && g.phase === 'drawing') {
    sendTo(room, g.drawerId, 'secret', { word: g.word, round: g.round });
  }
}

function pushChat(room, msg) {
  room.chat.push(msg);
  if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200);
  broadcast(room, 'chat', msg);
}

function sysChat(room, text) {
  pushChat(room, { id: rand(6), kind: 'system', text, ts: Date.now() });
}

function leaveRoom(room, player) {
  room.players.delete(player.id);
  delete room.scores[player.id];
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
  sysChat(room, `${player.name} a quitté le salon 👋`);
  broadcastState(room);
}

function handleStream(req, res, url) {
  const room = rooms.get(String(url.searchParams.get('room') || ''));
  const player = findPlayer(room, String(url.searchParams.get('token') || ''));
  if (!player) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Session invalide' }));
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  player.sse.add(res);
  req.on('close', () => {
    player.sse.delete(res);
    if (room && player.sse.size === 0) broadcastState(room);
  });
  send(res, 'state', serializeRoom(room));
  if (room.game && room.game.type === 'draw' && room.game.drawerId === player.id && room.game.phase === 'drawing') {
    send(res, 'secret', { word: room.game.word, round: room.game.round });
  }
}

function json(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleAction(req, res, body) {
  let data;
  try { data = JSON.parse(body || '{}'); } catch (e) { return json(res, { ok: false, error: 'Requête invalide' }, 400); }

  if (data.action === 'create') {
    const { room, player } = createRoom(data.name);
    sysChat(room, `${player.name} a créé le salon 🎉`);
    return json(res, { ok: true, room: room.code, token: player.token, playerId: player.id });
  }

  if (data.action === 'join') {
    const room = rooms.get(String(data.room || '').trim());
    if (!room) return json(res, { ok: false, error: 'Salon introuvable — vérifie le code à 4 chiffres.' });
    const player = addPlayer(room, data.name);
    room.lastActivity = Date.now();
    sysChat(room, `${player.name} a rejoint le salon 👋`);
    broadcastState(room);
    return json(res, { ok: true, room: room.code, token: player.token, playerId: player.id });
  }

  if (data.action === 'reconnect') {
    const room = rooms.get(String(data.room || '').trim());
    const player = findPlayer(room, String(data.token || ''));
    if (!player) return json(res, { ok: false, error: 'Session expirée' });
    return json(res, { ok: true, room: room.code, playerId: player.id });
  }

  const room = rooms.get(String(data.room || '').trim());
  const player = findPlayer(room, String(data.token || ''));
  if (!room || !player) return json(res, { ok: false, error: 'Session invalide' }, 401);
  room.lastActivity = Date.now();

  switch (data.action) {
    case 'chat': {
      const text = cleanText(data.text);
      if (!text) return json(res, { ok: true });
      pushChat(room, { id: rand(6), kind: 'chat', playerId: player.id, name: player.name, color: player.color, text, ts: Date.now() });
      return json(res, { ok: true });
    }
    case 'startGame': {
      if (player.id !== room.hostId) return json(res, { ok: false, error: 'Seul l’hôte peut lancer une partie.' });
      if (room.game) return json(res, { ok: false, error: 'Une partie est déjà en cours.' });
      const g = games.create(String(data.game || ''), room);
      if (!g) return json(res, { ok: false, error: 'Jeu inconnu ou pas assez de joueurs (2 requis pour Puissance 4).' });
      room.game = g;
      sysChat(room, `🎮 Partie lancée : ${games.label(g.type)}`);
      broadcastState(room);
      if (g.type === 'draw') sendTo(room, g.drawerId, 'secret', { word: g.word, round: g.round });
      return json(res, { ok: true });
    }
    case 'game': {
      const r = games.handle(room, player, data.data || {});
      if (!r) return json(res, { ok: true });
      if (r.error) sendTo(room, player.id, 'toast', { text: r.error });
      for (const ev of r.events || []) broadcast(room, ev.type, ev.data);
      if (r.state) broadcastState(room);
      if (r.secret) sendTo(room, r.secret.to, 'secret', { word: r.secret.word, round: room.game ? room.game.round : 0 });
      return json(res, { ok: true });
    }
    case 'endGame': {
      if (player.id !== room.hostId) return json(res, { ok: false, error: 'Seul l’hôte peut terminer la partie.' });
      room.game = null;
      sysChat(room, '🛑 Partie terminée par l’hôte.');
      broadcastState(room);
      return json(res, { ok: true });
    }
    case 'leave': {
      leaveRoom(room, player);
      return json(res, { ok: true });
    }
    default:
      return json(res, { ok: false, error: 'Action inconnue' }, 400);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/stream') return handleStream(req, res, url);

  if (req.method === 'POST' && url.pathname === '/api/action') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => handleAction(req, res, body));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Introuvable');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  res.writeHead(405);
  res.end();
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.game) {
      const r = games.tick(room);
      if (r) {
        for (const ev of r.events || []) broadcast(room, ev.type, ev.data);
        if (r.light && room.game) {
          broadcast(room, 'tick', { gameId: room.game.id, phase: room.game.phase, timeLeft: room.game.timeLeft });
        } else {
          broadcastState(room);
        }
        if (r.secret && room.game) sendTo(room, r.secret.to, 'secret', { word: r.secret.word, round: room.game.round });
      }
    }
    if (now - room.lastActivity > ROOM_TTL_MS && room.players.size === 0) rooms.delete(room.code);
  }
}, TICK_MS);

setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) for (const res of p.sse) send(res, 'hb', { t: Date.now() });
  }
}, 25000);

server.listen(PORT, HOST, () => {
  console.log(`🕹️  Salon Arcade démarré → http://${HOST}:${PORT}`);
});
