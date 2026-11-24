// Tutto ciò che serve ad attirare l'attenzione: notifiche di Windows,
// suono, badge, finestra in primo piano.
// Ogni funzione è "silenziosa" in caso di errore: si scrive nel log e basta.
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { inTauri } from './config';
import { log } from './log';

let permessoNotifiche: boolean | null = null;

async function possoNotificare(): Promise<boolean> {
  if (!inTauri) return false;
  if (permessoNotifiche !== null) return permessoNotifiche;
  try {
    permessoNotifiche = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
  } catch (e) {
    log.errore('Permesso notifiche non verificabile', e);
    permessoNotifiche = false;
  }
  return permessoNotifiche;
}

/** Notifica di Windows (con il suono di sistema). */
export async function notifica(titolo: string, corpo: string): Promise<void> {
  try {
    if (!(await possoNotificare())) return;
    const breve = corpo.length > 160 ? `${corpo.slice(0, 157)}…` : corpo;
    sendNotification({ title: titolo, body: breve });
  } catch (e) {
    log.errore('Notifica non inviata', e);
  }
}

/** Finestra davanti a tutto + icona che lampeggia (punto vendita). */
export async function portaInPrimoPiano(): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke('porta_in_primo_piano');
  } catch (e) {
    log.errore('Primo piano non riuscito', e);
  }
}

/** Solo lampeggio dell'icona sulla barra (Casa madre). */
export async function richiamaAttenzione(): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke('richiama_attenzione');
  } catch (e) {
    log.errore('Lampeggio non riuscito', e);
  }
}

let ultimoBadge = -1;
/** Numero sul badge (barra delle applicazioni e area di notifica). */
export async function aggiornaBadge(conteggio: number): Promise<void> {
  document.title = conteggio > 0 ? `(${conteggio}) ${document.title.replace(/^\(\d+\)\s*/, '')}` : document.title.replace(/^\(\d+\)\s*/, '');
  if (!inTauri || conteggio === ultimoBadge) return;
  ultimoBadge = conteggio;
  try {
    await invoke('aggiorna_badge', { conteggio });
  } catch (e) {
    log.errore('Badge non aggiornato', e);
  }
}

// --------------------------------------------------------------- suono
// Generato al volo (niente file audio): due note, "din-don".
let contesto: AudioContext | null = null;

export function suono(): void {
  try {
    contesto ??= new AudioContext();
    if (contesto.state === 'suspended') void contesto.resume();
    const ora = contesto.currentTime;
    const note: Array<[number, number]> = [[880, 0], [660, 0.28]];
    for (const [frequenza, inizio] of note) {
      const osc = contesto.createOscillator();
      const volume = contesto.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequenza;
      volume.gain.setValueAtTime(0.0001, ora + inizio);
      volume.gain.exponentialRampToValueAtTime(0.5, ora + inizio + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, ora + inizio + 0.5);
      osc.connect(volume).connect(contesto.destination);
      osc.start(ora + inizio);
      osc.stop(ora + inizio + 0.55);
    }
  } catch (e) {
    log.errore('Suono non riprodotto', e);
  }
}

/**
 * Raggruppa gli avvisi che arrivano a raffica (es. al ritorno della linea
 * arrivano 5 messaggi insieme): una sola notifica invece di cinque.
 */
export function raggruppa<T>(attesaMs: number, esegui: (elementi: T[]) => void): (elemento: T) => void {
  let coda: T[] = [];
  let timer: number | undefined;
  return (elemento: T) => {
    coda.push(elemento);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const elementi = coda;
      coda = [];
      esegui(elementi);
    }, attesaMs);
  };
}

export const finestraDavanti = () => document.visibilityState === 'visible' && document.hasFocus();
