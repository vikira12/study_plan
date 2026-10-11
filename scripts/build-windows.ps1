param([ValidateSet('x64', 'arm64')][string]$Architecture = 'x64')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectRoot = Split-Path -Parent $PSScriptRoot
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$scratch = Join-Path $temporaryRoot ('study-planner-package-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$utf8Bom = New-Object Text.UTF8Encoding($true)

try {
  # 런타임만 포함한다. npm, 사용자 브라우저 데이터, 로컬 일정, Git 폴더는 복사하지 않는다.
  $releaseUrl = 'https://nodejs.org/dist/latest-v24.x/'
  $checksums = (Invoke-WebRequest -UseBasicParsing -Uri ($releaseUrl + 'SHASUMS256.txt')).Content
  $match = [regex]::Match($checksums, '(?m)^([a-f0-9]{64})\s+(node-(v24\.[0-9]+\.[0-9]+)-win-' + $Architecture + '\.zip)\s*$')
  if (-not $match.Success) { throw '공식 Node.js LTS 런타임의 체크섬을 찾지 못했습니다.' }
  $archiveName = $match.Groups[2].Value
  $version = $match.Groups[3].Value
  $archive = Join-Path $scratch $archiveName
  $downloadUrl = 'https://nodejs.org/dist/' + $version + '/' + $archiveName
  Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archive
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) { throw '런타임 체크섬 검증 실패' }
  $runtimeRoot = Join-Path (Join-Path $scratch 'node') ('node-' + $version + '-win-' + $Architecture)
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $runtimeArchive = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($name in @('node.exe', 'LICENSE')) {
      $entry = $runtimeArchive.GetEntry('node-' + $version + '-win-' + $Architecture + '/' + $name)
      if (-not $entry) { throw ('런타임 파일이 없습니다: ' + $name) }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtimeRoot $name))
    }
  } finally { $runtimeArchive.Dispose() }
  $packageRoot = Join-Path $scratch 'StudyPlanner'
  $payload = Join-Path $packageRoot 'payload'
  $manifestFiles = @()
  $files = @('index.html', 'style.css', 'app.js', 'server.js', 'wallpaper.html', 'wallpaper-widget.js', 'school-meals.js', 'setup.html',
    'data/calendar.json', 'data/meals.json', 'scripts/start-local-server.ps1', 'scripts/install-windows-startup.ps1', 'scripts/open-planner.ps1', 'scripts/uninstall-windows.ps1')
  foreach ($name in $files) {
    $sourceFile = Join-Path $projectRoot $name
    $targetFile = Join-Path $payload $name
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
    if ($name.EndsWith('.ps1')) { [IO.File]::WriteAllText($targetFile, [IO.File]::ReadAllText($sourceFile), $utf8Bom) }
    else { Copy-Item -LiteralPath $sourceFile -Destination $targetFile }
  }
  New-Item -ItemType Directory -Path (Join-Path $payload 'runtime') | Out-Null
  foreach ($name in @('node.exe', 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $runtimeRoot $name) -Destination (Join-Path $payload ('runtime\' + $name)) }
  Copy-Item -LiteralPath (Join-Path $projectRoot 'windows\launch.cmd') -Destination (Join-Path $payload '실행.cmd')
  Copy-Item -LiteralPath (Join-Path $projectRoot 'windows\uninstall.cmd') -Destination (Join-Path $payload '제거.cmd')
  # 한국어 파일명은 설치 경로 검증에서도 명시적으로 허용한다.
  foreach ($file in (Get-ChildItem -LiteralPath $payload -Recurse -File)) {
    $relative = $file.FullName.Substring($payload.Length + 1).Replace('\', '/')
    $manifestFiles += @{ path = $relative; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  $manifest = @{ app = 'study-planner'; architecture = $Architecture; nodeVersion = $version; nodeSource = $downloadUrl;
    nodeArchiveSha256 = $match.Groups[1].Value; builtAt = (Get-Date).ToUniversalTime().ToString('o'); files = $manifestFiles }
  [IO.File]::WriteAllText((Join-Path $packageRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), $utf8)
  [IO.File]::WriteAllText((Join-Path $packageRoot 'install.ps1'), [IO.File]::ReadAllText((Join-Path $projectRoot 'windows\install.ps1')), $utf8Bom)
  Copy-Item -LiteralPath (Join-Path $projectRoot 'windows\install.cmd') -Destination (Join-Path $packageRoot '설치.cmd')
  Copy-Item -LiteralPath (Join-Path $projectRoot 'setup.html') -Destination (Join-Path $packageRoot '처음-사용하기.html')
  $outputDirectory = Join-Path $projectRoot 'dist\windows'
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $zipPath = Join-Path $outputDirectory ('StudyPlanner-Windows-' + $Architecture + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
  Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Output ('배포 ZIP: ' + $zipPath)
  Write-Output ('ZIP SHA256: ' + (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash)
} finally {
  $resolvedScratch = [IO.Path]::GetFullPath($scratch)
  if ($resolvedScratch.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolvedScratch) -match '^study-planner-package-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
  }
}
