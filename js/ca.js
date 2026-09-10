// ca.js — liga o número do C.A do catálogo ao site ConsultaCA.
//
// O navegador não deixa o app ler outro site direto (bloqueio de origem).
// Então quem lê o consultaca.com é a função "consulta-ca", lá no Supabase.
// O app manda os números, recebe situação e validade prontos e guarda no
// banco, em epis.ca_situacao / ca_validade / ca_conferido_em.

const DIAS_AVISO = 30;       // a partir de quantos dias antes já avisa
const DIAS_RECONFERIR = 7;   // de quanto em quanto tempo confere sozinho
const POR_CHAMADA = 20;      // quantos C.As por chamada da função

/** O primeiro número que aparecer no campo C.A ("28481/28482" -> "28481"). */
export const numeroCa = ca => (String(ca || '').match(/\d{3,}/) || [''])[0];

/** Endereço da página desse C.A no ConsultaCA. */
export const linkCa = ca => (numeroCa(ca) ? `https://consultaca.com/${numeroCa(ca)}` : null);

const hoje = () => new Date().toISOString().slice(0, 10);

export const dataBr = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const diasAte = iso =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoje()}T00:00:00Z`)) / 86400000);

/**
 * Como está o C.A desse EPI, do jeito que vai aparecer na tela.
 * cor: ativo (verde) · alerta (amarelo) · perigo (vermelho) · neutra (cinza)
 */
export function estadoCa(e) {
  if (!numeroCa(e?.ca)) return { chave: 'semca', rotulo: '', cor: '' };
  if (!e.ca_conferido_em) return { chave: 'aconferir', rotulo: 'a conferir', cor: 'neutra' };

  const sit = String(e.ca_situacao || '').toUpperCase();
  if (sit === 'NÃO ENCONTRADO') {
    return { chave: 'naoachou', rotulo: 'não achado no site', cor: 'neutra' };
  }
  if (sit && sit !== 'VÁLIDO' && sit !== 'VALIDO') {
    const quando = e.ca_validade ? ` em ${dataBr(e.ca_validade)}` : '';
    return { chave: 'irregular', rotulo: sit.toLowerCase() + quando, cor: 'perigo' };
  }
  if (!e.ca_validade) return { chave: 'semvalidade', rotulo: 'sem validade', cor: 'neutra' };

  const dias = diasAte(e.ca_validade);
  if (dias < 0) return { chave: 'vencido', rotulo: `vencido em ${dataBr(e.ca_validade)}`, cor: 'perigo', dias };
  if (dias <= DIAS_AVISO) {
    return { chave: 'vencendo', rotulo: `vence em ${dias} dia${dias === 1 ? '' : 's'}`, cor: 'alerta', dias };
  }
  return { chave: 'emdia', rotulo: `válido até ${dataBr(e.ca_validade)}`, cor: 'ativo', dias };
}

/** true quando o C.A está vencido ou irregular — o que merece aviso na ficha. */
export const caReprovado = e => ['vencido', 'irregular'].includes(estadoCa(e).chave);

/** Já passou do prazo de reconferir esse EPI no site? */
function vencidoDeConferencia(e) {
  if (!numeroCa(e?.ca)) return false;
  if (!e.ca_conferido_em) return true;
  const dias = (Date.now() - Date.parse(e.ca_conferido_em)) / 86400000;
  return !(dias < DIAS_RECONFERIR);
}

const pedacos = (lista, n) => {
  const saida = [];
  for (let i = 0; i < lista.length; i += n) saida.push(lista.slice(i, i + n));
  return saida;
};

/**
 * Confere os C.As no ConsultaCA e guarda o resultado.
 *
 * @param {object} cliente   cliente do Supabase (estado.cliente)
 * @param {Array}  epis      catálogo inteiro
 * @param {object} opcoes    { forcar: true } confere todos, mesmo os recentes
 * @param {Function} salvar  db.salvarEpi
 * @returns {Promise<{conferidos:number, mudaram:number, erro:string|null}>}
 */
export async function conferirCas(cliente, epis, opcoes, salvar) {
  const forcar = !!opcoes?.forcar;
  const alvos = epis.filter(e => numeroCa(e.ca) && (forcar || vencidoDeConferencia(e)));
  if (!alvos.length) return { conferidos: 0, mudaram: 0, erro: null };
  if (!cliente || !navigator.onLine) return { conferidos: 0, mudaram: 0, erro: 'sem internet' };

  const cas = [...new Set(alvos.map(e => e.ca.trim()))];
  const achados = new Map();
  let erro = null;

  for (const grupo of pedacos(cas, POR_CHAMADA)) {
    try {
      const { data, error } = await cliente.functions.invoke('consulta-ca', { body: { cas: grupo } });
      if (error) { erro = error.message || 'não deu para consultar o site'; continue; }
      (data?.resultados || []).forEach(r => achados.set(String(r.ca), r));
    } catch (e) {
      erro = e?.message || 'não deu para consultar o site';
    }
  }

  const agora = new Date().toISOString();
  let mudaram = 0;

  for (const e of alvos) {
    const r = achados.get(e.ca.trim());
    if (!r) continue;
    const novo = r.achado
      ? {
        ca_situacao: r.situacao || null,
        ca_validade: r.validade || null,
        ca_equipamento: r.equipamento || null,
        ca_fabricante: r.fabricante || null,
        ca_conferido_em: agora,
      }
      : {
        ca_situacao: 'NÃO ENCONTRADO',
        ca_validade: null,
        ca_equipamento: e.ca_equipamento || null,
        ca_fabricante: e.ca_fabricante || null,
        ca_conferido_em: agora,
      };

    const antes = [e.ca_situacao, e.ca_validade].join('|');
    const depois = [novo.ca_situacao, novo.ca_validade].join('|');
    if (antes !== depois) mudaram++;
    await salvar({ ...e, ...novo });
  }

  return { conferidos: achados.size, mudaram, erro };
}
