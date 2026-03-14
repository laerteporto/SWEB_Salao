// api/_helpers.js — compartilhado entre todas as funções serverless
const fetch = require('node-fetch');

// ─── Firebase Admin ───────────────────────────────────────────────────────────
let _db = null;
function getDb() {
  if (_db) return _db;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
  }
  _db = admin.firestore();
  return _db;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────
async function readCollection(col) {
  const db = getDb();
  const snap = await db.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function writeDoc(col, id, data) {
  const db = getDb();
  await db.collection(col).doc(String(id)).set(data, { merge: true });
}

async function deleteDoc(col, id) {
  const db = getDb();
  await db.collection(col).doc(String(id)).delete();
}

async function readConfig() {
  try {
    const db = getDb();
    const doc = await db.collection('config').doc('main').get();
    if (doc.exists) return doc.data();
  } catch(e) {}
  return defaultConfig();
}

async function writeConfig(cfg) {
  const db = getDb();
  await db.collection('config').doc('main').set(cfg);
}

function defaultConfig() {
  return {
    evolutionUrl:      process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app',
    evolutionInstance: process.env.EVOLUTION_INSTANCE || 'shelly',
    evolutionApiKey:   process.env.EVOLUTION_API_KEY  || '',
    salonName:         'Studio Shelly Rodrigues',
    salonPhone:        ''
  };
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Evolution API ────────────────────────────────────────────────────────────
async function evolutionRequest(method, endpoint, body, config) {
  const url = `${config.evolutionUrl.replace(/\/$/, '')}${endpoint}`;
  console.log(`[EVOLUTION] ${method} ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

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
    console.log(`[EVOLUTION] ${res.status}:`, txt.slice(0, 300));
    if (!res.ok) throw new Error(`Evolution API ${res.status}: ${txt}`);
    try { return JSON.parse(txt); } catch { return { raw: txt }; }
  } catch(e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('Evolution API timeout — verifique se está ativa no Railway.');
    throw e;
  }
}

function formatPhone(tel) {
  const d = tel.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 11) return '55' + d;
  if (d.length === 10) return '55' + d;
  return '55' + d;
}

function buildConfirmacaoMsg(ag, salonName) {
  const dia = new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const nome = ag.clienteNome.split(' ')[0];
  return `Olá, *${nome}*! 😊\n\nTemos um agendamento confirmado no *${salonName}*:\n\n✂️ *Serviço:* ${ag.servicoNome}\n📅 *Data:* ${dia}\n⏰ *Horário:* ${ag.hora}\n💰 *Valor:* R$ ${Number(ag.valor).toFixed(2).replace('.', ',')}\n\nPara *confirmar* seu agendamento responda:\n👉 *SIM*\n\nPara *cancelar* responda:\n👉 *NÃO*\n\nAguardamos você com muito carinho! 💛✨`;
}

function parseRespostaCliente(text) {
  if (!text) return null;
  const n = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(sim|s|yes|confirmo|confirmado|ok|okay|pode|ta|top|1)$/i.test(n)) return 'sim';
  if (/^(nao|n|no|nope|cancelar|cancelado|cancela|2)$/i.test(n)) return 'nao';
  return null;
}

module.exports = {
  getDb, readCollection, writeDoc, deleteDoc,
  readConfig, writeConfig, defaultConfig,
  cors, evolutionRequest, formatPhone,
  buildConfirmacaoMsg, parseRespostaCliente
};
