#!/bin/bash
# PESMETAL - Script de desenvolvimento local
# Roda API (porta 4000) + Site Next.js (porta 3000) simultaneamente

echo "🚀 Iniciando PESMETAL..."

# Verificar se as portas estão disponíveis
echo "📡 Verificando portas..."
if lsof -i :4000 > /dev/null 2>&1; then
  echo "⚠️  Porta 4000 já está em uso (API?)"
else
  echo "✅ Porta 4000 disponível"
fi

if lsof -i :3000 > /dev/null 2>&1; then
  echo "⚠️  Porta 3000 já está em uso (Site?)"
else
  echo "✅ Porta 3000 disponível"
fi

# Iniciar API em background
echo "🔥 Iniciando API em http://localhost:4000 ..."
cd "$(dirname "$0")/apps/api" && npm run dev &
API_PID=$!
echo "API PID: $API_PID"

# Aguardar API inicializar
sleep 5

# Verificar se API está rodando
if curl -s http://localhost:4000/health > /dev/null 2>&1; then
  echo "✅ API está respondendo"
else
  echo "⚠️  API não respondeu - verificando..."
  curl -s http://localhost:4000/health || true
fi

# Iniciar Site Next.js
echo "🌐 Iniciando Site em http://localhost:3000 ..."
cd "$(dirname "$0")/site" && npm run dev &
SITE_PID=$!
echo "Site PID: $SITE_PID"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ PESMETAL rodando!"
echo "   API:   http://localhost:4000"
echo "   Site:  http://localhost:3000"
echo "   Health: http://localhost:4000/health"
echo ""
echo "Pressione Ctrl+C para parar"
echo "═══════════════════════════════════════════"

# Aguardar sinal de encerramento
trap "echo '🛑 Parando serviços...'; kill $API_PID $SITE_PID 2>/dev/null; exit" INT TERM
wait
