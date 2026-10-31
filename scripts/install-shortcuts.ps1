param([switch]$RemoveStartup)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'El Universo POS.lnk'
if ($RemoveStartup) { if (Test-Path -LiteralPath $startup) { Remove-Item -LiteralPath $startup }; exit }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'El Universo POS.lnk'
foreach ($destination in @($desktop, $startup)) {
  $shortcut = $shell.CreateShortcut($destination)
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $project 'scripts/launch.ps1') + '"'
  $shortcut.WorkingDirectory = $project
  $shortcut.WindowStyle = 7
  $shortcut.Save()
}
Write-Output 'Acceso directo creado en el escritorio e inicio con Windows configurado.'
