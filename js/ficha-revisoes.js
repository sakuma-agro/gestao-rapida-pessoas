/* SST › EPI's › Revisões (13/11/2026, pedido dele: "crie uma aba revisões").
   Ficha de EPI = FORM 057 na Lista mestra.
   · Rev. 02 (13/11/2026): ficha da entrega (js/ficha.js › fichaEntrega), textos do
     Modelo da ficha.
   · Rev. 01: a ficha anterior (modelo da planilha, com MÊS no alto). Fica guardada
     SÓ PARA VISUALIZAR: os textos estão congelados aqui (cópia do Modelo em
     13/11/2026), então mudar o Modelo da ficha não altera a Rev. 01. */
import { montarFicha, linhaVazia } from './ficha.js';
import { modeloAtual } from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MODELO_REV01 = {
  titulo: 'TERMO DE RESPONSABILIDADE DE E.P.I (EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL)',
  rotulo_faz: 'FAZ: Fazenda (LOCAL)',
  rotulo_mer: 'M.E.R: Motivos para entrega e recebimento',
  legenda_faz: ['F - FACA', 'L - LOTE 35', 'M - MORRO BRANCO', 'T - TRÊS RIACHOS   /  Q - QUEBRA COCÃO'],
  legenda_mer: ['1- Substituição por Dano Justificado', '2- Substituição por Dano Proprio ou Perda', '3- Devolução/Demissão/Mudança de Função', '4- Primeira Entrega/Admissão'],
  declaracao_titulo: 'Declaro, para os devidos fins que recebi os EPI’s abaixo especificados e me comprometo a:',
  declaracoes: [
    '• Usa-los apenas para a finalidade a que se destinam;',
    '• Responsabilizar-me por sua guarda e conservação;',
    '• Responsabilizar-me pela danificação do EPI devido ao seu uso inadequado ou fora das atividades a que se destina, bem como pelo seu extravio.',
    '• Declaro também estar ciente que o uso é obrigatório, sob pena de ser punido conforme Lei 6.514, de 22/12/77, Artigo 158 da CLT.',
    '• Declaro ainda, que recebi treinamento referente ao uso do EPI e as normas de segurança do trabalho nesta data.',
  ],
  declaracao_longa: '• Declaro que estou ciente das disposições do Art. 462 e § 1º da CLT e autorizo a Empresa descontar em meus vencimentos o (s) valor (es) correspondente (s) ao (s) EPI (s) que por mim for: Danificado (s) propositalmente, por uso incorreto ou conservação inadequada, Extraviado (s); Não devolvido (s) á Empresa para substituição; Não devolvido (s) á Empresa por ocasião do meu desligamento.',
  rodape_demissao: '   Data da Demissão:__/__/____',
  setor_padrao: 'CAMPO',
};

const VAZIO = { nome: '', cpf: '', cadastro: '', cargo: '', empregador: '', admissao: '', setor: ' ' };

export const REVISOES = [
  { rev: '02', data: '13/11/2026', atual: true,
    mudou: 'Meia folha (2 por A4) ou folha inteira; uma ficha por entrega; sem MÊS; logo horizontal, título e caixa Formulário/Revisão/Data no alto; legendas FAZ (com G - Geral) e M.E.R em faixas; CPF e Nº de cadastro na linha do funcionário e embaixo da assinatura; selos mais finos.',
    html: () => montarFicha(VAZIO, modeloAtual(), { entrega: true, linhas: Array.from({ length: 6 }, linhaVazia), chave: 'rev02' }) },
  { rev: '01', data: 'até 12/11/2026', atual: false,
    mudou: 'Ficha da planilha "FICHA DE EPI NOVA 2025": folha A4 inteira por mês, com MÊS no alto e 20 linhas.',
    // mês em branco, como a folha saía para preencher
    html: () => montarFicha(VAZIO, MODELO_REV01, { mes: 10, ano: 2026, linhas: Array.from({ length: 20 }, linhaVazia), chave: 'rev01' }).replace('novembro, 2026', '') },
];

let aberta = '02';

export function abrirRevisoesFicha() {
  const el = document.getElementById('telaFichaRev');
  if (!el) return;
  const m = modeloAtual();
  const r = REVISOES.find(x => x.rev === aberta) || REVISOES[0];
  el.innerHTML = `<div class="cartao naoimprimir">
    <h2>Revisões da ficha de EPI</h2>
    <p class="dica">${esc(m.form_codigo || 'FORM 057')} · Termo de responsabilidade de E.P.I. A revisão atual é a que o app imprime; as anteriores ficam guardadas só para consulta.</p>
    <table class="tabela rev-tab"><thead><tr><th>Revisão</th><th>Data</th><th>Situação</th><th>O que mudou</th><th></th></tr></thead><tbody>
    ${REVISOES.map(x => `<tr${x.rev === aberta ? ' class="rev-sel"' : ''}>
      <td><b>${esc(x.rev)}</b></td><td>${esc(x.atual ? (m.form_data || x.data) : x.data)}</td>
      <td>${x.atual ? '<span class="rev-tag atual">Atual</span>' : '<span class="rev-tag">Só consulta</span>'}</td>
      <td class="rev-mudou">${esc(x.mudou)}</td>
      <td><button class="btn mini" type="button" data-rev="${esc(x.rev)}">${x.rev === aberta ? 'Vendo' : 'Ver'}</button></td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="cartao naoimprimir rev-previa">
    <div class="rev-faixa${r.atual ? ' atual' : ''}">Revisão ${esc(r.rev)} · ${r.atual ? 'atual' : 'somente para visualizar'}</div>
    <div class="rev-folha">${r.html()}</div>
  </div>`;
  el.querySelectorAll('[data-rev]').forEach(b => b.addEventListener('click', () => { aberta = b.dataset.rev; abrirRevisoesFicha(); }));
}
