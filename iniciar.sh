#!/usr/bin/env sh
# Instala (na primeira vez) e abre o Leftover Finance em http://localhost:4321
# Uso: ./iniciar.sh
set -e
cd "$(dirname "$0")/app"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale o Node.js 22.13 ou mais novo (recomendado: 24 LTS): https://nodejs.org"
  exit 1
fi

if ! node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Node.js $(node -v) é antigo demais: o banco usa node:sqlite, que pede 22.13 ou mais novo."
  exit 1
fi

[ -d node_modules ] || npm ci --omit=dev
[ -f .env ] || cp .env.example .env

npm start
