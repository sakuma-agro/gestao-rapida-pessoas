/* =====================================================================
   Gestão Rápida · Manutenções — peças comuns a todas as telas
   Campos de formulário, datas, unidade de medida e a conta do vencimento.
   ===================================================================== */

/* Registro das telas: cada arquivo pendura a sua aqui (TELAS.maquinas = …) */
window.TELAS = window.TELAS || {};

/* ---------------------------------------------------------------- formulário */

function campoTexto(rot, nome, valor = '', tipo = 'text', ajuda = '') {
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <input type="${tipo}" id="f-${nome}" name="${nome}" value="${esc(valor ?? '')}"${tipo === 'number' ? ' step="any" inputmode="decimal"' : ''}>
    ${ajuda ? `<p class="ajuda">${esc(ajuda)}</p>` : ''}</div>`;
}

function campoArea(rot, nome, valor = '', ajuda = '') {
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <textarea id="f-${nome}" name="${nome}">${esc(valor ?? '')}</textarea>
    ${ajuda ? `<p class="ajuda">${esc(ajuda)}</p>` : ''}</div>`;
}

function campoLista(rot, nome, opcoes, valor, vazio = '— selecione —') {
  const ops = opcoes.map(o => {
    const id = o.id ?? o.valor ?? o;
    const txt = o.nome ?? o.descricao ?? o.valor ?? o;
    return `<option value="${esc(id)}"${String(id) === String(valor) ? ' selected' : ''}>${esc(txt)}</option>`;
  }).join('');
  return `<div class="campo"><label for="f-${nome}">${esc(rot)}</label>
    <select id="f-${nome}" name="${nome}">${vazio !== null ? `<option value="">${esc(vazio)}</option>` : ''}${ops}</select></div>`;
}

function lerForm(corpo) {
  const dados = {};
  corpo.querySelectorAll('input,select,textarea').forEach(el => {
    if (!el.name) return;
    const v = el.type === 'checkbox' ? el.checked : el.value.trim();
    dados[el.name] = (v === '' ? null : v);
  });
  return dados;
}

/* Aceita "1.234,5" e "1234.5" */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- datas */

function hoje() {
  // data local (Brasília), não UTC — depois das 21h o UTC já é amanhã
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function somarDias(data, n) {
  const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function diasEntre(a, b) { // b - a, em dias
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function formatarData(d) {
  if (!d) return '';
  const [a, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}
function parametro(chave, padrao) {
  const p = q.todos('parametros').find(x => x.chave === chave);
  return p && p.valor != null ? p.valor : padrao;
}

/* T.2 antes de T.10 */
function porCodigo(a, b) {
  return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true });
}

/* ---------------------------------------------------------------- unidade */

function rotuloUnidade(u) {
  return ({ HORIMETRO: 'Horímetro (h)', HODOMETRO: 'Hodômetro (km)',
            ACUMULADO: 'Acumulado (implemento)', CALENDARIO: 'Só calendário' })[u] || u || '';
}

/* Caminhão anda em km, trator em hora. A unidade vem do bem, nunca do item. */
function unidadeDe(e) {
  if (!e) return 'h';
  if (e.unidade_controle === 'HODOMETRO') return 'km';
  if (e.unidade_controle === 'ACUMULADO') return e.rege_preventiva === 'KM' ? 'km' : 'h';
  return 'h';
}

/* Máquina: leitura do mostrador. Implemento: o contador acumulado. */
function leituraDe(e) {
  if (!e) return null;
  if (e.unidade_controle === 'ACUMULADO')
    return Number(e.rege_preventiva === 'KM' ? e.km_acumulados : e.horas_acumuladas);
  return e.leitura_atual === null || e.leitura_atual === undefined ? null : Number(e.leitura_atual);
}

function nHoras(v) {
  return v === null || v === undefined || v === '' ? '—' :
    Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* ---------------------------------------------------------------- vencimento */

function margemPadrao() {
  return Number(parametro('margem_seguranca_horas', 50)) || 50;
}

/* O que vencer primeiro manda — hora ou período.
   horas_rodadas   = leitura atual − leitura da última troca
   horas_restantes = periodicidade − horas_rodadas
   dias            = hoje − data da última troca */
function calcular(plano) {
  const e = q.por_id('equipamentos', plano.equipamento_id);
  const leitura = leituraDe(e);
  const margem = plano.margem_horas != null ? Number(plano.margem_horas) : margemPadrao();
  const u = unidadeDe(e);

  const r = { equipamento: e, leitura, status: 'SEM_DADO', motivo: '',
              horas_restantes: null, dias: null, proximo_hr: null, proxima_data: null };

  if (plano.periodicidade_horas != null && plano.ultima_troca_leitura != null) {
    r.proximo_hr = Number(plano.ultima_troca_leitura) + Number(plano.periodicidade_horas);
    if (leitura != null) r.horas_restantes = r.proximo_hr - leitura;
  }
  if (plano.periodicidade_dias != null && plano.ultima_troca_data) {
    r.dias = diasEntre(plano.ultima_troca_data, hoje());
    r.proxima_data = somarDias(plano.ultima_troca_data, Number(plano.periodicidade_dias));
  }

  if (r.horas_restantes != null && r.horas_restantes < 0) {
    r.status = 'VENCIDO';
    r.motivo = 'passou ' + nHoras(-r.horas_restantes) + ' ' + u;
  } else if (r.horas_restantes != null && r.horas_restantes <= margem) {
    // Regra da planilha: dentro da margem de segurança é ATENÇÃO,
    // mesmo com o prazo em dias já vencido.
    r.status = 'ATENCAO';
    r.motivo = 'faltam ' + nHoras(r.horas_restantes) + ' ' + u;
  } else if (r.dias != null && r.dias > plano.periodicidade_dias) {
    r.status = 'VENCIDO';
    const atraso = r.dias - plano.periodicidade_dias;
    r.motivo = 'período vencido há ' + atraso + (atraso === 1 ? ' dia' : ' dias');
  } else if (r.proxima_data && diasEntre(hoje(), r.proxima_data) <= 7) {
    r.status = 'ATENCAO';
    const f = diasEntre(hoje(), r.proxima_data);
    r.motivo = f === 0 ? 'vence hoje' : 'vence em ' + f + (f === 1 ? ' dia' : ' dias');
  } else if (r.horas_restantes != null || r.dias != null) {
    r.status = 'OK';
    r.motivo = r.horas_restantes != null
      ? 'faltam ' + nHoras(r.horas_restantes) + ' ' + u
      : 'vence em ' + formatarData(r.proxima_data);
  } else {
    r.motivo = 'falta a última troca';
  }
  return r;
}

const ETIQUETA = {
  VENCIDO: ['urgente', 'VENCIDO'],
  ATENCAO: ['atencao', 'ATENÇÃO'],
  OK: ['ok', 'EM DIA'],
  SEM_DADO: ['neutro', 'SEM DADO']
};
function etq(status) {
  const [cls, txt] = ETIQUETA[status] || ETIQUETA.SEM_DADO;
  return '<span class="etq ' + cls + '">' + txt + '</span>';
}

/* Em que marca a máquina volta para a oficina: hora e/ou data. */
function proximaTroca(c) {
  const u = unidadeDe(c.equipamento);
  const partes = [];
  if (c.proximo_hr != null) partes.push(nHoras(c.proximo_hr) + ' ' + u);
  if (c.proxima_data) partes.push(formatarData(c.proxima_data));
  return partes.length ? partes.join(' · ') : '—';
}

/* Periodicidade em texto: "500 h ou 180 dias" */
function periodicidadeTexto(p, e) {
  const u = unidadeDe(e);
  const partes = [];
  if (p.periodicidade_horas != null) partes.push(nHoras(p.periodicidade_horas).replace(',0', '') + ' ' + u);
  if (p.periodicidade_dias != null) partes.push(p.periodicidade_dias + ' dias');
  return partes.join(' ou ') || '—';
}

Object.assign(window, {
  campoTexto, campoArea, campoLista, lerForm, num, hoje, somarDias, diasEntre,
  formatarData, parametro, porCodigo, rotuloUnidade, unidadeDe, leituraDe, nHoras,
  calcular, etq, proximaTroca, periodicidadeTexto
});
