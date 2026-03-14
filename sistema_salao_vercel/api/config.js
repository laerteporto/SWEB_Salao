// api/config.js — Endpoint de configuração (salva configs em runtime)
// Nota: em Serverless Functions, variáveis de ambiente são imutáveis em runtime.
// Esta rota valida e retorna as configurações atuais + dicas para o usuário.
const { applyCors } = require('./_cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      ok:       true,
      instance: process.env.EVOLUTION_INSTANCE || 'shelly',
      url:      process.env.EVOLUTION_URL      || 'https://evolution-api-production-a563.up.railway.app',
    });
  }

  if (req.method === 'POST') {
    // Em Serverless, não podemos salvar variáveis em runtime.
    // Retornamos sucesso com instruções para o usuário.
    return res.status(200).json({
      ok:  true,
      msg: 'Para alterar configurações permanentemente, atualize as variáveis de ambiente no painel do Vercel (Settings → Environment Variables) e faça um novo deploy.',
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
