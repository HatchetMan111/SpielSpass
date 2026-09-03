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

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms.get(code); if (!room) return;
    room.players.delete(socket.id);
    if (!room.players.size) { if (room.quiz?.timer) clearTimeout(room.quiz.timer); rooms.delete(code); return; }
    if (room.fr) { room.fr.order = room.fr.order.filter(id => id !== socket.id); delete room.fr.hands[socket.id]; if (!room.fr.order.length) room.fr = null; else room.fr.turnIdx %= room.fr.order.length; }
    broadcast(code);
  });
});

function ensureGame(room, reset) {
  if (room.game === 'quiz' && (!room.quiz || reset)) room.quiz = { qIndex: 0, scores: Object.fromEntries([...room.players.keys()].map(id => [id, 0])), answers: {}, phase: 'lobby', lastResult: null, timer: null };
  if (room.game === 'chess' && (!room.chess || reset)) room.chess = { board: initBoard(), turn: 'w', history: [], whiteId: null, blackId: null };
  if (room.game === 'fr' && (!room.fr || reset)) room.fr = null;
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
