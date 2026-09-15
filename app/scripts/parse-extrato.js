// Parser de CSVs de bancos e cartões (formatos brasileiros comuns)
// Retorna array de { data, valor, descricao } normalizado

function detectarFormato(header, primeiraLinha) {
  const h = header.join('|').toLowerCase();
  if (h.includes('entrada') && h.includes('saída') || h.includes('entrada') && h.includes('saida')) return 'itau-conta';
  if (h.includes('date') && h.includes('title') && h.includes('amount')) return 'nubank-fatura';
  if (h.includes('data') && h.includes('lançamento') || h.includes('data') && h.includes('lancamento')) return 'cartao-generico';
  if (h.includes('data') && h.includes('valor') && h.includes('crédito') || h.includes('credito')) return 'cartao-generico';
  return 'generico';
}

function parseNumBR(s) {
  if (typeof s === 'number') return s;
  if (!s) return null;
  let t = String(s).trim().replace(/[R$\s]/g, '');
  if (t.includes(',')) {
    // formato BR: 1.234,56
    t = t.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function parseData(s, anoFallback) {
  if (!s) return null;
  s = String(s).trim();
  // dd/mm/yyyy ou dd/mm/yy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let ano = parseInt(m[3]);
    if (ano < 100) ano += 2000;
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && anoFallback) return `${anoFallback}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// divide linha CSV respeitando aspas
function splitCSVLine(line, sep) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function detectarSeparador(linha) {
  const semi = (linha.match(/;/g) || []).length;
  const virg = (linha.match(/,/g) || []).length;
  const tab = (linha.match(/\t/g) || []).length;
  if (tab > semi && tab > virg) return '\t';
  return semi > virg ? ';' : ',';
}

function hashTx(data, valor, desc, parcela) {
  return `${data}|${valor.toFixed(2)}|${desc.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 60)}|${parcela || ''}`;
}

function parseCSV(texto, fonteNome) {
  const linhas = String(texto).split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { formato: 'vazio', transacoes: [] };

  // pula linhas de cabeçalho de relatório (ex: Itaú tem linhas antes do header real)
  let headerIdx = -1, header = null;
  const sep = detectarSeparador(linhas.find(l => l.trim()) || '');
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cols = splitCSVLine(linhas[i], sep);
    const joined = cols.join('|').toLowerCase();
    if ((joined.includes('data') || joined.includes('date')) && (joined.includes('valor') || joined.includes('amount') || joined.includes('saída') || joined.includes('saida') || joined.includes('entrada'))) {
      headerIdx = i; header = cols; break;
    }
  }
  if (headerIdx === -1) return { formato: 'desconhecido', transacoes: [] };

  const formato = detectarFormato(header, linhas[headerIdx + 1] || '');
  const idx = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase().trim();
    if (k === 'data' || k === 'date') idx.data = i;
    else if (k === 'lançamento' || k === 'lancamento') idx.desc = i;
    else if (k === 'histórico' || k === 'historico' || k === 'title' || k === 'descrição' || k === 'descricao' || k === 'descrição') idx.desc = i;
    else if (k === 'valor' || k === 'amount') idx.valor = i;
    else if (k === 'entrada' || k === 'crédito' || k === 'credito' || k === 'crédito (r$)') idx.entrada = i;
    else if (k === 'saída' || k === 'saida' || k === 'débito' || k === 'debito' || k === 'débito (r$)') idx.saida = i;
    else if (k === 'parcela' || k === 'installment') idx.parcela = i;
  });

  const anoFallback = new Date().getFullYear();
  const transacoes = [];
  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const cols = splitCSVLine(linhas[i], sep);
    if (!cols.length || !cols[0]) continue;
    const data = parseData(cols[idx.data], anoFallback);
    if (!data) continue;
    let valor = null, desc = null, parcela = null;
    if (idx.valor != null) valor = parseNumBR(cols[idx.valor]);
    else if (idx.saida != null || idx.entrada != null) {
      const s = idx.saida != null ? parseNumBR(cols[idx.saida]) : null;
      const e = idx.entrada != null ? parseNumBR(cols[idx.entrada]) : null;
      if (s != null && s !== 0) valor = -Math.abs(s);
      else if (e != null && e !== 0) valor = Math.abs(e);
    }
    if (idx.desc != null) desc = cols[idx.desc];
    if (idx.parcela != null) parcela = cols[idx.parcela];
    if (valor == null || !desc) continue;
    if (/^saldo|^total/i.test(desc)) continue;
    // extrair parcela da descrição no padrão Nubank: "Gowd - Parcela 1/2" ou "App *X 2/12"
    if (!parcela) {
      const mp = String(desc).match(/-\s*Parcela\s*(\d{1,2})\/(\d{1,2})$/i) || String(desc).match(/\s(\d{1,2})\/(\d{1,2})$/);
      if (mp) { parcela = `${mp[1]}/${mp[2]}`; desc = String(desc).replace(/-\s*Parcela\s*\d{1,2}\/\d{1,2}$/i, '').replace(/\s\d{1,2}\/\d{1,2}$/, '').trim(); }
    }
    // fatura com coluna única de valor (amount): positivo = GASTO (negativar pra bater
    // com o hash do PDF, que usa sinal negativo); negativo = pagamento/entrada (manter)
    // "Pagamento recebido" = crédito do pagamento da fatura NO CARTÃO → SEMPRE positivo
    if (/^pagamento recebido/i.test(desc)) valor = Math.abs(valor);
    else if (idx.valor != null && valor > 0 && !/^pagamento|^recebido|^estorno/i.test(desc)) valor = -valor;
    transacoes.push({ data, valor, descricao: desc.trim(), parcela, fonte: fonteNome, hash_unico: hashTx(data, valor, desc.trim(), parcela) });
  }
  return { formato, transacoes };
}

module.exports = { parseCSV, parseNumBR, parseData, hashTx };