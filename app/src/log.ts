// Log su file locale (%LOCALAPPDATA%\it.contattiinterni.app\logs).
// Gli errori tecnici finiscono QUI, mai sullo schermo dell'utente.
// Non scriviamo nel log né testi dei messaggi né password o token.
import { info, warn, error } from '@tauri-apps/plugin-log';
import { inTauri } from './config';

function testo(dettaglio: unknown): string {
  if (dettaglio === undefined) return '';
  if (dettaglio instanceof Error) return ` | ${dettaglio.name}: ${dettaglio.message}`;
  try {
    return ` | ${JSON.stringify(dettaglio)}`;
  } catch {
    return ` | ${String(dettaglio)}`;
  }
}

export const log = {
  info(messaggio: string, dettaglio?: unknown) {
    const riga = messaggio + testo(dettaglio);
    if (inTauri) info(riga).catch(() => {});
    else console.info(riga);
  },
  avviso(messaggio: string, dettaglio?: unknown) {
    const riga = messaggio + testo(dettaglio);
    if (inTauri) warn(riga).catch(() => {});
    else console.warn(riga);
  },
  errore(messaggio: string, dettaglio?: unknown) {
    const riga = messaggio + testo(dettaglio);
    if (inTauri) error(riga).catch(() => {});
    else console.error(riga);
  },
};

// Qualsiasi errore non gestito va nel log, senza disturbare l'utente.
window.addEventListener('error', (e) => log.errore('Errore non gestito', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => log.errore('Promessa rifiutata non gestita', e.reason));
