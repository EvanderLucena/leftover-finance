// Teste de ouro: confere o sistema contra valores reais de 15/10/2026
// (faturas abertas conferidas nos apps dos bancos e faturas fechadas oficiais da AUVP).
// Rodar dentro de app/: npm test
// Os dados (cópia do banco, retrato da AUVP e valores esperados) ficam em test/fixtures/, ignorada pelo git.
// Cada grupo diz em que fase da refatoração ele precisa passar.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');

const APP = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
// quem clonou o repositório não tem os dados reais: o teste é pulado em vez de quebrar
if (!fs.existsSync(path.join(FIX, 'esperado.json'))) {
  test('teste de ouro (precisa de test/fixtures/, que fica fora do git)', { skip: 'sem test/fixtures/' }, () => {});
  return;
}
const ESPERADO = JSON.parse(fs.readFileSync(path.join(FIX, 'esperado.json'), 'utf8'));
const BANCO = path.join(FIX, 'financas-2026-10-15.db');
const centavos = v => Math.round(Number(v) * 100);
const dataBrasilia = iso => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);

function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// Sobe o servidor numa cópia descartável do banco, com o "hoje" congelado e a AUVP desligada.
async function subirServidor() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'finflow-ouro-'));
  const banco = path.join(pasta, 'financas.db');
  fs.copyFileSync(BANCO, banco);
  // ajustes do retrato que são dado pessoal (rendas): ficam em fixtures/, fora do git; rodam depois das migrações
  const preparar = path.join(FIX, 'preparar.sql');
  if (fs.existsSync(preparar)) {
    const mig = spawnSync(process.execPath, ['--no-warnings', '-e', "require('./db')"], { cwd: APP, env: { ...process.env, FINANCA_DB: banco }, encoding: 'utf8' });
    if (mig.status !== 0) throw new Error('falha nas migrações:\n' + mig.stderr);
    const db = new DatabaseSync(banco); db.exec(fs.readFileSync(preparar, 'utf8')); db.close();
  }
  // mesmo fluxo da sincronização real, a partir do retrato da AUVP salvo em fixtures/auvp
  const imp = spawnSync(process.execPath, ['--no-warnings', '-e', "require('./core/auvp-sync').importarRetrato(process.argv[1], process.argv[2])", path.join(FIX, 'auvp'), ESPERADO.hoje.slice(0, 10)], { cwd: APP, env: { ...process.env, FINANCA_DB: banco }, encoding: 'utf8' });
  if (imp.status !== 0) throw new Error('falha ao importar o retrato da AUVP:\n' + imp.stderr);
  const porta = await portaLivre();
  const proc = spawn(process.execPath, ['--no-warnings', '--require', path.join(__dirname, 'preload-data.js'), 'server.js'], {
    cwd: APP,
    env: { ...process.env, FINANCA_DB: banco, PORT: String(porta), AUVP_ATIVO: '0', FAKE_NOW: ESPERADO.hoje },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let saida = '';
  proc.stdout.on('data', d => { saida += d; });
  proc.stderr.on('data', d => { saida += d; });
  const url = `http://127.0.0.1:${porta}`;
  for (let i = 0; ; i++) {
    if (proc.exitCode !== null) throw new Error('o servidor caiu ao iniciar:\n' + saida);
    try { if ((await fetch(url + '/api/meses')).ok) break; } catch (e) { /* ainda subindo */ }
    if (i > 120) throw new Error('o servidor não respondeu em 18s:\n' + saida);
    await new Promise(r => setTimeout(r, 150));
  }
  const api = async (rota, opts) => {
    const r = await fetch(url + rota, opts);
    const corpo = await r.json();
    if (!r.ok) throw new Error(`${rota} respondeu ${r.status}: ${JSON.stringify(corpo)}`);
    return corpo;
  };
  const lerBanco = fn => { const db = new DatabaseSync(banco, { readOnly: true }); try { return fn(db); } finally { db.close(); } };
  const parar = async () => {
    if (proc.exitCode === null) { proc.kill(); await once(proc, 'exit'); }
    fs.rmSync(pasta, { recursive: true, force: true });
  };
  return { api, lerBanco, parar };
}
const json = corpo => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

describe('Fase 1 — abrir ou gerar telas não pode alterar dados', () => {
  test('abrir Contas do mês não altera o valor de uma fatura em aberto', async () => {
    const s = await subirServidor();
    try {
      const { id, mes, valor } = ESPERADO.lancamentoFaturaEmAberto;
      await s.api(`/api/lancamentos/${id}`, json({ valor, pago: false }));
      await s.api(`/api/lancamentos?mes=${mes}`);
      const l = s.lerBanco(db => db.prepare('SELECT valor, vencimento FROM lancamentos WHERE id=?').get(id));
      assert.equal(centavos(l.valor), centavos(valor), `só abrir a tela trocou o valor para ${l.valor} e o vencimento para ${l.vencimento}`);
    } finally { await s.parar(); }
  });

  test('gerar o próximo mês não muda os parcelados futuros da Projeção', async () => {
    const s = await subirServidor();
    try {
      const antes = await s.api('/api/projecao');
      await s.api('/api/meses/gerar-proximo', { method: 'POST' });
      const depois = await s.api('/api/projecao');
      const mudou = antes.serie_v2.slice(1)
        .map((m, i) => ({ mes: m.mes, antes: m.parcelas_externas, depois: depois.serie_v2[i + 1].parcelas_externas }))
        .filter(x => centavos(x.antes) !== centavos(x.depois));
      assert.deepEqual(mudou, [], 'parcelados mudaram só por gerar o mês: ' + JSON.stringify(mudou));
    } finally { await s.parar(); }
  });
});

describe('Fase 2 — a AUVP é a fonte dos dados', () => {
  let s;
  before(async () => { s = await subirServidor(); });
  after(async () => { await s.parar(); });
  test('nenhuma transação da AUVP do período fica fora do banco', () => {
    const txs = JSON.parse(fs.readFileSync(path.join(FIX, 'auvp', 'txall.json'), 'utf8'));
    const { de, ate } = ESPERADO.auvpCompleta;
    const doPeriodo = txs.filter(t => { const d = dataBrasilia(t.date); return d >= de && d <= ate; });
    const hashes = s.lerBanco(db => new Set(db.prepare('SELECT hash_unico FROM transacoes').all().map(r => r.hash_unico)));
    const manuais = s.lerBanco(db => db.prepare("SELECT valor, data FROM transacoes WHERE fonte='manual'").all());
    // crédito que já tinha sido lançado à mão (ex.: Cooper) conta como presente
    const faltando = doPeriodo.filter(t => !['auvp-', 'auvp-pos-', 'auvp-neg-'].some(p => hashes.has(p + t.id))
      && !manuais.some(m => Math.abs(m.valor - Number(t.amount)) < 0.01 && Math.abs(Date.parse(m.data) - Date.parse(dataBrasilia(t.date))) <= 3 * 864e5));
    assert.equal(faltando.length, 0, `${faltando.length} de ${doPeriodo.length} transações da AUVP entre ${de} e ${ate} não estão no banco`);
  });
});

describe('Fase 2 — cartões e transações vindos da AUVP, sem duplicar o que veio de PDF', () => {
  let s;
  before(async () => { s = await subirServidor(); });
  after(async () => { await s.parar(); });

  test('cartões descobertos na AUVP, com vencimento aprendido das faturas', () => {
    const cartoes = s.lerBanco(db => db.prepare('SELECT conta_local, vence_dia, incluir FROM cartoes ORDER BY conta_local').all());
    const vence = Object.fromEntries(cartoes.filter(c => c.incluir).map(c => [c.conta_local, c.vence_dia]));
    assert.deepEqual(vence, { cartao_btg_black: 1, itau_cartao: 1, mp_cartao: 4, nubank_cartao: 1 });
  });

  test('transação que já veio de PDF não entra de novo pela AUVP', () => {
    const copias = s.lerBanco(db => db.prepare(`SELECT COUNT(*) n FROM transacoes a JOIN transacoes p
      ON p.fonte IN ('itau-conta', 'itau-fatura', 'mercadopago', 'nubank') AND ABS(p.valor - a.valor) < 0.01 AND p.data = a.data
      AND p.descricao LIKE '%' || substr(a.descricao, 1, 12) || '%'
      WHERE a.hash_unico LIKE 'auvp%'`).get().n);
    assert.equal(copias, 0, `${copias} transações da AUVP repetem um lançamento do PDF`);
  });
});

describe('Hoje — caixa até o fim do mês', () => {
  test('o que entra segue a data do dinheiro (o pagamento do fim do mês entra no caixa deste mês) e a conta fecha', async () => {
    const s = await subirServidor();
    try {
      const h = await s.api('/api/hoje');
      const corte = s.lerBanco(db => db.prepare('SELECT id FROM rendas WHERE ativo=1 AND competencia_corte IS NOT NULL').all().map(r => r.id));
      for (const id of corte) {
        const r = h.rendas_a_receber.find(x => x.renda_id === id);
        assert.ok(r, `renda ${id} (paga no fim do mês) deveria estar a receber em ${h.mes}`);
        assert.ok(r.previsto.startsWith(h.mes_iso), `renda ${id} prevista para ${r.previsto}, fora de ${h.mes_iso}`);
      }
      assert.equal(centavos(h.caixa_fim_do_mes), centavos(h.disponivel) + centavos(h.a_receber) - centavos(h.a_pagar));
      assert.equal(centavos(h.caixa_apos_faturas), centavos(h.caixa_fim_do_mes) - centavos(h.faturas_abertas.total));
    } finally { await s.parar(); }
  });
});

describe('Fase 5 — Reconciliar: uma regra só para sugerir e para marcar sozinho', () => {
  test('a conciliação automática só marca o que o Reconciliar sugere como "certo" e sem ambiguidade', async () => {
    const s = await subirServidor();
    try {
      const antes = await s.api('/api/conciliar');
      const certos = antes.sugestoes.filter(x => x.nivel === 'certo' && !x.ambiguo).map(x => `${x.lancamento_id}:${x.transacao_id}`).sort();
      const auto = await s.api('/api/meses/auto-conciliar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: '10-2026' }) });
      const marcados = auto.detalhes.map(d => `${d.lancamento_id}:${d.transacao_id}`).sort();
      const doMes = new Set(s.lerBanco(db => db.prepare("SELECT l.id FROM lancamentos l JOIN meses m ON m.id = l.mes_id WHERE m.ref = '10-2026'").all().map(r => String(r.id))));
      assert.deepEqual(marcados, certos.filter(p => doMes.has(p.split(':')[0])));
      const depois = await s.api('/api/conciliar');
      assert.ok(depois.sugestoes.every(x => !marcados.includes(`${x.lancamento_id}:${x.transacao_id}`)), 'o que foi marcado continua sugerido');
    } finally { await s.parar(); }
  });
});

describe('Fases 2 e 3 — faturas: o critério é o app do banco e a fatura oficial', () => {
  let s;
  before(async () => { s = await subirServidor(); });
  after(async () => { await s.parar(); });

  test('fatura aberta de novembro de cada cartão = valor do app do banco', async () => {
    const fa = await s.api('/api/faturas-abertas');
    assert.equal(fa.mes_referencia, ESPERADO.faturasAbertas.mes);
    const obtido = Object.fromEntries(fa.cartoes.map(c => [c.id, c.total]));
    const errados = Object.entries(ESPERADO.faturasAbertas.porConta)
      .filter(([id, v]) => centavos(obtido[id] ?? 0) !== centavos(v))
      .map(([id, v]) => `${id}: app ${v}, sistema ${obtido[id] ?? 'ausente'}`);
    assert.deepEqual(errados, []);
  });

  test('faturas que venceram no mês = totais oficiais da AUVP', () => {
    const { mes, porCartao } = ESPERADO.faturasFechadas;
    const lancs = s.lerBanco(db => db.prepare(`SELECT l.descricao, l.valor FROM lancamentos l
      JOIN meses m ON m.id = l.mes_id JOIN categorias c ON c.id = l.categoria_id
      WHERE m.ref = ? AND c.nome = 'Cartões'`).all(mes));
    const errados = porCartao.map(f => {
      const l = lancs.find(x => new RegExp(f.padrao, 'i').test(x.descricao));
      return !l || centavos(l.valor) !== centavos(f.total) ? `${f.nome}: oficial ${f.total}, sistema ${l ? l.valor : 'ausente'}` : null;
    }).filter(Boolean);
    assert.deepEqual(errados, []);
  });

  test('parcelas de compra nova do ciclo aberto caem nas faturas seguintes', async () => {
    const { descricao, esperadoPorMes } = ESPERADO.parcelasCompraNova;
    const erros = [];
    for (const [mes, parcela] of Object.entries(esperadoPorMes)) {
      const r = await s.api(`/api/projecao/parcelas/${mes}`);
      const doMes = (r.parcelas || []).filter(p => p.descricao.startsWith(descricao)).map(p => p.descricao);
      if (!doMes.includes(`${descricao} (${parcela})`)) erros.push(`${mes}: esperada a parcela ${parcela}, sistema tem ${doMes.join(', ') || 'nenhuma'}`);
    }
    assert.deepEqual(erros, []);
  });

  test('renda de novembro segue a competência (Cooper do fim de outubro, Magalu, aluguel e Caju)', async () => {
    const p = await s.api('/api/projecao');
    const m = p.serie_v2.find(x => x.mes === ESPERADO.rendaNovembro.mes);
    assert.equal(centavos(m.renda), centavos(ESPERADO.rendaNovembro.valor), ESPERADO.rendaNovembro.composicao + ` · sistema: ${m.renda}`);
  });

  test('sobra livre de novembro = renda − comprometido real', async () => {
    const p = await s.api('/api/projecao');
    const m = p.serie_v2.find(x => x.mes === ESPERADO.sobraLivreNovembro.mes);
    assert.equal(centavos(m.sobra_livre), centavos(ESPERADO.sobraLivreNovembro.valor), ESPERADO.sobraLivreNovembro.composicao + ` · sistema: ${m.sobra_livre}`);
  });
});
