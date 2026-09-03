'use strict';
const qs = new URLSearchParams(location.search);
const CODE = (qs.get('room') || '').toUpperCase();
const s = io();
let TVPID = null;
try { TVPID = localStorage.getItem('pp_pid'); if (!TVPID) { TVPID = 'tv-' + Math.random().toString(36).slice(2); localStorage.setItem('pp_pid', TVPID); } } catch (e) { TVPID = null; }
document.getElementById('code').textContent = CODE;
document.getElementById('url').textContent = location.origin + '/play?room=' + CODE;
const stage = document.getElementById('stage'), playersEl = document.getElementById('players');
let S = null;
s.emit('join-room', { code: CODE, name: 'TV', pid: TVPID }, r => { if (!r.ok) stage.innerHTML = '<div class="card">Fehler: ' + r.err + '</div>'; });
s.on('state', st => { S = st; render(); });
function sel(g) { s.emit('select-game', { game: g }); }
function q(ev) { s.emit(ev); }
const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
function render() {
  if (!S) return;
  document.getElementById('quizCtl').style.display = S.game === 'quiz' ? '' : 'none';
  document.getElementById('chessCtl').style.display = S.game === 'chess' ? '' : 'none';
  document.getElementById('frCtl').style.display = S.game === 'fr' ? '' : 'none';
  document.getElementById('slfCtl').style.display = S.game === 'slf' ? '' : 'none';
  document.getElementById('bingoCtl').style.display = S.game === 'bingo' ? '' : 'none';
  document.getElementById('vierCtl').style.display = S.game === 'vier' ? '' : 'none';
  document.getElementById('wolfCtl').style.display = S.game === 'wolf' ? '' : 'none';
  document.getElementById('gwCtl').style.display = S.game === 'gw' ? '' : 'none';
  document.getElementById('bluffCtl').style.display = S.game === 'bluff' ? '' : 'none';
  document.getElementById('mrCtl').style.display = S.game === 'mr' ? '' : 'none';
  document.getElementById('wgCtl').style.display = S.game === 'wg' ? '' : 'none';
  document.getElementById('wvCtl').style.display = S.game === 'wv' ? '' : 'none';
  playersEl.innerHTML = S.players.map(p => {
    let sc = ''; if (S.quiz) sc = ' – ' + (S.quiz.scores[p.id] || 0) + ' P';
    if (S.slf) sc = ' – ' + (S.slf.scores[p.id] || 0) + ' P';
    return '<div><span class="' + (p.online === false ? 'off' : 'on') + '">●</span> ' + esc(p.name) + sc + '</div>';
  }).join('') || '<span class="muted">Noch niemand verbunden – Code am Handy eingeben.</span>';
  if (S.game === 'quiz') renderQuiz(); else if (S.game === 'chess') renderChess(); else if (S.game === 'fr') renderFr();
  else if (S.game === 'slf') renderSlf(); else if (S.game === 'bingo') renderBingo(); else if (S.game === 'vier') renderVier(); else if (S.game === 'wolf') renderWolf();
  else if (S.game === 'gw') renderGw(); else if (S.game === 'bluff') renderBluff(); else if (S.game === 'mr') renderMr(); else if (S.game === 'wg') renderWg(); else renderWv();
}
function renderQuiz() {
  if (!S.quiz || S.quiz.phase === 'lobby') { stage.innerHTML = '<div class="tv-big">Quiz bereit – „Quiz starten“ drücken</div>'; return; }
  if (S.quiz.phase === 'done') {
    const rank = S.players.map(p => ({ n: p.name, s: S.quiz.scores[p.id] || 0 })).sort((a, b) => b.s - a.s);
    stage.innerHTML = '<div class="card"><h2>Endergebnis</h2>' + rank.map((r, i) => `<div>${i + 1}. ${esc(r.n)} – ${r.s} P</div>`).join('') + '</div>';
    return;
  }
  if (S.quiz.phase === 'reveal') {
    stage.innerHTML = `<div class="card"><h2>Richtige Antwort: ${esc(S.quiz.current ? '' : '')}</h2>
      <div class="tv-big">${esc(String(S.quiz.lastResult.correct + 1))}</div>
      <div>${(S.quiz.lastResult.detail || []).map(d => `<div>${d.ok ? '✅' : '❌'} ${esc(d.name)}</div>`).join('')}</div>
      <p class="muted">Am Handy „Weiter“? Nein – Weiter am TV drücken.</p></div>`;
    return;
  }
  const c = S.quiz.current;
  stage.innerHTML = `<div class="muted center">Frage ${S.quiz.qIndex + 1} / ${S.quiz.total} – am Handy antworten!</div>
    <div class="tv-big">${esc(c.q)}</div>` + c.choices.map((t, i) => `<div class="card center" style="font-size:24px"><b>${i + 1}.</b> ${esc(t)}</div>`).join('');
}
function renderChess() {
  const b = S.chess.board, last = S.chess.lastMove || {};
  const sq = (x, y) => 'abcdefgh'[x] + (8 - y);
  let h = '<div class="board">';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = b[y][x]; const cls = (x + y) % 2 ? 'b' : 'w';
    const isLast = last.from === sq(x, y) || last.to === sq(x, y);
    h += `<div class="sq ${cls}${isLast ? ' last' : ''}" style="color:${p ? (p.c === 'w' ? '#0f172a' : '#111827') : ''}">${p ? PIECES[p.t] : ''}</div>`;
  }
  h += '</div>';
  h += `<div class="center muted">Am Zug: <b>${S.chess.turn === 'w' ? 'Weiß' : 'Schwarz'}</b> · Weiß: ${esc(S.chess.white || '–')} · Schwarz: ${esc(S.chess.black || '–')}<br>Zug am Handy eingeben (z.B. E2 → E4). Verlauf: ${esc((S.chess.history || []).join(' '))}</div>`;
  stage.innerHTML = h;
}
function renderFr() {
  if (!S.fr) { stage.innerHTML = '<div class="tv-big">Farbrausch bereit – „Karten geben“ drücken</div>'; return; }
  const t = S.fr.top;
  stage.innerHTML = `<div class="muted center">Am Zug: <b>${esc(S.fr.turn)}</b> · Aktive Farbe: <b>${esc(S.fr.color)}</b></div>
    <div class="topcard U${S.fr.color}">${esc(t.value)} (${esc(t.color)})</div>
    <div class="card">${S.fr.counts.map(c => `<div>• ${esc(c.name)}: ${c.n} Karten</div>`).join('')}</div>
    ${S.fr.winner ? `<div class="tv-big">🏆 ${esc(S.fr.winner)} gewinnt!</div>` : ''}`;
}
function renderSlf() {
  if (!S.slf || S.slf.phase === 'lobby') { stage.innerHTML = '<div class="tv-big">Stadt-Land-Fluss bereit – „Runde starten“ drücken</div>'; return; }
  const L = S.slf;
  let h = `<div class="muted center">Runde ${L.round} · Buchstabe:</div><div class="tv-big">${esc(L.letter)}</div>`;
  h += `<div class="card center">Kategorien: ${L.cats.map(esc).join(' · ')}</div>`;
  if (L.phase === 'write') {
    h += '<div class="card"><h2>Schreiben… (Handy)</h2>' + Object.entries(L.progress).map(([id, n]) => {
      const p = S.players.find(x => x.id === id);
      return `<div>${n >= L.cats.length ? '✅' : '✏️'} ${esc(p ? p.name : '?')} (${n}/${L.cats.length})</div>`;
    }).join('') + '</div>';
  } else {
    h += '<div class="card"><h2>Kontrolle – Ungültiges antippen (TV-Fernbedienung/Maus)</h2>';
    for (const cat of L.cats) {
      h += `<h2>${esc(cat)}</h2>`;
      for (const p of S.players) {
        const w = (L.answers[p.id] || {})[cat] || '–';
        const ok = (L.valid[p.id] || {})[cat] !== false;
        h += `<div class="row"><div>${ok ? '✅' : '❌'} <b>${esc(p.name)}:</b> ${esc(w)}</div><button class="btn alt" onclick="s.emit('slf:toggle',{pid:'${p.id}',cat:'${esc(cat)}'})">Umschalten</button></div>`;
      }
    }
    h += '</div>';
    if (L.phase === 'done') {
      const rank = S.players.map(p => ({ n: p.name, s: L.scores[p.id] || 0 })).sort((a, b) => b.s - a.s);
      h += '<div class="card"><h2>Punktestand</h2>' + rank.map((r, i) => `<div>${i + 1}. ${esc(r.n)} – ${r.s} P</div>`).join('') + '</div>';
    }
  }
  stage.innerHTML = h;
}
function renderBingo() {
  if (!S.bingo) { stage.innerHTML = '<div class="tv-big">Bingo bereit – „Neues Spiel“ drücken</div>'; return; }
  const B = S.bingo;
  let h = `<div class="muted center">Gezogen: ${B.drawn.length}/75</div>`;
  h += `<div class="tv-big">${B.current ? '🎱 ' + B.current : '–'}</div>`;
  if (B.drawn.length) h += `<div class="card center">Letzte: ${B.drawn.slice(-8).join(', ')}</div>`;
  h += `<div class="card"><h2>Mitspieler (${B.players.length})</h2>${B.players.map(esc).join(', ')}</div>`;
  if (B.winner) h += `<div class="tv-big">🏆 BINGO! ${esc(B.winner)}</div>`;
  stage.innerHTML = h;
}
function renderVier() {
  if (!S.vier) { stage.innerHTML = '<div class="tv-big">Vier in einer Reihe – „Neues Spiel“</div>'; return; }
  const V = S.vier;
  let h = '<div class="vboard">';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const v = V.board[r][c];
    h += `<div class="vcell ${v === 'R' ? 'vr' : v === 'Y' ? 'vy' : ''}">${v ? '●' : ''}</div>`;
  }
  h += '</div>';
  h += `<div class="center muted">Am Zug: <b style="color:${V.turn === 'R' ? '#f87171' : '#facc15'}">${V.turn === 'R' ? '🔴 Rot' : '🟡 Gelb'}</b> · Rot: ${esc(V.r || '–')} · Gelb: ${esc(V.y || '–')}</div>`;
  if (V.winner === 'draw') h += '<div class="tv-big">Unentschieden!</div>';
  else if (V.winner) h += `<div class="tv-big">🏆 ${V.winner === 'R' ? 'Rot' : 'Gelb'} gewinnt!</div>`;
  stage.innerHTML = h;
}
function renderWolf() {
  if (!S.wolf || S.wolf.phase === 'lobby') { stage.innerHTML = '<div class="tv-big">Dorf & Wölfe bereit – Rollen verteilen (min. 4 Spieler + TV)</div>'; return; }
  const W = S.wolf;
  let h = `<div class="tv-big">${W.phase === 'night' ? '🌙 NACHT – alle schlafen ein…' : W.phase === 'day' ? '☀️ TAG – diskutiert & stimmt ab!' : '🏁 Spiel vorbei'}</div>`;
  h += '<div class="card"><h2>Dorfbewohner</h2>' + W.alive.map(a => {
    const p = S.players.find(x => x.id === a.id), on = !p || p.online !== false;
    return `<div>${a.alive ? (on ? '🧑' : '📴') : '💀'} ${esc(a.name)}${a.alive ? (on ? '' : ' (offline)') : ' (ausgeschieden)'}</div>`;
  }).join('') + '</div>';
  if (W.phase === 'day' && W.dayVotes) {
    const tally = {};
    for (const t of Object.values(W.dayVotes)) tally[t] = (tally[t] || 0) + 1;
    h += '<div class="card"><h2>Stimmen</h2>' + Object.entries(tally).map(([id, n]) => {
      const p = S.players.find(x => x.id === id); return `<div>${esc(p ? p.name : '?')}: ${n}</div>`;
    }).join('') + '</div>';
  }
  h += '<div class="card"><h2>Chronik</h2>' + W.log.map(l => `<div>${esc(l)}</div>`).join('') + '</div>';
  if (W.winner) h += `<div class="tv-big">${W.winner === 'Wölfe' ? '🐺 Die Wölfe gewinnen!' : '🧑‍🌾 Das Dorf gewinnt!'}</div>`;
  stage.innerHTML = h;
}
const SUIT = { h: '♥', d: '♦', c: '♣', s: '♠' };
function pcard(c, big) {
  const red = c.s === 'h' || c.s === 'd';
  const r = c.r === 'T' ? '10' : c.r;
  return `<div class="pcard${big ? ' big' : ''} ${red ? 'red' : 'blk'}">${r}<br>${SUIT[c.s]}</div>`;
}
function renderGw() {
  if (!S.gw) { stage.innerHTML = '<div class="tv-big">Geheimworte bereit – „Neue Runde“ drücken</div>'; return; }
  const G = S.gw;
  let h = `<div class="center muted">Am Zug: <b>${G.turn === 'R' ? '🔴 Rot' : '🔵 Blau'}</b> · Rot offen: ${G.leftR} · Blau offen: ${G.leftB} · Chef Rot: ${esc(G.chefR || '–')} · Chef Blau: ${esc(G.chefB || '–')}</div>`;
  if (G.hint) h += `<div class="tv-big">„${esc(G.hint.word)}“ – ${G.hint.n}</div>`;
  h += '<div class="gwgrid">' + G.words.map((w, i) => {
    const r = G.revealed[i];
    return `<div class="gwcell ${r === 'R' ? 'gr' : r === 'B' ? 'gb' : r === 'N' ? 'gn' : r === 'A' ? 'ga' : ''}">${esc(w)}</div>`;
  }).join('') + '</div>';
  h += '<div class="card"><h2>Verlauf</h2>' + G.log.map(l => `<div>${esc(l)}</div>`).join('') + '</div>';
  if (G.winner) h += `<div class="tv-big">🏆 ${G.winner === 'R' ? '🔴 Rot' : '🔵 Blau'} gewinnt!</div>`;
  stage.innerHTML = h;
}
function renderBluff() {
  if (!S.bluff) { stage.innerHTML = '<div class="tv-big">Bluff-Poker bereit – „Neue Hand geben“ drücken</div>'; return; }
  const B = S.bluff;
  let h = `<div class="center muted">Phase: <b>${{ preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', done: 'Ende' }[B.phase]}</b> · Pot: <b>${B.pot}</b> · Dealer: ${esc(B.dealer || '–')} · Am Zug: <b>${esc(B.turn || '–')}</b></div>`;
  h += '<div class="center" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0">' + (B.community.length ? B.community.map(c => pcard(c, true)).join('') : '<span class="muted">Noch keine offenen Karten</span>') + '</div>';
  h += '<div class="card"><h2>Spieler</h2>' + B.players.map(p => `<div>${p.folded ? '🚶' : '🃏'} <b>${esc(p.name)}</b> · ${p.chips} Chips${B.phase !== 'done' && p.paid ? ' · bezahlt ' + p.paid : ''}</div>`).join('') + '</div>';
  h += '<div class="card"><h2>Verlauf</h2>' + B.log.map(l => `<div>${esc(l)}</div>`).join('') + '</div>';
  if (B.phase === 'done') h += `<div class="tv-big">🏆 ${B.winners.map(esc).join(', ')}${B.winDesc ? ' (' + esc(B.winDesc) + ')' : ''}</div>`;
  stage.innerHTML = h;
}
function renderMr() {
  if (!S.mr || S.mr.phase === 'lobby') { stage.innerHTML = '<div class="tv-big">Malen & Raten bereit – „Neue Runde“ drücken</div>'; return; }
  const M = S.mr;
  let h = `<div class="muted center">Runde ${M.round} · malt: <b>${esc(M.drawer)}</b> · Wortlänge: ${M.wordLen} · geraten: ${M.guessed.join(', ') || '–'}</div>`;
  h += '<canvas id="tvpic" width="500" height="500" style="width:100%;max-width:520px;background:#f8fafc;border-radius:12px;display:block;margin:10px auto"></canvas>';
  const rank = S.players.map(p => ({ n: p.name, s: M.scores[p.id] || 0 })).sort((a, b) => b.s - a.s);
  h += '<div class="card"><h2>Punkte</h2>' + rank.map((r, i) => `<div>${i + 1}. ${esc(r.n)} – ${r.s}</div>`).join('') + '</div>';
  if (M.logExtra) h += `<div class="tv-big">${esc(M.logExtra)}</div>`;
  stage.innerHTML = h;
  drawPic(document.getElementById('tvpic'), M.strokes);
}
function drawPic(cv, strokes) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 500, 500);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of strokes || []) {
    ctx.strokeStyle = st.c || '#111'; ctx.lineWidth = (st.w || 4) * 2;
    ctx.beginPath();
    st.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }
}
function renderWg() {
  if (!S.wg) { stage.innerHTML = '<div class="tv-big">Würfelglück bereit – „Neues Spiel“ drücken</div>'; return; }
  const W = S.wg;
  let h = `<div class="center muted">Am Zug: <b>${esc(W.turn || '–')}</b> · Würfe übrig: ${W.rollsLeft}</div>`;
  h += '<div class="center" style="font-size:52px">' + W.dice.map(d => '⚀⚁⚂⚃⚄⚅'[d - 1]).join(' ') + '</div>';
  const cats = [['ones', '1er'], ['twos', '2er'], ['threes', '3er'], ['fours', '4er'], ['fives', '5er'], ['sixes', '6er'], ['three', '3 Gl.'], ['four', '4 Gl.'], ['full', 'FH'], ['small', 'kl. Str.'], ['large', 'gr. Str.'], ['kniffel', 'Kniffel'], ['chance', 'Chance']];
  h += '<div class="card" style="overflow-x:auto"><table class="sheet"><tr><th></th>' + W.order.map(id => `<th>${esc(nameOf2(id))}</th>`).join('') + '</tr>';
  for (const [c, lab] of cats) h += `<tr><td>${lab}</td>` + W.order.map(id => `<td>${W.sheets[id][c] === null || W.sheets[id][c] === undefined ? '·' : W.sheets[id][c]}</td>`).join('') + '</tr>';
  h += `<tr><td><b>Total</b></td>` + W.order.map(id => `<td><b>${W.totals[id].total}</b> <span class="muted">(${W.totals[id].sub}${W.totals[id].bonus ? '+' + W.totals[id].bonus : ''})</span></td>`).join('') + '</tr></table></div>';
  if (W.done) h += `<div class="tv-big">🏆 ${W.winners.map(esc).join(', ')}</div>`;
  stage.innerHTML = h;
}
function nameOf2(id) { const p = S.players.find(x => x.id === id); return p ? p.name : '?'; }
function renderWv() {
  if (!S.wv) { stage.innerHTML = '<div class="tv-big">Wortverbot bereit – „Neues Spiel“ drücken</div>'; return; }
  const V = S.wv;
  let h = `<div class="tv-big">Team ${V.explTeam} – erklärt: ${esc(V.explainer)}</div>`;
  h += `<div class="center" style="font-size:28px">🅰 ${V.scores.A} : ${V.scores.B} 🅱</div>`;
  h += '<div class="row"><div class="card"><h2>Team A</h2>' + V.teams.A.map(esc).join(', ') + '</div><div class="card"><h2>Team B</h2>' + V.teams.B.map(esc).join(', ') + '</div></div>';
  if (V.lastResult) h += `<div class="card center">${esc(V.lastResult)}</div>`;
  stage.innerHTML = h;
}
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
