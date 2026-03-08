# 🚀 Deploy Evolution API no Railway
## Studio Shelly Rodrigues

---

## IMPORTANTE — Como o Railway funciona com Docker

O Railway suporta deploy de imagens Docker diretamente.
Vamos criar um **segundo serviço** no mesmo projeto Railway.

---

## PASSO 1 — Criar novo serviço no Railway

1. Acesse **railway.app** → seu projeto `SWEB_Salao`
2. Clique em **"+ New Service"**
3. Escolha **"Docker Image"**
4. Cole a imagem: `atendai/evolution-api:v1.8.2`
5. Clique **Deploy**

---

## PASSO 2 — Configurar variáveis do novo serviço

No novo serviço (Evolution API) → aba **Variables**, adicione:

| Variável | Valor |
|---|---|
| `SERVER_URL` | *(deixe vazio por enquanto — Railway preenche depois)* |
| `AUTHENTICATION_TYPE` | `apikey` |
| `AUTHENTICATION_API_KEY` | `shelly_apikey_2024` |
| `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES` | `true` |
| `QRCODE_LIMIT` | `30` |
| `DEL_INSTANCE` | `false` |
| `STORE_MESSAGES` | `true` |
| `STORE_MESSAGE_UP` | `true` |
| `STORE_CONTACTS` | `true` |
| `STORE_CHATS` | `true` |

---

## PASSO 3 — Gerar URL do serviço Evolution

1. No serviço Evolution → aba **Settings**
2. Em **Networking** → clique **"Generate Domain"**
3. Vai gerar URL tipo:
   ```
   https://evolution-shelly-production.up.railway.app
   ```
4. **Copie essa URL**

---

## PASSO 4 — Atualizar SERVER_URL

Volte em **Variables** do serviço Evolution e atualize:

| Variável | Valor |
|---|---|
| `SERVER_URL` | `https://evolution-shelly-production.up.railway.app` |

---

## PASSO 5 — Atualizar EVOLUTION_URL no serviço Node.js

No serviço principal (Node.js/server.js) → **Variables**:

| Variável | Valor |
|---|---|
| `EVOLUTION_URL` | `https://evolution-shelly-production.up.railway.app` |

Ou via curl:
```bash
curl -X POST https://swebsalao-production.up.railway.app/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "evolutionUrl": "https://evolution-shelly-production.up.railway.app",
    "evolutionInstance": "shelly",
    "evolutionApiKey": "shelly_apikey_2024",
    "salonName": "Studio Shelly Rodrigues"
  }'
```

---

## PASSO 6 — Criar instância WhatsApp

```bash
curl -X POST https://swebsalao-production.up.railway.app/api/whatsapp/criar-instancia
```

---

## PASSO 7 — Conectar WhatsApp (escanear QR Code)

1. Acesse o sistema: `https://swebsalao-production.up.railway.app`
2. Vá em **WhatsApp** no menu
3. Clique **"Conectar WhatsApp"**
4. Escaneie o QR Code com o celular da Shelly

---

## PASSO 8 — Verificar conexão

```bash
curl -s https://swebsalao-production.up.railway.app/api/status | python3 -m json.tool
```

Deve aparecer:
```json
"evolution": {
  "connected": true,
  "state": "open"
}
```

---

## ✅ Resultado Final

| Componente | URL | Status |
|---|---|---|
| Frontend | laerteporto.github.io/SWEB_Salao | ✅ Online |
| Backend Node.js | swebsalao-production.up.railway.app | ✅ Online |
| Evolution API | evolution-shelly-production.up.railway.app | 🔄 Deploy |
| MongoDB Atlas | (interno) | ✅ Online |

**PC pode ficar desligado! Tudo roda na nuvem 24/7 🚀**

---

## ⚠️ Sobre os dados da instância WhatsApp

O Railway tem sistema de arquivos efêmero — os dados da sessão
WhatsApp podem ser perdidos ao fazer redeploy.

**Solução:** A Evolution API v1.8.2 suporta MongoDB para persistir
a sessão. Após conectar, me avise para configurar isso também.
