/* =====================================================================
   LOP - Gestão Rápida · Manutenções — LAUDOS (28/10/2026)

   Pedido do Guilherme: além dos vasos, ter os laudos de todas as máquinas
   (avaliação NR-12/NR-31 dos tratores), dos veículos (inspeção veicular do
   transporte coletivo, DER-MG) e dos tanques de diesel, com o vencimento de
   cada um aparecendo como manutenção.

   Cada laudo fica em equipamentos.dados_tecnicos.laudos[]:
     { tipo_id, data, proxima, situacao, relatorio, art, empresa, pendencias }
   e "puxa" o plano do mesmo tipo da máquina: última = data do laudo,
   periodicidade = até a próxima. É assim que o vencimento entra nas
   Preventivas, no Calendário e na Planilha sem nada novo nessas telas.

   Os laudos NR-13 dos vasos/tanques continuam no formulário "Dados técnicos
   NR-13" (dados_tecnicos.nr13.laudos) — aqui eles só aparecem na lista.
   ===================================================================== */

/* Tipos de manutenção que são laudo (empresa contratada). */
function tiposLaudo() {
  return q.ativos('tipos_manutencao')
    .filter(t => t.terceirizado && /LAUDO|INSPEÇÃO NR-13|NR-13 EXAME EXTERNO/i.test(t.nome))
    .sort((a, b) => (Number(a.ordem) || 999) - (Number(b.ordem) || 999));
}

const laudosGerais = e => (((e && e.dados_tecnicos) || {}).laudos || []);

/* Todos os laudos da máquina, do mais novo para o mais antigo. */
function todosLaudos(e) {
  const nr13 = (((e && e.dados_tecnicos) || {}).nr13 || {}).laudos || [];
  const tipoNr13 = q.ativos('tipos_manutencao').find(t => /TANQUE · INSPEÇÃO|NR-13 EXAME EXTERNO/.test(t.nome) &&
    q.ativos('planos_manutencao').some(p => p.equipamento_id === e.id && p.tipo_manutencao_id === t.id));
  return [
    ...laudosGerais(e).map(l => Object.assign({ nome: q.nome('tipos_manutencao', l.tipo_id) }, l)),
    ...nr13.map(l => Object.assign({ nome: (tipoNr13 && tipoNr13.nome) || 'NR-13', nr13: true }, l)),
  ].sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/* O mais recente de cada tipo — é ele que vale. */
function laudosVigentes(e, todos) {
  const vistos = new Set();
  return (todos || todosLaudos(e)).filter(l => { const k = l.nome; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

function situacaoLaudo(l) {
  const falta = diasEntre(hoje(), l.proxima);
  if (falta < 0) return { cls: 'urgente', txt: 'VENCIDO', det: 'desde ' + formatarData(l.proxima) };
  if (falta <= 60) return { cls: 'atencao', txt: 'VENCE EM ' + falta + (falta === 1 ? ' DIA' : ' DIAS'), det: formatarData(l.proxima) };
  return { cls: 'ok', txt: 'EM DIA', det: 'até ' + formatarData(l.proxima) };
}

/* Bloco da ficha da máquina. */
function blocoLaudos(e) {
  const todos = todosLaudos(e);
  const vig = laudosVigentes(e, todos);
  const pode = typeof ehAdmin === 'function' && ehAdmin();
  const alerta = vig.filter(l => l.situacao === 'Não aprovado' || diasEntre(hoje(), l.proxima) < 0);
  return `
    <h2 class="fm-titulo">Laudos ${pode ? '<button type="button" class="btn" id="fm-laudo">+ Laudo</button>' : ''}</h2>
    ${alerta.length && !(window.ehVaso && ehVaso(e)) ? `<p class="lv-alerta">${alerta.map(l =>
      '<b>' + esc(l.nome) + ':</b> ' + (l.situacao === 'Não aprovado' ? 'NÃO APROVADO' + (l.pendencias ? ' — ' + esc(l.pendencias) : '') + '. ' : '') +
      (diasEntre(hoje(), l.proxima) < 0 ? 'Vencido desde ' + formatarData(l.proxima) + '.' : '')).join('<br>')}</p>` : ''}
    ${vig.length === 0 ? '<p class="sub">Nenhum laudo cadastrado.</p>' : `<table class="tabela"><thead><tr>
      <th>Laudo</th><th>Data</th><th>Resultado</th><th>Vence</th><th>Situação</th></tr></thead><tbody>` +
      todos.map(l => { const s = situacaoLaudo(l); const vale = vig.includes(l);
        return `<tr${vale ? '' : ' class="lv-antigo"'}>
          <td><strong>${esc(l.nome)}</strong><small>${esc([l.empresa, l.relatorio ? 'nº ' + l.relatorio : '', l.art ? 'ART ' + l.art : ''].filter(Boolean).join(' · '))}</small></td>
          <td>${formatarData(l.data)}</td>
          <td>${esc(l.situacao || '')}${l.pendencias ? '<small>' + esc(l.pendencias) + '</small>' : ''}</td>
          <td>${formatarData(l.proxima)}</td>
          <td>${vale ? '<span class="etq ' + s.cls + '">' + s.txt + '</span>' : '<small>substituído</small>'}</td></tr>`; }).join('') +
      '</tbody></table>'}`;
}

/* + Laudo: lança um laudo novo e acerta o vencimento. */
function formLaudo(idMaquina) {
  const e = q.por_id('equipamentos', idMaquina);
  if (!e) return;
  const tipos = tiposLaudo().filter(t => !/NR-13 EXAME EXTERNO/.test(t.nome));
  if (!tipos.length) return aviso('Nenhum tipo de laudo cadastrado.', true);
  abrirModal('Novo laudo — ' + e.codigo, `
    <p class="sub">${esc(e.descricao)}</p>
    ${window.ehVaso && ehVaso(e) && !ehTanque(e) ? '<p class="ajuda">Laudo NR-13 do vaso: lance em <b>Dados técnicos NR-13</b>.</p>' : ''}
    <div class="colunas">
      ${campoLista('Tipo de laudo', 'tipo_id', tipos.map(t => ({ id: t.id, nome: t.nome })), tipos[0].id, null)}
      ${campoTexto('Data do laudo', 'data', '', 'date')}
      ${campoTexto('Vence em', 'proxima', '', 'date', 'A data que está no laudo. Se ele não disser, use a regra da empresa.')}
      ${campoLista('Resultado', 'situacao', ['Aprovado', 'Não aprovado'], 'Aprovado', null)}
      ${campoTexto('Empresa / responsável', 'empresa', '', 'text')}
      ${campoTexto('Nº do laudo / relatório', 'relatorio', '', 'text')}
      ${campoTexto('ART', 'art', '', 'text')}
    </div>
    ${campoArea('Pendências', 'pendencias', '', 'O que o laudo mandou corrigir.')}
    <div class="acoes">
      <button type="button" class="btn" id="lf-salvar">Salvar</button>
      <button type="button" class="btn neutro" id="lf-voltar">Voltar</button>
    </div>`, corpo => {
    corpo.querySelector('#lf-voltar').onclick = () => fichaMaquina(e.id);
    corpo.querySelector('#lf-salvar').onclick = async () => {
      const f = lerForm(corpo);
      if (!f.data || !f.proxima) return aviso('Informe a data do laudo e quando vence.', true);
      if (f.proxima <= f.data) return aviso('O vencimento tem que ser depois da data do laudo.', true);
      const l = { tipo_id: f.tipo_id, data: f.data, proxima: f.proxima, situacao: f.situacao, empresa: f.empresa || '',
                  relatorio: f.relatorio || '', art: f.art || '', pendencias: f.pendencias || '', registrado_em: new Date().toISOString() };
      const lista = laudosGerais(e).filter(x => !(x.tipo_id === l.tipo_id && x.data === l.data)).concat(l)
        .sort((a, b) => a.data.localeCompare(b.data));
      await gravar('equipamentos', limparBem(Object.assign({}, e, {
        dados_tecnicos: Object.assign({}, e.dados_tecnicos || {}, { laudos: lista }), atualizado_em: new Date().toISOString() })));
      Object.assign(q.por_id('equipamentos', e.id) || {}, { horas_acumuladas: e.horas_acumuladas, km_acumulados: e.km_acumulados });
      await acertarPlanoDoLaudo(e, l);
      aviso('Laudo salvo. Vencimento: ' + formatarData(l.proxima) + '.');
      fichaMaquina(e.id);
    };
  });
}

/* O laudo mais novo daquele tipo vira a "última" do plano; cria o plano se não houver. */
async function acertarPlanoDoLaudo(e, l) {
  const dias = diasEntre(l.data, l.proxima);
  let p = q.todos('planos_manutencao').find(x => x.equipamento_id === e.id && x.tipo_manutencao_id === l.tipo_id);
  if (p && p.ultima_troca_data && p.ultima_troca_data > l.data && p.ativo !== false) return;
  p = Object.assign(p || { id: crypto.randomUUID(), equipamento_id: e.id, tipo_manutencao_id: l.tipo_id },
    { ultima_troca_data: l.data, periodicidade_dias: dias, periodicidade_horas: null, ativo: true });
  await gravar('planos_manutencao', p);
}

Object.assign(window, { blocoLaudos, formLaudo, todosLaudos, laudosVigentes, tiposLaudo });
