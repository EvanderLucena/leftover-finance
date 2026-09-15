// Super-Parser Universal de PDFs (Fast-Path Regex + Fallback DeepSeek IA)
const db = require('../db');
const { pdfToText } = require('./pdf');
const { hashTx, parseNumBR } = require('./parse-extrato');
const { parseFaturaItauBuffer, parseExtratoItauBuffer } = require('./parse-itau');
const { parseFaturaNubankBuffer } = require('./parse-nubank');
const { parseFaturaMercadoPagoBuffer } = require('./parse-mercadopago');
const { getConfigIA } = require('./ia');
const { salvarConta, criarConta } = require('./contas');
const { parseHeuristico } = require('./heuristico');

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function parseComIA(buffer, textoCompleto, nomeArq, anoFatura) {
  const cfg = getConfigIA();
  if (!cfg.url || !cfg.key || !cfg.model) {
    throw new Error('Não foi possível reconhecer o layout deste documento pelos leitores locais (Fast-Path e Heurístico). Para processar layouts atípicos, configure a IA nas Configurações ou sincronize a conta via Open Finance AUVP.');
  }

  const textoAmostra = textoCompleto.length > 35000 ? textoCompleto.slice(0, 35000) : textoCompleto;

  const prompt = `Você é um extrator de faturas de cartão de crédito e extratos bancários brasileiros.
Analise o texto abaixo extraído de um PDF financeiro (nome do arquivo: "${nomeArq}") e extraia os dados e todas as transações com total fidelidade.

REGRAS:
1. Identifique o banco ou emissora (ex: "Inter", "C6 Bank", "Santander", "Bradesco", "Banco do Brasil", "BTG Pactual", "XP", "Cooper", "Cora", "Sicredi", etc.).
2. Identifique o tipo: "fatura" (cartão de crédito) ou "extrato" (conta corrente, investimentos ou holerite/demonstrativo).
3. Se for fatura:
   - Identifique a data de vencimento (YYYY-MM-DD). Se tiver apenas dia e mês, use o ano ${anoFatura}.
   - Identifique o total da fatura (número decimal, ex: 1250.75).
4. Para cada transação listada:
   - "data": formato "YYYY-MM-DD" (se o ano não estiver expresso na linha, use o ano ${anoFatura}).
   - "descricao": nome limpo do estabelecimento / descrição do lançamento.
   - "valor": número decimal. REGRA OBRIGATÓRIA DE SINAIS:
     * Gastos, compras, tarifas, saques, débitos, descontos -> NEGATIVOS (ex: -39.90, -150.00).
     * Entradas, salários, proventos, pagamentos de fatura recebidos, estornos, créditos -> POSITIVOS (ex: 1500.00, 39.90).
   - "parcela": string "X/Y" (ex: "01/03") se for compra parcelada, ou null se à vista.
5. Ignore linhas de saldos informativos futuros, limites, juros projetados, pontos e resumos gerais. Apenas transações individuais.

Responda ESTRITAMENTE com um objeto JSON válido (sem texto introdutório ou markdown além do bloco JSON):
{
  "banco": "Nome do Banco",
  "tipo": "fatura",
  "vencimento": "YYYY-MM-DD",
  "total": 1234.56,
  "transacoes": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "NOME DO ESTABELECIMENTO",
      "valor": -100.50,
      "parcela": "01/03"
    }
  ]
}

TEXTO DO DOCUMENTO:
${textoAmostra}`;

  const resp = await fetch(cfg.url.replace(/\/$/, '') + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.key
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`Falha na IA (${resp.status}): ${errTxt.slice(0, 150)}`);
  }

  const d = await resp.json();
  const rawContent = d.choices?.[0]?.message?.content || '';
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('A IA não retornou um JSON válido: ' + rawContent.slice(0, 150));
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const isFatura = parsed.tipo === 'fatura';
  const bancoNome = parsed.banco || 'Banco Desconhecido';
  const slug = slugify(bancoNome) || 'banco_ia';

  try {
    const contaId = isFatura ? `cartao_${slug}` : `conta_${slug}`;
    const existente = db.prepare('SELECT id FROM contas_bancarias WHERE id=? OR instituicao=?').get(contaId, slug);
    if (!existente) {
      let diaVenc = null, diaFech = null;
      if (parsed.vencimento && parsed.vencimento.includes('-')) {
        diaVenc = parseInt(parsed.vencimento.split('-')[2], 10);
        diaFech = diaVenc > 7 ? diaVenc - 7 : diaVenc + 23;
      }
      criarConta({
        id: contaId,
        nome: `${bancoNome} (${isFatura ? 'Cartão' : 'Conta'})`,
        instituicao: slug,
        tipo: isFatura ? 'CREDIT' : 'BANK',
        dia_fechamento: diaFech,
        dia_vencimento: diaVenc,
        icone: isFatura ? '💳' : '🏦',
        ativo: 1
      });
    }
  } catch (e) {
    console.warn('[super-parser] Erro ao registrar conta autodescoberta:', e.message);
  }

  const transacoes = (parsed.transacoes || []).map(t => {
    const valor = typeof t.valor === 'number' ? t.valor : parseNumBR(t.valor) || 0;
    const desc = String(t.descricao || '').trim();
    const parcela = t.parcela || null;
    const data = t.data;
    const hash = hashTx(data, valor, desc, parcela);

    let natureza = 'gasto';
    if (/^pagamento|^recebido/i.test(desc) || (/fatura/i.test(desc) && valor > 0)) {
      natureza = 'transferencia';
    } else if (valor > 0) {
      natureza = 'entrada';
    }

    return {
      data,
      descricao: desc,
      valor,
      parcela,
      fonte: slug,
      natureza,
      hash_unico: hash
    };
  });

  return {
    isFatura,
    bancoFonte: slug,
    formato: `${isFatura ? 'fatura' : 'extrato'}-${slug}`,
    vencimento: parsed.vencimento || null,
    total: parsed.total || null,
    proximas: [],
    transacoes,
    metodo: 'deepseek-ia'
  };
}

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

  // CAMADA 3: IA Fallback (DeepSeek via Ollama Cloud)
  // Só acionada se nem os parsers dedicados (Camada 1) nem o heurístico (Camada 2) conseguirem ler o documento
  return await parseComIA(buffer, textoCompleto, nomeArq, anoFatura);
}

module.exports = { superParsePDF };
