const express = require('express');
const path = require('node:path');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const MES_ATUAL = () => db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get().valor;
const setMesAtual = ref => db.prepare("UPDATE config SET valor=? WHERE chave='mes_atual'").run(ref);

function mesAnterior(ref) {
  const [m, y] = ref.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}
function proximoMes(ref) {
  const [m, y] = ref.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}
function getOrCreateMes(ref) {
  let m = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
  if (!m) { db.prepare('INSERT INTO meses (ref) VALUES (?)').run(ref); m = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref); }
  return m.id;
}

// fontes que representam FATURA DE CARTÃO (dinâmico via contas_bancarias)
function getFontesCartao() {
  try {
    const contas = db.prepare("SELECT instituicao, fontes, auvp_fonte FROM contas_bancarias WHERE tipo='CREDIT'").all();
    const set = new Set(['nubank', 'itau-fatura', 'mercadopago', 'auvp-mcp']);
    for (const c of contas) {
      if (c.instituicao) set.add(c.instituicao);
      if (c.auvp_fonte) set.add(c.auvp_fonte);
      try {
        const fontes = JSON.parse(c.fontes || '[]');
        fontes.forEach(f => set.add(f));
      } catch (e) {}
    }
    return Array.from(set);
  } catch (e) {
    return ['nubank', 'itau-fatura', 'mercadopago', 'auvp-mcp'];
  }
}
const sqlFontesCartao = (fontes) => `fonte IN (${(fontes || getFontesCartao()).map(() => '?').join(',')})`;

const { mapaContasExtrato, listarContas, salvarConta, autoDescobrirContas } = require('./scripts/contas');
const CONTAS_EXTRATO = new Proxy({}, {
  get(target, prop) {
    const mapa = mapaContasExtrato();
    return mapa[prop];
  },
  has(target, prop) {
    const mapa = mapaContasExtrato();
    return prop in mapa;
  },
  ownKeys(target) {
    return Object.keys(mapaContasExtrato());
  },
  getOwnPropertyDescriptor(target, prop) {
    return { enumerable: true, configurable: true, value: mapaContasExtrato()[prop] };
  }
});

function clausulasPeriodo(query) {
  let sql = '';
  const params = [];
  if (query.de) {
    if (query.de.length === 7) {
      sql += ' AND substr(data,1,7) >= ?';
      params.push(query.de);
    } else {
      sql += ' AND data >= ?';
      params.push(query.de);
    }
  }
  if (query.ate) {
    if (query.ate.length === 7) {
      sql += ' AND substr(data,1,7) <= ?';
      params.push(query.ate);
    } else {
      sql += ' AND data <= ?';
      params.push(query.ate);
    }
  }
  return { sql, params };
}

// ---------- API: contas bancárias (multi-banco) ----------
app.get('/api/contas', (req, res) => {
  try {
    const apenasAtivas = req.query.todas !== '1';
    res.json(listarContas(apenasAtivas));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.put('/api/contas/:id', (req, res) => {
  try {
    const atualizada = salvarConta(req.params.id, req.body);
    res.json({ ok: true, conta: atualizada });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/contas', (req, res) => {
  try {
    const slug = (req.body.id || req.body.nome || 'conta')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const id = req.body.id || (req.body.tipo === 'CREDIT' ? `cartao_${slug}` : `conta_${slug}`);
    const criada = salvarConta(id, { ...req.body, id });
    res.json({ ok: true, conta: criada });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ---------- API: meses ----------
app.get('/api/meses', (req, res) => {
  const meses = db.prepare('SELECT id, ref FROM meses ORDER BY ref').all();
  res.json({ meses, mes_atual: MES_ATUAL() });
});

app.get('/api/meses/proximo', (req, res) => {
  const atual = MES_ATUAL();
  const prox = proximoMes(atual);
  const existe = !!db.prepare('SELECT id FROM meses WHERE ref=?').get(prox);
  const recs = db.prepare('SELECT * FROM recorrencias WHERE ativo=1').all();
  const [m, y] = prox.split('-').map(Number);
  let contas = 0, total = 0;
  for (const r of recs) {
    let entra = true;
    if (r.periodicidade && r.periodicidade > 1 && r.data_base) {
      const b = r.data_base.split('-').map(Number);
      const k = (y - b[0]) * 12 + (m - b[1]);
      entra = k >= 0 && k % r.periodicidade === 0;
    }
    if (!entra) continue;
    if (r.tipo === 'Parcelado' && r.total_parcelas && r.parcela_atual != null) {
      if (r.parcela_atual + 1 > r.total_parcelas) continue;
    }
    contas++;
    total += Math.abs(r.valor || 0);
  }
  res.json({ ref: prox, existe, recorrencias: recs.length, contas, total });
});

app.post('/api/meses/gerar-proximo', (req, res) => {
  const atual = MES_ATUAL();
  const prox = proximoMes(atual);
  if (db.prepare('SELECT id FROM meses WHERE ref=?').get(prox)) {
    return res.status(400).json({ erro: `Mês ${prox} já existe` });
  }
  const novoId = getOrCreateMes(prox);
  const recs = db.prepare('SELECT * FROM recorrencias WHERE ativo=1').all();
  const ins = db.prepare(`INSERT INTO lancamentos (mes_id, descricao, valor, vencimento, categoria_id, pago, recorrencia_id, parcela, origem)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'gerado')`);
  let gerados = 0;
  for (const r of recs) {
    const [m, y] = prox.split('-').map(Number);
    let entra = true;
    if (r.periodicidade && r.periodicidade > 1 && r.data_base) {
      const b = r.data_base.split('-').map(Number);
      const k = (y - b[0]) * 12 + (m - b[1]);
      entra = k >= 0 && k % r.periodicidade === 0;
    }
    if (!entra) continue;
    let parcela = null;
    if (r.tipo === 'Parcelado' && r.total_parcelas && r.parcela_atual != null) {
      const proxParc = r.parcela_atual + 1;
      if (proxParc > r.total_parcelas) continue;
      parcela = `${proxParc}/${r.total_parcelas}`;
    }
    const dia = r.dia_venc || 5;
    const ultimoDiaMes = new Date(y, m, 0).getDate();
    const venc = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimoDiaMes)).padStart(2, '0')}`;
    ins.run(novoId, r.descricao, r.valor, venc, r.categoria_id, r.id, parcela);
    if (r.tipo === 'Parcelado' && parcela) {
      db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(r.parcela_atual + 1, r.id);
    }
    gerados++;
  }
  setMesAtual(prox);

  // Sincroniza faturas abertas no novo mês gerado
  try {
    const { sincronizarFaturasLancamentos } = require('./scripts/faturas-abertas');
    sincronizarFaturasLancamentos(prox);
  } catch (e) {}

  // Executa auto-conciliação inicial para o novo mês
  try {
    const { autoConciliarMes } = require('./scripts/conciliacao');
    autoConciliarMes(prox);
  } catch (e) {}

  res.json({ ok: true, novo_mes: prox, gerados });
});

app.post('/api/meses/auto-conciliar', (req, res) => {
  const { autoConciliarMes } = require('./scripts/conciliacao');
  const ref = req.body?.mes || req.query?.mes || MES_ATUAL();
  const resultado = autoConciliarMes(ref);
  res.json(resultado);
});

// ---------- API: lançamentos ----------
app.get('/api/lancamentos', (req, res) => {
  const ref = req.query.mes || MES_ATUAL();
  try {
    const { sincronizarFaturasLancamentos } = require('./scripts/faturas-abertas');
    sincronizarFaturasLancamentos(ref);
  } catch (e) {}
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
  if (!mes) return res.json([]);
  const rows = db.prepare(`SELECT l.*, c.nome categoria, t.descricao transacao_desc, t.data transacao_data, t.fonte transacao_fonte
    FROM lancamentos l
    LEFT JOIN categorias c ON c.id=l.categoria_id
    LEFT JOIN transacoes t ON t.id=l.transacao_id
    WHERE l.mes_id=? ORDER BY l.vencimento, l.id`).all(mes.id);
  for (const r of rows) r.tipo_gasto = r.categoria === 'Cartões' ? 'fatura' : (r.parcela ? 'parcela' : 'fixo');
  res.json(rows);
});

app.post('/api/lancamentos', (req, res) => {
  const { descricao, valor, vencimento, categoria, pago, parcela, observacao, mes } = req.body;
  if (!descricao || valor == null || !vencimento) return res.status(400).json({ erro: 'descricao, valor, vencimento obrigatórios' });
  const ref = mes || MES_ATUAL();
  const mesId = getOrCreateMes(ref);
  let catId = null;
  if (categoria) {
    let c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(categoria);
    if (!c) { db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(categoria); c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(categoria); }
    catId = c.id;
  }
  const r = db.prepare(`INSERT INTO lancamentos (mes_id, descricao, valor, vencimento, categoria_id, pago, parcela, observacao, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`)
    .run(mesId, descricao, valor, vencimento, catId, pago ? 1 : 0, parcela || null, observacao || null);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.put('/api/lancamentos/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ erro: 'não encontrado' });
  const b = req.body;
  let catId = l.categoria_id;
  if (b.categoria !== undefined) {
    if (b.categoria) {
      let c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(b.categoria);
      if (!c) { db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(b.categoria); c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(b.categoria); }
      catId = c.id;
    } else {
      catId = null;
    }
  } else if (b.categoria_id !== undefined) {
    catId = b.categoria_id;
  }
  const isPago = b.pago !== undefined ? (b.pago ? 1 : 0) : l.pago;
  const transacao_id = b.transacao_id !== undefined ? b.transacao_id : (isPago ? l.transacao_id : null);
  const pago_em = isPago ? (b.pago_em || l.pago_em || new Date().toISOString().slice(0, 10)) : null;

  db.prepare(`UPDATE lancamentos SET descricao=?, valor=?, vencimento=?, pago=?, pago_em=?, observacao=?, transacao_id=?,
    categoria_id=?, forma=COALESCE(?, forma), parcela=? WHERE id=?`)
    .run(
      b.descricao ?? l.descricao,
      b.valor !== undefined ? b.valor : l.valor,
      b.vencimento ?? l.vencimento,
      isPago,
      pago_em,
      b.observacao !== undefined ? b.observacao : l.observacao,
      transacao_id,
      catId,
      b.forma ?? null,
      b.parcela !== undefined ? b.parcela : l.parcela,
      l.id
    );
  res.json({ ok: true });
});

app.delete('/api/lancamentos/:id', (req, res) => {
  db.prepare('DELETE FROM lancamentos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: recorrentes ----------
app.get('/api/recorrentes', (req, res) => {
  const rows = db.prepare(`SELECT r.*, c.nome categoria FROM recorrencias r
    LEFT JOIN categorias c ON c.id=r.categoria_id ORDER BY CASE WHEN r.dia_venc IS NULL THEN 99 ELSE r.dia_venc END, r.descricao`).all();
  res.json(rows);
});

app.post('/api/recorrentes', (req, res) => {
  const { descricao, valor, dia_venc, categoria, tipo, forma, periodicidade, total_parcelas, parcela_atual, ativo, data_base, observacao, padrao_busca } = req.body;
  let catId = null;
  if (categoria) {
    let c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(categoria);
    if (!c) { db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(categoria); c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(categoria); }
    catId = c.id;
  }
  const r = db.prepare(`INSERT INTO recorrencias (descricao, valor, dia_venc, categoria_id, tipo, forma, periodicidade, total_parcelas, parcela_atual, ativo, data_base, observacao, padrao_busca)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      descricao, valor ?? null, dia_venc ?? null, catId, tipo || 'Recorrente', forma || null,
      periodicidade || 1, total_parcelas ?? null, parcela_atual ?? 0,
      ativo !== false ? 1 : 0, data_base || null, observacao || null, padrao_busca ? padrao_busca.trim() : null
    );
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.put('/api/recorrentes/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM recorrencias WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'não encontrada' });
  const b = req.body;
  let catId = r.categoria_id;
  if (b.categoria !== undefined) {
    if (b.categoria) {
      let c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(b.categoria);
      if (!c) { db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(b.categoria); c = db.prepare('SELECT id FROM categorias WHERE nome=?').get(b.categoria); }
      catId = c.id;
    } else {
      catId = null;
    }
  }
  db.prepare(`UPDATE recorrencias SET
      descricao=?, valor=?, dia_venc=?, tipo=?, forma=?, ativo=?,
      periodicidade=?, total_parcelas=?, parcela_atual=?, categoria_id=?,
      data_base=?, observacao=?, padrao_busca=?
    WHERE id=?`)
    .run(
      b.descricao ?? r.descricao,
      b.valor !== undefined ? b.valor : r.valor,
      b.dia_venc !== undefined ? b.dia_venc : r.dia_venc,
      b.tipo ?? r.tipo,
      b.forma !== undefined ? b.forma : r.forma,
      b.ativo != null ? (b.ativo ? 1 : 0) : r.ativo,
      b.periodicidade !== undefined ? b.periodicidade : r.periodicidade,
      b.total_parcelas !== undefined ? b.total_parcelas : r.total_parcelas,
      b.parcela_atual !== undefined ? b.parcela_atual : r.parcela_atual,
      catId,
      b.data_base !== undefined ? b.data_base : r.data_base,
      b.observacao !== undefined ? b.observacao : r.observacao,
      b.padrao_busca !== undefined ? (b.padrao_busca ? b.padrao_busca.trim() : null) : r.padrao_busca,
      r.id
    );
  res.json({ ok: true });
});

app.patch('/api/recorrentes/:id/toggle', (req, res) => {
  const r = db.prepare('SELECT id, ativo FROM recorrencias WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'não encontrada' });
  const novo = r.ativo ? 0 : 1;
  db.prepare('UPDATE recorrencias SET ativo=? WHERE id=?').run(novo, r.id);
  res.json({ ok: true, ativo: novo });
});

app.delete('/api/recorrentes/:id', (req, res) => {
  db.prepare('DELETE FROM recorrencias WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: categorias ----------
app.get('/api/categorias', (req, res) => {
  res.json(db.prepare('SELECT nome FROM categorias ORDER BY nome').all());
});

// ---------- API: rendas ----------
app.get('/api/rendas', (req, res) => {
  res.json(db.prepare('SELECT * FROM rendas WHERE ativo=1').all());
});
app.post('/api/rendas', (req, res) => {
  const { nome, tipo, valor_base, padrao_texto, dia_pagamento, observacao, valor_hora } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const r = db.prepare(`INSERT INTO rendas (nome, tipo, valor_base, padrao_texto, dia_pagamento, observacao, valor_hora)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(nome, tipo || 'fixa', valor_base ?? null, padrao_texto || null, dia_pagamento ?? null, observacao || null, valor_hora ?? null);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/rendas/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM rendas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'não encontrada' });
  const b = req.body;
  db.prepare(`UPDATE rendas SET nome=?, tipo=?, valor_base=?, padrao_texto=?, dia_pagamento=?, observacao=?, ativo=?, valor_hora=? WHERE id=?`)
    .run(b.nome ?? r.nome, b.tipo ?? r.tipo, b.valor_base ?? r.valor_base, b.padrao_texto ?? r.padrao_texto,
      b.dia_pagamento ?? r.dia_pagamento, b.observacao ?? r.observacao,
      b.ativo != null ? (b.ativo ? 1 : 0) : r.ativo, b.valor_hora ?? r.valor_hora, r.id);
  res.json({ ok: true });
});
app.delete('/api/rendas/:id', (req, res) => {
  db.prepare('DELETE FROM rendas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Status das rendas do mês (por fonte): estimada × realizada × pendente — alimenta o card da Visão
app.get('/api/rendas/status', (req, res) => {
  const { statusPorMes, totalRendaRealizada } = require('./scripts/renda-realizada');
  const ref = req.query.mes || MES_ATUAL();
  const [mm, aa] = ref.split('-').map(Number);
  const mesIso = `${aa}-${String(mm).padStart(2, '0')}`;
  const itens = statusPorMes(mesIso);
  res.json({
    mes: ref, mes_iso: mesIso,
    itens,
    estimada_total: Math.round(itens.reduce((s, i) => s + i.estimada, 0) * 100) / 100,
    realizada_total: Math.round(totalRendaRealizada(mesIso) * 100) / 100,
    pendente_total: Math.round(itens.reduce((s, i) => s + i.pendente, 0) * 100) / 100
  });
});

// Lançar renda manual (ex: Cooper caiu, AUVP ainda não trouxe) — cria transação salario + rendas_realizadas
app.post(['/api/rendas/lancar-manual', '/api/rendas/lançar-manual'], (req, res) => {
  const { renda_id, valor, data, observacao } = req.body || {};
  const r = db.prepare('SELECT * FROM rendas WHERE id=?').get(renda_id);
  if (!r) return res.status(400).json({ erro: 'renda_id inválido' });
  const v = Number(valor);
  if (!isFinite(v) || v <= 0) return res.status(400).json({ erro: 'valor inválido' });
  const dataIso = (data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const mesIso = dataIso.slice(0, 7);
  const descricao = observacao || `${r.nome} (lançamento manual — banco real caiu antes do open finance)`;

  // hash estável de fonte manual para dedupe (re-exportação AUVP da mesma TED casa pela descrição/valor)
  const hash = `manual-renda-${r.id}-${mesIso}`;
  const existente = db.prepare('SELECT id FROM transacoes WHERE hash_unico=?').get(hash);
  if (existente) return res.status(409).json({ erro: 'Renda deste mês já foi lançada manualmente (transação #' + existente.id + ')' });

  let txId = null;
  db.exec('BEGIN');
  try {
    const ins = db.prepare(`INSERT INTO transacoes (data, valor, descricao, natureza, categoria, fonte, hash_unico, observacao)
      VALUES (?, ?, ?, 'salario', 'Salário', 'manual', ?, ?)`);
    const rr = ins.run(dataIso, v, descricao, hash, `${r.nome} — lançado manualmente em ${new Date().toISOString().slice(0, 10)} (confirmado pelo usuário antes da AUVP)`);
    txId = Number(rr.lastInsertRowid);
    const { gravarRendaRealizada } = require('./scripts/renda-realizada');
    // nome específico da fonte: 'Salário Coopersystem' → 'Coopersystem' (colide menos em UNIQUE(mes,descricao)
    // com futuros registros da AUVP/PDF, que usam a regra detectada 'Cooper')
    const nomeFonte = r.nome.replace(/^Salário\s+/i, '');
    gravarRendaRealizada(mesIso, descricao, Math.abs(v), txId, nomeFonte);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ erro: e.message });
  }
  res.json({
    ok: true, transacao_id: txId, mes: mesIso,
    aviso: 'Se a AUVP trouxer a mesma TED depois, a conciliação marca como idêntica — o hash manual evita dupla contagem em pendentes, mas confira na prévia antes de aprovar'
  });
});

// ---------- API: dashboard (agenda/contas do mês) ----------
app.get('/api/dashboard', (req, res) => {
  const ref = MES_ATUAL();
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
  if (!mes) return res.json({});
  const lancamentos = db.prepare(`SELECT l.*, c.nome categoria FROM lancamentos l
    LEFT JOIN categorias c ON c.id=l.categoria_id WHERE l.mes_id=? ORDER BY l.vencimento`).all(mes.id);
  const total = lancamentos.reduce((s, l) => s + Math.abs(l.valor), 0);
  const pago = lancamentos.filter(l => l.pago).reduce((s, l) => s + Math.abs(l.valor), 0);
  const proximos = lancamentos.filter(l => !l.pago).slice(0, 5).map(l => ({ descricao: l.descricao, vencimento: l.vencimento, valor: l.valor }));
  res.json({ ref, lancamentos, total, pago, proximos });
});

const insTx = db.prepare(`INSERT OR IGNORE INTO transacoes
  (data, valor, descricao, fonte, natureza, categoria, tags, parcela, hash_unico, importacao_id, venc_fatura, observacao)
  VALUES (@data, @valor, @descricao, @fonte, @natureza, @categoria, @tags, @parcela, @hash_unico, @importacao_id, @venc_fatura, @observacao)`);

const { aplicarRegras } = require('./scripts/motor-regras');
const { parseCSV } = require('./scripts/parse-extrato');

app.post('/api/importar-texto', (req, res) => {
  try {
    const tipo = req.body.tipo || 'extrato';
    const texto = req.body.texto || '';
    const { parseData, parseNumBR } = require('./scripts/parse-extrato');
    const transacoes = texto.split(/\r?\n/).filter(l => l.trim()).map(l => {
      const m = l.split(/[;\t,]/).map(s => s.trim());
      const data = parseData(m[0]);
      const descricao = m[1] || '';
      const valor = parseNumBR(m[2]);
      return { data, descricao, valor };
    }).filter(t => t.data && t.descricao);
    const r = db.prepare(`INSERT INTO importacoes (tipo, linhas, resumo) VALUES (?, ?, ?)`)
      .run(tipo || 'fatura', transacoes.length, JSON.stringify(transacoes.slice(0, 50)));
    res.json({ ok: true, importacao_id: Number(r.lastInsertRowid), transacoes });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

function processarImportacaoBuffer(buffer, fonte, arquivo) {
  const nomeArq = arquivo || fonte || '';
  const anterior = db.prepare(`SELECT id, data_importacao FROM importacoes WHERE arquivo = ? ORDER BY id DESC LIMIT 1`).get(nomeArq);
  const jaImportado = !!anterior;
  const { superParsePDF } = require('./scripts/super-parser');
  const { recategorizar } = require('./scripts/regras-seed');

  return superParsePDF(buffer, { nomeArq, fonte, anoFatura: new Date().getFullYear() }).then(parsed => {
    const isFatura = parsed.isFatura;
    const bancoFonte = parsed.bancoFonte;
    const formato = parsed.formato;
    let txs, resumoExtra = {};
    if (isFatura) {
      txs = (parsed.transacoes || []).filter(t => !t.futura);
      resumoExtra = { venc: parsed.vencimento, total: parsed.total, parcelas_futuras: (parsed.proximas || []).length, metodo: parsed.metodo };
      if (parsed.vencimento) {
        const vencMes = parsed.vencimento.slice(0, 7);
        for (const t of txs) {
          if (t.parcela && !t.venc_fatura) t.venc_fatura = vencMes;
          if (t.parcela && parsed.vencimento && t.data !== parsed.vencimento) {
            t.observacao = t.observacao ? `${t.observacao} · Compra original: ${t.data}` : `Compra original: ${t.data}`;
            t.data = parsed.vencimento;
          }
        }
      }
    } else {
      txs = Array.isArray(parsed) ? parsed : (parsed.transacoes || []);
      resumoExtra = { metodo: parsed.metodo || 'fastpath' };
    }

    const imp = db.prepare(`INSERT INTO importacoes (tipo, arquivo, linhas, resumo) VALUES (?, ?, ?, ?)`)
      .run(isFatura ? 'fatura' : 'extrato', nomeArq, txs.length, JSON.stringify(resumoExtra));
    const impId = Number(imp.lastInsertRowid);

    const { reconciliarLote } = require('./scripts/reconciliador');
    const fonteTag = `pdf-${bancoFonte}`;
    const reconciliacao = reconciliarLote(txs.map(t => ({ ...t, hash_unico: t.hash_unico })), fonteTag);
    const txsNovas = txs.filter(t => !reconciliacao.fortes.some(f => Math.abs(f.valor - t.valor) < 0.01 && f.descricao.slice(0, 20) === t.descricao.slice(0, 20)));

    let inseridas = 0, duplicadas = 0;
    const { vincularTransacao } = require('./scripts/identidade');
    for (const t of txsNovas) {
      const natureza = t.natureza || (t.valor < 0 ? 'gasto' : 'entrada');
      const r = insTx.run({
        data: t.data, valor: t.valor, descricao: t.descricao,
        fonte: t.fonte || bancoFonte,
        natureza, categoria: null, tags: null, parcela: t.parcela || null,
        hash_unico: t.hash_unico, importacao_id: impId, venc_fatura: t.venc_fatura || null,
        observacao: t.observacao || null
      });
      if (r.changes > 0) {
        inseridas++;
        // Fase 1: vincula a transação à compra/parcela (fonte de verdade única)
        if (t.parcela) {
          try {
            const txId = Number(r.lastInsertRowid);
            const vinculo = vincularTransacao({ ...t, id: txId, venc_fatura: t.venc_fatura || null });
            if (vinculo && vinculo.parcela_id) {
              db.prepare('UPDATE transacoes SET parcela_id=? WHERE id=?').run(vinculo.parcela_id, txId);
            }
          } catch (e) { /* identidade não bloqueia import */ }
        }
      } else duplicadas++;
    }

    recategorizar();
    try {
      const { autoConciliarMes } = require('./scripts/conciliacao');
      autoConciliarMes(MES_ATUAL());
    } catch (e) {}

    return { formato, inseridas, duplicadas, jaImportado, importacao_anterior: anterior ? anterior.data_importacao : null, ...resumoExtra };
  });
}

app.post('/api/extratos/importar-pdf', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  try {
    const fonte = req.query.fonte || req.headers['x-fonte'] || 'importado';
    const arquivo = req.headers['x-arquivo'] || 'sem-nome.pdf';
    processarImportacaoBuffer(req.body, fonte, arquivo)
      .then(r => {
        try {
          const { gerarInsightsComIA } = require('./scripts/insights-ia');
          gerarInsightsComIA(true).catch(() => {});
        } catch (e) {}
        res.json({ ok: true, ...r });
      })
      .catch(e => res.status(500).json({ erro: e.message }));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

function processarImportacao(texto, fonte) {
  const { formato, transacoes } = parseCSV(texto, fonte);
  if (!transacoes.length) return { formato, inseridas: 0, duplicadas: 0, erro: 'nenhuma transação reconhecida' };
  const imp = db.prepare(`INSERT INTO importacoes (tipo, arquivo, linhas, resumo) VALUES ('extrato', ?, ?, ?)`)
    .run(fonte, transacoes.length, `formato=${formato}`);
  const impId = Number(imp.lastInsertRowid);
  const comRegras = aplicarRegras(transacoes);
  const { reconciliarLote } = require('./scripts/reconciliador');
  const reconciliacao = reconciliarLote(comRegras.map(t => ({ ...t, hash_unico: t.hash_unico })), 'csv-' + fonte);
  const fortes = reconciliacao.fortes;
  let inseridas = 0, duplicadas = 0, vinculadas = 0;
  const { vincularTransacao } = require('./scripts/identidade');
  for (const t of comRegras) {
    const forte = fortes.find(f => Math.abs(f.valor - Math.abs(t.valor)) < 0.01 && f.descricao.slice(0, 20) === t.descricao.slice(0, 20));
    if (forte) { vinculadas++; continue; }
    const r = insTx.run({
      data: t.data, valor: t.valor, descricao: t.descricao, fonte: t.fonte,
      natureza: t.natureza || 'gasto', categoria: t.categoria || null,
      tags: t.tags || null, parcela: t.parcela || null,
      hash_unico: t.hash_unico, importacao_id: impId, venc_fatura: t.venc_fatura || null
    });
    if (r.changes > 0) {
      inseridas++;
      if (t.parcela) {
        try {
          const txId = Number(r.lastInsertRowid);
          const vinculo = vincularTransacao({ ...t, id: txId, venc_fatura: t.venc_fatura || null });
          if (vinculo && vinculo.parcela_id) {
            db.prepare('UPDATE transacoes SET parcela_id=? WHERE id=?').run(vinculo.parcela_id, txId);
          }
        } catch (e) { /* identidade não bloqueia import */ }
      }
    } else duplicadas++;
  }
  return { formato, inseridas, duplicadas, vinculadas };
}

app.post('/api/extratos/importar', (req, res) => {
  // CSV desativado (decisão 10/09/2026): fontes oficiais são PDF + AUVP.
  // O código de parseCSV permanece para leitura de dados já importados.
  res.status(400).json({ erro: 'Importação CSV desativada — use PDF (fatura/extrato) ou AUVP (open banking)' });
});

// ---------- API: transações ----------
app.get('/api/transacoes', async (req, res) => {
  const { mes, fonte, conta, natureza, categoria, sem_categoria, apenas_parceladas, min_valor, busca } = req.query;
  let sql = 'SELECT * FROM transacoes WHERE 1=1';
  const params = [];
  if (mes) { sql += ' AND substr(data,1,7) = ?'; params.push(mes); }
  if (fonte) { sql += ' AND fonte = ?'; params.push(fonte); }
  if (conta && conta !== 'todas' && CONTAS_EXTRATO[conta]) {
    const cfg = CONTAS_EXTRATO[conta];
    const alts = [];
    if (cfg.fontes && cfg.fontes.length) { alts.push(`fonte IN (${cfg.fontes.map(() => '?').join(',')})`); params.push(...cfg.fontes); }
    if (cfg.auvpFonte && cfg.contaAuvp) { alts.push(`(fonte = ? AND conta = ?)`); params.push(cfg.auvpFonte, cfg.contaAuvp); }
    if (alts.length) sql += ` AND (${alts.join(' OR ')})`;
  }
  if (natureza) {
    if (natureza === 'gasto') {
      sql += " AND (natureza = 'gasto' OR (natureza IS NULL AND valor < 0))";
    } else if (natureza === 'entrada') {
      sql += " AND (natureza IN ('entrada', 'salario', 'rendimento') OR (natureza IS NULL AND valor > 0))";
    } else {
      sql += " AND natureza = ?"; params.push(natureza);
    }
  }
  if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
  if (sem_categoria === '1') { sql += " AND (categoria IS NULL OR categoria = '' OR categoria = '(sem categoria)')"; }
  if (apenas_parceladas === '1') { sql += " AND parcela IS NOT NULL AND parcela != ''"; }
  if (min_valor) { sql += ' AND ABS(valor) >= ?'; params.push(Number(min_valor)); }
  if (busca) {
    sql += ' AND (descricao LIKE ? OR observacao LIKE ?)';
    params.push('%' + busca + '%', '%' + busca + '%');
  }
  const per = clausulasPeriodo(req.query);
  sql += per.sql; params.push(...per.params);
  sql += ' ORDER BY data DESC, id DESC LIMIT 5000';
  let rows = db.prepare(sql).all(...params);

  if (conta && conta !== 'todas' && CONTAS_EXTRATO[conta]) {
    try {
      const cfg = CONTAS_EXTRATO[conta];
      const { saldosAUVP } = require('./scripts/saldos');
      const s = await saldosAUVP().catch(() => ({ saldos: [] }));
      const saldoConta = (s.saldos || []).find(x => x.nome === cfg.saldoAuvp && x.tipo === cfg.tipo) || (s.saldos || []).find(x => x.nome === cfg.saldoAuvp);
      if (saldoConta) {
        let acumulado = saldoConta.valor;
        rows = rows.map(t => {
          const saldoApos = acumulado;
          acumulado -= t.valor;
          return { ...t, saldo_apos: Math.round(saldoApos * 100) / 100 };
        });
      }
    } catch (e) { /* fallback sem saldo_apos */ }
  }

  res.json(rows);
});

// ---------- API: resumo analítico do extrato ----------
app.get('/api/extratos/resumo', async (req, res) => {
  try {
    const { mes, fonte, conta, natureza, categoria, sem_categoria, apenas_parceladas, min_valor, busca } = req.query;
    let baseSql = 'FROM transacoes WHERE 1=1';
    const params = [];
    if (mes) { baseSql += ' AND substr(data,1,7) = ?'; params.push(mes); }
    if (fonte) { baseSql += ' AND fonte = ?'; params.push(fonte); }
    if (conta && conta !== 'todas' && CONTAS_EXTRATO[conta]) {
      const cfg = CONTAS_EXTRATO[conta];
      const alts = [];
      if (cfg.fontes && cfg.fontes.length) { alts.push(`fonte IN (${cfg.fontes.map(() => '?').join(',')})`); params.push(...cfg.fontes); }
      if (cfg.auvpFonte && cfg.contaAuvp) { alts.push(`(fonte = ? AND conta = ?)`); params.push(cfg.auvpFonte, cfg.contaAuvp); }
      if (alts.length) baseSql += ` AND (${alts.join(' OR ')})`;
    }
    if (natureza) {
      if (natureza === 'gasto') baseSql += " AND (natureza = 'gasto' OR (natureza IS NULL AND valor < 0))";
      else if (natureza === 'entrada') baseSql += " AND (natureza IN ('entrada', 'salario', 'rendimento') OR (natureza IS NULL AND valor > 0))";
      else { baseSql += " AND natureza = ?"; params.push(natureza); }
    }
    if (categoria) { baseSql += ' AND categoria = ?'; params.push(categoria); }
    if (sem_categoria === '1') { baseSql += " AND (categoria IS NULL OR categoria = '' OR categoria = '(sem categoria)')"; }
    if (apenas_parceladas === '1') { baseSql += " AND parcela IS NOT NULL AND parcela != ''"; }
    if (min_valor) { baseSql += ' AND ABS(valor) >= ?'; params.push(Number(min_valor)); }
    if (busca) {
      baseSql += ' AND (descricao LIKE ? OR observacao LIKE ?)';
      params.push('%' + busca + '%', '%' + busca + '%');
    }
    const per = clausulasPeriodo(req.query);
    baseSql += per.sql; params.push(...per.params);

    const totaisSql = `
      SELECT 
        COUNT(*) as total_transacoes,
        SUM(CASE WHEN valor < 0 AND natureza = 'gasto' THEN ABS(valor) ELSE 0 END) as total_gastos,
        SUM(CASE WHEN valor > 0 AND natureza IN ('entrada', 'salario', 'rendimento') THEN valor ELSE 0 END) as total_entradas,
        SUM(CASE WHEN natureza = 'transferencia' THEN ABS(valor) ELSE 0 END) as total_faturas,
        SUM(CASE WHEN natureza = 'transferencia-propria' THEN ABS(valor) ELSE 0 END) as total_entre_contas,
        SUM(CASE WHEN natureza = 'ignorado' THEN ABS(valor) ELSE 0 END) as total_ignorados,
        SUM(CASE WHEN categoria IS NULL OR categoria = '' OR categoria = '(sem categoria)' THEN 1 ELSE 0 END) as sem_categoria_count
      ${baseSql}
    `;
    const resumoTotais = db.prepare(totaisSql).get(...params) || {};

    const totalGastos = Math.round((resumoTotais.total_gastos || 0) * 100) / 100;
    const totalEntradas = Math.round((resumoTotais.total_entradas || 0) * 100) / 100;

    const topCatSql = `
      SELECT COALESCE(NULLIF(categoria, ''), '(sem categoria)') as cat,
             SUM(ABS(valor)) as total,
             COUNT(*) as n
      ${baseSql} AND natureza = 'gasto'
      GROUP BY cat
      ORDER BY total DESC
      LIMIT 6
    `;
    const topCategorias = db.prepare(topCatSql).all(...params).map(c => ({
      categoria: c.cat,
      total: Math.round(c.total * 100) / 100,
      n: c.n,
      pct: totalGastos > 0 ? Math.round((c.total / totalGastos) * 100) : 0
    }));

    const topEstSql = `
      SELECT descricao,
             SUM(ABS(valor)) as total,
             COUNT(*) as n
      ${baseSql} AND natureza = 'gasto'
      GROUP BY descricao
      ORDER BY total DESC
      LIMIT 6
    `;
    const topEstabelecimentos = db.prepare(topEstSql).all(...params).map(e => ({
      descricao: e.descricao,
      total: Math.round(e.total * 100) / 100,
      n: e.n
    }));

    // Timeline de meses: para contexto visual e navegação, nunca retorna além do mês atual/ate,
    // e se for um recorte multi-mês (ex: 3m, 6m), respeita a faixa; se for 'tudo' ou 1 mês só,
    // traz até os últimos 12 meses históricos para manter comparativo e cliques ativos.
    let timelineBaseSql = 'FROM transacoes WHERE 1=1';
    const timelineParams = [];
    if (fonte) { timelineBaseSql += ' AND fonte = ?'; timelineParams.push(fonte); }
    if (conta && conta !== 'todas' && CONTAS_EXTRATO[conta]) {
      const cfg = CONTAS_EXTRATO[conta];
      const alts = [];
      if (cfg.fontes && cfg.fontes.length) { alts.push(`fonte IN (${cfg.fontes.map(() => '?').join(',')})`); timelineParams.push(...cfg.fontes); }
      if (cfg.auvpFonte && cfg.contaAuvp) { alts.push(`(fonte = ? AND conta = ?)`); timelineParams.push(cfg.auvpFonte, cfg.contaAuvp); }
      if (alts.length) timelineBaseSql += ` AND (${alts.join(' OR ')})`;
    }
    if (natureza) {
      if (natureza === 'gasto') timelineBaseSql += " AND (natureza = 'gasto' OR (natureza IS NULL AND valor < 0))";
      else if (natureza === 'entrada') timelineBaseSql += " AND (natureza IN ('entrada', 'salario', 'rendimento') OR (natureza IS NULL AND valor > 0))";
      else { timelineBaseSql += " AND natureza = ?"; timelineParams.push(natureza); }
    }
    if (categoria) { timelineBaseSql += ' AND categoria = ?'; timelineParams.push(categoria); }
    if (sem_categoria === '1') { timelineBaseSql += " AND (categoria IS NULL OR categoria = '' OR categoria = '(sem categoria)')"; }
    if (apenas_parceladas === '1') { timelineBaseSql += " AND parcela IS NOT NULL AND parcela != ''"; }
    if (min_valor) { timelineBaseSql += ' AND ABS(valor) >= ?'; timelineParams.push(Number(min_valor)); }
    if (busca) {
      timelineBaseSql += ' AND (descricao LIKE ? OR observacao LIKE ?)';
      timelineParams.push('%' + busca + '%', '%' + busca + '%');
    }

    const mesMaxIso = req.query.ate || new Date().toISOString().slice(0, 7);
    timelineBaseSql += ' AND substr(data, 1, 7) <= ?';
    timelineParams.push(mesMaxIso);

    if (req.query.de && req.query.ate && req.query.de !== req.query.ate) {
      timelineBaseSql += ' AND substr(data, 1, 7) >= ?';
      timelineParams.push(req.query.de);
    }

    const timelineSql = `
      SELECT substr(data, 1, 7) as mes,
             SUM(CASE WHEN valor < 0 AND natureza = 'gasto' THEN ABS(valor) ELSE 0 END) as gastos,
             SUM(CASE WHEN valor > 0 AND natureza IN ('entrada', 'salario', 'rendimento') THEN valor ELSE 0 END) as entradas
      ${timelineBaseSql}
      GROUP BY mes
      ORDER BY mes ASC
    `;
    let timeline = db.prepare(timelineSql).all(...timelineParams).map(m => ({
      label: m.mes,
      gastos: Math.round(m.gastos * 100) / 100,
      entradas: Math.round(m.entradas * 100) / 100
    }));
    if (timeline.length > 12) {
      timeline = timeline.slice(-12);
    }

    const { saldosAUVP } = require('./scripts/saldos');
    const saldos = await saldosAUVP().catch(() => ({ saldos: [] }));
    const todas = saldos.saldos || [];
    const saldoDisponivel = todas.filter(s => s.tipo === 'BANK').reduce((s, c) => s + c.valor, 0);
    const faturasAbertas = todas.filter(s => s.tipo === 'CREDIT' && s.valor < 0).reduce((s, c) => s + Math.abs(c.valor), 0);

    res.json({
      totais: {
        total_transacoes: resumoTotais.total_transacoes || 0,
        total_gastos: totalGastos,
        total_entradas: totalEntradas,
        saldo_periodo: Math.round((totalEntradas - totalGastos) * 100) / 100,
        total_faturas: Math.round((resumoTotais.total_faturas || 0) * 100) / 100,
        total_entre_contas: Math.round((resumoTotais.total_entre_contas || 0) * 100) / 100,
        total_ignorados: Math.round((resumoTotais.total_ignorados || 0) * 100) / 100,
        sem_categoria_count: resumoTotais.sem_categoria_count || 0
      },
      top_categorias: topCategorias,
      top_estabelecimentos: topEstabelecimentos,
      timeline,
      saldos: {
        quando: saldos.quando,
        saldo_disponivel: Math.round(saldoDisponivel * 100) / 100,
        faturas_abertas: Math.round(faturasAbertas * 100) / 100,
        saldo_liquido: Math.round((saldoDisponivel - faturasAbertas) * 100) / 100,
        contas: todas.map(c => ({ nome: c.nome, tipo: c.tipo, valor: c.valor, icone: c.icone }))
      }
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put('/api/transacoes/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM transacoes WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ erro: 'não encontrada' });
  const b = req.body;
  db.prepare('UPDATE transacoes SET categoria=COALESCE(?, categoria), natureza=COALESCE(?, natureza), observacao=COALESCE(?, observacao) WHERE id=?')
    .run(b.categoria ?? null, b.natureza ?? null, b.observacao ?? null, t.id);

  let retroAplicadas = 0;
  if (b.salvar_regra !== false && b.categoria) {
    const existente = db.prepare('SELECT id FROM regras WHERE padrao=?').get(t.descricao);
    if (!existente) {
      db.prepare('INSERT INTO regras (padrao, categoria, prioridade) VALUES (?, ?, 50)').run(t.descricao, b.categoria);
    } else {
      db.prepare('UPDATE regras SET categoria=? WHERE id=?').run(b.categoria, existente.id);
    }
    // Propaga retroativamente para outras transações sem categoria com mesma descrição
    const r = db.prepare("UPDATE transacoes SET categoria=? WHERE descricao=? AND (categoria IS NULL OR categoria='' OR categoria='(sem categoria)')").run(b.categoria, t.descricao);
    retroAplicadas = r.changes;
  }
  res.json({ ok: true, retro_aplicadas: retroAplicadas });
});

// ---------- API: regras ----------
app.get('/api/regras', (req, res) => {
  res.json(db.prepare('SELECT * FROM regras WHERE ativa=1 ORDER BY prioridade').all());
});
app.delete('/api/regras/:id', (req, res) => {
  db.prepare('DELETE FROM regras WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: Conciliação bancária v2 ----------
const conciliacao = require('./scripts/conciliacao');
app.get('/api/conciliar', (req, res) => {
  res.json(conciliacao.conciliar());
});
app.post('/api/conciliar/confirmar', (req, res) => {
  res.json(conciliacao.confirmar(req.body));
});
app.get('/api/conciliar/padroes', (req, res) => {
  res.json(db.prepare('SELECT * FROM conciliacoes_confirmadas ORDER BY confirmacoes DESC').all());
});

// ---------- API: evolução de cartão ----------
app.get('/api/evolucao-cartao', (req, res) => {
  const fonte = req.query.fonte;
  const fontesCartao = getFontesCartao();
  let sql = `SELECT substr(data,1,7) mes, fonte,
    SUM(CASE WHEN parcela IS NULL THEN ABS(valor) ELSE 0 END) avista,
    SUM(CASE WHEN parcela IS NOT NULL THEN ABS(valor) ELSE 0 END) parc,
    SUM(ABS(valor)) total, COUNT(*) n
    FROM transacoes WHERE natureza='gasto' AND ${sqlFontesCartao(fontesCartao)}`;
  const params = [...fontesCartao];
  if (fonte && fonte !== 'todos') { sql += ' AND fonte = ?'; params.push(fonte); }
  const per = clausulasPeriodo(req.query);
  sql += per.sql; params.push(...per.params);
  sql += ' GROUP BY mes, fonte ORDER BY mes';
  res.json(db.prepare(sql).all(...params));
});

// ---------- API: Insights, fluxo & Diagnóstico IA ----------
const { gerarFluxo } = require('./scripts/insights');
const { obterUltimosInsights, gerarInsightsComIA } = require('./scripts/insights-ia');

app.get('/api/insights', (req, res) => {
  const ultimos = obterUltimosInsights();
  res.json({
    insights: ultimos.insights,
    gerado_em: ultimos.gerado_em,
    fonte: ultimos.fonte,
    fluxo: gerarFluxo(req.query.mes || MES_ATUAL())
  });
});

app.post('/api/insights/gerar', async (req, res) => {
  try {
    const resultado = await gerarInsightsComIA(true);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// ---------- API: dívidas ----------
app.get('/api/dividas', (req, res) => {
  const { calendarioDividas } = require('./scripts/parcelas-futuras');
  res.json(calendarioDividas());
});

// ---------- API: Projeção & Faturas Abertas ----------
const { obterFaturasAbertas } = require('./scripts/faturas-abertas');

app.get('/api/faturas-abertas', (req, res) => {
  try {
    const dataRef = req.query.data_ref || null;
    res.json(obterFaturasAbertas(dataRef));
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/projecao/parcelas/:mes', (req, res) => {
  const mesParam = req.params.mes;
  const [p1, p2] = mesParam.split('-').map(Number);
  const mes = p1 > 12 ? mesParam : `${p2}-${String(p1).padStart(2, '0')}`;
  const mesRef = p1 > 12 ? `${String(p2).padStart(2, '0')}-${p1}` : `${String(p1).padStart(2, '0')}-${p2}`;

  const faturasAbertas = obterFaturasAbertas(req.query.data_ref || null);
  if (mesRef === faturasAbertas.mes_referencia && faturasAbertas.total > 0) {
    const parcelas = faturasAbertas.cartoes.map(c => ({
      descricao: `Fatura Aberta ${c.nome}`,
      valor: c.total,
      fonte: c.id,
      icone: c.icone,
      fechamento: c.fechamento,
      vencimento: c.vencimento,
      parcelas_agendadas: c.parcelas_agendadas,
      compras_ciclo: c.compras_ciclo,
      tipo: 'fatura-aberta'
    }));
    return res.json({ mes, total: faturasAbertas.total, parcelas });
  }

  const { compromissosFuturos } = require('./scripts/parcelas-futuras');
  const cf = compromissosFuturos();
  const doMes = cf.filter(x => {
    const [m, y] = x.mes.split('-');
    return `${y}-${m}` === mes;
  }).sort((a, b) => b.valor - a.valor);
  const total = doMes.reduce((s, x) => s + x.valor, 0);
  res.json({ mes, total, parcelas: doMes.map(x => ({ descricao: x.descricao, valor: x.valor, fonte: x.fonte })) });
});

app.get('/api/projecao/detalhe/:mes', (req, res) => {
  const mesParam = req.params.mes;
  let mesRef = mesParam;
  let mesIso = mesParam;
  if (/^\d{4}-\d{2}$/.test(mesParam)) {
    const [y, m] = mesParam.split('-');
    mesRef = `${m}-${y}`;
    mesIso = `${y}-${m}`;
  } else if (/^\d{2}-\d{4}$/.test(mesParam)) {
    const [m, y] = mesParam.split('-');
    mesRef = `${m}-${y}`;
    mesIso = `${y}-${m}`;
  }
  const [mNum, yNum] = mesRef.split('-').map(Number);

  // 1. Fixos daquele mês
  const fixosCadastrados = db.prepare(`
    SELECT r.id, r.descricao, r.valor, r.periodicidade, r.data_base, r.dia_venc, c.nome categoria
    FROM recorrencias r
    LEFT JOIN categorias c ON c.id=r.categoria_id
    WHERE r.ativo=1 AND r.tipo='Recorrente' AND (r.categoria_id IS NULL OR r.categoria_id != (SELECT id FROM categorias WHERE nome='Cartões'))
    ORDER BY CASE WHEN r.dia_venc IS NULL THEN 99 ELSE r.dia_venc END, r.descricao
  `).all();
  const fixosMes = [];
  for (const f of fixosCadastrados) {
    let entra = true;
    if (f.periodicidade && f.periodicidade > 1 && f.data_base) {
      const b = f.data_base.split('-').map(Number);
      const k = (yNum - b[0]) * 12 + (mNum - b[1]);
      entra = k >= 0 && k % f.periodicidade === 0;
    }
    if (entra) {
      fixosMes.push({
        id: f.id,
        descricao: f.descricao,
        valor: Math.abs(f.valor || 0),
        categoria: f.categoria || 'Geral',
        dia_venc: f.dia_venc || 5
      });
    }
  }

  // 2. Parcelas de Cartão / Faturas Abertas
  const faturasAbertas = obterFaturasAbertas(req.query.data_ref || null);
  let cartaoMes = [];
  if (mesRef === faturasAbertas.mes_referencia && faturasAbertas.total > 0) {
    cartaoMes = faturasAbertas.cartoes.map(c => ({
      descricao: `Fatura Aberta ${c.nome}`,
      valor: c.total,
      fonte: c.id,
      icone: c.icone,
      fechamento: c.fechamento,
      vencimento: c.vencimento,
      parcelas_agendadas: c.parcelas_agendadas,
      compras_ciclo: c.compras_ciclo,
      transicao_cartao_antigo: c.transicao_cartao_antigo || 0,
      tipo_fatura: 'aberta'
    }));
  } else {
    const { compromissosFuturos } = require('./scripts/parcelas-futuras');
    const cf = compromissosFuturos();
    cartaoMes = cf.filter(x => {
      const [m, y] = x.mes.split('-');
      return `${y}-${m}` === mesIso;
    }).sort((a, b) => b.valor - a.valor).map(x => ({
      descricao: x.descricao,
      valor: x.valor,
      fonte: x.fonte || 'cartao'
    }));
  }

  // 3. Parcelas Externas
  const hoje = new Date().toISOString().slice(0, 10);
  const [aY, aM] = hoje.split('-').map(Number);
  const parceladosRec = db.prepare(`
    SELECT r.id, r.descricao, r.valor, r.total_parcelas, r.parcela_atual, c.nome categoria, r.dia_venc
    FROM recorrencias r
    LEFT JOIN categorias c ON c.id=r.categoria_id
    WHERE r.ativo=1 AND r.tipo='Parcelado' AND r.total_parcelas IS NOT NULL
  `).all();
  const externasMes = [];
  for (const p of parceladosRec) {
    const restam = p.total_parcelas - (p.parcela_atual || 0);
    for (let i = 1; i <= restam; i++) {
      const mi = (aM - 1) + i;
      const mStr = `${String(mi % 12 + 1).padStart(2, '0')}-${aY + Math.floor(mi / 12)}`;
      if (mStr === mesRef) {
        externasMes.push({
          id: p.id,
          descricao: p.descricao,
          parcela: `${(p.parcela_atual || 0) + i}/${p.total_parcelas}`,
          valor: p.valor,
          categoria: p.categoria || 'Parcelado',
          dia_venc: p.dia_venc || 10
        });
      }
    }
  }

  // Totais e Renda
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaProjetada = rendas.reduce((s, r) => {
    if (r.tipo === 'horas') return s + (r.valor_hora || 0) * (r.horas_previstas || 168);
    return s + (r.valor_base || 0);
  }, 0);
  const { totalRendaRealizada } = require('./scripts/renda-realizada');
  const rendaMes = totalRendaRealizada(mesRef) || rendaProjetada;

  const totalFixos = Math.round(fixosMes.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const totalCartao = Math.round(cartaoMes.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const totalExternas = Math.round(externasMes.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const totalComprometido = Math.round((totalFixos + totalCartao + totalExternas) * 100) / 100;
  const sobraLivre = Math.round((rendaMes - totalComprometido) * 100) / 100;

  res.json({
    mes_ref: mesRef,
    mes_iso: mesIso,
    fixos: fixosMes,
    parcelas_cartao: cartaoMes,
    parcelas_externas: externasMes,
    totais: {
      total_fixos: totalFixos,
      total_cartao: totalCartao,
      total_externas: totalExternas,
      total_comprometido: totalComprometido,
      renda: rendaMes,
      sobra_livre: sobraLivre,
      pct_comprometido: Math.round((totalComprometido / rendaMes) * 100)
    }
  });
});

let doMesCache = [];

app.get('/api/projecao', (req, res) => {
  const dataSimulada = req.query.data_ref || null;
  const hoje = dataSimulada || new Date().toISOString().slice(0, 10);
  const [aY, aM] = hoje.split('-').map(Number);
  const compromissos = [];

  const parcelados = db.prepare(`SELECT descricao, valor, total_parcelas, parcela_atual
    FROM recorrencias WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL`).all();
  for (const p of parcelados) {
    const restam = p.total_parcelas - (p.parcela_atual || 0);
    for (let i = 1; i <= restam; i++) {
      const mi = (aM - 1) + i;
      const mes = `${String(mi % 12 + 1).padStart(2, '0')}-${aY + Math.floor(mi / 12)}`;
      compromissos.push({ descricao: `${p.descricao} (${(p.parcela_atual || 0) + i}/${p.total_parcelas})`, mes, valor: p.valor, origem: 'parcelado-fixos' });
    }
  }

  const { compromissosFuturos, calendarioDividas } = require('./scripts/parcelas-futuras');
  for (const c of compromissosFuturos()) {
    compromissos.push({ descricao: c.descricao, mes: c.mes, valor: c.valor, origem: 'cartao-futura' });
  }

  const fixos = db.prepare(`SELECT descricao, valor, periodicidade, data_base FROM recorrencias
    WHERE ativo=1 AND tipo='Recorrente' AND (categoria_id IS NULL OR categoria_id != (SELECT id FROM categorias WHERE nome='Cartões'))`).all();
  const fixosPorMes = {};
  for (let i = 0; i <= 12; i++) {
    const mi = (aM - 1) + i;
    const mes = `${String(mi % 12 + 1).padStart(2, '0')}-${aY + Math.floor(mi / 12)}`;
    const [m, y] = mes.split('-').map(Number);
    let soma = 0;
    for (const f of fixos) {
      let entra = true;
      if (f.periodicidade && f.periodicidade > 1 && f.data_base) {
        const b = f.data_base.split('-').map(Number);
        const k = (y - b[0]) * 12 + (m - b[1]);
        entra = k >= 0 && k % f.periodicidade === 0;
      }
      if (entra) soma += Math.abs(f.valor || 0);
    }
    fixosPorMes[mes] = soma;
  }
  const totalFixos = fixosPorMes[`${String(aM).padStart(2, '0')}-${aY}`] || 0;
  const excluidosFixos = db.prepare(`SELECT r.descricao, r.valor FROM recorrencias r
    WHERE r.ativo=1 AND r.tipo='Recorrente' AND r.categoria_id = (SELECT id FROM categorias WHERE nome='Cartões')`).all();

  const meses = [];
  for (let i = 0; i <= 12; i++) {
    const mi = (aM - 1) + i;
    meses.push(`${String(mi % 12 + 1).padStart(2, '0')}-${aY + Math.floor(mi / 12)}`);
  }
  const { obterFaturasAbertas } = require('./scripts/faturas-abertas');
  const faturasAbertas = obterFaturasAbertas(dataSimulada);

  doMesCache = meses.map((m, mIdx) => {
    const doMes = compromissos.filter(c => c.mes === m);
    // Para o próximo mês imediato (mIdx === 1, ex: 10-2026), substitui parcelas soltas pelas faturas abertas reais
    if (mIdx === 1 && faturasAbertas && faturasAbertas.total > 0) {
      const cartoesDetalhe = faturasAbertas.cartoes.map(c => ({
        descricao: `Fatura Aberta ${c.nome}`,
        valor: c.total,
        origem: 'fatura-aberta',
        fonte: c.id
      }));
      const externasDetalhe = doMes.filter(c => c.origem === 'parcelado-fixos').map(d => ({ descricao: d.descricao, valor: d.valor, origem: d.origem }));
      return {
        cartao: faturasAbertas.total,
        externas: doMes.filter(c => c.origem === 'parcelado-fixos').reduce((s, c) => s + c.valor, 0),
        detalhe: [...cartoesDetalhe, ...externasDetalhe]
      };
    }
    return {
      cartao: doMes.filter(c => c.origem === 'cartao-futura').reduce((s, c) => s + c.valor, 0),
      externas: doMes.filter(c => c.origem === 'parcelado-fixos').reduce((s, c) => s + c.valor, 0),
      detalhe: doMes.map(d => ({ descricao: d.descricao, valor: d.valor, origem: d.origem }))
    };
  });
  const serie = meses.map((m, mIdx) => {
    const cartaoMes = doMesCache[mIdx].cartao;
    const externasMes = doMesCache[mIdx].externas;
    const fixosMes = fixosPorMes[m] || 0;
    const parcelas = cartaoMes + externasMes;
    return { mes: m, parcelas, fixos: fixosMes, total: parcelas + fixosMes };
  });
  const dividaRestante = compromissos.reduce((s, c) => s + c.valor, 0);

  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const rendaProjetada = rendas.reduce((s, r) => {
    if (r.tipo === 'horas') return s + (r.valor_hora || 0) * (r.horas_previstas || 168);
    return s + (r.valor_base || 0);
  }, 0);

  const cfgCartao = db.prepare("SELECT valor FROM config WHERE chave='gasto_cartao_avista'").get();
  let gastoCartaoAvista = cfgCartao ? parseFloat(cfgCartao.valor) : null;
  if (gastoCartaoAvista == null || req.query.recalcular === '1') {
    const fontesCartao = getFontesCartao();
    const porFonte = db.prepare(`SELECT fonte, substr(data,1,7) mes, SUM(CASE WHEN parcela IS NULL THEN ABS(valor) ELSE 0 END) avista
      FROM transacoes WHERE natureza='gasto' AND ${sqlFontesCartao(fontesCartao)}
      AND id NOT IN (SELECT g.gasto_id FROM gastos_unificados g
                     JOIN transacoes t2 ON t2.id = g.gasto_id AND t2.fonte LIKE 'auvp%')
      GROUP BY fonte, mes ORDER BY fonte, mes DESC`).all(...fontesCartao);
    const totaisPorFonte = {};
    for (const r of porFonte) {
      totaisPorFonte[r.fonte] = totaisPorFonte[r.fonte] || [];
      totaisPorFonte[r.fonte].push(r);
    }
    gastoCartaoAvista = 0;
    for (const [fonte, mesesF] of Object.entries(totaisPorFonte)) {
      const mesCorrente = `${aY}-${String(aM).padStart(2, '0')}`;
      const completos = mesesF.filter(m => m.mes < mesCorrente).slice(0, 4);
      if (completos.length) {
        gastoCartaoAvista += completos.reduce((s, m) => s + m.avista, 0) / completos.length;
      }
    }
    if (req.query.recalcular === '1' || !cfgCartao) {
      const sql = cfgCartao ? "UPDATE config SET valor=? WHERE chave='gasto_cartao_avista'" : "INSERT INTO config (chave, valor) VALUES ('gasto_cartao_avista', ?)";
      db.prepare(sql).run(String(gastoCartaoAvista.toFixed(2)));
    }
  }

  const cfgPix = db.prepare("SELECT valor FROM config WHERE chave='gasto_pix_variavel'").get();
  let gastoPixVariavel = cfgPix ? parseFloat(cfgPix.valor) : null;
  if (gastoPixVariavel == null || req.query.recalcular === '1') {
    const mesCorrente = `${aY}-${String(aM).padStart(2, '0')}`;
    const direto = db.prepare(`SELECT substr(data,1,7) mes, SUM(ABS(valor)) tot
      FROM transacoes WHERE fonte='itau-conta' AND valor<0 AND natureza='gasto'
      GROUP BY mes ORDER BY mes DESC`).all();
    const mesesCompletos = direto.filter(d => d.mes < mesCorrente).slice(0, 4);
    const mediaDireto = mesesCompletos.length ? mesesCompletos.reduce((s, d) => s + d.tot, 0) / mesesCompletos.length : 0;
    gastoPixVariavel = mediaDireto;
    if (cfgPix) db.prepare("UPDATE config SET valor=? WHERE chave='gasto_pix_variavel'").run(String(gastoPixVariavel.toFixed(2)));
    else db.prepare("INSERT INTO config (chave, valor) VALUES ('gasto_pix_variavel', ?)").run(String(gastoPixVariavel.toFixed(2)));
  }

  // V2: comprometido + sobra livre (série do PRÓXIMO mês em diante) — exatamente 12 meses futuros
  // DECISÃO 28/09/2026 (Evander): a série considera SÓ o que está REALMENTE comprometido —
  //   1º mês = faturas abertas reais; meses seguintes = fixos + parcelas contratadas + parcelados.
  //   Médias móveis (cartão à vista / PIX variável) NÃO entram na série: jogar média como
  //   previsão de compromisso futuro mostrou ser enganoso (a média de itau-conta arrasta
  //   IPTU anual, boletos de terreno, GCI e PIXs pontuais que não são compromisso mensal).
  //   As camadas 3+4 continuam calculadas e exibidas como referência, fora da soma.
  const mesAtualRef = `${String(aM).padStart(2, '0')}-${aY}`;
  const parcelasExternasMensal = compromissos.filter(c => c.origem === 'parcelado-fixos')
    .reduce((s, c) => s + c.valor, 0);
  const comprometidoMensal = totalFixos + (doMesCache[0]?.cartao || 0) + (doMesCache[0]?.externas || 0);

  const { totalRendaRealizada } = require('./scripts/renda-realizada');
  const serieV2 = serie.slice(1).map((s, idx) => {
    const parcelasCartao = doMesCache[idx + 1].cartao;
    const parcelasExternas = doMesCache[idx + 1].externas;
    const fixosMes = s.fixos;
    const comprometido = fixosMes + parcelasCartao + parcelasExternas;
    const rendaMes = totalRendaRealizada(s.mes) || rendaProjetada;
    const [sm, sy] = s.mes.split('-').map(Number);
    const mesIso = `${sy}-${String(sm).padStart(2, '0')}`;
    return {
      mes: s.mes, mes_iso: mesIso, fixos: fixosMes, parcelas_cartao: parcelasCartao,
      parcelas_externas: parcelasExternas,
      cartao_avista: gastoCartaoAvista, pix_variavel: gastoPixVariavel,
      comprometido, renda: rendaMes,
      sobra_livre: rendaMes - comprometido, gasto_real: null, total: s.total,
      pct_comprometido: Math.round((comprometido / rendaMes) * 100)
    };
  });

  const [gmRef, gyRef] = mesAtualRef.split('-').map(Number);
  const mesIso = `${gyRef}-${String(gmRef).padStart(2, '0')}`;
  const gastoRealMes = db.prepare(`
    SELECT COALESCE(SUM(ABS(valor)),0) tot FROM transacoes t
    WHERE t.natureza='gasto' AND substr(t.data,1,7)=?
      AND t.parcela IS NULL
      AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
      AND t.id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)`).get(mesIso).tot;

  const dividasMeta = calendarioDividas();

  res.json({
    gerado_em: hoje, modelo: 'v2-comprometido', mes_atual: mesAtualRef,
    comprometido_mensal: comprometidoMensal, parcelas_externas_mensal: parcelasExternasMensal,
    gasto_real_mes: gastoRealMes, serie_v2: serieV2,
    divida_restante_total: dividaRestante, fixos_mensais: totalFixos,
    faturas_excluidas: excluidosFixos.map(f => f.descricao),
    rendas, renda_projetada: rendaProjetada,
    gasto_cartao_avista: gastoCartaoAvista, gasto_pix_variavel: gastoPixVariavel,
    dividas_meta: {
      total_passivo_restante: dividasMeta.total_passivo_restante,
      alivio_3m: dividasMeta.alivio_3m,
      alivio_6m: dividasMeta.alivio_6m,
      alivio_12m: dividasMeta.alivio_12m,
      data_quitacao_total: dividasMeta.data_quitacao_total,
      total_dividas_ativas: dividasMeta.total_dividas_ativas
    },
    faturas_abertas: faturasAbertas,
    serie
  });
});

// ---------- API: Visão Geral (Command Center) ----------
app.get('/api/visao', async (req, res) => {
  try {
    const dataSimulada = req.query.data_ref || null;
    const hoje = dataSimulada ? new Date(dataSimulada) : new Date();
    const aY = hoje.getFullYear(), aM = hoje.getMonth() + 1;
    const mesIso = `${aY}-${String(aM).padStart(2, '0')}`;
    const mesRef = `${String(aM).padStart(2, '0')}-${aY}`;

    const { saldosAUVP } = require('./scripts/saldos');
    const saldos = await saldosAUVP();
    const todas = saldos.saldos || [];
    const disponivel = todas.filter(s => s.tipo === 'BANK').reduce((s, c) => s + c.valor, 0);
    const faturasAbertas = todas.filter(s => s.tipo === 'CREDIT' && s.valor < 0).reduce((s, c) => s + Math.abs(c.valor), 0);

    const { totalRendaRealizada } = require('./scripts/renda-realizada');
    const rendaRealizada = totalRendaRealizada(mesIso);
    const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
    const rendaEstimada = rendas.reduce((s, r) => s + (r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0)), 0);
    const rendaMes = rendaRealizada || rendaEstimada;

    const fixos = db.prepare(`SELECT COALESCE(SUM(valor),0) t FROM recorrencias
      WHERE ativo=1 AND tipo='Recorrente' AND categoria_id != (SELECT id FROM categorias WHERE nome='Cartões')`).get().t;
    const parExt = db.prepare(`SELECT COALESCE(SUM(valor),0) t FROM recorrencias
      WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL
        AND total_parcelas - COALESCE(parcela_atual,0) > 0`).get().t;
    const { compromissosFuturos } = require('./scripts/parcelas-futuras');
    const cf = compromissosFuturos();
    const pcMes = cf.filter(x => { const [m, y] = x.mes.split('-'); return `${y}-${m}` === mesIso; }).reduce((s, x) => s + x.valor, 0);
    const comprometido = fixos + parExt + pcMes;

    const gastoReal = db.prepare(`
      SELECT COALESCE(SUM(ABS(valor)),0) tot FROM transacoes t
      WHERE t.natureza='gasto' AND substr(t.data,1,7)=?
        AND t.parcela IS NULL
        AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
        AND t.id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)`).get(mesIso).tot;
    const sobraMes = rendaMes - comprometido - gastoReal;

    const mesId = db.prepare('SELECT id FROM meses WHERE ref=?').get(mesRef);
    const proximos = mesId ? db.prepare(`
      SELECT l.descricao, l.valor, l.vencimento, l.pago FROM lancamentos l
      WHERE l.mes_id=? AND l.pago=0 ORDER BY l.vencimento LIMIT 5`).all(mesId.id) : [];

    const { calendarioDividas } = require('./scripts/parcelas-futuras');
    const c = calendarioDividas();
    const dividaTotal = c.emAndamento.reduce((s, d) => s + d.valor * d.restam, 0);
    const alivio3 = c.emAndamento.filter(d => {
      const [tM, tY] = d.termina.split('/').map(Number);
      return tY * 12 + tM <= (aY * 12 + aM) + 3;
    }).reduce((s, d) => s + d.valor, 0);

    // FATURA QUE VENCE NO PRÓXIMO MÊS (o que o dinheiro de agora vai pagar):
    // Cálculo preciso via faturas-abertas (parcelas contratuais + compras do ciclo real dos 3 cartões)
    const faturasAbertasCalculadas = obterFaturasAbertas(dataSimulada);
    const faturaProxima = faturasAbertasCalculadas.total;
    // PENDENTES POR FONTE (fix 30/09): renda só é "pendente" se NENHUMA transação dela caiu
    // no mês. O que caiu (mesmo menor que a estimativa — Magalu c/ empréstimo) é o real, não
    // completamos pela estimativa. Cooper estimada fica pendente até cair (ou lançar manual).
    const { statusPorMes } = require('./scripts/renda-realizada');
    const statusRendas = statusPorMes(mesIso);
    const entradasPendentes = Math.round(statusRendas.reduce((s, i) => s + i.pendente, 0) * 100) / 100;
    const pendentesDetalhe = statusRendas.filter(i => i.pendente > 0).map(i => ({
      renda_id: i.id, nome: i.nome, estimada: i.estimada, padrao_texto: i.padrao_texto
    }));

    const fluxo = gerarFluxo(mesRef);
    const { obterUltimosInsights } = require('./scripts/insights-ia');
    const ultimosInsights = obterUltimosInsights();

    res.json({
      mes: mesRef, mes_iso: mesIso,
      disponivel: Math.round(disponivel * 100) / 100,
      faturas_abertas: Math.round(faturasAbertas * 100) / 100,
      fatura_proxima: Math.round(faturaProxima * 100) / 100,
      faturas_abertas_detalhe: faturasAbertasCalculadas,
      entradas_pendentes: Math.round(entradasPendentes * 100) / 100,
      pendentes_detalhe: pendentesDetalhe,
      renda_mes: Math.round(rendaMes * 100) / 100,
      renda_realizada: Math.round(rendaRealizada * 100) / 100,
      comprometido: Math.round(comprometido * 100) / 100,
      gasto_real: Math.round(gastoReal * 100) / 100,
      sobra_mes: Math.round(sobraMes * 100) / 100,
      proximos, divida_total: Math.round(dividaTotal * 100) / 100,
      alivio_3meses: Math.round(alivio3 * 100) / 100,
      fluxo,
      insights: ultimosInsights.insights,
      insights_ia_gerado_em: ultimosInsights.gerado_em,
      insights_fonte: ultimosInsights.fonte,
      quando: saldos.quando
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ---------- API: Extrato por conta (estilo AUVP) ----------
app.get('/api/extrato-conta', async (req, res) => {
  try {
    const conta = req.query.conta || 'itau';
    const hoje = new Date();
    const mesIso = (req.query.mes || hoje.toISOString().slice(0, 7)).slice(0, 7);
    const { saldosAUVP } = require('./scripts/saldos');
    const saldos = await saldosAUVP();
    const todas = saldos.saldos || [];
    const saldoDisponivel = todas.filter(s => s.tipo === 'BANK').reduce((s, c) => s + c.valor, 0);
    const faturasAbertas = todas.filter(s => s.tipo === 'CREDIT' && s.valor < 0).reduce((s, c) => s + Math.abs(c.valor), 0);

    if (conta === 'todas') {
      const hj = hoje.toISOString().slice(0, 10);
      const txs = db.prepare(`SELECT id, data, descricao, valor, natureza, categoria, parcela, fonte, conta
        FROM transacoes WHERE data <= ?
        ORDER BY data DESC, id DESC LIMIT 2000`).all(hj);
      const linhas = txs.filter(t => t.data.slice(0, 7) === mesIso);
      const doMes = txs.filter(t => t.data.slice(0, 7) === mesIso);
      const gastos = doMes.filter(t => t.natureza === 'gasto').reduce((s, t) => s + Math.abs(t.valor), 0);
      const entradas = doMes.filter(t => t.valor > 0 && ['entrada', 'salario', 'rendimento'].includes(t.natureza)).reduce((s, t) => s + t.valor, 0);
      const pagFaturas = doMes.filter(t => t.natureza === 'transferencia').reduce((s, t) => s + Math.abs(t.valor), 0);
      const entreContas = doMes.filter(t => t.natureza === 'transferencia-propria').reduce((s, t) => s + Math.abs(t.valor), 0);
      return res.json({
        conta: 'todas', nome: 'Todas as Contas (Consolidado)', tipo: 'ALL',
        saldo_atual: Math.round(saldoDisponivel * 100) / 100,
        quando: saldos.quando,
        saldo_disponivel: Math.round(saldoDisponivel * 100) / 100,
        faturas_abertas: Math.round(faturasAbertas * 100) / 100,
        contas: todas.map(c => ({ nome: c.nome, tipo: c.tipo, valor: c.valor, icone: c.icone })),
        mes: mesIso, transacoes: linhas,
        totais: { gastos: Math.round(gastos * 100) / 100, entradas: Math.round(entradas * 100) / 100, pag_faturas: Math.round(pagFaturas * 100) / 100, entre_contas: Math.round(entreContas * 100) / 100 }
      });
    }

    const cfg = CONTAS_EXTRATO[conta];
    if (!cfg) return res.status(400).json({ erro: 'conta inválida' });
    const saldoConta = todas.find(s => s.nome === cfg.saldoAuvp && s.tipo === cfg.tipo) || todas.find(s => s.nome === cfg.saldoAuvp);
    const saldoAtual = saldoConta ? saldoConta.valor : 0;
    const hj = hoje.toISOString().slice(0, 10);
    const contaAuvp = cfg.contaAuvp || cfg.contaAUVP || cfg.conta_auvp || null;
    const alts = [];
    const paramsTx = [hj];
    const fontesCfg = Array.isArray(cfg.fontes) ? cfg.fontes : [];
    if (fontesCfg.length) { alts.push(`fonte IN (${fontesCfg.map(() => '?').join(',')})`); paramsTx.push(...fontesCfg); }
    if (cfg.auvpFonte && contaAuvp) { alts.push(`(fonte = ? AND conta = ?)`); paramsTx.push(cfg.auvpFonte, contaAuvp); }
    const txs = db.prepare(`SELECT id, data, descricao, valor, natureza, categoria, parcela, fonte, conta
      FROM transacoes WHERE data <= ? ${alts.length ? 'AND (' + alts.join(' OR ') + ')' : ''}
      ORDER BY data DESC, id DESC`).all(...paramsTx);
    let acumulado = saldoAtual;
    const todasLinhas = txs.map(t => {
      const saldoApos = acumulado;
      acumulado -= t.valor;
      return { ...t, saldo_apos: Math.round(saldoApos * 100) / 100 };
    });
    const linhas = todasLinhas.filter(t => t.data.slice(0, 7) === mesIso);
    const doMes = txs.filter(t => t.data.slice(0, 7) === mesIso);
    const gastos = doMes.filter(t => t.natureza === 'gasto').reduce((s, t) => s + Math.abs(t.valor), 0);
    const entradas = doMes.filter(t => t.valor > 0 && ['entrada', 'salario', 'rendimento'].includes(t.natureza)).reduce((s, t) => s + t.valor, 0);
    const pagFaturas = doMes.filter(t => t.natureza === 'transferencia').reduce((s, t) => s + Math.abs(t.valor), 0);
    const entreContas = doMes.filter(t => t.natureza === 'transferencia-propria').reduce((s, t) => s + Math.abs(t.valor), 0);
    res.json({
      conta, nome: cfg.nome, tipo: cfg.tipo, saldo_atual: saldoAtual, quando: saldos.quando,
      saldo_disponivel: Math.round(saldoDisponivel * 100) / 100,
      faturas_abertas: Math.round(faturasAbertas * 100) / 100,
      contas: todas.map(c => ({ nome: c.nome, tipo: c.tipo, valor: c.valor, icone: c.icone })),
      mes: mesIso, transacoes: linhas,
      totais: { gastos: Math.round(gastos * 100) / 100, entradas: Math.round(entradas * 100) / 100, pag_faturas: Math.round(pagFaturas * 100) / 100, entre_contas: Math.round(entreContas * 100) / 100 }
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ---------- API: Config IA ----------
const ia = require('./scripts/ia');
app.get('/api/config/ia', (req, res) => {
  const cfg = ia.getConfigIA();
  res.json({ url: cfg.url, model: cfg.model, temKey: !!cfg.key });
});
app.post('/api/config/ia', (req, res) => {
  const { url, key, model } = req.body;
  const atual = ia.getConfigIA();
  ia.salvarConfigIA({ url, key: key || atual.key, model });
  res.json({ ok: true });
});
app.post('/api/config/ia/testar', async (req, res) => {
  const cfg = ia.getConfigIA();
  res.json(await ia.testarIA(cfg));
});

// ---------- API: Config AUVP ----------
const auvpClient = require('./scripts/auvp-client');
app.get('/api/config/auvp', (req, res) => {
  const cfg = auvpClient.cfgAUVP();
  const ultimo = db.prepare("SELECT tipo, data_sync FROM sincronizacoes_auvp ORDER BY id DESC LIMIT 1").get();
  res.json({ url: cfg.url, ativo: cfg.ativo, temKey: !!cfg.key, ultimo_sync: ultimo ? ultimo.data_sync : null, ultimo_tipo: ultimo ? ultimo.tipo : null });
});
app.post('/api/config/auvp', (req, res) => {
  const { url, key, ativo } = req.body;
  const atual = auvpClient.cfgAUVP();
  const up = (k, v) => db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k, v);
  if (url) up('auvp_url', url);
  if (key) up('auvp_key', key);
  if (ativo !== undefined) up('auvp_ativo', ativo ? '1' : '0');
  res.json({ ok: true });
});
app.post('/api/auvp/sync', async (req, res) => {
  try {
    if (auvpClient.limparCacheAUVP) auvpClient.limparCacheAUVP();
    const [contas, agendadas] = await Promise.all([auvpClient.pullContas(true), auvpClient.pullAgendadas()]);
    
    // Auto-descoberta de novas contas/cartões pelo Open Finance
    try {
      if (Array.isArray(contas.contas)) {
        autoDescobrirContas(contas.contas);
      }
    } catch (e) { console.error('Erro na auto-descoberta:', e.message); }

    db.prepare(`INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('sync', ?)`)
      .run(JSON.stringify({ contas: contas.resumo, agendadas: agendadas.length }));
    db.prepare("UPDATE config SET valor=datetime('now') WHERE chave='ultima_sync_auvp'").run();
    try {
      const { gerarInsightsComIA } = require('./scripts/insights-ia');
      gerarInsightsComIA(true).catch(() => {});
    } catch (e) {}
    res.json({ ok: true, contas: contas.resumo, agendadas: agendadas.length, contasLista: contas.contas });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Saldos AUVP (cache)
const { saldosAUVP } = require('./scripts/saldos');
app.get('/api/auvp/saldos', async (req, res) => {
  try { res.json(await saldosAUVP()); }
  catch (e) { res.json({ ok: false, motivo: e.message }); }
});

// ---------- API: Reconciliação multi-fonte ----------
const { reconciliarLote, validarFracosComIA } = require('./scripts/reconciliador');
const { detectarRenda } = require('./scripts/renda-realizada');

app.get('/api/contas-mes-reconciliar', (req, res) => {
  const ref = MES_ATUAL();
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(ref);
  if (!mes) return res.json({ ok: true, contas: [], avulsas: [] });
  const abertas = db.prepare(`
    SELECT l.*, c.nome categoria_nome FROM lancamentos l
    LEFT JOIN categorias c ON c.id = l.categoria_id
    WHERE l.mes_id=? AND l.pago=0 ORDER BY l.vencimento`).all(mes.id);
  const txs = db.prepare(`
    SELECT * FROM transacoes
    WHERE natureza='gasto' AND valor < 0 AND data >= date('now', '-40 days') AND data <= date('now')
    AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas)
    AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
    ORDER BY data DESC`).all();
  const contas = [];
  const usadas = new Set();
  for (const l of abertas) {
    const tolVal = Math.max(Math.abs(l.valor) * 0.12, 15);
    const candidatos = txs.filter(t => {
      if (usadas.has(t.id)) return false;
      const difVal = Math.abs(Math.abs(t.valor) - Math.abs(l.valor));
      const difData = Math.abs((new Date(t.data) - new Date(l.vencimento)) / 86400000);
      return difVal <= tolVal && difData <= 12;
    });
    for (const c of candidatos) usadas.add(c.id);
    contas.push({
      id: l.id, descricao: l.descricao, valor: Math.abs(l.valor), vencimento: l.vencimento,
      parcela: l.parcela, recorrencia_id: l.recorrencia_id, categoria: l.categoria_nome,
      candidatos: candidatos.map(t => ({ id: t.id, data: t.data, descricao: t.descricao, valor: Math.abs(t.valor), fonte: t.fonte, hash_unico: t.hash_unico }))
    });
  }
  const avulsas = txs.filter(t => !usadas.has(t.id));
  res.json({ ok: true, mes: ref, contas, avulsas: avulsas.slice(0, 20) });
});

app.get('/api/lancamentos/:id/candidatos', (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(req.params.id);
  if (!l) return res.json([]);
  const busca = (req.query.busca || '').toLowerCase();
  let sql = `SELECT id, data, descricao, valor, fonte FROM transacoes
    WHERE valor < 0 AND (natureza IN ('gasto', 'transferencia') OR natureza IS NULL)
      AND data >= date(?, '-35 days') AND data <= date(?, '+35 days') AND data <= date('now')
      AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas WHERE transacao_id IS NOT NULL)
      AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL AND id != ?)`;
  const params = [l.vencimento, l.vencimento, l.id];
  if (busca) {
    sql += ' AND (descricao LIKE ? OR observacao LIKE ?)';
    params.push('%' + busca + '%', '%' + busca + '%');
  }
  sql += ' ORDER BY data DESC, id DESC LIMIT 50';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/contas-mes-reconciliar/anexar', (req, res) => {
  const { lancamento_id, transacao_id } = req.body;
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(lancamento_id);
  if (!l) return res.status(404).json({ erro: 'lançamento não encontrado' });
  const t = db.prepare('SELECT * FROM transacoes WHERE id=?').get(transacao_id);
  if (!t) return res.status(404).json({ erro: 'transação não encontrada' });
  // transação já anexada a OUTRO lançamento pago? (ex: conta recriada manualmente
  // depois de conciliar — não deve roubar o vínculo nem pagar a duplicata)
  const outro = db.prepare('SELECT id, descricao, pago FROM lancamentos WHERE transacao_id=? AND id != ?').get(t.id, l.id);
  if (outro) {
    return res.status(409).json({
      erro: `Essa transação já pagou "${outro.descricao}" (lançamento #${outro.id}).` +
        (outro.pago ? ' Confira se não é conta duplicada.' : ' Remova o vínculo lá antes.'),
      ja_vinculada: { lancamento_id: outro.id, descricao: outro.descricao }
    });
  }
  const jaPaga = !!l.pago;
  db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=? WHERE id=?').run(t.data, t.id, l.id);
  if (Math.abs(Math.abs(t.valor) - Math.abs(l.valor)) > 0.01) {
    db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(Math.abs(t.valor), l.id);
  }
  if (!jaPaga && l.recorrencia_id && l.parcela) {
    const m = String(l.parcela).match(/(\d+)\/(\d+)/);
    if (m) db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(parseInt(m[1]), l.recorrencia_id);
  }
  const conciliacao2 = require('./scripts/conciliacao');
  const padrao = conciliacao2.padraoDe(t.descricao);
  if (padrao) {
    const ex = db.prepare('SELECT * FROM conciliacoes_confirmadas WHERE padrao_transacao=?').get(padrao);
    if (ex) db.prepare('UPDATE conciliacoes_confirmadas SET confirmacoes=confirmacoes+1, descricao_lancamento=? WHERE id=?').run(l.descricao, ex.id);
    else db.prepare('INSERT INTO conciliacoes_confirmadas (padrao_transacao, descricao_lancamento) VALUES (?, ?)').run(padrao, l.descricao);
  }
  res.json({ ok: true, valorAtualizado: Math.abs(Math.abs(t.valor) - Math.abs(l.valor)) > 0.01, troca: jaPaga });
});

// Prévia de reconciliação AUVP
app.post('/api/reconciliacao/previa', async (req, res) => {
  try {
    const { de, ate, forceRefresh } = req.body;
    const [txs, contasInfo] = await Promise.all([
      auvpClient.pullTransacoes(de, ate, !!forceRefresh), 
      auvpClient.pullContas(!!forceRefresh)
    ]);
    const tipoConta = {};
    for (const c of (contasInfo.contas || [])) {
      if (c.idExterno) tipoConta[c.idExterno] = c.tipo;
      if (c.nome) tipoConta[c.nome] = c.tipo;
      if (c.id) tipoConta[String(c.id)] = c.tipo;
    }
    const fonteDe = t => {
      const tp = tipoConta[t.conta] || tipoConta[t.contaExternaId] || (t.conta && /credit|visa|master|black|gold/i.test(t.conta) ? 'CREDIT' : 'BANK');
      return tp === 'CREDIT' ? 'auvp-mcp' : 'auvp-bank';
    };
    const { enriquecerTransacoesAUVP, extrairParcelaDescricao } = require('./scripts/identidade');
    const mapaSeries = enriquecerTransacoesAUVP(txs);

    const neutros = [];
    const loteNeg = [];
    const lotePos = [];

    for (const t of txs) {
      const desc = (t.descricao || '').trim();
      const descLower = desc.toLowerCase();
      const v = Number(t.valor);
      const f = fonteDe(t);
      const ehCartao = f === 'auvp-mcp' || tipoConta[t.conta] === 'CREDIT' || (t.conta && /credit|visa|master|black|gold/i.test(t.conta));

      // 1. Transferência entre contas próprias
      const ehTransfPropria = t.transferenciaInterna ||
        /pix.*(mercado\s*pago|mercadopago|nubank|itau|titularidade)/i.test(descLower) ||
        /transferencia.*(mesma\s*titularidade|entre\s*contas)/i.test(descLower);

      // 2. Pagamento de fatura de cartão (compensação positiva no cartão ou débito na conta)
      const ehPagtoFatura = /pagamento.*(debito|fatura|saldo|recebido)|fatura\s*paga|debito\s*aut.*fatura/i.test(descLower) ||
        (ehCartao && /pagamento/i.test(descLower));

      // 3. Ignorada no banco
      const ehIgnorada = !!t.ignorada;

      if (ehTransfPropria || ehPagtoFatura || ehIgnorada) {
        let natureza = 'transferencia';
        let motivo = 'Pagamento de fatura (neutro)';
        let tipo = 'fatura';
        if (ehTransfPropria) {
          natureza = 'transferencia-propria';
          motivo = 'Transferência entre contas próprias';
          tipo = 'entre-contas';
        } else if (ehIgnorada) {
          natureza = 'ignorado';
          motivo = 'Marcado como ignorado no Open Banking';
          tipo = 'ignorado';
        }

        const dataIso = (t.data || '').slice(0, 10);
        const hashExterno = 'auvp-' + (v >= 0 ? 'pos-' : 'neg-') + t.id;
        const jaExiste = db.prepare(`
          SELECT id FROM transacoes 
          WHERE hash_unico = ? 
             OR (
               abs(valor - ?) < 0.01 
               AND data BETWEEN date(?, '-2 days') AND date(?, '+2 days') 
               AND (
                 descricao = ? 
                 OR (length(descricao) >= 5 AND instr(?, descricao) > 0)
                 OR (length(?) >= 5 AND instr(descricao, ?) > 0)
                 OR descricao LIKE ?
               )
             )
        `).get(hashExterno, v, dataIso, dataIso, desc, desc, desc, desc, desc.slice(0, 15) + '%');

        neutros.push({
          id_externo: t.id,
          data: dataIso,
          valor: v,
          descricao: desc,
          natureza,
          motivo,
          tipo,
          conta: t.conta,
          fonte: f,
          hash_unico: hashExterno,
          hash_externo: hashExterno,
          ja_existe: !!jaExiste,
          ignorado_calculo: true,
          _sel: !jaExiste
        });
      } else if (v < 0) {
        const extraida = extrairParcelaDescricao(desc, f);
        let descricaoLimpa = extraida.descricao || desc || 'sem-desc';
        let parcela = extraida.parcela, vencFat = null;
        if (!parcela && mapaSeries.has(t.id)) {
          const info = mapaSeries.get(t.id);
          parcela = info.parcela;
          vencFat = info.venc_fatura;
        }
        if (!vencFat && t.mesReferencia) {
          vencFat = t.mesReferencia.slice(0, 7);
        } else if (!vencFat && parcela && t.data) {
          vencFat = t.data.slice(0, 7);
        }
        // RELÓGIO DE FECHAMENTO: se a data da compra é APÓS o fechamento do cartão no mês
        // da transação, a compra cai na fatura seguinte (venc_fatura = mês + 1).
        // Ex: Nubank fecha 24/09 → compra de 25/09 cobrará na fatura que vence 01/11.
        // PDF continua fonte da verdade: quando chegar, o venc real sobrescreve via reconciliação.
        if (vencFat && t.data) {
          const cartaoInfo = db.prepare("SELECT dia_fechamento, dia_vencimento FROM contas_bancarias WHERE tipo='CREDIT' AND ativo=1 AND (LOWER(conta_auvp)=LOWER(?) OR LOWER(nome) LIKE LOWER('%' || ? || '%'))").get(t.conta || '', (t.conta || '').replace(' Itaú', '').slice(0, 10));
          const diaFech = cartaoInfo ? (cartaoInfo.dia_fechamento || 25) : 25;
          const [aC, mC] = vencFat.split('-').map(Number);
          const diaCompra = t.data.slice(8, 10) * 1;
          const mesmoMesCiclo = t.data.slice(0, 7) === vencFat;
          if (mesmoMesCiclo && diaCompra > diaFech) {
            const d = new Date(Number(vencFat.slice(0, 4)), Number(vencFat.slice(5, 7)) - 1, 1);
            d.setMonth(d.getMonth() + 1);
            vencFat = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          }
        }
        loteNeg.push({
          data: (t.data || '').slice(0, 10),
          valor: Math.abs(v),
          descricao: descricaoLimpa,
          parcela,
          venc_fatura: vencFat,
          natureza: 'gasto',
          conta: t.conta,
          fonte: f,
          hash_unico: 'auvp-' + t.id,
          hash_externo: 'auvp-' + t.id
        });
      } else if (v > 0) {
        const renda = detectarRenda(desc);
        const natureza = renda ? 'salario' : (/^rendimento/i.test(desc) ? 'rendimento' : 'entrada');
        lotePos.push({
          data: (t.data || '').slice(0, 10),
          valor: Math.abs(v),
          descricao: desc,
          parcela: null,
          natureza,
          conta: t.conta,
          fonte: f,
          hash_unico: 'auvp-pos-' + t.id,
          hash_externo: 'auvp-pos-' + t.id,
          renda_nome: renda ? renda.fonte : null
        });
      }
    }

    const resultado = reconciliarLote(loteNeg, 'auvp-mcp', { dryRun: true, porFonte: true });
    // ENTRADAS: dedupe contra transações existentes — INCLUSIVE lançamentos manuais de renda
    // (fonte='manual', hash 'manual-renda-*'). Casamento por valor exato + data ±3d independente
    // da descrição (ex: TED Cooper AUVP 'TED 136.1720...' × manual 'Salário Coopersystem (lançamento...)')
    const entradasNovas = lotePos.filter(t => {
      const jaExiste = db.prepare(`
        SELECT id, fonte FROM transacoes
        WHERE hash_unico = ?
           OR (valor = ? AND data BETWEEN date(?, '-1 day') AND date(?, '+1 day'))
           OR (valor = ? AND data = ? AND natureza IN ('salario','entrada') AND fonte = 'manual')
      `).get(t.hash_unico, t.valor, t.data, t.data, t.valor, t.data);
      if (jaExiste) {
        t.ja_lancada = { id: jaExiste.id, fonte: jaExiste.fonte };
        return false;
      }
      return true;
    });
    resultado.entradas = entradasNovas;
    resultado.neutros = neutros.filter(n => !n.ja_existe);
    resultado.neutrosJaSalvos = neutros.filter(n => n.ja_existe).length;

    let iaInfo = { aplicada: false };
    if (resultado.fracos.length) {
      const v = await validarFracosComIA(resultado.fracos);
      if (v.ok) {
        iaInfo = { aplicada: true, confirmados: v.confirmados.length, duvidosos: v.duvidosos.length };
        resultado.fortes.push(...v.confirmados.map(c => ({
          descricao: c.transacao.descricao, data: c.transacao.data, valor: c.transacao.valor,
          vinculado_como: c.pode_ser, score: 85, via_ia: true, confianca: c.confianca
        })));
        resultado.fracos = v.duvidosos;
      } else iaInfo = { aplicada: false, erro: v.erro };
    }

    const lancamentosAbertos = db.prepare(`
      SELECT l.*, m.ref mes_ref FROM lancamentos l
      JOIN meses m ON m.id = l.mes_id
      WHERE l.pago = 0 ORDER BY l.vencimento`).all();
    for (const n of resultado.novos) {
      let melhor = null;
      for (const l of lancamentosAbertos) {
        if (Math.abs(n.valor - Math.abs(l.valor)) > 0.05) continue;
        const difData = Math.abs((new Date(n.data) - new Date(l.vencimento)) / 86400000);
        if (difData > 7) continue;
        if (!melhor || difData < melhor.difData) melhor = { lancamento: l, difData };
      }
      if (melhor) {
        n.conta_do_mes = {
          lancamento_id: melhor.lancamento.id, descricao: melhor.lancamento.descricao,
          valor: melhor.lancamento.valor, vencimento: melhor.lancamento.vencimento,
          difData: Math.round(melhor.difData)
        };
      }
    }
    const abertos = lancamentosAbertos.map(l => ({
      id: l.id, descricao: l.descricao, vencimento: l.vencimento,
      valor: Math.abs(l.valor), mes_ref: l.mes_ref, recorrencia_id: l.recorrencia_id, parcela: l.parcela
    }));
    res.json({ ok: true, periodo: { de, ate }, ...resultado, ia: iaInfo, abertos });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Aplicar reconciliação
app.post('/api/reconciliacao/aplicar', (req, res) => {
  try {
    const { lote, fonte } = req.body;
    if (!Array.isArray(lote)) return res.status(400).json({ erro: 'lote inválido' });
    const insUnif = db.prepare('INSERT INTO gastos_unificados (gasto_id, fonte_origem, hash_externo) VALUES (?, ?, ?)');
    let inseridas = 0, vinculadas = 0, marcadasPagas = 0, rendasGravadas = 0;
    for (const t of lote) {
      if (t.acao === 'vincular' && t.gasto_id) {
        insUnif.run(t.gasto_id, fonte || 'auvp-mcp', t.hash_externo || null);
        vinculadas++;
      } else if (t.acao === 'inserir') {
        const f = t.fonte || fonte || 'auvp-mcp';
        const natureza = t.natureza || 'gasto';
        let valor = Number(t.valor);
        if (natureza === 'gasto' && valor > 0) valor = -valor;
        if (['entrada', 'salario', 'rendimento'].includes(natureza) && valor < 0) valor = Math.abs(valor);
        const ehSaida = valor < 0;
        const dataTx = (t.parcela && t.venc_fatura) ? `${t.venc_fatura}-01` : t.data;
        let obs = t.observacao || null;
        if (t.parcela && t.venc_fatura && t.data && t.data !== dataTx) {
          obs = obs ? `${obs} · Compra original: ${t.data}` : `Compra original: ${t.data}`;
        }
        const r = db.prepare(`INSERT OR IGNORE INTO transacoes
          (data, valor, descricao, fonte, natureza, categoria, parcela, conta, hash_unico, importacao_id, venc_fatura, observacao)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
          .run(dataTx, valor, t.descricao, f, natureza, t.categoria || null, t.parcela || null, t.conta || null, t.hash_externo || ('auvp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)), t.venc_fatura || null, obs);
        if (r.changes > 0) {
          inseridas++;
          // Fase 1: vincula à compra/parcela (AUVP = evidência, casa por N + valor exato)
          if (t.parcela) {
            try {
              const txId = Number(r.lastInsertRowid);
              const { vincularTransacao } = require('./scripts/identidade');
              const vinculo = vincularTransacao({ ...t, id: txId, venc_fatura: t.venc_fatura || null });
              if (vinculo && vinculo.parcela_id) {
                db.prepare('UPDATE transacoes SET parcela_id=? WHERE id=?').run(vinculo.parcela_id, txId);
              }
            } catch (e) { /* identidade não bloqueia import */ }
          }
        }
        if (!ehSaida && r.changes > 0 && ['salario', 'entrada', 'rendimento'].includes(natureza)) {
          const { gravarRendaRealizada, detectarRenda } = require('./scripts/renda-realizada');
          const renda = t.renda_nome || (detectarRenda(t.descricao) || {}).fonte;
          if (renda) {
            gravarRendaRealizada(t.data.slice(0, 7), renda, Math.abs(Number(t.valor)), Number(r.lastInsertRowid));
            rendasGravadas++;
          }
        }
        if (t.marcar_paga && t.lancamento_id) {
          const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(t.lancamento_id);
          if (l && !l.pago) {
            const novaTxId = db.prepare('SELECT id FROM transacoes WHERE hash_unico=?').get(t.hash_externo)?.id;
            db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=? WHERE id=?').run(t.data, t.transacao_id || novaTxId || null, t.lancamento_id);
            if (Math.abs(Number(t.valor) - Math.abs(l.valor)) > 0.01) {
              db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(Math.abs(Number(t.valor)), t.lancamento_id);
            }
            if (l.recorrencia_id && l.parcela) {
              const m = l.parcela.match(/(\d+)\/(\d+)/);
              if (m) db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(parseInt(m[1]), l.recorrencia_id);
            }
            marcadasPagas++;
          }
        }
      } else if (t.acao === 'marcar-paga') {
        const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(t.lancamento_id);
        if (l && !l.pago) {
          db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=? WHERE id=?').run(t.data || new Date().toISOString().slice(0, 10), t.transacao_id || null, t.lancamento_id);
          if (t.valor && Math.abs(Number(t.valor) - Math.abs(l.valor)) > 0.01) {
            db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(Math.abs(Number(t.valor)), t.lancamento_id);
          }
          if (l.recorrencia_id && l.parcela) {
            const m = l.parcela.match(/(\d+)\/(\d+)/);
            if (m) db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(parseInt(m[1]), l.recorrencia_id);
          }
          marcadasPagas++;
        }
      }
    }
    require('./scripts/regras-seed').recategorizar();
    db.prepare("UPDATE config SET valor=datetime('now') WHERE chave='ultima_sync_auvp'").run();
    res.json({ ok: true, inseridas, vinculadas, marcadasPagas, rendasGravadas });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ---------- API: importações (histórico) ----------
app.get('/api/importacoes/historico', (req, res) => {
  res.json(db.prepare('SELECT * FROM importacoes ORDER BY id DESC LIMIT 30').all());
});
app.get('/api/importacoes/ultima', (req, res) => {
  res.json(db.prepare('SELECT * FROM importacoes ORDER BY id DESC LIMIT 1').get());
});
app.get('/api/extratos/fontes', (req, res) => {
  res.json(db.prepare('SELECT fonte, COUNT(*) n FROM transacoes GROUP BY fonte ORDER BY n DESC').all());
});

// ---------- API: compras (fase 4 — fonte de verdade única) ----------
app.get('/api/compras', (req, res) => {
  const { busca, status } = req.query;
  let sql = `
    SELECT c.id, c.estabelecimento, c.valor_parcela, c.n_parcelas, c.mes_inicio, c.fonte_origem,
      c.cancelada, c.cancelada_em, c.motivo_cancelamento,
      (SELECT COUNT(*) FROM parcelas p WHERE p.compra_id=c.id AND p.status='cobrada') cobradas,
      (SELECT COUNT(*) FROM parcelas p WHERE p.compra_id=c.id AND p.status='agendada') agendadas,
      (SELECT COUNT(*) FROM parcelas p WHERE p.compra_id=c.id) total_parcelas_criadas,
      (SELECT COUNT(*) FROM transacoes t WHERE t.parcela_id IN (SELECT id FROM parcelas WHERE compra_id=c.id)) evidencias,
      (SELECT t.descricao FROM transacoes t WHERE t.parcela_id IN (SELECT id FROM parcelas WHERE compra_id=c.id) ORDER BY t.id DESC LIMIT 1) descricao_original,
      EXISTS (
        SELECT 1 FROM compras c2
        WHERE c2.id != c.id AND c2.cancelada = 0
          AND c2.estabelecimento = c.estabelecimento
          AND ABS(c2.valor_parcela - c.valor_parcela) <= 1.00
      ) tem_paralela
    FROM compras c WHERE c.cancelada = 0`;
  const params = [];
  if (busca) {
    const buscaNorm = busca.toUpperCase().replace(/[^A-Z0-9]/g, '');
    sql += ` AND (
      c.estabelecimento LIKE ? 
      OR c.estabelecimento LIKE ?
      OR EXISTS (
        SELECT 1 FROM parcelas p 
        JOIN transacoes t ON t.parcela_id=p.id 
        WHERE p.compra_id=c.id AND (t.descricao LIKE ? OR t.descricao LIKE ?)
      )
    )`;
    params.push('%' + busca + '%', '%' + buscaNorm + '%', '%' + busca + '%', '%' + buscaNorm + '%');
  }
  if (status === 'paralelas') {
    sql += ` AND EXISTS (
      SELECT 1 FROM compras c2
      WHERE c2.id != c.id AND c2.cancelada = 0
        AND c2.estabelecimento = c.estabelecimento
        AND ABS(c2.valor_parcela - c.valor_parcela) <= 1.00
    )`;
  } else if (status === 'canceladas') {
    sql = sql.replace('WHERE c.cancelada = 0', 'WHERE c.cancelada = 1');
  }
  sql += ' ORDER BY c.mes_inicio DESC, c.estabelecimento';
  res.json(db.prepare(sql).all(...params));
});

// Compras canceladas (histórico/auditoria)
app.get('/api/compras-canceladas', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.estabelecimento, c.valor_parcela, c.n_parcelas, c.mes_inicio, c.fonte_origem,
      c.cancelada_em, c.motivo_cancelamento,
      (SELECT COUNT(*) FROM parcelas p WHERE p.compra_id=c.id AND p.status='cancelada') parcelas_canceladas,
      (SELECT COUNT(*) FROM transacoes t WHERE t.parcela_id IN (SELECT id FROM parcelas WHERE compra_id=c.id) AND t.natureza='ignorado') transacoes_ignoradas
    FROM compras c WHERE c.cancelada = 1
    ORDER BY c.cancelada_em DESC`).all();
  res.json(rows);
});

app.get('/api/compras/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM compras WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ erro: 'compra não encontrada' });
  const parcelas = db.prepare('SELECT * FROM parcelas WHERE compra_id=? ORDER BY n').all(c.id);
  const transacoes = db.prepare(`
    SELECT t.id, t.data, t.valor, t.descricao, t.fonte, t.parcela, t.venc_fatura, t.natureza, t.categoria, t.parcela_id
    FROM transacoes t WHERE t.parcela_id IN (SELECT id FROM parcelas WHERE compra_id=?)
    ORDER BY t.data`).all(c.id);
  res.json({ ...c, parcelas, transacoes });
});

// Cancelar compra (estorno/cancelamento do merchant — ex: compra cancelada no Mercado Livre)
// - parcelas marcadas 'cancelada' (saem da projeção/calendário)
// - evidências (transações) viram tombstone: natureza='ignorado' — MANTÉM hash_unico,
//   senão a AUVP reenviaria a mesma transação e ela voltaria como "nova" no próximo sync
// - grava motivo e data do cancelamento
app.post('/api/compras/:id/cancelar', (req, res) => {
  const c = db.prepare('SELECT * FROM compras WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ erro: 'compra não encontrada' });
  if (c.cancelada) return res.status(400).json({ erro: 'compra já está cancelada' });
  const motivo = (req.body && req.body.motivo) || 'Compra cancelada / estornada pelo estabelecimento';

  const txs = db.prepare(`
    SELECT id, natureza FROM transacoes
    WHERE parcela_id IN (SELECT id FROM parcelas WHERE compra_id=?)`).all(c.id);

  const cancelarTx = db.prepare("UPDATE transacoes SET natureza='ignorado' WHERE id=?");
  const cancelarParcelas = db.prepare("UPDATE parcelas SET status='cancelada' WHERE compra_id=?");
  const cancelarCompra = db.prepare("UPDATE compras SET cancelada=1, cancelada_em=datetime('now'), motivo_cancelamento=? WHERE id=?");

  const run = () => {
    db.exec('BEGIN');
    try {
      for (const t of txs) {
        if (t.natureza === 'gasto') cancelarTx.run(t.id);
      }
      cancelarParcelas.run(c.id);
      cancelarCompra.run(motivo, c.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  run();

  res.json({
    ok: true,
    compra_id: c.id,
    parcelas_canceladas: db.prepare('SELECT COUNT(*) n FROM parcelas WHERE compra_id=? AND status=\'cancelada\'').get(c.id).n,
    transacoes_ignoradas: txs.filter(t => t.natureza === 'gasto').length
  });
});

// Reverter cancelamento (caso o estorno não se confirme)
app.post('/api/compras/:id/reverter-cancelamento', (req, res) => {
  const c = db.prepare('SELECT * FROM compras WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ erro: 'compra não encontrada' });
  if (!c.cancelada) return res.status(400).json({ erro: 'compra não está cancelada' });

  const reverterTx = db.prepare("UPDATE transacoes SET natureza='gasto' WHERE parcela_id IN (SELECT id FROM parcelas WHERE compra_id=?) AND natureza='ignorado'");
  const reverterParcelas = db.prepare(`
    UPDATE parcelas SET status = CASE
      WHEN vencimento IS NOT NULL AND substr(vencimento,1,7) <= substr(date('now'),1,7) THEN 'cobrada'
      ELSE 'agendada' END
    WHERE compra_id=? AND status='cancelada'`);
  const reverterCompra = db.prepare('UPDATE compras SET cancelada=0, cancelada_em=NULL, motivo_cancelamento=NULL WHERE id=?');

  const run = () => {
    db.exec('BEGIN');
    try {
      reverterTx.run(c.id);
      reverterParcelas.run(c.id);
      reverterCompra.run(c.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  run();

  res.json({
    ok: true,
    compra_id: c.id,
    parcelas_revertidas: db.prepare("SELECT COUNT(*) n FROM parcelas WHERE compra_id=? AND status!='cancelada'").get(c.id).n
  });
});

// ---------- API: saída mensal (gráfico da visão) ----------
app.get('/api/extratos/saida-mensal', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(data,1,7) mes,
      SUM(CASE WHEN natureza='gasto' AND parcela IS NOT NULL THEN ABS(valor) ELSE 0 END) fixas,
      SUM(CASE WHEN natureza='transferencia' THEN ABS(valor) ELSE 0 END) faturas,
      SUM(CASE WHEN natureza='gasto' AND parcela IS NULL THEN ABS(valor) ELSE 0 END) variavel,
      SUM(CASE WHEN natureza='transferencia-propria' THEN ABS(valor) ELSE 0 END) praMim
    FROM transacoes GROUP BY mes ORDER BY mes`).all();
  res.json(rows);
});


const PORT = process.env.PORT || 4321;
app.listen(PORT, () => console.log(`Finanças app rodando em http://localhost:${PORT}`));

require('./scripts/sync-diario').iniciarSyncDiario();