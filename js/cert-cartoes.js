// cert-cartoes.js — cartão único dos registros da Certificação (05/11/2026).
//
// Pedido do Guilherme: "vamos melhorar esse painel dos forms digital e por igual esse dos checks".
// O mesmo cartão serve à porta Registros (FORMS Digital, check lists, caderno, AN Digital) e à tela
// CHECKS Digital: código, nome, situação do período, três números, a faixa dos últimos períodos
// (verde = tem registro, cinza = período atual ainda aberto, marrom = passou sem registro) e os botões.

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const doisD = n => String(n).padStart(2, '0');
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`; };

/** "2026-10" → "out/26" */
export const rotMesCurto = am => am ? `${MES3[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}` : '';

/** Períodos da periodicidade (os mais antigos primeiro), igual à Lista mestra. Por evento → null. */
export function periodos(per) {
  const p = per || 'Mensal';
  if (p === 'Por evento') return null;
  const hj = hoje(); const ano = Number(hj.slice(0, 4)), mes = Number(hj.slice(5, 7));
  const out = [];
  if (['Diário', 'Semanal', 'Mensal'].includes(p)) {
    for (let i = 11; i >= 0; i--) { const dt = new Date(Date.UTC(ano, mes - 1 - i, 1)); const k = `${dt.getUTCFullYear()}-${doisD(dt.getUTCMonth() + 1)}`;
      out.push({ rot: rotMesCurto(k), de: k + '-01', ate: k + '-31', atual: i === 0 }); }
  } else if (p === 'Trimestral' || p === 'Semestral') {
    const n = p === 'Trimestral' ? 3 : 6, blocos = p === 'Trimestral' ? 8 : 4, idx = Math.floor((mes - 1) / n);
    for (let i = blocos - 1; i >= 0; i--) { let b = idx - i, a = ano; while (b < 0) { b += 12 / n; a--; }
      const m1 = b * n + 1, m2 = m1 + n - 1;
      out.push({ rot: `${b + 1}º ${p === 'Trimestral' ? 'tri' : 'sem'}/${String(a).slice(2)}`, de: `${a}-${doisD(m1)}-01`, ate: `${a}-${doisD(m2)}-31`, atual: i === 0 }); }
  } else {
    const passo = p === 'A cada 3 anos' ? 3 : p === 'A cada 2 anos' ? 2 : 1;
    for (let i = 3; i >= 0; i--) { const a1 = ano - i * passo, a2 = a1 + passo - 1;
      out.push({ rot: passo === 1 ? String(a1) : `${a1}–${String(a2).slice(2)}`, de: `${a1}-01-01`, ate: `${a2}-12-31`, atual: i === 0 }); }
  }
  return out;
}
/** Cobertura dos períodos a partir de datas (aaaa-mm-dd ou aaaa-mm). */
export function cobrir(per, datas) {
  const ps = periodos(per); if (!ps) return null;
  const ds = (datas || []).map(d => String(d || '').slice(0, 10)).filter(Boolean).map(d => d.length === 7 ? d + '-01' : d);
  return ps.map(j => { const n = ds.filter(d => d >= j.de && d <= j.ate).length; return { ...j, n, estado: n ? 'ok' : j.atual ? 'aberto' : 'falta' }; });
}
/** Os períodos antes do primeiro registro não contam como falta (o registro ainda não existia no app):
    ficam neutros ("antes"). Sem registro nenhum, só o período atual conta. */
export function aparar(cob) {
  if (!cob) return cob;
  const i = cob.findIndex(c => c.n);
  return cob.map((c, j) => (c.estado === 'falta' && (i < 0 || j < i)) ? { ...c, estado: 'antes' } : c);
}
/** Situação a partir da cobertura: em dia / lançar no período / períodos sem registro. */
export function situacaoCob(cob, per) {
  if (!cob) return { rot: per === 'Por evento' ? 'Por evento' : 'Sem prazo', cor: 'neutra' };
  cob = aparar(cob);
  const falta = cob.filter(c => c.estado === 'falta').length, atual = cob[cob.length - 1];
  if (falta) return { rot: `${falta} ${falta === 1 ? 'período' : 'períodos'} sem registro`, cor: 'perigo' };
  if (atual?.estado === 'aberto') return { rot: 'Lançar neste período', cor: 'alerta' };
  return { rot: 'Em dia', cor: 'ativo' };
}

/**
 * Cartão de registro.
 * o = { cod, nome, sit: {rot, cor}, nums: [{n, rot, ruim}], cob, linha, botoes: [{rot, attr, principal}], icone }
 */
export function cartaoRegistro(o) {
  const ruim = o.sit?.cor === 'perigo';
  if (o.cob) o = { ...o, cob: aparar(o.cob) };
  return `<div class="rc-card${ruim ? ' rc-ruim' : ''}">
    <div class="rc-topo"><span class="rc-cod">${esc(o.cod)}</span>${o.sit ? `<span class="tag ${o.sit.cor}">${esc(o.sit.rot)}</span>` : ''}</div>
    <b class="rc-nome">${esc(o.nome)}</b>
    ${o.nums?.length ? `<div class="rc-num">${o.nums.map(x => `<div class="${x.ruim ? 'rc-n-ruim' : ''}"><strong>${x.n == null ? '—' : esc(x.n)}</strong><span>${esc(x.rot)}</span></div>`).join('')}</div>` : ''}
    ${o.cob ? `<div class="rc-faixa" aria-label="Registros por período">${o.cob.map(c => `<i class="rc-p rc-${c.estado}" title="${esc(c.rot)}: ${c.n ? c.n + ' registro(s)' : c.estado === 'aberto' ? 'período atual, ainda sem registro' : c.estado === 'antes' ? 'antes do primeiro registro' : 'sem registro'}"></i>`).join('')}</div>
      <div class="rc-faixa-rot"><span>${esc(o.cob[0].rot)}</span><span>${esc(o.cob[o.cob.length - 1].rot)}</span></div>` : ''}
    ${o.linha ? `<p class="rc-linha">${o.linha}</p>` : ''}
    <div class="rc-botoes">${(o.botoes || []).map(b => `<button class="btn${b.principal ? ' principal' : ''}" type="button" ${b.attr}>${esc(b.rot)}</button>`).join('')}</div>
  </div>`;
}
