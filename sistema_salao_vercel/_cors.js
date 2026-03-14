// api/_cors.js — Helper de CORS compartilhado entre todas as funções

/**
 * Aplica os headers de CORS e responde ao preflight OPTIONS.
 * Retorna true se a requisição foi respondida (preflight), false caso contrário.
 */
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // preflight respondido
  }
  return false;
}

module.exports = { applyCors };
