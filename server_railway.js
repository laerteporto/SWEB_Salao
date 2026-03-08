/**
 * Studio Shelly Rodrigues — Backend Railway
 * Banco de dados: MongoDB Atlas (gratuito, persistente)
 * Deploy: Railway.app
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI; // variável de ambiente no Railway

let mongoClient = null;
let db_mongo    = null;

async function connectMongo() {
  if (db_mongo) return db_mongo;
  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    db_mongo = mongoClient.db('shelly_salao');
    console.log('[MONGO] Conectado ao MongoDB Atlas ✓');
    return db_mongo;
  } catch(e) {
    console.error('[MONGO] Falha na conexão:', e.message);
    return null;
  }
}

// ─── DB helpers (MongoDB) ──────────────────────────────────────────────────────
async function readDB() {
  try {
    const mdb = await connectMongo();
    if (!mdb) return defaultDB();
    const col  = mdb.collection('dados');
    const doc  = await col.findOne({ _id: 'main' });
    if (doc) {
      const { _id, ...data } = doc;
      return data;
    }
    return defaultDB();
  } catch(e) {
    console.error('[DB] readDB error:', e.message);
    return defaultDB();
  }
}

async function writeDB(data) {
  try {
    const mdb = await connectMongo();
    if (!mdb) return;
    const col = mdb.collection('dados');
    await col.replaceOne({ _id: 'main' }, { _id: 'main', ...data }, { upsert: true });
  } catch(e) {
    console.error('[DB] writeDB error:', e.message);
  }
}

async function readConfig() {
  try {
    const mdb = await connectMongo();
    if (!mdb) return defaultConfig();
    const col = mdb.collection('config');
    const doc = await col.findOne({ _id: 'main' });
    if (doc) { const { _id, ...cfg } = doc; return cfg; }
    return defaultConfig();
  } catch { return defaultConfig(); }
}

async function writeConfig(cfg) {
  try {
    const mdb = await connectMongo();
    if (!mdb) return;
    const col = mdb.collection('config');
    await col.replaceOne({ _id: 'main' }, { _id: 'main', ...cfg }, { upsert: true });
  } catch(e) {
    console.error('[CONFIG] writeConfig error:', e.message);
  }
}

function defaultDB() {
  return { agendamentos: [], clientes: [], servicos: [], financeiro: [], wppMensagens: [] };
}

function defaultConfig() {
  return {
    evolutionUrl:      process.env.EVOLUTION_URL      || '',
    evolutionInstance: process.env.EVOLUTION_INSTANCE || 'shelly',
    evolutionApiKey:   process.env.EVOLUTION_APIKEY   || '',
    webhookSecret:     'shelly2024',
    salonName:         'Studio Shelly Rodrigues',
    salonPhone:        ''
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
}));

// ─── Evolution API helpers ────────────────────────────────────────────────────
async function evolutionRequest(method, endpoint, body, config) {
  const url = `${config.evolutionUrl.replace(/\/$/, '')}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'apikey': config.evolutionApiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const txt = await res.text();
    if (!res.ok) throw new Error(`Evolution API ${res.status}: ${txt}`);
    try { return JSON.parse(txt); } catch { return { raw: txt }; }
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Evolution API timeout');
    throw e;
  }
}

function formatPhone(telefone) {
  const digits = telefone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 10) return '55' + digits;
  return '55' + digits;
}

function buildConfirmacaoMsg(ag, salonName) {
  const dia = new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const nome = ag.clienteNome.split(' ')[0];
  return `Olá, *${nome}*! 😊\n\nTemos um agendamento confirmado no *${salonName}*:\n\n✂️ *Serviço:* ${ag.servicoNome}\n📅 *Data:* ${dia}\n⏰ *Horário:* ${ag.hora}\n💰 *Valor:* R$ ${Number(ag.valor).toFixed(2).replace('.', ',')}\n\nPara *confirmar* responda:\n👉 *SIM*\n\nPara *cancelar* responda:\n👉 *NÃO*\n\nAguardamos você com muito carinho! 💛✨`;
}

function parseRespostaCliente(text) {
  if (!text) return null;
  const n = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(sim|s|yes|confirmo|confirmado|ok|okay|pode|ta|top|1)$/i.test(n)) return 'sim';
  if (/^(nao|n|no|cancelar|cancelado|cancela|2)$/i.test(n)) return 'nao';
  return null;
}

function extractPhone(remoteJid) {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

function fmtDateServer(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

app.get('/api/config', async (req, res) => {
  const cfg = await readConfig();
  const safe = { ...cfg, evolutionApiKey: cfg.evolutionApiKey ? '****' + cfg.evolutionApiKey.slice(-4) : '' };
  res.json(safe);
});

app.post('/api/config', async (req, res) => {
  try {
    const current = await readConfig();
    const updated = { ...current, ...req.body };
    if (req.body.evolutionApiKey?.startsWith('****')) updated.evolutionApiKey = current.evolutionApiKey;
    await writeConfig(updated);
    res.json({ ok: true, message: 'Configuração salva' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/status', async (req, res) => {
  const config = await readConfig();
  let evolutionStatus = { connected: false, state: 'unknown' };
  try {
    const data = await evolutionRequest('GET', `/instance/connectionState/${config.evolutionInstance}`, null, config);
    evolutionStatus.connected = data?.instance?.state === 'open';
    evolutionStatus.state     = data?.instance?.state || 'unknown';
  } catch (e) { evolutionStatus.error = e.message; }
  res.json({ ok: true, server: 'Studio Shelly Railway v1', timestamp: new Date().toISOString(), evolution: evolutionStatus });
});

app.get('/api/agendamentos', async (req, res) => {
  const db = await readDB();
  res.json({
    ok: true,
    agendamentos: db.agendamentos  || [],
    clientes:     db.clientes      || [],
    servicos:     db.servicos      || [],
    financeiro:   db.financeiro    || [],
    wppMensagens: db.wppMensagens  || [],
    timestamp:    new Date().toISOString()
  });
});

app.post('/api/agendamentos', async (req, res) => {
  try {
    const db = await readDB();
    const { agendamentos, clientes, servicos, financeiro, wppMensagens } = req.body;
    const safe = (novo, atual) => {
      if ((novo?.length || 0) === 0 && (atual?.length || 0) > 0) return atual;
      return novo !== undefined ? novo : atual;
    };
    db.agendamentos = safe(agendamentos, db.agendamentos);
    db.clientes     = safe(clientes,     db.clientes);
    db.servicos     = safe(servicos,     db.servicos);
    db.financeiro   = safe(financeiro,   db.financeiro);
    if (wppMensagens !== undefined) db.wppMensagens = wppMensagens;
    await writeDB(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const db  = await readDB();
    const antes = db.agendamentos.length;
    db.agendamentos = db.agendamentos.filter(a => a.id !== id);
    db.wppMensagens = (db.wppMensagens || []).filter(m => m.agId !== id);
    await writeDB(db);
    console.log(`[DB] Agendamento #${id} excluído (${antes} → ${db.agendamentos.length})`);
    res.json({ ok: true, removidos: antes - db.agendamentos.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/wpp-mensagens', async (req, res) => {
  const db = await readDB();
  res.json({ ok: true, wppMensagens: db.wppMensagens || [] });
});

app.post('/api/whatsapp/send', async (req, res) => {
  const { agId } = req.body;
  if (!agId) return res.status(400).json({ ok: false, error: 'agId obrigatório' });
  const config = await readConfig();
  const db     = await readDB();
  const ag  = db.agendamentos.find(a => a.id === agId);
  if (!ag)  return res.status(404).json({ ok: false, error: 'Agendamento não encontrado' });
  const cli = db.clientes.find(c => c.id === ag.clienteId);
  if (!cli || !cli.telefone) return res.status(400).json({ ok: false, error: 'Cliente sem telefone' });
  const phone = formatPhone(cli.telefone);
  const msg   = buildConfirmacaoMsg(ag, config.salonName);
  try {
    const result = await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`, {
      number: phone, options: { delay: 1200, presence: 'composing' }, textMessage: { text: msg }
    }, config);
    let envioTimestampSec = result?.messageTimestamp || 0;
    if (!envioTimestampSec) envioTimestampSec = Math.floor(Date.now() / 1000) - 60;
    const ai = db.agendamentos.findIndex(a => a.id === agId);
    db.agendamentos[ai].status = 'aguardando';
    db.agendamentos[ai].wppEnviado = true;
    db.agendamentos[ai].wppEnviadoEm = new Date().toISOString();
    if (!db.wppMensagens) db.wppMensagens = [];
    const exists = db.wppMensagens.find(m => m.agId === agId);
    if (!exists) {
      db.wppMensagens.push({
        id: db.wppMensagens.length ? Math.max(...db.wppMensagens.map(m => m.id)) + 1 : 1,
        agId, clienteId: cli.id, clienteNome: cli.nome, clienteTel: cli.telefone,
        phoneWpp: phone, servico: ag.servicoNome, data: ag.data, hora: ag.hora,
        enviadoEm: new Date().toISOString(), enviadoEmSec: envioTimestampSec,
        resposta: null, respostaEm: null, lida: false, evolutionMsgId: result?.key?.id || null
      });
    } else {
      const mi = db.wppMensagens.findIndex(m => m.agId === agId);
      if (mi >= 0) {
        db.wppMensagens[mi].enviadoEmSec = envioTimestampSec;
        db.wppMensagens[mi].evolutionMsgId = result?.key?.id || null;
        db.wppMensagens[mi].resposta = null;
        db.wppMensagens[mi].respostaEm = null;
      }
    }
    await writeDB(db);
    res.json({ ok: true, message: 'Mensagem enviada!', phone });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const payload = req.body;
    const event = payload?.event || payload?.type || '';
    const isMessageEvent = ['messages.upsert','MESSAGES_UPSERT','message','MESSAGE']
      .includes(event) || event.toLowerCase().includes('message');
    if (!isMessageEvent) return;
    const messageData = payload?.data || payload;
    let msg = messageData?.message || messageData?.messages?.[0] || messageData;
    const keyData = msg?.key || messageData?.key;
    if (!keyData || keyData?.fromMe === true) return;
    const remoteJid = keyData?.remoteJid || '';
    if (!remoteJid || remoteJid.includes('@g.us')) return;
    const senderPhone = extractPhone(remoteJid);
    const msgContent = msg?.message || messageData?.message || {};
    const textBody = msgContent?.conversation || msgContent?.extendedTextMessage?.text || '';
    const resposta = parseRespostaCliente(textBody);
    if (!resposta) return;
    const db = await readDB();
    if (!db.wppMensagens) db.wppMensagens = [];
    const senderDigits = senderPhone.replace(/\D/g, '');
    const pendingMsg = db.wppMensagens.find(m => {
      const telDigits = m.clienteTel?.replace(/\D/g, '') || '';
      return m.resposta === null && (telDigits.endsWith(senderDigits) || senderDigits.endsWith(telDigits));
    });
    if (!pendingMsg) return;
    const mi = db.wppMensagens.findIndex(m => m.id === pendingMsg.id);
    db.wppMensagens[mi].resposta   = resposta;
    db.wppMensagens[mi].respostaEm = new Date().toISOString();
    db.wppMensagens[mi].lida       = false;
    const ai = db.agendamentos.findIndex(a => a.id === pendingMsg.agId);
    if (ai >= 0) db.agendamentos[ai].status = resposta === 'sim' ? 'confirmado' : 'cancelado';
    await writeDB(db);
    const config = await readConfig();
    const nome = pendingMsg.clienteNome.split(' ')[0];
    const ag = db.agendamentos[ai];
    const msgRetorno = resposta === 'sim'
      ? `✅ *Confirmado, ${nome}!*\n\n📅 ${fmtDateServer(ag?.data)} às ${ag?.hora}\n✂️ ${ag?.servicoNome}\n\nTe esperamos! 💛 — *${config.salonName}*`
      : `😔 *Entendido, ${nome}.* Cancelado.\nQuando quiser remarcar, fale conosco! — *${config.salonName}* 💛`;
    try {
      await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`, {
        number: remoteJid.replace('@s.whatsapp.net',''), options: { delay: 800 }, textMessage: { text: msgRetorno }
      }, config);
    } catch(e) { console.error('[WEBHOOK] Retorno falhou:', e.message); }
  } catch (e) { console.error('[WEBHOOK ERROR]', e.message); }
});

app.get('/api/whatsapp/qr', async (req, res) => {
  const config = await readConfig();
  try {
    const data = await evolutionRequest('GET', `/instance/connect/${config.evolutionInstance}`, null, config);
    const qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;
    res.json({ ok: true, qrcode, data });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/whatsapp/diagnostico', async (req, res) => {
  const config = await readConfig();
  const db     = await readDB();
  const pendentes = (db.wppMensagens || []).filter(m => m.resposta === null);
  res.json({ pendentes: pendentes.length, config: { instance: config.evolutionInstance, url: config.evolutionUrl } });
});

app.post('/api/whatsapp/criar-instancia', async (req, res) => {
  const config = await readConfig();
  try {
    const data = await evolutionRequest('POST', '/instance/create', {
      instanceName: config.evolutionInstance, qrcode: true, integration: 'WHATSAPP-BAILEYS'
    }, config);
    res.json({ ok: true, data });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// Auto-poll WhatsApp SIM/NÃO
async function autoPollRespostas() {
  try {
    const config = await readConfig();
    if (!config.evolutionUrl || !config.evolutionApiKey) return;
    const db = await readDB();
    if (!db.wppMensagens) return;
    const pendentes = db.wppMensagens.filter(m => m.resposta === null);
    if (!pendentes.length) return;
    const xtxt = m => m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
    const xts  = t => { if (!t) return 0; if (typeof t === 'number') return t; if (typeof t === 'object') return t.low || 0; return parseInt(t) || 0; };
    let atualizou = false;
    for (const msg of pendentes) {
      try {
        const phone = msg.clienteTel.replace(/\D/g,'');
        const jid   = (phone.startsWith('55') ? phone : '55' + phone) + '@s.whatsapp.net';
        const todas = await evolutionRequest('POST', `/chat/findMessages/${config.evolutionInstance}`,
          { where: { key: { remoteJid: jid } }, limit: 50 }, config).catch(() => null);
        if (!todas) continue;
        let arr = (Array.isArray(todas) ? todas : []).sort((a,b) => xts(a?.messageTimestamp) - xts(b?.messageTimestamp));
        if (!arr.length) continue;
        // Acha nossa mensagem de confirmação enviada pelo sistema
        let idxNossa = -1;

        // 1. Pelo ID exato da mensagem salva
        if (msg.evolutionMsgId) {
          idxNossa = arr.findIndex(m => m?.key?.id === msg.evolutionMsgId && m?.key?.fromMe === true);
        }

        // 2. Fallback: mensagem fromMe que contém a hora do agendamento
        if (idxNossa < 0 && msg.hora) {
          for (let i = 0; i < arr.length; i++) {
            if (arr[i]?.key?.fromMe === true && xtxt(arr[i]).includes(msg.hora)) {
              idxNossa = i; break;
            }
          }
        }

        // 3. Fallback: última mensagem fromMe com "agendamento" ou "carinho"
        if (idxNossa < 0) {
          for (let i = arr.length - 1; i >= 0; i--) {
            const txt = xtxt(arr[i]);
            if (arr[i]?.key?.fromMe === true && (txt.includes('agendamento') || txt.includes('carinho'))) {
              idxNossa = i; break;
            }
          }
        }

        if (idxNossa < 0) continue;

        // Pega APENAS mensagens do CLIENTE (fromMe:false) após nossa mensagem
        // NUNCA aceita fromMe:true como resposta — evita auto-confirmação
        const depois = arr.slice(idxNossa + 1).filter(m => m?.key?.fromMe === false);

        console.log(`[POLL] ${msg.clienteNome}: nossa msg pos=${idxNossa}, respostas cliente=${depois.length}`);

        let resposta = null;
        for (const m of depois) {
          const txt = xtxt(m);
          if (!txt) continue;
          console.log(`[POLL] Candidata cliente: "${txt}"`);
          resposta = parseRespostaCliente(txt);
          if (resposta) break;
        }
        if (!resposta) continue;
        const mi = db.wppMensagens.findIndex(w => w.id === msg.id);
        db.wppMensagens[mi].resposta   = resposta;
        db.wppMensagens[mi].respostaEm = new Date().toISOString();
        db.wppMensagens[mi].lida       = false;
        const ai = db.agendamentos.findIndex(a => a.id === msg.agId);
        if (ai >= 0) db.agendamentos[ai].status = resposta === 'sim' ? 'confirmado' : 'cancelado';
        const nome = msg.clienteNome.split(' ')[0];
        const ag   = db.agendamentos[ai];
        const ret  = resposta === 'sim'
          ? `✅ *Confirmado, ${nome}!*\n\n📅 ${fmtDateServer(ag?.data)} às ${ag?.hora}\n✂️ ${ag?.servicoNome}\n\nTe esperamos! 💛 — *${config.salonName}*`
          : `😔 *Entendido, ${nome}.* Cancelado. Fale conosco para remarcar! — *${config.salonName}* 💛`;
        await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`,
          { number: phone.startsWith('55') ? phone : '55'+phone, options: { delay: 800 }, textMessage: { text: ret } }, config
        ).catch(() => {});
        atualizou = true;
      } catch(e) { console.log('[POLL] Erro:', e.message); }
    }
    if (atualizou) await writeDB(db);
  } catch(e) { console.log('[POLL] Crítico:', e.message); }
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`\n🌸 Studio Shelly — Railway rodando na porta ${PORT}`);
  await connectMongo();
  setInterval(autoPollRespostas, 8000);
  setTimeout(autoPollRespostas, 5000);
});
