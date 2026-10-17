// Gestão Dinâmica de Contas Bancárias e Cartões (Multi-Banco / Open Finance)
const db = require('../db');

function listarContas(apenasAtivas = false) {
  const sql = apenasAtivas 
    ? 'SELECT * FROM contas_bancarias WHERE ativo=1 ORDER BY tipo, nome'
    : 'SELECT * FROM contas_bancarias ORDER BY tipo, nome';
  const rows = db.prepare(sql).all();
  return rows.map(r => {
    let fontes = [];
    try { fontes = JSON.parse(r.fontes || '[]'); } catch (e) { fontes = r.fontes ? [r.fontes] : []; }
    const cartao = db.prepare('SELECT perfil_conferido, fecha_dia, vence_dia FROM cartoes WHERE conta_local = ?').get(r.id) || {};
    return {
      ...r,
      fontes,
      perfil: cartao.perfil_conferido === 0 ? 'aprendido' : 'conferido',
      // o que a sincronização aprendeu das faturas (o assistente mostra para a pessoa conferir)
      fecha_aprendido: cartao.fecha_dia ?? null, vence_aprendido: cartao.vence_dia ?? null,
      configurado: r.tipo === 'BANK' || (r.dia_fechamento != null && r.dia_vencimento != null)
    };
  });
}

function obterContaPorId(id) {
  const r = db.prepare('SELECT * FROM contas_bancarias WHERE id=?').get(id);
  if (!r) return null;
  let fontes = [];
  try { fontes = JSON.parse(r.fontes || '[]'); } catch (e) { fontes = r.fontes ? [r.fontes] : []; }
  return { ...r, fontes };
}

function criarConta(dados) {
  const id = dados.id;
  const existente = obterContaPorId(id);
  if (existente) return salvarConta(id, dados);

  const nova = {
    id: dados.id,
    nome: dados.nome || dados.id,
    instituicao: dados.instituicao || 'outro',
    tipo: dados.tipo || 'BANK',
    conta_auvp: dados.conta_auvp || null,
    saldo_auvp: dados.saldo_auvp || null,
    fontes: JSON.stringify(dados.fontes || []),
    auvp_fonte: dados.auvp_fonte || (dados.tipo === 'CREDIT' ? 'auvp-mcp' : 'auvp-bank'),
    auvp_conta_id: dados.auvp_conta_id ?? null,
    dia_fechamento: dados.dia_fechamento != null ? parseInt(dados.dia_fechamento) : null,
    dia_vencimento: dados.dia_vencimento != null ? parseInt(dados.dia_vencimento) : null,
    cor: dados.cor || (dados.tipo === 'CREDIT' ? '#b388ff' : '#00d68f'),
    icone: dados.icone || (dados.tipo === 'CREDIT' ? '💳' : '🏦'),
    ativo: dados.ativo !== undefined ? (dados.ativo ? 1 : 0) : 1
  };

  db.prepare(`
    INSERT INTO contas_bancarias (id, nome, instituicao, tipo, conta_auvp, saldo_auvp, auvp_conta_id, fontes, auvp_fonte, dia_fechamento, dia_vencimento, cor, icone, ativo)
    VALUES (@id, @nome, @instituicao, @tipo, @conta_auvp, @saldo_auvp, @auvp_conta_id, @fontes, @auvp_fonte, @dia_fechamento, @dia_vencimento, @cor, @icone, @ativo)
  `).run(nova);

  return obterContaPorId(id);
}

function salvarConta(id, dados) {
  const conta = obterContaPorId(id);
  if (!conta) {
    return criarConta({ id, ...dados });
  }

  const nome = dados.nome !== undefined ? dados.nome : conta.nome;
  const dia_fechamento = dados.dia_fechamento !== undefined ? (dados.dia_fechamento ? parseInt(dados.dia_fechamento) : null) : conta.dia_fechamento;
  const dia_vencimento = dados.dia_vencimento !== undefined ? (dados.dia_vencimento ? parseInt(dados.dia_vencimento) : null) : conta.dia_vencimento;
  const cor = dados.cor !== undefined ? dados.cor : conta.cor;
  const icone = dados.icone !== undefined ? dados.icone : conta.icone;
  const ativo = dados.ativo !== undefined ? (dados.ativo ? 1 : 0) : conta.ativo;

  db.prepare(`
    UPDATE contas_bancarias
    SET nome = ?, dia_fechamento = ?, dia_vencimento = ?, cor = ?, icone = ?, ativo = ?
    WHERE id = ?
  `).run(nome, dia_fechamento, dia_vencimento, cor, icone, ativo, id);

  // cartão: fechamento e vencimento informados aqui viram o perfil conferido usado pelo motor (core/comprometido.js);
  // a sincronização deixa de reaprender esse cartão
  if (conta.tipo === 'CREDIT' && (dados.dia_fechamento !== undefined || dados.dia_vencimento !== undefined) && dia_fechamento && dia_vencimento) {
    db.prepare('UPDATE cartoes SET fecha_dia = ?, vence_dia = ?, perfil_conferido = 1, incluir = 1 WHERE conta_local = ?')
      .run(dia_fechamento, dia_vencimento, id);
  }

  return obterContaPorId(id);
}

function autoDescobrirContas(contasAUVP) {
  if (!Array.isArray(contasAUVP)) return [];
  const descobertas = [];
  const existentes = db.prepare('SELECT * FROM contas_bancarias').all();

  for (const c of contasAUVP) {
    const nome = c.nome || c.name || '';
    if (!nome) continue;

    // o tipo vem da AUVP (CREDIT = cartão)
    const isCredit = c.tipo === 'CREDIT' || c.subtipo === 'CREDIT_CARD';
    const tipo = isCredit ? 'CREDIT' : 'BANK';

    // já existe: pelo id da AUVP; conta antiga sem id casa pelo nome e tipo e passa a guardar o id
    const mesmoNome = n => n && n.toLowerCase() === nome.toLowerCase();
    const match = (c.id != null && existentes.find(e => e.auvp_conta_id === c.id))
      || existentes.find(e => e.tipo === tipo && e.auvp_conta_id == null && (mesmoNome(e.conta_auvp) || mesmoNome(e.saldo_auvp) || mesmoNome(e.nome)));
    if (match) {
      if (match.auvp_conta_id == null && c.id != null) {
        db.prepare('UPDATE contas_bancarias SET auvp_conta_id = ? WHERE id = ?').run(c.id, match.id);
        match.auvp_conta_id = c.id;
      }
      continue;
    }

    // conta nova na AUVP: o nome dá para trocar em Configurar
    const slug = (isCredit ? 'cartao_' : 'conta_') + (nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || String(c.id));
    const id = obterContaPorId(slug) ? slug + '_' + c.id : slug;

    const nova = criarConta({
      id,
      nome: nome,
      instituicao: c.marca || 'outro',
      tipo,
      conta_auvp: nome,
      saldo_auvp: nome,
      auvp_conta_id: c.id ?? null,
      fontes: [],
      auvp_fonte: isCredit ? 'auvp-mcp' : 'auvp-bank',
      dia_fechamento: null,
      dia_vencimento: null,
      cor: isCredit ? '#b388ff' : '#00d68f',
      icone: isCredit ? '💳' : '🏦',
      ativo: 1
    });

    descobertas.push(nova);
    existentes.push(nova);
  }

  return descobertas;
}

function mapaContasExtrato() {
  const contas = listarContas(true);
  const mapa = {};
  for (const c of contas) {
    mapa[c.id] = {
      id: c.id,
      nome: c.nome,
      instituicao: c.instituicao,
      tipo: c.tipo,
      contaAUVP: c.conta_auvp,
      saldoAUVP: c.saldo_auvp,
      fontes: c.fontes,
      auvpFonte: c.auvp_fonte,
      diaFechamento: c.dia_fechamento,
      diaVencimento: c.dia_vencimento,
      cor: c.cor,
      icone: c.icone
    };
  }
  return mapa;
}

module.exports = {
  listarContas,
  obterContaPorId,
  criarConta,
  salvarConta,
  autoDescobrirContas,
  mapaContasExtrato
};
