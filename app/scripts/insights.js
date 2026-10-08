// insights.js — fluxo 'Para onde vai cada real' (visão CAIXA, decisão 08/10/2026)
//
// CONSISTÊNCIA: usa compromisso-mes.js — a MESMA fonte da Visão Geral e da Projeção.
// Linhas: Renda · Fixos & moradia · Faturas de cartão · Parcelas & dívidas ·
//         Gasto do dia a dia · Sobra/Déficit
// Sem dupla contagem: boleto que pagou conta fica nos Fixos (via lançamento);
// dia a dia conta só o que saiu da conta sem pagar lançamento e sem ser crédito.

const db = require('../db');
const { compromissoMes, gastoDiaADia } = require('./compromisso-mes');

// fmt e gerarInsights permanecem como estavam (insights de contas/dívidas/recorrências)
function fmt(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function gerarInsights() {
  const insights = [];
  try {
    const cfg = db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get();
    const ref = cfg?.valor;
    const hoje = new Date().toISOString().slice(0, 10);
    if (ref) {
      const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
      if (mes) {
        const vencidas = db.prepare(`SELECT l.descricao, l.vencimento, l.valor FROM lancamentos l
          WHERE l.mes_id=? AND l.pago=0 AND l.vencimento < ?`).all(mes.id, hoje);
        if (vencidas.length) {
          insights.push({
            tipo: 'warn', icone: '⏰',
            titulo: `${vencidas.length} conta(s) vencida(s) em ${ref}`,
            texto: vencidas.map(v => `${v.descricao} (${fmt(v.valor)}, venc ${v.vencimento})`).join(' · ')
          });
        }
      }
    }
  } catch (e) { /* silencioso */ }

  try {
    const { calendarioDividas } = require('./parcelas-futuras');
    const c = calendarioDividas();
    const terminando = (c.emAndamento || []).filter(d => {
      const [tM, tY] = d.termina.split('/').map(Number);
      return tY * 12 + tM <= new Date().getFullYear() * 12 + (new Date().getMonth() + 1) + 2;
    });
    if (terminando.length) {
      insights.push({
        tipo: 'good', icone: '🏁',
        titulo: `${terminando.length} dívida(s) quitam em ≤3 meses`,
        texto: terminando.map(d => `${d.descricao} (fim ${d.termina})`).join(' · ')
      });
    }
  } catch (e) { /* silencioso */ }

  try {
    const streakQuery = db.prepare(`
      SELECT m.ref, COUNT(*) abertas FROM meses m
      JOIN lancamentos l ON l.mes_id = m.id
      WHERE l.pago = 0 AND l.vencimento < date('now')
      GROUP BY m.ref ORDER BY m.ref DESC LIMIT 6`).all();
    let streak = 0;
    for (const m of streakQuery) {
      if (m.abertas === 0) streak++;
      else break;
    }
    if (streak >= 3) {
      insights.push({
        tipo: 'good', icone: '💪',
        titulo: `Você pagou 100% das contas nos últimos ${streak} meses`,
        texto: `Nenhuma conta vencida. Streak ativo: ${streak} meses.`
      });
    }
  } catch (e) { /* silencioso */ }

  try {
    const recs = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(valor),0) total FROM recorrencias WHERE ativo=1`).get();
    if (recs.n > 0) {
      insights.push({
        tipo: 'good', icone: '⏱',
        titulo: `Você tem ${recs.n} contas recorrentes ativas totalizando ${fmt(recs.total)}/mês`,
        texto: 'Geradas todo mês para planejamento financeiro e conciliação com extratos.'
      });
    }
  } catch (e) { /* silencioso */ }

  try {
    const top = db.prepare(`
      SELECT descricao, SUM(ABS(valor)) tot, COUNT(*) n FROM transacoes
      WHERE natureza='gasto' AND valor < -100
      AND substr(data,1,7) = (SELECT MAX(substr(data,1,7)) FROM transacoes)
      GROUP BY descricao ORDER BY tot DESC LIMIT 1`).get();
    if (top && top.tot > 300) {
      insights.push({
        tipo: 'warn', icone: '💸',
        titulo: `Maior gasto recente: ${top.descricao.slice(0, 30)}`,
        texto: `${fmt(top.tot)} em ${top.n}x no último mês com dados. ${top.n > 1 ? 'Repetiu ' + top.n + 'x.' : ''}`
      });
    }
  } catch (e) { /* silencioso */ }

  return insights;
}

// fluxo do mês — VISÃO CAIXA (consistente com Visão Geral e Projeção)
function gerarFluxo(mesRef = null) {
  const ref = mesRef || db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get()?.valor || '09-2026';
  const [mM, yY] = ref.split('-');
  const mesIso = `${yY}-${mM}`;

  // 1. Renda líquida do mês (realizada se existir; senão estimada)
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaEstimada = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);
  let rendaRealizada = 0;
  try {
    const { totalRendaRealizada } = require('./renda-realizada');
    rendaRealizada = totalRendaRealizada(mesIso) || 0;
  } catch (e) {}
  const renda = Math.max(rendaEstimada, rendaRealizada) || 14986.17;

  // 2. Compromisso do mês — FONTE ÚNICA (compromisso-mes.js)
  const c = compromissoMes(ref);

  // 3. Gasto do dia a dia — só o que saiu da conta sem pagar lançamento (sem crédito)
  const diaADia = gastoDiaADia(mesIso);

  const totalSaidas = c.fixos + c.faturas + c.parcelas + diaADia;
  const saldoFinal = renda - totalSaidas;
  const pctComprometido = renda > 0 ? Math.round((totalSaidas / renda) * 100) : 0;
  const pct = v => renda > 0 ? Math.round((v / renda) * 1000) / 10 : 0;

  return [
    {
      nome: 'Renda líquida',
      icone: '💵',
      valor: Math.round(renda * 100) / 100,
      cor: 'green',
      pct: 100,
      detalhe: rendaRealizada > 0 ? `R$ ${rendaRealizada.toFixed(2)} realizada` : 'Estimada'
    },
    {
      nome: 'Fixos & moradia',
      icone: '🏠',
      valor: c.fixos,
      cor: 'blue',
      pct: pct(c.fixos),
      detalhe: c.origem === 'lancamentos' ? 'Contas do mês (módulo Contas)' : 'Recorrências ativas'
    },
    {
      nome: 'Faturas de cartão',
      icone: '💳',
      valor: c.faturas,
      cor: 'red',
      pct: pct(c.faturas),
      detalhe: 'Nubank, Itaú e Mercado Pago (saída real do mês)'
    },
    {
      nome: 'Parcelas & dívidas',
      icone: '⚖️',
      valor: c.parcelas,
      cor: 'amber',
      pct: pct(c.parcelas),
      detalhe: 'Leão, IPTU, financiamentos'
    },
    {
      nome: 'Gasto do dia a dia',
      icone: '🛒',
      valor: Math.round(diaADia * 100) / 100,
      cor: 'purple',
      pct: pct(diaADia),
      detalhe: 'PIX/débito/boleto avulso — compras no crédito entram na fatura'
    },
    {
      nome: saldoFinal >= 0 ? 'Sobra livre' : 'Déficit / Pressão',
      icone: saldoFinal >= 0 ? '💰' : '⚠️',
      valor: Math.round(Math.abs(saldoFinal) * 100) / 100,
      negativo: saldoFinal < 0,
      cor: saldoFinal >= 0 ? 'green' : 'red',
      pct: pct(Math.abs(saldoFinal)),
      detalhe: saldoFinal >= 0 ? 'Livre para poupar/investir' : `${pctComprometido}% da renda comprometida`
    }
  ];
}

// health score — usa módulo único de parcelas futuras (mesma fonte da projeção e calendário)
function gerarHealth() {
  const { calendarioDividas } = require('./parcelas-futuras');
  const fluxo = gerarFluxo();
  const renda = fluxo[0].valor;
  const sobraObj = fluxo[fluxo.length - 1];
  const saldoFinal = sobraObj.negativo ? -sobraObj.valor : sobraObj.valor;
  const comprometido = renda - saldoFinal;
  const pctLivre = sobraObj.negativo ? 0 : Math.round(sobraObj.pct);
  const divs = calendarioDividas();
  const dividaTotal = (divs.emAndamento || []).reduce((s, d) => s + d.restam * d.valor, 0);
  const alivioMensal = (divs.emAndamento || []).reduce((s, d) => s + d.valor, 0);
  const rendaAnual = renda * 12;
  return {
    pctLivre,
    comprometido,
    renda,
    dividaTotal,
    dividaRenda: (dividaTotal / rendaAnual).toFixed(1),
    alivioMensal,
    mesesParaLiberar: 11
  };
}

module.exports = { gerarInsights, gerarFluxo, gerarHealth };