// ui.js — formulários e pedaços de tela usados em toda a área Projetos (23/10/2026).
import { esc, lerNum, num } from './dados.js';

/**
 * Campos de formulário. c = { k, rot, tipo, ops, plena, lista, dica, req, ph }
 * tipo: text | area | date | numero | dinheiro | select | check
 * ops (select): [[valor, rótulo], …] · lista (text): id de um <datalist>
 */
export function campos(lista, v = {}) {
  return lista.map(c => {
    const val = v[c.k];
    const cls = 'campo' + (c.plena ? ' plena' : '');
    const req = c.req ? ' required' : '';
    const ph = c.ph ? ` placeholder="${esc(c.ph)}"` : '';
    const dica = c.dica ? `<small class="pj-dica-campo">${esc(c.dica)}</small>` : '';
    switch (c.tipo) {
      case 'area':
        return `<label class="${cls}">${esc(c.rot)}<textarea name="${c.k}" rows="${c.linhas || 3}"${req}${ph}>${esc(val || '')}</textarea>${dica}</label>`;
      case 'date':
        return `<label class="${cls}">${esc(c.rot)}<input type="date" name="${c.k}" value="${esc(String(val || '').slice(0, 10))}"${req}>${dica}</label>`;
      case 'numero':
        return `<label class="${cls}">${esc(c.rot)}<input type="text" inputmode="decimal" name="${c.k}" value="${val == null || val === '' ? '' : esc(String(val).replace('.', ','))}"${req}${ph}>${dica}</label>`;
      case 'dinheiro':
        return `<label class="${cls}">${esc(c.rot)}<input type="text" inputmode="decimal" name="${c.k}" value="${val == null || val === '' ? '' : esc(num(val))}"${req}${ph || ' placeholder="0,00"'}>${dica}</label>`;
      case 'select':
        return `<label class="${cls}">${esc(c.rot)}<select name="${c.k}"${req}>${(c.ops || []).map(([o, r]) =>
          `<option value="${esc(o)}"${String(val ?? c.padrao ?? '') === String(o) ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>${dica}</label>`;
      case 'check':
        return `<label class="pj-check${c.plena ? ' plena' : ''}"><input type="checkbox" name="${c.k}"${val ? ' checked' : ''}> ${esc(c.rot)}</label>`;
      default:
        return `<label class="${cls}">${esc(c.rot)}<input type="text" name="${c.k}" value="${esc(val || '')}"${c.lista ? ` list="${c.lista}"` : ''}${req}${ph} autocomplete="off">${dica}</label>`;
    }
  }).join('');
}

/** Lê os campos de um formulário de volta para um objeto. */
export function lerForm(form, lista) {
  const f = new FormData(form), o = {};
  for (const c of lista) {
    if (c.tipo === 'check') { o[c.k] = f.get(c.k) === 'on'; continue; }
    const v = f.get(c.k);
    if (c.tipo === 'numero' || c.tipo === 'dinheiro') o[c.k] = lerNum(v);
    else if (c.tipo === 'date') o[c.k] = v || null;
    else if (c.tipo === 'select' && /^\d+$/.test(String(v)) && c.int) o[c.k] = Number(v);
    else o[c.k] = v == null ? null : String(v).trim() || null;
  }
  return o;
}

/**
 * Abre um formulário no modal. aoSalvar(obj) grava; extra = html depois dos campos.
 * Botão Excluir aparece se aoExcluir vier.
 */
export function formModal(titulo, lista, valores, aoSalvar, { extra = '', aoExcluir = null, rotuloSalvar = 'Salvar', antes = '', aoAbrir = null } = {}) {
  window.abrirModal(titulo, `
    <form class="grade pj-form" autocomplete="off">
      ${antes}
      ${campos(lista, valores)}
      ${extra}
      <div class="barra plena pj-form-barra">
        ${aoExcluir ? '<button class="btn perigo" type="button" data-x="excluir">Excluir</button>' : ''}
        <span class="pj-cresce"></span>
        <button class="btn" type="button" data-x="cancelar">Cancelar</button>
        <button class="btn principal" type="submit">${esc(rotuloSalvar)}</button>
      </div>
    </form>`, corpo => {
    const form = corpo.querySelector('form');
    corpo.querySelector('[data-x="cancelar"]').onclick = () => window.fecharModal();
    const bx = corpo.querySelector('[data-x="excluir"]');
    if (bx) bx.onclick = async () => {
      if (!confirm('Excluir este registro?')) return;
      await aoExcluir();
      window.fecharModal();
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const o = lerForm(form, lista);
      const falta = lista.find(c => c.req && (o[c.k] == null || o[c.k] === ''));
      if (falta) { window.aviso('Preencha: ' + falta.rot, true); return; }
      const ok = await aoSalvar(o, form);
      if (ok !== false) window.fecharModal();
    });
    if (aoAbrir) aoAbrir(form);
    const prim = form.querySelector('input:not([type=hidden]),textarea,select');
    if (prim && window.matchMedia('(min-width:700px)').matches) prim.focus();
  });
}

/** Barra de progresso pequena. */
export const barra = (v, cls = '') => `<span class="pj-barra ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round((v || 0) * 100)))}%"></i></span>`;
export const etiqueta = (txt, cls = '') => `<span class="pj-tag ${cls}">${esc(txt)}</span>`;
export const vazio = txt => `<div class="vazio">${esc(txt)}</div>`;
