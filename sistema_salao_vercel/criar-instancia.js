// api/whatsapp/criar-instancia.js — Cria ou reconecta uma instância na Evolution API
const { applyCors } = require('../_cors');

const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    // Tenta criar a instância
    const response = await fetch(
      `${EVOLUTION_URL}/instance/create`,
      {
        method:  'POST',
        headers: {
          'apikey':       EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName:     EVOLUTION_INSTANCE,
          integration:      'WHATSAPP-BAILEYS',
          qrcode:           true,
          rejectCall:       false,
          msgCall:          '',
          groupsIgnore:     false,
          alwaysOnline:     false,
          readMessages:     false,
          readStatus:       false,
          syncFullHistory:  false,
        }),
      }
    );

    const data = await response.json();

    if (response.status === 409) {
      // Instância já existe — não é erro
      return res.status(200).json({
        ok:   true,
        hint: 'Instância já existe. Gere o QR Code para conectar.',
        raw:  data,
      });
    }

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: data?.message || 'Erro ao criar instância', raw: data });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('[/api/whatsapp/criar-instancia] Erro:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
