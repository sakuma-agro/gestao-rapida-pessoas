// cert-fauna.js — Certificação › Biodiversidade: monitoramento de animais (26/10/2026)
//
// Pedido do Guilherme: "Form 050, vamos fazer um painel dentro do app, de
// monitoramento de animais". Substitui a planilha FORM 050 - MONITORAMENTO DE
// ANIMAIS.xlsx (Plano de Biodiversidade, câmeras de trilha) — os 76 registros
// dela (nov/2025 a mai/2026) foram importados com o link da evidência.
//
// Tabelas (supabase/cert-fauna.sql), trancadas por app_pode('cert'):
//  · cf_especies  — catálogo: nome comum, científico, família, classe, IUCN, lista Brasil (MMA), exótica
//  · cf_cameras   — câmeras de trilha
//  · cf_registros — cada flagrante (data, hora, espécie, câmera, foto/vídeo, link da evidência)
// Fotos anexadas no app vão para o Google Drive: certificacao/fauna/<id do registro>/…
// O mapa das câmeras fica em certificacao/fauna/mapa/….
//
// Sem internet: abre com a última cópia (consulta). Gravar pede internet.

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';
import { abrirModulo } from './acesso.js';
import { campoAnexos, donosComArquivo, enfileirarArquivo, enviarPendentes } from './arquivos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const hm = s => s ? String(s).slice(0, 5) : '';
const utc = s => new Date(s + 'T12:00:00Z');
const entre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = am => { const [a, m] = am.split('-'); return `${MES3[Number(m) - 1]}/${a.slice(2)}`; };

/* ---------------- listas fixas ---------------- */
const CLASSES = ['Ave', 'Mamífero', 'Réptil', 'Anfíbio', 'Outro'];
const TIPOS = ['Foto', 'Vídeo', 'Avistamento', 'Vestígio'];
const IUCN = { LC: 'Pouco preocupante', NT: 'Quase ameaçada', VU: 'Vulnerável', EN: 'Em perigo', CR: 'Criticamente em perigo', DD: 'Dados insuficientes', NE: 'Não avaliada' };
const BRASIL = { VU: 'Vulnerável', EN: 'Em perigo', CR: 'Criticamente em perigo' };
const COR_IUCN = { LC: 'ativo', NT: 'alerta', VU: 'perigo', EN: 'perigo', CR: 'perigo', DD: 'inativo', NE: 'inativo' };
/* Dados do formulário controlado (lista mestra): o FORM 050 impresso sai com eles. */
const FORM = { codigo: 'FORM 050', titulo: 'Planilha de monitoramento de animais', plano: 'PLANO DE BIODIVERSIDADE',
  emissao: '03/12/2025', revisao: '01/12/2026', nrev: '02', elaborador: 'Guilherme Ribeiro Lopes', aprovador: 'Fabio Massao Sakuma' };
const SEM_REGISTRO_DIAS = 30;   // câmera ativa sem flagrante há mais que isso → alerta

/* ---------------- estado ---------------- */
const F = {
  carregado: false, especies: [], cameras: [], regs: [], arq: new Set(),
  fp: { periodo: '12m', camera: '' },
  fr: { q: '', especie: '', camera: '', tipo: '', de: '', ate: '' },
  fe: { q: '' },
};
const CAIXA = 'fauna.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { especies: F.especies, cameras: F.cameras, regs: F.regs });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !F.carregado) { F.especies = c0.especies || []; F.cameras = c0.cameras || []; F.regs = c0.regs || []; F.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (F.carregado) return;
    throw new Error('Sem internet e sem cópia do monitoramento neste aparelho.');
  }
  const [e, k, r] = await Promise.all([
    c.from('cf_especies').select('*').order('nome'),
    c.from('cf_cameras').select('*').order('nome'),
    c.from('cf_registros').select('*').order('data', { ascending: false }).order('hora', { ascending: false }),
  ]);
  const erro = e.error || k.error || r.error;
  if (erro && F.carregado) return;
  if (erro) {
    if (/cf_|relation|does not exist|schema cache/i.test(erro.message || ''))
      throw new Error('As tabelas do monitoramento de animais ainda não foram criadas no banco (supabase/cert-fauna.sql).');
    throw erro;
  }
  F.especies = e.data || []; F.cameras = k.data || []; F.regs = r.data || [];
  F.carregado = true;
  salvarCaixa();
  F.arq = await donosComArquivo('certificacao', 'fauna').catch(() => new Set());
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const espPorId = id => F.especies.find(x => x.id === id);
const camPorId = id => F.cameras.find(x => x.id === id);
const ameacada = e => !!e && (['VU', 'EN', 'CR'].includes(e.status_iucn) || !!e.status_brasil);
const noturno = h => { if (!h) return null; const x = Number(String(h).slice(0, 2)); return x < 6 || x >= 18; };
const ordemReg = (a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || ''));

/** Início do período do painel. */
function inicioPeriodo(p) {
  if (p === 'tudo') return '';
  if (p === '12m') { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-01`; }
  return `${p}-01-01`;
}
const fimPeriodo = p => /^\d{4}$/.test(p) ? `${p}-12-31` : '';
function regsPainel() {
  const de = inicioPeriodo(F.fp.periodo), ate = fimPeriodo(F.fp.periodo);
  return F.regs.filter(r => (!de || r.data >= de) && (!ate || r.data <= ate) && (!F.fp.camera || r.camera_id === F.fp.camera));
}
const rotPeriodo = () => F.fp.periodo === 'tudo' ? 'todo o histórico' : F.fp.periodo === '12m' ? 'últimos 12 meses' : `ano de ${F.fp.periodo}`;

/** Números do painel para uma lista de registros. */
function resumo(regs) {
  const hj = hoje();
  const porEsp = new Map();
  for (const r of regs) {
    const x = porEsp.get(r.especie_id) || { e: espPorId(r.especie_id), n: 0, fotos: 0, videos: 0, cams: new Set(), prim: r.data, ult: r.data, ultReg: r, dias: new Set() };
    x.n++; if (r.tipo === 'Foto') x.fotos++; if (r.tipo === 'Vídeo') x.videos++;
    if (r.camera_id) x.cams.add(r.camera_id);
    x.dias.add(r.data);
    if (r.data < x.prim) x.prim = r.data;
    if (r.data > x.ult || (r.data === x.ult && (r.hora || '') > (x.ultReg.hora || ''))) { x.ult = r.data; x.ultReg = r; }
    porEsp.set(r.especie_id, x);
  }
  const especies = [...porEsp.values()].filter(x => x.e).sort((a, b) => b.dias.size - a.dias.size || b.n - a.n || a.e.nome.localeCompare(b.e.nome));
  const porCam = F.cameras.filter(c => !F.fp.camera || c.id === F.fp.camera).map(c => {
    const l = regs.filter(r => r.camera_id === c.id);
    const tudo = F.regs.filter(r => r.camera_id === c.id);
    const ult = tudo.reduce((m, r) => r.data > m ? r.data : m, '');
    return { c, n: l.length, esp: new Set(l.map(r => r.especie_id)).size, ult, dias: ult ? entre(ult, hj) : null };
  }).sort((a, b) => a.c.nome.localeCompare(b.c.nome, 'pt-BR', { numeric: true }));
  const meses = new Map();
  for (const r of regs) { const k = r.data.slice(0, 7); const m = meses.get(k) || { n: 0, esp: new Set() }; m.n++; m.esp.add(r.especie_id); meses.set(k, m); }
  // eixo contínuo de meses (sem buracos), do primeiro ao último
  const chaves = [...meses.keys()].sort();
  const eixo = [];
  if (chaves.length) {
    let [a, m] = chaves[0].split('-').map(Number); const [a2, m2] = chaves[chaves.length - 1].split('-').map(Number);
    while (a < a2 || (a === a2 && m <= m2)) { const k = `${a}-${doisD(m)}`; eixo.push({ k, n: meses.get(k)?.n || 0, esp: meses.get(k)?.esp.size || 0 }); m++; if (m > 12) { m = 1; a++; } }
  }
  const not = regs.filter(r => noturno(r.hora) === true).length, diu = regs.filter(r => noturno(r.hora) === false).length;
  const ultimo = regs.slice().sort(ordemReg)[0] || null;
  const ativas = F.cameras.filter(c => c.ativa);
  const paradas = porCam.filter(x => x.c.ativa && (x.dias == null || x.dias > SEM_REGISTRO_DIAS));
  const novasNoPeriodo = especies.filter(x => !F.regs.some(r => r.especie_id === x.e.id && r.data < x.prim));
  return {
    regs, especies, porCam, eixo, not, diu, ultimo, ativas, paradas,
    ameacadas: especies.filter(x => ameacada(x.e)), exoticas: especies.filter(x => x.e.exotica),
    fotos: regs.filter(r => r.tipo === 'Foto').length, videos: regs.filter(r => r.tipo === 'Vídeo').length,
    dias: new Set(regs.map(r => r.data)).size, novasNoPeriodo,
  };
}

/* ===================================================================
   PEÇAS DE TELA
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const nomeEsp = e => e ? `<b>${esc(e.nome)}</b>${e.cientifico ? ` <i class="cf-cient">${esc(e.cientifico)}</i>` : ''}` : '—';
const statusTags = e => !e ? '' : [
  e.status_iucn ? tag(`IUCN ${e.status_iucn}`, COR_IUCN[e.status_iucn] || 'neutra', IUCN[e.status_iucn]) : '',
  e.status_brasil ? tag(`BR ${e.status_brasil}`, 'perigo', `Lista nacional (MMA): ${BRASIL[e.status_brasil]}`) : '',
  e.exotica ? tag('Exótica', 'alerta', 'Espécie exótica') : '',
].join(' ');
const linkEvid = (r, rot = 'Ver evidência') => /^https?:\/\//i.test(so(r?.evidencia))
  ? `<a class="cf-evid" href="${esc(r.evidencia)}" target="_blank" rel="noopener" title="Abrir no OneDrive">${r.tipo === 'Vídeo' ? '▶' : '📷'} ${esc(rot)}</a>` : '';
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;

function dialogo(html, ligar) {
  let d = $('dlgCf');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgCf'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  ligar?.(d);
  return d;
}
const fechar = () => $('dlgCf')?.open && $('dlgCf').close();
const erroDlg = t => { const e = $('cfErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgCf')) $('dlgCf').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar no monitoramento precisa de conexão. A consulta continua funcionando.'); return true; } return false; };

async function gravar(tabela, lista, atual, linha, botao) {
  if (precisaRede()) return null;
  if (botao) $(botao).disabled = true;
  try {
    const t = estado.cliente.from(tabela);
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single() : await t.insert(linha).select().single();
    if (error) throw error;
    const i = lista.findIndex(x => x.id === data.id);
    if (i >= 0) lista[i] = data; else lista.unshift(data);
    salvarCaixa();
    return data;
  } catch (e) {
    if (botao && $(botao)) $(botao).disabled = false;
    const m = String(e.message || e);
    erroDlg(/duplicate|unique/i.test(m) ? 'Já existe um cadastro com esse nome.' : /foreign key/i.test(m) ? 'Está em uso por registros: não dá para apagar.' : 'Não consegui gravar: ' + esc(m));
    return null;
  }
}
function confirmarApagar(tabela, lista, item, nome) {
  dialogo(`<h3>Apagar</h3><p>${esc(nome)}</p><p class="dica">Some do painel e não volta.</p>
    <div class="aviso erro" id="cfErro" hidden></div>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button>
      <button class="btn perigo" type="button" id="cfApOk">Apagar</button></div>`, () => {
    $('cfApOk').addEventListener('click', async () => {
      if (precisaRede()) return;
      $('cfApOk').disabled = true;
      const { error } = await estado.cliente.from(tabela).delete().eq('id', item.id);
      if (error) { $('cfApOk').disabled = false; return erroDlg(/foreign key/i.test(error.message) ? 'Tem registros ligados: não dá para apagar. Desative em vez de apagar.' : 'Não consegui apagar: ' + esc(error.message)); }
      const i = lista.findIndex(x => x.id === item.id); if (i >= 0) lista.splice(i, 1);
      salvarCaixa(); fechar(); redesenhar();
    });
  });
}

/* ===================================================================
   TELA · PAINEL
   =================================================================== */
function anosComRegistro() { return [...new Set(F.regs.map(r => r.data.slice(0, 4)))].sort().reverse(); }

function graficoMeses(eixo) {
  if (!eixo.length) return '<div class="vazio">Sem registros no período.</div>';
  const max = Math.max(...eixo.map(x => x.n), 1);
  return `<div class="cf-graf" role="img" aria-label="Registros por mês">
    ${eixo.map(x => `<div class="cf-col" title="${rotMes(x.k)}: ${x.n} registro(s), ${x.esp} espécie(s)">
      <span class="cf-val">${x.n || ''}</span>
      <div class="cf-barra" style="height:${Math.round(x.n / max * 100)}%"></div>
      <span class="cf-mes">${rotMes(x.k)}</span><span class="cf-sub">${x.esp ? x.esp + ' esp.' : ''}</span></div>`).join('')}
  </div>`;
}

function desenharPainel() {
  const tela = $('telaFaPainel');
  const k = resumo(regsPainel());
  const hj = hoje();
  const cartao = (cor, rot, n, dica, alvo) => `<button type="button" class="pv-card pv-${cor}${n ? '' : ' pv-zero'}" ${alvo ? `data-ir="${alvo}"` : ''}>
    <span>${esc(rot)}</span><strong>${n}</strong><small>${esc(dica)}</small></button>`;
  const totalNoite = k.not + k.diu;
  const ult = k.ultimo;
  const diasUlt = ult ? entre(ult.data, hj) : null;

  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Monitoramento de animais', `Plano de Biodiversidade · ${FORM.codigo} · câmeras de trilha — ${rotPeriodo()}`,
      `<button class="btn principal" type="button" id="faNovo">Novo registro</button>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Período <select id="faPer">${opcoes([['12m', 'Últimos 12 meses'], ...anosComRegistro().map(a => [a, 'Ano ' + a]), ['tudo', 'Todo o histórico']], F.fp.periodo)}</select></label>
      <label class="campo">Câmera <select id="faCam">${opcoes(F.cameras.map(c => [c.id, c.nome]), F.fp.camera, 'Todas')}</select></label>
    </div>
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Registros', k.regs.length, `${k.fotos} foto(s) · ${k.videos} vídeo(s) · ${k.dias} dia(s)`, 'faRegistros')}
      ${cartao('calma', 'Espécies', k.especies.length, k.novasNoPeriodo.length && F.fp.periodo !== 'tudo' && F.regs.some(r => r.data < inicioPeriodo(F.fp.periodo)) ? `${k.novasNoPeriodo.length} nova(s) no período` : 'diferentes no período', 'faEspecies')}
      ${cartao(k.ameacadas.length ? 'atencao' : 'ok', 'Ameaçadas', k.ameacadas.length, 'IUCN VU/EN/CR ou lista do MMA', 'ameacadas')}
      ${cartao(k.exoticas.length ? 'alerta' : 'ok', 'Exóticas', k.exoticas.length, k.exoticas.map(x => x.e.nome).join(', ') || 'nenhuma', 'exoticas')}
      ${cartao(k.paradas.length ? 'alerta' : 'calma', 'Câmeras ativas', k.ativas.length, k.paradas.length ? `${k.paradas.length} sem registro há +${SEM_REGISTRO_DIAS} dias` : 'todas com registro recente', 'faCameras')}
      ${cartao(diasUlt != null && diasUlt > SEM_REGISTRO_DIAS ? 'alerta' : 'calma', 'Último registro', ult ? br(ult.data) : '—', ult ? `há ${diasUlt} dia(s) · ${espPorId(ult.especie_id)?.nome || ''}` : 'nenhum', 'faRegistros')}
    </div>
    ${diasUlt != null && diasUlt > SEM_REGISTRO_DIAS ? `<div class="aviso" style="margin-top:12px">Nenhum registro lançado há ${diasUlt} dias. Descarregue os cartões das câmeras e lance os flagrantes — o auditor olha a continuidade do monitoramento.</div>` : ''}

    <div id="faId" class="cf-id"></div>

    <div class="qp-bloco"><h3>Registros por mês</h3>${graficoMeses(k.eixo)}</div>

    <div class="qp-bloco"><h3>Espécies registradas</h3>
      ${k.especies.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Espécie</th><th>Família</th><th>Classe</th><th>Conservação</th>
        <th class="ce">Dias</th><th class="ce">Registros</th><th>Câmeras</th><th class="ce">Primeiro</th><th class="ce">Último</th><th></th></tr></thead><tbody>
        ${k.especies.map(x => `<tr${ameacada(x.e) ? ' class="cf-ameacada"' : ''}><td>${nomeEsp(x.e)}</td><td>${esc(x.e.familia || '')}</td><td>${esc(x.e.classe)}</td>
          <td>${statusTags(x.e) || '<span class="dica">—</span>'}</td><td class="ce">${x.dias.size}</td><td class="ce">${x.n}</td>
          <td>${[...x.cams].map(id => esc(camPorId(id)?.nome || '')).sort().join(', ')}</td>
          <td class="ce">${br(x.prim)}</td><td class="ce">${br(x.ult)}</td><td>${linkEvid(x.ultReg, 'Último')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="vazio">Nenhuma espécie no período.</div>'}
    </div>

    <div class="cf-duas">
      <div class="qp-bloco"><h3>Por câmera</h3>
        <div class="ac-rola"><table class="dc-planilha"><thead><tr><th>Câmera</th><th class="ce">Registros</th><th class="ce">Espécies</th><th class="ce">Último</th></tr></thead><tbody>
        ${k.porCam.map(x => `<tr><td><b>${esc(x.c.nome)}</b>${x.c.local ? `<br><small class="dica">${esc(x.c.local)}</small>` : ''}${x.c.ativa ? '' : ' ' + tag('inativa', 'inativo')}</td>
          <td class="ce">${x.n}</td><td class="ce">${x.esp}</td>
          <td class="ce">${x.ult ? br(x.ult) : '—'}${x.c.ativa && (x.dias == null || x.dias > SEM_REGISTRO_DIAS) ? '<br>' + tag(x.dias == null ? 'sem registro' : `há ${x.dias} dias`, 'alerta') : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhuma câmera cadastrada.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="qp-bloco"><h3>Horário dos flagrantes</h3>
        ${totalNoite ? `<div class="cf-dianoite"><span class="cf-dia" style="flex:${k.diu}">☀ ${k.diu}</span><span class="cf-noite" style="flex:${k.not}">☾ ${k.not}</span></div>
        <p class="dica" style="margin:6px 0 0">Diurno (6h–18h) ${Math.round(k.diu / totalNoite * 100)}% · noturno ${Math.round(k.not / totalNoite * 100)}%.
          Noturnos: ${[...new Set(k.regs.filter(r => noturno(r.hora)).map(r => espPorId(r.especie_id)?.nome).filter(Boolean))].join(', ') || '—'}.</p>` : '<div class="vazio">Sem horário lançado.</div>'}
        ${k.ameacadas.length ? `<h3 style="margin-top:16px">Espécies ameaçadas no período</h3>
          <ul class="cf-lista">${k.ameacadas.map(x => `<li>${nomeEsp(x.e)} ${statusTags(x.e)} <small class="dica">· ${x.dias.size} dia(s) com registro</small></li>`).join('')}</ul>` : ''}
      </div>
    </div>

    <div class="qp-bloco"><h3>Últimos registros</h3>
      ${k.regs.length ? `<div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th class="ce">Hora</th><th>Espécie</th><th>Câmera</th><th>Tipo</th><th></th></tr></thead><tbody>
      ${k.regs.slice().sort(ordemReg).slice(0, 8).map(r => `<tr><td class="ce">${br(r.data)}</td><td class="ce">${hm(r.hora)}</td><td>${nomeEsp(espPorId(r.especie_id))}</td>
        <td>${esc(camPorId(r.camera_id)?.nome || '—')}</td><td>${esc(r.tipo)}${F.arq.has(String(r.id)) ? ' <span title="Tem foto no app">📎</span>' : ''}</td><td>${linkEvid(r)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nada no período.</div>'}
    </div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="faImpPainel">Imprimir o painel</button>
    <button class="btn" type="button" id="faImpForm">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="faXlsx">Excel</button>
  </div>`;

  $('faPer').addEventListener('change', e => { F.fp.periodo = e.target.value; desenharPainel(); });
  $('faCam').addEventListener('change', e => { F.fp.camera = e.target.value; desenharPainel(); });
  $('faNovo').addEventListener('click', () => formRegistro(null));
  desenharIdentificar();
  $('faImpPainel').addEventListener('click', () => mostrar(docPainel(k), { barra: true }));
  $('faImpForm').addEventListener('click', () => mostrar(docForm(k.regs.slice().sort((a, b) => -ordemReg(a, b))), { barra: true }));
  $('faXlsx').addEventListener('click', () => exportar(k.regs.slice().sort((a, b) => -ordemReg(a, b))));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.ir;
    if (a === 'ameacadas' || a === 'exoticas') { F.fe.q = a === 'ameacadas' ? ':ameacadas' : ':exoticas'; return abrirModulo('cert', 'faEspecies'); }
    if (a === 'faRegistros') Object.assign(F.fr, { q: '', especie: '', camera: F.fp.camera, tipo: '', de: inicioPeriodo(F.fp.periodo), ate: fimPeriodo(F.fp.periodo) });
    abrirModulo('cert', a);
  }));
}


/* ===================================================================
   IDENTIFICAR POR FOTO / VÍDEO (26/10/2026)
   "Quero ter um lugar aonde vou soltar as fotos e vídeos e você vai
   identificar." Solta os arquivos (ou a pasta do cartão) → o app tira até
   3 quadros de cada vídeo aqui no navegador → a função fauna-identificar
   pergunta ao Claude → a linha volta preenchida para conferir → "Lançar".
   Data e hora: do nome do arquivo da câmera (2025-1127-161847_000001.MP4),
   senão do carimbo na imagem, senão da data do arquivo. Câmera: da pasta
   ("CÂMERA 2"), do carimbo ou a escolhida para o lote.
   =================================================================== */
const ID = { itens: [], camera: '', rodando: 0, seq: 0 };
const EXT_FOTO = /\.(jpe?g|png|webp|heic|heif)$/i, EXT_VIDEO = /\.(mp4|mov|avi|m4v|3gp|webm)$/i;
const CONF_COR = { alta: 'ativo', 'média': 'alerta', baixa: 'perigo' };

function dataDoNome(nome) {
  const m = String(nome).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[-_ T]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})/);
  if (!m) return null;
  const [, a, me, d, h, mi] = m;
  if (+me < 1 || +me > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  return { data: `${a}-${me}-${d}`, hora: `${h}:${mi}` };
}
function cameraDoTexto(t) {
  const m = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').match(/\b(?:camera|cam)\s*[-_ ]?\s*(\d{1,2})\b/i);
  if (!m) return '';
  const c = F.cameras.find(x => (x.nome.match(/\d+/) || [])[0] === String(Number(m[1])));
  return c ? c.id : '';
}
const isoDeMs = ms => { const d = new Date(ms); return { data: `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`, hora: `${doisD(d.getHours())}:${doisD(d.getMinutes())}` }; };

function reduzir(fonte, w, h, max = 1280) {
  const e = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * e); cv.height = Math.round(h * e);
  cv.getContext('2d').drawImage(fonte, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.82);
}
async function quadrosFoto(file) {
  const bmp = await createImageBitmap(file);
  return [reduzir(bmp, bmp.width, bmp.height)];
}
function quadrosVideo(file) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    const fim = (e, r) => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); e ? falha(e) : ok(r); };
    const t = setTimeout(() => fim(new Error('o vídeo demorou demais para abrir')), 30000);
    v.onerror = () => fim(new Error('este navegador não abre esse formato de vídeo'));
    v.onloadedmetadata = async () => {
      try {
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
        const out = [];
        for (const f of [0.12, 0.45, 0.8]) {
          await new Promise((s, r2) => { v.onseeked = s; v.onerror = () => r2(new Error('falha ao ler o vídeo')); v.currentTime = Math.min(dur - 0.05, f * dur); });
          if (v.videoWidth) out.push(reduzir(v, v.videoWidth, v.videoHeight, 1024));
        }
        out.length ? fim(null, out) : fim(new Error('o vídeo não tem imagem'));
      } catch (e) { fim(e); }
    };
  });
}
async function arquivosDoDrop(dt) {
  const itens = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!itens.length) return [...(dt.files || [])].map(f => ({ file: f, caminho: f.name }));
  const out = [];
  const ler = ent => new Promise(res => {
    if (ent.isFile) ent.file(f => { out.push({ file: f, caminho: ent.fullPath || f.name }); res(); }, () => res());
    else if (ent.isDirectory) {
      const r = ent.createReader(); const todos = [];
      const lote = () => r.readEntries(async es => { if (!es.length) { for (const e of todos) await ler(e); res(); } else { todos.push(...es); lote(); } }, () => res());
      lote();
    } else res();
  });
  for (const e of itens) await ler(e);
  return out;
}
function adicionarArquivos(lista) {
  let ign = 0;
  for (const { file, caminho } of lista) {
    const video = EXT_VIDEO.test(file.name) || /^video\//.test(file.type);
    const foto = EXT_FOTO.test(file.name) || /^image\//.test(file.type);
    if (!video && !foto) { ign++; continue; }
    if (ID.itens.some(x => x.nome === file.name && x.tamanho === file.size)) continue;
    const dn = dataDoNome(file.name) || dataDoNome(caminho);
    ID.itens.push({ id: ++ID.seq, file, nome: file.name, caminho, tamanho: file.size, video, estado: 'fila', quadros: [], thumb: '',
      data: dn?.data || '', hora: dn?.hora || '', origemData: dn ? 'nome' : '', camera_id: cameraDoTexto(caminho) || ID.camera,
      tipo: video ? 'Vídeo' : 'Foto', individuos: null, especie: '', nova: null, res: null, incluir: true, erro: '' });
  }
  desenharIdentificar(ign);
  processarFila();
}
async function processarFila() {
  while (ID.rodando < 2) {
    const it = ID.itens.find(x => x.estado === 'fila');
    if (!it) return;
    ID.rodando++; it.estado = 'lendo'; desenharLinhaId(it);
    identificar(it).finally(() => { ID.rodando--; desenharLinhaId(it); resumoId(); processarFila(); });
  }
}
async function identificar(it) {
  try {
    it.quadros = it.video ? await quadrosVideo(it.file) : await quadrosFoto(it.file);
    it.thumb = it.quadros[Math.min(1, it.quadros.length - 1)];
    if (!it.data) { const d = isoDeMs(it.file.lastModified || Date.now()); it.data = d.data; it.hora = it.hora || d.hora; it.origemData = 'arquivo'; }
    it.estado = 'identificando'; desenharLinhaId(it);
    if (!navigator.onLine || !estado.cliente) throw new Error('sem internet');
    const { data, error } = await estado.cliente.functions.invoke('fauna-identificar', { body: {
      arquivo: it.nome, video: it.video, imagens: it.quadros,
      especies: F.especies.map(e => e.cientifico ? `${e.nome} (${e.cientifico})` : e.nome), cameras: F.cameras.map(c => c.nome) } });
    if (error) { let m = error.message; try { m = (await error.context.json()).erro || m; } catch {} throw new Error(m); }
    const r = data.identificacao || {};
    it.res = r;
    if (r.data_carimbo && /^\d{4}-\d{2}-\d{2}$/.test(r.data_carimbo) && it.origemData !== 'nome') { it.data = r.data_carimbo; it.origemData = 'carimbo'; }
    if (r.hora_carimbo && /^\d{1,2}:\d{2}$/.test(r.hora_carimbo) && it.origemData !== 'nome') it.hora = r.hora_carimbo.padStart(5, '0');
    if (!it.camera_id && r.camera_carimbo) it.camera_id = cameraDoTexto(r.camera_carimbo);
    it.individuos = r.individuos > 1 ? r.individuos : null;
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*\(.*\)$/, '').trim();
    const cat = F.especies.find(e => r.especie_do_catalogo && norm(e.nome) === norm(r.especie_do_catalogo))
      || F.especies.find(e => r.cientifico && e.cientifico && norm(e.cientifico) === norm(r.cientifico))
      || F.especies.find(e => norm(e.nome) === norm(r.nome_comum));
    if (cat) { it.especie = cat.id; it.nova = null; }
    else { it.especie = '__nova'; it.nova = { nome: r.nome_comum, cientifico: r.cientifico || null, familia: r.familia || null, classe: CLASSES.includes(r.classe) ? r.classe : 'Outro',
      status_iucn: IUCN[r.status_iucn] ? r.status_iucn : null, status_brasil: BRASIL[r.status_brasil] ? r.status_brasil : null, exotica: !!r.exotica, ativo: true }; }
    it.incluir = r.animal_presente !== false && !r.pessoa_ou_veiculo;
    marcarDuplicado(it);
    it.estado = 'pronto';
  } catch (e) { it.estado = 'erro'; it.erro = String(e.message || e); it.incluir = false; }
}
function marcarDuplicado(it) {
  it.dup = it.especie && it.especie !== '__nova' && F.regs.some(r => r.especie_id === it.especie && r.data === it.data && hm(r.hora) === it.hora && r.tipo === it.tipo);
  if (it.dup) it.incluir = false;
}

function desenharIdentificar(ignorados = 0) {
  const el = $('faId'); if (!el) return;
  el.innerHTML = `<div class="cf-drop" id="faDrop" tabindex="0">
      <input type="file" id="faIdArq" multiple accept="image/*,video/*" hidden>
      <strong>📷 Solte aqui as fotos e vídeos das câmeras</strong>
      <span>ou <button type="button" class="btn mini" id="faIdEscolher">escolher arquivos</button> — pode soltar a pasta inteira do cartão. O Claude identifica o animal; você confere e lança.</span>
      <label class="campo cf-drop-cam">Câmera destes arquivos <select id="faIdCam">${opcoes(F.cameras.filter(c => c.ativa).map(c => [c.id, c.nome]), ID.camera, 'Pela pasta / carimbo')}</select></label>
    </div>
    ${ignorados ? `<p class="dica">${ignorados} arquivo(s) ignorado(s): não são foto nem vídeo.</p>` : ''}
    <div id="faIdTabela"></div>`;
  const drop = $('faDrop'), inp = $('faIdArq');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('cf-drop-sobre'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('cf-drop-sobre'); }));
  drop.addEventListener('drop', async e => adicionarArquivos(await arquivosDoDrop(e.dataTransfer)));
  $('faIdEscolher').addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { adicionarArquivos([...inp.files].map(f => ({ file: f, caminho: f.webkitRelativePath || f.name }))); inp.value = ''; });
  $('faIdCam').addEventListener('change', e => {
    ID.camera = e.target.value;
    ID.itens.filter(x => x.estado !== 'lancado').forEach(x => { x.camera_id = ID.camera || cameraDoTexto(x.caminho) || cameraDoTexto(x.res?.camera_carimbo); });
    tabelaId();
  });
  tabelaId();
}
function tabelaId() {
  const el = $('faIdTabela'); if (!el) return;
  if (!ID.itens.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="ac-rola"><table class="dc-planilha cf-id-tab"><thead><tr><th class="ce"><input type="checkbox" id="faIdTodos" title="Marcar todos"></th><th>Imagem</th><th>Espécie</th><th>Data</th><th>Hora</th><th>Câmera</th><th>Tipo</th><th></th></tr></thead>
    <tbody>${ID.itens.map(it => `<tr id="faIdL${it.id}"></tr>`).join('')}</tbody></table></div>
    <div class="barra entre" style="margin-top:8px"><span class="dica" id="faIdResumo"></span>
      <div class="barra" style="margin:0"><button class="btn" type="button" id="faIdLimpar">Limpar a lista</button>
      <button class="btn principal" type="button" id="faIdLancar">Lançar marcados</button></div></div>`;
  ID.itens.forEach(desenharLinhaId);
  $('faIdTodos').addEventListener('change', e => { ID.itens.filter(x => x.estado === 'pronto').forEach(x => { x.incluir = e.target.checked; }); ID.itens.forEach(desenharLinhaId); resumoId(); });
  $('faIdLimpar').addEventListener('click', () => { ID.itens = ID.itens.filter(x => ['fila', 'lendo', 'identificando'].includes(x.estado)); tabelaId(); });
  $('faIdLancar').addEventListener('click', lancarId);
  resumoId();
}
function resumoId() {
  const r = $('faIdResumo'); if (!r) return;
  const n = s => ID.itens.filter(x => x.estado === s).length;
  const marc = ID.itens.filter(x => x.estado === 'pronto' && x.incluir).length;
  r.textContent = [`${ID.itens.length} arquivo(s)`, n('fila') + n('lendo') + n('identificando') ? `${n('fila') + n('lendo') + n('identificando')} identificando…` : '',
    n('pronto') ? `${n('pronto')} pronto(s), ${marc} marcado(s)` : '', n('lancado') ? `${n('lancado')} lançado(s)` : '', n('erro') ? `${n('erro')} com erro` : ''].filter(Boolean).join(' · ');
  if ($('faIdLancar')) { $('faIdLancar').disabled = !marc; $('faIdLancar').textContent = marc ? `Lançar ${marc} registro(s)` : 'Lançar marcados'; }
}
function desenharLinhaId(it) {
  const tr = $('faIdL' + it.id); if (!tr) return;
  const r = it.res;
  const ocupado = ['fila', 'lendo', 'identificando'].includes(it.estado);
  const fixo = it.estado === 'lancado';
  const thumb = it.thumb ? `<img class="cf-id-thumb" src="${it.thumb}" alt="">` : `<div class="cf-id-thumb cf-id-vazio">${it.video ? '▶' : '📷'}</div>`;
  const estadoTxt = { fila: 'na fila', lendo: it.video ? 'lendo o vídeo…' : 'lendo a foto…', identificando: 'identificando…', erro: 'erro', lancado: 'lançado ✓', pronto: '' }[it.estado];
  const optsEsp = opcoes(F.especies.filter(e => e.ativo || e.id === it.especie).map(e => [e.id, e.nome]), it.especie === '__nova' ? '' : it.especie, 'Escolha…')
    + (it.nova ? `<option value="__nova" ${it.especie === '__nova' ? 'selected' : ''}>＋ Nova: ${esc(it.nova.nome)}${it.nova.cientifico ? ' (' + esc(it.nova.cientifico) + ')' : ''}</option>` : '');
  tr.className = it.estado === 'lancado' ? 'cf-id-ok' : it.estado === 'erro' ? 'cf-id-erro' : '';
  tr.innerHTML = `<td class="ce"><input type="checkbox" data-k="incluir" ${it.incluir ? 'checked' : ''} ${it.estado !== 'pronto' ? 'disabled' : ''}></td>
    <td><div class="cf-id-img">${thumb}<div><b class="cf-id-nome" title="${esc(it.caminho)}">${esc(it.nome)}</b>
      ${estadoTxt ? `<br><small class="${it.estado === 'erro' ? 'cf-id-msg-erro' : 'dica'}">${esc(estadoTxt)}${it.erro ? ': ' + esc(it.erro) : ''}</small>` : ''}
      ${r ? `<br><small class="dica">${r.animal_presente === false ? '<b>Sem animal</b> (disparo falso) — ' : r.pessoa_ou_veiculo ? '<b>Pessoa/veículo/doméstico</b> — ' : ''}${esc(r.observacao || '')}</small>` : ''}</div></div></td>
    <td>${ocupado ? '…' : `<select data-k="especie" ${fixo ? 'disabled' : ''}>${optsEsp}</select>`}
      ${r && !ocupado ? `<br>${tag('confiança ' + r.confianca, CONF_COR[r.confianca] || 'neutra')}${it.dup ? ' ' + tag('já lançado', 'inativo', 'Já existe registro igual (espécie, data, hora, tipo)') : ''}` : ''}</td>
    <td><input type="date" data-k="data" value="${esc(it.data)}" max="${hoje()}" ${fixo ? 'disabled' : ''}>${it.origemData ? `<br><small class="dica">${{ nome: 'pelo nome do arquivo', carimbo: 'pelo carimbo', arquivo: 'data do arquivo — confira' }[it.origemData]}</small>` : ''}</td>
    <td><input type="time" data-k="hora" value="${esc(it.hora)}" ${fixo ? 'disabled' : ''}></td>
    <td><select data-k="camera_id" ${fixo ? 'disabled' : ''}>${opcoes(F.cameras.map(c => [c.id, c.nome]), it.camera_id, '—')}</select></td>
    <td><select data-k="tipo" ${fixo ? 'disabled' : ''}>${opcoes(TIPOS, it.tipo)}</select></td>
    <td class="ce">${it.estado === 'erro' ? '<button class="btn mini" type="button" data-acao="tentar">Tentar de novo</button>' : ''}${!ocupado && !fixo ? '<button class="btn mini" type="button" data-acao="tirar" title="Tirar da lista">✕</button>' : ''}</td>`;
  tr.querySelectorAll('[data-k]').forEach(c => c.addEventListener('change', e => {
    const k = c.dataset.k;
    it[k] = c.type === 'checkbox' ? c.checked : c.value;
    if (k === 'hora' || k === 'data') it.origemData = it.origemData === 'arquivo' ? '' : it.origemData;
    if (['especie', 'data', 'hora', 'tipo'].includes(k)) { const antes = it.dup; marcarDuplicado(it); if (antes && !it.dup) it.incluir = true; desenharLinhaId(it); }
    resumoId();
  }));
  tr.querySelector('img.cf-id-thumb')?.addEventListener('click', () => dialogo(`<h3>${esc(it.nome)}</h3>
    ${it.quadros.map(q => `<img src="${q}" alt="" style="width:100%;border-radius:8px;margin-bottom:8px">`).join('')}
    ${it.res ? `<p class="dica">${esc(it.res.nome_comum || '')} ${it.res.cientifico ? '— <i>' + esc(it.res.cientifico) + '</i>' : ''} · ${esc(it.res.observacao || '')}</p>` : ''}
    <div class="barra fim"><button class="btn" type="button" data-fechar>Fechar</button></div>`));
  tr.querySelector('[data-acao="tentar"]')?.addEventListener('click', () => { it.estado = 'fila'; it.erro = ''; it.incluir = true; desenharLinhaId(it); processarFila(); });
  tr.querySelector('[data-acao="tirar"]')?.addEventListener('click', () => { ID.itens = ID.itens.filter(x => x !== it); tr.remove(); resumoId(); });
}
function dataUrlParaArquivo(u, nome) {
  const [cab, b64] = u.split(','); const bin = atob(b64); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new File([a], nome, { type: (cab.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
async function lancarId() {
  if (precisaRede()) return;
  const lista = ID.itens.filter(x => x.estado === 'pronto' && x.incluir);
  const falta = lista.filter(x => !x.especie || !x.data);
  if (falta.length) return alert(`${falta.length} linha(s) marcada(s) sem espécie ou sem data. Confira antes de lançar.`);
  const btn = $('faIdLancar'); btn.disabled = true; btn.textContent = 'Lançando…';
  const novas = new Map();
  let ok = 0, erros = 0;
  for (const it of lista) {
    try {
      let espId = it.especie;
      if (espId === '__nova') {
        const k = it.nova.nome.toLowerCase();
        if (!novas.has(k)) {
          const ja = F.especies.find(e => e.nome.toLowerCase() === k);
          if (ja) novas.set(k, ja.id);
          else {
            const { data, error } = await estado.cliente.from('cf_especies').insert({ id: novoId(), ...it.nova, observacao: 'Cadastrada pela identificação automática (Claude) — conferir.', criado_por: quem() }).select().single();
            if (error) throw error;
            F.especies.push(data); F.especies.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            novas.set(k, data.id);
          }
        }
        espId = novas.get(k);
      }
      const r = it.res || {};
      const linha = { id: novoId(), data: it.data, hora: it.hora || null, especie_id: espId, camera_id: it.camera_id || null, tipo: it.tipo,
        individuos: it.individuos, evidencia: null, criado_por: quem(),
        observacao: `Identificado pelo Claude (confiança ${r.confianca || '?'}) a partir de ${it.nome}.${r.observacao ? ' ' + r.observacao : ''}`.slice(0, 900) };
      const { data, error } = await estado.cliente.from('cf_registros').insert(linha).select().single();
      if (error) throw error;
      F.regs.unshift(data);
      if (it.thumb) { await enfileirarArquivo('certificacao', 'fauna', data.id, dataUrlParaArquivo(it.thumb, `${it.nome.replace(/\.[^.]+$/, '')}.jpg`), `${it.nome.replace(/\.[^.]+$/, '')}.jpg`); F.arq.add(String(data.id)); }
      it.estado = 'lancado'; it.regId = data.id; ok++;
    } catch (e) { it.erro = String(e.message || e); erros++; }
    desenharLinhaId(it);
  }
  salvarCaixa();
  enviarPendentes();
  btn.disabled = false; resumoId();
  if (erros) alert(`${ok} lançado(s); ${erros} com erro (veja a linha).`);
  // redesenha o painel mantendo a lista
  if (telaAtual === 'faPainel') desenharPainel();
}

/* ===================================================================
   TELA · REGISTROS
   =================================================================== */
function regsFiltrados() {
  const q = so(F.fr.q).toLowerCase();
  return F.regs.filter(r => {
    if (F.fr.especie && r.especie_id !== F.fr.especie) return false;
    if (F.fr.camera && r.camera_id !== F.fr.camera) return false;
    if (F.fr.tipo && r.tipo !== F.fr.tipo) return false;
    if (F.fr.de && r.data < F.fr.de) return false;
    if (F.fr.ate && r.data > F.fr.ate) return false;
    if (q) {
      const e = espPorId(r.especie_id);
      const txt = [e?.nome, e?.cientifico, e?.familia, camPorId(r.camera_id)?.nome, r.observacao, br(r.data)].join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  }).sort(ordemReg);
}
function desenharRegistros() {
  const tela = $('telaFaRegistros');
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Registros de fauna', `Cada flagrante das câmeras: data, hora, espécie, câmera e a evidência (foto ou vídeo no OneDrive, ou foto anexada aqui).`,
      `<div class="barra" style="margin:0"><button class="btn" type="button" id="frIdent">📷 Identificar fotos e vídeos</button><button class="btn principal" type="button" id="frNovo">Novo registro</button></div>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Buscar <input type="text" id="frQ" value="${esc(F.fr.q)}" placeholder="Espécie, família, câmera, observação"></label>
      <label class="campo">Espécie <select id="frEsp">${opcoes(F.especies.map(e => [e.id, e.nome]), F.fr.especie, 'Todas')}</select></label>
      <label class="campo">Câmera <select id="frCam">${opcoes(F.cameras.map(c => [c.id, c.nome]), F.fr.camera, 'Todas')}</select></label>
      <label class="campo">Tipo <select id="frTipo">${opcoes(TIPOS, F.fr.tipo, 'Todos')}</select></label>
      <label class="campo">De <input type="date" id="frDe" value="${esc(F.fr.de)}"></label>
      <label class="campo">Até <input type="date" id="frAte" value="${esc(F.fr.ate)}"></label>
    </div>
    <div id="frTabela" style="margin-top:12px"></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="frImp">Imprimir ${FORM.codigo}</button>
    <button class="btn" type="button" id="frXlsx">Excel</button>
    <button class="btn" type="button" id="frLimpa">Limpar filtros</button>
  </div>`;
  const liga = (id, k, ev = 'change') => $(id).addEventListener(ev, e => { F.fr[k] = e.target.value; tabelaRegistros(); });
  liga('frQ', 'q', 'input'); liga('frEsp', 'especie'); liga('frCam', 'camera'); liga('frTipo', 'tipo'); liga('frDe', 'de'); liga('frAte', 'ate');
  $('frNovo').addEventListener('click', () => formRegistro(null));
  $('frIdent').addEventListener('click', () => { abrirModulo('cert', 'faPainel'); setTimeout(() => $('faId')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); });
  $('frImp').addEventListener('click', () => mostrar(docForm(regsFiltrados().reverse()), { barra: true }));
  $('frXlsx').addEventListener('click', () => exportar(regsFiltrados().reverse()));
  $('frLimpa').addEventListener('click', () => { Object.assign(F.fr, { q: '', especie: '', camera: '', tipo: '', de: '', ate: '' }); desenharRegistros(); });
  tabelaRegistros();
}
function tabelaRegistros() {
  const l = regsFiltrados();
  $('frTabela').innerHTML = l.length ? `<p class="dica" style="margin:0 0 6px">${l.length} registro(s) · ${new Set(l.map(r => r.especie_id)).size} espécie(s)</p>
    <div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Data</th><th class="ce">Hora</th><th>Espécie</th><th>Família</th><th>Conservação</th><th>Câmera</th><th>Tipo</th><th>Evidência</th><th></th></tr></thead><tbody>
    ${l.map(r => { const e = espPorId(r.especie_id); return `<tr><td class="ce">${br(r.data)}</td><td class="ce">${hm(r.hora)}</td><td>${nomeEsp(e)}${r.individuos > 1 ? ` <small class="dica">(${r.individuos})</small>` : ''}</td>
      <td>${esc(e?.familia || '')}</td><td>${statusTags(e)}</td><td>${esc(camPorId(r.camera_id)?.nome || '—')}</td><td>${esc(r.tipo)}</td>
      <td>${linkEvid(r)}${F.arq.has(String(r.id)) ? ' <span title="Tem foto anexada no app">📎</span>' : ''}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(r.id)}">Abrir</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum registro com esses filtros.</div>';
  $('frTabela').querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formRegistro(F.regs.find(r => r.id === b.dataset.ed))));
}

let anexosReg = null;
/** r = registro gravado (ou null para novo); rascunho = campos já preenchidos (volta do cadastro de espécie, "lançar outro"). */
function formRegistro(r, rascunho = null) {
  const ult = F.regs.slice().sort(ordemReg)[0];
  const v = rascunho || r || { data: hoje(), hora: '', especie_id: '', camera_id: ult?.camera_id || '', tipo: 'Foto', individuos: '', evidencia: '', observacao: '' };
  dialogo(`<h3>${r ? 'Registro de fauna' : 'Novo registro de fauna'}</h3>
    <div class="aviso erro" id="cfErro" hidden></div>
    <div class="grade">
      <label class="campo">Data <input type="date" id="rgData" value="${esc(v.data)}" max="${hoje()}" required></label>
      <label class="campo">Hora <input type="time" id="rgHora" value="${esc(hm(v.hora))}"></label>
      <label class="campo">Espécie <select id="rgEsp">${opcoes(F.especies.filter(e => e.ativo || e.id === v.especie_id).map(e => [e.id, `${e.nome}${e.cientifico ? ' — ' + e.cientifico : ''}`]), v.especie_id, 'Escolha…')}<option value="__nova">+ Cadastrar nova espécie…</option></select></label>
      <label class="campo">Câmera <select id="rgCam">${opcoes(F.cameras.filter(c => c.ativa || c.id === v.camera_id).map(c => [c.id, c.nome]), v.camera_id, '— (avistamento direto)')}</select></label>
      <label class="campo">Tipo de registro <select id="rgTipo">${opcoes(TIPOS, v.tipo)}</select></label>
      <label class="campo">Indivíduos <input type="number" min="1" id="rgInd" value="${esc(v.individuos ?? '')}" placeholder="1"></label>
    </div>
    <label class="campo">Link da evidência (OneDrive) <input type="url" id="rgEvid" value="${esc(v.evidencia || '')}" placeholder="https://1drv.ms/… — botão direito no arquivo › Compartilhar › Copiar link"></label>
    <div id="rgAnexos" style="margin-top:8px"></div>
    <label class="campo">Observação <textarea id="rgObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    ${r ? `<p class="dica">Lançado ${r.criado_por ? 'por ' + esc(r.criado_por) + ' ' : ''}em ${br(String(r.criado_em).slice(0, 10))}.</p>` : ''}
    <div class="barra entre">
      <div>${r ? '<button class="btn perigo" type="button" id="rgApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button>
        ${r ? '' : '<button class="btn" type="button" id="rgMais">Salvar e lançar outro</button>'}
        <button class="btn principal" type="button" id="rgOk">Salvar</button></div>
    </div>`, () => {
    anexosReg = campoAnexos($('rgAnexos'), { area: 'certificacao', tipo: 'fauna', rotulo: 'Foto no app', dica: 'opcional — além do link' });
    anexosReg.abrir(r ? r.id : null);
    $('rgEsp').addEventListener('change', e => {
      if (e.target.value !== '__nova') return;
      e.target.value = '';
      const rasc = coletar();
      formEspecie(null, nova => formRegistro(r, { ...rasc, especie_id: nova.id }));
    });
    $('rgOk').addEventListener('click', () => salvarRegistro(r, false));
    $('rgMais')?.addEventListener('click', () => salvarRegistro(r, true));
    $('rgApagar')?.addEventListener('click', () => confirmarApagar('cf_registros', F.regs, r, `${br(r.data)} ${hm(r.hora)} · ${espPorId(r.especie_id)?.nome || ''}`));
  });
}
const coletar = () => ({
  data: $('rgData').value, hora: $('rgHora').value || null, especie_id: $('rgEsp').value, camera_id: $('rgCam').value || null,
  tipo: $('rgTipo').value, individuos: num($('rgInd').value), evidencia: so($('rgEvid').value) || null, observacao: so($('rgObs').value) || null,
});
async function salvarRegistro(atual, outro) {
  const l = coletar();
  if (!l.data) return erroDlg('Informe a data.');
  if (l.data > hoje()) return erroDlg('A data está no futuro.');
  if (!l.especie_id) return erroDlg('Escolha a espécie (ou cadastre uma nova).');
  if (l.evidencia && !/^https?:\/\//i.test(l.evidencia)) return erroDlg('O link da evidência precisa começar com https://');
  if (l.individuos != null && l.individuos < 1) l.individuos = null;
  const linha = atual ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() };
  const salvo = await gravar('cf_registros', F.regs, atual, linha, outro ? 'rgMais' : 'rgOk');
  if (!salvo) return;
  if (anexosReg?.mudou) { await anexosReg.salvar(salvo.id); F.arq.add(String(salvo.id)); }
  if (outro) { fechar(); formRegistro(null, { data: l.data, hora: '', especie_id: '', camera_id: l.camera_id, tipo: l.tipo, individuos: '', evidencia: '', observacao: '' }); return; }
  fechar(); redesenhar();
}

/* ===================================================================
   TELA · ESPÉCIES
   =================================================================== */
function desenharEspecies() {
  const tela = $('telaFaEspecies');
  const filtroEsp = F.fe.q === ':ameacadas' ? ameacada : F.fe.q === ':exoticas' ? (e => e.exotica) : null;
  const q = filtroEsp ? '' : so(F.fe.q).toLowerCase();
  const l = F.especies.filter(e => (!filtroEsp || filtroEsp(e)) && (!q || [e.nome, e.cientifico, e.familia, e.classe].join(' ').toLowerCase().includes(q)));
  const cont = id => F.regs.filter(r => r.especie_id === id);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Espécies', 'Catálogo das espécies já registradas na fazenda, com o grau de ameaça (IUCN e lista nacional do MMA).',
      `<button class="btn principal" type="button" id="feNova">Nova espécie</button>`)}
    <div class="grade larga" style="margin-top:12px">
      <label class="campo">Buscar <input type="text" id="feQ" value="${esc(filtroEsp ? '' : F.fe.q)}" placeholder="Nome, científico, família"></label>
      <label class="campo">Mostrar <select id="feF">${opcoes([['', 'Todas'], [':ameacadas', 'Só ameaçadas'], [':exoticas', 'Só exóticas']], filtroEsp ? F.fe.q : '')}</select></label>
    </div>
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr><th>Espécie</th><th>Família</th><th>Classe</th><th>Conservação</th><th class="ce">Registros</th><th class="ce">Último</th><th></th></tr></thead><tbody>
    ${l.map(e => { const rs = cont(e.id); const u = rs.reduce((m, r) => r.data > m ? r.data : m, ''); return `<tr${e.ativo ? '' : ' class="cf-inativa"'}><td>${nomeEsp(e)}</td><td>${esc(e.familia || '')}</td><td>${esc(e.classe)}</td>
      <td>${statusTags(e) || '<span class="dica">—</span>'}</td><td class="ce">${rs.length}</td><td class="ce">${u ? br(u) : '—'}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(e.id)}">Editar</button> <button class="btn mini" type="button" data-ver="${esc(e.id)}">Registros</button></td></tr>`; }).join('')
      || '<tr><td colspan="7" class="vazio">Nenhuma espécie.</td></tr>'}
    </tbody></table></div>
    <p class="dica" style="margin-top:10px">IUCN: LC pouco preocupante · NT quase ameaçada · VU vulnerável · EN em perigo · CR criticamente em perigo. BR = Lista Nacional de Espécies Ameaçadas (Portaria MMA nº 148/2022).</p>
  </div>`;
  $('feQ').addEventListener('input', e => { F.fe.q = e.target.value; const p = e.target.selectionStart; desenharEspecies(); $('feQ').focus(); $('feQ').setSelectionRange(p, p); });
  $('feF').addEventListener('change', e => { F.fe.q = e.target.value; desenharEspecies(); });
  $('feNova').addEventListener('click', () => formEspecie(null));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formEspecie(espPorId(b.dataset.ed))));
  tela.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => { Object.assign(F.fr, { q: '', especie: b.dataset.ver, camera: '', tipo: '', de: '', ate: '' }); abrirModulo('cert', 'faRegistros'); }));
}
function formEspecie(e, depois) {
  const v = e || { nome: '', cientifico: '', familia: '', classe: 'Mamífero', status_iucn: '', status_brasil: '', exotica: false, observacao: '', ativo: true };
  dialogo(`<h3>${e ? 'Espécie' : 'Nova espécie'}</h3>
    <div class="aviso erro" id="cfErro" hidden></div>
    <div class="grade">
      <label class="campo">Nome comum <input type="text" id="esNome" value="${esc(v.nome)}" placeholder="Ex.: Tamanduá-bandeira"></label>
      <label class="campo">Nome científico <input type="text" id="esCient" value="${esc(v.cientifico || '')}" placeholder="Ex.: Myrmecophaga tridactyla"></label>
      <label class="campo">Família <input type="text" id="esFam" value="${esc(v.familia || '')}" list="esFams"></label>
      <label class="campo">Classe <select id="esClasse">${opcoes(CLASSES, v.classe)}</select></label>
      <label class="campo">IUCN <select id="esIucn">${opcoes(Object.entries(IUCN).map(([k, t]) => [k, `${k} — ${t}`]), v.status_iucn, 'Não informado')}</select></label>
      <label class="campo">Lista Brasil (MMA) <select id="esBr">${opcoes(Object.entries(BRASIL).map(([k, t]) => [k, `${k} — ${t}`]), v.status_brasil, 'Não consta')}</select></label>
    </div>
    <datalist id="esFams">${[...new Set(F.especies.map(x => x.familia).filter(Boolean))].map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <label class="campo rs-check"><input type="checkbox" id="esExo" ${v.exotica ? 'checked' : ''}> Espécie exótica (não nativa do Brasil)</label>
    <label class="campo rs-check"><input type="checkbox" id="esAtivo" ${v.ativo ? 'checked' : ''}> Ativa (aparece na lista ao lançar)</label>
    <label class="campo">Observação <textarea id="esObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre">
      <div>${e ? '<button class="btn perigo" type="button" id="esApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="esOk">Salvar</button></div>
    </div>`, () => {
    $('esOk').addEventListener('click', async () => {
      const g = id => so($(id).value) || null;
      const l = { nome: g('esNome'), cientifico: g('esCient'), familia: g('esFam'), classe: $('esClasse').value, status_iucn: g('esIucn'), status_brasil: g('esBr'),
        exotica: $('esExo').checked, ativo: $('esAtivo').checked, observacao: g('esObs') };
      if (!l.nome) return erroDlg('Informe o nome comum.');
      const salvo = await gravar('cf_especies', F.especies, e, e ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'esOk');
      if (!salvo) return;
      F.especies.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      fechar();
      if (depois) depois(salvo); else redesenhar();
    });
    $('esApagar')?.addEventListener('click', () => {
      if (F.regs.some(r => r.especie_id === e.id)) return erroDlg('Tem registros com esta espécie. Desmarque “Ativa” em vez de apagar.');
      confirmarApagar('cf_especies', F.especies, e, e.nome);
    });
  });
}

/* ===================================================================
   TELA · CÂMERAS
   =================================================================== */
let anexosMapa = null;
function desenharCameras() {
  const tela = $('telaFaCameras');
  const hj = hoje();
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Câmeras de trilha', 'Onde está cada câmera e quando ela registrou animal pela última vez.',
      `<button class="btn principal" type="button" id="fcNova">Nova câmera</button>`)}
    <div class="ac-rola" style="margin-top:12px"><table class="dc-planilha"><thead><tr><th>Câmera</th><th>Local</th><th class="ce">Instalada</th><th class="ce">Registros</th><th class="ce">Espécies</th><th class="ce">Último</th><th></th></tr></thead><tbody>
    ${F.cameras.map(c => { const rs = F.regs.filter(r => r.camera_id === c.id); const u = rs.reduce((m, r) => r.data > m ? r.data : m, ''); const d = u ? entre(u, hj) : null;
      return `<tr${c.ativa ? '' : ' class="cf-inativa"'}><td><b>${esc(c.nome)}</b>${c.ativa ? '' : ' ' + tag('inativa', 'inativo')}</td>
      <td>${esc([c.local, c.fazenda].filter(Boolean).join(' · ') || '—')}${c.latitude != null && c.longitude != null ? `<br><a class="cf-evid" href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank" rel="noopener">📍 ${c.latitude}, ${c.longitude}</a>` : ''}</td>
      <td class="ce">${br(c.instalada_em)}</td><td class="ce">${rs.length}</td><td class="ce">${new Set(rs.map(r => r.especie_id)).size}</td>
      <td class="ce">${u ? br(u) : '—'}${c.ativa && (d == null || d > SEM_REGISTRO_DIAS) ? '<br>' + tag(d == null ? 'sem registro' : `há ${d} dias`, 'alerta') : ''}</td>
      <td class="ce"><button class="btn mini" type="button" data-ed="${esc(c.id)}">Editar</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="vazio">Nenhuma câmera.</td></tr>'}
    </tbody></table></div>
    <div class="qp-bloco"><h3>Mapa das câmeras</h3><div id="fcMapa"></div>
      <div class="barra fim" style="margin-top:6px"><button class="btn mini" type="button" id="fcMapaOk">Salvar o mapa</button></div></div>
  </div>`;
  $('fcNova').addEventListener('click', () => formCamera(null));
  tela.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => formCamera(camPorId(b.dataset.ed))));
  anexosMapa = campoAnexos($('fcMapa'), { area: 'certificacao', tipo: 'fauna', rotulo: 'Mapa', dica: 'imagem ou PDF com a posição das câmeras' });
  anexosMapa.abrir('mapa');
  $('fcMapaOk').addEventListener('click', async () => {
    if (!anexosMapa.mudou) return alert('Anexe ou remova um arquivo do mapa antes de salvar.');
    if (precisaRede()) return;
    await anexosMapa.salvar('mapa'); anexosMapa.abrir('mapa');
  });
}
function formCamera(c) {
  const v = c || { nome: `Câmera ${F.cameras.length + 1}`, local: '', fazenda: '', latitude: '', longitude: '', instalada_em: '', ativa: true, observacao: '' };
  dialogo(`<h3>${c ? 'Câmera' : 'Nova câmera'}</h3>
    <div class="aviso erro" id="cfErro" hidden></div>
    <div class="grade">
      <label class="campo">Nome <input type="text" id="caNome" value="${esc(v.nome)}"></label>
      <label class="campo">Local <input type="text" id="caLocal" value="${esc(v.local || '')}" placeholder="Ex.: APP do córrego, trilha da mata"></label>
      <label class="campo">Fazenda <input type="text" id="caFaz" value="${esc(v.fazenda || '')}"></label>
      <label class="campo">Instalada em <input type="date" id="caInst" value="${esc(v.instalada_em || '')}"></label>
      <label class="campo">Latitude <input type="text" id="caLat" value="${esc(v.latitude ?? '')}" placeholder="-22.123456"></label>
      <label class="campo">Longitude <input type="text" id="caLon" value="${esc(v.longitude ?? '')}" placeholder="-47.123456"></label>
    </div>
    <label class="campo rs-check"><input type="checkbox" id="caAtiva" ${v.ativa ? 'checked' : ''}> Ativa</label>
    <label class="campo">Observação <textarea id="caObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre">
      <div>${c ? '<button class="btn perigo" type="button" id="caApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="caOk">Salvar</button></div>
    </div>`, () => {
    $('caOk').addEventListener('click', async () => {
      const g = id => so($(id).value) || null;
      const l = { nome: g('caNome'), local: g('caLocal'), fazenda: g('caFaz'), instalada_em: g('caInst'), latitude: num($('caLat').value), longitude: num($('caLon').value), ativa: $('caAtiva').checked, observacao: g('caObs') };
      if (!l.nome) return erroDlg('Informe o nome.');
      const salvo = await gravar('cf_cameras', F.cameras, c, c ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'caOk');
      if (!salvo) return;
      F.cameras.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
      fechar(); redesenhar();
    });
    $('caApagar')?.addEventListener('click', () => {
      if (F.regs.some(r => r.camera_id === c.id)) return erroDlg('Tem registros desta câmera. Desmarque “Ativa” em vez de apagar.');
      confirmarApagar('cf_cameras', F.cameras, c, c.nome);
    });
  });
}

/* ===================================================================
   DOCUMENTOS IMPRESSOS
   =================================================================== */
function documento({ titulo, subtitulo, canto, corpo, paisagem }) {
  return `<article class="rel${paisagem ? ' rel-paisagem' : ''}">
    <header class="rel-cabecalho">
      <img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>${esc(titulo)}</h1><p>${esc(subtitulo)}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${esc(canto || '')}</span></div>
    </header>
    ${corpo}
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer>
  </article>`;
}
const stTxt = e => [e?.status_iucn ? `IUCN ${e.status_iucn}` : '', e?.status_brasil ? `BR ${e.status_brasil}` : '', e?.exotica ? 'Exótica' : ''].filter(Boolean).join(' · ');
const vazia = (n, t) => `<tr><td colspan="${n}" class="rel-vazio">${esc(t)}</td></tr>`;

function docPainel(k) {
  const max = Math.max(...k.eixo.map(x => x.n), 1);
  const cam = F.fp.camera ? camPorId(F.fp.camera)?.nome : 'todas as câmeras';
  return documento({ titulo: 'Monitoramento de fauna', subtitulo: `Plano de Biodiversidade · ${rotPeriodo()} · ${cam}`, canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-qkpis">
      <div><span>Registros</span><strong>${k.regs.length}</strong><small>${k.fotos} fotos · ${k.videos} vídeos</small></div>
      <div><span>Dias com registro</span><strong>${k.dias}</strong><small>&nbsp;</small></div>
      <div><span>Espécies</span><strong>${k.especies.length}</strong><small>${k.especies.filter(x => x.e.classe === 'Mamífero').length} mamíferos · ${k.especies.filter(x => x.e.classe === 'Ave').length} aves</small></div>
      <div class="rel-q--ruim-t"><span>Ameaçadas</span><strong>${k.ameacadas.length}</strong><small>IUCN VU/EN/CR ou MMA</small></div>
      <div class="rel-q--bom-t"><span>Exóticas</span><strong>${k.exoticas.length}</strong><small>${esc(k.exoticas.map(x => x.e.nome).join(', ') || '—')}</small></div>
      <div><span>Câmeras ativas</span><strong>${k.ativas.length}</strong><small>último registro ${k.ultimo ? br(k.ultimo.data) : '—'}</small></div>
    </div>
    <p class="rel-secao">Registros por mês</p>
    <div class="cf-graf cf-graf-rel">${k.eixo.map(x => `<div class="cf-col"><span class="cf-val">${x.n || ''}</span><div class="cf-barra" style="height:${Math.round(x.n / max * 100)}%"></div><span class="cf-mes">${rotMes(x.k)}</span></div>`).join('')}</div>
    <p class="rel-secao">Espécies registradas</p>
    <table class="rel-tabela"><thead><tr><th>Nome comum</th><th>Nome científico</th><th>Família</th><th>Classe</th><th>Conservação</th><th>Dias</th><th>Registros</th><th>Câmeras</th><th>Primeiro</th><th>Último</th></tr></thead><tbody>
    ${k.especies.map(x => `<tr><td>${esc(x.e.nome)}</td><td><i>${esc(x.e.cientifico || '')}</i></td><td>${esc(x.e.familia || '')}</td><td>${esc(x.e.classe)}</td><td>${esc(stTxt(x.e))}</td>
      <td class="rel-num">${x.dias.size}</td><td class="rel-num">${x.n}</td><td>${[...x.cams].map(id => esc(camPorId(id)?.nome || '')).sort().join(', ')}</td><td>${br(x.prim)}</td><td>${br(x.ult)}</td></tr>`).join('') || vazia(10, 'Nenhum registro.')}
    </tbody></table>
    <p class="rel-secao">Por câmera</p>
    <table class="rel-tabela"><thead><tr><th>Câmera</th><th>Local</th><th>Registros</th><th>Espécies</th><th>Último registro</th></tr></thead><tbody>
    ${k.porCam.map(x => `<tr><td>${esc(x.c.nome)}</td><td>${esc(x.c.local || '')}</td><td class="rel-num">${x.n}</td><td class="rel-num">${x.esp}</td><td>${x.ult ? br(x.ult) : '—'}</td></tr>`).join('') || vazia(5, '—')}
    </tbody></table>
    <p class="rel-nota">Horário dos flagrantes: ${k.diu} diurnos (6h–18h) e ${k.not} noturnos. IUCN: LC pouco preocupante · NT quase ameaçada · VU vulnerável · EN em perigo · CR criticamente em perigo. BR = Lista Nacional de Espécies Ameaçadas (Portaria MMA nº 148/2022). Evidências (fotos e vídeos) no OneDrive, pasta Plano de Biodiversidade.</p>` });
}

/** O FORM 050 no formato da planilha controlada: cabeçalho de documento + a tabela de registros. */
function docForm(regs) {
  const de = regs[0]?.data, ate = regs[regs.length - 1]?.data;
  return documento({ titulo: FORM.plano, subtitulo: `${FORM.titulo}${de ? ` · ${br(de)} a ${br(ate)}` : ''}`, canto: FORM.codigo, paisagem: true, corpo: `
    <div class="rel-ficha">
      <div><span>Código</span><b>${FORM.codigo}</b></div><div><span>Data de emissão</span><b>${FORM.emissao}</b></div><div><span>Data de revisão</span><b>${FORM.revisao}</b></div>
      <div><span>Nº revisão</span><b>${FORM.nrev}</b></div><div><span>Elaborador</span><b>${FORM.elaborador}</b></div><div><span>Aprovador</span><b>${FORM.aprovador}</b></div>
    </div>
    <table class="rel-tabela"><thead><tr><th>Data</th><th>Horário</th><th>Espécie (nome comum)</th><th>Gênero / espécie</th><th>Família</th><th>Estado de conservação</th><th>Local da câmera</th><th>Tipo de registro</th><th>Evidência</th></tr></thead><tbody>
    ${regs.map(r => { const e = espPorId(r.especie_id); return `<tr><td>${br(r.data)}</td><td>${hm(r.hora)}</td><td>${esc(e?.nome || '')}</td><td><i>${esc(e?.cientifico || '')}</i></td><td>${esc(e?.familia || '')}</td>
      <td>${esc(stTxt(e) || (e?.status_iucn ? '' : '—'))}</td><td>${esc(camPorId(r.camera_id)?.nome || '—')}</td><td>${esc(r.tipo)}</td>
      <td>${r.evidencia ? `<a href="${esc(r.evidencia)}">Ver evidência</a>` : F.arq.has(String(r.id)) ? 'Foto no app' : '—'}</td></tr>`; }).join('') || vazia(9, 'Nenhum registro.')}
    </tbody></table>
    <p class="rel-nota">${regs.length} registro(s) · ${new Set(regs.map(r => r.especie_id)).size} espécie(s). Gerado pelo LOP - Gestão Rápida a partir dos lançamentos de Certificação › Biodiversidade.</p>` });
}

async function exportar(regs) {
  const linhas = regs.map(r => { const e = espPorId(r.especie_id); return [r.data, hm(r.hora), e?.nome || '', e?.cientifico || '', e?.familia || '', e?.classe || '', e?.status_iucn || '', e?.status_brasil || '', e?.exotica ? 'Sim' : '', camPorId(r.camera_id)?.nome || '', r.tipo, r.individuos || '', r.evidencia || '', r.observacao || '']; });
  await baixarXlsx(`monitoramento-fauna-${hoje()}.xlsx`, [{ nome: 'Registros', titulo: `${FORM.codigo} — ${FORM.titulo}`, subtitulo: `SAKUMA Agronegócios · Plano de Biodiversidade · emitido em ${br(hoje())}`,
    colunas: [{ rot: 'Data', larg: 12, tipo: 'data' }, { rot: 'Horário', larg: 9 }, { rot: 'Espécie', larg: 22 }, { rot: 'Nome científico', larg: 26 }, { rot: 'Família', larg: 18 }, { rot: 'Classe', larg: 11 },
      { rot: 'IUCN', larg: 7 }, { rot: 'Lista BR', larg: 9 }, { rot: 'Exótica', larg: 8 }, { rot: 'Câmera', larg: 11 }, { rot: 'Tipo', larg: 11 }, { rot: 'Indivíduos', larg: 10, tipo: 'num', casas: 0 }, { rot: 'Evidência', larg: 50 }, { rot: 'Observação', larg: 40 }],
    linhas }]);
}

/* ===================================================================
   ENTRADA DO MÓDULO
   =================================================================== */
export const TELAS_FAUNA = ['faPainel', 'faRegistros', 'faEspecies', 'faCameras'];
const DESENHO = { faPainel: desenharPainel, faRegistros: desenharRegistros, faEspecies: desenharEspecies, faCameras: desenharCameras };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }

export async function abrirFauna(tela) {
  const alvo = $(idTela(tela));
  if (!alvo) return;
  telaAtual = tela;
  if (!F.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o monitoramento de animais…</p></div>';
    try { await carregar(); }
    catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o monitoramento: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgCf')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparFauna() {
  F.carregado = false; F.especies = []; F.cameras = []; F.regs = []; F.arq = new Set();
  nucleo.apagarCaixa(CAIXA);
  Object.assign(F.fp, { periodo: '12m', camera: '' });
  Object.assign(F.fr, { q: '', especie: '', camera: '', tipo: '', de: '', ate: '' });
  F.fe.q = '';
  telaAtual = ''; fechar();
}
/* Para testes. */
export const _cf = { F, resumo, ameacada, noturno, inicioPeriodo };
