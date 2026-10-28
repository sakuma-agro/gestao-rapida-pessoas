// cargas.js — Cargas: lançar e consultar (20/10/2026).
//
// Uma linha por carregamento, como a aba Controle/CARGAS das planilhas. O
// formulário se monta pelo perfil da cultura (cp_culturas.campos): cenoura
// pede tipo (lavada/suja) e classificação em kg; batata, as sacas por
// classe e a situação do pagamento; café, peso de entrada, lote e BX/BM/ESC;
// milho e trigo, ticket da balança, NF e % da carga (os pesos vêm da balança
// na Conciliação); abacate, turmeiro e caixas.
import { $, esc, pronto, carregando, todos, ativos, gravar, aviso, culturaSel, safraSel, safrasDe, campos, classes, unidadeRot, rotArea,
  Maiusc, plantiosDa, plantio, nomePlantio, cargasDa, unidadesDe, kgDe, conferir, seloSt, dataBR, num, lerNumero, semAcento, meuNome,
  porPeso, somaClasses } from './dados.js';

const ROT_VALOR = { valor_frete: 'Frete (R$)', valor_beneficiamento: 'Beneficiamento (R$)', valor_embalagem: 'Embalagem (R$)',
  valor_aluguel_cx: 'Aluguel de caixas (R$)', valor_arranquio: 'Arranquio (R$)', valor_mo: 'Mão de obra (R$)', valor_servico: 'Serviço (R$)' };
export { ROT_VALOR };

let busca = '', filtroPl = '', filtroSt = '', limite = 150;

function desenhar() {
  const alvo = $('cpCargasCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra (ou cadastre uma safra em Cadastros).</div>'; return; }
  if (window.cpFiltroCargas) { filtroSt = window.cpFiltroCargas; window.cpFiltroCargas = null; }
  const cp = campos(cult), u = cult.unidade_nome, cls = classes(cult);
  const pls = plantiosDa(saf.id);
  let lista = cargasDa(saf.id);
  const total = lista.length;
  if (filtroPl) lista = lista.filter(c => c.plantio_id === filtroPl);
  if (filtroSt === 'sem_plantio') lista = lista.filter(c => !c.plantio_id || !plantio(c.plantio_id));
  else if (filtroSt) lista = lista.filter(c => conferir(c, cult).st === filtroSt);
  if (busca) {
    const b = semAcento(busca);
    lista = lista.filter(c => semAcento([c.placa, c.ticket_faz, c.ticket_balanca, c.nf, c.motorista, c.turmeiro, c.obs, (plantio(c.plantio_id) || {}).nome].join(' ')).includes(b));
  }
  const soma = lista.reduce((s, c) => { s.un += unidadesDe(c, cult); s.kg += kgDe(c, cult); return s; }, { un: 0, kg: 0 });
  const temBal = cult.conciliacao === 'balanca' || cult.conciliacao === 'balanca_coop';
  const sts = cult.conciliacao === 'coop' ? [['pago', 'Pagas'], ['pendente', 'Pagto pendente']]
    : temBal ? [['ok', 'Conferidas'], ['div', 'Divergentes'], ['sem_bal', 'Sem balança'], ...(cult.conciliacao === 'balanca_coop' ? [['sem_coop', 'Aguard. cooperativa']] : [])] : [];
  const mostra = lista.slice(0, limite);

  alvo.innerHTML = `
    <div class="barra" style="margin-top:0">
      <button class="btn principal" type="button" id="cpCgNova">+ Nova carga</button>
      ${total ? '<button class="btn" type="button" id="cpCgRepetir" title="Abre uma nova carga com data, placa e plantio da última">Repetir a última</button>' : ''}
      <span class="dc-sem">${total} ${total === 1 ? 'carga' : 'cargas'} na safra · ${esc(unidadeRot(cult))}</span>
    </div>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:180px">Procurar<input type="text" id="cpCgBusca" placeholder="placa, ticket, NF, motorista…" value="${esc(busca)}"></label>
      <label class="campo">${esc(Maiusc(rotArea(cult)))}<select id="cpCgPl"><option value="">Todos</option>${pls.map(p => `<option value="${esc(p.id)}"${p.id === filtroPl ? ' selected' : ''}>${esc(nomePlantio(p))}</option>`).join('')}</select></label>
      <label class="campo">Situação<select id="cpCgSt"><option value="">Todas</option><option value="sem_plantio"${filtroSt === 'sem_plantio' ? ' selected' : ''}>Sem ${esc(rotArea(cult))}</option>${sts.map(([v, r]) => `<option value="${v}"${v === filtroSt ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab cp-tab">
      <thead><tr><th>Data</th><th>Placa</th><th>Ticket faz.</th>${temBal ? '<th>Ticket bal.</th>' : ''}${cp.ticket_coop ? '<th>Ticket coop.</th>' : ''}<th>${esc(Maiusc(rotArea(cult)))}</th>
        ${cp.tipo ? '<th>Tipo</th>' : ''}${cp.turmeiro ? '<th>Turmeiro</th>' : ''}${cp.peso_entrada || cp.umidade ? '<th class="dir">Peso entr. (kg)</th>' : ''}<th class="dir">Peso líq. (kg)</th>
        ${cls.map(k => `<th class="dir">${esc(k.nome)}</th>`).join('')}<th class="dir">${esc(u)}</th>${cp.umidade ? '<th class="dir">% Umid.</th>' : ''}
        <th>Situação</th><th></th></tr></thead>
      <tbody>${mostra.map(c => { const cf = conferir(c, cult); const p = plantio(c.plantio_id);
        return `<tr>
          <td>${dataBR(c.data)}</td><td>${esc(c.placa || '')}</td><td>${esc(c.ticket_faz || '')}</td>${temBal ? `<td>${esc(c.ticket_balanca || (cf.bal ? cf.bal.ticket : ''))}</td>` : ''}${cp.ticket_coop ? `<td>${esc(c.ticket_coop || '')}</td>` : ''}
          <td>${p ? esc(nomePlantio(p)) : `<span class="cb-pin alerta">sem ${esc(rotArea(cult))}</span>`}${Number(c.pct_carga) && Number(c.pct_carga) !== 100 ? ` <small class="dc-sem">${num(c.pct_carga, 0)}%</small>` : ''}</td>
          ${cp.tipo ? `<td>${esc(c.tipo || '')}</td>` : ''}${cp.turmeiro ? `<td>${esc(c.turmeiro || '')}</td>` : ''}
          ${cp.peso_entrada || cp.umidade ? `<td class="dir">${num(c.peso_entrada, 0)}</td>` : ''}<td class="dir">${num(c.peso_liquido, 0)}</td>
          ${cls.map(k => `<td class="dir">${num((c.classes || {})[k.chave], 0)}</td>`).join('')}
          <td class="dir"><b>${num(unidadesDe(c, cult), porPeso(cult) ? 1 : 0)}</b></td>${cp.umidade ? `<td class="dir">${c.umidade_pct !== null && c.umidade_pct !== undefined ? num(c.umidade_pct, 1) : ''}</td>` : ''}
          <td title="${esc(cf.msgs.join(' · '))}">${seloSt(cf.st)}${c.obs ? ` <span class="cp-obs" title="${esc(c.obs)}">obs</span>` : ''}</td>
          <td class="dir"><button class="btn mini" type="button" data-editar="${esc(c.id)}">Editar</button></td></tr>`; }).join('')
        || `<tr><td colspan="20" class="vazio">${total ? 'Nenhuma carga com esse filtro.' : 'Nenhuma carga lançada nesta safra ainda.'}</td></tr>`}</tbody>
      ${lista.length ? `<tfoot><tr class="dc-total"><td colspan="${3 + (temBal ? 1 : 0) + (cp.ticket_coop ? 1 : 0) + 1 + (cp.tipo ? 1 : 0) + (cp.turmeiro ? 1 : 0) + (cp.peso_entrada || cp.umidade ? 1 : 0)}">${lista.length} ${lista.length === 1 ? 'carga' : 'cargas'}</td>
        <td class="dir">${num(soma.kg, 0)}</td>${cls.map(k => `<td class="dir">${num(lista.reduce((s, c) => s + Number((c.classes || {})[k.chave] || 0), 0), 0)}</td>`).join('')}
        <td class="dir">${num(soma.un, 0)}</td>${cp.umidade ? '<td></td>' : ''}<td></td><td></td></tr></tfoot>` : ''}
    </table></div>
    ${lista.length > limite ? `<div class="barra"><button class="btn" type="button" id="cpCgMais">Mostrar mais (${lista.length - limite})</button></div>` : ''}`;

  $('cpCgNova').addEventListener('click', () => editar(null));
  $('cpCgRepetir')?.addEventListener('click', () => {
    const ult = cargasDa(saf.id)[0];
    editar(null, ult ? { data: ult.data, placa: ult.placa, motorista: ult.motorista, turmeiro: ult.turmeiro, plantio_id: ult.plantio_id, tipo: ult.tipo, frete_tipo: ult.frete_tipo, safra_id: ult.safra_id } : null);
  });
  $('cpCgBusca').addEventListener('input', e => { busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const el = $('cpCgBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  $('cpCgPl').addEventListener('change', e => { filtroPl = e.target.value; desenhar(); });
  $('cpCgSt').addEventListener('change', e => { filtroSt = e.target.value; desenhar(); });
  $('cpCgMais')?.addEventListener('click', () => { limite += 300; desenhar(); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
}

const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const campoNum = (nome, rot, v, extra = '') => `<label class="campo">${esc(rot)}<input type="text" inputmode="decimal" name="${nome}" value="${v === null || v === undefined ? '' : esc(num(v, Number.isInteger(Number(v)) ? 0 : 2))}" ${extra}></label>`;
const campoTxt = (nome, rot, v, extra = '') => `<label class="campo">${esc(rot)}<input type="text" name="${nome}" value="${esc(v || '')}" ${extra}></label>`;

/** Abre o formulário da carga (id = editar; null = nova, com `pre` preenchido). */
export function editar(id, pre = null) {
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) return;
  const cp = campos(cult), cls = classes(cult);
  const c = id ? todos('cp_cargas').find(x => x.id === id) : { data: hoje(), pct_carga: 100, classes: {}, ...(pre || {}) };
  if (!c) return;
  /* Abacate (28/10/2026, pedido dele): a carga escolhe a safra que está sendo
     colhida; "Salvar e lançar outra" repete a da última carga. */
  const escolheSafra = cult.slug === 'abacate';
  const safC = (escolheSafra && safrasDe(cult.id).find(s => s.id === (c.safra_id || '')))  || saf;
  const plsDe = sid => plantiosDa(sid).filter(p => p.ativo !== false || p.id === c.plantio_id);
  const pls = plsDe(safC.id);
  const veics = ativos('cp_veiculos');
  const fin = cp.financeiro || [];
  const cf = id ? conferir(c, cult) : null;
  const opPlDe = l => `<option value="">— escolha —</option>` + l.map(p => `<option value="${esc(p.id)}"${p.id === c.plantio_id ? ' selected' : ''}>${esc(nomePlantio(p))}${p.variedade ? ' · ' + esc(p.variedade) : ''}</option>`).join('');
  const opPl = opPlDe(pls);
  window.abrirModal(id ? 'Editar carga' : 'Nova carga · ' + cult.nome, `
    <form class="grade" id="cpCgForm" autocomplete="off">
      <fieldset class="plena cp-fs cp-etapa1"><legend>1º lançamento da carga</legend>
        <div class="cp-etapa1-grade">
          <label class="campo">Data <input type="date" name="data" required value="${esc(String(c.data || '').slice(0, 10))}"></label>
          ${escolheSafra ? `<label class="campo">Safra <select name="safra_id" required>${safrasDe(cult.id).map(s => `<option value="${esc(s.id)}"${s.id === safC.id ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>` : ''}
          <label class="campo cp-cg-talhao">${esc(Maiusc(rotArea(cult)))} <select name="plantio_id">${opPl}</select></label>
          ${escolheSafra ? '<span class="cp-quebra"></span>' : ''}
          ${campoTxt('ticket_faz', 'Ticket fazenda', c.ticket_faz, 'inputmode="numeric"')}
          ${escolheSafra ? '' : '<span class="cp-quebra"></span>'}
          ${campoNum('quantidade', 'Qtde ' + String(cp.quantidade || 'caixas').toLowerCase() + (porPeso(cult) ? ' (contadas)' : ''), c.quantidade)}
          ${escolheSafra ? '' : '<span class="cp-quebra"></span>'}
          ${campoTxt('ticket_balanca', 'Ticket balança', c.ticket_balanca, 'inputmode="numeric"')}
          ${campoTxt('turmeiro', 'Turmeiro', c.turmeiro)}
          <span class="cp-quebra"></span>
          <label class="campo">Placa <input type="text" name="placa" list="cpVeicLista" value="${esc(c.placa || '')}" style="text-transform:uppercase"></label>
          ${campoTxt('motorista', 'Motorista', c.motorista)}
        </div>
        <datalist id="cpVeicLista">${veics.map(v => `<option value="${esc(v.placa)}">${esc(v.motorista || '')}</option>`).join('')}</datalist>
      </fieldset>
      <details class="plena cp-etapas"${id ? ' open' : ''}><summary>Próximas etapas — nota, boletim, pesos${fin.length ? ', custos' : ''} e observação</summary><div class="grade" style="margin-top:10px">
      ${cp.nf ? campoTxt('nf', 'Nota fiscal', c.nf, 'inputmode="numeric"') : ''}
      ${cp.boletim ? campoTxt('boletim', 'Nº boletim / NF lavador', c.boletim) : ''}
      ${cp.lote ? campoTxt('lote', 'Lote', c.lote) : ''}
      ${cp.lote_controle ? campoTxt('lote_controle', 'Lote controle', c.lote_controle) : ''}
      ${Array.isArray(cp.tipo) ? `<label class="campo">Tipo <select name="tipo"><option value=""></option>${cp.tipo.map(t => `<option${t === c.tipo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
        : (cp.tipo || cult.slug === 'batata' || cult.slug === 'abacate') ? campoTxt('tipo', cult.slug === 'batata' ? 'Lavador' : 'Tipo', c.tipo) : ''}
      ${cp.bags ? campoNum('bags', 'Bags', c.bags) : ''}
      ${cp.pct_carga ? campoNum('pct_carga', '% da carga', c.pct_carga ?? 100) : ''}
      ${cp.peso_entrada ? campoNum('peso_entrada', cp.peso_entrada, c.peso_entrada) : ''}
      ${cp.peso_liquido ? campoNum('peso_liquido', cp.peso_liquido, c.peso_liquido) : ''}
      ${cp.frete_tipo ? `<label class="campo">Frete <select name="frete_tipo"><option value=""></option>${['Próprio', 'Terceiro', 'Sem frete'].map(t => `<option${t === c.frete_tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
      ${cls.length ? `<fieldset class="plena cp-fs"><legend>Classificação ${cls[0].modo === 'kg' ? '(peso em kg' + (cp.tipo ? ', do boletim do lavador' : '') + ')' : '(' + esc(cult.unidade_nome) + ')'}</legend>
        <div class="grade cp-grade-cl">${cls.map(k => campoNum('cl_' + k.chave, k.nome, (c.classes || {})[k.chave])).join('')}</div></fieldset>` : ''}
      ${cp.umidade ? `<fieldset class="plena cp-fs"><legend>Pesos da balança/cooperativa ${cf && cf.bal ? '— já conferidos' : '(a Conciliação preenche)'}</legend><div class="grade">
        ${campoNum('peso_entrada', 'Peso bruto (kg)', c.peso_entrada)}${campoNum('peso_liquido', 'Peso líquido (kg)', c.peso_liquido)}
        ${campoNum('umidade_pct', '% umidade', c.umidade_pct)}${campoNum('impureza_pct', '% impureza', c.impureza_pct)}</div></fieldset>` : ''}
      ${cp.situacao_pagto ? `<label class="campo">Situação <select name="situacao_pagto">${['Pendente', 'Pago'].map(t => `<option${t === (c.situacao_pagto || 'Pendente') ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
      ${cp.ticket_coop ? campoTxt('ticket_coop', 'Ticket cooperativa', c.ticket_coop, 'inputmode="numeric"') : ''}
      ${cp.data_pagto ? `<label class="campo">Data do pagamento <input type="date" name="data_pagto" value="${esc(String(c.data_pagto || '').slice(0, 10))}"></label>` : ''}
      ${fin.length ? `<fieldset class="plena cp-fs"><legend>Custos desta carga</legend><div class="grade">${fin.map(f => campoNum(f, ROT_VALOR[f] || f, c[f])).join('')}</div></fieldset>` : ''}
      <label class="campo plena">Observação <input type="text" name="obs" value="${esc(c.obs || '')}"></label>
      </div></details>
      <label class="cb-check plena"><input type="checkbox" name="conferido"${c.conferido ? ' checked' : ''}> conferida no campo</label>
      ${cf && cf.msgs.length ? `<p class="plena aviso alerta" style="margin:0">${esc(cf.msgs.join(' · '))}</p>` : ''}
      <div class="barra entre plena">
        ${id ? '<button class="btn perigo" type="button" id="cpCgExcluir">Excluir</button>' : '<span></span>'}
        <span class="barra" style="margin:0"><button class="btn" type="button" id="cpCgCancelar">Cancelar</button>
        ${id ? '' : '<button class="btn" type="submit" data-outra="1">Salvar e lançar outra</button>'}
        <button class="btn principal" type="submit">Salvar</button></span>
      </div>
    </form>`, corpo => {
    const f = corpo.querySelector('#cpCgForm');
    corpo.querySelector('#cpCgCancelar').onclick = () => window.fecharModal();
    // trocar a safra troca a lista de talhões
    f.querySelector('[name=safra_id]')?.addEventListener('change', e => {
      const sel = f.querySelector('[name=plantio_id]'), antes = sel.value;
      const l = plsDe(e.target.value);
      sel.innerHTML = opPlDe(l);
      if (l.some(p => p.id === antes)) sel.value = antes;
    });
    const placa = f.querySelector('[name=placa]');
    placa.addEventListener('change', () => {
      const v = veics.find(x => semAcento(x.placa) === semAcento(placa.value));
      const mot = f.querySelector('[name=motorista]');
      if (v && mot && !mot.value) mot.value = v.motorista || '';
    });
    corpo.querySelector('#cpCgExcluir')?.addEventListener('click', async () => {
      if (!confirmar(corpo, 'Excluir esta carga? Ela sai das contas da safra.')) return;
      await gravar('cp_cargas', { ...c, ativo: false });
      window.fecharModal(); aviso('Carga excluída.'); desenhar();
    });
    let outra = false;
    f.querySelectorAll('[type=submit]').forEach(b => b.addEventListener('click', () => { outra = !!b.dataset.outra; }));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(f);
      const r = { ...c };
      for (const k of ['data', 'plantio_id', 'placa', 'motorista', 'turmeiro', 'ticket_faz', 'ticket_balanca', 'nf', 'boletim', 'lote', 'lote_controle', 'tipo', 'frete_tipo', 'situacao_pagto', 'ticket_coop', 'data_pagto', 'obs']) {
        if (fd.has(k)) { const v = String(fd.get(k) || '').trim(); r[k] = v ? (k === 'placa' ? v.toUpperCase().replace(/\s/g, '') : v) : null; }
      }
      for (const k of ['bags', 'quantidade', 'pct_carga', 'peso_entrada', 'peso_liquido', 'umidade_pct', 'impureza_pct', ...fin]) {
        if (!fd.has(k)) continue;
        const v = lerNumero(fd.getAll(k).filter(x => String(x).trim() !== '').pop());
        if (Number.isNaN(v)) { aviso('Confira o número em "' + k.replace(/_/g, ' ') + '".', true); return; }
        r[k] = v;
      }
      if (r.pct_carga === null || r.pct_carga === undefined) r.pct_carga = 100;
      if (r.pct_carga <= 0 || r.pct_carga > 100) { aviso('% da carga: de 1 a 100.', true); return; }
      const cl = {};
      for (const k of cls) { const v = lerNumero(fd.get('cl_' + k.chave)); if (Number.isNaN(v)) { aviso('Confira o número em ' + k.nome + '.', true); return; } if (v !== null) cl[k.chave] = v; }
      r.classes = cl;
      if (somaClasses(cult)) r.quantidade = Object.values(cl).reduce((s, v) => s + v, 0) || r.quantidade || null;
      r.conferido = fd.get('conferido') === 'on';
      const safId = escolheSafra && fd.get('safra_id') ? String(fd.get('safra_id')) : (id ? c.safra_id : saf.id);
      if (!r.data) { aviso('Informe a data.', true); return; }
      if (!id) {
        if (r.ticket_faz && cargasDa(safId).some(x => String(x.ticket_faz || '') === r.ticket_faz && Number(x.pct_carga || 100) === 100 && Number(r.pct_carga) === 100)) {
          if (!confirmar(corpo, 'Já existe carga com o ticket ' + r.ticket_faz + ' nesta safra. Lançar mesmo assim?')) return;
        }
        Object.assign(r, { cultura_id: cult.id, ativo: true, criado_por: meuNome() || null });
      }
      r.safra_id = safId;
      if (!r.plantio_id) aviso('Carga salva sem ' + rotArea(cult) + ': ela não entra na produtividade até você escolher.', true);
      await gravar('cp_cargas', r);
      // placa nova vira cadastro (motorista junto)
      if (r.placa && !veics.some(v => semAcento(v.placa) === semAcento(r.placa))) {
        await gravar('cp_veiculos', { placa: r.placa, motorista: r.motorista || null, ativo: true });
      }
      if (outra) {
        window.fecharModal(); aviso('Carga salva.');
        editar(null, { data: r.data, placa: r.placa, motorista: r.motorista, turmeiro: r.turmeiro, plantio_id: r.plantio_id, tipo: r.tipo, frete_tipo: r.frete_tipo, safra_id: r.safra_id });
      } else { window.fecharModal(); aviso('Carga salva.'); }
      desenhar();
    });
  });
}

/* Confirmação dentro do modal (sem window.confirm, que trava a moldura em alguns aparelhos). */
function confirmar(corpo, texto) {
  const k = 'data-confirmou';
  const alvo = corpo.querySelector('#cpCgForm');
  if (alvo.getAttribute(k) === texto) { alvo.removeAttribute(k); return true; }
  alvo.setAttribute(k, texto);
  aviso(texto + ' Clique de novo para confirmar.', true);
  return false;
}

export function abrirCargas() { desenhar(); }
