# Koohat — chạy bằng 1 lệnh trên Windows (PowerShell).
#   irm https://raw.githubusercontent.com/DuongGFI/koohat/main/start.ps1 | iex
# Tự dùng Docker nếu có; nếu không thì dùng Node (clone + build + chạy).
$ErrorActionPreference = "Stop"

$Image = "ghcr.io/duonggfi/koohat:latest"
$Repo  = "https://github.com/DuongGFI/koohat.git"
$Port  = if ($env:PORT) { $env:PORT } else { "1234" }

# Dò IP LAN (IPv4 thật, bỏ loopback/APIPA) để QR trỏ đúng cho điện thoại.
function Get-LanIp {
  try {
    (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
      Select-Object -First 1).IPAddress
  } catch { $null }
}
$LanIp = Get-LanIp

Write-Host "==> Koohat đang khởi động (cổng $Port)..."

$hasDocker = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try { docker info *> $null; $hasDocker = $true } catch { $hasDocker = $false }
}

if ($hasDocker) {
  Write-Host "==> Dùng Docker."
  docker rm -f koohat *> $null
  $envArg = if ($LanIp) { @("-e", "PUBLIC_HOST=$LanIp") } else { @() }
  docker run -d --name koohat -p "${Port}:1234" @envArg --restart unless-stopped $Image
  Write-Host ""
  Write-Host "OK! Mở trên máy này:  http://localhost:$Port"
  if ($LanIp) { Write-Host "   Người chơi cùng WiFi: http://${LanIp}:$Port" }
  Write-Host "   Dừng:  docker rm -f koohat"
}
elseif (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host "==> Không có Docker — dùng Node."
  $Dir = if ($env:KOOHAT_DIR) { $env:KOOHAT_DIR } else { Join-Path $HOME "koohat" }
  if (Test-Path (Join-Path $Dir ".git")) {
    git -C $Dir pull --ff-only
  } else {
    git clone --depth 1 $Repo $Dir
  }
  Set-Location $Dir
  npm run install:all
  npm run build
  Write-Host ""
  Write-Host "OK! Mở trên máy này: http://localhost:$Port"
  if ($LanIp) { Write-Host "   Người chơi cùng WiFi: http://${LanIp}:$Port" }
  $env:PORT = $Port
  npm start
}
else {
  Write-Host "Máy chưa có Docker hoặc Node.js." -ForegroundColor Red
  Write-Host "  Cài một trong hai rồi chạy lại:"
  Write-Host "  - Docker Desktop: https://www.docker.com/products/docker-desktop/"
  Write-Host "  - Node.js (>=18): https://nodejs.org/"
  exit 1
}
