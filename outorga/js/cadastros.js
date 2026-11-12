// cadastros.js — Cadastros da Outorga e Irrigação (12/11/2026).
//   otPontos     — locais (fazendas) e pontos de controle: cada ponto vira uma
//                  ficha de outorga. O tipo (horímetro = horas, hidrômetro = m³)
//                  define as colunas e o título (decisão dele, set/2026).
//   otItens      — o que se recolhe todo mês (o checklist "Recolhimento" do
//                  Rastro): nome, tipo, fazenda, ficha ligada e produtor.
//   otProdutores — produtores da irrigação (G8, SAKUMA).
// Nada se apaga: desativar tira das listas e guarda o histórico.
import { $, esc, pronto, carregando, gravar, aviso, abrirModal, fecharModal, locais, local, pontosDe, ponto,
  produtores, itens, nomeLocal, colunasDe } from './dados.js';

/* Tipos de ponto (os mesmos do app avulso). */
const MODELOS = {
  horimetro4:   { nome: 'Horímetro — horas',                titulo: "CONTROLE HORÍMETRO BOMBA D'ÁGUA", cols: ['DATA', 'HORA INICIAL', 'HORA FINAL', 'RESPONSÁVEL'] },
  horimetro5:   { nome: 'Horímetro — horas com observação', titulo: "CONTROLE HORÍMETRO BOMBA D'ÁGUA", cols: ['DATA', 'HORA INICIAL', 'HORA FINAL', 'OBSERVAÇÃO', 'RESPONSÁVEL'] },
  hidrometro4:  { nome: 'Hidrômetro — m³',                  titulo: 'CONTROLE HIDRÔMETRO',             cols: ['DATA', 'M³ INICIAL', 'M³ FINAL', 'RESPONSÁVEL'] },
  hidrometro5:  { nome: 'Hidrômetro — m³ com observação',   titulo: 'CONTROLE HIDRÔMETRO',             cols: ['DATA', 'M³ INICIAL', 'M³ FINAL', 'OBSERVAÇÃO', 'RESPONSÁVEL'] },
  leituraEquip: { nome: 'Leitura de equipamento',           titulo: 'LEITURA EQUIPAMENTO',             cols: ['DATA', 'HORA', 'HORÍMETRO', 'MEDIDOR DE VAZÃO', 'RESPONSÁVEL'] },
  custom:       { nome: 'Personalizado',                    titulo: 'CONTROLE',                        cols: [] },
};
const modeloDe = c => (Object.entries(MODELOS).find(([k, v]) => k !== 'custom' && v.cols.join('|') === colunasDe(c).join('|')) || ['custom'])[0];
const ultimaOrdem = l => l.reduce((m, x) => Math.max(m, Number(x.ordem) || 0), -1) + 1;
const espera = alvo => { if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return true; } return false; };

/* ---------------- locais e pontos ---------------- */
export function abrirPontos() {
  const alvo = $('otPontosCorpo');
  if (!alvo || espera(alvo)) return;
  const ls = locais(true);
  alvo.innerHTML = `<div class="barra" style="margin:0 0 12px"><button class="btn principal" type="button" id="opNovoLocal">+ Novo local</button></div>` +
    (ls.map(l => {
      const ps = pontosDe(l.id, true);
      const inat = l.ativo === false;
      return `<section class="ot-cad-local">
        <header><span><b>${esc(l.nome)}</b> <small class="dc-sem">· ${esc(l.tipo || 'Fazenda')} · ${esc(l.cabecalho || 'sem cabeçalho')}</small>${inat ? ' <span class="tag inativo">desativado</span>' : ''}</span>
          <span class="barra" style="margin:0"><button class="btn mini" type="button" data-ed-local="${esc(l.id)}">Editar</button>
          ${inat ? '' : `<button class="btn mini" type="button" data-novo-ponto="${esc(l.id)}">+ Ponto de controle</button>`}
          <button class="btn mini" type="button" data-at-local="${esc(l.id)}">${inat ? 'Reativar' : 'Desativar'}</button></span></header>
        <div class="cb-rolagem"><table class="dc-planilha cb-tab">
          <thead><tr><th>Ponto</th><th>Título da ficha</th><th>Cabeçalho</th><th>Colunas</th><th></th></tr></thead>
          <tbody>${ps.map(c => `<tr class="${c.ativo === false ? 'cb-inativa' : ''}">
            <td><b>${esc(c.nav_label)}</b></td><td>${esc(c.titulo)}</td><td>${esc(c.header)}</td>
            <td class="dc-sem">${esc(MODELOS[modeloDe(c)].nome)}<small class="cb-meses-lista">${esc(colunasDe(c).join(' · '))}</small></td>
            <td style="white-space:nowrap"><button class="btn mini" type="button" data-ed-ponto="${esc(c.id)}">Editar</button>
              <button class="btn mini" type="button" data-at-ponto="${esc(c.id)}">${c.ativo === false ? 'Reativar' : 'Desativar'}</button></td></tr>`).join('')
            || '<tr><td colspan="5" class="vazio">Nenhum ponto de controle neste local.</td></tr>'}</tbody>
        </table></div></section>`;
    }).join('') || '<div class="vazio">Nenhum local cadastrado.</div>');
  $('opNovoLocal').onclick = () => formLocal(null);
  alvo.querySelectorAll('[data-ed-local]').forEach(b => b.onclick = () => formLocal(local(b.dataset.edLocal)));
  alvo.querySelectorAll('[data-novo-ponto]').forEach(b => b.onclick = () => formPonto(local(b.dataset.novoPonto), null));
  alvo.querySelectorAll('[data-ed-ponto]').forEach(b => b.onclick = () => { const c = ponto(b.dataset.edPonto); formPonto(local(c.local_id), c); });
  alvo.querySelectorAll('[data-at-local]').forEach(b => b.onclick = async () => {
    const l = local(b.dataset.atLocal); await gravar('out_locais', { ...l, ativo: l.ativo === false }); abrirPontos();
  });
  alvo.querySelectorAll('[data-at-ponto]').forEach(b => b.onclick = async () => {
    const c = ponto(b.dataset.atPonto); await gravar('out_controles', { ...c, ativo: c.ativo === false }); abrirPontos();
  });
}

function formLocal(l) {
  abrirModal(l ? 'Editar local' : 'Novo local', `
    <div class="grade">
      <label class="campo plena">Nome <input type="text" id="flNome" maxlength="80" value="${esc(l?.nome || '')}" placeholder="Ex.: Faz. Faca"></label>
      <label class="campo">Tipo <select id="flTipo">${['Fazenda', 'Sede', 'Outro'].map(t => `<option${(l?.tipo || 'Fazenda') === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Cabeçalho da ficha <input type="text" id="flCab" maxlength="80" value="${esc(l?.cabecalho || '')}" placeholder="Ex.: FAZ: FACA"></label>
    </div>
    <div class="barra fim"><button class="btn" type="button" id="flCancelar">Cancelar</button><button class="btn principal" type="button" id="flSalvar">Salvar</button></div>`, corpo => {
    corpo.querySelector('#flCancelar').onclick = fecharModal;
    corpo.querySelector('#flSalvar').onclick = async () => {
      const nome = corpo.querySelector('#flNome').value.trim();
      if (!nome) { aviso('Informe o nome do local.', true); return; }
      const reg = { ...(l || { ordem: ultimaOrdem(locais(true)), ativo: true }), nome,
        tipo: corpo.querySelector('#flTipo').value, cabecalho: corpo.querySelector('#flCab').value.trim() || null };
      await gravar('out_locais', reg);
      fecharModal(); abrirPontos();
    };
  });
}

function formPonto(l, c) {
  const mod = c ? modeloDe(c) : 'horimetro4';
  abrirModal(c ? 'Editar ponto de controle' : 'Novo ponto de controle · ' + l.nome, `
    <div class="grade">
      <label class="campo plena">Nome do ponto <input type="text" id="fpNome" maxlength="80" value="${esc(c?.nav_label || '')}" placeholder="Ex.: Bomba D'Água Nº 1"></label>
      <label class="campo plena">Tipo de controle <select id="fpMod">${Object.entries(MODELOS).map(([k, v]) => `<option value="${k}"${k === mod ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>
      <label class="campo plena">Título da ficha <input type="text" id="fpTit" maxlength="80" value="${esc(c?.titulo || MODELOS[mod].titulo)}"></label>
      <label class="campo plena">Cabeçalho da ficha <input type="text" id="fpCab" maxlength="120" value="${esc(c?.header || l.cabecalho || '')}" placeholder="Ex.: FAZ: FACA / BOMBA D'ÁGUA Nº 1"></label>
      <label class="campo plena" id="fpColsCampo"${mod === 'custom' ? '' : ' hidden'}>Colunas (separe com ;) <input type="text" id="fpCols" value="${esc((c ? colunasDe(c) : MODELOS[mod].cols).join('; '))}"></label>
    </div>
    <p class="dc-sem">Horímetro registra horas; hidrômetro registra m³. O tipo define as colunas e o título da ficha.</p>
    <div class="barra fim"><button class="btn" type="button" id="fpCancelar">Cancelar</button><button class="btn principal" type="button" id="fpSalvar">Salvar</button></div>`, corpo => {
    const q = s => corpo.querySelector(s);
    q('#fpMod').onchange = e => {
      const k = e.target.value, custom = k === 'custom';
      q('#fpColsCampo').hidden = !custom;
      if (!custom) { q('#fpCols').value = MODELOS[k].cols.join('; '); q('#fpTit').value = MODELOS[k].titulo; }
    };
    q('#fpCancelar').onclick = fecharModal;
    q('#fpSalvar').onclick = async () => {
      const nome = q('#fpNome').value.trim();
      if (!nome) { aviso('Informe o nome do ponto.', true); return; }
      const k = q('#fpMod').value;
      const colunas = k === 'custom' ? q('#fpCols').value.split(';').map(s => s.trim().toUpperCase()).filter(Boolean) : MODELOS[k].cols.slice();
      if (colunas.length < 2) { aviso('Informe pelo menos duas colunas.', true); return; }
      const reg = { ...(c || { local_id: l.id, ordem: ultimaOrdem(pontosDe(l.id, true)), ativo: true }),
        nav_label: nome, titulo: q('#fpTit').value.trim() || 'CONTROLE',
        header: q('#fpCab').value.trim() || l.cabecalho || String(l.nome).toUpperCase(), colunas };
      await gravar('out_controles', reg);
      fecharModal(); abrirPontos();
    };
  });
}

/* ---------------- itens do recolhimento ---------------- */
export function abrirItens() {
  const alvo = $('otItensCorpo');
  if (!alvo || espera(alvo)) return;
  const lista = itens(true), ls = locais(), ps = produtores();
  const optLocal = id => `<option value="">—</option>` + ls.map(l => `<option value="${esc(l.id)}"${l.id === id ? ' selected' : ''}>${esc(l.nome)}</option>`).join('');
  const optPonto = (lid, id) => `<option value="">— sem ficha —</option>` + (lid ? pontosDe(lid) : []).map(c => `<option value="${esc(c.id)}"${c.id === id ? ' selected' : ''}>${esc(c.nav_label)}</option>`).join('');
  const optProd = v => `<option value="">—</option>` + ps.map(p => `<option${p.nome === v ? ' selected' : ''}>${esc(p.nome)}</option>`).join('');
  alvo.innerHTML = `
    <div class="barra" style="margin:0 0 12px"><button class="btn principal" type="button" id="oiNovo">+ Novo item</button></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab ot-tab">
      <thead><tr><th class="ce">Ordem</th><th>Nome no checklist</th><th>Tipo</th><th>Fazenda</th><th>Ficha de outorga ligada</th><th>Produtor</th><th></th></tr></thead>
      <tbody>${lista.map(i => `<tr class="${i.ativo === false ? 'cb-inativa' : ''}" data-item="${esc(i.id)}">
        <td class="ce"><input class="ot-obs" style="width:56px;min-width:0;text-align:center" type="number" data-c="ordem" value="${esc(i.ordem ?? '')}"></td>
        <td><input class="ot-obs" type="text" maxlength="120" data-c="nome" value="${esc(i.nome)}"></td>
        <td><select class="ot-obs" data-c="tipo"><option value="outorga"${i.tipo === 'outorga' ? ' selected' : ''}>Outorga</option><option value="irrigacao"${i.tipo === 'irrigacao' ? ' selected' : ''}>Irrigação</option></select></td>
        <td><select class="ot-obs" data-c="local_id">${optLocal(i.local_id)}</select></td>
        <td>${i.tipo === 'outorga' ? `<select class="ot-obs" data-c="controle_id">${optPonto(i.local_id, i.controle_id)}</select>` : '<span class="dc-sem">ficha de irrigação</span>'}</td>
        <td>${i.tipo === 'irrigacao' ? `<select class="ot-obs" data-c="produtor">${optProd(i.produtor)}</select>` : '<span class="dc-sem">—</span>'}</td>
        <td><button class="btn mini" type="button" data-at="${esc(i.id)}">${i.ativo === false ? 'Reativar' : 'Desativar'}</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum item.</td></tr>'}</tbody>
    </table></div>
    <p class="dc-sem" style="margin:8px 0 0">Cada item ativo é uma linha do Recebimento e um item do checklist "Recolhimento" no Rastro. Ligue a ficha de outorga para poder reimprimir a ficha certa direto do Recebimento.</p>`;
  const item = id => lista.find(x => x.id === id);
  alvo.querySelectorAll('[data-item] [data-c]').forEach(el => el.onchange = async () => {
    const i = item(el.closest('[data-item]').dataset.item), c = el.dataset.c;
    let v = el.value;
    if (c === 'nome') { v = v.trim(); if (!v) { aviso('O nome não pode ficar vazio.', true); abrirItens(); return; } }
    if (c === 'ordem') v = Number(v) || 0;
    if (c === 'local_id' || c === 'controle_id' || c === 'produtor') v = v || null;
    const reg = { ...i, [c]: v };
    if (c === 'local_id') reg.controle_id = null;
    if (c === 'tipo') { if (v === 'irrigacao') { reg.controle_id = null; reg.produtor = reg.produtor || 'SAKUMA'; } else reg.produtor = null; }
    await gravar('out_itens', reg);
    abrirItens();
  });
  alvo.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
    const i = item(b.dataset.at); await gravar('out_itens', { ...i, ativo: i.ativo === false }); abrirItens();
  });
  $('oiNovo').onclick = async () => {
    const nome = prompt('Nome do item no checklist (ex.: Outorga - Faz. Faca poço 2):');
    if (!nome || !nome.trim()) return;
    await gravar('out_itens', { nome: nome.trim(), tipo: /irriga/i.test(nome) ? 'irrigacao' : 'outorga', local_id: null, controle_id: null,
      produtor: /irriga/i.test(nome) ? 'SAKUMA' : null, ordem: ultimaOrdem(lista), ativo: true });
    abrirItens();
  };
}

/* ---------------- produtores ---------------- */
export function abrirProdutores() {
  const alvo = $('otProdutoresCorpo');
  if (!alvo || espera(alvo)) return;
  const lista = produtores(true);
  alvo.innerHTML = `
    <div class="barra" style="margin:0 0 12px"><input class="ot-obs" style="max-width:240px" type="text" id="opNome" maxlength="40" placeholder="Nome do produtor">
      <button class="btn principal" type="button" id="opAdd">+ Adicionar</button></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab" style="max-width:520px">
      <thead><tr><th>Produtor</th><th></th></tr></thead>
      <tbody>${lista.map(p => `<tr class="${p.ativo === false ? 'cb-inativa' : ''}"><td><b>${esc(p.nome)}</b></td>
        <td style="text-align:right"><button class="btn mini" type="button" data-at="${esc(p.id)}">${p.ativo === false ? 'Reativar' : 'Desativar'}</button></td></tr>`).join('') || '<tr><td colspan="2" class="vazio">Nenhum produtor.</td></tr>'}</tbody>
    </table></div>`;
  $('opAdd').onclick = async () => {
    const nome = $('opNome').value.trim().toUpperCase();
    if (!nome) return;
    if (lista.some(p => p.nome.toUpperCase() === nome)) { aviso('Esse produtor já existe.', true); return; }
    await gravar('out_produtores', { nome, ordem: ultimaOrdem(lista), ativo: true });
    abrirProdutores();
  };
  alvo.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
    const p = lista.find(x => x.id === b.dataset.at); await gravar('out_produtores', { ...p, ativo: p.ativo === false }); abrirProdutores();
  });
}
