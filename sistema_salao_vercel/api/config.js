// api/config.js
const { cors, readConfig, writeConfig } = require('./_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const cfg = await readConfig();
    const safe = { ...cfg, evolutionApiKey: cfg.evolutionApiKey ? '****' + cfg.evolutionApiKey.slice(-4) : '' };
    return res.json(safe);
  }

  if (req.method === 'POST') {
    try {
      const current = await readConfig();
      const updated = { ...current, ...req.body };
      // Se apiKey mascarada, mantém a atual
      if (req.body.evolutionApiKey && req.body.evolutionApiKey.startsWith('****')) {
        updated.evolutionApiKey = current.evolutionApiKey;
      }
      // Se veio vazio, mantém a atual
      if (!req.body.evolutionApiKey) {
        updated.evolutionApiKey = current.evolutionApiKey;
      }
      await writeConfig(updated);
      return res.json({ ok: true, message: 'Configuração salva' });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
