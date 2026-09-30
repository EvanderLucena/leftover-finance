// Motor de Faturas Abertas (Previsão de Cartão em Tempo Real - Multi-Banco Dinâmico)
// Itera dinamicamente sobre todas as contas cadastradas do tipo CREDIT
const db = require('../db');

function obterFaturasAbertas(dataReferencia = null) {
  let aY, aM, aD;
  if (dataReferencia) {
    if (typeof dataReferencia === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataReferencia)) {
      const parts = dataReferencia.slice(0, 10).split('-').map(Number);
      aY = parts[0]; aM = parts[1]; aD = parts[2];
    } else {
      const d = new Date(dataReferencia);
      aY = d.getFullYear(); aM = d.getMonth() + 1; aD = d.getDate();
    }
  } else {
    const agora = new Date();
    aY = agora.getFullYear(); aM = agora.getMonth() + 1; aD = agora.getDate();
  }

  // Próximo mês de vencimento da fatura aberta (M+1)
  const mi = aM;
  const proximoAno = aY + Math.floor(mi / 12);
  const proximoMesNum = (mi % 12) + 1;
  const proximoMesRef = `${String(proximoMesNum).padStart(2, '0')}-${proximoAno}`; // ex: '10-2026'
  const vencAnoMes = `${proximoAno}-${String(proximoMesNum).padStart(2, '0')}`; // ex: '2026-10'

  const anoAnt = (aM === 1) ? aY - 1 : aY;
  const mesAnt = (aM === 1) ? 12 : aM - 1;

  // Lê todos os cartões de crédito ativos da tabela dinâmica
  const cartoesDB = db.prepare("SELECT * FROM contas_bancarias WHERE tipo='CREDIT' AND ativo=1").all();
  const cartoesCalculados = [];
  let totalConsolidado = 0;

  for (const c of cartoesDB) {
    const diaFech = c.dia_fechamento || 25;
    const diaVenc = c.dia_vencimento || 5;

    const dataCorteAnt = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(diaFech + 1).padStart(2, '0')}`;
    const dataCorteFim = `${aY}-${String(aM).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`;
    const dataVencimento = `${proximoAno}-${String(proximoMesNum).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;

    let parcAgendadas = 0;
    let comprasCiclo = 0;
    let transicao = 0;

    if (c.instituicao === 'nubank') {
      parcAgendadas = db.prepare(`
        SELECT COALESCE(SUM(c.valor_parcela), 0) as tot
        FROM parcelas p
        JOIN compras c ON p.compra_id = c.id
        WHERE p.vencimento = ? AND c.cancelada = 0 AND p.status != 'cancelada'
          AND (lower(c.fonte_origem) LIKE '%nubank%' OR lower(c.estabelecimento) IN ('litevivoeasyanual', 'shogun'))
          AND c.id NOT IN (SELECT compra_id FROM parcelas WHERE n=1 AND vencimento = ?)
      `).get(vencAnoMes, vencAnoMes).tot;

      comprasCiclo = db.prepare(`
        SELECT COALESCE(SUM(ABS(valor)), 0) as tot
        FROM transacoes
        WHERE lower(conta) = 'gold' AND fonte = 'auvp-mcp'
          AND data >= ? AND data <= ?
          AND natureza = 'gasto'
          AND (parcela IS NULL OR parcela LIKE '1/%')
      `).get(dataCorteAnt, dataCorteFim).tot;

    } else if (c.instituicao === 'mercadopago') {
      // FIX 30/09/2026: compra cancelada (#251, ML 15x246,20 estornada) estava somando 246,20
      // na fatura de out — agora filtra cancelada em compra E parcela (c.cancelada=0, p.status!='cancelada')
      parcAgendadas = db.prepare(`
        SELECT COALESCE(SUM(c.valor_parcela), 0) as tot
        FROM parcelas p
        JOIN compras c ON p.compra_id = c.id
        WHERE p.vencimento = ? AND c.cancelada = 0 AND p.status != 'cancelada'
          AND (lower(c.fonte_origem) LIKE '%mercado%' OR lower(c.estabelecimento) LIKE '%mercado%')
          AND c.id NOT IN (SELECT compra_id FROM parcelas WHERE n=1 AND vencimento = ?)
      `).get(vencAnoMes, vencAnoMes).tot;

      const dataCorteAntMP = `${anoAnt}-${String(mesAnt).padStart(2, '0')}-29`;
      const dataCorteFimMP = `${aY}-${String(aM).padStart(2, '0')}-29`;
      comprasCiclo = db.prepare(`
        SELECT COALESCE(SUM(ABS(valor)), 0) as tot
        FROM transacoes
        WHERE lower(conta) = 'mercado pago' AND fonte = 'auvp-mcp'
          AND (
            (data >= ? AND (descricao LIKE '%MERCADOLIVRE*MERCADOLIVRE%' OR descricao LIKE '%MERCADOLIVRE*MERC%'))
            OR data > ?
          )
          AND data <= ?
          AND natureza = 'gasto'
          AND natureza != 'ignorado'
          AND (parcela IS NULL OR parcela LIKE '1/%')
      `).get(dataCorteAntMP, dataCorteAntMP, dataCorteFimMP).tot;

    } else if (c.instituicao === 'itau') {
      parcAgendadas = db.prepare(`
        SELECT COALESCE(SUM(c.valor_parcela), 0) as tot
        FROM parcelas p
        JOIN compras c ON p.compra_id = c.id
        WHERE p.vencimento = ? AND c.cancelada = 0 AND p.status != 'cancelada'
          AND (lower(c.fonte_origem) LIKE '%itau%' OR lower(c.estabelecimento) LIKE '%foton%')
          AND c.id NOT IN (SELECT compra_id FROM parcelas WHERE n=1 AND vencimento = ?)
      `).get(vencAnoMes, vencAnoMes).tot;

      comprasCiclo = db.prepare(`
        SELECT COALESCE(SUM(ABS(valor)), 0) as tot
        FROM transacoes
        WHERE (lower(conta) LIKE '%signature%' OR (fonte = 'itau-fatura' AND importacao_id IS NULL))
          AND data >= ? AND data <= ?
          AND natureza = 'gasto'
          AND natureza != 'ignorado'
          AND (parcela IS NULL OR parcela LIKE '1/%')
      `).get(dataCorteAnt, dataCorteFim).tot;

      if (proximoMesRef === '10-2026') {
        const cfgTrans = db.prepare("SELECT valor FROM config WHERE chave='itau_transicao_cartao'").get();
        transicao = cfgTrans ? parseFloat(cfgTrans.valor) : 568.25;
      }
    } else {
      // Cartão genérico descoberto via Open Finance (ex: BTG Black, C6, Santander, etc.)
      const termoBusca = c.instituicao || c.id;
      parcAgendadas = db.prepare(`
        SELECT COALESCE(SUM(c.valor_parcela), 0) as tot
        FROM parcelas p
        JOIN compras c ON p.compra_id = c.id
        WHERE p.vencimento = ? AND c.cancelada = 0 AND p.status != 'cancelada'
          AND (lower(c.fonte_origem) LIKE ? OR lower(c.estabelecimento) LIKE ?)
          AND c.id NOT IN (SELECT compra_id FROM parcelas WHERE n=1 AND vencimento = ?)
      `).get(vencAnoMes, `%${termoBusca}%`, `%${termoBusca}%`, vencAnoMes).tot;

      if (c.dia_fechamento) {
        comprasCiclo = db.prepare(`
          SELECT COALESCE(SUM(ABS(valor)), 0) as tot
          FROM transacoes
          WHERE (lower(conta) = ? OR lower(fonte) LIKE ?)
            AND data >= ? AND data <= ?
            AND natureza = 'gasto'
            AND natureza != 'ignorado'
            AND (parcela IS NULL OR parcela LIKE '1/%')
        `).get((c.conta_auvp || '').toLowerCase(), `%${termoBusca}%`, dataCorteAnt, dataCorteFim).tot;
      }
    }

    const totalCartao = Math.round((parcAgendadas + comprasCiclo + transicao) * 100) / 100;
    totalConsolidado = Math.round((totalConsolidado + totalCartao) * 100) / 100;

    cartoesCalculados.push({
      id: c.id,
      nome: c.nome,
      instituicao: c.instituicao,
      icone: c.icone || '💳',
      fechamento: `${aY}-${String(aM).padStart(2, '0')}-${String(diaFech).padStart(2, '0')}`,
      vencimento: dataVencimento,
      parcelas_agendadas: parcAgendadas,
      compras_ciclo: Math.round(comprasCiclo * 100) / 100,
      transicao_cartao_antigo: transicao || undefined,
      total: totalCartao,
      configurado: c.dia_fechamento != null && c.dia_vencimento != null
    });
  }

  return {
    mes_referencia: proximoMesRef,
    vencimento_ano_mes: vencAnoMes,
    cartoes: cartoesCalculados,
    total: totalConsolidado
  };
}

function sincronizarFaturasLancamentos(mesRef = null) {
  const fa = obterFaturasAbertas();
  const alvoMesRef = mesRef || fa.mes_referencia;

  const mesRow = db.prepare('SELECT id FROM meses WHERE ref=?').get(alvoMesRef);
  if (!mesRow) return { sincronizados: 0, motivo: 'mes_inexistente' };

  let catCartoes = db.prepare("SELECT id FROM categorias WHERE nome='Cartões'").get();
  if (!catCartoes) {
    db.prepare("INSERT INTO categorias (nome, icone, cor) VALUES ('Cartões', '💳', '#b388ff')").run();
    catCartoes = db.prepare("SELECT id FROM categorias WHERE nome='Cartões'").get();
  }

  let atualizados = 0;
  for (const c of fa.cartoes) {
    if (c.total <= 0 && !c.configurado) continue; // Pula cartões não configurados e sem valor

    const nomePadrao = `Fatura ${c.nome}`;
    const existente = db.prepare(`
      SELECT id, pago, valor FROM lancamentos
      WHERE mes_id = ? AND (
        descricao = ? OR 
        (categoria_id = ? AND (
          (descricao LIKE '%Nubank%' AND ? LIKE '%Nubank%') OR
          (descricao LIKE '%Itaú%' AND ? LIKE '%Itaú%') OR
          (descricao LIKE '%Mercado%' AND ? LIKE '%Mercado%') OR
          (descricao LIKE ? AND ? != '')
        ))
      )
    `).get(mesRow.id, nomePadrao, catCartoes.id, c.nome, c.nome, c.nome, `%${c.instituicao}%`, c.instituicao);

    if (existente) {
      if (!existente.pago) {
        db.prepare('UPDATE lancamentos SET valor=?, vencimento=?, origem=? WHERE id=?')
          .run(c.total, c.vencimento, 'fatura-aberta', existente.id);
        atualizados++;
      }
    } else {
      db.prepare(`
        INSERT INTO lancamentos (mes_id, descricao, valor, vencimento, categoria_id, pago, origem)
        VALUES (?, ?, ?, ?, ?, 0, 'fatura-aberta')
      `).run(mesRow.id, nomePadrao, c.total, c.vencimento, catCartoes.id);
      atualizados++;
    }
  }

  return { sincronizados: atualizados, mes: alvoMesRef, total: fa.total };
}

module.exports = { obterFaturasAbertas, sincronizarFaturasLancamentos };
