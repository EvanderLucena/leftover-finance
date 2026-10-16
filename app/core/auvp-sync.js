// Sincronização com a AUVP (fonte da verdade). Só leitura na AUVP.
// - transações: importadas por id (sem janela de datas que perde lançamento atrasado), data em Brasília
// - faturas fechadas e seus itens: total oficial, parcela k/N e data original
// - depois: transações entram em `transacoes` (para Contas do mês e Reconciliar) e as faturas
//   viram os lançamentos "Fatura X" dos meses existentes
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { dataBrasilia, hojeISO } = require('./calendario');

// ---------- chamadas de leitura à AUVP ----------
async function chamarAUVP(tool, args) {
  return require('../scripts/auvp-client').chamarFerramenta(tool, args); // uma sessão só, com espera no limite da AUVP
}

async function baixarTransacoes(de) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const r = await chamarAUVP('chamar_endpoint', { metodo: 'GET', caminho: '/transactions', query: { from: de, to: '2099-12-31', limit: 100, page } });
    out.push(...(r.transactions || []));
    if (!r.pagination || page >= r.pagination.totalPages) break;
  }
  return out;
}

async function baixarFaturas() {
  const res = { listas: {}, itens: {} };
  for (const c of db.prepare('SELECT * FROM cartoes WHERE conta_externa IS NOT NULL').all()) {
    const lista = await chamarAUVP('listar_faturas', { contaExternaId: c.conta_externa });
    res.listas[c.conta_id] = lista.faturas || [];
    // itens das 3 faturas mais recentes (as antigas não mudam)
    for (const f of (lista.faturas || []).slice().sort((a, b) => b.due_date.localeCompare(a.due_date)).slice(0, 3)) {
      const it = await chamarAUVP('listar_faturas', { contaExternaId: c.conta_externa, faturaId: f.id });
      res.itens[f.id] = it.transactions || [];
    }
  }
  return res;
}

// ---------- cartões: descobertos na AUVP, perfil aprendido das faturas ----------
// contas: [{ id, idExterno, nome }] dos cartões de crédito da AUVP
function descobrirCartoes(contas) {
  const local = db.prepare(`SELECT id, nome FROM contas_bancarias WHERE tipo='CREDIT'
    AND (auvp_conta_id = ? OR (auvp_conta_id IS NULL AND LOWER(conta_auvp) = LOWER(?))) ORDER BY auvp_conta_id IS NULL LIMIT 1`);
  const ins = db.prepare(`INSERT OR IGNORE INTO cartoes (conta_id, conta_externa, conta_local, nome, fecha_dia, vence_dia, incluir, perfil_conferido)
    VALUES (?, ?, ?, ?, 0, 0, 0, 0)`);
  const externa = db.prepare('UPDATE cartoes SET conta_externa = ? WHERE conta_id = ? AND conta_externa IS NULL');
  const vincula = db.prepare('UPDATE cartoes SET conta_local = ?, nome = ? WHERE conta_id = ? AND conta_local IS NULL');
  for (const c of contas) {
    if (c.id == null || !c.idExterno) continue;
    const l = local.get(c.id, c.nome || '');
    ins.run(c.id, c.idExterno, l ? l.id : null, l ? l.nome : (c.nome || 'Cartão ' + c.id));
    externa.run(c.idExterno, c.id);
    if (l) vincula.run(l.id, l.nome, c.id);
  }
}

// Perfil de um cartão a partir das faturas fechadas (só para cartão que o usuário ainda não conferiu):
// - vencimento: o dia mais comum dos vencimentos (fim de semana empurra para o dia útil seguinte);
// - fechamento: a última compra à vista de uma fatura dá o mínimo; a primeira da fatura seguinte, no mesmo mês, dá o máximo;
// - parcela futura: se as parcelas futuras que a AUVP já lista caem no dia do vencimento, o banco data pela fatura.
function aprenderPerfis(hoje = hojeISO()) {
  const dia = d => +d.slice(8, 10);
  const faturas = db.prepare('SELECT id, vencimento FROM faturas WHERE conta_id = ? ORDER BY vencimento DESC LIMIT 12');
  const compras = db.prepare(`SELECT MIN(COALESCE(data_original, data)) primeira, MAX(COALESCE(data_original, data)) ultima FROM fatura_itens
    WHERE fatura_id = ? AND (parcela_n IS NULL OR parcela_n <= 1) AND valor < 0 AND ignorada = 0`);
  const futuras = db.prepare('SELECT data, descricao FROM auvp_transacoes WHERE conta_id = ? AND data > ?');
  const grava = db.prepare('UPDATE cartoes SET fecha_dia = ?, vence_dia = ?, parcela_futura = ?, incluir = ? WHERE conta_id = ?');
  const aprendidos = [];
  for (const c of db.prepare('SELECT * FROM cartoes WHERE perfil_conferido = 0').all()) {
    const fs_ = faturas.all(c.conta_id).reverse();
    if (!fs_.length) continue;
    const contagem = {};
    for (const f of fs_) contagem[dia(f.vencimento)] = (contagem[dia(f.vencimento)] || 0) + 1;
    const vence = +Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a] || a - b)[0];
    let minimo = 0, maximo = 31;
    const comp = fs_.map(f => compras.get(f.id)).map(r => (r && r.ultima ? r : null));
    comp.forEach((r, i) => {
      if (!r) return;
      minimo = Math.max(minimo, dia(r.ultima));
      const prox = comp[i + 1];
      if (prox && prox.primeira.slice(0, 7) === r.ultima.slice(0, 7)) maximo = Math.min(maximo, dia(prox.primeira) - 1);
    });
    const fecha = minimo === 0 ? 0 : (maximo >= minimo && maximo < 31 ? maximo : minimo);
    const parcelas = futuras.all(c.conta_id, hoje).filter(t => parcelaDaDescricao(t.descricao));
    const noVencimento = parcelas.filter(t => dia(t.data) >= vence && dia(t.data) <= vence + 3).length;
    const parcelaFutura = parcelas.length >= 3 && noVencimento / parcelas.length >= 0.7 ? 'vencimento' : 'ciclo';
    grava.run(fecha, vence, parcelaFutura, fecha && vence ? 1 : 0, c.conta_id);
    // a tela Configurar mostra o mesmo perfil; editar lá vira o perfil conferido (scripts/contas.js)
    if (c.conta_local && fecha && vence) db.prepare('UPDATE contas_bancarias SET dia_fechamento = ?, dia_vencimento = ? WHERE id = ?').run(fecha, vence, c.conta_local);
    aprendidos.push({ cartao: c.nome, fecha_dia: fecha, vence_dia: vence, parcela_futura: parcelaFutura });
  }
  return aprendidos;
}

// ---------- gravação ----------
function gravarTransacoes(txs) {
  const up = db.prepare(`INSERT INTO auvp_transacoes (id, conta_id, data, data_hora, valor, descricao, tipo, ignorada, interna, par_id, mes_referencia, bruto, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET conta_id=excluded.conta_id, data=excluded.data, data_hora=excluded.data_hora, valor=excluded.valor,
      descricao=excluded.descricao, tipo=excluded.tipo, ignorada=excluded.ignorada, interna=excluded.interna, par_id=excluded.par_id,
      mes_referencia=excluded.mes_referencia, bruto=excluded.bruto, atualizado_em=datetime('now')`);
  db.exec('BEGIN');
  try {
    for (const t of txs) {
      const conta = t.accountId ?? t.user_account_id;
      if (conta == null || t.id == null) continue;
      up.run(t.id, conta, dataBrasilia(t.date), t.date, Number(t.amount), t.display_description || t.description || '', t.type,
        t.ignore ? 1 : 0, t.is_internal_transfer ? 1 : 0, t.transfer_pair_id != null ? String(t.transfer_pair_id) : null,
        (t.reference_month || '').slice(0, 7) || null, JSON.stringify(t));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function gravarFaturas({ listas, itens }) {
  const upF = db.prepare(`INSERT INTO faturas (id, conta_id, vencimento, total, minimo, atualizado_em) VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET vencimento=excluded.vencimento, total=excluded.total, minimo=excluded.minimo, atualizado_em=datetime('now')`);
  const delI = db.prepare('DELETE FROM fatura_itens WHERE fatura_id=?');
  const insI = db.prepare(`INSERT OR REPLACE INTO fatura_itens (fatura_id, transacao_id, data, descricao, valor, tipo, parcela_n, parcela_total, data_original, ignorada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const [conta, lista] of Object.entries(listas)) {
      for (const f of lista) upF.run(f.id, Number(conta), f.due_date.slice(0, 10), Number(f.total_amount), f.minimum_payment_amount != null ? Number(f.minimum_payment_amount) : null);
    }
    for (const [faturaId, its] of Object.entries(itens)) {
      delI.run(faturaId);
      for (const i of its) {
        const c = i.transaction_credit_data || {};
        insI.run(faturaId, i.id, dataBrasilia(i.date), i.display_description || i.description || '', Number(i.amount), i.type,
          c.current_installment ?? null, c.installments ?? null, c.original_date ? dataBrasilia(c.original_date) : null, i.ignore ? 1 : 0);
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- categorias da AUVP (nome pelo id que vem em cada transação) ----------
async function baixarCategorias() {
  const r = await chamarAUVP('chamar_endpoint', { metodo: 'GET', caminho: '/categories' });
  const up = db.prepare('INSERT INTO auvp_categorias (id, nome) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET nome = excluded.nome');
  for (const c of r.categories || []) if (c.category_id != null && c.description) up.run(c.category_id, c.description);
}
function categoriaAUVP(t) {
  try {
    const id = JSON.parse(t.bruto || '{}').categoryId;
    const c = id != null && db.prepare('SELECT nome FROM auvp_categorias WHERE id = ?').get(id);
    return c ? c.nome : null;
  } catch (e) { return null; }
}

// ---------- transações da AUVP -> tabela `transacoes` (Contas do mês e Reconciliar) ----------
const parcelaDaDescricao = d => { const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\s*$/); return m && +m[1] >= 1 && +m[1] <= +m[2] ? `${+m[1]}/${+m[2]}` : null; };

// Transações da AUVP que já estão no banco vindas de importações antigas (PDFs anteriores à AUVP).
// As fontes antigas de cada conta ficam em contas_bancarias.fontes (core/fontes.js); banco novo não tem nenhuma.
// Casamento um para um: mesma conta, mesmo valor, até 3 dias de diferença,
// e só dentro do período que a importação antiga daquela fonte cobre.
function transacoesJaImportadasAntes(contas) {
  const { fontesAntigasDaConta } = require('./fontes');
  const cobertura = new Map(db.prepare(`SELECT fonte, MAX(data) ate FROM transacoes
    WHERE fonte NOT IN ('auvp-mcp', 'auvp-bank', 'manual') GROUP BY fonte`).all().map(r => [r.fonte, r.ate]));
  const cobertas = new Set();
  if (!cobertura.size) return cobertas;
  const candidatos = db.prepare(`SELECT id, data FROM transacoes WHERE fonte = ? AND ABS(valor - ?) < 0.01
    AND data BETWEEN date(?, '-3 days') AND date(?, '+3 days') ORDER BY ABS(julianday(data) - julianday(?)), id`);
  const usados = new Set();
  const auvp = db.prepare('SELECT id, conta_id, data, valor FROM auvp_transacoes ORDER BY data, id').all();
  const fontesDe = new Map();
  // 1ª passada: mesma data; 2ª: até 3 dias (assim um PIX do dia 19 não toma o par de uma transferência do dia 20)
  for (const folga of [0, 3]) for (const t of auvp) {
    if (cobertas.has(t.id)) continue;
    if (!fontesDe.has(t.conta_id)) { const c = contas.get(t.conta_id) || {}; fontesDe.set(t.conta_id, fontesAntigasDaConta(t.conta_id, c.nome, c.cartao)); }
    for (const fonte of fontesDe.get(t.conta_id)) {
      if (!cobertura.has(fonte) || t.data > cobertura.get(fonte)) continue;
      const par = candidatos.all(fonte, t.valor, t.data, t.data, t.data).find(r => !usados.has(r.id) && Math.abs(Date.parse(r.data) - Date.parse(t.data)) <= folga * 864e5);
      if (par) { usados.add(par.id); cobertas.add(t.id); break; }
    }
  }
  return cobertas;
}

function importarParaTransacoes(hoje = hojeISO()) {
  const contas = new Map();
  try {
    for (const r of db.prepare("SELECT DISTINCT json_extract(bruto,'$.accountId') id, json_extract(bruto,'$.user_account.name') nome, json_extract(bruto,'$.user_account.subtype') sub FROM auvp_transacoes").all())
      contas.set(r.id, { nome: r.nome, cartao: r.sub === 'CREDIT_CARD' });
  } catch (e) { /* sem json1 */ }
  const cartaoIds = new Set(db.prepare('SELECT conta_id FROM cartoes').all().map(r => r.conta_id));
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1 AND padrao_regex IS NOT NULL').all().map(require('./rendas').casaRenda);
  const { aplicarRegras } = require('../scripts/motor-regras');
  const existe = db.prepare('SELECT 1 FROM transacoes WHERE hash_unico IN (?, ?, ?)');
  const creditoManual = db.prepare(`SELECT 1 FROM transacoes WHERE fonte='manual' AND ABS(valor-?)<0.01 AND data BETWEEN date(?, '-3 days') AND date(?, '+3 days')`);
  const ins = db.prepare(`INSERT OR IGNORE INTO transacoes (data, valor, descricao, fonte, natureza, categoria, parcela, conta, hash_unico, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const jaImportadas = transacoesJaImportadasAntes(contas);
  // cópia importada antes desta regra existir: sai, desde que nada aponte para ela
  const removerCopia = db.prepare(`DELETE FROM transacoes WHERE hash_unico IN (?, ?)
    AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)
    AND id NOT IN (SELECT transacao_id FROM rendas_realizadas WHERE transacao_id IS NOT NULL)
    AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas WHERE transacao_id IS NOT NULL)
    AND id NOT IN (SELECT transacao_id FROM conciliacoes_recusadas_par WHERE transacao_id IS NOT NULL)`);
  let novas = 0;
  db.exec('BEGIN');
  try {
    for (const t of db.prepare('SELECT * FROM auvp_transacoes WHERE data <= ? ORDER BY data').all(hoje)) {
      if (jaImportadas.has(t.id)) { removerCopia.run('auvp-' + t.id, 'auvp-pos-' + t.id); continue; } // já tinha vindo de importação antiga
      if (existe.get('auvp-' + t.id, 'auvp-pos-' + t.id, 'auvp-neg-' + t.id)) continue;
      if (t.valor > 0 && creditoManual.get(t.valor, t.data, t.data)) continue; // renda já lançada à mão
      const ehCartao = cartaoIds.has(t.conta_id) || (contas.get(t.conta_id) || {}).cartao;
      let natureza, categoria = null;
      if (t.interna) natureza = 'transferencia-propria';
      else if (t.ignorada) natureza = 'ignorado';
      else if (t.valor > 0) natureza = rendas.some(casa => casa(t)) ? 'salario' : 'entrada';
      else {
        const [r] = aplicarRegras([{ descricao: t.descricao, valor: t.valor }]);
        natureza = r.natureza || 'gasto';
        categoria = r.categoria || categoriaAUVP(t) || null; // regra sua primeiro; senão a categoria que a AUVP deu
      }
      const hash = (t.valor > 0 ? 'auvp-pos-' : 'auvp-') + t.id;
      const r = ins.run(t.data, t.valor, t.descricao, ehCartao ? 'auvp-mcp' : 'auvp-bank', natureza, categoria,
        ehCartao ? parcelaDaDescricao(t.descricao) : null, (contas.get(t.conta_id) || {}).nome || null, hash, null);
      if (r.changes) novas++;
    }
    // gasto que entrou sem categoria (antes de existir esta regra) recebe a da AUVP
    const semCat = db.prepare("SELECT id, hash_unico FROM transacoes WHERE categoria IS NULL AND natureza = 'gasto' AND hash_unico LIKE 'auvp-%'").all();
    const daAUVP = db.prepare('SELECT bruto FROM auvp_transacoes WHERE id = ?');
    const poe = db.prepare('UPDATE transacoes SET categoria = ? WHERE id = ?');
    for (const x of semCat) { const t = daAUVP.get(Number(x.hash_unico.replace(/^auvp-(pos-|neg-)?/, ''))); const c = t && categoriaAUVP(t); if (c) poe.run(c, x.id); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return novas;
}

// ---------- pós-processamento comum (API ou retrato) ----------
function posSincronizacao(hoje) {
  const novas = importarParaTransacoes(hoje);
  const { atualizarLancamentosDeFatura } = require('./comprometido');
  const faturas = atualizarLancamentosDeFatura(hoje);
  return { transacoes_novas: novas, lancamentos_de_fatura: faturas };
}

async function sincronizarAUVP({ diasAtras = 60, hoje = hojeISO() } = {}) {
  const de = new Date(Date.parse(hoje + 'T12:00:00Z') - diasAtras * 864e5).toISOString().slice(0, 10);
  const txs = await baixarTransacoes(de);
  gravarTransacoes(txs);
  try { await baixarCategorias(); } catch (e) { /* sem categorias: segue só com as regras */ }
  const { contas, resumo } = await require('../scripts/auvp-client').pullContas(true);
  // saldos das contas: cache que a aba Hoje lê (scripts/saldos.js)
  db.prepare("INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('saldos', ?)").run(JSON.stringify({ contasLista: contas, contas: resumo }));
  // conta ou cartão que apareceu na AUVP vira uma conta em Configurar (scripts/contas.js)
  const contasNovas = require('../scripts/contas').autoDescobrirContas(contas || []);
  descobrirCartoes((contas || []).filter(c => c.subtipo === 'CREDIT_CARD' || c.tipo === 'CREDIT'));
  gravarFaturas(await baixarFaturas());
  return { transacoes_auvp: txs.length, contas_novas: contasNovas.map(c => c.nome), perfis_aprendidos: aprenderPerfis(hoje), ...posSincronizacao(hoje) };
}

// mesmo fluxo a partir de um retrato salvo em disco (testes): txall.json, faturas_*.json, fatura_<cartao>_<venc>.json
function importarRetrato(dir, hoje = hojeISO()) {
  const ler = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  gravarTransacoes(ler('txall.json'));
  const listas = {}, itens = {};
  const arquivosDeFaturas = fs.readdirSync(dir).filter(f => /^faturas_.+\.json$/.test(f)).map(ler);
  descobrirCartoes(arquivosDeFaturas.filter(j => j.faturas && j.faturas.length).map(j => ({
    id: j.faturas[0].user_account_id, idExterno: j.contaExternaId, nome: (j.faturas[0].user_account || {}).name })));
  for (const j of arquivosDeFaturas) {
    const c = db.prepare('SELECT conta_id FROM cartoes WHERE conta_externa=?').get(j.contaExternaId);
    if (c) listas[c.conta_id] = j.faturas || [];
  }
  for (const f of fs.readdirSync(dir).filter(f => /^fatura_.+_\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
    const its = ler(f).transactions || [];
    const comFatura = its.find(i => i.bill_id);
    if (comFatura) itens[comFatura.bill_id] = its;
  }
  gravarFaturas({ listas, itens });
  aprenderPerfis(hoje);
  return posSincronizacao(hoje);
}

module.exports = { sincronizarAUVP, chamarAUVP, descobrirCartoes, aprenderPerfis, importarRetrato, importarParaTransacoes, gravarTransacoes, gravarFaturas };
