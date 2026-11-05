// cert-desmatamento.js — Certificação › Desmatamento (FV-GFS 22.03.01), 05/11/2026.
//
// Pedido do Guilherme: "crie um submodulo sobre desmatamento, 2014 em diante,
// referente a fazenda faca, mostrando por ano". Base: o relatório
// "Monitoramento da Reserva Legal · 2014 a 2024 — Faz. Faca e Quilombo"
// (MapBiomas Coleção 10, PRODES Cerrado/INPE e CAR/SICAR, consultas de 13/10/2026).
//
// O painel mostra, ano a ano desde o marco de corte (1º/01/2014) até o ano
// atual: vegetação nativa na Reserva Legal, na APP e no imóvel, perdas do ano e
// os alertas PRODES daquele ano. Ano sem MapBiomas ainda aparece como
// "aguardando". Alerta que toca o imóvel fica "Pendente" até a verificação
// de campo (data + link da foto georreferenciada no OneDrive).
//
// Tabelas (supabase/cert-desmatamento.sql), trancadas por app_pode('cert'):
//  · cd_imoveis — fazenda, CAR, áreas, marco, conclusão
//  · cd_anos    — um ano por imóvel (MapBiomas)
//  · cd_alertas — polígonos PRODES e verificação de campo
// Sem internet: só consulta (cópia 'desmatamento.cache').

import { estado, novoId } from './store.js';
import * as nucleo from './nucleo.js';
import { mostrar } from './jornada-relatorios.js';
import { baixarXlsx } from './excel.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = v => String(v == null ? '' : v).trim();
const quem = () => estado.sessao?.user?.email || null;
const num = v => { const t = so(v); if (!t) return null; const n = parseFloat(t.replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (n, c = 2) => n == null || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const doisD = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };
const br = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const anoAtual = () => new Date().getFullYear();
const NORMA = 'FV-GFS 22.03.01';
const VERIF = ['Não se aplica', 'Pendente', 'Sem desmatamento', 'Desmatamento confirmado'];

/* ---------------- estado ---------------- */
const E = { carregado: false, imoveis: [], anos: [], alertas: [], imovel: '' };
const CAIXA = 'desmatamento.cache';
const salvarCaixa = () => nucleo.gravarCaixa(CAIXA, { imoveis: E.imoveis, anos: E.anos, alertas: E.alertas });

async function carregar() {
  const c0 = await nucleo.lerCaixa(CAIXA, null);
  if (c0 && !E.carregado) { Object.assign(E, { imoveis: c0.imoveis || [], anos: c0.anos || [], alertas: c0.alertas || [] }); E.carregado = true; }
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) {
    if (E.carregado) return;
    throw new Error('Sem internet e sem cópia do monitoramento neste aparelho.');
  }
  const [i, a, l] = await Promise.all([
    c.from('cd_imoveis').select('*').order('fazenda'),
    c.from('cd_anos').select('*').order('ano'),
    c.from('cd_alertas').select('*').order('ano', { ascending: false }),
  ]);
  const erro = i.error || a.error || l.error;
  if (erro && E.carregado) return;
  if (erro) {
    if (/cd_|relation|does not exist|schema cache/i.test(erro.message || '')) throw new Error('As tabelas do monitoramento ainda não foram criadas no banco (supabase/cert-desmatamento.sql).');
    throw erro;
  }
  E.imoveis = i.data || []; E.anos = a.data || []; E.alertas = l.data || []; E.carregado = true;
  salvarCaixa();
}

/* ===================================================================
   AS CONTAS
   =================================================================== */
const imovelAtual = () => E.imoveis.find(x => x.id === E.imovel) || E.imoveis.find(x => x.ativo) || E.imoveis[0] || null;
const anoMarco = im => Number(String(im?.marco || '2014').slice(0, 4));
const linhasAno = im => E.anos.filter(x => x.imovel_id === im.id).sort((a, b) => a.ano - b.ano);
const alertasDe = im => E.alertas.filter(x => x.imovel_id === im.id).sort((a, b) => b.ano - a.ano || (Number(a.distancia_m) || 0) - (Number(b.distancia_m) || 0));
const toca = al => Number(al.dentro_imovel) > 0 || Number(al.dentro_rl) > 0;

/* Situação de um ano: o pior entre MapBiomas e PRODES. */
function situacaoAno(reg, als) {
  const dentro = als.filter(toca);
  if (Number(reg?.perda_rl) > 0 || dentro.some(a => a.verificacao === 'Desmatamento confirmado'))
    return { cor: 'perigo', txt: 'Conversão na RL', nivel: 3 };
  if (dentro.some(a => a.verificacao === 'Pendente')) return { cor: 'alerta', txt: 'Alerta a verificar', nivel: 2 };
  if (Number(reg?.perda_imovel) > 0) return { cor: 'neutra', txt: 'Perda fora da RL', nivel: 1 };
  if (!reg) return dentro.length ? { cor: 'ativo', txt: 'Verificado em campo', nivel: 0 } : { cor: 'inativo', txt: 'Aguardando MapBiomas', nivel: -1 };
  return { cor: 'ativo', txt: 'Sem conversão', nivel: 0 };
}

function resumo(im) {
  const marco = anoMarco(im), ate = anoAtual();
  const regs = linhasAno(im), als = alertasDe(im);
  const porAno = [];
  for (let a = marco; a <= ate; a++) {
    const reg = regs.find(x => x.ano === a) || null;
    const al = als.filter(x => x.ano === a);
    porAno.push({ ano: a, reg, al, sit: situacaoAno(reg, al), pct: reg?.nativa_rl != null && im.rl_ha ? reg.nativa_rl / im.rl_ha * 100 : null });
  }
  const comDado = regs.filter(x => x.ano >= marco && x.nativa_imovel != null);
  const ini = comDado[0], fim = comDado[comDado.length - 1];
  const perdaRl = regs.filter(x => x.ano > marco).reduce((s, x) => s + (Number(x.perda_rl) || 0), 0);
  const perdaIm = regs.filter(x => x.ano > marco).reduce((s, x) => s + (Number(x.perda_imovel) || 0), 0);
  const pend = als.filter(a => a.ano >= marco && toca(a) && a.verificacao === 'Pendente');
  const confirmados = als.filter(a => a.ano >= marco && toca(a) && a.verificacao === 'Desmatamento confirmado');
  const antes = als.filter(a => a.ano < marco);
  return { marco, porAno, als, ini, fim, perdaRl, perdaIm, pend, confirmados, antes,
    variacao: ini && fim ? Number(fim.nativa_imovel) - Number(ini.nativa_imovel) : null,
    ultimoMb: regs.length ? regs[regs.length - 1].ano : null };
}

/* ===================================================================
   PEÇAS
   =================================================================== */
const tag = (txt, cor, title = '') => `<span class="tag ${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const opcoes = (lista, val, vazio) => (vazio != null ? `<option value="">${esc(vazio)}</option>` : '')
  + lista.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
const cabecalho = (titulo, dica, botao) => `<div class="barra entre" style="margin:0">
  <div><h2 style="margin:0">${esc(titulo)}</h2><p class="dica" style="margin:2px 0 0">${dica}</p></div>${botao || ''}</div>`;
const corVerif = v => ({ 'Pendente': 'alerta', 'Sem desmatamento': 'ativo', 'Desmatamento confirmado': 'perigo' }[v] || 'inativo');
const distTxt = al => toca(al) ? (Number(al.distancia_m) ? `${fmt(al.distancia_m, 0)} m` : 'na divisa') : al.distancia_m != null ? `${fmt(al.distancia_m, 0)} m` : '—';
function dialogo(html, ligar) {
  let d = $('dlgDs');
  if (!d) { d = document.createElement('dialog'); d.id = 'dlgDs'; d.className = 'rs-largo'; document.body.appendChild(d); }
  d.innerHTML = `<form method="dialog" onsubmit="return false">${html}</form>`;
  d.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  d.scrollTop = 0; ligar?.(d); return d;
}
const fechar = () => $('dlgDs')?.open && $('dlgDs').close();
const erroDlg = t => { const e = $('dsErro'); if (e) { e.innerHTML = t; e.hidden = false; } if ($('dlgDs')) $('dlgDs').scrollTop = 0; };
const precisaRede = () => { if (!navigator.onLine || !estado.cliente) { alert('Sem internet: gravar precisa de conexão. A consulta continua funcionando.'); return true; } return false; };
async function gravar(tabela, lista, atual, linha, botao) {
  if (precisaRede()) return null;
  if (botao) $(botao).disabled = true;
  try {
    const t = estado.cliente.from(tabela);
    const { data, error } = atual ? await t.update(linha).eq('id', atual.id).select().single() : await t.insert(linha).select().single();
    if (error) throw error;
    const i = lista.findIndex(x => x.id === data.id); if (i >= 0) lista[i] = data; else lista.push(data);
    salvarCaixa(); return data;
  } catch (e) {
    if (botao && $(botao)) $(botao).disabled = false;
    const m = String(e.message || e);
    erroDlg(/duplicate|unique/i.test(m) ? (tabela === 'cd_anos' ? 'Este ano já está lançado para o imóvel.' : 'Já existe um imóvel com esse nome.') : 'Não consegui gravar: ' + esc(m));
    return null;
  }
}
async function apagar(tabela, lista, item) {
  if (precisaRede()) return;
  const { error } = await estado.cliente.from(tabela).delete().eq('id', item.id);
  if (error) return erroDlg('Não consegui apagar: ' + esc(error.message));
  const i = lista.findIndex(x => x.id === item.id); if (i >= 0) lista.splice(i, 1);
  salvarCaixa(); fechar(); redesenhar();
}
const seletorImovel = (id) => E.imoveis.length > 1
  ? `<label class="campo">Imóvel <select id="${id}">${opcoes(E.imoveis.map(x => [x.id, x.fazenda]), imovelAtual()?.id)}</select></label>` : '';
const ligaSeletor = id => $(id)?.addEventListener('change', e => { E.imovel = e.target.value; redesenhar(); });

/* Gráfico em SVG: nativa na RL e no imóvel por ano + linha da RL declarada. */
function grafico(im, k, imprimir = false) {
  const pts = k.porAno.filter(x => x.reg?.nativa_imovel != null || x.reg?.nativa_rl != null);
  if (!pts.length) return '<div class="vazio">Sem dados anuais lançados.</div>';
  const W = 720, H = 230, e = 40, d = 12, t = 14, b = 28;
  const anos = k.porAno.map(x => x.ano);
  const vmax = Math.max(Number(im.rl_ha) || 0, ...pts.map(x => Number(x.reg.nativa_imovel) || 0), 1);
  const topo = Math.ceil(vmax * 1.12 / 10) * 10;
  const X = a => e + (anos.indexOf(a) + 0.5) * (W - e - d) / anos.length;
  const Y = v => t + (1 - v / topo) * (H - t - b);
  const linha = (campo, cor, forma) => {
    const p = pts.filter(x => x.reg[campo] != null);
    return `<polyline fill="none" stroke="${cor}" stroke-width="2.4" points="${p.map(x => `${X(x.ano).toFixed(1)},${Y(Number(x.reg[campo])).toFixed(1)}`).join(' ')}"/>`
      + p.map(x => forma === 'q'
        ? `<rect x="${(X(x.ano) - 4).toFixed(1)}" y="${(Y(Number(x.reg[campo])) - 4).toFixed(1)}" width="8" height="8" fill="${cor}"><title>${x.ano}: ${fmt(x.reg[campo])} ha</title></rect>`
        : `<circle cx="${X(x.ano).toFixed(1)}" cy="${Y(Number(x.reg[campo])).toFixed(1)}" r="4.2" fill="${cor}"><title>${x.ano}: ${fmt(x.reg[campo])} ha</title></circle>`).join('');
  };
  const grade = [0, .25, .5, .75, 1].map(f => { const v = topo * f; return `<line x1="${e}" x2="${W - d}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E4E6DE"/><text x="${e - 6}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="#8A8D86">${fmt(v, 0)}</text>`; }).join('');
  const rl = im.rl_ha ? `<line x1="${e}" x2="${W - d}" y1="${Y(im.rl_ha)}" y2="${Y(im.rl_ha)}" stroke="#51534A" stroke-dasharray="3 4"/>` : '';
  const alertas = k.porAno.filter(x => x.al.some(toca)).map(x => `<text x="${X(x.ano)}" y="${t + 10}" text-anchor="middle" font-size="12" fill="#C0392B"><title>Alerta PRODES que toca o imóvel</title>▲</text>`).join('');
  const eixo = anos.map(a => `<text x="${X(a)}" y="${H - 9}" text-anchor="middle" font-size="10.5" fill="#51534A">${a}</text>`).join('');
  return `<svg class="ds-graf${imprimir ? ' ds-graf-rel' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vegetação nativa por ano em hectares" font-family="Arial">
    ${grade}${rl}${linha('nativa_imovel', '#744F28', 'q')}${linha('nativa_rl', '#84BD00', 'c')}${alertas}${eixo}</svg>
    <p class="dica ds-leg"><span class="en-leg" style="background:#84BD00"></span> nativa na Reserva Legal
      <span class="en-leg" style="background:#744F28"></span> nativa no imóvel
      <span class="ds-traco"></span> RL declarada no CAR (${fmt(im.rl_ha, 1)} ha)
      <span style="color:#C0392B;margin-left:8px">▲</span> alerta PRODES no imóvel · hectares</p>`;
}

function tabelaAnos(im, k, imprimir = false) {
  const cls = imprimir ? 'rel-tabela' : 'dc-planilha';
  const ce = imprimir ? 'rel-num' : 'ce';
  const linhas = k.porAno.slice().reverse().map(x => {
    const r = x.reg;
    const alDentro = x.al.filter(toca), alFora = x.al.filter(a => !toca(a));
    const prodes = !x.al.length ? '<span class="dica">nenhum</span>'
      : [alDentro.length ? `${alDentro.length} no imóvel (${fmt(alDentro.reduce((s, a) => s + (Number(a.dentro_imovel) || 0), 0))} ha)` : '',
        alFora.length ? `${alFora.length} no entorno` : ''].filter(Boolean).join(' · ');
    const perda = (v, n) => v == null ? '—' : Number(v) > 0 ? `<b class="ds-perda">${fmt(v)}</b>` : fmt(v);
    return `<tr class="${x.sit.nivel >= 2 ? 'ds-l-alerta' : x.sit.nivel === -1 ? 'ds-l-vazia' : ''}"${imprimir ? '' : ` data-ano="${x.ano}" title="Abrir ${x.ano}"`}>
      <td class="${ce}"><b>${x.ano}</b></td>
      <td class="${ce}">${r ? fmt(r.nativa_rl) : '—'}</td><td class="${ce}">${x.pct != null ? fmt(x.pct) + '%' : '—'}</td>
      <td class="${ce}">${r ? fmt(r.nativa_app) : '—'}</td><td class="${ce}">${r ? fmt(r.nativa_imovel) : '—'}</td>
      <td class="${ce}">${perda(r?.perda_rl)}</td><td class="${ce}">${perda(r?.perda_imovel)}</td>
      <td>${prodes}</td><td>${tag(x.sit.txt, x.sit.cor)}</td>
      ${imprimir ? '' : `<td><small>${esc(r?.observacao || '')}</small></td>`}</tr>`;
  }).join('');
  return `<table class="${cls} ds-anos"><thead><tr><th class="${ce}">Ano</th><th class="${ce}">Nativa na RL (ha)</th><th class="${ce}">% da RL</th><th class="${ce}">Nativa na APP (ha)</th>
    <th class="${ce}">Nativa no imóvel (ha)</th><th class="${ce}">Perda na RL</th><th class="${ce}">Perda no imóvel</th><th>Alertas PRODES</th><th>Situação</th>${imprimir ? '' : '<th>Observação</th>'}</tr></thead>
    <tbody>${linhas}
    <tr class="en-total"><td class="${ce}">${k.marco}–${k.ultimoMb || k.marco}</td><td class="${ce}">${k.fim ? fmt(k.fim.nativa_rl) : '—'}</td><td class="${ce}"></td><td class="${ce}"></td>
      <td class="${ce}">${k.variacao != null ? (k.variacao >= 0 ? '+' : '') + fmt(k.variacao) : '—'}</td><td class="${ce}">${fmt(k.perdaRl)}</td><td class="${ce}">${fmt(k.perdaIm)}</td>
      <td colspan="${imprimir ? 2 : 3}">Total de perdas no período e variação da nativa no imóvel</td></tr></tbody></table>`;
}

function tabelaAlertas(k, imprimir = false) {
  const cls = imprimir ? 'rel-tabela' : 'dc-planilha', ce = imprimir ? 'rel-num' : 'ce';
  const l = k.als.filter(a => a.ano >= k.marco);
  if (!l.length) return '<div class="vazio">Nenhum polígono PRODES de ' + k.marco + ' em diante.</div>';
  return `<table class="${cls}"><thead><tr><th class="${ce}">Ano</th><th class="${ce}">Data da imagem</th><th class="${ce}">Área total</th><th class="${ce}">Dentro do imóvel</th><th class="${ce}">Dentro da RL</th><th class="${ce}">Distância</th><th>Verificação</th>${imprimir ? '' : '<th></th>'}</tr></thead><tbody>
    ${l.map(a => `<tr class="${toca(a) && a.verificacao === 'Pendente' ? 'ds-l-alerta' : ''}"><td class="${ce}"><b>${a.ano}</b></td><td class="${ce}">${br(a.data_imagem)}</td><td class="${ce}">${fmt(a.area_total)} ha</td>
      <td class="${ce}">${fmt(a.dentro_imovel)} ha</td><td class="${ce}">${fmt(a.dentro_rl)} ha</td><td class="${ce}">${distTxt(a)}</td>
      <td>${tag(a.verificacao, corVerif(a.verificacao))}${a.verificado_em ? ` <small>em ${br(a.verificado_em)}</small>` : ''}${a.link_evidencia && !imprimir ? ` <a href="${esc(a.link_evidencia)}" target="_blank" rel="noopener">evidência</a>` : ''}
        ${a.observacao ? `<br><small>${esc(a.observacao)}</small>` : ''}</td>
      ${imprimir ? '' : `<td class="ce"><button class="btn mini" type="button" data-al="${esc(a.id)}">${toca(a) && a.verificacao === 'Pendente' ? 'Verificar' : 'Abrir'}</button></td>`}</tr>`).join('')}
    </tbody></table>`;
}

/* ===================================================================
   TELA · POR ANO
   =================================================================== */
function desenharPainel() {
  const tela = $('telaDsPainel');
  const im = imovelAtual();
  if (!im) {
    tela.innerHTML = `<div class="cartao">${cabecalho('Desmatamento', `${NORMA} · nenhum imóvel cadastrado`, '<button class="btn principal" type="button" id="dsNovoIm">Cadastrar imóvel</button>')}</div>`;
    $('dsNovoIm').addEventListener('click', () => formImovel(null)); return;
  }
  const k = resumo(im);
  const cartao = (cor, rot, val, dica, alvo) => `<button type="button" class="pv-card pv-${cor}" ${alvo ? `data-ir="${alvo}"` : ''}><span>${esc(rot)}</span><strong>${val}</strong><small>${esc(dica)}</small></button>`;
  const semConv = !k.perdaRl && !k.confirmados.length;
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho(`Desmatamento · ${im.fazenda}`, `${NORMA} · sem conversão de vegetação nativa desde ${br(im.marco)} · ano a ano até ${anoAtual()}`,
      `<button class="btn" type="button" id="dsNovoAno">Lançar ano</button>`)}
    ${E.imoveis.length > 1 ? `<div class="grade larga" style="margin-top:12px">${seletorImovel('dsIm')}</div>` : ''}
    <div class="pv-cards" style="margin-top:12px">
      ${cartao('calma', 'Reserva Legal no CAR', fmt(im.rl_ha, 1) + ' ha', `APP ${fmt(im.app_ha, 1)} ha · imóvel ${fmt(im.area_imovel, 1)} ha`, 'imovel')}
      ${cartao(semConv ? 'ok' : 'perigo', 'Nativa convertida na RL', fmt(k.perdaRl) + ' ha', `${k.marco} → ${k.ultimoMb || '—'}`)}
      ${cartao('calma', 'Nativa na RL', k.fim ? fmt(k.fim.nativa_rl) + ' ha' : '—', k.fim ? `em ${k.fim.ano} (MapBiomas)` : 'sem dado')}
      ${cartao(k.variacao != null && k.variacao >= 0 ? 'ok' : 'alerta', 'Variação da nativa no imóvel', k.variacao == null ? '—' : (k.variacao >= 0 ? '+' : '') + fmt(k.variacao) + ' ha', `${k.ini?.ano || ''} → ${k.fim?.ano || ''}`)}
      ${cartao(k.pend.length ? 'alerta' : 'ok', 'Alertas PRODES a verificar', String(k.pend.length), k.pend.length ? k.pend.map(a => `${a.ano}: ${fmt(a.dentro_rl || a.dentro_imovel)} ha`).join(' · ') : 'nenhum pendente', 'alertas')}
      ${cartao(k.ultimoMb && k.ultimoMb < anoAtual() - 1 ? 'atencao' : 'calma', 'Último ano no MapBiomas', String(k.ultimoMb || '—'), k.ultimoMb ? `de ${k.ultimoMb + 1} em diante: PRODES e imagens` : 'lançar os anos')}
    </div>
    ${k.pend.length ? `<div class="aviso" style="margin-top:12px"><b>Pendência:</b> ${k.pend.map(a => `alerta PRODES ${a.ano} com ${fmt(a.dentro_rl || a.dentro_imovel)} ha ${Number(a.dentro_rl) > 0 ? 'dentro da Reserva Legal' : 'dentro do imóvel'}`).join('; ')} — conferir em campo e registrar a foto georreferenciada (link do OneDrive) em <b>Verificar</b>.</div>` : ''}
    <div class="qp-bloco"><h3>Vegetação nativa ano a ano</h3>${grafico(im, k)}</div>
    <div class="qp-bloco"><h3>Por ano</h3><p class="dica" style="margin:0 0 6px">Toque num ano para lançar ou corrigir os números do MapBiomas.</p>
      <div class="ac-rola">${tabelaAnos(im, k)}</div>
      <p class="dica" style="margin-top:6px">Vegetação nativa = formação florestal, savânica e campestre. Perda = área nativa no ano anterior classificada como uso agropecuário no ano. Áreas por fração de pixel de 30 m (≈ 0,084 ha) dentro dos polígonos do CAR.</p></div>
    <div class="qp-bloco"><h3>Alertas PRODES no imóvel e no entorno</h3><div class="ac-rola">${tabelaAlertas(k)}</div>
      ${k.antes.length ? `<p class="dica" style="margin-top:6px">Antes de ${k.marco}, dentro do perímetro: ${k.antes.sort((a, b) => a.ano - b.ano).map(a => `${fmt(a.dentro_imovel)} ha (${a.ano})`).join(', ')} — anteriores ao marco de corte.</p>` : ''}</div>
    <div class="qp-bloco"><h3>Conclusão para o item ${NORMA}</h3>
      <p>${esc(im.conclusao || 'Ainda sem conclusão registrada.')}</p>
      ${im.link_relatorio ? `<p><a href="${esc(im.link_relatorio)}" target="_blank" rel="noopener">Abrir o relatório completo (mapas e imagens)</a></p>` : ''}
      <p class="dica">CAR ${esc(im.car || '—')}${im.situacao_car ? ` · ${esc(im.situacao_car)}` : ''}. Fontes: MapBiomas Coleção 10, PRODES Cerrado (INPE/TerraBrasilis), CAR/SICAR.</p></div>
  </div>
  <div class="rodape-fixo naoimprimir">
    <button class="btn principal" type="button" id="dsImp">Imprimir</button>
    <button class="btn" type="button" id="dsXlsx">Excel</button>
    <button class="btn" type="button" id="dsEdIm">Dados do imóvel</button>
  </div>`;
  ligaSeletor('dsIm');
  $('dsNovoAno').addEventListener('click', () => formAno(im, null, Math.min(anoAtual(), (k.ultimoMb || k.marco - 1) + 1)));
  $('dsImp').addEventListener('click', () => mostrar(docPainel(im, k), { barra: true }));
  $('dsXlsx').addEventListener('click', () => exportar(im, k));
  $('dsEdIm').addEventListener('click', () => formImovel(im));
  tela.querySelectorAll('tr[data-ano]').forEach(tr => tr.addEventListener('click', () => {
    const a = Number(tr.dataset.ano); formAno(im, linhasAno(im).find(x => x.ano === a) || null, a); }));
  tela.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => formAlerta(im, E.alertas.find(x => x.id === b.dataset.al))));
  tela.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.ir === 'imovel') return formImovel(im);
    if (b.dataset.ir === 'alertas') { const p = k.pend[0]; if (p) formAlerta(im, p); }
  }));
}

/* ===================================================================
   TELA · ALERTAS PRODES
   =================================================================== */
function desenharAlertas() {
  const tela = $('telaDsAlertas');
  const im = imovelAtual();
  if (!im) { tela.innerHTML = '<div class="cartao"><div class="vazio">Cadastre o imóvel na aba Por ano.</div></div>'; return; }
  const k = resumo(im);
  const antes = k.als.filter(a => a.ano < k.marco);
  tela.innerHTML = `<div class="cartao naoimprimir">
    ${cabecalho('Alertas PRODES', `${im.fazenda} · polígonos de desmatamento do INPE que tocam o imóvel ou o entorno. O que cai dentro do imóvel precisa de verificação de campo.`,
      `<button class="btn principal" type="button" id="daNovo">Novo alerta</button>`)}
    ${E.imoveis.length > 1 ? `<div class="grade larga" style="margin-top:12px">${seletorImovel('daIm')}</div>` : ''}
    <div class="ac-rola" style="margin-top:12px">${tabelaAlertas(k)}</div>
    ${antes.length ? `<div class="qp-bloco"><h3>Antes do marco de corte (${br(im.marco)})</h3><div class="ac-rola"><table class="dc-planilha"><thead><tr><th class="ce">Ano</th><th class="ce">Dentro do imóvel</th><th>Observação</th><th></th></tr></thead><tbody>
      ${antes.sort((a, b) => a.ano - b.ano).map(a => `<tr><td class="ce">${a.ano}</td><td class="ce">${fmt(a.dentro_imovel)} ha</td><td><small>${esc(a.observacao || '')}</small></td><td class="ce"><button class="btn mini" type="button" data-al="${esc(a.id)}">Abrir</button></td></tr>`).join('')}
      </tbody></table></div><p class="dica" style="margin-top:6px">Não contam para o ${NORMA}: a norma olha conversão de ${k.marco} em diante.</p></div>` : ''}
    <p class="dica" style="margin-top:10px">Consulta: TerraBrasilis/INPE, camada prodes-cerrado-nb:yearly_deforestation. Novos polígonos saem uma vez por ano.</p>
  </div>`;
  ligaSeletor('daIm');
  $('daNovo').addEventListener('click', () => formAlerta(im, null));
  tela.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => formAlerta(im, E.alertas.find(x => x.id === b.dataset.al))));
}

/* ===================================================================
   FORMULÁRIOS
   =================================================================== */
const campoNum = (id, rot, v, dica = '') => `<label class="campo">${rot}${dica ? ` <span class="dica">${dica}</span>` : ''}<input type="text" inputmode="decimal" id="${id}" value="${v == null ? '' : esc(String(v).replace('.', ','))}"></label>`;

function formAno(im, r, ano) {
  const v = r || { ano, nativa_rl: '', nativa_app: '', nativa_imovel: '', perda_rl: '', perda_imovel: '', fonte: 'MapBiomas Coleção 10', observacao: '' };
  const als = alertasDe(im).filter(a => a.ano === v.ano);
  dialogo(`<h3>${im.fazenda} · ${r ? 'ano ' + v.ano : 'lançar ano'}</h3>
    <div class="aviso erro" id="dsErro" hidden></div>
    <div class="grade">
      <label class="campo">Ano <input type="number" id="daAno" value="${esc(v.ano)}" min="1985" max="${anoAtual()}" ${r ? 'disabled' : ''}></label>
      <label class="campo">Fonte <input type="text" id="daFonte" value="${esc(v.fonte || '')}"></label>
      ${campoNum('daRl', 'Nativa na RL', v.nativa_rl, '(ha)')}
      ${campoNum('daApp', 'Nativa na APP', v.nativa_app, '(ha)')}
      ${campoNum('daIm', 'Nativa no imóvel', v.nativa_imovel, '(ha)')}
      <label class="campo">% da RL <input type="text" id="daPct" disabled></label>
      ${campoNum('daPrl', 'Perda na RL no ano', v.perda_rl, '(ha)')}
      ${campoNum('daPim', 'Perda no imóvel no ano', v.perda_imovel, '(ha)')}
    </div>
    <label class="campo">Observação <textarea id="daObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    ${als.length ? `<p class="dica">Alertas PRODES deste ano: ${als.map(a => `${fmt(a.area_total)} ha a ${distTxt(a)} (${a.verificacao})`).join(' · ')}. Edite na aba Alertas PRODES.</p>` : ''}
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="daApagar">Apagar ano</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="daOk">Gravar</button></div></div>`, () => {
    const pct = () => { const n = num($('daRl').value); $('daPct').value = n != null && im.rl_ha ? fmt(n / im.rl_ha * 100) + '%' : ''; };
    $('daRl').addEventListener('input', pct); pct();
    $('daOk').addEventListener('click', async () => {
      const a = Number($('daAno').value);
      if (!(a >= 1985 && a <= anoAtual())) return erroDlg('Informe o ano.');
      if (!r && linhasAno(im).some(x => x.ano === a)) return erroDlg('Este ano já está lançado: abra ele na tabela.');
      const l = { nativa_rl: num($('daRl').value), nativa_app: num($('daApp').value), nativa_imovel: num($('daIm').value),
        perda_rl: num($('daPrl').value), perda_imovel: num($('daPim').value), fonte: so($('daFonte').value) || null, observacao: so($('daObs').value) || null };
      if ([l.nativa_rl, l.nativa_imovel].every(x => x == null)) return erroDlg('Informe ao menos a nativa na RL ou no imóvel.');
      const s = await gravar('cd_anos', E.anos, r, r ? { ...l, atualizado_por: quem() } : { id: novoId(), imovel_id: im.id, ano: a, ...l, criado_por: quem() }, 'daOk');
      if (s) { fechar(); redesenhar(); }
    });
    $('daApagar')?.addEventListener('click', () => { if (confirm(`Apagar os números de ${v.ano}?`)) apagar('cd_anos', E.anos, r); });
  });
}

function formAlerta(im, r) {
  const v = r || { ano: anoAtual(), data_imagem: '', area_total: '', dentro_imovel: '', dentro_rl: '', distancia_m: '', fonte: 'PRODES Cerrado (INPE)', verificacao: 'Não se aplica', verificado_em: '', link_evidencia: '', observacao: '' };
  dialogo(`<h3>${r ? `Alerta PRODES ${v.ano}` : 'Novo alerta PRODES'} · ${esc(im.fazenda)}</h3>
    <div class="aviso erro" id="dsErro" hidden></div>
    <div class="np-passo">1 · O polígono</div>
    <div class="grade">
      <label class="campo">Ano <input type="number" id="alAno" value="${esc(v.ano)}" min="1985" max="${anoAtual()}"></label>
      <label class="campo">Data da imagem <input type="date" id="alData" value="${esc(v.data_imagem || '')}"></label>
      ${campoNum('alTot', 'Área total', v.area_total, '(ha)')}
      ${campoNum('alIm', 'Dentro do imóvel', v.dentro_imovel, '(ha)')}
      ${campoNum('alRl', 'Dentro da RL', v.dentro_rl, '(ha)')}
      <label class="campo">Distância da divisa <span class="dica">(m · 0 = na divisa)</span><input type="number" id="alDist" value="${esc(v.distancia_m ?? '')}" min="0"></label>
    </div>
    <label class="campo">Fonte <input type="text" id="alFonte" value="${esc(v.fonte || '')}"></label>
    <div class="np-passo">2 · Verificação de campo</div>
    <div class="grade">
      <label class="campo">Situação <select id="alVer">${opcoes(VERIF, v.verificacao)}</select></label>
      <label class="campo">Verificado em <input type="date" id="alVerEm" value="${esc(v.verificado_em || '')}" max="${hoje()}"></label>
    </div>
    <label class="campo">Link da evidência <span class="dica">(foto georreferenciada no OneDrive)</span><input type="url" id="alLink" value="${esc(v.link_evidencia || '')}" placeholder="https://…"></label>
    <label class="campo">Observação <textarea id="alObs" rows="3">${esc(v.observacao || '')}</textarea></label>
    <div class="barra entre"><div>${r ? '<button class="btn perigo" type="button" id="alApagar">Apagar</button>' : ''}</div>
      <div class="barra fim" style="margin:0"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="alOk">Gravar</button></div></div>`, () => {
    /* Tocou o imóvel e estava "Não se aplica": passa a Pendente sozinho. */
    const ajusta = () => { const t = (num($('alIm').value) || 0) > 0 || (num($('alRl').value) || 0) > 0;
      if (t && $('alVer').value === 'Não se aplica') $('alVer').value = 'Pendente'; };
    $('alIm').addEventListener('change', ajusta); $('alRl').addEventListener('change', ajusta);
    $('alVer').addEventListener('change', () => { if (/Sem|confirmado/.test($('alVer').value) && !$('alVerEm').value) $('alVerEm').value = hoje(); });
    $('alOk').addEventListener('click', async () => {
      const ano = Number($('alAno').value);
      if (!(ano >= 1985 && ano <= anoAtual())) return erroDlg('Informe o ano.');
      const l = { ano, data_imagem: $('alData').value || null, area_total: num($('alTot').value), dentro_imovel: num($('alIm').value), dentro_rl: num($('alRl').value),
        distancia_m: $('alDist').value === '' ? null : Math.round(Number($('alDist').value)), fonte: so($('alFonte').value) || null,
        verificacao: $('alVer').value, verificado_em: $('alVerEm').value || null, link_evidencia: so($('alLink').value) || null, observacao: so($('alObs').value) || null };
      if (/Sem desmatamento|confirmado/.test(l.verificacao) && !l.verificado_em) return erroDlg('Informe a data da verificação de campo.');
      if (l.link_evidencia && !/^https?:\/\//i.test(l.link_evidencia)) return erroDlg('O link precisa começar com https://');
      const s = await gravar('cd_alertas', E.alertas, r, r ? { ...l, atualizado_por: quem() } : { id: novoId(), imovel_id: im.id, ...l, criado_por: quem() }, 'alOk');
      if (s) { fechar(); redesenhar(); }
    });
    $('alApagar')?.addEventListener('click', () => { if (confirm('Apagar este alerta?')) apagar('cd_alertas', E.alertas, r); });
  });
}

function formImovel(im) {
  const v = im || { fazenda: '', car: '', situacao_car: '', area_imovel: '', rl_ha: '', app_ha: '', marco: '2014-01-01', conclusao: '', link_relatorio: '', observacao: '', ativo: true };
  dialogo(`<h3>${im ? 'Dados do imóvel' : 'Novo imóvel monitorado'}</h3>
    <div class="aviso erro" id="dsErro" hidden></div>
    <div class="grade">
      <label class="campo">Fazenda <input type="text" id="imFaz" value="${esc(v.fazenda)}"></label>
      <label class="campo">Marco de corte <input type="date" id="imMarco" value="${esc(String(v.marco).slice(0, 10))}"></label>
      <label class="campo">Nº do CAR <input type="text" id="imCar" value="${esc(v.car || '')}"></label>
      <label class="campo">Situação do CAR <input type="text" id="imSit" value="${esc(v.situacao_car || '')}" placeholder="Ex.: Aguardando análise"></label>
      ${campoNum('imArea', 'Área do imóvel', v.area_imovel, '(ha)')}
      ${campoNum('imRl', 'Reserva Legal', v.rl_ha, '(ha)')}
      ${campoNum('imApp', 'APP', v.app_ha, '(ha)')}
    </div>
    <label class="campo">Conclusão para o ${NORMA} <textarea id="imConc" rows="4">${esc(v.conclusao || '')}</textarea></label>
    <label class="campo">Link do relatório completo <span class="dica">(PDF com mapas, no OneDrive)</span><input type="url" id="imLink" value="${esc(v.link_relatorio || '')}" placeholder="https://…"></label>
    <label class="campo">Observação <textarea id="imObs" rows="2">${esc(v.observacao || '')}</textarea></label>
    <label class="campo rs-check"><input type="checkbox" id="imAtivo" ${v.ativo ? 'checked' : ''}> Ativo</label>
    <div class="barra fim"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn principal" type="button" id="imOk">Salvar</button></div>`, () => {
    $('imOk').addEventListener('click', async () => {
      const l = { fazenda: so($('imFaz').value), marco: $('imMarco').value || '2014-01-01', car: so($('imCar').value) || null, situacao_car: so($('imSit').value) || null,
        area_imovel: num($('imArea').value), rl_ha: num($('imRl').value), app_ha: num($('imApp').value), conclusao: so($('imConc').value) || null,
        link_relatorio: so($('imLink').value) || null, observacao: so($('imObs').value) || null, ativo: $('imAtivo').checked };
      if (!l.fazenda) return erroDlg('Informe a fazenda.');
      if (l.link_relatorio && !/^https?:\/\//i.test(l.link_relatorio)) return erroDlg('O link precisa começar com https://');
      const s = await gravar('cd_imoveis', E.imoveis, im, im ? { ...l, atualizado_por: quem() } : { id: novoId(), ...l, criado_por: quem() }, 'imOk');
      if (s) { E.imovel = s.id; fechar(); redesenhar(); }
    });
  });
}

/* ===================================================================
   IMPRESSO E EXCEL
   =================================================================== */
function docPainel(im, k) {
  return `<article class="rel rel-paisagem">
    <header class="rel-cabecalho"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios">
      <div class="rel-titulo"><h1>Monitoramento de desmatamento · ${k.marco} a ${anoAtual()}</h1><p>${esc(im.fazenda)} · CAR ${esc(im.car || '—')}</p></div>
      <div class="rel-comp"><span>emitido em</span><strong>${br(hoje())}</strong><span>${NORMA}</span></div></header>
    <div class="rel-qkpis">
      <div><span>Reserva Legal no CAR</span><strong>${fmt(im.rl_ha, 1)}</strong><small>ha</small></div>
      <div class="${k.perdaRl ? 'rel-q--bom-t' : 'rel-q--otimo-t'}"><span>Nativa convertida na RL</span><strong>${fmt(k.perdaRl)}</strong><small>ha · ${k.marco}→${k.ultimoMb || ''}</small></div>
      <div><span>Nativa na RL</span><strong>${k.fim ? fmt(k.fim.nativa_rl) : '—'}</strong><small>ha em ${k.fim?.ano || '—'}</small></div>
      <div class="rel-q--otimo-t"><span>Variação no imóvel</span><strong>${k.variacao == null ? '—' : (k.variacao >= 0 ? '+' : '') + fmt(k.variacao)}</strong><small>ha</small></div>
      <div class="${k.pend.length ? 'rel-q--bom-t' : ''}"><span>Alertas a verificar</span><strong>${k.pend.length}</strong><small>PRODES no imóvel</small></div>
    </div>
    <p class="rel-secao">Vegetação nativa ano a ano (ha)</p>${grafico(im, k, true)}
    <p class="rel-secao">Por ano</p>${tabelaAnos(im, k, true)}
    <p class="rel-nota">Vegetação nativa = formação florestal, savânica e campestre (MapBiomas). Perda = área nativa no ano anterior classificada como uso agropecuário no ano. Ano sem MapBiomas: coberto pelo PRODES e pelas imagens.</p>
    <p class="rel-secao">Polígonos PRODES (${k.marco} em diante)</p>${tabelaAlertas(k, true)}
    ${k.antes.length ? `<p class="rel-nota">Antes de ${k.marco}, dentro do perímetro: ${k.antes.slice().sort((a, b) => a.ano - b.ano).map(a => `${fmt(a.dentro_imovel)} ha (${a.ano})`).join(', ')} — anteriores ao marco de corte.</p>` : ''}
    <p class="rel-secao">Conclusão para o item ${NORMA}</p><p class="ds-conc">${esc(im.conclusao || '—')}</p>
    ${k.pend.length ? `<p class="ds-conc"><b>Pendência:</b> ${k.pend.map(a => `alerta PRODES ${a.ano} com ${fmt(a.dentro_rl || a.dentro_imovel)} ha ${Number(a.dentro_rl) > 0 ? 'na Reserva Legal' : 'no imóvel'}`).join('; ')} — verificar em campo com foto georreferenciada.</p>` : ''}
    <p class="rel-nota">Fontes: MapBiomas Coleção 10 (30 m), PRODES Cerrado – INPE (TerraBrasilis), CAR/SICAR${im.situacao_car ? ` (${esc(im.situacao_car)})` : ''}.</p>
    <footer class="rel-rodape"><img src="img/lop-marca.png" alt="LOP"><span class="rel-lop">Inteligência para o agronegócio</span></footer></article>`;
}
async function exportar(im, k) {
  const anos = k.porAno.map(x => [x.ano, x.reg?.nativa_rl ?? '', x.pct ?? '', x.reg?.nativa_app ?? '', x.reg?.nativa_imovel ?? '', x.reg?.perda_rl ?? '', x.reg?.perda_imovel ?? '',
    x.al.filter(toca).length, x.al.filter(a => !toca(a)).length, x.sit.txt, x.reg?.observacao || '']);
  const als = k.als.map(a => [a.ano, a.data_imagem || '', a.area_total ?? '', a.dentro_imovel ?? '', a.dentro_rl ?? '', a.distancia_m ?? '', a.verificacao, a.verificado_em || '', a.link_evidencia || '', a.observacao || '']);
  const sub = `SAKUMA Agronegócios · ${im.fazenda} · CAR ${im.car || '—'} · emitido em ${br(hoje())}`;
  await baixarXlsx(`desmatamento-${im.fazenda.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${hoje()}.xlsx`, [
    { nome: 'Por ano', titulo: `Desmatamento por ano — ${NORMA}`, subtitulo: sub,
      colunas: [{ rot: 'Ano', larg: 7 }, { rot: 'Nativa na RL (ha)', larg: 14, tipo: 'num', casas: 2 }, { rot: '% da RL', larg: 9, tipo: 'num', casas: 2 }, { rot: 'Nativa na APP (ha)', larg: 14, tipo: 'num', casas: 2 },
        { rot: 'Nativa no imóvel (ha)', larg: 16, tipo: 'num', casas: 2 }, { rot: 'Perda na RL (ha)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Perda no imóvel (ha)', larg: 15, tipo: 'num', casas: 2 },
        { rot: 'Alertas no imóvel', larg: 12 }, { rot: 'Alertas no entorno', larg: 12 }, { rot: 'Situação', larg: 20 }, { rot: 'Observação', larg: 40 }], linhas: anos },
    { nome: 'Alertas PRODES', titulo: 'Polígonos PRODES Cerrado', subtitulo: sub,
      colunas: [{ rot: 'Ano', larg: 7 }, { rot: 'Data da imagem', larg: 12, tipo: 'data' }, { rot: 'Área total (ha)', larg: 12, tipo: 'num', casas: 2 }, { rot: 'Dentro do imóvel (ha)', larg: 14, tipo: 'num', casas: 2 },
        { rot: 'Dentro da RL (ha)', larg: 13, tipo: 'num', casas: 2 }, { rot: 'Distância (m)', larg: 11, tipo: 'num', casas: 0 }, { rot: 'Verificação', larg: 20 }, { rot: 'Verificado em', larg: 12, tipo: 'data' },
        { rot: 'Evidência', larg: 30 }, { rot: 'Observação', larg: 50 }], linhas: als },
  ]);
}

/* ===================================================================
   ENTRADA
   =================================================================== */
export const TELAS_DESMATAMENTO = ['dsPainel', 'dsAlertas'];
const DESENHO = { dsPainel: desenharPainel, dsAlertas: desenharAlertas };
const idTela = t => 'tela' + t[0].toUpperCase() + t.slice(1);
let telaAtual = '';
function redesenhar() { DESENHO[telaAtual]?.(); }
export async function abrirDesmatamento(tela) {
  const alvo = $(idTela(tela)); if (!alvo) return;
  telaAtual = tela;
  if (!E.carregado) {
    alvo.innerHTML = '<div class="cartao"><p class="dica">Carregando o monitoramento de desmatamento…</p></div>';
    try { await carregar(); } catch (e) { alvo.innerHTML = `<div class="cartao"><div class="aviso erro">Não consegui abrir o monitoramento: ${esc(e.message || e)}</div></div>`; return; }
  } else if (navigator.onLine) carregar().then(() => { if (telaAtual === tela && !$('dlgDs')?.open) redesenhar(); }).catch(() => {});
  if (telaAtual === tela) redesenhar();
}
export function limparDesmatamento() {
  Object.assign(E, { carregado: false, imoveis: [], anos: [], alertas: [], imovel: '' });
  nucleo.apagarCaixa(CAIXA); telaAtual = ''; fechar();
}
export const _cd = { E, resumo, situacaoAno };
