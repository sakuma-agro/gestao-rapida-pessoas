// rh-reajuste-tabela.js — aplica na tabela de faixas (rh_cargos) o reajuste
// anual programado, quando a vigência chega (20/10/2026).
//
// O Reajuste anual (js/rh-enquadramento.js) grava os salários novos com data
// futura em jor_salarios e deixa o reajuste da TABELA em rh_reajustes como
// 'programado'. A tabela não tem vigência própria: se subisse no dia em que o
// reajuste foi aprovado, todo mundo apareceria "abaixo da faixa" até a data.
// Por isso ela sobe aqui, no primeiro acesso ao Plano de cargos ou a Salários
// a partir da vigência. A tabela de antes fica guardada em tabela_antes.

const r2 = v => Math.round(v * 100) / 100;
export const COLUNAS_FAIXA = ['faixa_a', 'faixa_media', 'faixa_c', 'faixa_d', 'faixa_e'];

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let emAndamento = null;

/** Aplica os reajustes vencidos. Devolve quantos aplicou (0 na maioria das vezes). */
export function aplicarReajustesVencidos(cliente) {
  if (!cliente) return Promise.resolve(0);
  if (!emAndamento) emAndamento = rodar(cliente).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function rodar(c) {
  const { data: pend, error } = await c.from('rh_reajustes').select('*')
    .eq('situacao', 'programado').lte('vigencia', hoje()).order('vigencia');
  if (error || !pend?.length) return 0;   // sem permissão ou nada a fazer
  let n = 0;
  for (const r of pend) {
    if (r.reajusta_tabela) {
      const { data: cargos, error: e1 } = await c.from('rh_cargos').select('*');
      if (e1) throw e1;
      const f = 1 + Number(r.pct) / 100;
      for (const cg of cargos) {
        const novo = {};
        COLUNAS_FAIXA.forEach(k => { if (cg[k] != null && Number(cg[k]) > 0) novo[k] = r2(Number(cg[k]) * f); });
        if (Object.keys(novo).length) {
          const { error: e2 } = await c.from('rh_cargos').update(novo).eq('id', cg.id);
          if (e2) throw e2;
        }
      }
    }
    const { error: e3 } = await c.from('rh_reajustes').update({ situacao: 'aplicado', aplicado_em: new Date().toISOString() }).eq('id', r.id);
    if (e3) throw e3;
    n++;
  }
  return n;
}
