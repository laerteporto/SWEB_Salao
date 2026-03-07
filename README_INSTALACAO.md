# 🌸 Studio Shelly Rodrigues — Guia de Instalação Completo
## Integração WhatsApp com Evolution API

---

## 📋 O que você vai precisar

| Requisito | Versão mínima | Download |
|-----------|--------------|---------|
| Node.js | 16+ | https://nodejs.org |
| Docker Desktop | 4+ | https://docker.com/products/docker-desktop |
| WhatsApp Business | qualquer | Instalado no seu celular |

---

## 🚀 PASSO A PASSO — Do zero ao funcionando

### PASSO 1 — Extraia os arquivos

Coloque todos os arquivos numa pasta, por exemplo:
```
C:\SistemaSalon\
├── index.html
├── server.js
├── package.json
├── docker-compose.yml
└── README_INSTALACAO.md
```

---

### PASSO 2 — Instale o Node.js

1. Acesse https://nodejs.org e baixe a versão **LTS**
2. Execute o instalador (próximo → próximo → instalar)
3. Abra o **Prompt de Comando** (tecla Windows + R → digite `cmd` → Enter)
4. Verifique: `node --version` → deve mostrar `v18.x.x` ou similar

---

### PASSO 3 — Instale as dependências do sistema

No Prompt de Comando, navegue até a pasta do sistema:
```cmd
cd C:\SistemaSalon
npm install
```
Aguarde terminar (vai baixar os pacotes Express, CORS, etc.)

---

### PASSO 4 — Suba a Evolution API com Docker

1. Instale o **Docker Desktop** (https://docker.com/products/docker-desktop)
2. Após instalar, abra o Docker Desktop e aguarde iniciar
3. No Prompt de Comando, dentro da pasta do sistema:

```cmd
docker-compose up -d
```

4. Aguarde o download da imagem (primeira vez demora ~2min)
5. Verifique se está rodando:
```cmd
docker-compose ps
```
Deve aparecer `evolution_api` com status `Up`

6. Teste no navegador: http://localhost:8010/manager
   - Deve abrir o painel da Evolution API

---

### PASSO 5 — Configure a API Key

1. Abra o arquivo `docker-compose.yml` em um editor de texto
2. Localize a linha:
   ```
   AUTHENTICATION_API_KEY=shelly_apikey_2024
   ```
3. **Copie esse valor** — você vai precisar dele em breve
4. *(Opcional)* Troque por uma chave mais segura e reinicie: `docker-compose restart`

---

### PASSO 6 — Inicie o servidor do sistema

No Prompt de Comando:
```cmd
cd C:\SistemaSalon
node server.js
```

Você verá:
```
🌸 Studio Shelly Rodrigues — Backend rodando!
   ► http://localhost:3000
   ► Webhook:  http://localhost:3000/api/webhook
```

**Não feche essa janela do Prompt de Comando!**

---

### PASSO 7 — Abra o sistema no navegador

Acesse: **http://localhost:3000**

O sistema vai abrir. Clique em **📱 WhatsApp** no menu lateral.

---

### PASSO 8 — Configure a integração no sistema

Na tela de WhatsApp do sistema, preencha:

| Campo | Valor |
|-------|-------|
| URL da Evolution API | `http://localhost:8080` |
| Nome da Instância | `shelly` |
| API Key | `shelly_apikey_2024` (ou o que você definiu) |
| Nome do Salão | `Studio Shelly Rodrigues` |

Clique em **💾 Salvar Configurações**

---

### PASSO 9 — Crie a instância WhatsApp

Ainda na tela WhatsApp, clique em **"+ Criar Instância"**

Depois clique em **"📷 Gerar QR Code"**

---

### PASSO 10 — Conecte seu WhatsApp Business

1. Abra o **WhatsApp Business** no celular
2. Toque em ⋮ (três pontos) → **Aparelhos conectados**
3. Toque em **Conectar um aparelho**
4. Escaneie o QR Code que aparece na tela

✅ **Pronto! WhatsApp conectado!**

---

## 📱 Como usar na prática

### Enviar confirmação para cliente:
1. Na **Agenda**, clique em qualquer agendamento
2. Role para baixo → seção **"Confirmação via WhatsApp"**
3. Confira a prévia da mensagem
4. Clique em **"Enviar via WhatsApp"**
5. O status muda para 📱 **Aguardando WhatsApp**

### Quando a cliente responder:
- A cliente responde **SIM** → status muda automaticamente para ✅ **Confirmado**
- A cliente responde **NÃO** → status muda para ❌ **Cancelado**
- O sistema verifica respostas a cada **15 segundos**
- Um toast de notificação aparece na tela quando chegar uma resposta

### Mensagens que o sistema reconhece como "SIM":
`sim`, `s`, `yes`, `confirmo`, `confirmado`, `ok`, `pode`, `tá`, `top`, `1`

### Mensagens reconhecidas como "NÃO":
`nao`, `não`, `n`, `no`, `cancelar`, `cancelado`, `cancela`, `2`

---

## 🔄 Para iniciar o sistema todo dia

Abra o **Prompt de Comando** e execute:
```cmd
cd C:\SistemaSalon
docker-compose up -d
node server.js
```

Depois acesse: **http://localhost:3000**

---

## 💡 Dica — Iniciar automaticamente no Windows

Crie um arquivo `iniciar.bat` na pasta do sistema:
```bat
@echo off
cd /d C:\SistemaSalon
docker-compose up -d
timeout /t 5
node server.js
pause
```

Dê duplo clique nele para iniciar tudo de uma vez!

---

## ❓ Problemas comuns

### "Docker não encontrado"
→ Instale o Docker Desktop em https://docker.com e reinicie o computador

### "porta 8080 já em uso"
→ No `docker-compose.yml`, troque `"8080:8080"` por `"8181:8080"` e ajuste a URL no sistema

### "QR Code expira rápido"
→ Normal! O QR Code expira em ~60 segundos. Clique em "Novo QR Code" e escaneie mais rápido

### "WhatsApp desconecta"
→ Isso acontece se o celular ficar sem internet por muito tempo. Gere um novo QR Code para reconectar

### "Mensagens não chegam / status não atualiza"
→ O webhook precisa estar acessível. Se estiver atrás de roteador, veja a seção abaixo

---

## 🌐 Usando de fora da rede local (ngrok)

Se quiser que o webhook funcione de outros lugares:

1. Baixe ngrok: https://ngrok.com/download
2. Execute: `ngrok http 3000`
3. Copie a URL gerada (ex: `https://abc123.ngrok.io`)
4. Na tela WhatsApp do sistema, o webhook já é configurado automaticamente

---

## 📞 Suporte

O sistema foi desenvolvido especialmente para o **Studio Shelly Rodrigues**.
Todos os dados ficam salvos localmente no arquivo `data/db.json`.

---

*Versão 3.0 — Com integração Evolution API*

####CLOUDFLARE#####

# Terminal 1 — inicia o Node
cd /home/laerte/Downloads/sistema_salao/
./start.sh

# Terminal 2 — inicia o Cloudflare
# (seu comando habitual)

Comando para executar o cloudflare via docker cmd cli

docker run --rm -it   --network host   cloudflare/cloudflared:latest   tunnel --url http://localhost:3000

###ACESSO DO PROJETO VIA SSH###
git remote set-url origin git@github.com:/laerteporto/rspsistema.git
ssh -T git@github.com
Com SSH configurado, você pode simplesmente:
git push -u origin main
sem pedir senha/token.

Você pode configurar o Git para lembrar seu token (no Linux):

git config --global credential.helper cache
ou
git config --global credential.helper store

#########GIT COMANDOS###################

##CRIAR PROJETO NO GIT HUB - CLI
git status
git pull
git add .
git commit -m "feat: nova melhoria"
git push
git push --set-upstream origin main


##Atualizar projeto do git - comandos 
Esta na pasta do projeto e executar os seguintes comandos 

git push -f origin main
git add .
git commit -m "feat: atualiza backend e ajustes na interface"
git push

Comandos para adicionar projeto no git hub

###Para baixar um projeto do GitHub para sua máquina via console, usamos o comando:

git clone https://github.com/usuario/projeto.git

⭐ MODO PROFISSIONAL (SSH — recomendado)

Se você já configurou SSH, use:

git clone git@github.com:usuario/projeto.git

###################LINK SISTEMA RSPSISTEMAS###########
https://rspsystem.netlify.app/login.html

laerte
S@muelporto11
rogerio
RSP@admin2026

console.firebase.google.com

https://netlify.com/


