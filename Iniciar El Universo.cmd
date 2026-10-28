@echo off
cd /d "%~dp0"
echo El Universo POS - http://127.0.0.1:3001
echo Deja esta ventana abierta mientras usas el sistema.
if exist ".postgres\data\PG_VERSION" (
  call npm run db:local:start
  if errorlevel 1 goto fin
)
call npm start
:fin
pause
