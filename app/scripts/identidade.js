// Fase 1 — Motor de identidade de compras: fonte de verdade única multi-fonte
// Princípios (PROJETO.md §9):
//   1. Valor EXATO (±0,01) entre fontes de banco (AUVP/PDF/CSV). Tolerância só manual×banco.
//   2. Fonte como sinal: mesma fonte + mesmo N + venc diferente = compras PARALELAS (separa);
//      fontes diferentes + mesmo N + mesmo venc = MESMA compra (mescla).
//   3. Mês da fatura = mês do vencimento (venc_fatura é a âncora da projeção).
//   4. Unidade de verdade = parcela. Compra é o contêiner da série.
const db = require('../db');

// normalização de estabelecimento: maiúsculas, só alfanuméricos, sem espaços
// ("FOTON MATERIAI" casa com "FOTONMATERIAI"; "VET CENTERPRES" com "VETCENTERPRES")
function normEst(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\d{1,2}\/\d{1,2}\b/g, '')          // remove "02/02" do fim
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

// extrai N/M de "1/2", "02/02", "Parcela 1 de 2", "PARC 02/10"
// VALIDA N <= M e M <= 48: "30/04" é DATA (30 de abril), não parcela — rejeita
function parseParcela(p) {
  if (!p) return null;
  const m = String(p).match(/(?:\bparc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|\bde\b)\s*(\d{1,2})\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10), total = parseInt(m[2], 10);
  if (n < 1 || total < 1 || n > total || total > 48) return null; // N > M = data, não parcela; total > 48 = código/ano
  return { n, total };
}

// Extrai e limpa a parcela contida em uma descrição de transação bancária/cartão
function extrairParcelaDescricao(desc, fonte) {
  if (!desc) return { descricao: '', parcela: null };
  let d = String(desc).trim();
  // Se for conta corrente ou PIX, datas como "02/02" ou "31/08" no final são datas de transação, NÃO parcelas
  if (/^PIX\b/i.test(d) || (fonte && /bank|conta/i.test(fonte))) {
    return { descricao: d, parcela: null };
  }
  const m = d.match(/(?:\bparc(?:ela)?\.?\s*|\(|\b)?(\d{1,2})\s*(?:\/|\bde\b)\s*(\d{1,2})(?:\)|\b)/i);
  if (m) {
    const n = parseInt(m[1], 10), total = parseInt(m[2], 10);
    if (n >= 1 && total >= 1 && n <= total && total <= 48) {
      const limpa = d.replace(/(?:\s*[-–]\s*)?(?:\bparc(?:ela)?\.?\s*|\()?\s*0*(\d{1,2})\s*(?:\/|\bde\b)\s*0*(\d{1,2})\)?/i, ' ').replace(/\s+/g, ' ').trim();
      return { descricao: limpa, parcela: `${n}/${total}` };
    }
  }
  return { descricao: d, parcela: null };
}

// vencimento da fatura em YYYY-MM (aceita YYYY-MM-DD, DD-MM-YYYY, MM-YYYY, YYYY-M)
function normVenc(v) {
  if (!v) return null;
  let s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})-(\d{4})$/);
  if (m) return `${m[2]}-${String(parseInt(m[1])).padStart(2, '0')}`;
  return null;
}

function tolValor(est, total) {
  // Para parcelamentos no Brasil, a diferença de centavos entre a 1ª parcela e as demais
  // é de até 1 centavo por parcela no arredondamento da divisão (ex: 15x de 66,27 vs 66,37; 21x de 447,17 vs 446,96; Hully 175,40 vs 175,39).
  return Math.min(0.25, Math.max(0.12, (total || 1) * 0.01));
}

// procura parcela existente que represente a MESMA cobrança da transação nova
// critérios: valor exato ±0,01 (ou tolValor) + mesmo N + estabelecimento compatível.
// REGRA DE PARALELAS: o MESMO N em vencimentos DIFERENTES (ambos cobrados) = compra paralela (não casa).
// Parcelas agendadas (estimadas) casam com a nova evidência de fatura real.
function casarParcela(tx) {
  const pp = parseParcela(tx.parcela);
  if (!pp) return null;
  const est = normEst(tx.descricao);
  const venc = normVenc(tx.venc_fatura);
  const valor = Math.round(Math.abs(tx.valor) * 100) / 100;
  const tol = tolValor(est, pp.total);
  const rows = db.prepare(`
    SELECT p.id, p.compra_id, p.n, p.vencimento, p.status, c.estabelecimento, c.valor_parcela
    FROM parcelas p JOIN compras c ON c.id = p.compra_id
    WHERE p.n = ? AND ABS(c.valor_parcela - ?) <= ?`).all(pp.n, valor, tol);
  if (!rows.length) return null;

  // Filtra por estabelecimento compatível (contém bidirecional)
  const compativeis = rows.filter(r => {
    if (!est) return true;
    const ce = String(r.estabelecimento || '');
    return ce.includes(est) || est.includes(ce);
  });
  if (!compativeis.length) return null;

  // AUVP (sem venc confiável): aceita qualquer parcela compatível
  if (!venc) return compativeis[0];

  for (const r of compativeis) {
    // Se a parcela existente é apenas AGENDADA, o vencimento dela era estimativa: casa e confirma!
    if (r.status === 'agendada') return r;
    // Se já é COBRADA em vencimento diferente: paralela (não casa)
    if (r.vencimento && r.vencimento !== venc) continue;
    return r;
  }
  return null;
}

// procura compra existente que represente a MESMA série (estabelecimento + valor + n_parcelas)
// REGRA DE PARALELAS (2 sinais):
//   a) a compra JÁ TEM a parcela N COBRADA com vencimento DIFERENTE da nova
//      (mesmo N em faturas diferentes = compra paralela)
//   b) a compra JÁ TEM OUTRA parcela COBRADA com o MESMO vencimento da nova
//      (2 parcelas na mesma fatura = compras paralelas — 1 compra tem 1 parcela/fatura)
// Parcelas AGENDADAS são estimativas — não bloqueiam: a transação real atualiza.
// ESTABELECIMENTO: contém bidirecional (AUVP "FOTONMATERIAISPRE" ⊃ PDF "FOTONMATERIAI").
function casarCompra(tx) {
  const pp = parseParcela(tx.parcela);
  if (!pp) return null;
  const est = normEst(tx.descricao);
  if (!est) return null;
  const valor = Math.round(Math.abs(tx.valor) * 100) / 100;
  const tol = tolValor(est, pp.total);
  const venc = normVenc(tx.venc_fatura);
  const candidatas = db.prepare(`
    SELECT * FROM compras
    WHERE n_parcelas = ? AND ABS(valor_parcela - ?) <= ?`).all(pp.total, valor, tol);
  for (const c of candidatas) {
    // contém bidirecional: AUVP trunca/abrevia diferente do PDF
    const ce = String(c.estabelecimento || '');
    if (!(ce.includes(est) || est.includes(ce))) continue;
    const existente = db.prepare("SELECT id, vencimento, status FROM parcelas WHERE compra_id=? AND n=?").get(c.id, pp.n);
    if (existente && existente.status === 'cobrada') {
      // sinal (a): mesmo N cobrado em venc diferente → paralela
      if (venc && existente.vencimento && existente.vencimento !== venc) continue;
      return c;
    }
    // sinal (b): outra parcela cobrada no mesmo vencimento → paralela
    if (venc) {
      const outra = db.prepare("SELECT id FROM parcelas WHERE compra_id=? AND n != ? AND vencimento=? AND status='cobrada'").get(c.id, pp.n, venc);
      if (outra) continue;
    }
    return c; // agendada (estimativa) ou série contínua: casa
  }
  return null;
}

// cria compra + parcelas (agendadas) a partir de uma transação
// a parcela N da própria transação usa o venc_fatura REAL dela (se houver);
// as demais são estimadas (venc da 1ª + (n-1) meses), sempre em YYYY-MM
function criarCompra(tx) {
  const pp = parseParcela(tx.parcela);
  if (!pp) return null;
  const est = normEst(tx.descricao) || 'sem-estabelecimento';
  const valor = Math.round(Math.abs(tx.valor) * 100) / 100;
  const venc = normVenc(tx.venc_fatura);
  const r = db.prepare(`INSERT INTO compras (estabelecimento, valor_parcela, n_parcelas, mes_inicio, fonte_origem)
    VALUES (?, ?, ?, ?, ?)`).run(est, valor, pp.total, venc, tx.fonte || null);
  const compraId = Number(r.lastInsertRowid);
  const ins = db.prepare(`INSERT OR IGNORE INTO parcelas (compra_id, n, vencimento, status) VALUES (?, ?, ?, 'agendada')`);
  const fmtMes = num => `${Math.floor((num - 1) / 12)}-${String(((num - 1) % 12) + 1).padStart(2, '0')}`;
  for (let n = 1; n <= pp.total; n++) {
    let vencN = null;
    if (n === pp.n && venc) {
      vencN = venc; // parcela da própria transação: vencimento real
    } else if (venc) {
      const [y, m] = venc.split('-').map(Number);
      vencN = fmtMes(y * 12 + m + (n - pp.n));
    }
    ins.run(compraId, n, vencN);
  }
  return { compraId, parcelaId: null };
}

// status da parcela pelo vencimento vs mês atual:
//   vencimento <= mês atual → 'cobrada' (já caiu na fatura)
//   vencimento > mês atual  → 'agendada' (fatura futura — AUVP reporta antes de vencer)
//   sem vencimento          → 'agendada' (estimativa)
function statusPorVenc(venc) {
  if (!venc) return 'agendada';
  const hoje = new Date();
  const mesAtual = hoje.getFullYear() * 12 + (hoje.getMonth() + 1);
  const [y, m] = venc.split('-').map(Number);
  return (y * 12 + m) <= mesAtual ? 'cobrada' : 'agendada';
}

// registra a transação como evidência de uma parcela (cria se não existir)
// retorna { compra_id, parcela_id, criada } — criada=true se a parcela é nova
function vincularTransacao(tx) {
  const pp = parseParcela(tx.parcela);
  if (!pp) return null;
  const venc = normVenc(tx.venc_fatura);
  const status = statusPorVenc(venc);

  // 1. parcela existente (mesmo N + valor exato + venc batendo)
  const parcela = casarParcela(tx);
  if (parcela) {
    // atualiza vencimento se a nova evidência tem venc e a existente não
    if (venc && !parcela.vencimento) {
      db.prepare('UPDATE parcelas SET vencimento=? WHERE id=?').run(venc, parcela.id);
    }
    // status derivado do vencimento (nunca regride de cobrada para agendada
    // se o vencimento já passou — evidência de fatura real)
    if (parcela.status === 'agendada' && status === 'cobrada') {
      db.prepare("UPDATE parcelas SET status='cobrada' WHERE id=?").run(parcela.id);
    }
    return { compra_id: parcela.compra_id, parcela_id: parcela.id, criada: false };
  }

  // 2. compra existente (mesma série) → cria a parcela n
  const compra = casarCompra(tx);
  if (compra) {
    const r = db.prepare(`INSERT OR IGNORE INTO parcelas (compra_id, n, vencimento, status) VALUES (?, ?, ?, ?)`)
      .run(compra.id, pp.n, venc, status);
    const p = db.prepare('SELECT id FROM parcelas WHERE compra_id=? AND n=?').get(compra.id, pp.n);
    // atualiza vencimento para o REAL quando a parcela era agendada (estimativa)
    if (p && venc) {
      const atual = db.prepare('SELECT vencimento, status FROM parcelas WHERE id=?').get(p.id);
      if (atual.status === 'agendada' || !atual.vencimento) {
        db.prepare('UPDATE parcelas SET vencimento=?, status=? WHERE id=?').run(venc, status, p.id);
      }
    }
    return { compra_id: compra.id, parcela_id: p.id, criada: r.changes > 0 };
  }

  // 3. compra nova
  const nova = criarCompra(tx);
  if (!nova) return null;
  const p = db.prepare('SELECT id FROM parcelas WHERE compra_id=? AND n=?').get(nova.compraId, pp.n);
  if (p) db.prepare('UPDATE parcelas SET status=? WHERE id=?').run(status, p.id);
  return { compra_id: nova.compraId, parcela_id: p ? p.id : null, criada: true };
}

// detecta compras PARALELAS: mesma fonte + mesmo N + vencimentos diferentes
// (ex: 1/2 e 2/2 no MESMO PDF = 2 compras de R$ 282,50, não 1 série)
// retorna lista de { compra_id, n } que precisam de revisão
function detectarParalelas() {
  const rows = db.prepare(`
    SELECT t.parcela_id, t.fonte, t.venc_fatura, COUNT(DISTINCT t.venc_fatura) vencs, COUNT(*) n
    FROM transacoes t
    WHERE t.parcela_id IS NOT NULL AND t.venc_fatura IS NOT NULL
    GROUP BY t.parcela_id, t.fonte
    HAVING vencs > 1`).all();
  return rows;
}

// migração: agrupa transações parceladas existentes em compras/parcelas
// REGRA DEFINITIVA (validada com ADONAI e VET — 1 compra cada):
//   A identidade primária é (estabelecimento + valor + total).
//   O Itaú lista a parcela corrente em cada fatura (1/2 em jun, 2/2 em jul) e
//   repete a série na 1ª fatura — repetição de N em vencimentos DIFERENTES é a
//   MESMA compra (venc_fatura histórico impreciso), NÃO paralela.
//   PARALELAS REAIS: a MESMA parcela (venc + N) aparece 2x na MESMA fatura
//   (ex: 2x "ADONAI 1/2" na fatura de junho = 2 compras de R$ 214,85).
function migrar() {
  const { gruposParcelas } = require('./parcelas-futuras');
  const grupos = gruposParcelas();
  let compras = 0, parcelas = 0, vinculadas = 0, ambiguos = 0;

  const insCompra = db.prepare(`INSERT INTO compras (estabelecimento, valor_parcela, n_parcelas, mes_inicio, fonte_origem)
    VALUES (?, ?, ?, ?, ?)`);
  const insParcela = db.prepare(`INSERT OR IGNORE INTO parcelas (compra_id, n, vencimento, status) VALUES (?, ?, ?, ?)`);
  const updTx = db.prepare('UPDATE transacoes SET parcela_id=? WHERE id=?');

  const criarCompra = (est, valor, total, venc, fonte, linhas) => {
    const r = insCompra.run(est, valor, total, venc, fonte);
    const cid = Number(r.lastInsertRowid);
    compras++;
    // cria a série COMPLETA (1..total): vistas = cobrada, resto = agendada
    const nsVistos = new Set();
    for (const l of linhas) {
      const pp = parseParcela(l.parcela);
      if (!pp) continue;
      nsVistos.add(pp.n);
    }
    for (let n = 1; n <= total; n++) {
      const status = nsVistos.has(n) ? 'cobrada' : 'agendada';
      insParcela.run(cid, n, null, status);
      parcelas++;
    }
    for (const l of linhas) {
      const pp = parseParcela(l.parcela);
      if (!pp) continue;
      const p = db.prepare('SELECT id FROM parcelas WHERE compra_id=? AND n=?').get(cid, pp.n);
      if (p) {
        updTx.run(p.id, l.id);
        vinculadas++;
        if (l.venc_fatura) db.prepare('UPDATE parcelas SET vencimento=? WHERE id=?').run(l.venc_fatura, p.id);
      }
    }
    return cid;
  };

  for (const g of grupos) {
    // linhas únicas por (venc, N) — evidências de fontes diferentes com mesmo
    // (venc, N) são a MESMA parcela: agrupar antes de ordenar
    const porChave = {};
    for (const l of g.linhas) {
      const pp = parseParcela(l.parcela);
      if (!pp) continue;
      const k = `${l.venc_fatura || 'sem-venc'}|${pp.n}`;
      (porChave[k] = porChave[k] || []).push(l);
    }
    const chaves = Object.keys(porChave).sort((a, b) => {
      const [va, na] = a.split('|');
      const [vb, nb] = b.split('|');
      return na - nb || va.localeCompare(vb);
    });

    // PARALELAS REAIS: mesma (venc, N) com 2+ linhas da MESMA fonte
    // (2 transações idênticas na mesma fatura = 2 compras)
    const temParalelas = chaves.some(k => {
      const linhas = porChave[k];
      const fontes = new Set(linhas.map(l => l.fonte));
      return linhas.length > 1 && fontes.size === 1;
    });

    if (!temParalelas) {
      // 1 compra: N contíguo, venc impreciso não separa
      criarCompra(normEst(g.descricao), g.valor, g.total, g.mesFatura, g.fonte, g.linhas);
      continue;
    }

    // paralelas: separar por ocorrência da chave repetida
    ambiguos++;
    const usadas = new Set();
    const gruposLinhas = [];
    for (const k of chaves) {
      const linhas = porChave[k];
      const fontes = new Set(linhas.map(l => l.fonte));
      if (linhas.length > 1 && fontes.size === 1) {
        // separa cada ocorrência em um grupo próprio
        for (const l of linhas) {
          gruposLinhas.push([l]);
          usadas.add(l.id);
        }
      } else {
        const restantes = linhas.filter(l => !usadas.has(l.id));
        if (restantes.length) gruposLinhas.push(restantes);
      }
    }
    for (const gl of gruposLinhas) {
      criarCompra(normEst(gl[0].descricao), g.valor, g.total, gl[0].venc_fatura || g.mesFatura, gl[0].fonte, gl);
    }
  }
  return { compras, parcelas, vinculadas, grupos_ambiguos: ambiguos };
}

// Enriquecer transações do Open Finance (AUVP) que representam parcelas implícitas
// (ex.: Mercado Pago que envia o mesmo timestamp exato da compra, mesmo valor e mesReferencia consecutivo, sem N/M na descrição)
function enriquecerTransacoesAUVP(txs) {
  const grupos = {};
  for (const t of txs) {
    if (Number(t.valor) >= 0 || t.transferenciaInterna || t.ignorada) continue;
    const desc = t.descricao || '';
    const mp = desc.match(/(\d{1,2})\/(\d{1,2})/);
    if (mp && parseInt(mp[1]) <= parseInt(mp[2])) continue;
    if (!t.mesReferencia || !t.data) continue;

    const timeKey = t.data.slice(0, 16);
    const est = desc.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const k = `${t.conta || ''}|${timeKey}|${est}`;
    (grupos[k] = grupos[k] || []).push(t);
  }

  const mapa = new Map();
  for (const [k, arr] of Object.entries(grupos)) {
    const clusters = [];
    for (const t of arr) {
      const v = Math.abs(Number(t.valor));
      let c = clusters.find(cl => Math.abs(cl.base - v) <= 0.25);
      if (!c) {
        c = { base: v, items: [] };
        clusters.push(c);
      }
      c.items.push(t);
    }

    for (const c of clusters) {
      if (c.items.length > 1) {
        c.items.sort((a, b) => (a.mesReferencia || '').localeCompare(b.mesReferencia || ''));
        const total = c.items.length;
        c.items.forEach((t, idx) => {
          const n = idx + 1;
          const venc = t.mesReferencia.slice(0, 7);
          mapa.set(t.id, { parcela: `${n}/${total}`, venc_fatura: venc });
        });
      }
    }
  }
  return mapa;
}

module.exports = { normEst, parseParcela, extrairParcelaDescricao, normVenc, casarParcela, casarCompra, criarCompra, vincularTransacao, detectarParalelas, migrar, enriquecerTransacoesAUVP };
