// Conciliação bancária v2 + motor de aprendizado por confirmação
const db = require('../db');

// tabela de padrões confirmados: "DA REC FED" → sempre é Leão - IRPF
db.exec(`
CREATE TABLE IF NOT EXISTS conciliacoes_confirmadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  padrao_transacao TEXT NOT NULL,
  descricao_lancamento TEXT NOT NULL,
  confirmacoes INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(padrao_transacao)
);
CREATE TABLE IF NOT EXISTS conciliacoes_recusadas (
  transacao_id INTEGER PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// extrai "assinatura" da descrição: primeiras palavras significativas em maiúsculas
function padraoDe(descricao) {
  return descricao.toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^\d+$/.test(w))
    .slice(0, 3)
    .join(' ');
}

// busca padrão confirmado para a transação
function padraoConfirmado(descricao) {
  const p = padraoDe(descricao);
  if (!p) return null;
  // match exato ou por prefixo
  const exato = db.prepare('SELECT * FROM conciliacoes_confirmadas WHERE padrao_transacao = ?').get(p);
  if (exato) return exato;
  const prefixos = db.prepare('SELECT * FROM conciliacoes_confirmadas').all();
  for (const c of prefixos) {
    if (p.startsWith(c.padrao_transacao) || c.padrao_transacao.startsWith(p)) return c;
  }
  return null;
}

// motor principal: cruza transações dos últimos N dias com lançamentos em aberto
function conciliar(diasJanela = 45) {
  const TOL_VALOR = 0.12;   // 12% de tolerância de valor
  const DIA_TOL = 7;        // ±7 dias de vencimento

  const txs = db.prepare(`
    SELECT * FROM transacoes
    WHERE natureza='gasto' AND valor < 0
    AND data >= date('now', '-' || ? || ' days')
    AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)
    ORDER BY data DESC`).all(String(diasJanela));

  const previstos = db.prepare(`
    SELECT l.*, m.ref mes_ref, c.nome categoria_nome, r.id rec_id
    FROM lancamentos l
    JOIN meses m ON m.id = l.mes_id
    LEFT JOIN categorias c ON c.id = l.categoria_id
    LEFT JOIN recorrencias r ON r.id = l.recorrencia_id
    WHERE l.pago = 0 ORDER BY l.vencimento`).all();

  const regras = db.prepare('SELECT * FROM regras WHERE ativa=1 ORDER BY prioridade').all();
  const fmt2 = v => 'R$ ' + Math.abs(v).toFixed(2);

  const sugestoes = [];
  const usadosTx = new Set();
  const usadosLanc = new Set();

  for (const t of txs) {
    if (usadosTx.has(t.id)) continue;
    const tVal = Math.abs(t.valor);

    // 1) histórico de confirmação tem prioridade máxima
    const conf = padraoConfirmado(t.descricao);
    if (conf) {
      // acha lançamento em aberto com descrição parecida com a confirmada
      const alvo = previstos.find(p =>
        !usadosLanc.has(p.id) &&
        p.descricao.toLowerCase().includes(conf.descricao_lancamento.toLowerCase().slice(0, 12))
      );
      if (alvo) {
        const difVal = Math.abs(tVal - Math.abs(alvo.valor));
        const difData = Math.abs((new Date(t.data) - new Date(alvo.vencimento)) / 86400000);
        if (difVal <= Math.max(Math.abs(alvo.valor) * 0.2, 25) && difData <= 10) {
          sugestoes.push({
            transacao_id: t.id, lancamento_id: alvo.id,
            transacao: t.descricao.slice(0, 30) + ' · ' + t.data + ' · ' + fmt2(t.valor),
            previsto: alvo.descricao + ' ' + (alvo.parcela || '') + ' (venc ' + alvo.vencimento + ')',
            previstoValorPrevisto: fmt2(alvo.valor),
            transacaoValorReal: fmt2(t.valor),
            difVal: +difVal.toFixed(2), difData: Math.round(difData),
            fonte: 'historico', score: 0
          });
          usadosTx.add(t.id); usadosLanc.add(alvo.id);
          continue;
        }
      }
    }

    // 2) matching por valor + data + regra semântica
    //    - regra semântica com valor tolerante (caso "SABESP → Casa")
    //    - VALOR EXATO (±0,05) + data próxima = match forte mesmo sem regra
    //      (PIX genérico "Pix para ITAU UNIBANCO" paga o Pilates de 250 — não há
    //       regra que descreva isso, mas valor idêntico + 1d do venc é confiança alta)
    let melhor = null;
    for (const p of previstos) {
      if (usadosLanc.has(p.id)) continue;
      const difVal = Math.abs(tVal - Math.abs(p.valor));
      const tolVal = Math.max(Math.abs(p.valor) * TOL_VALOR, 15);
      if (difVal > tolVal) continue;
      const difData = Math.abs((new Date(t.data) - new Date(p.vencimento)) / 86400000);
      if (difData > DIA_TOL) continue;
      const catLanc = (p.categoria_nome || '').toLowerCase();
      let semantica = false;
      for (const r of regras) {
        try { if (!new RegExp(r.padrao, 'i').test(t.descricao)) continue; } catch (e) { continue; }
        if (r.categoria && catLanc && r.categoria.toLowerCase() === catLanc.toLowerCase()) { semantica = true; break; }
      }
      const valorExato = difVal <= 0.05;
      if (!semantica && !valorExato) continue;
      const score = difVal + difData * 5 + (semantica ? 0 : 8); // sem semântica pega leve penalidade
      if (!melhor || score < melhor.score) melhor = { t, p, difVal, difData, score };
    }
      if (melhor) {
        sugestoes.push({
          transacao_id: t.id, lancamento_id: melhor.p.id,
          transacao: melhor.t.descricao.slice(0, 30) + ' · ' + melhor.t.data + ' · ' + fmt2(melhor.t.valor),
          previsto: melhor.p.descricao + ' ' + (melhor.p.parcela || '') + ' (venc ' + melhor.p.vencimento + ')',
          previstoValorPrevisto: fmt2(melhor.p.valor),
          transacaoValorReal: fmt2(melhor.t.valor),
          difVal: +melhor.difVal.toFixed(2), difData: Math.round(melhor.difData),
          fonte: 'regra', score: melhor.score
        });
        usadosTx.add(t.id); usadosLanc.add(melhor.p.id);
      }
  }

  // vencidos sem pagamento
  const hojeStr = new Date().toISOString().slice(0, 10);
  const idsComSug = new Set(sugestoes.map(s => s.lancamento_id));
  const vencidos_sem_pagamento = previstos
    .filter(p => p.vencimento < hojeStr && !idsComSug.has(p.id))
    .map(p => ({ lancamento_id: p.id, descricao: p.descricao, parcela: p.parcela, valor: p.valor, vencimento: p.vencimento }));

  // avulsos (sem match)
  const idsTxUsados = new Set(sugestoes.map(s => s.transacao_id));
  const avulsos = txs.filter(t => !idsTxUsados.has(t.id)).slice(0, 40);

  return { sugestoes, vencidos_sem_pagamento, avulsos };
}

// confirmar: aprende o padrão + marca pago + avança parcela
function confirmar({ lancamento_id, transacao_id, recusar }) {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(lancamento_id);
  if (!l) return { erro: 'lançamento não encontrado' };

  if (recusar) {
    // recusou a sugestão: PERSISTE a recusa — nunca mais sugere esse par
    if (transacao_id) {
      db.prepare('INSERT OR IGNORE INTO conciliacoes_recusadas (transacao_id) VALUES (?)').run(transacao_id);
    }
    return { ok: true, recusado: true };
  }

  const t = transacao_id ? db.prepare('SELECT * FROM transacoes WHERE id=?').get(transacao_id) : null;

  // aprende: associação padrão-transação → descrição lançamento
  if (t) {
    const padrao = padraoDe(t.descricao);
    if (padrao) {
      const existente = db.prepare('SELECT * FROM conciliacoes_confirmadas WHERE padrao_transacao=?').get(padrao);
      if (existente) {
        db.prepare('UPDATE conciliacoes_confirmadas SET confirmacoes=confirmacoes+1, descricao_lancamento=? WHERE id=?')
          .run(l.descricao, existente.id);
      } else {
        db.prepare('INSERT INTO conciliacoes_confirmadas (padrao_transacao, descricao_lancamento) VALUES (?, ?)')
          .run(padrao, l.descricao);
      }
    }
  }

  // marca pago com data real + vínculo estrutural (pago ⟺ transação)
  const dataPago = t ? t.data : new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=? WHERE id=?').run(dataPago, t ? t.id : null, l.id);

  // valor REAL pago ≠ previsto (ex: parcela do apto prevista 560, paga 555,09):
  // o lançamento é estimativa; a transação é a verdade. Atualiza o valor da conta.
  // lançamento é SEMPRE positivo (valor a pagar) — convenção negativa é só do extrato
  if (t && Math.abs(Math.abs(t.valor) - Math.abs(l.valor)) > 0.01) {
    db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(Math.abs(t.valor), l.id);
  }

// avança parcela da recorrência
  if (l.recorrencia_id && l.parcela) {
    const m = l.parcela.match(/(\d+)\/(\d+)/);
    if (m) {
      const atual = parseInt(m[1]), total = parseInt(m[2]);
      if (atual >= 1 && atual <= total) {
        db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(atual, l.recorrencia_id);
      }
    }
  }
  return { ok: true, aprendeu: !!t };
}

// Auto-conciliação automática de lançamentos usando padrão de busca e regras
function autoConciliarMes(mesRef) {
  let refNorm = mesRef;
  if (mesRef && /^\d{4}-\d{2}$/.test(mesRef)) {
    const [y, m] = mesRef.split('-');
    refNorm = `${m}-${y}`;
  }
  const mes = refNorm ? db.prepare('SELECT id, ref FROM meses WHERE ref=?').get(refNorm) : null;
  if (mesRef && !mes) {
    return { ok: true, conciliados: 0, detalhes: [] };
  }
  let sql = `
    SELECT l.*, r.padrao_busca, m.ref mes_ref
    FROM lancamentos l
    JOIN meses m ON m.id = l.mes_id
    LEFT JOIN recorrencias r ON r.id = l.recorrencia_id
  `;
  const params = [];
  if (mes) {
    sql += ' WHERE l.mes_id = ?';
    params.push(mes.id);
  }
  sql += ' ORDER BY l.vencimento';
  const lancs = db.prepare(sql).all(...params);

  const updLanc = db.prepare(`
    UPDATE lancamentos
    SET pago = 1, pago_em = ?, transacao_id = ?, valor = ?
    WHERE id = ?
  `);

  let conciliados = 0;
  const usadosTx = new Set(
    db.prepare('SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL').all()
      .map(r => r.transacao_id)
      .filter(id => !!db.prepare('SELECT id FROM transacoes WHERE id=?').get(id))
  );

  const detalhes = [];

  for (const l of lancs) {
    if (l.transacao_id && db.prepare('SELECT id FROM transacoes WHERE id=?').get(l.transacao_id)) {
      continue;
    }

    const lVal = Math.abs(l.valor);
    const termos = [];
    if (l.padrao_busca) {
      l.padrao_busca.split('|').forEach(t => termos.push(t.trim().toUpperCase()));
    }
    const palavras = l.descricao.toUpperCase().replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(w => w.length >= 4);
    termos.push(...palavras);

    const txs = db.prepare(`
      SELECT id, data, valor, descricao FROM transacoes
      WHERE natureza='gasto' AND valor < 0
      AND data >= date(?, '-25 days') AND data <= date(?, '+25 days')
      ORDER BY ABS(ABS(valor) - ?) ASC, data DESC
    `).all(l.vencimento, l.vencimento, lVal);

    for (const t of txs) {
      if (usadosTx.has(t.id)) continue;
      const tVal = Math.abs(t.valor);
      const difVal = Math.abs(tVal - lVal);
      const difDays = Math.abs((new Date(t.data) - new Date(l.vencimento)) / 86400000);
      const tUpper = t.descricao.toUpperCase();

      const matchTermo = termos.some(termo => termo && tUpper.includes(termo));
      const conf = padraoConfirmado(t.descricao);
      const matchConf = conf && conf.descricao_lancamento?.toLowerCase().slice(0, 8) === l.descricao.toLowerCase().slice(0, 8);

      // Auto-conciliação autônoma exige confirmação semântica (padrao_busca, termo na descrição ou padrão confirmado)
      if ((matchTermo || matchConf) && difVal <= Math.max(lVal * 0.15, 25)) {
        usadosTx.add(t.id);
        conciliados++;
        updLanc.run(t.data, t.id, tVal, l.id);
        detalhes.push({
          lancamento_id: l.id,
          descricao: l.descricao,
          vencimento: l.vencimento,
          transacao_id: t.id,
          transacao_desc: t.descricao,
          transacao_data: t.data,
          valor: tVal
        });
        break;
      }
    }
  }
  return { ok: true, conciliados, detalhes };
}

module.exports = { conciliar, confirmar, padraoDe, padraoConfirmado, autoConciliarMes };