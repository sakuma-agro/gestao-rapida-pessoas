// talhoes.js — Rateio mensal culturas › Plantios (20/10/2026).
// Cada plantio tem o Cód. Agro (código do plantio no sistema agro, que muda
// a cada safra), a cultura, a fazenda e a área padrão. Encerrar um plantio
// (ativo=false) tira-o dos próximos meses sem mexer no histórico.
import { $, esc, pronto, carregando, todos, talhoes, culturas, cultura, gravar, aviso, lerNumero, num, semAcento,
  FAZENDAS, nomeCurto, mesesDoTalhao, mesesDaCultura, situacaoCiclo, mesCurto, nomeMes } from './dados.js';

let ouvindo = false;
let busca = '';
let verEncerrados = false;
let filtroCultura = '';

const opcoesCultura = (sel) => culturas().map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
const opcoesFazenda = (sel) => ['', ...FAZENDAS].map(f => `<option value="${esc(f)}"${f === sel ? ' selected' : ''}>${esc(f || '—')}</option>`).join('');

/** Etiqueta "Nº mês" com a cor da situação. */
export function etiquetaMeses(n, limite, { curta = false } = {}) {
  if (!n) return '<span class="cb-pin neutra">ainda não entrou</span>';
  const sit = situacaoCiclo(n, limite);
  const txt = n + (curta ? 'º' : (n === 1 ? ' mês' : ' meses')) + (limite ? ' / ' + limite : '');
  if (sit === 'passou') return `<span class="cb-pin perigo" title="Passou do ciclo da cultura: já devia ter saído do rateio">${txt} · passou do ciclo</span>`;
  if (sit === 'ultimo') return `<span class="cb-pin alerta" title="Completou o ciclo da cultura: sai no próximo mês">${txt} · atenção</span>`;
  return `<span class="cb-pin ok">${txt}</span>`;
}

function desenhar() {
  const alvo = $('cbTalhoesCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const lista = talhoes().filter(t => verEncerrados || t.ativo !== false)
    .filter(t => !filtroCultura || t.cultura_id === filtroCultura)
    .filter(t => !busca || semAcento(t.nome + ' ' + (t.cod_agro || '') + ' ' + (t.fazenda || '')).includes(semAcento(busca)))
    .sort((a, b) => String(cultura(a.cultura_id)?.nome || '').localeCompare(String(cultura(b.cultura_id)?.nome || ''), 'pt-BR')
      || String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
  const nAtivos = talhoes().filter(t => t.ativo !== false).length;

  alvo.innerHTML = `
    <form class="grade cad-novo" id="cbTalNovo" autocomplete="off">
      <label class="campo">Cód. Agro <input type="text" name="cod" inputmode="numeric" placeholder="ex.: 868"></label>
      <label class="campo plena-2">Plantio / talhão <input type="text" name="nome" required placeholder="ex.: Cen Pl 29 - Pivot 2 - Lote 35 2026"></label>
      <label class="campo">Cultura <select name="cultura" required>${opcoesCultura('')}</select></label>
      <label class="campo">Fazenda <select name="fazenda">${opcoesFazenda('')}</select></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" required placeholder="ex.: 7,12"></label>
      <div class="barra fim" style="align-self:end;margin:0"><button class="btn principal" type="submit">Adicionar</button></div>
    </form>
    <div class="barra">
      <label class="campo" style="flex:1;min-width:200px">Procurar
        <input type="text" id="cbTalBusca" placeholder="nome, código ou fazenda" value="${esc(busca)}"></label>
      <label class="campo">Cultura <select id="cbTalCultura"><option value="">Todas</option>${opcoesCultura(filtroCultura)}</select></label>
      <label class="cb-check"><input type="checkbox" id="cbTalEnc"${verEncerrados ? ' checked' : ''}> mostrar encerrados</label>
      <span class="dc-sem">${nAtivos} ${nAtivos === 1 ? 'plantio ativo' : 'plantios ativos'}</span>
    </div>
    <div class="cb-rolagem"><table class="dc-planilha cb-tab">
      <thead><tr><th>Cód.</th><th>Plantio / talhão</th><th>Cultura</th><th>Fazenda</th><th class="dir">Área (ha)</th><th>Meses no rateio</th><th></th></tr></thead>
      <tbody>${lista.map(t => {
        const c = cultura(t.cultura_id);
        const ms = mesesDoTalhao(t.id);
        return `<tr${t.ativo === false ? ' class="cb-inativa"' : ''}>
          <td>${esc(t.cod_agro || '')}</td>
          <td><b>${esc(t.nome)}</b>${t.ativo === false ? ' <span class="tag inativo">encerrado</span>' : ''}</td>
          <td>${esc(c ? c.nome : '—')}</td>
          <td>${esc(nomeCurto(t.fazenda))}</td>
          <td class="dir">${esc(num(t.area))}</td>
          <td>${etiquetaMeses(ms.length, mesesDaCultura(c))}${ms.length ? `<small class="cb-meses-lista">${ms.map(mesCurto).join(', ')}</small>` : ''}</td>
          <td class="dir"><button class="btn mini" type="button" data-editar="${esc(t.id)}">Editar</button></td>
        </tr>`; }).join('') || `<tr><td colspan="7" class="vazio">${talhoes().length ? 'Nenhum plantio com esse filtro.' : 'Nenhum plantio cadastrado ainda.'}</td></tr>`}
      </tbody></table></div>`;

  $('cbTalNovo').addEventListener('submit', async e => {
    e.preventDefault();
    const r = lerCampos(new FormData(e.target));
    if (!r) return;
    await gravar('cb_talhoes', { ...r, ativo: true });
    aviso('Plantio adicionado.');
    desenhar();
    $('cbTalNovo').querySelector('[name=cod]').focus();
  });
  $('cbTalBusca').addEventListener('input', e => {
    busca = e.target.value; const pos = e.target.selectionStart;
    desenhar(); const el = $('cbTalBusca'); el.focus(); el.setSelectionRange(pos, pos);
  });
  $('cbTalCultura').addEventListener('change', e => { filtroCultura = e.target.value; desenhar(); });
  $('cbTalEnc').addEventListener('change', e => { verEncerrados = e.target.checked; desenhar(); });
  alvo.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
}

function lerCampos(f) {
  const nome = String(f.get('nome') || '').trim().replace(/\s+/g, ' ');
  const area = lerNumero(f.get('area'));
  if (!nome) { aviso('Dê um nome ao plantio.', true); return null; }
  if (area === null || Number.isNaN(area)) { aviso('Área: use só números (ex.: 7,12).', true); return null; }
  if (!f.get('cultura')) { aviso('Escolha a cultura.', true); return null; }
  const cod = String(f.get('cod') || '').trim();
  if (cod && todos('cb_talhoes').some(t => String(t.cod_agro || '') === cod && t.id !== f.get('id') && t.ativo !== false)) {
    aviso('Já existe um plantio ativo com o Cód. Agro ' + cod + '.', true); return null;
  }
  return { cod_agro: cod || null, nome, cultura_id: f.get('cultura'), fazenda: f.get('fazenda') || null, area, obs: String(f.get('obs') || '').trim() || null };
}

export function editar(id, aoSalvar) {
  const t = todos('cb_talhoes').find(x => x.id === id);
  if (!t) return;
  const ms = mesesDoTalhao(t.id);
  window.abrirModal('Editar plantio', `
    <form class="grade" id="cbTalEd" autocomplete="off">
      <input type="hidden" name="id" value="${esc(t.id)}">
      <label class="campo">Cód. Agro <input type="text" name="cod" inputmode="numeric" value="${esc(t.cod_agro || '')}"></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" value="${esc(num(t.area))}"></label>
      <label class="campo plena">Plantio / talhão <input type="text" name="nome" required value="${esc(t.nome)}"></label>
      <label class="campo">Cultura <select name="cultura">${opcoesCultura(t.cultura_id)}</select></label>
      <label class="campo">Fazenda <select name="fazenda">${opcoesFazenda(t.fazenda || '')}</select></label>
      <label class="campo plena">Observação <input type="text" name="obs" value="${esc(t.obs || '')}"></label>
      <label class="cb-check plena"><input type="checkbox" name="ativo"${t.ativo !== false ? ' checked' : ''}> ativo — desmarque para encerrar: não entra nos próximos meses</label>
      <p class="dc-sem plena" style="margin:0">${ms.length ? `Entrou no rateio em ${ms.length} ${ms.length === 1 ? 'mês' : 'meses'}: ${ms.map(nomeMes).join(', ')}.` : 'Ainda não entrou em nenhum mês.'} A área daqui é a padrão; cada mês guarda a sua.</p>
      <div class="barra fim plena"><button class="btn" type="button" id="cbTalCancelar">Cancelar</button><button class="btn principal" type="submit">Salvar</button></div>
    </form>`, corpo => {
    corpo.querySelector('#cbTalCancelar').onclick = () => window.fecharModal();
    corpo.querySelector('#cbTalEd').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = lerCampos(f);
      if (!r) return;
      await gravar('cb_talhoes', { ...t, ...r, ativo: f.get('ativo') === 'on' });
      window.fecharModal();
      aviso('Plantio salvo.');
      desenhar();
      if (aoSalvar) aoSalvar();
    });
  });
}

/** Novo plantio pelo modal (usado também pela tela do mês). Devolve o registro. */
export function novoPlantioModal(aoSalvar) {
  window.abrirModal('Novo plantio', `
    <form class="grade" id="cbTalNovoM" autocomplete="off">
      <label class="campo">Cód. Agro <input type="text" name="cod" inputmode="numeric" placeholder="ex.: 868"></label>
      <label class="campo">Área (ha) <input type="text" name="area" inputmode="decimal" required placeholder="ex.: 7,12"></label>
      <label class="campo plena">Plantio / talhão <input type="text" name="nome" required placeholder="ex.: Cen Pl 29 - Pivot 2 - Lote 35 2026"></label>
      <label class="campo">Cultura <select name="cultura" required>${opcoesCultura('')}</select></label>
      <label class="campo">Fazenda <select name="fazenda">${opcoesFazenda('')}</select></label>
      <div class="barra fim plena"><button class="btn" type="button" id="cbTalCancelarM">Cancelar</button><button class="btn principal" type="submit">Adicionar ao mês</button></div>
    </form>`, corpo => {
    corpo.querySelector('#cbTalCancelarM').onclick = () => window.fecharModal();
    corpo.querySelector('#cbTalNovoM').addEventListener('submit', async e => {
      e.preventDefault();
      const r = lerCampos(new FormData(e.target));
      if (!r) return;
      const reg = await gravar('cb_talhoes', { ...r, ativo: true });
      window.fecharModal();
      if (aoSalvar) aoSalvar(reg);
    });
    corpo.querySelector('[name=cod]').focus();
  });
}

export function abrirTalhoes() {
  if (!ouvindo) { window.addEventListener('custobase-dados', () => { if (!$('telaRtTalhoes').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
