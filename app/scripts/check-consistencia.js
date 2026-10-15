// check-consistencia.js — GUARDRAIL de consistência (decisão 08/10/2026, Evander)
//
// Roda após sync e após aplicar reconciliação. NUNCA quebra a operação: só reporta.
// Verificações:
//   1. Painel (fluxo) ≈ Projeção (mês 1 comprometido) — mesma fonte compromisso-mes.js
//   2. Dupla contagem: transações do mês que PARECEM pagar conta (boleto/PIX com valor
//      parecido a lançamento em aberto) mas não estão linkadas
//   3. Salário duplo: mesma renda caindo 2x no mês por fontes/hashes diferentes
//   4. Gasto do dia a dia vs compromisso: soma não pode passar da renda por engano

const db = require('../db');
const { compromissoMes, gastoDiaADia, refParaIso } = require('./compromisso-mes');

function fmt(v) { return Number(v || 0).toFixed(2); }

function checarConsistencia(mesRef = null) {
  const ref = mesRef || db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get()?.valor;
  if (!ref) return { ok: true, avisos: [], mes: null };
  const mesIso = refParaIso(ref);

  const avisos = [];
  const c = compromissoMes(ref);
  const diaADia = gastoDiaADia(mesIso);

  // renda do mês (mesma lógica do fluxo)
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaEstimada = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);
  let rendaRealizada = 0;
  try {
    const { totalRendaRealizada } = require('./renda-realizada');
    rendaRealizada = totalRendaRealizada(mesIso) || 0;
  } catch (e) {}
  const renda = Math.max(rendaEstimada, rendaRealizada) || 14986.17;

  const comprometidoPainel = c.total + diaADia;
  const sobraPainel = renda - comprometidoPainel;

  // ---- 1. Painel vs Projeção (mês 1) ----
  // A projeção não inclui gasto do dia a dia no compromisso (é sobra livre);
  // comparamos o COMPROMISSO puro (fixos+faturas+parcelas): tem que bater.
  // comprometido da projeção mês 1 = compromissoMes(ref).total — mesma função.
  // Guardamos o valor para o endpoint expor e a UI comparar historicamente.
  const projecaoMes1 = {
    comprometido: c.total,
    fonte: c.origem
  };
  const somaPainel = c.fixos + c.faturas + c.parcelas;
  if (Math.abs(somaPainel - projecaoMes1.comprometido) > 0.05) {
    avisos.push({
      tipo: 'divergencia_painel_projecao',
      msg: `Painel soma ${fmt(somaPainel)} mas compromisso é ${fmt(projecaoMes1.comprometido)} — deveriam ser idênticos`
    });
  }

  // ---- 2. Dupla contagem: boleto/PIX do mês que casa com lançamento ABERTO ----
  const suspeitas = [];
  try {
    const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
    if (mes) {
      const abertos = db.prepare(`
        SELECT l.id, l.descricao, l.valor, l.vencimento FROM lancamentos l
        WHERE l.mes_id=? AND l.pago=0`).all(mes.id);
      const txs = db.prepare(`
        SELECT t.id, t.data, t.valor, t.descricao, t.fonte FROM transacoes t
        WHERE t.natureza='gasto' AND substr(t.data,1,7)=? AND t.parcela IS NULL
          AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)`).all(mesIso);
      for (const l of abertos) {
        const cand = txs.find(t =>
          Math.abs(Math.abs(t.valor) - Math.abs(l.valor)) <= Math.max(Math.abs(l.valor) * 0.12, 15) &&
          Math.abs((new Date(t.data) - new Date(l.vencimento)) / 86400000) <= 7
        );
        if (cand) {
          suspeitas.push({
            lancamento: l.descricao, lancamento_valor: fmt(l.valor),
            transacao: cand.descricao.slice(0, 40), transacao_valor: fmt(cand.valor),
            transacao_id: cand.id
          });
        }
      }
    }
  } catch (e) {}
  if (suspeitas.length) {
    avisos.push({
      tipo: 'dupla_contagem_potencial',
      msg: `${suspeitas.length} transação(ões) do mês casam com contas em aberto e não estão linkadas — o painel conta 2x`,
      itens: suspeitas
    });
  }

  // ---- 3. Salário duplo ----
  const salarioDuplicado = [];
  try {
    const salarios = db.prepare(`
      SELECT id, data, valor, descricao, fonte, hash_unico FROM transacoes
      WHERE natureza='salario' AND substr(data,1,7)=?`).all(mesIso);
    const vistos = [];
    for (const s of salarios) {
      const dup = vistos.find(v => Math.abs(v.valor - s.valor) < 0.01 && Math.abs((new Date(v.data) - new Date(s.data)) / 86400000) <= 3);
      if (dup) {
        salarioDuplicado.push({ ids: [dup.id, s.id], valor: fmt(s.valor), descricoes: [dup.descricao.slice(0, 40), s.descricao.slice(0, 40)] });
      } else {
        vistos.push(s);
      }
    }
    // também: rendas_realizadas do mês vs transações (mesmo valor gravado 2x por nome diferente)
    const rr = db.prepare(`SELECT descricao, valor FROM rendas_realizadas WHERE mes=?`).all(mesIso);
    for (let i = 0; i < rr.length; i++) {
      for (let j = i + 1; j < rr.length; j++) {
        if (Math.abs(rr[i].valor - rr[j].valor) < 0.01) {
          salarioDuplicado.push({ rendas: [rr[i], rr[j]] });
        }
      }
    }
  } catch (e) {}
  if (salarioDuplicado.length) {
    avisos.push({
      tipo: 'salario_duplicado',
      msg: `Possível salário duplo em ${ref}: ${salarioDuplicado.length} par(es) com mesmo valor`,
      itens: salarioDuplicado
    });
  }

  // ---- 4. Sanidade: renda vs saídas ----
  if (renda > 0 && comprometidoPainel > renda * 1.5) {
    avisos.push({
      tipo: 'saidas_irrealistas',
      msg: `Saídas (${fmt(comprometidoPainel)}) = ${Math.round((comprometidoPainel / renda) * 100)}% da renda — provável dupla contagem`
    });
  }

  return {
    ok: avisos.length === 0,
    mes: ref,
    resumo: {
      renda: Math.round(renda * 100) / 100,
      fixos: c.fixos, faturas: c.faturas, parcelas: c.parcelas,
      dia_a_dia: Math.round(diaADia * 100) / 100,
      comprometido: c.total,
      sobra: Math.round(sobraPainel * 100) / 100,
      fonte_compromisso: c.origem
    },
    avisos
  };
}

module.exports = { checarConsistencia };