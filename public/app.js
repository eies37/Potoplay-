'use strict';

const $ = (s) => document.querySelector(s);

const S = {
  token: localStorage.getItem('sa_token') || null,
  room: localStorage.getItem('sa_room') || null,
  playerId: localStorage.getItem('sa_player') || null,
  state: null,
  es: null,
  view: 'home',
  secret: null,
  lastGameKey: '',
  unread: 0,
  catalog: [],
  catalogFilter: 'all',
  catalogQuery: '',
  retroRefs: null,
};

const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '😱', '🎉', '❤️', '👏', '🙌'];
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\uFE0F|\u20E3|\s){1,6}$/u;
const DRAW_COLORS = ['#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'];
const CANVAS_W = 900;
const CANVAS_H = 600;
const RETRO_TYPES = ['snake', 'whack', 'memory', 'breakout', 'simon'];
const RPS_EMOJI = ['✊', '✋', '✌️'];

const CAT_CHIPS = [
  { k: 'all', label: 'Tout' },
  { k: 'quiz', label: 'Quiz & devinettes' },
  { k: 'pendu', label: 'Pendu' },
  { k: 'draw', label: 'Dessin' },
  { k: 'board', label: 'Plateaux' },
  { k: 'retro', label: 'Rétro 🕹️' },
  { k: 'other', label: 'Autres' },
];

const catOf = (type) =>
  type === 'quiz' ? 'quiz'
    : type === 'pendu' ? 'pendu'
      : type === 'draw' ? 'draw'
        : ['connect4', 'morpion', 'ultimate'].includes(type) ? 'board'
          : RETRO_TYPES.includes(type) ? 'retro'
            : 'other';

async function api(action, data = {}) {
  try {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, room: S.room, token: S.token }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: 'Connexion au serveur perdue…' };
  }
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}

function floater(emoji) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = emoji;
  el.style.left = 8 + Math.random() * 84 + 'vw';
  $('#floaters').appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

const me = () => (S.state ? S.state.players.find((p) => p.id === S.playerId) : null);
const playerById = (id) => (S.state ? S.state.players.find((p) => p.id === id) : null);
const isHost = () => me() && S.state && S.state.hostId === me().id;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showScreen(name) {
  S.view = name;
  for (const s of ['home', 'lobby', 'game']) $('#screen-' + s).hidden = s !== name;
  const inRoom = name !== 'home';
  $('#room-chip').classList.toggle('hidden', !inRoom);
  $('#players-count').classList.toggle('hidden', !inRoom);
  if (inRoom && S.state) $('#room-code').textContent = S.state.code;
}

async function ensureCatalog() {
  if (S.catalog.length) return;
  try {
    const r = await fetch('/api/catalog');
    const j = await r.json();
    S.catalog = j.games || [];
  } catch (e) { S.catalog = []; }
}

function renderLobby() {
  const st = S.state;
  if (!st) return;
  $('#lobby-code').textContent = st.code;
  $('#room-code').textContent = st.code;
  $('#players-count-n').textContent = st.players.length;
  $('#lobby-n').textContent = `(${st.players.length})`;

  const pl = $('#players-list');
  pl.innerHTML = '';
  for (const p of st.players) {
    const li = document.createElement('li');
    li.className = 'player-row';
    li.innerHTML = `
      <div class="avatar" style="background:${p.color}">${escapeHtml((p.name[0] || '?').toUpperCase())}</div>
      <span class="player-name">${escapeHtml(p.name)}${p.id === S.playerId ? ' <span class="muted">(toi)</span>' : ''}${p.host ? ' 👑' : ''}</span>
      <span class="player-meta">
        <span class="score-pill">⭐ ${p.score}</span>
        <span class="dot${p.connected ? '' : ' off'}" title="${p.connected ? 'en ligne' : 'déconnecté'}"></span>
      </span>`;
    pl.appendChild(li);
  }

  const rl = $('#records-list');
  rl.innerHTML = '';
  const recs = Object.entries(st.records || {});
  if (!recs.length) rl.innerHTML = '<li class="muted">Aucun record pour l’instant — lance un jeu !</li>';
  for (const [type, r] of recs) {
    const li = document.createElement('li');
    li.className = 'record-row';
    li.textContent = `🏆 ${type} : ${r.name} — ${r.score} pts`;
    rl.appendChild(li);
  }

  const gc = $('#game-cards');
  const running = $('#game-running');
  if (st.game) {
    gc.classList.add('hidden');
    $('#catalog-search').classList.add('hidden');
    $('#catalog-chips').classList.add('hidden');
    running.classList.remove('hidden');
    const gm = st.game.meta || {};
    $('#running-title').textContent = `🎮 ${gm.emoji || ''} ${gm.title || 'Partie en cours'}…`;
    const rc = $('#running-cover');
    if (gm.coverId) { rc.src = '/api/cover/' + encodeURIComponent(gm.coverId); rc.classList.remove('hidden'); }
    else rc.classList.add('hidden');
  } else {
    gc.classList.remove('hidden');
    $('#catalog-search').classList.remove('hidden');
    $('#catalog-chips').classList.remove('hidden');
    running.classList.add('hidden');
    renderCatalog();
  }
}

function renderCatalog() {
  const q = S.catalogQuery.trim().toLowerCase();
  const list = S.catalog.filter((e) =>
    (S.catalogFilter === 'all' || catOf(e.type) === S.catalogFilter) &&
    (!q || (e.title + ' ' + e.desc).toLowerCase().includes(q))
  );
  $('#catalog-n').textContent = `— ${list.length}/${S.catalog.length} jeux`;
  const gc = $('#game-cards');
  gc.innerHTML = '';
  const host = isHost();
  for (const e of list) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <img class="game-cover" loading="lazy" alt="" src="/api/cover/${encodeURIComponent(e.id)}" />
      <div class="game-info"><b>${escapeHtml(e.title)}</b><span>${escapeHtml(e.desc)}</span></div>
      <button class="btn ${host ? '' : 'btn-ghost'} btn-sm" ${host ? '' : 'disabled'}>${host ? 'Lancer ▶' : 'Hôte choisit…'}</button>`;
    if (host) card.querySelector('button').addEventListener('click', () => startGame(e.id));
    gc.appendChild(card);
  }
  if (!list.length) gc.innerHTML = '<p class="muted" style="padding:8px">Aucun jeu ne correspond à la recherche.</p>';
}

function renderChips() {
  const box = $('#catalog-chips');
  box.innerHTML = '';
  for (const c of CAT_CHIPS) {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (S.catalogFilter === c.k ? ' active' : '');
    b.textContent = c.label;
    b.addEventListener('click', () => { S.catalogFilter = c.k; renderChips(); renderCatalog(); });
    box.appendChild(b);
  }
}

async function startGame(id) {
  const r = await api('startGame', { game: id });
  if (!r.ok) toast(r.error || 'Impossible de lancer la partie');
  else { S.lastGameKey = ''; showScreen('game'); }
}

function gameKey(g) {
  const { timeLeft, strokes, instances, ...rest } = g;
  return JSON.stringify(rest);
}

function renderGame() {
  const g = S.state && S.state.game;
  if (!g) { showScreen('lobby'); renderLobby(); return; }
  const meta = g.meta || {};
  $('#game-title').textContent = `${meta.emoji || '🎮'} ${meta.title || g.type}`;
  const gc = $('#game-cover');
  if (meta.coverId) { gc.src = '/api/cover/' + encodeURIComponent(meta.coverId); gc.classList.remove('hidden'); }
  else gc.classList.add('hidden');
  $('#btn-endgame').classList.toggle('hidden', !isHost());
  const timed = !!g.totalTime && g.phase !== 'end';
  $('#timer-bar').classList.toggle('hidden', !timed);

  const retro = RETRO_TYPES.includes(g.type);
  const key = retro ? `${g.id}|${g.phase}` : gameKey(g);
  if (key !== S.lastGameKey) {
    S.lastGameKey = key;
    S.retroRefs = null;
    const area = $('#game-area');
    area.innerHTML = '';
    area.appendChild(buildGameView(g));
  }
  updateTimer(g);
  if (retro) updateRetro(g);
}

function updateTimer(g) {
  if (!g.totalTime) return;
  const pct = Math.max(0, Math.min(100, (g.timeLeft / g.totalTime) * 100));
  $('#timer-fill').style.width = pct + '%';
  $('#timer-text').textContent = g.phase === 'end' ? '' : `⏱ ${g.timeLeft}s`;
}

function buildGameView(g) {
  if (RETRO_TYPES.includes(g.type)) return g.phase === 'end' ? retroEndView(g) : retroPlayView(g);
  switch (g.type) {
    case 'quiz': return quizView(g);
    case 'connect4':
    case 'morpion': return boardView(g);
    case 'draw': return drawView(g);
    case 'ultimate': return ultView(g);
    case 'pendu': return penduView(g);
    case 'reflex': return reflexView(g);
    case 'number': return numberView(g);
    case 'rps': return rpsView(g);
    default: return document.createElement('div');
  }
}

function podiumView(title, ranked) {
  const wrap = document.createElement('div');
  wrap.className = 'end-podium card';
  wrap.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <div class="podium">
      ${ranked.map((r, i) => `
        <div class="podium-row ${i === 0 ? 'first' : ''}">
          <span class="podium-rank">${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</span>
          <div class="avatar" style="background:${r.color || '#888'}">${escapeHtml((r.name[0] || '?').toUpperCase())}</div>
          <span class="player-name">${escapeHtml(r.name)}</span>
          <span class="score-pill" style="margin-left:auto">${escapeHtml(String(r.value))}</span>
        </div>`).join('')}
    </div>
    <button class="btn" data-back>Retour au salon</button>`;
  wrap.querySelector('[data-back]').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
  return wrap;
}

function roomRanking() {
  return [...(S.state ? S.state.players : [])].sort((a, b) => b.score - a.score)
    .map((p) => ({ name: p.name, color: p.color, value: `⭐ ${p.score}` }));
}

/* -------------------------------- Quiz --------------------------------- */

function quizView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'quiz-card card';
  if (g.phase === 'end') {
    wrap.appendChild(podiumView('🏁 Résultats', roomRanking()));
    return wrap;
  }
  const textMode = g.mode === 'text';
  wrap.innerHTML = `
    <div class="quiz-progress">${textMode ? '🧩 Devinette' : '❓ Question'} ${g.qIndex + 1} / ${g.total}${g.phase === 'reveal' ? ' — réponse révélée' : ''}</div>
    <div class="quiz-q"></div>
    ${textMode ? `
      <form class="guess-row" id="quiz-text-form">
        <input id="quiz-text-input" maxlength="60" placeholder="Ta réponse…" autocomplete="off" />
        <button class="btn btn-sm" type="submit">OK</button>
      </form>` : `<div class="quiz-options"></div>`}
    <div class="quiz-answers"></div>`;
  wrap.querySelector('.quiz-q').textContent = g.question ? g.question.q : '';
  const myAnswer = g.answers[S.playerId];

  if (!textMode) {
    const opts = wrap.querySelector('.quiz-options');
    (g.question ? g.question.options : []).forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.textContent = opt;
      if (g.phase !== 'question') {
        b.disabled = true;
        if (g.answerIndex === i) b.classList.add('correct');
        else if (myAnswer && myAnswer.index === i && myAnswer.correct === false) b.classList.add('wrong');
      }
      if (g.phase === 'question' && myAnswer && myAnswer.index === i) b.classList.add('picked');
      if (g.phase === 'question') {
        b.disabled = !!myAnswer;
        b.addEventListener('click', () => api('game', { data: { kind: 'answer', index: i } }));
      }
      opts.appendChild(b);
    });
  } else {
    const form = wrap.querySelector('#quiz-text-form');
    const inp = wrap.querySelector('#quiz-text-input');
    if (myAnswer) { inp.disabled = true; form.querySelector('button').disabled = true; inp.value = myAnswer.text || '✓'; }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = inp.value.trim();
      if (!text) return;
      await api('game', { data: { kind: 'answer', text } });
    });
    if (g.phase === 'reveal' && g.answerText) {
      const d = document.createElement('p');
      d.className = 'muted';
      d.style.marginTop = '10px';
      d.textContent = `La réponse était : ${g.answerText}`;
      wrap.appendChild(d);
    }
  }

  const answersEl = wrap.querySelector('.quiz-answers');
  for (const p of S.state.players) {
    const a = g.answers[p.id];
    if (!a) continue;
    const span = document.createElement('span');
    const reveal = g.phase !== 'question';
    span.className = 'qa' + (reveal ? (a.correct ? ' ok' : ' no') : '');
    span.textContent = reveal ? `${p.name} ${a.correct ? '✅ +' + a.points : '❌'}` : `${p.name} a répondu ✓`;
    answersEl.appendChild(span);
  }
  return wrap;
}

/* --------------------------- Plateau (C4 / Morpion) ---------------------- */

function boardView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'c4-wrap';
  wrap.innerHTML = `<div class="c4-status"></div><div class="board-grid"></div><div class="c4-actions"></div>`;
  const p1 = playerById(g.players[0]);
  const p2 = playerById(g.players[1]);
  const colors = { 1: p1 ? p1.color : '#f87171', 2: p2 ? p2.color : '#facc15' };
  const board = wrap.querySelector('.board-grid');
  board.style.gridTemplateColumns = `repeat(${g.w}, 1fr)`;
  const myTurn = g.phase === 'play' && g.players.includes(S.playerId) && g.turn === S.playerId;

  if (g.gravity) {
    for (let c = 0; c < g.w; c++) {
      const col = document.createElement('div');
      col.className = 'bg-col' + (myTurn ? '' : ' blocked');
      for (let r = 0; r < g.h; r++) {
        const cell = document.createElement('div');
        cell.className = 'bg-cell';
        const v = g.board[r * g.w + c];
        if (v) {
          cell.classList.add('filled', 'p' + v);
          cell.style.background = colors[v];
          if (g.winCells && g.winCells.includes(r * g.w + c)) cell.classList.add('win');
        }
        col.appendChild(cell);
      }
      col.addEventListener('click', () => { if (myTurn) api('game', { data: { kind: 'drop', col: c } }); });
      board.appendChild(col);
    }
  } else {
    for (let i = 0; i < g.w * g.h; i++) {
      const cell = document.createElement('div');
      cell.className = 'bg-cell' + (myTurn ? '' : ' blocked');
      const v = g.board[i];
      if (v) {
        cell.classList.add('filled', 'p' + v);
        cell.style.background = colors[v];
        if (g.winCells && g.winCells.includes(i)) cell.classList.add('win');
      }
      cell.addEventListener('click', () => { if (myTurn) api('game', { data: { kind: 'play', cell: i } }); });
      board.appendChild(cell);
    }
  }

  const status = wrap.querySelector('.c4-status');
  const actions = wrap.querySelector('.c4-actions');
  if (g.phase === 'won') {
    const w = playerById(g.winner);
    status.innerHTML = `🏆 <b style="color:${w ? w.color : '#fff'}">${escapeHtml(w ? w.name : '?')}</b> gagne ! +200 ⭐`;
  } else if (g.phase === 'draw') {
    status.textContent = '🤝 Match nul !';
  } else {
    const t = playerById(g.turn);
    status.innerHTML = g.turn === S.playerId
      ? `🎯 <b>À toi de jouer !</b> (${g.gravity ? 'clique une colonne' : 'clique une case'})`
      : `⏳ Au tour de <b style="color:${t ? t.color : '#fff'}">${escapeHtml(t ? t.name : '?')}</b>`;
  }
  if ((g.phase === 'won' || g.phase === 'draw') && g.players.includes(S.playerId)) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '🔁 Revanche';
    b.addEventListener('click', () => api('game', { data: { kind: 'rematch' } }));
    actions.appendChild(b);
  }
  return wrap;
}

/* ------------------------------ Morpion XXL ------------------------------- */

function ultView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'c4-wrap';
  wrap.innerHTML = `<div class="c4-status"></div><div class="ult-board"></div><div class="c4-actions"></div>`;
  const p1 = playerById(g.players[0]);
  const p2 = playerById(g.players[1]);
  const myTurn = g.phase === 'play' && g.players.includes(S.playerId) && g.turn === S.playerId;
  const board = wrap.querySelector('.ult-board');

  for (let m = 0; m < 9; m++) {
    const mini = document.createElement('div');
    mini.className = 'ult-mini' + (g.activeMini === m && g.phase === 'play' ? ' active' : '');
    const w = g.miniWon[m];
    if (w === 1 || w === 2) {
      mini.innerHTML = `<span class="ult-overlay" style="color:${(w === 1 ? p1 : p2) ? (w === 1 ? p1.color : p2.color) : '#fff'}">${w === 1 ? '✕' : '◯'}</span>`;
    } else if (w === 3) {
      mini.innerHTML = '<span class="ult-overlay muted">–</span>';
    }
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'ult-cell';
      const v = g.board[m * 9 + c];
      if (v) {
        cell.classList.add('filled');
        cell.style.color = ((v === 1 ? p1 : p2) || {}).color || '#fff';
        cell.textContent = v === 1 ? '✕' : '◯';
      }
      const mm = m, cc = c;
      cell.addEventListener('click', () => {
        if (myTurn && (g.activeMini === null || g.activeMini === mm)) api('game', { data: { kind: 'move', mini: mm, cell: cc } });
      });
      mini.appendChild(cell);
    }
    board.appendChild(mini);
  }

  const status = wrap.querySelector('.c4-status');
  const actions = wrap.querySelector('.c4-actions');
  if (g.phase === 'won') {
    const w = playerById(g.winner);
    status.innerHTML = `🏆 <b style="color:${w ? w.color : '#fff'}">${escapeHtml(w ? w.name : '?')}</b> gagne le Morpion XXL ! +250 ⭐`;
  } else if (g.phase === 'draw') status.textContent = '🤝 Match nul !';
  else {
    const t = playerById(g.turn);
    status.innerHTML = g.turn === S.playerId
      ? '🎯 À toi ! Joue dans la grille surlignée (ou partout si aucune).'
      : `⏳ Au tour de <b style="color:${t ? t.color : '#fff'}">${escapeHtml(t ? t.name : '?')}</b>`;
  }
  if ((g.phase === 'won' || g.phase === 'draw') && g.players.includes(S.playerId)) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '🔁 Revanche';
    b.addEventListener('click', () => api('game', { data: { kind: 'rematch' } }));
    actions.appendChild(b);
  }
  return wrap;
}

/* ------------------------------ Draw & guess ----------------------------- */

let drawState = { drawing: false, last: null, color: '#111827', size: 5, pending: [], sendTimer: null };

function drawView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'draw-wrap';
  const iAmDrawer = g.drawerId === S.playerId && g.phase === 'drawing';

  const wordHtml = g.phase === 'drawing'
    ? (iAmDrawer
        ? `<span class="muted">Mot à dessiner :</span> <span class="draw-word">${escapeHtml((S.secret && S.secret.word) || '…')}</span>`
        : `<span class="muted">Devine le mot</span> <span class="draw-word masked">${'• '.repeat(g.wordLength).trim()}</span> <span class="muted">(${g.wordLength} lettres — ${g.correctCount} trouvé(s))</span>`)
    : `<span class="muted">Le mot était :</span> <span class="draw-word">${escapeHtml(g.revealWord || '…')}</span>`;

  wrap.innerHTML = `
    <div class="draw-word-wrap">${wordHtml}</div>
    <div class="canvas-frame"><canvas id="draw-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas></div>
    ${iAmDrawer ? `
      <div class="draw-tools">
        ${DRAW_COLORS.map((c) => `<button class="swatch${c === drawState.color ? ' active' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}
        <input type="range" min="2" max="24" value="${drawState.size}" id="brush-size" title="Taille du pinceau" />
        <button class="btn btn-ghost btn-sm" id="btn-clear">🧽 Effacer</button>
      </div>` : `
      <form class="guess-row" id="guess-form">
        <input id="guess-input" maxlength="60" placeholder="Ta proposition…" autocomplete="off" ${g.phase !== 'drawing' ? 'disabled' : ''} />
        <button class="btn btn-sm" type="submit" ${g.phase !== 'drawing' ? 'disabled' : ''}>Deviner</button>
      </form>`}
  `;

  const cv = wrap.querySelector('#draw-canvas');
  const ctx = cv.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const s of g.strokes || []) drawStroke(ctx, s);

  if (iAmDrawer) {
    drawState.drawing = false;
    wrap.querySelectorAll('.swatch').forEach((sw) => sw.addEventListener('click', () => {
      drawState.color = sw.dataset.c;
      wrap.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === sw));
    }));
    wrap.querySelector('#brush-size').addEventListener('input', (e) => { drawState.size = +e.target.value; });
    wrap.querySelector('#btn-clear').addEventListener('click', () => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      api('game', { data: { kind: 'clear' } });
    });
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    cv.addEventListener('pointerdown', (e) => {
      const gg = S.state.game;
      if (!gg || gg.drawerId !== S.playerId) return;
      cv.setPointerCapture(e.pointerId);
      drawState.drawing = true;
      drawState.last = pos(e);
      const s = { x1: drawState.last.x, y1: drawState.last.y, x2: drawState.last.x, y2: drawState.last.y, c: drawState.color, w: drawState.size };
      drawStroke(ctx, s);
      queueStroke(s);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drawState.drawing) return;
      const p = pos(e);
      const s = { x1: drawState.last.x, y1: drawState.last.y, x2: p.x, y2: p.y, c: drawState.color, w: drawState.size };
      drawState.last = p;
      drawStroke(ctx, s);
      queueStroke(s);
    });
    const stop = () => { drawState.drawing = false; flushStrokes(); };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
  } else {
    const form = wrap.querySelector('#guess-form');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = wrap.querySelector('#guess-input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      await api('game', { data: { kind: 'guess', text } });
    });
  }
  return wrap;
}

function drawStroke(ctx, s) {
  ctx.strokeStyle = s.c;
  ctx.lineWidth = s.w;
  ctx.beginPath();
  ctx.moveTo(s.x1 * CANVAS_W, s.y1 * CANVAS_H);
  ctx.lineTo(s.x2 * CANVAS_W, s.y2 * CANVAS_H);
  ctx.stroke();
}

function queueStroke(s) {
  drawState.pending.push(s);
  if (!drawState.sendTimer) drawState.sendTimer = setTimeout(flushStrokes, 40);
}

async function flushStrokes() {
  clearTimeout(drawState.sendTimer);
  drawState.sendTimer = null;
  const batch = drawState.pending.splice(0);
  for (const s of batch) await api('game', { data: { kind: 'stroke', ...s } });
}

function onRemoteStroke(data) {
  const g = S.state && S.state.game;
  if (!g || g.type !== 'draw' || S.view !== 'game') return;
  const cv = $('#draw-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (data.clear) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); return; }
  drawStroke(ctx, data);
}

/* -------------------------------- Pendu ---------------------------------- */

function penduView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'card pendu-card';
  if (g.phase !== 'playing') {
    const w = g.phase === 'won' ? playerById(g.winner) : null;
    wrap.innerHTML = `
      <div class="end-podium">
        <h2>${g.phase === 'won' ? '🎉 Mot trouvé !' : '💀 Pendu !'}</h2>
        <p class="pendu-word">${escapeHtml(g.revealWord || '')}</p>
        ${w ? `<p><b style="color:${w.color}">${escapeHtml(w.name)}</b> a complété le mot (+100 ⭐)</p>` : ''}
        <button class="btn" data-back style="margin-top:14px">Retour au salon</button>
      </div>`;
    wrap.querySelector('[data-back]').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
    return wrap;
  }
  wrap.innerHTML = `
    <div class="pendu-lives">${'❤️'.repeat(g.lives)}${'🖤'.repeat(Math.max(0, g.totalLives - g.lives))}</div>
    <div class="pendu-word">${g.revealed.map((c) => `<span class="pendu-letter">${c ? escapeHtml(c.toUpperCase()) : '_'}</span>`).join('')}</div>
    <div class="pendu-guessed">${g.guessed.map((c) => `<span class="chip-letter">${escapeHtml(c)}</span>`).join('') || '<span class="muted">aucune lettre proposée</span>'}</div>
    <form class="guess-row" id="pendu-form" style="margin-top:14px">
      <input id="pendu-input" maxlength="1" placeholder="Une lettre…" autocomplete="off" style="width:90px;text-align:center;font-size:20px;font-weight:800" />
      <button class="btn btn-sm" type="submit">Proposer</button>
    </form>`;
  wrap.querySelector('#pendu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = wrap.querySelector('#pendu-input');
    const ch = inp.value.trim();
    if (!ch) return;
    inp.value = '';
    await api('game', { data: { kind: 'letter', ch } });
  });
  return wrap;
}

/* -------------------------------- Réflexe -------------------------------- */

function reflexView(g) {
  const wrap = document.createElement('div');
  if (g.phase === 'end') {
    const agg = {};
    for (const r of g.results) if (r.winner) agg[r.winner] = (agg[r.winner] || 0) + r.pts;
    const ranked = S.state.players
      .map((p) => ({ name: p.name, color: p.color, value: `${agg[p.id] || 0} pts` }))
      .sort((a, b) => parseInt(b.value) - parseInt(a.value));
    wrap.appendChild(podiumView('🏁 Résultats du réflexe', ranked));
    return wrap;
  }
  wrap.className = 'c4-wrap';
  wrap.innerHTML = `
    <div class="c4-status">Manche ${g.round + 1} / ${g.total} — ${g.phase === 'waiting' ? 'Prépare-toi… 👀' : g.phase === 'target' ? '🎯 CLIQUE !' : 'Résultat…'}</div>
    <div class="reflex-arena"></div>
    <div class="reflex-results"></div>`;
  const arena = wrap.querySelector('.reflex-arena');
  if (g.phase === 'target' && g.target) {
    const t = document.createElement('button');
    t.className = 'reflex-target';
    t.textContent = '🎯';
    t.style.left = g.target.x + '%';
    t.style.top = g.target.y + '%';
    t.addEventListener('click', () => api('game', { data: { kind: 'hit' } }));
    arena.appendChild(t);
  }
  const res = wrap.querySelector('.reflex-results');
  for (const r of g.results) {
    const p = playerById(r.winner);
    const d = document.createElement('div');
    d.className = 'hint-row';
    d.textContent = r.winner ? `⚡ ${p ? p.name : '?'} — ${r.ms} ms (+${r.pts})` : '— personne n’a cliqué';
    res.appendChild(d);
  }
  return wrap;
}

/* ------------------------------ Chaud / Froid ----------------------------- */

function numberView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'card number-card';
  if (g.phase !== 'playing') {
    const w = g.phase === 'won' ? playerById(g.winner) : null;
    wrap.innerHTML = `
      <div class="end-podium">
        <h2>${g.phase === 'won' ? '🎯 Trouvé !' : '😵 Plus d’essais !'}</h2>
        <p>Le nombre était <b class="draw-word">${g.revealNumber}</b></p>
        ${w ? `<p><b style="color:${w.color}">${escapeHtml(w.name)}</b> gagne +150 ⭐</p>` : ''}
        <button class="btn" data-back style="margin-top:14px">Retour au salon</button>
      </div>`;
    wrap.querySelector('[data-back]').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
    return wrap;
  }
  wrap.innerHTML = `
    <h3 style="margin-bottom:6px">🔢 Devine le nombre entre 1 et ${g.range}</h3>
    <p class="muted" style="margin-bottom:12px">Essais restants : <b>${g.guessesLeft}</b> — tout le monde joue en même temps !</p>
    <form class="guess-row" id="num-form">
      <input id="num-input" inputmode="numeric" placeholder="42" autocomplete="off" />
      <button class="btn btn-sm" type="submit">Proposer</button>
    </form>
    <div class="hints"></div>`;
  wrap.querySelector('#num-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = wrap.querySelector('#num-input');
    const n = inp.value.trim();
    if (!n) return;
    inp.value = '';
    await api('game', { data: { kind: 'num', n } });
  });
  const hints = wrap.querySelector('.hints');
  for (const h of g.hints.slice(-14)) {
    const d = document.createElement('div');
    d.className = 'hint-row';
    d.innerHTML = `<b style="color:${h.color}">${escapeHtml(h.name)}</b> a proposé <b>${h.n}</b> → ${h.hint}`;
    hints.appendChild(d);
  }
  return wrap;
}

/* ---------------------------------- RPS ----------------------------------- */

function rpsView(g) {
  const wrap = document.createElement('div');
  if (g.phase === 'end') {
    wrap.appendChild(podiumView('🏁 Pierre-Feuille-Ciseaux', roomRanking()));
    return wrap;
  }
  wrap.className = 'c4-wrap';
  const mine = g.choices[S.playerId] !== undefined;
  wrap.innerHTML = `
    <div class="c4-status">Manche ${g.round + 1} / ${g.total} — ${g.phase === 'choosing' ? (mine ? 'Choix pris ✓ en attente des autres…' : 'À toi : choisis !') : 'Révélation…'}</div>
    ${g.phase === 'choosing' ? `
      <div class="rps-btns">
        ${RPS_EMOJI.map((e, i) => `<button class="rps-btn" data-c="${i}" ${mine ? 'disabled' : ''}>${e}</button>`).join('')}
      </div>
      <p class="muted">${g.choiceCount} / ${g.players.length} ont choisi</p>` : ''}
    <div class="rps-results"></div>`;
  wrap.querySelectorAll('.rps-btn').forEach((b) => b.addEventListener('click', () => {
    api('game', { data: { kind: 'choice', c: +b.dataset.c } });
  }));
  const res = wrap.querySelector('.rps-results');
  const lr = g.lastResult;
  if (lr) {
    for (const p of S.state.players) {
      const c = lr.choices[p.id];
      if (c === undefined || c === true) continue;
      const win = lr.winners.includes(p.id);
      const d = document.createElement('div');
      d.className = 'hint-row';
      d.innerHTML = `<b style="color:${p.color}">${escapeHtml(p.name)}</b> : ${RPS_EMOJI[c]} ${win ? '🏆 +100' : ''}`;
      res.appendChild(d);
    }
    if (!lr.winners.length) {
      const d = document.createElement('div');
      d.className = 'hint-row muted';
      d.textContent = 'Match nul 🤝';
      res.appendChild(d);
    }
  }
  return wrap;
}

/* ------------------------------ Jeux rétro -------------------------------- */

function retroMetric(g, inst) {
  if (['snake', 'whack', 'flappy', 'invaders', 'duckhunt'].includes(g.type)) return inst.score || 0;
  if (g.type === 'pong') return inst.my || 0;
  if (g.type === 'memory') return (inst.matched || []).length / 2;
  if (g.type === 'breakout') return inst.score || 0;
  if (g.type === 'simon') return inst.level || 0;
  return 0;
}

function retroEndView(g) {
  const wrap = document.createElement('div');
  const ranked = Object.entries(g.instances)
    .map(([id, inst]) => ({ p: playerById(id), v: retroMetric(g, inst) }))
    .filter((x) => x.p)
    .sort((a, b) => b.v - a.v)
    .map((x) => ({ name: x.p.name, color: x.p.color, value: `${x.v} ${g.type === 'simon' ? 'niv.' : g.type === 'memory' ? 'paires' : 'pts'}` }));
  const inner = podiumView(`🏁 ${g.meta ? g.meta.title : 'Partie rétro'} — résultats`, ranked);
  const rec = S.state.records && S.state.records[g.type];
  if (rec) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.style.marginTop = '10px';
    p.textContent = `🏆 Record du salon (${g.type}) : ${rec.name} — ${rec.score} pts`;
    inner.appendChild(p);
  }
  wrap.appendChild(inner);
  return wrap;
}

function retroPlayView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'retro-frame';
  wrap.innerHTML = `
    <div class="retro-head">
      <span class="retro-title">🕹️ ${escapeHtml((g.meta && g.meta.title) || g.type)}</span>
      <span class="retro-score" id="retro-my-score"></span>
    </div>
    <div class="retro-body">
      <div class="retro-surface"></div>
      <div class="retro-side">
        <div class="retro-lb-title">🏆 Classement en direct</div>
        <ul class="retro-lb"></ul>
      </div>
    </div>`;
  S.retroRefs = { g, surface: wrap.querySelector('.retro-surface'), lb: wrap.querySelector('.retro-lb'), scoreEl: wrap.querySelector('#retro-my-score') };
  buildRetroSurface(g);
  return wrap;
}

function buildRetroSurface(g) {
  const R = S.retroRefs;
  if (!R) return;
  const surface = R.surface;
  surface.innerHTML = '';
  if (g.type === 'snake') {
    surface.innerHTML = `<canvas id="snake-cv" width="400" height="400" class="retro-canvas"></canvas>
      <div class="dpad">
        <span></span><button class="dbtn" data-d="up">▲</button><span></span>
        <button class="dbtn" data-d="left">◀</button><button class="dbtn" data-d="down">▼</button><button class="dbtn" data-d="right">▶</button>
      </div>`;
    surface.querySelectorAll('.dbtn').forEach((b) => b.addEventListener('click', () => api('game', { data: { kind: 'dir', d: b.dataset.d } })));
    const cv = surface.querySelector('#snake-cv');
    let swipe = null;
    cv.addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointerup', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      api('game', { data: { kind: 'dir', d } });
    });
  } else if (g.type === 'whack') {
    surface.innerHTML = `<div class="whack-grid">${Array.from({ length: 9 }, (_, i) => `<button class="hole" data-i="${i}">🕳️</button>`).join('')}</div>`;
    surface.querySelectorAll('.hole').forEach((h) => h.addEventListener('click', () => api('game', { data: { kind: 'hit', idx: +h.dataset.i } })));
  } else if (g.type === 'memory') {
    surface.innerHTML = `<div class="memory-grid" style="grid-template-columns:repeat(${g.cols},1fr)">${Array.from({ length: g.cols * g.rows }, (_, i) => `<button class="mem-card" data-i="${i}">❓</button>`).join('')}</div>`;
    surface.querySelectorAll('.mem-card').forEach((c) => c.addEventListener('click', () => api('game', { data: { kind: 'flip', idx: +c.dataset.i } })));
  } else if (g.type === 'breakout') {
    surface.innerHTML = `<canvas id="breakout-cv" width="400" height="460" class="retro-canvas"></canvas>
      <p class="muted" style="text-align:center">Glisse le doigt sur le canvas pour déplacer la raquette 👆</p>`;
    const cv = surface.querySelector('#breakout-cv');
    let lastSent = 0;
    const sendPaddle = (e) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const now = Date.now();
      if (now - lastSent > 40) { lastSent = now; api('game', { data: { kind: 'paddle', x } }); }
    };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); sendPaddle(e); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) sendPaddle(e); });
  } else if (g.type === 'simon') {
    surface.innerHTML = `
      <div class="simon-grid">
        ${['#22c55e', '#ef4444', '#eab308', '#3b82f6'].map((c, i) => `<button class="simon-pad" data-c="${i}" style="background:${c}"></button>`).join('')}
      </div>
      <p class="muted" style="text-align:center" id="simon-status"></p>`;
    surface.querySelectorAll('.simon-pad').forEach((p) => p.addEventListener('click', () => api('game', { data: { kind: 'pad', c: +p.dataset.c } })));
  } else if (g.type === 'flappy') {
    surface.innerHTML = `<canvas id="flappy-cv" width="400" height="460" class="retro-canvas"></canvas>
      <p class="muted" style="text-align:center">👆 Tape le canvas pour faire voler l’oiseau</p>`;
    surface.querySelector('#flappy-cv').addEventListener('pointerdown', () => api('game', { data: { kind: 'flap' } }));
  } else if (g.type === 'invaders') {
    surface.innerHTML = `<canvas id="invaders-cv" width="400" height="460" class="retro-canvas"></canvas>
      <div class="dpad" style="grid-template-columns:repeat(3,64px)">
        <button class="dbtn" data-m="-1">◀</button><button class="dbtn" data-m="0" style="font-size:24px">🔥</button><button class="dbtn" data-m="1">▶</button>
      </div>`;
    surface.querySelectorAll('.dbtn').forEach((b) => b.addEventListener('click', () => {
      const m = +b.dataset.m;
      if (m === 0) api('game', { data: { kind: 'fire' } });
      else api('game', { data: { kind: 'move', d: m } });
    }));
  } else if (g.type === 'duckhunt') {
    surface.innerHTML = `<canvas id="duck-cv" width="400" height="300" class="retro-canvas"></canvas>
      <p class="muted" style="text-align:center">👆 Tape sur un canard pour tirer !</p>`;
    const cv = surface.querySelector('#duck-cv');
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect();
      api('game', { data: { kind: 'shoot', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } });
    });
  } else if (g.type === 'pong') {
    surface.innerHTML = `<canvas id="pong-cv" width="400" height="460" class="retro-canvas"></canvas>
      <p class="muted" style="text-align:center">👆 Glisse le doigt pour déplacer ta raquette</p>`;
    const cv = surface.querySelector('#pong-cv');
    let lastSent = 0;
    const send = (e) => {
      const r = cv.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      const now = Date.now();
      if (now - lastSent > 40) { lastSent = now; api('game', { data: { kind: 'paddle', y } }); }
    };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); send(e); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) send(e); });
  }
}

function updateRetro(g) {
  const R = S.retroRefs;
  if (!R || R.g.id !== g.id) return;
  const inst = g.instances[S.playerId] || {};
  R.scoreEl.textContent = retroMetric(g, inst) + (g.type === 'simon' ? ' niv.' : g.type === 'memory' ? ' paires' : ' pts');

  const lb = R.lb;
  lb.innerHTML = '';
  const ranked = Object.entries(g.instances)
    .map(([id, s]) => ({ p: playerById(id), s }))
    .filter((x) => x.p)
    .sort((a, b) => retroMetric(g, b.s) - retroMetric(g, a.s));
  for (const { p, s } of ranked) {
    const li = document.createElement('li');
    li.className = 'retro-lb-row';
    const dead = s.alive === false || s.done;
    li.innerHTML = `<span class="dot"></span><b style="color:${p.color}">${escapeHtml(p.name)}</b><span style="margin-left:auto">${retroMetric(g, s)}${dead ? ' 💀' : ''}</span>`;
    lb.appendChild(li);
  }

  if (g.type === 'snake') {
    const cv = R.surface.querySelector('#snake-cv');
    if (cv) {
      const ctx = cv.getContext('2d');
      const cell = 20;
      ctx.fillStyle = '#052e16';
      ctx.fillRect(0, 0, 400, 400);
      ctx.strokeStyle = 'rgba(74,222,128,0.12)';
      for (let i = 1; i < 20; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, 400); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(400, i * cell); ctx.stroke();
      }
      if (inst.food) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(inst.food.x * cell + cell / 2, inst.food.y * cell + cell / 2, cell / 2.6, 0, 7); ctx.fill();
      }
      (inst.snake || []).forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#4ade80' : '#22c55e';
        ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
      });
      if (inst.alive === false) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, 400, 400);
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`💀 ${inst.score} pts`, 200, 205);
      }
    }
  } else if (g.type === 'whack') {
    R.surface.querySelectorAll('.hole').forEach((h) => {
      const i = +h.dataset.i;
      const active = inst.mole && inst.mole.idx === i;
      h.textContent = active ? '🐹' : '🕳️';
      h.classList.toggle('active', !!active);
    });
  } else if (g.type === 'memory') {
    R.surface.querySelectorAll('.mem-card').forEach((c) => {
      const i = +c.dataset.i;
      const open = (inst.open || []).includes(i);
      const matched = (inst.matched || []).includes(i);
      if (matched) { c.textContent = inst.deck ? inst.deck[i] : '✅'; c.classList.add('matched'); }
      else if (open) { c.textContent = inst.deck ? inst.deck[i] : '?'; c.classList.add('open'); }
      else { c.textContent = '❓'; c.classList.remove('open', 'matched'); }
    });
  } else if (g.type === 'breakout') {
    const cv = R.surface.querySelector('#breakout-cv');
    if (cv && inst.ball) {
      const ctx = cv.getContext('2d');
      const W = 400, H = 460;
      ctx.fillStyle = '#0c0a1d';
      ctx.fillRect(0, 0, W, H);
      const cw = W / inst.cols, bh = 0.05 * H, y0 = 0.06 * H;
      (inst.bricks || []).forEach((br, i) => {
        if (!br.alive) return;
        const c = i % inst.cols, r = Math.floor(i / inst.cols);
        ctx.fillStyle = `hsl(${20 + r * 30}, 85%, 55%)`;
        ctx.fillRect(c * cw + 2, y0 + r * bh + 2, cw - 4, bh - 4);
      });
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(inst.paddle * W - 36, 0.94 * H, 72, 10);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(inst.ball.x * W, inst.ball.y * H, 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`❤️${'❤️'.repeat(Math.max(0, inst.lives))}  niveau ${inst.level}  score ${inst.score}`, 10, H - 10);
      if (inst.alive === false) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 24px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`💀 Game over — ${inst.score} pts`, W / 2, H / 2);
      }
    }
  } else if (g.type === 'simon') {
    const st = R.surface.querySelector('#simon-status');
    if (st) {
      st.textContent = inst.alive === false
        ? `💥 Éliminé au niveau ${inst.level}`
        : inst.accepting ? `👉 À toi ! Niveau ${inst.level + 1}` : `👀 Regarde la séquence… (niveau ${inst.level + 1})`;
    }
  } else if (g.type === 'flappy') {
    const cv = R.surface.querySelector('#flappy-cv');
    if (cv) {
      const ctx = cv.getContext('2d');
      const W = 400, H = 460;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0ea5e9'); sky.addColorStop(1, '#082f49');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#16a34a';
      for (const p of inst.pipes || []) {
        const gx = p.x * W, gw = 0.1 * W, gy = p.gapY * H, gh = p.gapH * H;
        ctx.fillRect(gx, 0, gw, gy - gh / 2);
        ctx.fillRect(gx, gy + gh / 2, gw, H - gy - gh / 2);
      }
      const b = inst.bird || { x: 0.18, y: 0.5 };
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#0b0f1a';
      ctx.beginPath(); ctx.arc(b.x * W + 4, b.y * H - 3, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
      ctx.fillText(inst.score, W / 2, 46);
      if (inst.alive === false) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f87171'; ctx.font = 'bold 24px monospace';
        ctx.fillText(`💀 ${inst.score} tuyaux`, W / 2, H / 2);
      }
    }
  } else if (g.type === 'invaders') {
    const cv = R.surface.querySelector('#invaders-cv');
    if (cv) {
      const ctx = cv.getContext('2d');
      const W = 400, H = 460;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4ade80';
      for (const a of inst.aliens || []) {
        if (!a.alive) continue;
        ctx.fillRect((a.bx + (inst.ox || 0)) * W, (a.by + (inst.oy || 0)) * H, 22, 16);
      }
      ctx.fillStyle = '#fff';
      for (const b of inst.bullets || []) ctx.fillRect(b.x * W - 1.5, b.y * H, 3, 10);
      ctx.fillStyle = '#22d3ee';
      const cx = (inst.cannon || 0.5) * W;
      ctx.fillRect(cx - 16, H - 26, 32, 12);
      ctx.fillRect(cx - 3, H - 38, 6, 14);
      ctx.fillStyle = '#facc15'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${inst.score || 0}`, 10, 26);
      if (inst.alive === false) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f87171'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
        ctx.fillText('👾 INVASION !', W / 2, H / 2);
      }
    }
  } else if (g.type === 'duckhunt') {
    const cv = R.surface.querySelector('#duck-cv');
    if (cv) {
      const ctx = cv.getContext('2d');
      const W = 400, H = 300;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#38bdf8'); sky.addColorStop(0.75, '#0c4a6e'); sky.addColorStop(1, '#14532d');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.font = '30px serif'; ctx.textAlign = 'center';
      for (const d of inst.ducks || []) {
        if (!d.alive) continue;
        ctx.save();
        ctx.translate(d.x * W, d.y * H);
        if (d.vx < 0) ctx.scale(-1, 1);
        ctx.fillText('🦆', 0, 0);
        ctx.restore();
      }
      for (const s of inst.shots || []) {
        ctx.font = '22px serif';
        ctx.fillText('💥', s.x * W, s.y * H);
      }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`🦆 ${inst.score || 0}`, 10, 26);
    }
  } else if (g.type === 'pong') {
    const cv = R.surface.querySelector('#pong-cv');
    if (cv && inst.ball) {
      const ctx = cv.getContext('2d');
      const W = 400, H = 460;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(8, inst.paddle * H - 40, 8, 80);
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(W - 16, inst.ai * H - 40, 8, 80);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(inst.ball.x * W, inst.ball.y * H, 7, 0, 7); ctx.fill();
      ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#22d3ee'; ctx.fillText(inst.my || 0, W / 2 - 50, 44);
      ctx.fillStyle = '#f472b6'; ctx.fillText(inst.aiScore || 0, W / 2 + 50, 44);
      ctx.fillStyle = '#94a3b8'; ctx.font = '13px monospace';
      ctx.fillText(`premier à ${inst.target}`, W / 2, H - 12);
      if (inst.alive === false) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = inst.won ? '#4ade80' : '#f87171'; ctx.font = 'bold 26px monospace';
        ctx.fillText(inst.won ? '🏆 GAGNÉ !' : '💀 PERDU', W / 2, H / 2);
      }
    }
  }
}

/* -------------------------------- Chat --------------------------------- */

function addChatMsg(m) {
  const box = $('#chat-messages');
  const nearBottom = box.scrollTop + box.clientHeight > box.scrollHeight - 80;
  const div = document.createElement('div');
  const big = m.kind !== 'system' && EMOJI_ONLY.test(m.text || '');
  if (m.kind === 'system') {
    div.className = 'msg system';
    div.textContent = m.text;
  } else {
    div.className = 'msg' + (big ? ' big-emoji' : '');
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = m.color || '#fff';
    who.textContent = (m.kind === 'guess' ? '🎨 ' : '') + (m.name || '?') + ':';
    const txt = document.createElement('span');
    txt.textContent = ' ' + (m.text || '');
    div.appendChild(who);
    div.appendChild(txt);
  }
  box.appendChild(div);
  if (nearBottom) box.scrollTop = box.scrollHeight;
  if (S.view !== 'home' && !$('#chat-panel').classList.contains('open') && window.innerWidth <= 900) {
    S.unread++;
    const b = $('#chat-unread');
    b.textContent = S.unread;
    b.classList.remove('hidden');
  }
  if (big) floater(m.text.trim());
}

/* ------------------------------- Stream -------------------------------- */

function openStream() {
  if (S.es) S.es.close();
  const es = new EventSource(`/api/stream?room=${encodeURIComponent(S.room)}&token=${encodeURIComponent(S.token)}`);
  S.es = es;
  es.addEventListener('state', (e) => {
    S.state = JSON.parse(e.data);
    if (S.view === 'lobby') renderLobby();
    else if (S.view === 'game') renderGame();
  });
  es.addEventListener('chat', (e) => addChatMsg(JSON.parse(e.data)));
  es.addEventListener('stroke', (e) => onRemoteStroke(JSON.parse(e.data)));
  es.addEventListener('flash', (e) => {
    const d = JSON.parse(e.data);
    const pad = document.querySelector(`.simon-pad[data-c="${d.c}"]`);
    if (pad) {
      pad.classList.add('lit');
      setTimeout(() => pad.classList.remove('lit'), 320);
    }
  });
  es.addEventListener('secret', (e) => {
    S.secret = JSON.parse(e.data);
    if (S.view === 'game' && S.state && S.state.game && S.state.game.type === 'draw') renderGame();
  });
  es.addEventListener('tick', (e) => {
    const t = JSON.parse(e.data);
    const g = S.state && S.state.game;
    if (g && g.id === t.gameId) {
      g.timeLeft = t.timeLeft;
      g.phase = t.phase;
      if (S.view === 'game') updateTimer(g);
    }
  });
  es.addEventListener('toast', (e) => toast(JSON.parse(e.data).text));
}

/* -------------------------------- Init --------------------------------- */

async function boot() {
  const nameInput = $('#name-input');
  nameInput.value = localStorage.getItem('sa_name') || '';

  $('#btn-create').addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Joueur';
    $('#home-error').textContent = '';
    const r = await api('create', { name });
    if (!r.ok) { $('#home-error').textContent = r.error || 'Erreur'; return; }
    enterRoom(r, name);
  });
  $('#btn-join').addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Joueur';
    const code = $('#code-input').value.trim();
    $('#home-error').textContent = '';
    if (!/^\d{4}$/.test(code)) { $('#home-error').textContent = 'Le code fait 4 chiffres.'; return; }
    const r = await api('join', { name, room: code });
    if (!r.ok) { $('#home-error').textContent = r.error || 'Erreur'; return; }
    enterRoom(r, name);
  });
  $('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-create').click(); });

  $('#btn-copy').addEventListener('click', copyCode);
  $('#room-chip').addEventListener('click', copyCode);
  $('#btn-leave').addEventListener('click', async () => {
    await api('leave');
    for (const k of ['sa_token', 'sa_room', 'sa_player']) localStorage.removeItem(k);
    location.reload();
  });
  $('#btn-watch').addEventListener('click', () => { S.lastGameKey = ''; showScreen('game'); });
  $('#btn-back').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
  $('#btn-endgame').addEventListener('click', async () => {
    if (!confirm('Terminer la partie pour tout le monde ?')) return;
    await api('endGame');
  });

  $('#catalog-search').addEventListener('input', (e) => { S.catalogQuery = e.target.value; renderCatalog(); });

  const emojiBar = $('#emoji-bar');
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    b.addEventListener('click', () => api('chat', { text: em }));
    emojiBar.appendChild(b);
  }
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    await api('chat', { text });
  });
  $('#chat-toggle').addEventListener('click', () => {
    $('#chat-panel').classList.add('open');
    S.unread = 0;
    $('#chat-unread').classList.add('hidden');
    const box = $('#chat-messages');
    box.scrollTop = box.scrollHeight;
  });
  $('#chat-close').addEventListener('click', () => $('#chat-panel').classList.remove('open'));

  if (S.token && S.room && S.playerId) {
    const r = await api('reconnect');
    if (r.ok) {
      openStream();
      await ensureCatalog();
      renderChips();
      showScreen('lobby');
      return;
    }
    for (const k of ['sa_token', 'sa_room', 'sa_player']) localStorage.removeItem(k);
  }
  showScreen('home');
}

function enterRoom(r, name) {
  S.token = r.token;
  S.room = r.room;
  S.playerId = r.playerId;
  localStorage.setItem('sa_token', r.token);
  localStorage.setItem('sa_room', r.room);
  localStorage.setItem('sa_player', r.playerId);
  localStorage.setItem('sa_name', name);
  openStream();
  ensureCatalog().then(() => { renderChips(); });
  showScreen('lobby');
}

async function copyCode() {
  if (!S.room) return;
  try {
    await navigator.clipboard.writeText(S.room);
    toast(`Code ${S.room} copié 📋 — partage-le à tes amis !`);
  } catch (e) {
    toast(`Code du salon : ${S.room}`);
  }
}

boot();
