// jornada-folhaponto.js — imprimir o cabeçalho na folha de ponto já impressa
//
// Pedido do Guilherme (28/09/2026): as folhas de ponto vêm prontas da gráfica
// (26,0 × 16,5 cm, frente dias 01–15 e verso 16–31, mesmo cabeçalho nos dois
// lados). O app imprime SÓ o que falta: empregador na linha pontilhada,
// nome do empregado, mês e os dois últimos dígitos do ano ("20" já vem).
//
// Impressora dele: Epson L4260. Tamanho personalizado não tem frente e verso
// automático e entra pela bandeja traseira, pelo lado menor. Ele imprime uma
// folha por vez (28/09): botão Imprimir por funcionário, que marca "impresso"
// no mês; o verso é só virar a folha e clicar de novo (mesmo cabeçalho).
// Posição que deu certo na L4260: em pé, cabeçalho à direita (270°).
// Posições medidas no PDF da gráfica (mm, a partir do canto de cima à
// esquerda). O ajuste fino por impressora fica guardado no navegador.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import * as rel from './jornada-relatorios.js';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
               'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const MAIUSC = s => String(s || '').toLocaleUpperCase('pt-BR');

/* Campos (mm). x = começo do texto; base = linha de base; max = até onde cabe. */
const CAMPOS = {
  empregador: { x: 93.5,  base: 14.2, max: 185.0, pt: 10 },
  empregado:  { x: 29.5,  base: 24.0, max: 155.0, pt: 11 },
  mes:        { x: 168.0, base: 24.0, max: 228.0, pt: 11 },
  ano:        { x: 248.5, base: 24.0, max: 253.3, pt: 11 },   // +3,5 mm depois do 1º teste na L4260 (28/09)
};
const FOLHA = { w: 260, h: 165 };

const CHAVE = 'gr-folha-ponto';
const PADRAO = { dx: 0, dy: 0, dxV: 0, dyV: 0, girar: false, verso180: false, invertida: false, cadastro: false, linha: 'ambos', campos: {} };
/* Ajuste de cada campo (28/09/2026, pedido dele): direita/baixo em mm e
   tamanho da letra, somados ao ajuste geral da frente ou do verso. */
const ROTULOS = { empregador: 'Empregador (linha pontilhada)', empregado: 'Empregado (nome)', mes: 'Mês', ano: 'Ano' };
const campoAj = (aj, k) => ({ dx: 0, dy: 0, pt: CAMPOS[k].pt, ...((aj.campos || {})[k] || {}) });
function lerAjuste() {
  try {
    const a = { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE)) || {}) };
    a.campos = a.campos || {};
    return a;
  } catch { return { ...PADRAO, campos: {} }; }
}
function gravarAjuste(a) { try { localStorage.setItem(CHAVE, JSON.stringify(a)); } catch { /* sem armazenamento: vale só agora */ } }

const tela = { mes: '', busca: '', filtro: '' };

/* Controle de "já impresso" por mês (28/09/2026, pedido dele): ele imprime
   uma folha por vez; cada funcionário tem a caixinha marcada sozinha quando
   clica em Imprimir, e pode marcar/desmarcar à mão. Fica neste computador. */
const CHAVE_IMP = 'gr-folha-ponto-impressos';
function lerImpressos() { try { return JSON.parse(localStorage.getItem(CHAVE_IMP)) || {}; } catch { return {}; } }
function marcarImpresso(mes, fid, sim) {
  const t = lerImpressos(); t[mes] = t[mes] || {};
  if (sim) t[mes][fid] = new Date().toISOString(); else delete t[mes][fid];
  try { localStorage.setItem(CHAVE_IMP, JSON.stringify(t)); } catch { /* sem armazenamento */ }
}

function mesPadrao() {
  // Até o dia 20 imprime o mês corrente; depois, já o seguinte.
  const d = new Date();
  if (d.getDate() > 20) d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const rotMes = ym => { const [a, m] = ym.split('-').map(Number); return `${MESES[m - 1].toLocaleLowerCase('pt-BR')}/${a}`; };

const unidadesComGente = () => jd.dados.unidades
  .filter(u => u.ativo !== false)
  .map(u => ({ u, pessoas: pessoasDa(u.id) }))
  .filter(x => x.pessoas.length)
  .sort((a, b) => jd.nomeUnidade(a.u).localeCompare(jd.nomeUnidade(b.u), 'pt-BR'));

function pessoasDa(unidadeId) {
  const ids = new Set(jd.dados.vinculos.filter(v => v.unidade_id === unidadeId && v.ativo !== false).map(v => v.funcionario_id));
  return estado.funcionarios.filter(f => ids.has(f.id) && f.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function textoEmpregador(u, linha) {
  const e = jd.empregadorDe(u)?.nome || '', f = jd.fazendaDe(u)?.nome || '';
  const t = linha === 'empregador' ? e : linha === 'fazenda' ? f : [e, f].filter(Boolean).join(' — ');
  return MAIUSC(t);
}

/* ---------------- tela ---------------- */

export function desenhar(alvo, { aviso }) {
  const aj = lerAjuste();
  const grupos = unidadesComGente();
  if (!tela.mes) tela.mes = mesPadrao();
  const imp = lerImpressos()[tela.mes] || {};
  const todos = grupos.flatMap(g => g.pessoas);
  const feitos = todos.filter(p => imp[p.id]).length;
  const busca = tela.busca.trim().toLocaleLowerCase('pt-BR');
  const passa = p => (!busca || p.nome.toLocaleLowerCase('pt-BR').includes(busca) || String(p.cadastro || '').includes(busca))
    && (tela.filtro !== 'falta' || !imp[p.id]) && (tela.filtro !== 'feito' || imp[p.id]);
  const dataBR = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const num = (id, v, rot) => `<label class="fp-num">${rot} <input type="number" id="${id}" step="0.5" value="${v}"> mm</label>`;
  alvo.innerHTML = `
    <div class="jor-barra rel-filtros">
      <label>Mês <input type="month" id="fpMes" value="${tela.mes}"></label>
      <label>Buscar <input type="search" id="fpBusca" placeholder="nome ou nº" value="${esc(tela.busca)}"></label>
      <label>Mostrar
        <select id="fpFiltro">
          <option value=""${!tela.filtro ? ' selected' : ''}>Todos</option>
          <option value="falta"${tela.filtro === 'falta' ? ' selected' : ''}>Falta imprimir</option>
          <option value="feito"${tela.filtro === 'feito' ? ' selected' : ''}>Já impressos</option>
        </select>
      </label>
      <label>Na linha pontilhada
        <select id="fpLinha">
          <option value="ambos"${aj.linha === 'ambos' ? ' selected' : ''}>Empregador — fazenda</option>
          <option value="empregador"${aj.linha === 'empregador' ? ' selected' : ''}>Só o empregador</option>
          <option value="fazenda"${aj.linha === 'fazenda' ? ' selected' : ''}>Só a fazenda</option>
        </select>
      </label>
      <label class="jor-inline"><input type="checkbox" id="fpCadastro"${aj.cadastro ? ' checked' : ''}> Nº do cadastro junto do nome</label>
    </div>
    <p class="dc-sem jor-nota rel-dica">Uma folha por vez: coloque a folha de ponto na bandeja e clique em <b>Imprimir</b> na linha do funcionário.
      Para o outro lado, vire a folha e clique de novo. Sai <b>só</b> empregador, nome, mês e ano.
      Na janela de impressão: <b>Margens: Nenhuma</b> e <b>sem "Cabeçalhos e rodapés"</b> (em "Mais configurações").</p>

    <div class="fp-lista">
      <div class="fp-lista__topo"><b>${feitos} de ${todos.length}</b> impressos em ${esc(rotMes(tela.mes))}
        <span class="fp-barra"><i style="width:${todos.length ? Math.round(feitos * 100 / todos.length) : 0}%"></i></span></div>
      ${grupos.map(g => {
        const ps = g.pessoas.filter(passa);
        if (!ps.length) return '';
        return `<div class="fp-grupo"><div class="fp-grupo__nome">${esc(jd.nomeUnidade(g.u))}</div>
          ${ps.map(p => `<div class="fp-linha-f${imp[p.id] ? ' feito' : ''}">
            <label class="jor-inline" title="Marque se já imprimiu"><input type="checkbox" data-fp-imp="${p.id}"${imp[p.id] ? ' checked' : ''}> Impresso</label>
            <span class="fp-linha-f__nome">${esc(p.nome)}${p.cadastro ? ` <span class="dc-sem">nº ${esc(p.cadastro)}</span>` : ''}</span>
            <span class="dc-sem">${imp[p.id] ? 'em ' + dataBR(imp[p.id]) : ''}</span>
            <button class="btn${imp[p.id] ? '' : ' principal'}" type="button" data-fp-imprimir="${p.id}" data-fp-u="${g.u.id}">Imprimir</button>
          </div>`).join('')}</div>`;
      }).join('') || '<p class="dc-sem">Ninguém encontrado.</p>'}
    </div>

    <details class="fp-ajuste">
      <summary><b>Acertar a posição na impressora</b> — já acertado; fica guardado neste computador</summary>
      <ol class="dc-sem">
        <li>Clique em <b>Folha de teste</b> e imprima em <b>papel comum</b> no tamanho da folha de ponto (26 × 16,5 cm), do mesmo jeito que vai colocar a folha de ponto.</li>
        <li>Ponha o teste sobre uma folha de ponto contra a luz: as <b>linhas cinzas</b> têm de cair em cima das linhas do quadro "Empregado / Mês / Ano".</li>
        <li>Se ficou deslocado, meça com a régua e ajuste abaixo (número positivo = para a direita / para baixo).</li>
      </ol>
      <div class="jor-barra">${num('fpDx', aj.dx, 'Tudo: direita')} ${num('fpDy', aj.dy, 'baixo')}</div>
      <p class="dc-sem" style="margin:10px 0 4px"><b>Cada campo</b> — soma ao ajuste acima. Positivo = para a direita / para baixo, olhando a folha deitada, como se lê.</p>
      <table class="fp-campos">
        <thead><tr><th>Campo</th><th>Direita (mm)</th><th>Baixo (mm)</th><th>Tamanho da letra (pt)</th></tr></thead>
        <tbody>${Object.keys(CAMPOS).map(k => { const c = campoAj(aj, k); return `<tr><td>${ROTULOS[k]}</td>
          <td><input type="number" step="0.5" data-fpc="${k}" data-fpk="dx" value="${c.dx}"></td>
          <td><input type="number" step="0.5" data-fpc="${k}" data-fpk="dy" value="${c.dy}"></td>
          <td><input type="number" step="0.5" min="6" max="16" data-fpc="${k}" data-fpk="pt" value="${c.pt}"></td></tr>`; }).join('')}</tbody>
      </table>
      <div class="jor-barra">
        <label>Posição na bandeja
          <select id="fpGirar">
            <option value=""${!aj.girar ? ' selected' : ''}>Deitada (sem girar)</option>
            <option value="esq"${aj.girar === true || aj.girar === 'esq' ? ' selected' : ''}>Em pé, cabeçalho à esquerda (girar 90°)</option>
            <option value="dir"${aj.girar === 'dir' ? ' selected' : ''}>Em pé, cabeçalho à direita (girar 270°)</option>
          </select>
        </label>
      </div>
      <div class="jor-barra">
        <button class="btn" type="button" id="fpTeste">Folha de teste</button>
        <button class="btn mini" type="button" id="fpZerar">Zerar ajuste</button>
      </div>
    </details>`;

  const $ = id => alvo.querySelector('#' + id);
  const redesenhar = () => desenhar(alvo, { aviso });

  const salvarAjuste = () => {
    const n = id => Number(String($(id).value).replace(',', '.')) || 0;
    Object.assign(aj, { dx: n('fpDx'), dy: n('fpDy'), girar: $('fpGirar').value || false,
      cadastro: $('fpCadastro').checked, linha: $('fpLinha').value });
    aj.campos = {};
    alvo.querySelectorAll('[data-fpc]').forEach(el => {
      const k = el.dataset.fpc; aj.campos[k] = aj.campos[k] || {};
      const v = Number(String(el.value).replace(',', '.'));
      aj.campos[k][el.dataset.fpk] = Number.isFinite(v) && el.value !== '' ? v : (el.dataset.fpk === 'pt' ? CAMPOS[k].pt : 0);
    });
    gravarAjuste(aj);
  };
  alvo.querySelectorAll('.fp-ajuste input, .fp-ajuste select, #fpCadastro, #fpLinha').forEach(el => el.addEventListener('change', salvarAjuste));
  $('fpMes').addEventListener('change', () => { tela.mes = $('fpMes').value || mesPadrao(); redesenhar(); });
  $('fpFiltro').addEventListener('change', () => { tela.filtro = $('fpFiltro').value; redesenhar(); });
  $('fpBusca').addEventListener('input', () => {
    tela.busca = $('fpBusca').value; const pos = $('fpBusca').selectionStart;
    redesenhar(); $('fpBusca').focus(); $('fpBusca').setSelectionRange(pos, pos);
  });
  alvo.querySelectorAll('[data-fp-imp]').forEach(c => c.addEventListener('change', () => {
    marcarImpresso(tela.mes, c.dataset.fpImp, c.checked); redesenhar();
  }));
  alvo.querySelectorAll('[data-fp-imprimir]').forEach(b => b.addEventListener('click', () => {
    salvarAjuste();
    const p = estado.funcionarios.find(f => f.id === b.dataset.fpImprimir);
    const u = jd.dados.unidades.find(x => x.id === b.dataset.fpU);
    if (!p || !u) return;
    marcarImpresso(tela.mes, p.id, true);
    mostrar(folha(p, u, aj), true, p.nome);
    redesenhar();
  }));
  $('fpZerar').addEventListener('click', () => { gravarAjuste({ ...PADRAO, cadastro: aj.cadastro, linha: aj.linha }); redesenhar(); });
  $('fpTeste').addEventListener('click', () => { salvarAjuste(); mostrar(folhaTeste(aj), true, 'teste'); });
}

/* ---------------- folhas ---------------- */

function campo(k, texto, aj) {
  const a = campoAj(aj, k);
  const c = { x: CAMPOS[k].x + a.dx, base: CAMPOS[k].base + a.dy, max: CAMPOS[k].max + a.dx, pt: a.pt };
  const em = c.pt * 0.3528;                          // pt → mm
  // Caixa de uma linha com line-height 1: a base fica ~0,79 em abaixo do topo (Arial).
  const topo = c.base - em * 0.79;
  return `<span class="fp-campo fp-${k}" data-max="${(c.max - c.x).toFixed(1)}" data-base="${c.base}"
    style="left:${c.x}mm;top:${topo.toFixed(2)}mm;font-size:${c.pt}pt">${esc(texto)}</span>`;
}

function envelope(aj, miolo, teste = false) {
  const dx = aj.dx, dy = aj.dy;
  // A folha da gráfica fica parada ao fundo (só na tela); o texto é que se move com o ajuste.
  // Em pé: "esq" = cabeçalho à esquerda na bandeja (90°); "dir" = à direita (270°).
  // Com o cabeçalho à direita, o ano fica na borda que entra primeiro e não
  // cai na margem do fim da folha, onde a impressora não imprime (28/09/2026).
  const giro = aj.girar === true ? 'esq' : (aj.girar || '');
  return `<div class="fp-folha${giro ? ' fp-girada fp-girada-' + giro : ''}${teste ? ' fp-teste' : ''}"><div class="fp-rot">
    <img class="fp-fundo" src="img/folha-ponto.png" alt="">
    <div class="fp-area" style="transform:translate(${dx}mm,${dy}mm)">${miolo}</div></div></div>`;
}

function folha(p, u, aj) {
  const [a, m] = tela.mes.split('-').map(Number);
  const nome = MAIUSC(p.nome) + (aj.cadastro && p.cadastro ? `  · nº ${p.cadastro}` : '');
  return envelope(aj, campo('empregador', textoEmpregador(u, aj.linha), aj)
    + campo('empregado', nome, aj)
    + campo('mes', MESES[m - 1], aj)
    + campo('ano', String(a).slice(2), aj));
}

/* Folha de teste: as linhas do quadro "Empregado / Mês / Ano" e a linha
   pontilhada, em cinza, mais os textos de exemplo no lugar certo. */
function folhaTeste(aj) {
  const L = (x, y, w, h) => `<i class="fp-linha" style="left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm"></i>`;
  const miolo = L(5.9, 17.15, 248, 0.25) + L(5.9, 25.3, 248, 0.25)
    + L(5.9, 17.15, 0.25, 8.4) + L(156.3, 17.15, 0.25, 8.4) + L(229.3, 17.15, 0.25, 8.4) + L(253.8, 17.15, 0.25, 8.4)
    + L(92, 14.8, 93.5, 0.25)
    + `<span class="fp-legenda" style="left:8mm;top:40mm">FOLHA DE TESTE · as linhas cinzas devem cair sobre as linhas do quadro da folha de ponto</span>`
    + campo('empregador', 'EMPREGADOR — FAZENDA', aj)
    + campo('empregado', 'NOME DO FUNCIONÁRIO', aj)
    + campo('mes', 'MÊS', aj)
    + campo('ano', '26', aj);
  return envelope(aj, miolo, true);
}

function mostrar(html, imprimir, quem) {
  const topo = `<p class="fp-aviso-tela">${quem === 'teste' ? 'Folha de teste' : esc(quem)}.
    Na tela aparece a folha da gráfica ao fundo só para conferir; no papel sai <b>só o texto</b>.
    Na janela de impressão: tamanho <b>16,5 × 26 cm</b>, <b>100% / tamanho real</b>, <b>Margens: Nenhuma</b> e sem "Cabeçalhos e rodapés".</p>`;
  rel.mostrar(`<div class="fp-lote">${topo}${html}</div>`, { barra: true });
  ajustarLargura();
  if (imprimir) setTimeout(() => imprimirSemTitulo(), 400);
}

/* O Chrome escreve o título da página e a hora na borda se "Cabeçalhos e
   rodapés" estiver ligado. O título sai vazio durante a impressão; a hora só
   some desligando a opção na janela de impressão (o Chrome lembra depois). */
function imprimirSemTitulo() {
  const titulo = document.title;
  document.title = ' ';
  const volta = () => { document.title = titulo; removeEventListener('afterprint', volta); };
  addEventListener('afterprint', volta);
  rel.imprimir();
  setTimeout(volta, 3000);
}

/* Nome comprido: diminui a letra até caber no espaço do campo. */
function ajustarLargura() {
  const pxmm = 96 / 25.4;
  document.querySelectorAll('#jorImpressao .fp-campo').forEach(s => {
    const max = Number(s.dataset.max) * pxmm;
    let pt = parseFloat(s.style.fontSize);
    while (s.scrollWidth > max && pt > 6) {
      pt -= 0.5; s.style.fontSize = pt + 'pt';
      s.style.top = (Number(s.dataset.base) - pt * 0.3528 * 0.79).toFixed(2) + 'mm';   // mantém a linha de base
    }
  });
}
