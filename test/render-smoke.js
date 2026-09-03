'use strict';
/* Smoke-Test: Spielt tv.js + play.js Render-Pfade mit echtem DOM (jsdom) durch.
   Findet Render-Crashes (weiße Seite = "geschlossen"), bevor echte Nutzer sie sehen. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const html = (id) => `<!doctype html><html><body>${id === 'tv'
  ? '<div id="code"></div><div id="url"></div><canvas id="qr"></canvas><span id="pcount"></span><div id="chips"></div><div id="picker"></div><div id="stage"></div><div id="players"></div><div id="g"></div><div id="who"></div><div id="joinBox"></div><div id="joinerr"></div><div id="avrow"></div><div id="codein"></div><div id="name"></div><div id="metag"></div><div id="connBox"></div><div id="kickBox"></div><div id="game"></div>'
  : ''}</body></html>`;

function run(file, states, label) {
  const dom = new JSDOM(html('tv'), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://x/tv?room=AB12' });
  const w = dom.window;
  // Location-Properties sind non-configurable -> eigene const Reflets im Script-Prefix injizieren
  w.io = () => ({ on() {}, emit() {}, id: 'sock1', close() {} });
  w.history = { replaceState() {} };
  w.navigator = { vibrate() {} };
  const shim = 'const __loc={search:"?room=AB12",origin:"http://x",host:"x",href:"http://x/tv?room=AB12"};';
  const src = shim + fs.readFileSync(path.join(PUB, file), 'utf8')
    .replace(/\blocation\.search\b/g, '__loc.search')
    .replace(/\blocation\.origin\b/g, '__loc.origin')
    .replace(/\blocation\.host\b/g, '__loc.host')
    .replace(/\blocation\.href\b/g, '__loc.href');
  let fail = 0;
  try { w.eval(src); } catch (e) { console.log('BOOT-FAIL', label, e.message); process.exitCode = 1; return; }
  const s = () => w.eval('S');
  const render = () => w.eval('render && render()');
  const bannerF = () => w.eval('typeof turnInfo==="function" ? turnInfo() : null');
  let n = 0;
  for (const st of states) {
    n++;
    try {
      w.eval(`S=${JSON.stringify(JSON.stringify(st))}; S=JSON.parse(S); lastGame=S.game;`);
      render();
      if (file === 'play.js' && typeof bannerF === 'function') {
        const ti = bannerF();
        if (ti && typeof ti.text === 'string' && /undefined|\[object/.test(ti.text)) {
          console.log('BANNER-MIST', label, '#' + n, ti.text); fail++;
        }
      }
      const stage = w.document.getElementById(file === 'tv.js' ? 'stage' : 'game');
      if (stage && /undefined|\[object Object\]|null/.test(stage.innerHTML)) {
        console.log('RENDER-MIST', label, '#' + n, (stage.innerHTML.match(/.{0,60}(undefined|\[object Object\]).{0,30}/) || ['?'])[0]); fail++;
      }
    } catch (e) {
      console.log('RENDER-CRASH', label, '#' + n, st.game, e.message); fail++;
    }
  }
  console.log(fail ? `FAIL ${label}: ${fail}/${n}` : `OK ${label}: ${n} Render-Pfade sauber`);
  if (fail) process.exitCode = 1;
}

// ---- Fixtures: für jedes Spiel problematische Zustaende ----
const players = [
  { id: 'sock1', name: 'Ich', avatar: '🦊', online: true },
  { id: 'p2', name: 'Zwei', avatar: '🐼', online: true },
  { id: 'sockHost', name: 'TV', avatar: '📺', online: true },
];
const base = { code: 'AB12', game: 'quiz', hostId: 'sockHost', players };
const quizStates = [
  { ...base, game: 'quiz', quiz: null },
  { ...base, game: 'quiz', quiz: { qIndex: 0, total: 10, scores: {}, phase: 'lobby', current: null, lastResult: null } },
  { ...base, game: 'quiz', quiz: { qIndex: 0, total: 10, scores: {}, phase: 'question', current: { q: 'Frage?', choices: ['a', 'b'] }, lastResult: null, answered: 1, needed: 2, haveAnswered: { p2: true } } },
  { ...base, game: 'quiz', quiz: { qIndex: 2, total: 10, scores: { p2: 100 }, phase: 'reveal', current: null, lastResult: { correct: 1, correctText: 'b', question: 'Frage?', detail: [{ name: 'Zwei', ok: true }] } } },
  { ...base, game: 'quiz', quiz: { qIndex: 10, total: 10, scores: { p2: 100 }, phase: 'done', current: null, lastResult: null } },
];
const chessB = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
const chessStates = [
  { ...base, game: 'chess', chess: null },
  { ...base, game: 'chess', chess: { board: chessB, turn: 'w', history: [], white: null, black: null, whiteId: null, blackId: null, whiteOnline: true, blackOnline: false, legal: {}, lastMove: null } },
  { ...base, game: 'chess', chess: { board: chessB, turn: 'b', history: ['e2-e4'], white: 'Ich', black: 'Zwei', whiteId: 'sock1', blackId: 'p2', whiteOnline: true, blackOnline: true, legal: { e7: ['e5', 'e6'] }, lastMove: { from: 'e2', to: 'e4' } } },
];
const frStates = [
  { ...base, game: 'fr', fr: null },
  { ...base, game: 'fr', fr: { top: { color: 'R', value: '5' }, color: 'R', turn: 'Ich', turnId: 'sock1', turnOnline: true, counts: [{ name: 'Ich', n: 5 }, { name: 'Zwei', n: 3 }], winner: null } },
  { ...base, game: 'fr', fr: { top: { color: 'W', value: '+4' }, color: 'B', turn: 'Zwei', turnId: 'p2', turnOnline: false, counts: [], winner: 'Ich' } },
];
const slfStates = [
  { ...base, game: 'slf', slf: null },
  { ...base, game: 'slf', slf: { cats: ['Stadt', 'Land'], letter: 'B', round: 1, phase: 'write', scores: {}, progress: {}, answers: null, valid: null } },
  { ...base, game: 'slf', slf: { cats: ['Stadt'], letter: 'B', round: 1, phase: 'reveal', scores: {}, progress: { p2: 1 }, answers: { p2: { Stadt: 'Berlin' } }, valid: { p2: { Stadt: true } } } },
  { ...base, game: 'slf', slf: { cats: ['Stadt'], letter: 'B', round: 2, phase: 'done', scores: { p2: 20 }, progress: {}, answers: { p2: { Stadt: 'Bonn' } }, valid: {} } },
];
const bingoStates = [
  { ...base, game: 'bingo', bingo: null },
  { ...base, game: 'bingo', bingo: { drawn: [1, 2], current: 2, total: 75, phase: 'play', winner: null, players: ['Ich'] } },
  { ...base, game: 'bingo', bingo: { drawn: [], current: null, total: 75, phase: 'done', winner: 'Zwei', players: ['Ich', 'Zwei'] } },
];
const vierB = Array.from({ length: 6 }, () => Array(7).fill(null));
const vierStates = [
  { ...base, game: 'vier', vier: null },
  { ...base, game: 'vier', vier: { board: vierB, turn: 'R', winner: null, r: 'Ich', y: 'Zwei', rId: 'sock1', yId: 'p2', rOnline: true, yOnline: false } },
  { ...base, game: 'vier', vier: { board: vierB, turn: 'Y', winner: 'draw', r: null, y: null, rId: null, yId: null, rOnline: true, yOnline: true } },
];
const wolfStates = [
  { ...base, game: 'wolf', wolf: null },
  { ...base, game: 'wolf', wolf: { phase: 'night', alive: [{ id: 'sock1', name: 'Ich', alive: true }, { id: 'p2', name: 'Zwei', alive: false }], log: ['x'], winner: null, dayVotes: null } },
  { ...base, game: 'wolf', wolf: { phase: 'day', alive: [{ id: 'sock1', name: 'Ich', alive: true }, { id: 'p2', name: 'Zwei', alive: true }], log: [], winner: null, dayVotes: { p2: 'sock1' } } },
  { ...base, game: 'wolf', wolf: { phase: 'done', alive: [], log: [], winner: 'Wölfe', dayVotes: null } },
];
const gwStates = [
  { ...base, game: 'gw', gw: null },
  { ...base, game: 'gw', gw: { words: ['a', 'b'], revealed: [null, 'R'], turn: 'R', phase: 'hint', hint: null, leftR: 9, leftB: 8, winner: null, log: [], chefR: null, chefB: 'Zwei' } },
  { ...base, game: 'gw', gw: { words: ['a'], revealed: ['A'], turn: 'B', phase: 'done', hint: { word: 'x', n: 2 }, leftR: 0, leftB: 3, winner: 'R', log: [], chefR: 'Ich', chefB: null } },
];
const bluffStates = [
  { ...base, game: 'bluff', bluff: null },
  { ...base, game: 'bluff', bluff: { community: [], pot: 0, phase: 'preflop', turnId: 'sock1', turn: 'Ich', players: [{ id: 'sock1', name: 'Ich', chips: 100, folded: false, paid: 0 }], dealer: 'Ich', winners: [], winDesc: null, log: [] } },
  { ...base, game: 'bluff', bluff: { community: [{ r: 'A', s: 'h' }], pot: 30, phase: 'river', turnId: null, turn: null, players: [{ id: 'sock1', name: 'Ich', chips: 0, folded: true, paid: 10 }], dealer: 'Ich', winners: ['Zwei'], winDesc: 'Paar', log: [] } },
];
const mrStates = [
  { ...base, game: 'mr', mr: null },
  { ...base, game: 'mr', mr: { drawerId: 'sock1', drawer: 'Ich', wordLen: 5, strokes: [], phase: 'draw', round: 1, guessed: [], logExtra: null, scores: {} } },
  { ...base, game: 'mr', mr: { drawerId: 'p2', drawer: 'Zwei', wordLen: 5, strokes: [{ c: '#111', w: 4, pts: [[1, 1], [2, 2]] }], phase: 'done', round: 1, guessed: ['Ich'], logExtra: 'Zeit um! Das Wort war „Haus“.', scores: { sock1: 100 } } },
];
const wgStates = [
  { ...base, game: 'wg', wg: null },
  { ...base, game: 'wg', wg: { order: ['sock1', 'p2'], turnId: 'sock1', turn: 'Ich', dice: [1, 2, 3, 4, 5], held: [false, true, false, false, false], rollsLeft: 2, sheets: { sock1: { ones: null }, p2: { ones: 3 } }, totals: { sock1: { sub: 0, bonus: 0, total: 0 }, p2: { sub: 3, bonus: 0, total: 3 } }, done: false, winners: [] } },
  { ...base, game: 'wg', wg: { order: ['sock1'], turnId: null, turn: null, dice: [6, 6, 6, 6, 6], held: [], rollsLeft: 0, sheets: { sock1: { ones: 1 } }, totals: { sock1: { sub: 1, bonus: 0, total: 1 } }, done: true, winners: ['Ich'] } },
];
const wvStates = [
  { ...base, game: 'wv', wv: null },
  { ...base, game: 'wv', wv: { teams: { A: ['Ich', 'Zwei'], B: [] }, explTeam: 'A', explainer: 'Ich', explainerId: 'sock1', scores: { A: 1, B: 0 }, left: 100, lastResult: 'ok' } },
  { ...base, game: 'wv', wv: { teams: { A: [], B: ['Zwei'] }, explTeam: 'B', explainer: 'Zwei', explainerId: 'p2', scores: { A: 0, B: 0 }, left: 0, lastResult: null } },
];

const all = [...quizStates, ...chessStates, ...frStates, ...slfStates, ...bingoStates, ...vierStates, ...wolfStates, ...gwStates, ...bluffStates, ...mrStates, ...wgStates, ...wvStates];
run('tv.js', all, 'TV');
run('play.js', all, 'PHONE');
