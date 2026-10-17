// Esqueceu a senha: apaga a conta do app (os dados financeiros ficam). Na próxima vez que abrir o app,
// ele pede para criar o acesso de novo. Uso: npm run nova-senha (na pasta app, no computador onde o app roda)
const db = require('../db');
db.prepare("DELETE FROM config WHERE chave IN ('acesso_usuario', 'acesso_senha')").run();
try { db.exec('DELETE FROM sessoes'); } catch (e) { /* tabela ainda não existe */ }
console.log('Acesso apagado. Abra o app neste computador e crie usuário e senha de novo. Seus dados continuam lá.');
