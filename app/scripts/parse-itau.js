// Parser de PDFs Itaú usando posições (pdfreader) — resolve 2 colunas e textos fragmentados
const { PdfReader } = require('pdfreader');
const { hashTx } = require('./parse-extrato');

// agrupa itens por página+y (com tolerância), depois separa em colunas por gap de x
function lerLinhasComCoords(buffer) {
  return new Promise((resolve, reject) => {
    const rows = new Map();
    let curPage = 0;
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) return reject(err);
      if (!item) {
        const linhas = [...rows.keys()]
          .sort((a, b) => {
            const [pa, ya] = a.split('|').map(Number);
            const [pb, yb] = b.split('|').map(Number);
            return pa - pb || ya - yb;
          })
          .map(k => {
            const cells = rows.get(k).sort((a, b) => a.x - b.x);
            const cols = [];
            let cur = [], lastEnd = null;
            for (const c of cells) {
              if (lastEnd !== null && c.x - lastEnd > 0.6) { cols.push(cur); cur = []; }
              cur.push(c); lastEnd = Math.max(lastEnd || 0, c.xEnd || c.x);
            }
            cols.push(cur);
            return {
              page: parseInt(k.split('|')[0]),
              y: parseFloat(k.split('|')[1]),
              cols: cols.map(col => ({ x: col[0].x, t: col.map(c => c.t).join('') }))
            };
          });
        return resolve(linhas);
      }
      if (item.page != null && item.text == null) { curPage = item.page; return; }
      if (item.text) {
        const key = curPage + '|' + Math.round(item.y * 2) / 2;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: item.x, xEnd: item.x + (item.w || 0) / 14.6, t: item.text });
      }
    });
  });
}

function lerLinhas(buffer) {
  return lerLinhasComCoords(buffer).then(linhas => linhas.map(l => l.cols.map(c => c.t)));
}

function parseNumBR(s) {
  if (!s) return null;
  let t = String(s).replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function dataCompleta(ddmm, ano) {
  const m = ddmm && ddmm.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${ano}-${m[2]}-${m[1]}`;
}

function normDesc(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------- FATURA ITAÚ ----------
// Células com colunas visuais: Lançamentos atuais à esquerda (x < 21) ou continuados à direita antes do total.
// Seção "Compras parceladas - próximas faturas" (x >= 21 na pág 2 ou pág 3) alimenta apenas `proximas` (futura=true).
function parseFaturaItauBuffer(buffer, anoFatura) {
  return lerLinhasComCoords(buffer).then(linhasArr => {
    const transacoes = [];
    const proximas = [];
    let vencimento = null;
    let inProxColDir = false;

    for (const l of linhasArr) {
      // Vencimento da fatura
      for (const c of l.cols) {
        const m = c.t.match(/Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/) || c.t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m && !vencimento) vencimento = `${m[3]}-${m[2]}-${m[1]}`;
      }

      // Seção próximas faturas na coluna direita (x >= 21)
      for (const c of l.cols) {
        const semEspaco = c.t.replace(/\s/g, '');
        if (/Compras.*parceladas.*faturas/i.test(semEspaco) && c.x >= 21) {
          inProxColDir = true;
        }
        if (/Total.*próximas.*faturas|Totalparapr/i.test(semEspaco) && c.x >= 21) {
          inProxColDir = false;
        }
      }

      for (let ci = 0; ci < l.cols.length; ci++) {
        const col = l.cols[ci];
        const mIso = col.t.match(/^(\d{2}\/\d{2})$/);
        const mJun = col.t.match(/^(\d{2}\/\d{2})\s*(.+)$/);
        let data = null, descRaw = null, valor = null;

        if (mIso) {
          data = dataCompleta(mIso[1], anoFatura);
          descRaw = (l.cols[ci + 1] || {}).t || '';
          const mv = ((l.cols[ci + 2] || {}).t || '').match(/^(-?[\d.]+,\d{2})/);
          if (mv) valor = parseNumBR(mv[1]);
        } else if (mJun) {
          data = dataCompleta(mJun[1], anoFatura);
          descRaw = mJun[2];
          const mv = ((l.cols[ci + 1] || {}).t || '').match(/^(-?[\d.]+,\d{2})/);
          if (mv) valor = parseNumBR(mv[1]);
        }

        if (!data || valor == null) continue;
        if (/Totaldoslançamentos|Comprasparceladas|Próximafatura|Demaisfaturas|Limited|Totaldospagamentos|DATA/i.test(descRaw.replace(/\s/g, ''))) continue;

        if (/^Pagamentovia/i.test(descRaw.replace(/\s/g, ''))) {
          transacoes.push({
            data, valor: Math.abs(valor), descricao: 'Pagamento via conta', parcela: null,
            fonte: 'itau-fatura', natureza: 'transferencia', hash_unico: hashTx(data, Math.abs(valor), 'pagamento'),
            futura: false
          });
          continue;
        }

        const isFutura = (l.page === 3) || (col.x >= 21 && inProxColDir);
        let desc = descRaw, parcela = null;
        const mp = descRaw.match(/^(.*?)\s*(\d{1,2})\/(\d{1,2})$/);
        if (mp) {
          const atual = parseInt(mp[2]), total = parseInt(mp[3]);
          if (total >= 2 && atual <= total && atual >= 1) {
            parcela = `${atual}/${total}`;
            desc = mp[1];
          }
        }

        desc = normDesc(desc);
        if (!desc) continue;

        const tx = {
          data, valor: -Math.abs(valor), descricao: desc, parcela,
          fonte: 'itau-fatura', hash_unico: hashTx(data, -Math.abs(valor), desc, parcela),
          futura: isFutura
        };
        transacoes.push(tx);

        if (isFutura && parcela) {
          proximas.push({ data, estabelecimento: desc, parcela, valor: Math.abs(valor) });
        }
      }
    }

    // Dedup compras idênticas na mesma fatura (distingue pelo índice no hash para compras paralelas reais)
    const ocorr = {};
    for (const t of transacoes) {
      const chave = `${t.descricao.toUpperCase()}|${t.valor.toFixed(2)}|${t.parcela || ''}`;
      ocorr[chave] = (ocorr[chave] || 0) + 1;
      if (ocorr[chave] > 1) {
        t.hash_unico = `${t.hash_unico}#${ocorr[chave]}`;
      }
    }

    return { vencimento, transacoes, proximas };
  });
}

// ---------- EXTRATO CONTA ITAÚ ----------
// Layout: por página, cada linha y = [data(x~1.7), desc(x~5.7), valor(x~26), saldo(x~32)]
function parseExtratoItauBuffer(buffer) {
  return lerLinhas(buffer).then(linhasArr => {
    const transacoes = [];
    for (const cols of linhasArr) {
      if (cols.length < 2) continue;
      const first = cols[0];
      const m = first.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/);
      if (!m) continue;
      const data = `${m[3]}-${m[2]}-${m[1]}`;
      const desc = normDesc(m[4] || (cols[1] && !/^-?[\d.]+,\d{2}$/.test(cols[1]) ? cols[1] : ''));
      // valor: última célula que casar com número
      let valor = null;
      for (let i = cols.length - 1; i >= 1; i--) {
        const mv = cols[i].match(/^(-?[\d.]+,\d{2})$/);
        if (mv) { valor = parseNumBR(mv[1]); break; }
      }
      if (valor == null || !desc) continue;
      if (/^SALDO DO DIA$/i.test(desc)) continue;
      transacoes.push({ data, valor, descricao: desc, fonte: 'itau-conta', hash_unico: hashTx(data, valor, desc) });
    }
    return transacoes;
  });
}

module.exports = { parseFaturaItauBuffer, parseExtratoItauBuffer, lerLinhas };