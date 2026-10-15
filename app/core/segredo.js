// Cofre da chave da AUVP: um lugar só, fora da pasta do projeto, para não ir parar em backups, cópias do banco ou no git.
// Windows: criptografada com DPAPI (só o seu usuário do Windows nesta máquina consegue abrir).
// Outros sistemas: arquivo com permissão só para o dono (600).
// FINFLOW_COFRE troca a pasta (testes); AUVP_KEY no ambiente continua tendo prioridade.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const WIN = process.platform === 'win32';
const pasta = () => process.env.FINFLOW_COFRE
  || (WIN ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'FinFlow') : path.join(os.homedir(), '.config', 'finflow'));
const arquivo = () => path.join(pasta(), WIN ? 'auvp-chave.dpapi' : 'auvp-chave');

// o segredo passa pela entrada padrão e o caminho por variável de ambiente: nada aparece na linha de comando
function powershell(script, entrada) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: entrada || '', encoding: 'utf8', env: { ...process.env, FINFLOW_ARQ: arquivo(), PSModulePath: undefined }, windowsHide: true
  });
  if (r.status !== 0) throw new Error('cofre do Windows falhou: ' + (r.stderr || r.error || '').toString().trim().split('\n')[0]);
  return r.stdout;
}

// direto na API do Windows (System.Security), sem depender de módulos do PowerShell
const DPAPI = 'Add-Type -AssemblyName System.Security; ';
let cache;
function lerChave() {
  if (cache !== undefined) return cache;
  if (!fs.existsSync(arquivo())) return (cache = null);
  cache = WIN
    ? powershell(DPAPI + "$b = [Convert]::FromBase64String((Get-Content -Raw $env:FINFLOW_ARQ).Trim()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b, $null, 'CurrentUser')))").trim() || null
    : fs.readFileSync(arquivo(), 'utf8').trim() || null;
  return cache;
}

function gravarChave(chave) {
  chave = String(chave || '').trim();
  if (!chave) throw new Error('chave vazia');
  fs.mkdirSync(pasta(), { recursive: true, mode: 0o700 });
  if (WIN) powershell(DPAPI + "$t = [Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd().Trim()); [IO.File]::WriteAllText($env:FINFLOW_ARQ, [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($t, $null, 'CurrentUser')))", chave);
  else fs.writeFileSync(arquivo(), chave, { mode: 0o600 });
  cache = chave;
}

module.exports = { lerChave, gravarChave, arquivoDaChave: arquivo };
