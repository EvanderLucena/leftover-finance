// Fonte de cada transação: o que vem da AUVP é 'auvp-mcp' (cartão) ou 'auvp-bank' (conta).
// Bancos antigos podem ter transações importadas de PDF antes da AUVP, com outras fontes; essas ficam
// registradas por conta em contas_bancarias.fontes. Nenhum banco fica escrito no código.
const db = require('../db');

const lerFontes = r => { try { return JSON.parse(r.fontes || '[]'); } catch (e) { return []; } };

// fontes que representam compra no cartão (a fatura é que sai da conta)
function fontesCartao() {
  const set = new Set(['auvp-mcp']);
  for (const r of db.prepare("SELECT fontes FROM contas_bancarias WHERE tipo = 'CREDIT'").all()) lerFontes(r).forEach(f => set.add(f));
  return [...set];
}

// fontes antigas (anteriores à AUVP) de uma conta da AUVP: pelo id; conta antiga sem id, pelo nome e tipo
function fontesAntigasDaConta(contaId, nome, cartao) {
  const r = db.prepare('SELECT fontes FROM contas_bancarias WHERE auvp_conta_id = ?').get(contaId ?? -1)
    || db.prepare('SELECT fontes FROM contas_bancarias WHERE auvp_conta_id IS NULL AND tipo = ? AND LOWER(conta_auvp) = LOWER(?)').get(cartao ? 'CREDIT' : 'BANK', String(nome || ''));
  return r ? lerFontes(r) : [];
}

module.exports = { fontesCartao, fontesAntigasDaConta };
