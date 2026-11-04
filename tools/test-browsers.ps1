# Plays real Classic Games matches between two hidden browsers on this computer, through your Supabase server.
# Start it with tools\test-browsers.bat (or: powershell -ExecutionPolicy Bypass -File tools\test-browsers.ps1).
# What the browsers do is described at the top of tools\autotest.js. Their test accounts are deleted at the end.
# -Guests: plays as guests, without making any accounts, and skips the rounds that need them (for when this internet
# connection has reached the server's limit on new accounts).
# -Only hoops,simon,nofast: just these rounds of "one online game" (see round 6 below).
param([int]$TimeoutSec = 150, [switch]$Guests, [string]$Only = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('camarcade-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null

$config = Get-Content (Join-Path $root 'config.js') -Raw
if ($config -notmatch "supabaseUrl:\s*'https://") {
  Write-Host 'config.js has no Supabase address yet. Follow SETUP.md first.' -ForegroundColor Red
  exit 1
}

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Write-Host 'Could not find Edge or Chrome.' -ForegroundColor Red; exit 1 }

# A free port for the test web server.
$probe = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
$log = Join-Path $tmp 'steps.log'
New-Item -ItemType File -Path $log | Out-Null
$server = Start-Process -FilePath powershell -PassThru -WindowStyle Hidden -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'serve.ps1'), '-Port', $port, '-NoBrowser', '-TestLog', $log)
Start-Sleep -Seconds 2

$script:passed = 0
$script:failed = 0
$script:shown = 0

function Stop-Browsers($list, $dir) {
  foreach ($b in $list) { try { Stop-Process -Id $b.Id -Force -ErrorAction Stop } catch { } }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$dir*" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
}

function Run-Round($mode, $title, $whoA, $whoB, $limit = $TimeoutSec, $extra = '') {
  Write-Host ''
  Write-Host "  $title" -ForegroundColor Cyan
  $run = -join ((1..6) | ForEach-Object { [char[]]'abcdefghijkmnpqrstuvwxyz23456789' | Get-Random })
  $dir = Join-Path $tmp ($mode + ($extra -replace '[^a-z0-9]', ''))
  $list = @()
  foreach ($role in 'a', 'b') {
    $list += Start-Process -FilePath $browser -PassThru -WindowStyle Hidden -ArgumentList @(
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
      "--user-data-dir=$dir\profile-$role", "http://localhost:$port/?autotest=$role&mode=$mode&run=$run$extra$(if ($Guests) { '&guest=1' })")
  }
  $done = @{}
  $deadline = (Get-Date).AddSeconds($limit)
  while ((Get-Date) -lt $deadline -and $done.Count -lt 2) {
    Start-Sleep -Milliseconds 400
    $lines = @(Get-Content $log -Encoding UTF8)
    for ($i = $script:shown; $i -lt $lines.Count; $i++) {
      $s = $null
      try { $s = $lines[$i] | ConvertFrom-Json } catch { continue }
      $who = if ($s.role -eq 'a') { $whoA } else { $whoB }
      if ($s.step -eq 'done') { $done[$s.role] = $true; continue }
      if ($s.ok) {
        $script:passed++
        Write-Host "  [OK]   $who  $($s.step)" -ForegroundColor Green
      } else {
        $script:failed++
        Write-Host "  [FAIL] $who  $($s.step)" -ForegroundColor Red
        if ($s.detail) { Write-Host "         $(($s.detail | ConvertTo-Json -Compress -Depth 6))" -ForegroundColor DarkGray }
        if ($s.step -eq 'stopped') { $done[$s.role] = $true }
      }
    }
    $script:shown = $lines.Count
  }
  if ($done.Count -lt 2) {
    $script:failed++
    Write-Host "  [FAIL] This round didn't finish within $limit seconds." -ForegroundColor Red
  }
  Stop-Browsers $list $dir
}

Write-Host ''
Write-Host '  Two hidden browsers are playing Classic Games against each other through your server...' -ForegroundColor Cyan
if (-not $Guests -and -not $Only) {
  Run-Round 'teen' 'Round 1: an adult and a 15-year-old (cats only)' 'A (adult)' 'B (15)   '
  Run-Round 'cam' 'Round 2: two adults with cameras (each starts out as a cat)' 'A (adult)' 'B (adult)'
}
if (-not $Only) {
  Run-Round 'walls' 'Round 3: Wall Duel (A checks the rules and the bot first, then both play it online)' 'A' 'B' ($TimeoutSec + 200)
  Run-Round 'duels' 'Round 4: the 14 arcade duels (A plays each one against the bot, then both play Sumo Cats online)' 'A' 'B' ($TimeoutSec + 900)
}
if (-not $Guests -and -not $Only) { Run-Round 'glingus' 'Round 5: nobody turns up, so A plays the bot, then Glingus' 'A' 'B' ($TimeoutSec + 150) }
$games = if ($Only) { $Only -split ',' } else { 'hoops', 'barrel', 'walls', 'climb', 'pond', 'boxing', 'paint', 'kart', 'simon', 'nofast' }
foreach ($game in $games) {
  if ($game -eq 'simon') { Run-Round 'net' 'Round 6: Simon Says online with cameras' 'A' 'B' 120 '&online=simon&cam=1' }
  elseif ($game -eq 'nofast') { Run-Round 'net' "Round 6: when one player's fast lane doesn't work" 'A' 'B' 120 '&online=sumo&nofast=b' }
  else { Run-Round 'net' "Round 6: $game online, on a good and then a bad connection" 'A' 'B' 120 "&online=$game" }
}

try { Stop-Process -Id $server.Id -Force -ErrorAction Stop } catch { }
Start-Sleep -Milliseconds 800
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

Write-Host ''
if ($script:failed -eq 0) {
  Write-Host "  ALL $($script:passed) BROWSER CHECKS PASSED" -ForegroundColor Green
  exit 0
}
Write-Host "  $($script:failed) CHECK(S) FAILED, $($script:passed) passed" -ForegroundColor Red
exit 1
