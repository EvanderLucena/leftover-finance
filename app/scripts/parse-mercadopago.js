// Parser de faturas Mercado Pago (PDF)
const { hashTx } = require('./parse-extrato');
const { PdfReader } = require('pdfreader');

function parseNumBR(s) {
  if (!s) return null;
  let t = String(s).replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// Linhas de transação:
//   "07/05 MERCADOLIVRE*OTHPRODUTOS Parcela 14 de 18 R$ 193,88"
//   "03/06 MERCADOLIVRE*3VSNUTRITION R$ 141,41"
//   "05/06 Pagamento da fatura de junho/2026 R$ 971,19"  (transferencia)
function parseFaturaMercadoPagoBuffer(buffer, anoFatura) {
  return new Promise((resolve, reject) => {
    const rows = new Map();
    let curPage = 0;
    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) return resolve({ vencimento: null, transacoes: [], total: null, erro: err.message });
      if (!item) {
        const linhas = [...rows.keys()].sort((a, b) => {
          const [pa, ya] = a.split('|').map(Number);
          const [pb, yb] = b.split('|').map(Number);
          return pa - pb || ya - yb;
        }).map(k => rows.get(k).sort((a, b) => a.x - b.x).map(c => c.t).join(' '));

        const transacoes = [];
        const reTx = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?R\$\s*[\d.,]+)$/;
        let vencimento = null;
        // cabeçalho em 2 linhas: "Total a pagar Vence em ..." / "R$ 855,42 04/09/2026 ..."
        let vencLabel = false, totalLabel = false;
        // total: 'Consumos de 30/05 a 29/06 R$ 1.346,70' ou linha de resumo
        const totalM = (linhas.join(' ')).match(/Consumos de\s*[\d/]+\s*a\s*[\d/]+\s*R\$\s*([\d.,]+)/) || (linhas.join(' ')).match(/Total a pagar\s*R\$\s*([\d.,]+)/);
        const total = totalM ? parseNumBR(totalM[1]) : null;

        for (const l of linhas) {
          // captura vencimento pela linha de valores após "Total a pagar Vence em"
          if (/Total a pagar.*Vence em/.test(l)) { totalLabel = true; continue; }
          if (totalLabel && !vencimento) {
            const mvals = l.match(/R\$\s*[\d.,]+\s+(\d{2}\/\d{2}\/(\d{4}))/);
            if (mvals) { vencimento = `${mvals[2]}-${mvals[1].split('/')[1]}-${mvals[1].split('/')[0]}`; totalLabel = false; }
          }
          // alternativa: "Vencimento: 06/07/2026"
          const mv = l.match(/Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
          if (mv && !vencimento) vencimento = `${mv[3]}-${mv[2]}-${mv[1]}`;

          const m = l.trim().match(reTx);
          if (!m) continue;
          const dt = m[1].split('/');
          const data = `${anoFatura}-${dt[1]}-${dt[0]}`;
          let desc = m[2].trim();
          const valor = -Math.abs(parseNumBR(m[3]));
          if (/^Pagamento da fatura/i.test(desc)) {
            transacoes.push({ data, valor: Math.abs(valor), descricao: 'Pagamento da fatura MP', parcela: null, fonte: 'mercadopago', natureza: 'transferencia', hash_unico: hashTx(data, Math.abs(valor), 'pagamento-mp') });
            continue;
          }
          // parcela: "Parcela N de M"
          let parcela = null;
          const mp = desc.match(/^(.*?)\s+Parcela\s+(\d{1,2}) de (\d{1,2})$/i);
          if (mp) { desc = mp[1].trim(); parcela = `${mp[2]}/${mp[3]}`; }
          transacoes.push({ data, valor, descricao: desc, parcela, fonte: 'mercadopago', hash_unico: hashTx(data, valor, desc, parcela) });
        }
        return resolve({ vencimento, transacoes, total });
      }
      if (item.page != null && item.text == null) { curPage = item.page; return; }
      if (item.text) {
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

module.exports = { parseFaturaMercadoPagoBuffer };