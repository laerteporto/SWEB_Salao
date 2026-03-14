// api/config.js
const { cors, readConfig, writeConfig, defaultConfig } = require('./_helpers');

const EVOLUTION_URL_CORRETA = 'https://evolution-api-production-a563.up.railway.app';

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const cfg = await readConfig();
    // Corrige URL errada se apontar para o próprio Vercel
    if (!cfg.evolutionUrl || cfg.evolutionUrl.includes('vercel.app')) {
      cfg.evolutionUrl = EVOLUTION_URL_CORRETA;
    }
    const safe = { ...cfg, evolutionApiKey: cfg.evolutionApiKey ? '****' + cfg.evolutionApiKey.slice(-4) : '' };
    return res.json(safe);
  }

  if (req.method === 'POST') {
    try {
      const current = await readConfig();
      const body = req.body;

      // Corrige URL errada (usuário pode ter colocado a URL do Vercel por engano)
      let evolutionUrl = body.evolutionUrl || current.evolutionUrl || EVOLUTION_URL_CORRETA;
      if (evolutionUrl.includes('vercel.app') || evolutionUrl.includes('sistema-salao')) {
        evolutionUrl = EVOLUTION_URL_CORRETA;
      }
      evolutionUrl = evolutionUrl.replace(/\/$/, ''); // remove barra final

      const updated = {
        ...current,
        ...body,
        evolutionUrl,
      };

      // Se apiKey mascarada ou vazia, mantém a atual
      if (!body.evolutionApiKey || body.evolutionApiKey.startsWith('****')) {
        updated.evolutionApiKey = current.evolutionApiKey || defaultConfig().evolutionApiKey;
      }

      await writeConfig(updated);
      return res.json({ ok: true, message: 'Configuração salva', evolutionUrl });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
