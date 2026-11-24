// Impostazioni lette al momento della build (file app/.env o segreti GitHub).
// Qui c'è solo la chiave PUBBLICA di Supabase: è pensata per stare nelle app.

export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  chiavePubblica: (import.meta.env.VITE_SUPABASE_CHIAVE_PUBBLICA ?? '').trim(),
  dominioEmail: (import.meta.env.VITE_DOMINIO_EMAIL ?? 'contatti-interni.local').trim(),
};

export const configurazioneValida =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) && config.chiavePubblica.length > 20;

/** Giorni di storico mostrati (il server cancella i messaggi più vecchi). */
export const GIORNI_STORICO = 7;
export const MAX_CARATTERI = 2000;
export const MAX_NOME = 60;

/** true se l'app gira dentro Tauri (e non in un browser durante lo sviluppo). */
export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
