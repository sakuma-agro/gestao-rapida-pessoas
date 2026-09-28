// jornada-folhaponto.js — imprimir o cabeçalho na folha de ponto já impressa
//
// Pedido do Guilherme (28/09/2026): as folhas de ponto vêm prontas da gráfica
// (26,0 × 16,5 cm, frente dias 01–15 e verso 16–31, mesmo cabeçalho nos dois
// lados). O app imprime SÓ o que falta: empregador na linha pontilhada,
// nome do empregado, mês e os dois últimos dígitos do ano ("20" já vem).
//
// Impressora dele: Epson L4260. Tamanho personalizado não tem frente e verso
// automático e entra pela bandeja traseira, pelo lado menor — por isso:
//   1. imprime o lote de frentes; 2. vira o maço; 3. imprime o lote de versos.
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
const PADRAO = { dx: 0, dy: 0, dxV: 0, dyV: 0, girar: false, verso180: false, invertida: false, cadastro: false, linha: 'ambos' };
function lerAjuste() {
  try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE)) || {}) }; } catch { return { ...PADRAO }; }
}
function gravarAjuste(a) { try { localStorage.setItem(CHAVE, JSON.stringify(a)); } catch { /* sem armazenamento: vale só agora */ } }

const tela = { unidade: '', mes: '', marcados: null };

function mesPadrao() {
  // Até o dia 20 imprime o mês corrente; depois, já o seguinte.
  const d = new Date();
  if (d.getDate() > 20) d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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
  if (!grupos.some(g => g.u.id === tela.unidade)) { tela.unidade = grupos[0]?.u.id || ''; tela.marcados = null; }
  if (!tela.mes) tela.mes = mesPadrao();
  const pessoas = grupos.find(g => g.u.id === tela.unidade)?.pessoas || [];
  if (!tela.marcados) tela.marcados = new Set(pessoas.map(p => p.id));

  const num = (id, v, rot) => `<label class="fp-num">${rot} <input type="number" id="${id}" step="0.5" value="${v}"> mm</label>`;
  alvo.innerHTML = `
    <div class="jor-barra rel-filtros">
      <label>Empregador / fazenda
        <select id="fpUnidade">${grupos.map(g => `<option value="${g.u.id}"${g.u.id === tela.unidade ? ' selected' : ''}>${esc(jd.nomeUnidade(g.u))} (${g.pessoas.length})</option>`).join('')}</select>
      </label>
      <label>Mês <input type="month" id="fpMes" value="${tela.mes}"></label>
      <label>Na linha pontilhada
        <select id="fpLinha">
          <option value="ambos"${aj.linha === 'ambos' ? ' selected' : ''}>Empregador — fazenda</option>
          <option value="empregador"${aj.linha === 'empregador' ? ' selected' : ''}>Só o empregador</option>
          <option value="fazenda"${aj.linha === 'fazenda' ? ' selected' : ''}>Só a fazenda</option>
        </select>
      </label>
      <label class="jor-inline"><input type="checkbox" id="fpCadastro"${aj.cadastro ? ' checked' : ''}> Nº do cadastro junto do nome</label>
    </div>
    <p class="dc-sem jor-nota rel-dica">Imprime <b>só</b> empregador, nome, mês e ano na folha de ponto que já vem da gráfica (26 × 16,5 cm).
      Na Epson L4260: bandeja traseira, folha deitada entrando pelo <b>lado menor</b>, impressão em <b>100% / tamanho real</b>.</p>

    <div class="fp-pessoas">
      <div class="fp-pessoas__topo"><b>Funcionários</b> <span class="dc-sem" id="fpConta"></span>
        <button type="button" class="btn mini" id="fpTodos">Marcar todos</button>
        <button type="button" class="btn mini" id="fpNenhum">Desmarcar todos</button></div>
      <div class="fp-pessoas__lista">
        ${pessoas.map(p => `<label class="jor-inline"><input type="checkbox" data-fp-p="${p.id}"${tela.marcados.has(p.id) ? ' checked' : ''}>
          ${esc(p.nome)}${p.cadastro ? ` <span class="dc-sem">nº ${esc(p.cadastro)}</span>` : ''}</label>`).join('') || '<span class="dc-sem">Ninguém com vínculo nesta unidade.</span>'}
      </div>
    </div>

    <div class="fp-passos">
      <div class="fp-passo"><span>1</span><div><b>Frentes</b> (dias 01 a 15)<br>
        <button class="btn principal" type="button" id="fpFrente">Imprimir frentes</button>
        <button class="btn" type="button" id="fpVerFrente">Ver na tela</button></div></div>
      <div class="fp-passo"><span>2</span><div><b>Vire o maço</b> e coloque de volta na bandeja, com o verso (dias 16 a 31) para cima.</div></div>
      <div class="fp-passo"><span>3</span><div><b>Versos</b> (dias 16 a 31)<br>
        <button class="btn principal" type="button" id="fpVerso">Imprimir versos</button>
        <button class="btn" type="button" id="fpVerVerso">Ver na tela</button>
        <label class="jor-inline"><input type="checkbox" id="fpInvertida"${aj.invertida ? ' checked' : ''}> Versos em ordem invertida</label></div></div>
    </div>

    <details class="fp-ajuste"${aj.dx || aj.dy || aj.dxV || aj.dyV || aj.girar || aj.verso180 ? '' : ' open'}>
      <summary><b>Acertar a posição na impressora</b> — faça uma vez; fica guardado neste computador</summary>
      <ol class="dc-sem">
        <li>Clique em <b>Folha de teste</b> e imprima em <b>papel comum</b>, cortado ou dobrado no tamanho da folha de ponto (26 × 16,5 cm), do mesmo jeito que vai colocar a folha de ponto.</li>
        <li>Ponha o teste sobre uma folha de ponto contra a luz: as <b>linhas cinzas</b> têm de cair em cima das linhas do quadro "Empregado / Mês / Ano".</li>
        <li>Se ficou deslocado, meça com a régua e ajuste abaixo (número positivo = para a direita / para baixo). Imprima o teste de novo até bater.</li>
      </ol>
      <div class="jor-barra">
        ${num('fpDx', aj.dx, 'Frente: direita')} ${num('fpDy', aj.dy, 'baixo')}
        ${num('fpDxV', aj.dxV, 'Verso: direita')} ${num('fpDyV', aj.dyV, 'baixo')}
      </div>
      <div class="jor-barra">
        <label class="jor-inline"><input type="checkbox" id="fpGirar"${aj.girar ? ' checked' : ''}> Girar 90° (se o teste sair de lado)</label>
        <label class="jor-inline"><input type="checkbox" id="fpVerso180"${aj.verso180 ? ' checked' : ''}> Verso de cabeça para baixo (girar 180°)</label>
      </div>
      <div class="jor-barra">
        <button class="btn" type="button" id="fpTesteF">Folha de teste — frente</button>
        <button class="btn" type="button" id="fpTesteV">Folha de teste — verso</button>
        <button class="btn mini" type="button" id="fpZerar">Zerar ajuste</button>
      </div>
    </details>`;

  const $ = id => alvo.querySelector('#' + id);
  const conta = () => { $('fpConta').textContent = `${tela.marcados.size} de ${pessoas.length} marcados`; };
  conta();

  const salvarAjuste = () => {
    const n = id => Number(String($(id).value).replace(',', '.')) || 0;
    Object.assign(aj, { dx: n('fpDx'), dy: n('fpDy'), dxV: n('fpDxV'), dyV: n('fpDyV'),
      girar: $('fpGirar').checked, verso180: $('fpVerso180').checked,
      invertida: $('fpInvertida').checked, cadastro: $('fpCadastro').checked, linha: $('fpLinha').value });
    gravarAjuste(aj);
  };
  alvo.querySelectorAll('.fp-ajuste input, #fpInvertida, #fpCadastro, #fpLinha').forEach(el => el.addEventListener('change', salvarAjuste));
  $('fpUnidade').addEventListener('change', () => { tela.unidade = $('fpUnidade').value; tela.marcados = null; desenhar(alvo, { aviso }); });
  $('fpMes').addEventListener('change', () => { tela.mes = $('fpMes').value; });
  alvo.querySelectorAll('[data-fp-p]').forEach(c => c.addEventListener('change', () => {
    c.checked ? tela.marcados.add(c.dataset.fpP) : tela.marcados.delete(c.dataset.fpP); conta();
  }));
  $('fpTodos').addEventListener('click', () => { tela.marcados = new Set(pessoas.map(p => p.id)); desenhar(alvo, { aviso }); });
  $('fpNenhum').addEventListener('click', () => { tela.marcados = new Set(); desenhar(alvo, { aviso }); });
  $('fpZerar').addEventListener('click', () => { gravarAjuste({ ...PADRAO, invertida: aj.invertida, cadastro: aj.cadastro, linha: aj.linha }); desenhar(alvo, { aviso }); });

  const lote = (lado, imprimir) => {
    salvarAjuste();
    if (!tela.mes) { aviso('Escolha o mês.'); return; }
    const lista = pessoas.filter(p => tela.marcados.has(p.id));
    if (!lista.length) { aviso('Marque pelo menos um funcionário.'); return; }
    const u = jd.dados.unidades.find(x => x.id === tela.unidade);
    const ordem = lado === 'verso' && aj.invertida ? [...lista].reverse() : lista;
    mostrar(ordem.map(p => folha(p, u, lado, aj)).join(''), imprimir, lado, ordem.length);
  };
  $('fpFrente').addEventListener('click', () => lote('frente', true));
  $('fpVerso').addEventListener('click', () => lote('verso', true));
  $('fpVerFrente').addEventListener('click', () => lote('frente', false));
  $('fpVerVerso').addEventListener('click', () => lote('verso', false));
  $('fpTesteF').addEventListener('click', () => { salvarAjuste(); mostrar(folhaTeste('frente', aj), true, 'teste', 1); });
  $('fpTesteV').addEventListener('click', () => { salvarAjuste(); mostrar(folhaTeste('verso', aj), true, 'teste', 1); });
}

/* ---------------- folhas ---------------- */

function campo(k, texto, extra = '') {
  const c = CAMPOS[k];
  const em = c.pt * 0.3528;                          // pt → mm
  // Caixa de uma linha com line-height 1: a base fica ~0,79 em abaixo do topo (Arial).
  const topo = c.base - em * 0.79;
  return `<span class="fp-campo fp-${k}${extra}" data-max="${(c.max - c.x).toFixed(1)}" data-base="${c.base}"
    style="left:${c.x}mm;top:${topo.toFixed(2)}mm;font-size:${c.pt}pt">${esc(texto)}</span>`;
}

function envelope(lado, aj, miolo, teste = false) {
  const dx = lado === 'verso' ? aj.dxV : aj.dx, dy = lado === 'verso' ? aj.dyV : aj.dy;
  const gira180 = lado === 'verso' && aj.verso180;
  // A folha da gráfica fica parada ao fundo (só na tela); o texto é que se move com o ajuste.
  return `<div class="fp-folha${aj.girar ? ' fp-girada' : ''}${teste ? ' fp-teste' : ''}"><div class="fp-rot">
    <img class="fp-fundo" src="img/folha-ponto.png" alt="">
    <div class="fp-area" style="transform:translate(${dx}mm,${dy}mm)${gira180 ? ' rotate(180deg)' : ''}">${miolo}</div></div></div>`;
}

function folha(p, u, lado, aj) {
  const [a, m] = tela.mes.split('-').map(Number);
  const nome = MAIUSC(p.nome) + (aj.cadastro && p.cadastro ? `  · nº ${p.cadastro}` : '');
  return envelope(lado, aj, campo('empregador', textoEmpregador(u, aj.linha))
    + campo('empregado', nome)
    + campo('mes', MESES[m - 1])
    + campo('ano', String(a).slice(2)));
}

/* Folha de teste: as linhas do quadro "Empregado / Mês / Ano" e a linha
   pontilhada, em cinza, mais os textos de exemplo no lugar certo. */
function folhaTeste(lado, aj) {
  const L = (x, y, w, h) => `<i class="fp-linha" style="left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm"></i>`;
  const miolo = L(5.9, 17.15, 248, 0.25) + L(5.9, 25.3, 248, 0.25)
    + L(5.9, 17.15, 0.25, 8.4) + L(156.3, 17.15, 0.25, 8.4) + L(229.3, 17.15, 0.25, 8.4) + L(253.8, 17.15, 0.25, 8.4)
    + L(92, 14.8, 93.5, 0.25)
    + `<span class="fp-legenda" style="left:8mm;top:40mm">FOLHA DE TESTE — ${lado === 'verso' ? 'VERSO' : 'FRENTE'} · as linhas cinzas devem cair sobre as linhas do quadro da folha de ponto</span>`
    + campo('empregador', 'EMPREGADOR — FAZENDA')
    + campo('empregado', 'NOME DO FUNCIONÁRIO')
    + campo('mes', 'MÊS')
    + campo('ano', '26');
  return envelope(lado, aj, miolo, true);
}

function mostrar(html, imprimir, lado, n) {
  const topo = `<p class="fp-aviso-tela">${lado === 'teste' ? 'Folha de teste' : `${n} folha(s) — ${lado === 'verso' ? 'versos' : 'frentes'}`}.
    Na tela aparece a folha da gráfica ao fundo só para conferir; no papel sai <b>só o texto</b>.
    Na janela de impressão: tamanho <b>26 × 16,5 cm</b> (personalizado), <b>100% / tamanho real</b>, sem margens.</p>`;
  rel.mostrar(`<div class="fp-lote">${topo}${html}</div>`, { barra: true });
  ajustarLargura();
  if (imprimir) setTimeout(() => rel.imprimir(), 400);
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
