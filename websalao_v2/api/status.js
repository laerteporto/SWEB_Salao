const { applyCors } = require('./_cors');
const EVOLUTION_URL      = process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'shelly';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || 'shelly_apikey_2024';
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_API_KEY }
    });
    clearTimeout(t);
    const data = await r.json();
    const state = data?.instance?.state || data?.state || 'unknown';
    return res.status(200).json({
      ok: true,
      evolution: { connected: state === 'open', state },
      config: { url: EVOLUTION_URL, instance: EVOLUTION_INSTANCE, salonName: 'Studio Shelly Rodrigues' }
    });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      evolution: { connected: false, state: 'unreachable', error: err.message },
      config: { url: EVOLUTION_URL, instance: EVOLUTION_INSTANCE, salonName: 'Studio Shelly Rodrigues' }
    });
  }
};
