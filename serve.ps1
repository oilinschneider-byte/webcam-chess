# Small local web server for CamArcade.
# Browsers only allow the camera on http://localhost or https:// pages, so start the site through this.
# (-TestLog is for tools/test-browsers.ps1: the test browsers write what happened to that file.)
param([int]$Port = 8080, [switch]$NoBrowser, [string]$TestLog = '')

$root = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\') + '\'

$listener = $null
foreach ($p in $Port..($Port + 20)) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host "Could not start the web server: ports $Port to $($Port + 20) are all busy." -ForegroundColor Red
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  CamArcade is running at $url" -ForegroundColor Green
Write-Host "  Keep this window open while you play. Close it to stop the server."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.md'   = 'text/plain; charset=utf-8'
}

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    if ($TestLog -and $ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -eq '/__testlog') {
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
      $line = $reader.ReadToEnd() -replace "[\r\n]+", ' '
      [IO.File]::AppendAllText($TestLog, $line + "`n", (New-Object Text.UTF8Encoding($false)))
      $res.StatusCode = 204
      continue
    }
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $file = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists($file)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.AddHeader('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes('Not found')
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    try { $res.StatusCode = 500 } catch { }
  } finally {
    try { $res.Close() } catch { }
  }
}
