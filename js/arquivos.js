// Arquivos no Google Drive (15/10/2026).
//
// Pedido do Guilherme: toda foto ou documento anexado no app vai para o Drive
// (conta escritoriosakuma1), para não pesar o Supabase. O app fala com a
// função "arquivos" do Supabase, que guarda a autorização do Drive; no banco
// fica só a linha de controle em public.arquivos.
//
// Usado em: foto do funcionário (Cadastros), certificado do treinamento e
// ASO/exame (SST), documento da Certificação. Manutenções tem a própria fila
// offline em manutencoes/js/base.js, que fala com a mesma função.
//
// Chave: <área>/<tipo>/<dono>/<arquivo>.<ext> — ver supabase/functions/arquivos.

import { estado, CONEXAO } from './store.js';

const FN = () => CONEXAO.url + '/functions/v1/arquivos';
const MAX_MB = 15;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MOTIVO = {
  'drive-nao-configurado': 'o Google Drive ainda não foi ligado',
  'drive-autorizacao-expirou': 'a autorização do Google Drive expirou — é preciso autorizar de novo',
  'sem-acesso': 'você não tem acesso a este tipo de arquivo',
  'grande-demais': `o arquivo passa de ${MAX_MB} MB`,
  'tipo-invalido': 'só dá para anexar foto (JPG, PNG) ou PDF',
};
export const motivo = codigo => MOTIVO[codigo] || codigo || 'falha desconhecida';

async function cabecalho() {
  const { data } = await estado.cliente.auth.getSession();
  const t = data?.session?.access_token;
  if (!t) throw new Error('entre de novo no app');
  return { Authorization: 'Bearer ' + t, apikey: CONEXAO.chave };
}

async function erroDa(r) {
  const d = await r.json().catch(() => ({}));
  return new Error(motivo(d.erro || ('http ' + r.status)));
}

/** Diminui a foto no aparelho (1600 px, JPEG) antes de subir. */
export async function comprimirImagem(arquivo, larguraMax = 1600) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, larguraMax / Math.max(bitmap.width, bitmap.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * escala);
  cv.height = Math.round(bitmap.height * escala);
  cv.getContext('2d').drawImage(bitmap, 0, 0, cv.width, cv.height);
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
}

/** Prepara um arquivo escolhido: foto vira JPEG menor; PDF vai como está. */
export async function preparar(arquivo) {
  const pdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name || '');
  if (pdf) {
    if (arquivo.size > MAX_MB * 1048576) throw new Error(motivo('grande-demais'));
    return { blob: arquivo, mime: 'application/pdf', ext: 'pdf' };
  }
  if (!/^image\//.test(arquivo.type)) throw new Error(motivo('tipo-invalido'));
  return { blob: await comprimirImagem(arquivo), mime: 'image/jpeg', ext: 'jpg' };
}

export async function enviarArquivo(chave, blob, mime, nome) {
  if (!navigator.onLine) throw new Error('sem internet — o anexo só sobe com conexão');
  const u = `${FN()}?acao=enviar&chave=${encodeURIComponent(chave)}&nome=${encodeURIComponent(nome || '')}`;
  const r = await fetch(u, { method: 'POST', headers: { ...(await cabecalho()), 'Content-Type': mime }, body: blob });
  if (!r.ok) throw await erroDa(r);
  return r.json();
}

/** Baixa o arquivo do Drive (pela função) e devolve o Blob. */
export async function baixarArquivo(chave) {
  const r = await fetch(`${FN()}?acao=ver&chave=${encodeURIComponent(chave)}`, { headers: await cabecalho(), cache: 'no-store' });
  if (!r.ok) throw await erroDa(r);
  return r.blob();
}

export async function apagarArquivo(chave) {
  const r = await fetch(`${FN()}?acao=apagar&chave=${encodeURIComponent(chave)}`, { method: 'POST', headers: await cabecalho() });
  if (!r.ok && r.status !== 404) throw await erroDa(r);
}

export async function listarArquivos(tipo, donoId) {
  const { data, error } = await estado.cliente.from('arquivos')
    .select('chave,nome,mime,tamanho,criado_em').eq('tipo', tipo).eq('dono_id', String(donoId)).order('criado_em');
  if (error) throw error;
  return data || [];
}

/** Abre o arquivo numa aba nova (no celular, o leitor de PDF/foto do aparelho). */
export async function abrirArquivo(chave, nome) {
  const janela = window.open('', '_blank');           // abre já, senão o bloqueador de pop-up barra
  try {
    const blob = await baixarArquivo(chave);
    const url = URL.createObjectURL(blob);
    if (janela) janela.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = nome || 'arquivo'; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    janela?.close();
    alert('Não consegui abrir o arquivo: ' + e.message);
  }
}

const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const novoNomeArq = ext => `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

/**
 * Caixa de anexos dentro de um diálogo (vários arquivos por registro).
 * Arquivo novo fica pendente até o registro ser salvo: o diálogo chama
 * salvarPendentes(id) depois de gravar. Arquivo já enviado abre ou sai na hora.
 *
 *   const cx = caixaAnexos($('trAnexos'), { area: 'pessoas', tipo: 'treinamento', nome: () => 'Certificado NR-31 - Fulano' });
 *   cx.carregar(id)          // ao abrir o diálogo (id null = registro novo)
 *   await cx.salvarPendentes(id)   // depois de gravar o registro
 *   await cx.apagarTodos(id)       // quando o registro é apagado
 */
export function caixaAnexos(el, { area, tipo, nome, rotulo = 'Anexos', dica = 'Foto ou PDF — fica guardado no Google Drive.' }) {
  let dono = null, salvos = [], pendentes = [], ocupado = false;

  function desenhar() {
    el.innerHTML = `<div class="anx">
      <div class="anx-topo"><span class="anx-rot">${esc(rotulo)}</span>
        <label class="btn mini anx-add">📎 Anexar<input type="file" accept="image/*,application/pdf" multiple hidden></label></div>
      <ul class="anx-lista">${salvos.map((a, i) => `<li>
          <button class="anx-nome" type="button" data-abrir="${i}" title="Abrir">${a.mime === 'application/pdf' ? '📄' : '🖼️'} ${esc(a.nome)}</button>
          <span class="anx-tam">${kb(a.tamanho)}</span>
          <button class="btn mini" type="button" data-tirar="${i}" title="Tirar o anexo">Tirar</button></li>`).join('')}
        ${pendentes.map((p, i) => `<li class="anx-pend">
          <span class="anx-nome">${p.mime === 'application/pdf' ? '📄' : '🖼️'} ${esc(p.original)}</span>
          <span class="anx-tam">sobe ao salvar</span>
          <button class="btn mini" type="button" data-desfazer="${i}">Tirar</button></li>`).join('')}
      </ul>
      ${!salvos.length && !pendentes.length ? `<p class="dica anx-vazio">${esc(dica)}</p>` : ''}
      ${ocupado ? '<p class="dica">Carregando…</p>' : ''}
    </div>`;
    el.querySelector('input[type=file]').addEventListener('change', async ev => {
      for (const f of ev.target.files) {
        try { pendentes.push({ ...(await preparar(f)), original: f.name || 'foto' }); }
        catch (e) { alert(`${f.name}: ${e.message}`); }
      }
      desenhar();
    });
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => {
      const a = salvos[+b.dataset.abrir]; abrirArquivo(a.chave, a.nome);
    }));
    el.querySelectorAll('[data-desfazer]').forEach(b => b.addEventListener('click', () => {
      pendentes.splice(+b.dataset.desfazer, 1); desenhar();
    }));
    el.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', async () => {
      const a = salvos[+b.dataset.tirar];
      if (!confirm(`Tirar o anexo "${a.nome}"? Ele vai para a lixeira do Drive.`)) return;
      b.disabled = true;
      try { await apagarArquivo(a.chave); salvos = salvos.filter(x => x !== a); desenhar(); }
      catch (e) { b.disabled = false; alert('Não consegui tirar: ' + e.message); }
    }));
  }

  return {
    async carregar(id) {
      dono = id ?? null; salvos = []; pendentes = [];
      if (dono == null) return desenhar();
      ocupado = true; desenhar();
      try { salvos = await listarArquivos(tipo, dono); }
      catch (e) { console.warn('anexos', e); }
      ocupado = false; desenhar();
    },
    get temPendentes() { return pendentes.length > 0; },
    /** Sobe os pendentes. Devolve a lista de erros (vazia se tudo subiu). */
    async salvarPendentes(id) {
      dono = id; const erros = [];
      const base = (typeof nome === 'function' ? nome() : nome) || tipo;
      for (const p of [...pendentes]) {
        const chave = `${area}/${tipo}/${String(id).replace(/[^\w.-]/g, '_')}/${novoNomeArq(p.ext)}`;
        try {
          await enviarArquivo(chave, p.blob, p.mime, `${base} - ${p.original.replace(/\.[^.]+$/, '')}`);
          pendentes.splice(pendentes.indexOf(p), 1);
        } catch (e) { erros.push(`${p.original}: ${e.message}`); }
      }
      return erros;
    },
    async apagarTodos(id) {
      try { for (const a of await listarArquivos(tipo, id)) await apagarArquivo(a.chave); }
      catch (e) { console.warn('apagar anexos', e); }
    },
  };
}

/* ---------- foto única do funcionário ---------- */

export const chaveFotoFunc = id => `pessoas/funcionario/${id}/foto.jpg`;

/** Mostra a foto do funcionário num <img> (ou esconde, se não houver). */
export async function mostrarFotoFunc(img, id) {
  img.hidden = true; img.removeAttribute('src');
  try {
    const l = await listarArquivos('funcionario', id);
    if (!l.length) return false;
    const blob = await baixarArquivo(chaveFotoFunc(id));
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.src = img.dataset.url = URL.createObjectURL(blob);
    img.hidden = false;
    return true;
  } catch (e) { console.warn('foto do funcionário', e); return false; }
}
