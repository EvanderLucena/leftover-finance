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
// descricaoNome: nome específico da fonte (ex: 'Coopersystem', 'Magalu') — se não vier,
// detecta pela descrição; nunca gravar 'Salário' genérico (UNIQUE(mes,descricao) colidiria)
function gravarRendaRealizada(mes, descricao, valor, transacaoId, descricaoNome = null) {
  const r = detectarRenda(descricao);
  const nome = descricaoNome
    || (r && r.fonte !== 'Salário' ? r.fonte : null)
    || ((descricao || '').length <= 40 ? descricao : null)
    || (r ? r.fonte : (descricao || '').slice(0, 40));
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

// STATUS POR FONTE (mês AAAA-MM): cada renda da config é avaliada INDEPENDENTE.
// - existe transação realizada no mês → pendente=0 (o que caiu é o que vale, mesmo
//   se diferir da estimativa — ex: Magalu com empréstimo em folha)
// - não existe → pendente = estimativa da fonte (Cooper estimada por 168h, ajustável)
function statusPorMes(mes) {
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const realizadas = db.prepare('SELECT descricao, valor FROM rendas_realizadas WHERE mes=?').all(mes);
  const achouPorFonte = nomeRenda => {
    // rendas_realizadas.descricao usa o nome da regra (Magalu/Cooper/Salário) — casar flexível
    const alvo = String(nomeRenda || '').toLowerCase();
    return realizadas.find(rv => {
      const d = String(rv.descricao || '').toLowerCase();
      if (d.includes('salário') || d.includes('salario') || d === 'salário') return true;
      if (alvo.includes('coop') && (d.includes('coop') || d.includes('salário') || d.includes('salario'))) return true;
      if (alvo.includes('magalu') || alvo.includes('luiza')) return d.includes('magalu') || d.includes('luiza') || d.includes('salário') || d.includes('salario');
      return d === alvo || d.includes(alvo) || alvo.includes(d);
    });
  };
  return rendas.map(r => {
    const estimada = r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0);
    const real = achouPorFonte(r.nome);
    return {
      id: r.id, nome: r.nome, tipo: r.tipo, dia_pagamento: r.dia_pagamento,
      padrao_texto: r.padrao_texto,
      estimada: Math.round(estimada * 100) / 100,
      realizada: real ? Math.round(real.valor * 100) / 100 : 0,
      transacao_id: real ? 1 : null,
      pendente: real ? 0 : Math.round(estimada * 100) / 100
    };
  });
}

module.exports = { gravarRendaRealizada, totalRendaRealizada, rendaDoMes, detectarRenda, statusPorMes };