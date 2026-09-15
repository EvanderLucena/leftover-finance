// Fase X4.1: config da IA (Ollama Cloud) — salvar/testar no banco + endpoint de teste
const db = require('../db');

// endpoints são plugados no server.js; aqui só helpers
function getConfigIA() {
  const get = k => { const r = db.prepare('SELECT valor FROM config WHERE chave=?').get(k); return r ? r.valor : null; };
  return {
    url: process.env.IA_URL || get('api_ia_url') || '',
    key: process.env.IA_KEY || get('api_ia_key') || '',
    model: process.env.IA_MODEL || get('api_ia_model') || ''
  };
}

function salvarConfigIA({ url, key, model }) {
  const up = k => v => db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor").run(k, v ?? '');
  if (url !== undefined) up('api_ia_url')(url.trim());
  if (key !== undefined) up('api_ia_key')(key.trim());
  if (model !== undefined) up('api_ia_model')(model.trim());
  return getConfigIA();
}

// teste de conexão: chat completion mínimo
async function testarIA(cfg) {
  const { url, key, model } = cfg;
  if (!url || !key || !model) return { ok: false, erro: 'URL, API key e modelo são obrigatórios' };
  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'responda apenas: ok' }], max_tokens: 5 })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, erro: `HTTP ${resp.status}: ${txt.slice(0, 120)}` };
    }
    const d = await resp.json();
    return { ok: true, resposta: d.choices?.[0]?.message?.content || '(sem conteúdo)' };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// categorizar em lote com contexto local
async function categorizarComIA(transacoes, cfg) {
  const { url, key, model } = cfg;
  if (!url || !key || !model) return { ok: false, erro: 'IA não configurada' };

  // contexto local: categorias, tags oficiais, naturezas, exemplos confirmados
  const categorias = db.prepare('SELECT nome FROM categorias ORDER BY nome').all().map(c => c.nome);
  const tags = db.prepare('SELECT nome FROM tags ORDER BY nome').all().map(t => t.nome);
  const confirmados = db.prepare('SELECT padrao_transacao, descricao_lancamento FROM conciliacoes_confirmadas ORDER BY confirmacoes DESC LIMIT 20').all();

  const prompt = [
    'Você é um assistente de categorização financeira pessoal.',
    'Classifique cada transação abaixo nas categorias e tags existentes deste usuário.',
    '',
    'CATEGORIAS DISPONÍVEIS: ' + categorias.join(', '),
    'TAGS DISPONÍVEIS: ' + tags.join(', '),
    'NATUREZAS VÁLIDAS: gasto, transferencia (pagamento de fatura de cartão), transferencia-propria (PIX entre contas do próprio usuário), entrada (reembolso/recebimento)',
    '',
    confirmados.length ? 'EXEMPLOS CONFIRMADOS PELO USUÁRIO (padrões):\n' + confirmados.map(c => `- "${c.padrao_transacao}" = ${c.descricao_lancamento}`).join('\n') : '',
    '',
    'REGRAS:',
    '- Use SEMPRE uma categoria e tag da lista (ou "null" se nenhuma couber)',
    '- transferencia-propria NÃO é gasto (ex: PIX para BTG, poupança, outra conta do próprio usuário)',
    '- transferencia é pagamento de fatura de cartão (não é gasto novo)',
    '- Se não souber com confiança, use confianca baixa e a melhor estimativa',
    '',
    'Responda APENAS um JSON array: [{"id": <id>, "categoria": "...", "tags": ["..."], "natureza": "...", "confianca": 0-1}]',
    '',
    'TRANSAÇÕES:',
    JSON.stringify(transacoes.map(t => ({ id: t.id, descricao: t.descricao, valor: t.valor, data: t.data })), null, 0)
  ].filter(Boolean).join('\n');

  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
    });
    if (!resp.ok) return { ok: false, erro: `HTTP ${resp.status}` };
    const d = await resp.json();
    const texto = d.choices?.[0]?.message?.content || '';
    const jsonMatch = texto.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { ok: false, erro: 'resposta sem JSON: ' + texto.slice(0, 100) };
    return { ok: true, resultados: JSON.parse(jsonMatch[0]) };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// validar pares fracos de reconciliação: são o mesmo gasto? (Fase 2 multi-fonte)
async function validarParIA(pares, cfg) {
  const { url, key, model } = cfg || getConfigIA();
  if (!url || !key || !model) return { ok: false, erro: 'IA não configurada' };
  const prompt = [
    'Você valida se pares de transações bancárias de fontes diferentes representam O MESMO gasto real.',
    'Considere: estabelecimento (nomes variam entre bandeiras/bancos), valor, data, contexto de parcela.',
    'Cuidado com falsos positivos: valores iguais em estabelecimentos diferentes são gastos DISTINTOS.',
    '',
    'Responda APENAS um JSON array: [{"i": <índice>, "mesmo_gasto": true|false, "confianca": 0-1, "motivo": "<curto>"}]',
    '',
    'PARES:',
    JSON.stringify(pares.map((p, i) => ({
      i,
      a: { descricao: p.a.descricao, valor: p.a.valor, data: p.a.data, parcela: p.a.parcela || null },
      b: { descricao: p.b.descricao, valor: p.b.valor, data: p.b.data, parcela: p.b.parcela || null }
    })), null, 0)
  ].join('\n');
  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
    });
    if (!resp.ok) return { ok: false, erro: `HTTP ${resp.status}` };
    const d = await resp.json();
    const texto = d.choices?.[0]?.message?.content || '';
    const m = texto.match(/\[[\s\S]*\]/);
    if (!m) return { ok: false, erro: 'resposta sem JSON: ' + texto.slice(0, 100) };
    return { ok: true, resultados: JSON.parse(m[0]) };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

module.exports = { getConfigIA, salvarConfigIA, testarIA, categorizarComIA, validarParIA };