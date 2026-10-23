// relatorio.js — relatório de status, relatórios de progresso salvos e documentos
// impressos (termo de abertura, dicionário da EAP, termo de aceite e encerramento) (23/10/2026).
// Padrão das folhas do LOP: logo da SAKUMA no alto, marca da LOP só no pé,
// sem nome de quem emitiu. O PDF do WhatsApp segue o padrão SAKUMA.
import { $, esc, gravar, aviso, meuNome, doProjeto, dataBR, hojeISO, pct, num, reais, nomeFase, SITUACOES,
  semaforos, dominios, NOME_COR, nivelNum, nivelRisco, NOME_NIVEL, linhas, CHECKLIST_ENC, somarDias, rede, estrategiaParte, NIVEL3 } from './dados.js';
import { montarPdf, enviarWhatsapp, rodapeLop, botaoZap } from './pdf.js';

const sem = cor => `<span class="rel-sem ${cor}"></span>`;
const br = s => esc(s || '').replace(/\n/g, '<br>');
const topo = (titulo, sub) => `<header class="rel-topo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios"><div class="rel-tit"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></div></header>`;
const folha = (miolo) => `<div class="rel folha">${miolo}${rodapeLop()}</div>`;

/** Mostra a folha e imprime; depois limpa (para não ficar a prévia na tela). */
function imprimirFolha(html, manter = false) {
  const alvo = $('pjFolha');
  alvo.innerHTML = html;
  const limpar = () => { if (!manter) alvo.innerHTML = ''; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  setTimeout(() => window.print(), 200);
}

/* ============================== dados do relatório de status ============================== */
function dadosStatus(r) {
  const s = semaforos(r);
  const hoje = hojeISO();
  const marcos = r.arv.filter(i => i.tipo === 'marco' || i.tipo === 'entrega')
    .filter(i => i.fim).sort((a, b) => String(a.fim).localeCompare(String(b.fim)));
  const proximos = marcos.filter(i => r.calc[i.id].pct < 1 && i.fim <= somarDias(hoje, 45)).slice(0, 8);
  const riscos = r.riscosAbertos.slice().sort((a, b) => nivelNum(b) - nivelNum(a)).slice(0, 5);
  const mud = r.mudancas.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 5);
  const dom = dominios(r);
  return { s, marcos, proximos, riscos, mud, dom };
}

export function folhaStatus(r, extra = {}) {
  const p = r.p, d = dadosStatus(r);
  const sub = `${p.codigo || ''} · ${nomeFase(p.fase)} · ${SITUACOES[p.situacao] || ''} · situação em ${dataBR(extra.data || hojeISO())}`;
  return folha(`
    ${topo('Relatório de status do projeto', p.nome)}
    <p class="rel-sub">${esc(sub)}${p.gerente ? ' · gerente do projeto: ' + esc(p.gerente) : ''}${p.patrocinador ? ' · patrocinador: ' + esc(p.patrocinador) : ''}</p>
    <div class="rel-kpis">
      <div><span>Avanço físico</span><b>${pct(r.fisico)}</b></div>
      <div><span>Planejado hoje</span><b>${pct(r.planejado)}</b></div>
      <div><span>Término previsto</span><b>${dataBR(p.fim_previsto)}</b></div>
      <div><span>Realizado / orçado</span><b>${reais(r.custoReal)}</b><small>de ${reais(p.orcamento)}</small></div>
      <div><span>IDP · IDC</span><b>${r.spi == null ? '—' : num(r.spi)} · ${r.cpi == null ? '—' : num(r.cpi)}</b></div>
    </div>
    <div class="rel-dupla">
      <div><h3 class="rel-secao">Restrição tripla</h3>
        <table class="rel-tab"><tbody>
          <tr><td>${sem(d.s.prazo)} <b>Prazo</b></td><td>${NOME_COR[d.s.prazo]} · ${r.atrasadas.length} atrasada(s)${p.fim_base && p.fim_base !== p.fim_previsto ? ' · linha de base ' + dataBR(p.fim_base) : ''}</td></tr>
          <tr><td>${sem(d.s.custo)} <b>Custo</b></td><td>${NOME_COR[d.s.custo]} · ${p.orcamento ? pct(r.custoReal / p.orcamento) + ' do orçamento' : 'sem orçamento'}</td></tr>
          <tr><td>${sem(d.s.escopo)} <b>Escopo</b></td><td>${NOME_COR[d.s.escopo]} · ${r.mudPend.length} mudança(s) pendente(s)</td></tr>
        </tbody></table></div>
      <div><h3 class="rel-secao">Saúde por domínio (PMBOK)</h3>
        <table class="rel-tab"><tbody>${d.dom.map(([n, c, t]) => `<tr><td>${sem(c)} <b>${esc(n)}</b></td><td>${esc(t)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <h3 class="rel-secao">Entregas e marcos</h3>
    ${!d.marcos.length ? '<p class="rel-vazio">Sem entregas ou marcos com prazo.</p>' : `<table class="rel-tab"><thead><tr><th>EAP</th><th>Entrega / marco</th><th>Responsável</th><th>Prazo</th><th class="dir">Avanço</th><th>Aceite</th></tr></thead>
      <tbody>${d.marcos.slice(0, 14).map(i => `<tr><td>${i._cod}</td><td>${i.tipo === 'marco' ? '◆ ' : ''}${esc(i.nome)}</td><td>${esc(i.responsavel || '')}</td><td>${dataBR(i.fim)}</td><td class="dir">${pct(r.calc[i.id].pct)}</td><td>${i.tipo === 'entrega' ? ({ pendente: 'pendente', aceita: 'aceita', recusada: 'recusada' }[i.aceite_situacao || 'pendente']) : ''}</td></tr>`).join('')}</tbody></table>`}
    ${r.atrasadas.length ? `<h3 class="rel-secao">Tarefas atrasadas</h3><table class="rel-tab"><thead><tr><th>EAP</th><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th class="dir">Feito</th></tr></thead>
      <tbody>${r.atrasadas.map(i => `<tr><td>${i._cod}</td><td>${esc(i.nome)}</td><td>${esc(i.responsavel || '')}</td><td>${dataBR(i.fim)}</td><td class="dir">${Number(i.pct || 0)}%</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.riscos.length ? `<h3 class="rel-secao">Principais riscos em aberto</h3><table class="rel-tab"><thead><tr><th>Risco</th><th class="ce">Nível</th><th>Resposta</th><th>Dono</th></tr></thead>
      <tbody>${d.riscos.map(x => `<tr><td>${esc(x.descricao)}</td><td class="ce">${nivelNum(x)} · ${NOME_NIVEL[nivelRisco(x)]}</td><td>${esc([x.estrategia, x.plano].filter(Boolean).join(': '))}</td><td>${esc(x.dono || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.mud.length ? `<h3 class="rel-secao">Mudanças</h3><table class="rel-tab"><thead><tr><th class="ce">Nº</th><th>Mudança</th><th class="dir">Prazo</th><th class="dir">Custo</th><th>Situação</th></tr></thead>
      <tbody>${d.mud.map(m => `<tr><td class="ce">${m.numero || ''}</td><td>${esc(m.descricao)}</td><td class="dir">${m.impacto_prazo_dias ? m.impacto_prazo_dias + ' d' : '—'}</td><td class="dir">${m.impacto_custo ? reais(m.impacto_custo) : '—'}</td><td>${esc(m.situacao)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${extra.comentario ? `<h3 class="rel-secao">Comentário do período</h3><p class="rel-texto">${br(extra.comentario)}</p>` : ''}
    ${extra.proximos_passos ? `<h3 class="rel-secao">Próximos passos</h3><p class="rel-texto">${br(extra.proximos_passos)}</p>` : ''}`);
}

function pdfStatus(r, extra) {
  const p = r.p, d = dadosStatus(r);
  const secoes = [
    { titulo: 'Restrição tripla e domínios de desempenho', head: ['Dimensão', 'Situação', 'Detalhe'],
      body: [['Prazo', NOME_COR[d.s.prazo], r.atrasadas.length + ' tarefa(s) atrasada(s)'], ['Custo', NOME_COR[d.s.custo], p.orcamento ? pct(r.custoReal / p.orcamento) + ' do orçamento' : '—'],
        ['Escopo', NOME_COR[d.s.escopo], r.mudPend.length + ' mudança(s) pendente(s)'], ...d.dom.map(([n, c, t]) => [n, NOME_COR[c], t])] },
  ];
  if (d.marcos.length) secoes.push({ titulo: 'Entregas e marcos', head: ['EAP', 'Entrega / marco', 'Responsável', 'Prazo', 'Avanço'], dir: [4],
    body: d.marcos.slice(0, 14).map(i => [i._cod, i.nome, i.responsavel || '', dataBR(i.fim), pct(r.calc[i.id].pct)]) });
  if (r.atrasadas.length) secoes.push({ titulo: 'Tarefas atrasadas', head: ['EAP', 'Tarefa', 'Responsável', 'Prazo', 'Feito'], dir: [4],
    body: r.atrasadas.map(i => [i._cod, i.nome, i.responsavel || '', dataBR(i.fim), Number(i.pct || 0) + '%']) });
  if (d.riscos.length) secoes.push({ titulo: 'Principais riscos em aberto', head: ['Risco', 'Nível', 'Resposta', 'Dono'],
    body: d.riscos.map(x => [x.descricao, nivelNum(x) + ' · ' + NOME_NIVEL[nivelRisco(x)], [x.estrategia, x.plano].filter(Boolean).join(': '), x.dono || '']) });
  if (extra.comentario) secoes.push({ titulo: 'Comentário do período', head: ['Comentário'], body: [[extra.comentario]] });
  if (extra.proximos_passos) secoes.push({ titulo: 'Próximos passos', head: ['Próximos passos'], body: [[extra.proximos_passos]] });
  return {
    titulo: 'Relatório de status do projeto',
    subtitulo: `${p.codigo || ''} · ${p.nome} · ${nomeFase(p.fase)} · ${dataBR(hojeISO())}`,
    kpis: [['Avanço físico', pct(r.fisico)], ['Planejado', pct(r.planejado)], ['Término', dataBR(p.fim_previsto)], ['Realizado', reais(r.custoReal)], ['IDP · IDC', (r.spi == null ? '—' : num(r.spi)) + ' · ' + (r.cpi == null ? '—' : num(r.cpi))]],
    secoes, arquivo: 'Status ' + (p.codigo || '') + ' ' + p.nome + ' ' + hojeISO(),
  };
}

/* ============================== aba Relatório ============================== */
let rascunho = {};      // comentário e próximos passos digitados (por projeto, só na sessão)
export function abaRelatorio(alvo, r, redesenhar) {
  const p = r.p, pid = p.id;
  const rs = rascunho[pid] || (rascunho[pid] = { comentario: '', proximos_passos: '' });
  const hist = doProjeto('pj_status', pid).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Relatório de status</h4>
      <p class="dc-sem">Folha para imprimir ou mandar no WhatsApp. "Salvar relatório de progresso" guarda a fotografia de hoje no histórico.</p></div>
      <div class="barra">${botaoZap('pjRelZap')}<button class="btn" type="button" id="pjRelImp">Imprimir</button><button class="btn principal" type="button" id="pjRelSalvar">Salvar relatório de progresso</button></div></div>
    <div class="grade larga">
      <label class="campo">Comentário do período<textarea id="pjRelCom" rows="3" placeholder="o que aconteceu desde o último relatório">${esc(rs.comentario)}</textarea></label>
      <label class="campo">Próximos passos<textarea id="pjRelProx" rows="3">${esc(rs.proximos_passos)}</textarea></label>
    </div>
    ${hist.length ? `<h4 class="pj-sub-tit">Relatórios de progresso salvos</h4>
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Data</th><th>Fase</th><th class="dir">Físico</th><th class="dir">Planejado</th><th class="dir">Custo real</th><th class="dir">IDP</th><th class="dir">IDC</th><th>Comentário</th></tr></thead>
      <tbody>${hist.map(h => `<tr><td>${dataBR(h.data)}</td><td>${esc(nomeFase(h.fase))}</td><td class="dir">${pct(h.pct_fisico)}</td><td class="dir">${pct(h.pct_planejado)}</td><td class="dir">${reais(h.custo_real)}</td>
        <td class="dir">${h.spi == null ? '—' : num(h.spi)}</td><td class="dir">${h.cpi == null ? '—' : num(h.cpi)}</td><td>${esc(h.comentario || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  const ler = () => { rs.comentario = $('pjRelCom').value.trim(); rs.proximos_passos = $('pjRelProx').value.trim(); return rs; };
  const prev = () => { $('pjFolha').innerHTML = folhaStatus(r, ler()); };
  prev();
  $('pjRelCom').addEventListener('input', prev);
  $('pjRelProx').addEventListener('input', prev);
  $('pjRelImp').onclick = () => { prev(); setTimeout(() => window.print(), 150); };
  $('pjRelZap').onclick = e => {
    const x = ler();
    const s = semaforos(r);
    const resumo = `*${p.codigo || ''} · ${p.nome}*\nFase: ${nomeFase(p.fase)}\nAvanço: ${pct(r.fisico)} (planejado ${pct(r.planejado)})\nPrazo: ${NOME_COR[s.prazo]} · término ${dataBR(p.fim_previsto)}\nCusto: ${NOME_COR[s.custo]} · ${reais(r.custoReal)} de ${reais(p.orcamento)}`
      + (r.atrasadas.length ? `\nAtrasadas: ${r.atrasadas.length}` : '') + (x.proximos_passos ? `\n\nPróximos passos: ${x.proximos_passos}` : '');
    enviarWhatsapp(pdfStatus(r, x), resumo, e.currentTarget);
  };
  $('pjRelSalvar').onclick = async () => {
    const x = ler();
    await gravar('pj_status', { id: crypto.randomUUID(), projeto_id: pid, ativo: true, data: hojeISO(), fase: p.fase,
      pct_fisico: r.fisico, pct_planejado: r.planejado, custo_real: r.custoReal, spi: r.spi, cpi: r.cpi,
      dominios: Object.fromEntries(dominios(r).map(([n, c]) => [n, c])), comentario: x.comentario || null,
      proximos_passos: x.proximos_passos || null, criado_por: meuNome() });
    aviso('Relatório de progresso salvo no histórico.');
    redesenhar();
  };
}

/* ============================== termo de abertura ============================== */
const assinaturas = (pares) => `<div class="rel-assin">${pares.map(([papel, nome]) =>
  `<div><span></span><b>${esc(nome || '')}</b><small>${esc(papel)}</small></div>`).join('')}</div>`;

export function imprimirTermoAbertura(p) {
  const crit = linhas(p.criterios_sucesso);
  const bloco = (t, v) => v ? `<h3 class="rel-secao">${t}</h3><p class="rel-texto">${br(v)}</p>` : '';
  const inov = { produto: 'Produto ou serviço', processo: 'Processo', marketing: 'Marketing', organizacional: 'Organizacional' };
  imprimirFolha(folha(`
    ${topo('Termo de Abertura do Projeto', (p.codigo || '') + ' · ' + p.nome)}
    <table class="rel-tab rel-ficha"><tbody>
      <tr><td><b>Patrocinador</b></td><td>${esc(p.patrocinador || '')}</td><td><b>Gerente do projeto</b></td><td>${esc(p.gerente || '')}</td></tr>
      <tr><td><b>Início</b></td><td>${dataBR(p.inicio)}</td><td><b>Término previsto</b></td><td>${dataBR(p.fim_previsto)}</td></tr>
      <tr><td><b>Orçamento</b></td><td>${reais(p.orcamento)}</td><td><b>Fazenda / setor</b></td><td>${esc([p.fazenda, p.setor].filter(Boolean).join(' · '))}</td></tr>
      ${p.categoria || p.inovacao_objeto ? `<tr><td><b>Categoria</b></td><td>${esc(p.categoria || '')}</td><td><b>Inovação</b></td><td>${esc([inov[p.inovacao_objeto], p.inovacao_grau].filter(Boolean).join(' · '))}</td></tr>` : ''}
    </tbody></table>
    ${bloco('Objetivo', p.objetivo)}${bloco('Justificativa', p.justificativa)}${bloco('Business case / viabilidade', p.business_case)}
    ${bloco('Escopo macro', p.escopo)}${bloco('Fora do escopo', p.fora_escopo)}
    ${p.premissas || p.restricoes ? `<div class="rel-dupla">${p.premissas ? `<div><h3 class="rel-secao">Premissas</h3><p class="rel-texto">${br(p.premissas)}</p></div>` : '<div></div>'}${p.restricoes ? `<div><h3 class="rel-secao">Restrições</h3><p class="rel-texto">${br(p.restricoes)}</p></div>` : ''}</div>` : ''}
    ${bloco('Recursos iniciais', p.recursos)}
    ${crit.length ? `<h3 class="rel-secao">Critérios de sucesso</h3><ul class="rel-lista">${crit.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    <p class="rel-texto rel-autoriza">Este termo autoriza formalmente o início do projeto e dá ao gerente do projeto a autoridade para aplicar os recursos da organização nas atividades previstas.${p.termo_aprovado_em ? ' Aprovado em ' + dataBR(p.termo_aprovado_em) + '.' : ''}</p>
    ${assinaturas([['Patrocinador', p.patrocinador], ['Gerente do projeto', p.gerente]])}`));
}

/* ============================== dicionário da EAP ============================== */
export function imprimirDicionario(r) {
  const p = r.p;
  const rd = rede(r);
  const item = i => {
    const n = rd.nos[i.id];
    const preds = n ? n.preds.map(x => (rd.nos[x.id] ? rd.nos[x.id].it._cod : '?') + (x.rel !== 'FI' ? ' ' + x.rel : '')).join(', ') : '';
    return `<table class="rel-tab rel-dic"><tbody>
      <tr><td colspan="4" class="rel-dic-tit"><b>${i._cod}</b> · ${esc(i.nome)} <small>(${i.tipo})</small></td></tr>
      ${i.descricao ? `<tr><td><b>Descrição</b></td><td colspan="3">${br(i.descricao)}</td></tr>` : ''}
      <tr><td><b>Responsável</b></td><td>${esc(i.responsavel || '—')}</td><td><b>Prazo</b></td><td>${dataBR(i.inicio)} a ${dataBR(i.fim)}</td></tr>
      <tr><td><b>Custo previsto</b></td><td>${reais(r.calc[i.id].prev)}</td><td><b>Predecessoras</b></td><td>${esc(preds || '—')}</td></tr>
      ${i.criterio_aceite ? `<tr><td><b>Critério de aceitação</b></td><td colspan="3">${br(i.criterio_aceite)}</td></tr>` : ''}
      ${i.premissas ? `<tr><td><b>Premissas e restrições</b></td><td colspan="3">${br(i.premissas)}</td></tr>` : ''}
      ${i.recursos ? `<tr><td><b>Recursos necessários</b></td><td colspan="3">${br(i.recursos)}</td></tr>` : ''}
      ${i.referencias ? `<tr><td><b>Referências técnicas</b></td><td colspan="3">${br(i.referencias)}</td></tr>` : ''}
    </tbody></table>`;
  };
  imprimirFolha(folha(`${topo('Dicionário da EAP', (p.codigo || '') + ' · ' + p.nome)}
    ${!r.arv.length ? '<p class="rel-vazio">EAP vazia.</p>' : r.arv.map(item).join('')}`));
}

/* ============================== termo de aceite e encerramento ============================== */
export function imprimirTermoEncerramento(r, p) {
  const crit = linhas(p.criterios_sucesso);
  const alc = p.criterios_alcancados || {};
  const chk = p.checklist_enc || {};
  const licoes = doProjeto('pj_licoes', p.id);
  const res = { sim: 'Sim', parcial: 'Parcial', nao: 'Não', '': '—' };
  imprimirFolha(folha(`
    ${topo('Termo de Aceite e Encerramento do Projeto', (p.codigo || '') + ' · ' + p.nome)}
    <div class="rel-kpis">
      <div><span>Início</span><b>${dataBR(p.inicio)}</b></div>
      <div><span>Término</span><b>${dataBR(p.encerrado_em || hojeISO())}</b><small>previsto ${dataBR(p.fim_base || p.fim_previsto)}</small></div>
      <div><span>Avanço</span><b>${pct(r.fisico)}</b></div>
      <div><span>Custo realizado</span><b>${reais(r.custoReal)}</b><small>orçado ${reais(p.orcamento_base != null ? p.orcamento_base : p.orcamento)}</small></div>
      <div><span>Mudanças aprovadas</span><b>${r.mudancas.filter(m => m.situacao === 'aprovada').length}</b></div>
    </div>
    <h3 class="rel-secao">Entregas</h3>
    <table class="rel-tab"><thead><tr><th>EAP</th><th>Entrega</th><th>Aceite</th><th>Data</th><th>Observação</th></tr></thead>
      <tbody>${r.entregas.map(e => `<tr><td>${e._cod}</td><td>${esc(e.nome)}</td><td>${esc({ pendente: 'pendente', aceita: 'aceita', recusada: 'recusada' }[e.aceite_situacao || 'pendente'])}</td><td>${dataBR(e.aceite_em)}</td><td>${esc(e.aceite_obs || '')}</td></tr>`).join('') || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
    ${crit.length ? `<h3 class="rel-secao">Critérios de sucesso</h3><table class="rel-tab"><thead><tr><th>Critério</th><th>Alcançado</th><th>Evidência</th></tr></thead>
      <tbody>${crit.map(c => `<tr><td>${esc(c)}</td><td>${res[(alc[c] || {}).res || '']}</td><td>${esc((alc[c] || {}).obs || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${p.resultado_final ? `<h3 class="rel-secao">Resultados alcançados</h3><p class="rel-texto">${br(p.resultado_final)}</p>` : ''}
    <h3 class="rel-secao">Checklist de encerramento</h3>
    <ul class="rel-lista rel-chk">${CHECKLIST_ENC.map(([k, n]) => `<li class="${chk[k] ? 'ok' : ''}">${chk[k] ? '☑' : '☐'} ${esc(n)}</li>`).join('')}</ul>
    ${licoes.length ? `<h3 class="rel-secao">Lições aprendidas</h3><table class="rel-tab"><thead><tr><th>Tipo</th><th>Categoria</th><th>O que aconteceu</th><th>Recomendação</th></tr></thead>
      <tbody>${licoes.map(l => `<tr><td>${l.tipo === 'acerto' ? 'Deu certo' : 'Melhorar'}</td><td>${esc(l.categoria || '')}</td><td>${esc(l.situacao)}</td><td>${esc(l.recomendacao || l.aprendizado || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    <p class="rel-texto rel-autoriza">As partes abaixo declaram que as entregas foram recebidas conforme os critérios de aceitação e que o projeto está formalmente encerrado.</p>
    ${assinaturas([['Patrocinador', p.patrocinador], ['Gerente do projeto', p.gerente]])}`));
}

/* Matriz das partes interessadas (usada no relatório, se precisar). */
export const linhaParte = x => [x.nome, x.papel || '', NIVEL3[x.interesse], NIVEL3[x.influencia], estrategiaParte(x)];
