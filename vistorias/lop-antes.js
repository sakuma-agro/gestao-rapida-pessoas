/* ══════════════════════════════════════════════════════════════════════════
   Vistorias dentro do LOP - Gestão Rápida — roda ANTES do app.
   (só entra na montagem da pasta vistorias/ do LOP; o app avulso não usa)

   • Base: o banco do LOP. As tabelas da área ficam no esquema "vistorias".
   • Guarda do aparelho separada: o LOP e o app antigo moram no mesmo endereço
     (sakuma-agro.github.io), então tudo o que o Vistorias grava no aparelho
     ganha o prefixo "lopvs:" — o rascunho de um não aparece no outro.
   • Sem portão de login: quem entra é quem já entrou no LOP.
   ══════════════════════════════════════════════════════════════════════════ */
window.VS_LOP = true;
window.SAKUMA_BASE = {
  url: "https://ysvmfmnwbcxgsrjewwsy.supabase.co",
  key: "sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn"
};

(function(){
  var real = window.localStorage, P = "lopvs:";
  var guarda = {
    getItem: function(k){ return real.getItem(P + k); },
    setItem: function(k, v){ return real.setItem(P + k, v); },
    removeItem: function(k){ return real.removeItem(P + k); },
    clear: function(){
      Object.keys(real).forEach(function(k){ if (k.indexOf(P) === 0) real.removeItem(k); });
    },
    key: function(i){
      var ks = Object.keys(real).filter(function(k){ return k.indexOf(P) === 0; });
      return ks[i] == null ? null : ks[i].slice(P.length);
    },
    get length(){ return Object.keys(real).filter(function(k){ return k.indexOf(P) === 0; }).length; }
  };
  try { Object.defineProperty(window, "localStorage", { configurable: true, get: function(){ return guarda; } }); }
  catch (e) { console.warn("guarda separada indisponível", e); }

  /* nada de service worker próprio: quem guarda o app para usar sem sinal é o do LOP */
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.register = function(){ return Promise.resolve(); };
  } catch (e) {}

  var s = document.createElement("style");
  s.textContent = "#portao{display:none!important}body.travado{overflow:auto!important}"
    + "#bt-instalar,#bt-sair,#sec-contas{display:none!important}";
  document.head.appendChild(s);
})();
