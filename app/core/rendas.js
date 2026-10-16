// Rendas: como um crédito é reconhecido como renda e quais entradas do histórico parecem renda.
// Nada de pagador fixo no código: as sugestões saem das transações que a AUVP trouxe.
const db = require('../db');
const cal = require('./calendario');

const r2 = v => Math.round(v * 100) / 100;
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// chave de um crédito: o texto sem acento, sem números e sem pontuação; o CPF mascarado do pagador
// ('CPF •••.123-45') fica, porque é ele que separa dois pagadores do mesmo banco
function chaveCredito(descricao) {
  let s = semAcento(descricao).toUpperCase();
  const cpf = s.match(/(CPF|CNPJ)[^A-Z]*?([\d.\/-]*\d)/);
  if (cpf) s = s.slice(0, cpf.index);
  s = s.replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cpf ? `${s} ${cpf[1]} ${cpf[2].replace(/\D/g, '')}` : s;
}

// renda cadastrada × crédito: lançamento manual daquela renda, valor exato ou padrão do texto
// (o padrão vale no texto original e na chave, que é sem acento)
function casaRenda(r) {
  let re = null;
  try { re = r.padrao_regex ? new RegExp(r.padrao_regex, 'i') : null; } catch (e) { /* padrão inválido: não casa */ }
  return t => String(t.hash_unico || '').startsWith(`manual-renda-${r.id}-`)
    || (r.valor_exato != null ? Math.abs(t.valor - r.valor_exato) < 0.005
      : (re ? re.test(t.descricao) || re.test(chaveCredito(t.descricao)) : false));
}

// nome legível de uma sugestão: sem o CPF e sem os pedaços com número (data, agência)
const nomeDe = d => String(d).replace(/\s*·\s*(CPF|CNPJ).*$/i, '').replace(/\d[\d.\/-]*/g, ' ')
  .split(/\s+/).map(w => w.replace(/^[.\/-]+|[.\/-]+$/g, '')).filter(Boolean).join(' ').replace(/\s\S$/, '').trim() || String(d);
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mediana = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// créditos de conta (não de cartão) que podem ser renda
function creditosDaConta(desde) {
  const fontesCartao = require('./fontes').fontesCartao();
  return db.prepare(`SELECT id, data, valor, descricao, hash_unico FROM transacoes
    WHERE valor > 0 AND natureza IN ('salario','entrada','entrada-outra') AND data >= ?
      AND fonte NOT IN (${fontesCartao.map(() => '?').join(',')})`).all(desde, ...fontesCartao);
}

const dispensadas = () => {
  const r = db.prepare("SELECT valor FROM config WHERE chave = 'rendas_dispensadas'").get();
  try { return new Set(JSON.parse(r ? r.valor : '[]')); } catch (e) { return new Set(); }
};
function dispensarSugestao(chave) {
  const set = dispensadas();
  set.add(String(chave));
  db.prepare("INSERT INTO config (chave, valor) VALUES ('rendas_dispensadas', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .run(JSON.stringify([...set]));
}

// entradas que se repetem em meses diferentes e ainda não são renda cadastrada
function sugestoes(hoje = cal.hojeISO(), meses = 6) {
  const ym = hoje.slice(0, 7);
  const creditos = creditosDaConta(cal.addMes(ym, -meses) + '-01').filter(t => t.data <= hoje);
  const rendas = db.prepare('SELECT * FROM rendas').all().map(casaRenda);
  const livres = creditos.filter(t => !rendas.some(casa => casa(t)));
  const fora = dispensadas();

  const resumir = (chave, ts, extra) => {
    const valores = ts.map(t => t.valor), dias = ts.map(t => +t.data.slice(8, 10));
    const mesesDistintos = new Set(ts.map(t => t.data.slice(0, 7)));
    const med = mediana(valores), min = Math.min(...valores), max = Math.max(...valores);
    const ultima = ts.reduce((a, t) => (t.data > a.data ? t : a));
    const fimDeMes = dias.every(d => d >= 25);
    return {
      chave, ...extra,
      meses: mesesDistintos.size, vezes: ts.length,
      valor_mediano: r2(med), valor_min: r2(min), valor_max: r2(max),
      media_mensal: r2(valores.reduce((s, v) => s + v, 0) / mesesDistintos.size),
      dia_tipico: Math.round(mediana(dias)),
      tipo_sugerido: max - min <= Math.max(0.01 * med, 0.01) ? 'fixa' : 'variavel',
      // cai no fim do mês: em geral paga o mês seguinte (ex.: salário do dia 30 é o do mês que vem)
      competencia_corte: fimDeMes ? Math.max(20, Math.min(...dias) - 2) : null,
      ultima: { data: ultima.data, valor: ultima.valor, descricao: ultima.descricao }
    };
  };

  // 1) mesmo pagador em 2 meses ou mais
  const grupos = new Map();
  for (const t of livres) {
    const k = chaveCredito(t.descricao);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(t);
  }
  const out = [];
  const usadas = new Set();
  for (const [k, ts] of grupos) {
    if (new Set(ts.map(t => t.data.slice(0, 7))).size < 2) continue;
    const s = resumir('texto:' + k, ts, { nome: nomeDe(ts[ts.length - 1].descricao),padrao_regex: escapar(k), valor_exato: null });
    if (s.valor_mediano < 50) continue; // rendimento de centavos, estorno pequeno
    out.push(s);
    ts.forEach(t => usadas.add(t.id));
  }
  // 2) mesmo valor exato em 2 meses ou mais, com textos diferentes (ex.: aluguel que cada mês vem de um jeito)
  const porValor = new Map();
  for (const t of livres.filter(t => !usadas.has(t.id) && t.valor >= 100)) {
    const k = t.valor.toFixed(2);
    if (!porValor.has(k)) porValor.set(k, []);
    porValor.get(k).push(t);
  }
  for (const [k, ts] of porValor) {
    if (new Set(ts.map(t => t.data.slice(0, 7))).size < 2) continue;
    out.push(resumir('valor:' + k, ts, { nome: 'Entrada de ' + k.replace('.', ','), padrao_regex: null, valor_exato: +k }));
  }
  // só o que ainda está ativo (caiu nos últimos 2 meses), da maior para a menor
  const corte = cal.addMes(ym, -2) + '-01';
  return out.filter(s => !fora.has(s.chave) && s.ultima.data >= corte)
    .sort((a, b) => b.media_mensal - a.media_mensal);
}

// quanto uma renda variável costuma render: média dos últimos 3 meses fechados em que ela caiu
function mediaRecente(r, hoje = cal.hojeISO(), n = 3) {
  const ym = hoje.slice(0, 7);
  const casa = casaRenda(r);
  const porMes = new Map();
  for (const t of creditosDaConta(cal.addMes(ym, -12) + '-01')) {
    const m = t.data.slice(0, 7);
    if (m >= ym || !casa(t)) continue;
    porMes.set(m, (porMes.get(m) || 0) + t.valor);
  }
  const ultimos = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, n).map(e => e[1]);
  return ultimos.length ? r2(ultimos.reduce((s, v) => s + v, 0) / ultimos.length) : null;
}

// o que se espera de uma renda num mês (antes de cair)
function estimativa(r, hoje = cal.hojeISO()) {
  if (r.tipo === 'horas') return r2((r.valor_hora || 0) * (r.horas_previstas || 168));
  if (r.tipo === 'eventual') return 0; // só conta quando cair
  if (r.tipo === 'variavel') { const m = mediaRecente(r, hoje); return m != null ? m : r2(r.valor_base || 0); }
  return r2(r.valor_base || 0);
}

module.exports = { chaveCredito, casaRenda, sugestoes, dispensarSugestao, mediaRecente, estimativa };
