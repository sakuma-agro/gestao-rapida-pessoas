// areas.js — as áreas do LOP - Gestão Rápida (09/10/2026)
//
// O app virou plataforma: depois do login a pessoa escolhe a ÁREA, e cada área
// tem o seu menu. "Pessoas" é tudo o que este app já era (Cadastros, SST, RH,
// DP) e continua igual. "Manutenções" mora na pasta manutencoes/ e abre numa
// moldura (iframe) desta mesma página: lá dentro as telas, os estilos e a base
// sem internet são os de sempre, sem se misturar com os daqui, e o login é o
// deste app — a moldura pede o token ao cliente daqui (window.grCliente).
//
// Área nova no futuro: um item em AREAS e a regra dela em liberada().
import { estado } from './store.js';
import { acesso, modulosLiberados, mostrarInicio } from './acesso.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Sobe a cada publicação da área Manutenções (e nos ?v= do manutencoes/index.html). */
const VERSAO_AREA = '7';

export const AREAS = [
  { id: 'pessoas', nome: 'Pessoas', icone: 'icons/gr-192.v2.png',
    desc: 'Cadastros · SST · RH · DP' },
  { id: 'manutencoes', nome: 'Manutenções', icone: 'icons/mod-manutencoes.v1.png',
    desc: 'Vencimentos · Ordens de serviço · Check list · Máquinas' },
  { id: 'certificacao', nome: 'Certificação', icone: 'icons/mod-certificacao.v1.png',
    desc: 'Listas para imprimir e cronograma', emBreve: true },
];

/* Quem entra em cada área. Pessoas: quem tem algum módulo de lá. Manutenções:
   administrador ou quem tem 'manutencoes' na lista de módulos (app_usuarios) —
   a mesma regra que o banco usa (manutencao.pode). */
function liberada(id) {
  if (id === 'pessoas') return modulosLiberados().length > 0;
  if (id === 'manutencoes') return acesso.admin || (acesso.modulos || []).includes('manutencoes');
  return false;
}
export const areasLiberadas = () => AREAS.filter(a => !a.emBreve && liberada(a.id));

let aoTrocar = () => {};
let areaAtual = null;
let molduraCarregada = false;

export const areaAberta = () => areaAtual;

/** Liga a tela das áreas ao resto do app (abrirAba vem do app.js). */
export function ligarAreas(callback) {
  aoTrocar = callback;
  // logo/nome do sistema: escolher a área. Etiqueta: início da área atual.
  $('bInicio').addEventListener('click', () => { if (!$('app').hidden) mostrarAreas(); });
  $('bArea').addEventListener('click', () => { if (areaAtual) entrarNaArea(areaAtual); });
  addEventListener('resize', medirTopo);
  // A moldura pede o login por aqui.
  window.grCliente = estado.cliente;
}

/* A moldura ocupa a tela inteira abaixo do topo. A altura do topo muda com a
   largura (os botões quebram linha no celular), então é medida de verdade. */
function medirTopo() {
  const topo = document.querySelector('#app .topo');
  if (topo) document.documentElement.style.setProperty('--topo-h', topo.offsetHeight + 'px');
}

function pintarEtiqueta() {
  const a = AREAS.find(x => x.id === areaAtual);
  $('bArea').hidden = !a;
  if (!a) return;
  $('areaNome').textContent = a.nome;
  $('areaIcone').src = a.icone;
}

/** A tela das áreas. Com uma área só, nem aparece: entra direto nela. */
export function mostrarAreas({ direto = false } = {}) {
  window.grCliente = estado.cliente;
  const libs = areasLiberadas();
  if (direto && libs.length === 1) return entrarNaArea(libs[0].id);

  areaAtual = null;
  pintarEtiqueta();
  $('navModulos').hidden = true;
  $('navTelas').hidden = true;
  $('navSub').hidden = true;

  const nome = (acesso.nome || '').split(' ')[0];
  const h = new Date().getHours();
  $('arOla').textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (nome ? ', ' + nome : '');

  $('arGrade').innerHTML = AREAS.map(a => {
    const ok = !a.emBreve && liberada(a.id);
    if (!ok && !a.emBreve) return '';
    return `<button type="button" class="ar-cartao${a.emBreve ? ' ar-embreve' : ''}" data-area="${a.id}" ${a.emBreve ? 'disabled' : ''}>
      <img src="${a.icone}" alt="">
      <span class="ar-txt"><b>${esc(a.nome)}</b><small>${esc(a.desc)}</small></span>
      <span class="ar-ir">${a.emBreve ? 'Em breve' : 'Entrar →'}</span>
    </button>`;
  }).join('');
  $('arGrade').querySelectorAll('[data-area]:not([disabled])').forEach(b =>
    b.addEventListener('click', () => entrarNaArea(b.dataset.area)));

  // Configurações (quem entra e o que vê, em todas as áreas) é do administrador.
  $('arPe').innerHTML = acesso.admin
    ? '<button type="button" class="btn mini" id="arConfig">Configurações · quem entra e o que vê</button>' : '';
  $('arConfig')?.addEventListener('click', () => entrarNaArea('pessoas', 'config'));

  aoTrocar('areas');
}

/** Abre uma área. `tela` = 'config' abre as Configurações; `extra` vai para a
 *  moldura (ex.: o link do relatório de check list mandado por WhatsApp). */
export function entrarNaArea(id, tela, extra) {
  if (!liberada(id)) return mostrarAreas();
  areaAtual = id;
  pintarEtiqueta();

  if (id === 'pessoas') {
    $('navModulos').hidden = false;
    if (tela === 'config') {
      $('navModulos').querySelector('[data-modulo="config"]')?.click();
    } else {
      mostrarInicio();
    }
    return;
  }

  if (id === 'manutencoes') {
    $('navModulos').hidden = true;
    $('navTelas').hidden = true;
    $('navSub').hidden = true;
    aoTrocar('manutencoes');
    medirTopo();
    const moldura = $('molduraManut');
    if (!molduraCarregada || extra) {
      molduraCarregada = true;
      // ?v= muda a cada publicação: o navegador guarda as páginas por alguns
      // minutos e, sem isto, abria a área com a versão anterior.
      moldura.src = 'manutencoes/?v=' + VERSAO_AREA + (extra ? '&' + extra : '');
    } else {
      // já aberta: volta para o início da área, sem recarregar a base
      try { moldura.contentWindow.voltarAoInicioDaArea?.(); } catch {}
    }
  }
}

/** Depois do login: a área pedida no endereço (?area=…), senão a escolha. */
export function abrirPrimeiraTela() {
  window.grCliente = estado.cliente;
  const p = new URLSearchParams(location.search);
  const pedida = p.get('area');
  if (pedida && liberada(pedida)) {
    p.delete('area');
    const resto = p.toString();
    history.replaceState(null, '', location.pathname);
    return entrarNaArea(pedida, null, resto || null);
  }
  mostrarAreas({ direto: true });
}

/** Ao sair: esquece a área e descarrega a moldura (com a base de outro login). */
export function limparAreas() {
  areaAtual = null;
  molduraCarregada = false;
  const m = $('molduraManut');
  if (m) m.src = 'about:blank';
  pintarEtiqueta();
}
