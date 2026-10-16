// Contas fixas: pagamentos da conta corrente (boleto, PIX, débito) que se repetem todo mês viram sugestão
// de recorrência. Aceitar cria a recorrência (que gera os meses seguintes) e a conta do mês atual,
// já ligada ao pagamento se ele já aconteceu. Nada de pagador fixo no código.
const db = require('../db');
const cal = require('./calendario');

const r2 = v => Math.round(v * 100) / 100;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const mediana = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// como o pagamento foi feito: sai da chave, fica só quem recebeu
const OPERACAO = /^(BOLETO|PIX PARA|PIX ENVIADO|PIX|TRANSFERENCIA PARA|TRANSFERENCIA|TED PARA|TED|DOC|COMPRA DEBITO|COMPRA NO DEBITO|DEBITO AUTOMATICO|DEBITO AUT|DEBITO|PAGAMENTO DE|PAGAMENTO|PAGTO|PAG|SAIDA PAGAMENTO|SAIDA)\s+/;
// palavras que não identificam ninguém (o banco do recebedor, sufixo de empresa)
const VAZIAS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'S', 'A', 'SA', 'LTDA', 'ME', 'EIRELI', 'EPP', 'CIA', 'IP',
  'COMPANHIA', 'EMPRESA', 'BANCO', 'BCO', 'INSTITUICAO', 'PAGAMENTOS', 'PAGAMENTO', 'SERVICOS', 'COMERCIO', 'GRUPO']);

function recebedor(descricao) {
  let s = semAcento(descricao).toUpperCase();
  const cpf = s.match(/(CPF|CNPJ)[^A-Z]*?([\d.\/-]*\d)/);
  if (cpf) s = s.slice(0, cpf.index);
  s = s.replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3 && OPERACAO.test(s + ' '); i++) s = (s + ' ').replace(OPERACAO, '').trim();
  return { nome: s, cpf: cpf ? cpf[2].replace(/\D/g, '') : null };
}

// termo de busca para a conciliação achar o pagamento: as duas primeiras palavras do recebedor,
// se aparecem juntas no extrato; senão a primeira
function termoDeBusca(nome, descricao) {
  // PIX para pessoa: o banco não diz quem é; o final do CPF mascarado diz (ex.: '298-82')
  const cpf = String(descricao).match(/CPF[^0-9]*[\d.]*?(\d{3}-\d{2})/i);
  if (cpf) return cpf[1];
  const ws = nome.split(' ').filter(w => w.length >= 3 && !VAZIAS.has(w));
  if (!ws.length) return null;
  const texto = semAcento(descricao).toUpperCase();
  const termo = ws.length > 1 && texto.includes(ws[0] + ' ' + ws[1]) ? ws[0] + ' ' + ws[1] : ws[0];
  // recebedor é um banco (financiamento, empréstimo): PIX para qualquer pessoa daquele banco traz o mesmo nome,
  // então o termo leva o jeito de pagar junto ('BOLETO CAIXA ECONOMICA')
  if (BANCOS.test(termo)) {
    const i = texto.indexOf(termo);
    const antes = texto.slice(0, i).trim();
    if (antes && i >= 0) return (antes + ' ' + termo).replace(/\s+/g, ' ');
  }
  return termo;
}
const BANCOS = /^(CAIXA|BANCO|BCO|ITAU|BRADESCO|SANTANDER|NUBANK|NU |INTER|C6|BTG|PICPAY|MERCADO PAGO|SICOOB|SICREDI|BANRISUL|PAN|ORIGINAL|NEON|PAGBANK|PAGSEGURO)/;

const lerSet = chave => {
  const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave);
  try { return new Set(JSON.parse(r ? r.valor : '[]')); } catch (e) { return new Set(); }
};
function dispensar(chave) {
  const set = lerSet('contas_dispensadas');
  set.add(String(chave));
  db.prepare("INSERT INTO config (chave, valor) VALUES ('contas_dispensadas', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .run(JSON.stringify([...set]));
}

function sugestoes(hoje = cal.hojeISO(), meses = 6) {
  const ym = hoje.slice(0, 7);
  const fontesCartao = require('./fontes').fontesCartao();
  const saidas = db.prepare(`SELECT id, data, valor, descricao, categoria FROM transacoes
    WHERE valor < 0 AND natureza = 'gasto' AND data >= ? AND data <= ?
      AND fonte NOT IN (${fontesCartao.map(() => '?').join(',')})
      AND id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)`)
    .all(cal.addMes(ym, -meses) + '-01', hoje, ...fontesCartao);
  // o que já é recorrência cadastrada não volta como sugestão
  const termos = db.prepare('SELECT descricao, padrao_busca FROM recorrencias').all()
    .flatMap(r => (r.padrao_busca || '').split('|').map(t => semAcento(t).trim().toUpperCase()).filter(Boolean));
  const fora = lerSet('contas_dispensadas');

  const grupos = new Map();
  for (const t of saidas) {
    const { nome, cpf } = recebedor(t.descricao);
    if (!nome || /APLICACAO|APLIC|RESGATE|INVEST|IOF|TARIFA/.test(nome)) continue;
    const texto = semAcento(t.descricao).toUpperCase();
    // PIX para pessoa só sai da lista pelo próprio CPF; o nome do banco dela não basta
    if (cpf ? termos.some(x => /^\d{3}-\d{2}$/.test(x) && texto.includes(x)) : termos.some(x => texto.includes(x))) continue;
    const k = nome + (cpf ? ' CPF ' + cpf : '');
    if (!grupos.has(k)) grupos.set(k, { nome, ts: [] });
    grupos.get(k).ts.push(t);
  }
  const out = [];
  for (const [k, g] of grupos) {
    const ts = g.ts;
    const mesesDistintos = new Set(ts.map(t => t.data.slice(0, 7)));
    if (mesesDistintos.size < 2) continue;
    // conta fixa cai uma vez por mês: muitas vezes no mesmo mês é gasto do dia a dia (mercado, posto)
    if (ts.length > mesesDistintos.size * 1.5) continue;
    const valores = ts.map(t => Math.abs(t.valor));
    const med = mediana(valores);
    if (med < 20) continue;
    if (Math.max(...valores) > 3 * Math.min(...valores)) continue; // valor que varia demais não é conta fixa
    const ultima = ts.reduce((a, t) => (t.data > a.data ? t : a));
    const cats = {};
    ts.forEach(t => { if (t.categoria) cats[t.categoria] = (cats[t.categoria] || 0) + 1; });
    const chave = 'conta:' + k;
    if (fora.has(chave)) continue;
    out.push({
      chave, nome: /CPF/i.test(ultima.descricao) ? ultima.descricao.replace(/^Pix para\s+/i, 'PIX para ') : nomeLegivel(ultima.descricao), meses: mesesDistintos.size, vezes: ts.length,
      valor: r2(Math.abs(ultima.valor)), valor_min: r2(Math.min(...valores)), valor_max: r2(Math.max(...valores)),
      dia_tipico: Math.round(mediana(ts.map(t => +t.data.slice(8, 10)))),
      categoria: Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      padrao_busca: termoDeBusca(g.nome, ultima.descricao),
      pago_este_mes: ts.some(t => t.data.slice(0, 7) === ym),
      ultima: { data: ultima.data, valor: ultima.valor, descricao: ultima.descricao }
    });
  }
  return out.sort((a, b) => b.valor - a.valor);
}

// nome legível: sem o jeito de pagar, sem CPF, sem números
function nomeLegivel(d) {
  const limpo = String(d).replace(/\s*·\s*(CPF|CNPJ).*$/i, '').replace(/\d[\d.\/-]*/g, ' ').replace(/\s+/g, ' ').trim();
  const sem = limpo.replace(/^(Boleto|Pix para|Pix|Transferência para|Transferencia para|TED para|Compra débito|Compra no débito|Débito automático|Pagamento de|Pagamento|Saída Pagamento)\s+/i, '');
  return (sem || limpo).replace(/\s+(LTDA|S\.?A\.?|ME|EIRELI)\.?$/i, '').trim();
}

// aceitar: recorrência + conta do mês atual (ligada ao pagamento, se já houve)
function aceitar(d, mesAtualRef, getOrCreateMes) {
  const descricao = String(d.descricao || '').trim();
  const valor = Math.abs(Number(d.valor));
  if (!descricao || !isFinite(valor) || valor <= 0) throw new Error('descrição e valor são obrigatórios');
  const dia = Math.min(31, Math.max(1, parseInt(d.dia_venc) || 5));
  const parcelado = d.tipo === 'Parcelado';
  const total = parcelado ? parseInt(d.total_parcelas) : null;
  const atual = parcelado ? parseInt(d.parcela_atual) : null;
  if (parcelado && !(total >= 1 && atual >= 1 && atual <= total)) throw new Error('parcelado: informe a parcela atual e o total (ex.: 3 de 12)');
  let catId = null;
  if (d.categoria) {
    db.prepare('INSERT OR IGNORE INTO categorias (nome) VALUES (?)').run(d.categoria);
    catId = db.prepare('SELECT id FROM categorias WHERE nome = ?').get(d.categoria).id;
  }
  const ymAtual = cal.refParaYm(mesAtualRef);
  // parcelado: a data da 1ª parcela sai da parcela atual (a parcela k cai no mês atual)
  const dataBase = parcelado ? cal.addMes(ymAtual, -(atual - 1)) + '-01' : null;
  const padrao = d.padrao_busca ? String(d.padrao_busca).trim() : null;
  db.exec('BEGIN');
  try {
    const rec = db.prepare(`INSERT INTO recorrencias (descricao, valor, dia_venc, categoria_id, tipo, periodicidade, total_parcelas, parcela_atual, ativo, data_base, padrao_busca)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`).run(descricao, valor, dia, catId, parcelado ? 'Parcelado' : 'Recorrente', total, atual || 0, dataBase, padrao);
    const mesId = getOrCreateMes(mesAtualRef);
    db.prepare(`INSERT INTO lancamentos (mes_id, descricao, valor, vencimento, categoria_id, pago, recorrencia_id, parcela, origem)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'gerado')`)
      .run(mesId, descricao, valor, cal.diaDoMes(ymAtual, dia), catId, Number(rec.lastInsertRowid), parcelado ? `${atual}/${total}` : null);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  // se já pagou este mês, a conciliação liga o pagamento (sai do "dia a dia")
  const conc = require('../scripts/conciliacao').autoConciliarMes(mesAtualRef);
  return { ok: true, conciliados: conc.conciliados };
}

module.exports = { sugestoes, aceitar, dispensar, recebedor };
