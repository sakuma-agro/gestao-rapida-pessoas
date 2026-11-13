// ficha.js — reproduz a aba "Ficha EPI" da planilha, celula por celula.
// Larguras, alturas, fontes e bordas vem direto do arquivo original,
// convertidas com a escala de impressao de 42% usada na planilha.
import { LOGO } from './seed.js';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const COLUNAS = ['faz', 'data', 'qtd', 'ca', 'descricao', 'devolucao', 'assinatura', 'mer'];
export const TRACO = '_____/_____/_______';

export const linhaVazia = () =>
  ({ faz: '', data: '', qtd: '', ca: '', descricao: '', devolucao: '', assinatura: '', mer: '' });

/* Faixa de seguranca do rodape: cinco selos desenhados em vetor (SVG), no
   verde da marca. Sao arte fixa da ficha, nao texto do modelo. */
const SELOS = [
  ['SEGURANÇA',
    '<path d="M12 3.2 19.4 6.1v6c0 4.5-3.1 7.6-7.4 8.7-4.3-1.1-7.4-4.2-7.4-8.7v-6z"/>' +
    '<path d="m8.7 12.2 2.4 2.4 4.2-4.6"/>'],
  ['OBSERVE',
    '<path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12z"/>' +
    '<circle cx="12" cy="12" r="3.1"/>'],
  ['PARE',
    '<path d="M8.2 13.4V6.2a1.4 1.4 0 0 1 2.8 0v5.4"/>' +
    '<path d="M11 11.6V5a1.4 1.4 0 0 1 2.8 0v6.6"/>' +
    '<path d="M13.8 11.6V6a1.4 1.4 0 0 1 2.8 0v5.6"/>' +
    '<path d="M16.6 10.2a1.4 1.4 0 0 1 2.8 0v4.2c0 3.6-2.5 6.4-6.2 6.4h-.9c-1.7 0-2.8-.7-3.8-2l-3.2-4.4a1.5 1.5 0 0 1 2.4-1.8l1.6 2"/>'],
  ['COMUNIQUE',
    '<path d="M20.4 4.6H3.6v10.6h4.2v4.2l4.6-4.2h8z"/>' +
    '<path d="M12 7.4v3.6"/><path d="M12 12.9v.1"/>'],
  ['VOLTE BEM',
    '<path d="M3.4 10.6 12 3.4l8.6 7.2v8.2a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z"/>' +
    '<path d="M12 18.1s-2.7-1.8-2.7-3.5a1.5 1.5 0 0 1 2.7-.9 1.5 1.5 0 0 1 2.7.9c0 1.7-2.7 3.5-2.7 3.5z"/>'],
];

const FAIXA_SELOS = '<div class="selos" aria-hidden="true">' +
  SELOS.map(([nome, desenho]) =>
    '<div class="selo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + desenho + '</svg>' +
    `<span>${nome}</span></div>`).join('') + '</div>';

const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dataBr = iso => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Celula editavel: input transparente com os tracos aparecendo quando vazia. */
function celula(campo, indice, valor, classes, marca) {
  const v = valor || '';
  const ph = marca ? `<span class="ph">${marca}</span>` : '';
  return `<td class="cel ${classes}"><div class="cw${v ? ' preenchida' : ''}">` +
    `<input class="cx" data-linha="${indice}" data-campo="${campo}" value="${esc(v)}"` +
    (campo === 'descricao' ? ' list="lista-epis" autocomplete="off"' : '') + `>${ph}</div></td>`;
}

const cpfBr = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || ''); };

/* Ficha da ENTREGA de EPI (SST › EPI's › Entregas, 13/11/2026). Mesmo modelo,
   com o que ele alinhou item a item:
   · sem "MÊS" no alto — as legendas FAZ e M.E.R usam esse espaço;
   · linha do funcionário: FUNCIONÁRIO: nome · CPF · Nº cadastro;
   · assinatura do termo continua ACIMA da tabela, com nome e CPF embaixo;
   · coluna ASSINATURA e linhas em branco continuam; faixa de selos mais fina.
   Textos continuam vindo do Modelo da ficha. */
/* Descrição do EPI: letra menor só nos nomes compridos, para caber na coluna
   (análise dos 95 EPIs em 13/11/2026: 3 passavam da largura). */
const tamDescricao = t => { const n = String(t || '').length; return n > 38 ? 'f12' : n > 30 ? 'f14' : 'f16'; };

function fichaEntrega(func, modelo, opcoes) {
  const { linhas, chave } = opcoes;
  const setor = opcoes.setor || func.setor || modelo.setor_padrao || 'CAMPO';
  const fazLeg = modelo.legenda_faz || [];
  const merLeg = modelo.legenda_mer || [];
  const decls = modelo.declaracoes || [];
  const cpf = cpfBr(func.cpf);
  const linhaHtml = (l, i) => '<tr class="r43">' +
    celula('faz', i, l.faz, 'f18 b ce brt btt bbt') +
    celula('data', i, l.data, 'f16 b ce brt btt bbt', '___/___/____') +
    celula('qtd', i, l.qtd, 'f18 b ce blt brt btt bbt') +
    celula('ca', i, l.ca, 'f20 b ce blt brt btt bbt') +
    celula('descricao', i, l.descricao, `${tamDescricao(l.descricao)} es blt brt btt bbt`) +
    celula('devolucao', i, l.devolucao, 'f12 b ce brt btt bbt', TRACO) +
    celula('assinatura', i, l.assinatura, 'f14 es blt brt btt bbt') +
    celula('mer', i, l.mer, 'f18 b ce blt btt bbt') +
    '</tr>';
  /* Cabeçalho (13/11/2026, sugestão C): logo | título em duas linhas | código
     do formulário; legendas FAZ e M.E.R em duas faixas corridas. "G - GERAL"
     entra sozinho se o Modelo da ficha não tiver G. */
  const fazPares = [];
  for (const linha of fazLeg) for (const parte of String(linha).split('/')) if (parte.trim()) fazPares.push(parte.trim().replace(/\s+/g, ' '));
  if (!fazPares.some(t => /^G\s*-/i.test(t))) fazPares.push('G - GERAL');
  const tit = String(modelo.titulo || '');
  const iPar = tit.indexOf(' (');
  const titHtml = iPar > 0 ? `${esc(tit.slice(0, iPar))}<br>${esc(tit.slice(iPar + 1))}` : esc(tit);
  const campoForm = (rot, val, vazio) => `<div class="fe-fl"><span>${rot}</span><b>${val ? esc(val) : `<i>${vazio}</i>`}</b></div>`;
  const numHtml = `<div class="fe-num"><span>Nº da entrega</span><b>${opcoes.numero ? esc(opcoes.numero) : '<i></i>'}</b></div>`;
  const formHtml = campoForm('Formulário', modelo.form_codigo, '') +
    campoForm('Revisão', modelo.form_revisao, '') + campoForm('Data', modelo.form_data, '');
  /* Legendas (13/11/2026, "faltou deixar melhor sobre o M.E.R - Motivos"): rótulo
     inteiro à esquerda (sigla em destaque + o que significa) e os itens em grade,
     cada um com a letra/número em negrito. */
  const rotulo = r => { const t = String(r || '').trim(); const i = t.indexOf(':');
    return i > 0 ? `<b>${esc(t.slice(0, i))}</b><span>${esc(t.slice(i + 1).trim())}</span>` : `<b>${esc(t)}</b>`; };
  const item = t => { const m = String(t).match(/^\s*([A-Z0-9]{1,2})\s*-\s*(.*)$/i);
    return m ? `<div><b>${esc(m[1])}</b> ${esc(m[2])}</div>` : `<div>${esc(t)}</div>`; };
  /* FAZ e M.E.R lado a lado (13/11/2026, "divida esse espaço, primeiro a fazenda,
     depois os motivos"): cada bloco = título (sigla + significado) e itens em grade. */
  const bloco = (rot, itens, cls) => `<div class="fe-bloco ${cls}"><div class="fe-rot">${rotulo(rot)}</div>
    <div class="fe-itens ${cls}">${itens.map(item).join('')}</div></div>`;
  return `<div class="folha fe">
  <div class="ficha" data-chave="${esc(chave)}">
  <table class="fx"><colgroup>
    <col style="width:4.729%"><col style="width:9.5%"><col style="width:5.296%"><col style="width:9.269%">
    <col style="width:26.502%"><col style="width:13.997%"><col style="width:22.131%"><col style="width:8.575%">
  </colgroup><tbody>
  <tr class="fe-topo"><td colspan="8"><div class="fe-topo-in">
    <div class="fe-logo"><img src="img/sakuma-logo.png" alt="SAKUMA Agronegócios"></div>
    <div class="fe-titulo">${titHtml}</div>
    ${numHtml}
    <div class="fe-form">${formHtml}</div>
  </div></td></tr>
  <tr class="fe-faixa"><td colspan="8"><div class="fe-leg2">${bloco(modelo.rotulo_faz, fazPares, 'faz')}${bloco(modelo.rotulo_mer, merLeg, 'mer')}</div></td></tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">EMPREGADOR:</td>
    <td colspan="6" class="f20 b es vm btt bbt">${esc(func.empregador)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">CARGO: </td>
    <td colspan="3" class="f20 b es vm btt bbt">${esc(func.cargo)}</td>
    <td class="f20 b ce vm btt bbt blt">SETOR:</td>
    <td colspan="2" class="f20 b es vm btt bbt">${esc(setor)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">FUNCIONÁRIO: </td>
    <td colspan="3" class="f20 es vm btt bbt">${esc(func.nome)}</td>
    <td colspan="2" class="f20 es vm btt bbt blt"><b>CPF:</b> ${esc(cpf)}</td>
    <td class="f20 ce vm btt bbt blt"><b>Nº</b> ${esc(func.cadastro)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">ADMISSÃO:</td>
    <td colspan="3" class="f20 b es vm brt btt bbt">${esc(dataBr(func.admissao))}</td>
    <td colspan="3" class="f20 es vm blt btt bbt">${esc(modelo.rodape_demissao)}</td>
  </tr>
  <tr><td colspan="8" class="fe-decl-tit">${esc(modelo.declaracao_titulo)}</td></tr>
  <tr><td colspan="8" class="fe-decl">${decls.map(t => `<div>${esc(t)}</div>`).join('')}${modelo.declaracao_longa ? `<div class="fe-longa">${esc(modelo.declaracao_longa)}</div>` : ''}</td></tr>
  <tr><td colspan="8" class="fe-assin"><div class="fe-traco"></div>
    <div class="fe-nome">${esc(func.nome)}${cpf ? ` <span>· CPF ${esc(cpf)}</span>` : ''}</div></td></tr>
  <tr class="r23">
    <td class="f12 b ce vm btm brt bbt">FAZ</td>
    <td class="f12 b ce vm btm brt bbt">DATA</td>
    <td class="f12 b ce vm btm blt brt bbt">QTD.</td>
    <td class="f12 b ce vm btm blt brt bbt">C.A</td>
    <td class="f12 b ce vm btm blt brt bbt">DESCRIÇÃO DO EPI</td>
    <td class="f12 b ce vm btm blt brt bbt">DEVOLUÇÃO</td>
    <td class="f12 b ce vm btm blt brt bbt">ASSINATURA</td>
    <td class="f12 b ce vm btm blt bbt">M.E.R</td>
  </tr>
  ${linhas.map(linhaHtml).join('')}
  </tbody></table></div>
  ${FAIXA_SELOS}
</div>`;
}

export function montarFicha(func, modelo, opcoes) {
  if (opcoes && opcoes.entrega) return fichaEntrega(func, modelo, opcoes);
  const { mes, ano, linhas, chave } = opcoes;
  const setor = opcoes.setor || func.setor || modelo.setor_padrao || 'CAMPO';
  const mesTexto = `${MESES[mes]}, ${ano}`;
  const fazLeg = modelo.legenda_faz || [];
  const merLeg = modelo.legenda_mer || [];
  const decls = modelo.declaracoes || [];

  const linhaHtml = (l, i) => '<tr class="r43">' +
    celula('faz', i, l.faz, 'f14 ce brt btt bbt') +
    celula('data', i, l.data, 'f12 b ce brt btt bbt', TRACO) +
    celula('qtd', i, l.qtd, 'f14 ce blt brt btt bbt') +
    celula('ca', i, l.ca, 'f14 ce blt brt btt bbt') +
    celula('descricao', i, l.descricao, 'f14 es blt brt btt bbt') +
    celula('devolucao', i, l.devolucao, 'f12 b ce brt btt bbt', TRACO) +
    celula('assinatura', i, l.assinatura, 'f14 es blt brt btt bbt') +
    celula('mer', i, l.mer, 'f10 ce blt btt bbt') +
    '</tr>';

  return `<div class="folha">
  <div class="ficha" data-chave="${esc(chave)}">
  <table class="fx"><colgroup>
    <col style="width:4.729%"><col style="width:13.997%"><col style="width:5.296%"><col style="width:9.269%">
    <col style="width:22.005%"><col style="width:13.997%"><col style="width:22.131%"><col style="width:8.575%">
  </colgroup><tbody>
  <tr class="r6">
    <td class="logo" colspan="2" rowspan="5"><span class="marca"><img src="${LOGO}" alt=""></span></td>
    <td colspan="2" class="brm"></td>
    <td class="f12 b es vm brt bbt">${esc(modelo.rotulo_faz)}</td>
    <td colspan="3" class="f12 b ce vm bbt">${esc(modelo.rotulo_mer)}</td>
  </tr>
  <tr class="r6">
    <td colspan="2" class="f19 b ce vm brm">MÊS: </td>
    <td class="f12 es vm brt btt bbt">${esc(fazLeg[0])}</td>
    <td colspan="3" class="f12 vm btt bbt">${esc(merLeg[0])}</td>
  </tr>
  <tr class="r6">
    <td colspan="2" class="f19 b ce vm brm">${esc(mesTexto)}</td>
    <td class="f12 es vm brt btt bbt">${esc(fazLeg[1])}</td>
    <td colspan="3" class="f12 vm btt bbt">${esc(merLeg[1])}</td>
  </tr>
  <tr class="r6">
    <td colspan="2" class="brm"></td>
    <td class="f12 es vm brt btt bbt">${esc(fazLeg[2])}</td>
    <td colspan="3" class="f12 vm btt bbt">${esc(merLeg[2])}</td>
  </tr>
  <tr class="r6">
    <td colspan="2" class="brm"></td>
    <td class="f12 es vm brt btt">${esc(fazLeg[3])}</td>
    <td colspan="3" class="f12 vm btt">${esc(merLeg[3])}</td>
  </tr>

  <tr class="r12"><td colspan="8" class="titulo btm">${esc(modelo.titulo)}</td></tr>
  <tr class="r12"><td colspan="8"></td></tr>

  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">EMPREGADOR:</td>
    <td colspan="6" class="f20 b es vm btt bbt">${esc(func.empregador)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt">CARGO: </td>
    <td colspan="3" class="f20 b es vm">${esc(func.cargo)}</td>
    <td class="f20 b ce vm btt bbt">SETOR:</td>
    <td colspan="2" class="f20 b es vm bbt">${esc(setor)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">FUNCIONÁRIO: </td>
    <td colspan="5" class="f20 es vm brt btt bbt">${esc(func.nome)}</td>
    <td class="f20 b ce vm btt">${esc(func.cadastro)}</td>
  </tr>
  <tr class="r12">
    <td colspan="2" class="f20 b es vm btt bbt">ADMISSÃO:</td>
    <td colspan="3" class="f20 b es vm brt btt bbt">${esc(dataBr(func.admissao))}</td>
    <td colspan="3" class="f20 es vm blt btt bbt">${esc(modelo.rodape_demissao)}</td>
  </tr>

  <tr class="r18"><td colspan="8" class="f16 b es vm nowrap">${esc(modelo.declaracao_titulo)}</td></tr>
  ${decls.map(t => `<tr class="r18"><td colspan="8" class="decl">${esc(t)}</td></tr>`).join('')}
  <tr><td colspan="8" class="decl" style="height:var(--h20)">${esc(modelo.declaracao_longa)}</td></tr>

  <tr class="r21"><td colspan="8" class="assinlinha">_____________________________________</td></tr>
  <tr class="r22"><td colspan="8" class="assinnome">${esc(func.nome)}</td></tr>

  <tr class="r23">
    <td class="f12 b ce vm btm brt bbt">FAZ</td>
    <td class="f12 b ce vm btm brt bbt">DATA</td>
    <td class="f12 b ce vm btm blt brt bbt">QTD.</td>
    <td class="f12 b ce vm btm blt brt bbt">C.A</td>
    <td class="f12 b ce vm btm blt brt bbt">DESCRIÇÃO DO EPI</td>
    <td class="f12 b ce vm btm blt brt bbt">DEVOLUÇÃO</td>
    <td class="f12 b ce vm btm blt brt bbt">ASSINATURA</td>
    <td class="f12 b ce vm btm blt bbt">M.E.R</td>
  </tr>
  ${linhas.map(linhaHtml).join('')}
  </tbody></table></div>
  ${FAIXA_SELOS}
</div>`;
}
