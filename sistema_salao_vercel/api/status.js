// api/status.js — Verifica status da conexão com a Evolution API
const { applyCors } = require('./_cors');

const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  try {
    // Consulta o status da instância na Evolution API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`,
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const data = await response.json();

    // Evolution API retorna { instance: { state: 'open' | 'close' | 'connecting' } }
    const state     = data?.instance?.state || data?.state || 'unknown';
    const connected = state === 'open';

    return res.status(200).json({
      ok:        true,
      evolution: { connected, state },
      config: {
        url:       EVOLUTION_URL,
        instance:  EVOLUTION_INSTANCE,
        salonName: 'Studio Shelly Rodrigues',
      },
    });
  } catch (err) {
    // Se a Evolution API não responder, retornamos ok:true mas disconnected
    // para que o frontend mostre a interface de configuração (não o erro "Backend não encontrado")
    console.error('[/api/status] Erro ao consultar Evolution API:', err.message);
    return res.status(200).json({
      ok:        true,
      evolution: { connected: false, state: 'unreachable', error: err.message },
      config: {
        url:       EVOLUTION_URL,
        instance:  EVOLUTION_INSTANCE,
        salonName: 'Studio Shelly Rodrigues',
      },
    });
  }
};
