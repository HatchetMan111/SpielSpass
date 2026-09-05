# PartyPlay 🎮 – lokale TV + Handy Partyspiele

TV als Host, Handys als Controller – **komplett im privaten Netzwerk, keine Cloud**.
Spiele (12, alle offline, alle auch ohne TV spielbar): **Quiz**, **Schach** (Brett antippen),
**Farbrausch** (Farb-Kartenspiel, 2–6), **Stadt-Land-Fluss** (2–8, Timer + TV-Kontrolle), **Bingo** (2–12),
**Vier in einer Reihe** (2), **Dorf & Wölfe** (4–12, geheime Rollen), **Geheimworte** (4+, 2 Teams + Chefs mit Geheim-Schlüssel),
**Bluff-Poker** (2–8, Hold'em light mit Chips), **Malen & Raten** (3+, Canvas auf Handy, 90 s),
**Würfelglück** (1–6, Kniffel-Blatt mit Bonus), **Wortverbot** (4+, 2 Teams, 151 Karten, 60 s).

Tech: **Node 20 + Express + Socket.IO**, Port **8080**, In-Memory Räume (kein DB nötig).
Proxmox-Stil: Installation wie **Proxmox VE Community Scripts** mit Einzeiler.

## Einzeiler (auf dem Proxmox-Host als root)

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/SpielSpass/main/install/partyplay.sh)"
```

Mit eigenen Werten:

```bash
CTID=200 GH_USER=HatchetMan111 GH_REPO=SpielSpass bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/SpielSpass/main/install/partyplay.sh)"
# DEBUG mit vollem bash -x Log:
DEBUG=1 bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/SpielSpass/main/install/partyplay.sh)"
```

Was das Script tut (idempotent, `set -euo pipefail`):
1. Prüft root + Proxmox (`pveversion`, `pct`), lädt Debian-12 LXC-Template falls nötig
2. Erstellt LXC **CTID 200** (Default, 2 vCPU / 2 GB RAM / 8 GB Disk, `onboot: 1`, DHCP auf `vmbr0`)
3. Installiert Node 20, klont das Repo nach `/opt/partyplay`, `npm ci --omit=dev`
4. Installiert + startet `partyplay.service` (`Restart=always`, `After=network-online.target`)
5. Verifiziert: `systemctl is-active` + `curl localhost:8080/api/health`, gibt finale URL + Container-IP aus

Erwartete Ausgabe am Ende:

```
[partyplay] FERTIG ✅  PartyPlay läuft!
  TV  : http://192.168.1.70:8080/tv?room=<CODE>
  Lobby (TV+Handy): http://192.168.1.70:8080/
  Handy: http://192.168.1.70:8080/play?room=<CODE>
```

## Spielen (Rumpus-Prinzip: TV ist Host, Handy ist Controller)

1. **TV** öffnen: `http://<LXC-IP>:8080/tv` → erstellt **automatisch** einen Raum und zeigt **Code + QR + Beitritts-URL** groß an. Kein Erstellen per Hand nötig.
2. **Handys** (gleiches WLAN): URL vom TV öffnen oder **QR scannen** → **Code + Name + Emoji** eingeben → „Beitreten“. Wer drin ist, erscheint **live auf dem TV** (mit Emoji, inkl. Rauswurf per ✕ am TV).
3. **Ohne TV geht alles auch:** Jedes Handy hat unten eine „🎬 Spielsteuerung“ (Start/Stopp/Ziehen/Weiter) – ideal, wenn ihr in **verschiedenen Zimmern** sitzt. Einladungs-Link per „🔗 Einladungs-Link kopieren“ teilen.
4. Quiz: TV/Handy zeigt Frage, Handy antwortet (15 s). Schach: **Brett antippen** (Figur → grüne Punkte → Ziel), Brett dreht sich je nach Farbe mit. Farbrausch: Handkarten tippen, „Karte ziehen“ wenn nichts passt.
5. SLF: Buchstabe am TV/Handy, Wörter am Handy, Stopp + Auswerten von überall, ungültige Wörter antippbar. Bingo: Karte automatisch aufs Handy, „BINGO rufen“ wird geprüft. Vier: Farbe wählen, Spalte tippen. Wölfe: Rolle geheim aufs Handy, nachts handeln, tags abstimmen – Moderation von TV oder Handy.
6. Geheimworte: Chef-Ansicht (Farb-Schlüssel) vs. Rate-Ansicht (Wörter antippen) auf dem Handy. Bluff: Hole Cards geheim, Check/Call/Fold-Buttons, Pot + Community Cards auf TV. Malen: Finger-Canvas auf Handy (5 Farben), Raten per Text, Punkte für Rater + Maler. Würfel: Würfel antippen = halten, Kategorien-Blatt, Bonus ab 63. Wortverbot: Karte nur für Erklärer + Gegner-Team sichtbar, Richtig/Skip/Verstoß-Buttons, Teamwechsel nach 60 s.
7. **Komfort:** „🔔 DU bist am Zug“ + Ton/Vibration, Online-Punkte (●/○), Sitz/Hand/Punkte überleben WLAN-Abbrüche (autom. Reconnect, 10 Min. Karenz). Offline-Spieler bei Farbrausch per „⏭ Zug überspringen“ übergehbar.

## Neu in v0.6.3 (Visual + Ergebnis-Feeling)

- **Bingo-TV ist eine echte Tafel:** alle 75 Zahlen im B/I/N/G/O-Raster, Gezogene grün, aktuelle pulsiert
- **Siege fühlen sich an:** Konfetti-Regen + Fanfare auf dem TV, Fanfare + Vibration auf Handys (einmalig pro Sieg)
- **Quiz persönlich:** Handy zeigt „✅ Richtig! +100" oder „❌ – richtig wäre X" statt nur „warten"
- **Mehr Vorschau:** Vier-Brett auch auf Handy, Farbrausch-Topkarte groß, Bingo-Zahl riesig

## Neu in v0.6.2 (Spielwahl + Quiz-Fluss)

- **Spielwahl geht immer:** TV-Picker sperrt nichts mehr (Mindestspieler nur als Hinweis) + **Handys können das Spiel wechseln** (🎬 Steuerung → Icon-Leiste) – kein Festkleben auf Quiz mehr, auch ohne TV
- **Quiz läuft von allein:** nach Reveal automatisch nächste Frage (6 s), TV-„Weiter" nur noch zum Überspringen; Neustart mitten im Reveal ist timersicher (kein Phantom-Skip)
- Geprüft: Handy→TV Spielwechsel, Auto-Weiter, manueller Skip, 246 Render-Pfade

## Neu in v0.6.1 (Spiel-Systematik)

- **Quiz-Progress auf TV:** „X / Y Antworten drin" + ✅/⏳ pro Spieler (auch auf Handys sichtbar)
- **Hänge-Bug weg:** Ging ein Spieler offline, wartete das Quiz ewig – jetzt: Offline-Spieler zählen nicht mehr als „fehlen" (Reveal sofort), Rückkehrer zählen wieder, 15-s-Fallback-Timer bleibt
- **Test-Rig:** E2E-Renderer spielt alle 12 Spiele mit echten Sockets und rendert jeden State durch TV+Handy (246 Pfade) – verhindert „weißer Bildschirm"-Regressionen (`node test/e2e-render.js`)

## Neu in v0.6.0 (Rumpus-Join)

- TV erstellt Raum automatisch (kein Umweg mehr), zeigt permanent Code + URL + QR
- Handy: zuerst Code + Name + Emoji, inline Fehler („Raum gibt es nicht“), danach „Du bist drin 👀“ + Live-Roster
- Spiele-Picker mit Sperre („Braucht N+ Spieler“), Host kann Spieler kicken
- Mindestspieler werden serverseitig durchgesetzt (mit Begründung), Startfehler als Meldung statt Funkstille
- Identität (Name + Emoji) bleibt bei Reconnect erhalten

## Neu in v0.4.0

- Schachbrett zum Antippen auf dem Handy (legale Züge grün, letzter Zug markiert, Brett-Flip)
- Alle Spiele komplett ohne TV spielbar (Steuerung auf jedem Handy)
- Reconnect per Geräte-ID + Online-Status + Ton/Vibration bei eigenem Zug
- Lobby als Spiele-Karten mit Spieleranzahl

## Update / Deinstall

```bash
# Update (gleicher CT, neuer Code):
CTID=200 bash install/partyplay.sh update
# Im LXC: systemctl status partyplay / journalctl -u partyplay -f
# Deinstall:
pct stop 200 && pct destroy 200
```

## Reboot-Test

```bash
pct reboot 200
sleep 15
pct exec 200 -- systemctl is-active partyplay   # → active
curl -fsS http://<LXC-IP>:8080/api/health       # → {"ok":true,...}
```

## Repo-Struktur

```
server.js            # Express + Socket.IO, Räume, alle Spiele-Engines (Quiz/Schach/Farbrausch/SLF/Bingo/Vier/Wölfe)
public/              # index.html (Lobby), tv.html+tv.js (Host), play.html+play.js (Controller), style.css
partyplay.service    # systemd-Unit
install/partyplay.sh # Proxmox LXC Install-Script
```

Hinweise: Schach v1 ohne Rochade/En-passant (Bauern-Umwandlung → Dame). Farbrausch v1 ohne Stapeln. Bluff v1 Fixed-Limit ohne Erhöhen/Seite-Pots. Alles offline – keine CDN/Fonts, keine Markennamen.

## Roadmap (geplant)

| Spiel | Spieler | Aufwand | Status |
|---|---|---|---|
| Stadt-Land-Fluss (Timer + TV-Kontrolle) | 2–8 | klein | ✅ v0.3.0 |
| Bingo (TV zieht, Handy-Karten auto) | 2–12 | klein | ✅ v0.3.0 |
| Vier in einer Reihe | 2 | klein | ✅ v0.3.0 |
| Dorf & Wölfe (Rollen geheim, TV moderiert) | 4–12 | mittel | ✅ v0.3.0 |
| Geheimworte (327 Wörter, Chef-Schlüssel) | 4+ | mittel | ✅ v0.5.0 |
| Bluff-Poker (Hold'em light, Chips) | 2–8 | mittel | ✅ v0.5.0 |
| Malen & Raten (Canvas, 241 Begriffe) | 3+ | groß | ✅ v0.5.0 |
| Würfelglück (Kniffel-Blatt + Bonus) | 1–6 | mittel | ✅ v0.5.0 |
| Wortverbot (151 Karten, 60 s) | 4+ | mittel | ✅ v0.5.0 |
| Buzzer-Quiz (Reaktion) | 2–8 | klein | geplant |
| Schiffe versenken | 2 | mittel | Idee |
| Montagsmaler-Extra / Stille Post | 3–8 | groß | Idee |

Hinweis zu Namen: bewusst keine Markennamen (kein UNO®, kein Tabu®, kein Connect 4) – eigene Bezeichnungen, eigene Fragen/Karten.
