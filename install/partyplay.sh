#!/usr/bin/env bash
# PartyPlay – Proxmox VE Community-Scripts Stil Installation
# Erstellt einen LXC-Container und installiert PartyPlay (TV=Host, Handy=Player: Schach/Farbrausch/Quiz)
# Einzeiler: bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/SpielSpass/main/install/partyplay.sh)"
set -euo pipefail

# ---------------- Variablen (oben, anpassbar) ----------------
APP="partyplay"
PORT="8080"
CTID="${CTID:-}"
CT_HOSTNAME="${CT_HOSTNAME:-partyplay}"
MEMORY="${MEMORY:-2048}"       # MB
CORES="${CORES:-2}"
DISKSIZE="${DISKSIZE:-8}"      # GB
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
TEMPLATE="${TEMPLATE:-debian-12-standard_12.7-1_amd64.tar.zst}"
BRIDGE="${BRIDGE:-vmbr0}"
NETCONF="${NETCONF:-dhcp}"     # dhcp oder z.B. "192.168.1.50/24,gw=192.168.1.1"
GH_USER="${GH_USER:-HatchetMan111}"
GH_REPO="${GH_REPO:-SpielSpass}"
GH_BRANCH="${GH_BRANCH:-main}"
DEBUG="${DEBUG:-0}"

# ---------------- Debugging: volle Kette ----------------
if [[ "$DEBUG" == "1" ]]; then set -x; fi
FAIL_LINE=""; FAIL_CMD=""
trap 'FAIL_LINE=$LINENO; FAIL_CMD=$BASH_COMMAND' ERR
on_err() {
  ec=$?
  echo "================================================================" >&2
  echo "[${APP}] FEHLER – volle Kette:" >&2
  echo "  Exit-Code : $ec" >&2
  echo "  Zeile     : ${FAIL_LINE:-?}" >&2
  echo "  Befehl    : ${FAIL_CMD:-?}" >&2
  echo "  CTID      : $CTID  Host: $(hostname 2>/dev/null || true)" >&2
  echo "  Tipp: erneut mit DEBUG=1 starten für bash -x Log:" >&2
  echo "    DEBUG=1 bash -c \"\$(wget -qLO - https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/install/${APP}.sh)\"" >&2
  echo "  LXC-Logs: pct logs $CTID  |  pct exec $CTID -- journalctl -u ${APP} -n 100 --no-pager" >&2
  echo "================================================================" >&2
  exit $ec
}
trap on_err ERR

msg()  { echo -e "\e[1;32m[${APP}]\e[0m $*"; }
warn() { echo -e "\e[1;33m[${APP}]\e[0m WARN: $*" >&2; }
die()  { echo -e "\e[1;31m[${APP}]\e[0m FEHLER: $*" >&2; exit 1; }

check_root() { [[ "$(id -u)" == "0" ]] || die "Bitte als root auf dem Proxmox-Host ausführen."; }
check_pve() {
  command -v pveversion >/dev/null 2>&1 || die "pveversion nicht gefunden – bitte direkt auf dem Proxmox-Host ausführen."
  command -v pct >/dev/null 2>&1 || die "pct nicht gefunden."
  pveversion
}
# Prüft, ob die VMID von einem Gast (VM oder CT) belegt ist
guest_exists() {
  local id="$1"
  pct status "$id" >/dev/null 2>&1 && return 0
  qm status "$id" >/dev/null 2>&1 && return 0
  return 1
}
# Findet die niedrigste freie VMID ab Startwert (Standard 200)
next_free_vmid() {
  local id="${1:-200}"
  while guest_exists "$id"; do id=$((id + 1)); done
  echo "$id"
}
# Sicherer Auto-CT: wenn CTID fehlt/belegt ist, nimm nächste freie ID
ensure_ctid() {
  if [[ -z "$CTID" ]]; then
    CTID="$(next_free_vmid 200)"
    msg "Kein CTID angegeben – nutze automatisch freie ID $CTID."
  elif guest_exists "$CTID"; then
    # existierender Container? -> idempotenter Update-Pfad
    if pct status "$CTID" >/dev/null 2>&1; then
      msg "CT $CTID existiert bereits – idempotenter Update-Pfad (App wird aktualisiert, CT bleibt)."
    else
      local old="$CTID"
      CTID="$(next_free_vmid $((CTID + 1)))"
      warn "VMID $old ist von einer VM belegt – erstelle stattdessen CT mit ID $CTID. (Alternativ CTID=<freie-ID> beim Einzeiler mitgeben.)"
    fi
  fi
}

ensure_template() {
  msg "Prüfe Template ${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE} ..."
  if pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then msg "Template vorhanden."; return; fi
  msg "Lade Template (pveam download) – das dauert einmalig ..."
  pveam update
  # Falls exakte Version nicht mehr existiert, nimm neuestes debian-12-standard
  if ! pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"; then
    warn "Exaktes Template nicht gefunden, suche neuestes debian-12-standard ..."
    NEWEST="$(pveam available --section system 2>/dev/null | grep -o 'debian-12-standard_[^ ]*amd64.tar.zst' | sort -u | tail -n1 || true)"
    [[ -n "${NEWEST:-}" ]] || die "Kein Debian-12 Template auf $TEMPLATE_STORAGE verfügbar."
    TEMPLATE="$NEWEST"
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  fi
  msg "Template bereit: $TEMPLATE"
}

create_ct() {
  # CTID ist hier garantiert frei ODER unser eigener, bereits existierender CT (Update-Pfad)
  if pct status "$CTID" >/dev/null 2>&1; then
    pct start "$CTID" 2>/dev/null || true
    return
  fi
  local net="name=eth0,bridge=${BRIDGE},ip=${NETCONF}"
  msg "Erstelle LXC $CTID ($CT_HOSTNAME, ${CORES}vCPU/${MEMORY}MB/${DISKSIZE}G, $net) ..."
  pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
    --hostname "$CT_HOSTNAME" --cores "$CORES" --memory "$MEMORY" --swap 512 \
    --rootfs "${STORAGE}:${DISKSIZE}" --net0 "$net" \
    --onboot 1 --start 1 --unprivileged 1 --features nesting=1
  msg "Warte auf Netzwerk im CT ..."
  for _i in $(seq 1 30); do pct exec "$CTID" -- true 2>/dev/null && break; sleep 2; done
  pct start "$CTID" 2>/dev/null || true
  sleep 5
}

exec_ct() { pct exec "$CTID" -- bash -c "$*"; }

setup_app() {
  msg "Installiere Abhängigkeiten im CT $CTID ..."
  exec_ct "set -euxo pipefail; export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git nodejs npm"
  # Node >=18 prüfen, sonst Nodesource 20
  if ! exec_ct "node --version | grep -Eq 'v(1[89]|2[0-9])'"; then
    warn "System-Node zu alt – installiere Node 20 via Nodesource ..."
    exec_ct "set -euxo pipefail; curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
  fi
  exec_ct "node --version; npm --version"
  msg "Hole App-Code von github.com/${GH_USER}/${GH_REPO}@${GH_BRANCH} ..."
  exec_ct "set -euxo pipefail; if [ -d /opt/${APP}/.git ]; then git -C /opt/${APP} fetch --all && git -C /opt/${APP} checkout ${GH_BRANCH} && git -C /opt/${APP} pull --ff-only || true; else rm -rf /opt/${APP}; git clone -b ${GH_BRANCH} https://github.com/${GH_USER}/${GH_REPO}.git /opt/${APP}; fi; ls -la /opt/${APP}"
  msg "Installiere npm-Dependencies (production) ..."
  exec_ct "set -euxo pipefail; cd /opt/${APP} && (npm ci --omit=dev || npm install --omit=dev)"
  msg "Installiere systemd-Unit ..."
  exec_ct "set -euxo pipefail; cp /opt/${APP}/${APP}.service /etc/systemd/system/${APP}.service; systemctl daemon-reload; systemctl enable ${APP}; systemctl restart ${APP}"
}

verify() {
  msg "Verifiziere Installation ..."
  local st; st="$(pct exec "$CTID" -- systemctl is-active "$APP" 2>&1 || true)"
  echo "  systemctl is-active $APP -> $st"
  [[ "$st" == "active" ]] || { pct exec "$CTID" -- journalctl -u "$APP" -n 100 --no-pager || true; die "Service $APP ist nicht active (Status: $st)."; }
  msg "HTTP-Check auf localhost:${PORT} im CT ..."
  pct exec "$CTID" -- bash -c "set -x; curl -fsS -m 10 http://localhost:${PORT}/api/health; echo; curl -fsS -m 10 -o /dev/null -w 'HTTP %{http_code} /\\n' http://localhost:${PORT}/"
  local ip; ip="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || true)"
  echo ""
  echo "================================================================"
  msg "FERTIG ✅  PartyPlay läuft!"
  echo "  TV  : http://${ip:-<LXC-IP>}:${PORT}/tv?room=<CODE>  (erst in Lobby Raum erstellen)"
  echo "  Lobby (TV+Handy): http://${ip:-<LXC-IP>}:${PORT}/"
  echo "  Handy: http://${ip:-<LXC-IP>}:${PORT}/play?room=<CODE>"
  echo "  Container: CT $CTID (onboot=1), Service: systemctl status $APP (im CT)"
  echo "  Update: CTID=$CTID GH_USER=$GH_USER GH_REPO=$GH_REPO bash install/${APP}.sh"
  echo "  Deinstall: pct stop $CTID && pct destroy $CTID"
  echo "================================================================"
}

case "${1:-install}" in
  install|update|"") check_root; check_pve; ensure_template; ensure_ctid; create_ct; setup_app; verify ;;
  uninstall) check_root; pct stop "$CTID" 2>/dev/null || true; pct destroy "$CTID" ;;
  *) die "Usage: $0 [install|update|uninstall]" ;;
esac
