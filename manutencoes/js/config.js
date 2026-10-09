/* =====================================================================
   CONFIGURAÇÃO da área Manutenções do LOP - Gestão Rápida.
   O banco é o mesmo do app principal (projeto gestao-rapida-pessoas, em
   São Paulo); as tabelas desta área ficam no esquema "manutencao", que
   precisa estar marcado em Data API → Exposed schemas.
   O login NÃO é feito aqui: a área usa a sessão do app principal, que está
   em volta desta página (veja base.js, "sessão emprestada").
   ===================================================================== */
window.CONFIG = {
  SUPABASE_URL: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn',
  SCHEMA: 'manutencao',

  // Base local própria (IndexedDB). O nome é outro do app antigo de propósito:
  // os dois moram no mesmo endereço (sakuma-agro.github.io) e não podem
  // misturar cadastros nem a fila de envio de bancos diferentes.
  BASE_LOCAL: 'lop-gr-manutencoes',

  // Versão da base local. Mudar este número força o app a baixar
  // os cadastros de novo na próxima entrada com internet.
  VERSAO_BASE: 2
};
