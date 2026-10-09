/* =====================================================================
   LOP - Gestão Rápida · área Manutenções — EDITOR DE CHECK LIST (09/10/2026)

   Aba "Modelos" do Check list (só administrador). Ali se cria, duplica e
   edita cada modelo: nome, prazo, grupos e itens (pôr, tirar, renomear,
   mudar a ordem) e quais máquinas usam o modelo.

   Histórico: se a versão em uso já tem check list preenchido, a primeira
   mudança cria uma versão nova (cópia) e é nela que se mexe. Os check lists
   antigos continuam apontando para a versão do dia em que foram feitos.
   ===================================================================== */

const TIPOS_GRUPO_CK = [['ESCALA_BMR', 'Bom / Médio / Ruim'], ['OK_REPARO_NA', 'OK / Reparo / Não se aplica']];
const ANOMALIA_CK = { ESCALA_BMR: 'RUIM', OK_REPARO_NA: 'REPARO' };
let modeloEmEdicao = null;
let verInativosCk = false;

const maquinasDoModelo = mid => q.todos('checklist_equipamento').filter(v => v.modelo_id === mid)
  .map(v => q.por_id('equipamentos', v.equipamento_id)).filter(e => e && e.ativo !== false)
  .sort(porCodigo);
function itensDoModelo(mid) {
  const v = versaoVigente(mid); if (!v) return 0;
  return gruposDaVersao(v.id).reduce((s, g) => s + itensDoGrupo(g.id).length, 0);
}
/* O tipo de resposta de um grupo é o dos seus itens de escala. */
function tipoDoGrupo(gid) {
  const it = itensDoGrupo(gid).find(i => ANOMALIA_CK[i.tipo_resposta]);
  return it ? it.tipo_resposta : 'ESCALA_BMR';
}

/* A fila sobe em ordem alfabética de tabela (grupos antes de versões); com
   algumas passadas, o que falhou por falta do "pai" sobe na seguinte. */
async function subirFilaCk() {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 250));
    await sincronizar();
    if (!App.pendentes) break;
  }
}

async function copiarVersaoCk(origem, modeloId, numero) {
  const nova = await gravar('checklist_versoes', { id: crypto.randomUUID(), modelo_id: modeloId, versao: numero, vigente: true });
  for (const g of gruposDaVersao(origem.id)) {
    const ng = await gravar('checklist_grupos', { id: crypto.randomUUID(), versao_id: nova.id, nome: g.nome, ordem: g.ordem, ativo: true });
    for (const it of itensDoGrupo(g.id)) {
      const { id, grupo_id, ...resto } = it;
      await gravar('checklist_itens', { ...resto, id: crypto.randomUUID(), grupo_id: ng.id });
    }
  }
  return nova;
}

/* Devolve a versão onde pode mexer: a vigente, ou uma cópia dela se a vigente
   já tem check list preenchido. */
async function versaoEditavel(mid) {
  const v = versaoVigente(mid);
  if (!v) return gravar('checklist_versoes', { id: crypto.randomUUID(), modelo_id: mid, versao: 1, vigente: true });
  if (!q.todos('checklists').some(c => c.versao_id === v.id)) return v;
  const maior = Math.max(...q.todos('checklist_versoes').filter(x => x.modelo_id === mid).map(x => Number(x.versao) || 1));
  v.vigente = false; await gravar('checklist_versoes', v);
  const nova = await copiarVersaoCk(v, mid, maior + 1);
  aviso(`Versão ${maior + 1} criada — os check lists já feitos continuam na versão ${v.versao}.`);
  return nova;
}

/* ---------------------------------------------------------------- lista de modelos */

function desenharModelosCk(el) {
  if (modeloEmEdicao && q.por_id('checklist_modelos', modeloEmEdicao)) return editorModeloCk(el, modeloEmEdicao);
  const modelos = q.todos('checklist_modelos').filter(m => verInativosCk || m.ativo !== false)
    .sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome, 'pt-BR'));
  el.innerHTML = `
    <p class="sub">Cada máquina usa um modelo. Edite os itens, crie um modelo novo a partir de outro
       ou mude quais máquinas usam cada um.</p>
    <div class="acoes">
      <button type="button" class="btn" id="mc-novo">Modelo novo</button>
      <label class="mc-inativos"><input type="checkbox" id="mc-inativos" ${verInativosCk ? 'checked' : ''}> Mostrar desativados</label>
    </div>
    <table class="tabela mc-tab"><thead><tr><th>Modelo</th><th>Máquinas</th><th>Itens</th><th>Prazo</th><th></th></tr></thead><tbody>
    ${modelos.map(m => `<tr class="${m.ativo === false ? 'mc-off' : ''}">
        <td><strong>${esc(m.nome)}</strong>${m.ativo === false ? ' <small>desativado</small>' : ''}</td>
        <td>${maquinasDoModelo(m.id).length}</td>
        <td>${itensDoModelo(m.id)}</td>
        <td>${m.periodicidade_dias ? m.periodicidade_dias + ' dias' : '—'}</td>
        <td class="mc-acoes"><button type="button" class="btn mini" data-editar="${esc(m.id)}">Editar</button>
          <button type="button" class="btn-fantasma mini" data-duplicar="${esc(m.id)}">Duplicar</button></td></tr>`).join('')}
    </tbody></table>`;
  el.querySelector('#mc-inativos').onchange = e => { verInativosCk = e.target.checked; desenharModelosCk(el); };
  el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { modeloEmEdicao = b.dataset.editar; desenharModelosCk(el); });
  el.querySelectorAll('[data-duplicar]').forEach(b => b.onclick = () => duplicarModeloCk(el, b.dataset.duplicar));
  el.querySelector('#mc-novo').onclick = () => {
    abrirModal('Modelo novo de check list', `
      ${campoTexto('Nome do modelo', 'mn_nome', 'CHECK LIST 10 DIAS - ', 'text', 'Ex.: CHECK LIST 10 DIAS - GERADORES')}
      ${campoLista('Começar a partir de', 'mn_base', [{ id: '', nome: 'Em branco (só o grupo de segurança)' }, ...q.ativos('checklist_modelos').sort((a, b) => a.nome.localeCompare(b.nome)).map(m => ({ id: m.id, nome: 'Cópia de ' + m.nome }))], '', null)}
      <div class="acoes"><button type="button" class="btn" id="mn-criar">Criar</button></div>`, corpo => {
      corpo.querySelector('#mn-criar').onclick = async () => {
        const nome = corpo.querySelector('#f-mn_nome').value.trim().toUpperCase();
        if (nome.length < 4) return aviso('Informe o nome do modelo.', true);
        if (q.todos('checklist_modelos').some(m => m.nome.toUpperCase() === nome)) return aviso('Já existe um modelo com esse nome.', true);
        const base = corpo.querySelector('#f-mn_base').value;
        fecharModal();
        modeloEmEdicao = await criarModeloCk(nome, base || null);
        await subirFilaCk();
        desenharModelosCk(el);
      };
    });
  };
}

async function criarModeloCk(nome, baseId) {
  const base = baseId ? q.por_id('checklist_modelos', baseId) : null;
  const m = await gravar('checklist_modelos', { id: crypto.randomUUID(), nome, tipo_equipamento_id: base ? base.tipo_equipamento_id : null,
    periodicidade_dias: base ? base.periodicidade_dias : 10, ativo: true });
  const vb = base ? versaoVigente(base.id) : null;
  if (vb) { await copiarVersaoCk(vb, m.id, 1); return m.id; }
  const v = await gravar('checklist_versoes', { id: crypto.randomUUID(), modelo_id: m.id, versao: 1, vigente: true });
  const g = await gravar('checklist_grupos', { id: crypto.randomUUID(), versao_id: v.id, nome: 'ITENS DE SEGURANÇA', ordem: 1, ativo: true });
  const seg = ['Capa de proteção do cardã', 'Proteções de partes móveis (correias, polias, engrenagens)', 'Adesivos e sinalização de segurança', 'Extintor de incêndio (carga e validade)'];
  for (let i = 0; i < seg.length; i++)
    await gravar('checklist_itens', { id: crypto.randomUUID(), grupo_id: g.id, texto: seg[i], tipo_resposta: 'OK_REPARO_NA',
      obrigatorio: true, foto_se_ruim: true, gera_anomalia_se: 'REPARO', ordem: i + 1, ativo: true });
  return m.id;
}

async function duplicarModeloCk(el, mid) {
  const m = q.por_id('checklist_modelos', mid);
  let nome = m.nome + ' (CÓPIA)', n = 2;
  while (q.todos('checklist_modelos').some(x => x.nome === nome)) nome = `${m.nome} (CÓPIA ${n++})`;
  modeloEmEdicao = await criarModeloCk(nome, mid);
  await subirFilaCk();
  aviso('Modelo duplicado. Troque o nome e ajuste os itens.');
  desenharModelosCk(el);
}

/* ---------------------------------------------------------------- editor */

function editorModeloCk(el, mid) {
  const m = q.por_id('checklist_modelos', mid);
  const v = versaoVigente(mid);
  const grupos = v ? gruposDaVersao(v.id) : [];
  const maquinas = maquinasDoModelo(mid);
  const temSeguranca = grupos.some(g => /SEGURAN|CARD/i.test(g.nome) || itensDoGrupo(g.id).some(i => /card/i.test(i.texto)));
  const usada = v && q.todos('checklists').some(c => c.versao_id === v.id);

  el.innerHTML = `
    <div class="acoes"><button type="button" class="btn-fantasma" id="me-voltar">← Todos os modelos</button>
      <span class="cresce"></span>
      <button type="button" class="btn neutro" id="me-ver">Ver a folha</button>
      <button type="button" class="btn-fantasma" id="me-ativo">${m.ativo === false ? 'Reativar modelo' : 'Desativar modelo'}</button></div>
    <div class="me-cab">
      ${campoTexto('Nome do modelo', 'me_nome', m.nome)}
      ${campoTexto('Prazo (dias entre um check list e outro)', 'me_dias', m.periodicidade_dias || '', 'number')}
    </div>
    <p class="sub">Versão ${v ? v.versao : 1}${usada ? ' · já tem check list feito nesta versão: a próxima mudança cria a versão ' + ((v.versao || 1) + 1) : ''}.
       As mudanças valem para todas as máquinas deste modelo.</p>
    ${temSeguranca ? '' : '<div class="me-alerta">Este modelo não tem itens de segurança nem capa de cardã. <button type="button" class="btn mini" id="me-seg">Pôr grupo de segurança</button></div>'}
    <div id="me-grupos">
    ${grupos.map((g, gi) => {
      const itens = itensDoGrupo(g.id);
      const tipo = tipoDoGrupo(g.id);
      return `<section class="me-grupo" data-g="${esc(g.id)}">
        <header>
          <input type="text" class="me-gnome" value="${esc(g.nome)}" aria-label="Nome do grupo">
          <select class="me-gtipo" aria-label="Respostas do grupo">${TIPOS_GRUPO_CK.map(([id, nome]) => `<option value="${id}"${tipo === id ? ' selected' : ''}>${nome}</option>`).join('')}</select>
          <button type="button" class="btn-fantasma mini" data-gmove="-1" ${gi === 0 ? 'disabled' : ''} aria-label="Subir grupo">▲</button>
          <button type="button" class="btn-fantasma mini" data-gmove="1" ${gi === grupos.length - 1 ? 'disabled' : ''} aria-label="Descer grupo">▼</button>
          <button type="button" class="btn-fantasma mini me-tira" data-gtira>Tirar grupo</button>
        </header>
        <ol class="me-itens">
        ${itens.map((it, ii) => `<li data-i="${esc(it.id)}">
            <input type="text" class="me-itexto" value="${esc(it.texto)}" aria-label="Texto do item">
            ${ANOMALIA_CK[it.tipo_resposta] ? '' : `<small class="me-tipo">${esc(it.tipo_resposta === 'NUMERO' ? 'número' : it.tipo_resposta === 'TEXTO' ? 'texto' : it.tipo_resposta === 'SIM_NAO' ? 'sim/não' : it.tipo_resposta)}</small>`}
            <button type="button" class="btn-fantasma mini" data-imove="-1" ${ii === 0 ? 'disabled' : ''} aria-label="Subir item">▲</button>
            <button type="button" class="btn-fantasma mini" data-imove="1" ${ii === itens.length - 1 ? 'disabled' : ''} aria-label="Descer item">▼</button>
            <button type="button" class="btn-fantasma mini me-tira" data-itira aria-label="Tirar item">✕</button></li>`).join('')}
        </ol>
        <div class="me-novo"><input type="text" class="me-novoitem" placeholder="Item novo neste grupo — digite e tecle Enter">
          <button type="button" class="btn mini" data-iadd>Pôr item</button></div>
      </section>`;
    }).join('')}
    </div>
    <div class="me-novo me-novogrupo"><input type="text" id="me-ngrupo" placeholder="Nome do grupo novo (ex.: ITENS DE SEGURANÇA)">
      <select id="me-ngtipo">${TIPOS_GRUPO_CK.map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')}</select>
      <button type="button" class="btn" id="me-gadd">Pôr grupo</button></div>

    <h2 class="me-h2">Máquinas que usam este modelo (${maquinas.length})</h2>
    <div class="me-maqs">${maquinas.map(e => `<span class="me-maq"><b>${esc(e.codigo)}</b> ${esc(e.descricao)}
        <button type="button" data-maqtira="${esc(e.id)}" aria-label="Tirar ${esc(e.codigo)} deste modelo">×</button></span>`).join('') || '<small>Nenhuma.</small>'}</div>
    <div class="me-novo"><input type="search" id="me-maqbusca" placeholder="Pôr máquina: digite código ou nome" list="me-maqlista">
      <datalist id="me-maqlista">${q.ativos('equipamentos').filter(e => !['VENDIDO', 'BAIXADO'].includes(e.status)).sort(porCodigo)
        .map(e => `<option value="${esc(e.codigo)} — ${esc(e.descricao)}"></option>`).join('')}</datalist>
      <button type="button" class="btn mini" id="me-maqadd">Pôr neste modelo</button></div>
    <p class="sub">A máquina que você puser aqui sai do modelo que ela usava antes. Precisa de internet.</p>`;

  const redesenhar = () => editorModeloCk(el, mid);
  const $e = s => el.querySelector(s);

  $e('#me-voltar').onclick = () => { modeloEmEdicao = null; desenharModelosCk(el); };
  $e('#me-ver').onclick = () => {
    const e = maquinas[0] || { id: '', codigo: '—', descricao: m.nome, local_id: null };
    abrirModal(m.nome, `<div class="ck-folha-prev">${folhaChecklist(e, m, {})}</div>`);
  };
  $e('#me-ativo').onclick = async () => {
    if (m.ativo !== false && maquinas.length) return aviso('Tire as máquinas deste modelo antes de desativar.', true);
    m.ativo = m.ativo === false; await gravar('checklist_modelos', m); await subirFilaCk(); redesenhar();
  };
  $e('#f-me_nome').onchange = async ev => {
    const nome = ev.target.value.trim().toUpperCase();
    if (!nome) { ev.target.value = m.nome; return; }
    m.nome = nome; await gravar('checklist_modelos', m); aviso('Nome salvo.');
  };
  $e('#f-me_dias').onchange = async ev => {
    const d = parseInt(ev.target.value, 10);
    m.periodicidade_dias = d > 0 ? d : null; await gravar('checklist_modelos', m); aviso('Prazo salvo.');
  };

  /* Toda mudança na estrutura passa por aqui: garante a versão editável e
     acha o grupo/item equivalente nela (pela ordem), se uma cópia foi criada. */
  const mexer = async (gid, iid, fn) => {
    const antes = versaoVigente(mid);
    const ver = await versaoEditavel(mid);
    let g = gid ? q.por_id('checklist_grupos', gid) : null, it = iid ? q.por_id('checklist_itens', iid) : null;
    if (antes && ver.id !== antes.id) {
      const gruposNovos = gruposDaVersao(ver.id);
      if (g) {
        const ng = gruposNovos[gruposDaVersao(antes.id).findIndex(x => x.id === g.id)];
        if (it) it = itensDoGrupo(ng.id)[itensDoGrupo(g.id).findIndex(x => x.id === it.id)];
        g = ng;
      }
    }
    await fn(ver, g, it);
    await subirFilaCk();
    redesenhar();
  };
  const reordenar = async (lista, tabela) => { for (let i = 0; i < lista.length; i++) if (lista[i].ordem !== i + 1) { lista[i].ordem = i + 1; await gravar(tabela, lista[i]); } };

  el.querySelectorAll('.me-grupo').forEach(sec => {
    const gid = sec.dataset.g;
    sec.querySelector('.me-gnome').onchange = ev => {
      const nome = ev.target.value.trim().toUpperCase(); if (!nome) return redesenhar();
      mexer(gid, null, async (ver, g) => { g.nome = nome; await gravar('checklist_grupos', g); });
    };
    sec.querySelector('.me-gtipo').onchange = ev => mexer(gid, null, async (ver, g) => {
      for (const it of itensDoGrupo(g.id)) if (ANOMALIA_CK[it.tipo_resposta]) {
        it.tipo_resposta = ev.target.value; it.gera_anomalia_se = ANOMALIA_CK[ev.target.value]; await gravar('checklist_itens', it);
      }
    });
    sec.querySelectorAll('[data-gmove]').forEach(b => b.onclick = () => mexer(gid, null, async (ver, g) => {
      const l = gruposDaVersao(ver.id); const i = l.findIndex(x => x.id === g.id); const j = i + Number(b.dataset.gmove);
      [l[i], l[j]] = [l[j], l[i]]; await reordenar(l, 'checklist_grupos');
    }));
    sec.querySelector('[data-gtira]').onclick = () => {
      if (!confirm(`Tirar o grupo "${sec.querySelector('.me-gnome').value}" e todos os itens dele?`)) return;
      mexer(gid, null, async (ver, g) => { g.ativo = false; await gravar('checklist_grupos', g); });
    };
    const novo = sec.querySelector('.me-novoitem');
    const porItem = () => {
      const texto = novo.value.trim(); if (!texto) return aviso('Digite o item.', true);
      mexer(gid, null, async (ver, g) => {
        const tipo = tipoDoGrupo(g.id); const l = itensDoGrupo(g.id);
        await gravar('checklist_itens', { id: crypto.randomUUID(), grupo_id: g.id, texto, tipo_resposta: tipo, obrigatorio: true,
          foto_se_ruim: true, gera_anomalia_se: ANOMALIA_CK[tipo], ordem: l.length ? Math.max(...l.map(x => x.ordem || 0)) + 1 : 1, ativo: true });
      });
    };
    sec.querySelector("[data-iadd]").onclick = porItem;
    novo.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); porItem(); } };
    sec.querySelectorAll('.me-itens li').forEach(li => {
      const iid = li.dataset.i;
      li.querySelector('.me-itexto').onchange = ev => {
        const texto = ev.target.value.trim(); if (!texto) return redesenhar();
        mexer(gid, iid, async (ver, g, it) => { it.texto = texto; await gravar('checklist_itens', it); });
      };
      li.querySelectorAll('[data-imove]').forEach(b => b.onclick = () => mexer(gid, iid, async (ver, g, it) => {
        const l = itensDoGrupo(g.id); const i = l.findIndex(x => x.id === it.id); const j = i + Number(b.dataset.imove);
        [l[i], l[j]] = [l[j], l[i]]; await reordenar(l, 'checklist_itens');
      }));
      li.querySelector('[data-itira]').onclick = () => mexer(gid, iid, async (ver, g, it) => { it.ativo = false; await gravar('checklist_itens', it); });
    });
  });

  const porGrupo = async (nome, tipo, itens) => mexer(null, null, async ver => {
    const l = gruposDaVersao(ver.id);
    const g = await gravar('checklist_grupos', { id: crypto.randomUUID(), versao_id: ver.id, nome, ordem: l.length ? Math.max(...l.map(x => x.ordem || 0)) + 1 : 1, ativo: true });
    for (let i = 0; i < itens.length; i++)
      await gravar('checklist_itens', { id: crypto.randomUUID(), grupo_id: g.id, texto: itens[i], tipo_resposta: tipo, obrigatorio: true,
        foto_se_ruim: true, gera_anomalia_se: ANOMALIA_CK[tipo], ordem: i + 1, ativo: true });
  });
  $e('#me-gadd').onclick = () => {
    const nome = $e('#me-ngrupo').value.trim().toUpperCase(); if (!nome) return aviso('Digite o nome do grupo.', true);
    porGrupo(nome, $e('#me-ngtipo').value, []);
  };
  const bSeg = $e('#me-seg');
  if (bSeg) bSeg.onclick = () => porGrupo('ITENS DE SEGURANÇA', 'OK_REPARO_NA', ['Capa de proteção do cardã', 'Proteções de partes móveis (correias, polias, engrenagens)', 'Adesivos e sinalização de segurança', 'Extintor de incêndio (carga e validade)']);

  /* Máquinas: a tabela de ligação tem chave dupla (máquina + modelo), então
     a troca é feita direto no servidor, com internet. */
  const trocarModelo = async (eid, novoModelo) => {
    if (!App.online) return aviso('Sem internet: a troca de modelo precisa de conexão.', true);
    const del = await App.sb.from('checklist_equipamento').delete().eq('equipamento_id', eid);
    if (del.error) return aviso('Não consegui trocar: ' + del.error.message, true);
    const cache = tx('cache', 'readwrite');
    q.todos('checklist_equipamento').filter(x => x.equipamento_id === eid).forEach(x => cache.delete(['checklist_equipamento', x.equipamento_id + '|' + x.modelo_id]));
    App.dados.checklist_equipamento = q.todos('checklist_equipamento').filter(x => x.equipamento_id !== eid);
    if (novoModelo) {
      const reg = { equipamento_id: eid, modelo_id: novoModelo, periodicidade_dias: null, suspenso: false };
      const ins = await App.sb.from('checklist_equipamento').insert(reg);
      if (ins.error) return aviso('Não consegui trocar: ' + ins.error.message, true);
      await gravarLocal('checklist_equipamento', [reg]);
      App.dados.checklist_equipamento.push(reg);
    }
    redesenhar();
  };
  el.querySelectorAll('[data-maqtira]').forEach(b => b.onclick = () => trocarModelo(b.dataset.maqtira, null));
  $e('#me-maqadd').onclick = () => {
    const cod = ($e('#me-maqbusca').value || '').split(' — ')[0].trim().toLowerCase();
    const e = q.ativos('equipamentos').find(x => String(x.codigo).toLowerCase() === cod);
    if (!e) return aviso('Escolha a máquina na lista.', true);
    const atual = modeloDaMaquina(e).modelo;
    if (atual && atual.id === mid) return aviso('Essa máquina já usa este modelo.', true);
    if (atual && !confirm(`${e.codigo} usa "${atual.nome}". Passar para este modelo?`)) return;
    trocarModelo(e.id, mid);
  };
}

Object.assign(window, { desenharModelosCk });
