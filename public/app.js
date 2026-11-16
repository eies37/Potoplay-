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
};

const GAMES = [
  { t: 'draw', emoji: '🎨', title: 'Dessin & Devinettes', desc: 'Un joueur dessine, les autres devinent dans le chat. Le plus rapide marque le plus de points !' },
  { t: 'connect4', emoji: '🔴', title: 'Puissance 4', desc: 'Duel en 1v1 : aligne 4 jetons de ta couleur avant ton adversaire.' },
  { t: 'quiz', emoji: '⚡', title: 'Quiz éclair', desc: '5 questions, tout le monde répond en même temps. Rapidité = points bonus.' },
];

const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '😱', '🎉', '❤️', '👏', '🙌'];
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\uFE0F|\u20E3|\s){1,6}$/u;

const DRAW_COLORS = ['#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'];
const CANVAS_W = 900;
const CANVAS_H = 600;

/* --------------------------------- API --------------------------------- */

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

/* ------------------------------ Screens -------------------------------- */

function showScreen(name) {
  S.view = name;
  for (const s of ['home', 'lobby', 'game']) {
    $('#screen-' + s).hidden = s !== name;
  }
  const inRoom = name !== 'home';
  $('#room-chip').classList.toggle('hidden', !inRoom);
  $('#players-count').classList.toggle('hidden', !inRoom);
  if (inRoom && S.state) $('#room-code').textContent = S.state.code;
}

/* ------------------------------- Lobby --------------------------------- */

function renderLobby() {
  const st = S.state;
  if (!st) return;
  $('#lobby-code').textContent = st.code;
  $('#room-code').textContent = st.code;
  $('#players-count-n').textContent = st.players.length;
  $('#lobby-n').textContent = `(${st.players.length})`;

  $('#players-list').innerHTML = '';
  for (const p of st.players) {
    const li = document.createElement('li');
    li.className = 'player-row';
    const initial = (p.name[0] || '?').toUpperCase();
    li.innerHTML = `
      <div class="avatar" style="background:${p.color}">${escapeHtml(initial)}</div>
      <span class="player-name">${escapeHtml(p.name)}${p.id === S.playerId ? ' <span class="muted">(toi)</span>' : ''}${p.host ? ' 👑' : ''}</span>
      <span class="player-meta">
        <span class="score-pill">⭐ ${p.score}</span>
        <span class="dot${p.connected ? '' : ' off'}" title="${p.connected ? 'en ligne' : 'déconnecté'}"></span>
      </span>`;
    $('#players-list').appendChild(li);
  }

  const gc = $('#game-cards');
  const running = $('#game-running');
  if (st.game) {
    gc.classList.add('hidden');
    running.classList.remove('hidden');
  } else {
    gc.classList.remove('hidden');
    running.classList.add('hidden');
    gc.innerHTML = '';
    for (const g of GAMES) {
      const card = document.createElement('div');
      card.className = 'game-card';
      const canStart = isHost();
      card.innerHTML = `
        <span class="game-emoji">${g.emoji}</span>
        <div class="game-info"><b>${g.title}</b><span>${g.desc}</span></div>
        <button class="btn ${canStart ? '' : 'btn-ghost'} btn-sm" ${canStart ? '' : 'disabled'}>
          ${canStart ? 'Lancer ▶' : 'Hôte choisit…'}
        </button>`;
      if (canStart) card.querySelector('button').addEventListener('click', () => startGame(g.t));
      gc.appendChild(card);
    }
  }
}

async function startGame(t) {
  const r = await api('startGame', { game: t });
  if (!r.ok) toast(r.error || 'Impossible de lancer la partie');
  else { S.view = 'game'; showScreen('game'); }
}

/* -------------------------------- Game --------------------------------- */

function gameKey(g) {
  return JSON.stringify([g.id, g.type, g.phase, g.turn, g.qIndex, g.round, g.winner, g.moves, g.correctCount, Object.keys(g.answers || {}).length, (g.board || []).join('')]);
}

function renderGame() {
  const g = S.state && S.state.game;
  if (!g) { showScreen('lobby'); renderLobby(); return; }
  $('#game-title').textContent = GAMES.find((x) => x.t === g.type).emoji + ' ' + GAMES.find((x) => x.t === g.type).title;
  $('#btn-endgame').classList.toggle('hidden', !isHost());
  const timed = g.type === 'quiz' || g.type === 'draw';
  $('#timer-bar').classList.toggle('hidden', !timed || g.phase === 'end');

  const key = gameKey(g);
  if (key !== S.lastGameKey) {
    S.lastGameKey = key;
    const area = $('#game-area');
    area.innerHTML = '';
    if (g.type === 'quiz') area.appendChild(quizView(g));
    else if (g.type === 'connect4') area.appendChild(c4View(g));
    else if (g.type === 'draw') area.appendChild(drawView(g));
  }
  updateTimer(g);
  if (g.type === 'quiz') updateQuiz(g);
  else if (g.type === 'connect4') updateC4(g);
}

function updateTimer(g) {
  const total = g.totalTime || 1;
  const pct = Math.max(0, Math.min(100, (g.timeLeft / total) * 100));
  $('#timer-fill').style.width = pct + '%';
  $('#timer-text').textContent = g.phase === 'end' ? '' : `⏱ ${g.timeLeft}s`;
}

/* -------------------------------- Quiz --------------------------------- */

function quizView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'quiz-card card';
  if (g.phase === 'end') {
    const ranked = [...S.state.players].sort((a, b) => b.score - a.score);
    wrap.innerHTML = `
      <div class="end-podium">
        <h2>🏁 Résultats du quiz</h2>
        <p class="muted">Scores cumulés du salon</p>
        <div class="podium">
          ${ranked.map((p, i) => `
            <div class="podium-row ${i === 0 ? 'first' : ''}">
              <span class="podium-rank">${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</span>
              <div class="avatar" style="background:${p.color}">${escapeHtml((p.name[0] || '?').toUpperCase())}</div>
              <span class="player-name">${escapeHtml(p.name)}</span>
              <span class="score-pill" style="margin-left:auto">⭐ ${p.score}</span>
            </div>`).join('')}
        </div>
        <button class="btn" id="quiz-back">Retour au salon</button>
      </div>`;
    wrap.querySelector('#quiz-back').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
    return wrap;
  }
  wrap.innerHTML = `
    <div class="quiz-progress">Question ${g.qIndex + 1} / ${g.total} ${g.phase === 'reveal' ? '— réponse révélée' : ''}</div>
    <div class="quiz-q"></div>
    <div class="quiz-options"></div>
    <div class="quiz-answers"></div>`;
  const qEl = wrap.querySelector('.quiz-q');
  qEl.textContent = g.question ? g.question.q : '';
  const opts = wrap.querySelector('.quiz-options');
  const myAnswer = g.answers[S.playerId];
  (g.question ? g.question.options : []).forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'opt-btn';
    b.textContent = opt;
    if (g.phase === 'reveal' || g.phase === 'end') {
      b.disabled = true;
      if (g.answerIndex === i) b.classList.add('correct');
      else if (myAnswer && myAnswer.index === i && myAnswer.correct === false) b.classList.add('wrong');
    }
    if (g.phase === 'question' && myAnswer && myAnswer.index === i) b.classList.add('picked');
    if (g.phase === 'question') {
      b.disabled = !!myAnswer;
      b.addEventListener('click', async () => {
        const r = await api('game', { data: { kind: 'answer', index: i } });
        if (!r.ok) toast(r.error || 'Erreur');
      });
    }
    opts.appendChild(b);
  });
  return wrap;
}

function updateQuiz(g) {
  if (g.phase === 'end') return;
  const area = $('#game-area');
  const reveal = g.phase === 'reveal';
  const answersEl = area.querySelector('.quiz-answers');
  if (answersEl) {
    answersEl.innerHTML = '';
    for (const p of S.state.players) {
      const a = g.answers[p.id];
      if (!a) continue;
      const span = document.createElement('span');
      span.className = 'qa ' + (reveal ? (a.correct ? 'ok' : 'no') : '');
      span.textContent = reveal
        ? `${p.name} ${a.correct ? '✅ +' + a.points : '❌'}`
        : `${p.name} a répondu ✓`;
      answersEl.appendChild(span);
    }
  }
}

/* ------------------------------ Connect 4 ------------------------------- */

function c4View(g) {
  const wrap = document.createElement('div');
  wrap.className = 'c4-wrap';
  wrap.innerHTML = `
    <div class="c4-status"></div>
    <div class="c4-board"></div>
    <div class="c4-actions"></div>`;
  const board = wrap.querySelector('.c4-board');
  for (let c = 0; c < 7; c++) {
    const col = document.createElement('div');
    col.className = 'c4-col';
    col.dataset.col = c;
    for (let r = 0; r < 6; r++) {
      const cell = document.createElement('div');
      cell.className = 'c4-cell';
      cell.dataset.idx = r * 7 + c;
      col.appendChild(cell);
    }
    col.addEventListener('click', () => c4Play(c));
    board.appendChild(col);
  }
  return wrap;
}

async function c4Play(col) {
  const r = await api('game', { data: { kind: 'drop', col } });
  if (!r.ok && r.error) toast(r.error);
}

function updateC4(g) {
  const area = $('#game-area');
  if (!area || !S.state.game || S.state.game.type !== 'connect4') return;
  const status = area.querySelector('.c4-status');
  const actions = area.querySelector('.c4-actions');
  const p1 = playerById(g.players[0]);
  const p2 = playerById(g.players[1]);
  if (g.phase === 'won') {
    const w = playerById(g.winner);
    status.innerHTML = `🏆 <b style="color:${w ? w.color : '#fff'}">${escapeHtml(w ? w.name : '?')}</b> gagne la partie ! +200 ⭐`;
  } else if (g.phase === 'draw') {
    status.textContent = '🤝 Match nul !';
  } else {
    const t = playerById(g.turn);
    const mine = g.turn === S.playerId;
    status.innerHTML = mine
      ? `🎯 <b>À toi de jouer !</b> (jeton <span style="color:${me().color}">●</span>)`
      : `⏳ Au tour de <b style="color:${t ? t.color : '#fff'}">${escapeHtml(t ? t.name : '?')}</b>`;
  }
  const colors = { 1: p1 ? p1.color : '#f87171', 2: p2 ? p2.color : '#facc15' };
  area.querySelectorAll('.c4-cell').forEach((cell) => {
    const v = g.board[+cell.dataset.idx];
    cell.className = 'c4-cell' + (v ? ' p' + v : '');
    if (v) cell.style.background = colors[v];
    if (g.winCells && g.winCells.includes(+cell.dataset.idx)) cell.classList.add('win');
  });
  area.querySelectorAll('.c4-col').forEach((col) => {
    col.classList.toggle('blocked', g.phase !== 'play' || !g.players.includes(S.playerId) || g.turn !== S.playerId);
  });
  actions.innerHTML = '';
  if ((g.phase === 'won' || g.phase === 'draw') && g.players.includes(S.playerId)) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '🔁 Revanche';
    b.addEventListener('click', () => api('game', { data: { kind: 'rematch' } }));
    actions.appendChild(b);
  }
}

/* ------------------------------ Draw & guess ----------------------------- */

let drawState = { drawing: false, last: null, color: '#111827', size: 5, pending: [], sendTimer: null };

function drawView(g) {
  const wrap = document.createElement('div');
  wrap.className = 'draw-wrap';
  const iAmDrawer = g.drawerId === S.playerId && g.phase === 'drawing';
  const word = iAmDrawer && S.secret ? S.secret.word : (g.revealWord || null);

  const wordHtml = g.phase === 'drawing'
    ? (iAmDrawer
        ? `<span class="muted">Mot à dessiner :</span> <span class="draw-word">${escapeHtml((S.secret && S.secret.word) || '…')}</span>`
        : `<span class="muted">Devine le mot</span> <span class="draw-word masked">${'• '.repeat(g.wordLength).trim()}</span> <span class="muted">(${g.wordLength} lettres) — ${g.correctCount} trouvé(s)</span>`)
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
      if (S.state.game.drawerId !== S.playerId) return;
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
  if (!drawState.sendTimer) {
    drawState.sendTimer = setTimeout(flushStrokes, 40);
  }
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
  es.addEventListener('secret', (e) => {
    S.secret = JSON.parse(e.data);
    if (S.view === 'game' && S.state && S.state.game && S.state.game.type === 'draw') {
      S.lastGameKey = '';
      renderGame();
    }
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
  es.onerror = () => { /* EventSource se reconnecte automatiquement */ };
}

/* -------------------------------- Init --------------------------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_room');
    localStorage.removeItem('sa_player');
    location.reload();
  });
  $('#btn-watch').addEventListener('click', () => { S.view = 'game'; showScreen('game'); renderGame(); });
  $('#btn-back').addEventListener('click', () => { showScreen('lobby'); renderLobby(); });
  $('#btn-endgame').addEventListener('click', async () => {
    if (!confirm('Terminer la partie pour tout le monde ?')) return;
    await api('endGame');
  });

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
      showScreen('lobby');
      return;
    }
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_room');
    localStorage.removeItem('sa_player');
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
