#!/usr/bin/env bash
# Koohat — chạy bằng 1 lệnh trên macOS / Linux.
#   curl -fsSL https://raw.githubusercontent.com/DuongGFI/koohat/main/start.sh | bash
# Tự dùng Docker nếu có; nếu không thì dùng Node (clone + build + chạy).
set -e

IMAGE="ghcr.io/duonggfi/koohat:latest"
REPO="https://github.com/DuongGFI/koohat.git"
PORT="${PORT:-1234}"

# Dò IP LAN của máy này để QR trỏ đúng cho điện thoại cùng WiFi.
detect_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}
LAN_IP="$(detect_ip | head -n1)"

echo "==> Koohat đang khởi động (cổng $PORT)..."

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "==> Dùng Docker."
  docker rm -f koohat >/dev/null 2>&1 || true
  docker run -d --name koohat -p "${PORT}:1234" \
    ${LAN_IP:+-e PUBLIC_HOST="$LAN_IP"} \
    --restart unless-stopped "$IMAGE"
  echo ""
  echo "✅ Đã chạy! Mở trên máy này:  http://localhost:${PORT}"
  [ -n "$LAN_IP" ] && echo "   Người chơi cùng WiFi:      http://${LAN_IP}:${PORT}"
  echo "   Dừng:  docker rm -f koohat"
elif command -v node >/dev/null 2>&1; then
  echo "==> Không có Docker — dùng Node."
  DIR="${KOOHAT_DIR:-$HOME/koohat}"
  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" pull --ff-only || true
  else
    git clone --depth 1 "$REPO" "$DIR"
  fi
  cd "$DIR"
  npm run install:all
  npm run build
  echo ""
  echo "✅ Mở trên máy này: http://localhost:${PORT}"
  [ -n "$LAN_IP" ] && echo "   Người chơi cùng WiFi: http://${LAN_IP}:${PORT}"
  PORT="$PORT" npm start
else
  echo "❌ Máy chưa có Docker hoặc Node.js."
  echo "   Cài một trong hai rồi chạy lại:"
  echo "   • Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "   • Node.js (>=18): https://nodejs.org/"
  exit 1
fi
