// qc-importar.js — traz para o app as planilhas de controle da Faz. Quebra
// Cocão (15/10/2026): "Controle Estoque Defensivos / Fertilizantes /
// Lubrificantes / Material de Limpeza - Faz. Quebra Cocão.xlsx".
//
// Cada planilha tem:
//   ESTOQUE       produto · estoque inicial · entradas · saídas · estoque final
//   MOVIMENTAÇÃO  data · tipo (ENTRADA/SAÍDA) · produto · quantidade · e colunas
//                 que mudam de planilha para planilha (NF/BOLETIM,
//                 OPERADOR/FORNECEDOR, CULTURA?, DIRECIONADOR, MÁQUINA/IMPLEMENTO,
//                 RESPONSÁVEL, LOCAL, Observação)
// O estoque inicial vira um lançamento "Saldo inicial"; cada linha da
// MOVIMENTAÇÃO vira uma entrada ou saída. Linha sem TIPO fica de fora — a
// planilha também não a soma — e aparece no relatório para conferir.
import { listarAbas, lerAba, semAcento } from './planilha.js';

/** Grupo pelo nome do arquivo. */
export function grupoDoArquivo(nome) {
  const n = semAcento(nome);
  if (n.includes('DEFENSIV')) return 'Defensivos';
  if (n.includes('FERTILIZ')) return 'Fertilizantes';
  if (n.includes('LUBRIFIC')) return 'Lubrificantes';
  if (n.includes('LIMPEZA')) return 'Material de limpeza';
  if (n.includes('EPI')) return 'EPIs';
  if (n.includes('PAPELARIA')) return 'Papelaria';
  return null;
}

/** Unidade pelo nome do produto ("- 20Lt", "- 25 Kg") e pelo grupo. */
export function unidadeDe(nome, grupo) {
  if (grupo === 'Fertilizantes') return 'kg';
  if (grupo === 'Material de limpeza' || grupo === 'EPIs' || grupo === 'Papelaria') return 'un';
  const n = semAcento(nome);
  if (/\b\d+([.,]\d+)?\s*(KG|G|GR)\b/.test(n) || /\bKG\b/.test(n)) return 'kg';
  return 'L';
}

/** Data do Excel (número de série) ou texto dd/mm/aaaa → AAAA-MM-DD. */
export function dataDe(v) {
  if (typeof v === 'number' && isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const limpar = v => (v === null || v === undefined) ? '' : String(v).replace(/\s+/g, ' ').trim();
/** "3- MAIK ROBERTO CARDOSO ROSA" → "MAIK ROBERTO CARDOSO ROSA" */
const semNumero = s => limpar(s).replace(/^\d+\s*-\s*/, '');

/** Tipo do app a partir da linha da planilha. */
function tipoDe(sentido, textos) {
  const t = semAcento(textos.join(' '));
  if (/AJUSTE|BALANCO/.test(t)) return 'ajuste';
  if (/TRANSFER/.test(t)) return 'transferencia';
  return sentido === 'entrada' ? 'compra' : 'uso';
}

/**
 * Lê um arquivo e devolve { grupo, produtos:[{nome, inicial, final}], movs:[...], semTipo:[...] }.
 * movs: { data, sentido, tipo, produto, quantidade, documento, plantio, operador, fornecedor, outra_fazenda, obs }
 */
export async function lerPlanilhaQc(arquivo, grupoEscolhido = null) {
  const abas = await listarAbas(arquivo);
  const achar = nome => abas.find(a => semAcento(a) === semAcento(nome));
  const abaEst = achar('ESTOQUE'), abaMov = achar('MOVIMENTAÇÃO') || achar('MOVIMENTACAO');
  if (!abaEst || !abaMov) throw new Error(`${arquivo.name}: não achei as abas ESTOQUE e MOVIMENTAÇÃO.`);
  const grupo = grupoEscolhido || grupoDoArquivo(arquivo.name);
  if (!grupo) throw new Error(`${arquivo.name}: não sei de qual categoria é (Defensivos, Fertilizantes…).`);

  // ESTOQUE: produto na coluna B, estoque inicial na C, final na F
  const produtos = [];
  for (const l of await lerAba(arquivo, abaEst)) {
    if (!l) continue;
    const nome = limpar(l[1]);
    if (!nome || semAcento(nome) === 'PRODUTO') continue;
    produtos.push({ nome, inicial: Number(l[2]) || 0, final: Number(l[5]) || 0 });
  }

  // MOVIMENTAÇÃO: acha a linha de títulos e as colunas pelo nome
  const linhas = await lerAba(arquivo, abaMov);
  const iCab = linhas.findIndex(l => l && l.some(v => semAcento(v) === 'PRODUTO') && l.some(v => semAcento(v) === 'TIPO'));
  if (iCab < 0) throw new Error(`${arquivo.name}: não achei os títulos da aba MOVIMENTAÇÃO.`);
  const cab = Array.from(linhas[iCab], v => semAcento(v));   // a linha vem com buracos (células vazias)
  const col = (...nomes) => cab.findIndex(c => nomes.some(n => c === n || c.startsWith(n)));
  const C = {
    data: col('DATA'), tipo: col('TIPO'), produto: col('PRODUTO'), qtd: col('QUANTIDADE'),
    doc: col('NF / BOLETIM', 'NF'), pessoa: col('OPERADOR/FORNECEDOR', 'RESPONSAVEL'),
    cultura: col('CULTURA'), direc: col('DIRECIONADOR'), maquina: col('MAQUINA/IMPLEMENTO', 'MAQUINA'),
    local: col('LOCAL'), obs: col('OBSERVACAO'),
  };
  const val = (l, i) => i >= 0 ? l[i] : null;

  const movs = [], semTipo = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l) continue;
    const produto = limpar(val(l, C.produto));
    if (!produto) continue;
    const qtd = Number(val(l, C.qtd));
    const tipoTxt = semAcento(val(l, C.tipo));
    const data = dataDe(val(l, C.data));
    const sentido = tipoTxt.startsWith('ENT') ? 'entrada' : tipoTxt.startsWith('SA') ? 'saida' : null;
    if (!sentido) { semTipo.push({ linha: i + 1, data, produto, quantidade: qtd }); continue; }
    if (!isFinite(qtd) || !data) { semTipo.push({ linha: i + 1, data, produto, quantidade: val(l, C.qtd), motivo: 'data ou quantidade' }); continue; }

    const doc = limpar(val(l, C.doc));
    const pessoa = semNumero(val(l, C.pessoa));
    const direc = limpar(val(l, C.direc)), cultura = limpar(val(l, C.cultura));
    const maquina = limpar(val(l, C.maquina)), local = limpar(val(l, C.local)), obs = limpar(val(l, C.obs));
    const destino = [cultura, direc, maquina, local].filter(Boolean).join(' · ');
    const tipo = tipoDe(sentido, [direc, maquina, local, obs, doc, pessoa]);
    const transfFazenda = tipo === 'transferencia'
      ? ([direc, local, obs].find(t => /FAZ|LOTE|FACA|MORRO|RIACHO/i.test(t)) || null) : null;
    movs.push({
      data, sentido, tipo, produto, quantidade: qtd,
      documento: doc || null,
      plantio: sentido === 'saida' ? (destino || null) : null,
      operador: sentido === 'saida' ? (pessoa || null) : null,
      fornecedor: sentido === 'entrada' ? (pessoa || maquina || null) : null,
      outra_fazenda: transfFazenda,
      obs: [sentido === 'entrada' && destino && !/^ESTOQUE/i.test(destino) ? destino : '', obs].filter(Boolean).join(' · ') || null,
    });
  }
  return { arquivo: arquivo.name, grupo, produtos, movs, semTipo };
}
