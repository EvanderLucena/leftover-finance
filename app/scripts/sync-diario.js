// Sincronização automática com a AUVP enquanto o servidor estiver aberto (só leitura na AUVP).
// Desde 15/10/2026 roda o fluxo completo do núcleo (core/auvp-sync.js): transações, faturas oficiais e saldos,
// e depois a conciliação automática pela regra única (só o que é certo e sem ambiguidade).
const db = require('../db');
const auvpClient = require('./auvp-client');

const INTERVALO_CHECK = 30 * 60 * 1000; // checa a cada 30min
const INTERVALO_SYNC = 6 * 3600 * 1000;  // sincroniza a cada 6h

function ultimaSync() {
  const r = db.prepare("SELECT valor FROM config WHERE chave='ultima_sync_auvp'").get();
  return r ? new Date(r.valor + (r.valor.includes('Z') ? '' : 'Z')).getTime() : 0;
}

async function syncDiario() {
  const { ativo, url, key } = auvpClient.cfgAUVP();
  if (!ativo || !url || !key) return;
  if (Date.now() - ultimaSync() < INTERVALO_SYNC) return;
  try {
    const r = await require('../core/auvp-sync').sincronizarAUVP();
    const { autoConciliarMes } = require('./conciliacao');
    const ref = db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get();
    const auto = autoConciliarMes(ref ? ref.valor : null);
    db.prepare(`INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('auto', ?)`)
      .run(JSON.stringify({ origem: 'sync-automatico', ...r, auto_conciliados: auto.conciliados }));
    db.prepare("INSERT INTO config (chave, valor) VALUES ('ultima_sync_auvp', datetime('now')) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run();
    console.log('[sync-automatico] AUVP ok:', r.transacoes_novas, 'transação(ões) nova(s),', auto.conciliados, 'conta(s) conciliada(s)');
  } catch (e) {
    console.log('[sync-automatico] falhou (sem crash):', e.message.slice(0, 120));
  }
}

function iniciarSyncDiario() {
  // primeira checagem 1min após o boot, depois a cada 30min
  setTimeout(() => { syncDiario(); setInterval(syncDiario, INTERVALO_CHECK); }, 60 * 1000);
}

module.exports = { iniciarSyncDiario, syncDiario };
