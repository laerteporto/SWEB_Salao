# 🚀 Deploy no Railway — Studio Shelly Rodrigues

## Pré-requisitos
- Conta em [railway.app](https://railway.app) (gratuita)
- Conta em [mongodb.com](https://mongodb.com/atlas) (gratuita)
- Repositório no GitHub com os arquivos do sistema

---

## PASSO 1 — Criar banco MongoDB Atlas (gratuito)

1. Acesse **mongodb.com/atlas** → Create a free account
2. Crie um cluster **FREE (M0)**
3. Em **Database Access** → Add New User:
   - Username: `shelly`
   - Password: (anote a senha)
4. Em **Network Access** → Add IP Address → **Allow Access from Anywhere** (0.0.0.0/0)
5. Em **Clusters** → Connect → **Drivers** → copie a connection string:
   ```
   mongodb+srv://shelly:<senha>@cluster0.xxxxx.mongodb.net/?retryWrites=true
   ```
6. Substitua `<senha>` pela senha que criou

---

## PASSO 2 — Preparar o GitHub

Certifique-se que o repositório tem estes arquivos na raiz:
```
├── server.js        ← use o server_railway.js renomeado
├── package.json     ← use o package_railway.json renomeado
├── index.html
└── (não inclua a pasta data/ com db.json)
```

**Importante:** O `db.json` NÃO vai para o GitHub.
Os dados ficam no MongoDB Atlas.

---

## PASSO 3 — Deploy no Railway

1. Acesse **railway.app** → Login with GitHub
2. **New Project** → **Deploy from GitHub Repo**
3. Selecione o repositório `SWEB_Salao`
4. Railway detecta automaticamente o Node.js

---

## PASSO 4 — Configurar Variáveis de Ambiente

No Railway, vá em **Variables** e adicione:

| Variável           | Valor                                    |
|--------------------|------------------------------------------|
| `MONGO_URI`        | `mongodb+srv://shelly:SENHA@cluster...` |
| `EVOLUTION_URL`    | URL da sua Evolution API                 |
| `EVOLUTION_INSTANCE` | `shelly`                               |
| `EVOLUTION_APIKEY` | Sua API Key da Evolution                 |

---

## PASSO 5 — Obter a URL do Railway

1. No Railway → **Settings** → **Domains**
2. Clique **Generate Domain**
3. Você terá uma URL tipo:
   ```
   https://studio-shelly-production.up.railway.app
   ```

---

## PASSO 6 — Migrar dados existentes do db.json

No terminal do seu PC com o Node local rodando:

```bash
# Exporta seus dados atuais para o Railway
curl -X POST https://SEU-APP.up.railway.app/api/agendamentos \
  -H "Content-Type: application/json" \
  -d @/home/laerte/Downloads/sistema_salao/data/db.json
```

---

## PASSO 7 — Atualizar o index.html (GitHub Pages)

No `index.html`, a URL do backend precisa apontar para o Railway.

Procure a linha com `BackendAPI` e substitua:
```javascript
// De:
const BACKEND_URL = '';  // relativo (localhost)

// Para:
const BACKEND_URL = 'https://SEU-APP.up.railway.app';
```

---

## Resultado Final

| Componente     | Onde roda          | URL                              |
|----------------|--------------------|----------------------------------|
| Frontend       | GitHub Pages       | laerteporto.github.io/SWEB_Salao |
| Backend + API  | Railway            | xxx.up.railway.app               |
| Banco de dados | MongoDB Atlas      | (interno, sem URL pública)       |
| WhatsApp       | Evolution API      | (seu servidor ou VPS)            |

---

## Evolution API sem servidor local

Se quiser eliminar também o servidor local da Evolution API,
considere hospedar ela também no Railway ou em um VPS barato.
Pergunte se precisar de ajuda com isso!
