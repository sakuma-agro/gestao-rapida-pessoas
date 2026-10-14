/* SAKUMA Vistorias — abrir e imprimir uma vistoria salva na base
   Arquivo separado de proposito: nao mexe no rascunho de quem esta usando o
   aparelho. Ele so monta o documento e manda para a impressora. */
(function(){
"use strict";

var GRAU_DOC={"Crítico":"c","Alto":"a","Médio":"m","Baixo":"b"};
var aberta=null;              /* vistoria carregada da base, ou null */
var renderDocOriginal=null;

function E(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function NL(s){return E(s).replace(/\n/g,"<br>");}
function dia(iso){
  if(!iso)return "—";
  var p=String(iso).slice(0,10).split("-");
  return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:String(iso);
}
function logo(){var i=document.querySelector("#logo-img");return i&&i.src?i.src:"";}

/* ─────────────────────────── situação de cada item ─────────────────────────── */

function situacao(it){
  if(it.status==="Concluído")return{cls:"p-feito",txt:"Encerrado"};
  if(typeof situacaoPrazo==="function"){
    var s=situacaoPrazo({status:it.status,prazoData:it.prazo_data});
    return{cls:s.cls,txt:(it.status==="Em andamento"?"Em andamento · ":"")+s.txt};
  }
  return{cls:"p-semprazo",txt:it.status||"Aberto"};
}

/* ─────────────────────────── a lista de vistorias ─────────────────────────── */

function estilos(){
  if(document.querySelector("#estilo-vistorias"))return;
  var st=document.createElement("style");
  st.id="estilo-vistorias";
  st.textContent=
    "#dlg-vistorias{max-width:920px;padding:20px 22px 18px}"+
    "#dlg-vistorias table{width:100%;table-layout:auto}"+
    "#dlg-vistorias td,#dlg-vistorias th{vertical-align:middle}"+
    "#dlg-vistorias td:first-child{min-width:210px}"+
    "#dlg-vistorias .cfg-cat{text-transform:none;font-size:12px;margin-top:2px}"+
    "#dlg-vistorias .cfg-tabela-env{overflow:auto}"+
    /* a faixa é comando de tela: não sai no papel */
    "@media print{#faixa-vistoria{display:none!important}}";
  document.head.appendChild(st);
}

function caixa(){
  var d=document.querySelector("#dlg-vistorias");
  if(d)return d;
  estilos();
  d=document.createElement("dialog");
  d.id="dlg-vistorias";
  d.innerHTML=''+
    '<div class="secao-topo" style="margin-bottom:12px">'+
      '<h2 style="margin:0">Vistorias salvas</h2>'+
      '<span class="dica">Escolha uma para ver o relatório completo e imprimir.</span>'+
    '</div>'+
    '<div class="filtros" style="margin-bottom:10px">'+
      '<div class="campo" style="flex:1;min-width:220px">'+
        '<label for="vs-busca">Buscar</label>'+
        '<input type="text" id="vs-busca" placeholder="unidade, código, técnico, setor…">'+
      '</div>'+
    '</div>'+
    '<div class="cfg-tabela-env" style="max-height:60vh"><div id="vs-lista"></div></div>'+
    '<div class="cfg-barra" style="margin-top:12px">'+
      '<button class="bt bt-fantasma" type="button" id="vs-fechar">Fechar</button>'+
      '<span class="cfg-salvo" id="vs-aviso"></span>'+
    '</div>';
  document.body.appendChild(d);
  d.querySelector("#vs-fechar").onclick=function(){d.close();};
  d.querySelector("#vs-busca").addEventListener("input",pintarLista);
  return d;
}

var cache={vistorias:[],resumo:{}};

function pintarLista(){
  var b=(document.querySelector("#vs-busca").value||"").toLowerCase().trim();
  var alvo=document.querySelector("#vs-lista");
  var lista=cache.vistorias.filter(function(v){
    if(!b)return true;
    return [v.codigo,v.unidade,v.setor,v.tecnico,v.motivo].join(" ").toLowerCase().indexOf(b)>=0;
  });
  if(!lista.length){
    alvo.innerHTML='<div class="vazio"><p>'+(cache.vistorias.length
      ?"Nenhuma vistoria com esse texto."
      :"Nenhuma vistoria salva na base ainda.")+'</p></div>';
    return;
  }
  alvo.innerHTML='<table class="cfg-anomalias"><thead><tr>'+
    '<th>Vistoria</th><th style="width:96px">Data</th>'+
    '<th style="width:150px">Técnico</th><th style="width:180px">Apontamentos</th>'+
    '<th style="width:104px"></th></tr></thead><tbody>'+
    lista.map(function(v){
      var r=cache.resumo[v.id]||{total:0,abertos:0,vencidos:0};
      var selo=r.vencidos
        ? '<span class="selo s-critico">'+r.vencidos+' vencido'+(r.vencidos>1?"s":"")+'</span>'
        : (r.abertos?'<span class="selo s-medio">'+r.abertos+' em aberto</span>'
                    :'<span class="selo s-baixo">tudo encerrado</span>');
      return '<tr>'+
        '<td><b>'+E(v.codigo||"—")+'</b>'+
          (/^Checklist/.test(v.motivo||"")?' <span class="selo s-baixo">'+E(v.motivo)+'</span>':"")+
          '<div class="cfg-cat">'+E(v.unidade||"—")+
          (v.setor?" · "+E(v.setor):"")+'</div></td>'+
        '<td>'+dia(v.data)+'</td>'+
        '<td>'+E(v.tecnico||"—")+'</td>'+
        '<td>'+r.total+' no total &nbsp; '+selo+'</td>'+
        '<td><button class="bt bt-forte" type="button" data-abrir-vistoria="'+E(v.id)+'">Abrir</button></td>'+
      '</tr>';
    }).join("")+'</tbody></table>';
}

async function abrirLista(){
  var d=caixa();
  document.querySelector("#vs-lista").innerHTML='<div class="vazio"><p>Carregando…</p></div>';
  document.querySelector("#vs-aviso").textContent="";
  if(!d.open)d.showModal();
  try{
    var vs=await rest("vistorias?select=*&order=data.desc,criado_em.desc&limit=300");
    var its=await rest("itens?select=vistoria_id,status,prazo_data&limit=5000");
    var r={};
    its.forEach(function(i){
      var x=r[i.vistoria_id]||(r[i.vistoria_id]={total:0,abertos:0,vencidos:0});
      x.total++;
      if(i.status!=="Concluído"){
        x.abertos++;
        if(i.prazo_data&&situacao({status:i.status,prazo_data:i.prazo_data}).cls==="p-vencido")x.vencidos++;
      }
    });
    cache.vistorias=vs;cache.resumo=r;
    pintarLista();
  }catch(e){
    document.querySelector("#vs-lista").innerHTML=
      '<div class="vazio"><p>'+E(recado(e))+'</p></div>';
  }
}

/* Offline a lista não tem como existir: ela mora na base. Dizer isso, e não
   "a sessão expirou", que manda a pessoa procurar problema onde não tem. */
function recado(e){
  var m=String(e&&e.message||"");
  if(typeof navigator!=="undefined"&&navigator.onLine===false)
    return "Sem internet neste momento. A lista de vistorias vem da base — "+
           "reconecte e tente de novo. O que você já preencheu continua guardado no aparelho.";
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))
    return "Não deu para falar com a base agora. Verifique a conexão e tente de novo.";
  if(m==="sem-sessao")return "A sessão expirou. Saia e entre de novo.";
  return "Não deu para ler a base agora: "+m.slice(0,120);
}

/* ─────────────────────────── montar o documento ─────────────────────────── */

function normasDo(it){
  var congeladas=it.normas_texto;
  if(Array.isArray(congeladas)&&congeladas.length)return congeladas;
  if(typeof normasDoItem==="function")return normasDoItem({normas:it.normas})||[];
  return [];
}

function ficha(it,i){
  var gd=GRAU_DOC[it.grau]||"m";
  var s=situacao(it);
  function foto(src,cls,leg){
    return src
      ? '<figure class="'+cls+'"><img src="'+src+'" alt="'+E(leg)+'"><figcaption>'+E(leg)+'</figcaption></figure>'
      : '<figure class="'+cls+'"><div class="sem">Sem registro fotográfico</div><figcaption>'+E(leg)+'</figcaption></figure>';
  }
  var normas=normasDo(it).map(function(n){
    var item=n.item&&n.item!=="—"?", item "+E(n.item):"";
    return '<div class="doc-norma"><b>'+E(n.ref)+item+
      (n.ok?"":'<span class="conf">confirmar item</span>')+'</b><i>'+E(n.txt)+'</i></div>';
  }).join("")||'<div class="doc-texto">Requisito não vinculado.</div>';

  var encerrado=it.status==="Concluído";
  var blocoEncerramento=encerrado
    ? '<dt>Encerramento</dt><dd>Encerrado em '+dia(it.encerrado_em)+
        (it.encerrado_obs?' — '+NL(it.encerrado_obs):"")+'</dd>'
    : "";

  return '<div class="ficha">'+
    '<div class="ficha-topo">'+
      '<span class="n">'+String(i+1).padStart(2,"0")+'</span>'+
      '<span class="t">'+E(it.titulo)+'</span>'+
      '<span class="g g-'+gd+'">'+E(it.grau)+'</span>'+
    '</div>'+
    '<div class="ficha-fotos">'+
      foto(it._fotoE,"e","Situação encontrada")+
      foto(it._fotoR,"r","Situação requerida")+
      (encerrado&&it._fotoC?foto(it._fotoC,"r","Evidência do encerramento"):"")+
    '</div>'+
    '<div class="ficha-campos"><dl>'+
      '<dt>Situação atual</dt><dd><span class="prazo '+s.cls+'">'+E(s.txt)+'</span></dd>'+
      '<dt>Localização</dt><dd>'+(E(it.local)||"—")+'</dd>'+
      '<dt>Situação encontrada</dt><dd>'+(NL(it.encontrada)||"—")+'</dd>'+
      '<dt>Risco associado</dt><dd>'+(NL(it.risco)||"—")+'</dd>'+
      '<dt>Requisito aplicável</dt><dd>'+normas+'</dd>'+
      '<dt>Situação requerida</dt><dd>'+(NL(it.requerida)||"—")+'</dd>'+
      '<dt>Ação corretiva</dt><dd>'+(NL(it.acao)||"—")+'</dd>'+
      '<dt>Prazo</dt><dd>'+(E(it.prazo)||"—")+(it.prazo_data?" · até "+dia(it.prazo_data):"")+'</dd>'+
      '<dt>Responsável</dt><dd>'+(E(it.responsavel)||"—")+'</dd>'+
      '<dt>Evidência de encerramento</dt><dd>'+(NL(it.evidencia)||"—")+'</dd>'+
      (it.pendencias&&it.pendencias.trim()?'<dt>Pendências</dt><dd>'+NL(it.pendencias)+'</dd>':"")+
      blocoEncerramento+
    '</dl></div>'+
  '</div>';
}

function checklistDoc(v){
  var blocos=Array.isArray(v.checklist)?v.checklist:[];
  if(!blocos.length)return "";
  var rot={C:"Conforme",NC:"Não conforme",NA:"Não se aplica","":"—"};
  return '<h2>Checklist da norma</h2>'+blocos.map(function(b,bi){
    var its=b.itens||[];
    var linhas=its.map(function(it){
      return '<tr class="'+(it.r==="NC"?"nc":"")+'">'+
        '<td>'+(bi+1)+'.'+it.n+' - '+E(it.txt)+
        (it.obs?'<div class="obs">Observação: '+E(it.obs)+'</div>':"")+'</td>'+
        '<td class="r">'+rot[it.r||""]+'</td></tr>';
    }).join("");
    var celulas=[];
    its.forEach(function(it){
      (it.fotos||[]).forEach(function(f){
        if(!f._url)return;
        celulas.push('<figure class="chk-doc-foto"><figcaption>'+E(it.txt)+
          '</figcaption><img src="'+f._url+'" alt=""></figure>');
      });
    });
    var fotos=celulas.length
      ? '<div class="chk-doc-faixa">Fotos do bloco — '+(b.ref?E(b.ref)+' · ':"")+E(b.titulo)+'</div>'+
        '<div class="chk-doc-fotos">'+celulas.join("")+'</div>'
      : "";
    return '<div class="chk-doc-bloco">'+
      '<div class="chk-doc-topo"><span class="n">'+(bi+1)+'</span>'+
      (b.ref?'<b>'+E(b.ref)+'</b> ':"")+E(b.titulo)+'</div>'+
      '<table class="chk-doc-tab"><tbody>'+linhas+'</tbody></table>'+fotos+'</div>';
  }).join("");
}

function documento(v,itens){
    /* relatório no modelo de visita técnica, montado pelo app (pdoc) */
  if(typeof window.pdocSalvo==="function")
    return window.pdocSalvo(v,itens,logo(),function(it){return situacao(it).txt;},normasDo);
  var g={"Crítico":0,"Alto":0,"Médio":0,"Baixo":0};
  itens.forEach(function(i){if(g[i.grau]!=null)g[i.grau]++;});
  var encerrados=itens.filter(function(i){return i.status==="Concluído";}).length;
  var vencidos=itens.filter(function(i){return situacao(i).cls==="p-vencido";}).length;
  var pend=itens.filter(function(i){return i.pendencias&&i.pendencias.trim();});
  var hoje=new Date();
  var hojeBR=String(hoje.getDate()).padStart(2,"0")+"/"+
    String(hoje.getMonth()+1).padStart(2,"0")+"/"+hoje.getFullYear();

  var resumoTexto=itens.length===0
    ? "Nenhuma não conformidade registrada nesta vistoria."
    : "Foram registrados "+itens.length+" apontamento"+(itens.length>1?"s":"")+" nesta vistoria"+
      (g["Crítico"]?", sendo "+g["Crítico"]+" de grau crítico com correção de prazo imediato":"")+
      ". A coluna Situação do plano de ação reflete o andamento apurado em "+hojeBR+
      ", e cada apontamento traz a evidência exigida para o seu encerramento.";

  var plano=itens.length?
    '<h2>Plano de ação consolidado</h2>'+
    '<div class="env-tabela"><table class="plano">'+
    '<thead><tr><th style="width:34px">Nº</th><th>Ação corretiva</th>'+
    '<th style="width:120px">Responsável</th><th style="width:92px">Prazo</th>'+
    '<th style="width:118px">Situação</th></tr></thead><tbody>'+
    itens.map(function(it,i){
      var s=situacao(it);
      return '<tr><td>'+String(i+1).padStart(2,"0")+'</td>'+
        '<td>'+(E(it.acao)||"—")+'</td>'+
        '<td>'+(E(it.responsavel)||"—")+'</td>'+
        '<td>'+(E(it.prazo)||"—")+'</td>'+
        '<td><span class="prazo '+s.cls+'">'+E(s.txt)+'</span></td></tr>';
    }).join("")+'</tbody></table></div>':"";

  var pendBloco=pend.length?
    '<h2>Pendências de verificação em campo</h2><div class="doc-texto">'+
    pend.map(function(it){
      return '<p style="margin:0 0 6px"><b>Item '+String(itens.indexOf(it)+1).padStart(2,"0")+
        '</b> — '+NL(it.pendencias)+'</p>';
    }).join("")+'</div>':"";

  return ''+
    '<div class="doc-cab"><img src="'+logo()+'" alt="SAKUMA Agronegócios"></div>'+
    '<div class="doc-titulo">'+
      '<h1>Relatório de Vistoria de Conformidade</h1>'+
      '<div class="dir"><b>'+(E(v.codigo)||"VIST-001")+'</b> · '+dia(v.data)+'<br>'+E(v.motivo||"")+'</div>'+
    '</div>'+
    '<div class="linha-fina">'+(E(v.unidade)||"Unidade não informada")+
      (v.setor?" · "+E(v.setor):"")+'</div>'+

    '<h2>Identificação</h2>'+
    '<div class="doc-ident">'+
      '<div><span>Unidade</span><b>'+(E(v.unidade)||"—")+'</b></div>'+
      '<div><span>Setor / área</span><b>'+(E(v.setor)||"—")+'</b></div>'+
      '<div><span>Data da vistoria</span><b>'+dia(v.data)+'</b></div>'+
      '<div><span>Técnico responsável</span><b>'+(E(v.tecnico)||"—")+'</b></div>'+
      '<div><span>Cargo</span><b>'+(E(v.cargo)||"—")+'</b></div>'+
      '<div><span>Situação apurada em</span><b>'+hojeBR+'</b></div>'+
      (v.hora_inicio||v.hora_fim?'<div><span>Início / fim</span><b>'+(E(v.hora_inicio)||"—")+' · '+(E(v.hora_fim)||"—")+'</b></div>':"")+
      (v.proprietario?'<div><span>Proprietário</span><b>'+E(v.proprietario)+'</b></div>':"")+
      (v.responsavel_turma?'<div><span>Responsável pela turma</span><b>'+E(v.responsavel_turma)+'</b></div>':"")+
      (v.colaboradores?'<div><span>Nº de colaboradores</span><b>'+E(String(v.colaboradores))+'</b></div>':"")+
    '</div>'+

    '<h2>Resumo</h2>'+
    '<div class="doc-resumo">'+
      '<div class="doc-res t"><b>'+itens.length+'</b><span>Apontamentos</span></div>'+
      '<div class="doc-res c"><b>'+g["Crítico"]+'</b><span>Crítico</span></div>'+
      '<div class="doc-res a"><b>'+g["Alto"]+'</b><span>Alto</span></div>'+
      '<div class="doc-res m"><b>'+g["Médio"]+'</b><span>Médio</span></div>'+
      '<div class="doc-res b"><b>'+g["Baixo"]+'</b><span>Baixo</span></div>'+
    '</div>'+
    '<div class="doc-resumo" style="margin-top:8px">'+
      '<div class="doc-res b"><b>'+encerrados+'</b><span>Encerrados</span></div>'+
      '<div class="doc-res c"><b>'+vencidos+'</b><span>Vencidos</span></div>'+
      '<div class="doc-res t"><b>'+(itens.length-encerrados)+'</b><span>Em aberto</span></div>'+
    '</div>'+
    '<div class="doc-texto">'+E(resumoTexto)+'</div>'+

    checklistDoc(v)+
    (itens.length?'<h2>Não conformidades</h2>'+itens.map(ficha).join(""):"")+
    plano+pendBloco+
    (v.observacoes&&String(v.observacoes).trim()
      ? '<h2>Observações do técnico</h2><div class="doc-texto">'+NL(v.observacoes)+'</div>' : "")+

    '<div class="doc-rodape">'+
      '<div><span>Aprovado</span><b>'+(E(v.aprovador)||"—")+'</b><br>'+E(v.aprovador_cargo||"")+'</div>'+
      '<div><span>Responsável do setor</span><b>'+(E(v.responsavel_turma)||"—")+'</b></div>'+
      '<div style="text-align:right"><span>Feito por</span><b>'+(E(v.tecnico)||"—")+'</b><br>'+
        E(v.cargo||"")+(v.tecnico_registro?" · Registro "+E(v.tecnico_registro):"")+'</div>'+
    '</div>'+
    '<div class="doc-cod">'+(E(v.codigo)||"VIST-001")+' · Relatório de Vistoria · SAKUMA Agronegócios</div>'+
    (typeof window.docLop==="function"?window.docLop():"");
}

/* ─────────────────────────── faixa de aviso no topo ─────────────────────────── */

function faixa(v){
  var f=document.querySelector("#faixa-vistoria");
  if(!f){
    estilos();
    f=document.createElement("div");
    f.id="faixa-vistoria";
    f.style.cssText="display:flex;gap:12px;align-items:center;flex-wrap:wrap;"+
      "background:var(--medio-bg,#FFF4E0);border:1px solid var(--medio,#C98A22);"+
      "border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:13.5px";
    var doc=document.querySelector("#doc");
    doc.parentNode.insertBefore(f,doc);
  }
  f.innerHTML='<b style="flex:1;min-width:200px">'+(/^Checklist/.test(v.motivo||"")?E(v.motivo)+" ":"Vistoria ")+E(v.codigo||"")+
    ' · '+E(v.unidade||"")+' · '+dia(v.data)+' · '+E(v.tecnico||"")+'</b>'+
    '<button class="bt bt-forte" type="button" id="fx-imprimir">Imprimir / PDF</button>'+
    '<button class="bt bt-fantasma" type="button" id="fx-voltar">Voltar para a minha vistoria</button>';
  f.hidden=false;
  f.querySelector("#fx-imprimir").onclick=function(){setTimeout(function(){window.print();},120);};
  f.querySelector("#fx-voltar").onclick=fechar;
}

function fechar(){
  aberta=null;
  var f=document.querySelector("#faixa-vistoria");
  if(f)f.hidden=true;
  if(renderDocOriginal)renderDocOriginal();
}

/* ─────────────────────────── abrir uma vistoria ─────────────────────────── */

async function abrir(id){
  var d=document.querySelector("#dlg-vistorias");
  var aviso=document.querySelector("#vs-aviso");
  if(aviso)aviso.textContent="Carregando a vistoria…";
  try{
    var v=cache.vistorias.filter(function(x){return x.id===id;})[0];
    var itens=await rest("itens?vistoria_id=eq."+encodeURIComponent(id)+"&select=*&order=ordem.asc");
    if(aviso)aviso.textContent="Buscando as fotos…";
    for(var i=0;i<itens.length;i++){
      var it=itens[i];
      it._fotoE=it.foto_encontrada?await urlDaFoto(it.foto_encontrada):"";
      it._fotoR=it.foto_requerida?await urlDaFoto(it.foto_requerida):"";
      it._fotoC=it.foto_encerramento?await urlDaFoto(it.foto_encerramento):"";
    }
    var blocos=Array.isArray(v.checklist)?v.checklist:[];
    for(var b=0;b<blocos.length;b++){
      var its=blocos[b].itens||[];
      for(var k=0;k<its.length;k++){
        var fs=its[k].fotos||[];
        for(var f=0;f<fs.length;f++)
          fs[f]._url=fs[f].path?await urlDaFoto(fs[f].path):"";
      }
    }
    aberta={v:v,itens:itens};
    if(d&&d.open)d.close();
    pintar();
    if(typeof aba==="function")aba("relatorio");
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(e){
    if(aviso)aviso.textContent=recado(e);
  }
}

function pintar(){
  if(!aberta)return;
  document.querySelector("#doc").innerHTML=documento(aberta.v,aberta.itens);
  faixa(aberta.v);
}

/* ─────────────────────────── ligações com o app ─────────────────────────── */

function ligar(){
  if(typeof rest!=="function"||typeof renderDoc!=="function"){
    setTimeout(ligar,400);return;
  }

  /* Enquanto uma vistoria da base estiver aberta, qualquer pedido de
     "montar o relatório" — inclusive o botão Imprimir do topo e a aba
     Relatório — monta a dela, não o rascunho deste aparelho. */
  renderDocOriginal=window.renderDoc;
  window.renderDoc=function(){
    if(aberta){pintar();return;}
    var f=document.querySelector("#faixa-vistoria");
    if(f)f.hidden=true;
    return renderDocOriginal.apply(this,arguments);
  };

  var acoes=document.querySelector(".acoes");
  if(acoes&&!document.querySelector("#bt-abrir-vistoria")){
    var b=document.createElement("button");
    b.className="bt";b.type="button";b.id="bt-abrir-vistoria";
    b.title="Ver e imprimir uma vistoria salva na base";
    var alvo=document.querySelector("#bt-salvar");
    if(alvo)acoes.insertBefore(b,alvo);else acoes.appendChild(b);
    b.onclick=abrirLista;
    /* no celular a barra do topo é estreita: rótulo curto para não quebrar linha */
    var rotular=function(){
      b.textContent=(window.innerWidth<=760)?"Abrir":"Abrir vistoria";
    };
    rotular();
    window.addEventListener("resize",rotular);
    window.addEventListener("orientationchange",rotular);
  }

  document.addEventListener("click",function(ev){
    var t=ev.target.closest&&ev.target.closest("[data-abrir-vistoria]");
    if(t){ev.preventDefault();abrir(t.getAttribute("data-abrir-vistoria"));}
  });
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ligar);
else ligar();

})();
