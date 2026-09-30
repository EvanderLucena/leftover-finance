// Motor de parcelas futuras — fonte única de verdade para Projeção e Calendário de Dívidas
// REGRA VALIDADA (com usuário, usando PDFs reais de 3 bancos):
//   Cada fatura traz a parcela CORRENTE de cada compra parcelada.
//   A próxima parcela cobra na fatura SEGUINTE (1 por mês).
//   Âncora correta = MÊS DA FATURA (vencimento) em que a última parcela apareceu — extraída do import.
// AGRUPAMENTO (2º refactor pós-AUVP):
//   A identidade da compra é a SÉRIE (M total + valor + sequência de N consecutivos),
//   NÃO a descrição (PDF e AUVP escrevem diferente) e NÃO o N individual (cada N visto
//   criaria um grupo próprio → Shogun 1/5, 2/5, 3/5, 4/5 viravam 4 "dívidas" diferentes).
//   Chave de série = M + valor + janela contígua de N (N pertence à série se M e valor batem
//   e N continua a sequência vista). Descrição mais longa vence (PDFs truncam).
const db = require('../db');

function gruposParcelas() {
  const txs = db.prepare(`
    SELECT id, descricao, valor, parcela, data, fonte, importacao_id, venc_fatura FROM transacoes
    WHERE parcela IS NOT NULL AND natureza='gasto' AND valor < 0 ORDER BY data`).all();

  // 1ª passada: bucket por M + valor (tolerância ±0,20 — 1ª parcela às vezes tem IOF/juro de centavos:
  // FOTON 1/21 veio 447.37 e as demais 447.17; sem tolerância a mesma compra vira 2 séries)
  const buckets = {};
  for (const t of txs) {
    const m = String(t.parcela).match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) continue;
    const total = parseInt(m[2]);
    const valor = Math.round(Math.abs(t.valor) * 100) / 100;
    const chave = `${total}|${valor}`;
    (buckets[chave] = buckets[chave] || []).push({ t, n: parseInt(m[1]), total, valor });
  }
  // mesclar buckets com valor quase idêntico (diferença ≤0.20) E MESMA DESCRIÇÃO normalizada
  // — a tolerância de valor sozinha junta compras DIFERENTES (ADONAI 214,85 × Vet Center
  //   215,00 têm descrições diferentes → não mesclam). Mesma descrição + valor ±0,20 =
  //   mesma compra com IOF na 1ª parcela (FOTON 1/21 447,37 + 2/21..4/21 447,17).
  const normDesc = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const chaves = Object.keys(buckets);
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const [t1, v1] = chaves[i].split('|');
      const [t2, v2] = chaves[j].split('|');
      if (t1 !== t2) continue;
      if (Math.abs(parseFloat(v1) - parseFloat(v2)) > 0.20) continue;
      // descrições compatíveis: uma contém a outra (FOTONMATERIAI ⊂ FOTON MATERIAISPRE)
      const d1 = normDesc(buckets[chaves[i]][0].t.descricao);
      const d2 = normDesc(buckets[chaves[j]][0].t.descricao);
      const compat = d1.includes(d2) || d2.includes(d1);
      if (!compat) continue;
      const ns1 = new Set(buckets[chaves[i]].map(x => x.n));
      const ns2 = new Set(buckets[chaves[j]].map(x => x.n));
      // se os N's se sobrepõem OU são contíguos (1/21 + 2/21..4/21 sem overlap),
      // é a mesma série com valor de centavos divergente
      const max1 = Math.max(...ns1), min1 = Math.min(...ns1);
      const max2 = Math.max(...ns2), min2 = Math.min(...ns2);
      const overlap = [...ns1].some(n => ns2.has(n));
      const contigua = Math.abs(max1 - min2) <= 1 || Math.abs(max2 - min1) <= 1;
      if (!(overlap || contigua)) continue;
      buckets[chaves[i]].push(...buckets[chaves[j]]);
      delete buckets[chaves[j]];
    }
  }

  // 2ª passada: dentro de cada bucket, separar SÉRIES distintas (mesma M+valor podem ser
  // 2 compras iguais em paralelo — ex: 2x "Brs Negocios 1/3" com datas distantes > 45d)
  const out = [];
  for (const arr of Object.values(buckets)) {
    arr.sort((a, b) => a.n - b.n || a.t.data.localeCompare(b.t.data));
    const series = [];
    for (const item of arr) {
      const serie = series.find(s =>
        s.ns.has(item.n) ||
        (item.n >= s.maxN - 1 && item.n <= s.maxN + 2) // sequência contígua (aceita fatura repetida)
      );
      if (serie) {
        serie.ns.add(item.n);
        serie.maxN = Math.max(serie.maxN, item.n);
        if (item.t.descricao.length > serie.descricao.length) serie.descricao = item.t.descricao;
        if (item.t.importacao_id) serie.linhaComImport = item.t;
        if (item.n === serie.maxN) serie.linhaMax = item.t;
        serie.linhas.push(item.t);
      } else {
        series.push({ ns: new Set([item.n]), maxN: item.n, total: item.total, valor: item.valor, descricao: item.t.descricao, fonte: item.t.fonte, _linha: item.t, linhaComImport: item.t.importacao_id ? item.t : null, linhaMax: item.t, linhas: [item.t] });
      }
    }
    for (const s of series) {
      out.push({ descricao: s.descricao, valor: s.valor, total: s.total, max: s.maxN, fonte: s.fonte, _linha: s.linhaComImport || s._linha, _linhaMax: s.linhaMax, linhas: s.linhas });
    }
  }

  // 3ª passada: âncora = venc_fatura da parcela MAX, usando SÓ as linhas da própria série
  // (sem tolerância de valor na varredura global — ADONAI 214,85 casava com Vet Center
  //  215,00 na tolerância ±0,20 e roubava o venc_fatura de outubro!)
  for (const g of out) {
    let vencMax = null;
    for (const t of g.linhas) {
      const m = String(t.parcela).match(/(\d+)\s*\/\s*(\d+)/);
      if (!m) continue;
      const n = parseInt(m[1]);
      if (n !== g.max || parseInt(m[2]) !== g.total) continue;
      if (Math.abs(Math.abs(t.valor) - g.valor) > 0.01) continue;
      if (t.venc_fatura && (!vencMax || t.venc_fatura > vencMax)) vencMax = t.venc_fatura;
    }
    // fallback: venc_fatura de qualquer parcela da própria série
    if (!vencMax) {
      for (const t of g.linhas) {
        if (t.venc_fatura && (!vencMax || t.venc_fatura > vencMax)) vencMax = t.venc_fatura;
      }
    }
    // último fallback: data da linha max (sem normalização — melhor que nada)
    if (!vencMax && g._linhaMax && g._linhaMax.data) vencMax = g._linhaMax.data.slice(0, 7);
    g.mesFatura = vencMax;
    // normalizar: mesFatura é sempre YYYY-MM (base venc '2026-09-01' → '2026-09')
    if (g.mesFatura && /^\d{2}-\d{4}$/.test(g.mesFatura)) {
      const [mm2, yy2] = g.mesFatura.split('-').map(Number);
      g.mesFatura = `${yy2}-${String(mm2).padStart(2, '0')}`;
    }
  }
  return out;
}

// lista os compromissos futuros: [{ descricao, mes (YYYY-MM), valor }]
// NOVO MODELO (fase 1) — FONTE ÚNICA DE VERDADE: compras/parcelas.
//   - parcela com vencimento FUTURO (cobrada ou agendada) → compromisso no mês do venc
//   - parcela agendada SEM vencimento → estimada: último venc conhecido + (n - última n com venc)
//   - parcela com vencimento PASSADO → já caiu na fatura, não é compromisso futuro
// Ex: Codersuni 2/12 (venc 10) → out · 3/12 (venc 11) → nov · 4/12+ → dez em diante
function compromissosFuturos() {
  const hoje = new Date();
  const mesAtualNum = hoje.getFullYear() * 12 + (hoje.getMonth() + 1);
  const out = [];
  const fmtMes = num => `${String(((num - 1) % 12) + 1).padStart(2, '0')}-${Math.floor((num - 1) / 12)}`;

  const compras = db.prepare(`
    SELECT c.id, c.estabelecimento, c.valor_parcela, c.n_parcelas, c.fonte_origem
    FROM compras c WHERE c.cancelada = 0`).all();
  for (const c of compras) {
    const parcelas = db.prepare('SELECT n, vencimento, status FROM parcelas WHERE compra_id=? ORDER BY n').all(c.id);
    // última parcela com vencimento conhecido (âncora para estimar as sem venc)
    const comVenc = parcelas.filter(p => p.vencimento);
    let ultimaN = 0, ultimoVencNum = null;
    for (const p of comVenc) {
      const [vy, vm] = p.vencimento.split('-').map(Number);
      const vNum = vy * 12 + vm;
      if (vNum > ultimoVencNum) { ultimoVencNum = vNum; ultimaN = p.n; }
    }

    for (const p of parcelas) {
      if (p.status === 'cancelada') continue;
      let vNum = null;
      if (p.vencimento) {
        const [vy, vm] = p.vencimento.split('-').map(Number);
        vNum = vy * 12 + vm;
      } else if (ultimoVencNum !== null && p.n > ultimaN) {
        // estimativa: sequência a partir do último venc conhecido
        vNum = ultimoVencNum + (p.n - ultimaN);
      }
      if (vNum === null) continue;
      if (vNum <= mesAtualNum) continue; // já caiu na fatura — não é futuro
      out.push({ descricao: `${c.estabelecimento} (${p.n}/${c.n_parcelas})`, mes: fmtMes(vNum), valor: c.valor_parcela, fonte: c.fonte_origem });
    }
  }
  return out;
}

// calendário de dívidas: [{ descricao, restam, valor, progresso, pct, termina, fonte }] + quitadas
function calendarioDividas() {
  const hoje = new Date();
  const aY = hoje.getFullYear(), aM = hoje.getMonth() + 1;
  const mesAtualNum = aY * 12 + aM;
  const emAndamento = [];
  const quitadas = [];

  // parcelados da planilha (Leão, IPTU, Airbnb) — parcela_atual já cobrou no mês corrente
  const fixos = db.prepare(`SELECT descricao, valor, total_parcelas, parcela_atual FROM recorrencias
    WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL`).all();
  for (const p of fixos) {
    const restam = p.total_parcelas - (p.parcela_atual || 0);
    if (restam <= 0) continue;
    const totalMeses = (aY * 12 + aM - 1) + restam;
    const termina = `${String(totalMeses % 12 + 1).padStart(2, '0')}/${Math.floor(totalMeses / 12)}`;
    const totalRestante = Math.round(p.valor * restam * 100) / 100;
    emAndamento.push({
      descricao: p.descricao, restam, valor: p.valor,
      progresso: (p.parcela_atual || 0) + '/' + p.total_parcelas,
      pct: Math.round((p.parcela_atual || 0) / p.total_parcelas * 100),
      termina, tipo: 'externo', total_restante: totalRestante
    });
  }

  // parcelas de cartão — NOVO MODELO (fase 1): compras/parcelas
  const compras = db.prepare(`
    SELECT c.id, c.estabelecimento, c.valor_parcela, c.n_parcelas, c.fonte_origem
    FROM compras c WHERE c.cancelada = 0`).all();
  for (const c of compras) {
    const parcelas = db.prepare('SELECT n, vencimento, status FROM parcelas WHERE compra_id=? ORDER BY n').all(c.id);
    const comVenc = parcelas.filter(p => p.vencimento);
    if (!comVenc.length) continue;
    // última parcela com vencimento conhecido (âncora)
    let ultimaN = 0, ultimoVencNum = null;
    for (const p of comVenc) {
      const [vy, vm] = p.vencimento.split('-').map(Number);
      const vNum = vy * 12 + vm;
      if (vNum > ultimoVencNum) { ultimoVencNum = vNum; ultimaN = p.n; }
    }
    // vencimento estimado de cada parcela (real ou sequência a partir da âncora)
    const vencDe = p => {
      if (p.status === 'cancelada') return null;
      if (p.vencimento) {
        const [vy, vm] = p.vencimento.split('-').map(Number);
        return vy * 12 + vm;
      }
      if (p.n > ultimaN) return ultimoVencNum + (p.n - ultimaN);
      return null; // parcela anterior à âncora sem venc = passada (não conta)
    };
    // SEMÂNTICA DE "RESTAM": parcelas que AINDA VAI PAGAR (vencimento FUTURO).
    // Parcela com vencimento no mês ATUAL já caiu na fatura deste mês = cobrada.
    const restam = parcelas.filter(p => {
      const v = vencDe(p);
      return v !== null && v > mesAtualNum;
    }).length;
    if (restam <= 0) continue;
    // termina: última parcela a pagar (maior vencimento futuro/estimado)
    let ultimoFuturo = null;
    for (const p of parcelas) {
      const v = vencDe(p);
      if (v === null || v <= mesAtualNum) continue;
      if (!ultimoFuturo || v > ultimoFuturo) ultimoFuturo = v;
    }
    if (ultimoFuturo === null) continue;
    const termina = `${String(((ultimoFuturo - 1) % 12) + 1).padStart(2, '0')}/${Math.floor((ultimoFuturo - 1) / 12)}`;
    const [tM, tY] = termina.split('/').map(Number);
    if (tY * 12 + tM <= mesAtualNum) {
      quitadas.push({ descricao: c.estabelecimento, termina });
      continue;
    }
    const cobradas = parcelas.filter(p => {
      const v = vencDe(p);
      return v !== null && v <= mesAtualNum;
    }).length;
    const totalRestante = Math.round(c.valor_parcela * restam * 100) / 100;
    emAndamento.push({
      descricao: c.estabelecimento, restam, valor: c.valor_parcela,
      progresso: `${cobradas}/${c.n_parcelas}`,
      pct: Math.round(cobradas / c.n_parcelas * 100),
      termina, fonte: c.fonte_origem, tipo: 'cartao',
      total_restante: totalRestante
    });
  }
  emAndamento.sort((a, b) => a.termina.split('/').reverse().join('').localeCompare(b.termina.split('/').reverse().join('')));

  const totalPassivoRestante = Math.round(emAndamento.reduce((s, d) => s + (d.total_restante || 0), 0) * 100) / 100;
  const mesAlivio = meses => {
    return emAndamento.filter(d => {
      const [tM, tY] = d.termina.split('/').map(Number);
      return (tY * 12 + tM) <= (mesAtualNum + meses);
    }).reduce((s, d) => s + d.valor, 0);
  };
  const alivio3m = Math.round(mesAlivio(3) * 100) / 100;
  const alivio6m = Math.round(mesAlivio(6) * 100) / 100;
  const alivio12m = Math.round(mesAlivio(12) * 100) / 100;
  const dataQuitacaoTotal = emAndamento.length ? emAndamento[emAndamento.length - 1].termina : null;

  return {
    emAndamento,
    quitadasRecentes: quitadas,
    total_passivo_restante: totalPassivoRestante,
    alivio_3m: alivio3m,
    alivio_6m: alivio6m,
    alivio_12m: alivio12m,
    data_quitacao_total: dataQuitacaoTotal,
    total_dividas_ativas: emAndamento.length
  };
}

module.exports = { gruposParcelas, compromissosFuturos, calendarioDividas };