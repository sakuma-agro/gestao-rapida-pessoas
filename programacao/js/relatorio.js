/* =====================================================================
   Gestão Rápida · Programação Campo — relatório em PDF
   Padrão SAKUMA: verde #84BD00, marrom #744F28, cinza #51534A, sem preto.
   Logo SAKUMA no cabeçalho, como veio. LOP assina no pé da folha, à
   direita: símbolo e depois a frase, em letra pequena e cinza.
   ===================================================================== */

const COR = {
  verde: '#84BD00', verdeClaro: '#F1F7E6', verdeLinha: '#B9CC8E', verdeTotal: '#D9E8BD',
  marrom: '#744F28', marromClaro: '#EFE6DB', cinza: '#51534A', cinzaClaro: '#8A8C83',
  branco: '#FFFFFF', ok: '#4E8B1F', atr: '#C0392B', atrFundo: '#F8DAD6', pend: '#FFF1C9', canc: '#A5A79F'
};
const FRASE_LOP = 'Inteligência para o agronegócio';

/* Prioridade sempre visível no relatório: quem não tem marcação sai como "Normal". */
const rotuloPri = a => {
  const p = PRIORIDADES.find(x => x.id === a.prioridade);
  return p ? p.curto : 'Normal';
};
const etqPriSempre = a => {
  const p = PRIORIDADES.find(x => x.id === a.prioridade);
  return p ? `<span class="etq-pri pri-${p.id}" title="${esc(p.nome)}">${esc(p.curto)}</span>`
           : '<span class="etq-pri pri-normal">Normal</span>';
};
/* Ordem do relatório: dia a dia e, dentro do mesmo dia, urgentes primeiro,
   depois as importantes e por último as normais. */
const porPrioridade = (a, b) => a.data.localeCompare(b.data) || pesoPrioridade(a) - pesoPrioridade(b);

/* ---------------------------------------------------------------- tela */

const filtroRel = { agrupar: 'fazenda', tipo: 'semana', ano: null, mes: null, semana: null, de: '', ate: '',
                    fazenda: '', local: '', cultura: '', operador: '', status: '', umaPorPagina: false };

function periodoRel(f) {
  if (f.tipo === 'semana') {
    return { de: inicioSemana(f.ano, f.mes, f.semana), ate: fimSemana(f.ano, f.mes, f.semana),
             rotulo: rotuloSemana(f) + ` (${br(inicioSemana(f.ano, f.mes, f.semana))} a ${br(fimSemana(f.ano, f.mes, f.semana))})`,
             arquivo: `S${f.semana}_${MESES[f.mes - 1]}_${f.ano}` };
  }
  if (f.tipo === 'mes') {
    return { de: montaData(f.ano, f.mes, 1), ate: montaData(f.ano, f.mes, diasNoMes(f.ano, f.mes)),
             rotulo: `${MESES[f.mes - 1]}/${f.ano}`, arquivo: `${MESES[f.mes - 1]}_${f.ano}` };
  }
  if (f.tipo === 'ano') {
    return { de: montaData(f.ano, 1, 1), ate: montaData(f.ano, 12, 31), rotulo: `Ano ${f.ano}`, arquivo: `Ano_${f.ano}` };
  }
  return { de: f.de, ate: f.ate,
           rotulo: `${f.de ? br(f.de) : 'início'} a ${f.ate ? br(f.ate) : 'hoje em diante'}`,
           arquivo: `${f.de || 'inicio'}_a_${f.ate || 'fim'}` };
}

TELAS.relatorio = el => {
  document.body.classList.remove('modo-quadro');
  const f = filtroRel;
  if (!f.ano) Object.assign(f, chaveSemana(hoje()));
  const anos = new Set([f.ano, partes(hoje()).ano, partes(hoje()).ano + 1]);
  atividadesVisiveis().forEach(a => anos.add(partes(a.data).ano));

  el.innerHTML = `
    <h1>Relatório das atividades</h1>
    <p class="sub">Escolha o período e os filtros. O PDF sai com data, tarefa, prioridade, local, cultura, operador e status, em ordem de data e, dentro do dia, de prioridade.</p>
    <div class="abas" id="rl-tipo">${[['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['datas', 'Datas']].map(([k, r]) =>
      `<button type="button" data-t="${k}" class="${f.tipo === k ? 'ativo' : ''}">${r}</button>`).join('')}</div>
    <div class="filtros pc-filtros">
      ${f.tipo === 'datas' ? `
        <label>De <input type="date" data-r="de" value="${esc(f.de)}"></label>
        <label>Até <input type="date" data-r="ate" value="${esc(f.ate)}"></label>` : `
        <select data-r="ano">${[...anos].sort().map(a => `<option${a === f.ano ? ' selected' : ''}>${a}</option>`).join('')}</select>
        ${f.tipo !== 'ano' ? `<select data-r="mes">${MESES.map((m, i) => `<option value="${i + 1}"${i + 1 === f.mes ? ' selected' : ''}>${m}</option>`).join('')}</select>` : ''}
        ${f.tipo === 'semana' ? `<select data-r="semana">${[1, 2, 3, 4].map(s => `<option value="${s}"${s === f.semana ? ' selected' : ''}>Semana ${s}</option>`).join('')}</select>` : ''}`}
      <select data-r="fazenda">${opcoes(fazendasOrdenadas(), f.fazenda, 'Todas as fazendas')}</select>
      <select data-r="local">${opcoesLocais(f.local, 'Todos os locais')}</select>
      <select data-r="cultura">${opcoes(q.ordenado('culturas'), f.cultura, 'Todas as culturas')}</select>
      <select data-r="operador">${opcoes(q.ordenado('operadores'), f.operador, 'Todos os operadores')}</select>
      <select data-r="agrupar" title="Separar o relatório por">
        <option value="fazenda"${f.agrupar === 'fazenda' ? ' selected' : ''}>Separar por fazenda</option>
        <option value="operador"${f.agrupar === 'operador' ? ' selected' : ''}>Separar por operador</option>
      </select>
      <select data-r="status">${opcoes([{ id: 'pendentes', nome: 'Pendentes' }, ...STATUS_TODOS], f.status, 'Todos os status')}</select>
      <label class="pc-cx pc-cx-filtro" title="Cada fazenda (ou operador) começa numa folha nova, para entregar em separado">
        <input type="checkbox" data-r="umaPorPagina"${f.umaPorPagina ? ' checked' : ''}>
        ${f.agrupar === 'operador' ? 'Um operador' : 'Uma fazenda'} por página
      </label>
    </div>
    <div class="acoes">
      <button type="button" class="btn" id="rl-pdf">Gerar PDF</button>
      <button type="button" class="btn secundario" id="rl-ficha">Ficha de conferência (imprimir)</button>
      <button type="button" class="btn secundario" id="rl-ficha-op">Ficha por operador (imprimir)</button>
      <button type="button" class="btn secundario" id="rl-excel">Exportar Excel</button>
    </div>
    <div id="rl-previa"></div>`;

  el.querySelectorAll('#rl-tipo button').forEach(b => b.onclick = () => { f.tipo = b.dataset.t; TELAS.relatorio(el); });
  el.querySelectorAll('[data-r]').forEach(c => c.onchange = () => {
    const k = c.dataset.r;
    f[k] = c.type === 'checkbox' ? c.checked
         : ['ano', 'mes', 'semana'].includes(k) ? Number(c.value) : c.value;
    if (k === 'agrupar') return TELAS.relatorio(el);   // o rótulo do botão muda junto
    previa();
  });

  const listaAtual = () => {
    const p = periodoRel(f);
    return { p, lista: filtrarAtividades({ de: p.de, ate: p.ate, fazenda: f.fazenda, local: f.local,
      cultura: f.cultura, operador: f.operador, status: f.status }) };
  };

  function previa() {
    const { p, lista } = listaAtual();
    const ind = indicadores(lista);
    el.querySelector('#rl-previa').innerHTML = `
      <div class="painel pc-ind">
        <div class="cartao"><b>${lista.length}</b><span>atividades</span></div>
        <div class="cartao pc-c-ok"><b>${ind.concluido}</b><span>concluídas</span></div>
        <div class="cartao"><b>${ind.andamento + ind.planejado}</b><span>a fazer</span></div>
        <div class="cartao ${ind.atrasado ? 'alerta' : ''}"><b>${ind.atrasado}</b><span>atrasadas</span></div>
        <div class="cartao"><b>${ind.pct}%</b><span>cumprimento</span></div>
      </div>
      <p class="sub">Período: <strong>${esc(p.rotulo)}</strong></p>
      ${lista.length ? tabelaHtml(lista, f.agrupar) : '<div class="vazio"><p>Nenhuma atividade nesse período.</p></div>'}`;
  }
  previa();

  const ficha = modo => {
    const { p, lista } = listaAtual();
    const itens = lista.filter(a => statusDe(a) !== 'Cancelado');
    if (!itens.length) return aviso('Nenhuma atividade nesse período.', true);
    gerarRelatorio({ tipo: 'ficha', titulo: 'Ficha de conferência das atividades', periodo: p.rotulo,
                     fazenda: f.fazenda, lista: itens, agrupar: modo,
                     arquivo: (modo === 'operador' ? 'Ficha_por_operador_' : 'Ficha_') + p.arquivo });
  };
  el.querySelector('#rl-ficha').onclick = () => ficha(f.agrupar);
  el.querySelector('#rl-ficha-op').onclick = () => ficha('operador');
  el.querySelector('#rl-excel').onclick = () => { const { p, lista } = listaAtual(); exportarExcel(lista, 'Programacao_' + p.arquivo); };
  el.querySelector('#rl-pdf').onclick = () => {
    const { p, lista } = listaAtual();
    if (!lista.length) return aviso('Nenhuma atividade nesse período.', true);
    gerarRelatorio({ titulo: f.agrupar === 'operador' ? 'Relatório de atividades por operador' : 'Relatório de atividades de campo',
                     periodo: p.rotulo, fazenda: f.fazenda, lista, agrupar: f.agrupar, umaPorPagina: f.umaPorPagina,
                     arquivo: (f.agrupar === 'operador' ? 'Atividades_por_operador_' : 'Atividades_') + p.arquivo });
  };
};

/* a mesma tabela do PDF, na tela */
function tabelaHtml(lista, modo = 'fazenda') {
  let html = `<div class="rolagem"><table class="tabela pc-grade pc-rel"><thead><tr>
    <th>Data</th><th>Sem.</th><th>Tarefa</th><th>Prioridade</th><th>Local</th><th>Cultura</th><th>Plantio</th><th>Operador</th><th>Máquina / implemento</th><th>Status</th>
    </tr></thead><tbody>`;
  agrupar(lista, modo).forEach(([faz, itens]) => {
    html += `<tr class="pc-grupo"><td colspan="10">${esc(faz)} · ${itens.length}</td></tr>`;
    html += itens.map(a => `<tr class="${STATUS_CLASSE[statusDe(a)]}">
      <td>${br(a.data)}</td><td>S${semanaDe(a.data)}</td><td>${esc(nomeAtividade(a))}</td>
      <td>${etqPriSempre(a)}</td>
      <td>${esc(q.nome('locais', a.local_id))}</td><td>${esc(q.nome('culturas', a.cultura_id))}</td><td>${esc(a.plantio || '')}</td>
      <td>${esc(q.nome('operadores', a.operador_id)) || '<span class="pc-falta">a definir</span>'}</td>
      <td>${esc(maqImpl(a))}</td><td>${etqStatus(a)}</td></tr>`).join('');
  });
  return html + `</tbody><tfoot><tr class="pc-total"><td colspan="10">Total: ${lista.length} atividade${lista.length > 1 ? 's' : ''}</td></tr></tfoot></table></div>`;
}

/* Separa a lista em grupos: por fazenda (padrão) ou por operador. */
function agrupar(lista, modo = 'fazenda') {
  if (modo !== 'operador') return agruparPorFazenda(lista);
  const grupos = new Map();
  lista.forEach(a => {
    const k = a.operador_id || '';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a);
  });
  return [...grupos.entries()]
    .map(([k, v]) => [k ? q.nome('operadores', k) : 'Operador a definir', v.sort((a, b) => porPrioridade(a, b) ||
      q.nome('locais', a.local_id).localeCompare(q.nome('locais', b.local_id), 'pt-BR')), k])
    .sort((a, b) => (a[2] ? 0 : 1) - (b[2] ? 0 : 1) || a[0].localeCompare(b[0], 'pt-BR'));
}

function agruparPorFazenda(lista) {
  const grupos = new Map();
  fazendasOrdenadas(false).forEach(f => grupos.set(f.id, []));
  lista.forEach(a => {
    const fz = fazendaDoLocal(a.local_id) || '';
    if (!grupos.has(fz)) grupos.set(fz, []);
    grupos.get(fz).push(a);
  });
  return [...grupos.entries()].filter(([, v]) => v.length)
    .map(([k, v]) => [q.nome('fazendas', k) || 'Sem fazenda', v.sort(porPrioridade)]);
}

/* ---------------------------------------------------------------- imagens */

const imagensPdf = {};
async function imagemPdf(caminho) {
  if (imagensPdf[caminho]) return imagensPdf[caminho];
  const blob = await (await fetch(caminho)).blob();
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  const dim = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.src = url; });
  imagensPdf[caminho] = { url, ...dim, tipo: blob.type.includes('png') ? 'PNG' : 'JPEG' };
  return imagensPdf[caminho];
}

/* ---------------------------------------------------------------- PDF */

async function montarPdf(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), A = doc.internal.pageSize.getHeight();
  const M = 8;            // margem lateral enxuta: sobra mais papel para a tabela
  const emitido = new Date();
  const emitidoTxt = emitido.toLocaleDateString('pt-BR') + ' ' + emitido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sakuma = await imagemPdf('img/sakuma-logo.png');
  const lop = await imagemPdf('img/lop-marca.png');
  doc.setFont('helvetica', 'normal');   // no PDF, a Helvetica é a Arial

  /* ---- cabeçalho (só na primeira folha) */
  const hLogo = 16, wLogo = hLogo * sakuma.w / sakuma.h;
  doc.addImage(sakuma.url, sakuma.tipo, M, 6, wLogo, hLogo);
  const xT = M + wLogo + 6;
  doc.setTextColor(COR.marrom); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(o.titulo, xT, 12.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(COR.cinza);
  doc.text('Gestão Rápida · Programação Campo', xT, 17.8);
  doc.text(`Período: ${o.periodo}` + (o.fazenda ? `   ·   Fazenda: ${q.nome('fazendas', o.fazenda)}` : '   ·   Todas as fazendas'), xT, 22.6);
  doc.setFontSize(8.5); doc.setTextColor(COR.cinzaClaro);
  doc.text('Emitido em ' + emitidoTxt, L - M, 12.5, { align: 'right' });
  doc.setDrawColor(COR.verde); doc.setLineWidth(0.9);
  doc.line(M, 26, L - M, 26);

  /* ---- indicadores */
  let y = 30;
  const ind = indicadores(o.lista);
  const cards = [['Programadas', ind.total], ['Concluídas', ind.concluido], ['A fazer', ind.andamento + ind.planejado],
                 ['Atrasadas', ind.atrasado], ['Canceladas', ind.cancelado], ['Cumprimento', ind.pct + '%']];
  const wC = (L - 2 * M - 5 * 4) / 6;
  cards.forEach(([rot, v], i) => {
    const x = M + i * (wC + 4);
    const alerta = rot === 'Atrasadas' && ind.atrasado > 0;
    doc.setFillColor(alerta ? COR.atrFundo : COR.verdeClaro);
    doc.setDrawColor(alerta ? COR.atr : COR.verdeLinha); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, wC, 13.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14.5);
    doc.setTextColor(alerta ? COR.atr : (rot === 'Concluídas' ? COR.ok : COR.marrom));
    doc.text(String(v), x + wC / 2, y + 7.4, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(COR.cinza);
    doc.text(rot, x + wC / 2, y + 11.4, { align: 'center' });
  });
  y += 18.5;

  const secao = (txt) => {
    if (y > A - 34) { doc.addPage(); y = 11; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(COR.marrom);
    doc.text(txt, M, y);
    doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, y + 1.5, L - M, y + 1.5);
    y += 4;
  };

  const linhaGrupo = (faz, itens) => [{ content: `${faz}  ·  ${itens.length} atividade${itens.length > 1 ? 's' : ''}`,
    colSpan: 10, styles: { fillColor: COR.marromClaro, textColor: COR.marrom, fontStyle: 'bold' } }];
  const linhaTotal = (rot, itens) => [{ content: `${rot}: ${itens.length} atividade${itens.length === 1 ? '' : 's'}` +
    `   ·   ${ind2(itens).concluido} concluída(s)   ·   ${ind2(itens).pct}% de cumprimento`, colSpan: 10,
    styles: { fillColor: COR.verdeTotal, textColor: COR.marrom, fontStyle: 'bold' } }];
  const linhaAtiv = a => [
    br(a.data) + ' ' + diaSemana(a.data), 'S' + semanaDe(a.data),
    nomeAtividade(a), rotuloPri(a),
    q.nome('locais', a.local_id), q.nome('culturas', a.cultura_id), a.plantio || '',
    q.nome('operadores', a.operador_id) || 'a definir', maqImpl(a), statusDe(a)
  ];

  /* Uma folha por fazenda (ou por operador) quando o botão está marcado. */
  const tabela = (lista) => {
    const grupos = agrupar(lista, o.agrupar);
    if (o.umaPorPagina && grupos.length > 1) {
      grupos.forEach(([faz, itens], i) => {
        if (i) { doc.addPage(); y = 11; }
        desenhar([linhaGrupo(faz, itens), ...itens.map(linhaAtiv), linhaTotal('Total desta folha', itens)], faz);
      });
      return;
    }
    const corpo = [];
    grupos.forEach(([faz, itens]) => { corpo.push(linhaGrupo(faz, itens)); itens.forEach(a => corpo.push(linhaAtiv(a))); });
    corpo.push(linhaTotal('Total', lista));
    desenhar(corpo);
  };

  /* `topo` só vem no modo uma folha por fazenda: repete o nome quando a
     fazenda não cabe numa folha só, para ninguém receber página sem dono. */
  const desenhar = (corpo, topo) => {
    doc.autoTable({
      startY: y, margin: { left: M, right: M, bottom: 14, top: topo ? 15 : 10 },
      didDrawPage: d => {
        if (!topo || d.pageNumber === 1) return;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COR.marrom);
        doc.text(`${topo}  ·  continuação`, M, 10);
        doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, 11.5, L - M, 11.5);
      },
      head: [['Data', 'Sem.', 'Tarefa', 'Prioridade', 'Local', 'Cultura', 'Plantio', 'Operador', 'Máquina / implemento', 'Status']],
      body: corpo,
      theme: 'grid',
      rowPageBreak: 'avoid',        // nunca corta uma atividade no meio, entre folhas
      styles: { font: 'helvetica', fontSize: 8.5, textColor: COR.cinza, lineColor: COR.verdeLinha,
                lineWidth: 0.2, cellPadding: 1.6, fillColor: COR.verdeClaro, valign: 'middle' },
      headStyles: { fillColor: COR.verde, textColor: COR.branco, fontStyle: 'bold', lineColor: COR.verde },
      /* as 10 larguras somam 281 mm = 297 − 2 × 8 de margem */
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 12, halign: 'center' }, 2: { cellWidth: 42 },
                      3: { cellWidth: 23, halign: 'center' }, 4: { cellWidth: 36 }, 5: { cellWidth: 24 },
                      6: { cellWidth: 17 }, 7: { cellWidth: 34 }, 8: { cellWidth: 45 },
                      9: { cellWidth: 26, halign: 'center' } },
      didParseCell: d => {
        if (d.section !== 'body' || d.cell.raw == null || typeof d.cell.raw === 'object') return;
        if (d.column.index === 7 && d.cell.raw === 'a definir') { d.cell.styles.textColor = COR.cinzaClaro; return; }
        if (d.column.index === 3) {
          const p = d.cell.raw;
          if (p === 'Normal') { d.cell.styles.textColor = COR.cinzaClaro; return; }
          const urg = p === 'Urgente';
          d.cell.styles.fillColor = urg ? '#F8D3CE' : '#FFF0B3';
          d.cell.styles.textColor = urg ? COR.atr : COR.marrom;
          d.cell.styles.fontStyle = 'bold';
          return;
        }
        if (d.column.index !== 9) return;
        const s = d.cell.raw;
        d.cell.styles.fontStyle = 'bold';
        if (s === 'Concluído') d.cell.styles.textColor = COR.ok;
        else if (s === 'Atrasado') { d.cell.styles.fillColor = COR.atrFundo; d.cell.styles.textColor = COR.atr; }
        else if (s === 'Cancelado') { d.cell.styles.textColor = COR.canc; d.cell.styles.fontStyle = 'normal'; }
        else { d.cell.styles.fillColor = COR.pend; d.cell.styles.textColor = COR.marrom; }
      },
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  const ind2 = l => indicadores(l);

  secao(o.blocos ? 'Atividades da semana' : 'Atividades');
  tabela(o.lista);

  (o.blocos || []).forEach(b => {
    secao(b.titulo);
    if (b.lista.length) tabela(b.lista);
    else { doc.setFontSize(9); doc.setTextColor(COR.cinzaClaro); doc.text('Nada programado.', M, y + 3); y += 10; }
  });

  if (o.reuniao) {
    secao('Anotações da reunião');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(COR.cinza);
    const cab = [`Data da reunião: ${o.reuniao.data_reuniao ? br(o.reuniao.data_reuniao) : '—'}`,
                 `Participantes: ${o.reuniao.participantes || '—'}`];
    const texto = doc.splitTextToSize(o.reuniao.anotacoes || 'Sem anotações.', L - 2 * M - 6);
    const alt = 6 + cab.length * 5 + texto.length * 4.6;
    if (y + alt > A - 16) { doc.addPage(); y = 11; }
    doc.setFillColor(COR.verdeClaro); doc.setDrawColor(COR.verdeLinha); doc.setLineWidth(0.3);
    doc.rect(M, y, L - 2 * M, alt, 'FD');
    let yy = y + 6;
    doc.setFont('helvetica', 'bold'); cab.forEach(t => { doc.text(t, M + 3, yy); yy += 5; });
    doc.setFont('helvetica', 'normal'); doc.text(texto, M + 3, yy);
    y += alt + 5;
  }


  /* ---- pé de todas as folhas */
  const total = doc.getNumberOfPages();
  const hLop = 7, wLop = hLop * lop.w / lop.h;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const yLinha = A - 10;
    doc.setDrawColor(COR.verde); doc.setLineWidth(0.4); doc.line(M, yLinha, L - M, yLinha);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(COR.cinzaClaro);
    doc.text(`SAKUMA Agronegócios · ${o.titulo} · emitido em ${emitidoTxt}`, M, A - 4.5);
    doc.text(`Página ${p} de ${total}`, L / 2, A - 4.5, { align: 'center' });
    // LOP: símbolo e depois a frase, terminando na margem direita.
    // A frase fica na altura do meio das letras "LOP", que ocupam a parte de
    // baixo do desenho (de 52% a 93% da altura da imagem).
    doc.setFontSize(7);
    const wFrase = doc.getTextWidth(FRASE_LOP);
    const xFrase = L - M - wFrase;
    const xLop = xFrase - 1.6 - wLop;
    const yImg = A - 8.6;
    doc.addImage(lop.url, lop.tipo, xLop, yImg, wLop, hLop);
    const meioLetras = yImg + hLop * 0.725;
    doc.text(FRASE_LOP, xFrase, meioLetras + 0.85);
  }
  return doc;
}

/* ---------------------------------------------------------------- entrega */

async function gerarRelatorio(o) {
  if (!window.jspdf || !window.jspdf.jsPDF) return aviso('O gerador de PDF não carregou. Abra o app com internet uma vez.', true);
  aviso('Montando o PDF…');
  let doc;
  try { doc = o.tipo === 'ficha' ? await montarFicha(o) : await montarPdf(o); }
  catch (e) { console.error(e); return aviso('Não consegui montar o PDF: ' + e.message, true); }
  const nome = (o.arquivo || 'Relatorio') .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_') + '.pdf';
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const ind = indicadores(o.lista);
  const resumo = `*${o.titulo}* — SAKUMA\n${o.periodo}` +
    (o.fazenda ? `\nFazenda: ${q.nome('fazendas', o.fazenda)}` : '') +
    `\n${ind.total} programada(s) · ${ind.concluido} concluída(s) · ${ind.atrasado} atrasada(s) · ${ind.pct}% de cumprimento`;

  abrirModal('Relatório pronto', `
    <p class="sub"><strong>${esc(nome)}</strong><br>${esc(o.periodo)} · ${o.lista.length} atividade(s)</p>
    <iframe class="pc-pdf" src="${url}" title="Prévia do relatório"></iframe>
    <div class="acoes">
      <button type="button" class="btn btn-zap" id="rl-zap"><img class="ic-zap" src="img/whatsapp.png" alt="">Enviar pelo WhatsApp</button>
      <a class="btn btn-pdf" href="${url}" download="${esc(nome)}" id="rl-baixar">Baixar PDF</a>
      <button type="button" class="btn neutro" id="rl-imp">Imprimir</button>
    </div>`, corpo => {
    corpo.querySelector('#rl-imp').onclick = () => {
      const fr = corpo.querySelector('.pc-pdf');
      try { fr.contentWindow.focus(); fr.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }
    };
    corpo.querySelector('#rl-zap').onclick = async () => {
      const arq = new File([blob], nome, { type: 'application/pdf' });
      // no celular: compartilha o arquivo direto (escolhe o WhatsApp na lista)
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: o.titulo, text: resumo.replace(/\*/g, '') }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      // no computador: baixa o PDF e abre o WhatsApp com o resumo para anexar
      corpo.querySelector('#rl-baixar').click();
      window.open('https://wa.me/?text=' + encodeURIComponent(resumo + '\n\n(PDF anexo)'), '_blank');
      aviso('PDF baixado. Anexe o arquivo na conversa do WhatsApp.');
    };
  });
}

Object.assign(window, { gerarRelatorio, montarPdf, tabelaHtml, agrupar });
