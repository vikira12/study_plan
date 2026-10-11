param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-local-server.ps1'
$startupDirectory = [Environment]::GetFolderPath('Startup')
if (-not $startupDirectory) { throw '현재 사용자의 시작프로그램 폴더를 찾지 못했습니다.' }
$shortcutPath = Join-Path $startupDirectory 'Study Planner Server.lnk'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
  $existing = $shell.CreateShortcut($shortcutPath)
  $owned = $existing.Description -eq 'Windows 로그인 시 스터디 플래너 로컬 서버 실행' -and
    $existing.Arguments -match 'start-local-server\.ps1"' -and
    [IO.Path]::GetFileName($existing.TargetPath) -eq 'powershell.exe'
  if (-not $owned) { throw '같은 이름의 다른 시작프로그램이 있습니다. 자동으로 덮어쓰지 않습니다.' }
}
if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Output '서버 자동 시작 등록을 해제했습니다. 일정 데이터와 현재 서버는 유지됩니다.'
  exit 0
}
$nodePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -NodePath "' + $nodePath + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Windows 로그인 시 스터디 플래너 로컬 서버 실행'
$shortcut.Save()
Write-Output ('자동 시작 등록 완료: ' + $shortcutPath)
