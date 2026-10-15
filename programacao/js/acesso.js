/* =====================================================================
   Gestão Rápida · Programação Campo — quem entra vê o quê

   O login é o do LOP - Gestão Rápida (public.app_usuarios, módulo 'programacao').
   Entra aqui quem é administrador ou tem o módulo "programacao" marcado.
   Por cima disso, cada pessoa pode ficar presa a algumas fazendas
   (programacao.usuario_fazendas). Sem fazenda marcada, vê todas.
   ===================================================================== */

const MODULOS = [
  { id: 'programacao', nome: 'Programação', telas: [
    ['painel', 'Painel anual'],
    ['lancar', 'Lançar atividade'],
    ['atividades', 'Atividades'],
    ['reuniao', 'Reunião semanal'],
  ] },
  { id: 'diario', nome: 'Relatório Diário', telas: [
    ['diario', 'Lançar diário'],
    ['diarios', 'Histórico'],
    ['diario-config', 'Configurações'],
  ] },
  { id: 'relatorio', nome: 'Relatórios', telas: [
    ['relatorio', 'Relatório em PDF'],
  ] },
  /* Cadastro muda o app para todo mundo — só administrador. */
  { id: 'cadastros', nome: 'Cadastros', admin: true, telas: [
    ['cadastros', 'Cadastros'],
  ] },
];

const Acesso = { admin: false, carregado: false };

const soAdmin = new Set(MODULOS.filter(m => m.admin).flatMap(m => m.telas.map(([t]) => t)));
soAdmin.add('diario-config');   // a mensagem padrão vale para todos: só administrador muda
const moduloDe = tela => MODULOS.find(m => m.telas.some(([t]) => t === tela))?.id || null;

function podeTela(tela) {
  if (Acesso.admin) return true;
  if (soAdmin.has(tela)) return false;
  return !!moduloDe(tela);
}
const telasLiberadas = id => {
  const m = MODULOS.find(x => x.id === id);
  return m ? m.telas.filter(([t]) => podeTela(t)) : [];
};
const modulosLiberados = () => MODULOS.filter(m => telasLiberadas(m.id).length);

function carregarAcesso(u) {
  Acesso.admin = !!(u && u.admin);
  Acesso.carregado = true;
  return Acesso;
}

/* ---------------------------------------------------------------- menu */

let moduloAberto = null;

function montarMenu() {
  const ic = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_ATALHO[ICONE_MODULO[id]] || ''}</svg>`;
  // Todos os módulos aparecem; os sem acesso ficam em cinza e não abrem (15/10/2026).
  const libs = new Set(modulosLiberados().map(m => m.id));
  const fantasma = (id, nome) => `<button type="button" class="fantasma" disabled aria-disabled="true" title="Você não tem acesso a este módulo. Peça ao administrador.">${ic(id)}<span>${esc(nome)}</span></button>`;
  $('#menu').innerHTML = MODULOS.map(m => libs.has(m.id)
    ? `<button type="button" data-modulo="${m.id}">${ic(m.id)}<span>${esc(m.nome)}</span></button>`
    : fantasma(m.id, m.nome)).join('')
    + (Acesso.admin ? `<button type="button" data-modulo="config">${ic('config')}<span>Configurações</span></button>` : fantasma('config', 'Configurações'));
  $$('#menu button[data-modulo]').forEach(b => b.onclick = () => abrirModulo(b.dataset.modulo));
  $('#menu').hidden = false;
  mostrarInicio();
}

function mostrarInicio() {
  moduloAberto = null;
  $$('#menu button').forEach(b => b.classList.remove('ativo'));
  $('#menu2').hidden = true;
  $('#menu2').innerHTML = '';
  App.telaAtual = 'marca';
  TELAS.marca($('#tela'));
}

function desenharMenu2(id) {
  const telas = telasLiberadas(id);
  $('#menu2').hidden = telas.length < 2;
  $('#menu2').innerHTML = telas.map(([t, rot]) =>
    `<button type="button" data-tela="${t}">${esc(rot)}</button>`).join('');
  $$('#menu2 button').forEach(b => b.onclick = () => irPara(b.dataset.tela));
}

function abrirModulo(id, tela) {
  if (!id) return;
  moduloAberto = id;
  $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === id));
  if (id === 'config') {
    document.body.classList.remove('sem-rodape', 'modo-quadro');
    $('#menu2').hidden = true;
    $('#menu2').innerHTML = '';
    TELAS.config($('#tela'));
    return;
  }
  const telas = telasLiberadas(id);
  if (!telas.length) return;
  desenharMenu2(id);
  irPara(telas.some(([t]) => t === tela) ? tela : telas[0][0]);
}

function marcarMenu(tela) {
  const m = moduloDe(tela);
  if (!m) return;
  if (m !== moduloAberto) {
    moduloAberto = m;
    $$('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === m));
    desenharMenu2(m);
  }
  $$('#menu2 button').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
}

/* ---------------------------------------------------------------- tela de marca */

/* Ícones dos atalhos (traço simples, cor do texto) */
const ICONE_MODULO = { programacao: 'painel', diario: 'diario', relatorio: 'relatorio', cadastros: 'cadastros', config: 'config' };
const ICONE_ATALHO = {
  cadastros: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  lancar: '<path d="M12 5v14M5 12h14"/>',
  diario: '<path d="M7 3h8l4 4v14H7z"/><path d="M10 11h6M10 15h6"/>',
  painel: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  reuniao: '<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M15 20c0-2 1.5-3.5 4-3.5"/>',
  relatorio: '<path d="M5 20V10M11 20V4M17 20v-7"/>',
  atraso: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};

TELAS.marca = el => {
  document.body.classList.add('sem-rodape');
  const s = chaveSemana(hoje());
  const ativs = atividadesVisiveis();
  const daSemana = ativs.filter(a => mesmaSemana(a.data, s) && a.status !== 'Cancelado');
  const atrasadas = ativs.filter(a => statusDe(a) === 'Atrasado');
  // acesso rápido na lateral (modelo B): ícone grande, nome embaixo, número no canto
  const atalhos = [
    { tela: 'lancar', icone: 'lancar', nome: 'Lançar atividade', classe: 'prim' },
    { tela: 'diario', icone: 'diario', nome: 'Relatório diário' },
    { tela: 'painel', icone: 'painel', nome: 'Painel anual' },
    { tela: 'reuniao', icone: 'reuniao', nome: 'Reunião semanal', num: daSemana.length, dica: 'nesta semana' },
    { tela: 'relatorio', icone: 'relatorio', nome: 'Relatórios em PDF' },
    { tela: 'atividades', icone: 'atraso', nome: 'Atrasadas', num: atrasadas.length, alerta: true, filtro: 'Atrasado' },
  ].filter(a => podeTela(a.tela));
  el.innerHTML = `
    <div class="ini-lateral">
      <nav class="ql" aria-label="Acesso rápido">
        ${atalhos.map(a => `<button type="button" class="ql-item ${a.classe || ''}" data-ir="${a.tela}"${a.filtro ? ` data-filtro="${a.filtro}"` : ''}
            title="${esc(a.nome)}${a.num !== undefined ? ` · ${a.num}${a.dica ? ' ' + a.dica : ''}` : ''}">
          ${a.num !== undefined ? `<small class="ql-num${a.alerta && a.num ? ' alerta' : ''}">${a.num}</small>` : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONE_ATALHO[a.icone]}</svg>
          <span>${esc(a.nome)}</span></button>`).join('')}
      </nav>
      <section class="marca-inicio">
        <img class="mi-sakuma" src="../img/sakuma-marca-vertical.png" alt="SAKUMA Agronegócios">
        <h2>Gestão Rápida <span>Programação Campo</span></h2>
        <p class="mi-dica">Hoje é ${esc(diaSemana(hoje()))}, ${br(hoje())} — <strong>${esc(rotuloSemana(s))}</strong>.</p>
        <div class="lop-ass mi-lop" role="img" aria-label="Desenvolvido por LOP — Inteligência para o agronegócio">
          <img src="../img/lop-marca.png" alt=""><span class="lop-div"></span>
          <span class="lop-txt"><b>DESENVOLVIDO POR LOP</b><span>INTELIGÊNCIA PARA O AGRONEGÓCIO</span></span>
        </div>
      </section>
    </div>`;
  el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
    if (b.dataset.filtro) window.filtroInicialAtividades = { status: b.dataset.filtro };
    irPara(b.dataset.ir);
  });
};

/* ---------------------------------------------------------------- configurações

   Quem ENTRA na Programação Campo é marcado no LOP, no cartão Usuários -
   Acessos (módulo 'programacao'). Aqui o administrador só escolhe as fazendas
   que cada pessoa enxerga. Sem nenhuma fazenda marcada, a pessoa vê todas. */

let gente = [];

TELAS.config = async el => {
  if (!Acesso.admin) {
    el.innerHTML = '<h1>Configurações</h1><p class="sub">Só administrador mexe nesta lista.</p>';
    return;
  }
  if (!App.online) {
    el.innerHTML = '<h1>Configurações</h1><p class="sub">Mexer em acesso precisa de internet.</p>';
    return;
  }
  el.innerHTML = '<section class="carregando"><p>Buscando a lista de gente…</p></section>';
  const { data, error } = await App.sb.schema('public').from('app_usuarios')
    .select('email, nome, usuario, admin, modulos').order('nome');
  if (error) {
    el.innerHTML = `<h1>Configurações</h1><p class="sub">Não consegui ler a lista: ${esc(error.message)}</p>`;
    return;
  }
  gente = (data || []).filter(u => u.admin || (u.modulos || []).includes('programacao'));
  const r = await App.sb.from('usuario_fazendas').select('*');
  if (!r.error) { App.dados.usuario_fazendas = r.data; await gravarLocal('usuario_fazendas', r.data); }
  desenharConfig(el);
};

function desenharConfig(el) {
  const eu = (App.usuario || {}).email;
  const faz = fazendasOrdenadas();
  const uf = q.todos('usuario_fazendas');
  const tem = (email, fz) => uf.some(x => (x.email || '').toLowerCase() === email && x.fazenda_id === fz);
  el.innerHTML = `
    <h1>Configurações</h1>
    <p class="sub">Fazendas que cada pessoa enxerga na Programação Campo. Sem nenhuma marcada, a pessoa vê todas.
      Quem entra na área é liberado no LOP, em <strong>Usuários - Acessos</strong>.</p>
    <div class="rolagem">
    <table class="tabela"><thead><tr>
      <th>Pessoa</th>
      ${faz.map(f => `<th class="ce">${esc(f.nome)}</th>`).join('')}
    </tr></thead><tbody>
    ${gente.map(u => {
      const email = (u.email || '').toLowerCase();
      return `<tr>
        <td><b>${esc(u.nome || u.usuario || email)}</b>${email === eu ? ' <span class="etq ok">você</span>' : ''}
          ${u.admin ? ' <span class="etq neutro">administrador</span>' : ''}
          <br><small>${esc(u.usuario || email)}</small></td>
        ${faz.map(f => `<td class="ce"><input type="checkbox" class="cf-faz" data-email="${esc(email)}" data-faz="${f.id}"
          ${tem(email, f.id) ? 'checked' : ''}
          ${u.admin ? 'disabled title="Administrador vê todas as fazendas"' : ''}></td>`).join('')}
      </tr>`;
    }).join('') || `<tr><td colspan="${faz.length + 1}">Ninguém além dos administradores tem a área liberada.</td></tr>`}
    </tbody></table></div>`;

  $$('.cf-faz').forEach(cx => cx.onchange = async () => {
    const reg = { email: cx.dataset.email, fazenda_id: cx.dataset.faz };
    const r = cx.checked
      ? await App.sb.from('usuario_fazendas').insert(reg)
      : await App.sb.from('usuario_fazendas').delete().match(reg);
    if (r.error) { cx.checked = !cx.checked; return aviso('Não salvou: ' + r.error.message, true); }
    const lista = q.todos('usuario_fazendas').filter(x => !(x.email === reg.email && x.fazenda_id === reg.fazenda_id));
    if (cx.checked) lista.push(reg);
    App.dados.usuario_fazendas = lista;
    await gravarLocal('usuario_fazendas', lista);
    aviso('Fazendas atualizadas.');
  });
}

Object.assign(window, {
  MODULOS, Acesso, podeTela, carregarAcesso, montarMenu, mostrarInicio, abrirModulo, marcarMenu
});
