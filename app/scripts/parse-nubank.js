// Parser de faturas Nubank (PDF)
const { hashTx } = require('./parse-extrato');
const { PdfReader } = require('pdfreader');

const MESES = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };

function parseNumBR(s) {
  if (!s) return null;
  let t = String(s).replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// linhas tipo: "25 JUL •••• 5059 Pg *Nuvem Hyperboleofi - Parcela 4/6 R$ 43,33"
//              "25 JUL IOF de "Openai *Chatgpt Subscr" R$ 3,63"
//              "31 JUL iFood - NuPay R$ 39,99"
function parseFaturaNubankBuffer(buffer, anoFatura) {
  return new Promise((resolve, reject) => {
    const rows = new Map();
    let curPage = 0;
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) return resolve({ vencimento: null, transacoes: [], proximas: [], total: null, erro: err.message });
      if (!item) {
        // fim: processar linhas
        const linhas = [...rows.keys()].sort((a, b) => {
          const [pa, ya] = a.split('|').map(Number);
          const [pb, yb] = b.split('|').map(Number);
          return pa - pb || ya - yb;
        }).map(k => rows.get(k).sort((a, b) => a.x - b.x).map(c => c.t).join(' '));

        const transacoes = [];
        const reTx = /^(\d{1,2}) ([A-Z]{3}) (.+?)\s+R\$\s*([\d.,]+)$/;
        // data de vencimento
        let vencimento = null;
        const totalM = (linhas.join('\n')).match(/Total a pagar\s*R\$\s*([\d.,]+)/);
        const total = totalM ? parseNumBR(totalM[1]) : null;

        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          const mv = l.match(/vencimento:\s*(\d{1,2}) ([A-Z]{3}) (\d{4})/i) || l.match(/^FATURA (\d{1,2}) ([A-Z]{3}) (\d{4})/i);
          if (mv && !vencimento) {
            vencimento = `${mv[3]}-${MESES[mv[2]]}-${mv[1].padStart(2, '0')}`;
          }
          let m = l.trim().match(reTx);
          // transação multi-linha (compra internacional): "25 JUL •••• 5059 DESC" sem valor,
          // seguida de "BRL X = USD Y", "Conversão: ...", "R$ VALOR"
          if (!m && /^\d{1,2} [A-Z]{3} /.test(l.trim())) {
            for (let j = i + 1; j < Math.min(i + 5, linhas.length); j++) {
              if (/^R\$\s*[\d.,]+$/.test(linhas[j].trim())) {
                m = [null, l.match(/^(\d{1,2}) ([A-Z]{3})/)[1], l.match(/^(\d{1,2}) ([A-Z]{3})/)[2], l.trim().slice(l.indexOf(l.match(/[A-Z]{3}/)[0]) + 4), linhas[j].trim().replace('R$', '').trim()];
                break;
              }
              if (reTx.test(linhas[j].trim())) break; // próxima transação começou
            }
          }
          if (!m) continue;
          const dia = m[1].padStart(2, '0'), mesN = MESES[m[2]];
          if (!mesN) continue;
          const data = `${anoFatura}-${mesN}-${dia}`;
          let desc = String(m[3]).trim();
          const valor = -parseNumBR(m[4]);
          // extrair parcela
          let parcela = null;
          const mp = desc.match(/^(.*?)\s*-\s*Parcela\s*(\d{1,2})\/(\d{1,2})$/i);
          if (mp) { desc = mp[1].trim(); parcela = `${mp[2]}/${mp[3]}`; }
          desc = desc.replace(/•+ ?\d{4}\s*/, '').trim();
          if (/^Pagamento/i.test(desc)) continue;
          transacoes.push({ data, valor, descricao: desc, parcela, fonte: 'nubank', hash_unico: hashTx(data, valor, desc, parcela) });
        }
        return resolve({ vencimento, transacoes, proximas: [], total });
      }
      if (item.page != null && item.text == null) { curPage = item.page; return; }
      if (item.text) {
        // agrupamento incremental: linha pertence à última cujo y difere < 0.6 (datas separadas do texto)
        const pg = curPage;
        let targetKey = null;
        for (const [k, v] of rows) {
          if (!k.startsWith(pg + '|')) continue;
          const y = parseFloat(k.split('|')[1]);
          if (Math.abs(y - item.y) < 0.6) { targetKey = k; break; }
        }
        if (!targetKey) { targetKey = pg + '|' + item.y; rows.set(targetKey, []); }
        rows.get(targetKey).push({ x: item.x, t: item.text });
      }
    });
  });
}

module.exports = { parseFaturaNubankBuffer };