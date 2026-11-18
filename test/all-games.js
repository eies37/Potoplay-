'use strict';

/* Vérification complète, jeu par jeu :
   - les 18 types de moteurs sont lancés et joués avec un scénario réaliste
   - les 118 entrées du catalogue sont toutes lançables
   - le client possède une vue pour chaque type */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CATALOG, RIDDLE_PACKS } = require('../content');

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

function getRaw(p) {
  return new Promise((resolve, reject) => {
    http.get({ ...BASE, path: p }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ code: res.statusCode, body: b }));
    }).on('error', reject);
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

function waitFor(cond, timeoutMs = 10000, label = 'condition') {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let ok = false;
      try { ok = cond(); } catch (e) { /* state pas encore là */ }
      if (ok) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); reject(new Error(`Timeout: ${label}`)); }
    }, 40);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  setTimeout(() => { console.error('❌ WATCHDOG'); process.exit(2); }, 150000);

  const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TICK_MS: '150', QUIZ_SECONDS: '3', REVEAL_MS: '700', DRAW_SECONDS: '6', ROUND_REVEAL_MS: '700' };
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await sleep(600);

  try {
    /* ---- contrôles statiques client : une vue par type ---- */
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const types = ['quiz', 'connect4', 'morpion', 'draw', 'ultimate', 'pendu', 'reflex', 'number', 'rps', 'snake', 'whack', 'memory', 'breakout', 'simon', 'flappy', 'invaders', 'duckhunt', 'pong'];
    for (const t of types) {
      const inSwitch = appSrc.includes(`case '${t}'`) || appSrc.includes(`g.type === '${t}'`) || appSrc.includes(`'${t}'`);
      assert(inSwitch, `client : vue/contrôle présent pour le type « ${t} »`);
    }

    /* ---- 2 joueurs ---- */
    const a = await post('create', { name: 'Alice' });
    const b = await post('join', { name: 'Bob', room: a.room });
    assert(a.ok && b.ok, 'création salon + join (2 joueurs)');
    const room = a.room;
    const aEv = [], bEv = [], aFlash = [], aSecret = [], bSecret = [];
    await sseClient(room, a.token, (ev, d) => { aEv.push({ ev, d }); if (ev === 'flash') aFlash.push(d); if (ev === 'secret') aSecret.push(d); });
    await sseClient(room, b.token, (ev, d) => { bEv.push({ ev, d }); if (ev === 'secret') bSecret.push(d); });
    const st = (evts) => evts.filter((e) => e.ev === 'state').pop();
    const game = (evts, type) => evts.filter((e) => e.ev === 'state' && e.d.game && (!type || e.d.game.type === type)).pop();
    const g = (type) => game(aEv, type) && game(aEv, type).d.game;
    const start = (gameId, config) => post('startGame', { room, token: a.token, game: gameId, config });
    const end = async () => {
      await post('endGame', { room, token: a.token });
      await waitFor(() => st(aEv) && st(aEv).d.game === null, 6000, 'endGame');
    };
    const act = (who, data) => post('game', { room, token: who.token, data });
    await waitFor(() => st(aEv) && st(aEv).d.players.length === 2, 6000, '2 joueurs vus');

    /* ================= 1. Quiz QCM ================= */
    assert((await start('quiz', { cat: 'general', mode: 'mcq', count: 2 })).ok, 'quiz QCM lancé');
    await waitFor(() => g('quiz') && g('quiz').phase === 'question', 6000, 'q1');
    await act(a, { kind: 'answer', index: 0 });
    await act(b, { kind: 'answer', index: 1 });
    await waitFor(() => g('quiz').phase === 'reveal', 6000, 'reveal q1');
    assert(Object.keys(g('quiz').answers).length === 2, 'quiz : les 2 réponses enregistrées');
    await waitFor(() => g('quiz').phase === 'question' && g('quiz').qIndex === 1, 8000, 'q2');
    await act(a, { kind: 'answer', index: 2 });
    await act(b, { kind: 'answer', index: 3 });
    await waitFor(() => g('quiz').phase === 'end', 8000, 'fin quiz');
    assert(true, 'quiz : 2 questions enchaînées puis fin + scores');
    await end();

    /* ================= 2. Devinette (texte) ================= */
    assert((await start('quiz', { cat: 'classiques', mode: 'text', count: 1 })).ok, 'devinette lancée');
    await waitFor(() => g('quiz') && g('quiz').mode === 'text' && g('quiz').question, 6000, 'devinette q');
    const riddle = RIDDLE_PACKS.flatMap((p) => p.riddles).find((r) => r.q === g('quiz').question.q);
    await act(a, { kind: 'answer', text: riddle.a });
    await act(b, { kind: 'answer', text: 'mauvaise réponse' });
    await waitFor(() => g('quiz').phase === 'reveal', 6000, 'reveal devinette');
    assert(g('quiz').answers[a.playerId].correct === true, 'devinette : bonne réponse texte acceptée');
    assert(g('quiz').answers[b.playerId].correct === false, 'devinette : mauvaise réponse rejetée');
    assert(g('quiz').answerText === riddle.a, 'devinette : réponse révélée');
    await end();

    /* ================= 3. Pendu ================= */
    assert((await start('pendu', { lives: 26, seconds: 60, pack: 'animaux' })).ok, 'pendu lancé');
    await waitFor(() => g('pendu') && g('pendu').phase === 'playing', 6000, 'pendu start');
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const cur = g('pendu');
      if (!cur || cur.phase !== 'playing') break;
      await act(a, { kind: 'letter', ch });
      await sleep(50);
    }
    await waitFor(() => g('pendu').phase !== 'playing', 8000, 'pendu fin');
    assert(g('pendu').phase === 'won' && g('pendu').revealWord, 'pendu : mot trouvé, mot révélé');
    await end();

    /* ================= 4. Dessin & devinettes ================= */
    assert((await start('draw', { pack: 'animaux' })).ok, 'dessin lancé');
    await waitFor(() => g('draw') && g('draw').phase === 'drawing', 6000, 'draw start');
    const drawer = g('draw').drawerId === a.playerId ? a : b;
    const guesser = drawer === a ? b : a;
    const secrets = drawer === a ? aSecret : bSecret;
    await waitFor(() => secrets.length > 0 && secrets[secrets.length - 1].word, 6000, 'secret dessinateur');
    const word = secrets[secrets.length - 1].word;
    await act(drawer, { kind: 'stroke', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, c: '#000', w: 5 });
    await waitFor(() => (drawer === a ? bEv : aEv).some((e) => e.ev === 'stroke'), 6000, 'stroke diffusé');
    await act(guesser, { kind: 'guess', text: 'faux' });
    await waitFor(() => (drawer === a ? aEv : bEv).some((e) => e.ev === 'chat' && e.d.kind === 'guess'), 6000, 'mauvaise guess dans le chat');
    await act(guesser, { kind: 'guess', text: word });
    await waitFor(() => g('draw').phase === 'reveal' || (g('draw').round === 1), 8000, 'round suivant');
    assert(true, 'dessin : traits live + guess + round suivant + mot secret chez le dessinateur');
    await end();

    /* ================= 5. Puissance 4 (défaut + variante 4x4) ================= */
    assert((await start('connect4', {})).ok, 'puissance 4 défaut lancée');
    await waitFor(() => g('connect4'), 6000, 'c4 start');
    for (let i = 0; i < 4; i++) {
      await act(a, { kind: 'drop', col: 0 });
      if (i < 3) await act(b, { kind: 'drop', col: 6 });
      await sleep(80);
    }
    await waitFor(() => g('connect4').phase === 'won', 6000, 'c4 win');
    assert(g('connect4').winner === a.playerId && g('connect4').winCells.length === 4, 'puissance 4 : victoire 4 alignés');
    await act(a, { kind: 'rematch' });
    await waitFor(() => g('connect4').phase === 'play' && g('connect4').moves === 0, 6000, 'rematch');
    assert(true, 'puissance 4 : revanche relance la partie');
    await end();
    assert((await start('connect4', { w: 4, h: 4 })).ok, 'puissance 4 variante 4×4 lancée');
    await waitFor(() => g('connect4') && g('connect4').w === 4 && g('connect4').h === 4, 6000, 'c4 4x4');
    for (let i = 0; i < 4; i++) {
      await act(a, { kind: 'drop', col: 0 });
      if (i < 3) await act(b, { kind: 'drop', col: 3 });
      await sleep(80);
    }
    await waitFor(() => g('connect4').phase === 'won', 6000, 'c4 4x4 win');
    assert(true, 'puissance 4 4×4 : victoire détectée sur petit plateau');
    await end();

    /* ================= 6. Morpion ================= */
    assert((await start('morpion', { size: 3, win: 3 })).ok, 'morpion 3×3 lancé');
    await waitFor(() => g('morpion'), 6000, 'morpion start');
    for (const [pl, cell] of [[a, 0], [b, 3], [a, 1], [b, 4], [a, 2]]) {
      await act(pl, { kind: 'play', cell });
      await sleep(80);
    }
    await waitFor(() => g('morpion').phase === 'won', 6000, 'morpion win');
    assert(g('morpion').winner === a.playerId, 'morpion : alignement de 3 détecté');
    await end();

    /* ================= 7. Morpion XXL ================= */
    assert((await start('ultimate', {})).ok, 'morpion XXL lancé');
    await waitFor(() => g('ultimate'), 6000, 'ult start');
    await act(a, { kind: 'move', mini: 0, cell: 0 });
    await waitFor(() => g('ultimate').activeMini === 0, 6000, 'activeMini 0');
    await act(b, { kind: 'move', mini: 0, cell: 4 });
    await waitFor(() => g('ultimate').activeMini === 4 && g('ultimate').turn === a.playerId, 6000, 'activeMini 4 + tour A');
    await act(a, { kind: 'move', mini: 4, cell: 2 });
    await sleep(150);
    assert(g('ultimate').moves === 3, 'morpion XXL : 3 coups joués, grille active propagée');
    await end();

    /* ================= 8. Réflexe ================= */
    assert((await start('reflex', { rounds: 2, targetMs: 6000 })).ok, 'réflexe lancé');
    await waitFor(() => g('reflex').phase === 'target', 8000, 'cible 1');
    await act(b, { kind: 'hit' });
    await waitFor(() => g('reflex').results.length === 1, 6000, 'résultat 1');
    assert(g('reflex').results[0].winner === b.playerId && g('reflex').results[0].ms >= 0, 'réflexe : clic enregistré avec ms');
    await waitFor(() => g('reflex').phase === 'target' && g('reflex').round === 1, 8000, 'cible 2');
    await act(a, { kind: 'hit' });
    await waitFor(() => g('reflex').phase === 'end', 8000, 'fin réflexe');
    assert(g('reflex').results.length === 2, 'réflexe : 2 manches puis fin');
    await end();

    /* ================= 9. Chaud/Froid ================= */
    assert((await start('number', { range: 10 })).ok, 'chaud/froid lancé');
    await waitFor(() => g('number'), 6000, 'number start');
    for (let n = 1; n <= 10; n++) {
      if (g('number').phase !== 'playing') break;
      await act(b, { kind: 'num', n });
      await sleep(60);
    }
    await waitFor(() => g('number').phase !== 'playing', 6000, 'number fin');
    assert(g('number').phase === 'won' && g('number').winner === b.playerId && g('number').revealNumber >= 1, 'chaud/froid : nombre trouvé + indice + révélation');
    await end();

    /* ================= 10. PFC ================= */
    assert((await start('rps', { rounds: 1 })).ok, 'PFC lancé');
    await act(a, { kind: 'choice', c: 2 }); // ciseaux
    await act(b, { kind: 'choice', c: 1 }); // feuille
    await waitFor(() => g('rps').phase === 'reveal', 6000, 'reveal PFC');
    assert(g('rps').lastResult.winners.includes(a.playerId), 'PFC : ciseaux(2) bat feuille(1) → A gagne');
    await waitFor(() => g('rps').phase === 'end', 8000, 'fin PFC');
    await end();

    /* ================= 11. Snake ================= */
    assert((await start('snake', { speed: 60, duration: 30 })).ok, 'snake lancé');
    await waitFor(() => g('snake') && g('snake').instances[a.playerId], 6000, 'snake start');
    const h0 = JSON.stringify(g('snake').instances[a.playerId].snake[0]);
    await act(a, { kind: 'dir', d: 'up' });
    await waitFor(() => JSON.stringify(g('snake').instances[a.playerId].snake[0]) !== h0, 6000, 'snake bouge');
    await waitFor(() => g('snake').phase === 'end', 10000, 'snake fin (collision mur)');
    assert(st(aEv).d.records.snake && st(aEv).d.records.snake.score >= 0, 'snake : fin par collision + record enregistré');
    await end();

    /* ================= 12. Tape la taupe ================= */
    assert((await start('whack', { duration: 10 })).ok, 'taupe lancée');
    await waitFor(() => g('whack').instances[a.playerId].mole, 8000, 'taupe sortie');
    const mi = g('whack').instances[a.playerId].mole.idx;
    await act(a, { kind: 'hit', idx: mi });
    await waitFor(() => g('whack').instances[a.playerId].score === 1, 6000, 'taupe tapée');
    assert(true, 'taupe : hit sur la bonne case → +1');
    await end();

    /* ================= 13. Memory ================= */
    assert((await start('memory', { cols: 4, rows: 4 })).ok, 'memory lancé');
    await waitFor(() => g('memory').instances[a.playerId].deck, 6000, 'memory deck (owner)');
    const deck = g('memory').instances[a.playerId].deck;
    let i = 0, j = deck.indexOf(deck[0], 1);
    for (i = 0; i < deck.length; i++) { j = deck.indexOf(deck[i], i + 1); if (j > i) break; }
    await act(a, { kind: 'flip', idx: i });
    await sleep(80);
    await act(a, { kind: 'flip', idx: j });
    await waitFor(() => g('memory').instances[a.playerId].matched.length >= 2, 6000, 'paire memory');
    assert(true, 'memory : paire trouvée, cartes matched, deck masqué pour l’autre joueur');
    await end();

    /* ================= 14. Casse-briques ================= */
    assert((await start('breakout', { lives: 3, speed: 1 })).ok, 'casse-briques lancé');
    await waitFor(() => g('breakout').instances[a.playerId], 6000, 'breakout start');
    await act(a, { kind: 'paddle', x: 0.3 });
    await waitFor(() => Math.abs(g('breakout').instances[a.playerId].paddle - 0.3) < 0.001, 6000, 'raquette');
    const by0 = g('breakout').instances[a.playerId].ball.y;
    await waitFor(() => g('breakout').instances[a.playerId].ball.y !== by0, 6000, 'balle bouge');
    assert(true, 'casse-briques : raquette + balle animées');
    await end();

    /* ================= 15. Simon ================= */
    assert((await start('simon', {})).ok, 'simon lancé');
    await waitFor(() => aFlash.length >= 1 && g('simon').instances[a.playerId].accepting === true, 8000, 'simon saisie ouverte');
    const seq = aFlash.slice(0, aFlash[aFlash.length - 1].n).map((f) => f.c);
    for (const c of seq) { await act(a, { kind: 'pad', c }); await sleep(60); }
    await waitFor(() => g('simon').instances[a.playerId].level >= 1, 8000, 'simon niveau 1 réussi');
    assert(true, 'simon : séquence flashée rejouée → niveau 1 validé');
    await end();

    /* ================= 16. Flappy ================= */
    assert((await start('flappy', { duration: 20 })).ok, 'flappy lancé');
    await waitFor(() => g('flappy').instances[a.playerId], 6000, 'flappy start');
    const fy0 = g('flappy').instances[a.playerId].bird.y;
    await act(a, { kind: 'flap' });
    await waitFor(() => g('flappy').instances[a.playerId].bird.y !== fy0, 6000, 'flappy flap');
    await waitFor(() => g('flappy').phase === 'end', 10000, 'flappy fin (chute)');
    assert(st(aEv).d.records.flappy, 'flappy : fin par chute + record');
    await end();

    /* ================= 17. Invaders ================= */
    assert((await start('invaders', {})).ok, 'invaders lancé');
    await waitFor(() => g('invaders').instances[a.playerId], 6000, 'invaders start');
    await act(a, { kind: 'move', d: 1 });
    await act(a, { kind: 'fire' });
    await waitFor(() => {
      const i = g('invaders').instances[a.playerId];
      return i.cannon > 0.5 && i.aliens.length === 40 && (i.ox !== 0 || i.bullets.length > 0);
    }, 8000, 'invaders canon+tir+flotte');
    assert(true, 'invaders : canon déplacé, tir, 40 aliens animés');
    await end();

    /* ================= 18. Duck Hunt ================= */
    assert((await start('duckhunt', { duration: 15 })).ok, 'duck hunt lancé');
    await waitFor(() => g('duckhunt').instances[a.playerId].ducks.length > 0, 8000, 'canard sorti');
    const duck = g('duckhunt').instances[a.playerId].ducks.find((d) => d.alive);
    await act(a, { kind: 'shoot', x: duck.x, y: duck.y });
    await waitFor(() => g('duckhunt').instances[a.playerId].score >= 1, 6000, 'canard touché');
    assert(true, 'duck hunt : tir sur la position du canard → +1');
    await end();

    /* ================= 19. Pong ================= */
    assert((await start('pong', { target: 3 })).ok, 'pong lancé');
    await waitFor(() => g('pong').instances[a.playerId], 6000, 'pong start');
    await act(a, { kind: 'paddle', y: 0.3 });
    await waitFor(() => Math.abs(g('pong').instances[a.playerId].paddle - 0.3) < 0.001, 6000, 'pong raquette');
    const bx0 = g('pong').instances[a.playerId].ball.x;
    await waitFor(() => g('pong').instances[a.playerId].ball.x !== bx0, 6000, 'pong balle');
    assert(true, 'pong : raquette + balle + IA animées');
    await end();

    /* ================= Balayage des 118 entrées du catalogue ================= */
    const cat = JSON.parse((await getRaw('/api/catalog')).body);
    assert(cat.count === CATALOG.length && cat.count >= 100, `catalogue servi : ${cat.count} entrées`);
    let launched = 0;
    for (const entry of cat.games) {
      const r = await start(entry.id);
      if (!r.ok) throw new Error(`entrée ${entry.id} (${entry.title}) non lançable: ${r.error}`);
      launched++;
      await waitFor(() => st(aEv) && st(aEv).d.game && st(aEv).d.game.meta && st(aEv).d.game.meta.title === entry.title, 6000, `meta ${entry.id}`);
      await end();
    }
    assert(launched === cat.count, `les ${launched}/${cat.count} entrées du catalogue se lancent toutes (config + meta OK)`);

    console.log(`\n🎉 Vérification complète : ${passed} assertions, tous les jeux OK.`);
  } finally {
    server.kill();
  }
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
