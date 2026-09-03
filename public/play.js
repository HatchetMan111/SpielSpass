'use strict';
// Stabile Spieler-ID (Reconnect aus anderem Zimmer / nach WLAN-Abbruch behält Sitz, Hand, Punkte)
let PID = null;
try {
  PID = localStorage.getItem('pp_pid');
  if (!PID) { PID = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('pp_pid', PID); }
} catch (e) { PID = 'sess-' + Math.random().toString(36).slice(2); }
const qs = new URLSearchParams(location.search);
const CODE = (qs.get('room') || '').toUpperCase();
const s = io();
document.getElementById('code').textContent = CODE;
let storedName = '';
try { storedName = localStorage.getItem('pp_name') || ''; } catch (e) {}
document.getElementById('name').value = qs.get('name') || storedName || '';
let S = null, lastGame = null, lastKey = null, selSq = null;
let myRole = null, myCard = null, myDrawn = [];
s.on('connect', () => { if (qs.get('name') || (storedName && CODE)) doJoin(); });
s.on('state', st => {
  if (lastGame !== null && lastGame !== st.game) { myRole = null; myCard = null; lastKey = null; }
  lastGame = st.game; selSq = null;
  S = st; document.getElementById('g').textContent = 'Spiel: ' + gameName(st.game); render();
});
function doJoin() {
  const name = (document.getElementById('name').value || 'Spieler').slice(0, 24);
  s.emit('join-room', { code: CODE, name, pid: PID }, r => {
    if (!r.ok) { alert(r.err); return; }
    document.getElementById('joinBox').style.display = 'none';
    try { localStorage.setItem('pp_name', name); } catch (e) {}
    document.getElementById('who').textContent = 'Verbunden als ' + name + (r.relinked ? ' (Sitzung wiederhergestellt ✅)' : '');
  });
}
function gameName(g) { return { quiz: 'Quiz', chess: 'Schach', fr: 'Farbrausch', slf: 'Stadt-Land-Fluss', bingo: 'Bingo', vier: 'Vier in einer Reihe', wolf: 'Dorf & Wölfe' }[g] || g; }
function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Ton + Vibration bei "Du bist dran" (offline, WebAudio)
let audioOK = false;
document.addEventListener('pointerdown', () => { audioOK = true; }, { once: true });
function beep() {
  try {
    if (audioOK && (window.AudioContext || window.webkitAudioContext)) {
      const C = window.AudioContext || window.webkitAudioContext, ctx = new C();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.12;
      o.start(); o.stop(ctx.currentTime + 0.18); setTimeout(() => ctx.close(), 400);
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
}
function turnInfo() {
  if (!S) return null;
  const me = s.id;
  if (S.game === 'chess' && S.chess) {
    const C = S.chess, over = /# Schachmatt|Remis/.test((C.history || []).join(' '));
    const myC = C.whiteId === me ? 'w' : C.blackId === me ? 'b' : null;
    if (over) return { key: 'chess-over', mine: false, text: '🏁 Partie beendet.' };
    const mine = !!myC && myC === C.turn;
    return { key: 'chess-' + C.turn + '-' + C.history.length, mine, text: mine ? '🔔 DU bist am Zug!' : 'Am Zug: ' + (C.turn === 'w' ? 'Weiß' : 'Schwarz') };
  }
  if (S.game === 'fr' && S.fr) {
    if (S.fr.winner) return { key: 'fr-over', mine: false, text: '🏆 ' + S.fr.winner + ' gewinnt!' };
    const mine = S.fr.turnId === me;
    return { key: 'fr-' + S.fr.turn + '-' + S.fr.top.value + S.fr.top.color, mine, text: mine ? '🔔 DU bist am Zug!' : S.fr.turn + ' ist am Zug' + (S.fr.turnOnline === false ? ' (offline)' : '') };
  }
  if (S.game === 'vier' && S.vier) {
    const V = S.vier;
    if (V.winner) return { key: 'vier-over', mine: false, text: '🏁 Spiel beendet.' };
    const myC = V.rId === me ? 'R' : V.yId === me ? 'Y' : null;
    const mine = !!myC && myC === V.turn;
    return { key: 'vier-' + V.turn + '-' + V.board.flat().join(''), mine, text: mine ? '🔔 DU bist am Zug! Tippe eine Spalte.' : 'Am Zug: ' + (V.turn === 'R' ? '🔴 Rot' : '🟡 Gelb') };
  }
  if (S.game === 'quiz' && S.quiz && S.quiz.phase === 'question') return { key: 'quiz-' + S.quiz.qIndex, mine: true, text: '❓ Beantworte die Frage!' };
  if (S.game === 'slf' && S.slf && S.slf.phase === 'write') return { key: 'slf-' + S.slf.round, mine: true, text: '✏️ Buchstabe ' + S.slf.letter + ' – schreib deine Wörter!' };
  if (S.game === 'wolf' && S.wolf) {
    const W = S.wolf, meA = (W.alive.find(a => a.id === me) || {});
    if (W.phase === 'night' && meA.alive) {
      if (!myRole) return { key: 'wolf-n', mine: false, text: '🌙 Nacht… Rolle lädt…' };
      if (myRole === 'W') return { key: 'wolf-n', mine: true, text: '🐺 Wähle ein Opfer!' };
      if (myRole === 'S') return { key: 'wolf-n', mine: true, text: '🔮 Prüfe einen Spieler!' };
      return { key: 'wolf-n', mine: false, text: '😴 Schlafen…' };
    }
    if (W.phase === 'day' && meA.alive) return { key: 'wolf-d', mine: true, text: '🗳️ Stimme ab!' };
    if (W.winner) return { key: 'wolf-over', mine: false, text: '🏁 ' + (W.winner === 'Wölfe' ? '🐺 Wölfe siegen!' : '🧑‍🌾 Dorf siegt!') };
  }
  return null;
}
function banner() {
  const ti = turnInfo();
  if (!ti) return '';
  if (ti.key !== lastKey) { lastKey = ti.key; if (ti.mine) beep(); }
  return `<div class="turnb${ti.mine ? ' me' : ''}">${esc(ti.text)}</div>`;
}
function controls() {
  const B = (ev, label, warn) => `<button class="btn${warn ? ' warn' : ' alt'}" onclick="s.emit('${ev}')">${label}</button>`;
  const map = {
    quiz: B('quiz:start', '▶ Quiz starten', 1) + B('quiz:next', 'Weiter →'),
    chess: B('chess:reset', '🔄 Neues Spiel'),
    fr: B('fr:start', '🃏 Karten geben', 1) + B('fr:skip', '⏭ Zug überspringen'),
    slf: B('slf:start', '▶ Runde starten', 1) + B('slf:stop', '⏹ Stopp!') + B('slf:score', 'Auswerten →'),
    bingo: B('bingo:start', '▶ Neues Spiel', 1) + `<button class="btn" onclick="s.emit('bingo:draw',r=>{if(r&&!r.ok)alert(r.err||'Fehler')})">🎱 Zahl ziehen</button>`,
    vier: B('vier:reset', '🔄 Neues Spiel'),
    wolf: B('wolf:start', '▶ Spiel starten', 1) + B('wolf:endnight', '🌙→☀️ Nacht beenden') + B('wolf:endday', '🗳️ Abstimmung beenden'),
  };
  return `<details class="card"><summary>🎬 Spielsteuerung (geht auch ohne TV – antippen)</summary>${map[S.game] || ''}</details>`;
}
function render() {
  const el = document.getElementById('game');
  if (!S) { el.innerHTML = ''; return; }
  const head = banner() + `<div class="center"><button class="btn alt" onclick="copyLink()">🔗 Einladungs-Link kopieren</button></div>`;
  if (S.game === 'quiz') {
    if (!S.quiz || S.quiz.phase === 'lobby') { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
    if (S.quiz.phase === 'done') { el.innerHTML = head + '<div class="card"><h2>Fertig!</h2>Sieh aufs TV für das Ergebnis.</div>' + controls(); return; }
    if (S.quiz.phase === 'reveal') { el.innerHTML = head + '<div class="card">Auswertung läuft – warte auf nächste Frage…</div>' + controls(); return; }
    el.innerHTML = head + '<div class="card"><h2>' + esc(S.quiz.current.q) + '</h2>' +
      S.quiz.current.choices.map((t, i) => `<button class="btn alt qchoice" onclick="answer(${i})">${i + 1}. ${esc(t)}</button>`).join('') + '</div>' + controls();
  } else if (S.game === 'chess') {
    renderChessC(el, head);
  } else if (S.game === 'fr') {
    el.innerHTML = head + '<div class="card"><h2>Farbrausch</h2><div id="hand"></div><button class="btn alt" onclick="draw()">Karte ziehen</button>' +
      '<div class="row"><select id="wildc"><option value="R">Rot</option><option value="G">Grün</option><option value="B">Blau</option><option value="Y">Gelb</option></select></div>' +
      '<p class="muted">Top: ' + (S.fr ? esc(S.fr.top.value + ' ' + S.fr.top.color) + ' · Farbe ' + esc(S.fr.color) + ' · am Zug ' + esc(S.fr.turn) : 'noch nicht gegeben') + '</p></div>' + controls();
    fetchHand();
  } else if (S.game === 'slf') renderSlfC(el, head);
  else if (S.game === 'bingo') renderBingoC(el, head);
  else if (S.game === 'vier') renderVierC(el, head);
  else if (S.game === 'wolf') renderWolfC(el, head);
}
function copyLink() {
  const url = location.origin + '/play?room=' + CODE;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => alert('Link kopiert!')).catch(() => prompt('Link kopieren:', url));
  else prompt('Link kopieren:', url);
}
function answer(i) { s.emit('quiz:answer', { choice: i }); document.getElementById('game').innerHTML = '<div class="card">Antwort gesendet – warte auf TV…</div>'; }
// --- Schachbrett zum Antippen ---
const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
function sqXY(sq) { return { x: sq.charCodeAt(0) - 97, y: 8 - parseInt(sq[1], 10) }; }
function xySq(x, y) { return 'abcdefgh'[x] + (8 - y); }
function renderChessC(el, head) {
  const C = S.chess;
  if (!C) { el.innerHTML = head + '<div class="card">Warte auf TV…</div>' + controls(); return; }
  const myC = C.whiteId === s.id ? 'w' : C.blackId === s.id ? 'b' : null;
  const flip = myC === 'b';
  const last = C.lastMove || {};
  let h = head + '<div class="card"><h2>♟ Schach ' + (myC === 'w' ? '(Du: Weiß)' : myC === 'b' ? '(Du: Schwarz)' : '') + '</h2>';
  h += '<div class="cboard">';
  for (let dr = 0; dr < 8; dr++) {
    const y = flip ? 7 - dr : dr;
    h += `<div class="clab">${8 - y}</div>`;
    for (let dc = 0; dc < 8; dc++) {
      const x = flip ? 7 - dc : dc;
      const sq = xySq(x, y), p = C.board[y][x];
      const cls = (x + y) % 2 ? 'b' : 'w';
      const isSel = selSq === sq, isTgt = selSq && (C.legal[selSq] || []).includes(sq);
      const isLast = last.from === sq || last.to === sq;
      h += `<div class="csq ${cls}${isSel ? ' sel' : ''}${isLast ? ' last' : ''}" onclick="csq('${sq}')">${p ? `<span style="color:${p.c === 'w' ? '#0f172a' : '#7c2d12'}">${PIECES[p.t]}</span>` : ''}${isTgt ? '<span class="dot"></span>' : ''}</div>`;
    }
  }
  h += '<div class="clab"></div>' + [0, 1, 2, 3, 4, 5, 6, 7].map(dc => `<div class="clab">${'abcdefgh'[flip ? 7 - dc : dc]}</div>`).join('') + '</div>';
  h += `<div class="row"><button class="btn alt" onclick="s.emit('chess:seat',{color:'w'})">Weiß ${esc(C.white || '')}${C.white && !C.whiteOnline ? ' (offline)' : ''}</button><button class="btn alt" onclick="s.emit('chess:seat',{color:'b'})">Schwarz ${esc(C.black || '')}${C.black && !C.blackOnline ? ' (offline)' : ''}</button></div>
    <p class="muted">Figur antippen → Punkte zeigen mögliche Züge → Ziel antippen. Bauer wird automatisch Dame. Verlauf: ${esc((C.history || []).join(' '))}</p></div>` + controls();
  el.innerHTML = h;
}
function csq(sq) {
  const C = S.chess; if (!C) return;
  if (selSq && (C.legal[selSq] || []).includes(sq)) {
    const from = selSq; selSq = null;
    s.emit('chess:move', { from, to: sq }, r => { if (!r.ok) alert(r.err); });
    return;
  }
  selSq = C.legal[sq] ? (selSq === sq ? null : sq) : null;
  render();
}
// --- Stadt-Land-Fluss (Controller) ---
function renderSlfC(el, head) {
  const L = S.slf;
  if (!L || L.phase === 'lobby') { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  if (L.phase === 'done') { el.innerHTML = head + '<div class="card"><h2>Runde vorbei!</h2>Punkte: ' + (L.scores[s.id] || 0) + '</div>' + controls(); return; }
  if (L.phase === 'reveal') {
    let h = head + '<div class="card"><h2>Kontrolle – Ungültiges antippen</h2>';
    for (const cat of L.cats) {
      h += `<h2>${esc(cat)}</h2>`;
      for (const p of S.players) {
        const w = (L.answers[p.id] || {})[cat] || '–';
        const ok = (L.valid[p.id] || {})[cat] !== false;
        h += `<div class="row"><div>${ok ? '✅' : '❌'} <b>${esc(p.name)}:</b> ${esc(w)}</div><button class="btn alt" onclick="s.emit('slf:toggle',{pid:'${p.id}',cat:'${esc(cat)}'})">↔</button></div>`;
      }
    }
    el.innerHTML = h + '</div>' + controls();
    return;
  }
  el.innerHTML = head + '<div class="card"><h2>SLF · Buchstabe <b>' + esc(L.letter) + '</b></h2>' +
    L.cats.map(c => `<label>${esc(c)}<input id="slf_${esc(c)}" maxlength="30" autocomplete="off" placeholder="${esc(L.letter)}…"></label>`).join('') +
    '<button class="btn" onclick="slfSend()">Fertig! Absenden</button></div>' + controls();
}
function slfSend() {
  const a = {};
  for (const c of S.slf.cats) a[c] = document.getElementById('slf_' + c).value;
  s.emit('slf:submit', { answers: a });
  document.getElementById('game').innerHTML = '<div class="card">Abgesendet! ✅ Warte auf Stopp…</div>';
}
// --- Bingo (Controller) ---
s.on('bcard', c => {
  myCard = c;
  const h = document.getElementById('bgrid'); if (!h || !c) return;
  h.innerHTML = '<div class="bgrid">' + c.map(row => row.map(v => {
    const hit = v === 'FREE' || myDrawn.includes(v);
    return `<div class="bcell${hit ? ' hit' : ''}${v === 'FREE' ? ' free' : ''}">${v === 'FREE' ? '★' : v}</div>`;
  }).join('')).join('') + '</div>';
});
function renderBingoC(el, head) {
  const B = S.bingo;
  if (!B) { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  myDrawn = B.drawn;
  if (B.phase === 'done') { el.innerHTML = head + '<div class="card"><h2>🏆 BINGO! Gewinner siehe TV.</h2><div id="bgrid"></div></div>' + controls(); s.emit('bingo:card'); return; }
  el.innerHTML = head + '<div class="card"><h2>🎱 Bingo</h2><div class="muted">Zuletzt: <b>' + (B.current || '–') + '</b> · ' + B.drawn.length + '/75</div><div id="bgrid"></div>' +
    '<button class="btn warn" onclick="s.emit(\'bingo:claim\',r=>{if(!r.ok)alert(r.err||\'Fehler\')})">BINGO rufen!</button></div>' + controls();
  s.emit('bingo:card');
}
// --- Vier in einer Reihe (Controller) ---
function renderVierC(el, head) {
  const V = S.vier;
  if (!V) { el.innerHTML = head + '<div class="card">Warte auf TV…</div>' + controls(); return; }
  el.innerHTML = head + `<div class="card"><h2>Vier in einer Reihe</h2>
    <div class="row"><button class="btn alt" onclick="s.emit('vier:seat',{color:'R'})">🔴 Rot ${esc(V.r || '')}${V.r && !V.rOnline ? ' (offline)' : ''}</button><button class="btn alt" onclick="s.emit('vier:seat',{color:'Y'})">🟡 Gelb ${esc(V.y || '')}${V.y && !V.yOnline ? ' (offline)' : ''}</button></div>
    <div class="center muted">Am Zug: ${V.turn === 'R' ? '🔴 Rot' : '🟡 Gelb'}</div>
    <div class="vdrop">${[0, 1, 2, 3, 4, 5, 6].map(c => `<button class="btn" onclick="s.emit('vier:drop',{col:${c}},r=>{if(!r.ok)alert(r.err)})">↓${c + 1}</button>`).join('')}</div>
    ${V.winner ? '<div class="tv-big">' + (V.winner === 'draw' ? 'Unentschieden!' : '🏆 ' + (V.winner === 'R' ? 'Rot' : 'Gelb') + ' gewinnt!') + '</div>' : ''}</div>` + controls();
}
// --- Dorf & Wölfe (Controller) ---
s.on('wrole', r => {
  myRole = r;
  const h = document.getElementById('wrole'); if (!h) return;
  h.innerHTML = r === 'W' ? '🐺 <b>Du bist WOLF!</b> Wähle nachts ein Opfer.' : r === 'S' ? '🔮 <b>Du bist SEHERIN!</b> Prüfe nachts einen Spieler.' : r === 'D' ? '🧑 <b>Du bist Dorfbewohner.</b> Schlaf nachts, stimme tags ab.' : 'Noch keine Rolle – warte auf Start.';
  render();
});
function renderWolfC(el, head) {
  const W = S.wolf;
  if (!W || W.phase === 'lobby') { el.innerHTML = head + '<div class="card">Warte – gleich werden Rollen verteilt… oder starte selbst unten (min. 4 Mitspieler).</div>' + controls(); myRole = null; s.emit('wolf:role'); return; }
  const me = (W.alive.find(a => a.id === s.id) || {});
  let h = head + '<div class="card"><h2>Dorf & Wölfe</h2><div id="wrole"></div>';
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
  h += '<div class="card"><h2>Chronik</h2>' + W.log.map(l => `<div>${esc(l)}</div>`).join('') + '</div></div>' + controls();
  el.innerHTML = h;
  if (!myRole) s.emit('wolf:role');
}
// --- Farbrausch ---
s.on('hand', cards => {
  const h = document.getElementById('hand'); if (!h) return;
  h.innerHTML = '<div class="fr-hand">' + cards.map(c => `<div class="ucard U${c.color}" onclick="playCard(${c.id})">${esc(c.value)}<br><small>${esc(c.color)}</small></div>`).join('') + '</div>';
});
function fetchHand() { s.emit('fr:hand'); }
function playCard(id) { const c = document.getElementById('wildc').value; s.emit('fr:play', { cardId: id, color: c }, r => { if (!r.ok) alert(r.err); else fetchHand(); }); }
function draw() { s.emit('fr:draw', () => fetchHand()); }
function seat(c) { s.emit('chess:seat', { color: c }); }
function move() {
  const f = document.getElementById('from').value, t = document.getElementById('to').value;
  s.emit('chess:move', { from: f, to: t }, r => { if (!r.ok) alert(r.err); });
}
