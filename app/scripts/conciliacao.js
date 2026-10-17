// Conciliação bancária v2 + motor de aprendizado por confirmação
const db = require('../db');

// tabela de padrões confirmados: "DA REC FED" → sempre é Leão - IRPF
db.exec(`
CREATE TABLE IF NOT EXISTS conciliacoes_confirmadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  padrao_transacao TEXT NOT NULL,
  descricao_lancamento TEXT NOT NULL,
  confirmacoes INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(padrao_transacao)
);
CREATE TABLE IF NOT EXISTS conciliacoes_recusadas (
  transacao_id INTEGER PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// extrai "assinatura" da descrição: primeiras palavras significativas em maiúsculas
function padraoDe(descricao) {
  return descricao.toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^\d+$/.test(w))
    .slice(0, 3)
    .join(' ');
}

// busca padrão confirmado para a transação
function padraoConfirmado(descricao) {
  const p = padraoDe(descricao);
  if (!p) return null;
  // match exato ou por prefixo
  const exato = db.prepare('SELECT * FROM conciliacoes_confirmadas WHERE padrao_transacao = ?').get(p);
  if (exato) return exato;
  const prefixos = db.prepare('SELECT * FROM conciliacoes_confirmadas').all();
  for (const c of prefixos) {
    if (p.startsWith(c.padrao_transacao) || c.padrao_transacao.startsWith(p)) return c;
  }
  return null;
}

// ---------- REGRA ÚNICA de casamento conta do mês × transação (15/10/2026) ----------
// Usada pelas sugestões do Reconciliar e pela conciliação automática, para as duas nunca discordarem.
// - só transação de conta (PIX, boleto, débito); compra no cartão já está na fatura
// - só o que já aconteceu, ainda não pagou outra conta e não foi recusado para este par
// - janela: de 15 dias antes a 10 dias depois do vencimento
// - "certo": identidade (termo da recorrência, palavra da descrição ou padrão já confirmado por você)
//   + valor até 15% (mín. R$ 15) de diferença; é o único nível que a conciliação automática aplica, e só sem ambiguidade
// - "sugerido": identidade com valor mais distante (até 50%), ou valor idêntico sem identidade
//   (ex.: um PIX genérico de valor exato no dia do vencimento); só vira pago quando você confirma
const JANELA_ANTES = 15, JANELA_DEPOIS = 10;
const { fontesCartao } = require('../core/fontes');
const r2 = v => Math.round(v * 100) / 100;
const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dias = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

function termosDe(l) {
  const termos = [];
  if (l.padrao_busca) l.padrao_busca.split('|').forEach(t => t.trim() && termos.push(t.trim().toUpperCase()));
  l.descricao.toUpperCase().replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\s+/).filter(w => w.length >= 4 && !/^\d/.test(w)).forEach(w => termos.push(w));
  return termos;
}

function avaliarPar(l, t) {
  const lVal = Math.abs(l.valor), tVal = Math.abs(t.valor);
  const difData = dias(t.data, l.vencimento);
  if (difData < -JANELA_ANTES || difData > JANELA_DEPOIS) return null;
  const difVal = Math.abs(tVal - lVal);
  const desc = t.descricao.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const conf = padraoConfirmado(t.descricao);
  const identidade = termosDe(l).some(termo => desc.includes(termo))
    || !!(conf && l.descricao.toLowerCase().startsWith(conf.descricao_lancamento.toLowerCase().slice(0, 12)));
  let nivel = null;
  if (identidade && difVal <= Math.max(lVal * 0.15, 15)) nivel = 'certo';
  else if (identidade && difVal <= lVal * 0.5) nivel = 'sugerido';
  else if (difVal <= 0.05) nivel = 'sugerido';
  if (!nivel) return null;
  return { nivel, identidade, difVal: r2(difVal), difData, score: difVal + Math.abs(difData) * 2 + (identidade ? 0 : 20) };
}

// todos os pares possíveis, já filtrados pelas restrições comuns
function paresCandidatos({ mesId = null, hoje = hojeISO() } = {}) {
  const lancs = db.prepare(`SELECT l.*, r.padrao_busca, m.ref mes_ref FROM lancamentos l
    JOIN meses m ON m.id = l.mes_id
    LEFT JOIN categorias c ON c.id = l.categoria_id
    LEFT JOIN recorrencias r ON r.id = l.recorrencia_id
    WHERE l.pago = 0 AND COALESCE(c.nome, '') != 'Cartões' AND l.vencimento <= date(?, '+${JANELA_ANTES} days')
    ${mesId ? 'AND l.mes_id = ?' : ''} ORDER BY l.vencimento`).all(...(mesId ? [hoje, mesId] : [hoje]));
  const FONTES_CARTAO = fontesCartao();
  const txs = db.prepare(`SELECT id, data, valor, descricao, fonte FROM transacoes
    WHERE natureza = 'gasto' AND valor < 0 AND data <= ? AND data >= date(?, '-60 days')
    AND fonte NOT IN (${FONTES_CARTAO.map(() => '?').join(',')})
    AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL AND pago = 1)
    ORDER BY data DESC`).all(hoje, hoje, ...FONTES_CARTAO);
  const recusado = db.prepare('SELECT 1 FROM conciliacoes_recusadas_par WHERE lancamento_id = ? AND transacao_id = ?');
  const pares = [];
  for (const l of lancs) for (const t of txs) {
    const a = avaliarPar(l, t);
    if (a && !recusado.get(l.id, t.id)) pares.push({ l, t, ...a });
  }
  return { lancs, txs, pares };
}

// um para um, do par mais forte para o mais fraco
function escolher(pares) {
  const ordem = { certo: 0, sugerido: 1 };
  const usL = new Set(), usT = new Set(), escolhidos = [];
  for (const p of pares.slice().sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.score - b.score)) {
    if (usL.has(p.l.id) || usT.has(p.t.id)) continue;
    usL.add(p.l.id); usT.add(p.t.id);
    // ambíguo: outra transação igualmente forte para a mesma conta, ou outra conta para a mesma transação
    const rivais = pares.filter(q => q !== p && q.nivel === p.nivel && (q.l.id === p.l.id || q.t.id === p.t.id) && Math.abs(q.score - p.score) < 1);
    escolhidos.push({ ...p, ambiguo: rivais.length > 0 });
  }
  return escolhidos;
}

const fmt2 = v => 'R$ ' + Math.abs(v).toFixed(2);

// sugestões do Reconciliar
function conciliar() {
  const { lancs, txs, pares } = paresCandidatos();
  const escolhidos = escolher(pares);
  const sugestoes = escolhidos.map(p => ({
    transacao_id: p.t.id, lancamento_id: p.l.id,
    transacao: p.t.descricao.slice(0, 30) + ' · ' + p.t.data + ' · ' + fmt2(p.t.valor),
    previsto: p.l.descricao + ' ' + (p.l.parcela || '') + ' (venc ' + p.l.vencimento + ')',
    previstoValorPrevisto: fmt2(p.l.valor),
    transacaoValorReal: fmt2(p.t.valor),
    difVal: p.difVal, difData: Math.abs(p.difData),
    nivel: p.nivel, ambiguo: p.ambiguo,
    fonte: p.identidade ? 'regra' : 'valor', score: r2(p.score)
  }));
  const hoje = hojeISO();
  const comSug = new Set(sugestoes.map(s => s.lancamento_id));
  const vencidos_sem_pagamento = lancs.filter(l => l.vencimento < hoje && !comSug.has(l.id))
    .map(l => ({ lancamento_id: l.id, descricao: l.descricao, parcela: l.parcela, valor: l.valor, vencimento: l.vencimento }));
  const txUsadas = new Set(sugestoes.map(s => s.transacao_id));
  const avulsos = db.prepare(`SELECT * FROM transacoes WHERE id IN (${txs.map(t => t.id).join(',') || 0})
    ORDER BY data DESC`).all().filter(t => !txUsadas.has(t.id)).slice(0, 40);
  return { sugestoes, vencidos_sem_pagamento, avulsos };
}

// confirmar: aprende o padrão + marca pago + avança parcela
function confirmar({ lancamento_id, transacao_id, recusar }) {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(lancamento_id);
  if (!l) return { erro: 'lançamento não encontrado' };

  if (recusar) {
    // recusou a sugestão: vale só para ESTE par — a transação continua candidata a outras contas e no dia a dia
    if (transacao_id) {
      db.prepare('INSERT OR IGNORE INTO conciliacoes_recusadas_par (lancamento_id, transacao_id) VALUES (?, ?)').run(l.id, transacao_id);
    }
    return { ok: true, recusado: true };
  }

  const t = transacao_id ? db.prepare('SELECT * FROM transacoes WHERE id=?').get(transacao_id) : null;

  // transação já anexada a outro lançamento? bloqueia (conta duplicada / re-anexo indevido)
  if (t) {
    const outro = db.prepare('SELECT id, descricao FROM lancamentos WHERE transacao_id=? AND id != ?').get(t.id, l.id);
    if (outro) {
      return { erro: `Essa transação já pagou "${outro.descricao}" (lançamento #${outro.id}). Confira se não é conta duplicada.`, ja_vinculada: { lancamento_id: outro.id, descricao: outro.descricao } };
    }
  }

  // aprende: associação padrão-transação → descrição lançamento
  if (t) {
    const padrao = padraoDe(t.descricao);
    if (padrao) {
      const existente = db.prepare('SELECT * FROM conciliacoes_confirmadas WHERE padrao_transacao=?').get(padrao);
      if (existente) {
        db.prepare('UPDATE conciliacoes_confirmadas SET confirmacoes=confirmacoes+1, descricao_lancamento=? WHERE id=?')
          .run(l.descricao, existente.id);
      } else {
        db.prepare('INSERT INTO conciliacoes_confirmadas (padrao_transacao, descricao_lancamento) VALUES (?, ?)')
          .run(padrao, l.descricao);
      }
    }
  }

  // marca pago com data real + vínculo estrutural (pago ⟺ transação)
  const dataPago = t ? t.data : new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=? WHERE id=?').run(dataPago, t ? t.id : null, l.id);

  // valor REAL pago ≠ previsto (ex: parcela do apto prevista 560, paga 555,09):
  // o lançamento é estimativa; a transação é a verdade. Atualiza o valor da conta.
  // lançamento é SEMPRE positivo (valor a pagar) — convenção negativa é só do extrato
  if (t && Math.abs(Math.abs(t.valor) - Math.abs(l.valor)) > 0.01) {
    db.prepare('UPDATE lancamentos SET valor=? WHERE id=?').run(Math.abs(t.valor), l.id);
  }

// avança parcela da recorrência
  if (l.recorrencia_id && l.parcela) {
    const m = l.parcela.match(/(\d+)\/(\d+)/);
    if (m) {
      const atual = parseInt(m[1]), total = parseInt(m[2]);
      if (atual >= 1 && atual <= total) {
        db.prepare('UPDATE recorrencias SET parcela_atual=? WHERE id=?').run(atual, l.recorrencia_id);
      }
    }
  }
  return { ok: true, aprendeu: !!t };
}

// Conciliação automática: a mesma regra, aplicando só o nível "certo" e sem ambiguidade
function autoConciliarMes(mesRef) {
  let ref = mesRef;
  if (ref && /^\d{4}-\d{2}$/.test(ref)) { const [y, m] = ref.split('-'); ref = `${m}-${y}`; }
  const mes = ref ? db.prepare('SELECT id FROM meses WHERE ref = ?').get(ref) : null;
  if (ref && !mes) return { ok: true, conciliados: 0, detalhes: [] };
  const { pares } = paresCandidatos({ mesId: mes ? mes.id : null });
  const upd = db.prepare('UPDATE lancamentos SET pago = 1, pago_em = ?, transacao_id = ?, valor = ? WHERE id = ? AND pago = 0');
  const detalhes = [];
  for (const p of escolher(pares)) {
    if (p.nivel !== 'certo' || p.ambiguo) continue;
    upd.run(p.t.data, p.t.id, Math.abs(p.t.valor), p.l.id);
    detalhes.push({ lancamento_id: p.l.id, descricao: p.l.descricao, vencimento: p.l.vencimento,
      transacao_id: p.t.id, transacao_desc: p.t.descricao, transacao_data: p.t.data, valor: Math.abs(p.t.valor) });
  }
  return { ok: true, conciliados: detalhes.length, detalhes };
}

// Contas em aberto do mês com os pagamentos possíveis de cada uma — a mesma regra das sugestões
function contasDoMesComCandidatos(ref) {
  const mes = db.prepare('SELECT id FROM meses WHERE ref = ?').get(ref);
  if (!mes) return { ok: true, mes: ref, contas: [] };
  const { lancs, pares } = paresCandidatos({ mesId: mes.id });
  const abertas = db.prepare(`SELECT l.*, c.nome categoria_nome FROM lancamentos l LEFT JOIN categorias c ON c.id = l.categoria_id
    WHERE l.mes_id = ? AND l.pago = 0 AND COALESCE(c.nome, '') != 'Cartões' ORDER BY l.vencimento`).all(mes.id);
  const contas = abertas.map(l => ({
    id: l.id, descricao: l.descricao, valor: Math.abs(l.valor), vencimento: l.vencimento,
    parcela: l.parcela, recorrencia_id: l.recorrencia_id, categoria: l.categoria_nome,
    candidatos: pares.filter(p => p.l.id === l.id).sort((a, b) => a.score - b.score).slice(0, 5)
      .map(p => ({ id: p.t.id, data: p.t.data, descricao: p.t.descricao, valor: Math.abs(p.t.valor), fonte: p.t.fonte, nivel: p.nivel }))
  }));
  return { ok: true, mes: ref, contas, ainda_nao_vencem: abertas.length - lancs.filter(l => l.mes_id === mes.id).length };
}

module.exports = { conciliar, confirmar, padraoDe, padraoConfirmado, autoConciliarMes, avaliarPar, contasDoMesComCandidatos };