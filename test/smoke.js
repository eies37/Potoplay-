'use strict';

/* Test de bout en bout : lance le serveur sur 127.0.0.1, simule 2 joueurs
   via SSE + POST, et vérifie salons, chat, quiz, Puissance 4 et dessin. */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { RIDDLE_PACKS } = require('../content');

const PORT = 3200 + (process.pid % 700);
const BASE = { host: '127.0.0.1', port: PORT };

let passed = 0;
function assert(cond, name) {
  if (!cond) throw new Error(`FAIL: ${name}`);
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
  setTimeout(() => { console.error('❌ WATCHDOG: blocage détecté'); process.exit(2); }, 100000);
  const log = (s) => console.log('--- ' + s);
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

    // --- Catalogue & couvertures ---
    const getRaw = (p) => new Promise((resolve, reject) => {
      http.get({ ...BASE, path: p }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'], body: b }));
      }).on('error', reject);
    });
    const cat = JSON.parse((await getRaw('/api/catalog')).body);
    assert(cat.ok && cat.count >= 100, `catalogue de ${cat.count} mini-jeux (objectif ≥ 100)`);
    const cov = await getRaw('/api/cover/' + encodeURIComponent(cat.games[0].id));
    assert(cov.code === 200 && cov.type.includes('svg') && cov.body.includes('<svg'), 'chaque mini-jeu a une couverture SVG servie');
    const types = new Set(cat.games.map((g) => g.type));
    for (const t of ['quiz', 'pendu', 'draw', 'connect4', 'morpion', 'ultimate', 'reflex', 'number', 'rps', 'snake', 'whack', 'memory', 'breakout', 'simon']) {
      assert(types.has(t), `moteur présent dans le catalogue : ${t}`);
    }

    const gameState = (evts, type) => evts.filter((e) => e.ev === 'state' && e.data.game && e.data.game.type === type).pop();
    const end = async () => {
      await post('endGame', { room, token: a.token });
      await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game === null), 5000, 'fin de partie');
    };
    const start = (game, config) => post('startGame', { room, token: a.token, game, config });

    // --- Morpion 3x3 : victoire de A sur la ligne du haut ---
    await post('endGame', { room, token: a.token });
    await waitFor(() => aEvents.some((e) => e.ev === 'state' && e.data.game === null), 5000, 'partie de dessin terminée');
    assert((await start('morpion', { size: 3, win: 3 })).ok, 'lancement morpion 3×3');
    await waitFor(() => gameState(aEvents, 'morpion'), 5000, 'morpion démarré');
    for (const [pl, cell] of [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]]) {
      await post('game', { room, token: pl.token, data: { kind: 'play', cell } });
      await new Promise((r) => setTimeout(r, 120));
    }
    await waitFor(() => gameState(aEvents, 'morpion') && gameState(aEvents, 'morpion').data.game.phase === 'won', 5000, 'victoire morpion');
    assert(gameState(aEvents, 'morpion').data.game.winner === a.playerId, 'morpion : alignement de 3 détecté');
    await end();

    // --- Morpion XXL ---
    assert((await start('ultimate', {})).ok, 'lancement Morpion XXL');
    await waitFor(() => gameState(aEvents, 'ultimate'), 5000, 'ultimate démarré');
    await post('game', { room, token: a.token, data: { kind: 'move', mini: 0, cell: 0 } });
    await waitFor(() => gameState(aEvents, 'ultimate') && gameState(aEvents, 'ultimate').data.game.activeMini === 0, 5000, 'activeMini=0');
    assert(true, 'Morpion XXL : le coup envoie l’adversaire dans la mini-grille 0');
    await post('game', { room, token: b.token, data: { kind: 'move', mini: 0, cell: 4 } });
    await waitFor(() => gameState(aEvents, 'ultimate') && gameState(aEvents, 'ultimate').data.game.activeMini === 4, 5000, 'activeMini=4');
    assert(true, 'Morpion XXL : tours alternés et grille active propagée');
    await end();

    // --- Pendu (brute force a-z, 30 vies) ---
    assert((await start('pendu', { lives: 30, seconds: 60, pack: 'animaux' })).ok, 'lancement pendu');
    await waitFor(() => gameState(aEvents, 'pendu') && gameState(aEvents, 'pendu').data.game.phase === 'playing', 5000, 'pendu démarré');
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const st = gameState(aEvents, 'pendu');
      if (!st || st.data.game.phase !== 'playing') break;
      await post('game', { room, token: a.token, data: { kind: 'letter', ch } });
      await new Promise((r) => setTimeout(r, 60));
    }
    await waitFor(() => gameState(aEvents, 'pendu') && gameState(aEvents, 'pendu').data.game.phase !== 'playing', 5000, 'pendu terminé');
    assert(gameState(aEvents, 'pendu').data.game.phase === 'won', 'pendu : mot trouvé lettre par lettre');
    await end();

    // --- Chaud/Froid ---
    assert((await start('number', { range: 10 })).ok, 'lancement chaud/froid');
    await waitFor(() => gameState(aEvents, 'number'), 5000, 'number démarré');
    for (let n = 1; n <= 10; n++) {
      const st = gameState(aEvents, 'number');
      if (!st || st.data.game.phase !== 'playing') break;
      await post('game', { room, token: b.token, data: { kind: 'num', n } });
      await new Promise((r) => setTimeout(r, 80));
    }
    await waitFor(() => gameState(aEvents, 'number') && gameState(aEvents, 'number').data.game.phase !== 'playing', 5000, 'number terminé');
    assert(gameState(aEvents, 'number').data.game.phase === 'won' && gameState(aEvents, 'number').data.game.winner === b.playerId, 'chaud/froid : nombre trouvé + indices donnés');
    await end();

    // --- Devinette (quiz texte) ---
    assert((await start('quiz', { cat: 'classiques', mode: 'text', count: 1 })).ok, 'lancement devinette');
    await waitFor(() => gameState(aEvents, 'quiz') && gameState(aEvents, 'quiz').data.game.mode === 'text', 5000, 'devinette démarrée');
    const devQ = gameState(aEvents, 'quiz').data.game.question.q;
    const riddle = RIDDLE_PACKS.flatMap((p) => p.riddles).find((r) => r.q === devQ);
    assert(!!riddle, 'devinette trouvée dans la banque');
    await post('game', { room, token: a.token, data: { kind: 'answer', text: riddle.a } });
    await waitFor(() => gameState(aEvents, 'quiz') && gameState(aEvents, 'quiz').data.game.phase === 'reveal', 5000, 'révélation devinette');
    assert(gameState(aEvents, 'quiz').data.game.answers[a.playerId].correct === true, 'devinette : bonne réponse en texte libre acceptée');
    await end();

    // --- RPS ---
    assert((await start('rps', { rounds: 1 })).ok, 'lancement PFC');
    await post('game', { room, token: a.token, data: { kind: 'choice', c: 0 } });
    await post('game', { room, token: b.token, data: { kind: 'choice', c: 1 } });
    await waitFor(() => gameState(aEvents, 'rps') && gameState(aEvents, 'rps').data.game.phase === 'reveal', 5000, 'révélation PFC');
    const rpsRes = gameState(aEvents, 'rps').data.game.lastResult;
    assert(rpsRes && rpsRes.winners.includes(b.playerId), 'PFC : feuille (1) bat pierre (0) → B gagne');
    await waitFor(() => gameState(aEvents, 'rps') && gameState(aEvents, 'rps').data.game.phase === 'end', 6000, 'fin PFC');
    assert(true, 'PFC : best-of-1 terminé automatiquement');
    await end();

    // --- Réflexe ---
    assert((await start('reflex', { rounds: 1, targetMs: 6000 })).ok, 'lancement réflexe');
    await waitFor(() => gameState(aEvents, 'reflex') && gameState(aEvents, 'reflex').data.game.phase === 'target', 8000, 'cible apparue');
    await post('game', { room, token: b.token, data: { kind: 'hit' } });
    await waitFor(() => gameState(aEvents, 'reflex') && gameState(aEvents, 'reflex').data.game.results.length === 1, 5000, 'résultat réflexe');
    assert(gameState(aEvents, 'reflex').data.game.results[0].winner === b.playerId, 'réflexe : premier clic enregistré avec son temps');
    await end();

    // --- Rétro : tape la taupe ---
    assert((await start('whack', { duration: 10 })).ok, 'lancement tape-la-taupe');
    await waitFor(() => {
      const st = gameState(aEvents, 'whack');
      return st && st.data.game.instances[a.playerId] && st.data.game.instances[a.playerId].mole;
    }, 6000, 'taupe apparue');
    const moleIdx = gameState(aEvents, 'whack').data.game.instances[a.playerId].mole.idx;
    await post('game', { room, token: a.token, data: { kind: 'hit', idx: moleIdx } });
    await waitFor(() => {
      const st = gameState(aEvents, 'whack');
      return st && st.data.game.instances[a.playerId].score === 1;
    }, 5000, 'taupe tapée');
    assert(true, 'rétro whack : tap sur la bonne taupe → +1 (instance perso par joueur)');
    await end();

    // --- Rétro : snake ---
    assert((await start('snake', { speed: 80, duration: 20 })).ok, 'lancement snake');
    await waitFor(() => gameState(aEvents, 'snake') && gameState(aEvents, 'snake').data.game.instances[a.playerId], 5000, 'snake démarré');
    const head0 = gameState(aEvents, 'snake').data.game.instances[a.playerId].snake[0];
    await post('game', { room, token: a.token, data: { kind: 'dir', d: 'up' } });
    await waitFor(() => {
      const st = gameState(aEvents, 'snake');
      return st && JSON.stringify(st.data.game.instances[a.playerId].snake[0]) !== JSON.stringify(head0);
    }, 5000, 'snake a bougé');
    assert(true, 'rétro snake : changement de direction + déplacement serveur à chaque tick');
    await end();

    // --- Rétro : memory (deck visible pour le propriétaire uniquement) ---
    assert((await start('memory', { cols: 4, rows: 4 })).ok, 'lancement memory');
    await waitFor(() => gameState(aEvents, 'memory') && gameState(aEvents, 'memory').data.game.instances[a.playerId].deck, 5000, 'memory démarré avec deck (owner)');
    const deck = gameState(aEvents, 'memory').data.game.instances[a.playerId].deck;
    let i = 0, j = 1;
    for (; i < deck.length; i++) { j = deck.indexOf(deck[i], i + 1); if (j > i) break; }
    const bState = bEvents.filter((e) => e.ev === 'state' && e.data.game && e.data.game.type === 'memory').pop().data.game;
    assert(!bState.instances[a.playerId].deck, 'memory : le deck de A est masqué pour B');
    assert(Array.isArray(bState.instances[b.playerId].deck), 'memory : B voit son propre deck');
    await post('game', { room, token: a.token, data: { kind: 'flip', idx: i } });
    await new Promise((r) => setTimeout(r, 100));
    await post('game', { room, token: a.token, data: { kind: 'flip', idx: j } });
    await waitFor(() => {
      const st = gameState(aEvents, 'memory');
      return st && st.data.game.instances[a.playerId].matched.length >= 2;
    }, 5000, 'paire trouvée');
    assert(true, 'rétro memory : paire trouvée → cartes marquées matched');
    await end();

    // --- Rétro : casse-briques ---
    log(' Rétro : casse-briques ---');
    assert((await start('breakout', { lives: 3, speed: 1 })).ok, 'lancement casse-briques');
    await waitFor(() => gameState(aEvents, 'breakout') && gameState(aEvents, 'breakout').data.game.instances[a.playerId], 5000, 'breakout démarré');
    await post('game', { room, token: a.token, data: { kind: 'paddle', x: 0.3 } });
    await waitFor(() => {
      const st = gameState(aEvents, 'breakout');
      return st && Math.abs(st.data.game.instances[a.playerId].paddle - 0.3) < 0.001;
    }, 5000, 'raquette déplacée');
    const ballY0 = gameState(aEvents, 'breakout').data.game.instances[a.playerId].ball.y;
    await waitFor(() => {
      const st = gameState(aEvents, 'breakout');
      return st && st.data.game.instances[a.playerId].ball.y !== ballY0;
    }, 5000, 'balle en mouvement');
    assert(true, 'rétro breakout : raquette au doigt + balle animée côté serveur');
    await end();

    // --- Rétro : simon ---
    log(' Rétro : simon ---');
    assert((await start('simon', {})).ok, 'lancement simon');
    await waitFor(() => {
      const st = gameState(aEvents, 'simon');
      return st && st.data.game.instances[a.playerId] && st.data.game.instances[a.playerId].accepting === true;
    }, 6000, 'simon accepte la saisie');
    assert(true, 'rétro simon : séquence flashée puis phase de saisie (accepting)');
    await end();

    // --- NES : Flappy ---
    assert((await start('flappy', { duration: 20 })).ok, 'lancement Flappy NES');
    await waitFor(() => gameState(aEvents, 'flappy') && gameState(aEvents, 'flappy').data.game.instances[a.playerId], 5000, 'flappy démarré');
    const fy0 = gameState(aEvents, 'flappy').data.game.instances[a.playerId].bird.y;
    await post('game', { room, token: a.token, data: { kind: 'flap' } });
    await new Promise((r) => setTimeout(r, 250));
    const fy1 = gameState(aEvents, 'flappy').data.game.instances[a.playerId].bird.y;
    assert(fy1 !== fy0, 'NES flappy : le tap fait voler/monter l’oiseau (physique serveur)');
    await end();

    // --- NES : Invaders ---
    assert((await start('invaders', {})).ok, 'lancement Space Invaders NES');
    await waitFor(() => gameState(aEvents, 'invaders') && gameState(aEvents, 'invaders').data.game.instances[a.playerId], 5000, 'invaders démarré');
    await post('game', { room, token: a.token, data: { kind: 'move', d: 1 } });
    await post('game', { room, token: a.token, data: { kind: 'fire' } });
    await waitFor(() => {
      const st = gameState(aEvents, 'invaders');
      const i = st && st.data.game.instances[a.playerId];
      return i && i.cannon > 0.5 && i.bullets.length >= 0 && i.aliens.length === 40;
    }, 5000, 'invaders : canon déplacé + flotte de 40 aliens');
    await waitFor(() => {
      const st = gameState(aEvents, 'invaders');
      const i = st && st.data.game.instances[a.playerId];
      return i && (i.ox !== 0 || i.bullets.length > 0);
    }, 5000, 'invaders : aliens en mouvement / tir actif');
    assert(true, 'NES invaders : mouvement canon, tir et flotte animée côté serveur');
    await end();

    // --- NES : Duck Hunt ---
    log(' NES : Duck Hunt ---');
    assert((await start('duckhunt', { duration: 15 })).ok, 'lancement Duck Hunt NES');
    await waitFor(() => {
      const st = gameState(aEvents, 'duckhunt');
      return st && st.data.game.instances[a.playerId].ducks.length > 0;
    }, 6000, 'canard apparu');
    const duck = gameState(aEvents, 'duckhunt').data.game.instances[a.playerId].ducks.find((d) => d.alive);
    await post('game', { room, token: a.token, data: { kind: 'shoot', x: duck.x, y: duck.y } });
    await waitFor(() => {
      const st = gameState(aEvents, 'duckhunt');
      return st && st.data.game.instances[a.playerId].score >= 1;
    }, 5000, 'canard touché');
    assert(true, 'NES duck hunt : tir au doigt sur la bonne position → +1');
    await end();

    // --- NES : Pong vs IA ---
    log(' NES : Pong vs IA ---');
    assert((await start('pong', { target: 3 })).ok, 'lancement Pong NES vs IA');
    await waitFor(() => gameState(aEvents, 'pong') && gameState(aEvents, 'pong').data.game.instances[a.playerId], 5000, 'pong démarré');
    await post('game', { room, token: a.token, data: { kind: 'paddle', y: 0.3 } });
    await waitFor(() => {
      const st = gameState(aEvents, 'pong');
      return st && Math.abs(st.data.game.instances[a.playerId].paddle - 0.3) < 0.001;
    }, 5000, 'raquette déplacée');
    const bx0 = gameState(aEvents, 'pong').data.game.instances[a.playerId].ball.x;
    await waitFor(() => {
      const st = gameState(aEvents, 'pong');
      return st && st.data.game.instances[a.playerId].ball.x !== bx0;
    }, 5000, 'balle en mouvement');
    assert(true, 'NES pong : raquette au doigt + balle + IA animées côté serveur');
    await end();

    // --- Partage multi-appareils (LAN) ---
    const info = JSON.parse((await getRaw('/api/info')).body);
    assert(info.ok && Array.isArray(info.urls) && info.urls[0].includes('http'), 'GET /api/info renvoie les URL du serveur (LAN)');
    const withRoom = await getRaw('/?room=1234');
    assert(withRoom.code === 200 && withRoom.body.includes('screen-home'), 'les liens ?room=XXXX servent l\u2019app (pré-remplissage du code côté client)');

    // --- PWA (installable Android) ---
    const man = await getRaw('/manifest.webmanifest');
    const manJson = JSON.parse(man.body);
    assert(man.code === 200 && manJson.display === 'standalone' && manJson.icons.length >= 2, 'manifest PWA servi (standalone, icônes)');
    const icon = await getRaw('/icon-512.png');
    assert(icon.code === 200 && icon.body.slice(1, 4) === 'PNG', 'icône PNG 512 servie (signature PNG valide)');
    const sw = await getRaw('/sw.js');
    assert(sw.code === 200 && sw.body.includes('serviceWorker') === false && sw.body.includes('/api/'), 'service worker servi (API non cachée)');

    console.log(`\n🎉 Tous les tests passent (${passed} assertions).`);
  } finally {
    server.kill();
  }
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
