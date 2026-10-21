/* =====================================================================
   LOP - Gestão Rápida · "+ Hora máquina" (21/10/2026, pedido do Guilherme)

   Só na fazenda Quebra Cocão, que não tem o relatório da Realtec: quem
   lança a jornada marca a máquina, o horímetro inicial e o final e os
   implementos usados. Ao salvar:
     · a MÁQUINA ganha uma leitura (horímetro final) — o mesmo caminho do
       "Lançar horímetro" de Manutenções; o gatilho do banco atualiza o bem;
     · cada IMPLEMENTO soma as horas trabalhadas (final − inicial) no seu
       contador acumulado — o mesmo caminho da importação Realtec
       (tabela usos_implemento; o gatilho do banco soma).
   Assim o vencimento das preventivas anda sozinho.

   Script comum (sem módulo), usado em dois lugares:
     · DP › Lançar jornada (js/jornada.js) com estado.cliente;
     · Manutenções › Preventivas (manutencoes/js/preventivas.js) com App.sb.
   Grava direto no servidor: precisa de internet.
   ===================================================================== */
(function () {
  const LOCAL_BUSCA = '%quebra%';   // fazenda onde o recurso vale
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const num = v => { if (v == null || v === '') return null; const s = String(v).trim().replace(/\s/g, '');
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : null; };
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  let cache = null;   // { local, maquinas, implementos } por cliente

  async function carregar(cliente, forcar) {
    if (cache && cache.cliente === cliente && !forcar) return cache;
    const sc = cliente.schema('manutencao');
    const { data: locais, error: e1 } = await sc.from('locais').select('id,nome').ilike('nome', LOCAL_BUSCA).limit(1);
    if (e1 || !locais || !locais.length) { cache = { cliente, local: null, maquinas: [], implementos: [] }; return cache; }
    const local = locais[0];
    const { data: bens, error: e2 } = await sc.from('equipamentos')
      .select('id,codigo,descricao,unidade_controle,leitura_atual,leitura_data,status,ativo')
      .eq('local_id', local.id);
    if (e2) throw new Error(e2.message);
    const ok = (bens || []).filter(b => b.ativo !== false && !['VENDIDO', 'BAIXADO'].includes(b.status));
    const porCod = (a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true });
    cache = {
      cliente, local,
      maquinas: ok.filter(b => b.unidade_controle === 'HORIMETRO' || b.unidade_controle === 'HODOMETRO').sort(porCod),
      implementos: ok.filter(b => b.unidade_controle === 'ACUMULADO').sort(porCod),
    };
    return cache;
  }

  /** true quando este login enxerga máquinas da Quebra Cocão em Manutenções. */
  async function disponivel(cliente) {
    if (!cliente || !navigator.onLine) return false;
    try { const c = await carregar(cliente); return !!(c.local && c.maquinas.length); } catch (e) { return false; }
  }

  function estilo() {
    if (document.getElementById('hm-estilo')) return;
    const st = document.createElement('style'); st.id = 'hm-estilo';
    st.textContent = `
.hm-fundo{position:fixed;inset:0;background:rgba(27,35,43,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px}
.hm-caixa{background:#fff;border-radius:12px;width:min(620px,100%);box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:Arial,Helvetica,sans-serif;color:#51534A}
.hm-cab{display:flex;align-items:center;gap:10px;background:#84BD00;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0}
.hm-cab b{font-size:17px;flex:1}.hm-cab small{opacity:.9}
.hm-x{background:none;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1}
.hm-corpo{padding:16px 18px 18px}
.hm-l{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:10px}
.hm-l.um{grid-template-columns:1fr}
.hm-l.hm-tres{grid-template-columns:1.2fr .8fr 1.6fr}
.hm-c label{display:block;font-size:12px;font-weight:bold;margin-bottom:4px}
.hm-c input,.hm-c select{width:100%;box-sizing:border-box;border:1px solid #D5D7CF;border-radius:8px;padding:10px 11px;font:inherit;font-size:15px;background:#fff;color:#51534A;min-height:44px}
.hm-c small{display:block;font-size:12px;color:#8A8C83;margin-top:3px}
.hm-total{background:#F1F7E3;border-radius:8px;padding:10px 12px;font-size:15px;margin:4px 0 12px}
.hm-total b{color:#0D4D31;font-size:18px}
.hm-erro{background:#FDECEA;color:#9B2C22;border-radius:8px;padding:10px 12px;font-size:14px;margin:0 0 12px}
.hm-acoes{display:flex;gap:10px;flex-wrap:wrap}
.hm-btn{border:0;border-radius:8px;padding:12px 18px;font:inherit;font-weight:bold;font-size:15px;cursor:pointer;min-height:44px}
.hm-btn.p{background:#84BD00;color:#fff}.hm-btn.n{background:#fff;border:1px solid #D5D7CF;color:#51534A}
.hm-btn:disabled{opacity:.6;cursor:default}
.hm-dia{margin-top:16px;border-top:1px solid #E3E5DE;padding-top:12px}
.hm-dia h4{margin:0 0 8px;font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:#744F28}
.hm-dia ul{list-style:none;margin:0;padding:0}
.hm-dia li{font-size:13px;padding:6px 0;border-bottom:1px dashed #E3E5DE}
.hm-dia li:last-child{border-bottom:0}
@media(max-width:560px){.hm-l,.hm-l.hm-tres{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  async function lancadosNoDia(c, data) {
    const ids = c.maquinas.map(m => m.id);
    if (!ids.length) return [];
    const { data: ls } = await c.cliente.schema('manutencao').from('leituras')
      .select('id,equipamento_id,valor,observacao,registrado_em')
      .in('equipamento_id', ids).eq('data_leitura', data).like('observacao', 'Hora máquina%')
      .is('substituida_por', null).order('registrado_em');
    return ls || [];
  }

  /**
   * Abre o painel. op = { cliente, data?, operador?, boletim?, aoSalvar? }
   */
  async function abrir(op) {
    estilo();
    const fundo = document.createElement('div');
    fundo.className = 'hm-fundo';
    fundo.innerHTML = `<div class="hm-caixa" role="dialog" aria-modal="true">
      <div class="hm-cab"><b>+ Hora máquina</b><small id="hm-local"></small><button type="button" class="hm-x" aria-label="Fechar">×</button></div>
      <div class="hm-corpo"><p>Carregando as máquinas…</p></div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.querySelector('.hm-x').onclick = fechar;
    fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
    const corpo = fundo.querySelector('.hm-corpo');

    if (!navigator.onLine) { corpo.innerHTML = '<div class="hm-erro">Sem internet. A hora máquina grava direto no servidor — lance quando a conexão voltar.</div>'; return; }
    let c;
    try { c = await carregar(op.cliente, true); } catch (e) { corpo.innerHTML = `<div class="hm-erro">Não consegui ler as máquinas: ${esc(e.message)}</div>`; return; }
    if (!c.local || !c.maquinas.length) {
      corpo.innerHTML = '<div class="hm-erro">Seu login não enxerga as máquinas da Quebra Cocão em Máquinas e Patrimônio. Peça ao administrador para liberar essa fazenda.</div>';
      return;
    }
    fundo.querySelector('#hm-local').textContent = c.local.nome;
    const optsImp = '<option value="">— nenhum —</option>' + c.implementos.map(i => `<option value="${esc(i.id)}">${esc(i.codigo)} — ${esc(i.descricao)}</option>`).join('');
    corpo.innerHTML = `
      <div class="hm-erro" id="hm-erro" hidden></div>
      <div class="hm-l hm-tres">
        <div class="hm-c"><label for="hm-data">Data</label><input type="date" id="hm-data" value="${esc(op.data || hojeISO())}"></div>
        <div class="hm-c"><label for="hm-bol">Nº boletim</label><input type="text" id="hm-bol" inputmode="numeric" autocomplete="off" value="${esc(op.boletim || '')}" maxlength="20"></div>
        <div class="hm-c"><label for="hm-oper">Operador</label><input type="text" id="hm-oper" value="${esc(op.operador || '')}" maxlength="80"></div>
      </div>
      <div class="hm-l um"><div class="hm-c"><label for="hm-maq">Máquina</label>
        <select id="hm-maq"><option value="">— escolha —</option>${c.maquinas.map(m => `<option value="${esc(m.id)}">${esc(m.codigo)} — ${esc(m.descricao)}</option>`).join('')}</select>
        <small id="hm-atual"></small></div></div>
      <div class="hm-l">
        <div class="hm-c"><label for="hm-ini" id="hm-ini-rot">Horímetro inicial</label><input type="text" id="hm-ini" inputmode="decimal" autocomplete="off"></div>
        <div class="hm-c"><label for="hm-fim" id="hm-fim-rot">Horímetro final</label><input type="text" id="hm-fim" inputmode="decimal" autocomplete="off"></div>
      </div>
      <div class="hm-total" id="hm-total">Horas trabalhadas: <b>—</b></div>
      <div class="hm-l um"><div class="hm-c"><label>Implementos usados <small style="display:inline;font-weight:normal">(cada um soma as horas trabalhadas)</small></label>
        <select id="hm-imp1">${optsImp}</select></div></div>
      <div class="hm-l">
        <div class="hm-c"><select id="hm-imp2" aria-label="Segundo implemento">${optsImp}</select></div>
        <div class="hm-c"><select id="hm-imp3" aria-label="Terceiro implemento">${optsImp}</select></div>
      </div>
      <div class="hm-acoes">
        <button type="button" class="hm-btn p" id="hm-salvar">Salvar</button>
        <button type="button" class="hm-btn n" id="hm-fechar">Fechar</button>
      </div>
      <div class="hm-dia" id="hm-dia"></div>`;
    const $ = id => corpo.querySelector('#' + id);
    const maq = () => c.maquinas.find(m => m.id === $('hm-maq').value) || null;
    const erro = t => { $('hm-erro').hidden = !t; $('hm-erro').textContent = t || ''; };
    const un = m => m && m.unidade_controle === 'HODOMETRO' ? 'km' : 'h';

    const total = () => {
      const i = num($('hm-ini').value), f = num($('hm-fim').value);
      const m = maq();
      $('hm-total').innerHTML = i != null && f != null
        ? (f >= i ? `${m && m.unidade_controle === 'HODOMETRO' ? 'Km rodados' : 'Horas trabalhadas'}: <b>${fmt(f - i)} ${un(m)}</b>` : '<b style="color:#9B2C22">O final está menor que o inicial.</b>')
        : 'Horas trabalhadas: <b>—</b>';
    };
    const mostrarDia = async () => {
      const ls = await lancadosNoDia(c, $('hm-data').value).catch(() => []);
      $('hm-dia').innerHTML = ls.length ? `<h4>Já lançado em ${esc(dataBR($('hm-data').value))}</h4><ul>${ls.map(l => {
        const m = c.maquinas.find(x => x.id === l.equipamento_id) || {};
        return `<li><b>${esc(m.codigo || '')}</b> · ${esc(String(l.observacao || '').replace(/^Hora máquina · /, ''))}</li>`; }).join('')}</ul>` : '';
    };
    $('hm-maq').onchange = () => {
      const m = maq();
      $('hm-ini-rot').textContent = m && m.unidade_controle === 'HODOMETRO' ? 'Km inicial' : 'Horímetro inicial';
      $('hm-fim-rot').textContent = m && m.unidade_controle === 'HODOMETRO' ? 'Km final' : 'Horímetro final';
      $('hm-atual').textContent = m ? (m.leitura_atual != null ? `Último lançado: ${fmt(m.leitura_atual)} ${un(m)} em ${dataBR(m.leitura_data)}` : 'Sem leitura lançada ainda') : '';
      if (m && m.leitura_atual != null && !$('hm-ini').value) $('hm-ini').value = fmt(m.leitura_atual);
      total(); $('hm-fim').focus();
    };
    ['hm-ini', 'hm-fim'].forEach(id => $(id).addEventListener('input', total));
    $('hm-data').onchange = mostrarDia;
    $('hm-fechar').onclick = fechar;
    mostrarDia();

    $('hm-salvar').onclick = async () => {
      erro('');
      const m = maq(), data = $('hm-data').value, oper = $('hm-oper').value.trim();
      const ini = num($('hm-ini').value), fim = num($('hm-fim').value);
      const boletim = $('hm-bol').value.trim();
      if (!data) return erro('Informe a data.');
      if (data > hojeISO()) return erro('A data não pode ser no futuro.');
      if (!m) return erro('Escolha a máquina.');
      if (ini == null || fim == null) return erro('Informe o ' + (un(m) === 'km' ? 'km' : 'horímetro') + ' inicial e o final.');
      if (fim < ini) return erro('O final está menor que o inicial.');
      if (fim - ini > 24 && un(m) === 'h') { if (!confirm(`Foram ${fmt(fim - ini)} h num dia só. Está certo?`)) return; }
      if (m.leitura_atual != null && fim < Number(m.leitura_atual) && (!m.leitura_data || data >= m.leitura_data))
        return erro(`O final (${fmt(fim)}) é menor que o último lançado na máquina (${fmt(m.leitura_atual)} em ${dataBR(m.leitura_data)}). Confira o mostrador.`);
      const imps = [...new Set(['hm-imp1', 'hm-imp2', 'hm-imp3'].map(id => $(id).value).filter(Boolean))];
      const b = $('hm-salvar'); b.disabled = true; b.textContent = 'Salvando…';
      const sc = c.cliente.schema('manutencao');
      const agora = new Date().toISOString();
      const nomesImp = imps.map(id => (c.implementos.find(i => i.id === id) || {}).codigo).filter(Boolean);
      const obs = ['Hora máquina', oper || null, `${fmt(ini)} → ${fmt(fim)} ${un(m)} (${fmt(fim - ini)})`,
        nomesImp.length ? 'impl. ' + nomesImp.join(', ') : null, boletim ? 'boletim ' + boletim : null].filter(Boolean).join(' · ');
      try {
        const r1 = await sc.from('leituras').insert({
          id: uuid(), uuid_dispositivo: uuid(), equipamento_id: m.id, data_leitura: data, valor: fim,
          origem: 'MANUAL', observacao: obs, troca_aparelho: false, registrado_em: agora,
        });
        if (r1.error) throw new Error(r1.error.message);
        if (imps.length && fim > ini) {
          const doc = 'HORA-MAQUINA' + (boletim ? ' ' + boletim : '');
          const r2 = await sc.from('usos_implemento').insert(imps.map(id => ({
            id: uuid(), implemento_id: id, equipamento_pai_id: m.id, data_uso: data, documento: doc,
            inicio: ini, fim, quantidade: Math.round((fim - ini) * 100) / 100, unidade: m.unidade_controle,
          })));
          if (r2.error) throw new Error('a leitura da máquina foi salva, mas os implementos não: ' + r2.error.message);
        }
        if (!m.leitura_data || data >= m.leitura_data) { m.leitura_atual = fim; m.leitura_data = data; }
        b.textContent = '✓ Salvo';
        if (typeof op.aoSalvar === 'function') { try { op.aoSalvar({ maquina: m, inicio: ini, fim, implementos: nomesImp }); } catch (e) {} }
        // pronto para o próximo: mesma data e operador, máquina em branco
        setTimeout(() => {
          b.disabled = false; b.textContent = 'Salvar';
          $('hm-maq').value = ''; $('hm-ini').value = ''; $('hm-fim').value = ''; $('hm-atual').textContent = '';
          ['hm-imp1', 'hm-imp2', 'hm-imp3'].forEach(id => { $(id).value = ''; });
          total(); mostrarDia();
        }, 700);
      } catch (e) {
        b.disabled = false; b.textContent = 'Salvar';
        const permissao = /row-level security|permission/i.test(e.message);
        erro(permissao ? 'Seu login não pode gravar nas máquinas da Quebra Cocão. Peça ao administrador para liberar essa fazenda em Máquinas e Patrimônio.'
                       : 'Não salvou: ' + e.message);
      }
    };
  }

  window.HoraMaquina = { abrir, disponivel };
})();
