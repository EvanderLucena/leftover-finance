// Motor de insights: analisa transações e gera mensagens automáticas
const db = require('../db');

function fmt(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// fontes de fatura de cartão (mesma lista do server — multi-fonte)
const FONTES_CARTAO = ['nubank', 'itau-fatura', 'mercadopago', 'auvp-mcp'];
const sqlFontesCartao = () => `fonte IN (${FONTES_CARTAO.map(() => '?').join(',')})`;

function gerarInsights() {
  const insights = [];

  // 1. Cartão à vista: mês atual vs média anterior
  const avistaPorMes = db.prepare(`
    SELECT substr(data,1,7) mes, SUM(CASE WHEN parcela IS NULL THEN ABS(valor) ELSE 0 END) avista
    FROM transacoes WHERE natureza='gasto' AND ${sqlFontesCartao()}
    GROUP BY mes ORDER BY mes`).all(...FONTES_CARTAO);
  if (avistaPorMes.length >= 3) {
    let atual = avistaPorMes[avistaPorMes.length - 1];
    // pula mês corrente se tem poucas transações (fatura ainda aberta)
    const txAtual = db.prepare(`SELECT COUNT(*) n FROM transacoes WHERE natureza='gasto' AND ${sqlFontesCartao()} AND substr(data,1,7)=?`).get(...FONTES_CARTAO, atual.mes);
    if (txAtual.n < 10) {
      const penultimo = avistaPorMes[avistaPorMes.length - 2];
      if (penultimo) atual = penultimo;
    }
    const anteriores = avistaPorMes.filter(m => m.mes < atual.mes);
    if (anteriores.length >= 2) {
      const media = anteriores.reduce((s, m) => s + m.avista, 0) / anteriores.length;
      const diff = (atual.avista - media) / media;
      if (Math.abs(diff) > 0.3) {
        const dir = diff > 0 ? 'subiu' : 'caiu';
        insights.push({
          tipo: diff > 0 ? 'bad' : 'good',
          icone: diff > 0 ? '🔥' : '💚',
          titulo: `Cartão à vista ${dir} ${Math.abs(Math.round(diff * 100))}% em ${atual.mes}`,
          texto: `R$ ${atual.avista.toFixed(0)} vs média de R$ ${media.toFixed(0)} dos meses anteriores. ${diff > 0 ? 'Vale revisar as maiores compras do mês.' : 'Boa contenção!'}`
        });
      }
    }
  }

  // 2. Pico de comprometimento nos próximos meses (módulo único de parcelas futuras)
  try {
    const { compromissosFuturos, calendarioDividas } = require('./parcelas-futuras');
    const compromissos = compromissosFuturos().map(c => ({ mes: c.mes, valor: c.valor }));
    // parcelados da planilha também
    const hoje2 = new Date();
    const aY2 = hoje2.getFullYear(), aM2 = hoje2.getMonth() + 1;
    const parcelados = db.prepare(`SELECT descricao, valor, total_parcelas, parcela_atual FROM recorrencias WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL`).all();
    for (const p of parcelados) {
      const restam = p.total_parcelas - (p.parcela_atual || 0);
      for (let i = 1; i <= restam; i++) {
        const mi = (aM2 - 1) + i;
        compromissos.push({ mes: `${String(mi % 12 + 1).padStart(2, '0')}-${aY2 + Math.floor(mi / 12)}`, valor: p.valor });
      }
    }
    const cfgPix = db.prepare("SELECT valor FROM config WHERE chave='gasto_pix_variavel'").get();
    const cfgCartao = db.prepare("SELECT valor FROM config WHERE chave='gasto_cartao_avista'").get();
    const fixos = db.prepare("SELECT COALESCE(SUM(valor),0) t FROM recorrencias WHERE ativo=1 AND tipo='Recorrente' AND categoria_id != (SELECT id FROM categorias WHERE nome='Cartões')").get().t;
    const pixVar = cfgPix ? parseFloat(cfgPix.valor) : 0;
    const cartaoAv = cfgCartao ? parseFloat(cfgCartao.valor) : 0;
    const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
    const renda = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);

    const serie = [];
    for (let i = 0; i < 12; i++) {
      const mi = (aM2 - 1) + i;
      const mes = `${String(mi % 12 + 1).padStart(2, '0')}-${aY2 + Math.floor(mi / 12)}`;
      const parc = compromissos.filter(c => c.mes === mes).reduce((s, c) => s + c.valor, 0);
      serie.push({ mes, parcelas: parc, total: fixos + parc + pixVar + cartaoAv });
    }
    const picos = [...serie].sort((a, b) => b.total - a.total);
    if (picos.length && picos[0].total > renda * 0.9) {
      insights.push({
        tipo: 'warn', icone: '📅',
        titulo: `${picos[0].mes} é seu pico: ${fmt(picos[0].total)} comprometidos`,
        texto: `Fica ${fmt(renda - picos[0].total)} de folga. Reserve agora — é ${Math.round(picos[0].total / renda * 100)}% da renda.`
      });
    }
    // 2b. escada de liberação: quanto a sobra sobe nos próximos 90 dias
    const divs = calendarioDividas();
    const libProx = (divs.emAndamento || []).filter(d => {
      const [mm, yy] = d.termina.split('/').map(Number);
      const diff = (yy * 12 + mm) - (aY2 * 12 + aM2);
      return diff >= 1 && diff <= 3;
    });
    if (libProx.length) {
      const alivio = libProx.reduce((s, d) => s + d.valor, 0);
      insights.push({
        tipo: 'good', icone: '🪜',
        titulo: `Escada de liberação: +${fmt(alivio)}/mês até ${libProx[libProx.length - 1].termina}`,
        texto: libProx.map(d => `${d.descricao.slice(0, 18)} sai em ${d.termina} (+${fmt(d.valor)})`).join(' · ')
      });
    }
  } catch (e) { /* silencioso */ }

  // 3. parcelas que terminam em breve (alívio próximo) — usa calendário corrigido
  try {
    const { calendarioDividas } = require('./parcelas-futuras');
    const divs = calendarioDividas();
    const prox = (divs.emAndamento || []).filter(d => d.restam <= 2).sort((a, b) => a.restam - b.restam);
    if (prox.length) {
      const p = prox[0];
      insights.push({
        tipo: 'good', icone: '🎉',
        titulo: `${p.descricao.slice(0, 28)} termina em ${p.restam} ${p.restam === 1 ? 'mês' : 'meses'} (${p.termina})`,
        texto: `Restam ${p.restam}x ${fmt(p.valor)}. Depois disso sua sobra mensal sobe ${fmt(p.valor)}.`
      });
    }
  } catch (e) { /* silencioso */ }

  // 4. streak de pagamentos (meses com todas as contas pagas)
  try {
    const meses = db.prepare(`
      SELECT m.ref, SUM(CASE WHEN l.pago=0 THEN 1 ELSE 0 END) abertas
      FROM meses m JOIN lancamentos l ON l.mes_id=m.id
      GROUP BY m.id ORDER BY m.ref`).all();
    let streak = 0;
    for (const m of [...meses].reverse()) {
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

  // 5. recorrências ativas
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

  // 6. maior gasto variável do último mês importado
  try {
    const top = db.prepare(`
      SELECT descricao, SUM(ABS(valor)) tot, COUNT(*) n FROM transacoes
      WHERE natureza='gasto' AND valor < -100 AND ${sqlFontesCartao()}
      AND substr(data,1,7) = (SELECT MAX(substr(data,1,7)) FROM transacoes)
      GROUP BY descricao ORDER BY tot DESC LIMIT 1`).get(...FONTES_CARTAO);
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

// fluxo do mês — faturas reais de cartão + fixos + parcelados + gastos variáveis vs renda
function gerarFluxo(mesRef = null) {
  const ref = mesRef || db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get()?.valor || '09-2026';
  const [mM, yY] = ref.split('-');
  const mesIso = `${yY}-${mM}`;

  // 1. Renda líquida do mês (estimada base ou realizada)
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaEstimada = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);
  let rendaRealizada = 0;
  try {
    const { totalRendaRealizada } = require('./renda-realizada');
    rendaRealizada = totalRendaRealizada(mesIso) || 0;
  } catch(e) {}
  const renda = Math.max(rendaEstimada, rendaRealizada) || 14986.17;

  // 2. Contas do mês (lancamentos)
  const mesRow = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
  let fixos = 0;
  let faturasCartao = 0;
  let parcelas = 0;

  if (mesRow) {
    const lancs = db.prepare(`
      SELECT l.*, c.nome as cat FROM lancamentos l
      LEFT JOIN categorias c ON c.id = l.categoria_id
      WHERE l.mes_id = ?
    `).all(mesRow.id);

    for (const l of lancs) {
      if (l.cat === 'Cartões') {
        faturasCartao += l.valor;
      } else if (l.parcela || (l.cat === 'Dívida' && l.descricao !== 'Condomínio')) {
        parcelas += l.valor;
      } else {
        fixos += l.valor;
      }
    }
  }

  // Fallback para meses sem lançamentos salvos
  if (!mesRow || (fixos + faturasCartao + parcelas === 0)) {
    fixos = db.prepare("SELECT COALESCE(SUM(valor),0) t FROM recorrencias WHERE ativo=1 AND tipo='Recorrente' AND categoria_id != (SELECT id FROM categorias WHERE nome='Cartões')").get().t;
    parcelas = db.prepare(`
      SELECT COALESCE(SUM(valor),0) t FROM recorrencias
      WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL
        AND total_parcelas - COALESCE(parcela_atual,0) > 0`).get().t;
    try {
      const { obterFaturasAbertas } = require('./faturas-abertas');
      faturasCartao = obterFaturasAbertas().total || 0;
    } catch(e) {}
  }

  // 3. Gastos variáveis reais do mês (à vista, PIX e débito fora de contas e parcelas)
  const gastoReal = db.prepare(`
    SELECT COALESCE(SUM(ABS(valor)),0) tot FROM transacoes t
    WHERE t.natureza='gasto' AND substr(t.data,1,7)=?
      AND t.parcela IS NULL
      AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
      AND t.id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)`).get(mesIso).tot;

  const totalSaidas = fixos + faturasCartao + parcelas + gastoReal;
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
      nome: 'Faturas de cartão', 
      icone: '💳',
      valor: Math.round(faturasCartao * 100) / 100, 
      cor: 'red', 
      pct: pct(faturasCartao),
      detalhe: 'Nubank, Itaú, Mercado Pago'
    },
    { 
      nome: 'Fixos & moradia', 
      icone: '🏠',
      valor: Math.round(fixos * 100) / 100, 
      cor: 'blue', 
      pct: pct(fixos),
      detalhe: 'Aluguel, energia, internet, saúde'
    },
    { 
      nome: 'Parcelas & dívidas', 
      icone: '⚖️',
      valor: Math.round(parcelas * 100) / 100, 
      cor: 'amber', 
      pct: pct(parcelas),
      detalhe: 'Leão, IPTU, financiamentos'
    },
    { 
      nome: 'Variável dia a dia', 
      icone: '🛒',
      valor: Math.round(gastoReal * 100) / 100, 
      cor: 'purple', 
      pct: pct(gastoReal),
      detalhe: 'PIX, débito, compras avulsas'
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
  // dívida total = calendário corrigido (parcelados fixos + parcelas de cartão)
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
