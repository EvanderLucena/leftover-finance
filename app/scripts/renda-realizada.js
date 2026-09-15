// Fase: Renda realizada — tabela + helpers
// Renda estimada (config) vira renda REAL quando a AUVP/PDF traz o salário.
const db = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS rendas_realizadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes TEXT NOT NULL,                -- AAAA-MM
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  transacao_id INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mes, descricao)
);
`);
console.log('tabela rendas_realizadas pronta');

// detecta a renda a partir da descrição da transação (AUVP/PDF)
function detectarRenda(descricao) {
  const d = String(descricao || '').toUpperCase();
  if (/REMUNERACAO|REMUNERAÇÃO|SALARIO|SALÁRIO|FOLHA|PROVENTO/.test(d)) {
    return { fonte: 'Salário', tipo: 'salario' };
  }
  try {
    const regra = db.prepare("SELECT categoria, tags FROM regras WHERE ativa=1 AND (categoria='Salário' OR natureza='salario')").all();
    for (const r of regra) {
      if (r.padrao && new RegExp(r.padrao, 'i').test(d)) {
        return { fonte: r.tags || 'Salário', tipo: 'salario' };
      }
    }
  } catch (e) {}
  return null;
}

// grava a renda realizada do mês (upsert) + retorna a soma do mês
function gravarRendaRealizada(mes, descricao, valor, transacaoId) {
  const r = detectarRenda(descricao);
  const nome = r ? r.fonte : descricao.slice(0, 40);
  db.prepare(`INSERT INTO rendas_realizadas (mes, descricao, valor, transacao_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(mes, descricao) DO UPDATE SET valor=excluded.valor, transacao_id=excluded.transacao_id`)
    .run(mes, nome, Math.abs(valor), transacaoId);
  return totalRendaRealizada(mes);
}

function totalRendaRealizada(mes) {
  return db.prepare('SELECT COALESCE(SUM(valor),0) t FROM rendas_realizadas WHERE mes=?').get(mes).t;
}

// renda EFETIVA do mês: realizada se existir; senão estimada (rendas config)
function rendaDoMes(mes, rendaEstimada) {
  const realizada = totalRendaRealizada(mes);
  return realizada > 0 ? realizada : rendaEstimada;
}

module.exports = { gravarRendaRealizada, totalRendaRealizada, rendaDoMes, detectarRenda };