// painel.js — Painel da safra e Comparativo de safras (20/10/2026).
//
// Os mesmos números dos painéis das planilhas (Dashboard v2 da cenoura,
// Dashboard do café, PAINEL do milho/trigo, Indicadores da batata), agora
// com a mesma cara para todas as culturas e o que é próprio de cada uma:
// % lavada/suja e AAA (cenoura), % Extra (batata), rendimento kg/saca e
// BX/BM/ESC (café), umidade e impureza (grãos).
import { $, esc, pronto, carregando, culturaSel, safraSel, safrasDe, todos, ativos, classes, campos, unidadeRot, rotArea, rotAreaPl,
  Maiusc, resumoSafra, porFazenda, porDia, nomePlantio, nomeCurto, dataBR, dataCurta, num, pct, conferir, cargasDa, somar } from './dados.js';
import { montarPdf, enviarWhatsapp, botaoZap } from './pdf.js';
import { baixarXlsx } from '../../js/excel.js';

/* Rótulo curto para baixo da barra: "Pl 21", "Q4", "Pivot 2" (a fazenda vai na segunda linha). */
const curto = p => { const n = String(p.nome || ''); return (n.length <= 9 ? n : (p.setor || n)).slice(0, 12); };
const vazio = (msg) => `<div class="cartao"><div class="vazio">${msg}</div></div>`;

/* ---- gráficos SVG simples (cores SAKUMA; sem biblioteca) ---- */
function barras(itens, { cor = '#84BD00', fmt = v => num(v, 0), altura = 180, destaque = null } = {}) {
  if (!itens.length) return '<div class="vazio">Sem dados.</div>';
  const max = Math.max(...itens.map(i => i.v), 1);
  const L = Math.max(320, itens.length * 64), A = altura, base = A - 34, topo = 18;
  const w = L / itens.length;
  return `<svg class="cp-graf" viewBox="0 0 ${L} ${A}" role="img" preserveAspectRatio="xMinYMid meet">
    <line x1="0" y1="${base}" x2="${L}" y2="${base}" class="eixo"/>
    ${itens.map((it, i) => {
      const h = (it.v / max) * (base - topo), x = i * w + w * 0.2, bw = w * 0.6;
      const c = it.cor || (destaque && destaque(it) ? '#744F28' : cor);
      return `<g><title>${esc(it.r)}: ${esc(fmt(it.v))}</title>
        <rect x="${x}" y="${base - h}" width="${bw}" height="${Math.max(h, 0.5)}" rx="3" fill="${c}"/>
        <text x="${x + bw / 2}" y="${base - h - 5}" class="val">${esc(fmt(it.v))}</text>
        <text x="${x + bw / 2}" y="${base + 14}" class="rot">${esc(it.r)}</text>
        ${it.r2 ? `<text x="${x + bw / 2}" y="${base + 26}" class="rot2">${esc(it.r2)}</text>` : ''}</g>`;
    }).join('')}
  </svg>`;
}
function linhaDias(pontos, fmt) {
  if (pontos.length < 2) return '';
  const L = 560, A = 150, base = 124, topo = 14, esq = 8;
  const max = Math.max(...pontos.map(p => p[1]), 1);
  const passo = (L - esq * 2) / (pontos.length - 1);
  const xy = pontos.map((p, i) => [esq + i * passo, base - (p[1] / max) * (base - topo)]);
  const cada = Math.ceil(pontos.length / 9);
  return `<svg class="cp-graf" viewBox="0 0 ${L} ${A}" role="img" preserveAspectRatio="none">
    <line x1="0" y1="${base}" x2="${L}" y2="${base}" class="eixo"/>
    ${pontos.map((p, i) => { const [x, y] = xy[i]; const bw = Math.max(2, passo * 0.6);
      return `<g><title>${esc(dataBR(p[0]))}: ${esc(fmt(p[1]))}</title><rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${base - y}" fill="#CFE3A0"/>
      ${i % cada === 0 ? `<text x="${x}" y="${base + 16}" class="rot">${esc(dataCurta(p[0]))}</text>` : ''}</g>`; }).join('')}
    <polyline fill="none" stroke="#84BD00" stroke-width="2.5" points="${xy.map(p => p.join(',')).join(' ')}"/>
  </svg>`;
}
const CORES_CL = ['#84BD00', '#5E8C00', '#C9A227', '#744F28', '#8A8C82', '#2A8FA6'];
function faixaClasses(r, cult) {
  const cls = classes(cult);
  if (!cls.length || !r.totalClasses) return '';
  return `<div class="cp-faixa">${cls.map((k, i) => { const p = r.pctClasse(k.chave) || 0;
    return p > 0 ? `<span style="flex:${p};background:${CORES_CL[i % CORES_CL.length]}" title="${esc(k.nome)}: ${pct(p)}">${p > 0.06 ? esc(k.nome) + ' ' + pct(p, 0) : ''}</span>` : ''; }).join('')}</div>
    <div class="cp-legenda">${cls.map((k, i) => `<span><i style="background:${CORES_CL[i % CORES_CL.length]}"></i>${esc(k.nome)} <b>${pct(r.pctClasse(k.chave))}</b> <small>${num(r.classes[k.chave] || 0, 0)} ${k.modo === 'kg' ? 'kg' : esc(cult.unidade_nome)}</small></span>`).join('')}</div>`;
}

/* ---- indicadores (KPIs) por cultura ---- */
export function kpisDe(R, cult) {
  const cp = campos(cult), u = cult.unidade_nome;
  const k = [
    ['Área total', num(R.areaTotal, 2) + ' ha', `${R.linhas.length} ${rotAreaPl(cult)}`],
    ['Área colhida', num(R.areaColhida, 2) + ' ha', `a colher: ${num(R.areaAColher, 2)} ha`],
    ['Produção', num(R.tot.un, 0) + ' ' + u, unidadeRot(cult) + (R.tot.kg ? ' · ' + num(R.tot.kg / 1000, 1) + ' t' : '')],
    ['Produtividade', R.unHa ? num(R.unHa, 1) + ' ' + u + '/ha' : '—', R.kgHa ? num(R.kgHa, 0) + ' kg/ha' : 'sobre a área colhida'],
    ['Cargas', num(R.tot.cargas, 0), R.tot.ini ? dataBR(R.tot.ini) + ' a ' + dataBR(R.tot.fim) : 'nenhuma ainda'],
  ];
  if (R.cicloMedio) k.push(['Ciclo médio', num(R.cicloMedio, 0) + ' dias', 'plantio → colheita']);
  if (R.tot.pctLavada !== null && cp.tipo) k.push(['% Lavada', pct(R.tot.pctLavada), 'suja: ' + pct(1 - R.tot.pctLavada)]);
  const dest = cp.classe_destaque || (classes(cult)[0] && classes(cult)[0].chave);
  if (dest && R.tot.totalClasses) k.push(['% ' + (classes(cult).find(x => x.chave === dest) || {}).nome, pct(R.tot.pctClasse(dest)), 'da classificação']);
  if (cp.rendimento) k.push(['Rendimento', R.tot.rendimento ? num(R.tot.rendimento, 1) + ' kg/sc' : '—', R.tot.un ? 'kg de roça por saca' : 'aguardando beneficiamento']);
  if (cp.umidade) k.push(['Umidade média', R.tot.umidade !== null ? pct(R.tot.umidade) : '—', 'ponderada pelo peso']);
  if (cp.impureza) k.push(['Impureza média', R.tot.impureza !== null ? pct(R.tot.impureza, 2) : '—', 'ponderada pelo peso']);
  if (cult.conciliacao === 'coop') k.push(['Pagamento', `${R.tot.pagos} pagas`, `${R.tot.pendentes} pendentes`]);
  return k;
}

function desenharPainel() {
  const alvo = $('cpPainelCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = vazio('Abrindo…'); return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = vazio('Cadastre uma safra para esta cultura em Cadastros › Safras.'); return; }
  const R = resumoSafra(saf.id, cult);
  const u = cult.unidade_nome, ra = rotArea(cult);
  // Só mostra a conferência quando já veio algum relatório (a cenoura, por
  // exemplo, ainda não tem: seria "85 aguardando" para sempre).
  const temRel = todos('cp_balanca').some(b => b.cultura_id === cult.id && b.safra_id === saf.id && b.ativo !== false);
  const conf = temRel && cult.conciliacao !== 'nenhuma' && cult.conciliacao !== 'coop'
    ? cargasDa(saf.id).map(c => conferir(c, cult).st) : [];
  const nOk = conf.filter(s => s === 'ok').length, nDiv = conf.filter(s => s === 'div').length;
  const nPend = conf.length - nOk - nDiv;
  const fazendas = porFazenda(R.linhas, cult);
  const cls = classes(cult);
  const colunasExtra = [];
  if (campos(cult).tipo) colunasExtra.push(['% Lavada', l => pct(l.pctLavada)]);
  cls.forEach(k => colunasExtra.push(['% ' + k.nome, l => pct(l.pctClasse(k.chave))]));
  if (campos(cult).rendimento) colunasExtra.push(['Rend. kg/sc', l => l.rendimento ? num(l.rendimento, 1) : '']);
  if (campos(cult).umidade) colunasExtra.push(['% Umid.', l => l.umidade !== null ? pct(l.umidade) : '']);
  if (campos(cult).impureza) colunasExtra.push(['% Imp.', l => l.impureza !== null ? pct(l.impureza, 2) : '']);

  const destaque = (t, l, cl) => !l ? '' : `<div class="cp-dest ${cl}">
      <span>${t}</span><b>${esc(nomePlantio(l.p))}</b>
      <small>${esc(nomeCurto(l.p.fazenda))}${l.p.variedade ? ' · ' + esc(l.p.variedade) : ''}</small>
      <div><strong>${num(l.unHa, 1)}</strong> ${esc(u)}/ha${l.kgHa ? ` · ${num(l.kgHa, 0)} kg/ha` : ''}${cls.length && l.totalClasses ? ` · ${esc(cls[0].nome)} ${pct(l.pctClasse(cls[0].chave))}` : ''}</div>
    </div>`;

  alvo.innerHTML = `
    <div class="cartao cp-cab">
      <div>
        <h2>${esc(cult.nome)} · ${esc(saf.nome)}</h2>
        <p class="dica">Unidade: <b>${esc(unidadeRot(cult))}</b> · comparação por ${esc(ra)} · ${R.colhidos} ${R.colhidos === 1 ? 'colhido' : 'colhidos'}, ${R.aColher} a colher</p>
      </div>
      <div class="barra" style="margin:0">
        <button class="btn" type="button" id="cpPnXls">Excel</button>
        <button class="btn" type="button" id="cpPnPdf">PDF</button>
        ${botaoZap('cpPnZap')}
      </div>
    </div>
    <div class="cb-kpis cp-kpis">${kpisDe(R, cult).map(([r, v, s]) => `<div><span>${esc(r)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join('')}</div>
    ${conf.length ? `<div class="cp-conf-faixa">
      <span class="cb-pin ok">${nOk} conferidas</span>
      ${nDiv ? `<span class="cb-pin perigo">${nDiv} divergentes</span>` : ''}
      ${nPend ? `<span class="cb-pin alerta">${nPend} aguardando relatório</span>` : ''}
      <button class="btn mini" type="button" id="cpPnConf">Abrir conferência</button></div>` : ''}
    ${R.semPlantio.length ? `<div class="aviso alerta">${R.semPlantio.length} ${R.semPlantio.length === 1 ? 'carga sem' : 'cargas sem'} ${esc(ra)} definido — não entram na produtividade. <button class="btn mini" type="button" id="cpPnSemPl">Ver cargas</button></div>` : ''}

    <div class="cp-duas">
      <div class="cartao"><h3 class="cb-secao">Destaques da safra</h3>
        ${R.melhor ? `<div class="cp-dests">${destaque('🏆 Melhor ' + ra, R.melhor, 'bom')}${destaque('⚠️ Pior ' + ra, R.pior, 'ruim')}</div>` : '<div class="vazio">Sem colheita com área cadastrada ainda.</div>'}
        ${cls.length ? `<h3 class="cb-secao">Classificação</h3>${faixaClasses(R.tot, cult) || '<div class="vazio">Sem classificação lançada.</div>'}` : ''}
      </div>
      <div class="cartao"><h3 class="cb-secao">Produtividade por ${esc(ra)} <small>${esc(u)}/ha</small></h3>
        ${barras(R.linhas.filter(l => l.unHa).map(l => ({ r: curto(l.p), r2: nomeCurto(l.p.fazenda), v: l.unHa })), {
          fmt: v => num(v, 0), destaque: it => R.melhor && it.v === R.melhor.unHa })}
      </div>
    </div>

    <div class="cartao"><h3 class="cb-secao">Comparativo por ${esc(ra)}</h3>
      <div class="cb-rolagem"><table class="dc-planilha cb-tab cp-tab">
        <thead><tr><th>${esc(Maiusc(ra))}</th><th>Fazenda</th><th>Variedade</th><th class="dir">Área (ha)</th><th>Início colheita</th><th>Fim colheita</th><th class="ce">Ciclo</th><th class="ce">Cargas</th><th class="dir">Kg</th><th class="dir">${esc(u)}</th><th class="dir">${esc(u)}/ha</th>${colunasExtra.map(c => `<th class="dir">${esc(c[0])}</th>`).join('')}</tr></thead>
        <tbody>${R.linhas.map(l => `<tr${l.colhido ? '' : ' class="cb-inativa"'}>
          <td><b>${esc(l.p.nome)}</b>${l.p.situacao ? ` <span class="tag inativo">${esc(l.p.situacao)}</span>` : ''}</td>
          <td>${esc(nomeCurto(l.p.fazenda))}</td><td>${esc(l.p.variedade || '')}</td>
          <td class="dir">${num(l.area, 2)}</td>
          <td>${l.colhido ? dataBR(l.ini) : '<span class="dc-sem">a colher</span>'}</td><td>${l.colhido ? dataBR(l.fim) : ''}</td>
          <td class="ce">${l.ciclo !== null && l.ciclo > 0 ? l.ciclo : ''}</td><td class="ce">${l.cargas || ''}</td>
          <td class="dir">${l.kg ? num(l.kg, 0) : ''}</td><td class="dir">${l.un ? num(l.un, 0) : ''}</td>
          <td class="dir"><b>${l.unHa ? num(l.unHa, 1) : ''}</b></td>
          ${colunasExtra.map(c => `<td class="dir">${l.cargas ? c[1](l) : ''}</td>`).join('')}
        </tr>`).join('') || `<tr><td colspan="${11 + colunasExtra.length}" class="vazio">Nenhum ${esc(ra)} nesta safra. Cadastre em Cadastros.</td></tr>`}</tbody>
        <tfoot><tr class="dc-total"><td>Total</td><td></td><td></td><td class="dir">${num(R.areaTotal, 2)}</td><td>${dataBR(R.tot.ini)}</td><td>${dataBR(R.tot.fim)}</td><td class="ce">${R.cicloMedio ? num(R.cicloMedio, 0) : ''}</td><td class="ce">${R.tot.cargas}</td><td class="dir">${num(R.tot.kg, 0)}</td><td class="dir">${num(R.tot.un, 0)}</td><td class="dir">${R.unHa ? num(R.unHa, 1) : ''}</td>${colunasExtra.map(c => `<td class="dir">${c[1](R.tot)}</td>`).join('')}</tr></tfoot>
      </table></div>
    </div>

    <div class="cp-duas">
      <div class="cartao"><h3 class="cb-secao">Por fazenda</h3>
        <table class="dc-planilha cb-tab"><thead><tr><th>Fazenda</th><th class="dir">Área (ha)</th><th class="ce">Cargas</th><th class="dir">${esc(u)}</th><th class="dir">${esc(u)}/ha</th></tr></thead>
        <tbody>${fazendas.map(f => `<tr><td>${esc(nomeCurto(f.fazenda))}</td><td class="dir">${num(f.area, 2)}</td><td class="ce">${f.cargas}</td><td class="dir">${num(f.un, 0)}</td><td class="dir"><b>${f.unHa ? num(f.unHa, 1) : ''}</b></td></tr>`).join('')}</tbody></table>
      </div>
      <div class="cartao"><h3 class="cb-secao">Evolução da colheita <small>${esc(u)} por dia</small></h3>
        ${linhaDias(porDia(saf.id, cult), v => num(v, 0) + ' ' + u) || '<div class="vazio">Poucos dias de colheita para o gráfico.</div>'}
      </div>
    </div>`;

  $('cpPnConf')?.addEventListener('click', () => window.abrirTelaColheita('cpConferencia'));
  $('cpPnSemPl')?.addEventListener('click', () => { window.cpFiltroCargas = 'sem_plantio'; window.abrirTelaColheita('cpCargas'); });
  $('cpPnPdf').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true;
    try { const doc = await montarPdf(relatorio(R, cult, saf, colunasExtra)); doc.save(nomeArq(cult, saf) + '.pdf'); }
    catch (er) { window.aviso('Não consegui montar o PDF: ' + (er.message || er), true); }
    finally { b.disabled = false; }
  });
  $('cpPnZap').addEventListener('click', e => enviarWhatsapp(relatorio(R, cult, saf, colunasExtra), resumoZap(R, cult, saf), e.currentTarget));
  $('cpPnXls').addEventListener('click', () => excel(R, cult, saf, colunasExtra));
}

const nomeArq = (cult, saf) => 'Colheita ' + cult.nome + ' ' + saf.nome.replace(/\//g, '-');

function relatorio(R, cult, saf, extra) {
  const u = cult.unidade_nome;
  return {
    titulo: 'Colheita e Produção — ' + cult.nome,
    subtitulo: `Safra ${saf.nome} · unidade ${unidadeRot(cult)} · SAKUMA Agronegócios`,
    arquivo: nomeArq(cult, saf),
    paisagem: true,
    kpis: kpisDe(R, cult).slice(0, 6).map(([r, v]) => [r, v]),
    secoes: [
      { titulo: 'Comparativo por ' + rotArea(cult),
        head: [Maiusc(rotArea(cult)), 'Fazenda', 'Variedade', 'Área (ha)', 'Início', 'Fim', 'Ciclo', 'Cargas', 'Kg', u, u + '/ha', ...extra.map(c => c[0])],
        body: R.linhas.map(l => [l.p.nome, nomeCurto(l.p.fazenda), l.p.variedade || '', num(l.area, 2), l.colhido ? dataBR(l.ini) : 'a colher', l.colhido ? dataBR(l.fim) : '',
          l.ciclo > 0 ? String(l.ciclo) : '', l.cargas ? String(l.cargas) : '', l.kg ? num(l.kg, 0) : '', l.un ? num(l.un, 0) : '', l.unHa ? num(l.unHa, 1) : '',
          ...extra.map(c => l.cargas ? c[1](l) : '')]),
        total: ['Total', '', '', num(R.areaTotal, 2), dataBR(R.tot.ini), dataBR(R.tot.fim), R.cicloMedio ? num(R.cicloMedio, 0) : '', String(R.tot.cargas),
          num(R.tot.kg, 0), num(R.tot.un, 0), R.unHa ? num(R.unHa, 1) : '', ...extra.map(c => c[1](R.tot))],
        dir: [3, 6, 7, 8, 9, 10, ...extra.map((_, i) => 11 + i)] },
      { titulo: 'Por fazenda', largura: 'meia',
        head: ['Fazenda', 'Área (ha)', 'Cargas', u, u + '/ha'],
        body: porFazenda(R.linhas, cult).map(f => [nomeCurto(f.fazenda), num(f.area, 2), String(f.cargas), num(f.un, 0), f.unHa ? num(f.unHa, 1) : '']),
        dir: [1, 2, 3, 4] },
      ...(classes(cult).length && R.tot.totalClasses ? [{ titulo: 'Classificação', largura: 'meia',
        head: ['Classe', classes(cult)[0].modo === 'kg' ? 'Kg' : u, '%'],
        body: classes(cult).map(k => [k.nome, num(R.tot.classes[k.chave] || 0, 0), pct(R.tot.pctClasse(k.chave))]),
        total: ['Total', num(R.tot.totalClasses, 0), '100,0%'], dir: [1, 2] }] : []),
    ],
  };
}
function resumoZap(R, cult, saf) {
  const u = cult.unidade_nome;
  return `*Colheita ${cult.nome} — ${saf.nome}*\n` +
    `Produção: ${num(R.tot.un, 0)} ${u} em ${R.tot.cargas} cargas\n` +
    `Área colhida: ${num(R.areaColhida, 2)} de ${num(R.areaTotal, 2)} ha\n` +
    (R.unHa ? `Produtividade: ${num(R.unHa, 1)} ${u}/ha\n` : '') +
    (R.melhor ? `Melhor: ${nomePlantio(R.melhor.p)} (${num(R.melhor.unHa, 1)} ${u}/ha)` : '');
}
async function excel(R, cult, saf, extra) {
  const u = cult.unidade_nome;
  const cargas = cargasDa(saf.id).slice().reverse();
  try {
    await baixarXlsx(nomeArq(cult, saf), [
      { nome: 'Por ' + rotArea(cult), titulo: 'Colheita ' + cult.nome + ' — ' + saf.nome, subtitulo: 'SAKUMA Agronegócios · unidade ' + unidadeRot(cult),
        colunas: [{ rot: Maiusc(rotArea(cult)), larg: 16 }, { rot: 'Fazenda', larg: 16 }, { rot: 'Variedade', larg: 14 }, { rot: 'Área (ha)', tipo: 'num' },
          { rot: 'Início colheita', tipo: 'data' }, { rot: 'Fim colheita', tipo: 'data' }, { rot: 'Ciclo', tipo: 'num', casas: 0 }, { rot: 'Cargas', tipo: 'num', casas: 0 },
          { rot: 'Kg', tipo: 'num', casas: 0 }, { rot: u, tipo: 'num', casas: 0 }, { rot: u + '/ha', tipo: 'num', casas: 1 }],
        linhas: R.linhas.map(l => [l.p.nome, nomeCurto(l.p.fazenda), l.p.variedade || '', Number(l.area), l.ini, l.fim, l.ciclo > 0 ? l.ciclo : null, l.cargas, l.kg, l.un, l.unHa]),
        total: ['Total', '', '', R.areaTotal, R.tot.ini, R.tot.fim, R.cicloMedio, R.tot.cargas, R.tot.kg, R.tot.un, R.unHa] },
      { nome: 'Cargas', colunas: [{ rot: 'Data', tipo: 'data' }, { rot: 'Placa' }, { rot: 'Ticket faz.' }, { rot: 'Ticket balança' }, { rot: Maiusc(rotArea(cult)), larg: 16 },
          { rot: 'Peso entrada (kg)', tipo: 'num', casas: 0 }, { rot: 'Peso líq. (kg)', tipo: 'num', casas: 0 }, { rot: u, tipo: 'num', casas: 1 },
          ...classes(cult).map(k => ({ rot: k.nome, tipo: 'num', casas: 0 })), { rot: 'Situação', larg: 16 }],
        linhas: cargas.map(c => { const p = (todos('cp_plantios').find(x => x.id === c.plantio_id) || {});
          return [c.data, c.placa || '', c.ticket_faz || '', c.ticket_balanca || '', p.nome || '', c.peso_entrada, c.peso_liquido,
            somar([c], cult).un, ...classes(cult).map(k => (c.classes || {})[k.chave] ?? null), conferir(c, cult).st]; }) },
    ]);
  } catch (e) { window.aviso('Não consegui gerar o Excel: ' + (e.message || e), true); }
}

export function abrirPainel() { desenharPainel(); }

/* ---------------------------------------------------------------- comparativo de safras */
function desenharHistorico() {
  const alvo = $('cpHistCorpo');
  if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel();
  if (!cult) { alvo.innerHTML = '<div class="vazio">Sem culturas.</div>'; return; }
  const u = cult.unidade_nome;
  const hist = ativos('cp_historico').filter(h => h.cultura_id === cult.id && !h.fazenda)
    .map(h => ({ nome: h.safra_nome, area: Number(h.area || 0), kg: Number(h.producao_kg || 0), un: Number(h.unidades || 0),
      unHa: h.produtividade !== null && h.produtividade !== undefined ? Number(h.produtividade) : (h.area ? h.unidades / h.area : null), fonte: 'histórico' }));
  const nomesHist = new Set(hist.map(h => h.nome));
  for (const s of safrasDe(cult.id)) {
    if (nomesHist.has(s.nome)) continue;
    const R = resumoSafra(s.id, cult);
    if (!R.tot.cargas) continue;
    hist.push({ nome: s.nome, area: R.areaColhida, kg: R.tot.kg, un: R.tot.un, unHa: R.unHa, fonte: s.atual ? 'em andamento' : 'app' });
  }
  hist.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }));
  const comVal = hist.filter(h => h.unHa);
  const media = comVal.length ? comVal.reduce((s, h) => s + h.unHa, 0) / comVal.length : null;
  // tendência linear simples
  let tend = '';
  if (comVal.length >= 3) {
    const n = comVal.length, xs = comVal.map((_, i) => i), ys = comVal.map(h => h.unHa);
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    tend = b > 0.05 ? `tendência de alta (+${num(b, 1)} ${u}/ha por safra)` : b < -0.05 ? `tendência de queda (${num(b, 1)} ${u}/ha por safra)` : 'estável';
  }
  alvo.innerHTML = !hist.length ? `<div class="vazio">Sem histórico de ${esc(cult.nome)}. Lance as safras antigas em Cadastros › Histórico de safras.</div>` : `
    <div class="cb-kpis"><div><span>Safras</span><b>${hist.length}</b><small>${esc(hist[0].nome)} a ${esc(hist[hist.length - 1].nome)}</small></div>
      <div><span>Média</span><b>${media ? num(media, 1) : '—'}</b><small>${esc(u)}/ha</small></div>
      <div><span>Melhor safra</span><b>${comVal.length ? esc(comVal.slice().sort((a, b) => b.unHa - a.unHa)[0].nome) : '—'}</b><small>${comVal.length ? num(Math.max(...comVal.map(h => h.unHa)), 1) + ' ' + esc(u) + '/ha' : ''}</small></div>
      ${tend ? `<div><span>Tendência</span><b class="cp-tend">${esc(tend.split(' (')[0])}</b><small>${esc((tend.split(' (')[1] || '').replace(')', ''))}</small></div>` : ''}</div>
    ${barras(hist.map(h => ({ r: h.nome, v: h.unHa || 0, cor: h.fonte === 'em andamento' ? '#744F28' : undefined })), { fmt: v => num(v, 1), altura: 210 })}
    <p class="dc-sem">Em marrom: safra em andamento (parcial, pela área já colhida).</p>
    <table class="dc-planilha cb-tab"><thead><tr><th>Safra</th><th class="dir">Área (ha)</th><th class="dir">Produção (kg)</th><th class="dir">${esc(u)}</th><th class="dir">${esc(u)}/ha</th><th>Fonte</th></tr></thead>
    <tbody>${hist.map(h => `<tr><td><b>${esc(h.nome)}</b></td><td class="dir">${num(h.area, 2)}</td><td class="dir">${num(h.kg, 0)}</td><td class="dir">${num(h.un, 0)}</td><td class="dir"><b>${h.unHa ? num(h.unHa, 1) : ''}</b></td><td>${esc(h.fonte)}</td></tr>`).join('')}</tbody></table>`;
}
export function abrirHistorico() { desenharHistorico(); }
