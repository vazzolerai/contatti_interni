// Credenziali e sessione nel Gestore credenziali di Windows (tramite la parte Rust).
// Solo durante lo sviluppo nel browser (npm run dev) si usa sessionStorage.
import { invoke } from '@tauri-apps/api/core';
import { inTauri, sviluppo } from './config';
import { log } from './log';

type Voce = 'accesso' | 'sessione';

export interface Accesso {
  codice: string;
  password: string;
}

export async function leggi(voce: Voce): Promise<string | null> {
  try {
    if (!inTauri || sviluppo.anteprima) return sessionStorage.getItem(`sviluppo-${voce}`);
    return await invoke<string | null>('credenziali_leggi', { chiave: voce });
  } catch (e) {
    log.errore(`Credenziali: lettura "${voce}" non riuscita`, e);
    return null;
  }
}

export async function salva(voce: Voce, valore: string): Promise<void> {
  try {
    if (!inTauri || sviluppo.anteprima) return sessionStorage.setItem(`sviluppo-${voce}`, valore);
    await invoke('credenziali_salva', { chiave: voce, valore });
  } catch (e) {
    log.errore(`Credenziali: salvataggio "${voce}" non riuscito`, e);
  }
}

export async function cancella(voce: Voce): Promise<void> {
  try {
    if (!inTauri || sviluppo.anteprima) return sessionStorage.removeItem(`sviluppo-${voce}`);
    await invoke('credenziali_cancella', { chiave: voce });
  } catch (e) {
    log.errore(`Credenziali: cancellazione "${voce}" non riuscita`, e);
  }
}

export async function leggiAccesso(): Promise<Accesso | null> {
  const grezzo = await leggi('accesso');
  if (!grezzo) return null;
  try {
    const a = JSON.parse(grezzo) as Accesso;
    return a.codice && a.password ? a : null;
  } catch {
    return null;
  }
}

export function salvaAccesso(a: Accesso): Promise<void> {
  return salva('accesso', JSON.stringify(a));
}
