const XLSX = require('xlsx');
const path = require('node:path');
const db = require('../db');

const arquivo = process.argv[2] || path.join(__dirname, '..', '..', 'Controle Mensal.xlsx');
const wb = XLSX.readFile(arquivo);

function parseBRDate(s) {
  if (s == null || s === '') return null;
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  if (typeof s === 'number' && s > 20000 && s < 60000) {
    // serial Excel (dias desde 30/12/1899)
    const d = new Date(Date.UTC(1899, 11, 30) + s * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function parseRefMes(s) {
  if (s == null) return null;
  if (typeof s === 'number' && s > 20000 && s < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + s * 86400000);
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
  }
  const m = String(s).trim().match(/^(\d{2})[-\/](\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  return ['TRUE', 'true', '1', 'x', 'X', 'sim'].includes(String(v).trim());
}

// ---- Mapas para dedupe/links ----
const catId = {};
for (const c of db.prepare('SELECT id, nome FROM categorias').all()) catId[c.nome] = c.id;

function getOrCreateCategoria(nome) {
  if (!nome) return null;
  if (catId[nome]) return catId[nome];
  const r = db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(nome);
  catId[nome] = Number(r.lastInsertRowid);
  return catId[nome];
}

// ---- 1. Importar abas mensais ----
const abasMes = wb.SheetNames.filter(n => /^\d{2}-\d{4}$/.test(n));
let totalLanc = 0;

const insLanc = db.prepare(`INSERT INTO lancamentos
  (mes_id, descricao, valor, vencimento, categoria_id, pago, origem, parcela, observacao)
  VALUES (?, ?, ?, ?, ?, ?, 'planilha', ?, ?)`);
const getMes = db.prepare('SELECT id FROM meses WHERE ref = ?');
const insMes = db.prepare('INSERT INTO meses (ref) VALUES (?)');

for (const aba of abasMes) {
  const ref = aba; // "09-2026"
  let mes = getMes.get(ref);
  if (!mes) {
    insMes.run(ref);
    mes = getMes.get(ref);
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { defval: null });
  let count = 0;
  for (const row of rows) {
    const desc = row['Descrição'];
    const valor = parseNum(row['Valor']);
    if (!desc || valor == null) continue;
    // Colunas A-G são os lançamentos; ignora blocos RESUMO/POR CATEGORIA (sem Descrição/Valor reais)
    if (row['Vencimento'] == null) continue;
    const venc = parseBRDate(row['Vencimento']);
    if (!venc) continue;
    const pago = toBool(row['Pago']) || String(row['Status'] || '').toUpperCase() === 'PAGO';
    const cat = getOrCreateCategoria(row['Categoria']);
    // Extrai parcela de "Leão - IRPF (4/8)"
    let parcela = null;
    const pm = String(desc).match(/\((\d+\/\d+)\)\s*$/);
    if (pm) parcela = pm[1];
    insLanc.run(mes.id, desc, valor, venc, cat, pago ? 1 : 0, parcela, null);
    count++;
  }
  totalLanc += count;
  console.log(`  ${aba}: ${count} lançamentos`);
}

// ---- 2. Importar Recorrentes ----
const rowsRec = XLSX.utils.sheet_to_json(wb.Sheets['Recorrentes'], { defval: null });
let countRec = 0;
for (const row of rowsRec) {
  const desc = row['Descrição'];
  if (!desc) continue;
  const ativo = toBool(row['Ativo']);
  if (!ativo && countRec > 0 && !row['Tipo']) {
    // linhas vazias de preenchimento futuro com Ativo FALSE
    if (!row['Valor'] && !row['Dia Venc.']) continue;
  }
  const tipo = row['Tipo'] || 'Recorrente';
  const valor = parseNum(row['Valor']);
  const dia = parseNum(row['Dia Venc.']);
  const cat = getOrCreateCategoria(row['Categoria']);
  const period = parseNum(row['Periodicidade (meses)']) || 1;
  const base = parseBRDate(row['Data base']);
  const totalP = parseNum(row['Total parcelas']);
  const atualP = parseNum(row['Parcela atual']);
  const obs = row['Observações'] || null;
  // nome limpo (sem "(n/m)") para casar com lançamentos
  const descLimpa = String(desc).replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
  const r = db.prepare(`INSERT INTO recorrencias
    (descricao, valor, dia_venc, categoria_id, tipo, forma, ativo, periodicidade, data_base, total_parcelas, parcela_atual, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(descLimpa, valor, dia, cat, tipo, row['Forma'] || null, ativo ? 1 : 0, period, base, totalP, atualP, obs);
  countRec++;
}
console.log(`  Recorrentes: ${countRec}`);

// ---- 3. Config: mês atual da planilha ----
try {
  const cfgRows = XLSX.utils.sheet_to_json(wb.Sheets['Config'], { defval: null });
  for (const r of cfgRows) {
    if (r['Campo'] === 'Mês Atual') {
      const ref = parseRefMes(r['Valor']);
      if (ref) db.prepare("UPDATE config SET valor = ? WHERE chave = 'mes_atual'").run(ref);
    }
  }
} catch (e) { /* config opcional */ }

// ---- 4. Resumo ----
const tot = db.prepare('SELECT COUNT(*) AS n FROM lancamentos').get();
const rec = db.prepare('SELECT COUNT(*) AS n FROM recorrencias WHERE ativo = 1').get();
console.log(`\nImportação concluída: ${tot.n} lançamentos, ${rec.n} recorrentes ativos.`);
console.log(`Mês atual: ${db.prepare("SELECT valor FROM config WHERE chave='mes_atual'").get().valor}`);