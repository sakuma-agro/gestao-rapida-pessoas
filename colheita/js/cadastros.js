// cadastros.js — Plantios/quadras, Safras, Placas e motoristas, Histórico de safras (20/10/2026).
import { $, esc, pronto, carregando, todos, ativos, gravar, aviso, culturas, culturaSel, safraSel, safrasDe, campos, rotArea, rotAreaPl, Maiusc,
  plantiosDa, porPlantio, FAZENDAS, nomeCurto, dataBR, num, lerNumero, semAcento } from './dados.js';

const abrindo = '<div class="vazio">Abrindo…</div>';
const dataISO = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
const txt = (fd, k) => { const v = String(fd.get(k) || '').trim(); return v || null; };
const opFaz = sel => ['', ...FAZENDAS].map(f => `<option value="${esc(f)}"${f === (sel || '') ? ' selected' : ''}>${esc(f || '—')}</option>`).join('');

/* ================================================================ plantios */
function desenharPlantios() {
  const alvo = $('cpPlantiosCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Cadastre primeiro uma safra para esta cultura (aba Safras).</div>'; return; }
  $('cpPlTitulo').textContent = Maiusc(rotAreaPl(cult)) + ' · ' + cult.nome + ' ' + saf.nome;
  const linhas = porPlantio(saf.id, cult);
  const encerrados = plantiosDa(saf.id).filter(p => p.ativo === false);
  const area = linhas.reduce((s, l) => s + l.area, 0);
  const cafe = rotArea(cult) === 'quadra';
  const abac = semDatasPlantio(cult);
  alvo.innerHTML = `
    <div class="barra" style="margin-top:0"><button class="btn principal" type="button" id="cpPlNovo">+ Novo ${esc(rotArea(cult))}</button>
      ${safrasDe(cult.id).length > 1 ? '<button class="btn" type="button" id="cpPlCopiar" title="Traz os plantios/quadras de outra safra (útil no café e no abacate, que repetem a cada ano)">Copiar de outra safra</button>' : ''}
      <span class="dc-sem">${linhas.length} ${esc(rotAreaPl(cult))} · ${num(area, 2)} ha</span></div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Cód. Agro</th><th>${esc(Maiusc(rotArea(cult)))}</th><th>Fazenda</th><th>Pivô / talhão</th>${cafe ? '<th>Bloco</th><th class="ce">Ano plantio</th>' : ''}<th class="dir">Área (ha)</th><th>Variedade</th>${abac ? '' : '<th>Início plantio</th><th>Fim plantio</th>'}<th>Colheita</th><th>Situação</th><th></th></tr></thead>
      <tbody>${linhas.map(l => { const p = l.p; return `<tr>
        <td>${esc(p.cod_agro || '')}</td><td><b>${esc(p.nome)}</b>${p.nome_completo ? `<small class="cb-meses-lista">${esc(p.nome_completo)}</small>` : ''}</td>
        <td>${esc(nomeCurto(p.fazenda))}</td><td>${esc(p.setor || '')}</td>${cafe ? `<td>${esc(p.bloco || '')}</td><td class="ce">${esc(p.ano_plantio || '')}</td>` : ''}
        <td class="dir">${Number(p.area) ? num(p.area, 2) : '<span class="cb-pin alerta">sem área</span>'}</td><td>${esc(p.variedade || '')}</td>
        ${abac ? '' : `<td>${dataBR(p.inicio_plantio)}</td><td>${dataBR(p.fim_plantio)}</td>`}
        <td>${l.colhido ? dataBR(l.ini) + ' a ' + dataBR(l.fim) + ` <small class="dc-sem">${l.cargas} cargas</small>` : '<span class="dc-sem">a colher</span>'}</td>
        <td>${esc(p.situacao || '')}</td>
        <td class="dir"><button class="btn mini" type="button" data-editar="${esc(p.id)}">Editar</button></td></tr>`; }).join('')
        || `<tr><td colspan="${abac ? 11 : 13}" class="vazio">Nenhum ${esc(rotArea(cult))} cadastrado nesta safra.</td></tr>`}</tbody>
      <tfoot><tr class="dc-total"><td></td><td>Total</td><td></td><td></td>${cafe ? '<td></td><td></td>' : ''}<td class="dir">${num(area, 2)}</td><td colspan="${abac ? 4 : 6}"></td></tr></tfoot>
    </table></div>
    ${encerrados.length ? `<p class="dc-sem">Encerrados (fora das contas): ${encerrados.map(p => `<a href="#" data-editar="${esc(p.id)}">${esc(p.nome)}</a>`).join(', ')}</p>` : ''}`;
  $('cpPlNovo').addEventListener('click', () => editarPlantio(null));
  $('cpPlCopiar')?.addEventListener('click', () => copiarDeSafra(cult, saf));
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); editarPlantio(b.dataset.editar); }));
}

/* Abacate (28/10/2026, pedido dele): sem Início/Fim do plantio; no lugar,
   a safra a que o plantio pertence (2025/2026, 2026/2027…). */
const semDatasPlantio = c => !!c && c.slug === 'abacate';
/* Pivô/talhão e variedade vêm dos cadastros (Cadastros › Pivôs / talhões e
   Variedades, 28/10/2026). O plantio guarda o nome (campos setor e
   variedade), como antes; valor antigo que não está no cadastro continua
   aparecendo, marcado "não cadastrado". */
const ordPivo = (a, b) => String(a.fazenda || '').localeCompare(String(b.fazenda || ''), 'pt-BR') || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true });
function opPivos(p) {
  const ls = ativos('cp_pivos').slice().sort(ordPivo);
  const atual = p.setor ? (ls.find(v => v.nome === p.setor && (!p.fazenda || v.fazenda === p.fazenda)) || ls.find(v => v.nome === p.setor)) : null;
  return '<option value="">—</option>'
    + (p.setor && !atual ? `<option value="__velho" selected>${esc(p.setor)} (não cadastrado)</option>` : '')
    + ls.map(v => `<option value="${esc(v.id)}"${atual && atual.id === v.id ? ' selected' : ''}>${esc(v.fazenda ? nomeCurto(v.fazenda) + ' · ' : '')}${esc(v.nome)}${Number(v.area) ? ' · ' + esc(num(v.area, 2)) + ' ha' : ''}</option>`).join('');
}
function opVariedades(cult, atual) {
  const ls = ativos('cp_variedades').filter(v => v.cultura_id === cult.id).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return '<option value="">—</option>'
    + (atual && !ls.some(v => v.nome === atual) ? `<option selected>${esc(atual)}</option>` : '')
    + ls.map(v => `<option${v.nome === atual ? ' selected' : ''}>${esc(v.nome)}</option>`).join('');
}

function editarPlantio(id) {
  const cult = culturaSel(), saf = safraSel();
  const p = id ? todos('cp_plantios').find(x => x.id === id) : { ativo: true };
  if (!p) return;
  const cafe = rotArea(cult) === 'quadra';
  const abac = semDatasPlantio(cult);
  const safPl = p.safra_id || saf.id;
  const usado = id && ativos('cp_cargas').some(c => c.plantio_id === id);
  window.abrirModal((id ? 'Editar ' : 'Novo ') + rotArea(cult) + ' · ' + cult.nome, `
    <form class="grade" id="cpPlForm" autocomplete="off">
      <label class="campo">${esc(Maiusc(rotArea(cult)))} <input type="text" name="nome" required value="${esc(p.nome || '')}" placeholder="${cafe ? 'ex.: Q4' : 'ex.: Pl 29'}"></label>
      <label class="campo">Cód. Agro <input type="text" name="cod_agro" value="${esc(p.cod_agro || '')}"></label>
      <label class="campo plena">Nome completo (como no Agro) <input type="text" name="nome_completo" value="${esc(p.nome_completo || '')}" placeholder="ex.: Cen Pl 29 - Pivot 2 - Lote 35 2026"></label>
      <label class="campo">Fazenda <select name="fazenda">${opFaz(p.fazenda)}</select></label>
      <label class="campo">Pivô / talhão <select name="pivo">${opPivos(p)}</select></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" required value="${Number(p.area) ? esc(num(p.area, 2)) : ''}"></label>
      <label class="campo">Variedade <select name="variedade">${opVariedades(cult, p.variedade || '')}</select></label>
      ${abac ? `<label class="campo">Safra <select name="safra_id" required>${safrasDe(cult.id).map(s => `<option value="${esc(s.id)}"${s.id === safPl ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>`
        : `<label class="campo">Início do plantio <input type="date" name="inicio_plantio" value="${esc(p.inicio_plantio || '')}"></label>
      <label class="campo">Fim do plantio <input type="date" name="fim_plantio" value="${esc(p.fim_plantio || '')}"></label>`}
      ${cafe ? `<label class="campo">Bloco (quadras colhidas juntas) <input type="text" name="bloco" value="${esc(p.bloco || '')}" placeholder="ex.: Q4+Q5"></label>
        <label class="campo">Ano de plantio <input type="text" name="ano_plantio" inputmode="numeric" value="${esc(p.ano_plantio || '')}"></label>
        <label class="campo">Espaçamento <input type="text" name="espacamento" value="${esc(p.espacamento || '')}"></label>
        <label class="campo">Nº de plantas <input type="text" name="n_plantas" inputmode="numeric" value="${esc(p.n_plantas || '')}"></label>` : ''}
      <label class="campo">Situação <input type="text" name="situacao" value="${esc(p.situacao || '')}" placeholder="ex.: Gradeado"></label>
      <label class="campo plena">Observação <input type="text" name="obs" value="${esc(p.obs || '')}"></label>
      ${id ? `<label class="cb-check plena"><input type="checkbox" name="ativo"${p.ativo !== false ? ' checked' : ''}> ativo — desmarque para encerrar${usado ? ' (as cargas continuam guardadas)' : ''}</label>` : ''}
      <div class="barra fim plena"><button class="btn" type="button" id="cpPlCancelar">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#cpPlCancelar').onclick = () => window.fecharModal();
    const fm = corpo.querySelector('#cpPlForm');
    // escolher o pivô traz a fazenda (e a área, se ainda estiver em branco)
    fm.querySelector('[name=pivo]').addEventListener('change', e => {
      const v = ativos('cp_pivos').find(x => x.id === e.target.value);
      if (!v) return;
      if (v.fazenda) fm.querySelector('[name=fazenda]').value = v.fazenda;
      const ar = fm.querySelector('[name=area]');
      if (!ar.value && Number(v.area)) ar.value = num(v.area, 2);
    });
    fm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const area = lerNumero(fd.get('area'));
      if (area === null || Number.isNaN(area)) { aviso('Área: use só números (ex.: 7,12).', true); return; }
      const r = { ...p, nome: txt(fd, 'nome'), cod_agro: txt(fd, 'cod_agro'), nome_completo: txt(fd, 'nome_completo'), fazenda: txt(fd, 'fazenda'),
        area, variedade: txt(fd, 'variedade'), situacao: txt(fd, 'situacao'), obs: txt(fd, 'obs') };
      const pv = String(fd.get('pivo') || '');
      if (pv !== '__velho') { const v = ativos('cp_pivos').find(x => x.id === pv); r.setor = v ? v.nome : null; if (v && !r.fazenda) r.fazenda = v.fazenda || null; }
      if (!abac) Object.assign(r, { inicio_plantio: dataISO(fd.get('inicio_plantio')), fim_plantio: dataISO(fd.get('fim_plantio')) });
      if (cafe) Object.assign(r, { bloco: txt(fd, 'bloco'), espacamento: txt(fd, 'espacamento'),
        ano_plantio: lerNumero(fd.get('ano_plantio')) || null, n_plantas: lerNumero(fd.get('n_plantas')) || null });
      if (id) r.ativo = fd.get('ativo') === 'on';
      else Object.assign(r, { cultura_id: cult.id, safra_id: saf.id, ativo: true });
      if (abac && fd.get('safra_id')) r.safra_id = String(fd.get('safra_id'));
      if (r.situacao === 'Completar área' && area > 0) r.situacao = null;
      await gravar('cp_plantios', r);
      window.fecharModal();
      aviso(r.safra_id !== saf.id ? 'Salvo na safra ' + ((safrasDe(cult.id).find(x => x.id === r.safra_id) || {}).nome || '') + '.' : 'Salvo.');
      desenharPlantios();
    });
  });
}

function copiarDeSafra(cult, saf) {
  const outras = safrasDe(cult.id).filter(s => s.id !== saf.id);
  window.abrirModal('Copiar ' + rotAreaPl(cult) + ' de outra safra', `
    <form class="grade" id="cpCopForm"><label class="campo plena">Safra de origem <select name="s">${outras.map(s => `<option value="${esc(s.id)}">${esc(s.nome)} (${plantiosDa(s.id).length})</option>`).join('')}</select></label>
    <p class="dc-sem plena" style="margin:0">Copia nome, fazenda, área, variedade e dados fixos. O que já existe com o mesmo nome e fazenda em ${esc(saf.nome)} não é copiado de novo.</p>
    <div class="barra fim plena"><button class="btn" type="button" id="cpCopNao">Cancelar</button><button class="btn principal" type="submit">Copiar</button></div></form>`, corpo => {
    corpo.querySelector('#cpCopNao').onclick = () => window.fecharModal();
    corpo.querySelector('#cpCopForm').addEventListener('submit', async e => {
      e.preventDefault();
      const orig = plantiosDa(new FormData(e.target).get('s')).filter(p => p.ativo !== false);
      const ja = new Set(plantiosDa(saf.id).map(p => semAcento(p.nome + '|' + p.fazenda)));
      let n = 0;
      for (const p of orig) {
        if (ja.has(semAcento(p.nome + '|' + p.fazenda))) continue;
        const { id, _base, atualizado_em, inicio_plantio, fim_plantio, ...resto } = p;
        await gravar('cp_plantios', { ...resto, safra_id: saf.id, ativo: true }); n++;
      }
      window.fecharModal(); aviso(n + ' copiados.'); desenharPlantios();
    });
  });
}
export function abrirPlantios() { desenharPlantios(); }

/* ================================================================ safras */
function desenharSafras() {
  const alvo = $('cpSafrasCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const cult = culturaSel();
  if (!cult) { alvo.innerHTML = '<div class="vazio">Sem culturas.</div>'; return; }
  const ls = safrasDe(cult.id);
  alvo.innerHTML = `
    <form class="grade cad-novo" id="cpSfNova" autocomplete="off">
      <label class="campo">Nova safra de ${esc(cult.nome)} <input type="text" name="nome" required placeholder="ex.: Inverno 2027, 2026/2027"></label>
      <label class="campo">Início <input type="date" name="inicio"></label>
      <label class="campo">Fim <input type="date" name="fim"></label>
      <label class="cb-check" style="align-self:end"><input type="checkbox" name="atual" checked> safra atual</label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Cadastrar</button></div>
    </form>
    <table class="dc-planilha cb-tab"><thead><tr><th>Safra</th><th>Início</th><th>Fim</th><th class="ce">${esc(Maiusc(rotAreaPl(cult)))}</th><th class="ce">Cargas</th><th>Atual</th><th></th></tr></thead>
    <tbody>${ls.map(s => `<tr><td><b>${esc(s.nome)}</b></td><td>${dataBR(s.inicio)}</td><td>${dataBR(s.fim)}</td>
      <td class="ce">${plantiosDa(s.id).length}</td><td class="ce">${ativos('cp_cargas').filter(c => c.safra_id === s.id).length}</td>
      <td>${s.atual ? '<span class="cb-pin ok">atual</span>' : `<button class="btn mini" type="button" data-atual="${esc(s.id)}">Tornar atual</button>`}</td>
      <td class="dir"><button class="btn mini" type="button" data-editar="${esc(s.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma safra.</td></tr>'}</tbody></table>`;
  $('cpSfNova').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nome = txt(fd, 'nome');
    if (ls.some(s => semAcento(s.nome) === semAcento(nome))) { aviso('Já existe a safra ' + nome + '.', true); return; }
    const atual = fd.get('atual') === 'on';
    if (atual) for (const s of ls.filter(x => x.atual)) await gravar('cp_safras', { ...s, atual: false });
    await gravar('cp_safras', { cultura_id: cult.id, nome, inicio: dataISO(fd.get('inicio')), fim: dataISO(fd.get('fim')), atual, ativo: true });
    aviso('Safra cadastrada.'); desenharSafras();
  });
  alvo.querySelectorAll('[data-atual]').forEach(b => b.addEventListener('click', async () => {
    for (const s of ls) if (s.atual !== (s.id === b.dataset.atual)) await gravar('cp_safras', { ...s, atual: s.id === b.dataset.atual });
    aviso('Safra atual trocada.'); desenharSafras();
  }));
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const s = ls.find(x => x.id === b.dataset.editar);
    window.abrirModal('Editar safra', `<form class="grade" id="cpSfEd">
      <label class="campo plena">Nome <input type="text" name="nome" required value="${esc(s.nome)}"></label>
      <label class="campo">Início <input type="date" name="inicio" value="${esc(s.inicio || '')}"></label>
      <label class="campo">Fim <input type="date" name="fim" value="${esc(s.fim || '')}"></label>
      <label class="campo plena">Observação <input type="text" name="obs" value="${esc(s.obs || '')}"></label>
      <div class="barra fim plena"><button class="btn" type="button" id="cpSfNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div></form>`, corpo => {
      corpo.querySelector('#cpSfNao').onclick = () => window.fecharModal();
      corpo.querySelector('#cpSfEd').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        await gravar('cp_safras', { ...s, nome: txt(fd, 'nome'), inicio: dataISO(fd.get('inicio')), fim: dataISO(fd.get('fim')), obs: txt(fd, 'obs') });
        window.fecharModal(); aviso('Safra salva.'); desenharSafras();
      });
    });
  }));
}
export function abrirSafras() { desenharSafras(); }

/* ================================================================ placas e motoristas */
/* Validação da placa (28/10/2026, pedido dele): aceita só os dois padrões
   brasileiros — antigo (ABC1234, também digitado ABC-1234) e Mercosul
   (ABC1D23). Grava sempre sem hífen e sem espaço, em maiúsculas. */
const limpaPlaca = v => String(v || '').toUpperCase().replace(/[\s\-.]/g, '');
function padraoPlaca(v) {
  const p = limpaPlaca(v);
  if (/^[A-Z]{3}[0-9]{4}$/.test(p)) return 'antigo';
  if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p)) return 'mercosul';
  return '';
}
const ROT_PADRAO = { antigo: 'Padrão antigo', mercosul: 'Mercosul' };
const seloPlaca = v => { const t = padraoPlaca(v);
  return t ? `<span class="tag" style="background:${t === 'mercosul' ? '#E3EEFA;color:#1557B8' : '#EEF0E8;color:#51534A'}">${ROT_PADRAO[t]}</span>`
    : '<span class="tag" style="background:#FDEBD8;color:#9A4A00" title="Não segue o padrão antigo (ABC1234) nem o Mercosul (ABC1D23). Clique em Editar para corrigir.">Placa inválida</span>'; };
/* Mostra embaixo do campo, enquanto digita, qual padrão a placa segue. */
function ligarValidaPlaca(inp, dica) {
  const atualiza = () => {
    const v = limpaPlaca(inp.value), t = padraoPlaca(v);
    if (!v) { dica.textContent = 'Padrão antigo ABC1234 ou Mercosul ABC1D23'; dica.style.color = ''; inp.setCustomValidity(''); return; }
    if (t) { dica.textContent = '✓ ' + ROT_PADRAO[t]; dica.style.color = '#4E7D00'; inp.setCustomValidity(''); }
    else { dica.textContent = 'Placa inválida — use ABC1234 (antigo) ou ABC1D23 (Mercosul)'; dica.style.color = '#B54708';
      inp.setCustomValidity('Placa fora do padrão: use ABC1234 (antigo) ou ABC1D23 (Mercosul).'); }
  };
  inp.addEventListener('input', atualiza); atualiza();
}
const DICA_PLACA = '<small class="cp-placa-dica" style="font-size:12px;font-weight:400;color:var(--suave)"></small>';
let buscaV = '';
function desenharVeiculos() {
  const alvo = $('cpVeicCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const ls = ativos('cp_veiculos').filter(v => !buscaV || semAcento(v.placa + ' ' + v.motorista).includes(semAcento(buscaV)))
    .sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
  alvo.innerHTML = `
    <form class="grade cad-novo" id="cpVNovo" autocomplete="off">
      <label class="campo">Placa <input type="text" name="placa" required maxlength="8" placeholder="ABC1D23" style="text-transform:uppercase">${DICA_PLACA}</label>
      <label class="campo plena-2">Motorista <input type="text" name="motorista"></label>
      <label class="campo">Frete <select name="frete_tipo"><option></option><option>Próprio</option><option>Terceiro</option></select></label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Cadastrar</button></div>
    </form>
    <div class="barra"><label class="campo" style="flex:1">Procurar<input type="text" id="cpVBusca" value="${esc(buscaV)}"></label><span class="dc-sem">${ls.length} placas</span></div>
    <table class="dc-planilha cb-tab"><thead><tr><th>Placa</th><th>Motorista</th><th>Frete</th><th class="ce">Cargas</th><th></th></tr></thead>
    <tbody>${ls.map(v => `<tr><td><b>${esc(v.placa)}</b>${seloPlaca(v.placa)}</td><td>${esc(v.motorista || '')}</td><td>${esc(v.frete_tipo || '')}</td>
      <td class="ce">${ativos('cp_cargas').filter(c => semAcento(c.placa) === semAcento(v.placa)).length}</td>
      <td class="dir"><button class="btn mini" type="button" data-editar="${esc(v.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma placa.</td></tr>'}</tbody></table>`;
  $('cpVNovo').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const placa = limpaPlaca(fd.get('placa'));
    if (!padraoPlaca(placa)) { aviso('Placa inválida: use o padrão antigo (ABC1234) ou Mercosul (ABC1D23).', true); return; }
    if (ativos('cp_veiculos').some(v => semAcento(v.placa) === semAcento(placa))) { aviso('Placa já cadastrada.', true); return; }
    await gravar('cp_veiculos', { placa, motorista: txt(fd, 'motorista'), frete_tipo: txt(fd, 'frete_tipo'), ativo: true });
    aviso('Placa cadastrada.'); desenharVeiculos();
  });
  ligarValidaPlaca($('cpVNovo').querySelector('[name=placa]'), $('cpVNovo').querySelector('.cp-placa-dica'));
  $('cpVBusca').addEventListener('input', e => { buscaV = e.target.value; const pos = e.target.selectionStart; desenharVeiculos(); const el = $('cpVBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const v = todos('cp_veiculos').find(x => x.id === b.dataset.editar);
    window.abrirModal('Editar placa', `<form class="grade" id="cpVEd">
      <label class="campo">Placa <input type="text" name="placa" required maxlength="8" value="${esc(v.placa)}" style="text-transform:uppercase">${DICA_PLACA}</label>
      <label class="campo plena-2">Motorista <input type="text" name="motorista" value="${esc(v.motorista || '')}"></label>
      <label class="campo">Frete <select name="frete_tipo">${['', 'Próprio', 'Terceiro'].map(t => `<option${t === (v.frete_tipo || '') ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="cb-check plena"><input type="checkbox" name="ativo" checked> ativa</label>
      <div class="barra fim plena"><button class="btn" type="button" id="cpVNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div></form>`, corpo => {
      ligarValidaPlaca(corpo.querySelector('[name=placa]'), corpo.querySelector('.cp-placa-dica'));
      corpo.querySelector('#cpVNao').onclick = () => window.fecharModal();
      corpo.querySelector('#cpVEd').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        const placa = limpaPlaca(fd.get('placa'));
        if (!padraoPlaca(placa)) { aviso('Placa inválida: use o padrão antigo (ABC1234) ou Mercosul (ABC1D23).', true); return; }
        if (ativos('cp_veiculos').some(x => x.id !== v.id && semAcento(x.placa) === semAcento(placa))) { aviso('Já existe outra placa igual cadastrada.', true); return; }
        await gravar('cp_veiculos', { ...v, placa, motorista: txt(fd, 'motorista'), frete_tipo: txt(fd, 'frete_tipo'), ativo: fd.get('ativo') === 'on' });
        window.fecharModal(); aviso('Salvo.'); desenharVeiculos();
      });
    });
  }));
}
export function abrirVeiculos() { desenharVeiculos(); }

/* ================================================================ pivôs / talhões (28/10/2026) */
let buscaPv = '';
function desenharPivos() {
  const alvo = $('cpPivosCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const ls = ativos('cp_pivos').filter(v => !buscaPv || semAcento(v.nome + ' ' + (v.fazenda || '')).includes(semAcento(buscaPv))).sort(ordPivo);
  const usos = v => ativos('cp_plantios').filter(p => p.setor === v.nome && (!v.fazenda || !p.fazenda || p.fazenda === v.fazenda)).length;
  alvo.innerHTML = `
    <form class="grade cad-novo" id="cpPvNovo" autocomplete="off">
      <label class="campo plena-2">Nome <input type="text" name="nome" required placeholder="ex.: Pivot 2, Talhão 5A"></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal"></label>
      <label class="campo">Fazenda <select name="fazenda" required>${opFaz('')}</select></label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Cadastrar</button></div>
    </form>
    <div class="barra"><label class="campo" style="flex:1">Procurar<input type="text" id="cpPvBusca" value="${esc(buscaPv)}"></label><span class="dc-sem">${ls.length} pivôs / talhões · ${num(ls.reduce((t, v) => t + Number(v.area || 0), 0), 2)} ha</span></div>
    <table class="dc-planilha cb-tab"><thead><tr><th>Fazenda</th><th>Pivô / talhão</th><th class="dir">Área (ha)</th><th class="ce">Plantios</th><th></th></tr></thead>
    <tbody>${ls.map(v => `<tr><td>${esc(nomeCurto(v.fazenda) || '')}</td><td><b>${esc(v.nome)}</b></td>
      <td class="dir">${Number(v.area) ? num(v.area, 2) : '<span class="dc-sem">—</span>'}</td><td class="ce">${usos(v)}</td>
      <td class="dir"><button class="btn mini" type="button" data-editar="${esc(v.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum pivô ou talhão.</td></tr>'}</tbody></table>`;
  const ler = fd => { const a = lerNumero(fd.get('area')); return Number.isNaN(a) ? NaN : a; };
  $('cpPvNovo').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const nome = txt(fd, 'nome'), fazenda = txt(fd, 'fazenda'), area = ler(fd);
    if (Number.isNaN(area)) { aviso('Área: use só números (ex.: 7,12).', true); return; }
    if (ativos('cp_pivos').some(v => semAcento(v.nome) === semAcento(nome) && v.fazenda === fazenda)) { aviso('Já existe ' + nome + ' nessa fazenda.', true); return; }
    await gravar('cp_pivos', { nome, fazenda, area, ativo: true });
    aviso('Cadastrado.'); desenharPivos();
  });
  $('cpPvBusca').addEventListener('input', e => { buscaPv = e.target.value; const pos = e.target.selectionStart; desenharPivos(); const el = $('cpPvBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const v = todos('cp_pivos').find(x => x.id === b.dataset.editar);
    window.abrirModal('Editar pivô / talhão', `<form class="grade" id="cpPvEd">
      <label class="campo plena-2">Nome <input type="text" name="nome" required value="${esc(v.nome)}"></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" value="${Number(v.area) ? esc(num(v.area, 2)) : ''}"></label>
      <label class="campo">Fazenda <select name="fazenda" required>${opFaz(v.fazenda)}</select></label>
      <label class="cb-check plena"><input type="checkbox" name="ativo" checked> ativo — desmarque para tirar da lista do plantio</label>
      <p class="dc-sem plena" style="margin:0">Trocar o nome aqui não muda os plantios já cadastrados.</p>
      <div class="barra fim plena"><button class="btn" type="button" id="cpPvNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div></form>`, corpo => {
      corpo.querySelector('#cpPvNao').onclick = () => window.fecharModal();
      corpo.querySelector('#cpPvEd').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target); const area = ler(fd);
        if (Number.isNaN(area)) { aviso('Área: use só números (ex.: 7,12).', true); return; }
        await gravar('cp_pivos', { ...v, nome: txt(fd, 'nome'), fazenda: txt(fd, 'fazenda'), area, ativo: fd.get('ativo') === 'on' });
        window.fecharModal(); aviso('Salvo.'); desenharPivos();
      });
    });
  }));
}
export function abrirPivos() { desenharPivos(); }

/* ================================================================ variedades (28/10/2026) */
function desenharVariedades() {
  const alvo = $('cpVariedadesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const cult = culturaSel();
  if (!cult) { alvo.innerHTML = '<div class="vazio">Sem culturas.</div>'; return; }
  const ls = ativos('cp_variedades').filter(v => v.cultura_id === cult.id).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const opCult = sel => culturas().map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  alvo.innerHTML = `
    <form class="grade cad-novo" id="cpVrNova" autocomplete="off">
      <label class="campo plena-2">Nome <input type="text" name="nome" required placeholder="ex.: Hass, Verano"></label>
      <label class="campo">Cultura <select name="cultura_id" required>${opCult(cult.id)}</select></label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Cadastrar</button></div>
    </form>
    <p class="dc-sem" style="margin:4px 0 8px">${ls.length} variedades de ${esc(cult.nome)} — troque a cultura na faixa do topo para ver as outras.</p>
    <table class="dc-planilha cb-tab"><thead><tr><th>Variedade</th><th>Cultura</th><th class="ce">Plantios</th><th></th></tr></thead>
    <tbody>${ls.map(v => `<tr><td><b>${esc(v.nome)}</b></td><td>${esc(cult.nome)}</td>
      <td class="ce">${ativos('cp_plantios').filter(p => p.cultura_id === v.cultura_id && p.variedade === v.nome).length}</td>
      <td class="dir"><button class="btn mini" type="button" data-editar="${esc(v.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhuma variedade desta cultura.</td></tr>'}</tbody></table>`;
  $('cpVrNova').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const nome = txt(fd, 'nome'), cultura_id = String(fd.get('cultura_id'));
    if (ativos('cp_variedades').some(v => v.cultura_id === cultura_id && semAcento(v.nome) === semAcento(nome))) { aviso('Variedade já cadastrada.', true); return; }
    await gravar('cp_variedades', { nome, cultura_id, ativo: true });
    aviso('Variedade cadastrada.'); desenharVariedades();
  });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const v = todos('cp_variedades').find(x => x.id === b.dataset.editar);
    window.abrirModal('Editar variedade', `<form class="grade" id="cpVrEd">
      <label class="campo plena-2">Nome <input type="text" name="nome" required value="${esc(v.nome)}"></label>
      <label class="campo">Cultura <select name="cultura_id" required>${opCult(v.cultura_id)}</select></label>
      <label class="cb-check plena"><input type="checkbox" name="ativo" checked> ativa — desmarque para tirar da lista do plantio</label>
      <p class="dc-sem plena" style="margin:0">Trocar o nome aqui não muda os plantios já cadastrados.</p>
      <div class="barra fim plena"><button class="btn" type="button" id="cpVrNao">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div></form>`, corpo => {
      corpo.querySelector('#cpVrNao').onclick = () => window.fecharModal();
      corpo.querySelector('#cpVrEd').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        await gravar('cp_variedades', { ...v, nome: txt(fd, 'nome'), cultura_id: String(fd.get('cultura_id')), ativo: fd.get('ativo') === 'on' });
        window.fecharModal(); aviso('Salvo.'); desenharVariedades();
      });
    });
  }));
}
export function abrirVariedades() { desenharVariedades(); }

/* ================================================================ histórico de safras */
function desenharHistCad() {
  const alvo = $('cpHistCadCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = abrindo; return; }
  const cult = culturaSel();
  if (!cult) { alvo.innerHTML = '<div class="vazio">Sem culturas.</div>'; return; }
  const u = cult.unidade_nome;
  const ls = ativos('cp_historico').filter(h => h.cultura_id === cult.id)
    .sort((a, b) => String(a.safra_nome).localeCompare(String(b.safra_nome), 'pt-BR', { numeric: true }) || String(a.fazenda || '').localeCompare(String(b.fazenda || '')));
  alvo.innerHTML = `
    <form class="grade cad-novo" id="cpHNovo" autocomplete="off">
      <label class="campo">Safra <input type="text" name="safra_nome" required placeholder="ex.: 2023/2024"></label>
      <label class="campo">Fazenda <select name="fazenda"><option value="">Total da safra</option>${FAZENDAS.map(f => `<option>${esc(f)}</option>`).join('')}</select></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" required></label>
      <label class="campo">Produção (kg) <input type="text" name="producao_kg" inputmode="decimal"></label>
      <label class="campo">${esc(u)} (total) <input type="text" name="unidades" inputmode="decimal"></label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Lançar</button></div>
    </form>
    <p class="dc-sem" style="margin-top:-4px">Se não souber o total de ${esc(u)}, informe só a produção em kg${cult.unidade_kg ? ` (o app divide por ${num(cult.unidade_kg, 0)})` : ''}.</p>
    <table class="dc-planilha cb-tab"><thead><tr><th>Safra</th><th>Fazenda</th><th class="dir">Área (ha)</th><th class="dir">Produção (kg)</th><th class="dir">${esc(u)}</th><th class="dir">${esc(u)}/ha</th><th>Obs.</th><th></th></tr></thead>
    <tbody>${ls.map(h => `<tr><td><b>${esc(h.safra_nome)}</b></td><td>${esc(h.fazenda ? nomeCurto(h.fazenda) : 'Total')}</td><td class="dir">${num(h.area, 2)}</td><td class="dir">${num(h.producao_kg, 0)}</td>
      <td class="dir">${num(h.unidades, 2)}</td><td class="dir"><b>${num(h.produtividade, 1)}</b></td><td>${esc(h.obs || '')}</td>
      <td class="dir"><button class="btn mini" type="button" data-tirar="${esc(h.id)}">Tirar</button></td></tr>`).join('') || '<tr><td colspan="8" class="vazio">Sem histórico.</td></tr>'}</tbody></table>`;
  $('cpHNovo').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const area = lerNumero(fd.get('area')), kg = lerNumero(fd.get('producao_kg'));
    let un = lerNumero(fd.get('unidades'));
    if ([area, kg, un].some(x => Number.isNaN(x)) || !area) { aviso('Confira área, produção e unidades (só números).', true); return; }
    if (un === null && kg && cult.unidade_kg) un = kg / Number(cult.unidade_kg);
    await gravar('cp_historico', { cultura_id: cult.id, safra_nome: txt(fd, 'safra_nome'), fazenda: txt(fd, 'fazenda'), area, producao_kg: kg,
      unidades: un, produtividade: un && area ? un / area : null, fonte: 'Lançado no app', ativo: true });
    aviso('Safra lançada no histórico.'); desenharHistCad();
  });
  alvo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Confirmar'; return; }
    const h = todos('cp_historico').find(x => x.id === b.dataset.tirar);
    await gravar('cp_historico', { ...h, ativo: false }); aviso('Tirado do histórico.'); desenharHistCad();
  }));
}
export function abrirHistCad() { desenharHistCad(); }
