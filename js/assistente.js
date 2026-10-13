// assistente.js — "Pergunte ao LOP" (13/10/2026)
//
// Botão no canto da tela que abre uma conversa com o assistente. Quem
// responde é a função pergunte-ao-lop no Supabase: ela consulta o banco com o
// login de quem perguntou (cada um só vê o que o próprio acesso permite) e
// chama o Claude com a chave guardada lá, nunca aqui no navegador.
//
// A conversa fica só na memória desta janela: fechou o app, começa de novo.
import { estado, aoMudar } from './store.js';

const SUGESTOES = [
  'Quais máquinas estão com troca de óleo vencida?',
  'Quem está devendo boletim?',
  'Quantos funcionários ativos temos por fazenda?',
  'Quais OS estão abertas há mais de 7 dias?',
];

const conversa = [];          // { papel: 'eu' | 'lop', texto }
let ocupado = false;

/* ---------------- texto da resposta (markdown simples, seguro) ---------------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enfeitar = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

function emHtml(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    // tabela: linhas com | e a segunda é a régua ---
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      const cel = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const cab = cel(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(cel(linhas[i++]));
      out.push('<div class="ia-tab"><table><thead><tr>' + cab.map(c => `<th>${enfeitar(c)}</th>`).join('') +
        '</tr></thead><tbody>' + corpo.map(r => '<tr>' + r.map(c => `<td>${enfeitar(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    // lista com "- " ou "1. "
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d+[.)]/.test(l);
      const itens = [];
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      out.push(`<${ordenada ? 'ol' : 'ul'}>` + itens.map(x => `<li>${enfeitar(x)}</li>`).join('') + `</${ordenada ? 'ol' : 'ul'}>`);
      continue;
    }
    if (l.trim()) out.push(`<p>${enfeitar(l.replace(/^#+\s*/, ''))}</p>`);
    i++;
  }
  return out.join('');
}

/* ---------------- montagem ---------------- */
function montar() {
  if (document.getElementById('iaBotao')) return;

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.id = 'iaBotao';
  botao.className = 'ia-botao';
  botao.title = 'Pergunte ao LOP';
  botao.hidden = true;
  botao.innerHTML = '<img src="icons/lop-gr-192.v1.png" alt=""><span>Pergunte ao LOP</span>';

  const painel = document.createElement('aside');
  painel.id = 'iaPainel';
  painel.className = 'ia-painel';
  painel.hidden = true;
  painel.setAttribute('aria-label', 'Pergunte ao LOP');
  painel.innerHTML = `
    <header class="ia-cab">
      <img src="icons/lop-gr-192.v1.png" alt="">
      <div class="ia-tit"><b>Pergunte ao LOP</b><small>Consulta os dados do sistema</small></div>
      <button type="button" class="ia-x" id="iaLimpar" title="Começar de novo">↺</button>
      <button type="button" class="ia-x" id="iaFechar" title="Fechar" aria-label="Fechar">×</button>
    </header>
    <div class="ia-msgs" id="iaMsgs" aria-live="polite"></div>
    <form class="ia-envio" id="iaForm" autocomplete="off">
      <textarea id="iaTexto" rows="1" maxlength="2000" placeholder="Escreva sua pergunta…"></textarea>
      <button type="submit" class="btn principal" id="iaEnviar">Enviar</button>
    </form>
    <p class="ia-rodape" id="iaRodape">O assistente só consulta — não altera nada. Confira números importantes na tela do sistema.</p>`;

  document.body.append(botao, painel);

  botao.addEventListener('click', abrir);
  painel.querySelector('#iaFechar').addEventListener('click', fechar);
  painel.querySelector('#iaLimpar').addEventListener('click', () => { if (!ocupado) { conversa.length = 0; desenhar(); } });
  painel.querySelector('#iaForm').addEventListener('submit', ev => { ev.preventDefault(); enviar(); });
  const ta = painel.querySelector('#iaTexto');
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); }
    if (ev.key === 'Escape') fechar();
  });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  painel.querySelector('#iaMsgs').addEventListener('click', ev => {
    const s = ev.target.closest('[data-sugestao]');
    if (s) { ta.value = s.dataset.sugestao; enviar(); }
  });

  desenhar();
  atualizarVisivel();
}

function atualizarVisivel() {
  const app = document.getElementById('app');
  const logado = !!estado.sessao && app && !app.hidden;
  const botao = document.getElementById('iaBotao');
  const painel = document.getElementById('iaPainel');
  if (!botao) return;
  botao.hidden = !logado || !painel.hidden;
  if (!logado) { painel.hidden = true; conversa.length = 0; desenhar(); }
}

function abrir() {
  const painel = document.getElementById('iaPainel');
  painel.hidden = false;
  document.getElementById('iaBotao').hidden = true;
  setTimeout(() => document.getElementById('iaTexto')?.focus(), 30);
}
function fechar() {
  document.getElementById('iaPainel').hidden = true;
  atualizarVisivel();
}

function desenhar(carregando = false) {
  const el = document.getElementById('iaMsgs');
  if (!el) return;
  if (!conversa.length && !carregando) {
    el.innerHTML = `<div class="ia-boas">
        <p>Olá! Pergunte em português, do jeito que você falaria com um colega.</p>
        <div class="ia-sug">${SUGESTOES.map(s => `<button type="button" data-sugestao="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>`;
    return;
  }
  el.innerHTML = conversa.map(m => m.papel === 'eu'
    ? `<div class="ia-msg eu">${esc(m.texto).replace(/\n/g, '<br>')}</div>`
    : `<div class="ia-msg lop${m.erro ? ' erro' : ''}">${m.erro ? esc(m.texto) : emHtml(m.texto)}</div>`).join('')
    + (carregando ? '<div class="ia-msg lop pensando"><span></span><span></span><span></span> consultando o sistema…</div>' : '');
  el.scrollTop = el.scrollHeight;
}

async function enviar() {
  const ta = document.getElementById('iaTexto');
  const pergunta = ta.value.trim();
  if (!pergunta || ocupado) return;
  if (!navigator.onLine) {
    conversa.push({ papel: 'eu', texto: pergunta }, { papel: 'lop', erro: true, texto: 'Sem internet agora. O assistente precisa de conexão para consultar o sistema.' });
    ta.value = ''; desenhar(); return;
  }

  const historico = conversa.filter(m => !m.erro).slice(-10).map(({ papel, texto }) => ({ papel, texto }));
  conversa.push({ papel: 'eu', texto: pergunta });
  ta.value = ''; ta.style.height = 'auto';
  ocupado = true;
  document.getElementById('iaEnviar').disabled = true;
  desenhar(true);

  try {
    const { data, error } = await estado.cliente.functions.invoke('pergunte-ao-lop', { body: { pergunta, historico } });
    let corpo = data;
    if (error && !corpo) {
      // erro com resposta do servidor: a mensagem dele explica melhor
      try { corpo = await error.context?.json?.(); } catch { corpo = null; }
    }
    if (corpo?.resposta) {
      conversa.push({ papel: 'lop', texto: corpo.resposta });
      if (corpo.limite) document.getElementById('iaRodape').textContent =
        `${corpo.usadas_hoje} de ${corpo.limite} perguntas hoje · o assistente só consulta, não altera nada.`;
    } else {
      conversa.push({ papel: 'lop', erro: true, texto: corpo?.erro || 'Não consegui falar com o assistente agora. Tente de novo em instantes.' });
    }
  } catch {
    conversa.push({ papel: 'lop', erro: true, texto: 'Não consegui falar com o assistente agora. Tente de novo em instantes.' });
  } finally {
    ocupado = false;
    document.getElementById('iaEnviar').disabled = false;
    desenhar();
    ta.focus();
  }
}

/* ---------------- início ---------------- */
function iniciar() {
  montar();
  aoMudar(atualizarVisivel);
  const app = document.getElementById('app');
  if (app) new MutationObserver(atualizarVisivel).observe(app, { attributes: true, attributeFilter: ['hidden'] });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
