// api/whatsapp/qr.js — Obtém o QR Code para conectar o WhatsApp
const { applyCors } = require('../_cors');

const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const response = await fetch(
      `${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`,
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    // A Evolution API retorna { base64: 'data:image/png;base64,...' } ou { qrcode: { base64: ... } }
    const qrcode =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.qr ||
      null;

    if (!qrcode) {
      return res.status(200).json({
        ok:    false,
        error: 'QR Code não disponível. A instância pode já estar conectada ou a Evolution API está inacessível.',
        raw:   data,
      });
    }

    return res.status(200).json({ ok: true, qrcode });
  } catch (err) {
    console.error('[/api/whatsapp/qr] Erro:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
