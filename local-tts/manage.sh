#!/usr/bin/env bash
# P1 local GPU helper. Manual, explicit Docker setup; never runs as root and never edits system settings.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM="$ROOT/upstream"
COMPOSE="$ROOT/compose.yaml"
REPO="https://github.com/Boran-Sert/Turkish-TTS.git"
# Reviewed upstream main SHA. Pin source, do not execute an unreviewed floating branch.
REVISION="5b51c1423f74cef0a377a31c4d754fb51061f5ac"

usage() {
  cat <<'HELP'
Söylet — Turkish-TTS local GPU runtime (Linux / Windows WSL2 + NVIDIA)
Usage: bash local-tts/manage.sh {doctor|setup|download|start|status|logs|stop}
  doctor    check Git/Docker/Compose and show GPU hints (no downloads)
  setup     fetch pinned upstream, build image, download weights, start service
  download  fetch pinned upstream, build image and download weights only
  start     start a previously set up service (keeps cached model)
  status    show Docker status and check http://127.0.0.1:8000/ready
  logs      follow service logs (Ctrl+C exits logs, not the service)
  stop      stop and remove container (PRESERVES model cache volume)

The local service binds ONLY 127.0.0.1:8000.
No model is installed through the browser. Avoid 'docker compose down -v' to keep weights.
Docs: docs/turkish-tts-local.md
HELP
}

die() { printf 'HATA: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
compose() { docker compose --project-directory "$ROOT" -f "$COMPOSE" "$@"; }

doctor() {
  command -v git >/dev/null 2>&1 || die "Git kurulu değil."
  command -v docker >/dev/null 2>&1 || die "Docker kurulu değil."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 gerekli."
  docker info >/dev/null 2>&1 || die "Docker daemon erişilemiyor (Docker Desktop/Engine çalışıyor mu?)."
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi -L || die "NVIDIA GPU/sürücü hatası. CUDA GPU erişimini doğrulayın."
  else
    info "UYARI: nvidia-smi bulunamadı. NVIDIA sürücü, WSL2 GPU veya container toolkit'i kontrol edin."
  fi
  info "Docker hazır. Konteyner GPU erişimi ilk başlatmada ayrıca sınanır."
}

ensure_source() {
  if [[ -e "$UPSTREAM" && ! -d "$UPSTREAM/.git" ]]; then
    die "$UPSTREAM mevcut fakat bir Git checkout değil. Elle kontrol edin."
  fi
  if [[ ! -d "$UPSTREAM/.git" ]]; then
    info "Pinned Turkish-TTS kaynağı indiriliyor (GitHub)."
    git clone --filter=blob:none "$REPO" "$UPSTREAM"
  fi
  local origin
  origin="$(git -C "$UPSTREAM" remote get-url origin)"
  [[ "$origin" == "$REPO" ]] || die "Beklenmeyen upstream remote: $origin"
  # Avoid overwriting user modifications in an existing checkout.
  [[ -z "$(git -C "$UPSTREAM" status --porcelain)" ]] || die "Upstream klasöründe değişiklikler var; önce inceleyin."
  if ! git -C "$UPSTREAM" cat-file -e "$REVISION^{commit}" 2>/dev/null; then
    git -C "$UPSTREAM" fetch origin "$REVISION"
  fi
  if [[ "$(git -C "$UPSTREAM" rev-parse HEAD)" != "$REVISION" ]]; then
    git -C "$UPSTREAM" checkout --detach "$REVISION"
  fi
  [[ "$(git -C "$UPSTREAM" rev-parse HEAD)" == "$REVISION" ]] || die "Upstream kaynak sürümü doğrulanamadı."
  info "Turkish-TTS kaynak SHA: $REVISION"
}

download_weights() {
  info "Docker image oluşturuluyor (ilk kurulumda zaman alabilir)."
  compose build tts
  info "Model ağırlıkları yerel Docker volume'a indiriliyor (~5 GB)."
  compose run --rm tts turkish-tts-fetch --model Trendyol/Trendyol-TTS
}

status() {
  compose ps
  if command -v curl >/dev/null 2>&1; then
    info "Hazırlık kontrolü (GET /ready):"
    if ! curl --connect-timeout 3 --max-time 8 --fail --show-error --silent http://127.0.0.1:8000/ready; then
      printf '\nModel açılışta yükleniyor olabilir. Ayrıntı: bash local-tts/manage.sh logs\n' >&2
      return 1
    fi
    printf '\n'
  else
    info "curl kurulu değil; /ready kontrolünü tarayıcıda açın."
  fi
}

case "${1:-}" in
  doctor)
    doctor
    ;;
  setup)
    doctor
    ensure_source
    download_weights
    compose up -d tts
    info "Servis başlatıldı. /ready yanıtı model yüklendikten sonra 200 olur."
    info "Söylet API adresi: http://127.0.0.1:8000"
    info "İzlemek için: bash local-tts/manage.sh logs veya status"
    ;;
  download)
    doctor
    ensure_source
    download_weights
    info "Model önbellekte. Başlatmak için: bash local-tts/manage.sh start"
    ;;
  start)
    doctor
    [[ -d "$UPSTREAM/.git" ]] || die "Önce 'setup' veya 'download' çalıştırın."
    ensure_source
    compose up -d tts
    info "Servis başlatılıyor. Hazırlık kontrolü: bash local-tts/manage.sh status"
    ;;
  status)
    command -v docker >/dev/null 2>&1 || die "Docker yok."
    compose version >/dev/null 2>&1 || die "Docker Compose v2 gerekli."
    status
    ;;
  logs)
    compose logs --tail=100 -f tts
    ;;
  stop)
    compose down
    info "Konteyner durduruldu, model cache volume korundu."
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
