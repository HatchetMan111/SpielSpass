'use strict';
/* PartyPlay – lokaler Party-Server: TV = Host, Handys = Player. Schach / Farbrausch / Quiz. Keine Cloud. */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'partyplay', time: new Date().toISOString() }));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/api/rooms', (req, res) => res.json({ rooms: [...rooms.keys()] }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- Quiz-Fragen (DE, offline) ----------
const QUIZ = [
  { q: 'Wie viele Felder hat ein Schachbrett?', choices: ['32', '48', '64', '81'], a: 2 },
  { q: 'Welche Farbe beginnt beim Schach?', choices: ['Schwarz', 'Weiß', 'Los entscheidet', 'Beide gleichzeitig'], a: 1 },
  { q: 'Wie viele Karten hat ein Farbrausch-Deck (klassisch)?', choices: ['52', '99', '108', '120'], a: 2 },
  { q: 'Was bedeutet "Schachmatt"?', choices: ['Unentschieden', 'König ist angegriffen und kann nicht entkommen', 'Zeit abgelaufen', 'Figurentausch'], a: 1 },
  { q: 'Welcher Planet ist der Sonne am nächsten?', choices: ['Venus', 'Merkur', 'Mars', 'Erde'], a: 1 },
  { q: 'Wie viele Spieler braucht man mindestens für Farbrausch?', choices: ['1', '2', '4', '6'], a: 1 },
  { q: 'Springer-Zug im Schach?', choices: ['1 gerade + 1 diagonal', 'L-Form: 2+1', 'Nur diagonal', '3 gerade'], a: 1 },
  { q: 'Bundeshauptstadt von Deutschland?', choices: ['Hamburg', 'München', 'Berlin', 'Köln'], a: 2 },
  { q: 'Farbrausch: Was musst du bei letzter Karte rufen?', choices: ['Fertig', 'Farbrausch', 'Letzte', 'Stop'], a: 1 },
  { q: 'Wie viele Minuten hat eine Stunde?', choices: ['30', '60', '90', '100'], a: 1 },
];

// ---------- Räume ----------
const rooms = new Map(); // code -> room
function newCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
function roomState(room) {
  return {
    code: room.code, game: room.game,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name })),
    quiz: room.quiz ? { qIndex: room.quiz.qIndex, total: QUIZ.length, scores: room.quiz.scores, phase: room.quiz.phase, current: room.quiz.phase === 'question' ? { q: QUIZ[room.quiz.qIndex].q, choices: QUIZ[room.quiz.qIndex].choices } : null, lastResult: room.quiz.lastResult || null } : null,
    chess: room.chess ? { board: room.chess.board, turn: room.chess.turn, history: room.chess.history, white: nameOf(room, room.chess.whiteId), black: nameOf(room, room.chess.blackId) } : null,
    fr: room.fr ? { top: room.fr.discard[room.fr.discard.length - 1], color: room.fr.color, turn: nameOf(room, room.fr.order[room.fr.turnIdx]), counts: room.fr.order.map(id => ({ name: nameOf(room, id), n: (room.fr.hands[id] || []).length })), winner: room.fr.winner ? nameOf(room, room.fr.winner) : null } : null,
    slf: room.slf ? { cats: room.slf.cats, letter: room.slf.letter, round: room.slf.round, phase: room.slf.phase, scores: room.slf.scores,
      progress: Object.fromEntries(Object.entries(room.slf.answers).map(([id, a]) => [id, room.slf.cats.filter(c => (a[c] || '').trim()).length])),
      answers: (room.slf.phase === 'reveal' || room.slf.phase === 'done') ? room.slf.answers : null,
      valid: (room.slf.phase === 'reveal' || room.slf.phase === 'done') ? room.slf.valid : null } : null,
    bingo: room.bingo ? { drawn: room.bingo.drawn, current: room.bingo.drawn[room.bingo.drawn.length - 1] || null, total: 75, phase: room.bingo.phase, winner: room.bingo.winner ? nameOf(room, room.bingo.winner) : null, players: Object.keys(room.bingo.cards).map(id => nameOf(room, id)) } : null,
    vier: room.vier ? { board: room.vier.board, turn: room.vier.turn, winner: room.vier.winner, r: nameOf(room, room.vier.rId), y: nameOf(room, room.vier.yId) } : null,
    wolf: room.wolf ? { phase: room.wolf.phase, alive: Object.entries(room.wolf.alive).map(([id, a]) => ({ id, name: nameOf(room, id), alive: a })), log: room.wolf.log.slice(-6), winner: room.wolf.winner, dayVotes: room.wolf.phase === 'day' ? room.wolf.votes : null } : null,
  };
}
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : null; }
function broadcast(code) { const r = rooms.get(code); if (r) io.to(code).emit('state', roomState(r)); }

// ---------- Schach (vereinfacht, legal inkl. Schach-Erkennung, ohne Rochade/En-passant) ----------
function initBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let x = 0; x < 8; x++) { b[0][x] = { t: back[x], c: 'b' }; b[1][x] = { t: 'p', c: 'b' }; b[6][x] = { t: 'p', c: 'w' }; b[7][x] = { t: back[x], c: 'w' }; }
  return b;
}
function inB(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8; }
function parseSq(s) { if (!/^[a-h][1-8]$/.test(s)) return null; return { x: s.charCodeAt(0) - 97, y: 8 - parseInt(s[1], 10) }; }
function attacked(b, x, y, by) {
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
    const p = b[yy][xx]; if (!p || p.c !== by) continue;
    const dx = x - xx, dy = y - yy;
    if (p.t === 'p') { const d = by === 'w' ? -1 : 1; if (dy === d && Math.abs(dx) === 1) return true; }
    else if (p.t === 'n') { if ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1)) return true; }
    else if (p.t === 'k') { if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true; }
    else {
      const diag = Math.abs(dx) === Math.abs(dy) && dx !== 0;
      const straight = (dx === 0 || dy === 0) && (dx !== 0 || dy !== 0);
      const ok = (p.t === 'b' && diag) || (p.t === 'r' && straight) || (p.t === 'q' && (diag || straight));
      if (!ok) continue;
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let cx = xx + sx, cy = yy + sy, blocked = false;
      while (cx !== x || cy !== y) { if (b[cy][cx]) { blocked = true; break; } cx += sx; cy += sy; }
      if (!blocked) return true;
    }
  }
  return false;
}
function kingPos(b, c) { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = b[y][x]; if (p && p.t === 'k' && p.c === c) return { x, y }; } return null; }
function inCheck(b, c) { const k = kingPos(b, c); return k ? attacked(b, k.x, k.y, c === 'w' ? 'b' : 'w') : false; }
function pseudoLegal(b, x, y) {
  const p = b[y][x]; if (!p) return [];
  const moves = [];
  const add = (nx, ny) => { if (inB(nx, ny) && (!b[ny][nx] || b[ny][nx].c !== p.c)) moves.push({ x: nx, y: ny }); };
  if (p.t === 'p') {
    const d = p.c === 'w' ? -1 : 1, start = p.c === 'w' ? 6 : 1;
    if (inB(x, y + d) && !b[y + d][x]) { moves.push({ x, y: y + d }); if (y === start && !b[y + 2 * d][x]) moves.push({ x, y: y + 2 * d }); }
    for (const dx of [-1, 1]) if (inB(x + dx, y + d) && b[y + d][x + dx] && b[y + d][x + dx].c !== p.c) moves.push({ x: x + dx, y: y + d });
  } else if (p.t === 'n') { for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(x + dx, y + dy); }
  else if (p.t === 'k') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) add(x + dx, y + dy); }
  else {
    const dirs = p.t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : p.t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of dirs) { let nx = x + dx, ny = y + dy; while (inB(nx, ny)) { if (!b[ny][nx]) moves.push({ x: nx, y: ny }); else { if (b[ny][nx].c !== p.c) moves.push({ x: nx, y: ny }); break; } nx += dx; ny += dy; } }
  }
  return moves;
}
function tryMove(chess, fromS, toS) {
  const f = parseSq(fromS), t = parseSq(toS);
  if (!f || !t) return { ok: false, err: 'Format: z.B. e2 e4' };
  const p = chess.board[f.y][f.x];
  if (!p) return { ok: false, err: 'Kein Stein auf ' + fromS };
  if (p.c !== chess.turn) return { ok: false, err: 'Am Zug: ' + (chess.turn === 'w' ? 'Weiß' : 'Schwarz') };
  const cand = pseudoLegal(chess.board, f.x, f.y).some(m => m.x === t.x && m.y === t.y);
  if (!cand) return { ok: false, err: 'Illegaler Zug für diese Figur' };
  // simulieren: König darf nicht im Schach bleiben
  const nb = chess.board.map(r => r.slice());
  nb[t.y][t.x] = nb[f.y][f.x]; nb[f.y][f.x] = null;
  if (nb[t.y][t.x].t === 'p' && (t.y === 0 || t.y === 7)) nb[t.y][t.x] = { t: 'q', c: p.c };
  if (inCheck(nb, p.c)) return { ok: false, err: 'Zug lässt König im Schach' };
  chess.board = nb;
  chess.history.push(fromS + '-' + toS);
  chess.turn = chess.turn === 'w' ? 'b' : 'w';
  const foe = chess.turn;
  const hasMove = (() => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const q = chess.board[y][x];
      if (!q || q.c !== foe) continue;
      for (const m of pseudoLegal(chess.board, x, y)) {
        const tb = chess.board.map(r => r.slice());
        tb[m.y][m.x] = tb[y][x]; tb[y][x] = null;
        if (!inCheck(tb, foe)) return true;
      }
    }
    return false;
  })();
  if (!hasMove) chess.history.push(inCheck(chess.board, foe) ? '# Schachmatt' : 'Remis (Patt)');
  return { ok: true };
}

// ---------- Farbrausch (vereinfacht) ----------
let frId = 1;
function buildFrDeck() {
  const d = [];
  for (const c of ['R', 'G', 'B', 'Y']) {
    d.push({ id: frId++, color: c, value: '0' });
    for (let v = 1; v <= 9; v++) { d.push({ id: frId++, color: c, value: String(v) }); d.push({ id: frId++, color: c, value: String(v) }); }
    for (const s of ['S', 'R', '+2']) { d.push({ id: frId++, color: c, value: s }); d.push({ id: frId++, color: c, value: s }); }
  }
  for (let i = 0; i < 4; i++) { d.push({ id: frId++, color: 'W', value: 'W' }); d.push({ id: frId++, color: 'W', value: '+4' }); }
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function frPlayable(card, top, color) {
  if (card.color === 'W') return true;
  return card.color === color || card.value === top.value;
}
function frDraw(room, pid, n) {
  for (let i = 0; i < n; i++) {
    if (!room.fr.deck.length) {
      const top = room.fr.discard.pop();
      room.fr.deck = room.fr.discard.splice(0);
      for (let k = room.fr.deck.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[room.fr.deck[k], room.fr.deck[j]] = [room.fr.deck[j], room.fr.deck[k]]; }
      room.fr.discard = [top];
      if (!room.fr.deck.length) break;
    }
    room.fr.hands[pid].push(room.fr.deck.pop());
  }
}

// ---------- Stadt-Land-Fluss ----------
const SLF_CATS_DEFAULT = ['Stadt', 'Land', 'Fluss', 'Tier', 'Beruf'];
const SLF_LETTERS = 'ABCDEFGHIKLMNOPRSTUVWZ';
function slfNewLetter(except) {
  const pool = [...SLF_LETTERS].filter(l => l !== except);
  return pool[Math.floor(Math.random() * pool.length)];
}
function slfCalcScores(room) {
  const s = room.slf;
  for (const cat of s.cats) {
    const entries = Object.entries(s.answers)
      .map(([pid, a]) => ({ pid, w: (a[cat] || '').trim().toLowerCase() }))
      .filter(e => e.w && s.valid[e.pid] && s.valid[e.pid][cat] !== false);
    if (!entries.length) continue;
    const answered = entries.length;
    const total = Object.keys(s.answers).length;
    for (const e of entries) {
      const same = entries.filter(x => x.w === e.w).length;
      let pts = 10;
      if (answered === 1 && total > 1) pts = 20;
      else if (same > 1) pts = 5;
      s.scores[e.pid] = (s.scores[e.pid] || 0) + pts;
    }
  }
}

// ---------- Bingo (1-75, Karte 5x5, Mitte frei) ----------
function bingoCard() {
  const cols = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const pick = (lo, hi, n) => { const p = []; for (let i = lo; i <= hi; i++) p.push(i); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; } return p.slice(0, n); };
  const grid = [];
  for (let r = 0; r < 5; r++) { grid.push([]); for (let c = 0; c < 5; c++) grid[r].push(null); }
  cols.forEach(([lo, hi], c) => { const nums = pick(lo, hi, 5); for (let r = 0; r < 5; r++) grid[r][c] = nums[r]; });
  grid[2][2] = 'FREE';
  return grid;
}
function bingoWin(card, drawn) {
  const set = new Set(drawn);
  const hit = (r, c) => card[r][c] === 'FREE' || set.has(card[r][c]);
  for (let i = 0; i < 5; i++) {
    if ([0, 1, 2, 3, 4].every(c => hit(i, c))) return true;
    if ([0, 1, 2, 3, 4].every(r => hit(r, i))) return true;
  }
  if ([0, 1, 2, 3, 4].every(i => hit(i, i))) return true;
  if ([0, 1, 2, 3, 4].every(i => hit(i, 4 - i))) return true;
  return false;
}

// ---------- Vier in einer Reihe (7x6) ----------
function vierEmpty() { return Array.from({ length: 6 }, () => Array(7).fill(null)); }
function vierDrop(board, col, color) {
  if (col < 0 || col > 6) return -1;
  for (let r = 5; r >= 0; r--) if (!board[r][col]) { board[r][col] = color; return r; }
  return -1;
}
function vierWin(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const v = b[r][c]; if (!v) continue;
    for (const [dr, dc] of dirs) {
      let n = 1, rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && b[rr][cc] === v) { n++; rr += dr; cc += dc; }
      if (n >= 4) return v;
    }
  }
  return null;
}

// ---------- Dorf & Wölfe ----------
function wolfMakeRoles(ids) {
  const n = ids.length;
  const w = n <= 6 ? 1 : n <= 9 ? 2 : 3;
  const roles = {};
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((id, i) => { roles[id] = i < w ? 'W' : 'D'; });
  if (n >= 5) { const seer = order.find(id => roles[id] === 'D'); if (seer) roles[seer] = 'S'; }
  return roles;
}
function wolfAliveIds(room) { return Object.entries(room.wolf.alive).filter(([, a]) => a).map(([id]) => id); }
function wolfCheck(room) {
  const alive = wolfAliveIds(room);
  const wolves = alive.filter(id => room.wolf.roles[id] === 'W');
  if (!wolves.length) { room.wolf.winner = 'Dorf'; room.wolf.phase = 'done'; return true; }
  if (wolves.length * 2 >= alive.length) { room.wolf.winner = 'Wölfe'; room.wolf.phase = 'done'; return true; }
  return false;
}

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  socket.emit('hello', { app: 'partyplay' });

  socket.on('create-room', ({ name, game }, cb) => {
    try {
      const code = newCode();
      const room = { code, players: new Map(), game: game || 'quiz', quiz: null, chess: null, fr: null, hostId: socket.id };
      rooms.set(code, room);
      socket.join(code);
      socket.data.code = code;
      room.players.set(socket.id, { id: socket.id, name: (name || 'TV').slice(0, 24) });
      ensureGame(room);
      broadcast(code);
      cb && cb({ ok: true, code });
    } catch (e) { cb && cb({ ok: false, err: String(e && e.message || e) }); }
  });

  socket.on('join-room', ({ code, name }, cb) => {
    try {
      code = String(code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return cb && cb({ ok: false, err: 'Raum nicht gefunden' });
      socket.join(code);
      socket.data.code = code;
      room.players.set(socket.id, { id: socket.id, name: String(name || 'Spieler').slice(0, 24) || 'Spieler' });
      ensureGame(room);
      if (room.quiz && room.quiz.scores[socket.id] === undefined) room.quiz.scores[socket.id] = 0;
      broadcast(code);
      cb && cb({ ok: true, code, state: roomState(room) });
    } catch (e) { cb && cb({ ok: false, err: String(e && e.message || e) }); }
  });

  socket.on('select-game', ({ game }) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = game; ensureGame(room, true); broadcast(room.code);
  });

  // Quiz
  socket.on('quiz:start', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'quiz';
    room.quiz = { qIndex: 0, scores: {}, answers: {}, phase: 'question', lastResult: null, timer: null };
    for (const id of room.players.keys()) room.quiz.scores[id] = 0;
    quizAsk(room);
  });
  socket.on('quiz:answer', ({ choice }) => {
    const room = rooms.get(socket.data.code); if (!room || !room.quiz || room.quiz.phase !== 'question') return;
    if (socket.id === room.hostId) return; // TV antwortet nicht
    if (room.quiz.answers[socket.id] !== undefined) return;
    room.quiz.answers[socket.id] = choice;
    const needed = Math.max(1, room.players.size - 1); // alle außer TV-Host
    if (Object.keys(room.quiz.answers).length >= needed) quizReveal(room);
    else broadcast(room.code);
  });
  socket.on('quiz:next', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.quiz) return;
    room.quiz.qIndex++;
    if (room.quiz.qIndex >= QUIZ.length) { room.quiz.phase = 'done'; broadcast(room.code); return; }
    room.quiz.answers = {}; room.quiz.lastResult = null; room.quiz.phase = 'question';
    quizAsk(room);
  });

  // Schach
  socket.on('chess:seat', ({ color }) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'chess'; ensureGame(room);
    if (color === 'w') room.chess.whiteId = socket.id;
    if (color === 'b') room.chess.blackId = socket.id;
    broadcast(room.code);
  });
  socket.on('chess:move', ({ from, to }, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.chess) return cb && cb({ ok: false, err: 'Kein Schachspiel' });
    const r = tryMove(room.chess, String(from || '').toLowerCase(), String(to || '').toLowerCase());
    broadcast(room.code);
    cb && cb(r);
  });
  socket.on('chess:reset', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.chess = { board: initBoard(), turn: 'w', history: [], whiteId: null, blackId: null };
    broadcast(room.code);
  });

  // Farbrausch
  socket.on('fr:start', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'fr';
    const order = [...room.players.keys()];
    const deck = buildFrDeck();
    const hands = {};
    for (const id of order) { hands[id] = []; for (let i = 0; i < 7; i++) hands[id].push(deck.pop()); }
    let top = deck.pop();
    while (top.color === 'W') { deck.unshift(top); top = deck.pop(); }
    room.fr = { order, hands, deck, discard: [top], color: top.color, turnIdx: 0, dir: 1, winner: null };
    broadcast(room.code);
  });
  socket.on('fr:play', ({ cardId, color }, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.fr || room.fr.winner) return cb && cb({ ok: false, err: 'Kein Farbrausch-Spiel' });
    const pid = socket.id;
    if (room.fr.order[room.fr.turnIdx] !== pid) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    const hand = room.fr.hands[pid];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx < 0) return cb && cb({ ok: false, err: 'Karte nicht auf der Hand' });
    const card = hand[idx];
    const top = room.fr.discard[room.fr.discard.length - 1];
    if (!frPlayable(card, top, room.fr.color)) return cb && cb({ ok: false, err: 'Passt nicht (Farbe/Wert)' });
    hand.splice(idx, 1);
    room.fr.discard.push(card);
    room.fr.color = card.color === 'W' ? (['R', 'G', 'B', 'Y'].includes(color) ? color : 'R') : card.color;
    const n = room.fr.order.length;
    const step = (s) => { room.fr.turnIdx = (room.fr.turnIdx + s * room.fr.dir + n * 10) % n; };
    if (card.value === 'R') { room.fr.dir *= -1; step(n === 2 ? 2 : 1); }
    else if (card.value === 'S') step(2);
    else if (card.value === '+2') { const nxt = room.fr.order[(room.fr.turnIdx + room.fr.dir + n) % n]; frDraw(room, nxt, 2); step(2); }
    else if (card.value === '+4') { const nxt = room.fr.order[(room.fr.turnIdx + room.fr.dir + n) % n]; frDraw(room, nxt, 4); step(2); }
    else step(1);
    if (!hand.length) room.fr.winner = pid;
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('fr:draw', (cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.fr) return cb && cb({ ok: false });
    if (room.fr.order[room.fr.turnIdx] !== socket.id) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    frDraw(room, socket.id, 1);
    room.fr.turnIdx = (room.fr.turnIdx + room.fr.dir + room.fr.order.length) % room.fr.order.length;
    broadcast(room.code);
    cb && cb({ ok: true });
  });

  socket.on('fr:hand', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.fr) return socket.emit('hand', []);
    socket.emit('hand', room.fr.hands[socket.id] || []);
  });

  // Stadt-Land-Fluss
  socket.on('slf:start', ({ cats }) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'slf';
    const list = (Array.isArray(cats) && cats.length ? cats : SLF_CATS_DEFAULT).map(s => String(s).slice(0, 16)).slice(0, 8);
    const ids = [...room.players.keys()].filter(id => id !== room.hostId);
    const answers = {}, valid = {}, scores = {};
    for (const id of ids) { answers[id] = {}; valid[id] = {}; scores[id] = (room.slf && room.slf.scores[id]) || 0; }
    room.slf = { cats: list, letter: slfNewLetter(), round: (room.slf ? room.slf.round + 1 : 1), phase: 'write', answers, valid, scores, timer: null };
    if (room.slf.timer) clearTimeout(room.slf.timer);
    room.slf.timer = setTimeout(() => { if (room.slf && room.slf.phase === 'write') { room.slf.phase = 'reveal'; broadcast(room.code); } }, 90000);
    broadcast(room.code);
  });
  socket.on('slf:submit', ({ answers }) => {
    const room = rooms.get(socket.data.code); if (!room || !room.slf || room.slf.phase !== 'write') return;
    if (socket.id === room.hostId || !room.slf.answers[socket.id]) return;
    for (const c of room.slf.cats) room.slf.answers[socket.id][c] = String((answers || {})[c] || '').slice(0, 30);
    broadcast(room.code);
  });
  socket.on('slf:stop', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.slf) return;
    if (room.slf.timer) clearTimeout(room.slf.timer);
    room.slf.phase = 'reveal'; broadcast(room.code);
  });
  socket.on('slf:toggle', ({ pid, cat }) => {
    const room = rooms.get(socket.data.code); if (!room || !room.slf || room.slf.phase !== 'reveal') return;
    if (!room.slf.valid[pid]) return;
    room.slf.valid[pid][cat] = room.slf.valid[pid][cat] === false ? true : false;
    broadcast(room.code);
  });
  socket.on('slf:score', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.slf) return;
    slfCalcScores(room);
    room.slf.phase = 'done'; broadcast(room.code);
  });

  // Bingo
  socket.on('bingo:start', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'bingo';
    const cards = {};
    for (const id of room.players.keys()) if (id !== room.hostId) cards[id] = bingoCard();
    room.bingo = { drawn: [], phase: 'play', cards, winner: null };
    broadcast(room.code);
  });
  socket.on('bingo:card', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.bingo) return socket.emit('bcard', null);
    if (!room.bingo.cards[socket.id] && socket.id !== room.hostId) room.bingo.cards[socket.id] = bingoCard();
    socket.emit('bcard', room.bingo.cards[socket.id] || null);
  });
  socket.on('bingo:draw', (cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.bingo || room.bingo.phase !== 'play') return cb && cb({ ok: false });
    if (room.bingo.drawn.length >= 75) return cb && cb({ ok: false, err: 'Alle Zahlen gezogen' });
    let n; do { n = 1 + Math.floor(Math.random() * 75); } while (room.bingo.drawn.includes(n));
    room.bingo.drawn.push(n);
    broadcast(room.code);
    cb && cb({ ok: true, n });
  });
  socket.on('bingo:claim', (cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.bingo || room.bingo.phase !== 'play') return cb && cb({ ok: false });
    const card = room.bingo.cards[socket.id];
    if (!card) return cb && cb({ ok: false, err: 'Keine Karte' });
    if (bingoWin(card, room.bingo.drawn)) {
      room.bingo.phase = 'done'; room.bingo.winner = socket.id;
      broadcast(room.code);
      cb && cb({ ok: true });
    } else cb && cb({ ok: false, err: 'Noch kein Bingo – weiter Daumen drücken!' });
  });

  // Vier in einer Reihe
  socket.on('vier:seat', ({ color }) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'vier'; ensureGame(room);
    if (color === 'R') room.vier.rId = socket.id;
    if (color === 'Y') room.vier.yId = socket.id;
    broadcast(room.code);
  });
  socket.on('vier:drop', ({ col }, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.vier || room.vier.winner) return cb && cb({ ok: false, err: 'Kein Spiel' });
    const color = room.vier.turn;
    const seat = color === 'R' ? room.vier.rId : room.vier.yId;
    if (socket.id !== seat) return cb && cb({ ok: false, err: 'Nicht am Zug (' + (color === 'R' ? 'Rot' : 'Gelb') + ')' });
    const r = vierDrop(room.vier.board, parseInt(col, 10), color);
    if (r < 0) return cb && cb({ ok: false, err: 'Spalte voll' });
    const w = vierWin(room.vier.board);
    if (w) room.vier.winner = w;
    else if (room.vier.board.every(row => row.every(v => v))) room.vier.winner = 'draw';
    else room.vier.turn = color === 'R' ? 'Y' : 'R';
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('vier:reset', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.vier = { board: vierEmpty(), turn: 'R', rId: null, yId: null, winner: null };
    broadcast(room.code);
  });

  // Dorf & Wölfe
  socket.on('wolf:start', () => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'wolf';
    const ids = [...room.players.keys()].filter(id => id !== room.hostId);
    if (ids.length < 4) { socket.emit('state', roomState(room)); return; }
    const roles = wolfMakeRoles(ids);
    const alive = {}; for (const id of ids) alive[id] = true;
    room.wolf = { phase: 'night', roles, alive, votes: {}, nightVotes: {}, log: ['🌙 Die Nacht bricht an. Wölfe und Seherin handeln auf dem Handy.'], winner: null };
    broadcast(room.code);
  });
  socket.on('wolf:role', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf) return socket.emit('wrole', null);
    socket.emit('wrole', room.wolf.roles[socket.id] || null);
  });
  socket.on('wolf:action', ({ target }, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf || room.wolf.phase !== 'night') return cb && cb({ ok: false });
    if (!room.wolf.alive[socket.id]) return cb && cb({ ok: false, err: 'Du bist ausgeschieden' });
    const role = room.wolf.roles[socket.id];
    if (role === 'W') {
      if (!room.wolf.alive[target]) return cb && cb({ ok: false, err: 'Ziel ist nicht im Spiel' });
      room.wolf.nightVotes[socket.id] = target;
      cb && cb({ ok: true });
    } else if (role === 'S') {
      const r = room.wolf.roles[target];
      if (!r) return cb && cb({ ok: false });
      cb && cb({ ok: true, isWolf: r === 'W', name: nameOf(room, target) });
    } else cb && cb({ ok: true, sleep: true });
    broadcast(room.code);
  });
  socket.on('wolf:endnight', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf || room.wolf.phase !== 'night') return;
    const wolves = wolfAliveIds(room).filter(id => room.wolf.roles[id] === 'W');
    const tally = {};
    for (const [wid, t] of Object.entries(room.wolf.nightVotes)) if (wolves.includes(wid) && room.wolf.alive[t]) tally[t] = (tally[t] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (top.length && (top.length === 1 || top[0][1] > top[1][1])) {
      room.wolf.alive[top[0][0]] = false;
      room.wolf.log.push('☀️ ' + nameOf(room, top[0][0]) + ' wurde in der Nacht gerissen.');
    } else room.wolf.log.push('☀️ Ruhige Nacht – niemand starb.');
    room.wolf.nightVotes = {}; room.wolf.votes = {};
    if (!wolfCheck(room)) room.wolf.phase = 'day';
    broadcast(room.code);
  });
  socket.on('wolf:vote', ({ target }, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf || room.wolf.phase !== 'day') return cb && cb({ ok: false });
    if (!room.wolf.alive[socket.id] || !room.wolf.alive[target]) return cb && cb({ ok: false, err: 'Ungültige Stimme' });
    room.wolf.votes[socket.id] = target;
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wolf:endday', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf || room.wolf.phase !== 'day') return;
    const tally = {};
    for (const [vid, t] of Object.entries(room.wolf.votes)) if (room.wolf.alive[vid] && room.wolf.alive[t]) tally[t] = (tally[t] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (top.length && (top.length === 1 || top[0][1] > top[1][1])) {
      room.wolf.alive[top[0][0]] = false;
      const wasWolf = room.wolf.roles[top[0][0]] === 'W';
      room.wolf.log.push('🗳️ ' + nameOf(room, top[0][0]) + ' wurde verbannt (' + (wasWolf ? 'war Wolf 🐺' : 'war unschuldig') + ').');
    } else room.wolf.log.push('🗳️ Keine Mehrheit – niemand wurde verbannt.');
    room.wolf.votes = {}; room.wolf.nightVotes = {};
    if (!wolfCheck(room)) { room.wolf.phase = 'night'; room.wolf.log.push('🌙 Neue Nacht bricht an.'); }
    broadcast(room.code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms.get(code); if (!room) return;
    const leftName = nameOf(room, socket.id) || 'Spieler';
    room.players.delete(socket.id);
    if (!room.players.size) { if (room.quiz?.timer) clearTimeout(room.quiz.timer); if (room.slf?.timer) clearTimeout(room.slf.timer); rooms.delete(code); return; }
    if (room.fr) { room.fr.order = room.fr.order.filter(id => id !== socket.id); delete room.fr.hands[socket.id]; if (!room.fr.order.length) room.fr = null; else room.fr.turnIdx %= room.fr.order.length; }
    if (room.slf) { delete room.slf.answers[socket.id]; delete room.slf.valid[socket.id]; }
    if (room.bingo) delete room.bingo.cards[socket.id];
    if (room.wolf && room.wolf.alive[socket.id] !== undefined) { room.wolf.alive[socket.id] = false; room.wolf.log.push('🚪 ' + leftName + ' hat verlassen (zählt als ausgeschieden).'); }
    broadcast(code);
  });
});

function ensureGame(room, reset) {
  if (room.game === 'quiz' && (!room.quiz || reset)) room.quiz = { qIndex: 0, scores: Object.fromEntries([...room.players.keys()].map(id => [id, 0])), answers: {}, phase: 'lobby', lastResult: null, timer: null };
  if (room.game === 'chess' && (!room.chess || reset)) room.chess = { board: initBoard(), turn: 'w', history: [], whiteId: null, blackId: null };
  if (room.game === 'fr' && (!room.fr || reset)) room.fr = null;
  if (room.game === 'slf' && (!room.slf || reset)) room.slf = null;
  if (room.game === 'bingo' && (!room.bingo || reset)) room.bingo = null;
  if (room.game === 'vier' && (!room.vier || reset)) room.vier = { board: vierEmpty(), turn: 'R', rId: null, yId: null, winner: null };
  if (room.game === 'wolf' && (!room.wolf || reset)) room.wolf = null;
}
function quizAsk(room) {
  if (room.quiz.timer) clearTimeout(room.quiz.timer);
  room.quiz.phase = 'question';
  broadcast(room.code);
  room.quiz.timer = setTimeout(() => quizReveal(room), 15000);
}
function quizReveal(room) {
  if (!room.quiz || room.quiz.phase !== 'question') return;
  if (room.quiz.timer) clearTimeout(room.quiz.timer);
  const correct = QUIZ[room.quiz.qIndex].a;
  const res = [];
  for (const [id, ch] of Object.entries(room.quiz.answers)) {
    if (ch === correct) { room.quiz.scores[id] = (room.quiz.scores[id] || 0) + 100; res.push({ name: nameOf(room, id), ok: true }); }
    else res.push({ name: nameOf(room, id), ok: false });
  }
  room.quiz.lastResult = { correct, detail: res };
  room.quiz.phase = 'reveal';
  broadcast(room.code);
}

server.listen(PORT, HOST, () => console.log(`partyplay läuft auf http://${HOST}:${PORT}`));
module.exports = { server };
