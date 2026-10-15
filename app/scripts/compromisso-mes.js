// compromisso-mes.js — adaptador para quem ainda usa a interface antiga (painel, Visão, checagem).
// O cálculo mora em core/comprometido.js (motor único, regra de 15/10/2026). Não calcular nada aqui.
const motor = require('../core/comprometido');
const cal = require('../core/calendario');

const refParaIso = ref => cal.refParaYm(ref);

function compromissoMes(ref) {
  const m = motor.comprometidoMes(cal.refParaYm(ref));
  return {
    origem: m.origem_contas === 'contas do mês' ? 'lancamentos' : 'estimado',
    mes: ref, mes_iso: m.mes_iso,
    fixos: m.fixos, parcelas: m.parcelados, faturas: m.total_faturas,
    total: Math.round((m.fixos + m.parcelados + m.total_faturas) * 100) / 100,
    detalhe: [
      ...m.faturas.map(f => ({ descricao: `Fatura ${f.cartao}`, valor: f.total, grupo: 'faturas', pago: f.status === 'fechada' })),
      ...m.contas.map(c => ({ descricao: c.descricao, valor: c.valor, grupo: c.tipo === 'parcelado' ? 'parcelas' : 'fixos', pago: c.pago }))
    ]
  };
}

function gastoDiaADia(mesIso) {
  return motor.comprometidoMes(mesIso, mesIso + '-28').dia_a_dia;
}

module.exports = { compromissoMes, gastoDiaADia, refParaIso };
