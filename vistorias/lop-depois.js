/* ══════════════════════════════════════════════════════════════════════════
   Vistorias dentro do LOP - Gestão Rápida — roda DEPOIS do app, por último.

   O login é o do LOP: esta página não guarda nem renova sessão. A cada chamada
   ela pede o token atual ao cliente do app principal (window.parent.grCliente),
   igual à área Manutenções — assim só UM lugar renova a sessão.
   Toda chamada ao banco vai para o esquema "vistorias".
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
  const ESQUEMA = "vistorias";
  const principal = () => {
    try { return window.parent && window.parent !== window ? window.parent.grCliente : null; }
    catch (e) { return null; }
  };
  async function sessaoDoLop(){
    const c = principal(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data ? data.session : null; }
    catch (e) { return null; }
  }

  /* ─── login emprestado ─── */
  renovar = async function(){ return true; };
  comToken = async function(){
    const s = await sessaoDoLop();
    if (s && s.access_token) {
      sessao = { token: s.access_token, refresh: "", expira: Infinity,
                 email: (s.user && s.user.email) || (sessao && sessao.email) || "", uid: s.user && s.user.id };
    }
    if (!sessao || !sessao.token) throw new Error("sem-sessao");
    return { "apikey": cfg.key, "Authorization": "Bearer " + sessao.token };
  };

  /* ─── banco: esquema da área ─── */
  rest = async function(caminho, opts = {}){
    const h = await comToken();
    const r = await fetch(`${cfg.url}/rest/v1/${caminho}`, {
      ...opts,
      headers: { ...h, "Content-Type": "application/json",
                 "Accept-Profile": ESQUEMA, "Content-Profile": ESQUEMA, ...(opts.headers || {}) }
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt || ("Erro " + r.status));
    return txt ? JSON.parse(txt) : null;
  };

  /* ─── contas: quem entra é cuidado em Configurações do LOP ─── */
  const _chamarFuncao = chamarFuncao;
  chamarFuncao = async function(nome, corpo){
    if (nome === "contas") {
      if (corpo && corpo.acao === "listar") {
        const lista = await rest("rpc/contas_da_area", { method: "POST", body: "{}" });
        return { contas: (lista || []).map(c => ({ id: c.id, email: c.email, nome: c.nome, bloqueado: false })) };
      }
      throw new Error("Quem entra no Vistorias é definido no LOP: Configurações · quem entra e o que vê.");
    }
    return _chamarFuncao(nome, corpo);
  };

  /* ─── administrador da área: o banco decide (admin do LOP conta) ─── */
  const _carregarRegras = carregarRegras;
  carregarRegras = async function(){
    const r = await _carregarRegras.apply(this, arguments);
    try { if (await rest("rpc/eh_admin", { method: "POST", body: "{}" }) === true) souAdmin = true; } catch (e) {}
    return r;
  };

  /* ─── sair do LOP fecha a área ─── */
  const c = principal();
  if (c) c.auth.onAuthStateChange(ev => {
    if (ev === "SIGNED_OUT") {
      sessao = null; document.body.innerHTML = '<p style="padding:24px;font-family:Arial">Sessão encerrada.</p>';
    }
  });

  /* ─── entrada ─── */
  (async () => {
    const s = await sessaoDoLop();
    if (!s) {
      document.body.innerHTML = '<p style="padding:24px;font-family:Arial">Entre pelo LOP - Gestão Rápida para abrir Vistorias e Segurança.</p>';
      return;
    }
    sessao = { token: s.access_token, refresh: "", expira: Infinity,
               email: (s.user && s.user.email) || "", uid: s.user && s.user.id };
    try { await abrirApp(); } catch (e) { console.error("abrir a área:", e); }
  })();

  /* o LOP chama isto ao tocar de novo em "Vistorias e Segurança" */
  window.voltarAoInicioDaArea = () => { try { aba("vistoria"); } catch (e) {} window.scrollTo(0, 0); };
})();
