// atividades-dados.js — as Atividades do SST (22/10/2026), só os dados.
//
// Pedido dele: na mesma função (Trab. Rural I, II, III) uns pulverizam, mexem
// no secador de café etc. e outros não. Quem faz precisa de treinamento e de
// exame; quem não faz, não. A atividade guarda o que exige (treinamentos e
// exames) e quem faz. O app passa a cobrar: o que a função exige + o que as
// atividades da pessoa exigem.
//
// Fica separado da tela (js/sst-atividades.js) para o treino-funcao.js e o
// aso.js poderem perguntar "o que essa pessoa exige?" sem import circular.
// Tabelas: sst_atividades, sst_atividade_treinamentos, sst_atividade_exames,
// sst_atividade_funcionarios.
import { estado } from './store.js';

const AT = { lista: [], trein: [], exames: [], pessoas: [], carregado: false };

export async function carregarAtividades() {
  const c = estado.cliente;
  if (!c || !estado.sessao || !navigator.onLine) { if (AT.carregado) return; throw new Error('sem internet'); }
  const [a, t, e, p] = await Promise.all([
    c.from('sst_atividades').select('*').order('ordem').order('nome'),
    c.from('sst_atividade_treinamentos').select('atividade_id,tipo_id'),
    c.from('sst_atividade_exames').select('atividade_id,tipo_id'),
    c.from('sst_atividade_funcionarios').select('atividade_id,funcionario_id'),
  ]);
  const erro = a.error || t.error || e.error || p.error;
  if (erro) throw erro;
  definirAtividades({ lista: a.data, trein: t.data, exames: e.data, pessoas: p.data });
}
/* Cópia local: vai na caixa do SST, para painéis e relatórios abrirem sem sinal. */
export const dadosAtividades = () => ({ lista: AT.lista, trein: AT.trein, exames: AT.exames, pessoas: AT.pessoas });
export function definirAtividades(d) {
  if (!d) return;
  AT.lista = d.lista || []; AT.trein = d.trein || []; AT.exames = d.exames || []; AT.pessoas = d.pessoas || [];
  AT.carregado = true;
}
export function limparAtividades() {
  AT.lista = []; AT.trein = []; AT.exames = []; AT.pessoas = []; AT.carregado = false;
}
export const atividadesCarregadas = () => AT.carregado;
export const todasAtividades = () => AT.lista;
export const ligacoes = () => AT;

/** As atividades em uso que essa pessoa faz. */
export function atividadesDaPessoa(funcionarioId) {
  if (!funcionarioId) return [];
  const ids = new Set(AT.pessoas.filter(p => p.funcionario_id === funcionarioId).map(p => p.atividade_id));
  return AT.lista.filter(a => a.ativo !== false && ids.has(a.id));
}
const daPessoa = (lista, funcionarioId) => {
  const ids = new Set(atividadesDaPessoa(funcionarioId).map(a => a.id));
  return [...new Set(lista.filter(x => ids.has(x.atividade_id)).map(x => x.tipo_id))];
};
/** Ids dos treinamentos que as atividades dessa pessoa exigem. */
export const treinosDaPessoa = funcionarioId => daPessoa(AT.trein, funcionarioId);
/** Ids dos exames que as atividades dessa pessoa exigem. */
export const examesDaPessoa = funcionarioId => daPessoa(AT.exames, funcionarioId);
