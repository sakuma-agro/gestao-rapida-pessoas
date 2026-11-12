/* =====================================================================
   CONFIGURAÇÃO da área Outorga e Irrigação do LOP - Gestão Rápida (12/11/2026).
   O banco é o mesmo do app principal. As tabelas desta área ficam no
   esquema public com o prefixo out_ (script em supabase/outorga.sql) — as
   mesmas do antigo app avulso "Controle de Outorga e Irrigação".
   O login NÃO é feito aqui: a área usa a sessão do app principal.
   ===================================================================== */
window.CONFIG = {
  SUPABASE_URL: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn',
  SCHEMA: 'public',
  // Base local própria (IndexedDB), separada das outras áreas.
  BASE_LOCAL: 'lop-gr-outorga',
  // Mudar este número força o app a baixar tudo de novo.
  VERSAO_BASE: 1
};
