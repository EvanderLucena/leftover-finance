# Leftover Finance — Gestão Financeira & Projeção de Fluxo de Caixa

Sistema pessoal completo para controle de fluxo de caixa, gestão de contas bancárias, reconciliação de extratos e projeção de comprometimento futuro (cartões, parcelas e despesas fixas).

---

## 🚀 Principais Recursos

- **Painel Central de Finanças (Dashboard):**
  - Projeção de saldo futuro após quitação de faturas e compromissos.
  - Card analítico *"Para onde vai cada real"* com distribuição percentual (Faturas de Cartão, Fixos da Casa, Parcelas de Dívida e Gastos Variáveis).
  - Métricas de pressão orçamentária e sobra real líquida.

- **Inteligência de Cartões & Faturas:**
  - Modelo de identidade de parcelas: evita duplicação de faturas e compras futuras.
  - Sincronização e cálculo automático de faturas abertas por data de fechamento e vencimento.
  - Calendário e linha do tempo de dívidas e parcelas contratadas.

- **Conexão Open Finance & Extratos:**
  - Sincronização diária via Open Finance (AUVP / MCP).
  - Parser automático para faturas e extratos em PDF (Itaú, Nubank, Mercado Pago).
  - Motor de regras heurísticas para auto-categorização e conciliação de transações.

- **IA Assistente Financeira:**
  - Geração automática de diagnósticos orçamentários e sugestões de corte de custos.
  - Integração configurável com modelos locais ou remotos (DeepSeek, Ollama Cloud ou compatíveis com OpenAI).

- **100% Privado e Local:**
  - Banco de dados SQLite embarcado (`node:sqlite`), sem envio de extratos para serviços de terceiros não autorizados.
  - Arquitetura pronta para deploy seguro via Docker e Caddy com autenticação HTTP básica e HTTPS automático.

---

## 🛠️ Tecnologias

- **Backend:** Node.js (Express, `node:sqlite` nativo)
- **Frontend:** Vanilla JavaScript, HTML5, CSS3, Chart.js
- **Infraestrutura:** Docker, Docker Compose, Caddy 2

---

## 📦 Como Rodar Localmente

### Pré-requisitos
- Node.js 20+ instalado.

### Passo a passo
1. Clone o repositório:
   ```bash
   git clone https://github.com/EvanderLucena/leftover-finance.git
   cd leftover-finance/app
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente (opcional):
   ```bash
   cp .env.example .env
   ```

4. Inicie o servidor:
   ```bash
   npm start
   ```

5. Acesse no navegador: `http://localhost:3000`

---

## 🐳 Rodando com Docker

1. Navegue até o diretório da aplicação:
   ```bash
   cd app
   ```

2. Copie e configure o arquivo de ambiente:
   ```bash
   cp .env.example .env
   # Edite o .env informando o seu domínio e o hash da sua senha
   ```

3. Suba os containers com Docker Compose:
   ```bash
   docker compose up -d
   ```

O serviço iniciará a aplicação Node na porta interna 3000 e o Caddy nas portas 80/443 com reverse proxy e SSL automático.

---

## 🔒 Privacidade de Dados

Este repositório não inclui nem armazena extratos, bancos de dados pessoais ou credenciais bancárias. Todas as informações financeiras são mantidas estritamente no banco de dados SQLite local (`financas.db`), o qual é ignorado por padrão no `.gitignore`.

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais detalhes.
