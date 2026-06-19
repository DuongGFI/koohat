#!/usr/bin/env bash
# Koohat - chay bang 1 dong tren macOS / Linux. KHONG can cai gi truoc.
#   curl -fsSL https://raw.githubusercontent.com/DuongGFI/koohat/main/start.sh | bash
# Tai bundle koohat.cjs (tu chua toan bo app) + chay bang Node co san;
# neu may chua co Node thi tai Node portable (khong can quyen root).
set -e

CJS_URL="https://github.com/DuongGFI/koohat/releases/latest/download/koohat.cjs"
NODE_VER="v20.18.1"
PORT="${PORT:-1234}"
DIR="${HOME}/.koohat-app"
mkdir -p "$DIR"; cd "$DIR"

# Tim Node: dung ban co san, neu khong thi tai portable.
if command -v node >/dev/null 2>&1; then
  NODE="node"
else
  case "$(uname -s)" in
    Linux)  PLAT="linux" ;;
    Darwin) PLAT="darwin" ;;
    *) echo "He dieu hanh khong ho tro. Hay cai Node tu https://nodejs.org"; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) A="x64" ;;
    arm64|aarch64) A="arm64" ;;
    *) A="x64" ;;
  esac
  PKG="node-${NODE_VER}-${PLAT}-${A}"
  if [ ! -x "$DIR/$PKG/bin/node" ]; then
    echo "==> Tai Node portable ($PKG)... (khong can cai dat)"
    curl -fsSL "https://nodejs.org/dist/${NODE_VER}/${PKG}.tar.gz" -o node.tar.gz
    tar -xzf node.tar.gz
  fi
  NODE="$DIR/$PKG/bin/node"
fi

echo "==> Tai koohat.cjs..."
curl -fsSL "$CJS_URL" -o koohat.cjs

echo "==> Chay server. Mo tren may nay: http://localhost:$PORT"
echo "    (Giu cua so nay mo trong luc choi.)"
PORT="$PORT" KOOHAT_PACKAGED=1 "$NODE" koohat.cjs
