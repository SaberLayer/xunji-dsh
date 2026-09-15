[CmdletBinding()]
param(
  [int]$PreferredPort = 3080,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot '.dsh\logs'

function Test-LoopbackPort([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync([System.Net.IPAddress]::Loopback, $Port)
    if (-not $connection.Wait(250)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

# DSH 0.1.5 起 Web 需要带 token 的地址；从启动日志解析，找不到时退回裸地址
function Get-XunjiUrl([int]$Port, [string[]]$LogPaths) {
  foreach ($logPath in $LogPaths) {
    if (-not (Test-Path $logPath)) { continue }
    $match = Select-String -Path $logPath -Pattern "http://127\.0\.0\.1:$Port/\?token=\S+" | Select-Object -First 1
    if ($match) { return $match.Matches[0].Value }
  }
  return "http://127.0.0.1:$Port"
}

function Open-Xunji([int]$Port, [string]$Url) {
  if (-not $NoBrowser) { Start-Process $Url }
  Write-Host "Xunji is ready: http://127.0.0.1:$Port"
}

$savedUrl = Join-Path $logDirectory "xunji-url-$PreferredPort.txt"
if (Test-LoopbackPort $PreferredPort) {
  $url = if (Test-Path $savedUrl) { (Get-Content -Path $savedUrl -First 1).Trim() } else { "http://127.0.0.1:$PreferredPort" }
  Open-Xunji $PreferredPort $url
  exit 0
}

$ports = @($PreferredPort, 3090, 3100, 3110, 3120)
$port = $ports | Where-Object {
  -not (Test-LoopbackPort $_) -and -not (Test-LoopbackPort ($_ + 1))
} | Select-Object -First 1

if ($null -eq $port) {
  throw 'Xunji could not find an available Web/config port pair. Close an existing Xunji instance or run npm start with a custom --port.'
}

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $logDirectory "launcher-$timestamp.out.log"
$stderrLog = Join-Path $logDirectory "launcher-$timestamp.err.log"
$node = Get-Command node.exe -ErrorAction Stop
$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$command = '"{0}" scripts/start.mjs --no-open --port {1} 1>"{2}" 2>"{3}"' -f $node.Path, $port, $stdoutLog, $stderrLog
$startInfo.FileName = $env:ComSpec
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.Arguments = "/d /s /c `"$command`""

New-Item -ItemType File -Force -Path $stdoutLog, $stderrLog | Out-Null
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
if (-not $process.Start()) { throw 'Xunji process could not be started.' }
$deadline = (Get-Date).AddSeconds(25)

while ((Get-Date) -lt $deadline) {
  if (Test-LoopbackPort $port) {
    # 端口先于地址就绪：DSH 要等全部 MCP 启动完才打印带 token 的地址，可能晚十几秒
    $urlDeadline = (Get-Date).AddSeconds(90)
    $url = Get-XunjiUrl $port @($stdoutLog, $stderrLog)
    while ($url -notmatch 'token=' -and -not $process.HasExited -and (Get-Date) -lt $urlDeadline) {
      Start-Sleep -Milliseconds 500
      $url = Get-XunjiUrl $port @($stdoutLog, $stderrLog)
    }
    Set-Content -Path (Join-Path $logDirectory "xunji-url-$port.txt") -Value $url
    Open-Xunji $port $url
    exit 0
  }
  if ($process.HasExited) { break }
  Start-Sleep -Milliseconds 300
}

$details = if (Test-Path $stderrLog) { (Get-Content -Path $stderrLog -Tail 16) -join [Environment]::NewLine } else { '' }
throw "Xunji did not start. See $stderrLog`n$details"
