// Calendário: meses (YYYY-MM), dia útil com feriados nacionais e data de Brasília.
// Fonte única dessas contas para o motor de comprometimento.

// feriados nacionais (bancos fecham); manter a lista um ano à frente
const FERIADOS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04',
  '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27',
  '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'
]);

const pad = n => String(n).padStart(2, '0');

// "hoje" no horário de Brasília, como YYYY-MM-DD
function hojeISO(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

// a AUVP manda instantes em UTC; a data que vale é a de Brasília (compra às 22h fica no próprio dia)
function dataBrasilia(iso) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

function addMes(ym, k) {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}

const mesesEntre = (de, ate) => {
  const [y1, m1] = de.split('-').map(Number), [y2, m2] = ate.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

// ref 'MM-YYYY' <-> 'YYYY-MM'
const refParaYm = ref => { const [m, y] = ref.split('-'); return `${y}-${m}`; };
const ymParaRef = ym => { const [y, m] = ym.split('-'); return `${m}-${y}`; };

function proximoDiaUtil(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  while ([0, 6].includes(d.getUTCDay()) || FERIADOS.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// dia D do mês ym, limitado ao último dia do mês
function diaDoMes(ym, dia) {
  const [y, m] = ym.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${pad(Math.min(dia, ultimo))}`;
}

module.exports = { FERIADOS, hojeISO, dataBrasilia, addMes, mesesEntre, refParaYm, ymParaRef, proximoDiaUtil, diaDoMes };
