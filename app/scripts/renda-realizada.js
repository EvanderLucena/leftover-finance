// Renda lançada à mão (o dinheiro caiu e a AUVP ainda não trouxe): registro por mês e por renda.
// A renda de cada mês que as telas mostram vem de core/comprometido.js (rendaDoMes), pelas rendas cadastradas em Configurar.
const db = require('../db');

// grava a renda realizada do mês (upsert pelo nome da renda) e devolve a soma do mês
function gravarRendaRealizada(mes, valor, transacaoId, nome) {
  db.prepare(`INSERT INTO rendas_realizadas (mes, descricao, valor, transacao_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(mes, descricao) DO UPDATE SET valor=excluded.valor, transacao_id=excluded.transacao_id`)
    .run(mes, nome, Math.abs(valor), transacaoId);
  return totalRendaRealizada(mes);
}

function totalRendaRealizada(mes) {
  return db.prepare('SELECT COALESCE(SUM(valor),0) t FROM rendas_realizadas WHERE mes=?').get(mes).t;
}

module.exports = { gravarRendaRealizada, totalRendaRealizada };
