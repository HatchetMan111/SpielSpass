'use strict';
const qs = new URLSearchParams(location.search);
const CODE = (qs.get('room') || '').toUpperCase();
const s = io();
document.getElementById('code').textContent = CODE;
document.getElementById('url').textContent = location.origin + '/play?room=' + CODE;
const stage = document.getElementById('stage'), playersEl = document.getElementById('players');
let S = null;
s.emit('join-room', { code: CODE, name: 'TV' }, r => { if (!r.ok) stage.innerHTML = '<div class="card">Fehler: ' + r.err + '</div>'; });
s.on('state', st => { S = st; render(); });
function sel(g) { s.emit('select-game', { game: g }); }
function q(ev) { s.emit(ev); }
const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
function render() {
  if (!S) return;
  document.getElementById('quizCtl').style.display = S.game === 'quiz' ? '' : 'none';
  document.getElementById('chessCtl').style.display = S.game === 'chess' ? '' : 'none';
  document.getElementById('unoCtl').style.display = S.game === 'uno' ? '' : 'none';
  playersEl.innerHTML = S.players.map(p => {
    let sc = ''; if (S.quiz) sc = ' – ' + (S.quiz.scores[p.id] || 0) + ' P';
    return '<div>• ' + esc(p.name) + sc + '</div>';
  }).join('') || '<span class="muted">Noch niemand verbunden – Code am Handy eingeben.</span>';
  if (S.game === 'quiz') renderQuiz(); else if (S.game === 'chess') renderChess(); else renderUno();
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
  const b = S.chess.board; let h = '<div class="board">';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = b[y][x]; const cls = (x + y) % 2 ? 'b' : 'w';
    h += `<div class="sq ${cls}" style="color:${p ? (p.c === 'w' ? '#0f172a' : '#111827') : ''}">${p ? PIECES[p.t] : ''}</div>`;
  }
  h += '</div>';
  h += `<div class="center muted">Am Zug: <b>${S.chess.turn === 'w' ? 'Weiß' : 'Schwarz'}</b> · Weiß: ${esc(S.chess.white || '–')} · Schwarz: ${esc(S.chess.black || '–')}<br>Zug am Handy eingeben (z.B. E2 → E4). Verlauf: ${esc((S.chess.history || []).join(' '))}</div>`;
  stage.innerHTML = h;
}
function renderUno() {
  if (!S.uno) { stage.innerHTML = '<div class="tv-big">UNO bereit – „UNO geben“ drücken</div>'; return; }
  const t = S.uno.top;
  stage.innerHTML = `<div class="muted center">Am Zug: <b>${esc(S.uno.turn)}</b> · Aktive Farbe: <b>${esc(S.uno.color)}</b></div>
    <div class="topcard U${S.uno.color}">${esc(t.value)} (${esc(t.color)})</div>
    <div class="card">${S.uno.counts.map(c => `<div>• ${esc(c.name)}: ${c.n} Karten</div>`).join('')}</div>
    ${S.uno.winner ? `<div class="tv-big">🏆 ${esc(S.uno.winner)} gewinnt!</div>` : ''}`;
}
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
