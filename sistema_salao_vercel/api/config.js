const { applyCors } = require('./_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({ ok: true, instance: process.env.EVOLUTION_INSTANCE || 'shelly', url: process.env.EVOLUTION_URL || 'https://evolution-api-production-a563.up.railway.app' });
  if (req.method === 'POST') return res.status(200).json({ ok: true, msg: 'Atualize as variáveis no painel Vercel e faça novo deploy.' });
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
