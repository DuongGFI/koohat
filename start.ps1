# Koohat — chạy bằng 1 lệnh trên Windows (PowerShell).
#   irm https://raw.githubusercontent.com/DuongGFI/koohat/main/start.ps1 | iex
# Tự dùng Docker nếu có; nếu không thì dùng Node (clone + build + chạy).
$ErrorActionPreference = "Stop"

$Image = "ghcr.io/duonggfi/koohat:latest"
$Repo  = "https://github.com/DuongGFI/koohat.git"
$Port  = if ($env:PORT) { $env:PORT } else { "1234" }

# Luôn dừng lại để người dùng đọc được thông báo (tránh "nháy rồi tắt").
function Hold([string]$msg, [string]$color = "Yellow") {
  if ($msg) { Write-Host "" ; Write-Host $msg -ForegroundColor $color }
  Write-Host ""
  try { Read-Host "Nhấn Enter để đóng cửa sổ" | Out-Null } catch {}
}

function Get-LanIp {
  try {
    (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } | Select-Object -First 1).IPAddress
  } catch { $null }
}

try {
  $LanIp = Get-LanIp
  Write-Host "==> Koohat dang khoi dong (cong $Port)..."

  $hasDocker = $false
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $hasDocker = $true } } catch {}
  }
  $hasNode = [bool](Get-Command node -ErrorAction SilentlyContinue)
  $hasGit  = [bool](Get-Command git  -ErrorAction SilentlyContinue)

  if ($hasDocker) {
    Write-Host "==> Dung Docker."
    docker rm -f koohat *> $null
    $envArg = if ($LanIp) { @("-e", "PUBLIC_HOST=$LanIp") } else { @() }
    docker run -d --name koohat -p "${Port}:1234" @envArg --restart unless-stopped $Image
    if ($LASTEXITCODE -ne 0) { throw "Khong chay duoc Docker container (xem loi o tren)." }
    Write-Host ""
    Write-Host "OK! Mo tren may nay:  http://localhost:$Port" -ForegroundColor Green
    if ($LanIp) { Write-Host "   Nguoi choi cung WiFi: http://${LanIp}:$Port" -ForegroundColor Green }
    Write-Host "   Dung:  docker rm -f koohat"
    Hold
  }
  elseif ($hasNode -and $hasGit) {
    Write-Host "==> Khong co Docker — dung Node."
    $Dir = if ($env:KOOHAT_DIR) { $env:KOOHAT_DIR } else { Join-Path $HOME "koohat" }
    if (Test-Path (Join-Path $Dir ".git")) { git -C $Dir pull --ff-only } else { git clone --depth 1 $Repo $Dir }
    Set-Location $Dir
    npm run install:all
    npm run build
    Write-Host ""
    Write-Host "OK! Mo tren may nay: http://localhost:$Port" -ForegroundColor Green
    if ($LanIp) { Write-Host "   Nguoi choi cung WiFi: http://${LanIp}:$Port" -ForegroundColor Green }
    Write-Host "   (Giu cua so nay mo — dong lai la tat server)" -ForegroundColor Yellow
    $env:PORT = $Port
    npm start
  }
  else {
    $lines = @("May chua san sang. Can cai 1 trong 2 (chi cai 1 lan):")
    if (-not $hasDocker) { $lines += "  - Docker Desktop: https://www.docker.com/products/docker-desktop/" }
    if (-not $hasNode)   { $lines += "  - Node.js (>=18): https://nodejs.org/  (de nhat cho Windows)" }
    if ($hasNode -and -not $hasGit) { $lines += "  - Co Node nhung THIEU Git: https://git-scm.com/download/win" }
    $lines += "Cai xong, mo PowerShell moi va dan lai lenh."
    Hold ($lines -join "`n") "Red"
  }
}
catch {
  Hold ("Da xay ra loi: " + $_.Exception.Message) "Red"
}
