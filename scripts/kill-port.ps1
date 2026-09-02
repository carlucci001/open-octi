param([int]$Port = 3000)
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) { Write-Output "Nothing listening on $Port"; exit 0 }
foreach ($c in $conns) {
  $procId = $c.OwningProcess
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Output ("Killed PID $procId ($($p.ProcessName)) on port $Port")
  } catch {
    Write-Output ("Could not kill PID $procId on port $Port : $_")
  }
}
Start-Sleep -Seconds 2
$still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($still) { Write-Output "Port $Port STILL held (may need admin)" } else { Write-Output "Port $Port is free" }
