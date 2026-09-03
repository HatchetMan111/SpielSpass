# PartyPlay 🎮 – lokale TV + Handy Partyspiele

TV als Host, Handys als Controller – **komplett im privaten Netzwerk, keine Cloud**.
Spiele: **Quiz**, **Schach** (2 Spieler, TV zeigt Brett), **Farbrausch** (eigenes Farb-Kartenspiel, 2–6 Spieler),
**Stadt-Land-Fluss** (2–8, Timer + TV-Kontrolle), **Bingo** (2–12, TV zieht), **Vier in einer Reihe** (2 Spieler),
**Dorf & Wölfe** (4–12, Rollen geheim aufs Handy).

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

## Spielen

1. TV-Browser (Fire TV / Smart-TV / Laptop per HDMI) öffnen: `http://<LXC-IP>:8080/` → Spiel wählen → Raum-Code (z. B. `KQ7M`) erscheint
2. Handys im selben WLAN: `http://<LXC-IP>:8080/play?room=KQ7M` → Namen eingeben → losspielen
3. **Ohne TV geht alles auch:** Jedes Handy hat unten eine „🎬 Spielsteuerung“ (Start/Stopp/Ziehen/Weiter) – ideal, wenn ihr in **verschiedenen Zimmern** sitzt. Einladungs-Link per „🔗 Einladungs-Link kopieren“ teilen.
4. Quiz: TV/Handy zeigt Frage, Handy antwortet (15 s). Schach: **Brett antippen** (Figur → grüne Punkte → Ziel), Brett dreht sich je nach Farbe mit. Farbrausch: Handkarten tippen, „Karte ziehen“ wenn nichts passt.
5. SLF: Buchstabe am TV/Handy, Wörter am Handy, Stopp + Auswerten von überall, ungültige Wörter antippbar. Bingo: Karte automatisch aufs Handy, „BINGO rufen“ wird geprüft. Vier: Farbe wählen, Spalte tippen. Wölfe: Rolle geheim aufs Handy, nachts handeln, tags abstimmen – Moderation von TV oder Handy.
6. **Komfort:** „🔔 DU bist am Zug“ + Ton/Vibration, Online-Punkte (●/○), Sitz/Hand/Punkte überleben WLAN-Abbrüche (autom. Reconnect, 10 Min. Karenz). Offline-Spieler bei Farbrausch per „⏭ Zug überspringen“ übergehbar.

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

Hinweise: Schach v1 ohne Rochade/En-passant, mit Schach/Matt-Erkennung + Bauern-Umwandlung (→ Dame). Farbrausch v1 ohne Stapeln. Alles offline – keine CDN/Fonts.

## Roadmap (geplant)

| Spiel | Spieler | Aufwand | Status |
|---|---|---|---|
| Stadt-Land-Fluss (Timer + TV-Kontrolle) | 2–8 | klein | ✅ v0.3.0 |
| Bingo (TV zieht, Handy-Karten auto) | 2–12 | klein | ✅ v0.3.0 |
| Vier in einer Reihe | 2 | klein | ✅ v0.3.0 |
| Buzzer-Quiz (Reaktion) | 2–8 | klein | geplant |
| Dorf & Wölfe (Rollen geheim, TV moderiert) | 4–12 | mittel | ✅ v0.3.0 |
| Schiffe versenken | 2 | mittel | Idee |
| Montagsmaler (zeichnen + raten) | 3–8 | groß | Idee |

Hinweis zu Namen: bewusst keine Markennamen (kein UNO®, kein Tabu®, kein Connect 4) – eigene Bezeichnungen, eigene Fragen/Karten.
