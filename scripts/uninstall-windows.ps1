$ErrorActionPreference = 'Stop'
$installedRoot = Split-Path -Parent $PSScriptRoot
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\StudyPlanner'))
if ([IO.Path]::GetFullPath($installedRoot) -ne $expectedRoot) { throw '정해진 설치 폴더에서만 제거할 수 있습니다.' }
$marker = Get-Content -Raw -LiteralPath (Join-Path $installedRoot 'study-planner-install.json') -Encoding UTF8 | ConvertFrom-Json
if ($marker.app -ne 'study-planner') { throw '이 앱의 설치 폴더인지 확인하지 못했습니다.' }
Write-Output '자동 시작과 바로가기를 해제합니다. 개인 일정과 백업은 삭제하지 않습니다.'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $powershellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-windows-startup.ps1') -Remove
if ($LASTEXITCODE -ne 0) { throw '자동 시작 해제에 실패했습니다.' }
$shell = New-Object -ComObject WScript.Shell
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Study Planner.lnk'
if (Test-Path -LiteralPath $desktopShortcut) {
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  if ($shortcut.Description -eq '스터디 플래너 실행' -and $shortcut.Arguments.Contains($installedRoot)) { Remove-Item -LiteralPath $desktopShortcut }
}
$serverPath = Join-Path $installedRoot 'server.js'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -like ('*"' + $serverPath + '"*')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
Write-Output ('해제 완료. 프로그램 파일을 지우려면 다음 폴더만 직접 삭제하세요: ' + $installedRoot)
Write-Output '개인 데이터는 %LOCALAPPDATA%\StudyPlanner 에 유지됩니다. Lively의 배경화면 등록은 따로 해제하세요.'
