// acerto-motor.js — a conta do acerto, igual à da planilha "Acerto_Insumos".
//
// A regra, na ordem em que a planilha faz:
//   1. Diferença de cada depósito = SISTEMA − FÍSICO.
//        positiva  → SOBRA no sistema (o produto não está na prateleira)
//        negativa  → FALTA no sistema (tem produto a mais na prateleira)
//   2. Dentro do mesmo produto, cruza sobra com falta: vira TRANSFERÊNCIA
//      entre depósitos (o material trocou de lugar sem documento).
//      A MENOR falta é coberta primeiro; as sobras entram na ordem dos
//      depósitos.
//   3. A sobra que não foi cruzada vira SAÍDA a registrar (baixa no sistema).
//   4. A falta que não foi cruzada vira ENTRADA a registrar (NF, estorno ou
//      devolução).
//
// Nada aqui toca em tela nem em banco: entra número, sai plano de ação.

const EPS = 0.0001;

export const DEPOSITOS = ['Lote 35', 'Faz. Faca', 'Faz. Morro Branco', 'Faz. Três Riachos'];

export const TIPOS_SAIDA = [
  'Consumo / Uso',            // padrão
  'Saída a maior / Perda',    // investigar
  'Descarte / Vencimento',
  'A verificar',
];

export const TIPOS_ENTRADA = [
  'NF pendente',              // padrão
  'Saída registrada a maior', // investigar
  'Devolução de campo',
  'Origem incerta',
];

export const SITUACOES = ['Pendente', 'Concluído', 'Em Verificação'];

/** As duas marcações que a planilha destaca: pedem investigação. */
export const investigar = tipo =>
  tipo === 'Saída a maior / Perda' || tipo === 'Saída registrada a maior';

const arred = n => Math.round(n * 10000) / 10000;

/**
 * @param {Array} itens  [{ produto, dep: { '<depósito>': { sistema, fisico } } }]
 * @param {Array} depositos  ordem dos depósitos (a mesma da planilha)
 * @returns {{ linhas, transferencias, saidas, entradas, resumo }}
 */
export function acertar(itens, depositos = DEPOSITOS) {
  const transferencias = [];
  const saidas = [];
  const entradas = [];
  const linhas = [];

  for (const item of itens) {
    const produto = String(item.produto || '').trim();
    if (!produto) continue;

    const dif = {};
    const sobras = [];
    const faltas = [];

    for (const dep of depositos) {
      const d = item.dep?.[dep] || {};
      const sistema = Number(d.sistema) || 0;
      const fisico = Number(d.fisico) || 0;
      const v = sistema - fisico;
      dif[dep] = { sistema, fisico, diferenca: v };
      if (v > EPS) sobras.push({ dep, qtd: v });
      else if (v < -EPS) faltas.push({ dep, qtd: -v });
    }

    // a menor falta é coberta primeiro — é o critério da planilha
    faltas.sort((a, b) => a.qtd - b.qtd);

    const doProduto = { transferencias: [], saidas: [], entradas: [] };

    for (const falta of faltas) {
      let resto = falta.qtd;
      for (const sobra of sobras) {
        if (sobra.qtd > EPS && resto > EPS) {
          const q = Math.min(sobra.qtd, resto);
          const t = { produto, origem: sobra.dep, destino: falta.dep, qtd: arred(q) };
          transferencias.push(t); doProduto.transferencias.push(t);
          sobra.qtd -= q;
          resto -= q;
        }
      }
      if (resto > EPS) {
        const e = { produto, deposito: falta.dep, qtd: arred(resto) };
        entradas.push(e); doProduto.entradas.push(e);
      }
    }

    for (const sobra of sobras) {
      if (sobra.qtd > EPS) {
        const s = { produto, deposito: sobra.dep, qtd: arred(sobra.qtd) };
        saidas.push(s); doProduto.saidas.push(s);
      }
    }

    const totSobra = arred(Object.values(dif).reduce((a, d) => a + Math.max(d.diferenca, 0), 0));
    const totFalta = arred(Object.values(dif).reduce((a, d) => a + Math.max(-d.diferenca, 0), 0));
    const transf = arred(Math.min(totSobra, totFalta));

    linhas.push({
      produto, dif,
      totSobra, totFalta, transf,
      saidaResidual: arred(totSobra - transf),
      entradaResidual: arred(totFalta - transf),
      ok: totSobra <= EPS && totFalta <= EPS,
      ...doProduto,
    });
  }

  const resumo = {
    produtos: linhas.length,
    conferidos: linhas.filter(l => l.ok).length,
    comTransferencia: linhas.filter(l => l.transf > EPS).length,
    comSaida: linhas.filter(l => l.saidaResidual > EPS).length,
    comEntrada: linhas.filter(l => l.entradaResidual > EPS).length,
    acoes: transferencias.length + saidas.length + entradas.length,
    qtdTransferida: arred(transferencias.reduce((a, t) => a + t.qtd, 0)),
    qtdSaida: arred(saidas.reduce((a, s) => a + s.qtd, 0)),
    qtdEntrada: arred(entradas.reduce((a, e) => a + e.qtd, 0)),
  };

  return { linhas, transferencias, saidas, entradas, resumo };
}

/** O texto da coluna "Resultado" da planilha, para a tabela de divergências. */
export function classificacao(linha) {
  if (linha.ok) return 'Conferido';
  const p = [];
  if (linha.transf > EPS) p.push(`Transferir ${numero(linha.transf)}`);
  if (linha.saidaResidual > EPS) p.push(`Saída ${numero(linha.saidaResidual)}`);
  if (linha.entradaResidual > EPS) p.push(`Entrada ${numero(linha.entradaResidual)}`);
  return p.join(' · ');
}

export const numero = n =>
  Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
