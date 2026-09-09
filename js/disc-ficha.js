// disc-ficha.js — folha A4 do perfil individual, no padrão SAKUMA
import { LOGO } from './seed.js';
import { COLUNAS, PADRAO } from './disc-dados.js';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};

const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function bloco(titulo, texto) {
  if (!texto) return '';
  return `<div class="dk-bloco"><h4>${esc(titulo)}</h4><p>${esc(texto)}</p></div>`;
}

function cartao(perfil, pct, rotulo, extra) {
  const cor = perfil?.cor || '#51534A';
  const clara = perfil?.codigo === 'I';
  return `
    <div class="dk-cartao" style="border-color:${cor}">
      <div class="dk-cab" style="background:${cor};color:${clara ? '#3d3400' : '#fff'}">
        <span class="dk-letra">${esc(perfil?.codigo || '—')}</span>
        <span class="dk-nome">${esc(perfil?.nome || '—')}</span>
        <span class="dk-pct">${num(pct)}%</span>
      </div>
      <div class="dk-corpo">
        <p class="dk-rot">${esc(rotulo)}${extra ? ' · ' + esc(extra) : ''}</p>
        <p class="dk-res">${esc(perfil?.resumo || '')}</p>
      </div>
    </div>`;
}

function barras(pct, perfis) {
  return `<table class="dk-barras">${COLUNAS.map(c => {
    const p = perfis[c] || PADRAO[c];
    const v = pct[c] || 0;
    return `<tr>
      <td class="dk-b-nome"><b>${c}</b> ${esc(p.nome)}</td>
      <td class="dk-b-tr"><span class="dk-b-in" style="width:${Math.max(v, 0.6)}%;background:${p.cor}"></span></td>
      <td class="dk-b-v">${num(v)}%</td>
    </tr>`;
  }).join('')}</table>`;
}

/**
 * @param func      funcionário do cadastro
 * @param leitura   saída de analisar()
 * @param perfis    { D:{...}, I:{...} } vindos do banco
 * @param combinacao texto da combinação principal+secundário
 * @param avaliacao linha de disc_avaliacoes
 */
export function montarFichaDisc(func, leitura, perfis, combinacao, avaliacao) {
  const P = perfis[leitura.principal];
  const S = perfis[leitura.secundario];
  const rotuloPar = leitura.parentesco
    ? (leitura.parentesco === 'primos'
        ? 'perfis primos — se completam com naturalidade'
        : 'perfis irmãos — puxam para lados opostos')
    : '';

  return `
  <div class="dk-folha">
    <div class="dk-topo">
      <img src="${LOGO}" alt="">
      <div class="dk-tit">
        <h1>Perfil Comportamental DISC</h1>
        <p>SAKUMA Agronegócios · Recursos Humanos</p>
      </div>
    </div>

    <table class="dk-id">
      <tr>
        <td class="dk-id-nome" colspan="2"><span>Funcionário</span><b>${esc(func.nome)}</b></td>
        <td><span>Data do teste</span><b>${dataBr(avaliacao?.data_teste)}</b></td>
      </tr>
      <tr>
        <td><span>Cargo</span><b>${esc(func.cargo || '—')}</b></td>
        <td><span>Setor</span><b>${esc(func.setor || '—')}</b></td>
        <td><span>Fazenda</span><b>${esc(func.fazenda || '—')}</b></td>
      </tr>
    </table>

    <div class="dk-cartoes">
      ${cartao(P, leitura.pct[leitura.principal], 'Perfil principal', leitura.intensidade)}
      ${cartao(S, leitura.pct[leitura.secundario], leitura.empate ? 'Empatado no principal' : 'Perfil secundário', rotuloPar)}
    </div>

    ${barras(leitura.pct, perfis)}

    ${combinacao ? `<div class="dk-comb"><h4>${esc(P?.nome || '')} com ${esc(S?.nome || '')}</h4><p>${esc(combinacao)}</p></div>` : ''}

    <h3 class="dk-sec">Perfil principal · ${esc(P?.nome || '')}</h3>
    <div class="dk-grade">
      ${bloco('Comportamentos', P?.comportamentos)}
      ${bloco('Pontos fortes', P?.pontos_fortes)}
      ${bloco('Pontos de atenção', P?.pontos_atencao)}
      ${bloco('Como se comunicar', P?.comunicacao)}
      ${bloco('O que motiva e o que desmotiva', P?.motivadores)}
      ${bloco('Onde rende mais', P?.ambiente_ideal)}
      ${bloco('Como delegar', P?.como_delegar)}
    </div>

    ${S ? `<h3 class="dk-sec">Perfil secundário · ${esc(S.nome)}</h3>
    <div class="dk-grade">
      ${bloco('Comportamentos', S.comportamentos)}
      ${bloco('Pontos fortes', S.pontos_fortes)}
      ${bloco('Pontos de atenção', S.pontos_atencao)}
      ${bloco('Como se comunicar', S.comunicacao)}
    </div>` : ''}

    ${avaliacao?.observacoes ? `<div class="dk-obs"><h4>Observações</h4><p>${esc(avaliacao.observacoes)}</p></div>` : ''}

    <div class="dk-pe">
      <span>Documento de uso interno do RH. O perfil descreve estilo de comportamento — não mede
      competência, desempenho nem serve como critério de avaliação ou desligamento.</span>
    </div>
  </div>`;
}
