// Fase 1 — Cliente MCP AUVP persistente (sessão, rate limit, retry)
const db = require('../db');
const segredo = require('../core/segredo');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let sessionId = null;

function cfgAUVP() {
  const get = k => { const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(k); return r ? r.valor : null; };
  // a chave mora só no cofre (core/segredo.js); se ainda estiver no banco, muda para o cofre e sai do banco
  const antiga = get('auvp_key');
  if (antiga) { segredo.gravarChave(antiga); db.prepare("DELETE FROM config WHERE chave='auvp_key'").run(); }
  return {
    url: process.env.AUVP_URL || get('auvp_url'),
    key: process.env.AUVP_KEY || segredo.lerChave(),
    ativo: process.env.AUVP_ATIVO ? process.env.AUVP_ATIVO === '1' : get('auvp_ativo') === '1'
  };
}

// rate limit: 60 req/min por endpoint → espaçamento mínimo de 1,1s entre chamadas
let ultimaReq = 0;
let contadorId = 100;
async function respeitarRateLimit() {
  const agora = Date.now();
  const espera = Math.max(0, 1100 - (agora - ultimaReq));
  if (espera > 0) await sleep(espera);
  ultimaReq = Date.now();
}

const callRaw = async (method, params) => {
  const { url, key } = cfgAUVP();
  const headers = { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  await respeitarRateLimit();
  const id = ++contadorId;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) });
  const sid = r.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  if (r.status === 429) { await sleep(15000); return { THROTTLED: true }; }
  const t = await r.text();
  const linhas = t.split('\n').filter(l => l.startsWith('data:'));
  return linhas.length ? JSON.parse(linhas[0].slice(5)) : JSON.parse(t);
};

// sessão: initialize uma vez por processo
let inicializado = false;
async function garantirSessao() {
  const { ativo } = cfgAUVP();
  if (!ativo || !cfgAUVP().url || !cfgAUVP().key) throw new Error('AUVP não configurada (ative na aba Configurar)');
  if (!inicializado) {
    const init = await callRaw('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'finflow', version: '1.0' } });
    if (init.THROTTLED) throw new Error('AUVP com rate limit — tente em instantes');
    if (!init.result) throw new Error('initialize falhou: ' + JSON.stringify(init).slice(0, 120));
    // NOTA: não enviar notifications/initialized — o servidor da AUVP rejeita a
    // sessão depois dela (comportamento não-padrão, validado em testes)
    inicializado = true;
  }
}

const callTool = async (name, args) => {
  await garantirSessao();
  let r = await callRaw('tools/call', { name, arguments: args || {} });
  if (r.THROTTLED) r = await callRaw('tools/call', { name, arguments: args || {} });
  return r;
};

// ---- operações de alto nível com cache em memória (5 min TTL) ----
const cacheTransacoes = new Map();
let cacheContas = null;
let cacheContasTs = 0;

function limparCacheAUVP() {
  cacheTransacoes.clear();
  cacheContas = null;
  cacheContasTs = 0;
}

async function pullContas(forceRefresh = false) {
  const agora = Date.now();
  if (!forceRefresh && cacheContas && (agora - cacheContasTs < 5 * 60 * 1000)) {
    return cacheContas;
  }
  const r = await callTool('listar_contas', {});
  const texto = r.result?.content?.[0]?.text;
  if (!texto) throw new Error('sem resposta da AUVP');
  cacheContas = JSON.parse(texto);
  cacheContasTs = agora;
  return cacheContas;
}

async function pullAgendadas() {
  const r = await callTool('listar_transacoes', { pagina: 1, limite: 25 });
  const j = JSON.parse(r.result.content[0].text);
  return j.transacoes || [];
}

async function pullTransacoesPeriodo(de, ate, forceRefresh = false) {
  const chave = `${de || ''}_${ate || ''}`;
  const agora = Date.now();
  if (!forceRefresh && cacheTransacoes.has(chave)) {
    const item = cacheTransacoes.get(chave);
    if (agora - item.ts < 5 * 60 * 1000) {
      return item.dados;
    }
  }

  const out = [];
  let pag = 1;
  while (pag <= 25) {
    const r = await callTool('listar_transacoes', { de, ate, pagina: pag, limite: 50 });
    let j;
    try { j = JSON.parse(r.result.content[0].text); } catch (e) { break; }
    out.push(...(j.transacoes || []));
    if (pag >= j.totalDePaginas) break;
    pag++;
  }
  cacheTransacoes.set(chave, { ts: agora, dados: out });
  return out;
}

async function pullFaturas(contaExternaId) {
  const r = await callTool('listar_faturas', { contaExternaId });
  return JSON.parse(r.result.content[0].text);
}

async function pullResumoDashboard(mes) {
  const r = await callTool('resumo_dashboard', { mes });
  return JSON.parse(r.result.content[0].text);
}

module.exports = { 
  cfgAUVP, 
  pullContas, 
  pullAgendadas, 
  pullTransacoes: pullTransacoesPeriodo, 
  pullFaturas, 
  pullResumoDashboard, 
  garantirSessao,
  limparCacheAUVP
};