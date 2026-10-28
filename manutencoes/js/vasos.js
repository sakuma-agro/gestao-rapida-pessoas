/* =====================================================================
   LOP - Gestão Rápida · Manutenções — VASOS DE PRESSÃO (28/10/2026)

   Pedido do Guilherme: cadastrar em cada vaso os dados técnicos da folha do
   laudo (fabricante, série, ano, capacidade, pressões, código de projeto,
   medidas, fluido, categoria) e ter o LIVRO DE REGISTRO de cada vaso — tudo
   o que foi feito nele, para imprimir e guardar junto do prontuário.

   Os dados ficam em equipamentos.dados_tecnicos.nr13 (o jsonb que já
   existia); série e ano usam as colunas próprias do bem. A categoria acerta
   sozinha o prazo dos exames NR-13 (tabela sem SPIE):
     I 1/3 anos · II 2/4 · III 3/6 · IV 4/8 · V 5/10  (externo/interno)
   ===================================================================== */

const CATEGORIA_NR13 = { I: [1, 3], II: [2, 4], III: [3, 6], IV: [4, 8], V: [5, 10] };

const CAMPOS_NR13 = [
  ['fabricante', 'Fabricante', 'text', 'SCHULZ'],
  ['capacidade', 'Capacidade do reservatório', 'text', '170 litros'],
  ['pressao_regime', 'Pressão de regime', 'text', '12,2 kgf/cm²'],
  ['pmta', 'PMTA', 'text', '13,0 kgf/cm²'],
  ['pressao_teste', 'Pressão teste hidrostático', 'text', '17,0 kgf/cm²'],
  ['codigo_projeto', 'Código do projeto', 'text', 'ASME Sec. VIII Div. 1 Ed 2021'],
  ['comprimento', 'Comprimento', 'text', '1350 mm'],
  ['diametro', 'Diâmetro', 'text', '850 mm'],
  ['fluido', 'Fluido', 'text', 'Ar comprimido'],
  ['inspetor', 'Empresa do laudo', 'text', 'Inspec Caldeiras'],
];

function ehVaso(e) {
  const t = e && q.por_id('tipos_equipamento', e.tipo_equipamento_id);
  return !!(t && t.grupo === 'vasos');
}
const nr13De = e => ((e && e.dados_tecnicos) || {}).nr13 || {};

/* ---------------------------------------------------------------- dados técnicos */

function formDadosVaso(idMaquina) {
  const e = q.por_id('equipamentos', idMaquina);
  if (!e) return;
  const d = nr13De(e);
  const pode = typeof ehAdmin === 'function' && ehAdmin();
  abrirModal('Dados técnicos — ' + e.codigo, `
    <p class="sub">${esc(e.descricao)} · como está na folha "Dados técnicos" do laudo NR-13.</p>
    <div class="colunas">
      ${campoTexto('Fabricante', 'fabricante', d.fabricante || '', 'text')}
      ${campoTexto('Série', 'numero_serie', e.numero_serie || '', 'text')}
      ${campoTexto('Ano de fabricação', 'ano_fabricacao', e.ano_fabricacao || '', 'number')}
      ${CAMPOS_NR13.slice(1).map(([k, rot]) => campoTexto(rot, k, d[k] || '', 'text')).join('')}
      ${campoLista('Categoria', 'categoria', Object.keys(CATEGORIA_NR13), d.categoria || '', '— não sei —')}
    </div>
    <p class="ajuda">A categoria acerta o prazo do exame interno (V: a cada 10 anos).</p>

    <h3 class="fm-titulo">Último laudo NR-13</h3>
    ${ultimoLaudo(e) ? `<p class="sub">Registrado: ${esc(resumoLaudo(ultimoLaudo(e)))}</p>` : ''}
    <div class="colunas">
      ${campoTexto('Data da inspeção', 'l_data', '', 'date')}
      ${campoTexto('Próxima inspeção (como está no laudo)', 'l_proxima', '', 'date', 'Se o laudo tiver justificativa técnica com prazo menor, use esse.')}
      ${campoLista('Tipo', 'l_tipo', ['Inicial', 'Periódica', 'Extraordinária'], 'Periódica', null)}
      ${campoLista('Situação', 'l_situacao', ['Aprovado', 'Não aprovado'], 'Aprovado', null)}
      ${campoTexto('Nº do relatório', 'l_relatorio', '', 'text')}
      ${campoTexto('ART', 'l_art', '', 'text')}
    </div>
    ${campoArea('Pendências do laudo', 'l_pendencias', '', 'O que o laudo mandou corrigir (ex.: recomendações do item 26).')}
    <label class="ff-item"><input type="checkbox" name="l_calibrou" checked> Válvula de segurança e manômetro foram calibrados nesta inspeção</label>
    <p class="ajuda">Preencha só quando tiver um laudo novo. Deixe a data em branco para salvar só os dados técnicos.</p>
    <div class="acoes">
      ${pode ? '<button type="button" class="btn" id="nv-salvar">Salvar</button>' : ''}
      <button type="button" class="btn neutro" id="nv-voltar">Voltar</button>
    </div>`, corpo => {
    corpo.querySelectorAll('input,select').forEach(x => { if (!pode) x.disabled = true; });
    corpo.querySelector('#nv-voltar').onclick = () => fichaMaquina(e.id);
    const bs = corpo.querySelector('#nv-salvar');
    if (bs) bs.onclick = async () => {
      const f = lerForm(corpo);
      const nr13 = {};
      CAMPOS_NR13.forEach(([k]) => { if (f[k]) nr13[k] = f[k]; });
      if (f.categoria) nr13.categoria = f.categoria;
      nr13.laudos = (d.laudos || []).slice();
      let laudo = null;
      if (f.l_data) {
        if (!f.l_proxima) return aviso('Informe a próxima inspeção que está no laudo.', true);
        if (f.l_proxima <= f.l_data) return aviso('A próxima inspeção tem que ser depois da data do laudo.', true);
        laudo = { data: f.l_data, proxima: f.l_proxima, tipo: f.l_tipo, situacao: f.l_situacao,
                  relatorio: f.l_relatorio || '', art: f.l_art || '', pendencias: f.l_pendencias || '',
                  empresa: f.inspetor || d.inspetor || '', calibrou: !!f.l_calibrou, registrado_em: new Date().toISOString() };
        nr13.laudos = nr13.laudos.filter(x => x.data !== laudo.data).concat(laudo).sort((a, b) => a.data.localeCompare(b.data));
      }
      const ano = f.ano_fabricacao ? parseInt(f.ano_fabricacao, 10) : null;
      const reg = limparBem(Object.assign({}, e, {
        numero_serie: f.numero_serie || null,
        ano_fabricacao: Number.isFinite(ano) ? ano : null,
        dados_tecnicos: Object.assign({}, e.dados_tecnicos || {}, { nr13 }),
        atualizado_em: new Date().toISOString()
      }));
      await gravar('equipamentos', reg);
      Object.assign(q.por_id('equipamentos', e.id) || {}, { horas_acumuladas: e.horas_acumuladas, km_acumulados: e.km_acumulados });

      /* Vencimentos: o laudo manda. O exame externo vence na "próxima
         inspeção" do laudo; o interno pela categoria; válvula e manômetro
         contam da data do laudo quando foram calibrados nele. */
      const anos = CATEGORIA_NR13[f.categoria];
      const ult = laudo || ultimoLaudo({ dados_tecnicos: { nr13 } });
      for (const p of q.ativos('planos_manutencao').filter(x => x.equipamento_id === e.id)) {
        const nome = q.nome('tipos_manutencao', p.tipo_manutencao_id);
        const muda = {};
        if (/EXAME EXTERNO/.test(nome)) {
          if (ult) Object.assign(muda, { ultima_troca_data: ult.data, periodicidade_dias: diasEntre(ult.data, ult.proxima) });
          else if (anos) muda.periodicidade_dias = anos[0] * 365;
        } else if (/EXAME INTERNO/.test(nome)) {
          if (anos) muda.periodicidade_dias = anos[1] * 365;
          if (laudo && laudo.tipo === 'Inicial') muda.ultima_troca_data = laudo.data;
        } else if (laudo && laudo.calibrou && /CALIBRAÇÃO DO MANÔMETRO|VÁLVULA DE SEGURANÇA/.test(nome)) {
          if (!p.ultima_troca_data || laudo.data >= p.ultima_troca_data) muda.ultima_troca_data = laudo.data;
        }
        if (Object.keys(muda).some(k => String(p[k] ?? '') !== String(muda[k])))
          await gravar('planos_manutencao', Object.assign(p, muda));
      }
      aviso('Dados técnicos salvos.');
      fichaMaquina(e.id);
    };
  });
}

function ultimoLaudo(e) {
  const l = (nr13De(e).laudos || []);
  return l.length ? l[l.length - 1] : null;
}
function resumoLaudo(l) {
  return [formatarData(l.data), l.tipo, l.situacao, 'próxima ' + formatarData(l.proxima),
          l.relatorio ? 'relatório ' + l.relatorio : '', l.art ? 'ART ' + l.art : ''].filter(Boolean).join(' · ');
}
/* Aviso para a ficha: laudo não aprovado ou vencendo. */
function alertaLaudo(e) {
  const l = ultimoLaudo(e);
  if (!l) return ehVaso(e) ? '<p class="lv-alerta">Sem laudo NR-13 cadastrado. Toque em Dados técnicos NR-13 para lançar.</p>' : '';
  const falta = diasEntre(hoje(), l.proxima);
  const partes = [];
  if (l.situacao === 'Não aprovado') partes.push('<b>Laudo de ' + formatarData(l.data) + ': NÃO APROVADO.</b> ' + esc(l.pendencias || 'Ver as recomendações do laudo.'));
  if (falta < 0) partes.push('<b>Inspeção NR-13 vencida</b> desde ' + formatarData(l.proxima) + '.');
  else if (falta <= 60) partes.push('<b>Inspeção NR-13 vence em ' + falta + (falta === 1 ? ' dia' : ' dias') + '</b> (' + formatarData(l.proxima) + ').');
  return partes.length ? '<p class="lv-alerta">' + partes.join(' ') + '</p>' : '';
}

/* ---------------------------------------------------------------- livro de registro */

function livroVaso(idMaquina) {
  const e = q.por_id('equipamentos', idMaquina);
  if (!e) return;
  const d = nr13De(e);
  const linha = (rot, v) => `<div class="lv-dado"><span>${rot}</span><b>${v ? esc(v) : '—'}</b></div>`;

  // tudo o que foi feito: preventivas (manutencoes) e corretivas concluídas
  const regs = [
    ...q.todos('manutencoes').filter(m => m.equipamento_id === e.id).map(m => {
      const os = m.os_id ? q.por_id('ordens_servico', m.os_id) : null;
      return { data: m.data_manutencao, servico: q.nome('tipos_manutencao', m.tipo_manutencao_id),
               obs: m.observacao || '', os: os && os.numero ? os.numero : '' };
    }),
    ...q.todos('ordens_servico').filter(o => o.equipamento_id === e.id && o.tipo === 'CORRETIVA' && o.status === 'CONCLUIDA')
      .map(o => ({ data: o.data_execucao, servico: 'Corretiva: ' + (o.descricao || ''),
                   obs: [o.executado_por ? 'Feito por ' + o.executado_por : '', o.observacao || ''].filter(Boolean).join(' · '), os: o.numero || '' })),
  ].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));

  const planos = q.ativos('planos_manutencao').filter(p => p.equipamento_id === e.id)
    .map(p => ({ p, c: calcular(p) }))
    .sort((a, b) => String(a.c.proxima_data || '9').localeCompare(String(b.c.proxima_data || '9')));

  const html = `
    <div id="os-impresso" class="os-folha lv-folha">
      <header class="os-cab">
        <img src="../img/sakuma-logo.png" alt="SAKUMA Agronegócios" class="os-logo">
        <div class="os-titulo"><h2>Livro de registro</h2><span class="os-tipo prev">Vaso de pressão · NR-13</span></div>
        <div class="os-numero"><span>Vaso</span><b>${esc(e.codigo)}</b><small>${esc(q.nome('locais', e.local_id) || '')}</small></div>
      </header>

      <section class="os-bloco">
        <h3>Dados técnicos <small>${esc(e.descricao)}</small></h3>
        <div class="lv-dados">
          ${linha('Fabricante', d.fabricante)}
          ${linha('Série', e.numero_serie)}
          ${linha('Ano de fabricação', e.ano_fabricacao)}
          ${linha('Capacidade', d.capacidade)}
          ${linha('Pressão de regime', d.pressao_regime)}
          ${linha('PMTA', d.pmta)}
          ${linha('Pressão teste hidrostático', d.pressao_teste)}
          ${linha('Código do projeto', d.codigo_projeto)}
          ${linha('Comprimento', d.comprimento)}
          ${linha('Diâmetro', d.diametro)}
          ${linha('Fluido', d.fluido)}
          ${linha('Categoria', d.categoria ? '"' + d.categoria + '"' : '')}
        </div>
      </section>

      <section class="os-bloco">
        <h3>Laudos NR-13</h3>
        <table class="os-tab"><thead><tr><th>Data</th><th>Tipo</th><th>Situação</th><th>Relatório / ART</th><th>Próxima</th></tr></thead><tbody>
        ${(d.laudos || []).length ? d.laudos.map(l => `<tr><td>${formatarData(l.data)}</td><td>${esc(l.tipo || '')}</td>
          <td><b>${esc(l.situacao || '')}</b>${l.pendencias ? '<small class="os-como">' + esc(l.pendencias) + '</small>' : ''}</td>
          <td>${esc([l.relatorio, l.art].filter(Boolean).join(' · '))}</td><td>${formatarData(l.proxima)}</td></tr>`).join('')
          : '<tr><td colspan="5"><i>Nenhum laudo cadastrado.</i></td></tr>'}
        </tbody></table>
      </section>

      <section class="os-bloco">
        <h3>Próximos vencimentos</h3>
        <table class="os-tab"><thead><tr><th>Serviço</th><th>A cada</th><th>Última</th><th>Próxima</th></tr></thead><tbody>
        ${planos.map(({ p, c }) => `<tr>
          <td><b>${esc(q.nome('tipos_manutencao', p.tipo_manutencao_id))}</b></td>
          <td>${esc(periodicidadeTexto(p, e))}</td>
          <td>${p.ultima_troca_data ? formatarData(p.ultima_troca_data) : '—'}</td>
          <td>${c.proxima_data ? formatarData(c.proxima_data) : 'falta a última data'}</td></tr>`).join('')}
        </tbody></table>
      </section>

      <section class="os-bloco">
        <h3>Registro das manutenções <small>${regs.length} ${regs.length === 1 ? 'registro' : 'registros'}</small></h3>
        <table class="os-tab"><thead><tr><th style="width:14%">Data</th><th>Serviço</th><th>Observação</th><th style="width:10%">OS</th></tr></thead><tbody>
        ${regs.length ? regs.map(r => `<tr><td>${formatarData(r.data)}</td><td>${esc(r.servico)}</td><td>${esc(r.obs)}</td><td>${esc(r.os)}</td></tr>`).join('')
          : '<tr><td colspan="4"><i>Nenhuma manutenção registrada no app ainda.</i></td></tr>'}
        ${'<tr class="lv-branca"><td></td><td></td><td></td><td></td></tr>'.repeat(4)}
        </tbody></table>
      </section>

      <footer class="os-pe">
        <img src="../img/lop-marca.png" alt="LOP">
        <span>Inteligência para o agronegócio</span>
      </footer>
    </div>
    <div class="acoes">
      <button type="button" class="btn btn-pdf" id="lv-imprimir">Imprimir</button>
      <button type="button" class="btn neutro" id="lv-voltar">Voltar</button>
    </div>`;

  abrirModal('Livro de registro — ' + e.codigo, html, corpo => {
    corpo.querySelector('#lv-voltar').onclick = () => fichaMaquina(e.id);
    corpo.querySelector('#lv-imprimir').onclick = () => {
      document.body.classList.add('imprimindo-os');
      window.print();
      setTimeout(() => document.body.classList.remove('imprimindo-os'), 500);
    };
  });
}

Object.assign(window, { ehVaso, formDadosVaso, livroVaso, alertaLaudo, CATEGORIA_NR13 });
