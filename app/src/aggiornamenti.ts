// Aggiornamenti automatici da GitHub Releases.
//
// - Controlla un minuto dopo l'avvio e poi ogni 6 ore.
// - Se c'è una versione nuova, la scarica in silenzio.
// - La installa solo quando il PC non è in uso da qualche minuto e non ci sono
//   messaggi in attesa di invio: l'app si chiude, si aggiorna (piccola barra di
//   avanzamento) e si riapre da sola. Bozze e coda restano salvate.
// - Ogni aggiornamento è firmato: l'app rifiuta file non firmati con la nostra chiave.
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { inTauri } from './config';
import { log } from './log';

const PRIMO_CONTROLLO_MS = 60_000;
const OGNI_MS = 6 * 60 * 60_000;
const INATTIVITA_RICHIESTA_MS = 3 * 60_000;

let pronto: Update | null = null;
let ultimaAttivita = Date.now();
let controlloInCorso = false;
let messaggiInAttesa: () => number = () => 0;

/** Indica come sapere se ci sono messaggi non ancora inviati. */
export function impostaControlloCoda(fn: () => number): void {
  messaggiInAttesa = fn;
}

async function controlla(): Promise<void> {
  if (controlloInCorso || pronto) return;
  controlloInCorso = true;
  try {
    const aggiornamento = await check();
    if (!aggiornamento) return;
    log.info('Aggiornamento disponibile: download in corso', { versione: aggiornamento.version });
    await aggiornamento.download();
    pronto = aggiornamento;
    log.info('Aggiornamento scaricato: verrà installato quando il PC non è in uso', { versione: aggiornamento.version });
  } catch (e) {
    // Senza rete o GitHub irraggiungibile: si riprova al prossimo giro.
    log.avviso('Controllo aggiornamenti non riuscito', e);
  } finally {
    controlloInCorso = false;
  }
}

async function installaSeTranquillo(): Promise<void> {
  if (!pronto) return;
  const inattivo = Date.now() - ultimaAttivita > INATTIVITA_RICHIESTA_MS;
  if (!inattivo || messaggiInAttesa() > 0) return;
  const versione = pronto.version;
  try {
    log.info('Installazione aggiornamento', { versione });
    await pronto.install(); // su Windows l'app si chiude qui e l'installatore la riapre
    await relaunch();
  } catch (e) {
    log.errore('Installazione aggiornamento non riuscita', e);
    pronto = null; // si riprova al prossimo controllo
  }
}

export function avviaAggiornamenti(): void {
  if (!inTauri || import.meta.env.DEV) return; // non durante le prove sul PC di sviluppo
  for (const evento of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) {
    window.addEventListener(evento, () => { ultimaAttivita = Date.now(); }, { passive: true });
  }
  window.setTimeout(() => void controlla(), PRIMO_CONTROLLO_MS);
  window.setInterval(() => void controlla(), OGNI_MS);
  window.setInterval(() => void installaSeTranquillo(), 60_000);
}
