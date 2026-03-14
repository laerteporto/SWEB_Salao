const { applyCors } = require('./_cors');
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({
    ok: true,
    instance: process.env.EVOLUTION_INSTANCE || 'shelly',
    url: process.env.EVOLUTION_URL || ''
  });
  if (req.method === 'POST') return res.status(200).json({ ok: true });
  return res.status(405).json({ ok: false });
};
