// Regras iniciais de classificação de um banco novo (genéricas, valem para qualquer banco).
// Cada um ajusta as suas depois; a categoria que a AUVP dá entra quando nenhuma regra casa (core/auvp-sync.js).
const db = require('../db');

const REGRAS = [
  // natureza: pagamento de fatura e transferência não são gasto novo
  { padrao: 'PAGAMENTO DE FATURA|PAGTO FATURA|PAG FATURA|FATURA PAGA|PAGAMENTO FATURA|PAGAMENTO RECEBIDO', natureza: 'transferencia', prioridade: 10 },
  { padrao: 'CREDITO CONSIGNADO', natureza: 'transferencia', prioridade: 10 }, // quitação de consignado (empréstimo)
  { padrao: 'PIX ORIGEM CARTAO', natureza: 'transferencia', prioridade: 10 },
  { padrao: 'REND PAGO APLIC|RENDIMENTO', natureza: 'rendimento', prioridade: 10 },
  { padrao: 'SALDO DO DIA', natureza: 'ignorar', prioridade: 1 },
  { padrao: 'TRANSF PROPRIA|MESMA TITULARIDADE', natureza: 'transferencia-propria', prioridade: 20 },

  // receitas
  { padrao: 'REMUNERACAO/SALARIO|REMUNERAÇÃO|SALARIO|SALÁRIO|FOLHA DE PAGAMENTO|PROVENTOS', natureza: 'salario', categoria: 'Salário', tags: 'salario', prioridade: 5 },

  // contas da casa
  { padrao: 'ALUGUEL|IMOBILIARIA', categoria: 'Casa', tags: 'aluguel', prioridade: 20 },
  { padrao: 'FINANCIAMENTO|HABITACIONAL', categoria: 'Dívida', tags: 'financiamento', prioridade: 20 },
  { padrao: 'CONDOMINIO', categoria: 'Casa', tags: 'condominio', prioridade: 20 },
  { padrao: 'ENERGISA|ENEL|CPFL|ELEKTRO|CEMIG|COPEL|CELESC|EQUATORIAL|NEOENERGIA|COELBA|ENERGIA ELETRICA', categoria: 'Casa', tags: 'energia', prioridade: 20 },
  { padrao: 'SABESP|SANEPAR|COPASA|CEDAE|EMBASA|CASAN|SANEAMENTO', categoria: 'Casa', tags: 'agua', prioridade: 20 },
  { padrao: 'INTERNET|TELECOM|BANDA LARGA|\\b(CLARO|VIVO|TIM|OI)\\b', categoria: 'Casa', tags: 'internet', prioridade: 20 },
  { padrao: 'DA REC FED|DARF|RECEITA FEDERAL', categoria: 'Dívida', tags: 'irpf', prioridade: 20 },
  { padrao: 'PREFEITURA|IPTU', categoria: 'Dívida', tags: 'iptu', prioridade: 20 },
  { padrao: 'IPVA|DETRAN', categoria: 'Dívida', tags: 'ipva', prioridade: 20 },

  // dia a dia
  { padrao: 'PILATES|ACADEMIA|FITNESS|SMARTFIT|GYMPASS|WELLHUB', categoria: 'Saúde', tags: 'academia', prioridade: 20 },
  { padrao: 'DROGASIL|DROGA RAIA|PAGUE MENOS|DROGARIA|FARMACIA|CLINICA|HOSPITAL|LABORATORIO', categoria: 'Saúde', prioridade: 25 },
  { padrao: 'POSTO|AUTOPOSTO|AUTO POSTO|IPIRANGA|SHELL|PETROBRAS|ESTACIONAMENTO|\\bUBER\\b|\\b99\\b', categoria: 'Transporte', prioridade: 25 },
  { padrao: 'SUPERMERCADO|MERCADO|PAO DE ACUCAR|CARREFOUR|ASSAI|ATACADAO|PADARIA|HORTIFRUTI', categoria: 'Mercado', prioridade: 25 },
  { padrao: 'IFOOD|RESTAURANTE|PIZZARIA|LANCHES|BURGER|BURGUER|PASTEL|CHURRASCARIA|CAFE|CAFÉ|SORVETERIA', categoria: 'Restaurantes', prioridade: 25 },
  { padrao: 'NETFLIX|SPOTIFY|PRIME VIDEO|DISNEY|HBO|\\bMAX\\b|GLOBOPLAY|YOUTUBE|STEAM|PLAYSTATION|XBOX|CINEMA|INGRESSO|TEATRO', categoria: 'Lazer', prioridade: 25 },
  { padrao: 'ESCOLA|FACULDADE|UNIVERSIDADE|CURSO|UDEMY|ALURA', categoria: 'Educação', prioridade: 25 },
  { padrao: 'AMAZON|MERCADOLIVRE|MERCADO LIVRE|SHOPEE|ALIEXPRESS|MAGAZINE|RENNER|C&A|RIACHUELO|ZARA|SHEIN', categoria: 'Compras', prioridade: 30 },
];

// só em banco sem nenhuma regra (primeira inicialização)
function seedRegras() {
  const n = db.prepare('SELECT COUNT(*) c FROM regras').get().c;
  if (n > 0) return;
  const ins = db.prepare("INSERT INTO regras (padrao, campo, categoria, tags, natureza, prioridade) VALUES (?, 'descricao', ?, ?, ?, ?)");
  for (const r of REGRAS) ins.run(r.padrao, r.categoria || null, r.tags || null, r.natureza || null, r.prioridade || 100);
}

// a recategorização global foi removida em 15/10/2026: ela reescrevia a natureza de todas as transações,
// inclusive as que vieram classificadas pela AUVP. Cada transação é classificada uma vez, quando entra (motor-regras.js).

if (require.main === module) {
  seedRegras();
}

module.exports = { seedRegras, REGRAS };
