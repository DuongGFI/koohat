# Koohat - chay bang 1 dong tren Windows (PowerShell). KHONG can cai gi truoc.
#   irm https://raw.githubusercontent.com/DuongGFI/koohat/main/start.ps1 | iex
# Cach 1: tai koohat.exe da dong goi san (khong can Node).
# Cach 2 (fallback): tai Node portable (khong can Admin/UAC) + bundle koohat.cjs.
$ErrorActionPreference = "Stop"

$ExeUrl  = "https://github.com/DuongGFI/koohat/releases/latest/download/koohat.exe"
$CjsUrl  = "https://github.com/DuongGFI/koohat/releases/latest/download/koohat.cjs"
$NodeVer = "v20.18.1"
$Port    = if ($env:PORT) { $env:PORT } else { "1234" }

# Thu muc du lieu ghi duoc, khong can quyen Admin.
$Dir = Join-Path $env:LOCALAPPDATA "Koohat"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir

function Hold($msg, $color = "Yellow") {
  if ($msg) { Write-Host ""; Write-Host $msg -ForegroundColor $color }
  Write-Host ""
  try { Read-Host "Nhan Enter de dong cua so" | Out-Null } catch {}
}

try {
  Write-Host "==> Koohat: dang chuan bi (cong $Port)..."
  $env:PORT = $Port

  # ----- Cach 1: file .exe dong goi san -----
  $exe = Join-Path $Dir "koohat.exe"
  $haveExe = $false
  try {
    Write-Host "==> Tai koohat.exe..."
    Invoke-WebRequest -Uri $ExeUrl -OutFile $exe -UseBasicParsing
    Unblock-File -Path $exe -ErrorAction SilentlyContinue  # bo Mark-of-the-Web -> bot SmartScreen
    if ((Get-Item $exe).Length -gt 1MB) { $haveExe = $true }
  } catch {
    Write-Host "  (chua tai duoc .exe - chuyen sang Node portable)" -ForegroundColor Yellow
  }

  if ($haveExe) {
    Write-Host "==> Chay koohat.exe. Trinh duyet se tu mo: http://localhost:$Port"
    Write-Host "    (Giu cua so nay mo trong luc choi - dong la tat may chu.)"
    & $exe
    return
  }

  # ----- Cach 2 (fallback): Node portable + koohat.cjs -----
  $node = $null
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $node = "node"
  } else {
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $pkg  = "node-$NodeVer-win-$arch"
    $zip  = Join-Path $Dir "$pkg.zip"
    if (-not (Test-Path (Join-Path $Dir "$pkg\node.exe"))) {
      Write-Host "==> Tai Node portable ($pkg)... (khong can cai dat)"
      Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/$pkg.zip" -OutFile $zip -UseBasicParsing
      Expand-Archive -Path $zip -DestinationPath $Dir -Force
    }
    $node = Join-Path $Dir "$pkg\node.exe"
  }

  Write-Host "==> Tai koohat.cjs..."
  $cjs = Join-Path $Dir "koohat.cjs"
  Invoke-WebRequest -Uri $CjsUrl -OutFile $cjs -UseBasicParsing

  Write-Host "==> Chay server. Trinh duyet se tu mo: http://localhost:$Port"
  Write-Host "    (Giu cua so nay mo trong luc choi.)"
  $env:KOOHAT_PACKAGED = "1"  # ep tu mo trinh duyet khi chay bang node
  & $node $cjs
}
catch {
  Hold ("Loi: " + $_.Exception.Message) "Red"
}
