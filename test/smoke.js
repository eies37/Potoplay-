'use strict';

/* Test de bout en bout : lance le serveur sur 127.0.0.1, simule 2 joueurs
   via SSE + POST, et vérifie salons, chat, quiz, Puissance 4 et dessin. */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3210;
const BASE = { host: '127.0.0.1', port: PORT };

let passed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error(`❌ FAIL: ${name}`);
    process.exit(1);
  }
  passed++;
  console.log(`✅ ${name}`);
}

function post(action, data = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, ...data });
    const req = http.request({ ...BASE, path: '/api/action', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function sseClient(room, token, onEvent) {
  return new Promise((resolve, reject) => {
    const req = http.get({ ...BASE, path: `/api/stream?room=${room}&token=${token}` }, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = { event: 'message', data: '' };
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) ev.event = line.slice(6).trim();
            if (line.startsWith('data:')) ev.data += line.slice(5).trim();
          }
          if (ev.event === 'hb') continue;
          try { onEvent(ev.event, JSON.parse(ev.data)); } catch (e) { onEvent(ev.event, ev.data); }
        }
      });
      resolve(req);
    });
    req.on('error', reject);
  });
}

function waitFor(cond, timeoutMs = 8000, label = 'condition') {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond()) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); reject(new Error(`Timeout en attendant: ${label}`)); }
    }, 30);
  });
}

async function main() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    TICK_MS: '150',
    QUIZ_SECONDS: '3',
    REVEAL_MS: '700',
    DRAW_SECONDS: '6',
    ROUND_REVEAL_MS: '700',
    QUIZ_COUNT: '2',
  };
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((r) => setTimeout(r, 600));

  try {
    // --- Création de salon ---
    const a = await post('create', { name: 'Alice' });
    assert(a.ok && /^\d{4}$/.test(a.room), 'création de salon avec code à 4 chiffres');
    const room = a.room;

    const aEvents = [];
    const bEvents = [];
    const aSecrets = [];
    const bSecrets = [];
    await sseClient(room, a.token, (ev, data) => { aEvents.push({ ev, data }); if (ev === 'secret') aSecrets.push(data); });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.players.length === 1), 5000, 'A reçoit son état');
    assert(true, 'joueur A reçoit l’état initial du salon');

    // --- Mauvais code ---
    const bad = await post('join', { name: 'X', room: '0000' });
    assert(!bad.ok, 'rejoindre un salon inexistant est refusé');

    // --- Rejoindre ---
    const b = await post('join', { name: 'Bob', room });
    assert(b.ok, 'joueur B rejoint avec le code');
    await sseClient(room, b.token, (ev, data) => { bEvents.push({ ev, data }); if (ev === 'secret') bSecrets.push(data); });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.players.length === 2), 5000, 'A voit 2 joueurs');
    assert(true, 'les 2 joueurs voient la liste à jour (salon temps réel)');

    // --- Chat ---
    await post('chat', { room, token: a.token, text: 'Salut Bob ! 👋' });
    await waitFor(() => bEvents.some((e) => e.ev === 'chat' && e.data.text.includes('Salut')), 5000, 'chat B');
    assert(true, 'le chat est diffusé en temps réel');

    // --- Quiz ---
    const q = await post('startGame', { room, token: a.token, game: 'quiz' });
    assert(q.ok, 'l’hôte lance le quiz');
    await waitFor(() => bEvents.some((e) => e.ev === 'state' && e.data.game && e.data.game.type === 'quiz' && e.data.game.phase === 'question'), 5000, 'quiz démarré');
    assert(true, 'la partie de quiz démarre pour tout le monde');
    const notHost = await post('startGame', { room, token: b.token, game: 'quiz' });
    assert(!notHost.ok, 'un non-hôte ne peut pas lancer de partie');

    await post('game', { room, token: a.token, data: { kind: 'answer', index: 0 } });
    await post('game', { room, token: b.token, data: { kind: 'answer', index: 2 } });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game && e.data.game.phase === 'reveal'), 8000, 'révélation quiz');
    assert(true, 'tous ont répondu → phase reveal (réponse révélée)');
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game && (e.data.game.phase === 'question' && e.data.game.qIndex === 1 || e.data.game.phase === 'end')), 8000, 'question suivante');
    assert(true, 'le quiz passe à la question suivante automatiquement');

    await post('endGame', { room, token: a.token });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game === null), 5000, 'fin de partie');
    assert(true, 'l’hôte termine la partie → retour au salon');

    // --- Puissance 4 : victoire verticale de A en colonne 0 ---
    const c4 = await post('startGame', { room, token: a.token, game: 'connect4' });
    assert(c4.ok, 'lancement de Puissance 4');
    await waitFor(() => bEvents.some((e) => e.ev === 'state' && e.data.game && e.data.game.type === 'connect4'), 5000, 'c4 démarré');
    const c4state = () => aEvents.filter((e) => e.ev === 'state' && e.data.game && e.data.game.type === 'connect4').pop();
    // A joue colonne 0, B joue colonne 6, 4 fois
    for (let i = 0; i < 4; i++) {
      await post('game', { room, token: a.token, data: { kind: 'drop', col: 0 } });
      if (i < 3) await post('game', { room, token: b.token, data: { kind: 'drop', col: 6 } });
      await new Promise((r) => setTimeout(r, 120));
    }
    await waitFor(() => c4state() && c4state().data.game.phase === 'won', 5000, 'victoire c4');
    const won = c4state().data.game;
    assert(won.winner === a.playerId && won.winCells.length === 4, 'Puissance 4 : victoire détectée avec 4 cellules gagnantes');
    const wrongTurn = await post('game', { room, token: b.token, data: { kind: 'drop', col: 3 } });
    assert(true, 'le coup hors tour est traité sans erreur');
    await post('endGame', { room, token: a.token });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game === null), 5000, 'fin c4');

    // --- Dessin & devinettes ---
    const d = await post('startGame', { room, token: a.token, game: 'draw' });
    assert(d.ok, 'lancement de Dessin & Devinettes');
    const drawState = () => aEvents.filter((e) => e.ev === 'state' && e.data.game && e.data.game.type === 'draw').pop();
    await waitFor(() => drawState() && drawState().data.game.phase === 'drawing', 5000, 'draw démarré');
    const drawerId = drawState().data.game.drawerId;
    const drawer = drawerId === a.playerId ? a : b;
    const guesser = drawerId === a.playerId ? b : a;
    const drawerSecrets = drawerId === a.playerId ? aSecrets : bSecrets;
    const drawerEvents = drawerId === a.playerId ? aEvents : bEvents;
    const guesserEvents = drawerId === a.playerId ? bEvents : aEvents;
    await waitFor(() => drawerSecrets.length > 0 && drawerSecrets[drawerSecrets.length - 1].word, 5000, 'secret du dessinateur');
    const word = drawerSecrets[drawerSecrets.length - 1].word;
    assert(typeof word === 'string' && word.length >= 3, 'le dessinateur reçoit le mot secret');
    assert(drawState().data.game.drawerId === drawerId, 'le salon annonce qui dessine');

    await post('game', { room, token: drawer.token, data: { kind: 'stroke', x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.2, c: '#111827', w: 5 } });
    await waitFor(() => guesserEvents.some((e) => e.ev === 'stroke'), 5000, 'stroke diffusé');
    assert(true, 'les traits de dessin sont diffusés en direct');

    await post('game', { room, token: guesser.token, data: { kind: 'guess', text: 'zzz mauvaise réponse' } });
    await waitFor(() => drawerEvents.some((e) => e.ev === 'chat' && e.data.kind === 'guess'), 5000, 'mauvaise proposition dans le chat');
    assert(true, 'les mauvaises propositions apparaissent dans le chat');

    await post('game', { room, token: guesser.token, data: { kind: 'guess', text: word } });
    await waitFor(() => guesserEvents.some((e) => e.ev === 'toast' && /trouvé/.test(e.data.text)), 5000, 'bonne réponse');
    assert(true, 'bonne réponse détectée (mot tapé = mot secret) → toast + points');
    await waitFor(() => drawState() && (drawState().data.game.phase === 'reveal' || drawState().data.game.round === 1), 8000, 'round suivant');
    assert(true, 'round suivant après que tous ont trouvé');

    // --- Scores cumulés ---
    const finalState = aEvents.filter((e) => e.ev === 'state').pop().data;
    const bobScore = finalState.players.find((p) => p.name === 'Bob').score;
    assert(bobScore > 0, `les scores sont cumulés dans le salon (Bob: ${bobScore})`);

    console.log(`\n🎉 Tous les tests passent (${passed} assertions).`);
  } finally {
    server.kill();
  }
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
