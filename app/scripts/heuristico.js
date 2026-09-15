// Parser Heurístico Genérico Local (Sem IA - 100% Determinístico e Offline)
const { hashTx, parseNumBR } = require('./parse-extrato');
const { salvarConta, criarConta } = require('./contas');
const db = require('../db');

const MESES = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12'
};

const BANCOS_CONHECIDOS = [
  { padrao: /nubank|nu\s*pagamentos/i, nome: 'Nubank', slug: 'nubank', icone: '💜' },
  { padrao: /itau|itaú|unibanco/i, nome: 'Itaú', slug: 'itau', icone: '🟧' },
  { padrao: /mercado\s*pago/i, nome: 'Mercado Pago', slug: 'mercadopago', icone: '💙' },
  { padrao: /btg(?:\s*pactual)?/i, nome: 'BTG Pactual', slug: 'btg', icone: '💳' },
  { padrao: /banco\s*inter|\binter\b/i, nome: 'Banco Inter', slug: 'inter', icone: '🧡' },
  { padrao: /c6\s*bank|\bc6\b/i, nome: 'C6 Bank', slug: 'c6', icone: '⬛' },
  { padrao: /santander/i, nome: 'Santander', slug: 'santander', icone: '🔴' },
  { padrao: /bradesco/i, nome: 'Bradesco', slug: 'bradesco', icone: '🔴' },
  { padrao: /banco\s*do\s*brasil|\bdo brasil\b/i, nome: 'Banco do Brasil', slug: 'bb', icone: '🟡' },
  { padrao: /caixa\s*econ[oô]mica|\bcaixa\b/i, nome: 'Caixa Econômica', slug: 'caixa', icone: '🔵' },
  { padrao: /xp\s*investimentos|\bxp\b/i, nome: 'XP Investimentos', slug: 'xp', icone: '🖤' },
  { padrao: /sicredi/i, nome: 'Sicredi', slug: 'sicredi', icone: '🟢' },
  { padrao: /sicoob/i, nome: 'Sicoob', slug: 'sicoob', icone: '🟢' },
  { padrao: /cooperativa|credisis|ailos/i, nome: 'Cooperativa de Crédito', slug: 'cooperativa', icone: '🏛️' },
  { padrao: /cora/i, nome: 'Banco Cora', slug: 'cora', icone: '🏦' },
  { padrao: /safra/i, nome: 'Banco Safra', slug: 'safra', icone: '🏦' }
];

function detectarInstituicao(texto, nomeArq) {
  const combinado = `${nomeArq || ''} ${texto.slice(0, 4000)}`;
  for (const b of BANCOS_CONHECIDOS) {
    if (b.padrao.test(combinado)) return b;
  }
  const slug = (nomeArq || 'banco')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { nome: 'Banco / Emissora', slug, icone: '🏦' };
}

function parseDataHeuristica(str, anoPadrao) {
  if (!str) return null;
  str = str.trim();
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    let dia = m[1].padStart(2, '0');
    let mes = m[2].padStart(2, '0');
    let ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(anoPadrao);
    return `${ano}-${mes}-${dia}`;
  }
  m = str.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
  if (m) {
    let dia = m[1].padStart(2, '0');
    let mes = MESES[m[2].toUpperCase()];
    let ano = m[3] || String(anoPadrao);
    if (mes) return `${ano}-${mes}-${dia}`;
  }
  return null;
}

function parseHeuristico(textoCompleto, { nomeArq = '', anoFatura = new Date().getFullYear() } = {}) {
  if (!textoCompleto || typeof textoCompleto !== 'string') return null;

  const inst = detectarInstituicao(textoCompleto, nomeArq);
  const linhas = textoCompleto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Detecta tipo de documento
  const textoMinusculo = textoCompleto.toLowerCase();
  const isHolerite = /demonstrativo de pagamento|holerite|recibo de pagamento|vencimento\s+desconto/i.test(textoMinusculo);
  const isFatura = !isHolerite && (/total a pagar|fatura|vencimento|limite de crédito|consumos de/i.test(textoMinusculo) || /fatura/i.test(nomeArq));

  let vencimento = null;
  let totalFatura = null;

  // 2. Extrai vencimento e total se for fatura
  if (isFatura) {
    for (const l of linhas) {
      const mv = l.match(/(?:vencimento|vence em|data de vencimento)[:\s]*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i)
        || l.match(/(?:vencimento|vence em)[:\s]*(\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?)/i);
      if (mv && !vencimento) {
        vencimento = parseDataHeuristica(mv[1], anoFatura);
      }

      const mt = l.match(/(?:total a pagar|valor total|total desta fatura)[:\s]*R?\$?\s*([\d.,]+)/i);
      if (mt && totalFatura === null) {
        totalFatura = parseNumBR(mt[1]);
      }
    }
  }

  // 3. Extrai data do documento se for holerite
  let dataHolerite = `${anoFatura}-08-01`;
  if (isHolerite) {
    const mm = textoCompleto.match(/m[eê]s(?:\/ano)?[:\s]*(\d{2})[\/\-](\d{2,4})/i);
    if (mm) {
      const mesH = mm[1].padStart(2, '0');
      const anoH = mm[2].length === 2 ? '20' + mm[2] : mm[2];
      dataHolerite = `${anoH}-${mesH}-01`;
    } else {
      const md = textoCompleto.match(/(?:data\s*[:\s]*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
      if (md) {
        dataHolerite = parseDataHeuristica(md[1], anoFatura) || dataHolerite;
      }
    }
  }

  const transacoes = [];

  // 4. Varredura Heurística de Linhas
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];

    // Ignora cabeçalhos, totais consolidados e linhas de controle
    if (/^total\b|^saldo anterior|^saldo atual|^limite|^fatura fechada|^página/i.test(l)) continue;

    // CASO A: Linhas de Holerite / Demonstrativo (ex: "3001 Producao - Hora Normal 168,00 R$ 13.194,72")
    if (isHolerite) {
      const mh = l.match(/^(?:\d+\s+)?(.+?)\s+(?:\d+[,\.]\d{2}\s+)?R\$\s*([\d.,]+)$/);
      if (mh) {
        const desc = mh[1].trim();
        const numVal = parseNumBR(mh[2]);
        if (numVal && !/total|líquido|fgts|base de cálculo/i.test(desc)) {
          const isDesconto = /inss|irrf|imposto de renda|desconto|empr[eé]stimo|unimed|assistencial|pat\s*-\s*lei|adiantamento|vale/i.test(desc);
          const valor = isDesconto ? -Math.abs(numVal) : Math.abs(numVal);
          const natureza = isDesconto ? 'gasto' : 'entrada';
          transacoes.push({
            data: dataHolerite,
            descricao: desc,
            valor,
            parcela: null,
            fonte: inst.slug,
            natureza,
            hash_unico: hashTx(dataHolerite, valor, desc, null)
          });
          continue;
        }
      }
    }

    // CASO B: Transação Padrão Bancário (Data no início da linha)
    // Ex: "25/08/2026 Supermercado X R$ 123,45" ou "25/08 Padaria Central -45,00"
    const reDataBR = /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+(-?R?\$?\s*[\d.,]+(?:\s*[CD])?)$/i;
    let m = l.match(reDataBR);

    // CASO C: Data com mês textual (ex: "25 AGO iFood R$ 42,90")
    if (!m) {
      const reDataMes = /^(\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?)\s+(.+?)\s+(-?R?\$?\s*[\d.,]+(?:\s*[CD])?)$/i;
      m = l.match(reDataMes);
    }

    if (m) {
      const rawData = m[1];
      let desc = m[2].trim();
      const rawValor = m[3].trim();

      if (/^saldo|^limite/i.test(desc)) continue;

      const dataFormatada = parseDataHeuristica(rawData, anoFatura);
      if (!dataFormatada) continue;

      let numVal = parseNumBR(rawValor.replace(/[CDcd]/g, '').trim());
      if (numVal === null) continue;

      // Tratamento de indicador C (Crédito) / D (Débito)
      const hasD = /D$/i.test(rawValor);
      const hasC = /C$/i.test(rawValor);

      let valor;
      if (hasD) {
        valor = -Math.abs(numVal);
      } else if (hasC) {
        valor = Math.abs(numVal);
      } else if (isFatura) {
        // Em fatura de cartão, despesa comum é negativa; pagamentos e estornos são positivos
        if (/^pagamento|^estorno|^cr[eé]dito|^reembolso/i.test(desc)) {
          valor = Math.abs(numVal);
        } else {
          valor = -Math.abs(numVal);
        }
      } else {
        // Extrato conta corrente: se valor já tem sinal negativo mantém, senão avalia pelo texto
        if (rawValor.startsWith('-')) {
          valor = -Math.abs(numVal);
        } else if (/pix\s*enviado|ted\s*enviada|pagamento|d[eé]bito|compra|tarifa|saque/i.test(desc)) {
          valor = -Math.abs(numVal);
        } else if (/pix\s*recebido|ted\s*recebida|dep[oó]sito|sal[aá]rio|cr[eé]dito/i.test(desc)) {
          valor = Math.abs(numVal);
        } else {
          valor = -Math.abs(numVal);
        }
      }

      // Detecção de parcelas (ex: "01/03", "Parcela 2 de 5", "(1/12)")
      let parcela = null;
      const mp = desc.match(/(?:parcela\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i);
      if (mp) {
        parcela = `${mp[1].padStart(2, '0')}/${mp[2].padStart(2, '0')}`;
        desc = desc.replace(/(?:-\s*)?parcela\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/i, '')
                   .replace(/\(?\d{1,2}\/\d{1,2}\)?$/, '')
                   .trim();
      }

      let natureza = 'gasto';
      if (/^pagamento|^recebido/i.test(desc) || (/fatura/i.test(desc) && valor > 0)) {
        natureza = 'transferencia';
      } else if (valor > 0) {
        natureza = 'entrada';
      }

      transacoes.push({
        data: dataFormatada,
        descricao: desc,
        valor,
        parcela,
        fonte: inst.slug,
        natureza,
        hash_unico: hashTx(dataFormatada, valor, desc, parcela)
      });
    }
  }

  // 5. Critério de validação do Heurístico
  if (transacoes.length === 0) {
    return { ok: false, motivo: 'nenhuma_transacao_encontrada' };
  }

  // Registra a conta automaticamente se ainda não existir
  try {
    const contaId = isFatura ? `cartao_${inst.slug}` : `conta_${inst.slug}`;
    const existente = db.prepare('SELECT id FROM contas_bancarias WHERE id=? OR instituicao=?').get(contaId, inst.slug);
    if (!existente) {
      let diaVenc = null, diaFech = null;
      if (vencimento && vencimento.includes('-')) {
        diaVenc = parseInt(vencimento.split('-')[2], 10);
        diaFech = diaVenc > 7 ? diaVenc - 7 : diaVenc + 23;
      }
      criarConta({
        id: contaId,
        nome: `${inst.nome} (${isFatura ? 'Cartão' : 'Conta'})`,
        instituicao: inst.slug,
        tipo: isFatura ? 'CREDIT' : 'BANK',
        dia_fechamento: diaFech,
        dia_vencimento: diaVenc,
        icone: inst.icone || (isFatura ? '💳' : '🏦'),
        ativo: 1
      });
    }
  } catch (e) {
    console.warn('[heuristico] Aviso ao registrar conta:', e.message);
  }

  return {
    ok: true,
    isFatura,
    bancoFonte: inst.slug,
    formato: `${isFatura ? 'fatura' : 'extrato'}-${inst.slug}`,
    vencimento,
    total: totalFatura,
    proximas: [],
    transacoes,
    metodo: 'heuristico-local'
  };
}

module.exports = { parseHeuristico, detectarInstituicao };
