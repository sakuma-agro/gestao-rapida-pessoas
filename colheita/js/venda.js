// venda.js — etapas Beneficiamento e Comercialização da carga (26/10/2026).
//
// Pedido do Guilherme: o menu da Colheita seguir o caminho da carga —
// "cargas - balança - beneficiamento - comercialização".
//   · Beneficiamento: boletins do lavador (cp_lotes_venda). Junta as cargas
//     que entraram no boletim e guarda Cat 1, Cat 2, Cat 3 e refugo em kg.
//   · Comercialização: as NF-e (cp_notas_fiscais), cada uma ligada ao boletim
//     (ou à carga suja), com o PDF no Google Drive.
// São as MESMAS tabelas que a Certificação › Balanço de massa lê: o que se
// lança aqui aparece lá (rastreabilidade e FORM 013) e vice-versa.
// PDF da nota: chave certificacao/evidencia/nfe-<id da nota>/…pdf (a mesma
// da Certificação), enviado pela função "arquivos" (precisa de internet).
import { $, esc, pronto, carregando, todos, gravar, aviso, culturaSel, safraSel, cargasDa, plantio, nomePlantio,
  kgDe, dataBR, num, lerNumero, meuNome, semAcento } from './dados.js';

const CATS = [['cat1_kg', 'Cat 1'], ['cat2_kg', 'Cat 2'], ['cat3_kg', 'Cat 3'], ['refugo_kg', 'Refugo']];
const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const vivos = t => todos(t).filter(x => x.ativo !== false);
const lotesDa = (cult, saf) => vivos('cp_lotes_venda').filter(l => l.cultura_id === cult.id && l.safra_id === saf.id)
  .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
const notasDa = (cult, saf) => vivos('cp_notas_fiscais').filter(n => n.cultura_id === cult.id && n.safra_id === saf.id)
  .sort((a, b) => String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')) || String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true }));
const lote = id => todos('cp_lotes_venda').find(l => l.id === id) || null;
const cargasDoLote = (saf, id) => cargasDa(saf.id).filter(c => c.lote_venda_id === id);
const notasDoLote = id => vivos('cp_notas_fiscais').filter(n => n.lote_venda_id === id);
const vazio = v => v === null || v === undefined || v === '';
const campoTxt = (id, rot, v, extra = '') => `<label class="campo">${esc(rot)}<input type="text" id="${id}" value="${esc(v ?? '')}" ${extra}></label>`;
const campoNum = (id, rot, v, casas = 0) => `<label class="campo">${esc(rot)}<input type="text" inputmode="decimal" id="${id}" value="${vazio(v) ? '' : esc(num(v, Number(v) % 1 ? 2 : casas))}"></label>`;
const destinos = () => [...new Set(['Coopadap', 'Carlini', ...todos('cp_lotes_venda').map(x => x.destino), ...todos('cp_notas_fiscais').map(x => x.destinatario)].filter(Boolean))];
const pctTxt = (a, b) => b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%' : '';

/* =================================================================
   BENEFICIAMENTO — boletins do lavador
   ================================================================= */
function desenharBenef() {
  const alvo = $('cpBenefCorpo'); if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  const L = lotesDa(cult, saf);
  const semLote = cargasDa(saf.id).filter(c => !c.lote_venda_id);
  const linhas = L.map(l => { const cs = cargasDoLote(saf, l.id); const kg = cs.reduce((s, c) => s + kgDe(c, cult), 0);
    const tc = CATS.reduce((s, [k]) => s + Number(l[k] || 0), 0); return { l, cs, kg, tc }; });
  const tot = k => linhas.reduce((s, x) => s + Number(x.l[k] || 0), 0);
  const totTc = CATS.reduce((s, [k]) => s + tot(k), 0);
  alvo.innerHTML = `
    <div class="barra entre" style="margin-top:0"><span class="dc-sem">${L.length} boletim(ns) nesta safra${semLote.length ? ` · <b>${semLote.length}</b> carga(s) ainda sem boletim` : ''}</span>
      <button class="btn principal" type="button" id="cpBfNovo">+ Novo boletim</button></div>
    ${L.length ? `<div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>Boletim</th><th>Data</th><th>Destino</th><th>Tipo</th><th class="dir">Cargas</th><th class="dir">Entrou (kg)</th>
      ${CATS.map(([, r]) => `<th class="dir">${r} (kg)</th>`).join('')}<th class="dir">Soma</th><th class="dir">NF-e</th><th></th></tr></thead><tbody>
      ${linhas.map(({ l, cs, kg, tc }) => `<tr><td><b>${esc(l.codigo)}</b></td><td>${dataBR(l.data)}</td><td>${esc(l.destino || '')}</td><td>${esc(l.tipo || '')}</td>
        <td class="dir">${cs.length || '<span class="cb-pin alerta">0</span>'}</td><td class="dir">${num(kg, 0)}</td>
        ${CATS.map(([k]) => `<td class="dir">${vazio(l[k]) ? (/suj/i.test(l.tipo || '') ? '' : `<button class="ce-link" type="button" data-bf="${esc(l.id)}">lançar</button>`) : `${num(l[k], 0)}<br><small class="dc-sem">${pctTxt(Number(l[k]), tc)}</small>`}</td>`).join('')}
        <td class="dir">${tc ? num(tc, 0) + (kg ? `<br><small class="dc-sem">${pctTxt(tc, kg)} do que entrou</small>` : '') : ''}</td>
        <td class="dir">${notasDoLote(l.id).length || ''}</td>
        <td class="dir"><button class="btn mini" type="button" data-bf="${esc(l.id)}">Abrir</button></td></tr>`).join('')}
      </tbody><tfoot><tr class="dc-total"><td colspan="4">Total</td><td class="dir">${linhas.reduce((s, x) => s + x.cs.length, 0)}</td><td class="dir">${num(linhas.reduce((s, x) => s + x.kg, 0), 0)}</td>
        ${CATS.map(([k]) => `<td class="dir">${num(tot(k), 0)}<br><small class="dc-sem">${pctTxt(tot(k), totTc)}</small></td>`).join('')}<td class="dir">${num(totTc, 0)}</td><td colspan="2"></td></tr></tfoot></table></div>`
      : '<div class="vazio">Nenhum boletim nesta safra. Toque em “+ Novo boletim”.</div>'}`;
  $('cpBfNovo').onclick = () => formBoletim(null);
  alvo.querySelectorAll('[data-bf]').forEach(b => b.addEventListener('click', () => formBoletim(lote(b.dataset.bf))));
}

function formBoletim(l) {
  const cult = culturaSel(), saf = safraSel(); if (!cult || !saf) return;
  const v = l || { codigo: '', data: hoje(), destino: 'Coopadap', tipo: 'Beneficiado' };
  const cargas = cargasDa(saf.id).slice().reverse();
  window.abrirModal(l ? 'Boletim ' + String(l.codigo).replace(/^Boletim\s*/i, '') : 'Novo boletim do lavador', `
    <form class="grade" id="cpBfForm" autocomplete="off">
      ${campoTxt('bfCod', 'Nº do boletim / identificação', v.codigo, 'placeholder="Boletim 798" required')}
      <label class="campo">Data<input type="date" id="bfData" value="${esc(String(v.data || '').slice(0, 10))}"></label>
      ${campoTxt('bfDest', 'Destino (packing house)', v.destino, 'list="bfDests"')}
      <label class="campo">Tipo<select id="bfTipo">${['Beneficiado', 'Sujo', 'Lavado'].map(t => `<option${t === v.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <datalist id="bfDests">${destinos().map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      <fieldset class="plena cp-fs"><legend>Quantidade de Cat 1, Cat 2 e Cat 3 do boletim (kg) <span class="dc-sem" id="bfSomaCat"></span></legend>
        <div class="cp-etapa1-grade">${CATS.map(([k, r]) => campoNum('bf_' + k, r, v[k])).join('')}</div></fieldset>
      <fieldset class="plena cp-fs"><legend>Cargas que entraram neste boletim <span class="dc-sem" id="bfSoma"></span></legend>
        <div class="cp-bf-cargas">${cargas.map(c => { const outro = c.lote_venda_id && c.lote_venda_id !== l?.id ? lote(c.lote_venda_id) : null; const p = plantio(c.plantio_id);
          return `<label class="cb-check"><input type="checkbox" value="${esc(c.id)}" data-kg="${kgDe(c, cult)}" ${l && c.lote_venda_id === l.id ? 'checked' : ''}>
            ${dataBR(c.data)} · ${p ? esc(nomePlantio(p)) : '—'} · ${esc(c.placa || '')} · tk ${esc(c.ticket_faz || '—')} · ${num(c.quantidade, 0)} cx · ${num(kgDe(c, cult), 0)} kg${outro ? ` <small class="dc-sem">(hoje no ${esc(outro.codigo)})</small>` : ''}</label>`; }).join('') || '<p class="dc-sem">Nenhuma carga nesta safra.</p>'}</div>
      </fieldset>
      <label class="campo plena">Observação<input type="text" id="bfObs" value="${esc(v.obs || '')}"></label>
      <div class="barra entre plena">
        ${l ? '<button class="btn perigo" type="button" id="bfExcluir">Excluir</button>' : '<span></span>'}
        <span class="barra" style="margin:0"><button class="btn" type="button" id="bfCancelar">Cancelar</button><button class="btn principal" type="submit">Salvar</button></span>
      </div>
    </form>`, corpo => {
    const f = corpo.querySelector('#cpBfForm');
    const marcadas = () => [...f.querySelectorAll('.cp-bf-cargas input:checked')];
    const conta = () => {
      const kg = marcadas().reduce((s, i) => s + Number(i.dataset.kg), 0);
      $('bfSoma').textContent = `— ${marcadas().length} carga(s), ${num(kg, 0)} kg`;
      const tc = CATS.reduce((s, [k]) => s + (lerNumero($('bf_' + k).value) || 0), 0);
      $('bfSomaCat').textContent = tc ? `— soma ${num(tc, 0)} kg${kg ? ' (' + pctTxt(tc, kg) + ' do que entrou)' : ''}` : '';
    };
    f.addEventListener('input', conta); f.addEventListener('change', conta); conta();
    corpo.querySelector('#bfCancelar').onclick = () => window.fecharModal();
    corpo.querySelector('#bfExcluir')?.addEventListener('click', async () => {
      if (!confirm('Excluir este boletim? As cargas ficam sem boletim (não são apagadas).')) return;
      for (const c of cargasDoLote(saf, l.id)) await gravar('cp_cargas', { ...c, lote_venda_id: null });
      await gravar('cp_lotes_venda', { ...l, ativo: false });
      window.fecharModal(); aviso('Boletim excluído.'); desenharBenef();
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const r = { ...(l || { cultura_id: cult.id, safra_id: saf.id, ativo: true, criado_por: meuNome() || null }),
        codigo: $('bfCod').value.trim(), data: $('bfData').value || null, destino: $('bfDest').value.trim() || null, tipo: $('bfTipo').value || null, obs: $('bfObs').value.trim() || null };
      if (!r.codigo) { aviso('Informe o nº do boletim.', true); return; }
      if (/^\d+$/.test(r.codigo) && r.tipo !== 'Sujo') r.codigo = 'Boletim ' + r.codigo;
      for (const [k, rot] of CATS) { const x = lerNumero($('bf_' + k).value); if (Number.isNaN(x) || (x !== null && x < 0)) { aviso('Confira ' + rot + '.', true); return; } r[k] = x; }
      if (lotesDa(cult, saf).some(x => x.id !== r.id && semAcento(x.codigo) === semAcento(r.codigo))) { aviso('Já existe ' + r.codigo + ' nesta safra.', true); return; }
      const salvo = await gravar('cp_lotes_venda', r);
      const ids = new Set(marcadas().map(i => i.value));
      for (const c of cargasDa(saf.id)) {
        if (ids.has(c.id) && c.lote_venda_id !== salvo.id) await gravar('cp_cargas', { ...c, lote_venda_id: salvo.id });
        else if (!ids.has(c.id) && c.lote_venda_id === salvo.id) await gravar('cp_cargas', { ...c, lote_venda_id: null });
      }
      window.fecharModal(); aviso('Boletim salvo.'); desenharBenef();
    });
  });
}
export function abrirBeneficiamento() { desenharBenef(); }

/* =================================================================
   COMERCIALIZAÇÃO — NF-e com o PDF
   ================================================================= */
const donoNota = id => 'nfe-' + id;
let pdfs = new Map();                 /* id da nota → chave do PDF no Drive */
async function lerPdfs(ids) {
  if (!ids.length || !navigator.onLine || !window.App?.sb) return;
  try {
    const { data, error } = await window.App.sb.schema('public').from('arquivos').select('dono_id,chave')
      .eq('area', 'certificacao').eq('tipo', 'evidencia').in('dono_id', ids.map(donoNota));
    if (error) return;
    const m = new Map(); (data || []).forEach(x => m.set(String(x.dono_id).replace(/^nfe-/, ''), x.chave));
    const mudou = ids.some(id => m.get(id) !== pdfs.get(id));
    ids.forEach(id => pdfs.delete(id)); m.forEach((v, k) => pdfs.set(k, v));
    if (mudou) desenharCom(true);
  } catch (e) { /* sem rede: segue sem o 📄 */ }
}
async function abrirPdf(chave) {
  const j = window.open('', '_blank');
  try {
    const r = await window.chamarArquivos('ver', chave);
    if (!r.ok) throw new Error('Não consegui abrir o PDF.');
    const u = URL.createObjectURL(await r.blob());
    if (j) j.location.href = u; else location.href = u;
  } catch (e) { j?.close(); aviso(navigator.onLine ? e.message : 'Sem internet: o PDF abre quando a conexão voltar.', true); }
}

function desenharCom(soDesenho) {
  const alvo = $('cpComCorpo'); if (!alvo) return;
  if (!pronto() || carregando()) { alvo.innerHTML = '<div class="vazio">Abrindo…</div>'; return; }
  const cult = culturaSel(), saf = safraSel();
  if (!cult || !saf) { alvo.innerHTML = '<div class="vazio">Escolha a cultura e a safra.</div>'; return; }
  const N = notasDa(cult, saf);
  const kg = N.reduce((s, n) => s + Number(n.peso_kg || 0), 0), rs = N.reduce((s, n) => s + Number(n.valor || 0), 0);
  const semPdf = N.filter(n => !pdfs.has(n.id)).length;
  alvo.innerHTML = `
    <div class="barra entre" style="margin-top:0"><span class="dc-sem">${N.length} NF-e nesta safra${N.length ? ` · ${num(kg, 0)} kg · R$ ${num(rs, 2)}${semPdf ? ` · <b>${semPdf}</b> sem PDF` : ''}` : ''}</span>
      <button class="btn principal" type="button" id="cpNfNova">+ Cadastrar NF-e</button></div>
    ${N.length ? `<div class="cb-rolagem"><table class="dc-planilha cb-tab"><thead><tr><th>NF-e</th><th>Emissão</th><th>Destinatário</th><th>Boletim / carga</th><th class="dir">Peso (kg)</th><th class="dir">Valor (R$)</th><th>PDF</th><th></th></tr></thead><tbody>
      ${N.map(n => `<tr><td><b>${esc(n.numero)}</b>${n.serie ? ` <small class="dc-sem">série ${esc(n.serie)}</small>` : ''}${n.chave_acesso ? `<br><small class="dc-sem">${esc(n.chave_acesso)}</small>` : ''}</td>
        <td>${dataBR(n.data_emissao)}</td><td>${esc(n.destinatario || '')}</td><td>${n.lote_venda_id && lote(n.lote_venda_id) ? esc(lote(n.lote_venda_id).codigo) : '<span class="cb-pin alerta">sem boletim</span>'}</td>
        <td class="dir">${vazio(n.peso_kg) ? '' : num(n.peso_kg, 2)}</td><td class="dir">${vazio(n.valor) ? '' : num(n.valor, 2)}</td>
        <td>${pdfs.has(n.id) ? `<button class="ce-link" type="button" data-pdf="${esc(n.id)}">📄 Abrir</button>` : '<span class="cb-pin alerta">sem PDF</span>'}</td>
        <td class="dir"><button class="btn mini" type="button" data-nf="${esc(n.id)}">Editar</button></td></tr>`).join('')}
      </tbody><tfoot><tr class="dc-total"><td colspan="4">${N.length} nota(s)</td><td class="dir">${num(kg, 2)}</td><td class="dir">${num(rs, 2)}</td><td colspan="2"></td></tr></tfoot></table></div>`
      : '<div class="vazio">Nenhuma NF-e nesta safra. Toque em “+ Cadastrar NF-e”.</div>'}`;
  $('cpNfNova').onclick = () => formNota(null);
  alvo.querySelectorAll('[data-nf]').forEach(b => b.addEventListener('click', () => formNota(todos('cp_notas_fiscais').find(n => n.id === b.dataset.nf))));
  alvo.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => abrirPdf(pdfs.get(b.dataset.pdf))));
  if (!soDesenho) lerPdfs(N.map(n => n.id));
}

function formNota(n) {
  const cult = culturaSel(), saf = safraSel(); if (!cult || !saf) return;
  const L = lotesDa(cult, saf);
  const v = n || { numero: '', serie: '', data_emissao: hoje(), destinatario: 'Coopadap', lote_venda_id: '' };
  window.abrirModal(n ? 'NF-e ' + n.numero : 'Cadastrar NF-e', `
    <form class="grade" id="cpNfForm" autocomplete="off">
      ${campoTxt('nfNum', 'Número da NF-e *', v.numero, 'inputmode="numeric" placeholder="001031094" required')}
      ${campoTxt('nfSerie', 'Série', v.serie)}
      <label class="campo">Data de emissão<input type="date" id="nfData" value="${esc(String(v.data_emissao || '').slice(0, 10))}"></label>
      ${campoTxt('nfDest', 'Destinatário', v.destinatario, 'list="nfDests"')}
      <datalist id="nfDests">${destinos().map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      <label class="campo plena">Boletim / carga suja<select id="nfLote"><option value="">— sem boletim —</option>${L.map(l => `<option value="${esc(l.id)}"${l.id === v.lote_venda_id ? ' selected' : ''}>${esc(l.codigo)}${l.data ? ' · ' + dataBR(l.data) : ''}${l.destino ? ' · ' + esc(l.destino) : ''}</option>`).join('')}</select></label>
      ${campoNum('nfPeso', 'Peso (kg)', v.peso_kg, 2)}
      ${campoNum('nfValor', 'Valor (R$)', v.valor, 2)}
      ${campoTxt('nfChave', 'Chave de acesso (44 números)', v.chave_acesso, 'inputmode="numeric" placeholder="opcional"')}
      <fieldset class="plena cp-fs"><legend>PDF da NF-e</legend>
        <p class="dc-sem" style="margin:0 0 6px">${n && pdfs.has(n.id) ? `Já tem PDF: <button class="ce-link" type="button" id="nfVer">📄 abrir</button>. Escolher outro substitui.` : 'Nenhum PDF anexado.'} O arquivo vai para o Google Drive (precisa de internet).</p>
        <input type="file" id="nfArq" accept="application/pdf,image/*"></fieldset>
      <label class="campo plena">Observação<input type="text" id="nfObs" value="${esc(v.obs || '')}"></label>
      <div class="barra entre plena">
        ${n ? '<button class="btn perigo" type="button" id="nfExcluir">Excluir</button>' : '<span></span>'}
        <span class="barra" style="margin:0"><button class="btn" type="button" id="nfCancelar">Cancelar</button><button class="btn principal" type="submit">Salvar</button></span>
      </div>
    </form>`, corpo => {
    const f = corpo.querySelector('#cpNfForm');
    corpo.querySelector('#nfCancelar').onclick = () => window.fecharModal();
    corpo.querySelector('#nfVer')?.addEventListener('click', () => abrirPdf(pdfs.get(n.id)));
    corpo.querySelector('#nfExcluir')?.addEventListener('click', async () => {
      if (!confirm('Excluir a NF-e ' + n.numero + '?')) return;
      await gravar('cp_notas_fiscais', { ...n, ativo: false });
      window.fecharModal(); aviso('NF-e excluída.'); desenharCom();
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const chave = $('nfChave').value.replace(/\D/g, '');
      const lt = lote($('nfLote').value);
      const r = { ...(n || { cultura_id: cult.id, safra_id: saf.id, ativo: true, criado_por: meuNome() || null }),
        numero: $('nfNum').value.trim().replace(/^NF-?e?\s*/i, ''), serie: $('nfSerie').value.trim() || null, data_emissao: $('nfData').value || null,
        destinatario: $('nfDest').value.trim() || null, lote_venda_id: lt ? lt.id : null, chave_acesso: chave || null, obs: $('nfObs').value.trim() || null };
      if (!r.numero) { aviso('Informe o número da NF-e.', true); return; }
      if (chave && chave.length !== 44) { aviso('A chave de acesso tem 44 números (esta tem ' + chave.length + ').', true); return; }
      for (const [id, k, rot] of [['nfPeso', 'peso_kg', 'o peso'], ['nfValor', 'valor', 'o valor']]) {
        const x = lerNumero($(id).value); if (Number.isNaN(x) || (x !== null && x < 0)) { aviso('Confira ' + rot + '.', true); return; } r[k] = x;
      }
      const tira0 = s => String(s || '').replace(/^0+/, '');
      if (notasDa(cult, saf).some(x => x.id !== r.id && tira0(x.numero) === tira0(r.numero) && String(x.serie || '') === String(r.serie || ''))) { aviso('Esta NF-e já está cadastrada nesta safra.', true); return; }
      const arq = $('nfArq').files[0];
      if (arq && !(/pdf$/i.test(arq.type) || /\.pdf$/i.test(arq.name) || /^image\//.test(arq.type))) { aviso('Anexe um PDF (ou foto) da nota.', true); return; }
      if (arq && arq.size > 15 * 1024 * 1024) { aviso('Arquivo grande demais (máximo 15 MB).', true); return; }
      const salvo = await gravar('cp_notas_fiscais', r);
      if (arq) {
        if (!navigator.onLine) aviso('Nota salva. Sem internet: anexe o PDF quando a conexão voltar (Editar).', true);
        else {
          const ext = /\.pdf$/i.test(arq.name) || /pdf/i.test(arq.type) ? 'pdf' : (/png/.test(arq.type) ? 'png' : /webp/.test(arq.type) ? 'webp' : 'jpg');
          const base = String(arq.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'nfe';
          const ch = `certificacao/evidencia/${donoNota(salvo.id)}/${Date.now().toString(36)}-${base}.${ext}`;
          try {
            const resp = await window.chamarArquivos('enviar', ch, { method: 'POST', headers: { 'Content-Type': ext === 'pdf' ? 'application/pdf' : arq.type || 'image/jpeg' }, body: arq }, '&nome=' + encodeURIComponent(arq.name));
            if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.erro === 'sem-acesso' ? 'seu login não tem acesso à Certificação para anexar' : d.erro || 'erro ' + resp.status); }
            const antiga = pdfs.get(salvo.id);
            if (antiga && antiga !== ch) window.chamarArquivos('apagar', antiga, { method: 'POST' }).catch(() => {});
            pdfs.set(salvo.id, ch);
          } catch (er) { aviso('Nota salva, mas o PDF não subiu: ' + (er.message || er) + '. Tente de novo em Editar.', true); }
        }
      }
      window.fecharModal(); aviso('NF-e salva.'); desenharCom();
    });
  });
}
export function abrirComercializacao(o) { desenharCom(o && o.soDados); }
