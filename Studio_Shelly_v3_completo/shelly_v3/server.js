/**
 * Studio Shelly Rodrigues — Backend Server
 * Integração com Evolution API (WhatsApp)
 *
 * Rotas:
 *   GET  /api/status          — status do servidor e conexão WPP
 *   POST /api/whatsapp/send   — envia mensagem WhatsApp
 *   POST /api/webhook         — recebe respostas do WhatsApp (Evolution API)
 *   GET  /api/agendamentos    — lista agendamentos (com status wpp)
 *   POST /api/agendamentos    — salva/atualiza agendamentos do frontend
 *   GET  /api/config          — retorna config do servidor para o frontend
 *   POST /api/config          — salva config (url Evolution, instância, apikey)
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const fs      = require('fs-extra');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Paths ───────────────────────────────────────────────────────────────────
const DATA_FILE   = path.join(__dirname, 'data', 'db.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function readDB() {
  try {
    await fs.ensureFile(DATA_FILE);
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return raw ? JSON.parse(raw) : defaultDB();
  } catch { return defaultDB(); }
}

async function writeDB(data) {
  await fs.ensureDir(path.dirname(DATA_FILE));
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function defaultDB() {
  return { agendamentos: [], clientes: [], servicos: [], financeiro: [], wppMensagens: [] };
}

async function readConfig() {
  try {
    await fs.ensureFile(CONFIG_FILE);
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    return raw ? JSON.parse(raw) : defaultConfig();
  } catch { return defaultConfig(); }
}

async function writeConfig(cfg) {
  await fs.ensureDir(path.dirname(CONFIG_FILE));
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function defaultConfig() {
  return {
    evolutionUrl:      'http://localhost:8080',   // URL da sua Evolution API
    evolutionInstance: 'shelly',                   // nome da instância criada
    evolutionApiKey:   '',                         // API Key da Evolution
    webhookSecret:     'shelly2024',               // segredo para validar webhooks
    salonName:         'Studio Shelly Rodrigues',
    salonPhone:        ''
  };
}

// ─── Evolution API helpers ────────────────────────────────────────────────────
async function evolutionRequest(method, endpoint, body, config) {
  const url = `${config.evolutionUrl.replace(/\/$/, '')}${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.evolutionApiKey
    },
    body: body ? JSON.stringify(body) : undefined,
    timeout: 10000
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Evolution API ${res.status}: ${txt}`);
  }
  return res.json();
}

function formatPhone(telefone) {
  const digits = telefone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits + '@s.whatsapp.net';
  if (digits.length === 11) return '55' + digits + '@s.whatsapp.net';
  if (digits.length === 10) return '55' + digits + '@s.whatsapp.net'; // sem 9
  return '55' + digits + '@s.whatsapp.net';
}

function buildConfirmacaoMsg(ag, salonName) {
  const dia = new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const nome = ag.clienteNome.split(' ')[0];
  return `Olá, *${nome}*! 😊\n\nTemos um agendamento confirmado no *${salonName}*:\n\n✂️ *Serviço:* ${ag.servicoNome}\n📅 *Data:* ${dia}\n⏰ *Horário:* ${ag.hora}\n💰 *Valor:* R$ ${Number(ag.valor).toFixed(2).replace('.', ',')}\n\nPara *confirmar* seu agendamento responda:\n👉 *SIM*\n\nPara *cancelar* responda:\n👉 *NÃO*\n\nAguardamos você com muito carinho! 💛✨`;
}

// ─── Webhook parser ───────────────────────────────────────────────────────────
// Detecta se a mensagem recebida é SIM ou NÃO
function parseRespostaCliente(text) {
  if (!text) return null;
  const normalized = text.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos
  if (/^(sim|s|yes|confirmo|confirmado|ok|okay|pode|tá|ta|top|1)$/i.test(normalized)) return 'sim';
  if (/^(nao|n|no|nope|cancelar|cancelado|cancela|nope|2)$/i.test(normalized)) return 'nao';
  return null; // mensagem não reconhecida
}

// Extrai número limpo do remoteJid
function extractPhone(remoteJid) {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /api/config
app.get('/api/config', async (req, res) => {
  const cfg = await readConfig();
  // Never expose apiKey fully
  const safe = { ...cfg, evolutionApiKey: cfg.evolutionApiKey ? '****' + cfg.evolutionApiKey.slice(-4) : '' };
  res.json(safe);
});

// POST /api/config  — salva nova configuração
app.post('/api/config', async (req, res) => {
  try {
    const current = await readConfig();
    const updated = { ...current, ...req.body };
    // If apiKey is masked, keep existing
    if (req.body.evolutionApiKey && req.body.evolutionApiKey.startsWith('****')) {
      updated.evolutionApiKey = current.evolutionApiKey;
    }
    await writeConfig(updated);
    res.json({ ok: true, message: 'Configuração salva' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/status — health check + evolution connection status
app.get('/api/status', async (req, res) => {
  const config = await readConfig();
  let evolutionStatus = { connected: false, state: 'unknown', qrcode: null };

  try {
    const data = await evolutionRequest('GET',
      `/instance/connectionState/${config.evolutionInstance}`, null, config);
    evolutionStatus.connected = data?.instance?.state === 'open';
    evolutionStatus.state     = data?.instance?.state || 'unknown';
  } catch (e) {
    evolutionStatus.error = e.message;
  }

  res.json({
    ok: true,
    server: 'Studio Shelly Backend v3',
    timestamp: new Date().toISOString(),
    evolution: evolutionStatus,
    config: {
      instance: config.evolutionInstance,
      url: config.evolutionUrl,
      hasApiKey: !!config.evolutionApiKey
    }
  });
});

// GET /api/whatsapp/qr — retorna QR code para conectar instância
app.get('/api/whatsapp/qr', async (req, res) => {
  const config = await readConfig();
  try {
    const data = await evolutionRequest('GET',
      `/instance/connect/${config.evolutionInstance}`, null, config);
    res.json({ ok: true, qrcode: data?.base64 || data?.qrcode?.base64 || null, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/whatsapp/send — envia mensagem de confirmação
app.post('/api/whatsapp/send', async (req, res) => {
  const { agId } = req.body;
  if (!agId) return res.status(400).json({ ok: false, error: 'agId obrigatório' });

  const config = await readConfig();
  const db     = await readDB();

  const ag  = db.agendamentos.find(a => a.id === agId);
  if (!ag)  return res.status(404).json({ ok: false, error: 'Agendamento não encontrado' });

  const cli = db.clientes.find(c => c.id === ag.clienteId);
  if (!cli) return res.status(404).json({ ok: false, error: 'Cliente não encontrada' });
  if (!cli.telefone) return res.status(400).json({ ok: false, error: 'Cliente sem telefone cadastrado' });

  const phone = formatPhone(cli.telefone);
  const msg   = buildConfirmacaoMsg(ag, config.salonName);

  try {
    const result = await evolutionRequest('POST',
      `/message/sendText/${config.evolutionInstance}`, {
        number: phone,
        text:   msg,
        delay:  1000
      }, config);

    // Update agendamento
    const ai = db.agendamentos.findIndex(a => a.id === agId);
    db.agendamentos[ai].status       = 'aguardando';
    db.agendamentos[ai].wppEnviado   = true;
    db.agendamentos[ai].wppEnviadoEm = new Date().toISOString();

    // Register in wpp inbox
    if (!db.wppMensagens) db.wppMensagens = [];
    const exists = db.wppMensagens.find(m => m.agId === agId);
    if (!exists) {
      db.wppMensagens.push({
        id:          (db.wppMensagens.length ? Math.max(...db.wppMensagens.map(m => m.id)) + 1 : 1),
        agId,
        clienteId:   cli.id,
        clienteNome: cli.nome,
        clienteTel:  cli.telefone,
        phoneWpp:    phone,
        servico:     ag.servicoNome,
        data:        ag.data,
        hora:        ag.hora,
        enviadoEm:   new Date().toISOString(),
        resposta:    null,
        respostaEm:  null,
        lida:        false,
        evolutionMsgId: result?.key?.id || null
      });
    }

    await writeDB(db);
    res.json({ ok: true, message: 'Mensagem enviada com sucesso!', phone, evolutionResult: result });
  } catch (e) {
    console.error('[WPP SEND ERROR]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/webhook — recebe eventos da Evolution API
// Configure na Evolution API: URL = http://SEU_IP:3000/api/webhook
app.post('/api/webhook', async (req, res) => {
  res.sendStatus(200); // responde imediatamente

  try {
    const payload = req.body;
    console.log('[WEBHOOK]', JSON.stringify(payload).slice(0, 200));

    // Evolution API envia diferentes tipos de evento
    const event = payload?.event || payload?.type;

    // Só processamos mensagens recebidas
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return;

    const messageData = payload?.data || payload;
    const msg = messageData?.message || messageData?.messages?.[0];
    if (!msg) return;

    // Ignora mensagens enviadas por nós (fromMe)
    if (msg?.key?.fromMe || messageData?.key?.fromMe) return;

    const remoteJid = msg?.key?.remoteJid || messageData?.key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us')) return; // ignora grupos

    const senderPhone = extractPhone(remoteJid);
    const textBody    = msg?.message?.conversation
      || msg?.message?.extendedTextMessage?.text
      || messageData?.message?.conversation
      || messageData?.message?.extendedTextMessage?.text
      || '';

    const resposta = parseRespostaCliente(textBody);
    if (!resposta) {
      console.log(`[WEBHOOK] Mensagem de ${senderPhone} não reconhecida: "${textBody}"`);
      return;
    }

    console.log(`[WEBHOOK] ${senderPhone} respondeu: ${resposta.toUpperCase()}`);

    const db = await readDB();
    if (!db.wppMensagens) db.wppMensagens = [];

    // Encontra a mensagem pendente para este número
    const senderDigits = senderPhone.replace(/\D/g, '');
    const pendingMsg = db.wppMensagens.find(m => {
      const telDigits = m.clienteTel?.replace(/\D/g, '') || '';
      return m.resposta === null && (
        telDigits.endsWith(senderDigits) ||
        senderDigits.endsWith(telDigits) ||
        telDigits === senderDigits
      );
    });

    if (!pendingMsg) {
      console.log(`[WEBHOOK] Nenhuma mensagem pendente para ${senderPhone}`);
      return;
    }

    // Atualiza a mensagem
    const mi = db.wppMensagens.findIndex(m => m.id === pendingMsg.id);
    db.wppMensagens[mi].resposta   = resposta;
    db.wppMensagens[mi].respostaEm = new Date().toISOString();
    db.wppMensagens[mi].lida       = false; // marca como nova resposta não lida

    // Atualiza status do agendamento
    const ai = db.agendamentos.findIndex(a => a.id === pendingMsg.agId);
    if (ai >= 0) {
      db.agendamentos[ai].status = resposta === 'sim' ? 'confirmado' : 'cancelado';
      console.log(`[WEBHOOK] Agendamento #${pendingMsg.agId} → ${db.agendamentos[ai].status}`);
    }

    await writeDB(db);

    // Envia mensagem de retorno ao cliente
    const config = await readConfig();
    const nomeCliente = pendingMsg.clienteNome.split(' ')[0];
    const agAtualizado = db.agendamentos[ai];

    let msgRetorno;
    if (resposta === 'sim') {
      const dia = new Date(agAtualizado.data + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      msgRetorno = `✅ *Confirmado, ${nomeCliente}!*\n\nSeu agendamento está confirmado:\n📅 ${dia} às ${agAtualizado.hora}\n✂️ ${agAtualizado.servicoNome}\n\nTe esperamos com carinho! 💛 — *${config.salonName}*`;
    } else {
      msgRetorno = `😔 *Entendido, ${nomeCliente}.*\n\nSeu agendamento foi cancelado. Quando quiser remarcar, entre em contato conosco!\n\n— *${config.salonName}* 💛`;
    }

    try {
      await evolutionRequest('POST',
        `/message/sendText/${config.evolutionInstance}`, {
          number: remoteJid,
          text:   msgRetorno,
          delay:  500
        }, config);
      console.log(`[WEBHOOK] Mensagem de retorno enviada para ${senderPhone}`);
    } catch (e) {
      console.error('[WEBHOOK] Erro ao enviar retorno:', e.message);
    }

  } catch (e) {
    console.error('[WEBHOOK ERROR]', e.message, e.stack);
  }
});

// GET /api/agendamentos — frontend polling para atualizar status
app.get('/api/agendamentos', async (req, res) => {
  const db = await readDB();
  res.json({
    ok: true,
    agendamentos: db.agendamentos,
    wppMensagens: db.wppMensagens || [],
    timestamp: new Date().toISOString()
  });
});

// POST /api/agendamentos — frontend salva dados completos
app.post('/api/agendamentos', async (req, res) => {
  try {
    const db = await readDB();
    const { agendamentos, clientes, servicos, financeiro, wppMensagens } = req.body;
    if (agendamentos) db.agendamentos = agendamentos;
    if (clientes)     db.clientes     = clientes;
    if (servicos)     db.servicos     = servicos;
    if (financeiro)   db.financeiro   = financeiro;
    if (wppMensagens) db.wppMensagens = wppMensagens;
    await writeDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/wpp-mensagens — apenas mensagens WPP
app.get('/api/wpp-mensagens', async (req, res) => {
  const db = await readDB();
  res.json({ ok: true, wppMensagens: db.wppMensagens || [] });
});

// POST /api/whatsapp/criar-instancia — cria instância na Evolution API
app.post('/api/whatsapp/criar-instancia', async (req, res) => {
  const config = await readConfig();
  try {
    const data = await evolutionRequest('POST', '/instance/create', {
      instanceName:      config.evolutionInstance,
      qrcode:            true,
      integration:       'WHATSAPP-BAILEYS',
      webhook:           {
        url:       `http://localhost:${PORT}/api/webhook`,
        byEvents:  true,
        base64:    true,
        events:    ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']
      }
    }, config);
    res.json({ ok: true, data });
  } catch (e) {
    // Instância pode já existir
    res.json({ ok: false, error: e.message, hint: 'A instância pode já existir, tente conectar.' });
  }
});

// ─── 404 fallback → serve index.html (SPA) ───────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌸 Studio Shelly Rodrigues — Backend rodando!`);
  console.log(`   ► http://localhost:${PORT}`);
  console.log(`   ► Webhook:  http://localhost:${PORT}/api/webhook`);
  console.log(`   ► Status:   http://localhost:${PORT}/api/status\n`);
});
