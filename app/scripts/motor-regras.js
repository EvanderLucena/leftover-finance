// Motor de regras: aplica categorias/tags/natureza às transações
const db = require('../db');

function aplicarRegras(transacoes) {
  const regras = db.prepare('SELECT * FROM regras WHERE ativa=1 ORDER BY prioridade ASC').all();
  const out = [];
  for (const t of transacoes) {
    let tx = { ...t };
    for (const r of regras) {
      const re = new RegExp(r.padrao, 'i');
      if (!re.test(t.descricao)) continue;
      if (r.categoria) tx.categoria = r.categoria;
      if (r.natureza) tx.natureza = r.natureza;
      break; // primeira regra que casa vence (prioridade)
    }
    // heurísticas default se nada bateu
    if (!tx.natureza) {
      if (tx.valor > 0) tx.natureza = 'entrada';
      else if (/pagamento.*fatura|pag.*recebido.*fatura|liquidacao/i.test(tx.descricao)) tx.natureza = 'transferencia';
      else tx.natureza = 'gasto';
    }
    out.push(tx);
  }
  return out;
}

// Assinaturas e tags foram descontinuadas
function detectarAssinaturas() { return 0; }
function vincularAssinaturas() { return 0; }

module.exports = { aplicarRegras, detectarAssinaturas, vincularAssinaturas };