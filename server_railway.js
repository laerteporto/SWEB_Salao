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
  try {
    if (!text || typeof text !== "string") return null;
    const n = text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/^(sim|s|yes|confirmo|confirmado|confirmar|confirma|quero|pode|ta|tá|ok|okay|combinado|certo|top|1)$/.test(n)) return "sim";
    if (/^(nao|n|no|nope|cancelar|cancelado|cancela|cancelo|2)$/.test(n)) return "nao";
    return null;
  } catch(e) { return null; }
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
    // Só preserva apiKey se vier mascarada (****) — caso contrário substitui
    if (req.body.evolutionApiKey?.startsWith('****')) {
      updated.evolutionApiKey = current.evolutionApiKey;
    }
    // Força limpeza de URL se vier explicitamente
    if (req.body.evolutionUrl) {
      updated.evolutionUrl = req.body.evolutionUrl.trim().replace(/\/$/, '');
    }
    await writeConfig(updated);
    // Invalida cache em memória forçando releitura
    db_mongo = null;
    mongoClient = null;
    await connectMongo();
    const verify = await readConfig();
    res.json({ ok: true, message: 'Configuração salva', savedUrl: verify.evolutionUrl });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Endpoint de reset forçado de config (emergência)
app.post('/api/config/reset', async (req, res) => {
  try {
    const mdb = await connectMongo();
    if (!mdb) return res.status(500).json({ ok: false, error: 'MongoDB indisponível' });
    const col = mdb.collection('config');
    const newCfg = {
      _id: 'main',
      evolutionUrl:      (req.body.evolutionUrl || '').trim().replace(/\/$/, ''),
      evolutionInstance: req.body.evolutionInstance || 'shelly',
      evolutionApiKey:   req.body.evolutionApiKey   || '',
      webhookSecret:     'shelly2024',
      salonName:         req.body.salonName || 'Studio Shelly Rodrigues',
      salonPhone:        req.body.salonPhone || ''
    };
    await col.deleteOne({ _id: 'main' });
    await col.insertOne(newCfg);
    const { _id, ...saved } = newCfg;
    res.json({ ok: true, message: 'Config resetada com sucesso!', config: { ...saved, evolutionApiKey: '****' + saved.evolutionApiKey.slice(-4) } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
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

    // Captura o timestamp REAL da mensagem enviada — tenta na resposta primeiro
    const xts = t => { if (!t) return 0; if (typeof t === 'number') return t; if (typeof t === 'object') return t.low || t.seconds || 0; return parseInt(t) || 0; };
    let envioTimestampSec = xts(result?.messageTimestamp) || xts(result?.key?.messageTimestamp) || 0;
    let evolutionMsgId    = result?.key?.id || null;

    // Se não veio na resposta, busca a mensagem que acabamos de enviar na Evolution API
    if (!envioTimestampSec || !evolutionMsgId) {
      try {
        await new Promise(r => setTimeout(r, 2000)); // aguarda indexação
        const jid   = phone + '@s.whatsapp.net';
        const sent  = await evolutionRequest('POST', `/chat/findMessages/${config.evolutionInstance}`,
          { where: { remoteJid: jid, fromMe: true }, limit: 5 }, config).catch(() => null);
        const arr   = (Array.isArray(sent) ? sent : []).sort((a,b) => xts(b?.messageTimestamp) - xts(a?.messageTimestamp));
        const latest = arr.find(m => {
          const txt = m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
          return txt.includes(ag.hora) || txt.includes('carinho') || txt.includes('agendamento');
        }) || arr[0];
        if (latest) {
          if (!envioTimestampSec) envioTimestampSec = xts(latest.messageTimestamp);
          if (!evolutionMsgId)    evolutionMsgId    = latest?.key?.id || null;
        }
      } catch(e) { console.log('[SEND] Fallback ts busca falhou:', e.message); }
    }

    // Último fallback: timestamp atual menos 30s (margem segura)
    if (!envioTimestampSec) envioTimestampSec = Math.floor(Date.now() / 1000) - 30;

    console.log(`[SEND] phone=${phone} ts=${envioTimestampSec} msgId=${evolutionMsgId}`);
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
        resposta: null, respostaEm: null, lida: false, evolutionMsgId: evolutionMsgId
      });
    } else {
      const mi = db.wppMensagens.findIndex(m => m.agId === agId);
      if (mi >= 0) {
        db.wppMensagens[mi].enviadoEmSec = envioTimestampSec;
        db.wppMensagens[mi].evolutionMsgId = evolutionMsgId;
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
    const db = await readDB();
    if (!db.wppMensagens) db.wppMensagens = [];
    const senderDigits = senderPhone.replace(/\D/g, '');
    const pendingMsg = db.wppMensagens.find(m => {
      const telDigits = m.clienteTel?.replace(/\D/g, '') || '';
      return m.resposta === null && (telDigits.endsWith(senderDigits) || senderDigits.endsWith(telDigits));
    });

    // Mensagem não reconhecida: orienta o cliente e NÃO derruba a conexão
    if (!resposta) {
      if (pendingMsg && textBody && textBody.trim().length > 0) {
        try {
          const config = await readConfig();
          const nomeOrientacao = pendingMsg.clienteNome.split(' ')[0];
          const msgOrientacao = `Olá, *${nomeOrientacao}*! 😊\n\nNão entendi sua resposta. Para confirmar seu agendamento, responda apenas:\n\n👉 *SIM* — para confirmar\n👉 *NÃO* — para cancelar`;
          await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`, {
            number: remoteJid.replace('@s.whatsapp.net', ''), options: { delay: 600 }, textMessage: { text: msgOrientacao }
          }, config);
          console.log(`[WEBHOOK] Orientação enviada para ${senderPhone}: "${textBody}"`);
        } catch(e) { console.error('[WEBHOOK] Orientação falhou:', e.message); }
      }
      return;
    }

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

    // Extrai o base64 de qualquer formato retornado pela Evolution API
    let qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;

    // Garante que tem o prefixo data:image para o <img src> funcionar
    if (qrcode && !qrcode.startsWith('data:')) {
      qrcode = 'data:image/png;base64,' + qrcode;
    }

    if (!qrcode) {
      // Tenta buscar via fetchInstances como fallback
      const instances = await evolutionRequest('GET', '/instance/fetchInstances', null, config).catch(() => null);
      const inst = Array.isArray(instances) ? instances.find(i => i?.instance?.instanceName === config.evolutionInstance) : null;
      const fallbackQr = inst?.instance?.qrcode?.base64 || inst?.qrcode?.base64 || null;
      if (fallbackQr) qrcode = fallbackQr.startsWith('data:') ? fallbackQr : 'data:image/png;base64,' + fallbackQr;
    }

    res.json({ ok: !!qrcode, qrcode, state: data?.instance?.state || data?.state || null });
  } catch (e) {
    console.error('[QR ERROR]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
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
    const xts  = t => {
      if (!t) return 0;
      if (typeof t === 'number') return t;
      if (typeof t === 'object') return t.low || t.seconds || 0;
      return parseInt(t) || 0;
    };
    let atualizou = false;

    for (const msg of pendentes) {
      try {
        const phoneDigits = msg.clienteTel.replace(/\D/g, '');
        const phone = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;
        const jid   = phone + '@s.whatsapp.net';

        const todas = await evolutionRequest('POST', `/chat/findMessages/${config.evolutionInstance}`,
          { where: { remoteJid: jid }, limit: 50 }, config).catch(() => null);
        if (!todas) continue;

        let arr = (Array.isArray(todas) ? todas : [])
          .sort((a, b) => xts(a?.messageTimestamp) - xts(b?.messageTimestamp));

        if (!arr.length) { console.log(`[POLL] ${msg.clienteNome}: sem msgs no histórico`); continue; }

        // ── Localiza a mensagem de confirmação que enviamos ──────────────────
        let idxNossa = -1;

        // 1. Pelo ID exato salvo no banco
        if (msg.evolutionMsgId) {
          idxNossa = arr.findIndex(m => m?.key?.id === msg.evolutionMsgId && m?.key?.fromMe === true);
        }

        // 2. Pelo timestamp salvo (margem de ±10s para evitar dessincronismo de relógio)
        if (idxNossa < 0 && msg.enviadoEmSec && msg.enviadoEmSec > 0) {
          let best = -1, bestDiff = 999;
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i]?.key?.fromMe !== true) continue;
            const diff = Math.abs(xts(arr[i]?.messageTimestamp) - msg.enviadoEmSec);
            if (diff <= 10 && diff < bestDiff) { best = i; bestDiff = diff; }
          }
          idxNossa = best;
        }

        // 3. Mensagem fromMe que contém a hora do agendamento (ex: "09:00")
        if (idxNossa < 0 && msg.hora) {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i]?.key?.fromMe === true && xtxt(arr[i]).includes(msg.hora)) {
              idxNossa = i; break;
            }
          }
        }

        // 4. Última fromMe com palavras-chave da nossa mensagem de confirmação
        if (idxNossa < 0) {
          const kw = ['agendamento', 'carinho', 'confirmar', 'cancelar', 'SIM', 'NÃO', 'aguardamos'];
          for (let i = arr.length - 1; i >= 0; i--) {
            const txt = xtxt(arr[i]);
            if (arr[i]?.key?.fromMe === true && kw.some(k => txt.includes(k))) {
              idxNossa = i; break;
            }
          }
        }

        // 5. Último fallback: qualquer fromMe mais recente
        if (idxNossa < 0) {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i]?.key?.fromMe === true) { idxNossa = i; break; }
          }
        }

        if (idxNossa < 0) {
          console.log(`[POLL] ${msg.clienteNome}: confirmação não encontrada no histórico (${arr.length} msgs)`);
          continue;
        }

        // Persiste ID real da msg de confirmação para polls futuros (se ainda não tínhamos)
        const msnossaid = arr[idxNossa]?.key?.id;
        if (msnossaid && (!msg.evolutionMsgId || msg.evolutionMsgId !== msnossaid)) {
          const mi2 = db.wppMensagens.findIndex(w => w.id === msg.id);
          if (mi2 >= 0) {
            db.wppMensagens[mi2].evolutionMsgId = msnossaid;
            db.wppMensagens[mi2].enviadoEmSec   = xts(arr[idxNossa].messageTimestamp);
            atualizou = true;
          }
          console.log(`[POLL] ${msg.clienteNome}: ID da confirmação salvo → ${msnossaid}`);
        }

        // ── Busca respostas do CLIENTE após nossa confirmação ────────────────
        // NUNCA aceita fromMe:true — evita auto-confirmação
        const depois = arr.slice(idxNossa + 1).filter(m => m?.key?.fromMe === false);
        console.log(`[POLL] ${msg.clienteNome}: confirmação pos=${idxNossa}, respostas cliente=${depois.length}`);

        // Verifica se há mensagem não reconhecida para orientar o cliente (só a mais recente)
        let ultimaNaoReconhecida = null;
        let resposta = null;
        for (const m of depois) {
          const txt = xtxt(m);
          if (!txt) continue;
          console.log(`[POLL] Candidata: "${txt}"`);
          const r = parseRespostaCliente(txt);
          if (r) { resposta = r; break; }
          else { ultimaNaoReconhecida = txt; } // guarda para orientar
        }
        if (!resposta) {
          // Se há mensagem não reconhecida que ainda não orientamos, envia orientação
          if (ultimaNaoReconhecida) {
            const jaOrientado = msg.ultimaOrientacaoTxt === ultimaNaoReconhecida;
            if (!jaOrientado) {
              try {
                const nomeO = msg.clienteNome.split(' ')[0];
                const msgO = `Olá, *${nomeO}*! 😊\n\nNão entendi sua resposta. Para confirmar seu agendamento, responda apenas:\n\n👉 *SIM* — para confirmar\n👉 *NÃO* — para cancelar`;
                await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`,
                  { number: phone, options: { delay: 600 }, textMessage: { text: msgO } }, config
                ).catch(() => {});
                // Marca para não reenviar a mesma orientação repetidamente
                const mi3 = db.wppMensagens.findIndex(w => w.id === msg.id);
                if (mi3 >= 0) db.wppMensagens[mi3].ultimaOrientacaoTxt = ultimaNaoReconhecida;
                atualizou = true;
                console.log(`[POLL] Orientação enviada para ${msg.clienteNome}: "${ultimaNaoReconhecida}"`);
              } catch(e) { console.log('[POLL] Orientação falhou:', e.message); }
            }
          } else {
            console.log(`[POLL] Aguardando resposta do cliente...`);
          }
          continue;
        }

        console.log(`[POLL] ✅ ${msg.clienteNome} → ${resposta.toUpperCase()}`);

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
          { number: phone, options: { delay: 800 }, textMessage: { text: ret } }, config
        ).catch(e => console.log('[POLL] Retorno falhou:', e.message));

        atualizou = true;
      } catch(e) { console.log('[POLL] Erro:', e.message); }
    }

    if (atualizou) { await writeDB(db); console.log('[POLL] DB salvo'); }
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
