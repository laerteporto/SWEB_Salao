// api/whatsapp/send.js
const { cors, readConfig, evolutionRequest, formatPhone, buildConfirmacaoMsg, getDb } = require('../_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { agId } = req.body;
  if (!agId) return res.status(400).json({ ok: false, error: 'agId obrigatório' });

  const config = await readConfig();
  const db = getDb();

  // Busca agendamento e cliente no Firestore
  const agDoc = await db.collection('agendamentos').doc(String(agId)).get();
  if (!agDoc.exists) return res.status(404).json({ ok: false, error: 'Agendamento não encontrado' });
  const ag = { id: agId, ...agDoc.data() };

  const cliDoc = await db.collection('clientes').doc(String(ag.clienteId)).get();
  if (!cliDoc.exists) return res.status(404).json({ ok: false, error: 'Cliente não encontrado' });
  const cli = cliDoc.data();
  if (!cli.telefone) return res.status(400).json({ ok: false, error: 'Cliente sem telefone cadastrado' });

  const phone = formatPhone(cli.telefone);
  const msg   = buildConfirmacaoMsg(ag, config.salonName);

  try {
    const result = await evolutionRequest('POST',
      `/message/sendText/${config.evolutionInstance}`, {
        number: phone,
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: msg }
      }, config);

    let envioTs = result?.messageTimestamp || Math.floor(Date.now() / 1000) - 60;

    // Atualiza agendamento
    await db.collection('agendamentos').doc(String(agId)).set({
      status: 'aguardando',
      wppEnviado: true,
      wppEnviadoEm: new Date().toISOString()
    }, { merge: true });

    // Registra no inbox wppMensagens
    const wppSnap = await db.collection('wppMensagens').where('agId', '==', agId).get();
    if (wppSnap.empty) {
      const countSnap = await db.collection('wppMensagens').get();
      const newId = countSnap.size + 1;
      await db.collection('wppMensagens').doc(String(newId)).set({
        id: newId, agId,
        clienteId:    cli.id || ag.clienteId,
        clienteNome:  cli.nome,
        clienteTel:   cli.telefone,
        phoneWpp:     phone,
        servico:      ag.servicoNome,
        data:         ag.data,
        hora:         ag.hora,
        enviadoEm:    new Date().toISOString(),
        enviadoEmSec: envioTs,
        resposta:     null,
        respostaEm:   null,
        lida:         false,
        evolutionMsgId: result?.key?.id || null
      });
    } else {
      // Reenviou — atualiza
      const docId = wppSnap.docs[0].id;
      await db.collection('wppMensagens').doc(docId).set({
        enviadoEmSec: envioTs,
        evolutionMsgId: result?.key?.id || null,
        resposta: null,
        respostaEm: null
      }, { merge: true });
    }

    res.json({ ok: true, message: 'Mensagem enviada!', phone });
  } catch(e) {
    console.error('[WPP SEND]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
