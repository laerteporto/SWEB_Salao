# 🌸 Studio Shelly Rodrigues — Sistema de Gestão v2
### Vercel (frontend) + Firebase Firestore (banco de dados) + Railway (Evolution API/WhatsApp)

---

## 📋 O que muda na nova versão

| Antes | Agora |
|---|---|
| Node.js rodando no computador | Vercel (hospedagem gratuita na nuvem) |
| `db.json` no servidor | Firebase Firestore (banco em tempo real) |
| Polling a cada 5s | Firebase onSnapshot (tempo real instantâneo) |
| Precisa do PC ligado | Acessa de qualquer lugar, qualquer dispositivo |

A **Evolution API no Railway** continua igual — não muda nada nessa parte.

---

## 🚀 Passo a passo de configuração

### 1. Criar projeto no Firebase

1. Acesse https://console.firebase.google.com
2. Clique em **"Adicionar projeto"**
3. Nome: `sistema-shelly` → clique em Continuar
4. Desative o Google Analytics → clique em **"Criar projeto"**
5. No menu lateral, clique em **Firestore Database** → **"Criar banco de dados"**
6. Escolha **"Iniciar no modo de teste"** → selecione região `us-east1` → **Ativar**

### 2. Obter credenciais do Firebase (para o frontend)

1. No console Firebase, clique no ícone ⚙️ → **Configurações do projeto**
2. Role até **"Seus apps"** → clique em `</>` (Web)
3. Nome do app: `shelly-web` → clique em **Registrar app**
4. Copie o objeto `firebaseConfig` que aparecer, ex:
```javascript
{
  apiKey: "AIzaSy...",
  authDomain: "sistema-shelly.firebaseapp.com",
  projectId: "sistema-shelly",
  storageBucket: "sistema-shelly.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
}
```

5. Abra o arquivo `index.html` deste projeto e localize este trecho (linha ~20):
```javascript
const firebaseConfig = {
  apiKey:            window.FIREBASE_API_KEY            || "COLE_AQUI",
  authDomain:        window.FIREBASE_AUTH_DOMAIN        || "COLE_AQUI",
  projectId:         window.FIREBASE_PROJECT_ID         || "COLE_AQUI",
  ...
```

6. Substitua cada `"COLE_AQUI"` pelos valores do seu projeto Firebase.

### 3. Obter credenciais do Firebase (para o backend/Vercel)

1. No console Firebase, clique em ⚙️ → **Configurações do projeto** → aba **"Contas de serviço"**
2. Clique em **"Gerar nova chave privada"** → baixa um arquivo `.json`
3. Abra o arquivo `.json` e anote:
   - `project_id`
   - `client_email`
   - `private_key`

### 4. Deploy no Vercel

1. Crie conta gratuita em https://vercel.com
2. Instale o CLI: `npm i -g vercel`
3. Na pasta do projeto, rode:
```bash
vercel
```
4. Siga as perguntas (projeto novo, framework = Other, root = ./)
5. Após o primeiro deploy, configure as variáveis de ambiente:

```bash
vercel env add FIREBASE_PROJECT_ID
# Cole o project_id do arquivo JSON

vercel env add FIREBASE_CLIENT_EMAIL
# Cole o client_email

vercel env add FIREBASE_PRIVATE_KEY
# Cole a private_key INTEIRA (incluindo -----BEGIN CERTIFICATE-----)

vercel env add EVOLUTION_URL
# https://evolution-api-production-a563.up.railway.app

vercel env add EVOLUTION_INSTANCE
# shelly

vercel env add EVOLUTION_API_KEY
# shelly_apikey_2024
```

6. Faça redeploy para aplicar as variáveis:
```bash
vercel --prod
```

### 5. Configurar Webhook na Evolution API

Após o deploy, você terá uma URL como `https://sistema-shelly.vercel.app`.

Configure o webhook na Evolution API para apontar para:
```
https://SEU-PROJETO.vercel.app/api/webhook
```

Para configurar via curl:
```bash
curl -X POST https://evolution-api-production-a563.up.railway.app/webhook/set/shelly \
  -H "apikey: shelly_apikey_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://SEU-PROJETO.vercel.app/api/webhook",
    "webhook_by_events": true,
    "webhook_base64": true,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"]
  }'
```

---

## 📁 Estrutura do projeto

```
sistema_salao_vercel/
├── index.html              ← Frontend (toda a UI)
├── vercel.json             ← Config do Vercel
├── package.json            ← Dependências
└── api/
    ├── _helpers.js         ← Funções compartilhadas (Firebase + Evolution)
    ├── status.js           ← GET /api/status
    ├── config.js           ← GET/POST /api/config
    ├── webhook.js          ← POST /api/webhook (recebe SIM/NÃO)
    └── whatsapp/
        ├── qr.js           ← GET /api/whatsapp/qr
        ├── send.js         ← POST /api/whatsapp/send
        └── criar-instancia.js
```

---

## 🔧 Rodando localmente (para desenvolvimento)

```bash
npm install
vercel dev
```
Acesse: http://localhost:3000

---

## ✅ Checklist final

- [ ] Firebase projeto criado e Firestore ativo
- [ ] `firebaseConfig` atualizado no `index.html`
- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] Deploy feito com `vercel --prod`
- [ ] Webhook configurado na Evolution API
- [ ] Testado: Gerar QR Code → Conectar WhatsApp → Enviar confirmação → Receber SIM/NÃO
