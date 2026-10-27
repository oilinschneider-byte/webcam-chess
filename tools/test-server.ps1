# Checks your CamArcade server (Supabase) from the outside, the way a cheater would try it:
# can the database be read or changed directly? Can a streak be edited? Can you beat your own second window?
# It makes 3 test accounts (named zt...), plays with them, and deletes them at the end.
#
# Start it with tools\test-server.bat (or: powershell -ExecutionPolicy Bypass -File tools\test-server.ps1).
# If you put your Supabase SECRET key in tools\secret-key.txt, it also runs the full self-test on the server
# (40 players matchmaking at once, disputes, bans, ...). That file is never uploaded to GitHub.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $root 'config.js') -Raw
$Url = if ($config -match "supabaseUrl:\s*'([^']*)'") { $Matches[1].TrimEnd('/') } else { '' }
$Key = if ($config -match "supabaseKey:\s*'([^']*)'") { $Matches[1] } else { '' }
if (-not $Url.StartsWith('https://') -or $Key.Length -lt 20) {
  Write-Host 'config.js has no Supabase address or key yet. Follow SETUP.md first.' -ForegroundColor Red
  exit 1
}
$secretFile = Join-Path $PSScriptRoot 'secret-key.txt'
$Secret = if ($env:CAMARCADE_SECRET_KEY) { $env:CAMARCADE_SECRET_KEY } elseif (Test-Path $secretFile) { (Get-Content $secretFile -Raw).Trim() } else { '' }

$script:passed = 0
$script:failed = 0
function Section($name) { Write-Host ''; Write-Host "  $name" -ForegroundColor Cyan }
function Check($label, $ok, $detail) {
  if ($ok) { $script:passed++; Write-Host "  [OK]   $label" -ForegroundColor Green }
  else {
    $script:failed++
    Write-Host "  [FAIL] $label" -ForegroundColor Red
    if ($detail) { Write-Host "         $detail" -ForegroundColor DarkGray }
  }
}

function Headers($key, $extra) {
  $h = @{ apikey = $key }
  if ($key.StartsWith('eyJ')) { $h['Authorization'] = "Bearer $key" }
  if ($extra) { foreach ($k in $extra.Keys) { $h[$k] = $extra[$k] } }
  return $h
}

# Calls one of the server's functions. Returns @{ status; data; text }.
function Rpc($fn, $body, $extra, $key) {
  if (-not $key) { $key = $Key }
  if ($null -eq $body) { $body = @{} }
  $json = $body | ConvertTo-Json -Depth 10 -Compress
  try {
    $r = Invoke-WebRequest -Uri "$Url/rest/v1/rpc/$fn" -Method Post -Headers (Headers $key $extra) -ContentType 'application/json' `
      -Body ([Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing -TimeoutSec 60
    $data = $null
    if ($r.Content) { try { $data = $r.Content | ConvertFrom-Json } catch { $data = $r.Content } }
    return @{ status = [int]$r.StatusCode; data = $data; text = [string]$r.Content }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $text = [string]$_.ErrorDetails.Message
    $data = $null
    try { $data = $text | ConvertFrom-Json } catch { }
    return @{ status = $status; data = $data; text = $text }
  }
}

function Get-Raw($path, $extra) {
  try {
    $r = Invoke-WebRequest -Uri "$Url$path" -Headers (Headers $Key $extra) -UseBasicParsing -TimeoutSec 30
    return @{ status = [int]$r.StatusCode; text = [string]$r.Content }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return @{ status = $status; text = [string]$_.ErrorDetails.Message }
  }
}

function ErrCode($r) { if ($r.data -and $r.data.message) { return $r.data.message } elseif ($r.data -and $r.data.error) { return $r.data.error } else { return '' } }
function NewPeer { 'camarcade-test-' + [guid]::NewGuid().ToString('N').Substring(0, 16) }

$run = -join ((1..6) | ForEach-Object { [char[]]'abcdefghijkmnpqrstuvwxyz23456789' | Get-Random })
$pass = "test-pass-$run"
$year = (Get-Date).Year
Write-Host ''
Write-Host "  Testing $Url (test run $run)" -ForegroundColor Cyan

Section 'Connection'
$r = Rpc 'ca_stats'
Check 'the server answers' ($r.status -eq 200 -and $null -ne $r.data.players) "$($r.status) $($r.text)"
if ($r.status -ne 200) {
  Write-Host ''
  Write-Host '  Could not reach the server. Did you run server/schema.sql in the Supabase SQL Editor?' -ForegroundColor Red
  exit 1
}

Section 'The database is locked: only the ca_ functions can be used'
$r = Get-Raw '/rest/v1/players?select=*'
Check 'the players table cannot be read directly' ($r.status -ne 200) "$($r.status) $($r.text)"
$r = Get-Raw '/rest/v1/players?select=*' @{ 'Accept-Profile' = 'camarcade' }
Check 'not even by asking for the camarcade schema' ($r.status -ne 200) "$($r.status) $($r.text)"
$r = Rpc 'ca_self_test'
Check 'the self-test cannot be run with the public key' ($r.status -ne 200) "$($r.status) $($r.text)"
$r = Rpc 'sign_up' @{ p_name = 'x' }
Check "the server's inner functions cannot be called" ($r.status -ne 200) "$($r.status) $($r.text)"

Section 'Accounts'
function SignUp($name, $y) { Rpc 'ca_sign_up' @{ p_name = $name; p_pass = $pass; p_year = $y; p_month = 1; p_profile = @{ fish = 30 } } }
$ra = SignUp "zt$($run)a" 1990
$rb = SignUp "zt$($run)b" 1990
$rt = SignUp "zt$($run)t" ($year - 15)
Check 'sign up works' ($ra.status -eq 200 -and $rb.status -eq 200 -and $rt.status -eq 200 -and $ra.data.token) "$($ra.status) $($ra.text)"
if (-not $ra.data.token) { exit 1 }
$A = $ra.data.token; $B = $rb.data.token; $T = $rt.data.token
$idA = $ra.data.me.id
Check 'an adult is an adult' ($ra.data.me.adult -eq $true)
Check 'a 15-year-old is not an adult (cats only)' ($rt.data.me.adult -eq $false)
$r = SignUp "zt$($run)k" ($year - 10)
Check 'a 10-year-old cannot sign up' ((ErrCode $r) -eq 'too_young') "$($r.status) $($r.text)"
$r = SignUp "ZT$($run)A" 1990
Check 'the same name with different capital letters is taken' ((ErrCode $r) -eq 'name_taken') "$($r.status) $($r.text)"
$r = Rpc 'ca_log_in' @{ p_name = "zt$($run)a"; p_pass = 'wrong' }
Check 'a wrong password is refused' ((ErrCode $r) -eq 'wrong_password') "$($r.status) $($r.text)"
$r = Rpc 'ca_log_in' @{ p_name = "zt$($run)a"; p_pass = $pass }
Check 'logging in works' ($r.status -eq 200 -and $r.data.token) "$($r.status) $($r.text)"
$r = Rpc 'ca_me' @{ p_token = ('0' * 64) }
Check 'a made-up login token is refused' ((ErrCode $r) -eq 'not_logged_in') "$($r.status) $($r.text)"
$r = Rpc 'ca_save_profile' @{ p_token = $A; p_profile = @{ fish = 99; streak = 999; best = 999; wins = 999 } }
$me = (Rpc 'ca_me' @{ p_token = $A }).data
Check 'saving your cat cannot change your streak (tried 999)' ($me.streak -eq 0 -and $me.best -eq 0 -and $me.profile.fish -eq 99) ($me | ConvertTo-Json -Compress)

Section "Your internet connection can't be faked"
$base = (Rpc 'ca_net_check').data
$fake = '203.0.113.' + (Get-Random -Minimum 1 -Maximum 250)
$spoofed = @()
foreach ($h in 'X-Forwarded-For', 'X-Real-IP', 'CF-Connecting-IP', 'True-Client-IP', 'Forwarded') {
  $v = if ($h -eq 'Forwarded') { "for=$fake" } else { $fake }
  $n = (Rpc 'ca_net_check' $null @{ $h = $v }).data
  if ($n.net -ne $base.net) { $spoofed += $h }
}
Check 'sending made-up IP headers does not change who the server thinks you are' ($spoofed.Count -eq 0) ("these headers changed it: " + ($spoofed -join ', ') + "  (headers the server sees: " + ($base.headers -join ', ') + ')')

Section 'Matchmaking + results'
$peerA = NewPeer; $peerB = NewPeer; $peerT = NewPeer
$r1 = Rpc 'ca_mm_poll' @{ p_token = $A; p_peer = $peerA }
$r2 = Rpc 'ca_mm_poll' @{ p_token = $B; p_peer = $peerB }
$r3 = Rpc 'ca_mm_poll' @{ p_token = $A; p_peer = $peerA }
$m = $r2.data.match
Check 'two searching players get paired' ($r1.data.waiting -and $m -and $m.role -eq 'guest' -and $m.opp.id -eq $idA -and $m.opp_peer -eq $peerA) "$($r1.text) / $($r2.text)"
Check 'the waiting player picks up the same match' ($r3.data.match.id -eq $m.id -and $r3.data.match.role -eq 'host' -and $r3.data.match.opp_peer -eq $peerB) $r3.text
Check 'both on this computer: the server sees the same internet connection' ($m.same_net -eq $true -and $m.ranked_left -eq 0) ($m | ConvertTo-Json -Compress)
Check 'two adults may use cameras' ($m.cats_only -eq $false)
$rA = Rpc 'ca_report' @{ p_token = $A; p_match = $m.id; p_game_no = 1; p_game = 'rps'; p_outcome = 'win' }
$rB = Rpc 'ca_report' @{ p_token = $B; p_match = $m.id; p_game_no = 1; p_game = 'rps'; p_outcome = 'lose' }
Check 'the first report waits for the other player' ($rA.data.status -eq 'pending') $rA.text
Check 'beating your own second window does not count' ($rB.data.status -eq 'done' -and $rB.data.ranked -eq $false -and $rB.data.why -eq 'same_net') $rB.text
$me = (Rpc 'ca_me' @{ p_token = $A }).data
Check '...so the streak is still 0' ($me.streak -eq 0) ($me | ConvertTo-Json -Compress)
$r = Rpc 'ca_report' @{ p_token = $A; p_match = $m.id; p_game_no = 7; p_game = 'rps'; p_outcome = 'win' }
Check 'you cannot report made-up extra games' ((ErrCode $r) -eq 'bad_game_no') "$($r.status) $($r.text)"
$r = Rpc 'ca_report' @{ p_token = $T; p_match = $m.id; p_game_no = 2; p_game = 'rps'; p_outcome = 'win' }
Check "you cannot report a match you weren't in" ((ErrCode $r) -eq 'no_such_match') "$($r.status) $($r.text)"

Section 'Report + block'
$r = Rpc 'ca_report_player' @{ p_token = $B; p_match = $m.id; p_reason = 'cheating'; p_note = 'automated test, please ignore' }
Check 'reporting the other player works' ($r.status -eq 200 -and $r.data.ok) "$($r.status) $($r.text)"
$x1 = Rpc 'ca_mm_poll' @{ p_token = $A; p_peer = $peerA }
$x2 = Rpc 'ca_mm_poll' @{ p_token = $B; p_peer = $peerB }
Check 'after a report, those two are never paired again' ($x1.data.waiting -and $x2.data.waiting) "$($x1.text) / $($x2.text)"
$x3 = Rpc 'ca_mm_poll' @{ p_token = $T; p_peer = $peerT }
$mt = $x3.data.match
Check 'an adult and a 15-year-old get a cats-only match' ($mt -and $mt.cats_only -eq $true) $x3.text
foreach ($t in $A, $B, $T) { $null = Rpc 'ca_mm_leave' @{ p_token = $t } }

Section 'Leaderboard + visitor counts'
$r = Rpc 'ca_leaderboard' @{ p_token = $null }
Check 'the leaderboard works without logging in' ($r.status -eq 200 -and $null -ne $r.data.best -and $null -ne $r.data.hot) "$($r.status) $($r.text)"
$r = Rpc 'ca_leaderboard' @{ p_token = $A }
Check 'the leaderboard shows your own place' ($r.status -eq 200 -and $null -ne $r.data.me) "$($r.status) $($r.text)"
$r = Rpc 'ca_stats'
Check 'visitor and game counts work' ($r.status -eq 200 -and $null -ne $r.data.visitors_total -and $null -ne $r.data.games_total -and $null -ne $r.data.online) $r.text

Section 'Clean up'
$r = Rpc 'ca_delete_account' @{ p_token = $A; p_pass = 'wrong' }
Check 'deleting an account needs the right password' ((ErrCode $r) -eq 'wrong_password') "$($r.status) $($r.text)"
$ok = $true
foreach ($t in $A, $B, $T) { $r = Rpc 'ca_delete_account' @{ p_token = $t; p_pass = $pass }; if (-not $r.data.ok) { $ok = $false } }
Check 'the 3 test accounts were deleted' $ok
$r = Rpc 'ca_me' @{ p_token = $A }
Check "a deleted account's login stops working" ((ErrCode $r) -eq 'not_logged_in') "$($r.status) $($r.text)"

Section 'Full self-test on the server'
if ($Secret) {
  $r = Rpc 'ca_self_test' $null $null $Secret
  $text = if ($r.data -is [string]) { $r.data } else { $r.text }
  foreach ($line in ($text -split "`n")) {
    if ($line -match '^\S+ (.*)$' -and $line -notmatch 'TESTS') { Write-Host "         $line" -ForegroundColor DarkGray }
  }
  $tail = (($text -split "`n") | Select-Object -Last 3) -join ' '
  Check 'the server self-test passed (sign-ups, 40-player matchmaking, results, disputes, bans, leaderboard)' ($text -match 'ALL TESTS PASSED') $tail
} else {
  Write-Host '  (skipped: put your Supabase secret key in tools\secret-key.txt to run it, or run' -ForegroundColor DarkGray
  Write-Host '   "select camarcade.self_test();" in the Supabase SQL Editor)' -ForegroundColor DarkGray
}

Write-Host ''
if ($script:failed -eq 0) {
  Write-Host "  ALL $($script:passed) SERVER CHECKS PASSED" -ForegroundColor Green
  exit 0
}
Write-Host "  $($script:failed) CHECK(S) FAILED, $($script:passed) passed" -ForegroundColor Red
exit 1
