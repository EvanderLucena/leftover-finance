// Fase 5 — endpoint de saldos: pega a lista detalhada de contas do último
// sync "sync" (o manual guarda contasLista) OU puxa da AUVP se o cache estiver vazio
const db = require('../db');

const ICONES_CONTA = { BANK: '🏦', CREDIT: '💳' };

async function saldosAUVP() {
  // 1. cache: procurar último sync com lista detalhada
  // o registro mais recente que traz a lista de contas (sincronização manual, do núcleo ou de saldos)
  const registros = db.prepare("SELECT resultados, data_sync FROM sincronizacoes_auvp WHERE tipo IN ('sync', 'saldos') AND instr(resultados, 'contasLista') > 0 ORDER BY id DESC LIMIT 1").get();
  if (registros) {
    try {
      const j = JSON.parse(registros.resultados);
      if (Array.isArray(j.contasLista) && j.contasLista.length) {
        return { ok: true, quando: registros.data_sync, cached: true, saldos: normalizar(j.contasLista) };
      }
    } catch (e) { /* segue pra pull */ }
  }
  // 2. cache vazio → puxa da AUVP (1 chamada) e grava
  const auvpClient = require('./auvp-client');
  const contas = await auvpClient.pullContas();
  const saldos = normalizar(contas.contas || []);
  db.prepare(`INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('saldos', ?)`)
    .run(JSON.stringify({ contasLista: contas.contas, contas: contas.resumo }));
  return { ok: saldos.length > 0, quando: new Date().toISOString(), cached: false, saldos };
}

function normalizar(lista) {
  return lista.map(c => {
    const nome = c.nome || c.name || 'conta';
    const tipo = c.tipo || c.type || (/credit|visa|master|black|gold/i.test(nome) ? 'CREDIT' : 'BANK');
    const v = Number(c.saldo ?? c.balance ?? c.valor ?? 0);
    // CARTÃO = fatura aberta = DÍVIDA → exibe negativa (vermelho no ticker)
    // CONTA CORRENTE = saldo disponível → positivo (verde)
    return { nome, tipo, icone: ICONES_CONTA[tipo] || '🏦', valor: tipo === 'CREDIT' ? -Math.abs(v) : v };
  });
}

module.exports = { saldosAUVP };