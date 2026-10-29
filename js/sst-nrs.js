// sst-nrs.js — SST › NRs (29/10/2026, pedido do Guilherme).
//
// Painel das Normas Regulamentadoras com um botão para o portal oficial do
// Ministério do Trabalho e Emprego (gov.br), onde está o texto de todas as NRs.
// Conteúdo vindo do "NRs-Sakuma-Agronegocios.md" (atualizado em 28/10/2026),
// que ele mandou como projeto inicial. A prioridade para a fazenda é SUGERIDA,
// não oficial — o texto que vale é sempre o do portal.
// Fica tudo no código (sem banco): abre sem internet; só o botão do portal
// precisa de conexão. Para atualizar a lista, editar NRS / MUDANCAS abaixo.

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const TELAS_NRS = ['sstNrs'];

/** Portal oficial: lista das NRs vigentes no site do MTE. */
export const PORTAL_NRS = 'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes';

const ATUALIZADO = '28/10/2026';

const PRIOR = {
  alta:  { nome: 'Alta para a fazenda', curto: 'Alta', cor: 'nr-p-alta' },
  media: { nome: 'Média', curto: 'Média', cor: 'nr-p-media' },
  baixa: { nome: 'Baixa (outros setores)', curto: 'Baixa', cor: 'nr-p-baixa' },
};

/** Mudanças recentes registradas no .md. `nr` liga o aviso ao cartão da norma. */
const MUDANCAS = [
  { nr: [10], t: 'NR-10 (Eletricidade): nova redação aprovada pela Portaria MTE nº 737, de 29/05/2026 (DOU de 01/06/2026). Passa a valer em 01/06/2027; até lá vale o texto atual.' },
  { nr: [6], t: 'NR-6 (EPI): a Portaria MTE nº 57/2025 alterou o item 6.9.4 e proíbe ceder o CA de um fabricante ou importador a outro. Em vigor desde 18/07/2025.' },
  { nr: [1], t: 'NR-1: riscos psicossociais incluídos pela Portaria MTE nº 1.419/2024, com vigência adiada para 2026 pela Portaria nº 765/2025 (a confirmar).' },
  { nr: [15, 18, 22, 38], t: 'NR-15, NR-18, NR-22 e NR-38: atualizações apontadas em 06/05/2026 (a confirmar no DOU).' },
];

const REVOGADAS = [
  { n: 2, t: 'Inspeção Prévia' },
  { n: 27, t: 'Registro Profissional do Técnico de Segurança do Trabalho' },
];

/* n = número · t = título · p = prioridade sugerida · r = resumo · i = o que exige na prática */
const NRS = [
  {"n": 1, "t": "Disposições Gerais e Gerenciamento de Riscos Ocupacionais", "p": "alta", "r": "Base de tudo: PGR, inventário de riscos, plano de ação e treinamentos.", "i": ["Ter PGR com inventário de riscos e plano de ação por função", "Avaliar também fatores de riscos psicossociais", "Revisar o PGR periodicamente e quando mudar processo, máquina ou produto", "Informar os trabalhadores sobre os riscos e registrar os treinamentos", "Riscos psicossociais: Portaria 1.419/2024, vigência adiada para 2026 pela Portaria 765/2025 (confirmar)"]},
  {"n": 3, "t": "Embargo e Interdição", "p": "media", "r": "Quando a fiscalização pode paralisar máquina, setor ou obra por risco grave.", "i": ["Em risco grave e iminente, o auditor-fiscal pode embargar ou interditar máquina, setor ou obra", "Saber atender a fiscalização e corrigir rápido"]},
  {"n": 4, "t": "Serviços Especializados em Segurança e em Medicina do Trabalho", "p": "media", "r": "Dimensionamento do serviço de segurança e medicina do trabalho.", "i": ["Verificar se a fazenda precisa de SESMT conforme grau de risco e número de empregados", "Definir quem responde pela segurança e medicina do trabalho"]},
  {"n": 5, "t": "Comissão Interna de Prevenção de Acidentes e de Assédio – CIPA", "p": "alta", "r": "Comissão de prevenção de acidentes e de assédio; no campo, ver também a NR-31.", "i": ["Constituir a comissão (ou designar responsável) conforme número de empregados e grau de risco", "Treinar os membros e registrar reuniões em ata", "No meio rural, seguir também o que a NR-31 pede"]},
  {"n": 6, "t": "Equipamento de Proteção Individual – EPI", "p": "alta", "r": "Escolha, CA, entrega, treinamento e guarda de EPI.", "i": ["Fornecer EPI adequado ao risco, gratuito e com CA válido", "Registrar a entrega com assinatura do trabalhador", "Treinar no uso, guarda e conservação", "Substituir quando danificado ou vencido", "Não aceitar EPI com CA cedido por outro fabricante ou importador (item 6.9.4)"]},
  {"n": 7, "t": "Programa de Controle Médico de Saúde Ocupacional – PCMSO", "p": "alta", "r": "Programa de controle médico: exames admissionais, periódicos e demissionais.", "i": ["Exames admissional, periódico, de mudança de função, retorno ao trabalho e demissional", "ASO emitido pelo médico responsável", "Guardar os registros e acompanhar prazos dos exames"]},
  {"n": 8, "t": "Edificações", "p": "media", "r": "Requisitos de segurança e conforto de prédios e locais de trabalho.", "i": ["Pisos, cobertura, ventilação e iluminação adequados nos prédios", "Guarda-corpo e proteção em plataformas e aberturas"]},
  {"n": 9, "t": "Avaliação e Controle das Exposições Ocupacionais a Agentes Físicos, Químicos e Biológicos", "p": "alta", "r": "Avaliação e controle de exposição a ruído, calor, produtos químicos, etc.", "i": ["Reconhecer e avaliar agentes: ruído, poeira, calor, produtos químicos, agentes biológicos", "Adotar medidas de controle antes de depender só do EPI", "Registrar no inventário de riscos do PGR"]},
  {"n": 10, "t": "Segurança em Instalações e Serviços em Eletricidade", "p": "media", "r": "Segurança em quadros, redes, bombas e manutenção elétrica.", "i": ["Só trabalhadores habilitados mexem em instalações elétricas", "Bloqueio e etiquetagem na manutenção", "Quadros sinalizados e documentação das instalações", "Nova redação (Portaria MTE 737/2026) vale a partir de 01/06/2027; até lá vale o texto atual"]},
  {"n": 11, "t": "Transporte, Movimentação, Armazenagem e Manuseio de Materiais", "p": "media", "r": "Empilhadeiras, cargas, armazéns e movimentação de materiais.", "i": ["Treinar e autorizar operadores de empilhadeira e equipamentos de carga", "Respeitar limite de peso e empilhamento seguro", "Sinalizar vias de circulação"]},
  {"n": 12, "t": "Segurança no Trabalho em Máquinas e Equipamentos", "p": "alta", "r": "Proteções, dispositivos de parada e manutenção segura de máquinas.", "i": ["Proteções fixas ou móveis em partes que giram, cortam ou prensam", "Dispositivos de parada de emergência funcionando", "Operação e manutenção só por pessoas treinadas, com manual e sinalização"]},
  {"n": 13, "t": "Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos de Armazenamento", "p": "baixa", "r": "Inspeção e operação de equipamentos sob pressão.", "i": ["Se houver compressor de ar, caldeira ou vaso de pressão, verificar manual, válvulas e inspeções periódicas"]},
  {"n": 14, "t": "Fornos", "p": "baixa", "r": "Segurança em fornos industriais.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 15, "t": "Atividades e Operações Insalubres", "p": "alta", "r": "Define insalubridade e graus (ruído, agentes químicos, calor...).", "i": ["Identificar atividades insalubres (ruído, agentes químicos, calor, etc.) com laudo", "Eliminar ou controlar o agente; EPI não elimina o direito ao adicional sem neutralização comprovada", "Adicional por grau: 10%, 20% ou 40%"]},
  {"n": 16, "t": "Atividades e Operações Perigosas", "p": "media", "r": "Periculosidade: inflamáveis, explosivos, eletricidade, etc.", "i": ["Atividades perigosas (inflamáveis, eletricidade, explosivos, etc.) dão adicional de periculosidade de 30%", "Enquadramento definido por laudo"]},
  {"n": 17, "t": "Ergonomia", "p": "alta", "r": "Postura, esforço, ritmo de trabalho e organização do trabalho.", "i": ["Analisar tarefas e postos de trabalho (postura, esforço, repetição)", "Organizar pausas, rodízio e levantamento de peso seguro", "Treinar equipes e acompanhar queixas de dor"]},
  {"n": 18, "t": "Segurança e Saúde no Trabalho na Indústria da Construção", "p": "baixa", "r": "Segurança na indústria da construção (obras e reformas).", "i": ["Vale se a fazenda fizer obra ou reforma (ex.: construir galpão)"]},
  {"n": 19, "t": "Explosivos", "p": "baixa", "r": "Fabricação, transporte e uso de explosivos.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 20, "t": "Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis", "p": "media", "r": "Armazenamento e manuseio de combustíveis e lubrificantes.", "i": ["Guardar combustíveis e lubrificantes em local sinalizado, ventilado e com contenção de vazamento", "Extintores à mão, sem fontes de fogo, aterramento quando exigido", "Treinar quem manuseia"]},
  {"n": 21, "t": "Trabalhos a Céu Aberto", "p": "alta", "r": "Proteção contra sol, chuva, frio e outras intempéries.", "i": ["Fornecer água potável fresca e abrigo contra sol e chuva", "Proteção contra radiação solar e calor", "Prever pausas em condições severas"]},
  {"n": 22, "t": "Segurança e Saúde Ocupacional na Mineração", "p": "baixa", "r": "Segurança em atividades de mineração.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 23, "t": "Proteção Contra Incêndios", "p": "alta", "r": "Extintores, saídas, brigada e prevenção de incêndio.", "i": ["Extintores sinalizados, desobstruídos e dentro da validade", "Saídas e plano de emergência conhecidos", "Treinar a equipe para primeiro combate ao fogo"]},
  {"n": 24, "t": "Condições Sanitárias e de Conforto", "p": "alta", "r": "Banheiros, vestiários, refeitório, água potável e descanso.", "i": ["Banheiros, vestiários e local de refeição limpos e em número adequado", "Água potável disponível", "No campo, ver também as áreas de vivência da NR-31"]},
  {"n": 25, "t": "Resíduos Industriais", "p": "media", "r": "Gerenciamento e descarte de resíduos industriais.", "i": ["Segregar, identificar, armazenar e destinar corretamente os resíduos", "Guardar os comprovantes de destinação"]},
  {"n": 26, "t": "Sinalização de Segurança", "p": "alta", "r": "Cores, placas e identificação de riscos, tubulações e produtos.", "i": ["Usar cores e placas padronizadas (proibição, alerta, emergência)", "Identificar tubulações, produtos químicos e áreas de risco", "Rotular recipientes e locais de armazenamento"]},
  {"n": 28, "t": "Fiscalização e Penalidades", "p": "media", "r": "Como funciona a fiscalização e as multas por descumprimento.", "i": ["Conhecer prazos e multas por descumprimento", "Manter documentos organizados para fiscalização"]},
  {"n": 29, "t": "Segurança e Saúde no Trabalho Portuário", "p": "baixa", "r": "Segurança em portos.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 30, "t": "Segurança e Saúde no Trabalho Aquaviário", "p": "baixa", "r": "Segurança em embarcações comerciais.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 31, "t": "Agricultura, Pecuária, Silvicultura, Exploração Florestal e Aquicultura", "p": "alta", "r": "A norma da fazenda: agrotóxicos, máquinas agrícolas, vivência, transporte de trabalhadores.", "i": ["Treinar trabalhadores em agrotóxicos, máquinas, ergonomia e primeiros socorros", "Depósito de agrotóxicos: local exclusivo, ventilado, sinalizado; descarte correto das embalagens", "EPI para aplicação, descontaminação e respeito ao intervalo de reentrada", "Áreas de vivência: sanitários, refeitório, água potável, abrigo", "Transporte seguro dos trabalhadores", "Tratores e máquinas com proteções e estrutura de proteção contra capotamento"]},
  {"n": 32, "t": "Segurança e Saúde no Trabalho em Serviços de Saúde", "p": "baixa", "r": "Segurança em hospitais, clínicas e laboratórios.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 33, "t": "Segurança e Saúde nos Trabalhos em Espaços Confinados", "p": "media", "r": "Entrada segura em tanques, cisternas e poços.", "i": ["Identificar e sinalizar espaços confinados (tanques, cisternas, poços)", "Permissão de entrada, vigia e medição da atmosfera", "Capacitação de trabalhadores e vigias"]},
  {"n": 34, "t": "Condições e Meio Ambiente de Trabalho na Indústria da Construção, Reparação e Desmonte Naval", "p": "baixa", "r": "Segurança na indústria naval.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 35, "t": "Trabalho em Altura", "p": "alta", "r": "Qualquer trabalho acima de 2 m: capacitação, análise de risco e permissão.", "i": ["Qualquer trabalho acima de 2 m: capacitação, análise de risco e permissão de trabalho quando exigida", "Cinto tipo paraquedista, trava-quedas e ponto de ancoragem adequado", "Reciclagem periódica do treinamento"]},
  {"n": 36, "t": "Segurança e Saúde no Trabalho em Empresas de Abate e Processamento de Carnes e Derivados", "p": "baixa", "r": "Segurança em frigoríficos.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 37, "t": "Segurança e Saúde em Plataformas de Petróleo", "p": "baixa", "r": "Segurança a bordo de plataformas.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
  {"n": 38, "t": "Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana e Manejo de Resíduos Sólidos", "p": "baixa", "r": "Coleta, transporte e destinação de resíduos urbanos.", "i": ["Norma de outro setor, fora da rotina da fazenda. Útil para estudo."]},
];

const S = { filtro: 'todas', busca: '', abertas: new Set() };

const temMudanca = n => MUDANCAS.some(m => m.nr.includes(n));

function botaoPortal(classe = 'btn principal') {
  return `<a class="${classe} nr-portal" href="${PORTAL_NRS}" target="_blank" rel="noopener noreferrer"
    title="Abre a lista oficial das NRs vigentes no site do Ministério do Trabalho e Emprego">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>
    Portal oficial das NRs (gov.br)</a>`;
}

function filtradas() {
  const b = semAcento(S.busca).trim();
  return NRS.filter(x => {
    if (S.filtro !== 'todas' && S.filtro !== 'revogadas' && x.p !== S.filtro) return false;
    if (S.filtro === 'revogadas') return false;
    if (!b) return true;
    const alvo = semAcento(`nr-${x.n} nr ${x.n} nr${x.n} ${x.t} ${x.r} ${x.i.join(' ')}`);
    return b.split(/\s+/).every(p => alvo.includes(p));
  });
}

function cartao(x) {
  const pr = PRIOR[x.p];
  const aberta = S.abertas.has(x.n);
  const avisos = MUDANCAS.filter(m => m.nr.includes(x.n));
  return `<article class="nr-card ${aberta ? 'aberta' : ''}">
    <button type="button" class="nr-cab" data-nr="${x.n}" aria-expanded="${aberta}">
      <span class="nr-num">NR-${x.n}</span>
      <span class="nr-tit"><b>${esc(x.t)}</b><small>${esc(x.r)}</small></span>
      <span class="nr-tags">${temMudanca(x.n) ? '<span class="nr-novo" title="Mudança recente registrada">Mudança recente</span>' : ''}<span class="nr-p ${pr.cor}">${pr.curto}</span></span>
      <svg class="nr-seta" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    ${aberta ? `<div class="nr-corpo">
      ${avisos.map(m => `<p class="nr-aviso">${esc(m.t)}</p>`).join('')}
      <p class="nr-sub">O que exige na prática</p>
      <ul>${x.i.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      <div class="nr-acoes">${botaoPortal('btn')}</div>
    </div>` : ''}
  </article>`;
}

function desenhar() {
  const alvo = $('telaSstNrs');
  if (!alvo) return;
  const cont = { alta: 0, media: 0, baixa: 0 };
  for (const x of NRS) cont[x.p]++;
  const lista = filtradas();
  const grupos = ['alta', 'media', 'baixa'].map(p => ({ p, l: lista.filter(x => x.p === p) })).filter(g => g.l.length);
  const fil = [['todas', `Todas (${NRS.length})`], ['alta', `Alta (${cont.alta})`], ['media', `Média (${cont.media})`],
    ['baixa', `Baixa (${cont.baixa})`], ['revogadas', `Revogadas (${REVOGADAS.length})`]];
  alvo.innerHTML = `
  <div class="cartao">
    <div class="barra entre" style="margin:0;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <h2 style="margin:0">Normas Regulamentadoras (NRs)</h2>
        <p class="dica" style="margin:4px 0 0">Resumo para o dia a dia da fazenda, atualizado em ${ATUALIZADO}.
          A prioridade é <b>sugerida</b> para o trabalho rural, não oficial. Antes de usar em documento, confirme o texto no portal oficial.</p>
      </div>
      ${botaoPortal()}
    </div>
    <div class="nr-kpis">
      <div><b>${NRS.length + REVOGADAS.length}</b><span>NRs na lista oficial</span></div>
      <div><b>${NRS.length}</b><span>vigentes</span></div>
      <div class="nr-k-alta"><b>${cont.alta}</b><span>prioridade alta</span></div>
      <div><b>${cont.media}</b><span>média</span></div>
      <div><b>${cont.baixa}</b><span>baixa</span></div>
    </div>
  </div>

  <div class="cartao nr-mud">
    <h3 style="margin:0 0 6px">Mudanças recentes registradas</h3>
    <ul>${MUDANCAS.map(m => `<li>${esc(m.t)}</li>`).join('')}</ul>
  </div>

  <div class="cartao">
    <div class="nr-filtros">
      <input type="search" id="nrBusca" placeholder="Buscar: número, assunto (ex.: 31, agrotóxico, altura, EPI)" value="${esc(S.busca)}" autocomplete="off">
      <div class="nr-chips">${fil.map(([id, txt]) => `<button type="button" class="nr-chip ${S.filtro === id ? 'ativo' : ''}" data-nrf="${id}">${txt}</button>`).join('')}</div>
      <span class="nr-barra2">
        <button type="button" class="btn" data-nrx="abrir">Abrir todas</button>
        <button type="button" class="btn" data-nrx="fechar">Fechar todas</button>
      </span>
    </div>
    ${S.filtro === 'revogadas'
      ? `<ul class="nr-rev">${REVOGADAS.map(r => `<li><b>NR-${r.n}</b> – ${esc(r.t)} <span class="nr-p nr-p-baixa">Revogada</span></li>`).join('')}</ul>`
      : grupos.length
        ? grupos.map(g => `<h3 class="nr-grupo">Prioridade ${PRIOR[g.p].nome.toLowerCase()} <span>${g.l.length}</span></h3>
            <div class="nr-lista">${g.l.map(cartao).join('')}</div>`).join('')
        : `<p class="dica" style="margin:14px 0 0">Nenhuma NR encontrada para "${esc(S.busca)}".</p>`}
  </div>
  <p class="dica nr-pe">Documento de uso interno. O texto oficial e atualizado das normas está no portal do Ministério do Trabalho e Emprego.</p>`;
  ligarTela(alvo);
}

function ligarTela(alvo) {
  const b = $('nrBusca');
  if (b) b.addEventListener('input', () => {
    const pos = b.selectionStart;
    S.busca = b.value;
    if (S.filtro === 'revogadas') S.filtro = 'todas';
    desenhar();
    const nb = $('nrBusca'); nb.focus(); try { nb.setSelectionRange(pos, pos); } catch { /* */ }
  });
  alvo.querySelectorAll('[data-nrf]').forEach(el => el.addEventListener('click', () => { S.filtro = el.dataset.nrf; desenhar(); }));
  alvo.querySelectorAll('[data-nr]').forEach(el => el.addEventListener('click', () => {
    const n = Number(el.dataset.nr);
    if (S.abertas.has(n)) S.abertas.delete(n); else S.abertas.add(n);
    desenhar();
  }));
  alvo.querySelectorAll('[data-nrx]').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.nrx === 'abrir') filtradas().forEach(x => S.abertas.add(x.n)); else S.abertas.clear();
    desenhar();
  }));
}

export function abrirNrs() { desenhar(); }
export function limparNrs() { S.busca = ''; S.filtro = 'todas'; S.abertas.clear(); const a = $('telaSstNrs'); if (a) a.innerHTML = ''; }
