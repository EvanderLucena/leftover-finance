// Acesso ao app: uma conta (usuário e senha) por instalação, sessão por cookie e onde o app escuta.
// Modo 'pc': só este computador abre o app (127.0.0.1). Modo 'casa': qualquer aparelho da rede de casa.
// Sem dependência nova: senha com scrypt (node:crypto), sessão guardada só como hash.
const crypto = require('node:crypto');
const os = require('node:os');
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  expira TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const COOKIE = 'lf_sessao';
const DIAS_SESSAO = 90;
const cfg = k => { const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(k); return r ? r.valor : null; };
const setCfg = (k, v) => db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(k, String(v));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// banco que já tinha dados antes do assistente existir: não passa pelo assistente de novo
if (cfg('setup_ok') == null && db.prepare('SELECT COUNT(*) n FROM transacoes').get().n > 0) setCfg('setup_ok', '1');

const temConta = () => !!cfg('acesso_senha');
const usuario = () => cfg('acesso_usuario');

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt:${sal.toString('hex')}:${h.toString('hex')}`;
}
function confere(senha, guardado) {
  const [, sal, h] = String(guardado || '').split(':');
  if (!sal || !h) return false;
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'hex'), 64);
  const esperado = Buffer.from(h, 'hex');
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

function validar(usr, senha) {
  if (!usr || !String(usr).trim()) return 'escolha um nome de usuário';
  if (!senha || String(senha).length < 6) return 'a senha precisa de pelo menos 6 caracteres';
  return null;
}
function criarConta(usr, senha) {
  setCfg('acesso_usuario', String(usr).trim());
  setCfg('acesso_senha', hashSenha(senha));
}
function trocarSenha(nova) {
  setCfg('acesso_senha', hashSenha(nova));
  db.exec('DELETE FROM sessoes'); // derruba as outras sessões abertas
}

function novaSessao() {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO sessoes (token_hash, expira) VALUES (?, datetime('now', ?))").run(sha(token), `+${DIAS_SESSAO} days`);
  db.exec("DELETE FROM sessoes WHERE expira < datetime('now')");
  return token;
}
const lerCookie = req => {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
};
const sessaoValida = token => !!token && !!db.prepare("SELECT 1 FROM sessoes WHERE token_hash = ? AND expira > datetime('now')").get(sha(token));
const cookieSessao = token => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS_SESSAO * 86400}`;
const cookieSair = () => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
function encerrarSessao(req) { const t = lerCookie(req); if (t) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sha(t)); }

const deste_pc = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// código de instalação: criar a conta por outro aparelho (Docker, servidor sem tela) exige o código
// que aparece no terminal; neste PC não precisa
let codigoInstalacao = null;
function codigo() {
  if (temConta()) return null;
  if (!codigoInstalacao) codigoInstalacao = String(crypto.randomInt(100000, 1000000));
  return codigoInstalacao;
}

// tentativas de senha errada: 5 por aparelho, depois espera 1 minuto
const erros = new Map();
function bloqueado(ip) { const e = erros.get(ip); return e && e.n >= 5 && Date.now() - e.em < 60e3; }
function errou(ip) { const e = erros.get(ip) || { n: 0, em: 0 }; if (Date.now() - e.em > 60e3) e.n = 0; e.n++; e.em = Date.now(); erros.set(ip, e); }

// o que abre sem entrar: a tela de entrar e o que ela usa
const LIVRES = new Set(['/entrar.html', '/entrar.js', '/style.css', '/logo.svg', '/api/acesso/estado', '/api/acesso/criar', '/api/acesso/entrar']);
function exigirSessao(req, res, next) {
  if (LIVRES.has(req.path)) return next();
  if (sessaoValida(lerCookie(req))) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'entre no app primeiro', entrar: true });
  res.redirect('/entrar.html');
}

// onde o servidor escuta. FINANCA_HOST fixa (Docker usa 0.0.0.0, e aí quem decide é a rede do Docker)
const hostFixo = () => process.env.FINANCA_HOST || null;
const modo = () => (hostFixo() ? (['127.0.0.1', 'localhost', '::1'].includes(hostFixo()) ? 'pc' : 'casa') : (cfg('acesso_modo') === 'casa' ? 'casa' : 'pc'));
const host = () => hostFixo() || (modo() === 'casa' ? '0.0.0.0' : '127.0.0.1');
const definirModo = m => setCfg('acesso_modo', m === 'casa' ? 'casa' : 'pc');

// endereços deste computador na rede de casa (para abrir no celular). No Docker o container não sabe o IP
// da máquina: vale FINANCA_ENDERECO, se a pessoa informar
function enderecosRede() {
  if (process.env.FINANCA_ENDERECO) return [process.env.FINANCA_ENDERECO];
  if (require('node:fs').existsSync('/.dockerenv')) return [];
  const out = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (/^169\.254\./.test(i.address)) continue; // sem rede de verdade
      if (/vEthernet|VirtualBox|VMware|WSL|docker|br-|veth|Hyper-V/i.test(nome)) continue;
      out.push(i.address);
    }
  }
  // rede de casa primeiro (192.168.x, 10.x)
  return out.sort((a, b) => (/^192\.168\./.test(b) - /^192\.168\./.test(a)));
}

module.exports = {
  temConta, usuario, validar, criarConta, confere, trocarSenha, senhaGuardada: () => cfg('acesso_senha'),
  novaSessao, cookieSessao, cookieSair, encerrarSessao, exigirSessao, deste_pc, codigo,
  bloqueado, errou, limparErros: ip => erros.delete(ip),
  modo, host, hostFixo, definirModo, enderecosRede,
  setupOk: () => cfg('setup_ok') === '1', concluirSetup: () => setCfg('setup_ok', '1')
};
