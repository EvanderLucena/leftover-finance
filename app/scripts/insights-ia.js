// Motor de Insights Inteligentes via IA (DeepSeek / Ollama Cloud)
// Analisa a saúde financeira real consolidada (faturas abertas, liquidez, projeção futura, descompressão de dívidas)
const db = require('../db');
const { getConfigIA } = require('./ia');
// faturas e parcelamentos vêm do motor único
const { faturasAbertas: obterFaturasAbertas, dividas: calendarioDividas } = require('../core/comprometido');

function fmtMoeda(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function coletarContextoFinanceiro() {
  const hoje = new Date();
  const aY = hoje.getFullYear(), aM = hoje.getMonth() + 1;
  const mesIso = `${aY}-${String(aM).padStart(2, '0')}`;
  const mesRef = `${String(aM).padStart(2, '0')}-${aY}`;

  // 1. Saldos e Disponibilidade bancária real
  let disponivel = 0;
  try {
    const { saldosAUVP } = require('./saldos');
    const saldos = await saldosAUVP();
    disponivel = (saldos.saldos || []).filter(s => s.tipo === 'BANK').reduce((sum, c) => sum + c.valor, 0);
  } catch (e) {}

  // 2. Faturas Abertas em Tempo Real
  const fa = obterFaturasAbertas();
  const diasParaFechamentoNu = fa.cartoes.find(c => c.id === 'nubank')?.fechamento;
  let diasRestantesCorte = null;
  if (diasParaFechamentoNu) {
    diasRestantesCorte = Math.ceil((new Date(diasParaFechamentoNu) - hoje) / 86400000);
  }

  // 3. Rendas e Entradas Pendentes
  const { totalRendaRealizada } = require('./renda-realizada');
  const rendaRealizada = totalRendaRealizada(mesIso);
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaEstimada = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);
  const entradasPendentes = Math.max(0, rendaEstimada - rendaRealizada);

  // 4. Projeção M+1
  const fixos = db.prepare("SELECT COALESCE(SUM(valor),0) t FROM recorrencias WHERE ativo=1 AND tipo='Recorrente' AND categoria_id != (SELECT id FROM categorias WHERE nome='Cartões')").get().t;
  const parExt = db.prepare("SELECT COALESCE(SUM(valor),0) t FROM recorrencias WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL AND total_parcelas - COALESCE(parcela_atual,0) > 0").get().t;
  
  const m1Comprometido = fixos + parExt + fa.total;
  const m1SobraLivre = rendaEstimada - m1Comprometido;
  const m1Pct = Math.round((m1Comprometido / rendaEstimada) * 100);

  // 5. Calendário de Quitação de Dívidas (próximos 90 dias)
  const divs = calendarioDividas();
  const alivio3m = divs.alivio_3m || 0;
  const dividasTerminando90d = (divs.emAndamento || []).filter(d => d.restam <= 3);

  // 6. Contas do Mês Atual (abertas vs pagas)
  const mesAtualId = db.prepare('SELECT id FROM meses WHERE ref=?').get(mesRef);
  const contasAbertas = mesAtualId ? db.prepare('SELECT descricao, valor, vencimento FROM lancamentos WHERE mes_id=? AND pago=0 ORDER BY vencimento LIMIT 4').all(mesAtualId.id) : [];

  return {
    data_hoje: hoje.toISOString().slice(0, 10),
    disponivel: fmtMoeda(disponivel),
    faturas_abertas: {
      total: fmtMoeda(fa.total),
      mes_vencimento: fa.mes_referencia,
      dias_para_fechar_nubank_itau: diasRestantesCorte,
      detalhes: fa.cartoes.map(c => ({
        cartao: c.nome,
        total: fmtMoeda(c.total),
        parcelas_agendadas: fmtMoeda(c.parcelas_agendadas),
        compras_ciclo: fmtMoeda(c.compras_ciclo),
        vencimento: c.vencimento,
        fechamento: c.fechamento
      }))
    },
    entradas_pendentes_mes: fmtMoeda(entradasPendentes),
    saldo_liquido_previsto: fmtMoeda(disponivel + entradasPendentes - fa.total),
    projecao_proximo_mes: {
      mes: fa.mes_referencia,
      comprometido: fmtMoeda(m1Comprometido),
      pct_da_renda: `${m1Pct}%`,
      sobra_livre: fmtMoeda(m1SobraLivre),
      alerta_pressao: m1Pct > 80
    },
    dividas: {
      total_passivo: fmtMoeda(divs.total_passivo_restante),
      alivio_3_meses: fmtMoeda(alivio3m),
      terminando_em_breve: dividasTerminando90d.map(d => `${d.descricao} (${d.restam}x ${fmtMoeda(d.valor)}, sai em ${d.termina})`)
    },
    contas_a_vencer_este_mes: contasAbertas.map(c => `${c.descricao} (${fmtMoeda(c.valor)} em ${c.vencimento})`)
  };
}

async function gerarInsightsComIA(forcar = false) {
  const cfg = getConfigIA();
  if (!cfg.url || !cfg.key || !cfg.model) {
    return { ok: false, erro: 'IA não configurada', fonte: 'local' };
  }

  const contexto = await coletarContextoFinanceiro();

  const prompt = [
    'Você é o analista financeiro pessoal do usuário do sistema Leftover Finance.',
    'Analise com rigor e pragmatismo os dados financeiros consolidados abaixo e gere 3 ou 4 diagnósticos cirúrgicos e acionáveis.',
    '',
    'REGRAS RÍGIDAS:',
    '- NÃO use frases genéricas, elogios vazios ou óbvios (ex: "você importou dados", "parabéns", "mantenha o foco").',
    '- Foque em números exatos, liquidez imediata, prazos de fechamento de faturas, risco ou folga no fluxo e alívio de dívidas.',
    '- Se o comprometimento for alto (>80%), seja direto sobre contenção de compras no cartão.',
    '- Se houver alívio de parcelas nos próximos 90 dias, indique o impacto positivo na sobra livre.',
    '- Cada insight deve ter um título forte com dado quantitativo e um texto curto com 1 ou 2 frases.',
    '',
    'DADOS FINANCEIROS REAIS DO USUÁRIO:',
    JSON.stringify(contexto, null, 2),
    '',
    'FORMATO DE RESPOSTA OBRIGATÓRIO (APENAS UM JSON ARRAY VÁLIDO, SEM MARKDOWN, SEM BACKTICKS, NADA ANTES OU DEPOIS):',
    '[',
    '  {',
    '    "tipo": "good" | "warn" | "bad" | "info",',
    '    "icone": "emoji apropriado",',
    '    "titulo": "título conciso com dado ou impacto",',
    '    "texto": "1 a 2 frases objetivas com a causa e ação/estratégia recomendada."',
    '  }',
    ']'
  ].join('\n');

  try {
    const endpoint = cfg.url.replace(/\/$/, '') + '/v1/chat/completions';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return { ok: false, erro: `HTTP ${resp.status}: ${errTxt.slice(0, 100)}`, fonte: 'local' };
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const match = rawContent.match(/\[[\s\S]*\]/);
    if (!match) {
      return { ok: false, erro: 'Resposta da IA não continha JSON válido', fonte: 'local' };
    }

    const insights = JSON.parse(match[0]);
    if (!Array.isArray(insights) || !insights.length) {
      return { ok: false, erro: 'Array de insights vazio', fonte: 'local' };
    }

    const agoraStr = new Date().toISOString();
    const upConfig = (chave, valor) => {
      db.prepare(`
        INSERT INTO config (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor
      `).run(chave, valor);
    };

    upConfig('insights_ia_cache', JSON.stringify(insights));
    upConfig('insights_ia_gerado_em', agoraStr);

    return {
      ok: true,
      insights,
      gerado_em: agoraStr,
      modelo: cfg.model,
      fonte: 'ia'
    };
  } catch (e) {
    return { ok: false, erro: e.message, fonte: 'local' };
  }
}

function obterUltimosInsights() {
  try {
    const row = db.prepare("SELECT valor FROM config WHERE chave='insights_ia_cache'").get();
    const rowData = db.prepare("SELECT valor FROM config WHERE chave='insights_ia_gerado_em'").get();
    if (row && row.valor) {
      const parsed = JSON.parse(row.valor);
      if (Array.isArray(parsed) && parsed.length) {
        return {
          insights: parsed,
          gerado_em: rowData ? rowData.valor : null,
          fonte: 'ia'
        };
      }
    }
  } catch (e) {}

  const { gerarInsights } = require('./insights');
  return {
    insights: gerarInsights(),
    gerado_em: null,
    fonte: 'regras'
  };
}

module.exports = {
  gerarInsightsComIA,
  obterUltimosInsights,
  coletarContextoFinanceiro
};
