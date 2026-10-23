// licoes.js — Biblioteca de lições aprendidas de todos os projetos (23/10/2026).
// Gestão do conhecimento: o que deu certo e o que melhorar, para consultar no
// começo de um projeto novo.
import { $, esc, pronto, carregando, ativos, projeto, semAcento, nomeFase } from './dados.js';
import { vazio, etiqueta } from './ui.js';
import { editarLicao, CATEGORIAS_LICAO } from './encerramento.js';

let ouvindo = false, busca = '', cat = '', tipo = '';

function desenhar() {
  const alvo = $('pjLicoesCorpo');
  if (!pronto() || carregando()) { alvo.innerHTML = vazio('Abrindo…'); return; }
  const todas = ativos('pj_licoes');
  const lista = todas.filter(l => (!cat || l.categoria === cat) && (!tipo || l.tipo === tipo)
    && (!busca || semAcento([l.situacao, l.aprendizado, l.recomendacao, l.categoria, (projeto(l.projeto_id) || {}).nome].join(' ')).includes(semAcento(busca))))
    .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')));
  const cats = [...new Set([...CATEGORIAS_LICAO, ...todas.map(l => l.categoria).filter(Boolean)])];
  alvo.innerHTML = `
    <div class="barra pj-filtros">
      <label class="campo" style="flex:1;min-width:200px">Procurar <input type="text" id="pjLiBusca" value="${esc(busca)}" placeholder="palavra, projeto, assunto"></label>
      <label class="campo">Categoria <select id="pjLiCat"><option value="">Todas</option>${cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo">Tipo <select id="pjLiTipo"><option value="">Todos</option><option value="acerto"${tipo === 'acerto' ? ' selected' : ''}>Deu certo</option><option value="melhorar"${tipo === 'melhorar' ? ' selected' : ''}>Melhorar</option></select></label>
    </div>
    ${!todas.length ? vazio('Nenhuma lição registrada ainda. Elas são registradas na aba Encerramento de cada projeto — e podem ser registradas a qualquer momento.') :
      !lista.length ? vazio('Nenhuma lição com esses filtros.') : `
    <div class="pj-licoes">${lista.map(l => { const p = projeto(l.projeto_id) || {}; return `<article class="pj-licao ${l.tipo}" data-li="${l.id}">
      <header>${etiqueta(l.tipo === 'acerto' ? 'deu certo' : 'melhorar', l.tipo === 'acerto' ? 'aceita' : 'alerta')} <b>${esc(l.categoria || '')}</b>
        <small class="dc-sem">${esc(p.codigo || '')} ${esc(p.nome || '')} · ${esc(nomeFase(l.fase))}</small></header>
      <p>${esc(l.situacao)}</p>${l.aprendizado ? `<p><small>Aprendizado:</small> ${esc(l.aprendizado)}</p>` : ''}${l.recomendacao ? `<p><small>Recomendação:</small> ${esc(l.recomendacao)}</p>` : ''}</article>`; }).join('')}</div>`}`;
  $('pjLiBusca').addEventListener('input', e => { busca = e.target.value; const pos = e.target.selectionStart; desenhar(); const el = $('pjLiBusca'); el.focus(); el.setSelectionRange(pos, pos); });
  $('pjLiCat').onchange = e => { cat = e.target.value; desenhar(); };
  $('pjLiTipo').onchange = e => { tipo = e.target.value; desenhar(); };
  alvo.querySelectorAll('[data-li]').forEach(a => a.onclick = () => { const l = todas.find(x => x.id === a.dataset.li); editarLicao(l.projeto_id, l, desenhar); });
}

export function abrirLicoes() {
  if (!ouvindo) { window.addEventListener('projetos-dados', () => { if (!$('telaPjLicoes').hidden) desenhar(); }); ouvindo = true; }
  desenhar();
}
