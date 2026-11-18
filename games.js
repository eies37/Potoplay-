'use strict';

const { QUIZ_CATEGORIES, RIDDLE_PACKS, WORD_PACKS, ALL_QUESTIONS, ALL_RIDDLES } = require('./content');

const QUIZ_SECONDS = Number(process.env.QUIZ_SECONDS || 15);
const REVEAL_MS = Number(process.env.REVEAL_MS || 4000);
const DRAW_SECONDS = Number(process.env.DRAW_SECONDS || 80);
const ROUND_REVEAL_MS = Number(process.env.ROUND_REVEAL_MS || 5000);

const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

let gid = 1;
let mid = 1;
const msgId = () => `m${Date.now().toString(36)}${(mid++).toString(36)}`;

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ')
  .replace(/^(le|la|les|un|une|du|des|de) /, '');

const label = (t) => ({
  quiz: 'Quiz / Devinettes', connect4: 'Puissance 4 🔴', morpion: 'Morpion ⭕',
  draw: 'Dessin & Devinettes 🎨', ultimate: 'Morpion XXL ✕', pendu: 'Pendu 🔤',
  reflex: 'Réflexe : la cible 🎯', number: 'Chaud / Froid 🔢', rps: 'Pierre-Feuille-Ciseaux ✊',
  snake: 'Snake 🐍', whack: 'Tape la taupe 🐹', memory: 'Memory 🃏',
  breakout: 'Casse-briques 🧱', simon: 'Simon 🎨',
  flappy: 'Flappy 🐤', invaders: 'Invaders 👾', duckhunt: 'Duck Hunt 🦆', pong: 'Pong 🏓',
}[t] || t);

/* --------------------------------- CREATE --------------------------------- */

function create(type, room, cfg = {}) {
  const n = room.players.size;
  switch (type) {
    case 'quiz': return n >= 1 ? quizCreate(cfg) : null;
    case 'connect4': return n >= 2 ? boardCreate(room, cfg, true) : null;
    case 'morpion': return n >= 2 ? boardCreate(room, cfg, false) : null;
    case 'draw': return n >= 1 ? drawCreate(room, cfg) : null;
    case 'ultimate': return n >= 2 ? ultCreate(room) : null;
    case 'pendu': return n >= 1 ? penduCreate(cfg) : null;
    case 'reflex': return n >= 1 ? reflexCreate(cfg) : null;
    case 'number': return n >= 1 ? numberCreate(cfg) : null;
    case 'rps': return n >= 2 ? rpsCreate(room, cfg) : null;
    default:
      if (isRetro(type)) return n >= 1 ? retroCreate(type, room, cfg) : null;
      return null;
  }
}

/* ---------------------------------- QUIZ ---------------------------------- */

function quizPool(cfg) {
  if (cfg.mode === 'text') {
    if (cfg.cat && cfg.cat !== 'all') {
      const p = RIDDLE_PACKS.find((x) => x.key === cfg.cat);
      if (p) return p.riddles;
    }
    return ALL_RIDDLES;
  }
  if (cfg.cat && cfg.cat !== 'all') {
    const c = QUIZ_CATEGORIES.find((x) => x.key === cfg.cat);
    if (c) return c.questions;
  }
  return ALL_QUESTIONS;
}

function quizCreate(cfg) {
  const pool = quizPool(cfg);
  const mode = cfg.mode === 'text' ? 'text' : 'mcq';
  const count = clampInt(cfg.count, 1, pool.length, 5);
  const qs = shuffle([...pool]).slice(0, count);
  return {
    id: gid++, type: 'quiz', mode, phase: 'question', qIndex: 0,
    questions: qs.map((q) => (mode === 'text' ? { q: q.q } : { q: q.q, options: q.options })),
    answer: qs.map((q) => q.a),
    answers: {}, timeLeft: QUIZ_SECONDS,
    endsAt: Date.now() + QUIZ_SECONDS * 1000,
  };
}

function quizHandle(room, g, player, data) {
  if (g.phase !== 'question' || data.kind !== 'answer') return null;
  if (g.answers[player.id]) return null;
  let correct = false;
  let index = null;
  if (g.mode === 'text') {
    const text = String(data.text || '').slice(0, 60);
    if (!text.trim()) return null;
    correct = norm(text) === norm(g.answer[g.qIndex]);
  } else {
    index = Number(data.index);
    if (!Number.isInteger(index) || index < 0 || index > 3) return null;
    correct = index === g.answer[g.qIndex];
  }
  const speed = Math.max(0, Math.round((100 * (g.endsAt - Date.now())) / (QUIZ_SECONDS * 1000)));
  const points = correct ? 100 + speed : 0;
  g.answers[player.id] = { index, text: g.mode === 'text' ? String(data.text || '').slice(0, 60) : undefined, correct, points };
  if (correct) room.scores[player.id] = (room.scores[player.id] || 0) + points;
  const all = [...room.players.keys()].every((id) => g.answers[id]);
  if (all) { g.phase = 'reveal'; g.endsAt = Date.now() + REVEAL_MS; }
  return { state: true };
}

/* ------------------------- BOARD (Puissance 4 / Morpion) ------------------- */

function lineWin(b, w, h, row, col, v, win) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const cells = [[row, col]];
    for (const s of [1, -1]) {
      let r = row + dr * s, c = col + dc * s;
      while (r >= 0 && r < h && c >= 0 && c < w && b[r * w + c] === v) {
        cells.push([r, c]);
        r += dr * s; c += dc * s;
      }
    }
    if (cells.length >= win) return cells.map(([r, c]) => r * w + c);
  }
  return null;
}

function boardCreate(room, cfg, gravity) {
  const ps = [...room.players.values()].slice(0, 2).map((p) => p.id);
  let w, h, win;
  if (gravity) {
    w = clampInt(cfg.w, 4, 9, 7);
    h = clampInt(cfg.h, 4, 8, 6);
    win = 4;
  } else {
    const size = clampInt(cfg.size, 3, 6, 3);
    w = h = size;
    win = clampInt(cfg.win, 3, size, size === 3 ? 3 : 4);
  }
  return {
    id: gid++, type: gravity ? 'connect4' : 'morpion', gravity, w, h, win,
    phase: 'play', board: new Array(w * h).fill(0), players: ps, turn: ps[0],
    winner: null, winCells: [], moves: 0,
  };
}

function boardAction(room, g, player, data) {
  if (data.kind === 'rematch') {
    if ((g.phase === 'won' || g.phase === 'draw') && g.players.includes(player.id)) {
      const starter = g.players.find((id) => id !== g.turn) || g.players[0];
      g.board = new Array(g.w * g.h).fill(0);
      g.moves = 0; g.winner = null; g.winCells = [];
      g.turn = starter; g.phase = 'play';
      return { state: true };
    }
    return null;
  }
  if (data.kind !== 'drop' && data.kind !== 'play') return null;
  if (g.phase !== 'play') return { error: 'La partie est terminée.' };
  if (!g.players.includes(player.id)) return { error: 'Vous êtes spectateur de cette partie 👀' };
  if (g.turn !== player.id) return { error: 'Ce n’est pas votre tour !' };

  let row, col, idx;
  if (g.gravity) {
    col = Number(data.col);
    if (!Number.isInteger(col) || col < 0 || col >= g.w) return { error: 'Colonne invalide.' };
    row = -1;
    for (let r = g.h - 1; r >= 0; r--) if (g.board[r * g.w + col] === 0) { row = r; break; }
    if (row < 0) return { error: 'Colonne pleine !' };
    idx = row * g.w + col;
  } else {
    idx = Number(data.cell);
    if (!Number.isInteger(idx) || idx < 0 || idx >= g.w * g.h) return { error: 'Case invalide.' };
    if (g.board[idx] !== 0) return { error: 'Case déjà prise.' };
    row = Math.floor(idx / g.w);
    col = idx % g.w;
  }

  const v = g.players.indexOf(player.id) + 1;
  g.board[idx] = v;
  g.moves++;
  const winCells = lineWin(g.board, g.w, g.h, row, col, v, g.win);
  if (winCells) {
    g.phase = 'won';
    g.winner = player.id;
    g.winCells = winCells;
    room.scores[player.id] = (room.scores[player.id] || 0) + 200;
    return { state: true };
  }
  if (g.moves === g.w * g.h) { g.phase = 'draw'; return { state: true }; }
  g.turn = g.players.find((id) => id !== player.id);
  return { state: true };
}

/* ------------------------------ DESSIN & DEVINE ----------------------------- */

function wordFromPack(packKey) {
  const p = WORD_PACKS.find((x) => x.key === packKey);
  const words = p ? p.words : WORD_PACKS.flatMap((x) => x.words);
  return words[Math.floor(Math.random() * words.length)];
}

function drawCreate(room, cfg = {}) {
  const order = shuffle([...room.players.keys()]);
  return {
    id: gid++, type: 'draw', phase: 'drawing',
    order, round: 0, drawerId: order[0], packKey: cfg.pack,
    word: norm(wordFromPack(cfg.pack)),
    strokes: [], timeLeft: DRAW_SECONDS,
    endsAt: Date.now() + DRAW_SECONDS * 1000,
    correct: [],
  };
}

function drawHandle(room, g, player, data) {
  if (data.kind === 'stroke') {
    if (g.phase !== 'drawing' || player.id !== g.drawerId) return null;
    const s = {
      x1: +data.x1, y1: +data.y1, x2: +data.x2, y2: +data.y2,
      c: String(data.c || '#111827').slice(0, 9),
      w: Math.min(30, Math.max(1, +data.w || 4)),
    };
    if ([s.x1, s.y1, s.x2, s.y2].some((n) => !isFinite(n) || n < -0.1 || n > 1.1)) return null;
    g.strokes.push(s);
    if (g.strokes.length > 3000) g.strokes.splice(0, g.strokes.length - 3000);
    return { events: [{ type: 'stroke', data: { ...s, by: player.id } }] };
  }
  if (data.kind === 'clear') {
    if (player.id !== g.drawerId || g.phase !== 'drawing') return null;
    g.strokes = [];
    return { events: [{ type: 'stroke', data: { clear: true } }], state: true };
  }
  if (data.kind === 'guess') {
    const text = String(data.text || '').slice(0, 60);
    if (!text || g.phase !== 'drawing') return null;
    if (norm(text) === g.word) {
      if (g.correct.includes(player.id)) return null;
      g.correct.push(player.id);
      const pts = 50 + g.timeLeft;
      room.scores[player.id] = (room.scores[player.id] || 0) + pts;
      room.scores[g.drawerId] = (room.scores[g.drawerId] || 0) + 25;
      const m = { id: msgId(), kind: 'system', text: `🎉 ${player.name} a trouvé le mot ! (+${pts} pts)`, ts: Date.now() };
      room.chat.push(m);
      const events = [
        { type: 'chat', data: m },
        { type: 'toast', data: { text: `🎉 ${player.name} a trouvé !` } },
      ];
      const others = g.order.filter((id) => id !== g.drawerId);
      const all = others.length > 0 && others.every((id) => g.correct.includes(id));
      if (all) {
        g.phase = 'reveal';
        g.endsAt = Date.now() + ROUND_REVEAL_MS;
      }
      return { events, state: true };
    }
    const m = { id: msgId(), kind: 'guess', playerId: player.id, name: player.name, color: player.color, text, ts: Date.now() };
    room.chat.push(m);
    if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200);
    return { events: [{ type: 'chat', data: m }] };
  }
  return null;
}

/* --------------------------- MORPION XXL (ULTIMATE) ------------------------- */

function lineWin9(a, v) {
  const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const l of L) if (l.every((i) => a[i] === v)) return l;
  return null;
}

function ultCreate(room) {
  const ps = [...room.players.values()].slice(0, 2).map((p) => p.id);
  return {
    id: gid++, type: 'ultimate', phase: 'play',
    board: new Array(81).fill(0), miniWon: new Array(9).fill(0),
    players: ps, turn: ps[0], activeMini: null, winner: null, winMinis: [], moves: 0,
  };
}

function ultMove(room, g, player, data) {
  if (g.phase !== 'play') return { error: 'La partie est terminée.' };
  if (!g.players.includes(player.id)) return { error: 'Spectateur 👀' };
  if (g.turn !== player.id) return { error: 'Pas ton tour !' };
  const mini = Number(data.mini), cell = Number(data.cell);
  if (!Number.isInteger(mini) || !Number.isInteger(cell) || mini < 0 || mini > 8 || cell < 0 || cell > 8) return { error: 'Case invalide.' };
  if (g.activeMini !== null && g.activeMini !== mini) return { error: 'Tu dois jouer dans la grille surlignée !' };
  const idx = mini * 9 + cell;
  if (g.board[idx] !== 0) return { error: 'Case déjà prise.' };
  const v = g.players.indexOf(player.id) + 1;
  g.board[idx] = v;
  g.moves++;
  const miniCells = lineWin9(g.board.slice(mini * 9, mini * 9 + 9), v);
  if (miniCells) g.miniWon[mini] = v;
  else if (g.board.slice(mini * 9, mini * 9 + 9).every((c) => c !== 0)) g.miniWon[mini] = 3;
  const globalWin = lineWin9(g.miniWon, v);
  if (globalWin) {
    g.phase = 'won';
    g.winner = player.id;
    g.winMinis = globalWin;
    room.scores[player.id] = (room.scores[player.id] || 0) + 250;
    return { state: true };
  }
  if (g.moves === 81) { g.phase = 'draw'; return { state: true }; }
  g.activeMini = g.miniWon[cell] !== 0 ? null : cell;
  g.turn = g.players.find((id) => id !== player.id);
  return { state: true };
}

function ultRematch(room, g, player) {
  if ((g.phase === 'won' || g.phase === 'draw') && g.players.includes(player.id)) {
    const starter = g.players.find((id) => id !== g.turn) || g.players[0];
    g.board = new Array(81).fill(0);
    g.miniWon = new Array(9).fill(0);
    g.moves = 0; g.winner = null; g.winMinis = [];
    g.turn = starter; g.activeMini = null; g.phase = 'play';
    return { state: true };
  }
  return null;
}

/* ---------------------------------- PENDU ----------------------------------- */

function penduCreate(cfg = {}) {
  const word = norm(wordFromPack(cfg.pack));
  return {
    id: gid++, type: 'pendu', phase: 'playing', word,
    revealed: word.split('').map(() => null),
    guessed: [], lives: clampInt(cfg.lives, 3, 26, 6),
    timeLeft: clampInt(cfg.seconds, 30, 300, 120),
    endsAt: Date.now() + clampInt(cfg.seconds, 30, 300, 120) * 1000,
    winner: null,
  };
}

function penduHandle(room, g, player, data) {
  if (g.phase !== 'playing' || data.kind !== 'letter') return null;
  const ch = norm(String(data.ch || '')).replace(/[^a-z]/g, '').slice(0, 1);
  if (!ch) return { error: 'Entre une lettre (a-z).' };
  if (g.guessed.includes(ch)) return { error: `La lettre « ${ch} » a déjà été proposée.` };
  g.guessed.push(ch);
  if (g.word.includes(ch)) {
    g.word.split('').forEach((w, i) => { if (w === ch) g.revealed[i] = ch; });
    room.scores[player.id] = (room.scores[player.id] || 0) + 25;
    if (g.revealed.every(Boolean)) {
      g.phase = 'won';
      g.winner = player.id;
      room.scores[player.id] = (room.scores[player.id] || 0) + 100;
    }
    return { state: true };
  }
  g.lives--;
  if (g.lives <= 0) g.phase = 'lost';
  return { state: true };
}

/* ------------------------------ RÉFLEXE (CIBLE) ----------------------------- */

function reflexCreate(cfg = {}) {
  return {
    id: gid++, type: 'reflex', phase: 'waiting',
    round: 0, total: clampInt(cfg.rounds, 1, 20, 5),
    targetMs: clampInt(cfg.targetMs, 1500, 8000, 4000),
    target: null, startedAt: 0, results: [], timeLeft: 0,
    endsAt: Date.now() + 800 + Math.random() * 1800,
  };
}

function tickReflex(g, now) {
  if (g.phase === 'waiting') {
    if (now >= g.endsAt) {
      g.phase = 'target';
      g.target = { x: 5 + Math.random() * 90, y: 5 + Math.random() * 85 };
      g.startedAt = now;
      g.endsAt = now + g.targetMs;
      return { state: true };
    }
    return { light: true };
  }
  if (g.phase === 'target') {
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (now >= g.endsAt) {
      g.results.push({ round: g.round, winner: null, ms: null, pts: 0 });
      g.phase = 'result';
      g.endsAt = now + 1500;
      return { state: true };
    }
    return { light: true };
  }
  if (g.phase === 'result') {
    if (now >= g.endsAt) {
      g.round++;
      if (g.round >= g.total) { g.phase = 'end'; return { state: true }; }
      g.phase = 'waiting';
      g.target = null;
      g.endsAt = now + 800 + Math.random() * 1800;
      return { state: true };
    }
    return { light: true };
  }
  return null;
}

function reflexHandle(room, g, player, data) {
  if (data.kind !== 'hit' || g.phase !== 'target') return null;
  if (g.results.some((r) => r.round === g.round)) return null;
  const ms = Date.now() - g.startedAt;
  const pts = Math.max(50, Math.round(400 - ms / 5));
  room.scores[player.id] = (room.scores[player.id] || 0) + pts;
  g.results.push({ round: g.round, winner: player.id, ms, pts });
  g.phase = 'result';
  g.endsAt = Date.now() + 1500;
  return { state: true, events: [{ type: 'toast', data: { text: `⚡ ${player.name} : ${ms} ms (+${pts} pts)` } }] };
}

/* ---------------------------- CHAUD / FROID (NOMBRE) ------------------------ */

function numberCreate(cfg = {}) {
  const range = clampInt(cfg.range, 10, 1000000, 100);
  return {
    id: gid++, type: 'number', phase: 'playing',
    secret: 1 + Math.floor(Math.random() * range),
    range,
    hints: [],
    guessesLeft: Math.min(200, Math.max(20, Math.floor(range * 0.6))),
    winner: null,
  };
}

const hintFor = (d) => (d < 5 ? '🔥 brûlant' : d < 15 ? '🌡️ tiède' : d < 30 ? '🧊 frais' : '❄️ glacé');

function numberHandle(room, g, player, data) {
  if (g.phase !== 'playing' || data.kind !== 'num') return null;
  const n = Number(data.n);
  if (!Number.isInteger(n) || n < 1 || n > g.range) return { error: `Entre un nombre entier entre 1 et ${g.range}.` };
  g.guessesLeft--;
  if (n === g.secret) {
    g.phase = 'won';
    g.winner = player.id;
    room.scores[player.id] = (room.scores[player.id] || 0) + 150;
    return { state: true, events: [{ type: 'toast', data: { text: `🎯 ${player.name} a trouvé ${g.secret} !` } }] };
  }
  g.hints.push({ playerId: player.id, name: player.name, color: player.color, n, hint: hintFor(Math.abs(n - g.secret)) });
  if (g.hints.length > 30) g.hints.shift();
  if (g.guessesLeft <= 0) g.phase = 'lost';
  return { state: true };
}

/* ------------------------- PIERRE-FEUILLE-CISEAUX --------------------------- */

function rpsCreate(room, cfg = {}) {
  return {
    id: gid++, type: 'rps', phase: 'choosing',
    round: 0, total: clampInt(cfg.rounds, 1, 21, 5),
    players: [...room.players.keys()],
    choices: {}, lastResult: null,
    timeLeft: RPS_CHOOSE_MS / 1000, endsAt: Date.now() + RPS_CHOOSE_MS,
  };
}

const RPS_CHOOSE_MS = Number(process.env.RPS_CHOOSE_MS || 10000);

function rpsReveal(room, g) {
  const entries = Object.entries(g.choices);
  const beats = (a, b) => ((a - b + 3) % 3) === 1;
  let winners = [];
  if (entries.length >= 2 && !entries.every(([, c]) => c === entries[0][1])) {
    winners = entries.filter(([id, c]) => entries.every(([id2, c2]) => id2 === id || beats(c, c2))).map(([id]) => id);
    if (winners.length === entries.length) winners = [];
  }
  for (const w of winners) room.scores[w] = (room.scores[w] || 0) + 100;
  g.lastResult = { choices: { ...g.choices }, winners };
  g.phase = 'reveal';
  g.endsAt = Date.now() + 2500;
}

function rpsHandle(room, g, player, data) {
  if (g.phase !== 'choosing' || data.kind !== 'choice') return null;
  const c = Number(data.c);
  if (![0, 1, 2].includes(c)) return { error: 'Choix invalide.' };
  if (g.choices[player.id] !== undefined) return { error: 'Choix déjà enregistré !' };
  g.choices[player.id] = c;
  const all = g.players.every((id) => g.choices[id] !== undefined);
  if (all) rpsReveal(room, g);
  return { state: true };
}

function tickRps(room, g, now) {
  if (g.phase === 'choosing') {
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    const all = g.players.every((id) => g.choices[id] !== undefined);
    if (now >= g.endsAt || all) { rpsReveal(room, g); return { state: true }; }
    return { light: true };
  }
  if (g.phase === 'reveal') {
    if (now >= g.endsAt) {
      g.round++;
      if (g.round >= g.total) { g.phase = 'end'; return { state: true }; }
      g.phase = 'choosing';
      g.choices = {};
      g.timeLeft = RPS_CHOOSE_MS / 1000;
      g.endsAt = now + RPS_CHOOSE_MS;
      return { state: true };
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    return { light: true };
  }
  return null;
}

/* ---------------------------------- TICK ----------------------------------- */

function tick(room) {
  const g = room.game;
  if (!g) return null;
  const now = Date.now();
  if (isRetro(g.type)) return null;

  if (g.type === 'quiz') {
    if (g.phase === 'question') {
      g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      const all = [...room.players.keys()].every((id) => g.answers[id]);
      if (now >= g.endsAt || all) { g.phase = 'reveal'; g.endsAt = now + REVEAL_MS; return { state: true }; }
      return { light: true };
    }
    if (g.phase === 'reveal') {
      if (now >= g.endsAt) {
        g.qIndex++;
        if (g.qIndex >= g.questions.length) { g.phase = 'end'; g.timeLeft = 0; return { state: true }; }
        g.phase = 'question'; g.answers = {}; g.timeLeft = QUIZ_SECONDS;
        g.endsAt = now + QUIZ_SECONDS * 1000;
        return { state: true };
      }
      g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      return { light: true };
    }
    return null;
  }

  if (g.type === 'draw') {
    if (g.phase === 'drawing') {
      g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      if (now >= g.endsAt) { g.phase = 'reveal'; g.endsAt = now + ROUND_REVEAL_MS; return { state: true }; }
      return { light: true };
    }
    if (g.phase === 'reveal') {
      if (now >= g.endsAt) {
        g.round++;
        if (g.round >= g.order.length) { g.phase = 'end'; g.timeLeft = 0; return { state: true }; }
        g.drawerId = g.order[g.round];
        g.word = norm(wordFromPack(g.packKey));
        g.strokes = []; g.correct = [];
        g.phase = 'drawing'; g.timeLeft = DRAW_SECONDS;
        g.endsAt = now + DRAW_SECONDS * 1000;
        return { state: true, secret: { to: g.drawerId, word: g.word } };
      }
      g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      return { light: true };
    }
    return null;
  }

  if (g.type === 'pendu') {
    if (g.phase !== 'playing') return null;
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (now >= g.endsAt) { g.phase = 'lost'; g.timeLeft = 0; return { state: true }; }
    return { light: true };
  }

  if (g.type === 'reflex') return tickReflex(g, now);
  if (g.type === 'rps') return tickRps(room, g, now);
  return null;
}

/* --------------------------------- HANDLE ---------------------------------- */

function handle(room, player, data) {
  const g = room.game;
  if (!g || !data || typeof data !== 'object') return null;
  if (data.game && data.game !== g.type) return null;
  if (g.type === 'quiz') return quizHandle(room, g, player, data);
  if (g.type === 'connect4' || g.type === 'morpion') return boardAction(room, g, player, data);
  if (g.type === 'draw') return drawHandle(room, g, player, data);
  if (g.type === 'ultimate') {
    if (data.kind === 'move') return ultMove(room, g, player, data);
    if (data.kind === 'rematch') return ultRematch(room, g, player);
    return null;
  }
  if (g.type === 'pendu') return penduHandle(room, g, player, data);
  if (g.type === 'reflex') return reflexHandle(room, g, player, data);
  if (g.type === 'number') return numberHandle(room, g, player, data);
  if (g.type === 'rps') return rpsHandle(room, g, player, data);
  if (isRetro(g.type)) return retroHandle(room, g, player, data);
  return null;
}

/* ------------------------------- PUBLIC VIEW -------------------------------- */

function publicGame(g, pid) {
  if (g.type === 'quiz') {
    const answers = {};
    for (const [id, a] of Object.entries(g.answers)) {
      answers[id] = g.phase === 'question' ? (a.index !== null && a.index !== undefined ? { index: a.index } : { answered: true }) : a;
    }
    return {
      id: g.id, type: 'quiz', mode: g.mode, phase: g.phase, qIndex: g.qIndex,
      total: g.questions.length, question: g.questions[g.qIndex] || null,
      answers, timeLeft: g.timeLeft, totalTime: QUIZ_SECONDS,
      answerIndex: g.phase !== 'question' && g.mode === 'mcq' ? g.answer[g.qIndex] : undefined,
      answerText: g.phase !== 'question' && g.mode === 'text' ? g.answer[g.qIndex] : undefined,
    };
  }
  if (g.type === 'connect4' || g.type === 'morpion') {
    return {
      id: g.id, type: g.type, gravity: g.gravity, w: g.w, h: g.h, win: g.win,
      phase: g.phase, board: g.board, players: g.players, turn: g.turn,
      winner: g.winner, winCells: g.winCells, moves: g.moves,
    };
  }
  if (g.type === 'draw') {
    return {
      id: g.id, type: 'draw', phase: g.phase, order: g.order, round: g.round,
      drawerId: g.drawerId, strokes: g.strokes, timeLeft: g.timeLeft,
      totalTime: DRAW_SECONDS, correctCount: g.correct.length,
      revealWord: g.phase === 'drawing' ? undefined : g.word,
      wordLength: g.word.length,
    };
  }
  if (g.type === 'ultimate') {
    return {
      id: g.id, type: 'ultimate', phase: g.phase, board: g.board, miniWon: g.miniWon,
      players: g.players, turn: g.turn, activeMini: g.activeMini,
      winner: g.winner, winMinis: g.winMinis, moves: g.moves,
    };
  }
  if (g.type === 'pendu') {
    return {
      id: g.id, type: 'pendu', phase: g.phase, wordLength: g.word.length,
      revealed: g.revealed, guessed: g.guessed, lives: g.lives, totalLives: g.revealed ? g.revealed.length && (g.totalLives || 6) : 6,
      timeLeft: g.timeLeft, totalTime: Math.round((g.endsAt - (g.endsAt - g.timeLeft * 1000)) / 1000) || 120,
      winner: g.winner || null, revealWord: g.phase === 'playing' ? undefined : g.word,
    };
  }
  if (g.type === 'reflex') {
    return {
      id: g.id, type: 'reflex', phase: g.phase, round: g.round, total: g.total,
      target: g.phase === 'target' ? g.target : null, results: g.results,
      timeLeft: g.timeLeft, totalTime: g.targetMs / 1000,
    };
  }
  if (g.type === 'number') {
    return {
      id: g.id, type: 'number', phase: g.phase, range: g.range,
      hints: g.hints, guessesLeft: g.guessesLeft,
      winner: g.winner || null, revealNumber: g.phase === 'playing' ? undefined : g.secret,
    };
  }
  if (g.type === 'rps') {
    const masked = g.phase === 'choosing';
    return {
      id: g.id, type: 'rps', phase: g.phase, round: g.round, total: g.total,
      players: g.players, choiceCount: Object.keys(g.choices).length,
      choices: masked ? Object.fromEntries(Object.keys(g.choices).map((id) => [id, true])) : g.choices,
      lastResult: g.phase === 'choosing' ? null : g.lastResult,
      timeLeft: g.timeLeft, totalTime: RPS_CHOOSE_MS / 1000,
    };
  }
  if (isRetro(g.type)) {
    const inst = {};
    for (const [id, s] of Object.entries(g.instances)) {
      if (g.type === 'memory') inst[id] = { open: s.open, matched: s.matched, moves: s.moves, done: s.done, ...(id === pid ? { deck: s.deck } : {}) };
      else if (g.type === 'simon') inst[id] = { level: s.level, alive: s.alive, accepting: s.accepting && Date.now() >= s.acceptAt };
      else inst[id] = s;
    }
    return {
      id: g.id, type: g.type, phase: g.phase, timeLeft: g.timeLeft, totalTime: g.totalTime,
      instances: inst, cols: g.cols, rows: g.rows, stepMs: g.stepMs,
    };
  }
  return null;
}

/* --------------------------- JEUX RÉTRO (solo + classement) ----------------- */

const RETRO_TYPES = ['snake', 'whack', 'memory', 'breakout', 'simon', 'flappy', 'invaders', 'duckhunt', 'pong'];
const isRetro = (t) => RETRO_TYPES.includes(t);
const MEMORY_POOL = ['🍎', '🚀', '🐱', '🎮', '🌵', '🍕', '👾', '🎸', '🦊', '🍩', '⚡', '🌙', '🐸', '🍔', '🎩', '🐙'];

const outbox = [];
function drainEvents() { const e = outbox.slice(); outbox.length = 0; return e; }

function randCell(size, avoid) {
  let x = 0, y = 0, tries = 0;
  do {
    x = Math.floor(Math.random() * size);
    y = Math.floor(Math.random() * size);
    tries++;
  } while (avoid.some((s) => s.x === x && s.y === y) && tries < 60);
  return { x, y };
}

function retroCreate(type, room, cfg = {}) {
  const g = { id: gid++, type, phase: 'play', startedAt: Date.now(), instances: {}, timeLeft: 0, totalTime: 0 };
  const players = [...room.players.keys()];
  if (type === 'snake') {
    g.stepMs = clampInt(cfg.speed, 60, 300, 140);
    g.totalTime = clampInt(cfg.duration, 20, 180, 75);
    g.endsAt = Date.now() + g.totalTime * 1000;
    for (const id of players) {
      g.instances[id] = {
        snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
        dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
        food: randCell(20, []), score: 0, alive: true, acc: 0,
      };
    }
  } else if (type === 'whack') {
    g.totalTime = clampInt(cfg.duration, 10, 120, 30);
    g.endsAt = Date.now() + g.totalTime * 1000;
    for (const id of players) g.instances[id] = { score: 0, mole: null, nextSpawn: Date.now() + 400, alive: true };
  } else if (type === 'memory') {
    const cols = clampInt(cfg.cols, 3, 6, 4), rows = clampInt(cfg.rows, 3, 5, 4);
    const pairs = (cols * rows) / 2;
    const base = shuffle([...MEMORY_POOL]).slice(0, pairs);
    g.cols = cols; g.rows = rows;
    g.totalTime = 90; g.endsAt = Date.now() + 90000;
    for (const id of players) {
      g.instances[id] = { deck: shuffle([...base, ...base]), open: [], matched: [], moves: 0, done: false };
    }
  } else if (type === 'breakout') {
    g.lives = clampInt(cfg.lives, 1, 5, 3);
    g.speedMul = clampInt(Math.round((+cfg.speed || 1) * 10), 5, 30, 10) / 10;
    g.totalTime = 120; g.endsAt = Date.now() + 120000;
    for (const id of players) g.instances[id] = breakoutNew(g);
  } else if (type === 'simon') {
    g.totalTime = 0; g.endsAt = 0;
    for (const id of players) g.instances[id] = { seq: [], pos: 0, alive: true, level: 0, accepting: false, acceptAt: 0 };
    for (const id of players) simonNextRound(room, g, id);
  } else if (type === 'flappy') {
    g.totalTime = clampInt(cfg.duration, 20, 180, 60);
    g.endsAt = Date.now() + g.totalTime * 1000;
    for (const id of players) g.instances[id] = flappyNew(cfg);
  } else if (type === 'invaders') {
    g.totalTime = 120; g.endsAt = Date.now() + 120000;
    for (const id of players) g.instances[id] = invadersNew(cfg);
  } else if (type === 'duckhunt') {
    g.totalTime = clampInt(cfg.duration, 10, 120, 30);
    g.endsAt = Date.now() + g.totalTime * 1000;
    for (const id of players) g.instances[id] = { ducks: [], shots: [], score: 0, alive: true, nextDuck: Date.now() + 500, acc: 0 };
  } else if (type === 'pong') {
    g.totalTime = 180; g.endsAt = Date.now() + 180000;
    for (const id of players) g.instances[id] = pongNew(cfg);
  }
  return g;
}

function flappyNew(cfg) {
  const gapH = clampInt(cfg.gap, 100, 260, 150) / 460;
  const speedMul = clampInt(Math.round((+cfg.speedMul || 1) * 10), 8, 25, 10) / 10;
  return {
    bird: { x: 0.18, y: 0.5, vy: 0 },
    pipes: [{ x: 1.05, gapY: 0.25 + Math.random() * 0.5, gapH, passed: false }],
    score: 0, alive: true, acc: 0, speedMul,
  };
}

function flappyStep(inst) {
  const b = inst.bird;
  b.vy += 0.0011;
  b.y += b.vy;
  for (const p of inst.pipes) p.x -= 0.0075 * inst.speedMul;
  const last = inst.pipes[inst.pipes.length - 1];
  if (last.x < 0.62) inst.pipes.push({ x: 1.08, gapY: 0.18 + Math.random() * 0.55, gapH: last.gapH, passed: false });
  if (inst.pipes[0].x < -0.1) inst.pipes.shift();
  for (const p of inst.pipes) {
    if (!p.passed && p.x + 0.05 < b.x) { p.passed = true; inst.score++; }
    if (b.x + 0.026 > p.x && b.x - 0.026 < p.x + 0.05) {
      if (b.y - 0.028 < p.gapY - p.gapH / 2 || b.y + 0.028 > p.gapY + p.gapH / 2) { inst.alive = false; return; }
    }
  }
  if (b.y < 0.02 || b.y > 0.98) inst.alive = false;
}

function invadersNew(cfg) {
  const aliens = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) aliens.push({ bx: 0.06 + c * 0.11, by: 0.06 + r * 0.075, alive: true });
  const speedMul = clampInt(Math.round((+cfg.speedMul || 1) * 10), 8, 25, 10) / 10;
  return {
    cannon: 0.5, bullets: [], aliens, ox: 0, oy: 0, dir: 1,
    stepMs: Math.max(120, 430 / speedMul), score: 0, alive: true, cd: 0, acc: 0, alienAcc: 0,
  };
}

function invadersStep(inst, now) {
  if (inst.cd > 0) inst.cd -= 16.7;
  for (const b of inst.bullets) b.y -= 0.013;
  inst.bullets = inst.bullets.filter((b) => b.y > 0.02);
  for (const b of inst.bullets) {
    for (const a of inst.aliens) {
      if (a.alive && Math.abs(b.x - (a.bx + inst.ox)) < 0.035 && Math.abs(b.y - (a.by + inst.oy)) < 0.04) {
        a.alive = false;
        b.y = -1;
        inst.score += 10;
      }
    }
  }
  inst.bullets = inst.bullets.filter((b) => b.y > 0.02);
  inst.alienAcc += 16.7;
  while (inst.alienAcc >= inst.stepMs) {
    inst.alienAcc -= inst.stepMs;
    const maxBx = Math.max(...inst.aliens.filter((a) => a.alive).map((a) => a.bx), 0);
    if (inst.ox + maxBx > 0.92 || inst.ox < 0) { inst.dir *= -1; inst.oy += 0.035; }
    else inst.ox += 0.02 * inst.dir;
  }
  const maxBy = Math.max(...inst.aliens.filter((a) => a.alive).map((a) => a.by), 0) + inst.oy;
  if (maxBy > 0.78) inst.alive = false;
  if (!inst.aliens.some((a) => a.alive)) {
    inst.score += 100;
    inst.oy = 0; inst.ox = 0; inst.dir = 1;
    inst.stepMs = Math.max(120, inst.stepMs * 0.85);
    for (const a of inst.aliens) a.alive = true;
  }
}

function pongNew(cfg) {
  return {
    paddle: 0.5, ai: 0.5,
    ball: { x: 0.5, y: 0.5, vx: 0.008, vy: 0.005 },
    my: 0, aiScore: 0, target: clampInt(cfg.target, 3, 21, 7),
    alive: true, won: false, acc: 0,
  };
}

function pongStep(inst) {
  const b = inst.ball;
  b.x += b.vx;
  b.y += b.vy;
  if (b.y < 0.02) { b.y = 0.02; b.vy = Math.abs(b.vy); }
  if (b.y > 0.98) { b.y = 0.98; b.vy = -Math.abs(b.vy); }
  if (b.x < 0.05 && b.vx < 0) {
    if (Math.abs(b.y - inst.paddle) < 0.1) {
      b.vx = Math.abs(b.vx) * 1.04;
      b.vy += (b.y - inst.paddle) * 0.02;
    } else if (b.x < 0) {
      inst.aiScore++;
      b.x = 0.5; b.y = 0.5; b.vx = -0.008; b.vy = (Math.random() - 0.5) * 0.01;
    }
  }
  if (b.x > 0.95 && b.vx > 0) {
    if (Math.abs(b.y - inst.ai) < 0.1) {
      b.vx = -Math.abs(b.vx) * 1.04;
      b.vy += (b.y - inst.ai) * 0.02;
    } else if (b.x > 1) {
      inst.my++;
      b.x = 0.5; b.y = 0.5; b.vx = 0.008; b.vy = (Math.random() - 0.5) * 0.01;
      if (inst.my >= inst.target) { inst.alive = false; inst.won = true; }
    }
  }
  if (b.vx > 0) inst.ai += Math.max(-0.0052, Math.min(0.0052, b.y - inst.ai));
  else inst.ai += Math.max(-0.002, Math.min(0.002, 0.5 - inst.ai));
  inst.ai = Math.max(0.1, Math.min(0.9, inst.ai));
  inst.paddle = Math.max(0.1, Math.min(0.9, inst.paddle));
}

function retroPts(type, inst) {
  if (type === 'snake') return inst.score * 10;
  if (type === 'whack') return inst.score * 20;
  if (type === 'memory') return Math.max(0, inst.matched.length * 50 - inst.moves * 2);
  if (type === 'breakout') return inst.score;
  if (type === 'simon') return inst.level * 50;
  if (type === 'flappy') return inst.score * 10;
  if (type === 'invaders') return inst.score;
  if (type === 'duckhunt') return inst.score * 20;
  if (type === 'pong') return inst.my * 50 + (inst.won ? 200 : 0);
  return 0;
}

function retroFinish(room, g) {
  if (g.phase === 'end') return;
  g.phase = 'end';
  room.records = room.records || {};
  for (const [pid, inst] of Object.entries(g.instances)) {
    const pts = retroPts(g.type, inst);
    room.scores[pid] = (room.scores[pid] || 0) + pts;
    const rec = room.records[g.type];
    if (!rec || pts > rec.score) {
      room.records[g.type] = { playerId: pid, name: (room.players.get(pid) || {}).name || '?', score: pts };
    }
  }
}

function snakeStep(inst, size = 20) {
  inst.dir = inst.nextDir;
  const head = { x: inst.snake[0].x + inst.dir.x, y: inst.snake[0].y + inst.dir.y };
  if (head.x < 0 || head.y < 0 || head.x >= size || head.y >= size || inst.snake.some((s) => s.x === head.x && s.y === head.y)) {
    inst.alive = false;
    return;
  }
  inst.snake.unshift(head);
  if (head.x === inst.food.x && head.y === inst.food.y) {
    inst.score++;
    inst.food = randCell(size, inst.snake);
  } else inst.snake.pop();
}

function breakoutNew(g) {
  const cols = 8, rows = 4;
  const bricks = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ alive: true });
  return {
    paddle: 0.5, ball: { x: 0.5, y: 0.8, vx: 0.12, vy: -0.2 },
    bricks, cols, rows, score: 0, lives: g.lives, alive: true, level: 1, acc: 0,
  };
}

function breakoutStep(g, inst) {
  const b = inst.ball, m = g.speedMul;
  b.x += b.vx * m;
  b.y += b.vy * m;
  if (b.x < 0.02) { b.x = 0.02; b.vx = Math.abs(b.vx); }
  if (b.x > 0.98) { b.x = 0.98; b.vx = -Math.abs(b.vx); }
  if (b.y < 0.02) { b.y = 0.02; b.vy = Math.abs(b.vy); }
  if (b.vy > 0 && b.y > 0.9 && b.y < 0.98 && Math.abs(b.x - inst.paddle) < 0.09) {
    b.vy = -Math.abs(b.vy);
    b.vx = (b.x - inst.paddle) * 2.2;
  }
  const cw = 1 / inst.cols, bh = 0.05, y0 = 0.06;
  if (b.vy < 0) {
    const c = Math.floor(b.x / cw), r = Math.floor((b.y - y0) / bh);
    if (r >= 0 && r < inst.rows && c >= 0 && c < inst.cols) {
      const br = inst.bricks[r * inst.cols + c];
      if (br && br.alive) { br.alive = false; b.vy = Math.abs(b.vy); inst.score += 10; }
    }
  }
  if (b.y > 1.02) {
    inst.lives--;
    if (inst.lives <= 0) inst.alive = false;
    else { b.x = inst.paddle; b.y = 0.85; b.vx = 0.12 - Math.random() * 0.24; b.vy = -0.2; }
  }
  if (inst.bricks.every((br) => !br.alive)) {
    inst.level++;
    inst.score += 100;
    inst.bricks = inst.bricks.map(() => ({ alive: true }));
    b.vy = -Math.abs(b.vy) * 1.05;
    b.vx = 0.12 - Math.random() * 0.24;
  }
}

function simonNextRound(room, g, playerId) {
  const inst = g.instances[playerId];
  if (!inst || !inst.alive) return;
  inst.seq.push(Math.floor(Math.random() * 4));
  inst.pos = 0;
  inst.accepting = false;
  inst.seq.forEach((c, i) => {
    setTimeout(() => {
      if (room.game === g && g.phase === 'play' && inst.alive) {
        outbox.push({ room, type: 'flash', to: playerId, data: { c, i, n: inst.seq.length } });
      }
    }, 500 + i * 600);
  });
  inst.acceptAt = Date.now() + 500 + inst.seq.length * 600;
  setTimeout(() => {
    if (room.game === g && g.phase === 'play' && inst.alive) {
      inst.accepting = true;
      outbox.push({ room, type: '__state__', to: playerId });
    }
  }, 500 + inst.seq.length * 600);
}

function retroHandle(room, g, player, data) {
  const inst = g.instances[player.id];
  if (!inst || g.phase !== 'play') return null;

  if (g.type === 'snake' && data.kind === 'dir') {
    const d = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[data.d];
    if (!d) return null;
    if (d.x !== -inst.dir.x || d.y !== -inst.dir.y) inst.nextDir = d;
    return { state: true };
  }
  if (g.type === 'whack' && data.kind === 'hit') {
    const idx = Number(data.idx);
    if (inst.mole && inst.mole.idx === idx) {
      inst.score++;
      inst.mole = null;
      inst.nextSpawn = Date.now() + 300;
      return { state: true };
    }
    return null;
  }
  if (g.type === 'memory' && data.kind === 'flip') {
    if (inst.done) return null;
    const idx = Number(data.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= inst.deck.length || inst.matched.includes(idx) || inst.open.includes(idx)) return null;
    if (inst.open.length === 2) inst.open = [];
    inst.open.push(idx);
    if (inst.open.length === 2) {
      inst.moves++;
      const [a, b] = inst.open;
      if (inst.deck[a] === inst.deck[b]) {
        inst.matched.push(a, b);
        inst.open = [];
        if (inst.matched.length === inst.deck.length) inst.done = true;
      }
    }
    return { state: true };
  }
  if (g.type === 'breakout' && data.kind === 'paddle') {
    const x = +data.x;
    if (isFinite(x)) inst.paddle = Math.max(0.09, Math.min(0.91, x));
    return { state: true };
  }
  if (g.type === 'flappy' && data.kind === 'flap') {
    if (inst.alive) inst.bird.vy = -0.017;
    return { state: true };
  }
  if (g.type === 'invaders' && data.kind === 'move') {
    const d = Number(data.d);
    if (d === 1 || d === -1) inst.cannon = Math.max(0.06, Math.min(0.94, inst.cannon + d * 0.07));
    return { state: true };
  }
  if (g.type === 'invaders' && data.kind === 'fire') {
    if (inst.alive && inst.cd <= 0) { inst.bullets.push({ x: inst.cannon, y: 0.86 }); inst.cd = 350; }
    return { state: true };
  }
  if (g.type === 'duckhunt' && data.kind === 'shoot') {
    const x = +data.x, y = +data.y;
    if (!isFinite(x) || !isFinite(y)) return null;
    inst.shots.push({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), ttl: 260 });
    for (const d of inst.ducks) {
      if (d.alive && Math.hypot(x - d.x, y - d.y) < 0.07) { d.alive = false; inst.score++; }
    }
    return { state: true };
  }
  if (g.type === 'pong' && data.kind === 'paddle') {
    const y = +data.y;
    if (isFinite(y)) inst.paddle = Math.max(0.1, Math.min(0.9, y));
    return { state: true };
  }
  if (g.type === 'simon' && data.kind === 'pad') {
    const c = Number(data.c);
    if (![0, 1, 2, 3].includes(c)) return null;
    if (!inst.alive || !inst.accepting || Date.now() < inst.acceptAt || g.phase !== 'play') return null;
    if (c !== inst.seq[inst.pos]) {
      inst.alive = false;
      return { state: true, events: [{ type: 'toast', data: { text: `💥 ${player.name} s’est trompé au niveau ${inst.seq.length} !` } }] };
    }
    inst.pos++;
    if (inst.pos === inst.seq.length) {
      inst.level = inst.seq.length;
      simonNextRound(room, g, player.id);
    }
    return { state: true };
  }
  return null;
}

function tickRetro(room, dt) {
  const g = room.game;
  if (!g || !isRetro(g.type) || g.phase !== 'play') return null;
  const now = Date.now();

  if (g.type === 'snake') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      inst.acc += dt;
      while (inst.acc >= g.stepMs && inst.alive) { snakeStep(inst); inst.acc -= g.stepMs; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => !i.alive) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'whack') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      if (!inst.mole && now >= inst.nextSpawn) inst.mole = { idx: Math.floor(Math.random() * 9), until: now + 700 + Math.random() * 300 };
      else if (inst.mole && now > inst.mole.until) { inst.mole = null; inst.nextSpawn = now + 400 + Math.random() * 600; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'memory') {
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => i.done) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'breakout') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      inst.acc += dt;
      while (inst.acc >= 16 && inst.alive) { breakoutStep(g, inst); inst.acc -= 16; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => !i.alive) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'simon') {
    if (Object.values(g.instances).every((i) => !i.alive)) { retroFinish(room, g); return { state: true }; }
    return null;
  }
  if (g.type === 'flappy') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      inst.acc += dt;
      while (inst.acc >= 16.7 && inst.alive) { flappyStep(inst); inst.acc -= 16.7; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => !i.alive) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'invaders') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      inst.acc += dt;
      while (inst.acc >= 16.7 && inst.alive) { invadersStep(inst, now); inst.acc -= 16.7; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => !i.alive) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'duckhunt') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      if (now >= inst.nextDuck) {
        const fromLeft = Math.random() < 0.5;
        inst.ducks.push({
          x: fromLeft ? -0.06 : 1.06,
          y: 0.12 + Math.random() * 0.5,
          vx: (fromLeft ? 1 : -1) * (0.00045 + Math.random() * 0.0005),
          vy: (Math.random() - 0.5) * 0.0004,
          wob: Math.random() * 10,
          alive: true,
        });
        inst.nextDuck = now + 700 + Math.random() * 600;
      }
      inst.acc += dt;
      while (inst.acc >= 16.7) {
        inst.acc -= 16.7;
        for (const d of inst.ducks) {
          d.x += d.vx * 16.7;
          d.y += d.vy * 16.7 + Math.sin(now / 260 + d.wob) * 0.0006;
        }
        for (const s of inst.shots) s.ttl -= 16.7;
      }
      inst.ducks = inst.ducks.filter((d) => d.alive && d.x > -0.12 && d.x < 1.12);
      inst.shots = inst.shots.filter((s) => s.ttl > 0);
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  if (g.type === 'pong') {
    for (const inst of Object.values(g.instances)) {
      if (!inst.alive) continue;
      inst.acc += dt;
      while (inst.acc >= 16.7 && inst.alive) { pongStep(inst); inst.acc -= 16.7; }
    }
    g.timeLeft = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
    if (Object.values(g.instances).every((i) => !i.alive) || now >= g.endsAt) retroFinish(room, g);
    return { state: true };
  }
  return null;
}

module.exports = { create, handle, tick, tickRetro, publicGame, label, isRetro, drainEvents };
