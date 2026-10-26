// recentes.js — "Continuar de onde parou" na tela inicial (26/10/2026, pedido dele)
//
// Guarda as últimas telas abertas por quem está logado, neste aparelho
// (localStorage, uma lista por usuário). Telas do app principal (Pessoas,
// Certificação, Vistorias) chegam por registrar(); as das áreas em moldura
// (Colheita, Estoque, Custo Base, Projetos, Máquinas, Programação) chegam por
// mensagem 'gr-recente' que a moldura manda ao trocar de tela.
// Só conta a tela em que a pessoa ficou: trocou de novo em menos de 2,5 s
// (passando por um módulo até a tela que queria), a do meio não entra.
import { estado } from './store.js';

const MAX = 8;
const ESPERA = 2500;
let areaAtual = null;
let pendente = null;

const chave = () => 'gr-recentes:' + (estado.sessao?.user?.id || 'anon');

export function lerRecentes() {
  try {
    const l = JSON.parse(localStorage.getItem(chave()) || '[]');
    return Array.isArray(l) ? l.filter(x => x && x.area && x.tela) : [];
  } catch { return []; }
}

function gravar(item) {
  try {
    const l = lerRecentes().filter(x => !(x.area === item.area && x.tela === item.tela));
    l.unshift(item);
    localStorage.setItem(chave(), JSON.stringify(l.slice(0, MAX)));
  } catch { /* aba anônima ou armazenamento cheio: só não lembra */ }
}

/** A área que está aberta agora (areas.js avisa ao entrar). */
export function definirAreaRecente(id) { areaAtual = id; }

/** Uma tela foi aberta. area em branco = a área aberta agora. */
export function registrarRecente({ area, modulo, tela, rotulo }) {
  area = area || areaAtual;
  if (!area || !tela || !rotulo || area === 'usuarios') return;
  clearTimeout(pendente);
  pendente = setTimeout(() => gravar({ area, modulo: modulo || null, tela, rotulo, em: Date.now() }), ESPERA);
}

/* Molduras: qual iframe é de qual área. */
const MOLDURAS = { molduraManut: 'manutencoes', molduraProg: 'programacao', molduraEst: 'estoque',
  molduraCB: 'custobase', molduraCP: 'colheita', molduraPJ: 'projetos' };
export const molduraDaArea = area => Object.keys(MOLDURAS).find(k => MOLDURAS[k] === area) || null;

addEventListener('message', ev => {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  if (!d || d.tipo !== 'gr-recente' || !d.tela || !d.rotulo) return;
  const id = Object.keys(MOLDURAS).find(k => document.getElementById(k)?.contentWindow === ev.source);
  if (id) registrarRecente({ area: MOLDURAS[id], tela: String(d.tela), rotulo: String(d.rotulo).slice(0, 80) });
});

/** "há 12 min", "hoje 09:40", "ontem", "23/10". */
export function quandoRecente(ms) {
  const d = new Date(ms), agora = new Date();
  const min = Math.round((agora - d) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(agora) - dia(d)) / 86400000);
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (dif === 0) return 'hoje ' + hh;
  if (dif === 1) return 'ontem';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}
