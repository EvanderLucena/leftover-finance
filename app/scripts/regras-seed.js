// Regras iniciais de classificação — extraídas dos dados reais
const db = require('../db');

const REGRAS = [
  // natureza: transferencia (pagamentos de fatura não são gasto novo)
  { padrao: '^FATURA PAGA|^FATURAITAU|FATURA ITAU UNICLASS', natureza: 'transferencia', prioridade: 10 },
  { padrao: 'PAG BOLETO BANCO ITAUCARD|ITAU CARD', natureza: 'transferencia', prioridade: 10 },
  { padrao: 'PIX QRS NU PAGAMENT|PIX QRS MERCADO PAG', natureza: 'transferencia', prioridade: 10 },
  { padrao: 'CREDITO CONSIGNADO', natureza: 'transferencia', prioridade: 10 }, // quitação de consignado (empréstimo)
  { padrao: 'PIX ORIGEM CARTAO', natureza: 'transferencia', prioridade: 10 },
  { padrao: '^REND PAGO APLIC', natureza: 'rendimento', prioridade: 10 },
  { padrao: 'SALDO DO DIA', natureza: 'ignorar', prioridade: 1 },

  // receitas
  { padrao: 'REMUNERACAO/SALARIO|REMUNERAÇÃO|SALARIO|SALÁRIO|FOLHA DE PAGAMENTO|PROVENTOS', natureza: 'salario', categoria: 'Salário', tags: 'salario', prioridade: 5 },

  // contas fixas (casa/dívidas)
  { padrao: 'ALUGUEL|IMOBILIARIA', categoria: 'Casa', tags: 'aluguel', prioridade: 20 },
  { padrao: 'FINANCIAMENTO|HABITACIONAL|CAIXA GCI', categoria: 'Dívida', tags: 'financiamento', prioridade: 20 },
  { padrao: 'CONDOMINIO|ADMINISTRADORA DE CONDOMINIO', categoria: 'Casa', tags: 'condominio', prioridade: 20 },
  { padrao: 'ENERGISA|ENEL|CPFL|LUZ|ELEKTRO|CEMIG|LIGHT', categoria: 'Casa', tags: 'energia', prioridade: 20 },
  { padrao: 'SABESP|SANEPAR|COPASA|AGUA|SANEAMENTO', categoria: 'Casa', tags: 'agua', prioridade: 20 },
  { padrao: 'INTERNET|TELECON|BANDA LARGA|CLARO|VIVO|TIM|OI', categoria: 'Casa', tags: 'internet', prioridade: 20 },
  { padrao: 'DA REC FED|DARF|RECEITA FEDERAL', categoria: 'Dívida', tags: 'irpf', prioridade: 20 },
  { padrao: 'PREFEITURA|IPTU', categoria: 'Dívida', tags: 'iptu', prioridade: 20 },

  // transferências pessoais
  { padrao: 'PIX FAMILIA|AJUDA FAMILIA', categoria: 'Mãe', tags: 'ajuda-mae', prioridade: 20 },
  { padrao: 'PIX TRANSF PROPRIA|TRANSF MESMA TITULARIDADE', natureza: 'transferencia-propria', prioridade: 20 },
  { padrao: 'PILATES|ACADEMIA|FITNESS|SMARTFIT|GYMPASS', categoria: 'Saúde', tags: 'academia', prioridade: 20 },

  // pets
  { padrao: 'PETZ|COBASI|PET SHOP|CLINICA VET|VETERINARIO|VET CENTER', categoria: 'Pets', prioridade: 20 },

  // extrato categorias gerais
  { padrao: 'IFOOD|UBER|AMAZON|MERCADOLIVRE|MERCADO LIVRE|MP\\*', categoria: 'Cartões', prioridade: 30 },
  { padrao: 'C6 BANK', categoria: 'Cartões', tags: 'fatura-c6', prioridade: 20 },
  { padrao: 'APPMAX', natureza: 'transferencia', prioridade: 20 },
  { padrao: 'IPVA|DETRAN', categoria: 'Dívida', tags: 'ipva', prioridade: 20 },
  { padrao: 'POSTO|AUTOPOSTO|AUTO POSTO|IPIRANGA|SHELL|BR PETROBRAS|PNEUSTORE|PNEU', categoria: 'Veículo', prioridade: 25 },
  { padrao: 'SUPERMERCADO|PAO DE ACUCAR|CARREFOUR|ASSAI|ATACADAO|PADARIA|EMPORIUM|CONVENIENCIA', categoria: 'Mercado', prioridade: 25 },
  { padrao: 'RESTAURANTE|SORVETERIA|PIZZARIA|LANCHES|BURGUER|BAR |PASTEL|CHURRASCARIA|CAFE|CAFÉ', categoria: 'Restaurantes', prioridade: 25 },
  { padrao: 'DROGASIL|DROGA RAIA|PAGUE MENOS|DROGARIA|FARMACIA|FARMA|FISIO|CLINICA|MEDIC|HOSPITAL', categoria: 'Saúde', prioridade: 25 },
  { padrao: 'FAXINA|DIARISTA|LIMPEZA', categoria: 'Casa', tags: 'faxina', prioridade: 25 },
  { padrao: 'SERVICOS PESSOAIS|BARBEARIA|SALAO|CABELEIREIRO|ESTETICA', categoria: 'Pessoal', prioridade: 25 },
  { padrao: 'CORREIOS', categoria: 'Outros', prioridade: 25 },
  { padrao: 'NETFLIX|SPOTIFY|PRIME VIDEO|DISNEY|HBO|STEAM|PLAYSTATION|BYTEDANCE|TIKTOK|GAM', categoria: 'Lazer', prioridade: 25 },
  { padrao: 'OPTICA|OTICA', categoria: 'Saúde', prioridade: 25 },
  { padrao: 'SHOPPING|LOJA|STORE|SHOP|MAGAZINE|ZARA|RENNER|C&A|RIACHUELO|DAISO|JEANS', categoria: 'Compras', prioridade: 30 },
  { padrao: 'CINEMA|INGRESSO|TEATRO|SHOW', categoria: 'Lazer', prioridade: 25 },
];

function seedRegras() {
  const n = db.prepare('SELECT COUNT(*) c FROM regras').get().c;
  if (n > 0) { console.log('Regras já existem:', n); return; }
  const ins = db.prepare("INSERT INTO regras (padrao, campo, categoria, tags, natureza, prioridade) VALUES (?, 'descricao', ?, ?, ?, ?)");
  for (const r of REGRAS) ins.run(r.padrao, r.categoria || null, r.tags || null, r.natureza || null, r.prioridade || 100);
  console.log('Regras criadas:', REGRAS.length);
}

function recategorizar() {
  const regras = db.prepare('SELECT * FROM regras WHERE ativa=1 ORDER BY prioridade ASC').all();
  const txs = db.prepare('SELECT id, descricao, valor, natureza FROM transacoes').all();
  const upd = db.prepare('UPDATE transacoes SET natureza=?, categoria=COALESCE(categoria, ?), tags=COALESCE(tags, ?) WHERE id=?');
  let mudou = 0;
  for (const t of txs) {
    // Se a transação já foi marcada como 'ignorado', preserva e não sobrescreve
    let natureza = (t.natureza === 'ignorado') ? 'ignorado' : null;
    let categoria = null, tags = null;
    for (const r of regras) {
      if (new RegExp(r.padrao, 'i').test(t.descricao)) {
        if (t.natureza !== 'ignorado') {
          natureza = r.natureza || natureza;
        }
        categoria = categoria || r.categoria;
        tags = tags || r.tags;
        break;
      }
    }
    if (!natureza) {
      // Se a transação já tinha uma natureza especial, preserva
      if (t.natureza && ['transferencia', 'transferencia-propria', 'rendimento', 'salario', 'ignorado'].includes(t.natureza)) {
        natureza = t.natureza;
      } else if (t.valor > 0) {
        natureza = 'entrada';
      } else if (/pagamento.*fatura/i.test(t.descricao)) {
        natureza = 'transferencia';
      } else {
        natureza = 'gasto';
      }
    }
    upd.run(natureza, categoria, tags, t.id);
    mudou++;
  }
  console.log('Transações classificadas:', mudou);
}

if (require.main === module) {
  seedRegras();
  recategorizar();
}

module.exports = { seedRegras, recategorizar };