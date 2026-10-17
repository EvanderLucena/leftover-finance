// tela de entrar: cria a conta na primeira vez; depois, só entra
const enviar = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || r.statusText); return j; });

function ligar(form, fn) {
  form.hidden = false;
  form.querySelector('input').focus();
  form.onsubmit = async e => {
    e.preventDefault();
    const erro = form.querySelector('.entrar-erro');
    const botao = form.querySelector('button');
    erro.textContent = '';
    botao.disabled = true;
    try { await fn(Object.fromEntries(new FormData(form))); location.href = '/'; }
    catch (err) { erro.textContent = err.message; botao.disabled = false; }
  };
}

fetch('/api/acesso/estado').then(r => r.json()).then(est => {
  if (est.tem_conta) return ligar(document.getElementById('f-entrar'), d => enviar('/api/acesso/entrar', d));
  if (est.precisa_codigo) document.getElementById('campo-codigo').hidden = false;
  ligar(document.getElementById('f-criar'), d => {
    if (d.senha !== d.senha2) throw new Error('as duas senhas não são iguais');
    return enviar('/api/acesso/criar', { usuario: d.usuario, senha: d.senha, codigo: d.codigo });
  });
});
