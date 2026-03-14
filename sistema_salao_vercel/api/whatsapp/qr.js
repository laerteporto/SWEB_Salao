// api/whatsapp/qr.js
const { cors, readConfig, evolutionRequest } = require('../_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const config = await readConfig();

  if (!config.evolutionApiKey) {
    return res.status(500).json({ ok: false, error: 'API Key não configurada. Acesse as Configurações e salve a API Key.' });
  }

  try {
    const data = await evolutionRequest('GET',
      `/instance/connect/${config.evolutionInstance}`, null, config);
    const qrcode = data?.base64 || data?.qrcode?.base64 || data?.code || null;
    if (qrcode) return res.json({ ok: true, qrcode });
    throw new Error('QR Code não retornado pela Evolution API');
  } catch(e) {
    const msg = e.message || '';
    // Instância não existe — cria automaticamente
    if (msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('instance')) {
      try {
        console.log('[QR] Criando instância automaticamente...');
        await evolutionRequest('POST', '/instance/create', {
          instanceName: config.evolutionInstance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        }, config);
        await new Promise(r => setTimeout(r, 1500));
        const data2 = await evolutionRequest('GET',
          `/instance/connect/${config.evolutionInstance}`, null, config);
        const qrcode2 = data2?.base64 || data2?.qrcode?.base64 || data2?.code || null;
        return res.json({ ok: true, qrcode: qrcode2, data: data2 });
      } catch(e2) {
        return res.status(500).json({ ok: false, error: `Erro ao criar instância: ${e2.message}` });
      }
    }
    const friendly = msg.includes('timeout')
      ? 'Evolution API não respondeu. Verifique se o serviço está ativo no Railway.'
      : msg.includes('ECONNREFUSED') ? 'Não foi possível conectar à Evolution API. Verifique a URL.'
      : msg;
    return res.status(500).json({ ok: false, error: friendly });
  }
};
