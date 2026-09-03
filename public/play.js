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
  if (lastGame !== null && lastGame !== st.game) { myRole = null; myCard = null; lastKey = null; amChef = null; }
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
function gameName(g) { return { quiz: 'Quiz', chess: 'Schach', fr: 'Farbrausch', slf: 'Stadt-Land-Fluss', bingo: 'Bingo', vier: 'Vier in einer Reihe', wolf: 'Dorf & Wölfe', gw: 'Geheimworte', bluff: 'Bluff-Poker', mr: 'Malen & Raten', wg: 'Würfelglück', wv: 'Wortverbot' }[g] || g; }
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
  if (S.game === 'gw' && S.gw) {
    const G = S.gw;
    if (G.winner) return { key: 'gw-over', mine: false, text: '🏆 ' + (G.winner === 'R' ? 'Rot' : 'Blau') + ' gewinnt!' };
    if (G.phase === 'hint') return { key: 'gw-h', mine: !!amChef, text: amChef ? '🔔 DU gibst den Hinweis!' : 'Chef denkt nach…' };
    return { key: 'gw-g', mine: false, text: (G.turn === 'R' ? '🔴 Rot' : '🔵 Blau') + ' rät: ' + (G.hint ? '„' + G.hint.word + '“ ' + G.hint.n : '') };
  }
  if (S.game === 'bluff' && S.bluff) {
    const B = S.bluff;
    if (B.phase === 'done') return { key: 'bluff-over', mine: false, text: '🏆 ' + B.winners.join(', ') };
    const mine = B.turnId === me;
    return { key: 'bluff-' + B.turnId + '-' + B.pot, mine, text: mine ? '🔔 DU bist am Zug! Check/Call/Fold' : (B.turn || '–') + ' ist am Zug · Pot ' + B.pot };
  }
  if (S.game === 'mr' && S.mr) {
    const M = S.mr;
    if (M.phase === 'done') return { key: 'mr-over', mine: false, text: '🏁 Runde vorbei.' };
    const mine = M.drawerId === me;
    return { key: 'mr-' + M.round, mine, text: mine ? '🎨 DU malst! (' + M.wordLen + ' Buchstaben)' : M.drawer + ' malt – rate mit!' };
  }
  if (S.game === 'wg' && S.wg) {
    const W = S.wg;
    if (W.done) return { key: 'wg-over', mine: false, text: '🏆 ' + W.winners.join(', ') };
    const mine = W.turnId === me;
    return { key: 'wg-' + W.turnId + '-' + W.rollsLeft, mine, text: mine ? '🔔 DU würfelst!' : (W.turn || '–') + ' würfelt' };
  }
  if (S.game === 'wv' && S.wv) {
    const V = S.wv;
    const mine = V.explainerId === me;
    return { key: 'wv-' + V.explainer + '-' + V.scores.A + V.scores.B, mine, text: mine ? '🔔 DU erklärst für Team ' + V.explTeam + '!' : V.explainer + ' erklärt für Team ' + V.explTeam };
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
    gw: B('gw:start', '▶ Neue Runde', 1),
    bluff: B('bluff:start', '🃏 Neue Hand', 1),
    mr: B('mr:start', '▶ Neue Runde', 1) + B('mr:end', '⏹ Runde beenden'),
    wg: B('wg:start', '▶ Neues Spiel', 1),
    wv: B('wv:start', '▶ Neues Spiel', 1) + B('wv:endturn', '⏭ Durchgang beenden'),
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
  else if (S.game === 'gw') renderGwC(el, head);
  else if (S.game === 'bluff') renderBluffC(el, head);
  else if (S.game === 'mr') renderMrC(el, head);
  else if (S.game === 'wg') renderWgC(el, head);
  else if (S.game === 'wv') renderWvC(el, head);
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
// --- Geheimworte (Controller) ---
let amChef = null, myKey = null;
s.on('gkey', k => {
  myKey = k; amChef = !!k;
  const h = document.getElementById('gkey'); if (h && k) paintKey(h, k);
  render();
});
function paintKey(el, key) {
  el.innerHTML = '<div class="gwgrid small">' + S.gw.words.map((w, i) => {
    const r = S.gw.revealed[i];
    const c = r ? (key[i] === 'R' ? 'gr' : key[i] === 'B' ? 'gb' : key[i] === 'N' ? 'gn' : 'ga') : (key[i] === 'R' ? 'kr' : key[i] === 'B' ? 'kb' : key[i] === 'N' ? 'kn' : 'ka');
    return `<div class="gwcell ${c}">${esc(w)}${r ? ' ✓' : ''}</div>`;
  }).join('') + '</div>';
}
function renderGwC(el, head) {
  const G = S.gw;
  if (!G) { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  let h = head + `<div class="card"><h2>🕵️ Geheimworte</h2>
    <div class="muted">Am Zug: <b>${G.turn === 'R' ? '🔴 Rot' : '🔵 Blau'}</b> · Rot offen: ${G.leftR} · Blau offen: ${G.leftB}</div>
    <div class="row"><button class="btn alt" onclick="s.emit('gw:seat',{team:'R'})">🔴 Chef Rot ${esc(G.chefR || '')}</button><button class="btn alt" onclick="s.emit('gw:seat',{team:'B'})">🔵 Chef Blau ${esc(G.chefB || '')}</button></div>`;
  if (G.hint) h += `<div class="center" style="font-size:24px">„<b>${esc(G.hint.word)}</b>“ – ${G.hint.n}</div>`;
  h += '<div id="gkey"></div>';
  if (!amChef && G.phase === 'guess') {
    h += '<div class="gwgrid">' + G.words.map((w, i) => G.revealed[i] ? '' : `<button class="gwcell" onclick="s.emit('gw:guess',{idx:${i}},r=>{if(!r.ok)alert(r.err||'Fehler')})">${esc(w)}</button>`).join('') + '</div>';
    h += `<button class="btn alt" onclick="s.emit('gw:pass')">⏭ Passen (Zug abgeben)</button>`;
  } else if (amChef && G.phase === 'hint') {
    h += `<div class="row"><input id="gw_w" maxlength="24" placeholder="Hinweiswort"><select id="gw_n"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
      <button class="btn" onclick="s.emit('gw:hint',{word:document.getElementById('gw_w').value,n:document.getElementById('gw_n').value},r=>{if(!r.ok)alert(r.err)})">Hinweis senden</button>`;
  } else if (G.phase === 'done') {
    h += `<div class="tv-big">🏆 ${G.winner === 'R' ? '🔴 Rot' : '🔵 Blau'} gewinnt!</div>`;
  } else {
    h += '<p class="muted">Warte… (Chef denkt nach oder Team rät – siehe TV)</p>';
  }
  h += '</div>' + controls();
  el.innerHTML = h;
  s.emit('gw:key');
}
// --- Bluff-Poker (Controller) ---
s.on('bhand', cards => {
  const h = document.getElementById('bh'); if (!h) return;
  h.innerHTML = cards && cards.length ? cards.map(pcardHtml).join('') : '<span class="muted">Keine Karten – warte auf nächste Hand.</span>';
});
function pcardHtml(c) {
  const red = c.s === 'h' || c.s === 'd';
  const r = c.r === 'T' ? '10' : c.r;
  const sym = { h: '♥', d: '♦', c: '♣', s: '♠' }[c.s];
  return `<div class="pcard big ${red ? 'red' : 'blk'}">${r}<br>${sym}</div>`;
}
function renderBluffC(el, head) {
  const B = S.bluff;
  if (!B) { el.innerHTML = head + '<div class="card">Warte auf Start… oder gib selbst unten.</div>' + controls(); return; }
  const me = B.players.find(p => p.id === s.id) || {};
  const toCall = 10 - (me.paid || 0);
  let h = head + `<div class="card"><h2>🃏 Bluff-Poker</h2>
    <div class="muted">Pot: <b>${B.pot}</b> · Deine Chips: <b>${me.chips || 0}</b> · Phase: ${B.phase}${me.folded ? ' · <b>Du hast gefoldet</b>' : ''}</div>
    <div class="center" style="display:flex;gap:8px;justify-content:center" id="bh"></div>
    <div class="center muted">Offen: ${B.community.map(c => (c.r === 'T' ? '10' : c.r) + c.s).join(' ') || '–'}</div>`;
  if (B.phase !== 'done' && !me.folded) {
    h += `<div class="row"><button class="btn alt" onclick="s.emit('bluff:action',{act:'check'},r=>{if(!r.ok)alert(r.err)})">Check</button>
      <button class="btn" onclick="s.emit('bluff:action',{act:'call'},r=>{if(!r.ok)alert(r.err)})">Call ${toCall > 0 ? toCall : 0}</button>
      <button class="btn warn" onclick="s.emit('bluff:action',{act:'fold'})">Fold</button></div>`;
  }
  if (B.phase === 'done') h += `<div class="tv-big">🏆 ${B.winners.map(esc).join(', ')}${B.winDesc ? ' (' + esc(B.winDesc) + ')' : ''}</div>`;
  h += '</div>' + controls();
  el.innerHTML = h;
  s.emit('bluff:hand');
}
// --- Malen & Raten (Controller) ---
let drawing = false, curPts = [], curColor = '#111111';
s.on('mword', w => {
  const h = document.getElementById('mword'); if (!h) return;
  h.innerHTML = w ? '🎨 Dein Wort: <b>' + esc(w) + '</b> (' + w.length + ' Buchstaben)' : 'Warte auf Rundenstart…';
});
function drawPicL(cv, strokes) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 500, 500);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of strokes || []) {
    ctx.strokeStyle = st.c || '#111'; ctx.lineWidth = 8;
    ctx.beginPath();
    st.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }
}
function mSetup(cv, canDraw) {
  drawPicL(cv, S.mr.strokes);
  if (!canDraw) return;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 500), Math.round((e.clientY - r.top) / r.height * 500)]; };
  cv.onpointerdown = (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} drawing = true; curPts = [pos(e)]; };
  cv.onpointermove = (e) => {
    if (!drawing) return; e.preventDefault();
    const p = pos(e), l = curPts[curPts.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 3) {
      curPts.push(p);
      const ctx = cv.getContext('2d');
      ctx.strokeStyle = curColor; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
  };
  const up = () => { if (!drawing) return; drawing = false; if (curPts.length > 1) s.emit('mr:stroke', { stroke: { c: curColor, pts: curPts } }); curPts = []; };
  cv.onpointerup = up; cv.onpointercancel = up;
}
function renderMrC(el, head) {
  const M = S.mr;
  if (!M || M.phase === 'lobby') { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  const mine = M.drawerId === s.id;
  let h = head + `<div class="card"><h2>🎨 Malen & Raten (Runde ${M.round})</h2><div id="mword"></div>`;
  h += '<canvas id="mycv" width="500" height="500" style="width:100%;background:#f8fafc;border-radius:12px;touch-action:none"></canvas>';
  if (M.phase === 'done') {
    h += `<div class="tv-big">${esc(M.logExtra || 'Runde vorbei!')}</div>`;
  } else if (mine) {
    h += `<div class="row">${['#111111', '#dc2626', '#2563eb', '#16a34a', '#d97706'].map(c => `<button class="btn alt" style="border:3px solid ${c}" onclick="curColor='${c}'">●</button>`).join('')}</div>
      <button class="btn alt" onclick="s.emit('mr:clear')">🧹 Alles weg</button>`;
  } else {
    h += `<div class="row"><input id="mr_g" maxlength="30" autocomplete="off" placeholder="Dein Tipp…"><button class="btn" onclick="s.emit('mr:guess',{text:document.getElementById('mr_g').value},r=>{if(r&&r.right)alert('Richtig! +100 🎉');document.getElementById('mr_g').value=''})">Raten</button></div>
      <p class="muted">Erraten von: ${M.guessed.join(', ') || '–'}</p>`;
  }
  h += '</div>' + controls();
  el.innerHTML = h;
  mSetup(document.getElementById('mycv'), mine && M.phase === 'draw');
  s.emit('mr:word');
}
// --- Würfelglück (Controller) ---
const WG_CAT_LAB = { ones: '1er', twos: '2er', threes: '3er', fours: '4er', fives: '5er', sixes: '6er', three: '3 Gleiche', four: '4 Gleiche', full: 'Full House', small: 'Kl. Straße', large: 'Gr. Straße', kniffel: 'Kniffel', chance: 'Chance' };
function renderWgC(el, head) {
  const W = S.wg;
  if (!W) { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  const mine = W.turnId === s.id;
  const mySheet = W.sheets[s.id] || {};
  let h = head + `<div class="card"><h2>🎲 Würfelglück</h2>
    <div class="center" style="font-size:44px">` + W.dice.map((d, i) => `<span onclick="s.emit('wg:hold',{idx:${i}})" style="${W.held[i] ? 'opacity:.35' : ''};cursor:pointer">${'⚀⚁⚂⚃⚄⚅'[d - 1]}</span>`).join(' ') + `</div>
    <div class="muted center">Würfe übrig: ${W.rollsLeft} · Antippen = halten · Total: ${W.totals[s.id] ? W.totals[s.id].total : 0}</div>`;
  if (mine && !W.done) h += `<button class="btn" onclick="s.emit('wg:roll',r=>{if(!r.ok)alert(r.err)})">🎲 Würfeln (${W.rollsLeft})</button>`;
  if (mine && !W.done && W.rollsLeft < 3) {
    h += '<div class="cards">' + Object.entries(WG_CAT_LAB).map(([c, lab]) => `<button class="btn alt" ${mySheet[c] !== null && mySheet[c] !== undefined ? 'disabled style="opacity:.4"' : ''} onclick="s.emit('wg:score',{cat:'${c}'},r=>{if(!r.ok)alert(r.err)})">${lab}${mySheet[c] !== null && mySheet[c] !== undefined ? ': ' + mySheet[c] : ''}</button>`).join('') + '</div>';
  }
  if (W.done) h += `<div class="tv-big">🏆 ${W.winners.map(esc).join(', ')}</div>`;
  h += '</div>' + controls();
  el.innerHTML = h;
}
// --- Wortverbot (Controller) ---
s.on('vcard', c => {
  const h = document.getElementById('vcard'); if (!h) return;
  h.innerHTML = c ? `<div class="topcard UY">${esc(c[0])}</div><div class="card">🚫 Verboten:<br>${c.slice(1).map(x => '• ' + esc(x)).join('<br>')}</div>` : '<p class="muted">Du rätst – Karte bleibt geheim! 🤫</p>';
});
function renderWvC(el, head) {
  const V = S.wv;
  if (!V) { el.innerHTML = head + '<div class="card">Warte auf Start… oder starte selbst unten.</div>' + controls(); return; }
  const mine = V.explainerId === s.id;
  let h = head + `<div class="card"><h2>🤐 Wortverbot – Team ${V.explTeam}</h2>
    <div class="center" style="font-size:26px">🅰 ${V.scores.A} : ${V.scores.B} 🅱</div>
    <div class="muted">Erklärt: <b>${esc(V.explainer)}</b> · ${V.left} Karten übrig</div><div id="vcard"></div>`;
  if (mine) {
    h += `<div class="row"><button class="btn" onclick="s.emit('wv:next',{mode:'right'})">✅ Richtig +1</button><button class="btn alt" onclick="s.emit('wv:next',{mode:'skip'})">⏭ Skip</button></div>`;
  } else {
    h += `<button class="btn warn" onclick="s.emit('wv:next',{mode:'foul'},r=>{if(r.ok)alert('Verstoß notiert!')})">🤐 VERSTOSS! (+1 Gegner)</button>`;
  }
  if (V.lastResult) h += `<p class="muted">${esc(V.lastResult)}</p>`;
  h += '</div>' + controls();
  el.innerHTML = h;
  s.emit('wv:card');
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
