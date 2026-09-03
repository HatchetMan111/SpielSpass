'use strict';
/* E2E + Render: Server in-process, spielt jedes Spiel mit echten Sockets,
   fängt ALLE state-Broadcasts ab und rendert jeden durch tv.js + play.js (jsdom).
   Findet echte "weißer Bildschirm / Room zu"-Bugs mit Server-Daten, nicht Hand-Fixtures. */
process.env.PORT = '8450'; process.env.HOST = '127.0.0.1';
const { server, rooms } = require('../server.js');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const U = 'http://127.0.0.1:8450';
const PUB = path.join(__dirname, '..', 'public');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const emitP = (s, ev, d) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('ACK ' + ev)), 6000);
  const a = (r) => { clearTimeout(t); res(r); };
  if (d === undefined) s.emit(ev, a); else s.emit(ev, d, a);
});

async function main() {
  await new Promise(r => server.listen(8450, '127.0.0.1', r));
  const tv = io(U); const states = [];
  tv.on('state', s => states.push(s));
  await new Promise(r => tv.on('connect', r));
  const { code } = await emitP(tv, 'create-room', { name: 'TV', game: 'quiz', pid: 't1', avatar: '📺' });
  await emitP(tv, 'join-room', { code, name: 'TV', pid: 't1', avatar: '📺' });
  const phones = [];
  for (const nm of ['Anna', 'Ben', 'Caro', 'Dave']) {
    const p = io(U);
    p.on('state', s => states.push(s));
    await new Promise(r => p.on('connect', r));
    await emitP(p, 'join-room', { code, name: nm, pid: 'p' + nm, avatar: '🐼' });
    phones.push(p);
  }
  const P = (i, ev, d) => emitP(phones[i], ev, d);

  // --- Quiz ---
  tv.emit('quiz:start'); await sleep(400);
  phones.forEach(p => p.emit('quiz:answer', { choice: 1 })); await sleep(400);
  tv.emit('quiz:next'); await sleep(400);
  phones[0].emit('quiz:answer', { choice: 2 }); await sleep(300);
  tv.emit('quiz:next'); await sleep(300);
  // --- Schach ---
  tv.emit('select-game', { game: 'chess' }); await sleep(300);
  phones[0].emit('chess:seat', { color: 'w' }); phones[1].emit('chess:seat', { color: 'b' }); await sleep(300);
  await P(0, 'chess:move', { from: 'e2', to: 'e4' }); await sleep(200);
  await P(1, 'chess:move', { from: 'e7', to: 'e5' }); await sleep(200);
  // --- Farbrausch ---
  tv.emit('select-game', { game: 'fr' }); await sleep(300);
  tv.emit('fr:start'); await sleep(400);
  phones.forEach(p => p.emit('fr:hand')); await sleep(300);
  tv.emit('fr:skip'); await sleep(200);
  // --- SLF ---
  tv.emit('select-game', { game: 'slf' }); await sleep(300);
  tv.emit('slf:start'); await sleep(400);
  phones.forEach(p => p.emit('slf:submit', { answers: { Stadt: 'Berlin' } })); await sleep(300);
  tv.emit('slf:stop'); await sleep(300);
  tv.emit('slf:score'); await sleep(300);
  // --- Bingo ---
  tv.emit('select-game', { game: 'bingo' }); await sleep(300);
  tv.emit('bingo:start'); await sleep(300);
  phones.forEach(p => p.emit('bingo:card')); await sleep(300);
  tv.emit('bingo:draw'); tv.emit('bingo:draw'); await sleep(300);
  phones[0].emit('bingo:claim'); await sleep(200);
  // --- Vier ---
  tv.emit('select-game', { game: 'vier' }); await sleep(300);
  phones[0].emit('vier:seat', { color: 'R' }); phones[1].emit('vier:seat', { color: 'Y' }); await sleep(300);
  await P(0, 'vier:drop', { col: 0 }); await P(1, 'vier:drop', { col: 1 });
  await P(0, 'vier:drop', { col: 0 }); await P(1, 'vier:drop', { col: 1 });
  await P(0, 'vier:drop', { col: 0 }); await P(1, 'vier:drop', { col: 1 });
  await P(0, 'vier:drop', { col: 0 }); await sleep(300);
  // --- Wölfe ---
  tv.emit('select-game', { game: 'wolf' }); await sleep(300);
  await emitP(tv, 'wolf:start'); await sleep(400);
  phones.forEach(p => p.emit('wolf:role')); await sleep(300);
  phones.forEach(p => p.emit('wolf:action', { target: phones[0].id })); await sleep(300);
  tv.emit('wolf:endnight'); await sleep(300);
  phones.forEach(p => p.emit('wolf:vote', { target: phones[0].id })); await sleep(300);
  tv.emit('wolf:endday'); await sleep(300);
  // --- Geheimworte ---
  tv.emit('select-game', { game: 'gw' }); await sleep(300);
  await emitP(tv, 'gw:start'); await sleep(400);
  phones[0].emit('gw:seat', { team: 'R' }); phones[1].emit('gw:seat', { team: 'B' }); await sleep(300);
  phones.forEach(p => p.emit('gw:key')); await sleep(300);
  await P(0, 'gw:hint', { word: 'Test', n: 2 }); await sleep(300);
  phones[3].emit('gw:guess', { idx: 0 }); await sleep(300);
  phones[3].emit('gw:pass'); await sleep(200);
  // --- Bluff ---
  tv.emit('select-game', { game: 'bluff' }); await sleep(300);
  await emitP(tv, 'bluff:start'); await sleep(400);
  phones.forEach(p => p.emit('bluff:hand')); await sleep(300);
  for (let i = 0; i < 8; i++) {
    const st = states[states.length - 1];
    const tid = st.bluff && st.bluff.turnId;
    const who = [tv, ...phones].find(x => x.id === tid);
    if (!who || st.bluff.phase === 'done') break;
    await emitP(who, 'bluff:action', { act: 'call' }); await sleep(150);
  }
  // --- Malen ---
  tv.emit('select-game', { game: 'mr' }); await sleep(300);
  await emitP(tv, 'mr:start'); await sleep(400);
  phones.forEach(p => p.emit('mr:word')); await sleep(300);
  phones[0].emit('mr:stroke', { stroke: { c: '#dc2626', pts: [[10, 10], [50, 60]] } }); await sleep(300);
  phones[1].emit('mr:guess', { text: 'Nichts' }); await sleep(200);
  tv.emit('mr:end'); await sleep(300);
  // --- Würfel ---
  tv.emit('select-game', { game: 'wg' }); await sleep(300);
  await emitP(tv, 'wg:start'); await sleep(400);
  await P(0, 'wg:roll'); await sleep(200);
  await P(0, 'wg:hold', { idx: 0 }); await sleep(200);
  await P(0, 'wg:roll'); await sleep(200);
  await P(0, 'wg:score', { cat: 'chance' }); await sleep(300);
  // --- Wortverbot ---
  tv.emit('select-game', { game: 'wv' }); await sleep(300);
  await emitP(tv, 'wv:start'); await sleep(400);
  phones.forEach(p => p.emit('wv:card')); await sleep(300);
  const wvState = states[states.length - 1];
  const expl = [tv, ...phones].find(x => x.id === wvState.wv.explainerId);
  await emitP(expl, 'wv:next', { mode: 'right' }); await sleep(300);
  tv.emit('wv:endturn'); await sleep(300);
  // --- Kick + Offline-Zustände ---
  await emitP(tv, 'host:kick', { playerId: phones[3].id }); await sleep(300);
  phones[2].io.engine.close(); await sleep(700); // offline-Punkt
  const re = await emitP(io(U), 'join-room', { code, name: 'Caro', pid: 'pCaro', avatar: '🐼' }); await sleep(300);

  // ------- Alle gefangenen States durch Renderer -------
  const htmlIds = '<div id="code"></div><div id="url"></div><canvas id="qr"></canvas><span id="pcount"></span><div id="chips"></div><div id="picker"></div><div id="stage"></div><div id="players"></div><div id="g"></div><div id="who"></div><div id="joinBox"></div><div id="joinerr"></div><div id="avrow"></div><input id="codein"/><input id="name"/><div id="metag"></div><div id="connBox"></div><div id="kickBox"></div><div id="game"></div>';
  const srcTv = fs.readFileSync(path.join(PUB, 'tv.js'), 'utf8');
  const srcPlay = fs.readFileSync(path.join(PUB, 'play.js'), 'utf8');
  const shim = 'const __loc={search:"?room=AB12",origin:"http://x",host:"x",href:"http://x/tv?room=AB12"};';
  const patch = (s) => shim + s
    .replace(/\blocation\.search\b/g, '__loc.search')
    .replace(/\blocation\.origin\b/g, '__loc.origin')
    .replace(/\blocation\.host\b/g, '__loc.host')
    .replace(/\blocation\.href\b/g, '__loc.href');

  let fail = 0, checked = 0;
  const renderOne = (file, src, sockId, st, idx) => {
    const dom = new JSDOM(htmlIds, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://x/play?room=AB12' });
    const w = dom.window;
    w.io = () => ({ on() {}, emit() {}, id: sockId, close() {} });
    w.history = { replaceState() {} };
    w.navigator = { vibrate() {} };
    try {
      w.eval(patch(src));
      w.eval(`S=${JSON.stringify(JSON.stringify(st))}; S=JSON.parse(S); render();`);
      const stage = w.document.getElementById(file === 'tv.js' ? 'stage' : 'game');
      const out = stage ? stage.innerHTML : '';
      if (/undefined|\[object Object\]|NaN/.test(out)) {
        console.log('MIST', file, '#' + idx, st.game, (out.match(/.{0,60}(undefined|\[object Object\]|NaN).{0,30}/) || ['?'])[0]);
        fail++;
      }
      checked++;
    } catch (e) {
      console.log('CRASH', file, '#' + idx, st.game, 'sock=' + sockId.slice(0, 8), e.message);
      fail++;
    }
  };
  const uniq = [];
  const seen = new Set();
  for (const st of states) {
    const k = JSON.stringify(st);
    if (!seen.has(k)) { seen.add(k); uniq.push(st); }
  }
  console.log('Abgespielt:', states.length, 'Broadcasts →', uniq.length, 'einzigartige States');
  // TV-Sicht + 2 Phone-Sichten (Anna=phones[0], Ben=phones[1])
  uniq.forEach((st, i) => {
    renderOne('tv.js', srcTv, tv.id, st, i);
    renderOne('play.js', srcPlay, phones[0].id, st, i);
    renderOne('play.js', srcPlay, phones[1].id, st, i);
  });
  console.log(fail ? `FAIL: ${fail} Render-Fehler (von ${checked})` : `OK: ${checked} Render-Pfade sauber (echte Server-States)`);
  [tv, ...phones, re].forEach(x => { try { x.close(); } catch (e) {} });
  server.close();
  console.log('DONE-EXIT');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log('E2E-FAIL:', e.message); process.exit(1); });
