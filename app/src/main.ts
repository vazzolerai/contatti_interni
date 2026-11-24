// Avvio dell'app: ripristina l'accesso e mostra la vista giusta in base al ruolo.
import './log';
import { Archivio } from './archivio';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { avviaAggiornamenti, impostaControlloCoda } from './aggiornamenti';
import { aggiornaBadge, notifica } from './avvisi';
import { configurazioneValida, inTauri } from './config';
import { log } from './log';
import { esci, ripristinaSessione, supabase, type Esito } from './supabase';
import type { Sede } from './tipi';
import { conferma } from './ui';
import { MESSAGGI_ESITO, vistaAccesso, vistaAttesa } from './vista-accesso';
import { vistaCasaMadre } from './vista-casa-madre';
import { vistaPuntoVendita, type Vista } from './vista-punto-vendita';

const radice = document.getElementById('app')!;
let archivio: Archivio | null = null;
let vista: Vista | null = null;
let timerNuovoTentativo: number | undefined;
let uscitaVolontaria = false;
let ripristinoInCorso = false;

function fermaVista(): void {
  vista?.distruggi();
  archivio?.chiudi();
  vista = null;
  archivio = null;
  void aggiornaBadge(0);
}

async function mostraSede(sede: Sede): Promise<void> {
  window.clearTimeout(timerNuovoTentativo);
  fermaVista();
  document.title = sede.ruolo === 'casa_madre' ? 'Contatti Interni – Casa madre' : `Contatti Interni – ${sede.nome}`;
  archivio = new Archivio(sede);
  vista = sede.ruolo === 'casa_madre' ? vistaCasaMadre(radice, archivio) : vistaPuntoVendita(radice, archivio);
  await archivio.avvia();
}

/** Decide cosa mostrare in base all'esito del ripristino o dell'accesso. */
function gestisciEsito(esito: Esito, accessoScaduto = false): void {
  if (esito.ok) {
    void mostraSede(esito.sede);
    return;
  }
  fermaVista();
  switch (esito.motivo) {
    case 'nessun_accesso':
      vistaAccesso(radice, null, (sede) => void mostraSede(sede));
      break;
    case 'credenziali':
      vistaAccesso(radice, accessoScaduto
        ? 'L\'accesso non è più valido (forse la password è stata cambiata). Inserisci di nuovo codice e password.'
        : MESSAGGI_ESITO.credenziali, (sede) => void mostraSede(sede));
      break;
    case 'non_attivo':
      vistaAccesso(radice, MESSAGGI_ESITO.non_attivo, (sede) => void mostraSede(sede));
      break;
    case 'rete':
      vistaAttesa(radice, 'In attesa della connessione a Internet…', 'L\'app si collegherà da sola appena la linea torna disponibile.');
      programmaNuovoTentativo(10_000);
      break;
    default:
      vistaAttesa(radice, 'Collegamento in corso…', 'Nuovo tentativo tra poco.');
      programmaNuovoTentativo(30_000);
  }
}

function programmaNuovoTentativo(ms: number): void {
  window.clearTimeout(timerNuovoTentativo);
  timerNuovoTentativo = window.setTimeout(() => void ripristina(), ms);
}

async function ripristina(accessoScaduto = false): Promise<void> {
  if (ripristinoInCorso) return;
  ripristinoInCorso = true;
  try {
    gestisciEsito(await ripristinaSessione(), accessoScaduto);
  } finally {
    ripristinoInCorso = false;
  }
}

// La sessione è decaduta (es. password reimpostata dall'amministratore):
// si prova a rientrare da soli; se non si riesce, si chiede il login.
supabase.auth.onAuthStateChange((evento) => {
  if (evento !== 'SIGNED_OUT' || uscitaVolontaria || !archivio) return;
  log.avviso('Sessione terminata dal server: provo a rientrare');
  setTimeout(() => void ripristina(true), 0);
});

window.addEventListener('online', () => {
  if (!archivio) programmaNuovoTentativo(500);
});

// "Esci" dal menu dell'icona vicino all'orologio: si chiede conferma,
// perché uscendo non arrivano più i messaggi.
if (inTauri) {
  void listen('richiesta-uscita', async () => {
    const ok = await conferma(
      'Se esci, Contatti Interni non riceverà più i messaggi fino al prossimo avvio del computer. Vuoi uscire lo stesso?',
      'Esci', 'Resta attivo');
    if (ok) await invoke('esci_app');
  });

  // La prima volta che si chiude la finestra, si spiega dove è finita l'app.
  void listen('finestra-nascosta', () => {
    try {
      if (localStorage.getItem('ci-spiegata-tray')) return;
      localStorage.setItem('ci-spiegata-tray', '1');
    } catch { /* ignora */ }
    void notifica('Contatti Interni resta attivo',
      'I messaggi continueranno ad arrivare. Per riaprire la finestra, fai clic sull\'icona vicino all\'orologio.');
  });
}

// Scorciatoia nascosta per il consulente: Ctrl+Maiusc+L scollega questo PC.
window.addEventListener('keydown', async (e) => {
  if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') || !archivio) return;
  e.preventDefault();
  if (!(await conferma('Scollegare questo PC dall\'account? Servirà inserire di nuovo codice e password.', 'Scollega'))) return;
  uscitaVolontaria = true;
  fermaVista();
  await esci();
  uscitaVolontaria = false;
  vistaAccesso(radice, null, (sede) => void mostraSede(sede));
});

// ----------------------------------------------------------------- avvio
// Solo in sviluppo: ?anteprima=pv oppure ?anteprima=sede mostra dati finti.
if (import.meta.env.DEV) {
  const modo = new URLSearchParams(location.search).get('anteprima') ?? import.meta.env.VITE_ANTEPRIMA;
  if (modo === 'pv' || modo === 'sede') (await import('./anteprima')).installaAnteprima(modo);
}

if (!configurazioneValida) {
  log.errore('App non configurata: mancano VITE_SUPABASE_URL o VITE_SUPABASE_CHIAVE_PUBBLICA');
  vistaAttesa(radice, 'App non configurata.', 'Contatta chi ha installato l\'app.');
} else {
  log.info('Avvio di Contatti Interni');
  impostaControlloCoda(() => archivio?.messaggiInCoda ?? 0);
  avviaAggiornamenti();
  vistaAttesa(radice, 'Avvio in corso…');
  void ripristina();
}
