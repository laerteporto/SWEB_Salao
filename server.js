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
// Serve arquivos sem cache — garante versao mais recente no Cloudflare e navegador
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function readDB() {
  // Tenta ler o arquivo principal
  try {
    await fs.ensureFile(DATA_FILE);
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      // Verifica se tem dados reais (não está vazio)
      const temDados = parsed.agendamentos?.length || parsed.clientes?.length || parsed.servicos?.length;
      if (temDados) return parsed;
    }
  } catch(e) {}

  // Tenta o backup se o principal estiver vazio ou corrompido
  try {
    const bakExists = await fs.pathExists(DATA_FILE + '.bak');
    if (bakExists) {
      const raw = await fs.readFile(DATA_FILE + '.bak', 'utf8');
      if (raw && raw.trim()) {
        console.log('[DB] Restaurando dados do backup...');
        const parsed = JSON.parse(raw);
        await fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2));
        return parsed;
      }
    }
  } catch(e) {}

  return defaultDB();
}

async function writeDB(data) {
  await fs.ensureDir(path.dirname(DATA_FILE));
  // Backup antes de sobrescrever
  try {
    const exists = await fs.pathExists(DATA_FILE);
    if (exists) {
      await fs.copy(DATA_FILE, DATA_FILE + '.bak', { overwrite: true });
    }
  } catch(e) {}
  // Salva com caracteres UTF-8 reais (não escapa acentos)
  const json = JSON.stringify(data, null, 2)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
  await fs.writeFile(DATA_FILE, json, 'utf8');
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
    evolutionUrl:      process.env.EVOLUTION_URL || 'https://evolution-api-production-a563.up.railway.app',
    evolutionInstance: process.env.EVOLUTION_INSTANCE || 'shelly',
    evolutionApiKey:   process.env.EVOLUTION_API_KEY || '',
    webhookSecret:     'shelly2024',
    salonName:         'Studio Shelly Rodrigues',
    salonPhone:        ''
  };
}

// ─── Evolution API helpers ────────────────────────────────────────────────────
async function evolutionRequest(method, endpoint, body, config) {
  const url = `${config.evolutionUrl.replace(/\/$/, '')}${endpoint}`;
  console.log(`[EVOLUTION] ${method} ${url}`);
  if (body) console.log(`[EVOLUTION] Body:`, JSON.stringify(body).slice(0, 200));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.evolutionApiKey
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const txt = await res.text();
    console.log(`[EVOLUTION] Response ${res.status}:`, txt.slice(0, 300));

    if (!res.ok) {
      throw new Error(`Evolution API ${res.status}: ${txt}`);
    }
    try { return JSON.parse(txt); } catch { return { raw: txt }; }
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Evolution API timeout - verifique se está rodando em localhost:8080');
    throw e;
  }
}

function formatPhone(telefone) {
  // Evolution API v1.x aceita só os digitos: 5562999999999
  const digits = telefone.replace(/\D/g, '');
  // Já tem código do país 55
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  // Celular com 9 dígitos + DDD (11 dígitos total)
  if (digits.length === 11) return '55' + digits;
  // Fixo sem 9 (10 dígitos)
  if (digits.length === 10) return '55' + digits;
  // Qualquer outro caso
  return '55' + digits;
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

// GET /api/whatsapp/diagnostico — mostra estado atual e testa busca de mensagens
app.get('/api/whatsapp/diagnostico', async (req, res) => {
  const config = await readConfig();
  const db     = await readDB();
  const pendentes = (db.wppMensagens || []).filter(m => m.resposta === null);
  const resultado = [];

  for (const msg of pendentes) {
    const phoneDigits = msg.clienteTel.replace(/\D/g, '');
    const phone = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;
    const jid   = phone + '@s.whatsapp.net';

    // Busca msgs enviadas (fromMe:true) para pegar timestamp real
    const enviadas = await evolutionRequest('POST',
      `/chat/findMessages/${config.evolutionInstance}`,
      { where: { remoteJid: jid, fromMe: true }, limit: 3 },
      config
    ).catch(e => ({ erro: e.message }));

    // Busca respostas (fromMe:false)
    const recebidas = await evolutionRequest('POST',
      `/chat/findMessages/${config.evolutionInstance}`,
      { where: { remoteJid: jid, fromMe: false }, limit: 5 },
      config
    ).catch(e => ({ erro: e.message }));

    const enviadasArr = Array.isArray(enviadas) ? enviadas : [];
    const recebidasArr = Array.isArray(recebidas) ? recebidas : [];

    // Extrai timestamp de objeto protobuf {low, high} ou número
    const xts = t => {
      if (!t) return 0;
      if (typeof t === 'number') return t;
      if (typeof t === 'object') return t.low || t.seconds || 0;
      return parseInt(t) || 0;
    };

    enviadasArr.sort((a,b) => xts(b?.messageTimestamp) - xts(a?.messageTimestamp));
    const ultimoEnvio = enviadasArr[0];
    const tsEnvioNum = xts(ultimoEnvio?.messageTimestamp) || msg.enviadoEmSec || 0;

    resultado.push({
      cliente: msg.clienteNome,
      agId: msg.agId,
      tsEnvio_num: tsEnvioNum,
      msgs_enviadas: enviadasArr.length,
      msgs_recebidas: recebidasArr.map(m => ({
        ts_num: xts(m?.messageTimestamp),
        texto: m?.message?.conversation || m?.message?.extendedTextMessage?.text || '(sem texto)',
        apos_envio: xts(m?.messageTimestamp) > tsEnvioNum
      }))
    });
  }

  res.json({ pendentes: pendentes.length, resultado });
});

// POST /api/whatsapp/check-messages — busca mensagens recentes e processa SIM/NÃO
// Útil como fallback quando webhook não está configurado
app.post('/api/whatsapp/check-messages', async (req, res) => {
  const config = await readConfig();
  const db     = await readDB();

  if (!db.wppMensagens || !db.wppMensagens.length) {
    return res.json({ ok: true, processed: 0, message: 'Nenhuma mensagem pendente' });
  }

  const pendentes = db.wppMensagens.filter(m => m.resposta === null);
  if (!pendentes.length) {
    return res.json({ ok: true, processed: 0, message: 'Todas mensagens já respondidas' });
  }

  let processados = 0;
  const erros = [];

  for (const msg of pendentes) {
    try {
      const phoneDigits = msg.clienteTel.replace(/\D/g, '');
      const phone = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;

      const jid2  = phone + '@s.whatsapp.net';
      // Busca mensagens recentes desta conversa na Evolution API
      const data = await evolutionRequest('POST',
        `/chat/findMessages/${config.evolutionInstance}`,
        { where: { remoteJid: jid2 }, limit: 20 }, config
      ).catch(() => null);

      if (!data) continue;

      // Pega mensagens recebidas (não enviadas por nós) após o envio
      const mensagens = (data?.messages?.records || data?.messages || data || []);
      const enviouEm  = new Date(msg.enviadoEm).getTime();

      const respostaMensagem = mensagens
        .filter(m => !m?.key?.fromMe && new Date(m?.messageTimestamp * 1000 || m?.messageDate).getTime() > enviouEm)
        .map(m => m?.message?.conversation || m?.message?.extendedTextMessage?.text || '')
        .find(txt => parseRespostaCliente(txt) !== null);

      if (respostaMensagem) {
        const resposta = parseRespostaCliente(respostaMensagem);
        const mi = db.wppMensagens.findIndex(m => m.id === msg.id);
        db.wppMensagens[mi].resposta   = resposta;
        db.wppMensagens[mi].respostaEm = new Date().toISOString();
        db.wppMensagens[mi].lida       = false;

        const ai = db.agendamentos.findIndex(a => a.id === msg.agId);
        if (ai >= 0) {
          db.agendamentos[ai].status = resposta === 'sim' ? 'confirmado' : 'cancelado';
          console.log(`[CHECK] Agendamento #${msg.agId} → ${db.agendamentos[ai].status} (via poll)`);
        }
        processados++;
      }
    } catch (e) {
      erros.push({ agId: msg.agId, error: e.message });
    }
  }

  if (processados > 0) {
    await writeDB(db);
  }

  res.json({ ok: true, processed: processados, pending: pendentes.length, erros });
});

// GET /api/whatsapp/qr — retorna QR code para conectar instância
app.get('/api/whatsapp/qr', async (req, res) => {
  const config = await readConfig();

  // Valida se URL está configurada corretamente
  if (!config.evolutionUrl || config.evolutionUrl.includes('localhost:8080')) {
    return res.status(500).json({
      ok: false,
      error: 'URL da Evolution API não configurada. Acesse as Configurações e informe a URL correta.'
    });
  }

  try {
    const data = await evolutionRequest('GET',
      `/instance/connect/${config.evolutionInstance}`, null, config);
    // v1.x returns base64 directly, v2.x nests it
    const qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;
    if (qrcode) return res.json({ ok: true, qrcode, data });
    throw new Error('QR Code não retornado pela Evolution API');
  } catch (e) {
    const errMsg = e.message || '';
    const isNotFound = errMsg.includes('404') || errMsg.toLowerCase().includes('not found') ||
                       errMsg.toLowerCase().includes('instance');

    // Se instância não existe, cria automaticamente
    if (isNotFound) {
      try {
        console.log('[QR] Instância não encontrada, criando automaticamente...');
        await evolutionRequest('POST', '/instance/create', {
          instanceName: config.evolutionInstance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        }, config);
        await new Promise(r => setTimeout(r, 1500));
        const data2 = await evolutionRequest('GET',
          `/instance/connect/${config.evolutionInstance}`, null, config);
        const qrcode2 = data2?.base64 || data2?.qrcode?.base64 || data2?.code || null;
        return res.json({ ok: true, qrcode: qrcode2, data: data2 });
      } catch (e2) {
        return res.status(500).json({ ok: false, error: `Erro ao criar instância: ${e2.message}` });
      }
    }

    const friendlyMsg = errMsg.includes('timeout')
      ? 'Evolution API não respondeu (timeout). Verifique se o serviço está ativo no Railway.'
      : (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch'))
      ? 'Não foi possível conectar à Evolution API. Verifique a URL nas configurações.'
      : errMsg;

    res.status(500).json({ ok: false, error: friendlyMsg });
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
        number:  phone,
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: msg }
      }, config);

    // Busca o timestamp REAL do envio direto na Evolution API (evita dessincronismo)
    let envioTimestampSec = result?.messageTimestamp || result?.key?.messageTimestamp || 0;

    if (!envioTimestampSec) {
      // Busca a mensagem que acabamos de enviar para pegar o timestamp real
      try {
        await new Promise(r => setTimeout(r, 1500)); // aguarda 1.5s para a msg ser indexada
        const jidParaBusca = phone + '@s.whatsapp.net';
        const sent = await evolutionRequest('POST',
          `/chat/findMessages/${config.evolutionInstance}`,
          { where: { remoteJid: jidParaBusca, fromMe: true }, limit: 1 },
          config
        );
        const sentArr = Array.isArray(sent) ? sent : [];
        const latest = sentArr.sort((a,b) => (b?.messageTimestamp||0)-(a?.messageTimestamp||0))[0];
        if (latest?.messageTimestamp) {
          envioTimestampSec = latest.messageTimestamp;
        }
      } catch(e) { /* ignora */ }
    }

    // Fallback: usa tempo atual da Evolution estimado (Node - 10min de margem)
    if (!envioTimestampSec) {
      envioTimestampSec = Math.floor(Date.now() / 1000) - 60;
    }

    console.log(`[SEND] ts=${envioTimestampSec} key.id=${result?.key?.id}`);

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
        id:             (db.wppMensagens.length ? Math.max(...db.wppMensagens.map(m => m.id)) + 1 : 1),
        agId,
        clienteId:      cli.id,
        clienteNome:    cli.nome,
        clienteTel:     cli.telefone,
        phoneWpp:       phone,
        servico:        ag.servicoNome,
        data:           ag.data,
        hora:           ag.hora,
        enviadoEm:      new Date().toISOString(),
        enviadoEmSec:   envioTimestampSec,
        resposta:       null,
        respostaEm:     null,
        lida:           false,
        evolutionMsgId: result?.key?.id || null
      });
    } else {
      // Atualiza timestamp e msgId se reenviou
      const mi = db.wppMensagens.findIndex(m => m.agId === agId);
      if (mi >= 0) {
        db.wppMensagens[mi].enviadoEmSec   = envioTimestampSec;
        db.wppMensagens[mi].evolutionMsgId = result?.key?.id || null;
        db.wppMensagens[mi].resposta       = null;
        db.wppMensagens[mi].respostaEm     = null;
      }
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
    const event = payload?.event || payload?.type || '';
    console.log('[WEBHOOK] Event type:', event);

    // Aceita vários formatos da Evolution API v1.x e v2.x
    const isMessageEvent = [
      'messages.upsert','MESSAGES_UPSERT',
      'message','MESSAGE',
      'messages','message.received'
    ].includes(event) || event.toLowerCase().includes('message');

    if (!isMessageEvent) {
      console.log('[WEBHOOK] Evento ignorado:', event);
      return;
    }

    // Normaliza o payload — v1.x e v2.x têm estruturas diferentes
    const messageData = payload?.data || payload;

    // Tenta extrair a mensagem de diferentes formatos
    let msg = messageData?.message
      || messageData?.messages?.[0]
      || messageData;

    // Formato v1.x: payload tem key e message direto
    const keyData = msg?.key || messageData?.key;
    if (!keyData) {
      console.log('[WEBHOOK] Sem key, payload:', JSON.stringify(payload).slice(0,200));
      return;
    }

    // Ignora mensagens enviadas por nós (fromMe)
    if (keyData?.fromMe === true) {
      console.log('[WEBHOOK] Mensagem própria ignorada');
      return;
    }

    const remoteJid = keyData?.remoteJid || '';
    if (!remoteJid || remoteJid.includes('@g.us')) {
      console.log('[WEBHOOK] Grupo ou JID inválido:', remoteJid);
      return;
    }

    const senderPhone = extractPhone(remoteJid);

    // Extrai texto de diferentes formatos
    const msgContent = msg?.message || messageData?.message || {};
    const textBody   = msgContent?.conversation
      || msgContent?.extendedTextMessage?.text
      || msgContent?.buttonsResponseMessage?.selectedDisplayText
      || msgContent?.listResponseMessage?.title
      || payload?.body
      || payload?.text
      || '';

    console.log(`[WEBHOOK] Mensagem de ${senderPhone}: "${textBody}"`);

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
      // Clean phone for reply
      const replyPhone = remoteJid.replace('@s.whatsapp.net','').replace('@c.us','');
      await evolutionRequest('POST',
        `/message/sendText/${config.evolutionInstance}`, {
          number:  replyPhone,
          options: { delay: 800, presence: 'composing' },
          textMessage: { text: msgRetorno }
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
    ok:           true,
    agendamentos: db.agendamentos  || [],
    clientes:     db.clientes      || [],
    servicos:     db.servicos      || [],
    financeiro:   db.financeiro    || [],
    wppMensagens: db.wppMensagens  || [],
    timestamp:    new Date().toISOString()
  });
});

// POST /api/agendamentos — frontend salva dados completos
app.post('/api/agendamentos', async (req, res) => {
  try {
    const db = await readDB();
    const { agendamentos, clientes, servicos, financeiro, wppMensagens } = req.body;

    // Proteção simples: só bloqueia se vier array VAZIO tentando sobrescrever dados existentes
    // Permite exclusões normais (19->18, 8->7, etc) — só bloqueia 0 sobrescrevendo N
    const safe = (novo, atual) => {
      if ((novo?.length || 0) === 0 && (atual?.length || 0) > 0) {
        console.log(`[DB] Bloqueado: array vazio nao pode sobrescrever ${atual.length} registros`);
        return atual; // protege contra sync vazio do Cloudflare
      }
      return novo !== undefined ? novo : atual;
    };

    db.agendamentos = safe(agendamentos, db.agendamentos);
    db.clientes     = safe(clientes,     db.clientes);
    db.servicos     = safe(servicos,     db.servicos);
    db.financeiro   = safe(financeiro,   db.financeiro);
    if (wppMensagens !== undefined) db.wppMensagens = wppMensagens;

    await writeDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/agendamentos/:id — exclui agendamento específico pelo ID
app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const db  = await readDB();
    const antes = db.agendamentos.length;
    db.agendamentos  = db.agendamentos.filter(a => a.id !== id);
    db.wppMensagens  = (db.wppMensagens || []).filter(m => m.agId !== id);
    await writeDB(db);
    console.log(`[DB] Agendamento #${id} excluído (${antes} → ${db.agendamentos.length})`);
    res.json({ ok: true, removidos: antes - db.agendamentos.length });
  } catch(e) {
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

// ─── Auto-polling: busca respostas SIM/NÃO a cada 8 segundos ────────────────
// Isso substitui o webhook quando o Docker bloqueia chamadas para localhost
async function autoPollRespostas() {
  try {
    const config = await readConfig();
    const db     = await readDB();
    if (!db.wppMensagens) return;

    const pendentes = db.wppMensagens.filter(m => m.resposta === null);
    if (!pendentes.length) return;

    const xtxt = m => m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';

    console.log(`[POLL] ${pendentes.length} pendente(s)`);
    let atualizou = false;

    for (const msg of pendentes) {
      try {
        const phoneDigits = msg.clienteTel.replace(/\D/g, '');
        const phone = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;
        const jid   = phone + '@s.whatsapp.net';

        const todas = await evolutionRequest('POST',
          `/chat/findMessages/${config.evolutionInstance}`,
          { where: { remoteJid: jid }, limit: 50 },
          config
        ).catch(() => null);

        if (!todas) continue;
        let arr = Array.isArray(todas) ? todas : [];
        if (!arr.length) continue;

        // Extrai timestamp numérico do protobuf {low, high} ou número
        const xts2 = t => {
          if (!t) return 0;
          if (typeof t === 'number') return t;
          if (typeof t === 'object') return t.low || t.seconds || 0;
          return parseInt(t) || 0;
        };

        // Ordena por timestamp crescente (mais antigas primeiro)
        arr = arr.sort((a, b) => xts2(a?.messageTimestamp) - xts2(b?.messageTimestamp));

        console.log(`[POLL] ${msg.clienteNome}: ${arr.length} msgs (ordenadas)`);
        arr.forEach((m, i) => {
          console.log(`  [${i}] ${m?.key?.fromMe ? 'NOS' : 'CLI'} ts=${xts2(m?.messageTimestamp)} id=${String(m?.key?.id).slice(-8)} "${xtxt(m).slice(0,40)}"`);
        });

        // Timestamp de quando enviamos a confirmação — só aceita respostas DEPOIS disso
        const tsEnvio = msg.enviadoEmSec || 0;
        console.log(`[POLL] tsEnvio=${tsEnvio} (${new Date(tsEnvio*1000).toISOString()})`);

        // Filtra apenas mensagens APÓS o envio da nossa confirmação
        // E que sejam respostas curtas SIM/NÃO (evita reutilizar respostas antigas)
        const depois = arr.filter(m => {
          const ts  = xts2(m?.messageTimestamp);
          const txt = xtxt(m).trim();

          // Deve ser POSTERIOR ao envio da confirmação
          if (ts <= tsEnvio) return false;

          // Deve ser uma resposta válida (SIM ou NÃO)
          if (!parseRespostaCliente(txt)) return false;

          // Não pode ser mensagem do sistema (texto longo ou palavras-chave do sistema)
          const ehMsgSistema = txt.length > 20 ||
            txt.includes('agendamento') || txt.includes('carinho') ||
            txt.includes('Confirmado')  || txt.includes('Cancelado') ||
            txt.includes('Serviço')     || txt.includes('Horário') ||
            txt.includes('esperamos')   || txt.includes('remarcar');

          if (ehMsgSistema) return false;

          return true;
        });

        console.log(`[POLL] Respostas validas apos tsEnvio: ${depois.length}`);
        depois.forEach(m => console.log(`  -> ts=${xts2(m?.messageTimestamp)} fromMe=${m?.key?.fromMe} txt="${xtxt(m)}"`));
        if (!depois.length) { console.log(`[POLL] Aguardando resposta do cliente...`); continue; }

        let resposta = null;
        for (const m of depois) {
          const txt = xtxt(m);
          if (!txt) continue; // ignora mensagens vazias (reações, áudio, imagem)
          console.log(`[POLL] Candidata: "${txt}" fromMe=${m?.key?.fromMe}`);
          resposta = parseRespostaCliente(txt);
          if (resposta) break;
        }

        if (!resposta) continue;

        console.log(`[POLL] ✅ ${msg.clienteNome} -> ${resposta.toUpperCase()}`);

        const mi = db.wppMensagens.findIndex(w => w.id === msg.id);
        db.wppMensagens[mi].resposta   = resposta;
        db.wppMensagens[mi].respostaEm = new Date().toISOString();
        db.wppMensagens[mi].lida       = false;

        const ai = db.agendamentos.findIndex(a => a.id === msg.agId);
        if (ai >= 0) {
          db.agendamentos[ai].status = resposta === 'sim' ? 'confirmado' : 'cancelado';
          console.log(`[POLL] Ag #${msg.agId} -> ${db.agendamentos[ai].status}`);
        }

        try {
          const nome = msg.clienteNome.split(' ')[0];
          const ag   = db.agendamentos[ai];
          const ret  = resposta === 'sim'
            ? `✅ *Confirmado, ${nome}!*\n\n📅 ${fmtDateServer(ag?.data)} às ${ag?.hora}\n✂️ ${ag?.servicoNome}\n\nTe esperamos! 💛 — *${config.salonName}*`
            : `😔 *Entendido, ${nome}.* Cancelado.\nQuando quiser remarcar, fale conosco! — *${config.salonName}* 💛`;
          await evolutionRequest('POST',
            `/message/sendText/${config.evolutionInstance}`,
            { number: phone, options: { delay: 800 }, textMessage: { text: ret } },
            config
          );
        } catch(e) { console.log(`[POLL] Retorno falhou: ${e.message}`); }

        atualizou = true;
      } catch(e) { console.log(`[POLL] Erro: ${e.message}`); }
    }

    if (atualizou) { await writeDB(db); console.log(`[POLL] Salvo`); }
  } catch(e) { console.log(`[POLL] Critico: ${e.message}`); }
}

function fmtDateServer(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌸 Studio Shelly Rodrigues — Backend rodando!`);
  console.log(`   ► http://localhost:${PORT}`);
  console.log(`   ► Webhook:  http://localhost:${PORT}/api/webhook`);
  console.log(`   ► Status:   http://localhost:${PORT}/api/status`);
  console.log(`   ► Auto-poll ativo: verificando respostas a cada 8s\n`);

  // Inicia polling automático
  setInterval(autoPollRespostas, 8000);
  // Primeira verificação após 3s
  setTimeout(autoPollRespostas, 3000);
});
