// api/whatsapp/send.js — Envia mensagem de confirmação via Evolution API
const { applyCors } = require('../_cors');

const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';

// ─── Formata o número para o padrão internacional com DDI 55 ────────────────
function formatPhone(tel) {
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return '55' + digits;
}

// ─── Monta a mensagem de confirmação ────────────────────────────────────────
function buildMsg(ag) {
  const [y, m, d] = ag.data.split('-');
  const dataFmt   = `${d}/${m}/${y}`;
  const nome      = (ag.clienteNome || '').split(' ')[0];
  return (
    `Olá, ${nome}! 😊\n\n` +
    `Você tem um agendamento no *Studio Shelly Rodrigues*:\n\n` +
    `✂️ *Serviço:* ${ag.servicoNome}\n` +
    `📅 *Data:* ${dataFmt}\n` +
    `⏰ *Horário:* ${ag.hora}\n\n` +
    `Para *confirmar* seu agendamento, responda com:\n` +
    `👉 *SIM*\n\n` +
    `Para cancelar, responda *NÃO*.\n\n` +
    `Aguardamos você! 💛`
  );
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { agId, agendamento } = req.body || {};

  // O frontend pode mandar o objeto completo do agendamento ou apenas o agId
  // Aqui esperamos o objeto completo para não precisar de banco de dados nesta função
  const ag = agendamento;

  if (!ag || !ag.clienteTelefone) {
    return res.status(400).json({ ok: false, error: 'Dados do agendamento incompletos ou telefone ausente.' });
  }

  const phone = formatPhone(ag.clienteTelefone);
  const text  = buildMsg(ag);

  try {
    const response = await fetch(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method:  'POST',
        headers: {
          'apikey':       EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number:  phone,
          text,
          options: { delay: 1200 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[/api/whatsapp/send] Erro Evolution:', data);
      return res.status(502).json({ ok: false, error: data?.message || 'Erro na Evolution API', detail: data });
    }

    return res.status(200).json({ ok: true, messageId: data?.key?.id || null });
  } catch (err) {
    console.error('[/api/whatsapp/send] Exceção:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
