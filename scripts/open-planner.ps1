param([switch]$Setup)

$ErrorActionPreference = 'Stop'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
try {
  & $powershellPath -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-local-server.ps1')
  if ($LASTEXITCODE -ne 0) { throw '서버를 시작하지 못했습니다. 3000 포트와 startup.log를 확인하세요.' }
  $url = if ($Setup) { 'http://127.0.0.1:3000/setup.html' } else { 'http://127.0.0.1:3000/' }
  Start-Process $url
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '스터디 플래너 실행 실패') | Out-Null
  exit 1
}
