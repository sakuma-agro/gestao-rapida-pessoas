// encerramento.js — Encerramento do projeto e lições aprendidas (23/10/2026).
// Validar as entregas, conferir os critérios de sucesso, checklist de
// encerramento, resultado final, lições aprendidas e o termo de aceite.
import { esc, gravar, aviso, apagar, dataBR, hojeISO, doProjeto, CHECKLIST_ENC, linhas, FASES, nomeFase,
  meuNome, projeto, pendenciasPara } from './dados.js';
import { formModal, etiqueta, vazio } from './ui.js';
import { painelAceite } from './abas-escopo.js';
import { imprimirTermoEncerramento } from './relatorio.js';

export const CATEGORIAS_LICAO = ['Escopo', 'Prazo', 'Custo', 'Qualidade', 'Equipe', 'Comunicação', 'Riscos', 'Fornecedores', 'Partes interessadas', 'Segurança'];

export function editarLicao(pid, x, redesenhar) {
  formModal(x ? 'Lição aprendida' : 'Nova lição aprendida', [
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: [['acerto', 'O que deu certo (repetir)'], ['melhorar', 'O que melhorar (evitar)']] },
    { k: 'categoria', rot: 'Categoria', lista: 'pjCatLicao' },
    { k: 'fase', rot: 'Fase', tipo: 'select', ops: [['', '—'], ...FASES] },
    { k: 'situacao', rot: 'O que aconteceu', tipo: 'area', req: true, plena: true, linhas: 3 },
    { k: 'aprendizado', rot: 'O que aprendemos', tipo: 'area', plena: true, linhas: 2 },
    { k: 'recomendacao', rot: 'Recomendação para os próximos projetos', tipo: 'area', plena: true, linhas: 2 },
  ], x || { tipo: 'melhorar', fase: (projeto(pid) || {}).fase }, async o => {
    await gravar('pj_licoes', { ...(x || { id: crypto.randomUUID(), projeto_id: pid, ativo: true, registrado_por: meuNome() }), ...o });
    redesenhar();
  }, { extra: `<datalist id="pjCatLicao">${CATEGORIAS_LICAO.map(c => `<option value="${c}">`).join('')}</datalist>`,
    aoExcluir: x ? async () => { await apagar('pj_licoes', x); redesenhar(); } : null });
}

export function abaEncerramento(alvo, r, redesenhar) {
  const p = r.p, pid = p.id;
  const crit = linhas(p.criterios_sucesso);
  const alc = p.criterios_alcancados || {};
  const chk = p.checklist_enc || {};
  const licoes = doProjeto('pj_licoes', pid);
  const aceite = painelAceite(r, redesenhar);
  const fechado = p.situacao === 'encerrado';
  alvo.innerHTML = `
    <div class="pj-secao-topo"><div><h4>Encerramento do projeto</h4>
      <p class="dc-sem">Validar as entregas, conferir os critérios de sucesso, registrar as lições aprendidas e encerrar formalmente.
        ${fechado ? `<b class="pj-ok">Projeto encerrado em ${dataBR(p.encerrado_em)}.</b>` : ''}</p></div>
      <div class="barra">
        <button class="btn" type="button" id="pjEncImp">Termo de aceite e encerramento</button>
        ${fechado ? '<button class="btn" type="button" id="pjReabrir">Reabrir projeto</button>' : '<button class="btn principal" type="button" id="pjEncerrar">Encerrar projeto</button>'}
      </div></div>

    <h4 class="pj-sub-tit">1. Aceite das entregas</h4>
    ${aceite.html}

    <form id="pjEncForm" autocomplete="off">
    <h4 class="pj-sub-tit">2. Critérios de sucesso (do termo de abertura)</h4>
    ${!crit.length ? vazio('Nenhum critério de sucesso no termo de abertura.') : `
    <div class="pj-rolagem"><table class="dc-planilha pj-tab">
      <thead><tr><th>Critério</th><th>Alcançado?</th><th>Evidência / comentário</th></tr></thead>
      <tbody>${crit.map((c, i) => { const a = alc[c] || {}; return `<tr><td><b>${esc(c)}</b></td>
        <td><select name="crit_${i}">${[['', '—'], ['sim', 'Sim'], ['parcial', 'Parcial'], ['nao', 'Não']].map(([k, n]) => `<option value="${k}"${(a.res || '') === k ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
        <td><input type="text" name="critobs_${i}" value="${esc(a.obs || '')}"></td></tr>`; }).join('')}</tbody></table></div>`}

    <h4 class="pj-sub-tit">3. Checklist de encerramento</h4>
    <div class="pj-checklist">${CHECKLIST_ENC.map(([k, n]) => `<label class="pj-check"><input type="checkbox" name="chk_${k}"${chk[k] ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</div>

    <h4 class="pj-sub-tit">4. Resultado final</h4>
    <label class="campo plena">Resultados alcançados (vai no relatório final)<textarea name="resultado_final" rows="4">${esc(p.resultado_final || '')}</textarea></label>
    <div class="barra fim"><button class="btn principal" type="submit">Salvar encerramento</button></div>
    </form>

    <div class="pj-secao-topo" style="margin-top:22px"><div><h4>5. Lições aprendidas</h4>
      <p class="dc-sem">O que deu certo e o que melhorar. Ficam também na tela Lições aprendidas, para consulta nos próximos projetos.</p></div>
      <div class="barra"><button class="btn principal" type="button" id="pjLiNova">+ Lição aprendida</button></div></div>
    ${!licoes.length ? vazio('Nenhuma lição registrada.') : `
    <div class="pj-licoes">${licoes.map(l => `<article class="pj-licao ${l.tipo}" data-li="${l.id}">
      <header>${etiqueta(l.tipo === 'acerto' ? 'deu certo' : 'melhorar', l.tipo === 'acerto' ? 'aceita' : 'alerta')} <b>${esc(l.categoria || '')}</b> <small class="dc-sem">${esc(nomeFase(l.fase))}</small></header>
      <p>${esc(l.situacao)}</p>${l.aprendizado ? `<p><small>Aprendizado:</small> ${esc(l.aprendizado)}</p>` : ''}${l.recomendacao ? `<p><small>Recomendação:</small> ${esc(l.recomendacao)}</p>` : ''}</article>`).join('')}</div>`}`;

  aceite.ligar(alvo);
  const lerTudo = () => {
    const f = new FormData(alvo.querySelector('#pjEncForm'));
    const ca = {};
    crit.forEach((c, i) => { ca[c] = { res: f.get('crit_' + i) || '', obs: (f.get('critobs_' + i) || '').trim() }; });
    const ck = {};
    CHECKLIST_ENC.forEach(([k]) => { ck[k] = f.get('chk_' + k) === 'on'; });
    return { ...projeto(pid), criterios_alcancados: ca, checklist_enc: ck, resultado_final: (f.get('resultado_final') || '').trim() || null };
  };
  alvo.querySelector('#pjEncForm').addEventListener('submit', async e => { e.preventDefault(); await gravar('pj_projetos', lerTudo()); aviso('Encerramento salvo.'); redesenhar(); });
  alvo.querySelector('#pjEncImp').onclick = async () => { const n = lerTudo(); await gravar('pj_projetos', n); imprimirTermoEncerramento(r, n); };
  alvo.querySelector('#pjLiNova').onclick = () => editarLicao(pid, null, redesenhar);
  alvo.querySelectorAll('[data-li]').forEach(a => a.onclick = () => editarLicao(pid, licoes.find(x => x.id === a.dataset.li), redesenhar));
  const enc = alvo.querySelector('#pjEncerrar');
  if (enc) enc.onclick = async () => {
    const n = lerTudo();
    const falta = pendenciasPara('encerramento', r);
    const naoMarcados = CHECKLIST_ENC.filter(([k]) => !n.checklist_enc[k]).length;
    if (naoMarcados) falta.push(naoMarcados + ' item(ns) do checklist sem marcar');
    if (!licoes.length) falta.push('lições aprendidas');
    if (falta.length && !confirm('Ainda falta:\n\n• ' + falta.join('\n• ') + '\n\nEncerrar mesmo assim?')) return;
    await gravar('pj_projetos', { ...n, situacao: 'encerrado', fase: 'encerramento', encerrado_em: hojeISO(),
      historico_fases: [...(n.historico_fases || []), ...(n.fase !== 'encerramento' ? [{ de: n.fase, para: 'encerramento', em: new Date().toISOString(), por: meuNome() }] : [])] });
    aviso('Projeto encerrado.');
    redesenhar();
  };
  const re = alvo.querySelector('#pjReabrir');
  if (re) re.onclick = async () => {
    if (!confirm('Reabrir o projeto?')) return;
    await gravar('pj_projetos', { ...projeto(pid), situacao: 'ativo', encerrado_em: null });
    redesenhar();
  };
}
