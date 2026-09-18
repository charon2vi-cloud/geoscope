// Copy this file to js/config.js (or generate it with `node tools/write-config.js` from the
// SUPABASE_URL / SUPABASE_ANON_KEY / CREDIT_URL environment variables).
//
// Only the *anon* (public) key belongs in the browser: it is meant to be exposed and every
// table is protected by Row Level Security. NEVER put the service_role key here.
window.GEO_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-PUBLIC-ANON-KEY',
  creditUrl: '#',   // portfolio link behind the "SOFi!BOU" footer credit
};
