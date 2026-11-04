# Measures how smoothly CamArcade runs: one hidden browser plays each game against the bot for a few seconds and reports
# frames a second, slow frames, and how much each game would send online. (See perf() in tools/autotest.js.)
# Start it with: powershell -ExecutionPolicy Bypass -File tools\perf.ps1 [-Games trails,box] [-Gpu]
# Without -Gpu the browser draws everything on the processor, like a weak computer, so the slow spots stand out.
param([string]$Games = '', [switch]$Gpu, [int]$TimeoutSec = 900, [string]$Out = '', [double]$Scale = 1)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('camarcade-perf-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Write-Host 'Could not find Edge or Chrome.' -ForegroundColor Red; exit 1 }

$probe = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
$log = Join-Path $tmp 'steps.log'
New-Item -ItemType File -Path $log | Out-Null
$server = Start-Process -FilePath powershell -PassThru -WindowStyle Hidden -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'serve.ps1'), '-Port', $port, '-NoBrowser', '-TestLog', $log)
Start-Sleep -Seconds 2

$run = -join ((1..6) | ForEach-Object { [char[]]'abcdefghijkmnpqrstuvwxyz23456789' | Get-Random })
$flags = @('--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--window-size=1600,900', "--force-device-scale-factor=$Scale", "--user-data-dir=$tmp\profile")
if (-not $Gpu) { $flags += '--disable-gpu' }
$url = "http://localhost:$port/?autotest=a&mode=perf&run=$run" + $(if ($Games) { "&games=$Games" } else { '' })
$b = Start-Process -FilePath $browser -PassThru -WindowStyle Hidden -ArgumentList ($flags + $url)

$shown = 0; $done = $false; $rows = @()
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline -and -not $done) {
  Start-Sleep -Milliseconds 500
  $lines = @(Get-Content $log -Encoding UTF8)
  for ($i = $shown; $i -lt $lines.Count; $i++) {
    $s = $null
    try { $s = $lines[$i] | ConvertFrom-Json } catch { continue }
    if ($s.step -eq 'done') { $done = $true; continue }
    if ($s.step -like 'perf *') {
      $d = $s.detail
      $row = '{0,-14} fps {1,5}  frame {2,6} ms (worst {3,5})  code {4,5} ms (95% {5,5})  long tasks {6,3}  sends {7,6} B' -f $s.step.Substring(5), $d.fps, $d.gap95, $d.worst, $d.js, $d.js95, $d.long, $d.bytes
      Write-Host "  $row"
      $rows += $row
    } elseif (-not $s.ok) {
      Write-Host "  [FAIL] $($s.step) $(($s.detail | ConvertTo-Json -Compress -Depth 6))" -ForegroundColor Red
      if ($s.step -eq 'stopped') { $done = $true }
    } elseif ($s.detail) {
      Write-Host "  $($s.step): $(($s.detail | ConvertTo-Json -Compress -Depth 6))"
    }
  }
  $shown = $lines.Count
}
if (-not $done) { Write-Host '  [FAIL] Timed out.' -ForegroundColor Red }
if ($Out) { $rows | Set-Content -Path $Out -Encoding UTF8 }

try { Stop-Process -Id $b.Id -Force -ErrorAction Stop } catch { }
Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$tmp*" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
try { Stop-Process -Id $server.Id -Force -ErrorAction Stop } catch { }
Start-Sleep -Milliseconds 800
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
