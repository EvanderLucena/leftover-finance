// Super-Parser de PDFs: leitores dedicados por banco + heurístico local (sem IA)
const db = require('../db');
const { pdfToText } = require('./pdf');
const { hashTx, parseNumBR } = require('./parse-extrato');
const { parseFaturaItauBuffer, parseExtratoItauBuffer } = require('./parse-itau');
const { parseFaturaNubankBuffer } = require('./parse-nubank');
const { parseFaturaMercadoPagoBuffer } = require('./parse-mercadopago');
const { parseHeuristico } = require('./heuristico');


async function superParsePDF(buffer, { nomeArq = '', fonte = '', anoFatura = new Date().getFullYear() } = {}) {
  // FAST-PATH 1: Nubank por nome/fonte
  if (/nubank/i.test(nomeArq) || /nubank/i.test(fonte)) {
    try {
      const parsed = await parseFaturaNubankBuffer(buffer, anoFatura);
      if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
        return { isFatura: true, bancoFonte: 'nubank', formato: 'fatura-nubank', ...parsed, metodo: 'fastpath-regex' };
      }
    } catch (e) {
      console.warn('[super-parser] Fast-path Nubank falhou, tentando IA...', e.message);
    }
  }

  // FAST-PATH 2: Mercado Pago por nome/fonte
  if (/mercadopago|mercado-pago|credit-card-mp/i.test(nomeArq) || /mercadopago/i.test(fonte)) {
    try {
      const parsed = await parseFaturaMercadoPagoBuffer(buffer, anoFatura);
      if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
        return { isFatura: true, bancoFonte: 'mercadopago', formato: 'fatura-mercadopago', ...parsed, metodo: 'fastpath-regex' };
      }
    } catch (e) {
      console.warn('[super-parser] Fast-path Mercado Pago falhou, tentando IA...', e.message);
    }
  }

  // FAST-PATH 3: Itaú por nome/fonte
  if (/itau/i.test(nomeArq) || /itau/i.test(fonte)) {
    const isFatura = /fatura/i.test(nomeArq) || /fatura/i.test(fonte);
    try {
      if (isFatura) {
        const parsed = await parseFaturaItauBuffer(buffer, anoFatura);
        if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
          return { isFatura: true, bancoFonte: 'itau-fatura', formato: 'fatura-itau', ...parsed, metodo: 'fastpath-regex' };
        }
      } else {
        const parsed = await parseExtratoItauBuffer(buffer);
        if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : parsed.transacoes?.length > 0)) {
          const txs = Array.isArray(parsed) ? parsed : parsed.transacoes;
          return { isFatura: false, bancoFonte: 'itau-conta', formato: 'extrato-itau', transacoes: txs, metodo: 'fastpath-regex' };
        }
      }
    } catch (e) {
      console.warn('[super-parser] Fast-path Itaú falhou, tentando IA...', e.message);
    }
  }

  // Se o nome não revelou o banco ou o fast-path regex não encontrou transações, extrai o texto do PDF
  let textoCompleto = '';
  try {
    textoCompleto = await pdfToText(buffer);
  } catch (e) {
    textoCompleto = '';
  }

  const preview = (textoCompleto.slice(0, 3000)).toLowerCase();

  // Tenta fast-path pelo conteúdo se o nome era genérico (ex: "extrato.pdf" ou "fatura.pdf")
  if (/nu pagamentos|017\.208\.545\/0001-57/i.test(preview)) {
    try {
      const parsed = await parseFaturaNubankBuffer(buffer, anoFatura);
      if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
        return { isFatura: true, bancoFonte: 'nubank', formato: 'fatura-nubank', ...parsed, metodo: 'fastpath-regex' };
      }
    } catch (e) {}
  }

  if (/mercado\s*pago|mercado\s*cr[eé]dito/i.test(preview)) {
    try {
      const parsed = await parseFaturaMercadoPagoBuffer(buffer, anoFatura);
      if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
        return { isFatura: true, bancoFonte: 'mercadopago', formato: 'fatura-mercadopago', ...parsed, metodo: 'fastpath-regex' };
      }
    } catch (e) {}
  }

  if (/ita[uú]\s*unibanco|banco\s*ita[uú]|cart[oõ]es\s*ita[uú]|itau\.com\.br/i.test(preview)) {
    const isFatura = /fatura|cartao/i.test(preview);
    try {
      if (isFatura) {
        const parsed = await parseFaturaItauBuffer(buffer, anoFatura);
        if (parsed && ((parsed.transacoes && parsed.transacoes.length > 0) || parsed.total != null)) {
          return { isFatura: true, bancoFonte: 'itau-fatura', formato: 'fatura-itau', ...parsed, metodo: 'fastpath-regex' };
        }
      } else {
        const parsed = await parseExtratoItauBuffer(buffer);
        if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : parsed.transacoes?.length > 0)) {
          const txs = Array.isArray(parsed) ? parsed : parsed.transacoes;
          return { isFatura: false, bancoFonte: 'itau-conta', formato: 'extrato-itau', transacoes: txs, metodo: 'fastpath-regex' };
        }
      }
    } catch (e) {}
  }

  if (!textoCompleto || textoCompleto.trim().length === 0) {
    throw new Error('Não foi possível extrair texto legível deste arquivo PDF (pode ser uma imagem escaneada).');
  }

  // CAMADA 2: Parser Heurístico Genérico Local (Sem IA, Determinístico, Rápido e Offline)
  try {
    const heuristicoRes = parseHeuristico(textoCompleto, { nomeArq, anoFatura });
    if (heuristicoRes && heuristicoRes.ok && heuristicoRes.transacoes?.length > 0) {
      return heuristicoRes;
    }
  } catch (errHeuristico) {
    console.warn('[super-parser] Heurístico local não reconheceu o layout:', errHeuristico.message);
  }

  throw new Error('Layout de PDF não reconhecido pelos leitores locais. O dia a dia vem da AUVP; o PDF é só para períodos que ela não tem.');
}

module.exports = { superParsePDF };
