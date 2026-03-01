#!/bin/bash
# ─── Studio Shelly Rodrigues — Script de Inicialização ───────────────────────

DIR="/home/laerte/Downloads/sistema_salao"
DB="$DIR/data/db.json"
DB_BAK="$DIR/data/db.json.bak"

echo "🌸 Studio Shelly Rodrigues — Iniciando sistema..."

# Cria pasta data se não existir
mkdir -p "$DIR/data"

# Se db.json não existe mas backup existe, restaura
if [ ! -f "$DB" ] && [ -f "$DB_BAK" ]; then
  echo "⚠️  db.json não encontrado. Restaurando backup..."
  cp "$DB_BAK" "$DB"
  echo "✅ Backup restaurado!"
fi

# Se db.json está vazio mas backup tem dados, restaura
if [ -f "$DB" ] && [ -f "$DB_BAK" ]; then
  DB_SIZE=$(stat -c%s "$DB" 2>/dev/null || echo 0)
  BAK_SIZE=$(stat -c%s "$DB_BAK" 2>/dev/null || echo 0)
  if [ "$DB_SIZE" -lt 50 ] && [ "$BAK_SIZE" -gt 50 ]; then
    echo "⚠️  db.json vazio. Restaurando backup..."
    cp "$DB_BAK" "$DB"
    echo "✅ Backup restaurado!"
  fi
fi

# Para processo Node anterior se existir
echo "🔄 Parando Node.js anterior (se existir)..."
pkill -f "node server.js" 2>/dev/null
sleep 1

# Inicia Node.js
echo "🚀 Iniciando Node.js..."
cd "$DIR"
node server.js &
NODE_PID=$!
echo "   Node PID: $NODE_PID"
echo ""
echo "✅ Node.js rodando em http://localhost:3000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Agora inicie o Cloudflare manualmente:"
echo "  Execute em outro terminal o seu comando"
echo "  habitual do cloudflared tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Para parar o Node: Ctrl+C"
echo ""

# Mantém o script vivo mostrando os logs do Node
wait $NODE_PID
