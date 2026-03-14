const { applyCors } = require('../_cors');
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';
function fmt(tel) { const d = tel.replace(/\D/g,''); return d.startsWith('55')?d:'55'+d; }
function buildMsg(ag) {
  const [y,m,d] = ag.data.split('-');
  const nome = (ag.clienteNome||'').split(' ')[0];
  return `Olá, ${nome}! 😊\n\nVocê tem um agendamento no *Studio Shelly Rodrigues*:\n\n✂️ *Serviço:* ${ag.servicoNome}\n📅 *Data:* ${d}/${m}/${y}\n⏰ *Horário:* ${ag.hora}\n\nPara *confirmar*, responda: 👉 *SIM*\nPara cancelar, responda: *NÃO*\n\nAguardamos você! 💛`;
}
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { agendamento } = req.body || {};
  if (!agendamento?.clienteTelefone) return res.status(400).json({ ok: false, error: 'Telefone ausente' });
  try {
    const r = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: fmt(agendamento.clienteTelefone), text: buildMsg(agendamento), options: { delay: 1200 } })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: data?.message || 'Erro Evolution API' });
    return res.status(200).json({ ok: true, messageId: data?.key?.id || null });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
};
