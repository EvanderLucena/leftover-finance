const express = require('express');
const path = require('node:path');
const db = require('./db');
require('./scripts/regras-seed').seedRegras(); // banco novo: regras genéricas de partida

const app = express();
app.use(express.json({ limit: '10mb' }));
// ---------- acesso: conta única, sessão e onde o app escuta (core/acesso.js) ----------
const acesso = require('./core/acesso');
app.use(acesso.exigirSessao);

app.get('/api/acesso/estado', (req, res) => {
  res.json({ tem_conta: acesso.temConta(), precisa_codigo: !acesso.temConta() && !acesso.deste_pc(req) });
});
app.post('/api/acesso/criar', (req, res) => {
  if (acesso.temConta()) return res.status(409).json({ erro: 'este app já tem conta: entre com ela' });
  const { usuario, senha, codigo } = req.body || {};
  const ip = req.socket.remoteAddress;
  if (acesso.bloqueado(ip)) return res.status(429).json({ erro: 'muitas tentativas: espere 1 minuto' });
  if (!acesso.deste_pc(req) && String(codigo || '').trim() !== acesso.codigo()) {
    acesso.errou(ip);
    return res.status(403).json({ erro: 'código de instalação errado (ele aparece no terminal onde o app foi iniciado)' });
  }
  const erro = acesso.validar(usuario, senha);
  if (erro) return res.status(400).json({ erro });
  acesso.criarConta(usuario, senha);
  res.setHeader('Set-Cookie', acesso.cookieSessao(acesso.novaSessao()));
  res.json({ ok: true });
});
app.post('/api/acesso/entrar', (req, res) => {
  const ip = req.socket.remoteAddress;
  if (acesso.bloqueado(ip)) return res.status(429).json({ erro: 'muitas tentativas: espere 1 minuto' });
  const { usuario, senha } = req.body || {};
  const ok = acesso.temConta() && String(usuario || '').trim().toLowerCase() === String(acesso.usuario()).toLowerCase()
    && acesso.confere(senha, acesso.senhaGuardada());
  if (!ok) { acesso.errou(ip); return res.status(401).json({ erro: 'usuário ou senha errados' }); }
  acesso.limparErros(ip);
  res.setHeader('Set-Cookie', acesso.cookieSessao(acesso.novaSessao()));
  res.json({ ok: true });
});
app.post('/api/acesso/sair', (req, res) => {
  acesso.encerrarSessao(req);
  res.setHeader('Set-Cookie', acesso.cookieSair());
  res.json({ ok: true });
});
app.post('/api/acesso/senha', (req, res) => {
  const { atual, nova } = req.body || {};
  if (!acesso.confere(atual, acesso.senhaGuardada())) return res.status(400).json({ erro: 'a senha atual não confere' });
  const erro = acesso.validar(acesso.usuario(), nova);
  if (erro) return res.status(400).json({ erro });
  acesso.trocarSenha(nova);
  res.setHeader('Set-Cookie', acesso.cookieSessao(acesso.novaSessao()));
  res.json({ ok: true });
});
const infoAcesso = () => ({
  usuario: acesso.usuario(), modo: acesso.modo(), fixo: !!acesso.hostFixo(), porta: PORT,
  enderecos: acesso.enderecosRede().map(e => (/^https?:\/\//.test(e) ? e : `http://${e}:${PORT}`))
});
app.get('/api/acesso/info', (req, res) => res.json(infoAcesso()));
app.post('/api/acesso/modo', (req, res) => {
  if (acesso.hostFixo()) return res.status(400).json({ erro: 'o endereço foi fixado por FINANCA_HOST (Docker): mude lá' });
  const { modo } = req.body || {};
  if (!['pc', 'casa'].includes(modo)) return res.status(400).json({ erro: 'modo é pc ou casa' });
  const mudou = modo !== acesso.modo();
  acesso.definirModo(modo);
  res.json({ ok: true, ...infoAcesso() });
  if (mudou) setTimeout(escutar, 300); // responde antes de trocar a porta de lugar
});

// ---------- primeira inicialização ----------
app.get('/api/setup/estado', (req, res) => {
  const auvp = require('./scripts/auvp-client').cfgAUVP();
  res.json({
    concluido: acesso.setupOk(), tem_chave: !!auvp.key,
    contas: db.prepare('SELECT COUNT(*) n FROM contas_bancarias').get().n,
    transacoes: db.prepare('SELECT COUNT(*) n FROM transacoes').get().n,
    rendas: db.prepare('SELECT COUNT(*) n FROM rendas WHERE ativo=1').get().n
  });
});
app.post('/api/setup/concluir', (req, res) => {
  getOrCreateMes(MES_ATUAL()); // banco novo: o mês corrente passa a existir para as telas
  acesso.concluirSetup();
  res.json({ ok: true });
});

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

// fontes que representam compra no cartão (core/fontes.js)
const { fontesCartao } = require('./core/fontes');
const sqlFontesCartao = fontes => `fonte IN (${fontes.map(() => '?').join(',')})`;

const { mapaContasExtrato, listarContas, salvarConta } = require('./scripts/contas');
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
  // só o que já aconteceu: parcela de cartão com data futura é agendamento (aparece na Projeção, não aqui)
  sql += ' AND data <= ?';
  params.push(require('./core/calendario').hojeISO());
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
  const { parcelaNoMes, entraNoMes } = require('./core/comprometido');
  const ym = require('./core/calendario').refParaYm(prox);
  let contas = 0, total = 0;
  for (const r of recs) {
    if (r.tipo === 'Parcelado' ? !parcelaNoMes(r, ym) : !entraNoMes(r, ym)) continue;
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
  const { parcelaNoMes, entraNoMes, atualizarLancamentosDeFatura } = require('./core/comprometido');
  const cal = require('./core/calendario');
  const ym = cal.refParaYm(prox);
  const catCartoes = db.prepare("SELECT id FROM categorias WHERE nome='Cartões'").get();
  let gerados = 0;
  for (const r of recs) {
    // faturas de cartão vêm da AUVP (atualizarLancamentosDeFatura), não de recorrência
    if (catCartoes && r.categoria_id === catCartoes.id) continue;
    let parcela = null;
    if (r.tipo === 'Parcelado') {
      // parcela pela data da 1ª (data_base) — gerar o mês não mexe em contador nenhum
      const k = parcelaNoMes(r, ym);
      if (!k) continue;
      parcela = `${k}/${r.total_parcelas}`;
    } else if (!entraNoMes(r, ym)) continue;
    const venc = cal.diaDoMes(ym, r.dia_venc || 5);
    ins.run(novoId, r.descricao, r.valor, venc, r.categoria_id, r.id, parcela);
    gerados++;
  }
  setMesAtual(prox);

  // faturas do novo mês: abertas (comprometido até hoje) a partir das faturas da AUVP
  try { atualizarLancamentosDeFatura(); } catch (e) { console.error('[gerar-proximo] faturas:', e.message); }

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
  // leitura pura: a fatura do mês é gravada na sincronização com a AUVP e ao gerar o mês, nunca aqui
  const ref = req.query.mes || MES_ATUAL();
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
// parcelado é calculado pela data da 1ª parcela (data_base); se vier só 'parcela atual', deriva a data
function dataBaseParcelado(tipo, dataBase, parcelaAtual) {
  if (tipo !== 'Parcelado' || dataBase || !parcelaAtual) return dataBase || null;
  const cal = require('./core/calendario');
  return cal.addMes(cal.refParaYm(MES_ATUAL()), -(Number(parcelaAtual) - 1)) + '-01';
}
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
      ativo !== false ? 1 : 0, dataBaseParcelado(tipo || 'Recorrente', data_base, parcela_atual), observacao || null, padrao_busca ? padrao_busca.trim() : null
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
      dataBaseParcelado(b.tipo ?? r.tipo, b.data_base !== undefined ? b.data_base : r.data_base, b.parcela_atual !== undefined ? b.parcela_atual : r.parcela_atual),
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

// contas fixas sugeridas pelo histórico (core/contas-fixas.js): aceitar cria a recorrência e a conta deste mês
const contasFixas = require('./core/contas-fixas');
app.get('/api/contas-fixas/sugestoes', (req, res) => {
  res.json(contasFixas.sugestoes());
});
app.post('/api/contas-fixas', (req, res) => {
  try { res.json(contasFixas.aceitar(req.body || {}, MES_ATUAL(), getOrCreateMes)); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
app.post('/api/contas-fixas/dispensar', (req, res) => {
  if (!req.body || !req.body.chave) return res.status(400).json({ erro: 'chave obrigatória' });
  contasFixas.dispensar(req.body.chave);
  res.json({ ok: true });
});

// ---------- API: categorias ----------
app.get('/api/categorias', (req, res) => {
  res.json(db.prepare('SELECT nome FROM categorias ORDER BY nome').all());
});

// ---------- API: rendas ----------
const R = require('./core/rendas');
const TIPOS_RENDA = ['fixa', 'horas', 'variavel', 'eventual'];
// campos de renda vindos da tela; undefined = não mexe
function camposRenda(b) {
  const num = v => (v === '' || v === null ? null : (v === undefined || !isFinite(+v) ? undefined : +v));
  const c = {
    nome: b.nome != null ? String(b.nome).trim() : undefined,
    tipo: TIPOS_RENDA.includes(b.tipo) ? b.tipo : undefined,
    valor_base: num(b.valor_base), valor_hora: num(b.valor_hora), horas_previstas: num(b.horas_previstas),
    dia_pagamento: num(b.dia_pagamento), valor_exato: num(b.valor_exato), competencia_corte: num(b.competencia_corte),
    padrao_regex: b.padrao_regex === undefined ? undefined : (String(b.padrao_regex || '').trim() || null),
    observacao: b.observacao === undefined ? undefined : (b.observacao || null),
    ativo: b.ativo == null ? undefined : (b.ativo ? 1 : 0)
  };
  if (c.padrao_regex) { try { new RegExp(c.padrao_regex, 'i'); } catch (e) { throw new Error('padrão inválido: ' + e.message); } }
  return c;
}
app.get('/api/rendas', (req, res) => {
  res.json(db.prepare('SELECT * FROM rendas WHERE ativo=1 ORDER BY id').all().map(r => ({ ...r, estimada: R.estimativa(r) })));
});
// entradas do histórico que parecem renda e ainda não estão cadastradas
app.get('/api/rendas/sugestoes', (req, res) => {
  res.json(R.sugestoes());
});
app.post('/api/rendas/sugestoes/dispensar', (req, res) => {
  if (!req.body || !req.body.chave) return res.status(400).json({ erro: 'chave obrigatória' });
  R.dispensarSugestao(req.body.chave);
  res.json({ ok: true });
});
app.post('/api/rendas', (req, res) => {
  let c;
  try { c = camposRenda(req.body || {}); } catch (e) { return res.status(400).json({ erro: e.message }); }
  if (!c.nome) return res.status(400).json({ erro: 'nome obrigatório' });
  if (c.padrao_regex == null && c.valor_exato == null) return res.status(400).json({ erro: 'diga como reconhecer a renda: um texto do extrato ou o valor exato' });
  const cols = Object.keys(c).filter(k => c[k] !== undefined);
  const r = db.prepare(`INSERT INTO rendas (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map(k => c[k]));
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/rendas/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM rendas WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'não encontrada' });
  let c;
  try { c = camposRenda(req.body || {}); } catch (e) { return res.status(400).json({ erro: e.message }); }
  if (!c.nome) delete c.nome;
  const cols = Object.keys(c).filter(k => c[k] !== undefined);
  if (cols.length) db.prepare(`UPDATE rendas SET ${cols.map(k => k + '=?').join(', ')} WHERE id=?`).run(...cols.map(k => c[k]), r.id);
  res.json({ ok: true });
});
app.delete('/api/rendas/:id', (req, res) => {
  db.prepare('DELETE FROM rendas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Lançar renda manual (o dinheiro caiu e a AUVP ainda não trouxe) — cria transação salario + rendas_realizadas
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
    // grava pelo nome da renda cadastrada: 'Salário Empresa X' → 'Empresa X' (UNIQUE(mes, descricao))
    gravarRendaRealizada(mesIso, Math.abs(v), txId, r.nome.replace(/^Salário\s+/i, ''));
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

    // período dentro de um mês só (ex.: "Mês atual"): barras por dia; período maior: barras por mês.
    // Nunca passa de hoje: data futura de parcela é agendamento, não transação.
    const hojeIso = calendario.hojeISO();
    const porDia = !!(req.query.de && req.query.ate && req.query.de.slice(0, 7) === req.query.ate.slice(0, 7));
    timelineBaseSql += ' AND data <= ?';
    timelineParams.push(hojeIso);
    if (porDia) {
      timelineBaseSql += ' AND substr(data, 1, 7) = ?';
      timelineParams.push(req.query.de.slice(0, 7));
    } else {
      const mesMaxIso = req.query.ate || hojeIso.slice(0, 7);
      timelineBaseSql += ' AND substr(data, 1, 7) <= ?';
      timelineParams.push(mesMaxIso.slice(0, 7));
      if (req.query.de) {
        timelineBaseSql += ' AND substr(data, 1, 7) >= ?';
        timelineParams.push(req.query.de.slice(0, 7));
      }
    }

    const timelineSql = `
      SELECT ${porDia ? 'data' : 'substr(data, 1, 7)'} as mes,
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
    if (!porDia && timeline.length > 12) {
      timeline = timeline.slice(-12);
    }

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
      timeline
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
  const fontes = fontesCartao();
  let sql = `SELECT substr(data,1,7) mes, fonte,
    SUM(CASE WHEN parcela IS NULL THEN ABS(valor) ELSE 0 END) avista,
    SUM(CASE WHEN parcela IS NOT NULL THEN ABS(valor) ELSE 0 END) parc,
    SUM(ABS(valor)) total, COUNT(*) n
    FROM transacoes WHERE natureza='gasto' AND ${sqlFontesCartao(fontes)}`;
  const params = [...fontes];
  if (fonte && fonte !== 'todos') { sql += ' AND fonte = ?'; params.push(fonte); }
  const per = clausulasPeriodo(req.query);
  sql += per.sql; params.push(...per.params);
  sql += ' GROUP BY mes, fonte ORDER BY mes';
  res.json(db.prepare(sql).all(...params));
});

// ---------- API: dívidas, faturas e Projeção — tudo do motor único (core/comprometido.js) ----------
// Regra de 15/10/2026: só comprometimento real (gasto ou agendado), nenhuma previsão de gasto.
const motor = require('./core/comprometido');
const calendario = require('./core/calendario');
const hojeDe = req => (req.query.data_ref ? String(req.query.data_ref).slice(0, 10) : calendario.hojeISO());
const ymDoParam = p => (/^\d{4}-\d{2}$/.test(p) ? p : calendario.refParaYm(p));
// "VET CENTERPRESIDEN02/03" -> "VETCENTERPRESIDEN (2/3)" (identifica a parcela no detalhe)
const rotuloParcela = i => (i.parcela ? `${motor.baseDescricao(i.descricao)} (${i.parcela})` : i.descricao);

app.get('/api/dividas', (req, res) => {
  res.json(motor.dividas(hojeDe(req)));
});

app.get('/api/faturas-abertas', (req, res) => {
  try { res.json(motor.faturasAbertas(hojeDe(req))); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// itens de cartão que vencem no mês (todas as faturas)
app.get('/api/projecao/parcelas/:mes', (req, res) => {
  const ym = ymDoParam(req.params.mes);
  const m = motor.comprometidoMes(ym, hojeDe(req));
  const parcelas = m.faturas.flatMap(f => f.itens.map(i => ({ descricao: rotuloParcela(i), valor: Math.round(Math.abs(i.valor) * 100) / 100, fonte: f.cartao, tipo: i.tipo, programada: !!i.programada })))
    .sort((a, b) => b.valor - a.valor);
  res.json({ mes: ym, total: m.total_faturas, parcelas });
});

// raio-x de um mês (clique na barra da Projeção)
app.get('/api/projecao/detalhe/:mes', (req, res) => {
  const ym = ymDoParam(req.params.mes);
  const m = motor.comprometidoMes(ym, hojeDe(req));
  const dia = v => (v ? Number(String(v).slice(8, 10)) : null);
  res.json({
    mes_ref: m.mes, mes_iso: ym,
    fixos: m.contas.filter(c => c.tipo === 'fixa').map(c => ({ descricao: c.descricao, valor: c.valor, categoria: c.categoria || 'Geral', dia_venc: dia(c.vencimento), pago: c.pago, valor_origem: c.valor_origem })),
    parcelas_cartao: m.faturas.map(f => ({
      descricao: `Fatura ${f.cartao}`, valor: f.total, fonte: f.conta_local, icone: f.icone, vencimento: f.vencimento, fechamento: f.fechamento,
      parcelas_agendadas: f.parcelas ?? null, compras_ciclo: f.compras ?? null, tipo_fatura: f.status === 'fechada' ? 'fechada' : 'aberta', status: f.status,
      itens: f.itens.map(i => ({ data: i.data, descricao: rotuloParcela(i), valor: Math.abs(i.valor), tipo: i.tipo }))
    })),
    parcelas_externas: m.contas.filter(c => c.tipo === 'parcelado').map(c => ({ descricao: c.descricao, parcela: c.parcela, valor: c.valor, categoria: c.categoria || 'Parcelado', dia_venc: dia(c.vencimento) })),
    dia_a_dia: m.dia_a_dia, rendas: m.rendas,
    totais: {
      total_fixos: m.fixos, total_cartao: m.total_faturas, total_externas: m.parcelados, total_dia_a_dia: m.dia_a_dia,
      total_comprometido: m.comprometido, renda: m.renda, sobra_livre: m.sobra_livre, pct_comprometido: m.pct_comprometido
    }
  });
});

app.get('/api/projecao', (req, res) => {
  const hoje = hojeDe(req);
  const serie = motor.serie(hoje, 12);
  const m1 = serie[0];
  const serieV2 = serie.map(m => ({
    mes: m.mes, mes_iso: m.mes_iso, fixos: m.fixos, parcelas_cartao: m.total_faturas, parcelas_externas: m.parcelados,
    dia_a_dia: m.dia_a_dia, comprometido: m.comprometido, renda: m.renda, sobra_livre: m.sobra_livre,
    pct_comprometido: m.pct_comprometido, faturas: m.faturas.map(f => ({ cartao: f.cartao, total: f.total, status: f.status })),
    origem_contas: m.origem_contas
  }));
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const dividasMeta = motor.dividas(hoje);
  res.json({
    gerado_em: hoje, modelo: 'v3-comprometido-real', mes_atual: m1.mes,
    comprometido_mensal: m1.comprometido, parcelas_externas_mensal: m1.parcelados, fixos_mensais: m1.fixos,
    serie_v2: serieV2,
    serie: serieV2.map(s => ({ mes: s.mes, parcelas: s.parcelas_cartao + s.parcelas_externas, fixos: s.fixos, total: s.comprometido })),
    rendas, renda_projetada: serie[1] ? serie[1].renda : m1.renda,
    dividas_meta: {
      total_passivo_restante: dividasMeta.total_passivo_restante, alivio_3m: dividasMeta.alivio_3m, alivio_6m: dividasMeta.alivio_6m,
      alivio_12m: dividasMeta.alivio_12m, data_quitacao_total: dividasMeta.data_quitacao_total, total_dividas_ativas: dividasMeta.total_dividas_ativas
    },
    faturas_abertas: motor.faturasAbertas(hoje)
  });
});

// ---------- API: Visão Geral (Command Center) ----------
// ---------- API: Hoje (caixa até o fim do mês) — motor único (core/comprometido.js) ----------
app.get('/api/hoje', async (req, res) => {
  try {
    let saldos = { saldos: [], quando: null };
    try { saldos = await require('./scripts/saldos').saldosAUVP(); }
    catch (e) { saldos.erro = e.message; } // sem AUVP: a tela mostra o resto e avisa
    const contas = (saldos.saldos || []).filter(s => s.tipo === 'BANK');
    const disponivel = contas.reduce((s, c) => s + c.valor, 0);
    const c = motor.caixaAteFimDoMes(disponivel, calendario.hojeISO());
    res.json({ ...c, saldos: contas, saldos_quando: saldos.quando, saldos_erro: saldos.erro || null });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ---------- API: Extrato por conta (estilo AUVP) ----------
app.get('/api/extrato-conta', async (req, res) => {
  try {
    const conta = req.query.conta || 'todas';
    const hoje = new Date();
    const mesIso = (req.query.mes || hoje.toISOString().slice(0, 7)).slice(0, 7);
    const { saldosAUVP } = require('./scripts/saldos');
    let saldos = { saldos: [] };
    try { saldos = await saldosAUVP(); } catch (e) { /* AUVP ainda não sincronizada: extrato sem saldo */ }
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
  if (key) { require('./core/segredo').gravarChave(key); auvpClient.reiniciarSessao(); } // nunca no banco
  if (ativo !== undefined) up('auvp_ativo', ativo ? '1' : '0');
  res.json({ ok: true });
});
app.post('/api/auvp/sync', async (req, res) => {
  try {
    if (auvpClient.limparCacheAUVP) auvpClient.limparCacheAUVP();
    const [contas, agendadas] = await Promise.all([auvpClient.pullContas(true), auvpClient.pullAgendadas()]);
    
    // núcleo novo: transações por id + faturas oficiais e itens; depois atualiza os lançamentos de fatura
    let nucleo = null;
    try { nucleo = await require('./core/auvp-sync').sincronizarAUVP(); }
    catch (e) { nucleo = { erro: e.message }; console.error('[auvp/sync] núcleo:', e.message); }

    // guarda a lista de contas com saldo: é o cache que a tela de saldos lê
    db.prepare(`INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('sync', ?)`)
      .run(JSON.stringify({ contas: contas.resumo, contasLista: contas.contas, agendadas: agendadas.length, nucleo }));
    db.prepare("UPDATE config SET valor=datetime('now') WHERE chave='ultima_sync_auvp'").run();
    // Re-conciliação automática: transações novas desde o último sync podem pagar contas do mês
    let autoConciliados = 0;
    try {
      const { autoConciliarMes } = require('./scripts/conciliacao');
      const r = autoConciliarMes(MES_ATUAL());
      autoConciliados = r.conciliados || 0;
    } catch (e) { console.error('[auvp/sync] auto-conciliar falhou (sem crash):', e.message); }
    // Guardrail de consistência: painel ≈ projeção, dupla contagem, salário duplo
    let consistencia = null;
    try {
      const { checarConsistencia } = require('./scripts/check-consistencia');
      consistencia = checarConsistencia();
    } catch (e) { /* guardrail nunca derruba o sync */ }
    res.json({ ok: true, contas: contas.resumo, agendadas: agendadas.length, contasLista: contas.contas, auto_conciliados: autoConciliados, consistencia, nucleo });
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

// ---------- API: Reconciliar ----------

app.get('/api/contas-mes-reconciliar', (req, res) => {
  // mesma regra das sugestões e da conciliação automática (scripts/conciliacao.js)
  res.json(require('./scripts/conciliacao').contasDoMesComCandidatos(MES_ATUAL()));
});

app.get('/api/lancamentos/:id/candidatos', (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(req.params.id);
  if (!l) return res.json([]);
  const busca = (req.query.busca || '').toLowerCase();
  let sql = `SELECT id, data, descricao, valor, fonte FROM transacoes
    WHERE valor < 0 AND (natureza IN ('gasto', 'transferencia') OR natureza IS NULL)
      AND data >= date(?, '-35 days') AND data <= date(?, '+35 days') AND data <= date('now')
      AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas_par WHERE lancamento_id = ?)
      AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL AND id != ?)`;
  const params = [l.vencimento, l.vencimento, l.id, l.id];
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

app.get('/api/extratos/fontes', (req, res) => {
  res.json(db.prepare('SELECT fonte, COUNT(*) n FROM transacoes GROUP BY fonte ORDER BY n DESC').all());
});


const PORT = Number(process.env.PORT) || 4321;
// escuta só neste PC (127.0.0.1) ou na rede de casa (0.0.0.0), conforme o modo escolhido; troca sem reiniciar
let servidor = null;
function escutar() {
  const subir = () => {
    const host = acesso.host();
    servidor = app.listen(PORT, host, () => {
      console.log(`Leftover Finance rodando em http://localhost:${PORT}`);
      if (acesso.modo() === 'casa') for (const e of infoAcesso().enderecos) console.log(`  na rede de casa: ${e}`);
      const codigo = acesso.codigo();
      if (codigo) console.log(`  primeira vez: crie sua conta no navegador. De outro aparelho, use o código de instalação ${codigo}`);
    });
  };
  const antigo = servidor;
  if (!antigo) return subir();
  antigo.close(subir);
  antigo.closeAllConnections(); // conexões abertas segurariam a porta
}
escutar();

require('./scripts/sync-diario').iniciarSyncDiario();