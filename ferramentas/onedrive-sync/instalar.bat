@echo off
rem LOP - Gestao Rapida: agenda a sincronizacao da Certificacao (OneDrive -> app) a cada hora.
schtasks /Create /TN "LOP - Sincronizar OneDrive" /SC HOURLY /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0sincronizar.ps1\"" /F
schtasks /Run /TN "LOP - Sincronizar OneDrive"
echo.
echo Pronto: a sincronizacao roda agora e depois a cada hora.
echo O que acontece fica em sincronizar.log, nesta pasta.
pause
