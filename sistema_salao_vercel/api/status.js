// api/status.js
const { cors, readConfig, evolutionRequest } = require('./_helpers');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const config = await readConfig();
  let evolutionStatus = { connected: false, state: 'unknown' };

  try {
    const data = await evolutionRequest('GET',
      `/instance/connectionState/${config.evolutionInstance}`, null, config);
    evolutionStatus.connected = data?.instance?.state === 'open';
    evolutionStatus.state     = data?.instance?.state || 'unknown';
  } catch(e) {
    evolutionStatus.error = e.message;
  }

  res.json({
    ok: true,
    server: 'Studio Shelly v2 (Vercel)',
    timestamp: new Date().toISOString(),
    evolution: evolutionStatus,
    config: {
      instance: config.evolutionInstance,
      url:      config.evolutionUrl,
      hasApiKey: !!config.evolutionApiKey,
      salonName: config.salonName
    }
  });
};
