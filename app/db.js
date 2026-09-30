const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = process.env.FINANCA_DB || path.join(__dirname, 'financas.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS meses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_id INTEGER NOT NULL REFERENCES meses(id),
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id),
  pago INTEGER NOT NULL DEFAULT 0,
  pago_em TEXT,
  forma TEXT,
  recorrencia_id INTEGER REFERENCES recorrencias(id),
  parcela TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recorrencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL,
  dia_venc INTEGER,
  categoria_id INTEGER REFERENCES categorias(id),
  tipo TEXT NOT NULL DEFAULT 'Recorrente',
  forma TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  periodicidade INTEGER DEFAULT 1,
  data_base TEXT,
  total_parcelas INTEGER,
  parcela_atual INTEGER,
  observacao TEXT,
  padrao_busca TEXT
);

CREATE TABLE IF NOT EXISTS importacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  arquivo TEXT,
  data_importacao TEXT NOT NULL DEFAULT (datetime('now')),
  linhas INTEGER,
  resumo TEXT
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  valor REAL NOT NULL,
  descricao TEXT NOT NULL,
  fonte TEXT NOT NULL,
  natureza TEXT NOT NULL DEFAULT 'gasto',
  categoria TEXT,
  parcela TEXT,
  hash_unico TEXT UNIQUE,
  importacao_id INTEGER REFERENCES importacoes(id),
  parcela_id INTEGER REFERENCES parcelas(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trans_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_trans_fonte ON transacoes(fonte);

CREATE TABLE IF NOT EXISTS regras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  padrao TEXT NOT NULL,
  campo TEXT NOT NULL DEFAULT 'descricao',
  categoria TEXT,
  natureza TEXT,
  prioridade INTEGER NOT NULL DEFAULT 100,
  ativa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'fixa',
  valor_base REAL,
  padrao_texto TEXT,
  dia_pagamento INTEGER,
  valor_hora REAL,
  ativo INTEGER NOT NULL DEFAULT 1,
  observacao TEXT
);

-- Fase 1: identidade de compras (fonte de verdade única multi-fonte)
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estabelecimento TEXT NOT NULL,
  valor_parcela REAL NOT NULL,
  n_parcelas INTEGER NOT NULL,
  mes_inicio TEXT,
  fonte_origem TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compras_est ON compras(estabelecimento, valor_parcela);

CREATE TABLE IF NOT EXISTS parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  vencimento TEXT,
  status TEXT NOT NULL DEFAULT 'agendada',
  UNIQUE(compra_id, n)
);
CREATE INDEX IF NOT EXISTS idx_parcelas_venc ON parcelas(vencimento);

CREATE TABLE IF NOT EXISTS gastos_unificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gasto_id INTEGER NOT NULL REFERENCES transacoes(id),
  fonte_origem TEXT NOT NULL,
  hash_externo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gu_gasto ON gastos_unificados(gasto_id);

CREATE TABLE IF NOT EXISTS sincronizacoes_auvp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  resultados TEXT,
  data_sync TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rendas_realizadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mes TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  transacao_id INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mes, descricao)
);

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

CREATE TABLE IF NOT EXISTS contas_bancarias (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('BANK', 'CREDIT')),
  conta_auvp TEXT,
  saldo_auvp TEXT,
  fontes TEXT,
  auvp_fonte TEXT,
  dia_fechamento INTEGER,
  dia_vencimento INTEGER,
  cor TEXT DEFAULT '#4dabff',
  icone TEXT DEFAULT '🏦',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// seed básico
const cats = db.prepare('SELECT COUNT(*) AS n FROM categorias').get();
if (cats.n === 0) {
  const ins = db.prepare('INSERT INTO categorias (nome) VALUES (?)');
  ['Casa', 'Dívida', 'Mãe', 'Saúde', 'Cartões', 'Pets', 'Outros'].forEach(c => ins.run(c));
}
const cfg = db.prepare("SELECT COUNT(*) AS n FROM config").get();
if (cfg.n === 0) {
  db.prepare("INSERT INTO config (chave, valor) VALUES ('mes_atual', '09-2026')").run();
}

// seed contas_bancarias
const nContas = db.prepare('SELECT COUNT(*) AS n FROM contas_bancarias').get();
if (nContas.n === 0) {
  const insConta = db.prepare(`
    INSERT INTO contas_bancarias (id, nome, instituicao, tipo, conta_auvp, saldo_auvp, fontes, auvp_fonte, dia_fechamento, dia_vencimento, cor, icone, ativo)
    VALUES (@id, @nome, @instituicao, @tipo, @conta_auvp, @saldo_auvp, @fontes, @auvp_fonte, @dia_fechamento, @dia_vencimento, @cor, @icone, 1)
  `);
  const iniciais = [
    { id: 'itau', nome: 'Itaú conta', instituicao: 'itau', tipo: 'BANK', conta_auvp: 'itau', saldo_auvp: 'itau', fontes: JSON.stringify(['itau-conta']), auvp_fonte: 'auvp-bank', dia_fechamento: null, dia_vencimento: null, cor: '#00d68f', icone: '🏦' },
    { id: 'nubank_conta', nome: 'Nubank conta', instituicao: 'nubank', tipo: 'BANK', conta_auvp: 'Nu Pagamentos S.A. - Instituição de Pagamento', saldo_auvp: 'Nu Pagamentos S.A. - Instituição de Pagamento', fontes: JSON.stringify([]), auvp_fonte: 'auvp-bank', dia_fechamento: null, dia_vencimento: null, cor: '#820ad1', icone: '🟣' },
    { id: 'btg', nome: 'BTG conta', instituicao: 'btg', tipo: 'BANK', conta_auvp: 'BTG Banking', saldo_auvp: 'BTG Banking', fontes: JSON.stringify([]), auvp_fonte: 'auvp-bank', dia_fechamento: null, dia_vencimento: null, cor: '#001e62', icone: '💼' },
    { id: 'nubank_cartao', nome: 'Nubank (Gold)', instituicao: 'nubank', tipo: 'CREDIT', conta_auvp: 'gold', saldo_auvp: 'gold', fontes: JSON.stringify(['nubank', 'nubank-csv']), auvp_fonte: 'auvp-mcp', dia_fechamento: 24, dia_vencimento: 1, cor: '#820ad1', icone: '🟣' },
    { id: 'itau_cartao', nome: 'Itaú (Visa Signature)', instituicao: 'itau', tipo: 'CREDIT', conta_auvp: 'Itau Uniclass Visa Signature', saldo_auvp: 'Itau Uniclass Visa Signature', fontes: JSON.stringify(['itau-fatura']), auvp_fonte: 'auvp-mcp', dia_fechamento: 24, dia_vencimento: 1, cor: '#ff7a00', icone: '🟧' },
    { id: 'mp_cartao', nome: 'Mercado Pago (Visa)', instituicao: 'mercadopago', tipo: 'CREDIT', conta_auvp: 'Mercado Pago', saldo_auvp: 'Mercado Pago', fontes: JSON.stringify(['mercadopago']), auvp_fonte: 'auvp-mcp', dia_fechamento: 29, dia_vencimento: 5, cor: '#009ee3', icone: '💙' }
  ];
  for (const c of iniciais) insConta.run(c);
}

// migração aditiva: parcela_id em transacoes (bancos existentes)
try { db.exec('ALTER TABLE transacoes ADD COLUMN parcela_id INTEGER REFERENCES parcelas(id)'); }
catch (e) { /* já existe */ }
// migração aditiva: venc_fatura (mês da fatura que cobra a parcela) + conta (cartão AUVP)
try { db.exec('ALTER TABLE transacoes ADD COLUMN venc_fatura TEXT'); }
catch (e) { /* já existe */ }
try { db.exec('ALTER TABLE transacoes ADD COLUMN conta TEXT'); }
catch (e) { /* já existe */ }
// migração aditiva: observacao (nota pessoal na transação)
try { db.exec('ALTER TABLE transacoes ADD COLUMN observacao TEXT'); }
catch (e) { /* já existe */ }
// migração aditiva: padrao_busca em recorrencias
try { db.exec('ALTER TABLE recorrencias ADD COLUMN padrao_busca TEXT'); }
catch (e) { /* já existe */ }
// migração aditiva: cancelamento de compra (estorno/cancelamento do merchant)
// cancelada=0 normal; 1 = compra cancelada — parcelas saem da projeção, evidências viram tombstone
try { db.exec('ALTER TABLE compras ADD COLUMN cancelada INTEGER NOT NULL DEFAULT 0'); }
catch (e) { /* já existe */ }
try { db.exec('ALTER TABLE compras ADD COLUMN cancelada_em TEXT'); }
catch (e) { /* já existe */ }
try { db.exec('ALTER TABLE compras ADD COLUMN motivo_cancelamento TEXT'); }
catch (e) { /* já existe */ }
// limpeza de tabelas descontinuadas (assinaturas e tags)
try { db.exec('DROP TABLE IF EXISTS assinaturas; DROP TABLE IF EXISTS transacao_tags; DROP TABLE IF EXISTS tags;'); }
catch (e) { /* já limpo */ }

module.exports = db;