// rh-enquadramento.js — RH › Cargos e salários › Enquadramento e Reajuste anual
// (20/10/2026).
//
// Pedido dele, depois de lançar todos os salários: "tem alguns abaixo ou acima
// da faixa — qual módulo para visualizar melhor essas possíveis alterações
// futuras?" e "um módulo onde eu coloco a % de reajuste do início do ano, tipo
// simulação". Decisões (não reabrir sem ele pedir):
//  · Enquadramento: régua por cargo (A–E) com cada pessoa como um ponto; três
//    grupos (abaixo da A, entre faixas, acima da E); marca quem sobe e em que
//    mês; custo por mês e no ano; "Programar" grava alterações com data futura
//    em jor_salarios (a mesma tabela de sempre) — nada de cadastro paralelo.
//  · Reajuste anual: % e mês de vigência, até três cenários lado a lado, antes
//    e depois por pessoa, custo mensal e no ano (com encargos opcional).
//    **A tabela de faixas sobe com o mesmo %** (decisão dele): fica programada
//    em rh_reajustes e sobe quando a vigência chega (js/rh-reajuste-tabela.js).
//  · Base, periculosidade e gratificação sobem juntas (o total vira total × (1+%)).
//    Insalubridade é só anotação e não muda.
//  · Valores escondidos pelo mesmo olho de Salários.

import { estado } from './store.js';
import * as jd from './jornada-dados.js';
import { mostrar } from './jornada-relatorios.js';
import { api as A, LETRAS, valorFaixa, dividir, obsFaixa } from './rh-salarios.js';
import { COLUNAS_FAIXA } from './rh-reajuste-tabela.js';

const $ = id => document.getElementById(id);
const { esc, brl, pctTxt, br, rotMes, mesSeguinte, r2 } = A;
const V = v => A.V(v), P = v => A.P(v);
const OC = '<span class="rs-oculto">••••••</span>';
const mesAtual = () => A.hoje().slice(0, 7);
const proxMes = () => mesSeguinte(mesAtual());
const mesesAte = (ini, n) => { const out = []; let m = ini; for (let i = 0; i < n; i++) { out.push(m); m = mesSeguinte(m); } return out; };
/** Meses de `ym` até dezembro do mesmo ano, contando o próprio mês. */
const mesesNoAno = ym => 13 - Number(ym.slice(5, 7));
const lerPct = t => { const n = Number(String(t ?? '').replace(',', '.').trim()); return isFinite(n) && String(t ?? '').trim() !== '' ? n : null; };
const usuario = () => estado.sessao?.user?.email || null;
const aviso = (id, txt, tipo = 'info') => { const el = $(id); if (el) { el.className = `aviso ${tipo}`; el.textContent = txt; el.hidden = !txt; } };

/* ===================================================================
   ENQUADRAMENTO
   =================================================================== */
const E = { cargo: '', grupo: '', sel: new Map(), encargos: '', msg: '' };

/** Para onde a pessoa vai, se for enquadrada agora. */
function alvoDe(x) {
  if (!x.cargo || x.sal == null) return null;
  const v = LETRAS.map(L => [L, valorFaixa(x.cargo, L)]).filter(y => y[1]);
  if (!v.length) return null;
  if (x.sal < v[0][1] - 0.005) return { letra: v[0][0], valor: v[0][1], tipo: 'abaixo' };
  if (x.faixa) {
    const fv = valorFaixa(x.cargo, x.faixa);
    if (fv && x.sal < fv - 0.005) return { letra: x.faixa, valor: fv, tipo: 'completar' };
  }
  const prox = v.find(y => y[1] > x.sal + 0.005);
  return prox ? { letra: prox[0], valor: prox[1], tipo: 'subir' } : null;
}
const GRUPOS = {
  abaixo: ['Abaixo da A', 'perigo'], entre: ['Entre faixas', 'alerta'], na: ['Na faixa', 'ativo'],
  acima: ['Acima da E', 'neutra'], sem: ['Sem salário', 'neutra'], fora: ['Fora do plano', 'neutra'],
};
function grupoDe(x) {
  if (x.sal == null) return 'sem';
  if (!x.cargo) return 'fora';
  if (x.pos.abaixo) return 'abaixo';
  if (x.pos.acima) return 'acima';
  if (x.pos.letra) return 'na';
  return 'entre';
}
const iniciais = n => String(n || '').split(/\s+/).filter(Boolean).filter((p, i, a) => i === 0 || i === a.length - 1).map(p => p[0]).join('');

function linhas() {
  return A.ativos().map(A.situacao).map(x => ({ ...x, grupo: grupoDe(x), alvo: alvoDe(x) }));
}

/** Escolhas do plano que ainda valem (pessoa ativa, alvo acima do salário). */
function plano(todas) {
  const out = [];
  for (const [fid, s] of E.sel) {
    const x = todas.find(l => l.f.id === fid);
    if (!x || !x.cargo || x.sal == null) continue;
    const valor = valorFaixa(x.cargo, s.letra);
    if (!valor) continue;
    out.push({ x, letra: s.letra, mes: s.mes, valor, dif: r2(valor - x.sal), tipo: x.alvo?.letra === s.letra ? x.alvo.tipo : 'subir' });
  }
  return out.sort((a, b) => a.mes.localeCompare(b.mes) || a.x.f.nome.localeCompare(b.x.f.nome, 'pt-BR'));
}
const encE = () => { const p = lerPct(E.encargos); return p && p > 0 ? p / 100 : 0; };
const resumoPlano = pl => {
  const mensal = pl.reduce((t, p) => t + p.dif, 0);
  const anos = {};
  pl.forEach(p => { const a = p.mes.slice(0, 4); anos[a] = (anos[a] || 0) + p.dif * mesesNoAno(p.mes); });
  return { mensal, anos };
};

function regua(cargo, pessoas) {
  const fx = LETRAS.map(L => [L, valorFaixa(cargo, L)]).filter(y => y[1]);
  if (!fx.length) return '<p class="dica">Cargo sem valores na tabela.</p>';
  if (!A.aberto()) return '<p class="dica eq-fechada">Clique em <b>Mostrar valores</b> para ver a régua com cada pessoa.</p>';
  const vals = [...fx.map(y => y[1]), ...pessoas.map(p => p.sal)];
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.07 || max * 0.05;
  min -= pad; max += pad;
  const pos = v => ((v - min) / (max - min) * 100).toFixed(2);
  const ord = pessoas.slice().sort((a, b) => a.sal - b.sal);
  return `<div class="eq-regua">
    <div class="eq-trilho"></div>
    <div class="eq-zona" style="left:${pos(fx[0][1])}%;width:${(pos(fx[fx.length - 1][1]) - pos(fx[0][1])).toFixed(2)}%"></div>
    ${fx.map(([L, v]) => `<div class="eq-marca" style="left:${pos(v)}%"><b>${L}</b><small>${brl(v).replace('R$', '').trim()}</small></div>`).join('')}
    ${ord.map((p, i) => `<div class="eq-ponto eq-${p.grupo}" style="left:${pos(p.sal)}%;top:${4 + (i % 3) * 15}px"
        title="${esc(p.f.nome)} · ${brl(p.sal)}${p.faixaObs ? ' · ' + esc(p.faixaObs) : ''}">${esc(iniciais(p.f.nome))}</div>`).join('')}
  </div>`;
}

function desenharEnquadra() {
  const tela = $('telaRhEnquadra');
  const todas = linhas();
  const cont = k => todas.filter(x => x.grupo === k).length;
  const custoA = todas.filter(x => x.grupo === 'abaixo').reduce((t, x) => t + (x.alvo ? x.alvo.valor - x.sal : 0), 0);
  const acimaE = todas.filter(x => x.grupo === 'acima').reduce((t, x) => t + (x.sal - (valorFaixa(x.cargo, 'E') || x.sal)), 0);
  const pl = plano(todas), rs = resumoPlano(pl), enc = encE();
  const ce = v => enc ? v * (1 + enc) : v;
  const cargosUsados = A.cargos().filter(c => todas.some(x => x.cargo?.id === c.id && x.sal != null));
  const vis = todas.filter(x => x.sal != null && x.cargo && (!E.cargo || x.cargo.id === E.cargo) && (!E.grupo || x.grupo === E.grupo));
  const porCargo = cargosUsados.filter(c => vis.some(x => x.cargo.id === c.id));
  const meses = mesesAte(mesAtual(), 18);
  const opMes = sel => meses.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${rotMes(m)}</option>`).join('');

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Enquadramento</h2>
        <p class="dica" style="margin:2px 0 0">Onde cada pessoa está na tabela do cargo e quanto custa trazer para a faixa. Marque quem sobe e em que mês; "Programar" grava as alterações com data futura.</p></div>
      <span class="acoes">${A.botaoOlho('eqOlho')}
        <button class="btn" type="button" id="eqRel">Relatório</button>
        <button class="btn mini" type="button" id="eqCsv">Excel</button></span>
    </div>
    <div class="rs-kpis">
      <div class="rs-alerta"><span>Abaixo da faixa A</span><strong>${cont('abaixo')}</strong><small>${V(custoA)}/mês para chegar à A</small></div>
      <div><span>Entre faixas</span><strong>${cont('entre')}</strong><small>podem completar ou subir de faixa</small></div>
      <div><span>Na faixa exata</span><strong>${cont('na')}</strong><small>batem com a tabela</small></div>
      <div><span>Acima da faixa E</span><strong>${cont('acima')}</strong><small>${V(acimaE)}/mês acima do teto · só reajuste</small></div>
      <div><span>Sem salário / fora do plano</span><strong>${cont('sem') + cont('fora')}</strong><small>não entram na conta</small></div>
    </div>
    <div class="aviso info" id="eqMsg" ${E.msg ? '' : 'hidden'}>${esc(E.msg)}</div>

    <div class="barra">
      <label class="campo">Cargo<select id="eqCargo"><option value="">Todos</option>${cargosUsados.map(c => `<option value="${c.id}" ${c.id === E.cargo ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo">Mostrar<select id="eqGrupo"><option value="">Todos</option>${['abaixo', 'entre', 'na', 'acima'].map(k => `<option value="${k}" ${k === E.grupo ? 'selected' : ''}>${GRUPOS[k][0]}</option>`).join('')}</select></label>
      <span class="eq-legenda"><i class="eq-abaixo"></i>abaixo da A <i class="eq-entre"></i>entre faixas <i class="eq-na"></i>na faixa <i class="eq-acima"></i>acima da E</span>
    </div>
    <div class="barra">
      <button class="btn" type="button" id="eqSelA">Marcar todos abaixo da A → faixa A</button>
      <button class="btn" type="button" id="eqSelPeq">Marcar diferenças pequenas → completar a faixa</button>
      <label class="campo" style="margin-left:auto">Mês para os marcados<select id="eqMesTodos">${opMes(proxMes())}</select></label>
    </div>

    ${porCargo.map(c => {
      const ps = vis.filter(x => x.cargo.id === c.id).sort((a, b) => a.sal - b.sal);
      const todosDoCargo = todas.filter(x => x.cargo?.id === c.id && x.sal != null);
      return `<section class="eq-cargo">
        <h3 class="rs-h3">${esc(c.nome)} <span class="dc-sem">· ${todosDoCargo.length} pessoa(s)</span></h3>
        ${regua(c, todosDoCargo)}
        <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th class="ce"></th><th>Funcionário</th><th class="ce">Salário</th><th class="ce">Faixa</th><th>Situação</th>
          <th class="ce">Vai para</th><th class="ce">Novo salário</th><th class="ce">A mais/mês</th><th class="ce">A partir de</th><th></th></tr></thead><tbody>
          ${ps.map(x => {
            const s = E.sel.get(x.f.id);
            const opcoes = LETRAS.filter(L => { const v = valorFaixa(c, L); return v && v > x.sal + 0.005; });
            const letra = s?.letra || x.alvo?.letra || '';
            const vNovo = letra ? valorFaixa(c, letra) : null;
            return `<tr class="${s ? 'eq-marcado' : ''}">
              <td class="ce">${opcoes.length ? `<input type="checkbox" data-eq-sel="${x.f.id}" ${s ? 'checked' : ''} aria-label="Incluir no plano">` : ''}</td>
              <td><b>${esc(x.f.nome)}</b><br><span class="dc-sem">${esc(x.f.fazenda || '')}</span></td>
              <td class="ce">${V(x.sal)}${x.peric > 0 || x.grat > 0 ? `<br><span class="dc-sem">com adicionais</span>` : ''}</td>
              <td class="ce">${x.faixa ? `<b>${x.faixa}</b>` : '—'}${x.faixaObs ? `<br><span class="dc-sem">${A.aberto() ? esc(x.faixaObs) : 'obs.'}</span>` : ''}</td>
              <td><span class="tag ${GRUPOS[x.grupo][1]}">${esc(x.pos.txt)}</span></td>
              <td class="ce">${opcoes.length ? `<select data-eq-letra="${x.f.id}">${opcoes.map(L => `<option ${L === letra ? 'selected' : ''}>${L}</option>`).join('')}</select>` : '<span class="dc-sem">topo</span>'}</td>
              <td class="ce">${vNovo ? V(vNovo) : '—'}</td>
              <td class="ce">${vNovo ? `${V(vNovo - x.sal)}<br><span class="dc-sem">${P(vNovo / x.sal - 1)}</span>` : '—'}</td>
              <td class="ce">${s ? `<select data-eq-mes="${x.f.id}">${opMes(s.mes)}</select>` : '<span class="dc-sem">—</span>'}</td>
              <td class="ce"><button class="btn mini" type="button" data-eq-ficha="${x.f.id}">Ficha</button></td></tr>`;
          }).join('')}
        </tbody></table></div></section>`;
    }).join('') || '<p class="vazio">Ninguém neste filtro.</p>'}

    <h3 class="rs-h3">Plano de enquadramento</h3>
    ${pl.length ? `<div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>A partir de</th><th>Funcionário</th><th>Cargo</th><th class="ce">Hoje</th><th class="ce">Vai para</th><th class="ce">Novo</th><th class="ce">A mais/mês</th><th class="ce">No ano</th></tr></thead><tbody>
      ${pl.map(p => `<tr><td>${rotMes(p.mes)}</td><td>${esc(p.x.f.nome)}</td><td>${esc(p.x.cargo.nome)}</td><td class="ce">${V(p.x.sal)}</td>
        <td class="ce"><b>${p.letra}</b></td><td class="ce">${V(p.valor)}</td><td class="ce">${V(ce(p.dif))}</td><td class="ce">${V(ce(p.dif * mesesNoAno(p.mes)))}</td></tr>`).join('')}
      <tr class="dc-total"><td colspan="6">${pl.length} pessoa(s)${enc ? ` · com encargos de ${esc(E.encargos)}%` : ''}</td><td class="ce">${V(ce(rs.mensal))}</td>
        <td class="ce">${Object.entries(rs.anos).map(([a, v]) => `${V(ce(v))} <span class="dc-sem">(${a})</span>`).join('<br>')}</td></tr>
    </tbody></table></div>
    <div class="barra">
      <label class="campo">Encargos e provisões (%) <small>opcional</small><input type="text" id="eqEnc" inputmode="decimal" value="${esc(E.encargos)}" placeholder="ex.: 68" style="max-width:120px"></label>
      <button class="btn mini" type="button" id="eqLimpar">Limpar plano</button>
      <button class="btn principal" type="button" id="eqProgramar" style="margin-left:auto">Programar ${pl.length} alteração(ões)</button>
    </div>
    <p class="dica">"No ano" soma do mês escolhido até dezembro. Programar grava em Salários com a data escolhida (motivo: ajuste para quem estava abaixo da faixa, promoção horizontal para quem sobe); periculosidade e gratificação são recalculadas sobre o novo total.</p>`
      : '<p class="dica">Nenhuma pessoa marcada. Marque na tabela acima ou use os botões "Marcar todos abaixo da A" e "Marcar diferenças pequenas".</p>'}
  </div>`;

  A.ligarOlho('eqOlho', desenharEnquadra);
  $('eqCargo').addEventListener('change', e => { E.cargo = e.target.value; desenharEnquadra(); });
  $('eqGrupo').addEventListener('change', e => { E.grupo = e.target.value; desenharEnquadra(); });
  const mesT = () => $('eqMesTodos').value;
  const marcar = filtro => { todas.filter(filtro).forEach(x => { if (x.alvo) E.sel.set(x.f.id, { letra: x.alvo.letra, mes: mesT() }); }); E.msg = ''; desenharEnquadra(); };
  $('eqSelA').addEventListener('click', () => marcar(x => x.grupo === 'abaixo'));
  $('eqSelPeq').addEventListener('click', () => marcar(x => x.alvo?.tipo === 'completar'));
  tela.querySelectorAll('[data-eq-sel]').forEach(b => b.addEventListener('change', () => {
    const fid = b.dataset.eqSel, x = todas.find(l => l.f.id === fid);
    if (b.checked) E.sel.set(fid, { letra: tela.querySelector(`[data-eq-letra="${fid}"]`)?.value || x.alvo?.letra, mes: mesT() });
    else E.sel.delete(fid);
    E.msg = ''; desenharEnquadra();
  }));
  tela.querySelectorAll('[data-eq-letra]').forEach(s => s.addEventListener('change', () => {
    const fid = s.dataset.eqLetra, atual = E.sel.get(fid);
    E.sel.set(fid, { letra: s.value, mes: atual?.mes || mesT() });
    desenharEnquadra();
  }));
  tela.querySelectorAll('[data-eq-mes]').forEach(s => s.addEventListener('change', () => {
    const fid = s.dataset.eqMes; E.sel.set(fid, { ...E.sel.get(fid), mes: s.value }); desenharEnquadra();
  }));
  tela.querySelectorAll('[data-eq-ficha]').forEach(b => b.addEventListener('click', () => A.abrirFicha(b.dataset.eqFicha)));
  $('eqEnc')?.addEventListener('change', e => { E.encargos = e.target.value.trim(); setTimeout(desenharEnquadra, 0); });
  $('eqLimpar')?.addEventListener('click', () => { E.sel.clear(); desenharEnquadra(); });
  $('eqProgramar')?.addEventListener('click', () => A.pedirSenha(() => confirmarProgramar(plano(linhas()))));
  $('eqRel').addEventListener('click', () => A.pedirSenha(() => { desenharEnquadra(); mostrar(relEnquadra(linhas()), { barra: true }); }));
  $('eqCsv').addEventListener('click', () => A.pedirSenha(() => { desenharEnquadra(); csvEnquadra(linhas()); }));
}

function confirmarProgramar(pl) {
  if (!pl.length) return;
  const rs = resumoPlano(pl);
  A.dialogo(`<h3>Programar o enquadramento</h3>
    <p class="dica">${pl.length} alteração(ões) de salário serão gravadas com data futura. Cada uma aparece no histórico da pessoa como "programado" e passa a valer sozinha no mês escolhido.</p>
    <ul class="eq-lista">${pl.map(p => `<li><b>${esc(p.x.f.nome)}</b> — ${rotMes(p.mes)}: ${brl(p.x.sal)} → <b>${brl(p.valor)}</b> (faixa ${p.letra}, ${pctTxt(p.valor / p.x.sal - 1)})</li>`).join('')}</ul>
    <p><b>A mais por mês:</b> ${brl(rs.mensal)}</p>
    <div class="aviso erro" id="eqPErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn principal" type="button" id="eqPOk">Programar</button></div>`, d => {
    $('eqPOk').addEventListener('click', async () => {
      const b = $('eqPOk'); b.disabled = true;
      let ok = 0; const pulou = [];
      try {
        for (const p of pl) {
          const desde = p.mes + '-01';
          if (A.salariosDe(p.x.f.id).some(s => s.desde === desde)) { pulou.push(p.x.f.nome); continue; }
          const dv = dividir(p.valor, p.x.peric > 0, p.x.grat > 0);
          const reg = {
            funcionario_id: p.x.f.id, desde, valor: dv.base, periculosidade: dv.peric, gratificacao: dv.grat,
            rh_cargo_id: p.x.cargo.id, faixa: p.letra, faixa_obs: null,
            motivo: p.tipo === 'subir' ? 'horizontal' : 'ajuste',
            insalubridade: Number(p.x.s?.insalubridade) || 0, insalubridade_tipo: p.x.s?.insalubridade_tipo || null,
            justificativa: `Plano de enquadramento (${A.br(A.hoje())})`, criado_por: usuario(), criado_em: new Date().toISOString(),
          };
          const g = await jd.salvar('salarios', reg);
          await jd.registrar({ tabela: 'jor_salarios', registro_id: g.id, acao: 'insert', antes: null, depois: g, justificativa: 'Plano de enquadramento' });
          if (desde <= A.hoje()) await jd.salvarVinculo(p.x.f.id, { faixa: p.letra });
          E.sel.delete(p.x.f.id); ok++;
        }
        d.close();
        E.msg = `${ok} alteração(ões) programada(s).${pulou.length ? ` Ficaram de fora (já têm salário começando no mesmo mês): ${pulou.join(', ')}.` : ''}`;
        desenharEnquadra();
      } catch (e) { b.disabled = false; aviso('eqPErro', 'Não consegui gravar: ' + (e.message || e), 'erro'); }
    });
  }, true);
}

function relEnquadra(todas) {
  const pl = plano(todas), rs = resumoPlano(pl);
  const grupos = ['abaixo', 'entre', 'na', 'acima'];
  return A.documento({
    titulo: 'Enquadramento salarial', subtitulo: 'Posição de cada pessoa na tabela do cargo e plano de adequação',
    canto: `${todas.filter(x => x.sal != null && x.cargo).length} pessoa(s)`, paisagem: true,
    corpo: grupos.map(g => {
      const l = todas.filter(x => x.grupo === g).sort((a, b) => a.cargo.nome.localeCompare(b.cargo.nome) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
      if (!l.length) return '';
      return `<div class="rel-secao">${GRUPOS[g][0]} (${l.length})</div>
        <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Cargo</th><th>Faixa</th><th>Observação</th><th class="rel-num">Salário</th><th>Vai para</th><th class="rel-num">Novo</th><th class="rel-num">A mais/mês</th></tr></thead>
        <tbody>${l.map(x => `<tr><td>${esc(x.f.nome)}</td><td>${esc(x.cargo.nome)}</td><td>${x.faixa || '—'}</td><td>${esc(x.faixaObs || '')}</td>
          <td class="rel-num">${brl(x.sal)}</td><td>${x.alvo ? x.alvo.letra : 'topo'}</td><td class="rel-num">${x.alvo ? brl(x.alvo.valor) : '—'}</td>
          <td class="rel-num ${g === 'abaixo' ? 'rel-pend' : ''}">${x.alvo ? brl(x.alvo.valor - x.sal) : '—'}</td></tr>`).join('')}</tbody></table>`;
    }).join('') + (pl.length ? `<div class="rel-secao">Plano de enquadramento (${pl.length})</div>
      <table class="rel-tabela"><thead><tr><th>A partir de</th><th>Funcionário</th><th>Cargo</th><th class="rel-num">Hoje</th><th>Faixa</th><th class="rel-num">Novo</th><th class="rel-num">A mais/mês</th><th class="rel-num">No ano</th></tr></thead>
      <tbody>${pl.map(p => `<tr><td>${rotMes(p.mes)}</td><td>${esc(p.x.f.nome)}</td><td>${esc(p.x.cargo.nome)}</td><td class="rel-num">${brl(p.x.sal)}</td><td>${p.letra}</td>
        <td class="rel-num">${brl(p.valor)}</td><td class="rel-num">${brl(p.dif)}</td><td class="rel-num">${brl(p.dif * mesesNoAno(p.mes))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="rel-num">${brl(rs.mensal)}</td><td class="rel-num">${Object.entries(rs.anos).map(([a, v]) => `${brl(v)} (${a})`).join(' · ')}</td></tr></tfoot></table>` : '')
      + '<p class="rel-nota">Salário = base + periculosidade + gratificação de função. "Vai para": faixa A para quem está abaixo dela, a faixa gravada para quem está um pouco abaixo dela, senão a próxima faixa. "No ano" soma do mês de início até dezembro, sem encargos.</p>',
  });
}
function csvEnquadra(todas) {
  A.baixarCsv(`Enquadramento_${A.hoje()}.csv`, [
    ['Funcionario', 'Cargo', 'Grupo', 'Faixa', 'Obs. da faixa', 'Salario (total)', 'Vai para', 'Novo salario', 'A mais por mes', 'Marcado no plano', 'A partir de'],
    ...todas.filter(x => x.sal != null && x.cargo).map(x => { const s = E.sel.get(x.f.id); const L = s?.letra || x.alvo?.letra; const v = L ? valorFaixa(x.cargo, L) : null;
      return [x.f.nome, x.cargo.nome, GRUPOS[x.grupo][0], x.faixa || '', x.faixaObs, A.num2(x.sal), L || 'topo', A.num2(v), v ? A.num2(v - x.sal) : '', s ? 'sim' : '', s ? rotMes(s.mes) : '']; }),
  ]);
}

/* ===================================================================
   REAJUSTE ANUAL
   =================================================================== */
const RJ = { vig: null, cen: ['5', '', ''], ativo: 0, encargos: '', lista: [], carregouLista: false, msg: '' };

async function carregarReajustes() {
  const { data, error } = await estado.cliente.from('rh_reajustes').select('*').order('vigencia', { ascending: false });
  if (error) throw error;
  RJ.lista = data || []; RJ.carregouLista = true;
}

/** O salário de cada pessoa no dia antes da vigência (pega o que já foi programado antes). */
function simular(pct) {
  const vigD = RJ.vig + '-01', f = 1 + pct / 100;
  const pessoas = A.ativos().map(A.situacao).map(x => {
    const s = A.salariosDe(x.f.id).find(r => r.desde < vigD);
    if (!s) return null;
    const base = Number(s.valor), peric = Number(s.periculosidade) || 0, grat = Number(s.gratificacao) || 0;
    const antes = r2(base + peric + grat);
    const nb = r2(base * f), np = r2(peric * f), ng = r2(grat * f);
    return { x, s, antes, base: nb, peric: np, grat: ng, depois: r2(nb + np + ng), conflito: A.salariosDe(x.f.id).some(r => r.desde === vigD) };
  }).filter(Boolean);
  const antes = pessoas.reduce((t, p) => t + p.antes, 0), depois = pessoas.reduce((t, p) => t + p.depois, 0);
  return { pct, f, pessoas, antes, depois, mais: depois - antes, noAno: (depois - antes) * mesesNoAno(RJ.vig) };
}

function desenharReajuste() {
  const tela = $('telaRhReajuste');
  if (!RJ.vig) { const a = Number(A.hoje().slice(0, 4)) + 1; RJ.vig = `${a}-01`; }
  const cens = RJ.cen.map(lerPct).map((p, i) => p == null ? null : { i, ...simular(p) });
  if (!cens[RJ.ativo]) RJ.ativo = cens.findIndex(Boolean);
  const at = cens[RJ.ativo] || null;
  const encP = lerPct(RJ.encargos), enc = encP && encP > 0 ? encP / 100 : 0;
  const ce = v => enc ? v * (1 + enc) : v;
  const programados = RJ.lista.filter(r => r.situacao === 'programado');

  tela.innerHTML = `<div class="cartao">
    <div class="barra entre" style="margin:0">
      <div><h2 style="margin:0">Reajuste anual</h2>
        <p class="dica" style="margin:2px 0 0">Simule o reajuste do início do ano: salários e tabela de faixas sobem com o mesmo %. Compare até três cenários; quando decidir, "Aplicar" programa tudo para o mês de vigência.</p></div>
      <span class="acoes">${A.botaoOlho('rjOlho')}
        <button class="btn" type="button" id="rjRel" ${at ? '' : 'disabled'}>Relatório</button>
        <button class="btn mini" type="button" id="rjCsv" ${at ? '' : 'disabled'}>Excel</button></span>
    </div>
    <div class="aviso info" id="rjMsg" ${RJ.msg ? '' : 'hidden'}>${esc(RJ.msg)}</div>
    ${programados.length ? `<div class="aviso info">Já programado: ${programados.map(r => `<b>${esc(String(r.pct).replace('.', ','))}%</b> em ${rotMes(r.vigencia.slice(0, 7))} (${r.pessoas ?? '—'} pessoas)
      <button class="btn mini" type="button" data-rj-cancelar="${r.id}">Cancelar</button>`).join(' · ')}</div>` : ''}

    <div class="grade" style="margin-top:12px">
      <label class="campo">Vigência (mês)<input type="month" id="rjVig" value="${RJ.vig}"></label>
      ${RJ.cen.map((c, i) => `<label class="campo">Cenário ${i + 1} — reajuste (%)<input type="text" inputmode="decimal" data-rj-cen="${i}" value="${esc(c)}" placeholder="${i ? 'opcional' : 'ex.: 5'}"></label>`).join('')}
      <label class="campo">Encargos e provisões (%) <small>opcional</small><input type="text" id="rjEnc" inputmode="decimal" value="${esc(RJ.encargos)}" placeholder="ex.: 68"></label>
    </div>

    <h3 class="rs-h3">Comparação dos cenários</h3>
    <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th></th>${cens.map((c, i) => c ? `<th class="ce">Cenário ${i + 1} · ${esc(RJ.cen[i])}%</th>` : '').join('')}</tr></thead><tbody>
      ${[
        ['Pessoas', c => c.pessoas.length],
        ['Folha por mês — antes', c => V(ce(c.antes))],
        ['Folha por mês — depois', c => `<b>${V(ce(c.depois))}</b>`],
        ['A mais por mês', c => V(ce(c.mais))],
        [`No ano (${rotMes(RJ.vig)} a dez)`, c => `<b>${V(ce(c.noAno))}</b>`],
        ['Em 12 meses', c => V(ce(c.mais * 12))],
      ].map(([rot, fn]) => `<tr><td>${rot}${enc && rot !== 'Pessoas' ? ' <span class="dc-sem">c/ encargos</span>' : ''}</td>${cens.map(c => c ? `<td class="ce">${fn(c)}</td>` : '').join('')}</tr>`).join('')}
      <tr><td></td>${cens.map((c, i) => c ? `<td class="ce"><button class="btn mini ${i === RJ.ativo ? 'principal' : ''}" type="button" data-rj-ver="${i}">${i === RJ.ativo ? 'Detalhado abaixo' : 'Ver detalhe'}</button></td>` : '').join('')}</tr>
    </tbody></table></div>

    ${at ? `<h3 class="rs-h3">Cenário ${RJ.ativo + 1} — ${esc(RJ.cen[RJ.ativo])}% a partir de ${rotMes(RJ.vig)}</h3>
    <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>Funcionário</th><th>Cargo</th><th class="ce">Faixa</th><th class="ce">Antes</th><th class="ce">Depois</th><th class="ce">A mais/mês</th><th></th></tr></thead><tbody>
      ${at.pessoas.slice().sort((a, b) => a.x.f.nome.localeCompare(b.x.f.nome, 'pt-BR')).map(p => `<tr><td>${esc(p.x.f.nome)}</td><td>${esc(p.x.cargo?.nome || p.x.f.cargo || '—')}</td>
        <td class="ce">${p.s.faixa || '—'}</td><td class="ce">${V(p.antes)}</td><td class="ce"><b>${V(p.depois)}</b>${p.peric > 0 || p.grat > 0 ? `<br><span class="dc-sem">base ${V(p.base)}</span>` : ''}</td>
        <td class="ce">${V(p.depois - p.antes)}</td><td>${p.conflito ? '<span class="tag alerta" title="Já existe salário começando neste mês — fica de fora ao aplicar">já tem alteração no mês</span>' : ''}</td></tr>`).join('')}
      <tr class="dc-total"><td colspan="3">${at.pessoas.length} pessoa(s)</td><td class="ce">${V(at.antes)}</td><td class="ce">${V(at.depois)}</td><td class="ce">${V(at.mais)}</td><td></td></tr>
    </tbody></table></div>

    <h3 class="rs-h3">Tabela de faixas depois do reajuste</h3>
    <div class="rolagem"><table class="dc-planilha rs-mini"><thead><tr><th>Cargo</th>${LETRAS.map(L => `<th class="ce">${L} hoje</th><th class="ce">${L} novo</th>`).join('')}</tr></thead><tbody>
      ${A.cargos().filter(c => LETRAS.some(L => valorFaixa(c, L))).map(c => `<tr><td>${esc(c.nome)}</td>${LETRAS.map(L => { const v = valorFaixa(c, L);
        return `<td class="ce dc-sem">${v ? V(v) : '—'}</td><td class="ce">${v ? V(r2(v * at.f)) : '—'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>

    <div class="barra">
      <span class="dc-sem">Aplicar grava os salários novos com data ${A.br(RJ.vig + '-01')} (motivo: reajuste) e programa a tabela de faixas para subir na mesma data.</span>
      <button class="btn principal" type="button" id="rjAplicar" style="margin-left:auto">Aplicar ${esc(RJ.cen[RJ.ativo])}% em ${rotMes(RJ.vig)}</button>
    </div>` : '<p class="dica">Informe o % de pelo menos um cenário.</p>'}

    ${RJ.lista.length ? `<h3 class="rs-h3">Histórico de reajustes</h3>
    <table class="dc-planilha rs-mini"><thead><tr><th>Vigência</th><th class="ce">%</th><th class="ce">Pessoas</th><th class="ce">Folha antes</th><th class="ce">Folha depois</th><th>Situação</th><th>Por</th></tr></thead><tbody>
      ${RJ.lista.map(r => `<tr><td>${rotMes(r.vigencia.slice(0, 7))}</td><td class="ce">${esc(String(r.pct).replace('.', ','))}%</td><td class="ce">${r.pessoas ?? '—'}</td>
        <td class="ce">${r.folha_antes != null ? V(Number(r.folha_antes)) : '—'}</td><td class="ce">${r.folha_depois != null ? V(Number(r.folha_depois)) : '—'}</td>
        <td><span class="tag ${r.situacao === 'aplicado' ? 'ativo' : r.situacao === 'cancelado' ? 'neutra' : 'alerta'}">${r.situacao}</span>${r.aplicado_em ? ` <span class="dc-sem">tabela em ${A.br(r.aplicado_em.slice(0, 10))}</span>` : ''}</td>
        <td class="dc-sem">${esc(r.criado_por || '')}</td></tr>`).join('')}
    </tbody></table>` : ''}
  </div>`;

  A.ligarOlho('rjOlho', desenharReajuste);
  const reler = () => setTimeout(desenharReajuste, 0);
  $('rjVig').addEventListener('change', e => { RJ.vig = e.target.value || RJ.vig; RJ.msg = ''; reler(); });
  tela.querySelectorAll('[data-rj-cen]').forEach(i => i.addEventListener('change', () => { RJ.cen[+i.dataset.rjCen] = i.value.trim(); RJ.msg = ''; reler(); }));
  $('rjEnc').addEventListener('change', e => { RJ.encargos = e.target.value.trim(); reler(); });
  tela.querySelectorAll('[data-rj-ver]').forEach(b => b.addEventListener('click', () => { RJ.ativo = +b.dataset.rjVer; desenharReajuste(); }));
  tela.querySelectorAll('[data-rj-cancelar]').forEach(b => b.addEventListener('click', () => A.pedirSenha(() => cancelarReajuste(b.dataset.rjCancelar))));
  $('rjAplicar')?.addEventListener('click', () => A.pedirSenha(() => confirmarAplicar(at)));
  $('rjRel').addEventListener('click', () => at && A.pedirSenha(() => { desenharReajuste(); mostrar(relReajuste(cens.filter(Boolean), at, enc), { barra: true }); }));
  $('rjCsv').addEventListener('click', () => at && A.pedirSenha(() => { desenharReajuste(); csvReajuste(at); }));
}

function confirmarAplicar(at) {
  if (!at) return;
  const vigD = RJ.vig + '-01';
  const vale = at.pessoas.filter(p => !p.conflito);
  const jaTem = RJ.lista.find(r => r.situacao !== 'cancelado' && r.vigencia === vigD);
  A.dialogo(`<h3>Aplicar reajuste de ${esc(RJ.cen[RJ.ativo])}%</h3>
    ${jaTem ? `<div class="aviso erro">Já existe um reajuste ${jaTem.situacao} para ${rotMes(RJ.vig)}. Cancele o anterior antes de aplicar outro no mesmo mês.</div>` : ''}
    <p>Vigência: <b>${A.br(vigD)}</b></p>
    <ul class="eq-lista">
      <li><b>${vale.length}</b> salário(s) novo(s) gravado(s) com essa data, motivo "Reajuste / dissídio".${at.pessoas.length - vale.length ? ` ${at.pessoas.length - vale.length} pessoa(s) ficam de fora porque já têm salário começando nesse mês.` : ''}</li>
      <li>A <b>tabela de faixas</b> de todos os cargos sobe ${esc(RJ.cen[RJ.ativo])}% em ${A.br(vigD)} — sozinha, no primeiro acesso a partir da data.</li>
      <li>Folha: ${brl(at.antes)} → <b>${brl(at.depois)}</b> por mês (+${brl(at.mais)}).</li>
    </ul>
    <p class="dica">Até a vigência, dá para desfazer: "Cancelar" no aviso de reajuste programado apaga os salários lançados por ele e a programação da tabela.</p>
    <div class="aviso erro" id="rjAErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Voltar</button>
      <button class="btn principal" type="button" id="rjAOk" ${jaTem ? 'disabled' : ''}>Aplicar</button></div>`, d => {
    $('rjAOk').addEventListener('click', async () => {
      const b = $('rjAOk'); b.disabled = true;
      try {
        const tabela_antes = A.cargos().map(c => Object.fromEntries([['id', c.id], ['nome', c.nome], ...COLUNAS_FAIXA.map(k => [k, c[k]])]));
        const { data: rj, error } = await estado.cliente.from('rh_reajustes').insert({
          vigencia: vigD, pct: lerPct(RJ.cen[RJ.ativo]), reajusta_tabela: true, situacao: 'programado',
          pessoas: vale.length, folha_antes: r2(at.antes), folha_depois: r2(vale.reduce((t, p) => t + p.depois, 0) + at.pessoas.filter(p => p.conflito).reduce((t, p) => t + p.antes, 0)),
          tabela_antes, criado_por: usuario(),
        }).select().single();
        if (error) throw error;
        const just = `Reajuste anual ${RJ.cen[RJ.ativo]}% · ${rj.id}`;
        for (const p of vale) {
          /* A faixa fica a mesma: a tabela sobe junto. A observação (diferença
             para a faixa) sobe na mesma proporção. */
          const reg = {
            funcionario_id: p.x.f.id, desde: vigD, valor: p.base, periculosidade: p.peric, gratificacao: p.grat,
            rh_cargo_id: p.s.rh_cargo_id || p.x.cargo?.id || null, faixa: p.s.faixa || null,
            faixa_obs: p.x.cargo ? obsFaixaReajustada(p, at.f) : null, motivo: 'reajuste',
            insalubridade: Number(p.s.insalubridade) || 0, insalubridade_tipo: p.s.insalubridade_tipo || null,
            justificativa: just, criado_por: usuario(), criado_em: new Date().toISOString(),
          };
          const g = await jd.salvar('salarios', reg);
          await jd.registrar({ tabela: 'jor_salarios', registro_id: g.id, acao: 'insert', antes: null, depois: g, justificativa: just });
        }
        await carregarReajustes();
        d.close();
        RJ.msg = `Reajuste de ${RJ.cen[RJ.ativo]}% programado para ${rotMes(RJ.vig)}: ${vale.length} salário(s) gravado(s). A tabela de faixas sobe na mesma data.`;
        desenharReajuste();
      } catch (e) { b.disabled = false; aviso('rjAErro', 'Não consegui aplicar: ' + (e.message || e), 'erro'); }
    });
  }, true);
}
/** A observação "R$ X abaixo da B" recalculada com salário e tabela reajustados. */
function obsFaixaReajustada(p, f) {
  const c = p.x.cargo; if (!c) return null;
  const cf = Object.fromEntries(COLUNAS_FAIXA.map(k => [k, c[k] != null ? r2(Number(c[k]) * f) : c[k]]));
  return obsFaixa({ ...c, ...cf }, p.s.faixa || null, p.depois);
}

function cancelarReajuste(id) {
  const r = RJ.lista.find(x => x.id === id);
  if (!r) return;
  const regs = (jd.dados.salarios || []).filter(s => s.desde === r.vigencia && s.motivo === 'reajuste' && String(s.justificativa || '').includes(id));
  A.dialogo(`<h3>Cancelar o reajuste de ${esc(String(r.pct).replace('.', ','))}%</h3>
    <p>Vigência ${A.br(r.vigencia)}. Serão apagados <b>${regs.length}</b> salário(s) programado(s) por ele, e a tabela de faixas não vai mais subir.</p>
    <label class="campo plena">Motivo (obrigatório)<input type="text" id="rjCMot" maxlength="200"></label>
    <div class="aviso erro" id="rjCErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Voltar</button>
      <button class="btn perigo" type="button" id="rjCOk">Cancelar reajuste</button></div>`, d => {
    $('rjCOk').addEventListener('click', async () => {
      const mot = $('rjCMot').value.trim();
      if (!mot) return aviso('rjCErro', 'Escreva o motivo.', 'erro');
      const b = $('rjCOk'); b.disabled = true;
      try {
        for (const s of regs) {
          await jd.registrar({ tabela: 'jor_salarios', registro_id: s.id, acao: 'delete', antes: s, depois: null, justificativa: 'Reajuste cancelado: ' + mot });
          await jd.apagar('salarios', s.id);
        }
        const { error } = await estado.cliente.from('rh_reajustes').update({ situacao: 'cancelado', obs: mot }).eq('id', id);
        if (error) throw error;
        await carregarReajustes();
        d.close(); RJ.msg = `Reajuste cancelado. ${regs.length} salário(s) programado(s) apagado(s).`; desenharReajuste();
      } catch (e) { b.disabled = false; aviso('rjCErro', 'Não consegui cancelar: ' + (e.message || e), 'erro'); }
    });
  });
}

function relReajuste(cens, at, enc) {
  const ce = v => enc ? v * (1 + enc) : v;
  return A.documento({
    titulo: 'Reajuste anual — simulação', subtitulo: `Vigência ${rotMes(RJ.vig)} · salários e tabela de faixas com o mesmo %`,
    canto: enc ? `com encargos de ${esc(RJ.encargos)}%` : 'sem encargos', paisagem: true,
    corpo: `<div class="rel-secao">Cenários</div>
      <table class="rel-tabela"><thead><tr><th>Cenário</th><th class="rel-num">%</th><th class="rel-num">Pessoas</th><th class="rel-num">Folha antes</th><th class="rel-num">Folha depois</th><th class="rel-num">A mais/mês</th><th class="rel-num">No ano (até dez)</th><th class="rel-num">Em 12 meses</th></tr></thead>
      <tbody>${cens.map(c => `<tr><td>Cenário ${c.i + 1}</td><td class="rel-num">${esc(RJ.cen[c.i])}%</td><td class="rel-num">${c.pessoas.length}</td><td class="rel-num">${brl(ce(c.antes))}</td>
        <td class="rel-num">${brl(ce(c.depois))}</td><td class="rel-num">${brl(ce(c.mais))}</td><td class="rel-num">${brl(ce(c.noAno))}</td><td class="rel-num">${brl(ce(c.mais * 12))}</td></tr>`).join('')}</tbody></table>
      <div class="rel-secao">Cenário ${at.i + 1} (${esc(RJ.cen[at.i])}%) por pessoa</div>
      <table class="rel-tabela"><thead><tr><th>Funcionário</th><th>Cargo</th><th>Faixa</th><th class="rel-num">Antes</th><th class="rel-num">Depois</th><th class="rel-num">A mais/mês</th></tr></thead>
      <tbody>${at.pessoas.slice().sort((a, b) => a.x.f.nome.localeCompare(b.x.f.nome, 'pt-BR')).map(p => `<tr><td>${esc(p.x.f.nome)}</td><td>${esc(p.x.cargo?.nome || '—')}</td><td>${p.s.faixa || '—'}</td>
        <td class="rel-num">${brl(p.antes)}</td><td class="rel-num">${brl(p.depois)}</td><td class="rel-num">${brl(p.depois - p.antes)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="rel-num">${brl(at.antes)}</td><td class="rel-num">${brl(at.depois)}</td><td class="rel-num">${brl(at.mais)}</td></tr></tfoot></table>
      <p class="rel-nota">Simulação. Salário = base + periculosidade + gratificação de função; os três sobem com o mesmo %. Considera alterações já programadas antes da vigência. A tabela de faixas sobe com o mesmo %.</p>`,
  });
}
function csvReajuste(at) {
  A.baixarCsv(`Reajuste_${RJ.cen[RJ.ativo]}pct_${RJ.vig}.csv`, [
    ['Funcionario', 'Cargo', 'Faixa', 'Antes (total)', 'Base nova', 'Periculosidade nova', 'Gratificacao nova', 'Depois (total)', 'A mais por mes'],
    ...at.pessoas.map(p => [p.x.f.nome, p.x.cargo?.nome || '', p.s.faixa || '', A.num2(p.antes), A.num2(p.base), A.num2(p.peric), A.num2(p.grat), A.num2(p.depois), A.num2(p.depois - p.antes)]),
    ['TOTAL', '', '', A.num2(at.antes), '', '', '', A.num2(at.depois), A.num2(at.mais)],
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_ENQUADRA = ['rhEnquadra', 'rhReajuste'];

export async function abrirEnquadra(tela) {
  const alvo = $(tela === 'rhEnquadra' ? 'telaRhEnquadra' : 'telaRhReajuste');
  if (!alvo) return;
  A.fecharOlho();
  alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando os salários…</p></div>';
  try {
    await A.garantir();
    if (tela === 'rhReajuste') await carregarReajustes();
  } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir: ${esc(e.message || e)}</div></div>`; return; }
  if (tela === 'rhEnquadra') desenharEnquadra(); else desenharReajuste();
}

export function limparEnquadra() {
  E.sel.clear(); E.cargo = ''; E.grupo = ''; E.encargos = ''; E.msg = '';
  RJ.vig = null; RJ.cen = ['5', '', '']; RJ.ativo = 0; RJ.encargos = ''; RJ.lista = []; RJ.carregouLista = false; RJ.msg = '';
}
