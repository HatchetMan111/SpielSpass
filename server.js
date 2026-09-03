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
    code: room.code, game: room.game, hostId: room.hostId,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar || '🙂', online: p.online !== false })),
    quiz: room.quiz ? { qIndex: room.quiz.qIndex, total: QUIZ.length, scores: room.quiz.scores, phase: room.quiz.phase, current: room.quiz.phase === 'question' ? { q: QUIZ[room.quiz.qIndex].q, choices: QUIZ[room.quiz.qIndex].choices } : null, lastResult: room.quiz.lastResult || null } : null,
    chess: room.chess ? { board: room.chess.board, turn: room.chess.turn, history: room.chess.history, white: nameOf(room, room.chess.whiteId), black: nameOf(room, room.chess.blackId), whiteId: room.chess.whiteId, blackId: room.chess.blackId, whiteOnline: (room.players.get(room.chess.whiteId) || {}).online !== false, blackOnline: (room.players.get(room.chess.blackId) || {}).online !== false, legal: legalMovesMap(room.chess.board, room.chess.turn), lastMove: lastMoveOf(room.chess.history) } : null,
    fr: room.fr ? { top: room.fr.discard[room.fr.discard.length - 1], color: room.fr.color, turn: nameOf(room, room.fr.order[room.fr.turnIdx]), turnId: room.fr.order[room.fr.turnIdx], turnOnline: (room.players.get(room.fr.order[room.fr.turnIdx]) || {}).online !== false, counts: room.fr.order.map(id => ({ name: nameOf(room, id), n: (room.fr.hands[id] || []).length })), winner: room.fr.winner ? nameOf(room, room.fr.winner) : null } : null,
    slf: room.slf ? { cats: room.slf.cats, letter: room.slf.letter, round: room.slf.round, phase: room.slf.phase, scores: room.slf.scores,
      progress: Object.fromEntries(Object.entries(room.slf.answers).map(([id, a]) => [id, room.slf.cats.filter(c => (a[c] || '').trim()).length])),
      answers: (room.slf.phase === 'reveal' || room.slf.phase === 'done') ? room.slf.answers : null,
      valid: (room.slf.phase === 'reveal' || room.slf.phase === 'done') ? room.slf.valid : null } : null,
    bingo: room.bingo ? { drawn: room.bingo.drawn, current: room.bingo.drawn[room.bingo.drawn.length - 1] || null, total: 75, phase: room.bingo.phase, winner: room.bingo.winner ? nameOf(room, room.bingo.winner) : null, players: Object.keys(room.bingo.cards).map(id => nameOf(room, id)) } : null,
    vier: room.vier ? { board: room.vier.board, turn: room.vier.turn, winner: room.vier.winner, r: nameOf(room, room.vier.rId), y: nameOf(room, room.vier.yId), rId: room.vier.rId, yId: room.vier.yId, rOnline: (room.players.get(room.vier.rId) || {}).online !== false, yOnline: (room.players.get(room.vier.yId) || {}).online !== false } : null,
    wolf: room.wolf ? { phase: room.wolf.phase, alive: Object.entries(room.wolf.alive).map(([id, a]) => ({ id, name: nameOf(room, id), alive: a })), log: room.wolf.log.slice(-6), winner: room.wolf.winner, dayVotes: room.wolf.phase === 'day' ? room.wolf.votes : null } : null,
    gw: room.gw ? { words: room.gw.words, revealed: room.gw.revealed.map((r, i) => r ? room.gw.key[i] : null), turn: room.gw.turn, phase: room.gw.phase, hint: room.gw.hint, leftR: gwLeft(room.gw, 'R'), leftB: gwLeft(room.gw, 'B'), winner: room.gw.winner, log: room.gw.log.slice(-4), chefR: nameOf(room, room.gw.chefR), chefB: nameOf(room, room.gw.chefB) } : null,
    bluff: room.bluff ? { community: room.bluff.community, pot: room.bluff.pot, phase: room.bluff.phase, turnId: bluffNeedsAction(room.bluff, room)[0] || null, turn: nameOf(room, bluffNeedsAction(room.bluff, room)[0]), players: room.bluff.order.map(id => ({ id, name: nameOf(room, id), chips: (room.bluffChips || {})[id] || 0, folded: !!room.bluff.folded[id], paid: room.bluff.paid[id] || 0 })), dealer: nameOf(room, room.bluff.dealer), winners: (room.bluff.winners || []).map(id => nameOf(room, id)), winDesc: room.bluff.winDesc, log: room.bluff.log.slice(-5) } : null,
    mr: room.mr ? { drawerId: room.mr.drawerId, drawer: nameOf(room, room.mr.drawerId), wordLen: room.mr.wordLen, strokes: room.mr.strokes, phase: room.mr.phase, round: room.mr.round, guessed: room.mr.guessed.map(id => nameOf(room, id)), logExtra: room.mr.logExtra || null, scores: room.mrScores || {} } : null,
    wg: room.wg ? { order: room.wg.order, turnId: room.wg.done ? null : room.wg.order[room.wg.turnIdx], turn: room.wg.done ? null : nameOf(room, room.wg.order[room.wg.turnIdx]), dice: room.wg.dice, held: room.wg.held, rollsLeft: room.wg.rollsLeft, sheets: room.wg.sheets, totals: Object.fromEntries(room.wg.order.map(id => [id, wgTotal(room.wg.sheets[id])])), done: room.wg.done, winners: (room.wg.winners || []).map(id => nameOf(room, id)) } : null,
    wv: room.wv ? { teams: { A: room.wv.teams.A.map(id => nameOf(room, id)), B: room.wv.teams.B.map(id => nameOf(room, id)) }, explTeam: room.wv.explTeam, explainer: nameOf(room, room.wv.explainerId), explainerId: room.wv.explainerId, scores: room.wv.scores, left: room.wv.deck.length - (room.wv.cardIdx % room.wv.deck.length), lastResult: room.wv.lastResult } : null,
  };
}
function nameOf(room, id) { const p = room.players.get(id); return p ? p.name : null; }
function avatarOf(room, id) { const p = room.players.get(id); return (p && p.avatar) || '🙂'; }
function pickAvatar(a) { a = String(a || '').trim().slice(0, 8); return a || '🙂'; }
// Spieler endgültig entfernen (Sweep + Kick teilen sich das)
function removePlayer(room, id) {
  const nm = nameOf(room, id) || 'Spieler';
  room.players.delete(id);
  if (room.fr) { room.fr.order = room.fr.order.filter(x => x !== id); delete room.fr.hands[id]; if (room.fr.order.length) room.fr.turnIdx %= room.fr.order.length; }
  if (room.slf) { delete room.slf.answers[id]; delete room.slf.valid[id]; }
  if (room.bingo) delete room.bingo.cards[id];
  if (room.chess) { if (room.chess.whiteId === id) room.chess.whiteId = null; if (room.chess.blackId === id) room.chess.blackId = null; }
  if (room.vier) { if (room.vier.rId === id) room.vier.rId = null; if (room.vier.yId === id) room.vier.yId = null; }
  if (room.wolf && room.wolf.alive[id] !== undefined) { room.wolf.alive[id] = false; room.wolf.log.push('🚪 ' + nm + ' endgültig raus (zählt als ausgeschieden).'); }
  if (room.gw) { if (room.gw.chefR === id) room.gw.chefR = null; if (room.gw.chefB === id) room.gw.chefB = null; }
  if (room.bluff) {
    delete room.bluff.hole[id]; delete room.bluff.folded[id]; delete room.bluff.paid[id];
    room.bluff.acted = room.bluff.acted.filter(x => x !== id);
    room.bluff.order = room.bluff.order.filter(x => x !== id);
    room.bluff.winners = (room.bluff.winners || []).filter(x => x !== id);
    if (room.bluff.dealer === id) room.bluff.dealer = room.bluff.order[0] || null;
    if (room.bluffChips) delete room.bluffChips[id];
  }
  if (room.mr) {
    if (room.mrScores) delete room.mrScores[id];
    room.mr.guessed = room.mr.guessed.filter(x => x !== id);
    if (room.mr.drawerId === id && room.mr.phase === 'draw') {
      if (room.mr.timer) clearTimeout(room.mr.timer);
      room.mr.phase = 'done'; room.mr.logExtra = 'Malender weg – Runde abgebrochen.';
    }
  }
  if (room.wg) {
    delete room.wg.sheets[id];
    const wasTurn = room.wg.order[room.wg.turnIdx] === id;
    room.wg.order = room.wg.order.filter(x => x !== id);
    if (!room.wg.order.length) { room.wg.done = true; }
    else { room.wg.turnIdx %= room.wg.order.length; if (wasTurn) wgNext(room); }
  }
  if (room.wv) {
    room.wv.teams.A = room.wv.teams.A.filter(x => x !== id);
    room.wv.teams.B = room.wv.teams.B.filter(x => x !== id);
    if (room.wv.explainerId === id) wvEndTurn(room, false);
  }
}
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

function sqName(x, y) { return 'abcdefgh'[x] + (8 - y); }
// Alle legalen Züge der Farbe als {von:[nach,...]} (für Handy-Brett mit Highlight)
function legalMovesMap(board, color) {
  const out = {};
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = board[y][x];
    if (!p || p.c !== color) continue;
    const tos = [];
    for (const m of pseudoLegal(board, x, y)) {
      const nb = board.map(r => r.slice());
      nb[m.y][m.x] = nb[y][x]; nb[y][x] = null;
      if (nb[m.y][m.x].t === 'p' && (m.y === 0 || m.y === 7)) nb[m.y][m.x] = { t: 'q', c: p.c };
      if (!inCheck(nb, color)) tos.push(sqName(m.x, m.y));
    }
    if (tos.length) out[sqName(x, y)] = tos;
  }
  return out;
}
function lastMoveOf(history) {
  const h = (history || []).filter(s => /^[a-h][1-8]-[a-h][1-8]$/.test(s));
  if (!h.length) return null;
  const [from, to] = h[h.length - 1].split('-');
  return { from, to };
}
// Reconnect: alte Socket-ID auf neue umziehen (Sitze, Hände, Punkte, Rollen bleiben)
function relinkRoom(room, oldId, newId, entry) {
  room.players.delete(oldId);
  room.players.set(newId, entry);
  if (room.hostId === oldId) room.hostId = newId;
  const swap = (o) => { if (o && o[oldId] !== undefined && o[newId] === undefined) { o[newId] = o[oldId]; delete o[oldId]; } };
  const remapVals = (o) => { if (!o) return; for (const k of Object.keys(o)) if (o[k] === oldId) o[k] = newId; };
  if (room.quiz) { swap(room.quiz.scores); swap(room.quiz.answers); }
  if (room.chess) {
    if (room.chess.whiteId === oldId) room.chess.whiteId = newId;
    if (room.chess.blackId === oldId) room.chess.blackId = newId;
  }
  if (room.fr) { const i = room.fr.order.indexOf(oldId); if (i >= 0) room.fr.order[i] = newId; swap(room.fr.hands); }
  if (room.slf) { swap(room.slf.answers); swap(room.slf.valid); swap(room.slf.scores); }
  if (room.bingo) swap(room.bingo.cards);
  if (room.vier) {
    if (room.vier.rId === oldId) room.vier.rId = newId;
    if (room.vier.yId === oldId) room.vier.yId = newId;
  }
  if (room.wolf) { swap(room.wolf.roles); swap(room.wolf.alive); swap(room.wolf.votes); swap(room.wolf.nightVotes); remapVals(room.wolf.votes); remapVals(room.wolf.nightVotes); }
  if (room.gw) {
    if (room.gw.chefR === oldId) room.gw.chefR = newId;
    if (room.gw.chefB === oldId) room.gw.chefB = newId;
  }
  if (room.bluff) {
    swap(room.bluff.hole); swap(room.bluff.folded); swap(room.bluff.paid);
    room.bluff.acted = room.bluff.acted.map(id => id === oldId ? newId : id);
    room.bluff.winners = (room.bluff.winners || []).map(id => id === oldId ? newId : id);
    if (room.bluff.dealer === oldId) room.bluff.dealer = newId;
    const oi = room.bluff.order.indexOf(oldId); if (oi >= 0) room.bluff.order[oi] = newId;
  }
  if (room.mr && room.mr.drawerId === oldId) room.mr.drawerId = newId;
  if (room.wg) {
    swap(room.wg.sheets);
    room.wg.order = room.wg.order.map(id => id === oldId ? newId : id);
  }
  if (room.wv) {
    room.wv.teams.A = room.wv.teams.A.map(id => id === oldId ? newId : id);
    room.wv.teams.B = room.wv.teams.B.map(id => id === oldId ? newId : id);
    if (room.wv.explainerId === oldId) room.wv.explainerId = newId;
  }
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

// ---------- Geheimworte ----------
function gwNew() {
  const pool = [...GW_WORDS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
  const words = pool.slice(0, 25);
  const key = [...Array(9).fill('R'), ...Array(8).fill('B'), ...Array(7).fill('N'), 'A'];
  for (let i = key.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[key[i], key[j]] = [key[j], key[i]]; }
  return { words, key, revealed: Array(25).fill(false), turn: 'R', phase: 'hint', hint: null, left: 0, chefR: null, chefB: null, winner: null, log: [] };
}
function gwLeft(g, team) { return g.key.filter((k, i) => k === team && !g.revealed[i]).length; }

// ---------- Bluff-Poker (Texas Hold'em vereinfacht, Fixed-Limit 10) ----------
const PR = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const HAND_NAMES = ['High Card', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];
function eval5(cards) {
  const v = cards.map(c => PR[c.r]).sort((a, b) => b - a);
  const flush = cards.every(c => c.s === cards[0].s);
  const counts = {}; v.forEach(x => counts[x] = (counts[x] || 0) + 1);
  const groups = Object.entries(counts).map(([val, n]) => ({ val: +val, n })).sort((a, b) => b.n - a.n || b.val - a.val);
  const u = [...new Set(v)];
  let straight = false, shigh = 0;
  if (u.length === 5) {
    if (u[0] - u[4] === 4) { straight = true; shigh = u[0]; }
    else if (u[0] === 14 && u[1] === 5) { straight = true; shigh = 5; }
  }
  if (straight && flush) return [8, shigh];
  if (groups[0].n === 4) return [7, groups[0].val, groups[1].val];
  if (groups[0].n === 3 && groups[1].n === 2) return [6, groups[0].val, groups[1].val];
  if (flush) return [5, ...v];
  if (straight) return [4, shigh];
  if (groups[0].n === 3) return [3, groups[0].val, ...groups.slice(1).map(g => g.val).sort((a, b) => b - a)];
  if (groups[0].n === 2 && groups[1].n === 2) return [2, ...groups.filter(g => g.n === 2).map(g => g.val).sort((a, b) => b - a), groups.find(g => g.n === 1).val];
  if (groups[0].n === 2) return [1, groups[0].val, ...groups.slice(1).map(g => g.val).sort((a, b) => b - a)];
  return [0, ...v];
}
function cmpScore(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
function best7(seven) {
  let best = null;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++) for (let d = c + 1; d < 6; d++) for (let e = d + 1; e < 7; e++) {
    const s = eval5([seven[a], seven[b], seven[c], seven[d], seven[e]]);
    if (!best || cmpScore(s, best) > 0) best = s;
  }
  return best;
}
function pokerDeck() {
  const d = [];
  for (const s of ['h', 'd', 'c', 's']) for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function bluffNeedsAction(b, room) {
  const chips = (room && room.bluffChips) || {};
  return b.order.filter(id => !b.folded[id] && !b.acted.includes(id) && (chips[id] || 0) > 0);
}
function bluffAdvance(b, room) {
  // fold-sieg?
  const alive = b.order.filter(id => !b.folded[id]);
  if (alive.length === 1) {
    const w = alive[0];
    room.bluffChips[w] = (room.bluffChips[w] || 0) + b.pot;
    b.winners = [w]; b.winDesc = 'Alle anderen folden'; b.phase = 'done';
    b.log.push('🏆 ' + nameOf(room, w) + ' gewinnt ' + b.pot + ' (alle folden).');
    b.pot = 0;
    return;
  }
  if (bluffNeedsAction(b, room).length) return; // noch Aktionen offen
  // Straße weiter
  const deal = { preflop: 3, flop: 1, turn: 1, river: 0 };
  if (b.phase === 'river') { bluffShowdown(b, room); return; }
  const n = deal[b.phase] || 0;
  for (let i = 0; i < n; i++) b.community.push(b.deck.pop());
  b.phase = b.phase === 'preflop' ? 'flop' : b.phase === 'flop' ? 'turn' : 'river';
  b.acted = []; b.paid = {};
  b.log.push('🃏 ' + { flop: 'Flop', turn: 'Turn', river: 'River' }[b.phase] + ': ' + b.community.map(c => c.r + c.s).join(' '));
  if (!bluffNeedsAction(b, room).length) bluffAdvance(b, room); // alle all-in → weiter
}
function bluffShowdown(b, room) {
  const alive = b.order.filter(id => !b.folded[id]);
  let best = null, winners = [];
  const scores = {};
  for (const id of alive) {
    const s = best7([...b.hole[id], ...b.community]);
    scores[id] = s;
    const c = best ? cmpScore(s, best) : 1;
    if (c > 0) { best = s; winners = [id]; }
    else if (c === 0) winners.push(id);
  }
  const share = Math.floor(b.pot / winners.length);
  winners.forEach((id, i) => { room.bluffChips[id] = (room.bluffChips[id] || 0) + share + (i === 0 ? b.pot % winners.length : 0); });
  b.winners = winners; b.winDesc = HAND_NAMES[best[0]]; b.phase = 'done';
  b.log.push('🏆 Showdown: ' + winners.map(id => nameOf(room, id)).join(', ') + ' gewinnt ' + b.pot + ' mit ' + HAND_NAMES[best[0]] + '.');
  b.pot = 0;
}

// ---------- Würfelglück (Kniffel-Blatt) ----------
const WG_CATS = [['ones', '1er'], ['twos', '2er'], ['threes', '3er'], ['fours', '4er'], ['fives', '5er'], ['sixes', '6er'], ['three', '3 Gleiche'], ['four', '4 Gleiche'], ['full', 'Full House'], ['small', 'Kl. Straße'], ['large', 'Gr. Straße'], ['kniffel', 'Kniffel'], ['chance', 'Chance']];
function wgScore(d, cat) {
  const counts = {}; d.forEach(x => counts[x] = (counts[x] || 0) + 1);
  const sum = d.reduce((a, b) => a + b, 0);
  const n = k => Object.values(counts).some(c => c >= k);
  const uniq = [...new Set(d)].sort((a, b) => a - b);
  const run = (len) => { let best = 1, cur = 1; for (let i = 1; i < uniq.length; i++) { if (uniq[i] === uniq[i - 1] + 1) { cur++; best = Math.max(best, cur); } else cur = 1; } return best >= len; };
  if (cat === 'full') { const c = Object.values(counts).sort(); return (JSON.stringify(c) === '[2,3]' || n(5)) ? 25 : 0; }
  if (cat === 'small') return run(4) ? 30 : 0;
  if (cat === 'large') return run(5) ? 40 : 0;
  if (cat === 'kniffel') return n(5) ? 50 : 0;
  if (cat === 'three') return n(3) ? sum : 0;
  if (cat === 'four') return n(4) ? sum : 0;
  if (cat === 'chance') return sum;
  const face = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }[cat];
  return face ? d.filter(x => x === face).reduce((a, b) => a + b, 0) : 0;
}
function wgTotal(sheet) {
  const sub = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].reduce((a, c) => a + ((sheet || {})[c] || 0), 0);
  const bonus = sub >= 63 ? 35 : 0;
  const low = ['three', 'four', 'full', 'small', 'large', 'kniffel', 'chance'].reduce((a, c) => a + ((sheet || {})[c] || 0), 0);
  return { sub, bonus, total: sub + bonus + low };
}
function wgSheetFull(sheet) { return WG_CATS.every(([c]) => sheet && sheet[c] !== null && sheet[c] !== undefined); }
function wgNext(room) {
  const w = room.wg;
  if (w.order.every(id => wgSheetFull(w.sheets[id]))) {
    w.done = true;
    let best = -1, win = [];
    for (const id of w.order) {
      const t = wgTotal(w.sheets[id]).total;
      if (t > best) { best = t; win = [id]; } else if (t === best) win.push(id);
    }
    w.winners = win;
    return;
  }
  let i = w.turnIdx;
  for (let k = 0; k < w.order.length; k++) {
    i = (i + 1) % w.order.length;
    const id = w.order[i], p = room.players.get(id);
    if (p && p.online !== false && !wgSheetFull(w.sheets[id])) break;
  }
  w.turnIdx = i;
  w.dice = [1, 1, 1, 1, 1]; w.held = [false, false, false, false, false]; w.rollsLeft = 3;
}

// ---------- Wortverbot ----------
function wvShuffle(a) { const p = [...a]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; } return p; }
function wvSetTimer(room) {
  if (room.wv.timer) clearTimeout(room.wv.timer);
  room.wv.timer = setTimeout(() => {
    if (room.wv && room.wv.phase === 'play') wvEndTurn(room, true);
  }, 60000);
}
function wvEndTurn(room, auto) {
  const w = room.wv; if (!w) return;
  w.explTeam = w.explTeam === 'A' ? 'B' : 'A';
  const online = w.teams[w.explTeam].filter(id => (room.players.get(id) || {}).online !== false);
  const pool = online.length ? online : w.teams[w.explTeam];
  if (!pool.length) return;
  w.expIdx[w.explTeam] = ((w.expIdx[w.explTeam] === undefined ? -1 : w.expIdx[w.explTeam]) + 1) % pool.length;
  w.explainerId = pool[w.expIdx[w.explTeam]];
  w.lastResult = (auto ? '⏰ Zeit um! ' : '') + 'Team ' + w.explTeam + ' ist dran – erklärt: ' + nameOf(room, w.explainerId);
  wvSetTimer(room);
  broadcast(room.code);
}

// ---------- Wortlisten & Karten (eigene Inhalte, offline) ----------
const GW_WORDS = [...new Set((('Apfel Baum Haus Auto Zug Schiff Flugzeug Fahrrad Motorrad Straße Brücke Turm Kirche Schloss Burg Berg Tal Fluss See Meer Strand Insel Wald Wiese Feld Garten Park Blume Rose Baumstamm Pilz Moos Stein Höhle Vulkan Wüste Sturm Regen Schnee Eis Sonne Mond Stern Himmel Wolke Blitz Donner Nebel Feuer Wasser Luft Erde Schatten Licht Spiegel Glas Holz Metall Stein Papier Feder Kissen Decke Bett Tisch Stuhl Sofa Lampe Kerze Uhr Schlüssel Tür Fenster Dach Boden Treppe Keller Ofen Herd Kühlschrank Teller Tasse Topf Pfanne Messer Gabel Löffel Brot Kuchen Käse Wurst Ei Milch Kaffee Tee Saft Bier Wein Wasserflasche Apfelsaft Schokolade Bonbon Eiscreme Pizza Nudel Reis Kartoffel Salat Tomate Gurke Karotte Zwiebel Knoblauch Pfeffer Salz Zucker Honig Marmelade Butter Joghurt Müsli Banane Orange Zitrone Birne Kirsche Erdbeere Traube Melone Ananas Mango Kiwi Pflaume Pfirsich Nuss Mandel Katze Hund Maus Vogel Fisch Pferd Kuh Schwein Schaf Ziege Huhn Ente Gans Kaninchen Hamster Spinne Biene Wespe Schmetterling Käfer Ameise Schnecke Frosch Schlange Eidechse Affe Elefant Löwe Tiger Bär Wolf Fuchs Hase Reh Wildschwein Dachs Maulwurf Igel Fledermaus Eule Adler Falke Specht Storch Schwan Pinguin Delfin Wal Hai Krake Muschel Koralle Seestern Qualle Krebs Arzt Lehrer Bäcker Metzger Polizist Feuerwehr Pilot Kapitän Bauer Gärtner Koch Kellner Friseur Maler Musiker Sänger Tänzer Schauspieler Clown Zauberer König Königin Prinz Prinzessin Ritter Pirat Cowboy Indianer Baby Kind Junge Mädchen Mann Frau Oma Opa Freund Nachbar Gast Familie Babyflasche Spielzeug Ball Puppe Teddybär Bauklotz Puzzle Drachen Schaukel Rutsche Wippe Karussell Zirkus Theater Kino Konzert Disco Party Geburtstag Hochzeit Taufe Weihnachten Ostern Silvester Urlaub Reise Koffer Rucksack Zelt Schlafsack Kompass Karte Fernglas Kamera Handy Telefon Computer Tastatur Maus Bildschirm Drucker Brief Stempel Paket Postkarte Zeitung Buch Heft Stift Bleistift Kugelschreiber Radiergummi Lineal Schere Kleber Farbe Pinsel Leinwand Foto Bild Rahmen Skulptur Vase Teppich Vorhang Tischtuch Handtuch Seife Zahnbürste Shampoo Spiegel Kamm Bürste Hut Mütze Schal Handschuh Jacke Mantel Hose Rock Kleid Hemd Bluse Pullover T-Shirt Socke Schuh Stiefel Sandale Turnschuh Brille Uhr Kette Ring Armband Tasche Geldbörse Regenschirm Fächer').split(' ')))];
const MR_WORDS = [...new Set((('Haus Baum Auto Katze Hund Sonne Blume Fisch Vogel Apfel Banane Tisch Stuhl Bett Lampe Uhr Brille Hut Schuh Boot Flugzeug Zug Schiff Fahrrad Ball Drachen Teddy Herz Stern Mond Wolke Regen Schnee Berg Fluss See Strand Insel Wald Pilz Schmetterling Biene Spinne Schnecke Frosch Elefant Löwe Affe Pferd Kuh Schwein Huhn Ente Maus Käse Brot Kuchen Eis Pizza Teller Tasse Schlüssel Schloss Brücke Turm Kirche Zelt Koffer Kamera Handy Buch Stift Schere Kerze Geschenk Torte Kerze Clown Pirat Ritter König Krone Schatzkarte Anker Kompass Fernglas Zirkuszelt Gitarre Trommel Klavier Mikrofon Fußball Tennisschläger Fahrradhelm Rucksack Schlafsack Lagerfeuer Marshmallow Kaktus Palme Kokosnuss Ananas Wassermelone Erdbeere Kirsche Traube Zitrone Karotte Tomate Gurke Kartoffel Brokkoli Pilzsuppe Spiegelei Pfannkuchen Brezel Croissant Donut Muffin Popcorn Pommes Hamburger Hotdog Sandwich Salat Suppe Teekanne Kaffeetasse Milchtüte Saftkarton Regenschirm Sonnenbrille Handschuh Schal Mütze Stiefel Turnschuh Pyjama Zahnbürste Seife Handtuch Kissen Decke Wecker Kalender Fotoapparat Fernseher Sofa Sessel Teppich Vorhang Spiegel Vase Blumentopf Gießkanne Rasenmäher Schubkarre Leiter Hammer Säge Bohrer Zange Schraube Nagel Eimer Besen Wischmopp Staubsauger Waschmaschine Kühlschrank Herd Mikrowelle Toaster Wasserkocher Föhn Rasierer Parfüm Lippenstift Kamm Bürste Fön Schmuckkästchen Sparschwein Geldschein Münze Bankkarte Briefkasten Paket Zeitungsständer Litfaßsäule Ampel Zebrastreifen Hydrant Mülltonne Parkbank Laterne Brunnen Denkmal Springbrunnen Karussell Riesenrad Achterbahn Geisterbahn Losbude Zuckerwatte Luftballon Konfetti Piñata Schatztruhe Goldmünze Edelstein Fernglas Seil Hängematte Picknickkorb Grill Grillschürze Liegestuhl Sonnenschirm Strandball Sandburg Eimerchen Förmchen Muschel Seestern Ankerkette Leuchtturm Rettungsring Taucherflossen Schnorchel Surfbrett Skateboard Roller Inliner Helm Schienbeinschoner Tor Handschuh Torlinie Pokal Medaille Urkunde Fahne Hymne').split(' ')))];
const WV_RAW = ('Baum|Blätter|Ast|Wald|Stamm|grün|Flugzeug|fliegen|Pilot|Abheben|Himmel|Tragflächen|Geburtstag|Geschenk|Torte|Kerzen|feiern|Alter|Handy|telefonieren|Display|Akku|SIM|Anruf|Pizza|Italien|Käse|Teig|rund|Tomatensauce|Fußball|Ball|Tor|Elfmeter|Stadion|kicken|Kino|Film|Leinwand|Popcorn|Schauspieler|Ticket|Schule|Lehrer|Klasse|Hausaufgaben|Tafel|lernen|Arzt|Krankenhaus|Patient|krank|Stethoskop|Untersuchung|Hund|bellen|Welpe|Gassi|Knochen|Leine|Katze|miauen|Schnurren|Pfote|Stubentiger|Kratzbaum|Auto|fahren|Motor|Räder|Tankstelle|Lenkrad|Fahrrad|Pedale|klingeln|Sattel|Kette|Zweirad|Schiff|Wasser|Kapitän|Segel|Hafen|Anker|Zug|Gleis|Bahnhof|Waggon|Schaffner|Lokomotive|Apfel|Obst|Kern|Baum|rot|pflücken|Brot|Bäcker|Mehl|Scheibe|backen|Toast|Käse|Löcher|Milch|Maus|Gouda|Streichkäse|Ei|Huhn|Dotter|Schale|Ostern|brüten|Milch|Kuh|trinken|weiß|Kakao|Flasche|Kaffee|Bohnen|Tasse|wach|Koffein|mahlen|Wasser|trinken|nass|H2O|Durst|Meer|Schnee|Winter|weiß|kalt|Flocke|Skifahren|Hitze|Sonne|scheinen|warm|Sommer|Sonnenbrand|Himmel|Mond|Nacht|rund|Mondlandung|Krater|Haus|wohnen|Dach|Tür|Wände|Miete|Tür|Klinke|öffnen|Eingang|Zimmer|hineingehen|Fenster|Glas|Rahmen|durchsichtig|öffnen|Aussicht|Stuhl|sitzen|Beine|Lehne|Tisch|Hocker|Tisch|Essen|Platte|Beine|Stühle|abräumen|Bett|schlafen|Kissen|Decke|Matratze|einschlafen|Lampe|Licht|anmachen|dunkel|Glühbirne|leuchten|Uhr|Zeit|Zeiger|tickt|Wecker|ablesen|Schlüssel|Schloss|aufsperren|Tür|Bart|verloren|Brille|sehen|Glas|Nase|Sehstärke|Lesen|Schuh|Fuß|Schnürsenkel|laufen|Paar|Absatz|Hut|Kopf|bedecken|Mütze|Krempe|aufsetzen|Jacke|anziehen|Ärmel|Reißverschluss|warm|Mantel|Hose|Beine|Jeans|anziehen|Gürtel|Tasche|Kleid|anziehen|Rock|Mädchen|Damen|festlich|Kuchen|backen|süß|Torte|Geburtstag|Teig|Schokolade|Kakao|süß|Tafel|Nuss|Praline|Bonbon|lutschen|süß|Zucker|Wickler|klebrig|Eis|kalt|süß|Kugel|Waffel|Sommer|Bier|trinken|Alkohol|Fass|durstig|Krug|Wein|Traube|rot|Alkohol|Glas|Kellerei|Buch|lesen|Seiten|Autor|Bibliothek|Kapitel|Zeitung|Nachrichten|Papier|lesen|täglich|Artikel|Brief|Post|schreiben|Umschlag|Briefmarke|Absender|Paket|Post|Kartons|auspacken|DHL|Bestellung|Geld|bezahlen|Münzen|Scheine|reich|Portemonnaie|Bank|Geld|Konto|Kredit|Sparen|Schalter|Urlaub|Reise|Erholung|Hotel|frei|Strand|Koffer|packen|Kleidung|Reise|Flughafen|mitnehmen|Zelt|campen|Schlafsack|Natur|Festival|aufbauen|Strand|Meer|Sand|baden|Muscheln|Urlaub|Weihnachten|Tannenbaum|Geschenke|Dezember|Heiligabend|Familie|Ostern|Hase|Eier|Frühling|suchen|Feiertag|Hochzeit|Braut|heiraten|Ringe|Bräutigam|Feier|Party|feiern|Tanz|Gäste|Geburtstag|Mitternacht|Tanz|feiern|Musik|laut|DJ|Disco|Musik|laut|hören|Band|Konzert|Lied|Gitarre|spielen|Saiten|Musik|Rock|Akkorde|Trommel|Schlagzeug|Rhythmus|laut|Sticks|Parade|Klavier|Tasten|spielen|Flügel|Musik|schwarzweiß|Geige|Streichinstrument|Bogen|Saiten|Orchester|klassisch|Tanzen|Bewegung|Musik|Ballett|Schritte|Rhythmus|Sport|Bewegung|anstrengend|Verein|Wettkampf|fit|Schwimmen|Wasser|Becken|Badehose|Bahn|nass|Laufen|rennen|schnell|Beine|Marathon|Schuhe|Tennis|Schläger|Netz|Aufschlag|Filzball|Platz|Basketball|Korb|werfen|Dunk|NBA|dribbeln|Skifahren|Schnee|Berge|Piste|Lift|Stöcke|Zirkus|Clowns|Manege|Artisten|Zelt|Vorstellung|Theater|Bühne|Schauspieler|Vorhang|Stück|Applaus|Museum|Ausstellung|Bilder|alt|Eintritt|Kunst|Zauberer|Tricks|Hut|Kaninchen|Magie|verschwinden|Clown|lustig|Nase|Zirkus|schminken|Lachen|Pirat|Schiff|Augenklappe|Schatz|Enterhaken|Papagei|Ritter|Rüstung|Schwert|Mittelalter|Burg|Pferd|Cowboy|Pferd|Hut|Wildwest|Lasso|Revolver|König|Krone|herrschen|Thron|Königreich|Adel|Prinzessin|Schloss|hübsch|Märchen|Prinz|Frosch|Feuerwehr|Feuer|löschen|rot|Schlauch|Brand|Polizei|Verbrecher|blau|Sirene|festnehmen|Uniform|Krankenhaus|krank|Arzt|Operation|Bett|Besuchszeit|Apotheke|Schule|Medikamente|Rezept|Pillen|krank|Tierarzt|Tiere|Hund|Katze|Praxis|impfen|Bäcker|Brot|Brötchen|Mehl|früh|Teig|Metzger|Fleisch|Wurst|Schlachter|Theke|frisch|Friseur|Haare|schneiden|Salon|Frisur|Waschen|Koch|Essen|Restaurant|Mütze|kochen|Rezept|Kellner|Restaurant|bestellen|Trinkgeld|servieren|Tablett|Lehrer|Schule|Tafel|Klasse|Hausaufgaben|Noten|Pilot|Flugzeug|fliegen|Cockpit|Uniform|Landung|Kapitän|Schiff|steuern|Uniform|Brücke|Mannschaft|Bauer|Feld|Traktor|Ernte|Tiere|Hof|Gärtner|Pflanzen|Blumen|Rasen|gießen|Hecke|Maler|Farbe|Pinsel|Wand|Bild|streichen|Musiker|Instrument|Band|üben|Konzert|Auftritt|Sänger|Schauspieler|Film|Rolle|Dreh|Oscar|Baby|klein|Windel|Fläschchen|weinen|Kinderwagen|Kind|klein|spielen|Junge|Mädchen|Schule|Freund|spielen|gemeinsam|Spaß|beste|lachen|Nachbar|nebenan|Zaun|klingeln|Haus|grüßen|Familie|Verwandte|Eltern|Kinder|Stammbaum|Zuhause|Oma|alt|Enkel|Strick|Kuchen|lieb|Opa|alt|Enkel|Bart|weise|Geschichten|Vogel|fliegen|Federn|Schnabel|Nest|zwitschern|Fisch|Wasser|Flossen|Kiemen|Aquarium|schwimmen|Pferd|reiten|Mähne|Galopp|Stall|Sattel|Kuh|Milch|Muh|Weide|Kalb|Euter|Schwein|rosa|grunzen|Mast|Ferkel|Schlamm|Schaf|Wolle|blöken|Weide|Herde|Zaun|Huhn|Ei|gackern|Stall|Körner|picken|Ente|Wasser|quaken|Schnabel|Teich|federn|Biene|Honig|stechen|gelb|Imker|Wabe|Schmetterling|Raupe|bunt|Flügel|Sommer|flattern|Spinne|Netz|Beine|eklig|weben|Fäden|Ameise|klein|Staat|fleißig|Haufen|rot|Maus|klein|Käse|Computer|nagen|grau|Elefant|groß|Rüssel|Afrika|grau|Stoßzähne|Löwe|brüllen|Mähne|Raubtier|Savanne|König der Tiere|Tiger|Streifen|Raubtier|Dschungel|brüllen|gefährlich|Bär|Honig|Wald|stark|Winterruhe|Tatze|Affe|Banane|klettern|Dschungel|Zooschwanz|lustig|Frosch|quaken|grün|Teich|hüpfen|Laich|Schlange|zischen|giftig|häuten|lang|kriechen|Krokodil|Hai|gefährlich|Zähne|beißen|Angst|Delfin|Meer|intelligent|springen|Flosse|Wassershow|Wal|groß|Meer|Blas|Plankton|riesig|Pinguin|Südpol|watscheln|schwarzweiß|Eis|Fisch|Eisbär|weiß|Nordpol|Eis|Fisch|Bär|Adler|Vogel|Horst|Greifvogel|Flügel|Schnabel|Eule|nachtaktiv|weise|Baum|Uhu|Vogel|Fledermaus|Nacht|Höhle|Flügel|Vampir|Maus|Igel|Eichhörnchen|Baum|Nüsse|buschig|Winter|Kaninchen|Hase|Ohren|hoppeln|Möhre|Stall|Hamster|Backen|Käfig|klein|Laufrad|Futter|Schwan|weiß|See|Hals|Federn|elegant|Wildschwein|Wald|grunzen|stark|Hauer|scheu|Fohlen|jung|Pferd|Weide|reiten|Mähne|Hahn|morgens|krähen|Huhn|Stall|Kamm|Gans|fett|Federn|schnattern|Weihnachten|Teich|Ziege|Bart|meckern|Weide|Milch|Bock|Lamm|jung|Weide|blöken|Wolle|Schaf|Kalb|jung|Milch|Weide|Muh|Kuh|Bauernhof|Traktor|Feld|Tiere|Hof|Ernte|Esel|grau|stur|Ohren|Lasten|Maultier|Pony|Pferd|klein|reiten|Mähne|Kinder|Kamel|Wüste|Höcker|Sand|Karawane|Zoo').split('|');
const WV_CARDS = [];
for (let i = 0; i + 5 < WV_RAW.length; i += 6) WV_CARDS.push(WV_RAW.slice(i, i + 6));

io.on('connection', (socket) => {
  socket.emit('hello', { app: 'partyplay' });

  socket.on('create-room', ({ name, game, pid, avatar } = {}, cb) => {
    try {
      const code = newCode();
      const room = { code, players: new Map(), game: game || 'quiz', quiz: null, chess: null, fr: null, hostId: socket.id };
      rooms.set(code, room);
      socket.join(code);
      socket.data.code = code;
      room.players.set(socket.id, { id: socket.id, name: (name || 'TV').slice(0, 24), pid: String(pid || '').slice(0, 32) || null, avatar: pickAvatar(avatar), online: true });
      ensureGame(room);
      broadcast(code);
      cb && cb({ ok: true, code });
    } catch (e) { cb && cb({ ok: false, err: String(e && e.message || e) }); }
  });

  socket.on('join-room', ({ code, name, pid, avatar } = {}, cb) => {
    try {
      code = String(code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return cb && cb({ ok: false, err: 'Raum gibt es nicht – Code auf dem TV prüfen' });
      socket.join(code);
      socket.data.code = code;
      pid = String(pid || '').slice(0, 32) || null;
      let oldId = null;
      if (pid) for (const [id, p] of room.players) if (p.pid && p.pid === pid && id !== socket.id) { oldId = id; break; }
      if (oldId) {
        const kept = room.players.get(oldId);
        relinkRoom(room, oldId, socket.id, { id: socket.id, name: kept.name, pid, avatar: kept.avatar || '🙂', online: true, lastSeen: Date.now() });
      } else {
        room.players.set(socket.id, { id: socket.id, name: String(name || 'Spieler').slice(0, 24) || 'Spieler', pid, avatar: pickAvatar(avatar), online: true, lastSeen: Date.now() });
      }
      ensureGame(room);
      if (room.quiz && room.quiz.scores[socket.id] === undefined) room.quiz.scores[socket.id] = 0;
      broadcast(code);
      cb && cb({ ok: true, code, state: roomState(room), relinked: !!oldId });
    } catch (e) { cb && cb({ ok: false, err: String(e && e.message || e) }); }
  });

  // Host wirft einen Spieler raus (Rumpus: kick)
  socket.on('host:kick', ({ playerId } = {}, cb) => {
    const room = rooms.get(socket.data.code);
    if (!room || socket.id !== room.hostId) return cb && cb({ ok: false, err: 'Nur der Host (TV)' });
    if (!playerId || !room.players.has(playerId) || playerId === room.hostId) return cb && cb({ ok: false });
    removePlayer(room, playerId);
    const s = io.sockets.sockets.get(playerId);
    if (s) { try { s.emit('kicked'); s.disconnect(true); } catch (e) {} }
    broadcast(room.code);
    cb && cb({ ok: true });
  });

  socket.on('select-game', ({ game } = {}) => {
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
  socket.on('quiz:answer', ({ choice } = {}) => {
    const room = rooms.get(socket.data.code); if (!room || !room.quiz || room.quiz.phase !== 'question') return;
    if (socket.id === room.hostId) return; // TV antwortet nicht
    if (room.quiz.answers[socket.id] !== undefined) return;
    room.quiz.answers[socket.id] = choice;
    const needed = Math.max(1, [...room.players.values()].filter(p => p.online !== false && p.id !== room.hostId).length); // nur Online-Spieler (ohne TV-Host)
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
  socket.on('chess:seat', ({ color } = {}) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'chess'; ensureGame(room);
    if (color === 'w') room.chess.whiteId = socket.id;
    if (color === 'b') room.chess.blackId = socket.id;
    broadcast(room.code);
  });
  socket.on('chess:move', ({ from, to } = {}, cb) => {
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
  socket.on('fr:play', ({ cardId, color } = {}, cb) => {
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
  socket.on('slf:start', ({ cats } = {}) => {
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
  socket.on('slf:submit', ({ answers } = {}) => {
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
  socket.on('slf:toggle', ({ pid, cat } = {}) => {
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
  socket.on('vier:seat', ({ color } = {}) => {
    const room = rooms.get(socket.data.code); if (!room) return;
    room.game = 'vier'; ensureGame(room);
    if (color === 'R') room.vier.rId = socket.id;
    if (color === 'Y') room.vier.yId = socket.id;
    broadcast(room.code);
  });
  socket.on('vier:drop', ({ col } = {}, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.vier || room.vier.winner) return cb && cb({ ok: false, err: room && room.vier && room.vier.winner ? 'Spiel vorbei – Neues Spiel starten' : 'Kein Vier-Spiel' });
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
  socket.on('wolf:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false, err: 'Kein Raum' });
    const ids = [...room.players.keys()].filter(id => id !== room.hostId && (room.players.get(id) || {}).online !== false);
    if (ids.length < 4) return cb && cb({ ok: false, err: 'Mind. 4 Mitspieler nötig (Dorf & Wölfe)' });
    room.game = 'wolf';
    const roles = wolfMakeRoles(ids);
    const alive = {}; for (const id of ids) alive[id] = true;
    room.wolf = { phase: 'night', roles, alive, votes: {}, nightVotes: {}, log: ['🌙 Die Nacht bricht an. Wölfe und Seherin handeln auf dem Handy.'], winner: null };
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wolf:role', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wolf) return socket.emit('wrole', null);
    socket.emit('wrole', room.wolf.roles[socket.id] || null);
  });
  socket.on('wolf:action', ({ target } = {}, cb) => {
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
  socket.on('wolf:vote', ({ target } = {}, cb) => {
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

  socket.on('fr:skip', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.fr || room.fr.winner || !room.fr.order.length) return;
    room.fr.turnIdx = (room.fr.turnIdx + 1) % room.fr.order.length;
    broadcast(room.code);
  });

  // Geheimworte
  socket.on('gw:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false });
    room.game = 'gw';
    const n = [...room.players.keys()].filter(id => id !== room.hostId).length;
    if (n < 3) return cb && cb({ ok: false, err: 'Mind. 3 Mitspieler nötig (2 Chefs + Rater)' });
    const g = gwNew();
    g.log.push('🕵️ Neue Runde – Rot beginnt (9 Wörter), Blau hat 8.');
    room.gw = g;
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('gw:seat', ({ team } = {}) => {
    const room = rooms.get(socket.data.code); if (!room || !room.gw) return;
    if (team === 'R') room.gw.chefR = socket.id;
    if (team === 'B') room.gw.chefB = socket.id;
    broadcast(room.code);
  });
  socket.on('gw:key', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.gw) return socket.emit('gkey', null);
    if (socket.id === room.gw.chefR || socket.id === room.gw.chefB) socket.emit('gkey', room.gw.key);
    else socket.emit('gkey', null);
  });
  socket.on('gw:hint', ({ word, n } = {}, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.gw || room.gw.phase !== 'hint' || room.gw.winner) return cb && cb({ ok: false });
    const chef = room.gw.turn === 'R' ? room.gw.chefR : room.gw.chefB;
    if (socket.id !== chef) return cb && cb({ ok: false, err: 'Nur der Chef des ziehenden Teams gibt Hinweise' });
    word = String(word || '').trim().slice(0, 24);
    n = Math.max(1, Math.min(9, parseInt(n, 10) || 1));
    if (!word) return cb && cb({ ok: false, err: 'Hinweiswort fehlt' });
    room.gw.hint = { word, n };
    room.gw.phase = 'guess'; room.gw.left = n + 1;
    room.gw.log.push((room.gw.turn === 'R' ? '🔴' : '🔵') + ' Hinweis: „' + word + '“ – ' + n);
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('gw:guess', ({ idx } = {}, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.gw || room.gw.phase !== 'guess' || room.gw.winner) return cb && cb({ ok: false });
    if (socket.id === room.gw.chefR || socket.id === room.gw.chefB) return cb && cb({ ok: false, err: 'Chefs raten nicht – das Team tippt!' });
    idx = parseInt(idx, 10);
    if (!(idx >= 0 && idx < 25) || room.gw.revealed[idx]) return cb && cb({ ok: false, err: 'Schon aufgedeckt' });
    const g = room.gw, k = g.key[idx], team = g.turn;
    g.revealed[idx] = true;
    const w = g.words[idx];
    if (k === 'A') {
      g.winner = team === 'R' ? 'B' : 'R';
      g.phase = 'done';
      g.log.push('💀 ATTENTÄTER „' + w + '“! ' + (g.winner === 'R' ? 'Rot' : 'Blau') + ' gewinnt.');
    } else if (k === team) {
      g.log.push('✅ „' + w + '“ richtig!');
      if (gwLeft(g, team) === 0) { g.winner = team; g.phase = 'done'; g.log.push('🏆 ' + (team === 'R' ? 'Rot' : 'Blau') + ' hat alle Wörter!'); }
      else { g.left--; if (g.left <= 0) { g.phase = 'hint'; g.turn = team === 'R' ? 'B' : 'R'; g.hint = null; g.log.push('Wechsel zu ' + (g.turn === 'R' ? 'Rot 🔴' : 'Blau 🔵')); } }
    } else {
      g.log.push('❌ „' + w + '“ war ' + (k === 'N' ? 'neutral' : (k === 'R' ? 'ROT' : 'BLAU')) + '. Wechsel.');
      g.phase = 'hint'; g.turn = team === 'R' ? 'B' : 'R'; g.hint = null;
    }
    broadcast(room.code);
    cb && cb({ ok: true, color: k });
  });
  socket.on('gw:pass', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.gw || room.gw.phase !== 'guess') return;
    room.gw.phase = 'hint'; room.gw.turn = room.gw.turn === 'R' ? 'B' : 'R'; room.gw.hint = null;
    room.gw.log.push('⏭ Freiwillig gepasst – ' + (room.gw.turn === 'R' ? 'Rot 🔴' : 'Blau 🔵') + ' ist dran.');
    broadcast(room.code);
  });

  // Bluff-Poker
  socket.on('bluff:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false });
    room.game = 'bluff';
    room.bluffChips = room.bluffChips || {};
    const ids = [...room.players.keys()].filter(id => id !== room.hostId && (room.players.get(id) || {}).online !== false);
    for (const id of ids) if (room.bluffChips[id] === undefined) room.bluffChips[id] = 100;
    let order = ids.filter(id => (room.bluffChips[id] || 0) >= 10);
    if (order.length < 2) return cb && cb({ ok: false, err: 'Mind. 2 Spieler mit 10+ Chips nötig' });
    let dealer = room.bluffDealer;
    dealer = order.includes(dealer) ? order[(order.indexOf(dealer) + 1) % order.length] : order[0];
    room.bluffDealer = dealer;
    const di = order.indexOf(dealer);
    order = [...order.slice(di + 1), ...order.slice(0, di + 1)];
    const deck = pokerDeck(), hole = {};
    for (const id of order) hole[id] = [deck.pop(), deck.pop()];
    room.bluff = { order, hole, community: [], deck, pot: 0, phase: 'preflop', acted: [], paid: {}, folded: {}, winners: [], winDesc: null, dealer, log: ['🃏 Neue Hand – Dealer: ' + nameOf(room, dealer) + '. Pro Straße 10 zum Mitgehen (fix, v1 ohne Erhöhen).'] };
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('bluff:hand', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.bluff) return socket.emit('bhand', null);
    socket.emit('bhand', (room.bluff.hole[socket.id] || null));
  });
  socket.on('bluff:action', ({ act } = {}, cb) => {
    const room = rooms.get(socket.data.code);
    const b = room && room.bluff;
    if (!b || b.phase === 'done') return cb && cb({ ok: false, err: 'Kein laufendes Spiel' });
    const need = bluffNeedsAction(b, room);
    if (need[0] !== socket.id) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    const BET = 10, paid = b.paid[socket.id] || 0, me = nameOf(room, socket.id);
    if (act === 'fold') {
      b.folded[socket.id] = true; b.acted.push(socket.id);
      b.log.push('🚶 ' + me + ' foldet.');
    } else if (act === 'call' || (act === 'check' && paid >= BET)) {
      const chips = room.bluffChips[socket.id] || 0;
      const pay = Math.min(Math.max(0, BET - paid), chips);
      room.bluffChips[socket.id] = chips - pay; b.pot += pay; b.paid[socket.id] = paid + pay;
      b.acted.push(socket.id);
      b.log.push((pay > 0 ? '💰 ' + me + ' zahlt ' + pay + '.' : '👌 ' + me + ' checkt.'));
    } else if (act === 'check') return cb && cb({ ok: false, err: 'Geht nicht – 10 zahlen oder folden' });
    else return cb && cb({ ok: false, err: 'Unbekannte Aktion' });
    bluffAdvance(b, room);
    broadcast(room.code);
    cb && cb({ ok: true });
  });

  // Malen & Raten
  socket.on('mr:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false });
    room.game = 'mr';
    room.mrScores = room.mrScores || {};
    const ids = [...room.players.keys()].filter(id => id !== room.hostId && (room.players.get(id) || {}).online !== false);
    if (ids.length < 2) return cb && cb({ ok: false, err: 'Mind. 2 Mitspieler nötig' });
    let drawer = room.mrDrawer;
    drawer = ids.includes(drawer) ? ids[(ids.indexOf(drawer) + 1) % ids.length] : ids[0];
    room.mrDrawer = drawer;
    const word = MR_WORDS[Math.floor(Math.random() * MR_WORDS.length)];
    if (room.mr && room.mr.timer) clearTimeout(room.mr.timer);
    room.mr = { drawerId: drawer, word, wordLen: word.length, strokes: [], phase: 'draw', round: (room.mr ? room.mr.round + 1 : 1), guessed: [], timer: null };
    room.mr.timer = setTimeout(() => {
      if (room.mr && room.mr.phase === 'draw') {
        room.mr.phase = 'done';
        room.mr.logExtra = 'Zeit um! Das Wort war „' + room.mr.word + '“.';
        broadcast(room.code);
      }
    }, 90000);
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('mr:word', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.mr) return socket.emit('mword', null);
    socket.emit('mword', socket.id === room.mr.drawerId ? room.mr.word : null);
  });
  socket.on('mr:stroke', ({ stroke } = {}) => {
    const room = rooms.get(socket.data.code); if (!room || !room.mr || room.mr.phase !== 'draw') return;
    if (socket.id !== room.mr.drawerId || !stroke || !Array.isArray(stroke.pts)) return;
    const pts = stroke.pts.filter(p => Array.isArray(p) && p.length === 2).slice(0, 200)
      .map(([x, y]) => [Math.max(0, Math.min(500, +x || 0)), Math.max(0, Math.min(500, +y || 0))]);
    if (!pts.length) return;
    const col = ['#111111', '#dc2626', '#2563eb', '#16a34a', '#d97706'].includes(stroke.c) ? stroke.c : '#111111';
    room.mr.strokes.push({ c: col, w: 4, pts });
    if (room.mr.strokes.length > 300) room.mr.strokes.shift();
    broadcast(room.code);
  });
  socket.on('mr:clear', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.mr) return;
    if (socket.id !== room.mr.drawerId) return;
    room.mr.strokes = [];
    broadcast(room.code);
  });
  socket.on('mr:guess', ({ text } = {}, cb) => {
    const room = rooms.get(socket.data.code); if (!room || !room.mr || room.mr.phase !== 'draw') return cb && cb({ ok: false });
    if (socket.id === room.mr.drawerId) return cb && cb({ ok: false, err: 'Der Maler rät nicht' });
    if (room.mr.guessed.includes(socket.id)) return cb && cb({ ok: true, right: true });
    const norm = s => String(s || '').trim().toLowerCase().replace(/ß/g, 'ss');
    if (norm(text) === norm(room.mr.word)) {
      room.mr.guessed.push(socket.id);
      room.mrScores[socket.id] = (room.mrScores[socket.id] || 0) + 100;
      room.mrScores[room.mr.drawerId] = (room.mrScores[room.mr.drawerId] || 0) + 50;
      broadcast(room.code);
      cb && cb({ ok: true, right: true });
    } else cb && cb({ ok: true, right: false });
  });
  socket.on('mr:end', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.mr) return;
    if (room.mr.timer) clearTimeout(room.mr.timer);
    room.mr.phase = 'done';
    room.mr.logExtra = 'Runde beendet. Das Wort war „' + room.mr.word + '“.';
    broadcast(room.code);
  });

  // Würfelglück
  socket.on('wg:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false });
    room.game = 'wg';
    const order = [...room.players.keys()].filter(id => id !== room.hostId && (room.players.get(id) || {}).online !== false);
    if (order.length < 1) return cb && cb({ ok: false, err: 'Mind. 1 Mitspieler nötig' });
    const sheets = {};
    for (const id of order) { sheets[id] = {}; for (const [c] of WG_CATS) sheets[id][c] = null; }
    room.wg = { order, sheets, turnIdx: 0, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rollsLeft: 3, done: false, winners: [] };
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wg:roll', (cb) => {
    const room = rooms.get(socket.data.code);
    const w = room && room.wg;
    if (!w || w.done) return cb && cb({ ok: false });
    if (w.order[w.turnIdx] !== socket.id) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    if (w.rollsLeft <= 0) return cb && cb({ ok: false, err: 'Keine Würfe übrig – Kategorie wählen' });
    w.dice = w.dice.map((d, i) => w.held[i] ? d : 1 + Math.floor(Math.random() * 6));
    w.rollsLeft--;
    broadcast(room.code);
    cb && cb({ ok: true, dice: w.dice });
  });
  socket.on('wg:hold', ({ idx } = {}, cb) => {
    const room = rooms.get(socket.data.code);
    const w = room && room.wg;
    if (!w || w.done) return cb && cb({ ok: false });
    if (w.order[w.turnIdx] !== socket.id) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    if (w.rollsLeft >= 3) return cb && cb({ ok: false, err: 'Erst würfeln' });
    idx = parseInt(idx, 10);
    if (!(idx >= 0 && idx < 5)) return cb && cb({ ok: false });
    w.held[idx] = !w.held[idx];
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wg:score', ({ cat } = {}, cb) => {
    const room = rooms.get(socket.data.code);
    const w = room && room.wg;
    if (!w || w.done) return cb && cb({ ok: false });
    if (w.order[w.turnIdx] !== socket.id) return cb && cb({ ok: false, err: 'Nicht am Zug' });
    if (w.rollsLeft >= 3) return cb && cb({ ok: false, err: 'Erst würfeln' });
    if (!WG_CATS.some(([c]) => c === cat) || w.sheets[socket.id][cat] !== null) return cb && cb({ ok: false, err: 'Kategorie belegt' });
    w.sheets[socket.id][cat] = wgScore(w.dice, cat);
    wgNext(room);
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wg:skip', () => {
    const room = rooms.get(socket.data.code);
    const w = room && room.wg;
    if (!w || w.done) return;
    wgNext(room);
    broadcast(room.code);
  });

  // Wortverbot
  socket.on('wv:start', (cb) => {
    const room = rooms.get(socket.data.code); if (!room) return cb && cb({ ok: false });
    room.game = 'wv';
    const ids = [...room.players.keys()].filter(id => id !== room.hostId && (room.players.get(id) || {}).online !== false);
    if (ids.length < 4) return cb && cb({ ok: false, err: 'Mind. 4 Mitspieler nötig (2 gegen 2)' });
    const teams = { A: [], B: [] };
    ids.forEach((id, i) => teams[i % 2 ? 'B' : 'A'].push(id));
    if (room.wv && room.wv.timer) clearTimeout(room.wv.timer);
    room.wv = { teams, explTeam: 'A', expIdx: { A: 0, B: -1 }, explainerId: teams.A[0], deck: wvShuffle(WV_CARDS), cardIdx: 0, scores: { A: 0, B: 0 }, phase: 'play', timer: null, lastResult: 'Team A beginnt – erklärt: ' + nameOf(room, teams.A[0]) };
    wvSetTimer(room);
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wv:card', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wv) return socket.emit('vcard', null);
    const w = room.wv;
    const inTeam = t => (w.teams[t] || []).includes(socket.id);
    const myTeam = inTeam('A') ? 'A' : inTeam('B') ? 'B' : null;
    if (socket.id === w.explainerId || (myTeam && myTeam !== w.explTeam)) socket.emit('vcard', w.deck[w.cardIdx % w.deck.length]);
    else socket.emit('vcard', null);
  });
  socket.on('wv:next', ({ mode } = {}, cb) => {
    const room = rooms.get(socket.data.code);
    const w = room && room.wv;
    if (!w || w.phase !== 'play') return cb && cb({ ok: false });
    const other = w.explTeam === 'A' ? 'B' : 'A';
    if (mode === 'right' && socket.id === w.explainerId) {
      w.scores[w.explTeam]++;
      w.lastResult = '✅ +1 für Team ' + w.explTeam;
    } else if (mode === 'skip' && socket.id === w.explainerId) {
      w.lastResult = '⏭ Übersprungen (0 P).';
    } else if (mode === 'foul' && w.teams[other].includes(socket.id)) {
      w.scores[other]++;
      w.lastResult = '🤐 Verstoß! +1 für Team ' + other + '.';
    } else return cb && cb({ ok: false, err: 'Nicht berechtigt' });
    w.cardIdx++;
    broadcast(room.code);
    cb && cb({ ok: true });
  });
  socket.on('wv:endturn', () => {
    const room = rooms.get(socket.data.code); if (!room || !room.wv) return;
    wvEndTurn(room, false);
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    if (!code) return;
    const room = rooms.get(code); if (!room) return;
    const leftName = nameOf(room, socket.id) || 'Spieler';
    const entry = room.players.get(socket.id);
    if (entry) { entry.online = false; entry.lastSeen = Date.now(); }
    const anyOnline = [...room.players.values()].some(p => p.online !== false);
    if (!anyOnline) { if (room.quiz?.timer) clearTimeout(room.quiz.timer); if (room.slf?.timer) clearTimeout(room.slf.timer); if (room.mr?.timer) clearTimeout(room.mr.timer); if (room.wv?.timer) clearTimeout(room.wv.timer); rooms.delete(code); return; }
    if (room.wolf && room.wolf.alive[socket.id]) room.wolf.log.push('🚪 ' + leftName + ' kurz weg – Reconnect stellt alles wieder her.');
    if (room.bluff && room.bluff.phase !== 'done' && !room.bluff.folded[socket.id] && room.bluff.order.includes(socket.id)) {
      room.bluff.folded[socket.id] = true; room.bluff.acted.push(socket.id);
      room.bluff.log.push('🚪 ' + leftName + ' getrennt – Hand automatisch gefoldet.');
      bluffAdvance(room.bluff, room);
    }
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
  if (room.game === 'gw' && (!room.gw || reset)) room.gw = null;
  if (room.game === 'bluff' && (!room.bluff || reset)) room.bluff = null;
  if (room.game === 'mr' && (!room.mr || reset)) { if (room.mr && room.mr.timer) clearTimeout(room.mr.timer); room.mr = null; }
  if (room.game === 'wg' && (!room.wg || reset)) room.wg = null;
  if (room.game === 'wv' && (!room.wv || reset)) { if (room.wv && room.wv.timer) clearTimeout(room.wv.timer); room.wv = null; }
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
  room.quiz.lastResult = { correct, correctText: QUIZ[room.quiz.qIndex].choices[correct], question: QUIZ[room.quiz.qIndex].q, detail: res };
  room.quiz.phase = 'reveal';
  broadcast(room.code);
}

// Karteileichen: offline >10 Min → aus Spiel entfernen (Sitz/Hand/Punkte aufräumen)
setInterval(() => {
  for (const [code, room] of rooms) {
    let changed = false;
    for (const [id, p] of [...room.players]) {
      if (p.online === false && Date.now() - (p.lastSeen || 0) > 10 * 60 * 1000) {
        removePlayer(room, id); changed = true;
      }
    }
    if (room.fr && room.fr.order.length) room.fr.turnIdx %= room.fr.order.length;
    if (![...room.players.values()].some(p => p.online !== false)) {
      if (room.quiz?.timer) clearTimeout(room.quiz.timer);
      if (room.slf?.timer) clearTimeout(room.slf.timer);
      if (room.mr?.timer) clearTimeout(room.mr.timer);
      if (room.wv?.timer) clearTimeout(room.wv.timer);
      rooms.delete(code); continue;
    }
    if (changed) broadcast(code);
  }
}, 60000);

// Letzte Verteidigung: kein Client-Event darf den Party-Server killen.
// Volle Fehlerkette loggen, Prozess läuft weiter (Räume sind kurzlebig).
process.on('uncaughtException', (err) => {
  console.error('==============================================================');
  console.error('[partyplay] UNCAUGHT (Server läuft weiter):', err && err.stack || err);
  console.error('==============================================================');
});

server.listen(PORT, HOST, () => console.log(`partyplay läuft auf http://${HOST}:${PORT}`));
module.exports = { server, eval5, best7, cmpScore, wgScore, wgTotal, bingoWin, vierWin, legalMovesMap };
