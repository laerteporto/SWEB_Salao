// api/webhook.js — recebe eventos da Evolution API (SIM/NÃO)
const { cors, readConfig, evolutionRequest, parseRespostaCliente, getDb } = require('./_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.sendStatus ? res.sendStatus(200) : res.status(200).end();

  try {
    const payload = req.body;
    const event = payload?.event || payload?.type || '';
    const isMsg = ['messages.upsert','MESSAGES_UPSERT','message','MESSAGE','messages.received']
      .includes(event) || event.toLowerCase().includes('message');

    if (!isMsg) return;

    const messageData = payload?.data || payload;
    let msg = messageData?.message || messageData?.messages?.[0] || messageData;
    const keyData = msg?.key || messageData?.key;
    if (!keyData || keyData?.fromMe) return;

    const remoteJid = keyData?.remoteJid || '';
    if (!remoteJid || remoteJid.includes('@g.us')) return;

    const senderPhone = remoteJid.replace('@s.whatsapp.net','').replace('@c.us','');
    const msgContent  = msg?.message || messageData?.message || {};
    const textBody    = msgContent?.conversation
      || msgContent?.extendedTextMessage?.text
      || payload?.body || payload?.text || '';

    const resposta = parseRespostaCliente(textBody);
    if (!resposta) return;

    const db = getDb();
    // Busca mensagem pendente para este número
    const senderDigits = senderPhone.replace(/\D/g, '');
    const wppSnap = await db.collection('wppMensagens').where('resposta', '==', null).get();

    let pendingDoc = null;
    wppSnap.forEach(doc => {
      const d = doc.data();
      const tel = (d.clienteTel || '').replace(/\D/g, '');
      if (tel.endsWith(senderDigits) || senderDigits.endsWith(tel) || tel === senderDigits) {
        pendingDoc = { ref: doc.ref, data: d };
      }
    });

    if (!pendingDoc) return;

    // Atualiza wppMensagem
    await pendingDoc.ref.set({
      resposta,
      respostaEm: new Date().toISOString(),
      lida: false
    }, { merge: true });

    // Atualiza agendamento
    const agId = pendingDoc.data.agId;
    await db.collection('agendamentos').doc(String(agId)).set({
      status: resposta === 'sim' ? 'confirmado' : 'cancelado'
    }, { merge: true });

    // Envia mensagem de retorno
    const config = await readConfig();
    const nome = pendingDoc.data.clienteNome.split(' ')[0];
    const agDoc = await db.collection('agendamentos').doc(String(agId)).get();
    const ag = agDoc.data();

    let msgRetorno;
    if (resposta === 'sim') {
      const dia = new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      msgRetorno = `✅ *Confirmado, ${nome}!*\n\n📅 ${dia} às ${ag.hora}\n✂️ ${ag.servicoNome}\n\nTe esperamos! 💛 — *${config.salonName}*`;
    } else {
      msgRetorno = `😔 *Entendido, ${nome}.* Cancelado.\nQuando quiser remarcar, fale conosco! — *${config.salonName}* 💛`;
    }

    await evolutionRequest('POST', `/message/sendText/${config.evolutionInstance}`, {
      number: senderPhone,
      options: { delay: 800, presence: 'composing' },
      textMessage: { text: msgRetorno }
    }, config);

  } catch(e) {
    console.error('[WEBHOOK ERROR]', e.message);
  }
};
