/* =====================================================================
   CONFIGURAÇÃO da área Programação Campo do LOP - Gestão Rápida (15/10/2026).
   O banco é o mesmo do app principal (São Paulo); as tabelas desta área ficam
   no esquema "programacao", que precisa estar marcado em Data API → Exposed
   schemas. O login NÃO é feito aqui: a área usa a sessão do app principal,
   que está em volta desta página (veja base.js, "sessão emprestada").
   ===================================================================== */
window.CONFIG = {
  SUPABASE_URL: 'https://ysvmfmnwbcxgsrjewwsy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3oelhDSjKjwwJ67IJDdSAg_-Hmgs3Pn',
  SCHEMA: 'programacao',

  // Base local própria (IndexedDB). Nome diferente do app avulso de propósito:
  // os dois moram em sakuma-agro.github.io e são de bancos diferentes.
  BASE_LOCAL: 'lop-gr-programacao',

  // Mudar este número força o app a baixar tudo de novo.
  VERSAO_BASE: 1
};
