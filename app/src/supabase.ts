// Collegamento a Supabase: client, accesso, rinnovo della sessione.
//
// La sessione NON viene salvata in chiaro su disco: supabase-js la tiene in
// memoria e noi salviamo nel Gestore credenziali di Windows solo il token di
// rinnovo ("sessione"). Codice sede e password ("accesso") servono a rientrare
// da soli se il token non è più valido (es. PC spento a lungo).
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { cancella, leggi, leggiAccesso, salva, salvaAccesso } from './credenziali';
import { log } from './log';
import type { Sede } from './tipi';

const memoria = new Map<string, string>();
let ultimoTokenSalvato: string | null = null;

const archivioSessione = {
  getItem: (chiave: string) => memoria.get(chiave) ?? null,
  setItem: (chiave: string, valore: string) => {
    memoria.set(chiave, valore);
    try {
      const token = JSON.parse(valore)?.refresh_token;
      if (typeof token === 'string' && token && token !== ultimoTokenSalvato) {
        ultimoTokenSalvato = token;
        void salva('sessione', token);
      }
    } catch {
      /* non è una sessione: ignora */
    }
  },
  removeItem: (chiave: string) => {
    memoria.delete(chiave);
  },
};

export const supabase = createClient(
  config.supabaseUrl || 'https://non-configurato.supabase.co',
  config.chiavePubblica || 'non-configurato',
  {
    auth: {
      storage: archivioSessione,
      storageKey: 'ci-sessione',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      // Il battito di Realtime gira in un worker: resta attivo anche quando
      // la finestra è nascosta o ridotta a icona.
      worker: true,
      heartbeatIntervalMs: 20_000,
    },
  },
);

/** true se l'errore dipende dalla rete (e quindi conviene riprovare). */
export function erroreDiRete(e: unknown): boolean {
  if (!navigator.onLine) return true;
  const x = (e ?? {}) as { name?: string; status?: number; message?: string };
  if (x.name === 'AuthRetryableFetchError') return true;
  if (x.status === 0 || (x.status ?? 0) >= 500) return true;
  return /fetch|network|load failed|timeout|connection/i.test(x.message ?? '');
}

export type Esito =
  | { ok: true; sede: Sede }
  | { ok: false; motivo: 'credenziali' | 'rete' | 'non_attivo' | 'nessun_accesso' | 'altro' };

/** "Chi sono?": la sede collegata all'account connesso. */
export async function caricaMiaSede(): Promise<Esito> {
  const { data, error } = await supabase.rpc('mia_sede');
  if (error) {
    if (erroreDiRete(error)) return { ok: false, motivo: 'rete' };
    log.errore('mia_sede non riuscita', { code: error.code, message: error.message });
    return { ok: false, motivo: 'altro' };
  }
  const riga = (data as Sede[] | null)?.[0];
  if (!riga) {
    log.avviso('Account senza sede attiva');
    return { ok: false, motivo: 'non_attivo' };
  }
  return { ok: true, sede: { ...riga, id: Number(riga.id) } };
}

/** Accesso con codice sede e password. */
export async function accedi(codice: string, password: string): Promise<Esito> {
  const codicePulito = codice.trim().toLowerCase();
  const email = `${codicePulito}@${config.dominioEmail}`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (erroreDiRete(error)) return { ok: false, motivo: 'rete' };
    if (error.code === 'user_banned') return { ok: false, motivo: 'non_attivo' };
    if (error.code === 'invalid_credentials' || error.status === 400) {
      log.avviso('Accesso rifiutato: credenziali non valide', { codice: codicePulito });
      return { ok: false, motivo: 'credenziali' };
    }
    log.errore('Accesso non riuscito', { code: error.code, status: error.status, message: error.message });
    return { ok: false, motivo: 'altro' };
  }
  const esito = await caricaMiaSede();
  if (esito.ok) {
    await salvaAccesso({ codice: codicePulito, password });
    log.info('Accesso effettuato', { codice: codicePulito, ruolo: esito.sede.ruolo });
  }
  return esito;
}

/**
 * All'avvio (o se la sessione decade): prova il token salvato, poi
 * codice e password salvati. Senza nulla di valido → schermata di login.
 */
export async function ripristinaSessione(): Promise<Esito> {
  const token = await leggi('sessione');
  if (token) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
    if (!error && data.session) {
      const esito = await caricaMiaSede();
      if (esito.ok) log.info('Sessione ripristinata', { codice: esito.sede.codice });
      return esito;
    }
    if (erroreDiRete(error)) return { ok: false, motivo: 'rete' };
    log.avviso('Token di sessione non più valido: provo con le credenziali salvate', { code: error?.code });
  }

  const accesso = await leggiAccesso();
  if (accesso) return accedi(accesso.codice, accesso.password);
  return { ok: false, motivo: 'nessun_accesso' };
}

/** Scollega questo PC: cancella sessione e credenziali salvate. */
export async function esci(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    log.avviso('signOut non riuscito', e);
  }
  ultimoTokenSalvato = null;
  await cancella('sessione');
  await cancella('accesso');
  log.info('PC scollegato dall\'account');
}
