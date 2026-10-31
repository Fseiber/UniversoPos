$ErrorActionPreference = 'Stop'
$taskProject = (Split-Path -Parent $PSScriptRoot).ToLowerInvariant()
$taskProcesses = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
  $taskLine = [uri]::UnescapeDataString([string]$_.CommandLine).ToLowerInvariant().Replace('/', '\')
  $taskLine.Contains($taskProject.Replace('/', '\')) -and $taskLine.Contains('server\index.ts')
}
foreach ($taskProcess in $taskProcesses) { Stop-Process -Id $taskProcess.ProcessId -ErrorAction SilentlyContinue }
Write-Output 'Servidor del POS detenido. La base de datos sigue disponible para recuperar una copia.'
