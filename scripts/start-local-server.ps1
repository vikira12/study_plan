param([string]$NodePath)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'server.js'
$hash = [Security.Cryptography.SHA256]::Create()
try {
  $expectedInstance = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-', '').ToLowerInvariant()
} finally { $hash.Dispose() }
$logDirectory = Join-Path $env:LOCALAPPDATA 'StudyPlanner'
$startupLog = Join-Path $logDirectory 'startup.log'
$startupMutex = New-Object System.Threading.Mutex($false, 'Local\StudyPlannerServerStartup')
$ownsMutex = $false

try {
  $ownsMutex = $startupMutex.WaitOne(0)
  if (-not $ownsMutex) { exit 0 }
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) { throw 'server.js를 찾지 못했습니다.' }
  if (-not $NodePath) {
    $bundledNode = Join-Path $projectRoot 'runtime\node.exe'
    if (Test-Path -LiteralPath $bundledNode -PathType Leaf) { $NodePath = $bundledNode }
    else { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
  }
  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Node.js 실행 파일을 찾지 못했습니다. 자동 시작을 다시 등록하세요.' }

  # 이미 실행 중인 서버는 그대로 사용한다. 다른 앱의 프로세스는 종료하지 않는다.
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
    if ($health.app -eq 'study-planner' -and $health.status -eq 'ok' -and $health.instance -eq $expectedInstance) { exit 0 }
  } catch { }
  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw '3000 포트를 다른 서버가 사용 중입니다. 기존 서버를 확인하세요.' }

  $env:HOST = '127.0.0.1'
  $env:PORT = '3000'
  Start-Process -FilePath $NodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDirectory 'server-output.log') `
    -RedirectStandardError (Join-Path $logDirectory 'server-error.log') | Out-Null
  for ($attempt = 0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
      if ($health.app -eq 'study-planner' -and $health.status -eq 'ok' -and $health.instance -eq $expectedInstance) {
        Add-Content -LiteralPath $startupLog -Value ((Get-Date -Format s) + ' 서버 자동 시작 완료') -Encoding UTF8
        exit 0
      }
    } catch { }
  }
  throw '서버 시작을 확인하지 못했습니다. server-error.log를 확인하세요.'
} catch {
  if (Test-Path -LiteralPath $logDirectory) {
    Add-Content -LiteralPath $startupLog -Value ((Get-Date -Format s) + ' ' + $_.Exception.Message) -Encoding UTF8
  }
  Write-Error $_ -ErrorAction Continue
  exit 1
} finally {
  if ($ownsMutex) { $startupMutex.ReleaseMutex() }
  $startupMutex.Dispose()
}
