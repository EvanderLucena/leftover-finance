// Fase 4 — Sync diário automático: roda no server, guard de 24h em config
// Sync leve (contas + agendadas) 1x/dia enquanto o servidor estiver aberto.
// NUNCA insere transação: só registra novidade em sincronizacoes_auvp pra
// badge de "pendências" na UI. Inserção continua sendo 100% manual (regra do usuário).
const db = require('../db');
const auvpClient = require('./auvp-client');

const INTERVALO_CHECK = 30 * 60 * 1000; // checa a cada 30min se passaram 24h

function ultimaSync() {
  const r = db.prepare("SELECT valor FROM config WHERE chave='ultima_sync_auvp'").get();
  return r ? new Date(r.valor + (r.valor.includes('Z') ? '' : 'Z')).getTime() : 0;
}

async function syncDiario() {
  const { ativo, url, key } = auvpClient.cfgAUVP();
  if (!ativo || !url || !key) return;
  if (Date.now() - ultimaSync() < 24 * 3600 * 1000) return; // guard 24h
  try {
    const [contas, agendadas] = await Promise.all([auvpClient.pullContas(), auvpClient.pullAgendadas()]);
    db.prepare(`INSERT INTO sincronizacoes_auvp (tipo, resultados) VALUES ('auto', ?)`)
      .run(JSON.stringify({ contas: contas.resumo, agendadas: agendadas.length, origem: 'sync-diario' }));
    db.prepare("UPDATE config SET valor=datetime('now') WHERE chave='ultima_sync_auvp'").run();
    console.log('[sync-diario] AUVP ok:', contas.resumo?.totalContas ?? '?', 'contas,', agendadas.length, 'agendadas');
  } catch (e) {
    console.log('[sync-diario] falhou (sem crash):', e.message.slice(0, 120));
  }
}

function iniciarSyncDiario() {
  // primeira checagem 1min após boot, depois a cada 30min
  setTimeout(() => { syncDiario(); setInterval(syncDiario, INTERVALO_CHECK); }, 60 * 1000);
}

module.exports = { iniciarSyncDiario, syncDiario };