// modo privado: "olhinho" oculta valores em TODO o sistema (persistente)
let modoPrivado = localStorage.getItem('finflow.privado') === '1';
const fmt = v => {
  if (modoPrivado) return '••••••';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const fmtD = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}`; };

// ícones SVG discretos (stroke, herdam cor) — substituem emojis coloridos
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONES = {
  eye: `<svg viewBox="0 0 24 24" ${S}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" ${S}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  bank: `<svg viewBox="0 0 24 24" ${S}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  note: `<svg viewBox="0 0 24 24" ${S}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${S}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  link: `<svg viewBox="0 0 24 24" ${S}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" ${S}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${S}><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${S}><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  card: `<svg viewBox="0 0 24 24" ${S}><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  chip: `<svg viewBox="0 0 24 24" ${S}><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M9 2v2"/><path d="M15 2v2"/><path d="M9 20v2"/><path d="M15 20v2"/><path d="M2 9h2"/><path d="M2 15h2"/><path d="M20 9h2"/><path d="M20 15h2"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" ${S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" ${S}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" ${S}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  list: `<svg viewBox="0 0 24 24" ${S}><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  money: `<svg viewBox="0 0 24 24" ${S}><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" ${S}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  brain: `<svg viewBox="0 0 24 24" ${S}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>`,
  download: `<svg viewBox="0 0 24 24" ${S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${S}><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${S}><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${S}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  loading: `<svg viewBox="0 0 24 24" ${S}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
};
const ico = (n, cls = '') => `<span class="ico-svg ${cls}">${ICONES[n] || ''}</span>`;

let MESES = [], mesAtual = null, MES_MIN = null;
let charts = {};

async function api(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 401) { location.href = '/entrar.html'; throw new Error('entre no app primeiro'); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.erro || r.statusText); }
  return r.json();
}
const toast = msg => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); };

// ---------- período compartilhado ----------
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = iso => {
  if (!iso) return '';
  const [a, b] = iso.split('-');
  // aceita tanto AAAA-MM quanto MM-AAAA (a projeção usa MM-AAAA)
  return a.length === 4 ? `${NOMES_MES[+b - 1]}/${a.slice(2)}` : `${NOMES_MES[+a - 1]}/${b.slice(2)}`;
};
const qsPeriodo = w => {
  const p = new URLSearchParams();
  if (w.de) p.set('de', w.de);
  if (w.ate) p.set('ate', w.ate);
  const s = p.toString();
  return s ? '?' + s : '';
};

// barra de presets + intervalo personalizado; presets terminam sempre no último mês FECHADO
function barraPeriodo(rootId, storageKey, onChange) {
  const root = document.getElementById(rootId);
  const chipInicial = root.querySelector('.fchip.on');
  let state = { mode: chipInicial ? chipInicial.dataset.per : 'mes-atual' };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      if (storageKey === 'finflow.per.extratos' && saved.mode === 'tudo' && !saved.usuarioEscolheuTudo) {
        saved.mode = 'mes-atual';
      }
      Object.assign(state, saved);
    }
  } catch (e) {}
  const chips = [...root.querySelectorAll('.fchip')];
  const boxCustom = root.querySelector('.per-custom');
  const inDe = root.querySelector('.per-de');
  const inAte = root.querySelector('.per-ate');
  const lbl = root.querySelector('.per-label');
  root.querySelector('[data-per="ano"]').textContent = 'Ano ' + new Date().getFullYear();

  const addM = (iso, k) => {
    let [y, m] = iso.split('-').map(Number);
    y += Math.floor((m - 1 + k) / 12);
    m = (m - 1 + k) % 12 + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  const ultimoFechado = () => {
    const h = new Date();
    let y = h.getFullYear(), m = h.getMonth(); // mês corrente ainda aberto (fatura não fechou)
    if (m === 0) { y--; m = 12; }
    return `${y}-${String(m).padStart(2, '0')}`;
  };

  function resolver() {
    let atual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    if (typeof mesAtual !== 'undefined' && mesAtual && /^\d{2}-\d{4}$/.test(mesAtual)) {
      const [m, y] = mesAtual.split('-');
      atual = `${y}-${m}`;
    }
    const fechado = ultimoFechado();
    if (state.mode === 'tudo') return { de: null, ate: null };
    if (state.mode === 'custom') return { de: state.de || null, ate: state.ate || null };
    if (state.mode === 'mes-atual') return { de: atual, ate: atual };
    if (state.mode === 'mes-anterior') return { de: addM(atual, -1), ate: addM(atual, -1) };
    if (state.mode === 'ano') return { de: `${new Date().getFullYear()}-01`, ate: fechado };
    let de = addM(fechado, -(+state.mode - 1));
    // não abre janela vazia antes do primeiro mês com dados
    if (MES_MIN && de < MES_MIN) de = MES_MIN;
    return { de, ate: fechado };
  }

  function rotulo(w) {
    if (state.mode === 'tudo') return 'todo o histórico';
    if (!w.de && !w.ate) return '';
    const idx = s => +s.slice(0, 4) * 12 + +s.slice(5, 7);
    if (w.de === w.ate) return `${mesCurto(w.de)} · só esse mês`;
    if (!w.de) return `até ${mesCurto(w.ate)}`;
    if (!w.ate) return `desde ${mesCurto(w.de)}`;
    const nMeses = idx(w.ate) - idx(w.de) + 1;
    const mesmoAno = w.de && w.ate && w.de.slice(0, 4) === w.ate.slice(0, 4);
    const faixa = mesmoAno
      ? `${NOMES_MES[+w.de.slice(5, 7) - 1]}–${mesCurto(w.ate)}`
      : `${mesCurto(w.de)}–${mesCurto(w.ate)}`;
    return nMeses ? `${faixa} · ${nMeses} meses` : faixa;
  }

  function pintar() {
    chips.forEach(c => c.classList.toggle('on', c.dataset.per === state.mode));
    boxCustom.hidden = state.mode !== 'custom';
    if (state.mode === 'custom') {
      if (!inDe.value) inDe.value = state.de || addM(ultimoFechado(), -11);
      if (!inAte.value) inAte.value = state.ate || ultimoFechado();
    }
    const w = resolver();
    lbl.textContent = rotulo(w);
    return w;
  }

  function trocar(mode) {
    state.mode = mode;
    if (mode === 'tudo') state.usuarioEscolheuTudo = true;
    else state.usuarioEscolheuTudo = false;
    if (mode === 'custom' && !state.de) { state.de = addM(ultimoFechado(), -11); state.ate = ultimoFechado(); }
    localStorage.setItem(storageKey, JSON.stringify(state));
    const w = pintar();
    onChange(w);
  }

  chips.forEach(c => c.onclick = () => trocar(c.dataset.per));
  inDe.onchange = () => { state.de = inDe.value || null; localStorage.setItem(storageKey, JSON.stringify(state)); onChange(pintar()); };
  inAte.onchange = () => { state.ate = inAte.value || null; localStorage.setItem(storageKey, JSON.stringify(state)); onChange(pintar()); };
  return {
    get: resolver,
    set: (mode, de, ate) => {
      state.mode = mode;
      if (mode === 'custom') { state.de = de; state.ate = ate; }
      localStorage.setItem(storageKey, JSON.stringify(state));
      onChange(pintar());
    }
  };
}

// ---------- navegação ----------
const VIEWS = ['visao', 'extratos', 'projecao', 'mes', 'recorrentes', 'reconciliar', 'configurar'];
document.querySelectorAll('.nav-item[data-view]').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  VIEWS.forEach(v => document.getElementById('view-' + v).hidden = v !== b.dataset.view);
  const loaders = { visao: loadVisao, extratos: loadExtratos, projecao: loadProjecao, mes: loadMes, recorrentes: loadRecorrentes, reconciliar: loadReconciliar, configurar: loadConfigurar };
  loaders[b.dataset.view]();
  if (b.dataset.view === 'extratos' && charts.extMeses) {
    setTimeout(() => charts.extMeses?.resize(), 60);
  }
});

async function loadMeses() {
  const d = await api('/api/meses');
  MESES = d.meses.map(m => m.ref);
  mesAtual = d.mes_atual;
  const opts = MESES.slice().reverse().map(r => `<option ${r === mesAtual ? 'selected' : ''}>${r}</option>`).join('');
  document.getElementById('mes-select2').innerHTML = opts;
  const emIso = MESES.map(r => { const [m, y] = r.split('-'); return `${y}-${m}`; }).sort();
  if (emIso.length) MES_MIN = emIso[0];
}

// ---------- HOJE: caixa até o fim do mês (saldo real + o que sai + o que entra) ----------
let hojeDados = null;
async function loadVisao() {
  const d = await api('/api/hoje').catch(e => ({ erro: e.message }));
  const hero = document.getElementById('vc-hero');
  if (d.erro) { hero.innerHTML = `<div class="insight bad"><span class="ico">${ico('x')}</span><div class="txt"><b>Erro:</b> ${d.erro}</div></div>`; return; }
  hojeDados = d;
  const btn = document.getElementById('hoje-btn-auvp');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Atualizando…';
    try {
      const r = await api('/api/auvp/sync', { method: 'POST' });
      toast(r.nucleo && r.nucleo.erro ? 'AUVP: ' + r.nucleo.erro : 'Dados da AUVP atualizados');
    } catch (e) { toast('Erro ao atualizar: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Atualizar da AUVP';
    loadVisao();
  };
  document.getElementById('hoje-quando').textContent = 'Caixa até o fim do mês: o que está no banco, o que ainda sai e o que ainda entra. Nada aqui é previsão de gasto.';
  const dataBR = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
  const sinal = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));
  const fa = d.faturas_abertas || { total: 0, cartoes: [] };
  const mesFa = fa.mes_referencia ? mesCurto(fa.mes_referencia).toLowerCase() : 'o mês seguinte';
  hero.innerHTML = `
    <div class="vc-main">
      <span class="lbl">NO BANCO AGORA</span>
      <span class="num ${d.disponivel >= 0 ? 'up' : 'down'}">${fmt(d.disponivel)}</span>
      <span class="sub muted">${d.saldos_erro ? 'sem saldo da AUVP: ' + d.saldos_erro : 'contas correntes · AUVP ' + (d.saldos_quando || '').slice(0, 16).replace('T', ' ')}</span>
    </div>
    <div class="vc-main">
      <span class="lbl">AINDA SAI ATÉ ${dataBR(d.fim)}</span>
      <span class="num down">${fmt(d.a_pagar)}</span>
      <span class="sub muted">${d.contas_a_pagar.length} conta(s) em aberto no mês</span>
    </div>
    <div class="vc-main">
      <span class="lbl">AINDA ENTRA ATÉ ${dataBR(d.fim)}</span>
      <span class="num up">${fmt(d.a_receber)}</span>
      <span class="sub muted">${d.rendas_a_receber.length ? d.rendas_a_receber.map(r => r.nome.replace(/^Salário /i, '')).join(' · ') : 'tudo o que ia cair já caiu'}</span>
    </div>
    <div class="vc-main ${d.caixa_fim_do_mes >= 0 ? 'sobra' : 'estouro'}">
      <span class="lbl">CAIXA EM ${dataBR(d.fim)}</span>
      <span class="num ${d.caixa_fim_do_mes >= 0 ? 'up' : 'down'}">${sinal(d.caixa_fim_do_mes)}</span>
      <span class="sub muted">depois das faturas de ${mesFa} (${fmt(fa.total)}): <b class="${d.caixa_apos_faturas >= 0 ? 'up' : 'down'}">${sinal(d.caixa_apos_faturas)}</b></span>
    </div>`;

  // o que ainda sai
  const hojeIso = d.hoje;
  document.getElementById('vc-prox-titulo').textContent = d.contas_a_pagar.length ? `${fmt(d.a_pagar)} em ${d.contas_a_pagar.length}` : 'tudo pago';
  document.getElementById('vc-proximos').innerHTML = d.contas_a_pagar.length
    ? d.contas_a_pagar.map(p => `
      <div class="hoje-linha">
        <span>${p.descricao}${p.valor_origem && p.valor_origem.startsWith('último') ? ` <small class="muted">(${p.valor_origem})</small>` : ''}</span>
        <span class="muted mono ${p.vencimento < hojeIso ? 'down' : ''}">${dataBR(p.vencimento)}${p.vencimento < hojeIso ? ' · atrasada' : ''}</span>
        <span class="mono">${fmt(p.valor)}</span>
      </div>`).join('')
    : '<div class="muted" style="padding:8px 0;">Nenhuma conta em aberto no mês</div>';

  // o que ainda entra
  document.getElementById('vc-divida').innerHTML = (d.rendas_a_receber.length
    ? d.rendas_a_receber.map(r => `
      <div class="hoje-linha">
        <span>${r.nome}</span>
        <span class="muted mono ${r.atrasada ? 'down' : ''}">${dataBR(r.previsto)}${r.atrasada ? ' · não caiu' : ''}</span>
        <span class="mono up">${fmt(r.valor)}</span>
      </div>`).join('') + `<button class="ghost" style="margin-top:10px;" onclick="lançarRendaManual()">Caiu e a AUVP ainda não trouxe? Lançar à mão</button>`
    : '<div class="muted" style="padding:8px 0;">Toda a renda do mês já caiu</div>');

  // faturas que vencem no começo do mês seguinte
  document.getElementById('vc-faturas').innerHTML = (fa.cartoes || []).map(c => `
      <div class="hoje-linha" style="cursor:pointer" onclick="abrirModalFaturasAbertas()">
        <span>${c.icone || ''} ${c.nome || c.id}</span>
        <span class="muted mono">${dataBR(c.vencimento)}</span>
        <span class="mono down">${fmt(c.total)}</span>
      </div>`).join('') || '<div class="muted">Nenhuma fatura aberta</div>';
  document.getElementById('vc-faturas-tit').textContent = `vencem em ${mesFa} · ${fmt(fa.total)} · compras já lançadas + parcelas programadas`;
}

// Renda caiu no banco antes de a AUVP trazer: lançamento manual (a sincronização não duplica depois)
window.lançarRendaManual = async function () {
  const lista = (hojeDados && hojeDados.rendas_a_receber) || [];
  if (!lista.length) { toast('Nada pendente — todas as rendas deste mês já caíram'); return; }
  let item = lista[0];
  if (lista.length > 1) {
    const idx = Number(prompt('Qual renda caiu?\n' + lista.map((p, i) => `${i + 1}. ${p.nome} (previsto ${fmt(p.valor)})`).join('\n') + '\n\nDigite o número:', '1'));
    if (!idx || !lista[idx - 1]) return;
    item = lista[idx - 1];
  }
  const valorStr = prompt(`Valor que caiu na conta (${item.nome}):`, String(item.valor).replace('.', ','));
  if (valorStr === null) return;
  const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
  if (!isFinite(valor) || valor <= 0) { toast('Valor inválido'); return; }
  const dataStr = prompt('Data que caiu (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
  if (dataStr === null) return;
  const r = await api('/api/rendas/lancar-manual', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ renda_id: item.renda_id, valor, data: dataStr })
  }).catch(e => ({ erro: e.message }));
  if (r.erro) { toast('Erro: ' + r.erro); return; }
  toast(`${item.nome} lançado: ${fmt(valor)} em ${dataStr}`);
  loadVisao();
};

function chartOpts() {
  return {
    maintainAspectRatio: false,
    devicePixelRatio: 2,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#a8bcd2', font: { size: 12.5, weight: '600' } } } },
    scales: { y: { ticks: { color: '#a8bcd2', font: { size: 13, weight: '600' } } }, x: { ticks: { color: '#a8bcd2', font: { size: 12.5, weight: '600' } } } }
  };
}

// ---------- EXTRATOS & LIVRO-RAZÃO UNIFICADO ----------
// nome de cada fonte: as da AUVP têm nome fixo; as importações antigas levam o nome da conta (Configurar)
const NOME_FONTE = { 'auvp-mcp': 'Cartão (AUVP)', 'auvp-bank': 'Conta (AUVP)', manual: 'Lançado à mão' };
api('/api/contas?todas=1').then(contas => {
  for (const c of contas || []) for (const f of c.fontes || []) if (!NOME_FONTE[f]) NOME_FONTE[f] = c.nome;
}).catch(() => {});
const nomeFonte = f => NOME_FONTE[f] || f || '—';

const NAT_ROTULO = {
  gasto: 'Gasto',
  salario: 'Salário',
  entrada: 'Entrada',
  'entrada-outra': 'TED',
  transferencia: '⚡ Pagto fatura',
  'transferencia-propria': '🔄 Entre contas',
  ignorado: '👁️ Ocultada',
  rendimento: 'Rendimento'
};

let extFiltros = {
  conta: 'todas',
  fonte: '',
  natureza: '',
  categoria: '',
  busca: '',
  sem_categoria: '0',
  apenas_parceladas: '0',
  min_valor: ''
};
let extTxAtual = [];
let extResumoAtual = null;
let extListenersConfigurados = false;
let buscaTimerExtrato = null;

async function loadExtratos() {
  configurarEventosExtrato();
  await popularFiltrosExtratos();
  await carregarTransacoes();
}

async function popularFiltrosExtratos() {
  try {
    const contas = await api('/api/contas').catch(() => []);
    const selConta = document.getElementById('ext-conta');
    if (selConta && contas.length) {
      const cAtual = selConta.value || 'todas';
      const banks = contas.filter(c => c.tipo === 'BANK');
      const credits = contas.filter(c => c.tipo === 'CREDIT');
      selConta.innerHTML = `
        <option value="todas">🌐 Todas as Contas (Consolidado)</option>
        ${banks.length ? `<optgroup label="Contas Bancárias">${banks.map(c => `<option value="${c.id}">${c.icone || '🏦'} ${c.nome}</option>`).join('')}</optgroup>` : ''}
        ${credits.length ? `<optgroup label="Cartões de Crédito">${credits.map(c => `<option value="${c.id}">${c.icone || '💳'} ${c.nome}</option>`).join('')}</optgroup>` : ''}
      `;
      selConta.value = cAtual;
    }
    const fontes = await api('/api/extratos/fontes').catch(() => []);
    const selF = document.getElementById('ext-fonte');
    if (selF) {
      const fAtual = selF.value;
      selF.innerHTML = '<option value="">Todas as fontes/bancos</option>' +
        fontes.map(f => `<option value="${f.fonte}">${nomeFonte(f.fonte)} (${f.n})</option>`).join('');
      selF.value = fAtual;
    }
    const cats = await api('/api/categorias').catch(() => []);
    const selC = document.getElementById('ext-categoria');
    if (selC) {
      const cAtual = selC.value;
      selC.innerHTML = '<option value="">Todas as categorias</option>' +
        cats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
      selC.value = cAtual;
    }
  } catch (e) {
    console.error('Erro ao popular filtros do extrato:', e);
  }
}

function configurarEventosExtrato() {
  if (extListenersConfigurados) return;
  extListenersConfigurados = true;

  const selConta = document.getElementById('ext-conta');
  if (selConta) {
    selConta.onchange = e => {
      extFiltros.conta = e.target.value;
      carregarTransacoes();
    };
  }

  const btnToggleGraf = document.getElementById('ext-btn-toggle-graficos');
  if (btnToggleGraf) {
    btnToggleGraf.onclick = () => {
      const painel = document.getElementById('ext-painel-analitico');
      if (!painel) return;
      const isOculto = painel.style.display === 'none';
      painel.style.display = isOculto ? 'block' : 'none';
      btnToggleGraf.classList.toggle('active', isOculto);
      if (isOculto && charts.extMeses) {
        setTimeout(() => charts.extMeses.resize(), 50);
      }
    };
  }

  const btnExp = document.getElementById('ext-export');
  if (btnExp) {
    btnExp.onclick = () => exportarExtratoCSV();
  }

  const selNat = document.getElementById('ext-natureza');
  if (selNat) {
    selNat.onchange = e => {
      extFiltros.natureza = e.target.value;
      document.getElementById('chip-ocultadas')?.classList.toggle('on', extFiltros.natureza === 'ignorado');
      carregarTransacoes();
    };
  }

  const selCat = document.getElementById('ext-categoria');
  if (selCat) {
    selCat.onchange = e => {
      extFiltros.categoria = e.target.value;
      carregarTransacoes();
    };
  }

  const selFonte = document.getElementById('ext-fonte');
  if (selFonte) {
    selFonte.onchange = e => {
      extFiltros.fonte = e.target.value;
      carregarTransacoes();
    };
  }

  const inBusca = document.getElementById('ext-busca');
  if (inBusca) {
    inBusca.oninput = e => {
      clearTimeout(buscaTimerExtrato);
      buscaTimerExtrato = setTimeout(() => {
        extFiltros.busca = e.target.value.trim();
        carregarTransacoes();
      }, 300);
    };
  }

  const btnLimpar = document.getElementById('ext-limpar');
  if (btnLimpar) {
    btnLimpar.onclick = () => limparTodosFiltros();
  }

  const chipSemCat = document.getElementById('chip-sem-categoria');
  if (chipSemCat) {
    chipSemCat.onclick = () => {
      extFiltros.sem_categoria = extFiltros.sem_categoria === '1' ? '0' : '1';
      chipSemCat.classList.toggle('on', extFiltros.sem_categoria === '1');
      carregarTransacoes();
    };
  }

  const chipMaiores = document.getElementById('chip-maiores-gastos');
  if (chipMaiores) {
    chipMaiores.onclick = () => {
      extFiltros.min_valor = extFiltros.min_valor ? '' : '500';
      chipMaiores.classList.toggle('on', !!extFiltros.min_valor);
      carregarTransacoes();
    };
  }

  const chipParcelas = document.getElementById('chip-parceladas');
  if (chipParcelas) {
    chipParcelas.onclick = () => {
      extFiltros.apenas_parceladas = extFiltros.apenas_parceladas === '1' ? '0' : '1';
      chipParcelas.classList.toggle('on', extFiltros.apenas_parceladas === '1');
      carregarTransacoes();
    };
  }

  const chipOcultadas = document.getElementById('chip-ocultadas');
  if (chipOcultadas) {
    chipOcultadas.onclick = () => {
      if (extFiltros.natureza === 'ignorado') {
        extFiltros.natureza = '';
        if (selNat) selNat.value = '';
        chipOcultadas.classList.remove('on');
      } else {
        extFiltros.natureza = 'ignorado';
        if (selNat) selNat.value = 'ignorado';
        chipOcultadas.classList.add('on');
      }
      carregarTransacoes();
    };
  }

  const selAgr = document.getElementById('ext-agrupar');
  if (selAgr) {
    selAgr.onchange = () => renderizarTabelaOuAgrupado();
  }

  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      const secExt = document.getElementById('view-extratos');
      if (secExt && !secExt.hidden) {
        e.preventDefault();
        const alvo = document.getElementById('ext-busca');
        if (alvo) alvo.focus();
      }
    }
  });
}

function limparTodosFiltros() {
  extFiltros = {
    conta: 'todas',
    fonte: '',
    natureza: '',
    categoria: '',
    busca: '',
    sem_categoria: '0',
    apenas_parceladas: '0',
    min_valor: ''
  };
  const elConta = document.getElementById('ext-conta'); if (elConta) elConta.value = 'todas';
  const elNat = document.getElementById('ext-natureza'); if (elNat) elNat.value = '';
  const elCat = document.getElementById('ext-categoria'); if (elCat) elCat.value = '';
  const elFonte = document.getElementById('ext-fonte'); if (elFonte) elFonte.value = '';
  const elBusca = document.getElementById('ext-busca'); if (elBusca) elBusca.value = '';

  document.getElementById('chip-sem-categoria')?.classList.remove('on');
  document.getElementById('chip-maiores-gastos')?.classList.remove('on');
  document.getElementById('chip-parceladas')?.classList.remove('on');
  document.getElementById('chip-ocultadas')?.classList.remove('on');

  carregarTransacoes();
}

async function carregarTransacoes() {
  const w = (typeof perExtratos !== 'undefined' && perExtratos.get) ? perExtratos.get() : { de: null, ate: null };
  const p = new URLSearchParams();
  if (w.de) p.set('de', w.de);
  if (w.ate) p.set('ate', w.ate);
  if (extFiltros.conta && extFiltros.conta !== 'todas') p.set('conta', extFiltros.conta);
  if (extFiltros.fonte) p.set('fonte', extFiltros.fonte);
  if (extFiltros.natureza) p.set('natureza', extFiltros.natureza);
  if (extFiltros.categoria) p.set('categoria', extFiltros.categoria);
  if (extFiltros.busca) p.set('busca', extFiltros.busca);
  if (extFiltros.sem_categoria === '1') p.set('sem_categoria', '1');
  if (extFiltros.apenas_parceladas === '1') p.set('apenas_parceladas', '1');
  if (extFiltros.min_valor) p.set('min_valor', extFiltros.min_valor);

  const qs = p.toString();
  const [rows, resumo] = await Promise.all([
    api('/api/transacoes?' + qs).catch(() => []),
    api('/api/extratos/resumo?' + qs).catch(() => null)
  ]);

  extTxAtual = rows || [];
  extResumoAtual = resumo;

  try { renderizarCockpitKPIs(resumo, extTxAtual); } catch (e) { console.error('Erro KPIs:', e); }
  try { renderizarAnalyticsVisual(resumo, extTxAtual); } catch (e) { console.error('Erro Analytics:', e); }
  try { renderizarChipsAtivos(); } catch (e) { console.error('Erro Chips:', e); }
  try { renderizarTabelaOuAgrupado(); } catch (e) { console.error('Erro Tabela:', e); }
}

function renderizarCockpitKPIs(resumo, rows) {
  if (!resumo) return;
  const totais = resumo.totais || {};

  const elFluxoRes = document.getElementById('ext-kpi-resultado');
  const elFluxoDet = document.getElementById('ext-kpi-detalhe-fluxo');
  if (elFluxoRes) {
    const resPeriodo = totais.saldo_periodo ?? 0;
    elFluxoRes.textContent = `${resPeriodo >= 0 ? '+' : ''}${fmt(resPeriodo)}`;
    elFluxoRes.style.color = resPeriodo >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (elFluxoDet) {
    elFluxoDet.innerHTML = `entradas <b class="up">${fmt(totais.total_entradas || 0)}</b> · gastos <b style="color:var(--red)">${fmt(totais.total_gastos || 0)}</b>`;
  }

  const elCountSemCat = document.getElementById('count-sem-cat');
  if (elCountSemCat) {
    elCountSemCat.textContent = `(${totais.sem_categoria_count || 0})`;
  }

  const elSticky = document.getElementById('ext-total-sticky');
  if (elSticky) {
    elSticky.innerHTML = `<b>${rows.length}</b> transações · gastos <b style="color:var(--red)">${fmt(totais.total_gastos || 0)}</b> · entradas <b class="up">${fmt(totais.total_entradas || 0)}</b>` +
      (totais.total_faturas ? ` · faturas <b>${fmt(totais.total_faturas)}</b>` : '') +
      (totais.total_entre_contas ? ` · entre contas <b>${fmt(totais.total_entre_contas)}</b>` : '') +
      (totais.total_ignorados ? ` · <span style="color:var(--muted); font-size:12px;" title="Transações ocultadas (desconsideradas das despesas e receitas)">👁️ ocultadas <b>${fmt(totais.total_ignorados)}</b></span>` : '');
  }
}

function renderizarAnalyticsVisual(resumo, rows) {
  // 1. Gráfico Timeline
  try {
    const canvas = document.getElementById('ch-ext-meses');
    if (canvas && resumo?.timeline) {
      const tl = resumo.timeline || [];
      // rótulo YYYY-MM-DD = barra por dia (período de um mês); YYYY-MM = barra por mês
      const labels = tl.map(t => t.label.length === 10 ? t.label.slice(8, 10) + '/' + t.label.slice(5, 7) : mesCurto(t.label));
      if (window.Chart) {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
      }
      if (charts.extMeses) {
        try { charts.extMeses.destroy(); } catch (e) {}
        charts.extMeses = null;
      }
      if (window.Chart && canvas) {
        charts.extMeses = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Gastos',
                data: tl.map(t => t.gastos),
                backgroundColor: 'rgba(255, 92, 124, 0.85)',
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
              },
              {
                label: 'Entradas',
                data: tl.map(t => t.entradas),
                backgroundColor: 'rgba(46, 204, 113, 0.85)',
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            responsive: true,
            devicePixelRatio: 2,
            layout: {
              padding: { top: 2, right: 6, bottom: 2, left: 0 }
            },
            onClick: (evt, elems) => {
              if (!elems.length) return;
              const idx = elems[0].index;
              const mesIso = tl[idx]?.label;
              if (!mesIso) return;
              if (typeof perExtratos !== 'undefined' && perExtratos.set) {
                perExtratos.set('custom', mesIso, mesIso);
                const inDe = document.querySelector('#per-bar-extratos .per-de');
                const inAte = document.querySelector('#per-bar-extratos .per-ate');
                if (inDe) inDe.value = mesIso;
                if (inAte) inAte.value = mesIso;
              }
            },
            plugins: {
              legend: {
                position: 'top',
                align: 'end',
                labels: {
                  boxWidth: 8,
                  boxHeight: 8,
                  font: { size: 10, weight: '600' },
                  color: '#a8bcd2',
                  padding: 6
                }
              },
              tooltip: {
                callbacks: {
                  label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
                }
              }
            },
            scales: {
              y: {
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: {
                  color: '#a8bcd2',
                  font: { size: 10, weight: '600' },
                  maxTicksLimit: 4,
                  callback: v => 'R$ ' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)
                }
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: '#a8bcd2',
                  font: { size: 10, weight: '600' },
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 9
                }
              }
            }
          }
        });
      }
    }
  } catch (errChart) {
    console.error('Erro ao renderizar gráfico mensal:', errChart);
  }

  // 2. Gastos por Categoria
  try {
    const elCatBars = document.getElementById('ext-cat-bars');
    if (elCatBars) {
      const cats = (resumo?.top_categorias || []).filter(c => (c.total || 0) > 0).slice(0, 7);
      if (!cats.length) {
        elCatBars.innerHTML = '<div class="muted" style="padding:18px 0; font-size:12.5px; text-align:center;">Sem gastos no período</div>';
      } else {
        const maxVal = cats[0].total || 1;
        const CORES = ['#4dabff', '#ff4d5e', '#f28b5b', '#b388ff', '#00d68f', '#ffb454', '#4dd0e1'];
        elCatBars.innerHTML = cats.map((c, i) => {
          const catNome = c.categoria || c.cat || '(sem categoria)';
          const pct = Math.min(100, Math.round((c.total / maxVal) * 100));
          return `
            <div class="ext-cat-row" style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer; font-size:12px;" onclick="filtrarPorCategoria(this.dataset.cat)" data-cat="${catNome}" title="Filtrar por ${catNome}">
              <span style="width:95px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" class="muted">${catNome}</span>
              <div style="flex:1; background:rgba(255,255,255,0.06); height:6px; border-radius:3px; overflow:hidden;">
                <div style="width:${pct}%; background:${CORES[i % CORES.length]}; height:100%; border-radius:3px;"></div>
              </div>
              <span class="mono" style="width:75px; flex:none; text-align:right; font-size:11px;">${fmt(c.total)}</span>
            </div>`;
        }).join('');
      }
    }
  } catch (errCats) {
    console.error('Erro ao renderizar categorias:', errCats);
  }

  // 3. Maiores Gastos
  try {
    const elTopGastos = document.getElementById('ext-top-gastos');
    if (elTopGastos) {
      const gastosTxs = (rows || [])
        .filter(t => t.valor < 0 && t.natureza === 'gasto')
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
        .slice(0, 6);
      if (!gastosTxs.length) {
        elTopGastos.innerHTML = '<div class="muted" style="padding:18px 0; font-size:12.5px; text-align:center;">Sem gastos no período</div>';
      } else {
        elTopGastos.innerHTML = gastosTxs.map(t => {
          const desc = t.descricao || 'Sem descrição';
          const dataFmt = t.data ? t.data.slice(5) : '';
          const fonteFmt = nomeFonte(t.fonte);
          return `
            <div class="ext-top-row" style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:12px; cursor:pointer;" ondblclick="abrirEdicaoTx(${t.id})" title="Duplo-clique para editar">
              <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;">
                <span style="color:var(--txt); font-weight:600;">${desc.slice(0, 22)}</span>
                <span class="muted" style="font-size:10.5px; margin-left:4px;">${dataFmt} · ${fonteFmt}</span>
              </div>
              <span class="mono" style="color:var(--red); font-weight:600; flex:none; font-size:11.5px;">${fmt(t.valor)}</span>
            </div>`;
        }).join('');
      }
    }
  } catch (errTop) {
    console.error('Erro ao renderizar maiores gastos:', errTop);
  }
}

function renderizarChipsAtivos() {
  const el = document.getElementById('ext-chips-ativos');
  if (!el) return;
  const chips = [];
  if (extFiltros.conta && extFiltros.conta !== 'todas') chips.push(['conta', `Conta: ${extFiltros.conta}`]);
  if (extFiltros.natureza) chips.push(['natureza', `Natureza: ${NAT_ROTULO[extFiltros.natureza] || extFiltros.natureza}`]);
  if (extFiltros.categoria) chips.push(['categoria', `Cat: ${extFiltros.categoria}`]);
  if (extFiltros.fonte) chips.push(['fonte', `Fonte: ${nomeFonte(extFiltros.fonte)}`]);
  if (extFiltros.busca) chips.push(['busca', `“${extFiltros.busca}”`]);
  if (extFiltros.sem_categoria === '1') chips.push(['sem_categoria', 'Sem Categoria']);
  if (extFiltros.min_valor) chips.push(['min_valor', `> R$ ${extFiltros.min_valor}`]);
  if (extFiltros.apenas_parceladas === '1') chips.push(['apenas_parceladas', 'Parceladas']);

  el.innerHTML = chips.map(([k, v]) => `
    <span class="tag" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;" onclick="removerFiltroExtrato('${k}')" title="Remover filtro">
      ${v} <span style="opacity:0.6;">✕</span>
    </span>`).join('');
}

window.removerFiltroExtrato = function(k) {
  if (k === 'conta') {
    extFiltros.conta = 'todas';
    const el = document.getElementById('ext-conta'); if (el) el.value = 'todas';
  } else if (k === 'sem_categoria') {
    extFiltros.sem_categoria = '0';
    document.getElementById('chip-sem-categoria')?.classList.remove('on');
  } else if (k === 'min_valor') {
    extFiltros.min_valor = '';
    document.getElementById('chip-maiores-gastos')?.classList.remove('on');
  } else if (k === 'apenas_parceladas') {
    extFiltros.apenas_parceladas = '0';
    document.getElementById('chip-parceladas')?.classList.remove('on');
  } else {
    extFiltros[k] = '';
    const el = document.getElementById('ext-' + k); if (el) el.value = '';
    if (k === 'natureza') document.getElementById('chip-ocultadas')?.classList.remove('on');
  }
  carregarTransacoes();
};

window.filtrarPorCategoria = function(cat) {
  if (!cat || cat === '(sem categoria)' || cat === '⚠️ Sem categoria') {
    extFiltros.categoria = '';
    extFiltros.sem_categoria = '1';
    const selC = document.getElementById('ext-categoria');
    if (selC) selC.value = '';
    document.getElementById('chip-sem-categoria')?.classList.add('on');
  } else {
    extFiltros.categoria = cat;
    extFiltros.sem_categoria = '0';
    const selC = document.getElementById('ext-categoria');
    if (selC) selC.value = cat;
    document.getElementById('chip-sem-categoria')?.classList.remove('on');
  }
  carregarTransacoes();
};

function renderizarTabelaOuAgrupado() {
  const rows = extTxAtual || [];
  const modo = document.getElementById('ext-agrupar')?.value || '';
  const table = document.getElementById('ext-table');
  const tbody = document.getElementById('ext-tbody');
  const agrupado = document.getElementById('ext-agrupado');
  const empty = document.getElementById('ext-empty');
  const thSaldo = document.getElementById('th-saldo-apos');

  if (!rows.length) {
    if (table) table.style.display = 'none';
    if (agrupado) agrupado.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  if (!modo) {
    if (agrupado) { agrupado.innerHTML = ''; agrupado.style.display = 'none'; }
    if (table) table.style.display = 'table';

    const mostraSaldo = extFiltros.conta && extFiltros.conta !== 'todas';
    if (thSaldo) thSaldo.textContent = mostraSaldo ? 'Saldo Após' : '—';

    if (tbody) {
      tbody.innerHTML = rows.map(t => {
        const ehIgnorado = t.natureza === 'ignorado';
        const ehNeutro = ['transferencia', 'transferencia-propria', 'ignorado'].includes(t.natureza);
        const corValor = ehIgnorado ? 'var(--muted)' : (ehNeutro ? 'var(--muted)' : (t.natureza === 'gasto' ? 'var(--red)' : (t.valor > 0 ? 'var(--green)' : 'var(--txt)')));
        const sinal = t.valor > 0 ? '+' : '';
        const saldoAposTexto = (mostraSaldo && t.saldo_apos !== undefined && t.saldo_apos !== null)
          ? `<span class="mono muted" style="font-size:12px;">${fmt(t.saldo_apos)}</span>`
          : '<span class="muted" style="font-size:11px;">—</span>';

        const catHtml = t.categoria
          ? `<span class="tag" style="cursor:pointer;" onclick="filtrarPorCategoria(this.dataset.cat)" data-cat="${t.categoria}" title="Filtrar por ${t.categoria}">${t.categoria}</span>`
          : `<span class="tag" style="background:rgba(255,180,84,.15); color:var(--amber); cursor:pointer; font-size:11px;" onclick="abrirEdicaoTx(${t.id})" title="Clique para categorizar">⚠️ Sem categoria</span>`;

        const obsHtml = t.observacao ? ` <span class="muted" title="${t.observacao}" style="cursor:help;">${ico('note')}</span>` : '';
        const parcelaHtml = t.parcela ? ` <span class="tag" style="font-size:10.5px; padding:1px 5px; color:var(--cyan); background:rgba(0,214,143,.1);">${t.parcela}</span>` : '';

        const badgeOculta = ehIgnorado
          ? `<span class="badge-oculta-pill" title="Transação oculta — desconsiderada nos totais de receitas e despesas">👁️ Oculta</span>`
          : '';

        let natHtml;
        if (ehIgnorado) {
          natHtml = `<span class="rec-badge-oculta" title="Transação desconsiderada das finanças — não afeta saldo de despesas nem receitas">👁️ Ocultada</span>`;
        } else if (ehNeutro) {
          natHtml = `<span class="rec-badge-neutro" title="Movimentação neutra — desconsiderada nos totais de receitas e despesas">${NAT_ROTULO[t.natureza] || t.natureza}</span>`;
        } else {
          natHtml = `<span class="muted" style="font-size:11.5px;">${NAT_ROTULO[t.natureza] || t.natureza}</span>`;
        }

        const classeLinha = `ext-row-hover ${ehNeutro ? 'ext-row-neutra' : ''} ${ehIgnorado ? 'ext-row-oculta' : ''}`;
        const classeValor = `mono ${ehIgnorado ? 'valor-oculto' : ''}`;
        const titleLinha = ehIgnorado
          ? 'Transação oculta/desconsiderada das finanças. Duplo-clique para editar'
          : (ehNeutro ? 'Movimentação neutra (transferência/pagamento de fatura). Duplo-clique para editar' : 'Duplo-clique para editar');

        return `
          <tr class="${classeLinha}" style="cursor:pointer;" ondblclick="abrirEdicaoTx(${t.id})" title="${titleLinha}">
            <td class="muted mono" style="font-size:12px;">${t.data}</td>
            <td>
              ${badgeOculta}<span style="font-weight:600; color:${ehNeutro ? 'var(--muted)' : 'var(--txt)'};">${t.descricao}</span>
              ${parcelaHtml}${obsHtml}
            </td>
            <td><span class="tag muted" style="font-size:11px;">${nomeFonte(t.fonte)}</span></td>
            <td>${catHtml}</td>
            <td>${natHtml}</td>
            <td class="${classeValor}" style="text-align:right; font-weight:600; color:${corValor};" title="${ehIgnorado ? 'Desconsiderada dos cálculos financeiros' : ''}">${sinal}${fmt(t.valor)}</td>
            <td class="mono" style="text-align:right;">${saldoAposTexto}</td>
            <td style="text-align:center;">
              <button class="ghost ext-btn-edit" onclick="abrirEdicaoTx(${t.id})" title="Editar transação">${ico('note')}</button>
            </td>
          </tr>`;
      }).join('');
    }
  } else {
    if (table) table.style.display = 'none';
    if (agrupado) {
      agrupado.style.display = 'block';
      const grupos = {};
      for (const t of rows) {
        let chave;
        if (modo === 'dia') {
          chave = t.data;
        } else if (modo === 'categoria') {
          chave = t.categoria || '⚠️ Sem categoria';
        } else {
          chave = (t.descricao || '').replace(/^[A-Z]{2}\s+/, '').split(/\s+/).slice(0, 3).join(' ').toUpperCase() || 'OUTROS';
        }
        if (!grupos[chave]) grupos[chave] = { chave, n: 0, tot: 0, gastos: 0, entradas: 0, txs: [] };
        grupos[chave].n++;
        // transferência entre contas, pagamento de fatura e oculta não são gasto nem entrada: ficam fora do total
        const neutra = ['transferencia', 'transferencia-propria', 'ignorado'].includes(t.natureza);
        if (!neutra) grupos[chave].tot += t.valor;
        if (t.valor < 0 && t.natureza === 'gasto') grupos[chave].gastos += Math.abs(t.valor);
        if (t.valor > 0 && !neutra) grupos[chave].entradas += t.valor;
        grupos[chave].txs.push(t);
      }

      // por dia: ordem de data (mais recente primeiro); categoria e estabelecimento: maior gasto primeiro
      const ordenado = Object.values(grupos).sort(modo === 'dia'
        ? (a, b) => b.chave.localeCompare(a.chave)
        : (a, b) => b.gastos - a.gastos || Math.abs(b.tot) - Math.abs(a.tot));
      const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
      const rotulo = g => modo === 'dia'
        ? `${SEMANA[new Date(g.chave + 'T12:00:00').getDay()]}, ${g.chave.slice(8, 10)}/${g.chave.slice(5, 7)}`
        : g.chave;
      agrupado.innerHTML = ordenado.map(g => `
        <div style="background:var(--panel2); border-radius:8px; margin-bottom:10px; border:1px solid var(--line); overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--line);">
            <div>
              <b style="font-size:14px; color:var(--txt);">${rotulo(g)}</b>
              <span class="muted" style="font-size:12px; margin-left:8px;">(${g.n} transaç${g.n > 1 ? 'ões' : 'ão'})</span>
            </div>
            <div style="display:flex; gap:14px; align-items:center;">
              ${g.gastos ? `<span style="font-size:12.5px; color:var(--red);">gastos ${fmt(g.gastos)}</span>` : ''}
              ${g.entradas ? `<span style="font-size:12.5px; color:var(--green);">entradas +${fmt(g.entradas)}</span>` : ''}
              <span class="mono" style="font-size:14px; font-weight:700; color:${g.tot >= 0 ? 'var(--green)' : 'var(--txt)'};">${g.tot > 0 ? '+' : ''}${fmt(g.tot)}</span>
            </div>
          </div>
          <div style="padding:6px 14px;">
            ${g.txs.map(t => {
              const ehIgnorado = t.natureza === 'ignorado';
              const ehNeutro = ['transferencia', 'transferencia-propria', 'ignorado'].includes(t.natureza);
              const corVal = ehNeutro ? 'var(--muted)' : (t.valor < 0 ? 'var(--red)' : 'var(--green)');
              return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:12.5px; ${ehNeutro ? 'opacity:0.75;' : ''}">
                <span class="muted mono" style="width:75px;">${t.data.slice(5)}</span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 8px;">
                  ${ehIgnorado ? '<span class="badge-oculta-pill">👁️ Oculta</span>' : ''}
                  ${t.descricao}
                  ${t.parcela ? `<span class="tag" style="font-size:10px; padding:0 4px;">${t.parcela}</span>` : ''}
                </span>
                <span class="tag muted" style="font-size:10px; margin-right:8px;">${nomeFonte(t.fonte)}</span>
                <span class="mono ${ehIgnorado ? 'valor-oculto' : ''}" style="width:90px; text-align:right; color:${corVal};" title="${ehIgnorado ? 'Desconsiderada dos cálculos' : ''}">${t.valor > 0 ? '+' : ''}${fmt(t.valor)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`).join('');
    }
  }
}

window.abrirEdicaoTx = async function (id) {
  const t = (extTxAtual || []).find(x => x.id === id);
  if (!t) return;
  const dlg = document.getElementById('dlg-edicao-tx');
  if (!dlg) return;

  const ehIgnorado = t.natureza === 'ignorado';
  const badgeModal = ehIgnorado
    ? ` <span class="badge-oculta-pill" style="margin-left:6px; font-size:11px;">👁️ Ocultada das Finanças</span>`
    : '';
  const infoOculta = ehIgnorado
    ? `<div style="margin-top:6px; font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:6px;"><span>🛡️</span><span>Esta transação está desconsiderada das finanças e não afeta totais de despesas ou receitas.</span></div>`
    : '';

  document.getElementById('ed-resumo').innerHTML =
    `<b>${t.descricao}</b>${badgeModal}<br><span class="muted">${t.data} · ${fmt(t.valor)} · ${nomeFonte(t.fonte)}${t.parcela ? ' · parcela ' + t.parcela : ''}</span>${infoOculta}`;

  const cats = await api('/api/categorias').catch(() => []);
  const selCat = document.getElementById('ed-categoria');
  if (selCat) {
    selCat.innerHTML = '<option value="">— sem categoria —</option>' +
      cats.map(c => `<option value="${c.nome}" ${c.nome === t.categoria ? 'selected' : ''}>${c.nome}</option>`).join('');
  }

  const selNat = document.getElementById('ed-natureza');
  if (selNat) {
    selNat.value = t.natureza || 'gasto';
    const avisoEl = document.getElementById('ed-aviso-natureza');
    if (avisoEl) {
      avisoEl.style.display = (t.natureza !== 'gasto' && t.natureza !== 'rendimento') ? 'flex' : 'none';
      selNat.onchange = () => {
        avisoEl.style.display = (selNat.value !== t.natureza && (selNat.value === 'gasto' || selNat.value === 'transferencia')) ? 'flex' : 'none';
      };
    }
  }

  const obsIn = document.querySelector('#form-edicao-tx [name=observacao]');
  if (obsIn) obsIn.value = t.observacao || '';

  const chkRegra = document.getElementById('ed-salvar-regra');
  if (chkRegra) chkRegra.checked = true;

  const btnSalvar = document.getElementById('ed-salvar');
  if (btnSalvar) {
    btnSalvar.onclick = async () => {
      const form = document.getElementById('form-edicao-tx');
      const novaNatureza = form.natureza.value;
      const novaCat = form.categoria.value || null;
      const novaObs = form.observacao.value || null;
      const salvarRegra = document.getElementById('ed-salvar-regra')?.checked ?? true;

      const aviso = (t.natureza === 'transferencia' && novaNatureza === 'gasto') || (t.natureza === 'gasto' && novaNatureza !== 'gasto');
      if (aviso && !confirm('Mudar a natureza afeta os totais de gastos e a projeção. Confirma?')) return;

      btnSalvar.disabled = true;
      try {
        const resp = await api('/api/transacoes/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoria: novaCat,
            natureza: novaNatureza,
            observacao: novaObs,
            salvar_regra: salvarRegra
          })
        });
        dlg.close();
        if (resp && resp.retro_aplicadas > 1) {
          toast(`Transação salva e ${resp.retro_aplicadas} transações iguais categorizadas!`);
        } else if (salvarRegra) {
          toast('Transação salva e regra aprendida!');
        } else {
          toast('Transação atualizada');
        }
        await carregarTransacoes();
      } catch (err) {
        toast('Erro ao atualizar transação: ' + err.message);
      } finally {
        btnSalvar.disabled = false;
      }
    };
  }

  dlg.showModal();
};

function exportarExtratoCSV() {
  const rows = extTxAtual || [];
  if (!rows.length) { toast('Nada para exportar'); return; }
  const header = 'data;descricao;valor;fonte;natureza;categoria;parcela;observacao\n';
  const csv = header + rows.map(t =>
    [
      t.data,
      `"${(t.descricao || '').replace(/"/g, '""')}"`,
      t.valor,
      t.fonte || '',
      t.natureza || '',
      t.categoria || '',
      t.parcela || '',
      `"${(t.observacao || '').replace(/"/g, '""')}"`
    ].join(';')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `extrato-finflow-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast('Extrato exportado para CSV com sucesso!');
}

window.verNoExtrato = function(termo) {
  const btn = document.querySelector('.nav-item[data-view="extratos"]');
  if (btn) btn.click();
  extFiltros = {
    conta: 'todas',
    fonte: '',
    natureza: '',
    categoria: '',
    busca: termo || '',
    sem_categoria: '0',
    apenas_parceladas: '0',
    min_valor: ''
  };
  const inB = document.getElementById('ext-busca');
  if (inB) inB.value = termo || '';
  carregarTransacoes();
};

// ---------- ANÁLISE ----------
async function loadAnalise() {
  marcarSubAtiva();
  SUB_LOADERS[subAtiva]();
}

// ---------- PROJEÇÃO ----------
let chartProj = null;
let chartAlivio = null;
async function loadProjecao() {
  const [p, dividas] = await Promise.all([api('/api/projecao'), api('/api/dividas')]);

  // ===== V2: comprometido + sobra livre (série dos 12 meses futuros) =====
  const serieV2 = p.serie_v2 || [];
  const m1 = serieV2[0] || { mes: '10-2026', comprometido: 0, sobra_livre: 0, pct_comprometido: 0, fixos: 0, parcelas_cartao: 0, parcelas_externas: 0 };
  const m12 = serieV2[serieV2.length - 1] || m1;

  const pctComprometidoM1 = m1.pct_comprometido || Math.round(m1.comprometido / p.renda_projetada * 100);
  const pctComprometidoM12 = m12.pct_comprometido || Math.round(m12.comprometido / p.renda_projetada * 100);

  const totalPassivo = dividas.total_passivo_restante || p.dividas_meta?.total_passivo_restante || 0;
  const quitacaoTotal = dividas.data_quitacao_total || p.dividas_meta?.data_quitacao_total || '—';
  const totalAtivas = dividas.total_dividas_ativas || (dividas.emAndamento || []).length;

  // Renderiza Hero com inteligência de alívio bola de neve
  const heroEl = document.getElementById('proj-hero');
  if (heroEl) {
    // alívio em 3/6/12 meses: quanto as parcelas do mês que vem (o pico de hoje) caem até aquele mês
    const tl = dividas.linha_do_tempo || [];
    const caixasAlivio = tl.length ? [3, 6, 12].map(n => {
      const l = tl[n - 1] || { mes: tl[tl.length - 1].mes, total: 0 };
      const s2 = serieV2.find(x => x.mes === `${l.mes.slice(5)}-${l.mes.slice(0, 4)}`);
      return `
        <div class="ph-box">
          <span class="lbl">PARCELAS EM ${mesCurto(l.mes).toUpperCase()}</span>
          <span class="val mono up">−${fmt(Math.max(0, tl[0].total - l.total))}/mês</span>
          <span class="sub muted">pesam ${fmt(l.total)} (eram ${fmt(tl[0].total)} em ${mesCurto(tl[0].mes)})${s2 ? ` · sobra livre ${fmt(s2.sobra_livre)}` : ''}</span>
        </div>`;
    }).join('') : '';
    heroEl.innerHTML = `
      <div class="ph-main">
        <span class="lbl">COMPROMETIDO ATÉ HOJE · ${mesCurto(m1.mes).toUpperCase()}</span>
        <span class="num ${m1.sobra_livre > 0 ? 'up' : 'down'}">${fmt(m1.comprometido)}<small> (${pctComprometidoM1}% da renda)</small></span>
        <div class="ph-barra"><i style="width:${Math.min(100, Math.max(0, pctComprometidoM1))}%"></i></div>
        <span class="sub muted">
          Faturas: ${fmt(m1.parcelas_cartao || 0)} · Fixos: ${fmt(m1.fixos || 0)} · Parcelados: ${fmt(m1.parcelas_externas || 0)}${m1.dia_a_dia ? ' · Dia a dia já gasto: ' + fmt(m1.dia_a_dia) : ''} · Renda: ${fmt(m1.renda)} · Sobra livre: <b class="${m1.sobra_livre < 0 ? 'down' : 'up'}">${fmt(m1.sobra_livre)}</b>
        </span>
        <div class="ph-trajectory">
          <span>Só o que já foi gasto ou está agendado: o comprometido até hoje cai de <b>${pctComprometidoM1}%</b> (${mesCurto(m1.mes)}) para <b>${pctComprometidoM12}%</b> (${mesCurto(m12.mes)}) conforme as parcelas terminam. Compras novas entram quando acontecerem.</span>
          <span style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;"><button class="ghost" id="proj-btn-auvp">🔄 Atualizar da AUVP</button><button class="ghost" onclick="abrirModalFaturasAbertas()">💳 Conferir faturas com o app</button></span>
        </div>
      </div>
      <div class="ph-side">
        <div class="ph-box">
          <span class="lbl">PASSIVO TOTAL A QUITAR</span>
          <span class="val mono down">${fmt(totalPassivo)}</span>
          <span class="sub muted">${totalAtivas} contratos parcelados · última parcela em ${quitacaoTotal}</span>
        </div>
        ${caixasAlivio}
      </div>`;
  }

  // ===== SIMULADOR "POSSO COMPRAR?" =====
  const simInicioSel = document.getElementById('sim-inicio');
  if (simInicioSel && serieV2.length) {
    const selAtual = simInicioSel.value;
    simInicioSel.innerHTML = serieV2.map(s =>
      `<option value="${s.mes}" ${s.mes === selAtual ? 'selected' : ''}>${mesCurto(s.mes)}</option>`
    ).join('');
    if (!selAtual && serieV2[0]) simInicioSel.value = serieV2[0].mes;
  }

  function executarSimulacao() {
    const val = parseFloat(document.getElementById('sim-valor')?.value) || 0;
    const n = parseInt(document.getElementById('sim-parcelas')?.value) || 1;
    const iniMes = document.getElementById('sim-inicio')?.value || (serieV2[0]?.mes || '');
    const resBox = document.getElementById('sim-resultado');
    if (!resBox) return;

    if (val <= 0) {
      resBox.style.display = 'none';
      return;
    }

    const pMensal = val / n;
    const idxInicio = Math.max(0, serieV2.findIndex(s => s.mes === iniMes));

    const mesesImpactados = [];
    for (let i = 0; i < serieV2.length; i++) {
      const s = serieV2[i];
      const noPeriodo = (i >= idxInicio && i < idxInicio + n);
      const extra = noPeriodo ? pMensal : 0;
      const novoComprometido = s.comprometido + extra;
      const novaSobra = s.renda - novoComprometido;
      const novoPct = Math.round((novoComprometido / s.renda) * 100);
      if (noPeriodo) {
        mesesImpactados.push({ mes: s.mes, novoComprometido, novaSobra, novoPct, extra });
      }
    }

    if (!mesesImpactados.length) {
      resBox.style.display = 'none';
      return;
    }

    let piorMes = mesesImpactados[0];
    for (const m of mesesImpactados) {
      if (m.novaSobra < piorMes.novaSobra) piorMes = m;
    }

    const piorSobra = piorMes.novaSobra;
    const maiorPct = piorMes.novoPct;

    let status = 'safe';
    let titulo = '🟢 COMPRA SEGURA';
    let explicacao = `Você continuará com excelente folga financeira. Mesmo pagando ${n}x de ${fmt(pMensal)}, sua menor sobra livre será de <b>${fmt(piorSobra)}</b> em ${mesCurto(piorMes.mes)} (${maiorPct}% comprometido).`;

    if (piorSobra < 1000 || maiorPct > 85) {
      status = 'danger';
      titulo = '🔴 ALTO RISCO / DESACONSELHADO';
      explicacao = `Essa compra comprometerá <b>${maiorPct}%</b> da sua renda em ${mesCurto(piorMes.mes)}, restando apenas <b>${fmt(piorSobra)}</b> de sobra livre. Alto risco de aperto financeiro!`;
    } else if (piorSobra < 3000 || maiorPct > 70) {
      status = 'warn';
      titulo = '🟡 COMPRA MODERADA / ATENÇÃO';
      explicacao = `Cabe no orçamento, mas aperta o fluxo de caixa: sua folga livre cairá para <b>${fmt(piorSobra)}</b> em ${mesCurto(piorMes.mes)} (${maiorPct}% comprometido). Evite acumular outros parcelamentos.`;
    }

    resBox.className = 'sim-res-box ' + status;
    resBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:700;">${titulo}</div>
        <div class="mono" style="font-size:13.5px;">
          Parcela: <b>${fmt(pMensal)}</b>/mês (${n}x) · Total: <b>${fmt(val)}</b>
        </div>
      </div>
      <div style="font-size:13px; line-height:1.5; margin-bottom:12px;">${explicacao}</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px;">
        ${mesesImpactados.slice(0, 6).map(m => `
          <div style="background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:12px;">
            <div class="muted" style="text-transform:uppercase; font-size:10px; font-weight:700;">${mesCurto(m.mes)}</div>
            <div class="mono ${m.novaSobra > 0 ? 'up' : 'down'}" style="font-weight:700; margin:2px 0;">${fmt(m.novaSobra)} sobra</div>
            <div class="muted" style="font-size:10.5px;">${m.novoPct}% comprometido</div>
          </div>
        `).join('')}
      </div>`;
    resBox.style.display = 'block';
  }

  const btnCalc = document.getElementById('sim-btn-calcular');
  if (btnCalc) btnCalc.onclick = executarSimulacao;
  const btnLimpar = document.getElementById('sim-btn-limpar');
  if (btnLimpar) {
    btnLimpar.onclick = () => {
      document.getElementById('sim-valor').value = '';
      document.getElementById('sim-resultado').style.display = 'none';
    };
  }
  const inVal = document.getElementById('sim-valor');
  if (inVal) inVal.oninput = () => { if (inVal.value) executarSimulacao(); else document.getElementById('sim-resultado').style.display = 'none'; };
  const inParc = document.getElementById('sim-parcelas');
  if (inParc) inParc.onchange = () => { if (inVal?.value) executarSimulacao(); };
  if (simInicioSel) simInicioSel.onchange = () => { if (inVal?.value) executarSimulacao(); };

  // camadas — regra de 15/10/2026: só comprometimento real (gasto ou agendado), nenhuma média ou previsão
  const fatM1 = (m1.faturas || []).map(f => `${f.cartao} ${fmt(f.total)}${f.status === 'fechada' ? ' (oficial)' : ' (até hoje)'}`).join(' · ');
  document.getElementById('proj-camadas').innerHTML = `
    <div class="camadas-row"><span class="dot" style="background:#c98500"></span><b>Faturas de cartão</b> ${fmt(m1.parcelas_cartao)}<span class="muted">— fechada = total oficial da AUVP; aberta = compras já lançadas + parcelas programadas (o mesmo valor do app do banco). ${fatM1}</span></div>
    <div class="camadas-row"><span class="dot" style="background:#3987e5"></span><b>Contas fixas</b> ${fmt(m1.fixos)}<span class="muted">— ${m1.origem_contas === 'contas do mês' ? 'contas do mês' : 'recorrências'}; conta de valor variável ainda não chegada entra com o último valor pago</span></div>
    <div class="camadas-row"><span class="dot" style="background:#d55181"></span><b>Parcelados</b> ${fmt(m1.parcelas_externas)}<span class="muted">— parcelamentos fora do cartão, calculados pela data da 1ª parcela</span></div>
    <div class="camadas-row"><span class="dot" style="background:#9085e9"></span><b>Dia a dia já gasto</b> ${fmt(m1.dia_a_dia || 0)}<span class="muted">— só no mês atual: PIX e débito que saíram sem pagar nenhuma conta</span></div>
    <div class="camadas-row"><span class="dot" style="background:#00d68f"></span><b>Renda do mês</b> ${fmt(m1.renda)}<span class="muted">— por competência: renda que cai no fim do mês pode contar para o mês seguinte (configurável em cada renda); o que já caiu vale o valor real</span></div>
    <div class="camadas-row"><span class="dot" style="background:#00d68f"></span><b>Sobra livre</b> ${fmt(m1.sobra_livre)}<span class="muted">— renda − comprometido; nada aqui é previsão</span></div>`;
  const _btnAuvp = document.getElementById('proj-btn-auvp');
  if (_btnAuvp) _btnAuvp.onclick = async () => {
    _btnAuvp.disabled = true;
    _btnAuvp.textContent = 'Atualizando…';
    try {
      const r = await api('/api/auvp/sync', { method: 'POST' });
      toast(r.nucleo && r.nucleo.erro ? 'AUVP: ' + r.nucleo.erro : 'Dados da AUVP atualizados');
    } catch (e) { toast('Erro ao atualizar: ' + e.message); }
    loadProjecao();
  };

  const _ticker = document.getElementById('proj-ticker');
  if (_ticker) _ticker.innerHTML = '';

  // legenda HTML — cores validadas no fundo #10161f; "Parcelados" usa a mesma cor de "Fora do cartão" no Alívio
  const COR_PROJ = { fixos: '#3987e5', faturas: '#c98500', parcelados: '#d55181', dia: '#9085e9', sobra: '#00d68f' };
  const temDiaADia = serieV2.some(s => s.dia_a_dia > 0);
  const estourou = serieV2.some(s => s.sobra_livre < 0);
  const LEGENDA = [
    { cor: COR_PROJ.fixos, label: 'Contas fixas' },
    { cor: COR_PROJ.faturas, label: 'Faturas de cartão' },
    { cor: COR_PROJ.parcelados, label: 'Parcelados' },
    ...(temDiaADia ? [{ cor: COR_PROJ.dia, label: 'Dia a dia já gasto' }] : []),
    { cor: 'rgba(0,214,143,.10)', borda: COR_PROJ.sobra, label: 'Sobra livre (o topo é a renda do mês)' }
  ];
  document.getElementById('proj-legend').innerHTML = LEGENDA.map(l =>
    `<span class="leg-item"><i style="background:${l.cor};${l.borda ? ` box-shadow: inset 0 2px 0 ${l.borda};` : ''}"></i>${l.label}</span>`).join('');

  const segmento = (label, data, cor) => ({
    label, data, backgroundColor: cor, borderColor: '#10161f', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 48, stack: 'a'
  });
  if (chartProj) chartProj.destroy();
  chartProj = new Chart(document.getElementById('ch-proj'), {
    type: 'bar',
    data: {
      labels: serieV2.map((s, i) => (i === 0 ? [mesCurto(s.mes), 'atual'] : mesCurto(s.mes))),
      datasets: [
        segmento('Contas fixas', serieV2.map(s => s.fixos), COR_PROJ.fixos),
        segmento('Faturas de cartão', serieV2.map(s => s.parcelas_cartao), COR_PROJ.faturas),
        segmento('Parcelados', serieV2.map(s => s.parcelas_externas), COR_PROJ.parcelados),
        ...(temDiaADia ? [segmento('Dia a dia já gasto', serieV2.map(s => s.dia_a_dia || 0), COR_PROJ.dia)] : []),
        { label: 'Sobra livre', data: serieV2.map(s => Math.max(0, s.sobra_livre)), backgroundColor: 'rgba(0,214,143,.10)',
          borderColor: COR_PROJ.sobra, borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 48, stack: 'a' },
        // a linha da renda só aparece se algum mês passar da renda (senão o topo da sobra já é a renda)
        ...(estourou ? [{ label: 'Renda', type: 'line', data: serieV2.map(s => s.renda), borderColor: COR_PROJ.sobra, borderWidth: 2, stepped: 'middle', pointRadius: 0, order: 0 }] : [])
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      devicePixelRatio: 2,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      onHover: (evt, elems) => { evt.native.target.style.cursor = elems.length ? 'pointer' : 'default'; },
      onClick: (evt, elems) => {
        if (!elems.length) return;
        const s = serieV2[elems[0].index];
        if (s) abrirDrillParcelas(s.mes);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: projTooltipHTML,
          callbacks: {
            title: items => { const i = items[0]?.dataIndex ?? 0; return mesCurto(serieV2[i]?.mes || '') + (i === 0 ? ' · mês atual' : ''); },
            label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
            footer: items => {
              const s = serieV2[items[0]?.dataIndex];
              if (!s) return '';
              return `Comprometido ${fmt(s.comprometido)} (${s.pct_comprometido}% da renda) · Renda ${fmt(s.renda)} · Sobra livre ${fmt(s.sobra_livre)}`;
            }
          }
        }
      },
      scales: {
        y: { stacked: true, grid: { color: 'rgba(255,255,255,.05)' }, border: { display: false },
          ticks: { color: '#a8bcd2', font: { size: 13, weight: '600' }, callback: v => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + ' mil' : v) } },
        x: { stacked: true, grid: { display: false },
          ticks: { color: c => (c.index === 0 ? '#dbe4ee' : '#a8bcd2'), font: c => ({ size: 13, weight: c.index === 0 ? '700' : '600' }), maxRotation: 0, autoSkip: true } }
      }
    }
  });

  // ===== ALÍVIO DAS PARCELAS (motor.dividas → linha_do_tempo) =====
  // só o que já foi comprado (regra de 15/10/2026); "livre a partir de" = mês seguinte à última parcela
  const dividasLista = dividas.emAndamento || [];
  const linha = (dividas.linha_do_tempo || []).filter(l => l.total > 0);
  const CORES_FONTES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#8a63d2']; // validada no fundo #10161f
  // ordem dos cartões pelo nome (estável entre meses), "Fora do cartão" por último
  const ORDEM_FONTES = [...new Set((dividas.emAndamento || []).map(d => d.fonte).filter(f => f !== 'Fora do cartão'))].sort((x, y) => x.localeCompare(y, 'pt-BR')).concat('Fora do cartão');
  const idxFonte = f => { const i = ORDEM_FONTES.indexOf(f); return i < 0 ? ORDEM_FONTES.length : i; };
  const corFonte = f => CORES_FONTES[idxFonte(f)] || '#64788f'; // a cor segue o cartão, nunca a posição
  const nomeFonte = f => String(f || '').replace(/\s*\(.*\)$/, '');
  const fontes = [...new Set(dividasLista.map(d => d.fonte))].sort((a, b) => idxFonte(a) - idxFonte(b));
  const linhaDe = ym => (dividas.linha_do_tempo || []).find(l => l.mes === ym);

  // leitura em texto: o que muda e quando
  const leituraEl = document.getElementById('alivio-leitura');
  if (leituraEl) {
    if (!linha.length) {
      leituraEl.innerHTML = 'Nenhuma parcela em andamento: tirando as contas fixas, o que entra fica livre.';
    } else {
      const agora = linha[0];
      const rendaAgora = (serieV2.find(s => s.mes === `${agora.mes.slice(5)}-${agora.mes.slice(0, 4)}`) || {}).renda;
      const metade = linha.find(l => l.total <= agora.total / 2);
      const grandes = [...dividasLista].sort((a, b) => b.total_restante - a.total_restante);
      let acum = 0; const pesados = [];
      for (const d of grandes) { if (acum >= totalPassivo / 2) break; pesados.push(d); acum += d.total_restante; }
      const frases = [
        `Em <b>${mesCurto(agora.mes)}</b> as parcelas pesam <b>${fmt(agora.total)}</b>${rendaAgora ? ` (${Math.round(agora.total / rendaAgora * 100)}% da renda)` : ''}, em ${agora.contratos} contratos.`
      ];
      if (metade) frases.push(`Em <b>${mesCurto(metade.mes)}</b> já caem para <b>${fmt(metade.total)}</b>: são <b class="up">${fmt(agora.total - metade.total)}/mês</b> a mais livres.`);
      if (pesados.length && pesados.length <= 3) frases.push(`${pesados.length === 1 ? 'Um contrato concentra' : `${pesados.length} contratos concentram`} <b>${Math.round(acum / totalPassivo * 100)}%</b> dos ${fmt(totalPassivo)} que faltam: ${pesados.map(d => `${d.descricao} (${fmt(d.valor)}/mês até ${mesCurto(d.ultimo_ym)})`).join(' e ')}.`);
      if (dividas.livre_total_em) frases.push(`Sem compra parcelada nova, a partir de <b>${mesCurto(dividas.livre_total_em)}</b> nenhuma parcela pesa.`);
      leituraEl.innerHTML = frases.join(' ');
    }
  }

  // gráfico: barras empilhadas por cartão, um mês por barra
  const legEl = document.getElementById('alivio-legenda');
  if (legEl) legEl.innerHTML = fontes.map(f => `<span class="leg-item"><i style="background:${corFonte(f)}"></i>${nomeFonte(f)}</span>`).join('');
  if (chartAlivio) chartAlivio.destroy();
  chartAlivio = null;
  const cvAlivio = document.getElementById('ch-alivio');
  if (cvAlivio && linha.length) {
    chartAlivio = new Chart(cvAlivio, {
      type: 'bar',
      data: {
        labels: linha.map(l => mesCurto(l.mes)),
        datasets: fontes.map(f => ({
          label: nomeFonte(f), data: linha.map(l => l.por_fonte[f] || 0), backgroundColor: corFonte(f),
          borderColor: '#10161f', borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 34, stack: 'p'
        }))
      },
      options: {
        maintainAspectRatio: false, responsive: true, animation: false, devicePixelRatio: 2,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            titleFont: { size: 13, weight: '700' }, bodyFont: { size: 12.5, weight: '500' }, footerFont: { size: 12, weight: '500' },
            backgroundColor: '#141c27', borderColor: '#223042', borderWidth: 1, titleColor: '#dbe4ee', bodyColor: '#dbe4ee', footerColor: '#a8bcd2',
            padding: 10, filter: i => i.parsed.y > 0,
            callbacks: {
              label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}`,
              footer: items => {
                const l = linha[items[0]?.dataIndex];
                if (!l) return '';
                const out = [`Total: ${fmt(l.total)} · ${l.contratos} contratos`];
                if (l.liberado > 0) {
                  out.push(`Saíram neste mês: −${fmt(l.liberado)}/mês`, ...l.acabaram.slice(0, 6).map(a => '  · ' + a));
                  if (l.acabaram.length > 6) out.push(`  · e mais ${l.acabaram.length - 6}`);
                }
                return out;
              }
            }
          }
        },
        scales: {
          y: { stacked: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#a8bcd2', font: { size: 13, weight: '600' }, callback: v => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + ' mil' : v) } },
          x: { stacked: true, grid: { display: false }, ticks: { color: '#a8bcd2', font: { size: 13, weight: '600' }, autoSkip: true, maxRotation: 0 } }
        }
      }
    });
  }

  // tabela agrupada pelo mês em que o dinheiro fica livre
  let filtroAtual = 'todas';
  const chipsContainer = document.getElementById('proj-filtros-chips');
  if (chipsContainer) {
    chipsContainer.innerHTML = [['todas', 'Todas'], ...fontes.map(f => [f, nomeFonte(f)]), ['3m', 'Saem em até 3 meses']]
      .map(([v, t], i) => `<span class="fchip${i === 0 ? ' on' : ''}" data-filtro="${v}">${t}</span>`).join('');
    chipsContainer.querySelectorAll('.fchip').forEach(chip => {
      chip.onclick = () => {
        chipsContainer.querySelectorAll('.fchip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        filtroAtual = chip.dataset.filtro;
        renderTabelaDividas();
      };
    });
  }

  function renderTabelaDividas() {
    const busca = (document.getElementById('proj-dividas-busca')?.value || '').trim().toLowerCase();
    const semFiltro = filtroAtual === 'todas' && !busca;
    const filtradas = dividasLista.filter(d => {
      if (busca && !d.descricao.toLowerCase().includes(busca)) return false;
      if (filtroAtual === '3m') return d.restam <= 3;
      if (filtroAtual !== 'todas' && d.fonte !== filtroAtual) return false;
      return true;
    });
    const totFiltrado = filtradas.reduce((s, d) => s + d.total_restante, 0);
    const resumoEl = document.getElementById('proj-dividas-resumo');
    if (resumoEl) resumoEl.textContent = `${filtradas.length} de ${dividasLista.length} contratos · ${fmt(totFiltrado)} a pagar`;

    const tbody = document.getElementById('proj-dividas');
    if (!tbody) return;
    if (!filtradas.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted);">Nenhum contrato com esses filtros.</td></tr>';
      return;
    }
    const grupos = new Map();
    for (const d of filtradas) { if (!grupos.has(d.livre_a_partir)) grupos.set(d.livre_a_partir, []); grupos.get(d.livre_a_partir).push(d); }
    tbody.innerHTML = [...grupos.entries()].map(([ym, ds]) => {
      const livre = ds.reduce((s, d) => s + d.valor, 0);
      const l = linhaDe(ym);
      const depois = semFiltro && l ? ` · as parcelas caem para <b class="mono">${fmt(l.total)}</b>` : '';
      return `
      <tr class="alivio-grupo"><td colspan="7">A partir de <b>${mesCurto(ym)}</b> · <b class="up mono">+${fmt(livre)}/mês</b> livres · ${ds.length} ${ds.length === 1 ? 'contrato sai' : 'contratos saem'}${depois}</td></tr>
      ${ds.map(d => `
      <tr>
        <td><b>${d.descricao.slice(0, 32)}</b></td>
        <td><span class="alivio-onde"><i style="background:${corFonte(d.fonte)}"></i>${nomeFonte(d.fonte)}</span></td>
        <td class="mono">${d.restam}x</td>
        <td class="mono">${fmt(d.valor)}</td>
        <td class="mono" style="font-weight:700;">${fmt(d.total_restante)}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progress" style="flex:1; min-width:60px;"><i style="width:${d.pct}%"></i></div>
            <span class="muted mono" style="font-size:11px;">${d.progresso} pagas</span>
          </div>
        </td>
        <td>${mesCurto(d.ultimo_ym)}</td>
      </tr>`).join('')}`;
    }).join('');
  }

  const buscaInp = document.getElementById('proj-dividas-busca');
  if (buscaInp) buscaInp.oninput = () => renderTabelaDividas();
  renderTabelaDividas();
}

// ---------- MÊS ----------
let _mesRows = [];

function renderTabelaMes() {
  const busca = (document.getElementById('mes-busca')?.value || '').trim().toLowerCase();
  const filtroStatus = document.getElementById('mes-filtro-status')?.value || 'todas';
  const hoje = new Date().toISOString().slice(0, 10);

  let filtradas = _mesRows.filter(l => {
    if (filtroStatus === 'abertas' && l.pago) return false;
    if (filtroStatus === 'pagas' && !l.pago) return false;
    if (filtroStatus === 'sem-cartao' && (l.categoria === 'Cartões' || l.tipo_gasto === 'fatura')) return false;
    if (filtroStatus === 'so-cartao' && l.categoria !== 'Cartões' && l.tipo_gasto !== 'fatura') return false;
    if (busca) {
      const matchDesc = (l.descricao || '').toLowerCase().includes(busca);
      const matchCat = (l.categoria || '').toLowerCase().includes(busca);
      const matchTx = (l.transacao_desc || '').toLowerCase().includes(busca);
      const matchObs = (l.observacao || '').toLowerCase().includes(busca);
      if (!matchDesc && !matchCat && !matchTx && !matchObs) return false;
    }
    return true;
  });

  const tb = document.querySelector('#tbl-mes tbody');
  if (!tb) return;

  if (filtradas.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);">Nenhum lançamento encontrado</td></tr>`;
    return;
  }

  tb.innerHTML = filtradas.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(l => {
    const st = l.pago ? 'pago' : (l.vencimento < hoje ? 'vencido' : 'aberto');
    const urgente = st === 'vencido' ? 'border-left:3px solid var(--red);' : (st === 'aberto' && l.vencimento <= addDays(hoje, 5) ? 'border-left:3px solid var(--amber);' : '');
    const isCartao = l.categoria === 'Cartões' || l.tipo_gasto === 'fatura';
    const badgeTipo = isCartao
      ? '<span class="tipo-badge tp-fatura" style="background:rgba(179,136,255,0.18); color:#b388ff; border:1px solid rgba(179,136,255,0.35);">cartão</span>'
      : (l.tipo_gasto === 'parcela'
        ? '<span class="tipo-badge tp-parcela">parcela</span>'
        : '<span class="tipo-badge tp-fixo">fixo</span>');
    // transação anexada (fonte da verdade do pagamento)
    const tx = l.pago
      ? (l.transacao_id && l.transacao_desc
        ? `<div class="tx-anexada" title="clique pra trocar a transação anexada" style="cursor:pointer" onclick="event.stopPropagation(); anexarPagamentoPago(${l.id})">↳ ${l.transacao_desc.slice(0, 34)} <span class="muted">${(l.transacao_data || '').slice(5)} · ${(l.transacao_fonte || '').replace('auvp-', 'auvp ')}</span> <span style="color:var(--blue); font-size:10px;">[trocar]</span></div>`
        : `<div class="tx-anexada sem" title="clique pra anexar a transação que pagou" style="cursor:pointer" onclick="event.stopPropagation(); anexarPagamentoPago(${l.id})">↳ <span class="muted">marcado pago sem extrato</span> <span style="color:var(--blue); font-size:10px;">[anexar]</span></div>`)
      : '';
    return `<tr style="${urgente}; cursor:pointer" ondblclick="editarLanc(${l.id})" title="Duplo clique para editar">
      <td><span class="badge ${st}" style="cursor:pointer; user-select:none;" onclick="event.stopPropagation(); togglePago(${l.id})" title="${l.pago ? 'Clique para desmarcar' : 'Clique para anexar pagamento'}">${st.toUpperCase()}</span></td>
      <td><div class="lanc-nome"><b>${l.descricao}</b> ${l.parcela ? `<span class="muted">(${l.parcela})</span>` : ''} ${badgeTipo}</div>${tx}</td>
      <td class="mono" style="font-weight:600">${fmt(l.valor)}</td>
      <td class="muted mono">${fmtD(l.vencimento)}</td>
      <td>${l.categoria ? `<span class="tag">${l.categoria}</span>` : '<span class="muted">—</span>'}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="ghost" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="event.stopPropagation(); editarLanc(${l.id})" title="Editar">${ico('note')}</button>
        <button class="ghost" style="padding:4px 8px; font-size:12px; color:var(--red);" onclick="event.stopPropagation(); delLanc(${l.id})" title="Excluir">${ico('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}

const _mesBusca = document.getElementById('mes-busca');
if (_mesBusca) _mesBusca.oninput = renderTabelaMes;
const _mesFiltro = document.getElementById('mes-filtro-status');
if (_mesFiltro) _mesFiltro.onchange = renderTabelaMes;

const _btnAutoConc = document.getElementById('btn-auto-conciliar-mes');
if (_btnAutoConc) _btnAutoConc.onclick = async () => {
  _btnAutoConc.disabled = true;
  _btnAutoConc.textContent = 'Conciliando…';
  try {
    const r = await api('/api/meses/auto-conciliar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: mesAtual }) });
    if (r.conciliados > 0) {
      toast(`Conciliação concluída: ${r.conciliados} contas vinculadas ao extrato!`);
    } else {
      toast('Nenhum novo pagamento não-conciliado encontrado no extrato');
    }
    loadMes();
  } catch (err) {
    toast('Erro na conciliação: ' + err.message);
  } finally {
    _btnAutoConc.disabled = false;
    _btnAutoConc.textContent = '⚡ Conciliar com extrato';
  }
};

async function loadMes() {
  const ref = mesAtual;
  let rows = await api('/api/lancamentos?mes=' + ref);
  _mesRows = rows;

  let total = 0, pago = 0, abertas = 0, nFixos = 0, nParcelas = 0, nFaturas = 0, sumFixos = 0, sumParcelas = 0, sumFaturas = 0;
  rows.forEach(l => {
    total += l.valor;
    if (l.pago) pago += l.valor; else abertas++;
    if (l.categoria === 'Cartões' || l.tipo_gasto === 'fatura') { nFaturas++; sumFaturas += l.valor; }
    else if (l.tipo_gasto === 'parcela') { nParcelas++; sumParcelas += l.valor; }
    else { nFixos++; sumFixos += l.valor; }
  });
  document.getElementById('mes-resumo').innerHTML =
    `${rows.length} contas · ${abertas} em aberto · ` +
    `<span style="color:var(--blue)">${nFixos} fixos · ${fmt(sumFixos)}</span> · ` +
    `<span style="color:#f28b5b">${nParcelas} parcelas · ${fmt(sumParcelas)}</span>` +
    (nFaturas ? ` · <span style="color:#b388ff">${nFaturas} faturas · ${fmt(sumFaturas)}</span>` : '') +
    ` · Total ${fmt(total)} · Aberto ${fmt(total - pago)}`;

  renderTabelaMes();
}
function addDays(dateStr, days) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

// dialog de edição de lançamento (novo ou existente)
window.editarLanc = async function (id) {
  const cats = await api('/api/categorias');
  const f = document.getElementById('form-lanc');
  document.getElementById('f-categoria').innerHTML = '<option value="">—</option>' + cats.map(c => `<option>${c.nome}</option>`).join('');
  f.reset();
  if (id) {
    const rows = await api('/api/lancamentos?mes=' + mesAtual);
    const l = rows.find(x => x.id === id);
    if (!l) return;
    document.getElementById('dlg-title').textContent = 'Editar: ' + l.descricao;
    f.descricao.value = l.descricao;
    f.valor.value = l.valor;
    f.vencimento.value = l.vencimento;
    f.categoria.value = l.categoria || '';
    f.parcela.value = l.parcela || '';
    f.observacao.value = l.observacao || '';
    f.pago.checked = !!l.pago;
    f.dataset.id = id;
  } else {
    document.getElementById('dlg-title').textContent = 'Novo lançamento';
    delete f.dataset.id;
    const [m, y] = mesAtual.split('-');
    document.querySelector('#form-lanc [name=vencimento]').value = `${y}-${m}-05`;
  }
  document.getElementById('dlg-lanc').showModal();
};
window.togglePago = async function (id) {
  const rows = await api('/api/lancamentos?mes=' + mesAtual);
  const l = rows.find(x => x.id === id);
  if (!l) return;
  // PAGANDO: abre dialog de anexar com opção de pular (não obrigatório)
  if (!l.pago) { dialogAnexarPagamento(l, loadMes, { podePular: true }); return; }
  // DESMARCANDO: volta a em aberto direto
  await api('/api/lancamentos/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pago: false, transacao_id: null }) });
  loadMes();
};
// (re)anexar transação em conta JÁ PAGA — mesmo dialog, atualiza valor/data/vínculo
window.anexarPagamentoPago = function (id) {
  api('/api/lancamentos?mes=' + mesAtual).then(rows => {
    const l = rows.find(x => x.id === id);
    if (l) dialogAnexarPagamento(l, loadMes);
  });
};
window.delLanc = async function (id) {
  if (!confirm('Excluir lançamento?')) return;
  await api('/api/lancamentos/' + id, { method: 'DELETE' });
  loadMes();
};
document.getElementById('mes-select2').onchange = e => { mesAtual = e.target.value; loadMes(); };

document.getElementById('btn-novo-lanc').onclick = () => window.editarLanc(null);
document.getElementById('btn-salvar-lanc').onclick = async e => {
  e.preventDefault();
  const f = document.getElementById('form-lanc');
  const body = {
    descricao: f.descricao.value.trim(),
    valor: parseFloat(f.valor.value),
    vencimento: f.vencimento.value,
    categoria: f.categoria.value || null,
    parcela: f.parcela.value ? f.parcela.value.trim() : null,
    observacao: f.observacao.value ? f.observacao.value.trim() : null,
    pago: f.pago.checked
  };
  if (f.dataset.id) {
    await api('/api/lancamentos/' + f.dataset.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    body.mes = mesAtual;
    await api('/api/lancamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  delete f.dataset.id;
  document.getElementById('dlg-lanc').close();
  loadMes();
  toast('Lançamento salvo');
};

// ---------- RECORRENTES ----------
let _recRows = [];

function atualizarCamposCondicionaisRec() {
  const f = document.getElementById('form-rec');
  const gp = document.getElementById('rec-grupo-parcelas');
  const gd = document.getElementById('rec-grupo-data-base');
  if (gp) gp.style.display = f.tipo.value === 'Parcelado' ? 'grid' : 'none';
  const per = parseInt(f.periodicidade.value) || 1;
  if (gd) gd.style.display = per > 1 ? 'block' : 'none';
}

const _frTipo = document.getElementById('fr-tipo');
if (_frTipo) _frTipo.onchange = atualizarCamposCondicionaisRec;
const _frPer = document.getElementById('fr-periodicidade');
if (_frPer) _frPer.oninput = atualizarCamposCondicionaisRec;

function renderTabelaRecorrentes() {
  const busca = (document.getElementById('rec-busca')?.value || '').trim().toLowerCase();
  const filtroStatus = document.getElementById('rec-filtro-status')?.value || 'todas';

  let filtradas = _recRows.filter(r => {
    if (filtroStatus === 'ativas' && !r.ativo) return false;
    if (filtroStatus === 'inativas' && r.ativo) return false;
    if (busca) {
      const matchDesc = (r.descricao || '').toLowerCase().includes(busca);
      const matchCat = (r.categoria || '').toLowerCase().includes(busca);
      const matchPad = (r.padrao_busca || '').toLowerCase().includes(busca);
      const matchObs = (r.observacao || '').toLowerCase().includes(busca);
      if (!matchDesc && !matchCat && !matchPad && !matchObs) return false;
    }
    return true;
  });

  const tb = document.querySelector('#tbl-rec tbody');
  if (!tb) return;

  if (filtradas.length === 0) {
    tb.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--muted);">Nenhuma recorrência encontrada</td></tr>`;
  } else {
    tb.innerHTML = filtradas.map(r => `
      <tr style="cursor:pointer" ondblclick="editarRec(${r.id})" title="Duplo clique para editar">
        <td>
          <span class="badge ${r.ativo ? 'pago' : 'vencido'}" style="cursor:pointer; user-select:none;" onclick="event.stopPropagation(); toggleRec(${r.id})" title="Clique para ${r.ativo ? 'pausar' : 'ativar'}">
            ${r.ativo ? 'ATIVA' : 'PAUSADA'}
          </span>
        </td>
        <td>
          <b>${r.descricao}</b>
          ${r.observacao ? ` <span class="muted" title="${r.observacao}" style="font-size:11px;">(${r.observacao})</span>` : ''}
        </td>
        <td class="mono" style="font-weight:600">${r.valor != null ? fmt(r.valor) : '—'}</td>
        <td class="mono">${r.dia_venc ? 'Dia ' + String(r.dia_venc).padStart(2, '0') : '—'}</td>
        <td>${r.categoria ? `<span class="tag">${r.categoria}</span>` : '<span class="muted">—</span>'}</td>
        <td><span class="muted">${r.tipo}</span></td>
        <td>
          ${r.tipo === 'Parcelado'
            ? `<span class="mono" style="color:#f28b5b;">${r.parcela_atual || 0}/${r.total_parcelas || '?'}</span>`
            : (r.periodicidade > 1
              ? `<span class="muted mono">cada ${r.periodicidade}m${r.data_base ? ' (' + r.data_base + ')' : ''}</span>`
              : `<span class="muted">Mensal</span>`)}
        </td>
        <td><span class="muted">${r.forma || '—'}</span></td>
        <td>
          ${r.padrao_busca
            ? `<code style="font-size:11px; background:rgba(77,171,255,0.12); color:#4dabff; padding:2px 6px; border-radius:4px;">${r.padrao_busca}</code>`
            : '<span class="muted" style="font-size:11px;">—</span>'}
        </td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="ghost" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="event.stopPropagation(); editarRec(${r.id})" title="Editar">${ico('note')}</button>
          <button class="ghost" style="padding:4px 8px; font-size:12px; margin-right:4px;" onclick="event.stopPropagation(); toggleRec(${r.id})" title="${r.ativo ? 'Pausar' : 'Ativar'}">${r.ativo ? '⏸' : '▶'}</button>
          <button class="ghost" style="padding:4px 8px; font-size:12px; color:var(--red);" onclick="event.stopPropagation(); delRec(${r.id})" title="Excluir">${ico('trash')}</button>
        </td>
      </tr>`).join('');
  }

  // Resumo de ativas
  const ativas = _recRows.filter(r => r.ativo);
  const fixos = ativas.filter(r => r.tipo === 'Recorrente' && r.categoria !== 'Cartões');
  const parcelas = ativas.filter(r => r.tipo === 'Parcelado');
  const faturas = ativas.filter(r => r.categoria === 'Cartões');
  const sum = arr => arr.reduce((s, r) => s + Math.abs(r.valor || 0), 0);
  const resumo = document.getElementById('rec-resumo');
  if (resumo) {
    resumo.innerHTML =
      `${ativas.length} ativas (${_recRows.length - ativas.length} pausadas) · ` +
      `<span style="color:var(--blue)">${fixos.length} fixos · ${fmt(sum(fixos))}</span> · ` +
      `<span style="color:#f28b5b">${parcelas.length} parcelas · ${fmt(sum(parcelas))}</span>` +
      (faturas.length ? ` · <span class="muted">${faturas.length} faturas · ${fmt(sum(faturas))}</span>` : '');
  }
}

const _recBusca = document.getElementById('rec-busca');
if (_recBusca) _recBusca.oninput = renderTabelaRecorrentes;
const _recStatus = document.getElementById('rec-filtro-status');
if (_recStatus) _recStatus.onchange = renderTabelaRecorrentes;

async function loadRecorrentes() {
  _recRows = await api('/api/recorrentes');
  renderTabelaRecorrentes();

  // status do próximo mês: o que será gerado
  const st = document.getElementById('rec-gerar-status');
  try {
    const prox = await api('/api/meses/proximo');
    if (prox.existe) {
      st.textContent = `próximo mês (${prox.ref}) já gerado — ${prox.contas} contas`;
    } else {
      st.textContent = `próximo mês (${prox.ref}): ${prox.recorrencias} recorrências ativas → ${prox.contas} contas a gerar (${fmt(prox.total)})`;
    }
  } catch (e) { st.textContent = ''; }
}

window.toggleRec = async function(id) {
  const r = await api(`/api/recorrentes/${id}/toggle`, { method: 'PATCH' });
  if (r.ok) {
    const item = _recRows.find(x => x.id === id);
    if (item) item.ativo = r.ativo;
    renderTabelaRecorrentes();
    toast(r.ativo ? 'Recorrência ativada' : 'Recorrência pausada');
  }
};

document.getElementById('btn-gerar-mes').onclick = async () => {
  const st = document.getElementById('rec-gerar-status');
  const prox = await api('/api/meses/proximo').catch(() => null);
  if (!prox) return;
  if (prox.existe) { toast('Mês ' + prox.ref + ' já existe'); return; }
  if (!confirm(`Gerar ${prox.ref} com ${prox.contas} contas (${fmt(prox.total)}) a partir das recorrências?`)) return;
  st.textContent = 'gerando…';
  const r = await api('/api/meses/gerar-proximo', { method: 'POST' });
  st.textContent = `${ico('check')} ${r.novo_mes} gerado com ${r.gerados} contas`;
  toast('Mês ' + r.novo_mes + ' gerado');
  loadRecorrentes();
};

window.editarRec = async function (id) {
  const cats = await api('/api/categorias');
  const f = document.getElementById('form-rec');
  document.getElementById('fr-categoria').innerHTML = '<option value="">—</option>' + cats.map(c => `<option>${c.nome}</option>`).join('');
  f.reset();
  const r = _recRows.find(x => x.id === id) || (await api('/api/recorrentes')).find(x => x.id === id);
  if (!r) return;
  document.getElementById('dlg-rec-title').textContent = 'Editar: ' + r.descricao;
  f.descricao.value = r.descricao;
  f.valor.value = r.valor ?? '';
  f.dia_venc.value = r.dia_venc ?? '';
  f.categoria.value = r.categoria || '';
  f.tipo.value = r.tipo || 'Recorrente';
  f.forma.value = r.forma || '';
  f.periodicidade.value = r.periodicidade || 1;
  f.total_parcelas.value = r.total_parcelas ?? '';
  f.parcela_atual.value = r.parcela_atual ?? '';
  f.data_base.value = r.data_base || '';
  f.padrao_busca.value = r.padrao_busca || '';
  f.observacao.value = r.observacao || '';
  f.ativo.checked = !!r.ativo;
  f.dataset.id = r.id;
  atualizarCamposCondicionaisRec();
  document.getElementById('dlg-rec').showModal();
};

window.delRec = async function (id) {
  if (!confirm('Excluir recorrência?')) return;
  await api('/api/recorrentes/' + id, { method: 'DELETE' });
  loadRecorrentes();
  toast('Recorrência excluída');
};

document.getElementById('btn-novo-rec').onclick = async () => {
  const f = document.getElementById('form-rec');
  f.reset();
  const cats = await api('/api/categorias');
  document.getElementById('fr-categoria').innerHTML = '<option value="">—</option>' + cats.map(c => `<option>${c.nome}</option>`).join('');
  document.getElementById('dlg-rec-title').textContent = 'Nova recorrência';
  delete f.dataset.id;
  f.tipo.value = 'Recorrente';
  f.periodicidade.value = 1;
  f.ativo.checked = true;
  atualizarCamposCondicionaisRec();
  document.getElementById('dlg-rec').showModal();
};

document.getElementById('form-rec').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const body = {
    descricao: f.descricao.value.trim(),
    valor: f.valor.value ? parseFloat(f.valor.value) : null,
    dia_venc: f.dia_venc.value ? parseInt(f.dia_venc.value) : null,
    categoria: f.categoria.value || null,
    tipo: f.tipo.value,
    forma: f.forma.value || null,
    periodicidade: parseInt(f.periodicidade.value) || 1,
    total_parcelas: f.total_parcelas.value ? parseInt(f.total_parcelas.value) : null,
    parcela_atual: f.parcela_atual.value !== '' ? parseInt(f.parcela_atual.value) : null,
    data_base: f.data_base.value ? f.data_base.value.trim() : null,
    padrao_busca: f.padrao_busca.value ? f.padrao_busca.value.trim() : null,
    observacao: f.observacao.value ? f.observacao.value.trim() : null,
    ativo: f.ativo.checked
  };
  if (f.dataset.id) {
    await api('/api/recorrentes/' + f.dataset.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    await api('/api/recorrentes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  delete f.dataset.id;
  document.getElementById('dlg-rec').close();
  loadRecorrentes();
  toast('Recorrência salva com sucesso');
};

// painel de conciliação
async function carregarConciliacao() {
  const d = await api('/api/conciliar');
  const sug = document.getElementById('conc-sugestoes');
  sug.innerHTML = d.sugestoes.length
    ? `<p class="muted" style="margin-bottom:10px;">${d.sugestoes.length} pagamento(s) do extrato reconhecido(s) nas suas contas. Confirme:</p>` +
      d.sugestoes.map(s => `
      <div class="insight ${s.difVal < 5 ? 'good' : 'warn'}" id="conc-${s.lancamento_id}">
        <span class="ico">${ico('link')}</span>
        <div class="txt" style="flex:1;">
          <b>${s.transacao}</b>
          <span>→ corresponde a <b>${s.previsto}</b>${s.difVal > 0.01 ? ` · <span style="color:var(--amber)">atualiza a conta pro valor pago: ${s.previstoValorPrevisto} → ${s.transacaoValorReal}</span>` : ''}${s.difData ? ` · dif data ${s.difData}d` : ''}</span>
          <span class="muted">${s.fonte === 'valor' ? 'Só o valor bate: nada na descrição identifica esta conta' : 'Identificada pela descrição'}${s.ambiguo ? ' · há outra opção igualmente provável, por isso não foi marcada sozinha' : ''}</span>
        </div>
        <button class="cta" onclick="concAprovar(${s.transacao_id}, ${s.lancamento_id})">${ico('check')} Confirmar</button>
        <button class="ghost" onclick="concRecusar(${s.transacao_id}, ${s.lancamento_id})">${ico('x')} Não é</button>
      </div>`).join('')
    : '<div class="muted" style="padding:8px 0;">Nenhuma sugestão pendente — tudo conciliado</div>';

  const ven = document.getElementById('conc-vencidos');
  ven.innerHTML = d.vencidos_sem_pagamento.length
    ? `<h4 style="margin-top:18px;">${ico('warn')} VENCIDAS SEM PAGAMENTO NO EXTRATO</h4>` +
      d.vencidos_sem_pagamento.map(v => `
      <div class="insight bad">
        <span class="ico">${ico('x')}</span>
        <div class="txt" style="flex:1;">
          <b>${v.descricao} ${v.parcela || ''}</b>
          <span>venc ${v.vencimento} · ${fmt(v.valor)} — não apareceu no extrato. Pagou por outro canal ou ainda não pagou?</span>
        </div>
        <button class="ghost" onclick="concPagoFora(${v.lancamento_id})">Paguei por outro canal</button>
      </div>`).join('')
    : '';
}
window.concAprovar = async function (txId, lancId) {
  await api('/api/conciliar/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lancamento_id: lancId, transacao_id: txId }) });
  toast('Conciliado — padrão aprendido');
  carregarConciliacao();
};
window.concRecusar = async function (txId, lancId) {
  await api('/api/conciliar/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lancamento_id: lancId, transacao_id: txId, recusar: true }) });
  toast('Recusado — essa transação não será mais sugerida para esta conta');
  carregarConciliacao();
};
window.concPagoFora = function (lancId) { return concPagoOutro(lancId); };

// ---------- Reconciliar: sincroniza com a AUVP, sugere pela regra única e liga contas a pagamentos ----------
function loadReconciliar() {
  const btn = document.getElementById('rec-btn-sync-auvp');
  if (btn) btn.onclick = async () => {
    const status = document.getElementById('rec-sync-status');
    btn.disabled = true;
    btn.textContent = 'Atualizando…';
    try {
      const r = await api('/api/auvp/sync', { method: 'POST' });
      const n = r.nucleo || {};
      status.textContent = n.erro ? 'AUVP: ' + n.erro
        : `${n.transacoes_novas || 0} transação(ões) nova(s) · ${(r.auto_conciliados || 0)} conta(s) marcada(s) como paga(s)`;
      toast(n.erro ? 'AUVP: ' + n.erro : 'Dados da AUVP atualizados');
    } catch (e) { toast('Erro ao atualizar: ' + e.message); }
    btn.disabled = false;
    btn.textContent = 'Atualizar da AUVP';
    loadReconciliar();
  };
  carregarConciliacao();
  carregarContasMes();
  carregarPadroes();
}

async function carregarPadroes() {
  const padroes = await api('/api/conciliar/padroes').catch(() => []);
  document.getElementById('conc-padroes').innerHTML = padroes.length ? padroes.map(p =>
    `<tr><td class="mono">${p.padrao_transacao}</td><td><b>${p.descricao_lancamento}</b></td><td class="muted">${p.confirmacoes}x</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Nenhum padrão ainda — confirme conciliações para ensinar o sistema</td></tr>';
}

// ---------- contas do mês: anexar transação já inserida ----------
async function carregarContasMes() {
  const box = document.getElementById('cmes-lista');
  const d = await api('/api/contas-mes-reconciliar').catch(() => null);
  if (!d) { box.innerHTML = '<div class="muted">erro ao carregar contas</div>'; return; }
  recContasMesData = d;
  document.getElementById('cmes-resumo').textContent = d.contas.length
    ? `${d.contas.length} conta(s) em aberto em ${d.mes} — anexe a transação que pagou cada uma`
    : `todas as contas de ${d.mes} estão pagas`;
  if (!d.contas.length) { box.innerHTML = ''; return; }
  box.innerHTML = d.contas.map(c => `
    <div class="cmes-conta" id="cmes-${c.id}">
      <div class="cmes-info">
        <b>${c.descricao} ${c.parcela || ''}</b>
        <span class="muted">previsto ${fmt(c.valor)} · venc ${c.vencimento}</span>
        <button class="ghost" style="padding:3px 10px; font-size:11px; margin-top:6px;" onclick="recusarCandidatos(${c.id})" title="Nenhuma dessas transações é o pagamento dessa conta">não é nenhuma dessas</button>
      </div>
      <div class="cmes-cands">
        ${c.candidatos.length ? c.candidatos.map(t => `
          <button class="cmes-cand" onclick="anexarConta(${c.id}, ${t.id})" title="Anexar: conta fica PAGA com valor real">
            <b>${t.descricao.slice(0, 30)}</b><span>${t.data.slice(5)} · ${fmt(t.valor)} · ${(t.fonte || '').replace('auvp-', 'auvp ')}</span>
          </button>`).join('') : '<span class="muted" style="font-size:12px;">nenhuma transação com valor próximo — <b style="color:var(--blue); cursor:pointer; text-decoration:underline;" onclick="abrirAnexar(' + c.id + ')">buscar transação</b> ou exclui a conta</span>'}
      </div>
    </div>`).join('');
}
// recusar TODOS os candidatos de uma conta: eles nunca mais são sugeridos pra ela
window.recusarCandidatos = async function (lancId) {
  const d = recContasMesData || await api('/api/contas-mes-reconciliar');
  const c = d.contas.find(x => x.id === lancId);
  if (!c || !c.candidatos.length) return;
  for (const t of c.candidatos) {
    await api('/api/conciliar/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lancamento_id: lancId, transacao_id: t.id, recusar: true }) }).catch(() => {});
  }
  toast('Recusado — essas transações não serão mais sugeridas pra ' + c.descricao);
  carregarContasMes();
};
let recContasMesData = null;
// abrir o dialog de anexar pra uma conta específica (busca livre)
window.abrirAnexar = async function (lancId) {
  const d = recContasMesData || await api('/api/contas-mes-reconciliar');
  const c = d.contas.find(x => x.id === lancId);
  if (c) dialogAnexarPagamento({ id: c.id, descricao: c.descricao, parcela: c.parcela, valor: c.valor, vencimento: c.vencimento }, carregarContasMes);
};

window.anexarConta = async function (lancId, txId) {
  const r = await api('/api/contas-mes-reconciliar/anexar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lancamento_id: lancId, transacao_id: txId }) });
  if (r.erro) { toast('Erro: ' + r.erro); return; }
  toast(r.valorAtualizado ? 'Conta PAGA — valor atualizado pro real + padrão aprendido' : 'Conta PAGA — padrão aprendido');
  const el = document.getElementById('cmes-' + lancId);
  if (el) { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => carregarContasMes(), 400); }
};

// ---------- dialog universal "anexar pagamento" (usado em Contas do mês e Reconciliar) ----------
window.dialogAnexarPagamento = async function (lanc, aoConcluir, opts = {}) {
  const podePular = opts.podePular !== false;
  const modal = document.createElement('dialog');
  modal.className = 'dlg-anexar';
  modal.innerHTML = `
    <div class="dlg-anexar-h">
      <div>
        <h3>${lanc.descricao} ${lanc.parcela || ''}</h3>
        <p class="muted">previsto ${fmt(lanc.valor)} · venc ${lanc.vencimento} · escolha a transação que pagou essa conta</p>
      </div>
      <button class="dlg-x" title="fechar">${ico('x')}</button>
    </div>
    <input type="search" id="anx-busca" class="fselect" style="width:100%; margin-bottom:12px;" placeholder="buscar na descrição…">
    <div class="dlg-anexar-lista" id="anx-lista"></div>
    <div class="dlg-anexar-foot">
      <span class="muted">a conta fica PAGA com a data da transação · valor atualizado pro real</span>
      <button class="ghost" id="anx-pular">pular anexo — só marcar pago</button>
      <button class="ghost" id="anx-naoachei">não achei — marcar pago sem transação</button>
    </div>`;
  document.body.appendChild(modal);
  modal.showModal();
  const lista = modal.querySelector('#anx-lista');
  let itens = [];

  async function carregar(busca) {
    itens = await api(`/api/lancamentos/${lanc.id}/candidatos?busca=${encodeURIComponent(busca || '')}`);
    if (!itens.length) { lista.innerHTML = `<div class="rec-empty">nenhuma transação ${busca ? 'com "' + busca + '"' : 'no período (±35 dias do vencimento)'}<br><span style="font-size:11px;">pagueu por outro canal? use o botão abaixo</span></div>`; return; }
    lista.innerHTML = itens.map((t, i) => {
      const dif = Math.abs(Math.abs(t.valor) - Math.abs(lanc.valor));
      const dtFmt = t.data ? (t.data.slice(8, 10) + '/' + t.data.slice(5, 7)) : '';
      return `<button class="anx-item" data-id="${t.id}" style="animation-delay:${Math.min(i * 20, 300)}ms">
        <span class="anx-desc">${t.descricao.slice(0, 42)}</span>
        <span class="anx-meta">${dtFmt} · ${(t.fonte || '').replace('auvp-', 'auvp ')}</span>
        <span class="anx-val">${fmt(t.valor)}</span>
        ${dif > 0.01 ? `<span class="anx-dif" title="conta será atualizada pro valor pago">±${fmt(dif)}</span>` : '<span class="anx-dif ok">exato</span>'}
      </button>`;
    }).join('');
    lista.querySelectorAll('.anx-item').forEach(b => b.onclick = () => escolher(Number(b.dataset.id)));
  }
  async function escolher(txId) {
    const r = await api('/api/contas-mes-reconciliar/anexar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lancamento_id: lanc.id, transacao_id: txId }) });
    if (r.erro) { toast('Erro: ' + r.erro); return; }
    modal.remove();
    toast(r.valorAtualizado ? 'PAGA — valor atualizado pro real + padrão aprendido' : 'PAGA — padrão aprendido');
    aoConcluir && aoConcluir();
  }
  modal.querySelector('#anx-busca').oninput = e => { clearTimeout(modal._t); modal._t = setTimeout(() => carregar(e.target.value), 250); };
  modal.querySelector('.dlg-x').onclick = () => modal.remove();
  if (podePular) {
    modal.querySelector('#anx-pular').onclick = async () => {
      await api('/api/lancamentos/' + lanc.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pago: true }) });
      modal.remove();
      toast('PAGA (sem transação anexada — pode anexar depois clicando nela)');
      aoConcluir && aoConcluir();
    };
  } else {
    const p = modal.querySelector('#anx-pular');
    if (p) p.remove();
  }
  modal.querySelector('#anx-naoachei').onclick = async () => {
    const btn = modal.querySelector('#anx-naoachei');
    if (btn.dataset.conf !== '1') { btn.textContent = 'confirmar: pagar sem transação anexada?'; btn.dataset.conf = '1'; btn.style.color = 'var(--amber)'; return; }
    await api('/api/lancamentos/' + lanc.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pago: true }) });
    modal.remove();
    toast('PAGA (sem transação anexada)');
    aoConcluir && aoConcluir();
  };
  await carregar('');
};

// ---------- CONFIGURAR ----------
// drill-down: Raio-X 360 do mês (clique na barra da projeção)
window.abrirDrillParcelas = async function (mes) {
  let d = await api('/api/projecao/detalhe/' + mes).catch(() => null);
  if (!d) {
    const old = await api('/api/projecao/parcelas/' + mes).catch(() => null);
    if (!old) return;
    d = {
      mes_ref: mes,
      fixos: [],
      parcelas_cartao: old.parcelas || [],
      parcelas_externas: [],
      totais: {
        total_fixos: 0,
        total_cartao: old.total || 0,
        total_externas: 0,
        total_comprometido: old.total || 0,
        renda: 0,
        sobra_livre: 0,
        pct_comprometido: 0
      }
    };
  }

  const modal = document.createElement('dialog');
  modal.className = 'dlg-360';

  function renderItens(aba) {
    let html = '';

    if (aba === 'todas' || aba === 'fixos') {
      (d.fixos || []).forEach(f => {
        html += `
          <div class="anx-item" style="cursor:default">
            <span class="tipo-badge tp-fixo">Fixo</span>
            <span class="anx-desc"><b>${f.descricao}</b> <span class="muted" style="font-size:11px;">(Venc: dia ${f.dia_venc || '—'}${f.pago ? ' · paga' : f.valor_origem && f.valor_origem.startsWith('último') ? ' · valor do ' + f.valor_origem : f.valor_origem === 'informado' ? ' · valor informado' : ''})</span></span>
            <span class="anx-meta">${f.categoria || 'Recorrente'}</span>
            <span class="anx-val">${fmt(f.valor)}</span>
          </div>`;
      });
    }

    if (aba === 'todas' || aba === 'cartao') {
      (d.parcelas_cartao || []).forEach(c => {
        const descPura = c.descricao.split(' (')[0];
        const isAberta = c.tipo_fatura === 'aberta';
        if (isAberta) {
          html += `
            <div class="anx-item" style="cursor:pointer" onclick="verNoExtratoCartao('${c.fonte}')">
              <span class="tipo-badge" style="background:rgba(179,136,255,.18); color:#b388ff; border:1px solid rgba(179,136,255,.4);">Fatura Aberta</span>
              <span class="anx-desc">
                <b>${c.icone || '💳'} ${c.descricao}</b>
                <span class="muted" style="font-size:11px; display:block; margin-top:2px;">
                  Venc: ${c.vencimento ? c.vencimento.split('-').reverse().join('/') : '—'} (Fecha ${c.fechamento ? c.fechamento.split('-').reverse().join('/') : '—'}) · Parcelas: ${fmt(c.parcelas_agendadas || 0)} + Compras: ${fmt(c.compras_ciclo || 0)}${c.transicao_cartao_antigo ? ' + Transição: ' + fmt(c.transicao_cartao_antigo) : ''}
                </span>
              </span>
              <span class="anx-val">${fmt(c.valor)}</span>
              <span class="muted" style="font-size:11px;" title="Ver extrato do cartão">🔍</span>
            </div>`;
        } else {
          html += `
            <div class="anx-item" style="cursor:pointer" onclick="verNoExtrato('${encodeURIComponent(descPura)}')">
              <span class="tipo-badge" style="background:rgba(255,77,94,.14); color:#ff4d5e; border:1px solid rgba(255,77,94,.35);">Cartão</span>
              <span class="anx-desc"><b>${c.descricao}</b></span>
              <span class="anx-meta">${(c.fonte || 'cartão').replace('auvp-', 'auvp ')}</span>
              <span class="anx-val">${fmt(c.valor)}</span>
              <span class="muted" style="font-size:11px;" title="Ver no extrato">🔍</span>
            </div>`;
        }
      });
    }

    if (aba === 'todas' || aba === 'externas') {
      (d.parcelas_externas || []).forEach(e => {
        html += `
          <div class="anx-item" style="cursor:default">
            <span class="tipo-badge tp-parcela">Externo</span>
            <span class="anx-desc"><b>${e.descricao}</b> <span class="muted" style="font-size:11px;">(${e.parcela} · Venc: dia ${e.dia_venc || '—'})</span></span>
            <span class="anx-meta">${e.categoria || 'Parcela'}</span>
            <span class="anx-val">${fmt(e.valor)}</span>
          </div>`;
      });
    }

    if (!html) {
      html = '<div class="muted" style="text-align:center; padding:32px;">Nenhum item nesta aba.</div>';
    }
    return html;
  }

  const totItens = (d.fixos?.length || 0) + (d.parcelas_cartao?.length || 0) + (d.parcelas_externas?.length || 0);
  const temFaturaAberta = d.parcelas_cartao?.some(c => c.tipo_fatura === 'aberta');
  const nomeAbaCartao = temFaturaAberta ? 'Faturas Abertas' : 'Cartão';

  modal.innerHTML = `
    <div class="dlg-anexar-h" style="margin-bottom:14px;">
      <div>
        <h3 style="display:flex; align-items:center; gap:8px;">
          <span>RAIO-X 360° — ${mesCurto(mes).toUpperCase()}</span>
          <span class="tipo-badge ${d.totais.pct_comprometido > 80 ? 'tp-parcela' : 'tp-fixo'}">${d.totais.pct_comprometido}% comprometido</span>
        </h3>
        <p class="muted">Só o que já foi gasto ou está agendado para este mês${d.totais.total_dia_a_dia ? ' · dia a dia já gasto: ' + fmt(d.totais.total_dia_a_dia) : ''}</p>
      </div>
      <button class="dlg-x" onclick="this.closest('dialog').remove()">${ico('x')}</button>
    </div>

    <div class="dlg-360-kpis">
      <div class="dlg-360-kpi">
        <div class="lbl">Total Comprometido</div>
        <div class="val mono ${d.totais.total_comprometido > 0 ? 'down' : ''}">${fmt(d.totais.total_comprometido)}</div>
      </div>
      <div class="dlg-360-kpi">
        <div class="lbl">Renda do mês</div>
        <div class="val mono">${fmt(d.totais.renda)}</div>
      </div>
      <div class="dlg-360-kpi">
        <div class="lbl">Sobra livre</div>
        <div class="val mono up">${fmt(d.totais.sobra_livre)}</div>
      </div>
    </div>

    <div class="dlg-360-tabs">
      <button class="dlg-360-tab active" data-aba="todas">Todas as saídas (${totItens})</button>
      <button class="dlg-360-tab" data-aba="fixos">Fixos (${d.fixos?.length || 0} · ${fmt(d.totais.total_fixos)})</button>
      <button class="dlg-360-tab" data-aba="cartao">${nomeAbaCartao} (${d.parcelas_cartao?.length || 0} · ${fmt(d.totais.total_cartao)})</button>
      <button class="dlg-360-tab" data-aba="externas">Externas (${d.parcelas_externas?.length || 0} · ${fmt(d.totais.total_externas)})</button>
    </div>

    <div class="dlg-anexar-lista" id="dlg-360-lista" style="max-height:48vh; overflow-y:auto;">
      ${renderItens('todas')}
    </div>

    <div class="dlg-anexar-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
      <span class="muted" style="font-size:12px;">
        Fixos: <b>${fmt(d.totais.total_fixos)}</b> · ${nomeAbaCartao}: <b>${fmt(d.totais.total_cartao)}</b> · Externas: <b>${fmt(d.totais.total_externas)}</b>
      </span>
      <button class="cta" onclick="this.closest('dialog').remove()">Fechar</button>
    </div>`;

  modal.querySelectorAll('.dlg-360-tab').forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll('.dlg-360-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modal.querySelector('#dlg-360-lista').innerHTML = renderItens(btn.dataset.aba);
    };
  });

  document.body.appendChild(modal);
  modal.showModal();
};

window.verNoExtrato = function (desc) {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector('.nav-item[data-view="extratos"]');
  if (btn) btn.classList.add('active');
  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.hidden = v !== 'extratos';
  });
  const busca = decodeURIComponent(desc || '');
  extFiltros = {
    conta: 'todas',
    fonte: '',
    natureza: '',
    categoria: '',
    busca: busca,
    sem_categoria: '0',
    apenas_parceladas: '0',
    min_valor: ''
  };
  const inB = document.getElementById('ext-busca');
  if (inB) inB.value = busca;
  document.querySelectorAll('dialog[open]').forEach(d => d.remove());
  carregarTransacoes();
};

window.verNoExtratoCartao = function (cartaoId) {
  const conta = cartaoId || 'todas'; // id da conta local do cartão (core/comprometido.js)
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const btn = document.querySelector('.nav-item[data-view="extratos"]');
  if (btn) btn.classList.add('active');
  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.hidden = v !== 'extratos';
  });
  extFiltros = {
    conta: conta,
    fonte: '',
    natureza: 'gasto',
    categoria: '',
    busca: '',
    sem_categoria: '0',
    apenas_parceladas: '0',
    min_valor: ''
  };
  const selC = document.getElementById('ext-conta');
  if (selC) selC.value = conta;
  const inB = document.getElementById('ext-busca');
  if (inB) inB.value = '';
  document.querySelectorAll('dialog[open]').forEach(d => d.remove());
  carregarTransacoes();
};

window.abrirModalFaturasAbertas = async function () {
  const fa = await api('/api/faturas-abertas').catch(() => null);
  if (!fa) {
    toast('Não foi possível carregar as faturas abertas.');
    return;
  }
  const modal = document.createElement('dialog');
  modal.className = 'dlg-360';
  const mesLabel = mesCurto(fa.mes_referencia).toUpperCase();

  modal.innerHTML = `
    <div class="dlg-anexar-h" style="margin-bottom:14px;">
      <div>
        <h3 style="display:flex; align-items:center; gap:8px;">
          <span>💳 FATURAS ABERTAS — VENCIMENTO ${mesLabel}</span>
          <span class="tipo-badge tp-parcela">${fmt(fa.total)}</span>
        </h3>
        <p class="muted">Comprometido até hoje: compras já lançadas no ciclo + parcelas programadas. Tem que bater com a fatura aberta no app de cada banco.</p>
      </div>
      <button class="dlg-x" onclick="this.closest('dialog').remove()">${ico('x')}</button>
    </div>

    <div class="dlg-360-kpis">
      <div class="dlg-360-kpi">
        <div class="lbl">Total Faturas Abertas</div>
        <div class="val mono down">${fmt(fa.total)}</div>
      </div>
      <div class="dlg-360-kpi">
        <div class="lbl">Mês de Vencimento</div>
        <div class="val mono">${mesLabel}</div>
      </div>
      <div class="dlg-360-kpi">
        <div class="lbl">Cartões Ativos</div>
        <div class="val mono">${fa.cartoes.length} cartões</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:16px;">
      ${fa.cartoes.map(c => `
        <div style="background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:14.5px;">${c.icone || '💳'} ${c.nome}</span>
              <span class="mono down" style="font-weight:700; font-size:16px;">${fmt(c.total)}</span>
            </div>
            <div style="font-size:12px; color:var(--muted); line-height:1.6; margin-bottom:12px;">
              <div>📅 Vencimento: <b style="color:var(--txt);">${c.vencimento ? c.vencimento.split('-').reverse().join('/') : '—'}</b></div>
              <div>✂️ Fechamento: <b style="color:var(--txt);">${c.fechamento ? c.fechamento.split('-').reverse().join('/') : '—'}</b></div>
              <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line);">
                • Parcelas agendadas: <b class="mono" style="color:var(--txt);">${fmt(c.parcelas_agendadas || 0)}</b><br>
                • Compras no ciclo: <b class="mono" style="color:var(--txt);">${fmt(c.compras_ciclo || 0)}</b>
              </div>
              <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">Valor no app:
                <input type="number" step="0.01" inputmode="decimal" class="conf-app" data-total="${c.total}" style="width:110px;" placeholder="0,00">
                <span class="conf-dif muted"></span>
              </label>
            </div>
          </div>
          <button class="ghost" style="width:100%; padding:6px 10px; font-size:12px;" onclick="verNoExtratoCartao('${c.id}')">
            Ver compras deste cartão no Extrato ↗
          </button>
        </div>
      `).join('')}
    </div>

    <div style="background:rgba(77,171,255,.08); border:1px solid rgba(77,171,255,.25); border-radius:10px; padding:10px 14px; font-size:12px; color:#c3d0de; line-height:1.5;">
      💡 Este total de <b>${fmt(fa.total)}</b> é o que já está comprometido nas faturas de <b>${mesLabel}</b>. Ele sobe conforme você usa os cartões até cada fechamento — isso é dado novo, não previsão.
    </div>

    <div class="dlg-anexar-foot" style="margin-top:14px; padding-top:12px; border-top:1px solid var(--line); display:flex; justify-content:flex-end;">
      <button class="cta" onclick="this.closest('dialog').remove()">Fechar</button>
    </div>
  `;

  document.body.appendChild(modal);
  // conferência com o app do banco: mostra a diferença na hora
  modal.querySelectorAll('.conf-app').forEach(inp => {
    inp.oninput = () => {
      const dif = inp.closest('label').querySelector('.conf-dif');
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (!isFinite(v)) { dif.textContent = ''; return; }
      const d = Math.round((v - Number(inp.dataset.total)) * 100) / 100;
      dif.textContent = d === 0 ? '✓ bate' : `diferença ${fmt(d)}`;
      dif.style.color = d === 0 ? 'var(--green)' : 'var(--amber)';
    };
  });
  modal.showModal();
};

// tooltip HTML custom da projeção
function projTooltipHTML(context) {
  const { chart, tooltip } = context;
  let el = document.getElementById('proj-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'proj-tooltip';
    document.body.appendChild(el);
  }
  if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
  const items = tooltip.dataPoints || [];
  const visivel = items.filter(i => i.raw != null && i.raw > 0 && i.dataset.label !== 'Renda');
  el.innerHTML = `
    <div class="pt-title">${tooltip.title || ''}</div>
    ${visivel.map(i => {
      const corSeg = i.dataset.label === 'Sobra livre' ? '#00d68f' : (i.dataset.backgroundColor || '#64788f');
      return `<div class="pt-row"><i style="background:${corSeg}"></i>${i.dataset.label}<b>${fmt(i.parsed.y)}</b></div>`;
    }).join('')}
    ${tooltip.footer?.[0] ? `<div class="pt-footer">${tooltip.footer[0]}</div>` : ''}
    <div style="margin-top:8px; padding-top:6px; border-top:1px dashed rgba(255,255,255,.12); font-size:11px; color:var(--muted); text-align:center;">Clique para abrir o Raio-X do mês</div>`;
  el.style.opacity = '1';
  const rect = chart.canvas.getBoundingClientRect();
  let x = rect.left + tooltip.caretX + 16;
  let y = rect.top + tooltip.caretY - 10;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (x + w > window.innerWidth - 10) x = rect.left + tooltip.caretX - w - 16;
  if (y + h > window.innerHeight - 10) y = window.innerHeight - h - 10;
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8)); // celular: nunca sai da tela
  y = Math.max(8, y);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

// rendas (painel de Configurar; o assistente da primeira inicialização usa as mesmas funções)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPO_RENDA = {
  fixa: 'Fixa — o mesmo valor todo mês',
  horas: 'Por hora — valor da hora × horas do mês',
  variavel: 'Variável — média dos últimos 3 meses',
  eventual: 'Eventual — só conta quando cair'
};
const jsonPost = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function renderRendasConfig(el = document.getElementById('p-rendas')) {
  if (!el) return;
  const rendas = await api('/api/rendas').catch(() => []);
  el.innerHTML = (rendas.length ? '' : '<p class="muted" style="font-size:13px;">Nenhuma renda cadastrada ainda. Veja abaixo as entradas que se repetem no seu histórico, ou cadastre uma.</p>')
    + rendas.map(r => `
    <div class="renda-item" data-id="${r.id}">
      <div class="renda-topo">
        <input class="renda-nome" data-field="nome" value="${esc(r.nome)}">
        <button class="ghost renda-x" title="Remover renda">${ico('trash')}</button>
      </div>
      <div class="renda-campos">
        <label>Tipo <select data-field="tipo">${Object.entries(TIPO_RENDA).map(([k, v]) => `<option value="${k}" ${r.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${r.tipo === 'horas'
      ? `<label>Hora R$ <input type="number" step="0.01" data-field="valor_hora" value="${r.valor_hora ?? ''}"></label>
         <label>Horas no mês <input type="number" data-field="horas_previstas" value="${r.horas_previstas || 168}"></label>`
      : r.tipo === 'eventual' ? ''
        : `<label>${r.tipo === 'variavel' ? 'Valor se não houver histórico' : 'Valor'} R$ <input type="number" step="0.01" data-field="valor_base" value="${r.valor_base ?? ''}"></label>`}
        <label>Cai por volta do dia <input type="number" min="1" max="31" data-field="dia_pagamento" value="${r.dia_pagamento ?? ''}"></label>
      </div>
      <div class="renda-campos">
        ${r.valor_exato != null
      ? `<label>Reconhecer pelo valor exato R$ <input type="number" step="0.01" data-field="valor_exato" value="${r.valor_exato}"></label>`
      : `<label>Reconhecer pelo texto do extrato <input data-field="padrao_regex" value="${esc(r.padrao_regex || '')}" placeholder="ex.: NOME DA EMPRESA"></label>`}
        <label class="chk"><input type="checkbox" data-field="corte" ${r.competencia_corte ? 'checked' : ''}> cai no fim do mês e paga o mês seguinte</label>
      </div>
      <div class="muted renda-rodape">${r.tipo === 'eventual' ? 'Não entra na previsão' : 'Previsão por mês: ' + fmt(r.estimada || 0)}${r.observacao ? ' · ' + esc(r.observacao) : ''}</div>
    </div>`).join('')
    + `<button class="ghost btn-nova-renda" style="margin-top:4px;">${ico('plus')} Nova renda</button>
       <div class="p-rendas-sug" style="margin-top:18px;"></div>`;

  el.querySelectorAll('.renda-item [data-field]').forEach(inp => {
    inp.onchange = async e => {
      const item = e.target.closest('.renda-item');
      const f = e.target.dataset.field;
      const body = {};
      if (f === 'corte') body.competencia_corte = e.target.checked ? 20 : null;
      else if (f === 'nome' || f === 'tipo' || f === 'padrao_regex') body[f] = e.target.value;
      else body[f] = e.target.value === '' ? null : parseFloat(e.target.value);
      try {
        await jsonPost('/api/rendas/' + item.dataset.id, body, 'PUT');
        toast('Renda atualizada');
        if (f === 'tipo' || f === 'corte' || f === 'valor_base' || f === 'valor_hora' || f === 'horas_previstas' || f === 'padrao_regex' || f === 'valor_exato') renderRendasConfig(el);
      } catch (err) { toast(err.message); }
    };
  });
  el.querySelectorAll('.renda-x').forEach(b => {
    b.onclick = async e => {
      const item = e.target.closest('.renda-item');
      if (!confirm('Remover esta renda? As transações continuam; ela só deixa de entrar nas contas do mês.')) return;
      await api('/api/rendas/' + item.dataset.id, { method: 'DELETE' });
      renderRendasConfig(el);
    };
  });
  el.querySelector('.btn-nova-renda').onclick = () => novaRenda(() => renderRendasConfig(el));
  renderSugestoesRenda(el.querySelector('.p-rendas-sug'), () => renderRendasConfig(el));
}

async function novaRenda(aoMudar) {
  const nome = prompt('Nome da renda (ex.: Salário, Aluguel recebido):');
  if (!nome) return;
  const texto = prompt('Como ela aparece no extrato? Digite um pedaço do texto (ex.: o nome da empresa).\nSe ela vem cada vez com um texto diferente mas sempre com o mesmo valor, deixe em branco.');
  const body = { nome, tipo: 'fixa' };
  if (texto && texto.trim()) body.padrao_regex = texto.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  else {
    const v = parseFloat(String(prompt('Valor exato que cai (ex.: 850,00):') || '').replace(/\./g, '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) return toast('Sem texto nem valor não dá para reconhecer a renda');
    body.valor_exato = v; body.valor_base = v;
  }
  try { await jsonPost('/api/rendas', body); toast('Renda cadastrada — ajuste o tipo e o valor'); aoMudar(); }
  catch (err) { toast(err.message); }
}

// entradas que se repetem no histórico: "é renda?" — aceitar cadastra com o que o histórico mostra
async function renderSugestoesRenda(el, aoMudar) {
  if (!el) return [];
  const sug = await api('/api/rendas/sugestoes').catch(() => []);
  if (!sug.length) { el.innerHTML = ''; return sug; }
  el.innerHTML = `<h5 class="sug-titulo">Entradas que se repetem no seu histórico — são renda?</h5>`
    + sug.map((s, i) => `
    <div class="renda-sug" data-i="${i}">
      <div>
        <b>${esc(s.nome)}</b>
        <div class="muted" style="font-size:12.5px;">caiu em ${s.meses} meses · ${s.valor_min === s.valor_max ? fmt(s.valor_mediano) : `de ${fmt(s.valor_min)} a ${fmt(s.valor_max)}`} · por volta do dia ${s.dia_tipico}</div>
      </div>
      <div class="renda-sug-acoes">
        <select class="fselect sug-tipo">${Object.entries(TIPO_RENDA).map(([k, v]) => `<option value="${k}" ${s.tipo_sugerido === k ? 'selected' : ''}>${v.split(' —')[0]}</option>`).join('')}</select>
        <button class="cta sug-sim">É renda</button>
        <button class="ghost sug-nao">Não é</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('.renda-sug').forEach(card => {
    const s = sug[+card.dataset.i];
    card.querySelector('.sug-sim').onclick = async () => {
      const tipo = card.querySelector('.sug-tipo').value;
      const body = {
        nome: s.nome, tipo, padrao_regex: s.padrao_regex, valor_exato: s.valor_exato,
        valor_base: tipo === 'variavel' ? s.media_mensal : s.valor_mediano,
        dia_pagamento: s.dia_tipico, competencia_corte: s.competencia_corte
      };
      if (tipo === 'horas') { body.horas_previstas = 168; body.valor_hora = Math.round(s.valor_mediano / 168 * 100) / 100; }
      try { await jsonPost('/api/rendas', body); toast('Renda cadastrada: ' + s.nome); aoMudar && aoMudar(); }
      catch (err) { toast(err.message); }
    };
    card.querySelector('.sug-nao').onclick = async () => {
      await jsonPost('/api/rendas/sugestoes/dispensar', { chave: s.chave });
      card.remove();
      if (!el.querySelector('.renda-sug')) el.innerHTML = '';
    };
  });
  return sug;
}

// Gestão de Contas e Cartões (Configurar)
function renderContasConfig(contas) {
  const grid = document.getElementById('p-contas-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!contas || !contas.length) {
    grid.innerHTML = '<p class="muted" style="grid-column:1/-1;">Nenhuma conta ou cartão cadastrado.</p>';
    return;
  }

  contas.forEach(c => {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.cssText = `background: var(--bg); border: 1px solid var(--border); border-left: 5px solid ${c.cor || (c.tipo === 'CREDIT' ? '#b388ff' : '#00d68f')}; padding: 14px; border-radius: 8px; position: relative; opacity: ${c.ativo ? '1' : '0.6'};`;

    const isCredit = c.tipo === 'CREDIT';
    const tipoBadge = isCredit 
      ? '<span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(179,136,255,0.15); color:#b388ff; font-weight:600;">Cartão de Crédito</span>'
      : '<span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(0,214,143,0.15); color:#00d68f; font-weight:600;">Conta Bancária</span>';
    
    const statusBadge = c.ativo
      ? '<span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(0,214,143,0.15); color:#00d68f;">Ativo</span>'
      : '<span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(255,82,82,0.15); color:#ff5252;">Inativo</span>';

    let cicloHtml = '';
    if (isCredit) {
      if (c.configurado) {
        cicloHtml = `
          <div style="font-size:12px; color:var(--muted); margin-top:8px;">
            <span>Fechamento: <b>Dia ${c.dia_fechamento}</b></span> · 
            <span>Vencimento: <b>Dia ${c.dia_vencimento}</b></span>${c.perfil === 'aprendido' ? ' · <span style="color:var(--amber)" title="Calculado pelas faturas da AUVP. Edite e salve para confirmar.">aprendido das faturas, confira</span>' : ''}
          </div>`;
      } else {
        cicloHtml = `
          <div style="font-size:12px; color:var(--yellow); margin-top:8px; display:flex; align-items:center; gap:4px;">
            ⚠️ <span>Ciclo não configurado (clique em Editar)</span>
          </div>`;
      }
    } else {
      cicloHtml = `<div style="font-size:12px; color:var(--muted); margin-top:8px;">Extrato e saldo de conta corrente</div>`;
    }

    const vinculoAuvp = c.conta_auvp 
      ? `<span title="Conta conectada via Open Finance" style="font-size:11px; color:var(--muted);">🔗 Open Finance (${c.conta_auvp})</span>`
      : `<span style="font-size:11px; color:var(--muted);">Sem vínculo com a AUVP</span>`;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">${c.icone || (isCredit ? '💳' : '🏦')}</span>
          <div>
            <b style="font-size:14px; display:block;">${c.nome}</b>
            <span style="font-size:11px; color:var(--muted); text-transform:uppercase;">${c.instituicao || ''}</span>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          ${tipoBadge}
          ${statusBadge}
        </div>
      </div>
      ${cicloHtml}
      <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:8px;">
        ${vinculoAuvp}
        <div style="display:flex; gap:6px;">
          <button class="ghost btn-editar-conta" style="padding:3px 8px; font-size:11px;">⚙️ Editar</button>
          <button class="ghost btn-toggle-conta" style="padding:3px 8px; font-size:11px;">${c.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-editar-conta').onclick = () => abrirModalConta(c);
    card.querySelector('.btn-toggle-conta').onclick = async () => {
      await api('/api/contas/' + c.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !c.ativo })
      });
      toast(`Conta ${c.ativo ? 'desativada' : 'ativada'}`);
      loadConfigurar();
      if (typeof popularFiltrosExtratos === 'function') popularFiltrosExtratos();
    };

    grid.appendChild(card);
  });
}

function abrirModalConta(c = null) {
  const modal = document.getElementById('modal-conta');
  if (!modal) return;
  
  const isNovo = !c;
  document.getElementById('modal-conta-titulo').textContent = isNovo ? 'Nova Conta / Cartão' : `Editar: ${c.nome}`;
  document.getElementById('modal-conta-id').value = isNovo ? '' : c.id;
  document.getElementById('modal-conta-nome').value = isNovo ? '' : (c.nome || '');
  document.getElementById('modal-conta-tipo').value = isNovo ? 'CREDIT' : (c.tipo || 'CREDIT');
  document.getElementById('modal-conta-inst').value = isNovo ? '' : (c.instituicao || '');
  document.getElementById('modal-conta-fech').value = isNovo ? '' : (c.dia_fechamento || '');
  document.getElementById('modal-conta-venc').value = isNovo ? '' : (c.dia_vencimento || '');
  document.getElementById('modal-conta-icone').value = isNovo ? '💳' : (c.icone || '💳');
  document.getElementById('modal-conta-cor').value = isNovo ? '#b388ff' : (c.cor || '#b388ff');
  document.getElementById('modal-conta-ativo').checked = isNovo ? true : !!c.ativo;

  const cicloDiv = document.getElementById('modal-conta-ciclo');
  const tipoSelect = document.getElementById('modal-conta-tipo');
  const atualizarCicloVis = () => {
    if (cicloDiv) cicloDiv.style.display = tipoSelect.value === 'CREDIT' ? 'grid' : 'none';
  };
  tipoSelect.onchange = atualizarCicloVis;
  atualizarCicloVis();

  modal.style.display = 'flex';
}

function fecharModalConta() {
  const modal = document.getElementById('modal-conta');
  if (modal) modal.style.display = 'none';
}

// Inicializa botões do modal de contas se presentes
if (document.getElementById('btn-nova-conta')) {
  document.getElementById('btn-nova-conta').onclick = () => abrirModalConta(null);
}
if (document.getElementById('modal-conta-cancelar')) {
  document.getElementById('modal-conta-cancelar').onclick = fecharModalConta;
}
if (document.getElementById('modal-conta-fechar-x')) {
  document.getElementById('modal-conta-fechar-x').onclick = fecharModalConta;
}
if (document.getElementById('modal-conta-salvar')) {
  document.getElementById('modal-conta-salvar').onclick = async () => {
    const id = document.getElementById('modal-conta-id').value;
    const nome = document.getElementById('modal-conta-nome').value.trim();
    const tipo = document.getElementById('modal-conta-tipo').value;
    const instituicao = document.getElementById('modal-conta-inst').value.trim();
    const dia_fechamento = document.getElementById('modal-conta-fech').value ? parseInt(document.getElementById('modal-conta-fech').value) : null;
    const dia_vencimento = document.getElementById('modal-conta-venc').value ? parseInt(document.getElementById('modal-conta-venc').value) : null;
    const icone = document.getElementById('modal-conta-icone').value.trim();
    const cor = document.getElementById('modal-conta-cor').value;
    const ativo = document.getElementById('modal-conta-ativo').checked ? 1 : 0;

    if (!nome) {
      toast('Por favor, informe o nome da conta');
      return;
    }

    const payload = { nome, tipo, instituicao, dia_fechamento, dia_vencimento, icone, cor, ativo };

    try {
      if (id) {
        await api('/api/contas/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/contas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      toast('Conta salva com sucesso!');
      fecharModalConta();
      loadConfigurar();
      if (typeof popularFiltrosExtratos === 'function') popularFiltrosExtratos();
    } catch (e) {
      toast('Erro ao salvar: ' + e.message);
    }
  };
}

async function loadConfigurar() {
  renderAcessoConfig();
  // Contas e Cartões
  const todasContas = await api('/api/contas?todas=1').catch(() => []);
  renderContasConfig(todasContas);

  await renderRendasConfig();
  // AUVP
  const auvp = await api('/api/config/auvp').catch(() => ({}));
  document.getElementById('cfg-auvp-url').value = auvp.url || 'https://financas-api.auvp.com.br/mcp';
  document.getElementById('cfg-auvp-key').value = '';
  document.getElementById('cfg-auvp-key').placeholder = auvp.temKey ? '•••••••• (salva — digite pra trocar)' : 'cole sua api key auvp_...';
  document.getElementById('cfg-auvp-ativo').checked = !!auvp.ativo;
  document.getElementById('cfg-auvp-status').textContent = auvp.ativo ? 'ativa' : 'inativa';
  const TIPO_SYNC = { sync: 'manual', auto: 'automático (diário)', saldos: 'saldos do dashboard' };
  document.getElementById('cfg-auvp-ultimo').textContent = auvp.ultimo_sync
    ? `Último sync: ${(auvp.ultimo_sync || '').slice(0, 16)} · ${TIPO_SYNC[auvp.ultimo_tipo] || auvp.ultimo_tipo} · o automático roda 1x/dia com o servidor aberto`
    : 'Nunca sincronizou — clique em "Sincronizar agora"';
}

// AUVP
document.getElementById('cfg-auvp-salvar').onclick = async () => {
  const url = document.getElementById('cfg-auvp-url').value;
  const key = document.getElementById('cfg-auvp-key').value;
  const ativo = document.getElementById('cfg-auvp-ativo').checked;
  await api('/api/config/auvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, key: key || undefined, ativo }) });
  toast('Configuração da AUVP salva');
  loadConfigurar();
};
document.getElementById('cfg-auvp-sync').onclick = async () => {
  const st = document.getElementById('cfg-auvp-status');
  const result = document.getElementById('auvp-sync-result');
  st.textContent = 'sincronizando…';
  st.style.color = 'var(--muted)';
  try {
    const d = await api('/api/auvp/sync', { method: 'POST' });
    st.textContent = 'sincronizado';
    st.style.color = 'var(--green)';
    result.innerHTML = `
      <div class="insight good">
        <span class="ico">${ico('check')}</span>
        <div class="txt">
          <b>${d.contas?.totalAccounts?.totalQuantity || 0} contas sincronizadas</b>
          <span>Saldo total: ${fmt(d.contas?.totalAccounts?.totalValue || 0)} · Cartões: ${d.contas?.creditCards?.totalQuantity || 0} (${fmt(d.contas?.creditCards?.totalValue || 0)}) · ${d.agendadas} parcelas agendadas</span>
        </div>
      </div>`;
  } catch (e) {
    st.textContent = e.message;
    st.style.color = 'var(--red)';
  }
};

// ---------- init ----------
// modo privado: olhinho no topbar oculta valores em todo o sistema (persistente)
const btnPriv = document.getElementById('btn-privado');
function atualizarBtnPriv() {
  if (!btnPriv) return;
  btnPriv.innerHTML = modoPrivado ? ico('eyeOff') : ico('eye');
  btnPriv.title = modoPrivado ? 'Valores ocultos — clique pra mostrar' : 'Ocultar valores (modo privado)';
}
function reRenderAtiva() {
  const ativa = document.querySelector('.nav-item.active')?.dataset.view;
  const mapa = { visao: loadVisao, extratos: loadExtratos, projecao: loadProjecao, mes: loadMes, recorrentes: loadRecorrentes, reconciliar: loadReconciliar, configurar: loadConfigurar };
  if (ativa && mapa[ativa]) mapa[ativa]();
}
if (btnPriv) {
  atualizarBtnPriv();
  btnPriv.onclick = () => {
    modoPrivado = !modoPrivado;
    localStorage.setItem('finflow.privado', modoPrivado ? '1' : '0');
    atualizarBtnPriv();
    toast(modoPrivado ? 'Valores ocultos' : 'Valores visíveis');
    reRenderAtiva();
  };
}
// Chart.js: fonte consistente com o sistema (Archivo) — sem isso os gráficos herdam
// Helvetica/Arial condensada do canvas e o texto fica "achatado".
// Weight 600 no default: regular 400 fica fino demais sobre fundo escuro.
if (window.Chart) {
  Chart.defaults.font.family = "'Archivo', sans-serif";
  Chart.defaults.font.size = 13;
  Chart.defaults.font.weight = '600';
  Chart.defaults.color = '#a8bcd2';
}
const perExtratos = barraPeriodo('per-bar-extratos', 'finflow.per.extratos', () => carregarTransacoes());
// topo: quando os dados da AUVP foram atualizados (antes vinha da Visão, que saiu do menu)
async function atualizarTopo() {
  const cfg = await api('/api/config/auvp').catch(() => null);
  const el = document.getElementById('top-sync');
  if (el) el.textContent = cfg && cfg.ultimo_sync ? 'AUVP: ' + cfg.ultimo_sync.slice(8, 10) + '/' + cfg.ultimo_sync.slice(5, 7) + ' ' + cfg.ultimo_sync.slice(11, 16) : 'AUVP: sem sincronização';
  const f = document.getElementById('top-fontes');
  if (f) f.textContent = 'Recorrências · Contas do mês · Projeção · Reconciliar';
}
// abre direto na Projeção (decisão de 15/10: só o core no menu)
// primeira inicialização: o assistente monta o painel antes; depois abre direto na Projeção
abrirAssistente().then(aberto => { if (!aberto) loadMeses().then(() => { loadProjecao(); atualizarTopo(); }); });

// ---------- primeira inicialização (assistente) ----------
// passos: chave da AUVP e primeira sincronização → contas e cartões → rendas → só este PC ou casa toda
const assist = {
  el: () => document.getElementById('assistente'),
  ir(n) {
    const el = this.el();
    el.querySelectorAll('section[data-passo]').forEach(s => { s.hidden = +s.dataset.passo !== n; });
    el.querySelectorAll('.assist-passos li').forEach((li, i) => { li.className = i < n ? 'feito' : i === n ? 'atual' : ''; });
    el.querySelector('.assist-caixa').scrollTop = 0;
    this.passo = n;
    if (n === 1) assistContas();
    if (n === 2) renderRendasConfig(document.getElementById('as-rendas'));
    if (n === 3) assistModo();
  }
};

async function abrirAssistente() {
  const est = await api('/api/setup/estado').catch(() => null);
  if (!est || est.concluido) return false;
  const el = assist.el();
  el.hidden = false;
  document.body.classList.add('sem-rolagem');
  el.querySelectorAll('[data-voltar]').forEach(b => { b.onclick = () => assist.ir(assist.passo - 1); });
  if (est.tem_chave) document.getElementById('as-chave').placeholder = '•••••••• (já salva — pode só clicar em conectar)';
  document.getElementById('as-conectar').onclick = assistConectar;
  document.getElementById('as-contas-ok').onclick = assistSalvarContas;
  document.getElementById('as-rendas-ok').onclick = () => assist.ir(3);
  document.getElementById('as-concluir').onclick = assistConcluir;
  assist.ir(0);
  return true;
}

async function assistConectar() {
  const chave = document.getElementById('as-chave').value.trim();
  const out = document.getElementById('as-sync');
  const botao = document.getElementById('as-conectar');
  const est = await api('/api/setup/estado');
  if (!chave && !est.tem_chave) { out.innerHTML = '<p class="assist-erro">Cole a chave do MCP da AUVP.</p>'; return; }
  botao.disabled = true;
  out.innerHTML = `<p class="muted">${ico('loading', 'gira')} Buscando suas contas, cartões e transações na AUVP… (pode levar um minuto)</p>`;
  try {
    await jsonPost('/api/config/auvp', { key: chave || undefined, ativo: true });
    const r = await api('/api/auvp/sync', { method: 'POST' });
    const n = r.nucleo || {};
    if (n.erro) throw new Error(n.erro);
    const contas = await api('/api/contas?todas=1');
    out.innerHTML = `<p class="assist-ok">${ico('check')} Conectado. Encontrei ${contas.filter(c => c.tipo === 'BANK').length} conta(s), ${contas.filter(c => c.tipo === 'CREDIT').length} cartão(ões) e ${n.transacoes_novas ?? 0} transação(ões).</p>`;
    atualizarTopo();
    setTimeout(() => assist.ir(1), 900);
  } catch (err) {
    const recusada = /401|Unauthorized|Credencial/i.test(err.message);
    out.innerHTML = `<p class="assist-erro">${recusada ? 'A AUVP recusou essa chave.' : 'Não deu certo: ' + esc(err.message)}</p><p class="muted assist-nota">Confira se a chave foi copiada inteira e se a sua conta da AUVP está ativa.</p>`;
  } finally { botao.disabled = false; }
}

async function assistContas() {
  const contas = await api('/api/contas?todas=1').catch(() => []);
  const el = document.getElementById('as-contas');
  if (!contas.length) { el.innerHTML = '<p class="muted">Nenhuma conta chegou da AUVP. Conecte seus bancos lá e sincronize de novo em Configurar.</p>'; return; }
  el.innerHTML = contas.map(c => `
    <div class="assist-conta" data-id="${esc(c.id)}">
      <span class="assist-conta-nome">${esc(c.icone || '')} <b>${esc(c.nome)}</b> <span class="muted">${c.tipo === 'CREDIT' ? 'cartão' : 'conta'}</span></span>
      ${c.tipo === 'CREDIT' ? `
        <label>Fecha dia <input type="number" min="1" max="31" data-f="dia_fechamento" value="${c.dia_fechamento ?? c.fecha_aprendido ?? ''}"></label>
        <label>Vence dia <input type="number" min="1" max="31" data-f="dia_vencimento" value="${c.dia_vencimento ?? c.vence_aprendido ?? ''}"></label>` : ''}
    </div>`).join('');
}

async function assistSalvarContas() {
  const faltando = [];
  for (const linha of document.querySelectorAll('#as-contas .assist-conta')) {
    const ins = linha.querySelectorAll('input');
    if (!ins.length) continue;
    const [f, v] = [...ins].map(i => parseInt(i.value));
    if (!(f >= 1 && f <= 31 && v >= 1 && v <= 31)) { faltando.push(linha.querySelector('b').textContent); continue; }
    await jsonPost('/api/contas/' + encodeURIComponent(linha.dataset.id), { dia_fechamento: f, dia_vencimento: v }, 'PUT');
  }
  if (faltando.length) return toast('Preencha fechamento e vencimento de: ' + faltando.join(', '));
  assist.ir(2);
}

async function assistModo() {
  const info = await api('/api/acesso/info').catch(() => ({}));
  const marcar = m => document.querySelectorAll('.assist-opcao').forEach(b => b.classList.toggle('sel', b.dataset.modo === m));
  marcar(info.modo);
  mostrarEnderecos(document.getElementById('as-modo'), info);
  document.querySelectorAll('.assist-opcao').forEach(b => {
    b.onclick = async () => {
      if (info.fixo) return toast('O endereço foi fixado na instalação (Docker): mude por lá');
      marcar(b.dataset.modo);
      const r = await jsonPost('/api/acesso/modo', { modo: b.dataset.modo }).catch(err => { toast(err.message); return null; });
      if (r) mostrarEnderecos(document.getElementById('as-modo'), r);
    };
  });
}

// endereço para abrir no celular, quando o app está aberto para a casa toda
function mostrarEnderecos(el, info) {
  if (!el) return;
  if (info.modo !== 'casa') { el.innerHTML = ''; return; }
  el.innerHTML = info.enderecos && info.enderecos.length
    ? `<p>No celular ou em outro computador da casa, conectado ao mesmo Wi-Fi, abra:</p>
       ${info.enderecos.map(u => `<div class="assist-endereco mono">${esc(u)}</div>`).join('')}
       <p class="muted assist-nota">No Windows, se aparecer o aviso do firewall pedindo para liberar o Node.js, marque <b>Redes privadas</b> e permita. Se o endereço mudar depois de reiniciar o roteador, ele aparece de novo em Configurar.</p>`
    : info.fixo
      ? `<p class="muted">Abra pelo IP do computador onde o Docker roda, na porta publicada (ex.: http://192.168.0.10:4321). Para mostrar o endereço aqui, defina FINANCA_ENDERECO no .env.</p>`
      : '<p class="muted">Não achei este computador em nenhuma rede. Conecte-o ao Wi-Fi ou ao cabo de casa e veja o endereço em Configurar.</p>';
}

async function assistConcluir() {
  await jsonPost('/api/setup/concluir', {});
  assist.el().hidden = true;
  document.body.classList.remove('sem-rolagem');
  toast('Pronto! Seu painel está montado');
  await loadMeses();
  loadProjecao();
  atualizarTopo();
}

// Configurar → Acesso: onde o app abre, endereço para o celular, senha e sair
async function renderAcessoConfig() {
  const info = await api('/api/acesso/info').catch(() => null);
  if (!info) return;
  document.getElementById('cfg-acesso').innerHTML = `<p class="muted" style="font-size:13px;">Entrou como <b>${esc(info.usuario)}</b>.${info.fixo ? ' O endereço foi fixado na instalação (Docker).' : ''}</p>`;
  const marcar = m => document.querySelectorAll('[data-modo-cfg]').forEach(b => b.classList.toggle('sel', b.dataset.modoCfg === m));
  marcar(info.modo);
  mostrarEnderecos(document.getElementById('cfg-acesso-enderecos'), info);
  document.querySelectorAll('[data-modo-cfg]').forEach(b => {
    b.onclick = async () => {
      if (info.fixo) return toast('O endereço foi fixado na instalação (Docker): mude por lá');
      if (b.dataset.modoCfg === 'pc' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
        && !confirm('Você está em outro aparelho. Depois disso o app só abre no computador onde ele roda. Continuar?')) return;
      const r = await jsonPost('/api/acesso/modo', { modo: b.dataset.modoCfg }).catch(err => { toast(err.message); return null; });
      if (r) { marcar(r.modo); mostrarEnderecos(document.getElementById('cfg-acesso-enderecos'), r); toast(r.modo === 'casa' ? 'Aberto para a casa toda' : 'Só neste computador'); }
    };
  });
  document.getElementById('cfg-trocar-senha').onclick = async () => {
    const atual = prompt('Senha atual:'); if (!atual) return;
    const nova = prompt('Nova senha (pelo menos 6 caracteres):'); if (!nova) return;
    if (prompt('Repita a nova senha:') !== nova) return toast('As senhas não são iguais');
    try { await jsonPost('/api/acesso/senha', { atual, nova }); toast('Senha trocada'); } catch (err) { toast(err.message); }
  };
  document.getElementById('cfg-sair').onclick = async () => { await jsonPost('/api/acesso/sair', {}); location.href = '/entrar.html'; };
}
