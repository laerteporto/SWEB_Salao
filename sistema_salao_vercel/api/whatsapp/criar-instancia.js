// api/whatsapp/criar-instancia.js
const { cors, readConfig, evolutionRequest } = require('../_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const config = await readConfig();
  try {
    const data = await evolutionRequest('POST', '/instance/create', {
      instanceName: config.evolutionInstance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    }, config);
    res.json({ ok: true, data });
  } catch(e) {
    res.json({ ok: false, error: e.message, hint: 'A instância pode já existir, tente gerar o QR Code.' });
  }
};
