'use strict';
const qs = new URLSearchParams(location.search);
const CODE = (qs.get('room') || '').toUpperCase();
const s = io();
document.getElementById('code').textContent = CODE;
document.getElementById('name').value = qs.get('name') || '';
let S = null, myId = null;
s.on('connect', () => { myId = s.id; if (qs.get('name')) doJoin(); });
s.on('state', st => { S = st; document.getElementById('g').textContent = 'Spiel: ' + st.game; render(); });
function doJoin() {
  const name = document.getElementById('name').value || 'Spieler';
  s.emit('join-room', { code: CODE, name }, r => {
    if (!r.ok) alert(r.err); else document.getElementById('joinBox').style.display = 'none';
  });
}
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function render() {
  const el = document.getElementById('game');
  if (!S) { el.innerHTML = ''; return; }
  if (S.game === 'quiz') {
    if (!S.quiz || S.quiz.phase === 'lobby') { el.innerHTML = '<div class="card">Warte auf TV-Start…</div>'; return; }
    if (S.quiz.phase === 'done') { el.innerHTML = '<div class="card"><h2>Fertig!</h2>Sieh aufs TV für das Ergebnis.</div>'; return; }
    if (S.quiz.phase === 'reveal') { el.innerHTML = '<div class="card">Auswertung läuft – Blick auf TV. Warte auf nächste Frage…</div>'; return; }
    el.innerHTML = '<div class="card"><h2>' + esc(S.quiz.current.q) + '</h2>' +
      S.quiz.current.choices.map((t, i) => `<button class="btn alt qchoice" onclick="answer(${i})">${i + 1}. ${esc(t)}</button>`).join('') + '</div>';
  } else if (S.game === 'chess') {
    el.innerHTML = `<div class="card"><h2>Schach-Zug</h2>
      <div class="row"><button class="btn alt" onclick="seat('w')">Weiß ${esc(S.chess.white || '')}</button><button class="btn alt" onclick="seat('b')">Schwarz ${esc(S.chess.black || '')}</button></div>
      <div class="row"><input id="from" placeholder="von z.B. e2" maxlength="2"><input id="to" placeholder="nach z.B. e4" maxlength="2"></div>
      <button class="btn" onclick="move()">Ziehen</button>
      <p class="muted">Am Zug: ${S.chess.turn === 'w' ? 'Weiß' : 'Schwarz'} · Verlauf: ${esc((S.chess.history || []).join(' '))}</p></div>`;
  } else {
    el.innerHTML = '<div class="card"><h2>Farbrausch</h2><div id="hand"></div><button class="btn alt" onclick="draw()">Karte ziehen</button>' +
      '<div class="row"><select id="wildc"><option value="R">Rot</option><option value="G">Grün</option><option value="B">Blau</option><option value="Y">Gelb</option></select></div>' +
      '<p class="muted">Top: ' + (S.fr ? esc(S.fr.top.value + ' ' + S.fr.top.color) + ' · Farbe ' + esc(S.fr.color) + ' · am Zug ' + esc(S.fr.turn) : 'noch nicht gegeben') + '</p></div>';
    fetchHand();
  }
}
function answer(i) { s.emit('quiz:answer', { choice: i }); document.getElementById('game').innerHTML = '<div class="card">Antwort gesendet – warte auf TV…</div>'; }
function seat(c) { s.emit('chess:seat', { color: c }); }
function move() {
  const f = document.getElementById('from').value, t = document.getElementById('to').value;
  s.emit('chess:move', { from: f, to: t }, r => { if (!r.ok) alert(r.err); });
}
// Farbrausch-Hand kommt per separatem State? Server sendet Hände nicht an alle – Workaround: per Socket erfragen.
// Minimal: Hände werden lokal über 'state' nicht übertragen (Geheimhaltung). Wir holen sie über eigenen Event.
s.on('hand', cards => {
  const h = document.getElementById('hand'); if (!h) return;
  h.innerHTML = '<div class="fr-hand">' + cards.map(c => `<div class="ucard U${c.color}" onclick="playCard(${c.id})">${esc(c.value)}<br><small>${esc(c.color)}</small></div>`).join('') + '</div>';
});
function fetchHand() { s.emit('fr:hand'); }
function playCard(id) { const c = document.getElementById('wildc').value; s.emit('fr:play', { cardId: id, color: c }, r => { if (!r.ok) alert(r.err); else fetchHand(); }); }
function draw() { s.emit('fr:draw', () => fetchHand()); }
