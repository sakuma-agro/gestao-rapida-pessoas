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
    try { window.parent.vistMolduraPronta && window.parent.vistMolduraPronta(); } catch (e) {}
    avisarNumeros();
  })();

  /* o LOP chama isto ao tocar de novo em "Vistorias e Segurança": volta à
     tela inicial da área, como o Pessoas */
  window.voltarAoInicioDaArea = () => { try { aba("inicio"); } catch (e) {} window.scrollTo(0, 0); };

  /* ─── menu no topo do LOP (14/10/2026) ───
     Os módulos e submódulos ficam no topo do LOP (js/areas.js de lá). Cada
     troca de aba aqui — inclusive pelos atalhos da tela inicial — avisa o
     topo, que acompanha. */
  const pai = () => { try { return window.parent !== window ? window.parent : null; } catch (e) { return null; } };
  /* Qual tela do topo corresponde ao que está aberto aqui (null = o topo
     decide: ex. editando um antes e depois que já existia). */
  function telaAtual(qual){
    try {
      if (qual === "an") {
        const v = anVista === "previa" ? anVoltar : anVista;
        return { apontamento: "vsAnNovo", painel: "vsAnAberto", historico: "vsAnHist" }[v] || null;
      }
      if (qual === "ad") {
        if (!document.getElementById("ad-form").hidden) return adAtual && adAtual._novo ? "vsAdNovo" : null;
        if (adFiltro.vista === "historico") return "vsAdHist";
        return adFiltro.sit === "concluidos" ? "vsAdFechados" : "vsAdAberto";
      }
    } catch (e) {}
    return undefined;   // as outras abas: o topo acha pela aba
  }
  const _abaLop = aba;
  aba = function(qual){
    _abaLop.apply(this, arguments);
    try { const p = pai(); if (p && p.vistAbaMudou) p.vistAbaMudou(qual, telaAtual(qual)); } catch (e) {}
  };

  /* O topo pede uma tela de Anomalias ou de Antes e Depois. Devolve false
     para as outras (o topo aperta a aba). */
  window.vsIr = function(tela){
    const an = { vsAnNovo: "apontamento", vsAnAberto: "painel", vsAnHist: "historico" }[tela];
    if (an) {
      anVista = an;
      if (an === "painel") anFiltro.sit = "abertas";
      document.getElementById("t-an").click();
      return true;
    }
    if (tela === "vsAdNovo") { adAtual = adNovo(); adMostrar("form"); return true; }
    const ad = { vsAdAberto: ["aguardando", "grade"], vsAdFechados: ["concluidos", "grade"], vsAdHist: ["todos", "historico"] }[tela];
    if (ad) { adFiltro.sit = ad[0]; adFiltro.vista = ad[1]; adMostrar("lista"); return true; }
    return false;
  };

  /* Números das abas (Em aberto, Anomalias, Extintores) para a faixa do topo. */
  function avisarNumeros(){
    const p = pai(); if (!p || !p.vistNumeros) return;
    const n = id => { const el = document.getElementById(id);
      return el && !el.hidden ? (parseInt(el.textContent, 10) || 0) : 0; };
    try { p.vistNumeros({ vsAberto: n("cont-aberto"), vsAnAberto: n("cont-an"), vsAdAberto: n("cont-ad"), vsEx: n("cont-ex") }); } catch (e) {}
  }
  let esperaNum = null;
  const observar = () => {
    const ob = new MutationObserver(() => { clearTimeout(esperaNum); esperaNum = setTimeout(avisarNumeros, 150); });
    ["cont-aberto", "cont-an", "cont-ad", "cont-ex"].forEach(id => {
      const el = document.getElementById(id);
      if (el) ob.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    });
  };

  /* Abrir, Salvar e Imprimir: do topo (que some aqui) para o alto da tela
     Vistoria. São os mesmos botões, com as mesmas funções. O "Abrir vistoria"
     é criado pelo vistorias.js no DOMContentLoaded, por isso a espera. */
  function moverAcoes(){
    const painel = document.getElementById("painel-vistoria");
    if (!painel || document.querySelector(".lop-acoes")) return;
    const barra = document.createElement("div");
    barra.className = "lop-acoes";
    ["bt-abrir-vistoria", "bt-salvar", "bt-pdf"].forEach(id => {
      const b = document.getElementById(id); if (b) barra.appendChild(b);
    });
    painel.insertBefore(barra, painel.firstChild);
  }
  /* ─── rascunho que ficou no app antigo (14/10/2026) ───
     Um relatório de anomalias foi feito no app antigo na hora da mudança e
     não chegou a ser salvo: ficou só no aparelho, como rascunho (com as fotos
     dentro). O app antigo e o LOP moram no mesmo endereço, então daqui dá para
     ler esse rascunho e trazê-lo para o LOP — aí é só conferir e Salvar. */
  const TIPOS_ANTIGOS = [
    { chave: "sakuma-an-rascunho", nome: "relatório de anomalias",
      tem: r => !!r && (!!String(r.local || "").trim() || (r.itens || []).some(i => String(i.problema || "").trim() || i._fotoSrc || i.foto)),
      resumo: r => [r.local || "sem local", (r.itens || []).length + " anomalia" + ((r.itens || []).length === 1 ? "" : "s"),
                    r.data ? String(r.data).split("-").reverse().join("/") : ""].filter(Boolean).join(" · "),
      abrir: r => { anAtual = r; anVista = "apontamento"; document.getElementById("t-an").click(); } },
    { chave: "sakuma-ad-rascunho", nome: "antes e depois",
      tem: r => !!r && (!!String(r.titulo || "").trim() || !!r._antesSrc || !!r._depoisSrc),
      resumo: r => [r.titulo || "sem título", r.unidade, r.data_antes ? String(r.data_antes).split("-").reverse().join("/") : ""].filter(Boolean).join(" · "),
      abrir: r => { adAtual = r; adMostrar("form"); } },
  ];
  function rascunhosAntigos(){
    const real = window.VS_LS_REAL; if (!real) return [];
    const ler = k => { try { const t = real.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
    return TIPOS_ANTIGOS.map(t => {
      const velho = ler(t.chave);
      if (!t.tem(velho)) return null;
      if (real.getItem(t.chave + ":levado-lop") === String(velho.id)) return null;   // já trazido
      const aqui = ler("lopvs:" + t.chave);
      return { t, velho, ocupado: t.tem(aqui) && String(aqui.id) !== String(velho.id) };
    }).filter(Boolean);
  }
  function mostrarTrazer(){
    document.querySelectorAll(".lop-trazer").forEach(x => x.remove());
    const palco = document.querySelector("main.palco"); if (!palco) return;
    rascunhosAntigos().forEach(({ t, velho, ocupado }) => {
      const d = document.createElement("div");
      d.className = "lop-trazer";
      d.innerHTML = `<span>Neste aparelho ficou um <b>${t.nome}</b> feito no app antigo e ainda não salvo: <b>${esc(t.resumo(velho))}</b>.`
        + (ocupado ? ` Salve ou descarte antes o ${t.nome} que está aberto aqui no LOP.` : "") + `</span>`
        + `<button class="bt bt-forte" type="button"${ocupado ? " disabled" : ""}>Trazer para o LOP</button>`;
      d.querySelector("button").onclick = () => {
        const real = window.VS_LS_REAL;
        const r = JSON.parse(JSON.stringify(velho));
        r._novo = true; r.codigo = "";      // entra como novo no LOP, com o número do LOP
        try { real.setItem("lopvs:" + t.chave, JSON.stringify(r)); real.setItem(t.chave + ":levado-lop", String(velho.id)); } catch (e) {}
        d.remove();
        t.abrir(r);
        toast("Trouxe o rascunho do app antigo. Confira e toque em Salvar.");
      };
      palco.insertBefore(d, palco.firstChild);
    });
  }

  const depoisDoCarregar = () => { setTimeout(() => { moverAcoes(); observar(); avisarNumeros(); mostrarTrazer(); }, 0); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", depoisDoCarregar);
  else depoisDoCarregar();
})();
