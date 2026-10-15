/* =====================================================================
   Gestão Rápida · Programação Campo — Relatório Diário
   Registro das visitas de campo do dia: fazenda, local/talhão, plantio,
   cultura, informações e fotos. Cada relatório recebe um código
   automático (RD-AAAA-0001), dado pelo banco quando o registro sobe.

   Telas: "diario" (lançar / editar) e "diarios" (histórico).
   PDF em A4 retrato, padrão SAKUMA, com o nome do agrônomo no fim e a
   LOP no canto direito do pé da folha. Envio pelo WhatsApp com o nome
   do arquivo e a mensagem "Relatório Diário (data)".
   ===================================================================== */

const BUCKET_DIARIO = 'programacao-diario';   // só um rótulo agora: as fotos vão para o Google Drive
const MAX_INFO = 2000;
const MAX_FOTOS = 8;
const AGRONOMO_PADRAO = 'Matheus Cassiano';
const CARGO_AGRONOMO = 'Engenheiro Agrônomo';
/* fundo da caixa de Informações e das fotos no PDF: cinza claro (a faixa do registro continua verde) */
const CINZA_BLOCO = { faixa: '#ECEDE8', caixa: '#F5F5F2', linha: '#D3D5CD' };

/* ---------------------------------------------------------------- fotos */

const urlsFoto = new Map();   // caminho → object URL (miniatura na tela)

async function blobFotoDiario(caminho) {
  const local = await blobDaFoto(caminho);
  if (local) return local;
  if (!App.online || !App.sb) return null;
  return blobDoDrive(caminho);      // fotos no Google Drive (15/10/2026)
}
async function urlFotoDiario(caminho) {
  if (urlsFoto.has(caminho)) return urlsFoto.get(caminho);
  const b = await blobFotoDiario(caminho);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlsFoto.set(caminho, u);
  return u;
}

/* ---------------------------------------------------------------- ajudantes */

const diariosVisiveis = () => q.todos('diarios').filter(d => d.ativo !== false);
const codigoDiario = d => d.codigo || 'aguardando envio';
const visitaVazia = () => ({ fazenda_id: '', local_id: '', plantio: '', cultura_id: '', informacoes: '', fotos: [] });
const dataLonga = iso => {
  const p = partes(iso);
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `${br(iso)} · ${dias[new Date(p.ano, p.mes - 1, p.dia).getDay()]}`;
};
const nomeArquivoDiario = d =>
  `Relatorio_Diario_${br(d.data).replace(/\//g, '-')}` + (d.codigo ? `_${d.codigo}` : '');
/* Mensagem que acompanha o PDF no WhatsApp. O texto fica em programacao.parametros
   (chave diario_msg_whatsapp) e é editado em Relatório Diário → Configurações.
   Marcadores: {data} {codigo} {agronomo} {fazendas} {registros} */
const CHAVE_MSG = 'diario_msg_whatsapp';
const MSG_PADRAO = 'Segue em anexo o relatório diário ({data})';
const modeloMensagem = () => ((q.todos('parametros').find(p => p.chave === CHAVE_MSG) || {}).valor || '').trim() || MSG_PADRAO;
function textoMensagem(d, modelo = modeloMensagem()) {
  const fazendas = gruposPorFazenda(d).map(g => g.nome).join(', ');
  return modelo
    .replace(/\{data\}/gi, br(d.data))
    .replace(/\{codigo\}/gi, d.codigo || '')
    .replace(/\{agronomo\}/gi, d.agronomo || '')
    .replace(/\{fazendas\}/gi, fazendas)
    .replace(/\{registros\}/gi, String((d.visitas || []).length));
}

const mensagemDiario = d => {
  const linhas = [`*Relatório Diário (${br(d.data)})*`, 'SAKUMA Agronegócios'];
  if (d.codigo) linhas.push('Código: ' + d.codigo);
  if (d.agronomo) linhas.push(`${d.agronomo} - ${CARGO_AGRONOMO}`);
  let n = 0;
  gruposPorFazenda(d).forEach(g => {
    linhas.push('', `*${g.nome}*`);
    g.visitas.forEach(v => linhas.push(`${++n}. ${q.nome('locais', v.local_id)}` +
      (q.nome('culturas', v.cultura_id) ? ` (${q.nome('culturas', v.cultura_id)})` : '') + (v.plantio ? ` · ${v.plantio}` : '')));
  });
  linhas.push('', 'Arquivo: ' + nomeArquivoDiario(d) + '.pdf');
  return linhas.join('\n');
};

/* Visitas agrupadas por fazenda (ordem do cadastro de fazendas); dentro da
   fazenda, na ordem em que foram lançadas. Só muda a saída (PDF e WhatsApp). */
function gruposPorFazenda(d) {
  const ordem = {};
  fazendasOrdenadas(false).forEach((f, i) => { ordem[f.id] = i; });
  const grupos = new Map();
  (d.visitas || []).forEach(v => {
    if (!grupos.has(v.fazenda_id)) grupos.set(v.fazenda_id, []);
    grupos.get(v.fazenda_id).push(v);
  });
  return [...grupos.entries()]
    .sort((a, b) => (ordem[a[0]] ?? 999) - (ordem[b[0]] ?? 999))
    .map(([id, visitas]) => ({ id, nome: q.nome('fazendas', id) || 'Sem fazenda', visitas }));
}

/* Espera o banco devolver o código. Sem internet, segue sem ele. */
async function garantirCodigo(d) {
  if (d.codigo || !App.online) return d;
  for (let i = 0; i < 12 && !d.codigo; i++) {
    await sincronizar();
    const r = q.por_id('diarios', d.id);
    if (r && r.codigo) d.codigo = r.codigo;
    if (!d.codigo) await new Promise(ok => setTimeout(ok, 500));
  }
  return d;
}

/* ---------------------------------------------------------------- lançar */

TELAS.diario = el => {
  const editar = window.diarioEditando || null;
  const novaVisita = !!window.diarioNovaVisita;          // abriu pelo "+ Visita"
  const trazidas = window.diarioVisitasTrazidas || [];   // visitas digitadas antes de juntar
  window.diarioEditando = null; window.diarioNovaVisita = false; window.diarioVisitasTrazidas = null;
  const d = editar ? JSON.parse(JSON.stringify(editar)) : {
    id: crypto.randomUUID(), data: hoje(),
    // o último agrônomo usado; no primeiro relatório, o padrão
    agronomo: (diariosVisiveis().slice().sort((x, y) => String(y.criado_em || '').localeCompare(String(x.criado_em || '')))[0] || {}).agronomo || AGRONOMO_PADRAO,
    agronomo_id: App.usuario ? App.usuario.id : null,
    visitas: [visitaVazia()]
  };
  if (!d.visitas || !d.visitas.length) d.visitas = [visitaVazia()];
  if (editar && trazidas.length) d.visitas.push(...trazidas);
  else if (editar && novaVisita) {
    const ult = d.visitas[d.visitas.length - 1];
    d.visitas.push(Object.assign(visitaVazia(), { fazenda_id: ult ? ult.fazenda_id : '' }));
  }
  const novo = !editar;
  const rolarParaFim = !!(editar && (novaVisita || trazidas.length));
  const agronomos = [...new Set([d.agronomo, AGRONOMO_PADRAO,
    ...diariosVisiveis().map(x => x.agronomo)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el.innerHTML = `
    <div class="rd-topo">
      <div class="rd-titulo">
        <span class="rd-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5M7.5 11h9M7.5 14.5h9M7.5 18h6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <div><h1>Relatório Diário</h1><p class="sub">Registro das atividades de campo</p></div>
      </div>
      <div class="rd-cab">
        <div class="campo"><label for="rd-data">Data *</label>
          <input type="date" id="rd-data" value="${esc(d.data)}"></div>
        <div class="campo"><label for="rd-agronomo">Agrônomo *</label>
          <input type="text" id="rd-agronomo" list="rd-agronomos" value="${esc(d.agronomo || '')}" placeholder="Nome do agrônomo">
          <datalist id="rd-agronomos">${agronomos.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <div class="rd-codigo"><span>Código</span><b>${d.codigo ? esc(d.codigo) : 'automático ao salvar'}</b></div>
      </div>
    </div>
    ${novo ? '' : `<div class="rd-faixa">Editando o relatório <b>${esc(d.codigo || 'aguardando envio')}</b> de ${br(d.data)} —
      corrija o que precisar ou acrescente visitas no fim. ${d.visitas.length} visita${d.visitas.length > 1 ? 's' : ''}.</div>`}
    <div id="rd-existe"></div>
    <div id="rd-visitas"></div>
    <button type="button" class="btn neutro rd-mais" id="rd-mais">+ Adicionar outra visita</button>
    <section class="rd-visita rd-obs-geral">
      <header><h2>Observação geral</h2></header>
      <div class="rd-corpo">
        <div class="campo"><label for="rd-obs">Observação geral do dia (opcional)</label>
          <textarea id="rd-obs" maxlength="${MAX_INFO}" rows="4"
            placeholder="Resumo do dia, pendências, recomendações gerais, clima, etc.">${esc(d.observacao_geral || '')}</textarea>
          <p class="ajuda rd-conta" id="rd-obs-conta">${(d.observacao_geral || '').length}/${MAX_INFO}</p></div>
      </div>
    </section>
    <div class="acoes">
      <button type="button" class="btn" id="rd-salvar">${novo ? 'Salvar' : 'Salvar alterações'}</button>
      <button type="button" class="btn secundario" id="rd-pdf">Salvar e gerar PDF / WhatsApp</button>
      ${novo ? '' : '<button type="button" class="btn neutro" id="rd-voltar">Voltar ao histórico</button>'}
    </div>`;

  const caixa = el.querySelector('#rd-visitas');

  function desenhar() {
    caixa.innerHTML = d.visitas.map((v, i) => `
      <section class="rd-visita" data-i="${i}">
        <header><h2>${i + 1}. Registro da Visita</h2>
          ${d.visitas.length > 1 ? `<button type="button" class="rd-remover" data-rem="${i}">🗑 Remover</button>` : ''}</header>
        <div class="rd-corpo">
          <div class="rd-grade">
            <div class="campo"><label>Fazenda *</label>
              <select data-c="fazenda_id">${opcoes(fazendasOrdenadas(), v.fazenda_id, 'Selecione')}</select></div>
            <div class="campo"><label>Local / Talhão *</label>
              <select data-c="local_id">${opcoesLocalDaFazenda(v.fazenda_id, v.local_id)}</select></div>
            <div class="campo"><label>Plantio</label>
              <input type="text" data-c="plantio" value="${esc(v.plantio || '')}" placeholder="Digite (se necessário)"></div>
            <div class="campo"><label>Cultura *</label>
              <select data-c="cultura_id">${opcoes(q.ordenado('culturas'), v.cultura_id, 'Selecione')}</select></div>
          </div>
          <div class="campo"><label>Informações *</label>
            <textarea data-c="informacoes" maxlength="${MAX_INFO}" rows="5"
              placeholder="Descreva as atividades, observações, condições da lavoura, pragas, doenças, recomendações, etc.">${esc(v.informacoes || '')}</textarea>
            <p class="ajuda rd-conta">${(v.informacoes || '').length}/${MAX_INFO}</p></div>
          <label class="rd-lbl">Fotos (opcional)</label>
          <div class="rd-fotos">
            ${v.fotos.length < MAX_FOTOS ? `<label class="rd-soltar">
              <input type="file" accept="image/jpeg,image/png" multiple hidden data-arq="${i}">
              <span class="rd-cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="#51534A"/><circle cx="12" cy="13" r="4" fill="#fff"/><circle cx="12" cy="13" r="2.4" fill="#51534A"/></svg></span>
              <span>Clique para adicionar fotos<br>ou arraste os arquivos aqui<br><small>(JPG, PNG)</small></span>
            </label>` : ''}
            ${v.fotos.map((c, k) => `<div class="rd-foto"><img data-foto="${esc(c)}" alt="Foto ${k + 1}">
              <button type="button" data-tira="${i}:${k}" aria-label="Tirar a foto">×</button></div>`).join('')}
          </div>
        </div>
      </section>`).join('');

    caixa.querySelectorAll('.rd-visita').forEach(sec => {
      const i = +sec.dataset.i, v = d.visitas[i];
      const campo = c => sec.querySelector(`[data-c="${c}"]`);
      sec.querySelectorAll('[data-c]').forEach(c => {
        c.oninput = c.onchange = () => {
          v[c.dataset.c] = c.value;
          if (c.dataset.c === 'informacoes') sec.querySelector('.rd-conta').textContent = `${c.value.length}/${MAX_INFO}`;
        };
      });
      campo('fazenda_id').onchange = () => {
        v.fazenda_id = campo('fazenda_id').value;
        if (v.local_id && fazendaDoLocal(v.local_id) !== v.fazenda_id) v.local_id = '';
        campo('local_id').innerHTML = opcoesLocalDaFazenda(v.fazenda_id, v.local_id);
      };
      // local com cultura fixa (abacate, café) preenche a cultura sozinho
      campo('local_id').onchange = () => {
        v.local_id = campo('local_id').value;
        const l = q.por_id('locais', v.local_id);
        if (l && !v.fazenda_id) { v.fazenda_id = l.fazenda_id; campo('fazenda_id').value = l.fazenda_id; }
        if (l && l.cultura_id) { v.cultura_id = l.cultura_id; campo('cultura_id').value = l.cultura_id; }
      };
      const arq = sec.querySelector('[data-arq]');
      if (arq) arq.onchange = () => { addFotos(i, arq.files); arq.value = ''; };
      const zona = sec.querySelector('.rd-soltar');
      if (zona) {
        zona.ondragover = e => { e.preventDefault(); zona.classList.add('sobre'); };
        zona.ondragleave = () => zona.classList.remove('sobre');
        zona.ondrop = e => { e.preventDefault(); zona.classList.remove('sobre'); addFotos(i, e.dataTransfer.files); };
      }
    });
    caixa.querySelectorAll('[data-rem]').forEach(b => b.onclick = () => {
      const v = d.visitas[+b.dataset.rem];
      if ((v.informacoes || v.fotos.length) && !confirm('Remover esta visita e o que foi escrito nela?')) return;
      d.visitas.splice(+b.dataset.rem, 1);
      desenhar();
    });
    caixa.querySelectorAll('[data-tira]').forEach(b => b.onclick = () => {
      const [i, k] = b.dataset.tira.split(':').map(Number);
      d.visitas[i].fotos.splice(k, 1);
      desenhar();
    });
    caixa.querySelectorAll('img[data-foto]').forEach(async img => {
      const u = await urlFotoDiario(img.dataset.foto);
      if (u) img.src = u; else img.closest('.rd-foto').classList.add('sem');
    });
  }

  async function addFotos(i, lista) {
    const v = d.visitas[i];
    const arqs = [...lista].filter(f => /^image\/(jpe?g|png)$/i.test(f.type));
    if (!arqs.length) return aviso('Use fotos JPG ou PNG.', true);
    const cabe = MAX_FOTOS - v.fotos.length;
    if (arqs.length > cabe) aviso(`Cabem até ${MAX_FOTOS} fotos por visita.`, true);
    for (const f of arqs.slice(0, cabe)) {
      try {
        const caminho = await guardarFoto(f, BUCKET_DIARIO, d.id);
        urlsFoto.set(caminho, URL.createObjectURL(f));
        v.fotos.push(caminho);
      } catch (e) { console.error(e); aviso('Não consegui ler a foto ' + f.name, true); }
    }
    desenhar();
  }

  const obs = el.querySelector('#rd-obs');
  obs.oninput = () => { d.observacao_geral = obs.value; el.querySelector('#rd-obs-conta').textContent = `${obs.value.length}/${MAX_INFO}`; };

  el.querySelector('#rd-mais').onclick = () => {
    const ult = d.visitas[d.visitas.length - 1];
    d.visitas.push(Object.assign(visitaVazia(), { fazenda_id: ult ? ult.fazenda_id : '' }));
    desenhar();
    caixa.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (!novo) el.querySelector('#rd-voltar').onclick = () => irPara('diarios');

  /* Lançamento novo numa data que já tem relatório: oferece juntar tudo no
     mesmo relatório, levando as visitas que já foram digitadas aqui. */
  function conferirData() {
    const alvo = el.querySelector('#rd-existe');
    if (!novo) return;
    const dt = el.querySelector('#rd-data').value;
    const ja = diariosVisiveis().filter(x => x.data === dt && x.id !== d.id);
    alvo.innerHTML = ja.map(x => `<div class="rd-faixa rd-faixa-alerta">
      Já existe o relatório <b>${esc(x.codigo || 'aguardando envio')}</b> em ${br(dt)} (${esc(x.agronomo || '')},
      ${(x.visitas || []).length} visita${(x.visitas || []).length > 1 ? 's' : ''}).
      <button type="button" class="btn secundario" data-juntar="${x.id}">Acrescentar visitas nele</button></div>`).join('');
    alvo.querySelectorAll('[data-juntar]').forEach(b => b.onclick = () => {
      const preenchidas = d.visitas.filter(v => v.local_id || (v.informacoes || '').trim() || v.fotos.length);
      window.diarioEditando = q.por_id('diarios', b.dataset.juntar);
      if (preenchidas.length) window.diarioVisitasTrazidas = preenchidas; else window.diarioNovaVisita = true;
      irPara('diario');
    });
  }
  el.querySelector('#rd-data').addEventListener('change', conferirData);
  conferirData();

  async function salvar() {
    d.data = el.querySelector('#rd-data').value;
    d.agronomo = el.querySelector('#rd-agronomo').value.trim().replace(/\s+/g, ' ');
    if (!d.data) return aviso('Falta informar a data.', true), null;
    if (!d.agronomo) return aviso('Falta informar o agrônomo.', true), null;
    for (const [i, v] of d.visitas.entries()) {
      const n = d.visitas.length > 1 ? ` na visita ${i + 1}` : '';
      if (!v.fazenda_id) return aviso('Falta a fazenda' + n + '.', true), null;
      if (!v.local_id) return aviso('Falta o local / talhão' + n + '.', true), null;
      if (!v.cultura_id) return aviso('Falta a cultura' + n + '.', true), null;
      if (!(v.informacoes || '').trim()) return aviso('Faltam as informações' + n + '.', true), null;
      v.plantio = (v.plantio || '').trim();
      v.informacoes = v.informacoes.trim();
    }
    d.observacao_geral = el.querySelector('#rd-obs').value.trim();
    const agora = new Date().toISOString();
    d.ativo = true;
    d.atualizado_em = agora;
    if (App.usuario) d.atualizado_por = App.usuario.id;
    if (!d.criado_em) { d.criado_em = agora; d.criado_por = App.usuario ? App.usuario.id : null; }
    const reg = await gravar('diarios', d);
    aviso(novo ? 'Relatório diário salvo.' : 'Alterações salvas.');
    return reg;
  }

  el.querySelector('#rd-salvar').onclick = async () => {
    const r = await salvar();
    if (!r) return;
    await garantirCodigo(r);
    irPara('diarios');
  };
  el.querySelector('#rd-pdf').onclick = async () => {
    const r = await salvar();
    if (!r) return;
    abrirPdfDiario(r);
  };

  desenhar();
  if (rolarParaFim) setTimeout(() => caixa.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
};

/* locais só da fazenda escolhida (sem fazenda: todos, agrupados) */
function opcoesLocalDaFazenda(fazendaId, valor) {
  if (!fazendaId) return opcoesLocais(valor, 'Selecione');
  return opcoes(locaisOrdenados().filter(l => l.fazenda_id === fazendaId), valor, 'Selecione');
}

/* ---------------------------------------------------------------- histórico */

const filtroDiario = { de: '', ate: '', fazenda: '', agronomo: '', busca: '' };

TELAS.diarios = el => {
  const f = filtroDiario;
  if (!f.de) {
    const p = partes(hoje());
    f.de = montaData(p.ano, p.mes, 1);
    f.ate = montaData(p.ano, p.mes, diasNoMes(p.ano, p.mes));
  }
  const agronomos = [...new Set(diariosVisiveis().map(x => x.agronomo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el.innerHTML = `
    <h1>Histórico do Relatório Diário</h1>
    <p class="sub">Todos os relatórios lançados, com o código de cada um. Toque em <strong>Editar</strong> para corrigir, em <strong>+ Visita</strong> para acrescentar uma visita no mesmo relatório,
      ou em <strong>PDF / WhatsApp</strong> para enviar.</p>
    <div class="filtros pc-filtros">
      <label>De <input type="date" data-f="de" value="${esc(f.de)}"></label>
      <label>Até <input type="date" data-f="ate" value="${esc(f.ate)}"></label>
      <select data-f="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-f="agronomo">${opcoes(agronomos, f.agronomo, 'Todos os agrônomos')}</select>
      <input type="search" data-f="busca" value="${esc(f.busca)}" placeholder="Buscar código, local, texto…">
    </div>
    <div class="acoes"><button type="button" class="btn" id="rh-novo">+ Novo relatório diário</button></div>
    <div id="rh-lista"></div>`;

  el.querySelectorAll('[data-f]').forEach(c => {
    c.oninput = c.onchange = () => { f[c.dataset.f] = c.value; lista(); };
  });
  el.querySelector('#rh-novo').onclick = () => irPara('diario');

  function filtrados() {
    const b = f.busca.trim().toLowerCase();
    return diariosVisiveis().filter(d =>
      (!f.de || d.data >= f.de) && (!f.ate || d.data <= f.ate) &&
      (!f.agronomo || d.agronomo === f.agronomo) &&
      (!f.fazenda || (d.visitas || []).some(v => v.fazenda_id === f.fazenda)) &&
      (!b || [d.codigo, d.agronomo, br(d.data), ...(d.visitas || []).flatMap(v =>
        [q.nome('fazendas', v.fazenda_id), q.nome('locais', v.local_id), q.nome('culturas', v.cultura_id), v.plantio, v.informacoes]), d.observacao_geral]
        .filter(Boolean).join(' ').toLowerCase().includes(b))
    ).sort((a, b2) => b2.data.localeCompare(a.data) || String(b2.codigo || '~').localeCompare(String(a.codigo || '~')));
  }

  function lista() {
    const ls = filtrados();
    const nVis = ls.reduce((s, d) => s + (d.visitas || []).length, 0);
    const nFot = ls.reduce((s, d) => s + (d.visitas || []).reduce((t, v) => t + (v.fotos || []).length, 0), 0);
    el.querySelector('#rh-lista').innerHTML = `
      <div class="painel pc-ind">
        <div class="cartao"><b>${ls.length}</b><span>relatórios</span></div>
        <div class="cartao"><b>${nVis}</b><span>visitas</span></div>
        <div class="cartao"><b>${nFot}</b><span>fotos</span></div>
      </div>
      ${ls.length ? `<div class="rolagem"><table class="tabela pc-grade rd-tab"><thead><tr>
        <th>Código</th><th>Data</th><th>Agrônomo</th><th>Visitas</th><th class="ce">Fotos</th><th></th>
      </tr></thead><tbody>${ls.map(d => {
        const fotos = (d.visitas || []).reduce((t, v) => t + (v.fotos || []).length, 0);
        return `<tr>
          <td><span class="codigo">${d.codigo ? esc(d.codigo) : '<span class="pc-falta">aguardando envio</span>'}</span></td>
          <td>${br(d.data)}<br><small>${esc(diaSemana(d.data))}</small></td>
          <td>${esc(d.agronomo || '')}</td>
          <td>${(d.visitas || []).map(v => `<div class="rd-vis-lin"><b>${esc(q.nome('fazendas', v.fazenda_id))}</b> – ${esc(q.nome('locais', v.local_id))}
            <span class="pc-cor" style="background:${esc(corCultura(v.cultura_id))}"></span>${esc(q.nome('culturas', v.cultura_id))}${v.plantio ? ` · ${esc(v.plantio)}` : ''}</div>`).join('')}</td>
          <td class="ce">${fotos || '—'}</td>
          <td class="rd-acoes">
            <button type="button" class="btn neutro" data-abrir="${d.id}">Editar</button>
            <button type="button" class="btn" data-visita="${d.id}">+ Visita</button>
            <button type="button" class="btn secundario" data-pdf="${d.id}">PDF / WhatsApp</button>
            <button type="button" class="btn neutro pc-excluir" data-exc="${d.id}">Excluir</button>
          </td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr class="pc-total"><td colspan="6">Total: ${ls.length} relatório${ls.length === 1 ? '' : 's'} · ${nVis} visita${nVis === 1 ? '' : 's'}</td></tr></tfoot>
      </table></div>` : '<div class="vazio"><p>Nenhum relatório diário nesse período.</p></div>'}`;

    el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      window.diarioEditando = q.por_id('diarios', b.dataset.abrir);
      irPara('diario');
    });
    el.querySelectorAll('[data-visita]').forEach(b => b.onclick = () => {
      window.diarioEditando = q.por_id('diarios', b.dataset.visita);
      window.diarioNovaVisita = true;
      irPara('diario');
    });
    el.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => abrirPdfDiario(q.por_id('diarios', b.dataset.pdf)));
    el.querySelectorAll('[data-exc]').forEach(b => b.onclick = async () => {
      const d = q.por_id('diarios', b.dataset.exc);
      if (!confirm(`Excluir o relatório ${codigoDiario(d)} de ${br(d.data)}?`)) return;
      d.ativo = false;
      d.atualizado_em = new Date().toISOString();
      await gravar('diarios', d);
      aviso('Relatório excluído.');
      lista();
    });
  }
  lista();
};

/* ---------------------------------------------------------------- PDF */

/* letra branca em fundo escuro, cinza SAKUMA em fundo claro */
function corTextoSobre(hex) {
  const h = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map(k => parseInt(h.substr(k, 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? '#51534A' : '#FFFFFF';
}

async function dadosImagem(blob) {
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = url; });
  return dim ? { url, ...dim, tipo: blob.type.includes('png') ? 'PNG' : 'JPEG' } : null;
}

async function montarPdfDiario(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), A = doc.internal.pageSize.getHeight();
  const M = 12, W = L - 2 * M, BAIXO = A - 16;
  const emitido = new Date();
  const emitidoTxt = emitido.toLocaleDateString('pt-BR') + ' ' + emitido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sakuma = await imagemPdf('img/sakuma-logo.png');
  const lop = await imagemPdf('img/lop-marca.png');
  const cod = d.codigo || 'aguardando envio';

  /* ---- cabeçalho */
  const hLogo = 15, wLogo = hLogo * sakuma.w / sakuma.h;
  doc.addImage(sakuma.url, sakuma.tipo, M, 8, wLogo, hLogo);
  const xT = M + wLogo + 5;
  doc.setTextColor(COR.marrom); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  // título centralizado na folha
  doc.text('Relatório Diário', L / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
  doc.text('Registro das atividades de campo', L / 2, 19.3, { align: 'center' });
  // código e data à direita, discretos: sem quadro, letra pequena e cinza
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(COR.cinzaClaro);
  doc.text('Código ' + cod, L - M, 14, { align: 'right' });
  doc.text(br(d.data), L - M, 18.3, { align: 'right' });
  doc.setDrawColor(COR.verde); doc.setLineWidth(0.9);
  doc.line(M, 27, L - M, 27);

  /* ---- dados do dia */
  let y = 31;
  const grupos = gruposPorFazenda(d);
  const fazendas = grupos.map(g => g.nome);
  /* linha única com divisórias (opção B): rótulo pequeno, valor em destaque, detalhe embaixo */
  const nReg = (d.visitas || []).length;
  const diasSem = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const pd = partes(d.data);
  const colunas = [
    ['DATA', br(d.data), diasSem[new Date(pd.ano, pd.mes - 1, pd.dia).getDay()], 34],
    ['RESPONSÁVEL TÉCNICO', d.agronomo || '—', CARGO_AGRONOMO, 58],
    ['FAZENDAS', fazendas.join(' · ') || '—', `${fazendas.length} fazenda${fazendas.length === 1 ? '' : 's'}`, 66],
    ['REGISTROS', String(nReg), 'no dia', W - 158],
  ];
  // a coluna de fazendas pode quebrar em mais de uma linha quando são muitas
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const linhasCol = colunas.map(([, v, , w]) => doc.splitTextToSize(v, w - 6));
  const nLin = Math.max(...linhasCol.map(l => l.length));
  const altB = 14 + (nLin - 1) * 4.2;
  let xc = M;
  colunas.forEach(([rotulo, , detalhe, w], i) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(COR.cinzaClaro);
    doc.text(rotulo, xc, y + 3.5, { charSpace: 0.5 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COR.marrom);
    doc.text(linhasCol[i], xc, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(COR.cinza);
    doc.text(detalhe, xc, y + 9 + (linhasCol[i].length - 1) * 4.2 + 4);
    xc += w;
    if (i < colunas.length - 1) { doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.4); doc.line(xc - 4, y, xc - 4, y + altB); }
  });
  doc.setDrawColor(COR.verde); doc.setLineWidth(0.3); doc.line(M, y + altB + 3, L - M, y + altB + 3);
  y += altB + 9;

  const novaFolha = () => { doc.addPage(); y = 14; };

  /* ---- visitas, fazenda por fazenda */
  let i = -1;
  for (const [gi, g] of grupos.entries()) {
    // traço contínuo separando uma fazenda da outra
    if (gi > 0 && y <= BAIXO - 55) {
      doc.setDrawColor(COR.cinza); doc.setLineWidth(0.6);
      doc.line(M, y + 1, L - M, y + 1);
      y += 7;
    }
    // faixa da fazenda: tudo dela sai em sequência logo abaixo
    if (y > BAIXO - 55) novaFolha();
    doc.setFillColor(COR.verde);
    doc.rect(M, y, W, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(COR.branco);
    doc.text(g.nome.toUpperCase(), M + 3.5, y + 6.9);
    doc.setFontSize(9);
    doc.text(`${g.visitas.length} registro${g.visitas.length > 1 ? 's' : ''}`, L - M - 3.5, y + 6.6, { align: 'right' });
    y += 13;

  for (const [pos, v] of g.visitas.entries()) {
    i++;
    if (y > BAIXO - 40) novaFolha();
    // linha 1: "1. Registro · Lote 35 PADAP - Pivot 2 - Lote 35" (fazenda e local em destaque)
    doc.setFillColor(COR.verdeTotal); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.3);
    doc.rect(M, y, W, 8, 'FD');
    let x = M + 2.5;
    const escreve = (txt, estilo, tam, cor) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(cor);
      doc.text(txt, x, y + 5.4); x += doc.getTextWidth(txt);
    };
    escreve(`${i + 1}. Registro  ·  `, 'bold', 10.5, COR.cinza);
    escreve(g.nome, 'bold', 11.5, COR.marrom);
    escreve('  -  ', 'normal', 11, COR.cinza);
    escreve(q.nome('locais', v.local_id), 'bold', 11, COR.marrom);
    y += 8;
    // linha 2: "Cultura: Cenoura  -  Plantio: PL 27" (plantio só quando houver)
    doc.setFillColor(COR.branco);
    doc.rect(M, y, W, 7, 'FD');
    x = M + 2.5;
    const esc2 = (txt, estilo) => {
      doc.setFont('helvetica', estilo); doc.setFontSize(9.5); doc.setTextColor(estilo === 'bold' ? COR.marrom : COR.cinza);
      doc.text(txt, x, y + 4.8); x += doc.getTextWidth(txt);
    };
    esc2('Cultura: ', 'normal');
    // etiqueta com a cor da cultura (a mesma do cadastro e do painel)
    const nomeC = q.nome('culturas', v.cultura_id) || '—';
    const cor = (q.por_id('culturas', v.cultura_id) || {}).cor;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const wC = doc.getTextWidth(nomeC) + 5;
    if (cor) {
      doc.setFillColor(cor);
      doc.roundedRect(x, y + 1.2, wC, 4.8, 1.2, 1.2, 'F');
      doc.setTextColor(corTextoSobre(cor));
    } else doc.setTextColor(COR.marrom);
    doc.text(nomeC, x + 2.5, y + 4.8); x += wC;
    if (v.plantio) { esc2('   -   Plantio: ', 'normal'); esc2(v.plantio, 'bold'); }
    y += 7 + 4;

    // informações
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COR.marrom);
    if (y > BAIXO - 12) novaFolha();
    doc.text('Informações', M, y + 1); y += 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
    const linhas = doc.splitTextToSize(v.informacoes || '', W - 6);
    const hL = 4.4;
    let k = 0;
    while (k < linhas.length) {
      const cabem = Math.max(1, Math.floor((BAIXO - y - 5) / hL));
      const parte = linhas.slice(k, k + cabem);
      const alt = parte.length * hL + 4;
      doc.setFillColor(CINZA_BLOCO.caixa); doc.setDrawColor(CINZA_BLOCO.linha); doc.setLineWidth(0.25);
      doc.rect(M, y, W, alt, 'FD');
      doc.text(parte, M + 3, y + 4.8);
      y += alt; k += parte.length;
      if (k < linhas.length) novaFolha();
    }
    y += 4;

    // fotos: 3 por linha
    const fotos = [];
    for (const c of (v.fotos || [])) {
      const b = await blobFotoDiario(c);
      const img = b ? await dadosImagem(b) : null;
      if (img) fotos.push(img);
    }
    if (fotos.length) {
      const gap = 4, wF = (W - 2 * gap) / 3, hF = wF * 0.75;
      if (y > BAIXO - hF - 6) novaFolha();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(COR.marrom);
      doc.text(`Fotos (${fotos.length})`, M, y + 1); y += 3;
      fotos.forEach((img, n) => {
        const col = n % 3;
        if (col === 0 && n > 0) y += hF + gap;
        if (col === 0 && y + hF > BAIXO) novaFolha();
        const x = M + col * (wF + gap);
        doc.setFillColor(CINZA_BLOCO.caixa); doc.setDrawColor(CINZA_BLOCO.linha); doc.setLineWidth(0.25);
        doc.rect(x, y, wF, hF, 'FD');
        // encaixa a foto inteira na moldura, sem cortar
        const esc2 = Math.min(wF / img.w, hF / img.h);
        const w = img.w * esc2, h = img.h * esc2;
        doc.addImage(img.url, img.tipo, x + (wF - w) / 2, y + (hF - h) / 2, w, h, undefined, 'FAST');
      });
      y += hF + 6;
    }
    // linha pontilhada separando um registro do próximo da mesma fazenda
    if (pos < g.visitas.length - 1) {
      if (y > BAIXO - 6) novaFolha();
      else {
        doc.setDrawColor(COR.cinzaClaro); doc.setLineWidth(0.4);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.line(M, y + 1, L - M, y + 1);
        doc.setLineDashPattern([], 0);
        y += 7;
      }
    } else y += 2;
  }
  }

  /* ---- observação geral do dia, no fim do relatório (só quando preenchida) */
  const obsGeral = (d.observacao_geral || '').trim();
  if (obsGeral) {
    if (y > BAIXO - 30) novaFolha();
    else {
      doc.setDrawColor(COR.cinza); doc.setLineWidth(0.6);
      doc.line(M, y + 1, L - M, y + 1);
      y += 7;
    }
    doc.setFillColor(COR.cinza);
    doc.rect(M, y, W, 9, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(COR.branco);
    doc.text('OBSERVAÇÃO GERAL', M + 3.5, y + 6.2);
    y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
    const lObs = doc.splitTextToSize(obsGeral, W - 6);
    const hO = 4.4;
    let ko = 0;
    while (ko < lObs.length) {
      const cabem = Math.max(1, Math.floor((BAIXO - y - 5) / hO));
      const parte = lObs.slice(ko, ko + cabem);
      const alt = parte.length * hO + 4;
      doc.setFillColor(CINZA_BLOCO.caixa); doc.setDrawColor(CINZA_BLOCO.linha); doc.setLineWidth(0.25);
      doc.rect(M, y, W, alt, 'FD');
      doc.text(parte, M + 3, y + 4.8);
      y += alt; ko += parte.length;
      if (ko < lObs.length) novaFolha();
    }
  }

  /* sem assinatura no fim: o agrônomo já aparece no quadro do topo */

  /* ---- pé de todas as folhas */
  const total = doc.getNumberOfPages();
  const hLop = 7, wLop = hLop * lop.w / lop.h;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, A - 10, L - M, A - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(COR.cinzaClaro);
    doc.text(`SAKUMA Agronegócios · ${cod} · emitido em ${emitidoTxt}`, M, A - 4.5);
    doc.text(`Página ${p} de ${total}`, L / 2 + 14, A - 4.5, { align: 'center' });
    doc.setFontSize(7);
    const wFrase = doc.getTextWidth(FRASE_LOP);
    const xFrase = L - M - wFrase;
    const yImg = A - 8.6;
    doc.addImage(lop.url, lop.tipo, xFrase - 1.6 - wLop, yImg, wLop, hLop);
    doc.text(FRASE_LOP, xFrase, yImg + hLop * 0.725 + 0.85);
  }
  return doc;
}

/* ---------------------------------------------------------------- entrega */

async function abrirPdfDiario(d) {
  if (!d) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return aviso('O gerador de PDF não carregou. Abra o app com internet uma vez.', true);
  aviso('Montando o PDF…');
  await garantirCodigo(d);
  let doc;
  try { doc = await montarPdfDiario(d); }
  catch (e) { console.error(e); return aviso('Não consegui montar o PDF: ' + e.message, true); }
  const nome = nomeArquivoDiario(d).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_') + '.pdf';
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const msg = textoMensagem(d);

  abrirModal('Relatório Diário pronto', `
    <p class="sub"><strong>${esc(nome)}</strong><br>${esc(d.codigo || 'Código sai quando o registro subir (sem internet agora)')}
      · ${(d.visitas || []).length} visita(s)</p>
    <iframe class="pc-pdf" src="${url}" title="Prévia do relatório diário"></iframe>
    <div class="acoes">
      <button type="button" class="btn btn-zap" id="rd-zap"><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar pelo WhatsApp</button>
      <a class="btn btn-pdf" href="${url}" download="${esc(nome)}" id="rd-baixar">Baixar PDF</a>
      <button type="button" class="btn neutro" id="rd-imp">Imprimir</button>
    </div>`, corpo => {
    corpo.querySelector('#rd-imp').onclick = () => {
      const fr = corpo.querySelector('.pc-pdf');
      try { fr.contentWindow.focus(); fr.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }
    };
    corpo.querySelector('#rd-zap').onclick = async () => {
      const arq = new File([blob], nome, { type: 'application/pdf' });
      // celular: compartilha o PDF com a mensagem (escolher o WhatsApp na lista)
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: `Relatório Diário (${br(d.data)})`, text: msg }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      // computador: baixa o PDF e abre o WhatsApp com a mensagem para anexar
      corpo.querySelector('#rd-baixar').click();
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
      aviso('PDF baixado. Anexe o arquivo na conversa do WhatsApp.');
    };
  });
}

/* ---------------------------------------------------------------- configurações do diário */

TELAS['diario-config'] = el => {
  const atual = modeloMensagem();
  const exemplo = { data: hoje(), codigo: 'RD-2026-0001', agronomo: AGRONOMO_PADRAO,
    visitas: [{ fazenda_id: (fazendasOrdenadas()[0] || {}).id }] };
  el.innerHTML = `
    <h1>Configurações do Relatório Diário</h1>
    <p class="sub">Mensagem que vai junto com o PDF quando o relatório é enviado pelo WhatsApp. Vale para todos os aparelhos.</p>
    <div class="pc-cartao rd-cfg">
      <div class="campo"><label for="cfg-msg">Mensagem do WhatsApp</label>
        <textarea id="cfg-msg" rows="3" maxlength="500">${esc(atual)}</textarea>
        <p class="ajuda">Use os marcadores para o app completar sozinho:
          <code>{data}</code> data do relatório · <code>{codigo}</code> código RD ·
          <code>{agronomo}</code> nome do agrônomo · <code>{fazendas}</code> fazendas visitadas ·
          <code>{registros}</code> número de registros</p></div>
      <p class="rd-cfg-rot">Como vai sair:</p>
      <div class="rd-cfg-previa" id="cfg-previa"></div>
      <div class="acoes">
        <button type="button" class="btn" id="cfg-salvar">Salvar</button>
        <button type="button" class="btn neutro" id="cfg-padrao">Voltar ao padrão</button>
      </div>
    </div>`;
  const txt = el.querySelector('#cfg-msg');
  const previa = () => { el.querySelector('#cfg-previa').textContent = textoMensagem(exemplo, txt.value.trim() || MSG_PADRAO); };
  txt.oninput = previa; previa();
  el.querySelector('#cfg-padrao').onclick = () => { txt.value = MSG_PADRAO; previa(); };
  el.querySelector('#cfg-salvar').onclick = async () => {
    const valor = txt.value.trim() || MSG_PADRAO;
    await gravar('parametros', { chave: CHAVE_MSG, valor, atualizado_em: new Date().toISOString(),
                                 atualizado_por: App.usuario ? App.usuario.id : null });
    txt.value = valor; previa();
    aviso(App.online ? 'Mensagem salva.' : 'Mensagem salva no aparelho. Sobe quando a internet voltar.');
  };
};

Object.assign(window, { abrirPdfDiario, montarPdfDiario });
