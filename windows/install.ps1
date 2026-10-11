param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$payload = Join-Path $PSScriptRoot 'payload'
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$destination = Join-Path $env:LOCALAPPDATA 'Programs\StudyPlanner'
$ownerMarker = Join-Path $destination 'study-planner-install.json'
$shell = New-Object -ComObject WScript.Shell

try {
  if (-not [Environment]::Is64BitOperatingSystem) { throw '64비트 Windows가 필요합니다.' }
  $manifest = Get-Content -Raw -LiteralPath $manifestPath -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.app -ne 'study-planner' -or $manifest.files.Count -lt 10) { throw '설치 자료 형식이 올바르지 않습니다.' }
  $required = @('server.js', 'index.html', 'style.css', 'app.js', 'runtime/node.exe', 'runtime/LICENSE',
    'scripts/open-planner.ps1', 'scripts/start-local-server.ps1', 'scripts/install-windows-startup.ps1', 'scripts/uninstall-windows.ps1', 'setup.html')
  foreach ($name in $required) {
    if ($name -notin $manifest.files.path) { throw ('필수 설치 파일이 없습니다: ' + $name) }
  }
  $seen = @{}
  foreach ($entry in $manifest.files) {
    if (($entry.path -notmatch '^[a-zA-Z0-9_./-]+$' -and $entry.path -notin @('실행.cmd', '제거.cmd')) -or $entry.path -match '(^|/)\.\.?(/|$)' -or $entry.path.StartsWith('/') -or $seen.ContainsKey($entry.path)) {
      throw '허용되지 않는 설치 경로입니다.'
    }
    $seen[$entry.path] = $true
    $sourceFile = Join-Path $payload $entry.path
    if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
      throw ('파일 검증에 실패했습니다. ZIP을 다시 받으세요: ' + $entry.path)
    }
  }
  $runtime = Join-Path $payload 'runtime\node.exe'
  & $runtime --version
  if ($LASTEXITCODE -ne 0) { throw '이 PC에서 실행할 수 없는 런타임입니다. PC 아키텍처에 맞는 ZIP을 받으세요.' }
  if ($ValidateOnly) { Write-Output '검증 완료. 설치·바로가기·자동 시작 설정은 변경하지 않았습니다.'; exit 0 }
  if (Test-Path -LiteralPath $destination) {
    if (-not (Test-Path -LiteralPath $ownerMarker)) { throw '설치 위치에 소유권을 확인할 수 없는 폴더가 있습니다. 덮어쓰지 않습니다.' }
    $owner = Get-Content -Raw -LiteralPath $ownerMarker -Encoding UTF8 | ConvertFrom-Json
    if ($owner.app -ne 'study-planner') { throw '다른 앱의 폴더는 덮어쓰지 않습니다.' }
  }
  # 다른 앱이나 개발 중인 서버가 같은 포트를 쓰면 설치 전에 멈춘다.
  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  $ownedProcesses = @()
  foreach ($connection in $listener) {
    $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $connection.OwningProcess)
    $installedServer = Join-Path $destination 'server.js'
    if ($processInfo.Name -ne 'node.exe' -or $processInfo.CommandLine -notlike ('*"' + $installedServer + '"*')) {
      throw '3000 포트가 다른 서버에서 사용 중입니다. 기존 서버를 직접 종료한 뒤 설치하세요.'
    }
    $ownedProcesses += $processInfo.ProcessId
  }
  foreach ($processId in ($ownedProcesses | Select-Object -Unique)) { Stop-Process -Id $processId -ErrorAction Stop }
  foreach ($entry in $manifest.files) {
    $targetFile = Join-Path $destination $entry.path
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $payload $entry.path) -Destination $targetFile -Force
  }
  # 개인 일정·배경화면 배치와 별도의 설치 폴더만 갱신한다.
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ownerMarker -Encoding UTF8
  $powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Study Planner.lnk'
  if (Test-Path -LiteralPath $desktopShortcut) {
    $existing = $shell.CreateShortcut($desktopShortcut)
    if ($existing.Description -ne '스터디 플래너 실행') { throw '같은 이름의 다른 바탕화면 바로가기가 있습니다. 덮어쓰지 않습니다.' }
  }
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $powershellPath
  $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $destination 'scripts\open-planner.ps1') + '"'
  $shortcut.WorkingDirectory = $destination
  $shortcut.WindowStyle = 7
  $shortcut.Description = '스터디 플래너 실행'
  $shortcut.Save()
  & $powershellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destination 'scripts\install-windows-startup.ps1')
  if ($LASTEXITCODE -ne 0) { throw '자동 시작 등록 실패. 설치 폴더의 제거.cmd로 등록을 해제할 수 있습니다.' }
  & $powershellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destination 'scripts\open-planner.ps1') -Setup
  if ($LASTEXITCODE -ne 0) { throw '서버 실행 실패. 설치 폴더의 실행.cmd로 다시 시도하세요.' }
  Write-Output ('설치 완료: ' + $destination)
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
