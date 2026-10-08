// compromisso-mes.js — FONTE ÚNICA do compromisso mensal (decisão 08/10/2026, Evander)
//
// Regra de consistência: Painel "Para onde vai cada real", Visão Geral (sobra_mes)
// e Projeção (mês 1) usam ESTA função — nunca mais cálculo duplicado divergente.
//
// Visão CAIXA do mês:
//   Compromisso = Fixos & moradia + Parcelas & dívidas + Faturas de cartão
//   - Mês com lançamentos gerados (módulo Contas) → valores REAIS dos lançamentos
//   - Mês sem lançamentos (futuro) → estimativas (recorrencias + parcelas futuras)
//   Gasto do dia a dia (gastoDiaADia) = transações do mês que SAÍRAM DA CONTA
//   e não pagaram lançamento: PIX/débito/boleto avulso. Compras no CRÉDITO não
//   entram (serão cobradas na fatura do mês que vence) e boletos LINKADOS a
//   lançamento não entram (a conta já está no compromisso) — sem dupla contagem.

const db = require('../db');

// fontes que representam gasto no CARTÃO DE CRÉDITO (mesmo conjunto dinâmico do server.js)
function fontesCartao() {
  const set = new Set(['nubank', 'itau-fatura', 'mercadopago', 'auvp-mcp']);
  try {
    const contas = db.prepare("SELECT instituicao, fontes, auvp_fonte FROM contas_bancarias WHERE tipo='CREDIT'").all();
    for (const c of contas) {
      if (c.instituicao) set.add(c.instituicao);
      if (c.auvp_fonte) set.add(c.auvp_fonte);
      try {
        const fontes = JSON.parse(c.fontes || '[]');
        fontes.forEach(f => set.add(f));
      } catch (e) {}
    }
  } catch (e) {}
  return [...set];
}

// ref = 'MM-AAAA'
function refParaIso(ref) {
  const [m, y] = String(ref || '').split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}`;
}

// Compromisso do mês: real (lançamentos) quando existir, senão estimado
function compromissoMes(ref) {
  const mesIso = refParaIso(ref);
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);

  if (mes) {
    const lancs = db.prepare(`
      SELECT l.descricao, l.valor, l.parcela, l.origem, l.pago, c.nome cat
      FROM lancamentos l
      LEFT JOIN categorias c ON c.id = l.categoria_id
      WHERE l.mes_id = ?`).all(mes.id);
    if (lancs.length > 0) {
      let fixos = 0, parcelas = 0, faturas = 0;
      const detalhe = [];
      for (const l of lancs) {
        const v = Math.abs(l.valor || 0);
        const ehFatura = l.cat === 'Cartões' || l.origem === 'fatura-aberta';
        const grupo = ehFatura ? 'faturas' : (l.parcela ? 'parcelas' : 'fixos');
        if (grupo === 'faturas') faturas += v;
        else if (grupo === 'parcelas') parcelas += v;
        else fixos += v;
        detalhe.push({ descricao: l.descricao, valor: v, grupo, pago: !!l.pago });
      }
      const r2 = x => Math.round(x * 100) / 100;
      return {
        origem: 'lancamentos', mes: ref, mes_iso: mesIso,
        fixos: r2(fixos), parcelas: r2(parcelas), faturas: r2(faturas),
        total: r2(fixos + parcelas + faturas), detalhe
      };
    }
  }

  // ---- estimado (mês futuro ou sem lançamentos) ----
  const [mM, yY] = String(ref || '').split('-').map(Number);
  const fixosRec = db.prepare(`SELECT descricao, valor, periodicidade, data_base FROM recorrencias
    WHERE ativo=1 AND tipo='Recorrente' AND (categoria_id IS NULL OR categoria_id != (SELECT id FROM categorias WHERE nome='Cartões'))`).all();
  let fixos = 0;
  for (const f of fixosRec) {
    let entra = true;
    if (f.periodicidade && f.periodicidade > 1 && f.data_base) {
      const b = f.data_base.split('-').map(Number);
      const k = (Number(yY) - b[0]) * 12 + (Number(mM) - b[1]);
      entra = k >= 0 && k % f.periodicidade === 0;
    }
    if (entra) fixos += Math.abs(f.valor || 0);
  }

  const parceladosRec = db.prepare(`SELECT valor, total_parcelas, parcela_atual FROM recorrencias
    WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL`).all();
  let parcelas = 0;
  for (const p of parceladosRec) {
    const atual = p.parcela_atual || 1;
    if (atual <= p.total_parcelas) parcelas += Math.abs(p.valor);
  }

  let faturas = 0;
  try {
    const { compromissosFuturos } = require('./parcelas-futuras');
    const cf = compromissosFuturos();
    faturas = cf.filter(x => { const [m, y] = x.mes.split('-'); return `${y}-${m}` === mesIso; })
      .reduce((s, x) => s + x.valor, 0);
  } catch (e) {}

  const r2 = x => Math.round(x * 100) / 100;
  return {
    origem: 'estimado', mes: ref, mes_iso: mesIso,
    fixos: r2(fixos), parcelas: r2(parcelas), faturas: r2(faturas),
    total: r2(fixos + parcelas + faturas), detalhe: []
  };
}

// Gasto do dia a dia do mês (visão caixa): saiu da CONTA, não pagou lançamento
function gastoDiaADia(mesIso) {
  const fontes = fontesCartao();
  const placeholders = fontes.map(() => '?').join(',');
  return db.prepare(`
    SELECT COALESCE(SUM(ABS(valor)),0) tot FROM transacoes t
    WHERE t.natureza='gasto' AND substr(t.data,1,7)=?
      AND t.parcela IS NULL
      AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
      AND t.id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)
      AND t.fonte NOT IN (${placeholders})`).get(mesIso, ...fontes).tot;
}

module.exports = { compromissoMes, gastoDiaADia, fontesCartao, refParaIso };