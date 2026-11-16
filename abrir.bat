@echo off
rem Gera o build (se preciso) e abre o Ritmo no navegador.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install || goto erro
)
if not exist dist\index.html (
  echo Gerando versao de producao...
  call npm run build || goto erro
)
start "" "%~dp0dist\index.html"
exit /b 0

:erro
echo.
echo Algo falhou. Veja a mensagem acima.
pause
exit /b 1
