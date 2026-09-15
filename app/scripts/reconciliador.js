// Fase 2 — Reconciliador de fontes: o coração anti-duplicação
// Casar transações de fontes diferentes (AUVP ↔ PDF) que representam o MESMO gasto.
// Fonte primária: AUVP (mais rica — categoria, conta, tags do open banking)
// PDF vinculado como prova/representação alternativa (não gasto duplicado)
const db = require('../db');

// normalização de descrição pra comparação
function normalizarDescricao(s) {
  return String(s).toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .join(' ');
}

// similaridade de descrição (Jaccard simples sobre palavras)
function similaridade(a, b) {
  const wa = new Set(normalizarDescricao(a).split(' '));
  const wb = new Set(normalizarDescricao(b).split(' '));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w)).length;
  return inter / new Set([...wa, ...wb]).size;
}

// score de match entre duas transações: 0-100
function normParcela(p) {
  if (!p) return '';
  const m = String(p).trim().match(/^0*(\d+)\/0*(\d+)$/);
  return m ? `${m[1]}/${m[2]}` : String(p).trim();
}

function matchScore(txNova, txExistente) {
  const difVal = Math.abs(Math.abs(txNova.valor) - Math.abs(txExistente.valor));
  const pNova = normParcela(txNova.parcela), pExiste = normParcela(txExistente.parcela);

  // 1. Identidade de parcela: se ambas têm parcela, a parcela é a identidade soberana
  // Não restringe por data <= 7 porque Itaú AUVP reporta no vencimento e PDF na data de compra
  if (pNova && pExiste) {
    if (pNova !== pExiste) return 0; // N/M diferente = compras/parcelas distintas
    const totP = parseInt(((pNova || pExiste).match(/\/(\d+)/) || [])[1]) || 1;
    const tolP = Math.min(0.25, Math.max(0.12, totP * 0.01));
    if (difVal <= tolP) {
      const dN = normalizarDescricao(txNova.descricao);
      const dE = normalizarDescricao(txExistente.descricao);
      if (dN.slice(0, 8).includes(dE.slice(0, 8)) || dE.slice(0, 8).includes(dN.slice(0, 8)) || similaridade(txNova.descricao, txExistente.descricao) >= 0.25) {
        return 95;
      }
    }
    return 0;
  }

  // 2. Uma tem parcela e a outra não:
  // Bancos como Mercado Pago ou lançamentos pontuais de fatura não enviam N/M no Open Finance (AUVP).
  // Casamos se uma é AUVP e a outra é PDF/cartão (evita casar compras parceladas com compras à vista da mesma fonte)
  if ((pNova && !pExiste) || (!pNova && pExiste)) {
    const ehAuvpNova = String(txNova.fonte || '').startsWith('auvp');
    const ehAuvpExiste = String(txExistente.fonte || '').startsWith('auvp');
    if (ehAuvpNova ^ ehAuvpExiste) {
      const totP = parseInt(((pNova || pExiste).match(/\/(\d+)/) || [])[1]) || 1;
      const tolP = Math.min(0.25, Math.max(0.12, totP * 0.01));
      if (difVal <= tolP) {
        const dN = normalizarDescricao(txNova.descricao);
        const dE = normalizarDescricao(txExistente.descricao);
        const sim = similaridade(txNova.descricao, txExistente.descricao);
        const contem = (dN.length >= 5 && dE.includes(dN.slice(0, 8))) || (dE.length >= 5 && dN.includes(dE.slice(0, 8)));

        if (sim >= 0.35 || contem) {
          const difData = Math.abs((new Date(txNova.data) - new Date(txExistente.data)) / 86400000);
          if (difData <= 5) return 92;

          const txPdf = ehAuvpNova ? txExistente : txNova;
          const txAuvp = ehAuvpNova ? txNova : txExistente;
          if (txPdf.venc_fatura) {
            const [anoV, mesV] = txPdf.venc_fatura.split('-').map(Number);
            const dataA = new Date(txAuvp.data);
            const anoA = dataA.getFullYear();
            const mesA = dataA.getMonth() + 1;
            const difMeses = (anoV * 12 + mesV) - (anoA * 12 + mesA);
            if (difMeses === 1 || difMeses === 0) return 92;
          }
        }
      }
    }
    return 0;
  }

  // 3. Gastos à vista / débito / PIX
  const tolVal = Math.max(Math.abs(txExistente.valor) * 0.01, 1); // 1% ou R$ 1
  const valOk = difVal <= tolVal;
  const difData = Math.abs((new Date(txNova.data) - new Date(txExistente.data)) / 86400000);
  const dataOk = difData <= 7;
  if (!valOk || !dataOk) return 0;

  // descrição CONTIDA + valor quase igual (≤0,05) + mesma data → mesmo gasto em fontes
  const dN = normalizarDescricao(txNova.descricao), dE = normalizarDescricao(txExistente.descricao);
  if (difData <= 1 && difVal <= 0.05 && (dN.includes(dE) || dE.includes(dN))) return 90;

  // sem parcela: exige descrição parecida
  const sim = similaridade(txNova.descricao, txExistente.descricao);
  if (difData > 3 && sim < 0.4) return 0;

  let score = 50;
  if (difVal < 0.01) score += 20;
  if (difData === 0) score += 15;
  if (sim > 0.5) score += Math.round(sim * 15);
  if (txNova.tags && txExistente.tags && txNova.tags.some(t => txExistente.tags.includes(t))) score += 5;
  return score;
}

// reconciliar um lote de transações novas (de qualquer fonte) contra o banco
// dryRun=true: apenas classifica, não grava vínculos (teste read-only)
function reconciliarLote(lote, fonteNova, opts = {}) {
  const dryRun = !!opts.dryRun;
  const resultado = { fortes: [], fracos: [], novos: [], duplicadas: 0 };
  const gastosExistentes = db.prepare(`
    SELECT t.id, t.data, t.valor, t.descricao, t.fonte, t.parcela, t.venc_fatura, t.categoria, t.natureza
    FROM transacoes t
    WHERE t.natureza IN ('gasto', 'transferencia') AND t.valor < 0`).all();

  const hashExiste = new Set(db.prepare('SELECT hash_unico FROM transacoes').all().map(r => r.hash_unico));
  const insUnif = db.prepare('INSERT INTO gastos_unificados (gasto_id, fonte_origem, hash_externo) VALUES (?, ?, ?)');

  for (const t of lote) {
    // 0. duplicata exata do MESMO lote/hash? (reimport)
    const hashDeste = t.hash_unico || `${t.data}|${t.valor.toFixed(2)}|${normalizarDescricao(t.descricao).slice(0, 60)}|${t.parcela || ''}`;
    const existeExato = db.prepare('SELECT id FROM transacoes WHERE hash_unico = ?').get(hashDeste);
    if (existeExato) { resultado.duplicadas++; continue; }

    // procurar melhor match nos gastos existentes
    let melhor = null;
    for (const e of gastosExistentes) {
      const score = matchScore(t, e);
      if (score >= 85 && (!melhor || score > melhor.score)) melhor = { tx: e, score };
    }

    if (melhor && melhor.score >= 85) {
      // MATCH FORTE: vincula como prova, não insere duplicata
      if (!dryRun) {
        insUnif.run(melhor.tx.id, fonteNova, hashDeste);
        if (!melhor.tx.parcela && t.parcela) {
          try {
            db.prepare('UPDATE transacoes SET parcela=?, venc_fatura=? WHERE id=?').run(t.parcela, t.venc_fatura || null, melhor.tx.id);
            const { vincularTransacao } = require('./identidade');
            const v = vincularTransacao({ ...t, id: melhor.tx.id, venc_fatura: t.venc_fatura || null });
            if (v?.parcela_id) db.prepare('UPDATE transacoes SET parcela_id=? WHERE id=?').run(v.parcela_id, melhor.tx.id);
          } catch (e) { /* non-blocking */ }
        }
      }
      resultado.fortes.push({
        descricao: t.descricao.slice(0, 35), data: t.data, valor: t.valor,
        vinculado_como: melhor.tx.descricao.slice(0, 35), score: melhor.score,
        txNova: t, txExistente: melhor.tx
      });
      continue;
    }

    // MATCH FRACO (50-85): pode ser o mesmo gasto com descrição diferente — IA valida
    let sugestao = null;
    for (const e of gastosExistentes) {
      const score = matchScore(t, e);
      if (score >= 50 && score < 85 && (!sugestao || score > sugestao.score)) sugestao = { tx: e, score };
    }
    if (sugestao) {
      resultado.fracos.push({
        transacao: { data: t.data, valor: t.valor, descricao: t.descricao, parcela: t.parcela || null, fonte: t.fonte || fonteNova },
        pode_ser: sugestao.tx.descricao.slice(0, 35),
        pode_ser_id: sugestao.tx.id,
        score: sugestao.score
      });
      continue;
    }

    // sem match: gasto novo
    resultado.novos.push(t);
  }
  return resultado;
}

// Fase 2b: validar matches fracos via IA (lote único, uma chamada)
// retorno: { confirmados: [ {transacao, pode_ser, pode_ser_id, confianca} ], duvidosos: [...] }
async function validarFracosComIA(resultadoFracos) {
  const ia = require('./ia');
  const cfg = ia.getConfigIA();
  if (!cfg.url || !cfg.key || !cfg.model) {
    return { ok: false, erro: 'IA não configurada — fracos ficam como duvidosos', confirmados: [], duvidosos: resultadoFracos };
  }
  const pares = resultadoFracos.map(f => ({
    a: { descricao: f.transacao.descricao, valor: f.transacao.valor, data: f.transacao.data, parcela: f.transacao.parcela },
    b: { descricao: f.pode_ser, valor: f.transacao.valor, data: f.transacao.data, parcela: null },
  }));
  const r = await ia.validarParIA(pares, cfg);
  if (!r.ok) return { ok: false, erro: r.erro, confirmados: [], duvidosos: resultadoFracos };

  const confirmados = [], duvidosos = [];
  for (const res of r.resultados) {
    const f = resultadoFracos[res.i];
    if (!f) continue;
    if (res.mesmo_gasto && Number(res.confianca) >= 0.7) confirmados.push({ ...f, confianca: res.confianca, motivo: res.motivo });
    else duvidosos.push({ ...f, motivo_ia: res.motivo });
  }
  return { ok: true, confirmados, duvidosos };
}

// inserir os aprovados (novos + fracos aprovados)
function inserirAprovados(lote, fonteNova, importacaoId) {
  const insTx = db.prepare(`INSERT OR IGNORE INTO transacoes
    (data, valor, descricao, fonte, natureza, categoria, tags, parcela, hash_unico, importacao_id)
    VALUES (@data, @valor, @descricao, @fonte, @natureza, @categoria, @tags, @parcela, @hash_unico, @importacao_id)`);
  let inseridas = 0;
  for (const t of lote) {
    const natureza = t.natureza || (t.valor < 0 ? 'gasto' : 'entrada');
    const hashDeste = t.hash_unico || require('./parse-extrato').hashTx(t.data, t.valor, t.descricao);
    const r = insTx.run({
      data: t.data, valor: t.valor, descricao: t.descricao, fonte: fonteNova,
      natureza, categoria: t.categoria || null, tags: null, parcela: t.parcela || null,
      hash_unico: hashDeste, importacao_id: importacaoId
    });
    if (r.changes > 0) inseridas++;
  }
  return inseridas;
}

module.exports = { normalizarDescricao, similaridade, matchScore, reconciliarLote, validarFracosComIA, inserirAprovados };