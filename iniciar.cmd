@echo off
rem Instala (na primeira vez) e abre o Leftover Finance em http://localhost:4321
rem Uso: dois cliques neste arquivo, ou "iniciar.cmd" no terminal
setlocal
cd /d "%~dp0app"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 22.13 ou mais novo ^(recomendado: 24 LTS^): https://nodejs.org
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Seu Node.js e antigo demais: o banco usa node:sqlite, que pede 22.13 ou mais novo.
  pause
  exit /b 1
)

if not exist node_modules call npm ci --omit=dev
if not exist .env copy .env.example .env >nul

rem abre o navegador alguns segundos depois, quando o servidor já subiu
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4321"
call npm start
