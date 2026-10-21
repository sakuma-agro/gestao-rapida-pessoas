/* =====================================================================
   CONFIGURAÇÃO da área Estoque do LOP - Gestão Rápida (15/10/2026).
   O banco é o mesmo do app principal. As tabelas desta área ficam no
   esquema public com o prefixo est_ (est_locais, est_itens, est_contagens,
   est_contagem_itens — script em supabase/estoque.sql). O login NÃO é feito
   aqui: a área usa a sessão do app principal, que está em volta da página.
   ===================================================================== */
window.CONFIG = {
  SUPABASE_URL: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn',
  SCHEMA: 'public',

  // Base local própria (IndexedDB), separada das outras áreas.
  BASE_LOCAL: 'lop-gr-estoque',

  // Mudar este número força o app a baixar tudo de novo.
  VERSAO_BASE: 2
};
