$ErrorActionPreference = 'Stop'
trap { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($_.Exception.Message, 'El Universo POS - No se pudo iniciar') | Out-Null; break }
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$health = 'http://127.0.0.1:3001/api/health'
try { if ((Invoke-RestMethod -Uri $health -TimeoutSec 3).ok) { Start-Process 'http://127.0.0.1:3001'; exit } } catch {}
if (Test-Path -LiteralPath '.postgres/data/PG_VERSION') {
  & npm.cmd run db:local:start
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la base de datos' }
}
if (!(Test-Path -LiteralPath 'dist/index.html')) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la pantalla' } }
& npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar la estructura de datos. Revisar antes de iniciar.' }
$logDir = Join-Path $project '.postgres'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c','npm start' -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'pos.log') -RedirectStandardError (Join-Path $logDir 'pos-error.log')
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Seconds 1
  try { if ((Invoke-RestMethod -Uri $health -TimeoutSec 2).ok) { Start-Process 'http://127.0.0.1:3001'; exit } } catch {}
}
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('El sistema no pudo iniciarse. Revisar los registros pos.log y pos-error.log en la carpeta .postgres del proyecto.', 'El Universo POS') | Out-Null
