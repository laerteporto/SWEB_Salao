const { applyCors } = require('../_cors');
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const r = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName: EVOLUTION_INSTANCE, integration: 'WHATSAPP-BAILEYS', qrcode: true })
    });
    const data = await r.json();
    if (r.status === 409) return res.status(200).json({ ok: true, hint: 'Instância já existe. Gere o QR Code.' });
    if (!r.ok) return res.status(502).json({ ok: false, error: data?.message || 'Erro ao criar instância' });
    return res.status(200).json({ ok: true, data });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
};
