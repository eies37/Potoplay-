'use strict';

const QUIZ_SECONDS = Number(process.env.QUIZ_SECONDS || 15);
const REVEAL_MS = Number(process.env.REVEAL_MS || 4000);
const DRAW_SECONDS = Number(process.env.DRAW_SECONDS || 80);
const ROUND_REVEAL_MS = Number(process.env.ROUND_REVEAL_MS || 5000);
const QUIZ_COUNT = Number(process.env.QUIZ_COUNT || 5);

const QUIZ_BANK = [
  { q: 'Quelle est la capitale de la France ?', options: ['Paris', 'Lyon', 'Marseille', 'Lille'], answer: 0 },
  { q: 'Combien font 7 × 8 ?', options: ['54', '56', '48', '64'], answer: 1 },
  { q: 'Quel est le plus grand océan du monde ?', options: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'], answer: 1 },
  { q: 'Quel animal est le symbole de la sagesse ?', options: ['La chouette', 'Le renard', 'L’aigle', 'Le lion'], answer: 0 },
  { q: 'Combien de joueurs d’une équipe de foot sont sur le terrain ?', options: ['9', '10', '11', '12'], answer: 2 },
  { q: 'De quelle couleur est la peau des Schtroumpfs ?', options: ['Bleue', 'Rouge', 'Verte', 'Jaune'], answer: 0 },
  { q: 'Quelle planète est la plus proche du Soleil ?', options: ['Vénus', 'Mercure', 'Mars', 'La Terre'], answer: 1 },
  { q: 'Qui a peint la Joconde ?', options: ['Léonard de Vinci', 'Monet', 'Picasso', 'Dalí'], answer: 0 },
  { q: 'Combien de côtés a un hexagone ?', options: ['5', '6', '7', '8'], answer: 1 },
  { q: 'Quelle est la langue maternelle la plus parlée au monde ?', options: ['Anglais', 'Mandarin', 'Espagnol', 'Hindi'], answer: 1 },
  { q: 'Quel instrument possède 6 cordes ?', options: ['Le violon', 'La guitare', 'Le piano', 'La harpe'], answer: 1 },
  { q: 'En quelle année est tombé le mur de Berlin ?', options: ['1987', '1989', '1991', '1985'], answer: 1 },
  { q: 'Lequel de ces fruits est techniquement une baie ?', options: ['La fraise', 'La banane', 'La cerise', 'La pomme'], answer: 0 },
  { q: 'Quelle est la vitesse de la lumière (approx.) ?', options: ['300 000 km/s', '150 000 km/s', '1 000 000 km/s', '30 000 km/s'], answer: 0 },
  { q: 'Combien de pattes a une araignée ?', options: ['6', '8', '10', '12'], answer: 1 },
  { q: 'Quel pays a inventé les sushis ?', options: ['La Chine', 'Le Japon', 'La Corée', 'La Thaïlande'], answer: 1 },
];

const WORDS = [
  'chat', 'chien', 'maison', 'soleil', 'pizza', 'robot', 'montagne', 'bateau',
  'guitare', 'licorne', 'avion', 'château', 'dragon', 'fleur', 'tortue', 'micro',
  'escalier', 'astronaute', 'fromage', 'bicyclette', 'parapluie', 'fantôme', 'livre', 'cactus',
];

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
  .toLowerCase().trim().replace(/\s+/g, ' ');

const label = (t) => ({ quiz: 'Quiz éclair ⚡', connect4: 'Puissance 4 🔴', draw: 'Dessin & Devinettes 🎨' }[t] || t);

function create(type, room) {
  const n = room.players.size;
  if (type === 'quiz') return n >= 1 ? quizCreate() : null;
  if (type === 'connect4') return n >= 2 ? c4Create(room) : null;
  if (type === 'draw') return n >= 1 ? drawCreate(room) : null;
  return null;
}

/* ---------------------------------- QUIZ ---------------------------------- */

function quizCreate() {
  const qs = shuffle([...QUIZ_BANK]).slice(0, QUIZ_COUNT);
  return {
    id: gid++, type: 'quiz', phase: 'question', qIndex: 0,
    questions: qs.map((q) => ({ q: q.q, options: q.options })),
    answer: qs.map((q) => q.answer),
    answers: {}, timeLeft: QUIZ_SECONDS,
    endsAt: Date.now() + QUIZ_SECONDS * 1000,
  };
}

function quizHandle(room, g, player, data) {
  if (g.phase !== 'question' || data.kind !== 'answer') return null;
  const idx = Number(data.index);
  if (game_answers_has(g, player.id) || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;
  const correct = idx === g.answer[g.qIndex];
  const speed = Math.max(0, Math.round((100 * (g.endsAt - Date.now())) / (QUIZ_SECONDS * 1000)));
  const points = correct ? 100 + speed : 0;
  g.answers[player.id] = { index: idx, correct, points };
  if (correct) room.scores[player.id] = (room.scores[player.id] || 0) + points;
  const all = [...room.players.keys()].every((id) => g.answers[id]);
  if (all) { g.phase = 'reveal'; g.endsAt = Date.now() + REVEAL_MS; }
  return { state: true };
}

const game_answers_has = (g, id) => Object.prototype.hasOwnProperty.call(g.answers, id);

/* -------------------------------- PUISSANCE 4 ------------------------------ */

function c4Create(room) {
  const ps = [...room.players.values()].slice(0, 2).map((p) => p.id);
  return {
    id: gid++, type: 'connect4', phase: 'play',
    board: new Array(42).fill(0), players: ps, turn: ps[0],
    winner: null, winCells: [], moves: 0,
  };
}

function c4WinCells(b, row, col, v) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const cells = [[row, col]];
    for (const s of [1, -1]) {
      let r = row + dr * s, c = col + dc * s;
      while (r >= 0 && r < 6 && c >= 0 && c < 7 && b[r * 7 + c] === v) {
        cells.push([r, c]);
        r += dr * s; c += dc * s;
      }
    }
    if (cells.length >= 4) return cells.map(([r, c]) => r * 7 + c);
  }
  return null;
}

function c4Drop(room, g, player, col) {
  if (g.phase !== 'play') return { error: 'La partie est terminée.' };
  if (!g.players.includes(player.id)) return { error: 'Vous êtes spectateur de cette partie 👀' };
  if (g.turn !== player.id) return { error: 'Ce n’est pas votre tour !' };
  col = Number(col);
  if (!Number.isInteger(col) || col < 0 || col > 6) return { error: 'Colonne invalide.' };
  let row = -1;
  for (let r = 5; r >= 0; r--) if (g.board[r * 7 + col] === 0) { row = r; break; }
  if (row < 0) return { error: 'Colonne pleine !' };
  const v = g.players.indexOf(player.id) + 1;
  g.board[row * 7 + col] = v;
  g.moves++;
  const win = c4WinCells(g.board, row, col, v);
  if (win) {
    g.phase = 'won';
    g.winner = player.id;
    g.winCells = win;
    room.scores[player.id] = (room.scores[player.id] || 0) + 200;
    return { state: true };
  }
  if (g.moves === 42) { g.phase = 'draw'; return { state: true }; }
  g.turn = g.players.find((id) => id !== player.id);
  return { state: true };
}

function c4Rematch(room, g, player) {
  if (g.phase !== 'won' && g.phase !== 'draw') return null;
  if (!g.players.includes(player.id)) return { error: 'Seuls les joueurs peuvent relancer.' };
  const starter = g.players.find((id) => id !== g.turn) || g.players[0];
  g.board = new Array(42).fill(0);
  g.moves = 0; g.winner = null; g.winCells = [];
  g.turn = starter; g.phase = 'play';
  return { state: true };
}

/* ------------------------------ DESSIN & DEVINE ----------------------------- */

function drawCreate(room) {
  const order = shuffle([...room.players.keys()]);
  return {
    id: gid++, type: 'draw', phase: 'drawing',
    order, round: 0, drawerId: order[0],
    word: WORDS[Math.floor(Math.random() * WORDS.length)],
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
    if (norm(text) === norm(g.word)) {
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

/* ---------------------------------- TICK ----------------------------------- */

function tick(room) {
  const g = room.game;
  if (!g) return null;
  const now = Date.now();

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
        g.word = WORDS[Math.floor(Math.random() * WORDS.length)];
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

  return null;
}

/* --------------------------------- HANDLE ---------------------------------- */

function handle(room, player, data) {
  const g = room.game;
  if (!g || !data || typeof data !== 'object') return null;
  if (data.game && data.game !== g.type) return null;
  if (g.type === 'quiz') return quizHandle(room, g, player, data);
  if (g.type === 'connect4') {
    if (data.kind === 'drop') return c4Drop(room, g, player, data.col);
    if (data.kind === 'rematch') return c4Rematch(room, g, player);
    return null;
  }
  if (g.type === 'draw') return drawHandle(room, g, player, data);
  return null;
}

/* ------------------------------- PUBLIC VIEW -------------------------------- */

function publicGame(g) {
  if (g.type === 'quiz') {
    const answers = {};
    for (const [id, a] of Object.entries(g.answers)) {
      answers[id] = g.phase === 'question' ? { index: a.index } : a;
    }
    return {
      id: g.id, type: 'quiz', phase: g.phase, qIndex: g.qIndex,
      total: g.questions.length, question: g.questions[g.qIndex] || null,
      answers, timeLeft: g.timeLeft, totalTime: QUIZ_SECONDS,
      answerIndex: g.phase === 'question' ? undefined : g.answer[g.qIndex],
    };
  }
  if (g.type === 'connect4') {
    return {
      id: g.id, type: 'connect4', phase: g.phase, board: g.board,
      players: g.players, turn: g.turn, winner: g.winner,
      winCells: g.winCells, moves: g.moves,
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
  return null;
}

module.exports = { create, handle, tick, publicGame, label };
