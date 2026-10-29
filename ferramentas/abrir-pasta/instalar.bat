@echo off
rem LOP - Gestão Rápida — instala o "Abrir no computador" (link lop-pasta:) para este usuário. 29/10/2026
chcp 65001 >nul
set "D=%LOCALAPPDATA%\LOP"
if not exist "%D%" mkdir "%D%"
copy /y "%~dp0abrir-pasta.ps1" "%D%\abrir-pasta.ps1" >nul
reg add "HKCU\Software\Classes\lop-pasta" /ve /d "URL:LOP - abrir pasta" /f >nul
reg add "HKCU\Software\Classes\lop-pasta" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\lop-pasta\shell\open\command" /ve /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%D%\abrir-pasta.ps1\" \"%%1\"" /f >nul
echo.
echo Pronto! O botao "No computador" do LOP - Gestao Rapida ja abre as pastas neste computador.
echo Na primeira vez o Chrome pergunta se pode abrir: marque "Sempre permitir" e clique em Abrir.
echo.
pause
