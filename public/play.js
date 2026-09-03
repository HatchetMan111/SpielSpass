'use strict';
const qs = new URLSearchParams(location.search);
const CODE = (qs.get('room') || '').toUpperCase();
const s = io();
document.getElementById('code').textContent = CODE;
document.getElementById('name').value = qs.get('name') || '';
let S = null, myId = null, lastGame = null;
s.on('connect', () => { myId = s.id; if (qs.get('name')) doJoin(); });
s.on('state', st => {
  if (lastGame !== null && lastGame !== st.game) { myRole = null; myCard = null; }
  lastGame = st.game;
  S = st; document.getElementById('g').textContent = 'Spiel: ' + st.game; render();
});
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
  } else if (S.game === 'fr') {
    el.innerHTML = '<div class="card"><h2>Farbrausch</h2><div id="hand"></div><button class="btn alt" onclick="draw()">Karte ziehen</button>' +
      '<div class="row"><select id="wildc"><option value="R">Rot</option><option value="G">Grün</option><option value="B">Blau</option><option value="Y">Gelb</option></select></div>' +
      '<p class="muted">Top: ' + (S.fr ? esc(S.fr.top.value + ' ' + S.fr.top.color) + ' · Farbe ' + esc(S.fr.color) + ' · am Zug ' + esc(S.fr.turn) : 'noch nicht gegeben') + '</p></div>';
    fetchHand();
  } else if (S.game === 'slf') renderSlfC(el);
  else if (S.game === 'bingo') renderBingoC(el);
  else if (S.game === 'vier') renderVierC(el);
  else if (S.game === 'wolf') renderWolfC(el);
}
// --- Stadt-Land-Fluss (Controller) ---
function renderSlfC(el) {
  const L = S.slf;
  if (!L || L.phase === 'lobby') { el.innerHTML = '<div class="card">Warte auf TV-Start…</div>'; return; }
  if (L.phase === 'done') { el.innerHTML = '<div class="card"><h2>Runde vorbei!</h2>Punkte: ' + (L.scores[myId] || 0) + '<br>Blick aufs TV – dort startet die nächste Runde.</div>'; return; }
  if (L.phase === 'reveal') { el.innerHTML = '<div class="card">Eingesammelt! TV prüft gerade – warte auf Auswertung…</div>'; return; }
  el.innerHTML = '<div class="card"><h2>SLF · Buchstabe <b>' + esc(L.letter) + '</b></h2>' +
    L.cats.map(c => `<label>${esc(c)}<input id="slf_${esc(c)}" maxlength="30" placeholder="${esc(L.letter)}…"></label>`).join('') +
    '<button class="btn" onclick="slfSend()">Fertig! Absenden</button></div>';
}
function slfSend() {
  const a = {};
  for (const c of S.slf.cats) a[c] = document.getElementById('slf_' + c).value;
  s.emit('slf:submit', { answers: a });
  document.getElementById('game').innerHTML = '<div class="card">Abgesendet! ✅ Warte auf Stopp…</div>';
}
// --- Bingo (Controller) ---
let myCard = null, myDrawn = [];
s.on('bcard', c => {
  myCard = c;
  const h = document.getElementById('bgrid'); if (!h || !c) return;
  h.innerHTML = '<div class="bgrid">' + c.map(row => row.map(v => {
    const hit = v === 'FREE' || myDrawn.includes(v);
    return `<div class="bcell${hit ? ' hit' : ''}${v === 'FREE' ? ' free' : ''}">${v === 'FREE' ? '★' : v}</div>`;
  }).join('')).join('') + '</div>';
});
function renderBingoC(el) {
  const B = S.bingo;
  if (!B) { el.innerHTML = '<div class="card">Warte auf TV-Start…</div>'; return; }
  myDrawn = B.drawn;
  if (B.phase === 'done') { el.innerHTML = '<div class="card"><h2>' + (B.winner ? '🏆 BINGO! Gewinner siehe TV.' : 'Vorbei.') + '</h2><div id="bgrid"></div></div>'; s.emit('bingo:card'); return; }
  el.innerHTML = '<div class="card"><h2>🎱 Bingo</h2><div class="muted">Zuletzt: <b>' + (B.current || '–') + '</b> · ' + B.drawn.length + '/75</div><div id="bgrid"></div>' +
    '<button class="btn warn" onclick="s.emit(\'bingo:claim\',r=>{if(!r.ok)alert(r.err||\'Fehler\')})">BINGO rufen!</button></div>';
  s.emit('bingo:card');
}
// --- Vier in einer Reihe (Controller) ---
function renderVierC(el) {
  const V = S.vier;
  if (!V) { el.innerHTML = '<div class="card">Warte auf TV…</div>'; return; }
  el.innerHTML = `<div class="card"><h2>Vier in einer Reihe</h2>
    <div class="row"><button class="btn alt" onclick="s.emit('vier:seat',{color:'R'})">🔴 Rot ${esc(V.r || '')}</button><button class="btn alt" onclick="s.emit('vier:seat',{color:'Y'})">🟡 Gelb ${esc(V.y || '')}</button></div>
    <div class="muted">Am Zug: ${V.turn === 'R' ? '🔴 Rot' : '🟡 Gelb'}</div>
    <div class="row">${[0, 1, 2, 3, 4, 5, 6].map(c => `<button class="btn" onclick="s.emit('vier:drop',{col:${c}},r=>{if(!r.ok)alert(r.err)})">↓${c + 1}</button>`).join('')}</div>
    ${V.winner ? '<div class="tv-big">' + (V.winner === 'draw' ? 'Unentschieden!' : '🏆 ' + (V.winner === 'R' ? 'Rot' : 'Gelb') + ' gewinnt!') + '</div>' : ''}</div>`;
}
// --- Dorf & Wölfe (Controller) ---
let myRole = null;
s.on('wrole', r => {
  myRole = r;
  const h = document.getElementById('wrole'); if (!h) return;
  h.innerHTML = r === 'W' ? '🐺 <b>Du bist WOLF!</b> Wähle nachts ein Opfer.' : r === 'S' ? '🔮 <b>Du bist SEHERIN!</b> Prüfe nachts einen Spieler.' : r === 'D' ? '🧑 <b>Du bist Dorfbewohner.</b> Schlaf nachts, stimme tags ab.' : 'Noch keine Rolle – warte auf Start.';
  render();
});
function renderWolfC(el) {
  const W = S.wolf;
  if (!W || W.phase === 'lobby') { el.innerHTML = '<div class="card">Warte – TV verteilt gleich die Rollen…</div>'; myRole = null; s.emit('wolf:role'); return; }
  const me = (W.alive.find(a => a.id === s.id) || {});
  let h = '<div class="card"><h2>Dorf & Wölfe</h2><div id="wrole"></div>';
  h += '<div class="muted">' + (me.alive ? 'Du lebst.' : 'Du bist ausgeschieden 💀 (zuschauen).') + ' Phase: ' + (W.phase === 'night' ? '🌙 Nacht' : W.phase === 'day' ? '☀️ Tag' : '🏁 Ende') + '</div>';
  const others = W.alive.filter(a => a.alive && a.id !== s.id);
  if (W.phase === 'night' && me.alive && myRole === 'W') {
    h += '<h2>🐺 Opfer wählen:</h2>' + others.map(a => `<button class="btn alt" onclick="s.emit('wolf:action',{target:'${a.id}'},r=>{if(r.ok)alert('Notiert!')})">${esc(a.name)}</button>`).join('');
  } else if (W.phase === 'night' && me.alive && myRole === 'S') {
    h += '<h2>🔮 Wen prüfen?</h2>' + others.map(a => `<button class="btn alt" onclick="s.emit('wolf:action',{target:'${a.id}'},r=>{if(r.ok)alert(r.isWolf?('🐺 '+r.name+' ist ein WOLF!'):('🧑 '+r.name+' ist unschuldig'))})">${esc(a.name)}</button>`).join('');
  } else if (W.phase === 'night') {
    h += '<div class="tv-big">😴 Schlafen…</div>';
  } else if (W.phase === 'day' && me.alive) {
    h += '<h2>🗳️ Wen verbannen?</h2>' + others.map(a => `<button class="btn alt" onclick="s.emit('wolf:vote',{target:'${a.id}'})">${esc(a.name)}</button>`).join('');
  }
  if (W.winner) h += '<div class="tv-big">' + (W.winner === 'Wölfe' ? '🐺 Wölfe siegen!' : '🧑‍🌾 Dorf siegt!') + '</div>';
  h += '</div>';
  el.innerHTML = h;
  if (!myRole) s.emit('wolf:role');
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
