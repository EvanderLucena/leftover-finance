// Motor único de comprometimento (regra de 15/10/2026, REGRAS.md §3):
//   comprometido do mês = faturas que vencem nele + contas fixas e parcelados que vencem nele
//                         + (só no mês corrente) PIX/débito que já saíram sem pagar nenhuma conta
//   fatura fechada = total oficial da AUVP; fatura aberta = compras já lançadas + parcelas programadas
//   sobra livre = renda (por competência) − comprometido. Nenhuma previsão de gasto.
// Toda tela que mostra comprometido, fatura, renda ou sobra usa este módulo.
const db = require('../db');
const cal = require('./calendario');

const HORIZONTE = 24; // meses de parcelas programadas
const r2 = v => Math.round(v * 100) / 100;
const parcelaDaDescricao = d => {
  const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\s*$/);
  return m && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 48 ? { k: +m[1], n: +m[2] } : null;
};
// "VET CENTERPRESIDEN02/03" -> "VETCENTERPRESIDEN"
const baseDescricao = s => String(s || '').toUpperCase().replace(/\s*0?\d{1,2}\/0?\d{1,2}\s*$/, '').replace(/[^A-Z0-9]/g, '');
const ICONES = { nubank_cartao: '🟣', itau_cartao: '🟧', mp_cartao: '💙', cartao_btg_black: '⬛' };

const cartoesAtivos = () => db.prepare('SELECT * FROM cartoes WHERE incluir=1 ORDER BY conta_id').all();

// em que fatura (mês de vencimento) cai uma compra feita em `data`
function faturaDaData(data, c) {
  const ym = data.slice(0, 7);
  return +data.slice(8, 10) <= c.fecha_dia ? cal.addMes(ym, 1) : cal.addMes(ym, 2);
}
const vencimentoDe = (ym, c) => cal.proximoDiaUtil(cal.diaDoMes(ym, c.vence_dia));

// valor das parcelas 2..N quando a fatura só mostrou a 1ª (que pode ter centavos a mais)
function valorParcelasSeguintes(descricao, total, v1) {
  try {
    const pref = baseDescricao(descricao).slice(0, 8);
    const r = db.prepare(`SELECT valor_parcela FROM compras WHERE n_parcelas=? AND ABS(valor_parcela-?)<=0.25 AND cancelada=0
      AND upper(replace(estabelecimento,' ','')) LIKE ? || '%'`).get(total, Math.abs(v1), pref);
    if (r) return -Math.abs(r.valor_parcela);
  } catch (e) { /* sem tabela compras */ }
  return v1;
}

// ---------- faturas de um cartão: fechadas (oficiais) e aberta + futuras (lançado + programado) ----------
const cacheFaturas = new Map();
function faturasDoCartao(c, hoje) {
  const chave = c.conta_id + '|' + hoje;
  if (cacheFaturas.has(chave)) return cacheFaturas.get(chave);
  const porMes = new Map();
  const fechadas = db.prepare('SELECT * FROM faturas WHERE conta_id=? ORDER BY vencimento').all(c.conta_id);
  const itensDe = db.prepare('SELECT * FROM fatura_itens WHERE fatura_id=?');
  for (const f of fechadas) {
    const itens = itensDe.all(f.id).filter(i => !i.ignorada && !/pagamento/i.test(i.descricao || ''));
    porMes.set(f.vencimento.slice(0, 7), {
      status: 'fechada', id: f.id, vencimento: f.vencimento, total: r2(f.total),
      itens: itens.map(i => ({ data: i.data, descricao: i.descricao, valor: i.valor, parcela: i.parcela_total ? `${i.parcela_n}/${i.parcela_total}` : null, tipo: i.parcela_total ? 'parcela' : (i.valor > 0 ? 'crédito' : 'à vista'), origem: 'fatura oficial' }))
    });
  }
  const ultima = fechadas[fechadas.length - 1];
  const aberta = ultima ? cal.addMes(ultima.vencimento.slice(0, 7), 1) : faturaDaData(hoje, c);
  const limite = cal.addMes(aberta, HORIZONTE);
  const futuras = new Map();
  const add = (ym, item) => { if (ym > limite) return; if (!futuras.has(ym)) futuras.set(ym, []); futuras.get(ym).push(item); };

  // 1) transações da AUVP que ainda não estão numa fatura fechada
  const faturados = new Set(db.prepare('SELECT fi.transacao_id FROM fatura_itens fi JOIN faturas f ON f.id=fi.fatura_id WHERE f.conta_id=?').all(c.conta_id).map(r => r.transacao_id));
  const txs = db.prepare('SELECT * FROM auvp_transacoes WHERE conta_id=? ORDER BY data, id').all(c.conta_id);
  for (const t of txs) {
    if (faturados.has(t.id) || t.ignorada || t.interna) continue;
    const pc = parcelaDaDescricao(t.descricao);
    let ym, programada = false;
    if (t.data > hoje) {
      // parcela agendada: cada banco data de um jeito (perfil do cartão)
      ym = c.parcela_futura === 'vencimento' ? t.data.slice(0, 7) : faturaDaData(t.data, c);
      programada = true;
    } else if (pc && pc.k >= 2 && txs.some(o => o.id !== t.id && o.data === t.data && baseDescricao(o.descricao) === baseDescricao(t.descricao)
        && Math.abs(Math.abs(o.valor) - Math.abs(t.valor)) <= 0.11 && (parcelaDaDescricao(o.descricao) || {}).k !== pc.k)) {
      // parcela futura de compra do ciclo aberto, datada no dia da compra: fatura da compra + (k−1)
      ym = cal.addMes(faturaDaData(t.data, c), pc.k - 1);
      programada = true;
    } else {
      ym = faturaDaData(t.data, c);
    }
    if (ym < aberta) ym = aberta; // não entrou em fatura fechada: está na aberta
    add(ym, {
      data: t.data, descricao: t.descricao, valor: t.valor, parcela: pc ? `${pc.k}/${pc.n}` : null,
      tipo: pc ? 'parcela' : (t.valor > 0 ? 'crédito' : 'à vista'), programada, origem: 'AUVP'
    });
  }

  // 2) parcelas que a AUVP não listou: seguem o plano visto na última fatura fechada (k → k+1 no mês seguinte)
  if (ultima) {
    const itens = itensDe.all(ultima.id).filter(i => i.tipo === 'DEBIT' && i.parcela_total);
    const chavePlano = i => `${baseDescricao(i.descricao)}|${i.parcela_total}|${Math.round(Math.abs(i.valor))}`;
    const repeticoes = {};
    for (const i of itens) repeticoes[chavePlano(i)] = (repeticoes[chavePlano(i)] || 0) + 1;
    for (const i of itens) {
      if (i.parcela_n >= i.parcela_total) continue;
      if (repeticoes[chavePlano(i)] > 1) continue; // várias parcelas na mesma fatura = compra cancelada com parcelas antecipadas
      const valor = i.parcela_n === 1 ? valorParcelasSeguintes(i.descricao, i.parcela_total, i.valor) : i.valor;
      const pref = baseDescricao(i.descricao).slice(0, 8);
      for (let k = i.parcela_n + 1, ym = aberta; k <= i.parcela_total; k++, ym = cal.addMes(ym, 1)) {
        const jaListada = (futuras.get(ym) || []).some(x => baseDescricao(x.descricao).slice(0, 8) === pref && Math.abs(Math.abs(x.valor) - Math.abs(valor)) <= 0.11);
        if (!jaListada) add(ym, { data: null, descricao: `${String(i.descricao).replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '')} ${k}/${i.parcela_total}`, valor, parcela: `${k}/${i.parcela_total}`, tipo: 'parcela', programada: true, origem: 'plano da última fatura' });
      }
    }
  }

  for (const [ym, itens] of futuras) {
    const parcelas = itens.filter(i => i.tipo === 'parcela').reduce((s, i) => s - i.valor, 0);
    const avista = itens.filter(i => i.tipo !== 'parcela').reduce((s, i) => s - i.valor, 0);
    porMes.set(ym, {
      status: ym === aberta ? 'aberta' : 'futura', vencimento: vencimentoDe(ym, c),
      fechamento: cal.diaDoMes(cal.addMes(ym, -1), c.fecha_dia),
      total: r2(parcelas + avista), parcelas: r2(parcelas), compras: r2(avista), itens
    });
  }
  const res = { cartao: c, aberta, porMes };
  cacheFaturas.set(chave, res);
  return res;
}

function faturasDoMes(ym, hoje) {
  return cartoesAtivos().map(c => {
    const f = faturasDoCartao(c, hoje).porMes.get(ym);
    return f ? { cartao: c.nome, conta_local: c.conta_local, conta_id: c.conta_id, icone: ICONES[c.conta_local] || '💳', ...f } : null;
  }).filter(f => f && f.total !== 0);
}

// ---------- contas fixas e parcelados ----------
function parcelaNoMes(rec, ym) {
  if (!rec.total_parcelas) return null;
  if (rec.data_base) {
    const k = cal.mesesEntre(rec.data_base.slice(0, 7), ym) + 1;
    return k >= 1 && k <= rec.total_parcelas ? k : null;
  }
  return null;
}
function entraNoMes(rec, ym) {
  if (!(rec.periodicidade > 1) || !rec.data_base) return true;
  const k = cal.mesesEntre(rec.data_base.slice(0, 7), ym);
  return k >= 0 && k % rec.periodicidade === 0;
}

// Conta fixa de valor variável (energia, água…): enquanto a conta do mês não chega, vale o último valor real pago
// (decisão de 15/10/2026). Conta cujo valor você já editou, ou que já foi paga, fica com o próprio valor.
function ultimoValorPago(recorrenciaId, antesDe) {
  if (!recorrenciaId) return null;
  return db.prepare(`SELECT valor, vencimento FROM lancamentos WHERE recorrencia_id=? AND pago=1 AND parcela IS NULL AND vencimento < ?
    ORDER BY vencimento DESC LIMIT 1`).get(recorrenciaId, antesDe) || null;
}
function valorDaConta(rec, proprio, ym, pago) {
  if (pago || !rec || rec.tipo === 'Parcelado') return { valor: r2(Math.abs(proprio)), valor_origem: pago ? 'pago' : 'cadastrado' };
  if (Math.abs(Math.abs(proprio) - Math.abs(rec.valor || 0)) > 0.01) return { valor: r2(Math.abs(proprio)), valor_origem: 'informado' };
  const u = ultimoValorPago(rec.id, ym + '-01');
  return u ? { valor: r2(Math.abs(u.valor)), valor_origem: 'último pago (' + u.vencimento.slice(5, 7) + '/' + u.vencimento.slice(0, 4) + ')' }
    : { valor: r2(Math.abs(proprio)), valor_origem: 'cadastrado' };
}

function contasDoMes(ym) {
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(cal.ymParaRef(ym));
  const lancs = mes ? db.prepare(`SELECT l.*, c.nome categoria FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
    WHERE l.mes_id=? ORDER BY l.vencimento`).all(mes.id) : [];
  const recPorId = id => (id ? db.prepare('SELECT * FROM recorrencias WHERE id=?').get(id) : null);
  if (lancs.length) {
    return {
      origem: 'contas do mês',
      itens: lancs.filter(l => l.categoria !== 'Cartões' && !['fatura-aberta', 'fatura'].includes(l.origem)).map(l => ({
        id: l.id, descricao: l.descricao, ...valorDaConta(l.parcela ? null : recPorId(l.recorrencia_id), l.valor, ym, !!l.pago),
        vencimento: l.vencimento, categoria: l.categoria, tipo: l.parcela ? 'parcelado' : 'fixa', parcela: l.parcela, pago: !!l.pago
      }))
    };
  }
  const recs = db.prepare(`SELECT r.*, c.nome categoria FROM recorrencias r LEFT JOIN categorias c ON c.id=r.categoria_id
    WHERE r.ativo=1 AND (c.nome IS NULL OR c.nome != 'Cartões')`).all();
  const itens = [];
  for (const r of recs) {
    if (r.tipo === 'Parcelado') {
      const k = parcelaNoMes(r, ym);
      if (k) itens.push({ descricao: r.descricao, valor: r2(Math.abs(r.valor || 0)), vencimento: cal.diaDoMes(ym, r.dia_venc || 10), categoria: r.categoria, tipo: 'parcelado', parcela: `${k}/${r.total_parcelas}`, pago: false, valor_origem: 'parcela' });
    } else if (entraNoMes(r, ym)) {
      itens.push({ descricao: r.descricao, ...valorDaConta(r, r.valor || 0, ym, false), vencimento: cal.diaDoMes(ym, r.dia_venc || 5), categoria: r.categoria, tipo: 'fixa', parcela: null, pago: false });
    }
  }
  return { origem: 'recorrências', itens };
}

// ---------- gasto do dia a dia já realizado (só o mês corrente) ----------
function diaADiaRealizado(ym) {
  const cartoes = db.prepare('SELECT conta_local FROM cartoes').all().map(r => r.conta_local);
  const fontesCartao = ['nubank', 'itau-fatura', 'mercadopago', 'auvp-mcp', 'nubank-csv'];
  return r2(db.prepare(`SELECT COALESCE(SUM(ABS(valor)),0) tot FROM transacoes t
    WHERE t.natureza='gasto' AND substr(t.data,1,7)=? AND t.valor < 0
      AND t.fonte NOT IN (${fontesCartao.map(() => '?').join(',')})
      AND t.id NOT IN (SELECT transacao_id FROM lancamentos WHERE transacao_id IS NOT NULL)`).get(ym, ...fontesCartao).tot);
}

// ---------- renda por competência ----------
function rendaDoMes(ym) {
  const rendas = db.prepare('SELECT * FROM rendas WHERE ativo=1').all();
  const creditos = db.prepare(`SELECT data, valor, descricao FROM transacoes WHERE valor > 0 AND natureza IN ('salario','entrada','entrada-outra')
    AND data >= ? AND data < ?`).all(cal.addMes(ym, -1) + '-01', cal.addMes(ym, 1) + '-01');
  const itens = rendas.map(r => {
    const estimada = r2(r.tipo === 'horas' ? (r.valor_hora || 0) * (r.horas_previstas || 168) : (r.valor_base || 0));
    const casa = t => (r.valor_exato != null ? Math.abs(t.valor - r.valor_exato) < 0.005 : (r.padrao_regex ? new RegExp(r.padrao_regex, 'i').test(t.descricao) : false));
    const competencia = t => (r.competencia_corte && +t.data.slice(8, 10) >= r.competencia_corte ? cal.addMes(t.data.slice(0, 7), 1) : t.data.slice(0, 7));
    const reais = creditos.filter(t => casa(t) && competencia(t) === ym);
    const realizada = r2(reais.reduce((s, t) => s + t.valor, 0));
    return { id: r.id, nome: r.nome, estimada, realizada, valor: realizada > 0 ? realizada : estimada, recebida: realizada > 0 };
  });
  return { total: r2(itens.reduce((s, i) => s + i.valor, 0)), itens };
}

// ---------- o mês inteiro ----------
function comprometidoMes(ym, hoje = cal.hojeISO()) {
  const faturas = faturasDoMes(ym, hoje);
  const contas = contasDoMes(ym);
  const fixos = r2(contas.itens.filter(i => i.tipo === 'fixa').reduce((s, i) => s + i.valor, 0));
  const parcelados = r2(contas.itens.filter(i => i.tipo === 'parcelado').reduce((s, i) => s + i.valor, 0));
  const totalFaturas = r2(faturas.reduce((s, f) => s + f.total, 0));
  const diaADia = ym === hoje.slice(0, 7) ? diaADiaRealizado(ym) : 0;
  const renda = rendaDoMes(ym);
  const comprometido = r2(totalFaturas + fixos + parcelados + diaADia);
  return {
    mes: cal.ymParaRef(ym), mes_iso: ym, faturas, total_faturas: totalFaturas,
    contas: contas.itens, origem_contas: contas.origem, fixos, parcelados, dia_a_dia: diaADia,
    comprometido, renda: renda.total, rendas: renda.itens, sobra_livre: r2(renda.total - comprometido),
    pct_comprometido: renda.total > 0 ? Math.round(comprometido / renda.total * 100) : 0
  };
}

function serie(hoje = cal.hojeISO(), n = 12) {
  cacheFaturas.clear();
  const ym0 = hoje.slice(0, 7);
  return Array.from({ length: n }, (_, i) => comprometidoMes(cal.addMes(ym0, i), hoje));
}

// fatura aberta de cada cartão (a que vence no próximo vencimento)
function faturasAbertas(hoje = cal.hojeISO()) {
  cacheFaturas.clear();
  const cartoes = cartoesAtivos().map(c => {
    const { aberta, porMes } = faturasDoCartao(c, hoje);
    const f = porMes.get(aberta) || { total: 0, parcelas: 0, compras: 0, itens: [], vencimento: vencimentoDe(aberta, c), fechamento: cal.diaDoMes(cal.addMes(aberta, -1), c.fecha_dia) };
    return { id: c.conta_local, conta_id: c.conta_id, nome: c.nome, icone: ICONES[c.conta_local] || '💳', mes: aberta,
      fechamento: f.fechamento, vencimento: f.vencimento, parcelas_agendadas: f.parcelas, compras_ciclo: f.compras, total: f.total, itens: f.itens, configurado: true };
  });
  const meses = cartoes.map(c => c.mes).sort();
  const ref = meses[0] || cal.addMes(hoje.slice(0, 7), 1);
  return { mes_referencia: cal.ymParaRef(ref), vencimento_ano_mes: ref, cartoes, total: r2(cartoes.filter(c => c.mes === ref).reduce((s, c) => s + c.total, 0)) };
}

// parcelamentos em andamento (cartão e externos), a partir do que já está programado
function dividas(hoje = cal.hojeISO()) {
  cacheFaturas.clear();
  const ym0 = hoje.slice(0, 7);
  const planos = new Map();
  for (const c of cartoesAtivos()) {
    for (const [ym, f] of faturasDoCartao(c, hoje).porMes) {
      if (ym <= ym0 || f.status === 'fechada') continue;
      for (const i of f.itens.filter(x => x.parcela)) {
        const [k, n] = i.parcela.split('/').map(Number);
        const chave = `${c.conta_id}|${baseDescricao(i.descricao)}|${n}|${Math.round(Math.abs(i.valor))}`;
        const p = planos.get(chave) || { descricao: String(i.descricao).replace(/\s*\d{1,2}\/\d{1,2}\s*$/, ''), valor: r2(Math.abs(i.valor)), total: n, restam: 0, ultimo: ym, menorK: k, tipo: 'cartao', fonte: c.nome };
        p.restam++; if (ym > p.ultimo) p.ultimo = ym; if (k < p.menorK) p.menorK = k;
        planos.set(chave, p);
      }
    }
  }
  for (const r of db.prepare("SELECT * FROM recorrencias WHERE ativo=1 AND tipo='Parcelado' AND total_parcelas IS NOT NULL").all()) {
    let restam = 0, ultimo = null, menorK = null;
    for (let i = 1; i <= 60; i++) { const ym = cal.addMes(ym0, i); const k = parcelaNoMes(r, ym); if (k) { restam++; ultimo = ym; if (menorK == null) menorK = k; } }
    if (restam) planos.set('rec|' + r.id, { descricao: r.descricao, valor: r2(Math.abs(r.valor)), total: r.total_parcelas, restam, ultimo, menorK, tipo: 'externo' });
  }
  const emAndamento = [...planos.values()].map(p => ({
    descricao: p.descricao, valor: p.valor, restam: p.restam, total_restante: r2(p.valor * p.restam),
    progresso: `${p.menorK - 1}/${p.total}`, pct: Math.round((p.menorK - 1) / p.total * 100),
    termina: `${p.ultimo.slice(5, 7)}/${p.ultimo.slice(0, 4)}`, tipo: p.tipo, fonte: p.fonte
  })).sort((a, b) => a.termina.split('/').reverse().join('').localeCompare(b.termina.split('/').reverse().join('')));
  const ym0n = cal.mesesEntre('2000-01', ym0);
  const alivio = m => r2(emAndamento.filter(d => cal.mesesEntre('2000-01', `${d.termina.slice(3)}-${d.termina.slice(0, 2)}`) <= ym0n + m).reduce((s, d) => s + d.valor, 0));
  return {
    emAndamento, quitadasRecentes: [],
    total_passivo_restante: r2(emAndamento.reduce((s, d) => s + d.total_restante, 0)),
    alivio_3m: alivio(3), alivio_6m: alivio(6), alivio_12m: alivio(12),
    data_quitacao_total: emAndamento.length ? emAndamento[emAndamento.length - 1].termina : null,
    total_dividas_ativas: emAndamento.length
  };
}

// grava os lançamentos "Fatura X" dos meses existentes a partir das faturas (chamado na sincronização
// e ao gerar um mês — nunca ao abrir uma tela). Fatura fechada: total oficial. Aberta: só se não paga.
function atualizarLancamentosDeFatura(hoje = cal.hojeISO()) {
  cacheFaturas.clear();
  let cat = db.prepare("SELECT id FROM categorias WHERE nome='Cartões'").get();
  if (!cat) { db.prepare("INSERT INTO categorias (nome) VALUES ('Cartões')").run(); cat = db.prepare("SELECT id FROM categorias WHERE nome='Cartões'").get(); }
  const desde = cal.addMes(hoje.slice(0, 7), -1);
  const meses = db.prepare('SELECT id, ref FROM meses').all().filter(m => cal.refParaYm(m.ref) >= desde);
  const padrao = c => new RegExp(String(c.nome).split(/[\s(]/)[0].replace(/[uú]/gi, '[uú]'), 'i');
  const pagamento = db.prepare(`SELECT a.id, a.data FROM auvp_transacoes a WHERE a.interna=1 AND a.valor < 0 AND ABS(ABS(a.valor) - ?) < 0.01
    AND a.data BETWEEN date(?, '-15 days') AND date(?, '+5 days') AND a.conta_id NOT IN (SELECT conta_id FROM cartoes)
    ORDER BY (a.par_id IS NOT NULL AND a.par_id IN (SELECT par_id FROM auvp_transacoes WHERE conta_id=? AND valor > 0)) DESC,
      (lower(a.descricao) LIKE '%fatura%' OR lower(a.descricao) LIKE '%pagament%' OR lower(a.descricao) LIKE '%bankslip%') DESC, a.data LIMIT 1`);
  const txLocal = db.prepare('SELECT id FROM transacoes WHERE hash_unico IN (?, ?)');
  let mudou = 0;
  for (const m of meses) {
    const ym = cal.refParaYm(m.ref);
    const lancs = db.prepare('SELECT * FROM lancamentos WHERE mes_id=? AND categoria_id=?').all(m.id, cat.id);
    for (const c of cartoesAtivos()) {
      const f = faturasDoCartao(c, hoje).porMes.get(ym);
      if (!f || f.total <= 0) continue;
      const l = lancs.find(x => padrao(c).test(x.descricao));
      const pg = f.status === 'fechada' ? pagamento.get(f.total, f.vencimento, f.vencimento, c.conta_id) : null;
      const txPg = pg ? txLocal.get('auvp-' + pg.id, 'auvp-neg-' + pg.id) : null;
      if (l) {
        if (f.status === 'fechada' || !l.pago) {
          if (Math.abs(l.valor - f.total) > 0.005 || l.vencimento !== f.vencimento) {
            db.prepare('UPDATE lancamentos SET valor=?, vencimento=?, origem=? WHERE id=?').run(f.total, f.vencimento, 'fatura', l.id);
            mudou++;
          }
          if (pg && !l.pago) { db.prepare('UPDATE lancamentos SET pago=1, pago_em=?, transacao_id=COALESCE(transacao_id, ?) WHERE id=?').run(pg.data, txPg ? txPg.id : null, l.id); mudou++; }
          else if (pg && l.pago && !l.transacao_id && txPg) { db.prepare('UPDATE lancamentos SET transacao_id=? WHERE id=?').run(txPg.id, l.id); mudou++; }
        }
      } else {
        db.prepare(`INSERT INTO lancamentos (mes_id, descricao, valor, vencimento, categoria_id, pago, pago_em, transacao_id, origem)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fatura')`).run(m.id, `Fatura ${c.nome}`, f.total, f.vencimento, cat.id, pg ? 1 : 0, pg ? pg.data : null, txPg ? txPg.id : null);
        mudou++;
      }
    }
  }
  cacheFaturas.clear();
  return mudou;
}

// ---------- caixa até o fim do mês (aba Hoje) ----------
// Visão de caixa, complementar à competência da Projeção: o que já está no banco, o que ainda sai e o que ainda cai
// até o último dia do mês corrente. Tudo real ou agendado (regra de 15/10/2026); nenhuma previsão de gasto.
// disponivel: saldo das contas correntes, vindo da AUVP (quem chama informa)
function caixaAteFimDoMes(disponivel, hoje = cal.hojeISO()) {
  const ym = hoje.slice(0, 7);
  const fim = cal.diaDoMes(ym, 31);
  const m = comprometidoMes(ym, hoje);
  const mes = db.prepare('SELECT id FROM meses WHERE ref=?').get(cal.ymParaRef(ym));

  // a pagar: contas do mês em aberto (valor do motor) + faturas do mês ainda não pagas
  const aPagar = m.contas.filter(c => !c.pago).map(c => ({ descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, tipo: c.tipo, valor_origem: c.valor_origem }));
  const faturasLanc = mes ? db.prepare(`SELECT l.descricao, l.valor, l.vencimento, l.pago FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id
    WHERE l.mes_id = ? AND c.nome = 'Cartões'`).all(mes.id) : [];
  if (faturasLanc.length) {
    for (const f of faturasLanc.filter(f => !f.pago)) aPagar.push({ descricao: f.descricao, valor: r2(Math.abs(f.valor)), vencimento: f.vencimento, tipo: 'fatura' });
  } else {
    for (const f of m.faturas.filter(f => f.vencimento >= hoje)) aPagar.push({ descricao: 'Fatura ' + f.cartao, valor: f.total, vencimento: f.vencimento, tipo: 'fatura' });
  }
  aPagar.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  // a receber: renda que ainda cai no caixa deste mês (pela data em que o dinheiro entra, não pela competência)
  const creditos = db.prepare(`SELECT data, valor, descricao FROM transacoes WHERE valor > 0 AND natureza IN ('salario','entrada','entrada-outra')
    AND data >= ? AND data <= ?`).all(ym + '-01', fim);
  const estimadas = new Map([...rendaDoMes(ym).itens, ...rendaDoMes(cal.addMes(ym, 1)).itens].map(i => [i.id, i.estimada]));
  const aReceber = [];
  for (const r of db.prepare('SELECT * FROM rendas WHERE ativo=1').all()) {
    const casa = t => (r.valor_exato != null ? Math.abs(t.valor - r.valor_exato) < 0.005 : (r.padrao_regex ? new RegExp(r.padrao_regex, 'i').test(t.descricao) : false));
    // quem tem corte de competência recebe no fim do mês (último dia útil); os demais no dia de pagamento
    const previsto = r.competencia_corte ? cal.ultimoDiaUtil(ym) : cal.diaDoMes(ym, r.dia_pagamento || 5);
    const jaCaiu = creditos.some(t => casa(t) && (!r.competencia_corte || +t.data.slice(8, 10) >= r.competencia_corte));
    if (!jaCaiu) aReceber.push({ renda_id: r.id, nome: r.nome, valor: estimadas.get(r.id) || 0, previsto, atrasada: previsto < hoje });
  }

  const totPagar = r2(aPagar.reduce((s, x) => s + x.valor, 0));
  const totReceber = r2(aReceber.reduce((s, x) => s + x.valor, 0));
  const fa = faturasAbertas(hoje);
  return {
    mes: m.mes, mes_iso: ym, hoje, fim,
    disponivel: r2(disponivel), a_pagar: totPagar, a_receber: totReceber,
    caixa_fim_do_mes: r2(disponivel + totReceber - totPagar),
    contas_a_pagar: aPagar, rendas_a_receber: aReceber,
    dia_a_dia_no_mes: m.dia_a_dia,
    faturas_abertas: fa,
    // as faturas abertas vencem logo no começo do mês seguinte: o caixa depois delas é o número que importa
    caixa_apos_faturas: r2(disponivel + totReceber - totPagar - fa.total)
  };
}

module.exports = { caixaAteFimDoMes, comprometidoMes, serie, faturasAbertas, faturasDoMes, faturasDoCartao, contasDoMes, rendaDoMes, dividas, parcelaNoMes, entraNoMes, atualizarLancamentosDeFatura, baseDescricao };
